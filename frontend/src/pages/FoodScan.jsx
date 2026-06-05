import { useState, useRef, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { addMeal, searchFoods } from '../utils/api'

export default function FoodScan({ onBack, onMealAdded, initialMode }) {
  const { haptic } = useTelegram()
  const [mode, setMode] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mealType, setMealType] = useState('snack')
  const [weight, setWeight] = useState('100')
  const [manualBarcode, setManualBarcode] = useState('')
  const [editName, setEditName] = useState('')
  const fileRef = useRef(null)
  const fileEnvRef = useRef(null)
  const scannerRef = useRef(null)
  const detectedRef = useRef(false)

  useEffect(() => () => stopScanner(), [])

  useEffect(() => {
    if (!initialMode) return
    if (initialMode === 'photo') setTimeout(() => fileEnvRef.current?.click(), 400)
    else if (initialMode === 'barcode') setTimeout(() => startBarcodeScanner(), 400)
  }, [initialMode])

  const stopScanner = () => {
    if (scannerRef.current) {
      try { scannerRef.current.stop?.().catch?.(() => {}) } catch(e) {}
      scannerRef.current = null
    }
    detectedRef.current = false
  }

  const resetScan = () => {
    stopScanner()
    setMode(null)
    setScanning(false)
    setResult(null)
    setError(null)
    setManualBarcode('')
    setEditName('')
  }

  // ── BARCODE ───────────────────────────────────────────────
  const startBarcodeScanner = async () => {
    setMode('barcode')
    setScanning(true)
    setError(null)
    setResult(null)
    detectedRef.current = false

    // Load html5-qrcode
    if (!window.Html5Qrcode) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      } catch(e) {
        setError('Не удалось загрузить сканер. Введи штрихкод вручную.')
        setScanning(false)
        return
      }
    }

    await new Promise(r => setTimeout(r, 300))

    try {
      const html5QrCode = new window.Html5Qrcode('qr-reader')
      scannerRef.current = html5QrCode

      const config = {
        fps: 15,
        qrbox: (w, h) => ({ width: Math.min(280, w * 0.8), height: 120 }),
        aspectRatio: 16/9,
        formatsToSupport: [
          window.Html5QrcodeSupportedFormats?.EAN_13,
          window.Html5QrcodeSupportedFormats?.EAN_8,
          window.Html5QrcodeSupportedFormats?.UPC_A,
          window.Html5QrcodeSupportedFormats?.UPC_E,
          window.Html5QrcodeSupportedFormats?.CODE_128,
        ].filter(Boolean)
      }

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          if (detectedRef.current) return
          detectedRef.current = true
          haptic('medium')
          await html5QrCode.stop().catch(() => {})
          scannerRef.current = null
          setScanning(false)
          await lookupBarcode(decodedText)
        },
        () => {} // ignore errors during scanning
      )
    } catch(e) {
      console.error('Scanner start error:', e)
      setError('Не удалось запустить камеру. Введи штрихкод вручную ниже.')
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
        setError(`Продукт со штрихкодом ${barcode} не найден. Попробуй ввести название вручную.`)
        setProcessing(false)
        return
      }
      const p = data.product
      const n = p.nutriments || {}
      const res = {
        source: 'barcode', barcode,
        name: p.product_name_ru || p.product_name || 'Продукт',
        brand: p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || 0),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        image: p.image_front_small_url || null,
        unit_weight: 100
      }
      setResult(res)
      setEditName(res.name)
    } catch(e) {
      setError('Ошибка сети. Проверь интернет и попробуй снова.')
    } finally {
      setProcessing(false)
    }
  }

  // ── PHOTO ──────────────────────────────────────────────────
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
        headers: { 'Authorization': `Bearer ${groqToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            { type: 'text', text: 'What food is in this image? Reply ONLY with JSON: {"name":"название на русском","calories":kcal_per_100g,"protein":g,"fat":g,"carbs":g}' }
          ]}],
          max_tokens: 100, temperature: 0
        })
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content?.trim() || ''
      const jsonMatch = text.match(/\{[^{}]+\}/)
      if (!jsonMatch) throw new Error('no_json')
      const parsed = JSON.parse(jsonMatch[0])

      const res = {
        source: 'photo',
        name: parsed.name || 'Блюдо',
        calories: Math.round(parsed.calories) || 200,
        protein: Math.round((parsed.protein || 0) * 10) / 10,
        fat: Math.round((parsed.fat || 0) * 10) / 10,
        carbs: Math.round((parsed.carbs || 0) * 10) / 10,
        unit_weight: 100, imageFile
      }
      setResult(res)
      setEditName(res.name)
    } catch(e) {
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
        name: editName || result.name,
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
      setError('Ошибка при добавлении. Попробуй ещё раз.')
    }
  }

  const calcCal = () => result ? Math.round(result.calories * (parseFloat(weight) || 100) / (result.unit_weight || 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { stopScanner(); onBack() }}
          style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>
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
            {/* Photo */}
            <input ref={fileEnvRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            <input id="file-gallery" type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />

            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 20, border: '2px dashed var(--pink-mid)' }}>
              <div style={{ fontSize: 40, marginBottom: 8, textAlign: 'center' }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, textAlign: 'center' }}>Сфотографировать блюдо</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>ИИ определит калории и БЖУ</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => fileEnvRef.current?.click()}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--pink)', color: 'white', border: 'none', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  📷 Камера
                </button>
                <button onClick={() => document.getElementById('file-gallery').click()}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  🖼 Галерея
                </button>
              </div>
            </div>

            {/* Barcode */}
            <div onClick={startBarcodeScanner}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--green-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сканировать штрихкод</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведи камеру на упаковку</div>
            </div>

            {/* Manual barcode */}
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
            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', width: '100%' }}>
              <div id="qr-reader" style={{ width: '100%' }} />
            </div>
            <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Держи камеру ровно, штрихкод в рамке • Подожди 2-3 сек
            </div>
            <button className="btn-outline" onClick={() => { stopScanner(); setMode(null); setScanning(false) }}>
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
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ fontSize: 15, fontWeight: 800, border: 'none', borderBottom: '1.5px solid var(--pink-mid)', background: 'transparent', width: '100%', padding: '2px 0', fontFamily: 'Nunito, sans-serif', marginBottom: 4 }} />
                  {result.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.brand}</div>}
                  {result.source === 'photo' && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>🤖 ИИ · можно исправить</div>}
                  {result.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📦 {result.barcode}</div>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Калории', result.calories, 'ккал/100г', 'var(--pink)'], ['Белки', result.protein, 'г', '#3498DB'], ['Жиры', result.fat, 'г', '#FF9800'], ['Углеводы', result.carbs, 'г', 'var(--green)']].map(([l, v, u, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{l}<br />{u}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Количество (г/мл)</div>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} style={{ fontSize: 18, fontWeight: 800 }} />
                </div>
                <div style={{ textAlign: 'center', minWidth: 80, padding: 12, background: 'var(--pink-light)', borderRadius: 12 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--pink)', lineHeight: 1 }}>{calcCal()}</div>
                  <div style={{ fontSize: 11, color: 'var(--pink)' }}>ккал</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[['breakfast', '🌅 Завтрак'], ['lunch', '☀️ Обед'], ['dinner', '🌙 Ужин'], ['snack', '🍎 Перекус']].map(([t, l]) => (
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
        #qr-reader { width: 100% !important; }
        #qr-reader video { width: 100% !important; }
        #qr-reader__scan_region { background: transparent !important; }
        #qr-reader__dashboard { background: var(--white); padding: 8px; }
        #qr-reader__dashboard_section_swaplink { display: none; }
      `}</style>
    </div>
  )
}
