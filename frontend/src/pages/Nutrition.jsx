import { useState, useEffect } from 'react'
import { getTodayStats, getRecipes } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'

const deliveryServices = [
  { id: 'primeal', name: 'ПриМил', emoji: '🍱', period: '1 месяц' },
  { id: 'groweat', name: 'GrowEat', emoji: '🥗', period: '3 месяца' },
  { id: 'imeal', name: 'iMeal', emoji: '🥩', period: '6 месяцев' }
]

export default function Nutrition() {
  const { haptic } = useTelegram()
  const [stats, setStats] = useState({ consumed: 0, goal: 2000, protein: 0, fat: 0, carbs: 0 })
  const [recipes, setRecipes] = useState([])
  const [selectedDelivery, setSelectedDelivery] = useState(null)

  useEffect(() => {
    getTodayStats().then(r => setStats(r.data)).catch(() => {})
    getRecipes().then(r => setRecipes(r.data)).catch(() => {
      setRecipes([
        { id: 1, name: 'Креветки с брокколи', calories: 320, time: 25, emoji: '🍤', tags: ['Белок', 'ПП'] },
        { id: 2, name: 'Зелёный салат', calories: 180, time: 10, emoji: '🥗', tags: ['Лёгкий'] },
        { id: 3, name: 'Паста с говядиной', calories: 490, time: 40, emoji: '🍝', tags: ['Сытный'] },
        { id: 4, name: 'Смузи-боул', calories: 260, time: 5, emoji: '🥣', tags: ['Завтрак'] }
      ])
    })
  }, [])

  const macros = [
    { label: 'Белки', value: stats.protein || 0, goal: 120, unit: 'г', color: 'var(--pink)' },
    { label: 'Жиры', value: stats.fat || 0, goal: 80, unit: 'г', color: '#FF9800' },
    { label: 'Углеводы', value: stats.carbs || 0, goal: 200, unit: 'г', color: 'var(--green)' }
  ]

  return (
    <div className="screen">
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Питание</h2>

      {/* Macros */}
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 700 }}>Нутриенты сегодня</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {macros.map(m => (
            <div key={m.label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: m.color }}>{m.value}{m.unit}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.label}</div>
              <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 6 }}>
                <div style={{ height: '100%', background: m.color, borderRadius: 2, width: `${Math.min(100, (m.value / m.goal) * 100)}%` }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>из {m.goal}{m.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Calorie ring summary */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'conic-gradient(var(--pink) 0% ' + Math.min(100, (stats.consumed / stats.goal) * 100) + '%, #f0f0f0 0%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>{stats.consumed || 0}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>ккал</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Норма: {stats.goal || 2000} ккал</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Осталось: <b style={{ color: 'var(--pink)' }}>{Math.max(0, (stats.goal || 2000) - (stats.consumed || 0))} ккал</b>
          </div>
        </div>
      </div>

      {/* Delivery services */}
      <div>
        <div className="section-header"><h3>Заказ питания</h3></div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
          {deliveryServices.map(s => (
            <div
              key={s.id}
              onClick={() => { haptic('light'); setSelectedDelivery(s.id) }}
              style={{
                flexShrink: 0, width: 100, borderRadius: 'var(--radius-sm)', padding: '12px 8px',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                border: selectedDelivery === s.id ? '2px solid var(--green)' : '1.5px solid var(--border)',
                background: selectedDelivery === s.id ? 'var(--green-light)' : 'var(--white)'
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>{s.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{s.period}</div>
            </div>
          ))}
        </div>
        {selectedDelivery && (
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => haptic('medium')}>
            Оформить заказ →
          </button>
        )}
      </div>

      {/* Recipes */}
      <div>
        <div className="section-header">
          <h3>Рецепты</h3>
          <a onClick={() => haptic('light')}>Все рецепты</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {recipes.map(r => (
            <div key={r.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => haptic('light')}>
              <div style={{
                height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
                background: ['var(--pink-light)', 'var(--green-light)', '#FFF3E0', '#E3F2FD'][r.id % 4]
              }}>{r.emoji}</div>
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.calories} ккал · {r.time} мин</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {(r.tags || []).map(tag => <span key={tag} className="badge badge-green" style={{ fontSize: 9, padding: '2px 6px' }}>{tag}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
