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
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [activeTag, setActiveTag] = useState('Все')

  useEffect(() => {
    getTodayStats().then(r => setStats(r.data)).catch(() => {})
    getRecipes().then(r => setRecipes(r.data)).catch(() => {})
  }, [])

  const allTags = ['Все', ...new Set(recipes.flatMap(r => r.tags || []))]
  const filteredRecipes = activeTag === 'Все' ? recipes : recipes.filter(r => (r.tags || []).includes(activeTag))

  const macros = [
    { label: 'Белки', value: Math.round(stats.protein || 0), goal: 120, unit: 'г', color: 'var(--pink)' },
    { label: 'Жиры', value: Math.round(stats.fat || 0), goal: 80, unit: 'г', color: '#FF9800' },
    { label: 'Углеводы', value: Math.round(stats.carbs || 0), goal: 200, unit: 'г', color: 'var(--green)' }
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

      {/* Calorie ring */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: `conic-gradient(var(--pink) 0% ${Math.min(100, ((stats.consumed || 0) / (stats.goal || 2000)) * 100)}%, #f0f0f0 0%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

      {/* Delivery */}
      <div>
        <div className="section-header"><h3>Заказ питания</h3></div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
          {deliveryServices.map(s => (
            <div key={s.id} onClick={() => { haptic('light'); setSelectedDelivery(s.id) }}
              style={{ flexShrink: 0, width: 100, borderRadius: 'var(--radius-sm)', padding: '12px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', border: selectedDelivery === s.id ? '2px solid var(--green)' : '1.5px solid var(--border)', background: selectedDelivery === s.id ? 'var(--green-light)' : 'var(--white)' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{s.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{s.period}</div>
            </div>
          ))}
        </div>
        {selectedDelivery && <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => haptic('medium')}>Оформить заказ →</button>}
      </div>

      {/* Recipes */}
      <div>
        <div className="section-header"><h3>Рецепты</h3></div>

        {/* Tag filters */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 10px' }}>
          {allTags.map(tag => (
            <button key={tag} onClick={() => { haptic('light'); setActiveTag(tag) }}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', background: activeTag === tag ? 'var(--pink)' : 'var(--white)', color: activeTag === tag ? 'white' : 'var(--text-muted)', border: activeTag === tag ? 'none' : '1.5px solid var(--border)' }}>
              {tag}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {filteredRecipes.map(r => (
            <div key={r.id} onClick={() => { haptic('light'); setSelectedRecipe(r) }}
              style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '0.5px solid var(--border)', cursor: 'pointer', background: 'var(--white)' }}>
              {r.image_url ? (
                <div style={{ height: 90, overflow: 'hidden' }}>
                  <img src={r.image_url} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                </div>
              ) : (
                <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, background: 'var(--pink-light)' }}>{r.emoji}</div>
              )}
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{r.calories} ккал · {r.time} мин</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {(r.tags || []).slice(0, 2).map(tag => (
                    <span key={tag} className="badge badge-green" style={{ fontSize: 9, padding: '2px 6px' }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recipe modal */}
      {selectedRecipe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Hero image */}
            {selectedRecipe.image_url ? (
              <div style={{ position: 'relative', height: 200 }}>
                <img src={selectedRecipe.image_url} alt={selectedRecipe.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => setSelectedRecipe(null)} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-x" />
                </button>
              </div>
            ) : (
              <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 48 }}>{selectedRecipe.emoji}</div>
                <button onClick={() => setSelectedRecipe(null)} style={{ color: 'var(--text-muted)', fontSize: 22 }}><i className="ti ti-x" /></button>
              </div>
            )}

            <div style={{ padding: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{selectedRecipe.name}</h2>

              {/* Meta */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  <i className="ti ti-clock" /> {selectedRecipe.time} мин
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  <i className="ti ti-users" /> {selectedRecipe.servings} порции
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--pink)', fontWeight: 700 }}>
                  🔥 {selectedRecipe.calories} ккал
                </div>
              </div>

              {/* Macros */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {[['Белки', selectedRecipe.protein, 'var(--pink)'], ['Жиры', selectedRecipe.fat, '#FF9800'], ['Углеводы', selectedRecipe.carbs, 'var(--green)']].map(([l, v, c]) => (
                  <div key={l} style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: c }}>{v}г</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Ingredients */}
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>🛒 Ингредиенты</h3>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 20 }}>
                {(selectedRecipe.ingredients || []).map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < selectedRecipe.ingredients.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 13 }}>{ing.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{ing.amount}</span>
                  </div>
                ))}
              </div>

              {/* Steps */}
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>👩‍🍳 Приготовление</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {(selectedRecipe.steps || []).map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pink)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                      {s.step || i + 1}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, paddingTop: 4 }}>{s.text}</div>
                  </div>
                ))}
              </div>

              <button className="btn-primary" onClick={() => setSelectedRecipe(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
