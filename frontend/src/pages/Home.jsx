import { useState, useEffect, useRef } from 'react'
import { getTodayStats, getTrackers, getMeals, updateTracker, addMeal, deleteMeal, searchFoods } from '../utils/api'
import { searchLocalFoods } from '../utils/commonFoods'
import { useTelegram } from '../hooks/useTelegram'
import FoodScan from './FoodScan'

export default function Home({ user, onOpenAI, onTabChange }) {
  const { haptic } = useTelegram()
  const [stats, setStats] = useState({ consumed: 0, goal: user?.calories || 2000, burned: 0, protein: 0, fat: 0, carbs: 0 })
  const [trackers, setTrackers] = useState({ water: 0, steps: 0, sleep: 0, pulse: 0 })
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [addMealType, setAddMealType] = useState('snack')
  const [showScan, setShowScan] = useState(false)
  const [scanMode, setScanMode] = useState(null)

  // Food search state
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [weight, setWeight] = useState('100')
  const searchTimeout = useRef(null)

  const getToday = () => new Date().toISOString().split('T')[0]
  const today = getToday()

  const loadData = () => {
    const d = getToday()
    Promise.all([getTodayStats(), getTrackers(d), getMeals(d)])
      .then(([s, t, m]) => {
        setStats(s.data)
        setTrackers(t.data)
        setMeals(m.data)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadData()
    // Refresh when app comes back to foreground (new day check)
    const onFocus = () => loadData()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
      .finally(() => setLoading(false))
  }, [])

  // Debounced food search
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSearchResults([])
      return
    }
    clearTimeout(searchTimeout.current)
    // Show local results immediately
    const localResults = searchLocalFoods(query)
    setSearchResults(localResults)
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        // Search Open Food Facts (3M+ products including Russian brands)
        const offRes = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&lc=ru`,
          { headers: { 'User-Agent': 'SOFE-App/1.0 (health app)' } }
        )
        const offData = await offRes.json()
        const offFoods = (offData.products || [])
          .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'])
          .map(p => ({
            id: 'off_' + p.code,
            name: p.product_name_ru || p.product_name,
            brand: p.brands || '',
            calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
            protein: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
            fat: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
            carbs: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
            unit: '100г', unit_weight: 100
          }))
          .filter(f => f.calories > 0)

        // Also search backend
        let backendFoods = []
        try {
          const res = await searchFoods(query)
          backendFoods = res.data || []
        } catch(e) {}

        // Merge: backend first, then OFF, then local — deduplicate by name
        const seen = new Set()
        const merged = [...backendFoods, ...offFoods, ...localResults].filter(f => {
          const key = f.name?.toLowerCase()
          if (!key || seen.has(key)) return false
          seen.add(key)
          return true
        })
        setSearchResults(merged.slice(0, 30))
      } catch(e) {
        // Keep local results on error
        setSearching(false)
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  const handleSelectFood = (food) => {
    haptic('light')
    setSelectedFood(food)
    setQuery(food.name)
    setSearchResults([])
    // Calculate weight based on unit
    setWeight(String(food.unit_weight || 100))
  }

  const calcCalories = () => {
    if (!selectedFood) return ''
    const w = parseFloat(weight) || 0
    return Math.round((selectedFood.calories * w) / (selectedFood.unit_weight || 100))
  }

  const calcMacro = (field) => {
    if (!selectedFood) return 0
    const w = parseFloat(weight) || 0
    return Math.round((selectedFood[field] * w) / (selectedFood.unit_weight || 100) * 10) / 10
  }

  const handleAddMeal = async () => {
    if (!query.trim()) return
    haptic('medium')

    const cal = selectedFood ? calcCalories() : 0
    const mealData = {
      name: query,
      calories: cal,
      protein: selectedFood ? calcMacro('protein') : 0,
      fat: selectedFood ? calcMacro('fat') : 0,
      carbs: selectedFood ? calcMacro('carbs') : 0,
      type: addMealType,
      date: today
    }

    try {
      const res = await addMeal(mealData)
      setMeals(m => [...m, res.data])
      setStats(s => ({
        ...s,
        consumed: s.consumed + (cal || 0),
        protein: s.protein + (mealData.protein || 0),
        fat: s.fat + (mealData.fat || 0),
        carbs: s.carbs + (mealData.carbs || 0)
      }))
      setQuery('')
      setSelectedFood(null)
      setWeight('100')
      setShowAddMeal(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteMeal = async (id, calories) => {
    haptic('light')
    try {
      await deleteMeal(id)
      setMeals(m => m.filter(x => x.id !== id))
      setStats(s => ({ ...s, consumed: Math.max(0, s.consumed - (calories || 0)) }))
    } catch (e) {}
  }

  const [trackerModal, setTrackerModal] = useState(null) // {key, label, unit, value}

  const handleTrackerInput = (key, label, unit) => {
    haptic('light')
    setTrackerModal({ key, label, unit, value: String(trackers[key] || '') })
  }

  const saveTrackerModal = async () => {
    if (!trackerModal) return
    const num = parseFloat(trackerModal.value)
    if (isNaN(num) || num < 0) { setTrackerModal(null); return }
    haptic('medium')
    setTrackers(t => ({ ...t, [trackerModal.key]: num }))
    setTrackerModal(null)
    await updateTracker(trackerModal.key, num).catch(() => {})
  }

  const handleWaterAdd = async () => {
    haptic('medium')
    const newVal = +(trackers.water || 0) + 0.25
    setTrackers(t => ({ ...t, water: newVal }))
    await updateTracker('water', newVal).catch(() => {})
  }

  const handleWaterRemove = async (e) => {
    e?.stopPropagation()
    haptic('light')
    const newVal = Math.max(0, +(trackers.water || 0) - 0.25)
    setTrackers(t => ({ ...t, water: newVal }))
    await updateTracker('water', newVal).catch(() => {})
  }

  const remaining = Math.max(0, (stats.goal || 2000) - (stats.consumed || 0))
  const progress = Math.min(100, ((stats.consumed || 0) / (stats.goal || 2000)) * 100)

  const mealTypeLabel = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' }
  const mealTypeColor = { breakfast: '#FFB347', lunch: '#4CAF50', dinner: '#E8437A', snack: '#9B59B6' }

  const grouped = meals.reduce((acc, m) => {
    const t = m.type || 'snack'
    if (!acc[t]) acc[t] = []
    acc[t].push(m)
    return acc
  }, {})

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack']

  if (showScan) return (
    <FoodScan
      initialMode={scanMode}
      onBack={() => { setShowScan(false); setScanMode(null) }}
      onMealAdded={(meal) => {
        setMeals(m => [...m, meal])
        setStats(s => ({ ...s, consumed: s.consumed + (meal.calories || 0) }))
      }}
    />
  )

  if (loading) return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="screen">
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900 }}>
            Привет, {user?.name?.split(' ')[0] || 'красотка'}! 👋
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ width: 64, height: 64, flexShrink: 0, cursor: 'pointer', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(232,67,122,0.15)' }} onClick={() => onOpenAI?.()}>
          <img src="/mascot.svg" alt="SOFE" style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
        </div>
      </div>

      {/* Calories card */}
      <div style={{ background: 'var(--pink)', borderRadius: 'var(--radius)', padding: 18, color: 'white', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', right: 20, bottom: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>Потреблено сегодня</div>
            <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{stats.consumed || 0}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>ккал из {stats.goal || 2000}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Осталось</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{remaining}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>ккал</div>
          </div>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, margin: '12px 0 10px', position: 'relative', zIndex: 1 }}>
          <div style={{ height: '100%', background: 'white', borderRadius: 3, width: `${progress}%`, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, position: 'relative', zIndex: 1 }}>
          {[['Сожжено', stats.burned || 0, 'ккал'], ['Белки', Math.round(stats.protein || 0), 'г'], ['Жиры', Math.round(stats.fat || 0), 'г'], ['Углеводы', Math.round(stats.carbs || 0), 'г']].map(([l, v, u]) => (
            <div key={l} style={{ fontSize: 11, opacity: 0.85 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 800, opacity: 1 }}>{v}{u}</span>
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* Trackers */}
      <div>
        {/* AI Assistant quick access */}
        <div onClick={() => onOpenAI?.()} style={{ background: '#EAF3DE', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 4 }}>
          <div style={{ width: 44, height: 44, flexShrink: 0, background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/mascot.svg" alt="SOFE" style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
            </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#3a6b1a', fontWeight: 800, fontSize: 14 }}>SOFE ИИ-ассистент</div>
            <div style={{ color: '#5a8a2a', fontSize: 12, marginTop: 2 }}>Спроси про питание или тренировки</div>
          </div>
          <i className="ti ti-chevron-right" style={{ color: '#5a8a2a', fontSize: 18 }} />
        </div>

        <div className="section-header"><h3>Трекеры</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'water', label: 'Вода', icon: 'ti-droplet', val: `${Number(trackers.water || 0).toFixed(1)} л`, max: 3, color: 'pink', action: handleWaterAdd, hint: '+250мл' },
            { key: 'steps', label: 'Шаги', icon: 'ti-run', val: `${(trackers.steps || 0).toLocaleString('ru')}`, max: 10000, color: 'green', action: () => handleTrackerInput('steps', 'Шаги', 'шт'), hint: '✏️' },
            { key: 'sleep', label: 'Сон', icon: 'ti-moon', val: `${trackers.sleep || 0} ч`, max: 9, color: 'pink', action: () => handleTrackerInput('sleep', 'Сон', 'часов'), hint: '✏️' },
            { key: 'pulse', label: 'Пульс', icon: 'ti-heart-rate-monitor', val: `${trackers.pulse || 72} уд/мин`, max: 100, color: 'green', action: () => handleTrackerInput('pulse', 'Пульс', 'уд/мин'), hint: '✏️' }
          ].map(t => {
            const num = parseFloat(trackers[t.key] || 0)
            const pct = Math.min(100, (num / t.max) * 100)
            return (
              <div key={t.key} className="card" style={{ cursor: t.action ? 'pointer' : 'default' }} onClick={t.action}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.color === 'pink' ? 'var(--pink-light)' : 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 18, color: t.color === 'pink' ? 'var(--pink)' : 'var(--green)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.label}</div>
                <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>{t.val}</div>
                {t.key === 'water' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }} onClick={e => e.stopPropagation()}>
                    <button onClick={handleWaterRemove}
                      style={{ flex: 1, padding: '4px', borderRadius: 6, background: '#f0f0f0', border: 'none', fontSize: 14, fontWeight: 900, cursor: 'pointer', color: 'var(--text-muted)' }}>−</button>
                    <button onClick={e => { e.stopPropagation(); handleWaterAdd() }}
                      style={{ flex: 1, padding: '4px', borderRadius: 6, background: 'var(--pink-light)', border: 'none', fontSize: 14, fontWeight: 900, cursor: 'pointer', color: 'var(--pink)' }}>+</button>
                  </div>
                )}
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 8 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: t.color === 'pink' ? 'var(--pink)' : 'var(--green)', width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Meals */}
      <div>
        <div className="section-header">
          <h3>Питание</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { haptic('light'); setShowScan(true); setScanMode('photo') }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--pink-light)', border: 'none', color: 'var(--pink)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              <i className="ti ti-camera" style={{ fontSize: 14 }} /> Фото
            </button>
            <button onClick={() => { haptic('light'); setShowScan(true); setScanMode('barcode') }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--green-light)', border: 'none', color: 'var(--green-dark)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              <i className="ti ti-scan" style={{ fontSize: 14 }} /> Штрихкод
            </button>
            <a onClick={() => { haptic('light'); setShowAddMeal(true) }}>+ Добавить</a>
          </div>
        </div>

        {/* Quick add buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {Object.entries(mealTypeLabel).map(([type, label]) => (
            <button
              key={type}
              onClick={() => { haptic('light'); setAddMealType(type); setShowAddMeal(true) }}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10,
                background: addMealType === type && showAddMeal ? mealTypeColor[type] : 'var(--white)',
                border: `1.5px solid ${mealTypeColor[type]}`,
                color: addMealType === type && showAddMeal ? 'white' : mealTypeColor[type],
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mealOrder.filter(type => grouped[type]).map(type => (
            <div key={type} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: mealTypeColor[type] }} />
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{mealTypeLabel[type]}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {grouped[type].reduce((s, i) => s + (parseInt(i.calories) || 0), 0)} ккал
                </span>
              </div>
              {grouped[type].map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: 18, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{item.name}</div>
                    {(item.protein > 0 || item.fat > 0 || item.carbs > 0) && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Б:{item.protein}г · Ж:{item.fat}г · У:{item.carbs}г
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{item.calories} ккал</span>
                    <button onClick={() => handleDeleteMeal(item.id, item.calories)} style={{ color: '#ddd', fontSize: 16, padding: '0 2px' }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {meals.length === 0 && !showAddMeal && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              Нет записей. Добавь первый приём пищи! 🥗
            </div>
          )}
        </div>
      </div>

      {/* Add Meal Modal with food search */}
      {showAddMeal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900 }}>
                Добавить в {mealTypeLabel[addMealType].toLowerCase()}
              </h3>
              <button onClick={() => { setShowAddMeal(false); setQuery(''); setSelectedFood(null); setSearchResults([]) }} style={{ color: 'var(--text-muted)', fontSize: 22 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Meal type selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {Object.entries(mealTypeLabel).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => setAddMealType(type)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 8,
                    background: addMealType === type ? mealTypeColor[type] : 'var(--bg)',
                    border: 'none', color: addMealType === type ? 'white' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                type="text"
                placeholder="Введи название продукта или блюда..."
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedFood(null) }}
                style={{ paddingLeft: 38, fontSize: 14 }}
                autoFocus
              />
              {query && (
                <button onClick={() => { setQuery(''); setSelectedFood(null); setSearchResults([]) }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 12, maxHeight: 200, overflowY: 'auto' }}>
                {searchResults.map(food => (
                  <div
                    key={food.id}
                    onClick={() => handleSelectFood(food)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{food.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Б:{food.protein}г · Ж:{food.fat}г · У:{food.carbs}г
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--pink)' }}>{food.calories}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ккал/{food.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searching && (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>Ищем...</div>
            )}

            {/* Weight input + calculated calories */}
            {selectedFood && (
              <div style={{ background: 'var(--pink-light)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--pink)', marginBottom: 8 }}>
                  {selectedFood.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Количество</div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        style={{ fontSize: 16, fontWeight: 800, paddingRight: 40 }}
                      />
                      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>
                        {selectedFood.unit.replace(/\d+/g, '').trim() || 'г'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--pink)', lineHeight: 1 }}>{calcCalories()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ккал</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {[['Белки', 'protein'], ['Жиры', 'fat'], ['Углеводы', 'carbs']].map(([l, k]) => (
                    <div key={k} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {l}: <b style={{ color: 'var(--text)' }}>{calcMacro(k)}г</b>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual entry if no food selected */}
            {!selectedFood && query && searchResults.length === 0 && !searching && (
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Продукт не найден — введи калории вручную:</div>
                <input
                  type="number"
                  placeholder="Калории (ккал)"
                  id="manual-cal"
                  style={{ fontSize: 15 }}
                />
              </div>
            )}

            <button
              className="btn-primary"
              onClick={async () => {
                if (!selectedFood) {
                  const manualCal = document.getElementById('manual-cal')?.value
                  if (query && manualCal) {
                    haptic('medium')
                    try {
                      const res = await addMeal({ name: query, calories: parseInt(manualCal), type: addMealType, date: today })
                      setMeals(m => [...m, res.data])
                      setStats(s => ({ ...s, consumed: s.consumed + parseInt(manualCal) }))
                      setQuery(''); setShowAddMeal(false)
                    } catch (e) {}
                  }
                } else {
                  handleAddMeal()
                }
              }}
              disabled={!query.trim()}
              style={{ opacity: query.trim() ? 1 : 0.5 }}
            >
              Добавить в {mealTypeLabel[addMealType].toLowerCase()}
            </button>
          </div>
        </div>
      )}
        {/* Recipes quick access */}
        <div className="section-header">
          <h3>Рецепты</h3>
          <a onClick={() => { onTabChange?.('nutrition') }} style={{ cursor: 'pointer' }}>Все →</a>
        </div>
        <RecipesPreview />

      {/* Tracker input modal */}
      {trackerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--white)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>{trackerModal.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <input
                type="number"
                value={trackerModal.value}
                onChange={e => setTrackerModal(m => ({ ...m, value: e.target.value }))}
                style={{ flex: 1, fontSize: 24, fontWeight: 800, textAlign: 'center' }}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && saveTrackerModal()}
              />
              <span style={{ fontSize: 14, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{trackerModal.unit}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setTrackerModal(null)}>Отмена</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={saveTrackerModal}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function RecipesPreview() {
  const { haptic } = useTelegram()
  const [recipes, setRecipes] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    import('../utils/api').then(m => {
      m.default.get('/recipes')
        .then(r => setRecipes(Array.isArray(r.data) ? r.data.slice(0, 4) : []))
        .catch(() => {})
    })
  }, [])

  if (recipes.length === 0) return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '0.5px solid var(--border)' }}>
      🍽 Рецепты загружаются...
    </div>
  )

  if (selected) return (
    <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)' }}>
      <div style={{ position: 'relative' }}>
        {selected.image_url
          ? <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: '12px 12px 0 0' }} onError={e => e.target.style.display='none'} />
          : <div style={{ height: 120, background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, borderRadius: '12px 12px 0 0' }}>{selected.emoji}</div>
        }
        <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>←</button>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>{selected.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{selected.calories} ккал · {selected.time} мин · {selected.servings} порции</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['Б', selected.protein, '#3498DB'], ['Ж', selected.fat, '#FF9800'], ['У', selected.carbs, '#2ECC71']].map(([l,v,c]) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '6px 4px' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: c }}>{v}г</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
        {(selected.ingredients || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Ингредиенты:</div>
            {(selected.ingredients || []).map((ing, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '0.5px solid var(--border)' }}>
                <span>{ing.name}</span><span style={{ color: 'var(--text-muted)' }}>{ing.amount}</span>
              </div>
            ))}
          </div>
        )}
        {(selected.steps || []).length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Приготовление:</div>
            {(selected.steps || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--pink)', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, paddingTop: 2 }}>{s.text || s}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {recipes.map(r => (
        <div key={r.id} onClick={() => { haptic('light'); setSelected(r) }}
          style={{ background: 'var(--white)', borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer', border: '0.5px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {r.image_url
            ? <img src={r.image_url} alt={r.name} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: 90, background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{r.emoji || '🍽'}</div>
          }
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{r.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{r.calories} ккал · {r.time} мин</div>
          </div>
        </div>
      ))}
    </div>
  )
}
