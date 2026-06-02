import { useState, useRef, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import { addMeal, searchFoods } from '../utils/api'

// Barcode scanner using QuaggaJS (loaded from CDN)
// Food photo recognition via HuggingFace

export default function FoodScan({ onBack, onMealAdded }) {
  const { haptic } = useTelegram()
  const [mode, setMode] = useState(null) // 'barcode' | 'photo'
  const [scanning, setScanning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [mealType, setMealType] = useState('snack')
  const [weight, setWeight] = useState('100')
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const quaggaRef = useRef(null)

  useEffect(() => {
    return () => stopCamera()
  }, [])

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

  // ── BARCODE ──────────────────────────────────────────────
  const startBarcodeScanner = async () => {
    setMode('barcode')
    setScanning(true)
    setError(null)
    setResult(null)

    // Load QuaggaJS
    if (!window.Quagga) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
    }

    try {
      await new Promise((resolve, reject) => {
        window.Quagga.init({
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: videoRef.current,
            constraints: {
              width: { min: 640 },
              height: { min: 480 },
              facingMode: 'environment'
            }
          },
          decoder: {
            readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader', 'upc_e_reader']
          },
          locate: true
        }, (err) => {
          if (err) { reject(err); return }
          resolve()
        })
      })

      quaggaRef.current = window.Quagga
      window.Quagga.start()

      window.Quagga.onDetected(async (data) => {
        const code = data.codeResult.code
        haptic('medium')
        window.Quagga.stop()
        quaggaRef.current = null
        setScanning(false)
        await lookupBarcode(code)
      })
    } catch(e) {
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
        setError(`Продукт с кодом ${barcode} не найден в базе. Попробуй другой.`)
        setProcessing(false)
        return
      }

      const p = data.product
      const nutriments = p.nutriments || {}

      setResult({
        source: 'barcode',
        barcode,
        name: p.product_name_ru || p.product_name || p.generic_name || 'Неизвестный продукт',
        brand: p.brands || '',
        calories: Math.round(nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0),
        protein: Math.round((nutriments.proteins_100g || 0) * 10) / 10,
        fat: Math.round((nutriments.fat_100g || 0) * 10) / 10,
        carbs: Math.round((nutriments.carbohydrates_100g || 0) * 10) / 10,
        image: p.image_front_small_url || p.image_url || null,
        unit: '100г',
        unit_weight: 100
      })
    } catch(e) {
      setError('Ошибка при поиске продукта. Проверь интернет.')
    } finally {
      setProcessing(false)
    }
  }

  const handleManualBarcode = async (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      await lookupBarcode(e.target.value.trim())
    }
  }

  // ── PHOTO RECOGNITION ─────────────────────────────────────
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMode('photo')
    setProcessing(true)
    setError(null)
    setResult(null)
    haptic('light')

    try {
      // Convert to base64
      const base64 = await new Promise((res) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })

      // Call HuggingFace food classification model
      const hfToken = import.meta.env.VITE_HF_TOKEN
      const response = await fetch(
        'https://api-inference.huggingface.co/models/nateraw/food',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: base64 })
        }
      )

      if (!response.ok) {
        throw new Error('HF API error: ' + response.status)
      }

      const predictions = await response.json()

      // Get top prediction
      const top = Array.isArray(predictions) ? predictions[0] : null
      if (!top) throw new Error('No predictions')

      const foodName = top.label?.replace(/_/g, ' ') || 'Unknown'
      const confidence = Math.round((top.score || 0) * 100)

      // Try to find in our DB via search
      const searchRes = await searchFoods(foodName)
      const dbFood = searchRes.data?.[0]

      // Translate food name to Russian using our DB or fallback
      const russianName = dbFood?.name || translateFoodName(foodName)

      setResult({
        source: 'photo',
        name: russianName,
        nameEn: foodName,
        confidence,
        calories: dbFood?.calories || estimateCalories(foodName),
        protein: dbFood?.protein || 0,
        fat: dbFood?.fat || 0,
        carbs: dbFood?.carbs || 0,
        unit: dbFood?.unit || '100г',
        unit_weight: dbFood?.unit_weight || 100,
        imageFile: URL.createObjectURL(file),
        alternatives: Array.isArray(predictions) ? predictions.slice(1, 4) : []
      })
    } catch(e) {
      console.error(e)
      if (e.message?.includes('403') || e.message?.includes('401')) {
        setError('Ошибка авторизации HuggingFace. Проверь токен в настройках.')
      } else if (e.message?.includes('503')) {
        setError('Модель загружается, подожди 20 секунд и попробуй снова.')
      } else {
        setError('Не удалось распознать блюдо. Попробуй фото с лучшим освещением.')
      }
    } finally {
      setProcessing(false)
    }
  }

  // Food name translations
  const foodTranslations = {
    'pizza': 'Пицца', 'burger': 'Бургер', 'sushi': 'Суши', 'salad': 'Салат',
    'pasta': 'Паста', 'soup': 'Суп', 'steak': 'Стейк', 'chicken': 'Курица',
    'rice': 'Рис', 'bread': 'Хлеб', 'cake': 'Торт', 'ice cream': 'Мороженое',
    'omelette': 'Омлет', 'sandwich': 'Сэндвич', 'wrap': 'Ролл', 'taco': 'Тако',
    'pancake': 'Блин', 'waffle': 'Вафля', 'donut': 'Пончик', 'cookie': 'Печенье',
    'apple_pie': 'Яблочный пирог', 'french_fries': 'Картофель фри',
    'hot_dog': 'Хот-дог', 'nachos': 'Начос', 'spaghetti': 'Спагетти',
    'ramen': 'Рамен', 'dim_sum': 'Дим сам', 'gyoza': 'Гёдза',
    'bibimbap': 'Бибимбап', 'edamame': 'Эдамаме', 'miso_soup': 'Мисо суп',
    'fried_rice': 'Жареный рис', 'spring_rolls': 'Спринг роллы',
    'bruschetta': 'Брускетта', 'risotto': 'Ризотто', 'tiramisu': 'Тирамису'
  }

  function translateFoodName(name) {
    const lower = name.toLowerCase()
    for (const [en, ru] of Object.entries(foodTranslations)) {
      if (lower.includes(en)) return ru
    }
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
  }

  function estimateCalories(name) {
    const estimates = {
      pizza: 266, burger: 295, salad: 100, pasta: 158, soup: 57,
      steak: 250, chicken: 165, rice: 130, bread: 265, cake: 350,
      'ice cream': 207, omelette: 154, sandwich: 250, pancake: 227,
      french_fries: 312, hot_dog: 290, spaghetti: 158, ramen: 180
    }
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(estimates)) {
      if (lower.includes(k)) return v
    }
    return 200
  }

  // ── ADD MEAL ──────────────────────────────────────────────
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
        type: mealType,
        date: today
      })
      onMealAdded?.(meal.data)
      haptic('success')
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
        {!mode && !result && (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Как сканируем?</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Выбери способ распознавания</div>
            </div>

            <div onClick={() => fileRef.current?.click()}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--pink-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сфотографировать блюдо</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>ИИ распознает блюдо и посчитает калории</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            </div>

            <div onClick={startBarcodeScanner}
              style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--green-mid)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Сканировать штрихкод</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведи на штрихкод упаковки</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>или</div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ввести штрихкод вручную</div>
              <input type="number" placeholder="4607031762574" onKeyDown={handleManualBarcode}
                style={{ fontSize: 15 }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Нажми Enter для поиска</div>
            </div>
          </>
        )}

        {/* Barcode scanner view */}
        {mode === 'barcode' && scanning && (
          <div>
            <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative', background: '#000' }}>
              <div ref={videoRef} style={{ width: '100%', height: 300 }} />
              {/* Scan frame overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 240, height: 120, border: '2px solid var(--pink)', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTop: '3px solid var(--pink)', borderLeft: '3px solid var(--pink)', borderRadius: '4px 0 0 0' }} />
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTop: '3px solid var(--pink)', borderRight: '3px solid var(--pink)', borderRadius: '0 4px 0 0' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottom: '3px solid var(--pink)', borderLeft: '3px solid var(--pink)', borderRadius: '0 0 0 4px' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottom: '3px solid var(--pink)', borderRight: '3px solid var(--pink)', borderRadius: '0 0 4px 0' }} />
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
              Наведи камеру на штрихкод
            </div>
            <button className="btn-outline" onClick={() => { stopCamera(); setMode(null); setScanning(false) }}>
              Отмена
            </button>
          </div>
        )}

        {/* Processing */}
        {processing && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {mode === 'photo' ? '🤖 ИИ распознаёт блюдо...' : '🔍 Ищем продукт...'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Это займёт несколько секунд</div>
          </div>
        )}

        {/* Error */}
        {error && !processing && (
          <div>
            <div style={{ background: '#FEE2E2', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>⚠️ {error}</div>
            </div>
            <button className="btn-outline" onClick={() => { setMode(null); setError(null); setResult(null) }}>
              Попробовать снова
            </button>
          </div>
        )}

        {/* Result */}
        {result && !processing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Product card */}
            <div className="card">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                {result.imageFile && (
                  <img src={result.imageFile} alt="" style={{ width: 70, height: 70, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                )}
                {result.image && !result.imageFile && (
                  <img src={result.image} alt="" style={{ width: 70, height: 70, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{result.name}</div>
                  {result.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{result.brand}</div>}
                  {result.source === 'photo' && (
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>
                      🤖 Уверенность: {result.confidence}%
                    </div>
                  )}
                  {result.barcode && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      📦 {result.barcode}
                    </div>
                  )}
                </div>
              </div>

              {/* Macros per 100g */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Калории', result.calories, 'ккал', 'var(--pink)'],
                  ['Белки', result.protein, 'г', '#3498DB'],
                  ['Жиры', result.fat, 'г', '#FF9800'],
                  ['Углеводы', result.carbs, 'г', 'var(--green)']].map(([l, v, u, c]) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{l}<br/>{u}/100г</div>
                  </div>
                ))}
              </div>

              {/* Weight input */}
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

              {/* Meal type */}
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

            {/* Alternatives (photo mode) */}
            {result.alternatives?.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Другие варианты:</div>
                {result.alternatives.map((alt, i) => (
                  <div key={i} onClick={() => { haptic('light'); setResult(r => ({ ...r, name: translateFoodName(alt.label), nameEn: alt.label, confidence: Math.round(alt.score * 100) })) }}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < result.alternatives.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13 }}>{translateFoodName(alt.label)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{Math.round(alt.score * 100)}%</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-outline" onClick={() => { setMode(null); setResult(null); setError(null) }}>
              Сканировать другой продукт
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
