import { useState, useEffect, useRef } from 'react'
import { useTelegram } from '../hooks/useTelegram'

const tabs = [
  { id: 'home', icon: 'ti-home', label: 'Главная' },
  { id: 'workouts', icon: 'ti-barbell', label: 'Тренировки' },
  { id: 'map', icon: 'ti-map-pin', label: 'Карта' },
  { id: 'calendar', icon: 'ti-calendar', label: 'События' },
  { id: 'profile', icon: 'ti-user-circle', label: 'Профиль' }
]

export default function BottomNav({ active, onChange }) {
  const { haptic } = useTelegram()
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)
  const hideTimer = useRef(null)

  useEffect(() => {
    const handleScroll = (e) => {
      const el = e.target
      if (!el || el === document) return
      const currentY = el.scrollTop
      const delta = currentY - lastScrollY.current

      if (delta > 10) {
        // Scrolling down — hide
        setVisible(false)
        clearTimeout(hideTimer.current)
      } else if (delta < -5) {
        // Scrolling up — show
        setVisible(true)
        clearTimeout(hideTimer.current)
      }

      // Auto-show when near bottom
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      if (nearBottom) setVisible(true)

      lastScrollY.current = currentY
    }

    // Listen on all scrollable elements
    const screens = document.querySelectorAll('.screen')
    screens.forEach(s => s.addEventListener('scroll', handleScroll, { passive: true }))

    return () => {
      screens.forEach(s => s.removeEventListener('scroll', handleScroll))
    }
  }, [active])

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderTop: '0.5px solid rgba(0,0,0,0.08)',
      display: 'flex',
      padding: '6px 0 max(10px, env(safe-area-inset-bottom))',
      zIndex: 100,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)'
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => { haptic('light'); onChange(t.id) }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            transition: 'transform 0.15s'
          }}
        >
          <div style={{
            width: active === t.id ? 40 : 28,
            height: 28,
            borderRadius: 14,
            background: active === t.id ? 'var(--pink-light)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}>
            <i className={`ti ${t.icon}`} style={{
              fontSize: 20,
              color: active === t.id ? 'var(--pink)' : '#aaa',
              transition: 'color 0.2s'
            }} />
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: active === t.id ? 800 : 600,
            color: active === t.id ? 'var(--pink)' : '#aaa',
            fontFamily: 'Nunito, sans-serif',
            transition: 'color 0.2s'
          }}>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
