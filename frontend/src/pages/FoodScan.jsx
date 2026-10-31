import { useState, useRef, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { addMeal, searchCatalog, lookupProductCode, recognizeFoodPhoto } from '../utils/api'
import { normalizeProductCode } from '../utils/productCode'
import { nutrientNumber, parsePhotoNutrition } from '../utils/nutrition'

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
  const [editCal, setEditCal] = useState('')
  const [barcodeImage, setBarcodeImage] = useState(null)
  const [barcodeCode, setBarcodeCode] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearching, setNameSearching] = useState(false)
    const photoIntentRef = useRef('dish')
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
    if (!v || !v.videoWidth || !v.videoHeight) { setError('Камера ещё не готова. Подожди и попробуй снова.'); return }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    canvas.getContext('2d').drawImage(v, 0, 0)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    stopCamera(); setScanning(false); setProcessing(true)

    try {
      const { decodeBarcodeCanvas } = await import('../utils/decodeBarcode')
      const text = decodeBarcodeCanvas(canvas)
      const code = normalizeProductCode(text)
      if (!code) throw new Error('unsupported_code')
      await lookupBarcode(code)
      return
    } catch(e) {
      setError(e.message === 'unsupported_code' ? 'Этот QR-код не содержит код продукта. Наведи камеру на полосатый штрихкод.' : 'Не удалось прочитать код. Сфотографируй штрихкод крупнее или введи цифры вручную.')
    }
    setBarcodeImage(imgData); setManualBarcode(''); setMode('barcode_manual'); setProcessing(false)
  }

  const lookupBarcode = async (barcode) => {
    const code = normalizeProductCode(barcode)
    if (!code) { setError('Введи 8, 12, 13 или 14 цифр штрихкода.'); return }
    setProcessing(true); setError(null)
    try {
      const response = await lookupProductCode(code)
      const data = response.data
      if (data.found) {
        setResult({ source: 'barcode', ...data, unit_weight: 100 })
        setEditName(data.name); setEditCal(data.calories ?? '')
        setMode(null)
        if (data.nutrition_complete === false) setError('В базе не заполнены все КБЖУ. Сфотографируй этикетку или введи значения на 100 г/мл вручную.')
      } else {
        setBarcodeCode(code); setMode('barcode_name_search')
        if (data.reason === 'nutrition_missing') setError('Продукт найден, но КБЖУ не заполнены. Используй фото этикетки.')
      }
    } catch(e) {
      setError(e.response?.data?.error || 'Не удалось связаться с каталогом. Повтори поиск.')
      setMode('barcode_manual'); setManualBarcode(code)
    } finally { setProcessing(false) }
  }

  // ── PHOTO ─────────────────────────────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''; setMode('photo'); setProcessing(true); setError(null); setResult(null)
    haptic('light')
    const imageFile = URL.createObjectURL(file)
    try {
      const resized = await resizeImage(file, 1280)
      const intent = photoIntentRef.current
      const response = await recognizeFoodPhoto(`data:image/jpeg;base64,${resized}`, intent)
      const text = response.data?.content || ''
      const nutrition = parsePhotoNutrition(text)
      const res = { ...nutrition, source: intent === 'label' ? 'photo_label' : 'photo', imageFile }
      setResult(res); setEditName(res.name); setEditCal(res.calories ?? '')
    } catch(e) {
      if (e.response?.data?.message) setError(`${e.response.data.message} (${e.response.data.error || 'PHOTO_SERVER'})`)
      else if (e.code === 'ECONNABORTED') setError('Сервер не ответил вовремя. Попробуй ещё раз. (PHOTO_NETWORK_TIMEOUT)')
      else if (e.message === 'bad_image') setError('Не удалось открыть фото на устройстве. Выбери JPEG или PNG. (PHOTO_DECODE)')
      else if (e.message === 'not_food') setError('На фото не удалось найти блюдо или пищевую этикетку.')
      else if (e.message === 'no_json' || e instanceof SyntaxError) setError('Сервис не вернул данные о еде. Попробуй другое фото. (PHOTO_PARSE)')
      else setError('Не удалось отправить фото. Проверь соединение и повтори попытку. (PHOTO_NETWORK)')
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
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')) }; img.src = url
    })
  }

  const searchByName = async (text) => {
    if (text.trim().length < 2) return
    setNameSearching(true); setError(null)
    try {
      const response = await searchCatalog(text.trim())
      setNameResults(response.data || [])
      if (!response.data?.length) setError('Продукт не найден. Попробуй другое название или фото этикетки.')
    } catch(e) {
      setNameResults([])
      setError(e.response?.data?.error || 'Каталог временно недоступен.')
    } finally { setNameSearching(false) }
  }

  const selectNameResult = (item) => {
    setResult({ source: 'barcode', barcode: barcodeCode, ...item, unit_weight: 100 })
    setEditName(item.name); setEditCal(item.calories ?? '')
    setMode(null)
  }

  const handleAddMeal = async () => {
    if (!result) return
    const nutrients = { calories: nutrientNumber(editCal), protein: nutrientNumber(result.protein, 100), fat: nutrientNumber(result.fat, 100), carbs: nutrientNumber(result.carbs, 100) }
    if (Object.values(nutrients).some(v => v === null)) { setError('Заполни все КБЖУ на 100 г/мл с этикетки. Пустое поле означает, что значение неизвестно.'); return }
    if (!Number.isFinite(Number(weight)) || Number(weight) <= 0) { setError('Укажи вес больше нуля.'); return }
    haptic('medium')
    if (nutrients.protein + nutrients.fat + nutrients.carbs > 105) { setError('Проверь БЖУ: нужны значения на 100 г/мл.'); return }
    const w = Number(weight)
    const ratio = w / (result.unit_weight || 100)
    try {
      const saved = await addMeal({
        name: editName || result.name,
        calories: Math.round(nutrients.calories * ratio),
        protein: Math.round(nutrients.protein * ratio * 10) / 10,
        fat: Math.round(nutrients.fat * ratio * 10) / 10,
        carbs: Math.round(nutrients.carbs * ratio * 10) / 10,
        type: mealType, date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
      })
      onMealAdded?.(saved.data); haptic('medium'); onBack()
    } catch(e) { setError('Ошибка при добавлении.') }
  }

  const calcCal = () => nutrientNumber(editCal) === null ? '—' : Math.round(nutrientNumber(editCal) * (parseFloat(weight) || 0) / 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { stopCamera(); onBack() }} style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Сканер еды</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Фото или штрихкод</div>
        </div>
      </div>

      <input ref={fileEnvRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            <input ref={fileGalleryRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Main menu */}
        {!mode && !processing && (
          <>


            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 20, border: '2px dashed var(--pink-mid)' }}>
              <div style={{ fontSize: 40, marginBottom: 8, textAlign: 'center' }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, textAlign: 'center' }}>Сфотографировать блюдо</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>Оценка КБЖУ на 100 г — подтверди состав и вес</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { photoIntentRef.current = 'dish'; fileEnvRef.current?.click() }}
                  style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--pink)', color: 'white', border: 'none', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📷 Камера</button>
                <button onClick={() => { photoIntentRef.current = 'dish'; fileGalleryRef.current?.click() }}
                  style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border)', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🖼 Галерея</button>
              </div>
            </div>

            <div onClick={startBarcodeCamera}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--green-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сканировать штрихкод</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведи камеру на штрихкод продукта</div>
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
              Наведи камеру на полосатый штрихкод или GS1 QR-код
            </div>
            <button className="btn-primary" style={{ marginBottom: 10, fontSize: 16 }} onClick={captureBarcode}>
              📸 Прочитать код
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
                  {item.calories ?? '—'} ккал · Б:{item.protein ?? '—'} · Ж:{item.fat ?? '—'} · У:{item.carbs ?? '—'}
                </div>
              </div>
            ))}
            {nameResults.length === 0 && !nameSearching && nameSearch.length > 1 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>Ничего не найдено</div>
            )}
            <button className="btn-outline" style={{ marginTop: 8 }} onClick={() => { setMode(null); setNameResults([]) }}>Отмена</button>
          </div>
        )}

        {/* Barcode manual — editable field with AI prefill */}
        {mode === 'barcode_manual' && (
          <div>
            {barcodeImage && <img src={barcodeImage} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12, maxHeight: 200, objectFit: 'cover' }} />}
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
              {manualBarcode ? '📋 Проверь цифры штрихкода:' : '✏️ Введи цифры со штрихкода:'}
            </div>
            {manualBarcode ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                ИИ считал эти цифры — проверь и исправь если нужно
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="number"
                placeholder="4607031762574"
                value={manualBarcode}
                onChange={e => setManualBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}
                autoFocus
              />
              <button onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                style={{ background: 'var(--pink)', color: 'white', border: 'none', borderRadius: 10, padding: '0 18px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 14 }}>
                Найти
              </button>
            </div>
            <button className="btn-outline" onClick={() => { setMode(null); setBarcodeImage(null); setManualBarcode('') }}>Назад</button>
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
            {!result && <button className="btn-outline" style={{ marginTop: 10 }} onClick={() => {
              setError(null); setMode(null); setEditName('Моё блюдо'); setEditCal('')
              setResult({ name: 'Моё блюдо', calories: null, protein: null, fat: null, carbs: null, source: 'manual', unit_weight: 100 })
            }}>Ввести КБЖУ вручную</button>}
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
                  {(result.source === 'photo' || result.source === 'photo_label') && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{result.source === 'photo_label' ? 'Считано с этикетки — проверь значения' : 'Оценка по фото на 100 г — проверь состав и вес'}</div>}
                  {result.source === 'openfoodfacts' && <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Open Food Facts · сверь с этикеткой</a>}
                  {[editCal, result.protein, result.fat, result.carbs].some(v => nutrientNumber(v) === null) && <div style={{ fontSize: 11 }}>КБЖУ заполнены не полностью</div>}
                  {result.barcode && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📦 {result.barcode}</div>}
                </div>
              </div>

              <button className="btn-outline" onClick={() => { photoIntentRef.current = 'label'; fileEnvRef.current?.click() }} style={{ marginBottom: 12 }}>📷 Заполнить КБЖУ с этикетки</button>
              <div style={{ fontSize: 11, marginBottom: 8 }}>Значения на 100 г/мл. Их можно исправить вручную.</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Калории', editCal, 'ккал', 'var(--pink)'], ['Белки', result.protein, 'г', '#3498DB'], ['Жиры', result.fat, 'г', '#FF9800'], ['Углеводы', result.carbs, 'г', 'var(--green)']].map(([l, v, u, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <input aria-label={l + ' на 100 г/мл'} type="number" min="0" step="0.1" value={v ?? ''}
                      onChange={e => {
                        if (l === 'Калории') setEditCal(e.target.value)
                        else { const key = { 'Белки': 'protein', 'Жиры': 'fat', 'Углеводы': 'carbs' }[l]; setResult(r => ({ ...r, [key]: e.target.value === '' ? null : e.target.value })) }
                      }} style={{ width: '100%', padding: 3, fontSize: 15, textAlign: 'center', color: c }} />
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
