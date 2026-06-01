import { useState, useEffect } from 'react'
import { getWorkouts, getSubscriptions, addWorkout } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'

const filters = ['Все', 'FIT', 'Stretching', 'Fit ball', 'Йога', 'Пилатес']
const workoutEmoji = { FIT: '🏃‍♀️', Stretching: '🧘‍♀️', 'Fit ball': '⚽', Йога: '🪷', Пилатес: '🎯' }

export default function Workouts() {
  const { haptic } = useTelegram()
  const [filter, setFilter] = useState('Все')
  const [workouts, setWorkouts] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    Promise.all([getWorkouts(), getSubscriptions()])
      .then(([w, s]) => {
        setWorkouts(w.data)
        setSubs(s.data)
      })
      .catch(() => {
        // Fallback demo data
        setWorkouts([
          { id: 1, name: 'FIT-тренировка', type: 'FIT', duration: 45, level: 'Интенсивный', format: 'Онлайн' },
          { id: 2, name: 'Stretching', type: 'Stretching', duration: 30, level: 'Лёгкий', format: 'Онлайн' },
          { id: 3, name: 'Fit ball', type: 'Fit ball', duration: 40, level: 'Средний', format: 'Студия' },
          { id: 4, name: 'Йога для начинающих', type: 'Йога', duration: 50, level: 'Лёгкий', format: 'Онлайн' }
        ])
        setSubs([
          { id: 1, studio: 'ELASTICA', total: 8, used: 5 },
          { id: 2, studio: 'ForMe', total: 16, used: 10 },
          { id: 3, studio: 'NF', total: 4, used: 2 }
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'Все' ? workouts : workouts.filter(w => w.type === filter)

  const handleStart = async (workout) => {
    haptic('medium')
    setSelected(workout)
    try {
      await addWorkout({ workout_id: workout.id, date: new Date().toISOString().split('T')[0] })
    } catch (e) {}
  }

  if (loading) return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div className="screen">
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Тренировки</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
        {filters.map(f => (
          <button
            key={f}
            onClick={() => { haptic('light'); setFilter(f) }}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s',
              border: filter === f ? 'none' : '1.5px solid var(--border)',
              background: filter === f ? 'var(--pink)' : 'var(--white)',
              color: filter === f ? 'white' : 'var(--text-muted)',
              fontFamily: 'Nunito, sans-serif'
            }}
          >{f}</button>
        ))}
      </div>

      {/* Workout list */}
      <div>
        <div className="section-header"><h3>Библиотека тренировок</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(w => (
            <div
              key={w.id}
              className="card"
              style={{ display: 'flex', padding: 0, overflow: 'hidden', cursor: 'pointer', border: selected?.id === w.id ? '2px solid var(--pink)' : '0.5px solid var(--border)' }}
              onClick={() => handleStart(w)}
            >
              <div style={{ width: 90, background: w.type === 'Stretching' || w.type === 'Йога' ? 'var(--green-light)' : 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>
                {workoutEmoji[w.type] || '💪'}
              </div>
              <div style={{ padding: '14px', flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{w.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{w.duration} мин · {w.format}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span className="badge badge-pink">{w.level}</span>
                  <span className="badge badge-green">{w.format}</span>
                </div>
              </div>
              {selected?.id === w.id && (
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14 }}>
                  <i className="ti ti-circle-check" style={{ color: 'var(--pink)', fontSize: 22 }} />
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Нет тренировок в этой категории</div>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      <div>
        <div className="section-header">
          <h3>Абонементы в студии</h3>
          <a onClick={() => haptic('light')}>+ Добавить</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {subs.map(s => {
            const remaining = s.total - s.used
            const pct = (s.used / s.total) * 100
            return (
              <div key={s.id} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--pink)' }}>{s.studio}</div>
                <div style={{ fontSize: 20, fontWeight: 900, margin: '6px 0 2px' }}>{remaining}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>из {s.total} занятий</div>
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 8 }}>
                  <div style={{ height: '100%', background: pct > 75 ? 'var(--pink)' : 'var(--green)', borderRadius: 2, width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--border)', cursor: 'pointer', minHeight: 80 }}
            onClick={() => haptic('light')}>
            <div style={{ textAlign: 'center', color: 'var(--pink)' }}>
              <i className="ti ti-plus" style={{ fontSize: 20 }} />
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Добавить</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
