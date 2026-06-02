import { useState, useEffect } from 'react'
import { useTelegram } from './hooks/useTelegram'
import { getMe } from './utils/api'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Workouts from './pages/Workouts'
import Nutrition from './pages/Nutrition'
import Profile from './pages/Profile'
import MapScreen from './pages/MapScreen'
import Calendar from './pages/Calendar'
import Onboarding from './pages/Onboarding'

export default function App() {
  const { user } = useTelegram()
  const [tab, setTab] = useState('home')
  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (!user) return
    getMe()
      .then(r => { setAppUser(r.data.user); setNeedsOnboarding(!r.data.user.onboarded); setLoading(false) })
      .catch(() => { setNeedsOnboarding(true); setLoading(false) })
  }, [user])

  useEffect(() => {
    if (!window.Telegram?.WebApp?.initData) setLoading(false)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Загружаем SOFE...</p>
    </div>
  )

  if (needsOnboarding) return <Onboarding onComplete={(u) => { setAppUser(u); setNeedsOnboarding(false) }} tgUser={user} />

  const screens = { home: Home, workouts: Workouts, nutrition: Nutrition, map: MapScreen, calendar: Calendar, profile: Profile }
  const Screen = screens[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Screen user={appUser} tgUser={user} onTabChange={setTab} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
