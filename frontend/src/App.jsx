import { useState, useEffect } from 'react'
import { useTelegram } from './hooks/useTelegram'
import api, { getMe } from './utils/api'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Workouts from './pages/Workouts'
import Nutrition from './pages/Nutrition'
import Profile from './pages/Profile'
import MapScreen from './pages/MapScreen'
import Calendar from './pages/Calendar'
import Onboarding from './pages/Onboarding'
import AIAssistant from './pages/AIAssistant'
import api from './utils/api'

export default function App() {
  const { user } = useTelegram()
  const [tab, setTab] = useState('home')
  const [showAI, setShowAI] = useState(false)
  const [pendingFriendToken, setPendingFriendToken] = useState(null)

  // Auto-accept friend invite when user loads
  useEffect(() => {
    if (!pendingFriendToken || !appUser) return
    api.post('/friends/accept-invite', { token: pendingFriendToken })
      .then(res => {
        setPendingFriendToken(null)
        if (res.data.success) alert(`✅ Вы теперь подруги с ${res.data.friend.name}! 🌸`)
        else if (res.data.already_friends) alert('Вы уже подруги!')
      })
      .catch(e => { console.error('Accept error:', e); setPendingFriendToken(null) })
  }, [pendingFriendToken, appUser])

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    const startParam = tg?.initDataUnsafe?.start_param || ''
    console.log('App startParam:', startParam)

    if (startParam.startsWith('friend_')) {
      const token = startParam.replace('friend_', '')
      setPendingFriendToken(token)
      // Auto-accept invite when user is loaded
    }
  }, [])

  // Auto-accept friend invite when user is ready
  useEffect(() => {
    if (!pendingFriendToken || !appUser) return
    const doAccept = async () => {
      try {
        const res = await api.post('/friends/accept-invite', { token: pendingFriendToken })
        setPendingFriendToken(null)
        if (res.data.success) {
          alert(`✅ Вы теперь подруги с ${res.data.friend.name}! 🌸`)
        } else if (res.data.already_friends) {
          alert(`Вы уже подруги с ${res.data.friend?.name || 'пользователем'}!`)
        }
      } catch(e) {
        console.error('Auto-accept error:', e.message)
        setPendingFriendToken(null)
      }
    }
    doAccept()
  }, [pendingFriendToken, appUser])
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

  if (showAI) {
    return <AIAssistant user={appUser} onBack={() => setShowAI(false)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Screen user={appUser} tgUser={user} onTabChange={setTab} onOpenAI={() => setShowAI(true)} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
