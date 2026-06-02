import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const SETTINGS = [
  { key: 'notify_morning', icon: '🌅', label: 'Утреннее приветствие', desc: 'Каждый день в 8:00 — мотивация и план на день' },
  { key: 'notify_meals', icon: '🥗', label: 'Напоминания о питании', desc: 'В 12:00 и 19:00 — дневник и итоги дня' },
  { key: 'notify_water', icon: '💧', label: 'Напоминания о воде', desc: 'В 14:00 и 17:00 — если мало пьёшь' },
  { key: 'notify_events', icon: '📅', label: 'Мероприятия', desc: 'За 2 часа до каждого события' }
]

export default function Notifications({ user, onBack }) {
  const { haptic } = useTelegram()
  const [enabled, setEnabled] = useState(true)
  const [settings, setSettings] = useState({
    notify_morning: true,
    notify_meals: true,
    notify_water: true,
    notify_events: true
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user) {
      setEnabled(user.notifications_enabled !== 0)
      setSettings({
        notify_morning: user.notify_morning !== 0,
        notify_meals: user.notify_meals !== 0,
        notify_water: user.notify_water !== 0,
        notify_events: user.notify_events !== 0
      })
    }
  }, [user])

  const handleSave = async () => {
    haptic('medium')
    setSaving(true)
    try {
      await api.put('/user/notifications', {
        notifications_enabled: enabled,
        ...settings
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) {}
    finally { setSaving(false) }
  }

  const Toggle = ({ value, onChange }) => (
    <div onClick={() => { haptic('light'); onChange(!value) }}
      style={{ width: 44, height: 26, borderRadius: 13, background: value ? 'var(--pink)' : '#ddd', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ color: 'white', fontSize: 22 }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Уведомления</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Настрой напоминания</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Master toggle */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>🔔 Все уведомления</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Включить или выключить все</div>
          </div>
          <Toggle value={enabled} onChange={setEnabled} />
        </div>

        {/* Individual settings */}
        <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)', overflow: 'hidden', opacity: enabled ? 1 : 0.5 }}>
          {SETTINGS.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < SETTINGS.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 24, width: 36, textAlign: 'center' }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
              </div>
              <Toggle value={settings[s.key] && enabled} onChange={(v) => { if (enabled) setSettings(st => ({ ...st, [s.key]: v })) }} />
            </div>
          ))}
        </div>

        {/* Schedule info */}
        <div className="card" style={{ background: 'var(--pink-light)', border: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: 'var(--pink)' }}>📋 Расписание уведомлений</div>
          {[
            ['08:00', '🌅 Утреннее приветствие и совет дня'],
            ['12:00', '🥗 Напоминание о записи обеда'],
            ['14:00', '💧 Проверка воды'],
            ['17:00', '💧 Второе напоминание о воде'],
            ['19:00', '📊 Вечерний отчёт по калориям'],
            ['Пн 09:00', '🌟 Мотивация и план на неделю'],
            ['За 2ч', '📅 Напоминание о мероприятии']
          ].map(([time, text]) => (
            <div key={time} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink)', minWidth: 56, flexShrink: 0 }}>{time}</span>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{text}</span>
            </div>
          ))}
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохраняем...' : saved ? '✅ Сохранено!' : 'Сохранить настройки'}
        </button>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Уведомления приходят через Telegram-бота SOFE. Убедись что ты не заблокировала бота.
        </div>
      </div>
    </div>
  )
}
