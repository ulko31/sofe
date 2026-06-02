import { useTelegram } from '../hooks/useTelegram'

const tabs = [
  { id: 'home', icon: 'ti-home', label: 'Главная' },
  { id: 'workouts', icon: 'ti-barbell', label: 'Тренировки' },
  { id: 'nutrition', icon: 'ti-salad', label: 'Питание' },
  { id: 'map', icon: 'ti-map-pin', label: 'Карта' },
  { id: 'profile', icon: 'ti-user-circle', label: 'Профиль' }
]

export default function BottomNav({ active, onChange }) {
  const { haptic } = useTelegram()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#fff', borderTop: '0.5px solid #eee',
      display: 'flex',
      padding: '10px 0 max(14px, env(safe-area-inset-bottom))',
      zIndex: 100
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => { haptic('light'); onChange(t.id) }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.15s' }}>
          <i className={`ti ${t.icon}`} style={{ fontSize: 22, color: active === t.id ? 'var(--pink)' : '#bbb', transition: 'color 0.2s' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: active === t.id ? 'var(--pink)' : '#bbb', fontFamily: 'Nunito, sans-serif' }}>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
