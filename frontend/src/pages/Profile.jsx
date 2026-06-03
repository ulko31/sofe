import { useState, useEffect } from 'react'
import { getProgress, updateProfile } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'
import Notifications from './Notifications'
import Friends from './Friends'

export default function Profile({ user, tgUser, onTabChange, onOpenAI }) {
  const { haptic } = useTelegram()
  const [progress, setProgress] = useState({ days: 0, weightLost: 0, goalPct: 0 })
  const [editing, setEditing] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [form, setForm] = useState({ name: '', calories: 2000, goal: 'health', activity: 'medium' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProgress().then(r => setProgress(r.data)).catch(() => {})
    if (user) {
      setForm({
        name: user.name || '',
        calories: user.calories || 2000,
        goal: user.goal || 'health',
        activity: user.activity || 'medium'
      })
    }
  }, [user])

  const handleSave = async () => {
    haptic('medium')
    setSaving(true)
    try {
      await updateProfile(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(false)
    } catch(e) {}
    finally { setSaving(false) }
  }

  const goalLabel = {
    lose_weight: '🏃‍♀️ Похудеть',
    gain_muscle: '💪 Набрать мышцы',
    maintain: '⚖️ Поддерживать',
    health: '❤️ Здоровье'
  }

  const activityLabel = {
    low: '🛋 Низкий',
    medium: '🚶 Средний',
    high: '🏋️ Высокий',
    very_high: '🔥 Очень высокий'
  }

  if (showNotifications) return <Notifications user={user} onBack={() => setShowNotifications(false)} />
  if (showFriends) return <Friends user={user} onBack={() => setShowFriends(false)} />

  const menuItems = [
    { icon: 'ti-user', color: 'pink', label: 'Личные данные и цели', action: () => { haptic('light'); setEditing(true) } },
    { icon: 'ti-salad', color: 'green', label: 'Питание и рецепты', action: () => { haptic('light'); onTabChange?.('nutrition') } },
    { icon: 'ti-robot', color: 'green', label: 'ИИ-ассистент SOFE', action: () => { haptic('light'); onOpenAI?.() }, badge: '✨' },
    { icon: 'ti-stethoscope', color: 'pink', label: 'Консультации', badge: 'Скоро', action: () => haptic('light') },
    { icon: 'ti-bell', color: 'orange', label: 'Уведомления', action: () => { haptic('light'); setShowNotifications(true) } },
    { icon: 'ti-calendar', color: 'green', label: 'Календарь событий', action: () => { haptic('light'); onTabChange?.('calendar') } },
    { icon: 'ti-users', color: 'pink', label: 'Подруги', action: () => { haptic('light'); setShowFriends(true) }, badge: '👯' },
    { icon: 'ti-map-pin', color: 'pink', label: 'Карта студий и кафе', action: () => { haptic('light'); onTabChange?.('map') } },
    { icon: 'ti-help-circle', color: 'orange', label: 'Поддержка', action: () => haptic('light') }
  ]

  return (
    <div className="screen">
      {/* Profile header */}
      <div style={{ background: 'var(--pink)', borderRadius: 'var(--radius)', padding: 20, color: 'white', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '3px solid rgba(255,255,255,0.4)', overflow: 'hidden' }}>
          {tgUser?.photoUrl ? <img src={tgUser.photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '🌸'}
        </div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{user?.name || tgUser?.firstName || 'Пользователь'}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
          {goalLabel[user?.goal] || '❤️ Здоровье'} · {user?.calories || 2000} ккал/день
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
          {activityLabel[user?.activity] || '🚶 Средний'} уровень активности
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 14 }}>
          {[['дней', progress.days || 0], ['кг', progress.weightLost || 0], ['%', progress.goalPct || 0]].map(([u, v]) => (
            <div key={u} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{u}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu */}
      <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        {menuItems.map((item, i) => (
          <div key={i} onClick={item.action}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < menuItems.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: item.color === 'pink' ? 'var(--pink-light)' : item.color === 'green' ? 'var(--green-light)' : '#FFF3E0' }}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: item.color === 'pink' ? 'var(--pink)' : item.color === 'green' ? 'var(--green)' : '#E65100' }} />
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{item.label}</div>
            {item.badge && <span className="badge badge-pink" style={{ fontSize: 10 }}>{item.badge}</span>}
            <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 18 }} />
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        SOFE v1.0 · <span style={{ color: 'var(--pink)', fontWeight: 700 }}>Поддержка</span>
      </div>

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900 }}>Личные данные</h3>
              <button onClick={() => setEditing(false)} style={{ color: 'var(--text-muted)', fontSize: 22 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Имя</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Твоё имя" />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Норма калорий в день</label>
                <input type="number" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: parseInt(e.target.value) || 2000 }))} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Цель</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['lose_weight','🏃‍♀️ Похудеть'], ['gain_muscle','💪 Набрать мышцы'], ['maintain','⚖️ Поддерживать'], ['health','❤️ Здоровье']].map(([v, l]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, goal: v }))}
                      style={{ padding: '10px 14px', borderRadius: 10, textAlign: 'left', border: form.goal === v ? '2px solid var(--pink)' : '1.5px solid var(--border)', background: form.goal === v ? 'var(--pink-light)' : 'var(--white)', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 700 }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Уровень активности</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['low','🛋 Низкий','Сижу большую часть дня'], ['medium','🚶 Средний','1-3 тренировки в неделю'], ['high','🏋️ Высокий','4-5 тренировок в неделю'], ['very_high','🔥 Очень высокий','Каждый день']].map(([v, l, d]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, activity: v }))}
                      style={{ padding: '10px 14px', borderRadius: 10, textAlign: 'left', border: form.activity === v ? '2px solid var(--pink)' : '1.5px solid var(--border)', background: form.activity === v ? 'var(--pink-light)' : 'var(--white)', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{d}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn-outline" onClick={() => setEditing(false)} style={{ flex: 1 }}>Отмена</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Сохраняем...' : saved ? '✅ Сохранено!' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
