import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const filters = ['Все', 'FIT', 'Stretching', 'Fit ball', 'Йога', 'Пилатес']
const workoutEmoji = { FIT: '🏃‍♀️', Stretching: '🧘‍♀️', 'Fit ball': '⚽', Йога: '🪷', Пилатес: '🎯' }

function extractDriveId(url) {
  if (!url) return null
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  const m2 = url.match(/id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  return null
}

function getDriveThumbnail(url) {
  if (!url) return null
  const id = extractDriveId(url)
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w400`
  return url
}

function getVideoEmbedUrl(url) {
  if (!url) return null
  const id = extractDriveId(url)
  if (id) return `https://drive.google.com/file/d/${id}/preview`
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`
  return url
}

export default function Workouts({ user, onTabChange, onBack }) {
  const { haptic } = useTelegram()
  const [filter, setFilter] = useState('Все')
  const [workouts, setWorkouts] = useState([])
  const [gyms, setGyms] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWorkout, setSelectedWorkout] = useState(null)
  const [showVideo, setShowVideo] = useState(false)
  const [showAddGym, setShowAddGym] = useState(false)
  const [newGymName, setNewGymName] = useState('')
  const [newGymSessions, setNewGymSessions] = useState('8')
  const [editingGym, setEditingGym] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/workouts').catch(() => ({ data: [] })),
      api.get('/workouts/gyms').catch(() => ({ data: [] }))
    ]).then(([w, g]) => {
      setWorkouts(Array.isArray(w.data) ? w.data : [])
      setGyms(Array.isArray(g.data) ? g.data : [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'Все' ? workouts : workouts.filter(w => w.type === filter)

  const [showGymSelect, setShowGymSelect] = useState(false)
  const [pendingWorkout, setPendingWorkout] = useState(null)

  const handleStart = (workout) => {
    haptic('medium')
    setSelectedWorkout(workout)
    if (workout.video_url) {
      setShowVideo(true)
    } else {
      // Ask to log workout
      setPendingWorkout(workout)
      setShowGymSelect(true)
    }
  }

  const handleLogAndClose = async (gymId = null) => {
    haptic('medium')
    setShowGymSelect(false)
    try {
      await api.post('/workouts/log', {
        workout_id: pendingWorkout?.id,
        gym_id: gymId,
        date: new Date().toISOString().split('T')[0]
      })
      if (gymId) {
        setGyms(g => g.map(x => x.id === gymId
          ? { ...x, used_sessions: (x.used_sessions || 0) + 1 }
          : x))
      }
      haptic('medium')
    } catch(e) { console.error(e) }
    setPendingWorkout(null)
  }

  const handleAddGym = async () => {
    if (!newGymName.trim()) return
    haptic('medium')
    try {
      const res = await api.post('/workouts/gyms', { name: newGymName, total_sessions: parseInt(newGymSessions) || 8 })
      setGyms(g => [...g, res.data])
      setNewGymName('')
      setNewGymSessions('8')
      setShowAddGym(false)
    } catch(e) {}
  }

  const handleEditGym = async (gym, newTotal) => {
    const total = parseInt(newTotal)
    if (isNaN(total) || total < 1) return
    try {
      const res = await api.put(`/workouts/gyms/${gym.id}`, { total_sessions: total })
      setGyms(g => g.map(x => x.id === gym.id ? { ...x, total_sessions: total } : x))
      setEditingGym(null)
    } catch(e) {}
  }

  const handleMarkVisit = async (gym) => {
    haptic('light')
    if ((gym.used_sessions || 0) >= gym.total_sessions) {
      alert('Все занятия использованы!')
      return
    }
    try {
      const res = await api.put(`/workouts/gyms/${gym.id}`, { used_sessions: (gym.used_sessions || 0) + 1 })
      setGyms(g => g.map(x => x.id === gym.id ? res.data : x))
    } catch(e) {}
  }

  const handleDeleteGym = async (gymId) => {
    if (!confirm('Удалить зал?')) return
    try {
      await api.delete(`/workouts/gyms/${gymId}`)
      setGyms(g => g.filter(x => x.id !== gymId))
    } catch(e) {}
  }

  if (loading) return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text)', padding: 0 }}>←</button>
        )}
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Тренировки</h2>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
        {filters.map(f => (
          <button key={f} onClick={() => { haptic('light'); setFilter(f) }}
            style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', border: 'none', background: filter === f ? 'var(--pink)' : 'var(--white)', color: filter === f ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Workout list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💪</div>
            Тренировки появятся после добавления в Панели администратора
          </div>
        )}
        {filtered.map(w => (
          <div key={w.id} className="card" style={{ display: 'flex', gap: 0, overflow: 'hidden', cursor: 'pointer', padding: 0 }}
            onClick={() => handleStart(w)}>
            <div style={{ width: 90, minHeight: 90, flexShrink: 0, background: w.type === 'Stretching' || w.type === 'Йога' ? 'var(--green-light)' : 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              {w.thumbnail_url ? (
                <img src={getDriveThumbnail(w.thumbnail_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <span style={{ fontSize: 32 }}>{workoutEmoji[w.type] || '💪'}</span>
              )}
              {w.video_url && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-player-play-filled" style={{ fontSize: 14, color: 'var(--pink)', marginLeft: 2 }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: 14, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{w.name}</div>
              {w.instructor && <div style={{ fontSize: 11, color: 'var(--pink)', fontWeight: 600, marginTop: 2 }}>👩‍🏫 {w.instructor}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{w.duration} мин · {w.format}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span className="badge badge-pink">{w.level}</span>
                {w.video_url && <span className="badge badge-green">▶ Видео</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Gyms section */}
      <div className="section-header">
        <h3>Мои залы и студии</h3>
        <a onClick={() => setShowAddGym(true)} style={{ cursor: 'pointer' }}>+ Добавить</a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gyms.length === 0 && !showAddGym && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13, background: 'var(--white)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)' }}>
            Добавь свой зал или студию чтобы отслеживать абонемент
          </div>
        )}

        {gyms.map(g => (
          <div key={g.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--pink)' }}>{g.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.used_sessions || 0}/{g.total_sessions} занятий</div>
                <button onClick={() => handleDeleteGym(g.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ background: 'var(--pink)', height: '100%', borderRadius: 8, width: `${Math.min(100, ((g.used_sessions||0)/g.total_sessions)*100)}%`, transition: 'width 0.3s' }} />
            </div>
            <button onClick={() => handleMarkVisit(g)}
              style={{ width: '100%', padding: 8, borderRadius: 10, background: (g.used_sessions||0) >= g.total_sessions ? '#eee' : 'var(--pink-light)', border: 'none', color: (g.used_sessions||0) >= g.total_sessions ? '#999' : 'var(--pink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 13 }}>
              ✅ Отметить занятие
            </button>
          </div>
        ))}

        {showAddGym && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Новый зал / студия</div>
            <input placeholder="Название (ELASTICA, FitnessPark...)" value={newGymName}
              onChange={e => setNewGymName(e.target.value)} style={{ marginBottom: 10 }} autoFocus />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Занятий в абонементе:</span>
              <input type="number" value={newGymSessions} onChange={e => setNewGymSessions(e.target.value)} style={{ width: 70 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleAddGym}>Добавить</button>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowAddGym(false)}>Отмена</button>
            </div>
          </div>
        )}
      </div>

      {/* Gym select modal */}
      {showGymSelect && pendingWorkout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>✅ Отметить тренировку</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{pendingWorkout.name}</div>
            {gyms.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Списать занятие с абонемента:</div>
                {gyms.map(g => (
                  <div key={g.id} onClick={() => handleLogAndClose(g.id)}
                    style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg)', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Осталось: {g.total_sessions - (g.used_sessions || 0)} из {g.total_sessions}</div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ color: 'var(--pink)' }} />
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
              </>
            )}
            <button className="btn-outline" style={{ width: '100%', marginBottom: 8 }} onClick={() => handleLogAndClose(null)}>
              Отметить без абонемента
            </button>
            <button onClick={() => { setShowGymSelect(false); setPendingWorkout(null) }}
              style={{ width: '100%', padding: 12, borderRadius: 12, background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'Nunito, sans-serif', fontSize: 14, cursor: 'pointer' }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Video player modal */}
      {showVideo && selectedWorkout?.video_url && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '48px 16px 12px' }}>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>{selectedWorkout.name}</div>
            <button onClick={() => setShowVideo(false)} style={{ color: 'white', fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '0 16px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setShowVideo(false)}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', padding: '8px' }}>
              ←
            </button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setShowVideo(false); setPendingWorkout(selectedWorkout); setShowGymSelect(true) }}>
              ✅ Отметить как выполненную
            </button>
          </div>
          <div style={{ flex: 1, padding: '0 0 32px' }}>
            <iframe
              src={getVideoEmbedUrl(selectedWorkout.video_url)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
