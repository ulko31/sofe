import { useState, useEffect } from 'react'
import { getWorkouts, getSubscriptions, addWorkout } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'

const filters = ['Все', 'FIT', 'Stretching', 'Fit ball', 'Йога', 'Пилатес']
const workoutEmoji = { FIT: '🏃‍♀️', Stretching: '🧘‍♀️', 'Fit ball': '⚽', Йога: '🪷', Пилатес: '🎯' }

function getGoogleDriveEmbedUrl(url) {
  if (!url) return null
  // Convert Google Drive share link to embed link
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
  // If already embed link
  if (url.includes('drive.google.com/file/d/')) return url.replace('/view', '/preview')
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  return url
}

export default function Workouts() {
  const { haptic } = useTelegram()
  const [filter, setFilter] = useState('Все')
  const [workouts, setWorkouts] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWorkout, setSelectedWorkout] = useState(null)
  const [showVideo, setShowVideo] = useState(false)

  useEffect(() => {
    Promise.all([getWorkouts(), getSubscriptions()])
      .then(([w, s]) => {
        setWorkouts(w.data)
        setSubs(s.data)
      })
      .catch(() => {
        setWorkouts([
          { id: 1, name: 'FIT-тренировка', type: 'FIT', duration: 45, level: 'Интенсивный', format: 'Онлайн', video_url: '', instructor: '' },
          { id: 2, name: 'Stretching', type: 'Stretching', duration: 30, level: 'Лёгкий', format: 'Онлайн', video_url: '', instructor: '' },
          { id: 3, name: 'Fit ball', type: 'Fit ball', duration: 40, level: 'Средний', format: 'Студия', video_url: '', instructor: '' }
        ])
        setSubs([
          { id: 1, studio: 'ELASTICA', total: 8, used: 5 },
          { id: 2, studio: 'ForMe', total: 16, used: 10 }
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'Все' ? workouts : workouts.filter(w => w.type === filter)

  const handleStart = (workout) => {
    haptic('medium')
    setSelectedWorkout(workout)
    if (workout.video_url) {
      setShowVideo(true)
    }
  }

  if (loading) return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div className="screen">
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Тренировки</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
        {filters.map(f => (
          <button key={f} onClick={() => { haptic('light'); setFilter(f) }}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s', border: filter === f ? 'none' : '1.5px solid var(--border)', background: filter === f ? 'var(--pink)' : 'var(--white)', color: filter === f ? 'white' : 'var(--text-muted)', fontFamily: 'Nunito, sans-serif' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Workout list */}
      <div>
        <div className="section-header"><h3>Библиотека тренировок</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(w => (
            <div key={w.id} className="card"
              style={{ display: 'flex', padding: 0, overflow: 'hidden', cursor: 'pointer', border: selectedWorkout?.id === w.id ? '2px solid var(--pink)' : '0.5px solid var(--border)' }}
              onClick={() => handleStart(w)}>
              {/* Thumbnail or emoji */}
              <div style={{ width: 90, flexShrink: 0, background: w.type === 'Stretching' || w.type === 'Йога' ? 'var(--green-light)' : 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {w.thumbnail_url ? (
                  <img src={w.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 32 }}>{workoutEmoji[w.type] || '💪'}</span>
                )}
                {w.video_url && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Нет тренировок в этой категории</div>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      <div>
        <div className="section-header"><h3>Абонементы в студии</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {subs.map(s => {
            const remaining = s.total - s.used
            return (
              <div key={s.id} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--pink)' }}>{s.studio}</div>
                <div style={{ fontSize: 20, fontWeight: 900, margin: '6px 0 2px' }}>{remaining}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>из {s.total} занятий</div>
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 8 }}>
                  <div style={{ height: '100%', background: 'var(--pink)', borderRadius: 2, width: `${(s.used / s.total) * 100}%` }} />
                </div>
              </div>
            )
          })}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--border)', cursor: 'pointer', minHeight: 80 }} onClick={() => haptic('light')}>
            <div style={{ textAlign: 'center', color: 'var(--pink)' }}>
              <i className="ti ti-plus" style={{ fontSize: 20 }} />
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Добавить</div>
            </div>
          </div>
        </div>
      </div>

      {/* Video modal */}
      {showVideo && selectedWorkout?.video_url && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>{selectedWorkout.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{selectedWorkout.duration} мин · {selectedWorkout.level}</div>
            </div>
            <button onClick={() => { setShowVideo(false); haptic('light') }}
              style={{ color: 'white', fontSize: 24, background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
              <i className="ti ti-x" />
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 0 32px' }}>
            <iframe
              src={getGoogleDriveEmbedUrl(selectedWorkout.video_url)}
              style={{ width: '100%', height: 'min(56vw, 400px)', border: 'none', borderRadius: 12 }}
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>

          <div style={{ padding: '0 20px 40px' }}>
            <button className="btn-primary" onClick={async () => {
              haptic('medium')
              try {
                await addWorkout({ workout_id: selectedWorkout.id, date: new Date().toISOString().split('T')[0] })
              } catch(e) {}
              setShowVideo(false)
            }}>
              ✅ Отметить как выполненную
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
