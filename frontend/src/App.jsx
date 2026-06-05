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

export default function App() {
  const { user } = useTelegram()
  const [tab, setTab] = useState('home')
  const [prevTab, setPrevTab] = useState(null)

  const navigate = (newTab) => {
    setPrevTab(tab)
    setTab(newTab)
  }
  const [showAI, setShowAI] = useState(false)
  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [pendingFriendToken, setPendingFriendToken] = useState(null)

  // Load user
  useEffect(() => {
    if (!user) return
    getMe()
      .then(r => {
        setAppUser(r.data.user)
        setNeedsOnboarding(!r.data.user.onboarded)
        setLoading(false)
      })
      .catch(() => { setNeedsOnboarding(true); setLoading(false) })
  }, [user])

  useEffect(() => {
    if (!window.Telegram?.WebApp?.initData) setLoading(false)
  }, [])

  // Check friend invite on start
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    const startParam = tg?.initDataUnsafe?.start_param || ''
    const initData = tg?.initData || ''

    let token = null

    // Check start_param (via bot link)
    if (startParam.startsWith('friend_')) {
      token = startParam.replace('friend_', '')
    }
    // Check initData string fallback
    else if (initData.includes('start_param=friend_')) {
      const match = initData.match(/start_param=friend_([^&\s]+)/)
      if (match) token = decodeURIComponent(match[1])
    }
    // Check URL param ?invite= (for unregistered users)
    else {
      const urlParams = new URLSearchParams(window.location.search)
      const inviteToken = urlParams.get('invite')
      if (inviteToken) token = inviteToken
    }

    if (token) {
      console.log('Friend token:', token)
      setPendingFriendToken(token)
    }
  }, [])

  // Auto-accept friend invite when user is ready
  useEffect(() => {
    if (!pendingFriendToken || !appUser) return
    api.post('/friends/accept-invite', { token: pendingFriendToken })
      .then(res => {
        setPendingFriendToken(null)
        if (res.data.success) alert(`✅ Вы теперь подруги с ${res.data.friend.name}! 🌸`)
        else if (res.data.already_friends) alert('Вы уже подруги!')
      })
      .catch(() => setPendingFriendToken(null))
  }, [pendingFriendToken, appUser])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Загружаем SOFE...</p>
    </div>
  )

  if (needsOnboarding) return (
    <Onboarding onComplete={(u) => { setAppUser(u); setNeedsOnboarding(false) }} tgUser={user} />
  )

  if (showAI) return <AIAssistant user={appUser} onBack={() => setShowAI(false)} />

  const screens = { home: Home, workouts: Workouts, nutrition: Nutrition, map: MapScreen, calendar: Calendar, profile: Profile }
  const Screen = screens[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Screen user={appUser} tgUser={user} onTabChange={navigate} prevTab={prevTab} onBack={prevTab ? () => { setTab(prevTab); setPrevTab(null) } : null} onOpenAI={() => setShowAI(true)} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
