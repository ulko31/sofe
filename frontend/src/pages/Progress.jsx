import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

export default function Progress({ user, onBack }) {
  const { haptic } = useTelegram()
  const [period, setPeriod] = useState('week')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)

  useEffect(() => { loadData() }, [period])

  const loadData = async () => {
    setLoading(true)
    try {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 90
      const res = await api.get(`/nutrition/history?days=${days}`)
      const history = res.data || []
      setData(history)

      // Calculate summary
      const tracked = history.filter(d => d.consumed > 0)
      if (tracked.length > 0) {
        const avgCal = Math.round(tracked.reduce((s, d) => s + d.consumed, 0) / tracked.length)
        const maxCal = Math.max(...tracked.map(d => d.consumed))
        const minCal = Math.min(...tracked.map(d => d.consumed))
        const goal = user?.calories || 2000
        const onTrack = tracked.filter(d => d.consumed >= goal * 0.8 && d.consumed <= goal * 1.2).length
        setSummary({ avgCal, maxCal, minCal, onTrack, total: tracked.length, goal })
      } else {
        setSummary(null)
      }
    } catch(e) { setData([]) }
    finally { setLoading(false) }
  }

  const goal = user?.calories || 2000
  const maxVal = data.length ? Math.max(...data.map(d => d.consumed || 0), goal) : goal

  const formatDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    if (period === 'week') return date.toLocaleDateString('ru', { weekday: 'short', day: 'numeric' })
    if (period === 'month') return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
    return date.toLocaleDateString('ru', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>←</button>}
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Прогресс</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Статистика питания</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--white)', borderRadius: 12, padding: 4 }}>
          {[['week','7 дней'], ['month','30 дней'], ['quarter','90 дней']].map(([p, l]) => (
            <button key={p} onClick={() => { haptic('light'); setPeriod(p) }}
              style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: period === p ? 'var(--pink)' : 'transparent', color: period === p ? 'white' : 'var(--text-muted)', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 700 }}>Нет данных за этот период</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Начни записывать питание на главном экране</div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--pink)' }}>{summary.avgCal}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Среднее ккал/день</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>{summary.onTrack}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Дней в норме из {summary.total}</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#FF9800' }}>{summary.maxCal}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Макс. ккал</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#3498DB' }}>{summary.minCal}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Мин. ккал</div>
                </div>
              </div>
            )}

            {/* Bar chart */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
                Калории по дням
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>норма: {goal} ккал</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'week' ? 8 : period === 'month' ? 4 : 2, height: 120, overflowX: 'auto' }}>
                {data.map((d, i) => {
                  const h = maxVal > 0 ? Math.max(4, (d.consumed / maxVal) * 100) : 4
                  const goalH = maxVal > 0 ? (goal / maxVal) * 100 : 50
                  const color = d.consumed > goal * 1.2 ? '#FF5722' : d.consumed >= goal * 0.8 ? 'var(--green)' : d.consumed > 0 ? 'var(--pink)' : '#e0e0e0'
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, flex: period === 'week' ? 1 : 'none', width: period === 'week' ? 'auto' : period === 'month' ? 24 : 16 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{d.consumed > 0 ? d.consumed : ''}</div>
                      <div style={{ position: 'relative', width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ width: '100%', height: `${h}%`, background: color, borderRadius: '3px 3px 0 0', minHeight: 4 }} />
                        {/* Goal line indicator */}
                      </div>
                      {period === 'week' && <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatDate(d.date)}</div>}
                    </div>
                  )
                })}
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                {[['var(--green)', 'В норме'], ['var(--pink)', 'Мало'], ['#FF5722', 'Превышение'], ['#e0e0e0', 'Нет данных']].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weight tracking */}
            {user?.weight && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Вес</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--pink)' }}>{user.weight}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>кг · текущий вес<br/>Обнови в профиле если изменился</div>
                </div>
              </div>
            )}

            {/* Daily breakdown */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>По дням</div>
              {[...data].reverse().slice(0, 10).map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 13 }}>{formatDate(d.date)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: d.consumed > goal * 1.2 ? '#FF5722' : d.consumed >= goal * 0.8 ? 'var(--green)' : d.consumed > 0 ? 'var(--pink)' : 'var(--text-muted)' }}>
                      {d.consumed > 0 ? `${d.consumed} ккал` : '—'}
                    </div>
                    {d.consumed > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {d.consumed >= goal * 0.8 && d.consumed <= goal * 1.2 ? '✅' : d.consumed > goal * 1.2 ? '⬆️' : '⬇️'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
