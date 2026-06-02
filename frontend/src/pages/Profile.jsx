import { useState, useEffect } from 'react'
import { getProgress, updateProfile } from '../utils/api'
import { useTelegram } from '../hooks/useTelegram'
import AIAssistant from './AIAssistant'
import Notifications from './Notifications'

export default function Profile({ user, tgUser }) {
  const { haptic } = useTelegram()
  const [progress, setProgress] = useState({ days: 0, weightLost: 0, goalPct: 0 })
  const [editing, setEditing] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [form, setForm] = useState({ name: '', calories: '', goal: '' })

  useEffect(() => {
    getProgress().then(r => setProgress(r.data)).catch(() => {})
    if (user) setForm({ name: user.name || '', calories: user.calories || 2000, goal: user.goal || 'health' })
  }, [user])

  const handleSave = async () => {
    haptic('medium')
    try { await updateProfile(form); setEditing(false) } catch (e) {}
  }

  const goalLabel = {
    lose_weight: '🏃‍♀️ Похудеть',
    gain_muscle: '💪 Набрать мышцы',
    maintain: '⚖️ Поддерживать',
    health: '❤️ Здоровье'
  }

  if (showAI) return <AIAssistant user={user} onBack={() => setShowAI(false)} />
  if (showNotifications) return <Notifications user={user} onBack={() => setShowNotifications(false)} />

  const menuItems = [
    { icon: 'ti-user', color: 'pink', label: 'Личные данные', action: () => { haptic('light'); setEditing(true) } },
    { icon: 'ti-target', color: 'green', label: 'Цели и параметры', action: () => { haptic('light'); setEditing(true) } },
    { icon: 'ti-robot', color: 'green', label: 'ИИ-ассистент SOFE', action: () => { haptic('light'); setShowAI(true) }, badge: '✨' },
    { icon: 'ti-stethoscope', color: 'pink', label: 'Консультации', badge: 'Скоро', action: () => haptic('light') },
    { icon: 'ti-bell', color: 'orange', label: 'Уведомления', action: () => { haptic('light'); setShowNotifications(true) } },
    { icon: 'ti-calendar', color: 'green', label: 'Календарь', action: () => haptic('light') },
    { icon: 'ti-map-pin', color: 'pink', label: 'Студии рядом', action: () => haptic('light') },
    { icon: 'ti-help-circle', color: 'orange', label: 'Поддержка', action: () => haptic('light') }
  ]

  return (
    <div className="screen">
      <div style={{ background: 'var(--pink)', borderRadius: 'var(--radius)', padding: 20, color: 'white', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '3px solid rgba(255,255,255,0.4)' }}>
          {tgUser?.photoUrl ? <img src={tgUser.photoUrl} style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : '🌸'}
        </div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{user?.name || tgUser?.firstName || 'Пользователь'}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>{goalLabel[user?.goal] || '❤️ Здоровье'} · {form.calories} ккал/день</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 14 }}>
          {[['дней', progress.days || 0], ['кг', progress.weightLost || 0], ['%', progress.goalPct || 0]].map(([u, v]) => (
            <div key={u} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{u}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        {menuItems.map((item, i) => (
          <div key={i} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < menuItems.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}>
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
        SOFE v1.0 · <span style={{ color: 'var(--pink)', fontWeight: 700 }}>Написать в поддержку</span>
      </div>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Личные данные</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" placeholder="Имя" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input type="number" placeholder="Норма калорий" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} />
              <select value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}>
                <option value="lose_weight">🏃‍♀️ Похудеть</option>
                <option value="gain_muscle">💪 Набрать мышцы</option>
                <option value="maintain">⚖️ Поддерживать</option>
                <option value="health">❤️ Здоровье</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn-outline" onClick={() => setEditing(false)}>Отмена</button>
              <button className="btn-primary" onClick={handleSave}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
