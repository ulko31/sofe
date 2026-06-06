import { useState, useRef, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { addMeal } from '../utils/api'

export default function FoodScan({ onBack, onMealAdded }) {
  const { haptic } = useTelegram()
  const [mode, setMode] = useState(null) // null | 'barcode' | 'barcode_manual' | 'photo'
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mealType, setMealType] = useState('snack')
  const [weight, setWeight] = useState('100')
  const [manualBarcode, setManualBarcode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCal, setEditCal] = useState(0)
  const [barcodeImage, setBarcodeImage] = useState(null)
  const [barcodeCode, setBarcodeCode] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearching, setNameSearching] = useState(false)
  const [recalcTimeout, setRecalcTimeout] = useState(null)
  const fileEnvRef = useRef(null)
  const fileGalleryRef = useRef(null)
  const barcodeStreamRef = useRef(null)

  useEffect(() => () => stopCamera(), [])

  const stopCamera = () => {
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach(t => t.stop())
      barcodeStreamRef.current = null
    }
    const v = document.getElementById('barcode-video')
    if (v) v.srcObject = null
  }

  const reset = () => {
    stopCamera()
    setMode(null); setScanning(false); setResult(null)
    setError(null); setManualBarcode(''); setEditName('')
    setBarcodeImage(null); setProcessing(false)
  }

  // ── BARCODE CAMERA ────────────────────────────────────────
  const startBarcodeCamera = async () => {
    setMode('barcode'); setScanning(true); setError(null); setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      barcodeStreamRef.current = stream
      await new Promise(r => setTimeout(r, 300))
      const v = document.getElementById('barcode-video')
      if (v) { v.srcObject = stream; await v.play() }
    } catch(e) {
      setError('Не удалось открыть камеру. Введи штрихкод вручную.')
      setScanning(false)
    }
  }

  const captureBarcode = async () => {
    haptic('medium')
    const v = document.getElementById('barcode-video')
    if (!v) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    canvas.getContext('2d').drawImage(v, 0, 0)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    stopCamera(); setScanning(false); setProcessing(true)

    try {
      const groqToken = import.meta.env.VITE_GROQ_TOKEN
      if (!groqToken) throw new Error('no_token')
      const base64 = imgData.split(',')[1]
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Find the barcode in this image. Read all digits printed under or above the barcode lines. Reply with ONLY the digits (8-14 numbers), nothing else. If no barcode found, reply NOT_FOUND.' }
          ]}],
          max_tokens: 20, temperature: 0
        })
      })
      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content?.trim() || ''
      const code = raw.replace(/[^0-9]/g, '')
      if (code.length >= 8) {
        await lookupBarcode(code)
        return
      }
    } catch(e) {}

    // AI failed — show image + manual input
    setBarcodeImage(imgData)
    setMode('barcode_manual')
    setProcessing(false)
  }

  const lookupBarcode = async (barcode) => {
    setProcessing(true); setError(null)
    try {
      // Try original + variants (AI sometimes misses first digit)
      const variants = [barcode]
      if (barcode.length === 12) variants.push('4' + barcode) // EAN-13 starting with 4
      if (barcode.length === 12) variants.push('0' + barcode) // UPC-A to EAN-13
      if (barcode.startsWith('4') && barcode.length === 13) variants.push(barcode.slice(1)) // remove leading 4
      
      let data = null
      for (const code of variants) {
        const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
        const d = await r.json()
        if (d.status === 1 && d.product) { data = d; break }
      }

      if (!data || !data.product) {
        // Try searching by barcode as text in OFF
        try {
          const searchRes = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${barcode}&search_simple=1&action=process&json=1&page_size=3`)
          const searchData = await searchRes.json()
          if (searchData.products?.[0]?.product_name) {
            data = { product: searchData.products[0] }
          }
        } catch(e) {}
      }

      if (!data || !data.product) {
        // Show manual name search fallback
        setMode('barcode_name_search')
        setBarcodeCode(barcode)
        setProcessing(false); return
      }
      const p = data.product; const n = p.nutriments || {}
      const res = {
        source: 'barcode', barcode,
        name: p.product_name_ru || p.product_name || 'Продукт',
        brand: p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || 0),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        image: p.image_front_small_url || null, unit_weight: 100
      }
      setResult(res); setEditName(res.name); setEditCal(res.calories)
    } catch(e) { setError('Ошибка сети.') }
    finally { setProcessing(false) }
  }

  // ── PHOTO ─────────────────────────────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''; setMode('photo'); setProcessing(true); setError(null); setResult(null)
    haptic('light')
    const imageFile = URL.createObjectURL(file)
    try {
      const groqToken = import.meta.env.VITE_GROQ_TOKEN
      if (!groqToken) throw new Error('no_token')
      const resized = await resizeImage(file, 512)
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${resized}`, detail: 'low' } },
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
        source: 'photo', name: parsed.name || 'Блюдо',
        calories: Math.round(parsed.calories) || 200,
        protein: Math.round((parsed.protein || 0) * 10) / 10,
        fat: Math.round((parsed.fat || 0) * 10) / 10,
        carbs: Math.round((parsed.carbs || 0) * 10) / 10,
        unit_weight: 100, imageFile
      }
      setResult(res); setEditName(res.name); setEditCal(res.calories)
    } catch(e) {
      if (e.message === 'no_token') setError('Токен Groq не настроен.')
      else if (e.message === 'no_json') setError('Не удалось распознать блюдо.')
      else setError('Ошибка: ' + e.message)
    } finally { setProcessing(false) }
  }

  async function resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file)
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
      img.onerror = reject; img.src = url
    })
  }

  const searchByName = async (q) => {
    if (!q || q.length < 2) return
    setNameSearching(true)
    try {
      const [ru, gl] = await Promise.allSettled([
        fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&action=process&json=1&page_size=10&lc=ru`).then(r => r.json()),
        fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&action=process&json=1&page_size=10`).then(r => r.json()),
      ])
      const parse = (data) => (data?.products || [])
        .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'] > 0)
        .map(p => ({
          id: p.code,
          name: p.product_name_ru || p.product_name,
          brand: (p.brands || '').split(',')[0].trim(),
          calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
          protein: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
          fat: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
          carbs: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
        }))
      const seen = new Set()
      const results = [...(ru.status==='fulfilled'?parse(ru.value):[]), ...(gl.status==='fulfilled'?parse(gl.value):[])].filter(f => {
        if (seen.has(f.name)) return false; seen.add(f.name); return true
      })
      setNameResults(results.slice(0, 15))
    } catch(e) {}
    setNameSearching(false)
  }

  const selectNameResult = (item) => {
    setResult({ source: 'barcode', barcode: barcodeCode, ...item, unit_weight: 100 })
    setEditName(item.name); setEditCal(item.calories)
    setMode(null)
  }

  const handleAddMeal = async () => {
    if (!result) return; haptic('medium')
    const w = parseFloat(weight) || 100
    const ratio = w / (result.unit_weight || 100)
    try {
      await addMeal({
        name: editName || result.name,
        calories: Math.round((editCal || result.calories) * ratio),
        protein: Math.round(result.protein * ratio * 10) / 10,
        fat: Math.round(result.fat * ratio * 10) / 10,
        carbs: Math.round(result.carbs * ratio * 10) / 10,
        type: mealType, date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
      })
      onMealAdded?.(); haptic('medium'); onBack()
    } catch(e) { setError('Ошибка при добавлении.') }
  }

  const calcCal = () => result ? Math.round((editCal || result.calories) * (parseFloat(weight) || 100) / (result.unit_weight || 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { stopCamera(); onBack() }} style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Сканер еды</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Фото или штрихкод</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Main menu */}
        {!mode && !processing && (
          <>
            <input ref={fileEnvRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            <input ref={fileGalleryRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />

            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 20, border: '2px dashed var(--pink-mid)' }}>
              <div style={{ fontSize: 40, marginBottom: 8, textAlign: 'center' }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, textAlign: 'center' }}>Сфотографировать блюдо</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>ИИ определит калории и БЖУ</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => fileEnvRef.current?.click()}
                  style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--pink)', color: 'white', border: 'none', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📷 Камера</button>
                <button onClick={() => fileGalleryRef.current?.click()}
                  style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🖼 Галерея</button>
              </div>
            </div>

            <div onClick={startBarcodeCamera}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--green-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сканировать штрихкод</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Сделай фото штрихкода — ИИ прочитает цифры</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ввести штрихкод вручную</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" placeholder="4607031762574" value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                  style={{ flex: 1, fontSize: 15 }} />
                <button onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                  style={{ background: 'var(--pink)', color: 'white', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>Найти</button>
              </div>
            </div>
          </>
        )}

        {/* Barcode camera view */}
        {mode === 'barcode' && scanning && (
          <div>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              <video id="barcode-video" autoPlay muted playsInline
                style={{ width: '100%', display: 'block', maxHeight: 360, objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ position: 'relative', width: '80%', height: 100 }}>
                  <div style={{ position: 'absolute', top: -2, left: -2, width: 24, height: 24, borderTop: '3px solid var(--pink)', borderLeft: '3px solid var(--pink)' }} />
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 24, height: 24, borderTop: '3px solid var(--pink)', borderRight: '3px solid var(--pink)' }} />
                  <div style={{ position: 'absolute', bottom: -2, left: -2, width: 24, height: 24, borderBottom: '3px solid var(--pink)', borderLeft: '3px solid var(--pink)' }} />
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderBottom: '3px solid var(--pink)', borderRight: '3px solid var(--pink)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 1, background: 'rgba(232,67,122,0.7)' }} />
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              Наведи камеру на штрихкод
            </div>
            <button className="btn-primary" style={{ marginBottom: 10, fontSize: 16 }} onClick={captureBarcode}>
              📸 Сфотографировать
            </button>
            <button className="btn-outline" onClick={() => { stopCamera(); setMode(null); setScanning(false) }}>Отмена</button>
          </div>
        )}

        {/* Barcode not found - search by name */}
        {mode === 'barcode_name_search' && (
          <div>
            <div style={{ background: '#FEF9C3', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13, color: '#854D0E' }}>
              Штрихкод <b>{barcodeCode}</b> не найден в базе. Введи название продукта:
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input placeholder="Например: Милка молочный" value={nameSearch}
                onChange={e => setNameSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchByName(nameSearch)}
                style={{ flex: 1, fontSize: 15 }} autoFocus />
              <button onClick={() => searchByName(nameSearch)}
                style={{ background: 'var(--pink)', color: 'white', border: 'none', borderRadius: 10, padding: '0 14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                🔍
              </button>
            </div>
            {nameSearching && <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
            {nameResults.map(item => (
              <div key={item.id} onClick={() => selectNameResult(item)}
                style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--white)', marginBottom: 6, cursor: 'pointer', border: '0.5px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {item.brand && <span style={{ color: 'var(--pink)', marginRight: 6 }}>{item.brand}</span>}
                  {item.calories} ккал · Б:{item.protein} · Ж:{item.fat} · У:{item.carbs}
                </div>
              </div>
            ))}
            {nameResults.length === 0 && !nameSearching && nameSearch.length > 1 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Ничего не найдено</div>
            )}
            <button className="btn-outline" style={{ marginTop: 8 }} onClick={() => { setMode(null); setNameResults([]) }}>Отмена</button>
          </div>
        )}

        {/* Manual barcode fallback */}
        {mode === 'barcode_manual' && (
          <div>
            {barcodeImage && <img src={barcodeImage} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12 }} />}
            <div style={{ background: '#FEF9C3', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13, color: '#854D0E' }}>
              ИИ не смог распознать штрихкод. Введи цифры с упаковки:
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="number" placeholder="4607031762574" value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                style={{ flex: 1, fontSize: 16 }} autoFocus />
              <button onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                style={{ background: 'var(--pink)', color: 'white', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>Найти</button>
            </div>
            <button className="btn-outline" onClick={() => { setMode(null); setBarcodeImage(null) }}>Назад</button>
          </div>
        )}

        {/* Processing */}
        {processing && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {mode === 'photo' ? '🤖 Распознаём блюдо...' : '🔍 Читаем штрихкод...'}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !processing && (
          <div>
            <div style={{ background: '#FEE2E2', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>⚠️ {error}</div>
            </div>
            <button className="btn-primary" onClick={reset}>Попробовать снова</button>
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
                  <input value={editName} onChange={e => {
                    const n = e.target.value; setEditName(n)
                    if (result.source === 'photo' && n.length > 2) {
                      clearTimeout(recalcTimeout)
                      setRecalcTimeout(setTimeout(async () => {
                        const token = import.meta.env.VITE_GROQ_TOKEN; if (!token) return
                        try {
                          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: `Калории на 100г для "${n}"? Ответь ТОЛЬКО числом.` }], max_tokens: 10, temperature: 0 })
                          })
                          const d = await r.json(); const cal = parseInt(d.choices?.[0]?.message?.content?.trim())
                          if (!isNaN(cal) && cal > 0) setEditCal(cal)
                        } catch(e) {}
                      }, 800))
                    }
                  }}
                    style={{ fontSize: 15, fontWeight: 800, border: 'none', borderBottom: '1.5px solid var(--pink-mid)', background: 'transparent', width: '100%', padding: '2px 0', fontFamily: 'Nunito, sans-serif', marginBottom: 4 }} />
                  {result.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.brand}</div>}
                  {result.source === 'photo' && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>🤖 ИИ · можно исправить название</div>}
                  {result.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📦 {result.barcode}</div>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Калории', editCal || result.calories, 'ккал', 'var(--pink)'], ['Белки', result.protein, 'г', '#3498DB'], ['Жиры', result.fat, 'г', '#FF9800'], ['Углеводы', result.carbs, 'г', 'var(--green)']].map(([l, v, u, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{l}/{u}</div>
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
                {[['breakfast','🌅 Завтрак'],['lunch','☀️ Обед'],['dinner','🌙 Ужин'],['snack','🍎 Перекус']].map(([t,l]) => (
                  <button key={t} onClick={() => setMealType(t)}
                    style={{ flex: 1, padding: '7px 2px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', border: 'none', background: mealType === t ? 'var(--pink)' : 'var(--bg)', color: mealType === t ? 'white' : 'var(--text-muted)' }}>
                    {l}
                  </button>
                ))}
              </div>

              <button className="btn-primary" onClick={handleAddMeal}>✅ Добавить {calcCal()} ккал</button>
            </div>
            <button className="btn-outline" onClick={reset}>Сканировать другой продукт</button>
          </div>
        )}
      </div>
    </div>
  )
}
