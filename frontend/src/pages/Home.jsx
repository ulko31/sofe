import { useState, useEffect } from 'react'
import { getTodayStats, getTrackers, getMeals, updateTracker, addMeal } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'

export default function Home({ user }) {
  const { haptic } = useTelegram()
  const [stats, setStats] = useState({ consumed: 0, goal: 2000, burned: 0, protein: 0, fat: 0, carbs: 0 })
  const [trackers, setTrackers] = useState({ water: 0, steps: 0, sleep: 0, pulse: 0 })
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [newMeal, setNewMeal] = useState({ name: '', calories: '', type: 'snack' })

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

  const handleWaterAdd = async () => {
    haptic('medium')
    const newVal = +(trackers.water || 0) + 0.25
    setTrackers(t => ({ ...t, water: newVal }))
    await updateTracker('water', newVal).catch(() => {})
  }

  const handleAddMeal = async () => {
    if (!newMeal.name || !newMeal.calories) return
    haptic('light')
    try {
      const res = await addMeal({ ...newMeal, date: today })
      setMeals(m => [...m, res.data])
      setStats(s => ({ ...s, consumed: s.consumed + parseInt(newMeal.calories) }))
      setNewMeal({ name: '', calories: '', type: 'snack' })
      setShowAddMeal(false)
    } catch (e) {
      console.error(e)
    }
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
          <h2 style={{ fontSize: 20, fontWeight: 900 }}>Привет, {user?.name?.split(' ')[0] || 'красотка'}! 👋</h2>
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
          {[['Сожжено', stats.burned || 0, 'ккал'], ['Белки', stats.protein || 0, 'г'], ['Жиры', stats.fat || 0, 'г'], ['Углеводы', stats.carbs || 0, 'г']].map(([l, v, u]) => (
            <div key={l} style={{ fontSize: 11, opacity: 0.85 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 800, opacity: 1 }}>{v}{u}</span>
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* Trackers */}
      <div>
        <div className="section-header">
          <h3>Трекеры</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'water', label: 'Вода', icon: 'ti-droplet', val: `${(trackers.water || 0).toFixed(1)} л`, max: 3, color: 'pink', action: handleWaterAdd },
            { key: 'steps', label: 'Шаги', icon: 'ti-run', val: `${(trackers.steps || 0).toLocaleString('ru')}`, max: 10000, color: 'green' },
            { key: 'sleep', label: 'Сон', icon: 'ti-moon', val: `${trackers.sleep || 0} ч`, max: 9, color: 'pink' },
            { key: 'pulse', label: 'Пульс', icon: 'ti-heart-rate-monitor', val: `${trackers.pulse || 72} уд/мин`, max: 100, color: 'green' }
          ].map(t => {
            const num = parseFloat(trackers[t.key] || 0)
            const pct = Math.min(100, (num / t.max) * 100)
            return (
              <div
                key={t.key}
                className="card"
                style={{ cursor: t.action ? 'pointer' : 'default' }}
                onClick={t.action}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.color === 'pink' ? 'var(--pink-light)' : 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 18, color: t.color === 'pink' ? 'var(--pink)' : 'var(--green)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.label} {t.action && <span style={{ color: 'var(--pink)', fontSize: 10 }}>+250мл</span>}</div>
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
          <a onClick={() => { haptic('light'); setShowAddMeal(true) }}>+ Добавить</a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: mealTypeColor[type] }} />
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{mealTypeLabel[type]}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {items.reduce((s, i) => s + (parseInt(i.calories) || 0), 0)} ккал
                </span>
              </div>
              {items.map(item => (
                <div key={item.id} style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 18 }}>• {item.name}</div>
              ))}
            </div>
          ))}

          {meals.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 13 }}>
              Нет записей. Добавь первый приём пищи! 🥗
            </div>
          )}

          <button
            onClick={() => { haptic('light'); setShowAddMeal(true) }}
            style={{ border: '1.5px dashed var(--pink-mid)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--pink)', fontSize: 13, fontWeight: 700, background: 'none' }}
          >
            <i className="ti ti-plus" style={{ fontSize: 16 }} /> Добавить перекус
          </button>
        </div>
      </div>

      {/* Add Meal Modal */}
      {showAddMeal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Добавить еду</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" placeholder="Название блюда" value={newMeal.name} onChange={e => setNewMeal(m => ({ ...m, name: e.target.value }))} />
              <input type="number" placeholder="Калории (ккал)" value={newMeal.calories} onChange={e => setNewMeal(m => ({ ...m, calories: e.target.value }))} />
              <select value={newMeal.type} onChange={e => setNewMeal(m => ({ ...m, type: e.target.value }))}>
                <option value="breakfast">Завтрак</option>
                <option value="lunch">Обед</option>
                <option value="dinner">Ужин</option>
                <option value="snack">Перекус</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn-outline" onClick={() => setShowAddMeal(false)}>Отмена</button>
              <button className="btn-primary" onClick={handleAddMeal}>Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
