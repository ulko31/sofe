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
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const quaggaRef = useRef(null)

  useEffect(() => () => stopCamera(), [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (quaggaRef.current) {
      try { quaggaRef.current.stop() } catch(e) {}
      quaggaRef.current = null
    }
  }

  const resetScan = () => {
    stopCamera()
    setMode(null)
    setScanning(false)
    setResult(null)
    setError(null)
    setManualBarcode('')
  }

  // ── BARCODE ──────────────────────────────────────────────
  const startBarcodeScanner = async () => {
    setMode('barcode')
    setScanning(true)
    setError(null)
    setResult(null)

    if (!window.Quagga) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      } catch(e) {
        setError('Не удалось загрузить сканер. Введи штрихкод вручную.')
        setScanning(false)
        return
      }
    }

    try {
      await new Promise((resolve, reject) => {
        window.Quagga.init({
          inputStream: {
            name: 'Live', type: 'LiveStream',
            target: videoRef.current,
            constraints: { facingMode: 'environment' }
          },
          decoder: { readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader'] },
          locate: true
        }, err => err ? reject(err) : resolve())
      })

      quaggaRef.current = window.Quagga
      window.Quagga.start()

      window.Quagga.onDetected(async data => {
        const code = data.codeResult.code
        haptic('medium')
        window.Quagga.stop()
        quaggaRef.current = null
        setScanning(false)
        await lookupBarcode(code)
      })
    } catch(e) {
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
        setError(`Продукт ${barcode} не найден. Попробуй другой штрихкод или введи вручную.`)
        setProcessing(false)
        return
      }
      const p = data.product
      const n = p.nutriments || {}
      setResult({
        source: 'barcode', barcode,
        name: p.product_name_ru || p.product_name || p.generic_name || 'Неизвестный продукт',
        brand: p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        image: p.image_front_small_url || null,
        unit_weight: 100
      })
    } catch(e) {
      setError('Ошибка сети. Проверь интернет и попробуй снова.')
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

    try {
      const groqToken = import.meta.env.VITE_GROQ_TOKEN
      if (!groqToken) throw new Error('no_token')

      // Convert to base64 data URL
      const dataUrl = await new Promise(res => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.readAsDataURL(file)
      })

      const imageFile = URL.createObjectURL(file)

      // Use Groq vision model to identify food
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.2-11b-vision-preview',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl }
              },
              {
                type: 'text',
                text: 'Определи что за блюдо или продукт на фото. Ответь ТОЛЬКО в формате JSON: {"name": "название на русском", "calories": число ккал на 100г, "protein": белки г, "fat": жиры г, "carbs": углеводы г, "confidence": уверенность 0-100}. Если не можешь определить еду — верни {"error": "not_food"}.'
              }
            ]
          }],
          max_tokens: 200,
          temperature: 0.1
        })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        if (response.status === 401) throw new Error('invalid_token')
        throw new Error(err.error?.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content?.trim()
      if (!text) throw new Error('empty')

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('parse_error')

      const parsed = JSON.parse(jsonMatch[0])

      if (parsed.error === 'not_food') {
        setError('На фото не видно еды. Попробуй сфотографировать блюдо крупнее.')
        setProcessing(false)
        return
      }

      setResult({
        source: 'photo',
        name: parsed.name || 'Неизвестное блюдо',
        confidence: parsed.confidence || 85,
        calories: parsed.calories || 200,
        protein: parsed.protein || 0,
        fat: parsed.fat || 0,
        carbs: parsed.carbs || 0,
        unit_weight: 100,
        imageFile
      })
    } catch(e) {
      console.error('Photo scan error:', e)
      if (e.message === 'no_token') {
        setError('Токен Groq не настроен. Добавь VITE_GROQ_TOKEN в переменные Vercel.')
      } else if (e.message === 'invalid_token') {
        setError('Токен Groq недействителен. Создай новый на console.groq.com.')
      } else {
        setError('Не удалось распознать блюдо. Попробуй фото с лучшим освещением.')
      }
    } finally {
      setProcessing(false)
    }
  }

  const foodTranslations = {
    'pizza': 'Пицца', 'burger': 'Бургер', 'sushi': 'Суши', 'salad': 'Салат',
    'pasta': 'Паста', 'soup': 'Суп', 'steak': 'Стейк', 'chicken': 'Курица',
    'rice': 'Рис', 'bread': 'Хлеб', 'cake': 'Торт', 'ice cream': 'Мороженое',
    'omelette': 'Омлет', 'sandwich': 'Сэндвич', 'pancake': 'Блин',
    'french fries': 'Картофель фри', 'hot dog': 'Хот-дог', 'ramen': 'Рамен',
    'spaghetti': 'Спагетти', 'tiramisu': 'Тирамису', 'donut': 'Пончик',
    'waffle': 'Вафля', 'cookie': 'Печенье', 'spring rolls': 'Спринг роллы'
  }

  function translateFoodName(name) {
    const lower = name.toLowerCase()
    for (const [en, ru] of Object.entries(foodTranslations)) {
      if (lower.includes(en)) return ru
    }
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
  }

  function estimateCalories(name) {
    const map = { pizza: 266, burger: 295, salad: 100, pasta: 158, soup: 57, steak: 250, chicken: 165, rice: 130, bread: 265, cake: 350, 'ice cream': 207, omelette: 154, sandwich: 250, pancake: 227, 'french fries': 312 }
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(map)) { if (lower.includes(k)) return v }
    return 200
  }

  const handleAddMeal = async () => {
    if (!result) return
    haptic('medium')
    const w = parseFloat(weight) || 100
    const ratio = w / (result.unit_weight || 100)
    const today = new Date().toISOString().split('T')[0]
    try {
      const meal = await addMeal({
        name: result.name,
        calories: Math.round(result.calories * ratio),
        protein: Math.round(result.protein * ratio * 10) / 10,
        fat: Math.round(result.fat * ratio * 10) / 10,
        carbs: Math.round(result.carbs * ratio * 10) / 10,
        type: mealType, date: today
      })
      onMealAdded?.(meal.data)
      haptic('medium')
      onBack()
    } catch(e) {
      setError('Ошибка при добавлении. Попробуй ещё раз.')
    }
  }

  const calcCal = () => result ? Math.round(result.calories * (parseFloat(weight) || 100) / (result.unit_weight || 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { stopCamera(); onBack() }} style={{ color: 'white', fontSize: 22 }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Сканер еды</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Фото или штрихкод</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

        {/* Mode selection */}
        {!mode && !result && !processing && (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Как сканируем?</div>
            </div>

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
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведи камеру на упаковку</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ввести штрихкод вручную</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" placeholder="4607031762574" value={manualBarcode}
                  onChange={e => setManualBarcode(e.target.value)} style={{ flex: 1, fontSize: 15 }} />
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
            <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative', background: '#000', minHeight: 280 }}>
              <div ref={videoRef} style={{ width: '100%' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 240, height: 100, border: '2px solid var(--pink)', borderRadius: 8 }} />
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>
              Наведи камеру на штрихкод
            </div>
            <button className="btn-outline" onClick={resetScan}>Отмена</button>
          </div>
        )}

        {/* Processing */}
        {processing && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {mode === 'photo' ? '🤖 ИИ распознаёт блюдо...' : '🔍 Ищем продукт...'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Несколько секунд...</div>
          </div>
        )}

        {/* Error */}
        {error && !processing && (
          <div>
            <div style={{ background: '#FEE2E2', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 12 }}>
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
                  {result.source === 'photo' && (
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>🤖 Уверенность: {result.confidence}%</div>
                  )}
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

              <button className="btn-primary" onClick={handleAddMeal}>
                ✅ Добавить {calcCal()} ккал
              </button>
            </div>

            {result.alternatives?.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Другие варианты:</div>
                {result.alternatives.map((alt, i) => (
                  <div key={i} onClick={() => { haptic('light'); setResult(r => ({ ...r, name: translateFoodName(alt.label), confidence: Math.round(alt.score * 100) })) }}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < result.alternatives.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13 }}>{translateFoodName(alt.label)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{Math.round(alt.score * 100)}%</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-outline" onClick={resetScan}>Сканировать другой продукт</button>
          </div>
        )}
      </div>
    </div>
  )
}
