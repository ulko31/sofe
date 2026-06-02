import { useState, useEffect, useRef } from 'react'
import { getTodayStats, getTrackers, getMeals, updateTracker, addMeal, deleteMeal, searchFoods } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'
import FoodScan from './FoodScan'

export default function Home({ user }) {
  const { haptic } = useTelegram()
  const [stats, setStats] = useState({ consumed: 0, goal: 2000, burned: 0, protein: 0, fat: 0, carbs: 0 })
  const [trackers, setTrackers] = useState({ water: 0, steps: 0, sleep: 0, pulse: 0 })
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [addMealType, setAddMealType] = useState('snack')
  const [showScan, setShowScan] = useState(false)

  // Food search state
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [weight, setWeight] = useState('100')
  const searchTimeout = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    Promise.all([getTodayStats(), getTrackers(today), getMeals(today)])
      .then(([s, t, m]) => {
        setStats(s.data)
        setTrackers(t.data)
        setMeals(m.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Debounced food search
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSearchResults([])
      return
    }
    clearTimeout(searchTimeout.current)
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await searchFoods(query)
        setSearchResults(res.data)
      } catch (e) {}
      finally { setSearching(false) }
    }, 300)
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

  const handleWaterAdd = async () => {
    haptic('medium')
    const newVal = +(trackers.water || 0) + 0.25
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
      onBack={() => setShowScan(false)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900 }}>
            Привет, {user?.name?.split(' ')[0] || 'красотка'}! 👋
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--pink-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌸</div>
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
        <div className="section-header"><h3>Трекеры</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'water', label: 'Вода', icon: 'ti-droplet', val: `${(trackers.water || 0).toFixed(1)} л`, max: 3, color: 'pink', action: handleWaterAdd, hint: '+250мл' },
            { key: 'steps', label: 'Шаги', icon: 'ti-run', val: `${(trackers.steps || 0).toLocaleString('ru')}`, max: 10000, color: 'green' },
            { key: 'sleep', label: 'Сон', icon: 'ti-moon', val: `${trackers.sleep || 0} ч`, max: 9, color: 'pink' },
            { key: 'pulse', label: 'Пульс', icon: 'ti-heart-rate-monitor', val: `${trackers.pulse || 72} уд/мин`, max: 100, color: 'green' }
          ].map(t => {
            const num = parseFloat(trackers[t.key] || 0)
            const pct = Math.min(100, (num / t.max) * 100)
            return (
              <div key={t.key} className="card" style={{ cursor: t.action ? 'pointer' : 'default' }} onClick={t.action}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.color === 'pink' ? 'var(--pink-light)' : 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 18, color: t.color === 'pink' ? 'var(--pink)' : 'var(--green)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t.label} {t.hint && <span style={{ color: 'var(--pink)', fontSize: 10 }}>{t.hint}</span>}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>{t.val}</div>
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
            <button onClick={() => { haptic('light'); setShowScan(true) }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--green-light)', border: 'none', color: 'var(--green-dark)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              <i className="ti ti-scan" style={{ fontSize: 14 }} /> Сканер
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
    </div>
  )
}
