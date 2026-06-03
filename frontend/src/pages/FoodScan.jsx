import { useState, useRef, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { addMeal, searchFoods } from '../utils/api'

export default function FoodScan({ onBack, onMealAdded }) {
  const { haptic } = useTelegram()
  const [mode, setMode] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mealType, setMealType] = useState('snack')
  const [weight, setWeight] = useState('100')
  const [manualBarcode, setManualBarcode] = useState('')
  const videoContainerRef = useRef(null)
  const fileRef = useRef(null)
  const quaggaRef = useRef(null)
  const detectedRef = useRef(false)

  useEffect(() => () => stopQuagga(), [])

  const stopQuagga = () => {
    if (quaggaRef.current) {
      try { quaggaRef.current.stop() } catch(e) {}
      quaggaRef.current = null
    }
    detectedRef.current = false
  }

  const resetScan = () => {
    stopQuagga()
    setMode(null)
    setScanning(false)
    setResult(null)
    setError(null)
    setManualBarcode('')
    detectedRef.current = false
  }

  // ── BARCODE via Quagga ────────────────────────────────────
  const startBarcodeScanner = async () => {
    setMode('barcode')
    setScanning(true)
    setError(null)
    setResult(null)
    detectedRef.current = false

    if (!window.Quagga) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
          s.onload = res
          s.onerror = rej
          document.head.appendChild(s)
        })
      } catch(e) {
        setError('Не удалось загрузить сканер. Введи штрихкод вручную.')
        setScanning(false)
        return
      }
    }

    // Wait for DOM
    await new Promise(r => setTimeout(r, 100))
    const container = videoContainerRef.current
    if (!container) { setScanning(false); return }

    try {
      await new Promise((resolve, reject) => {
        window.Quagga.init({
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: container,
            constraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            area: {
              top: '20%', right: '10%',
              left: '10%', bottom: '20%'
            }
          },
          locator: {
            patchSize: 'medium',
            halfSample: true
          },
          numOfWorkers: 2,
          frequency: 10,
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader'
            ]
          },
          locate: true
        }, err => {
          if (err) { reject(err); return }
          resolve()
        })
      })

      quaggaRef.current = window.Quagga
      window.Quagga.start()

      window.Quagga.onDetected(async data => {
        if (detectedRef.current) return
        const code = data.codeResult.code
        if (!code || code.length < 4) return
        detectedRef.current = true
        haptic('medium')
        stopQuagga()
        setScanning(false)
        await lookupBarcode(code)
      })

      window.Quagga.onProcessed(result => {
        const drawingCtx = window.Quagga.canvas.ctx.overlay
        const drawingCanvas = window.Quagga.canvas.dom.overlay
        if (!drawingCtx || !drawingCanvas) return
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height)
        if (result?.boxes) {
          result.boxes.filter(b => b !== result.box).forEach(box => {
            window.Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'green', lineWidth: 2 })
          })
        }
        if (result?.box) {
          window.Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: '#00F', lineWidth: 2 })
        }
        if (result?.codeResult?.code) {
          window.Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { color: 'red', lineWidth: 3 })
        }
      })

    } catch(e) {
      console.error('Quagga error:', e)
      setError('Не удалось запустить камеру. Попробуй ввести штрихкод вручную.')
      setScanning(false)
    }
  }

  const lookupBarcode = async (barcode) => {
    setProcessing(true)
    setError(null)
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await r.json()
      if (data.status === 0 || !data.product) {
        setError(`Продукт ${barcode} не найден. Попробуй другой штрихкод.`)
        setProcessing(false)
        return
      }
      const p = data.product
      const n = p.nutriments || {}
      setResult({
        source: 'barcode', barcode,
        name: p.product_name_ru || p.product_name || 'Неизвестный продукт',
        brand: p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        image: p.image_front_small_url || null,
        unit_weight: 100
      })
    } catch(e) {
      setError('Ошибка сети. Проверь интернет.')
    } finally {
      setProcessing(false)
    }
  }

  // ── PHOTO ─────────────────────────────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setMode('photo')
    setProcessing(true)
    setError(null)
    setResult(null)
    haptic('light')

    const imageFile = URL.createObjectURL(file)

    try {
      const groqToken = import.meta.env.VITE_GROQ_TOKEN
      if (!groqToken) throw new Error('no_token')

      const resized = await resizeImage(file, 512)
      const dataUrl = `data:image/jpeg;base64,${resized}`

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
              { type: 'text', text: 'What food is in this image? Reply ONLY with JSON: {"name":"название на русском","calories":kcal_per_100g,"protein":g,"fat":g,"carbs":g}' }
            ]
          }],
          max_tokens: 100,
          temperature: 0
        })
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content?.trim() || ''
      const jsonMatch = text.match(/\{[^{}]+\}/)
      if (!jsonMatch) throw new Error('no_json')
      const parsed = JSON.parse(jsonMatch[0])

      setResult({
        source: 'photo',
        name: parsed.name || 'Блюдо',
        confidence: 90,
        calories: Math.round(parsed.calories) || 200,
        protein: Math.round((parsed.protein || 0) * 10) / 10,
        fat: Math.round((parsed.fat || 0) * 10) / 10,
        carbs: Math.round((parsed.carbs || 0) * 10) / 10,
        unit_weight: 100,
        imageFile
      })
    } catch(e) {
      console.error('Photo error:', e.message)
      if (e.message === 'no_token') setError('Токен Groq не настроен.')
      else if (e.message === 'no_json') setError('Не удалось распознать блюдо. Попробуй другое фото.')
      else setError('Ошибка: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  async function resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize } }
        else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize } }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1])
      }
      img.onerror = reject
      img.src = url
    })
  }

  const handleAddMeal = async () => {
    if (!result) return
    haptic('medium')
    const w = parseFloat(weight) || 100
    const ratio = w / (result.unit_weight || 100)
    const today = new Date().toISOString().split('T')[0]
    try {
      await addMeal({
        name: result.name,
        calories: Math.round(result.calories * ratio),
        protein: Math.round(result.protein * ratio * 10) / 10,
        fat: Math.round(result.fat * ratio * 10) / 10,
        carbs: Math.round(result.carbs * ratio * 10) / 10,
        type: mealType, date: today
      })
      onMealAdded?.()
      haptic('medium')
      onBack()
    } catch(e) {
      setError('Ошибка при добавлении.')
    }
  }

  const calcCal = () => result ? Math.round(result.calories * (parseFloat(weight) || 100) / (result.unit_weight || 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { stopQuagga(); onBack() }} style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Сканер еды</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Фото или штрихкод</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Main menu */}
        {!mode && !processing && (
          <>
            <div onClick={() => fileRef.current?.click()}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--pink-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сфотографировать блюдо</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ИИ распознает и посчитает калории</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            </div>

            <div onClick={startBarcodeScanner}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--green-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сканировать штрихкод</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведи камеру на штрихкод</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ввести штрихкод вручную</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" placeholder="4607031762574" value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                  style={{ flex: 1, fontSize: 15 }} />
                <button onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                  style={{ background: 'var(--pink)', color: 'white', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                  Найти
                </button>
              </div>
            </div>
          </>
        )}

        {/* Barcode scanner */}
        {mode === 'barcode' && scanning && (
          <div>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', width: '100%', aspectRatio: '16/9' }}>
              <div
                ref={videoContainerRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
              {/* Scan frame overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ position: 'relative', width: '80%', height: 80 }}>
                  {/* corners */}
                  {[['0','0','borderTop','borderLeft'],['0','0','borderTop','borderRight'],['auto','0','borderBottom','borderLeft'],['auto','0','borderBottom','borderRight']].map(([t,b,bt,bl], i) => (
                    <div key={i} style={{ position: 'absolute', ...(t==='0'?{top:0}:{bottom:0}), ...(i%2===0?{left:0}:{right:0}), width: 20, height: 20, [bt]: '3px solid var(--pink)', [bl]: '3px solid var(--pink)' }} />
                  ))}
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(232,67,122,0.6)', animation: 'scan 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Держи упаковку ровно, штрихкод в рамке
            </div>
            <button className="btn-outline" onClick={() => { stopQuagga(); setMode(null); setScanning(false) }}>
              Отмена
            </button>
          </div>
        )}

        {/* Processing */}
        {processing && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {mode === 'photo' ? '🤖 Распознаём блюдо...' : '🔍 Ищем продукт...'}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !processing && (
          <div>
            <div style={{ background: '#FEE2E2', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>⚠️ {error}</div>
            </div>
            <button className="btn-primary" onClick={resetScan}>Попробовать снова</button>
          </div>
        )}

        {/* Result */}
        {result && !processing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                {(result.imageFile || result.image) && (
                  <img src={result.imageFile || result.image} alt="" style={{ width: 70, height: 70, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{result.name}</div>
                  {result.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{result.brand}</div>}
                  {result.source === 'photo' && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>🤖 Распознано ИИ</div>}
                  {result.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>📦 {result.barcode}</div>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Калории', result.calories, 'ккал', 'var(--pink)'], ['Белки', result.protein, 'г', '#3498DB'], ['Жиры', result.fat, 'г', '#FF9800'], ['Углеводы', result.carbs, 'г', 'var(--green)']].map(([l, v, u, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{l}<br/>{u}/100г</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Количество (г)</div>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} style={{ fontSize: 18, fontWeight: 800 }} />
                </div>
                <div style={{ textAlign: 'center', minWidth: 80, padding: 12, background: 'var(--pink-light)', borderRadius: 12 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--pink)', lineHeight: 1 }}>{calcCal()}</div>
                  <div style={{ fontSize: 11, color: 'var(--pink)' }}>ккал</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[['breakfast','🌅 Завтрак'], ['lunch','☀️ Обед'], ['dinner','🌙 Ужин'], ['snack','🍎 Перекус']].map(([t, l]) => (
                  <button key={t} onClick={() => setMealType(t)}
                    style={{ flex: 1, padding: '7px 2px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', border: 'none', background: mealType === t ? 'var(--pink)' : 'var(--bg)', color: mealType === t ? 'white' : 'var(--text-muted)' }}>
                    {l}
                  </button>
                ))}
              </div>

              <button className="btn-primary" onClick={handleAddMeal}>✅ Добавить {calcCal()} ккал</button>
            </div>

            <button className="btn-outline" onClick={resetScan}>Сканировать другой продукт</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 20%; }
          50% { top: 80%; }
          100% { top: 20%; }
        }
        #interactive video { width: 100% !important; height: 100% !important; object-fit: cover; }
        #interactive canvas { width: 100% !important; height: 100% !important; position: absolute; top: 0; left: 0; }
      `}</style>
    </div>
  )
}
