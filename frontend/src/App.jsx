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
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [pendingFriendToken, setPendingFriendToken] = useState(null)

  // Load user
  useEffect(() => {
    if (!user) return
    let cancelled = false

    const loadUser = async () => {
      setLoading(true)
      setLoadError('')
      const delays = [0, 1500, 3500]

      for (const delay of delays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        try {
          const response = await getMe()
          if (cancelled) return
          setAppUser(response.data.user)
          setNeedsOnboarding(!response.data.user.onboarded)
          setLoading(false)
          return
        } catch (error) {
          const status = error.response?.status
          const retryable = !status || status === 429 || status >= 500
          if (!retryable) break
        }
      }

      if (!cancelled) {
        setLoadError('Не удалось загрузить профиль. Проверь интернет и попробуй ещё раз.')
        setLoading(false)
      }
    }

    loadUser()
    return () => { cancelled = true }
  }, [user, loadAttempt])

  useEffect(() => {
    if (user) return
    if (!window.Telegram?.WebApp?.initData) {
      setLoading(false)
      return
    }
    const timeout = setTimeout(() => setLoading(false), 12000)
    return () => clearTimeout(timeout)
  }, [user])

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

  if (!user) return (
    <div style={{ minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <h2>SOFE</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 340 }}>Не удалось получить данные Telegram. Откройте приложение через бота или перезапустите его в Telegram.</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>Попробовать снова</button>
    </div>
  )

  if (loadError) return (
    <div style={{ minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
      <div style={{ fontSize: 42 }}>📡</div>
      <h2 style={{ fontSize: 22 }}>Профиль временно не загрузился</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 360 }}>{loadError}</p>
      <button className="btn-primary" style={{ maxWidth: 360 }} onClick={() => setLoadAttempt(value => value + 1)}>
        Попробовать снова
      </button>
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
