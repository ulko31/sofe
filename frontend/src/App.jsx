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
  const [showAI, setShowAI] = useState(false)

  const [pendingFriendToken, setPendingFriendToken] = useState(null)

  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  // Проверяем приглашение при запуске
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    const startParam = tg?.initDataUnsafe?.start_param || ''

    console.log('App startParam:', startParam)

    if (startParam.startsWith('friend_')) {
      const token = startParam.replace('friend_', '')
      setPendingFriendToken(token)
    }
  }, [])

  // Загружаем пользователя
  useEffect(() => {
    if (!user) return

    getMe()
      .then((r) => {
        setAppUser(r.data.user)
        setNeedsOnboarding(!r.data.user.onboarded)
        setLoading(false)
      })
      .catch((err) => {
        console.error('getMe error:', err)
        setNeedsOnboarding(true)
        setLoading(false)
      })
  }, [user])

  // Если Telegram не передал initData
  useEffect(() => {
    if (!window.Telegram?.WebApp?.initData) {
      setLoading(false)
    }
  }, [])

  // Автоматически принимаем приглашение после загрузки пользователя
  useEffect(() => {
    if (!pendingFriendToken || !appUser) return

    const doAccept = async () => {
      try {
        console.log('Accepting invite:', pendingFriendToken)

        const res = await api.post('/friends/accept-invite', {
          token: pendingFriendToken
        })

        console.log('Invite response:', res.data)

        setPendingFriendToken(null)

        if (res.data.success) {
          alert(
            `✅ Вы теперь подруги с ${
              res.data.friend?.name || 'новой подругой'
            }! 🌸`
          )
        } else if (res.data.already_friends) {
          alert(
            `Вы уже подруги с ${
              res.data.friend?.name || 'пользователем'
            }!`
          )
        }
      } catch (e) {
        console.error(
          'Auto-accept error:',
          e.response?.data || e.message
        )

        setPendingFriendToken(null)
      }
    }

    doAccept()
  }, [pendingFriendToken, appUser])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh'
        }}
      >
        <div className="spinner" />
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14
          }}
        >
          Загружаем SOFE...
        </p>
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <Onboarding
        onComplete={(u) => {
          setAppUser(u)
          setNeedsOnboarding(false)
        }}
        tgUser={user}
      />
    )
  }

  const screens = {
    home: Home,
    workouts: Workouts,
    nutrition: Nutrition,
    map: MapScreen,
    calendar: Calendar,
    profile: Profile
  }

  const Screen = screens[tab]

  if (showAI) {
    return (
      <AIAssistant
        user={appUser}
        onBack={() => setShowAI(false)}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}
    >
      <Screen
        user={appUser}
        tgUser={user}
        onTabChange={setTab}
        onOpenAI={() => setShowAI(true)}
      />

      <BottomNav
        active={tab}
        onChange={setTab}
      />
    </div>
  )
}
