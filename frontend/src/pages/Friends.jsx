import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const goalLabel = {
  lose_weight: '🏃 Похудеть',
  gain_muscle: '💪 Мышцы',
  maintain: '⚖️ Поддержать',
  health: '❤️ Здоровье'
}

export default function Friends({ user, onBack }) {
  const { haptic, tg } = useTelegram()
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteLink, setInviteLink] = useState(null)
  const [shareLocation, setShareLocation] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [events, setEvents] = useState([])

  useEffect(() => {
    loadData()
    loadEvents()
    checkInviteAction()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [fr, req] = await Promise.all([
        api.get('/friends'),
        api.get('/friends/requests')
      ])
      setFriends(fr.data)
      setRequests(req.data)
    } catch(e) {}
    finally { setLoading(false) }
  }

  const loadEvents = async () => {
    try {
      const r = await api.get('/events/all')
      const now = new Date()
      setEvents((r.data || []).filter(e => new Date(e.date) >= now).slice(0, 10))
    } catch(e) {}
  }

  // Check if opened via invite link (Telegram passes via start_param)
  const checkInviteAction = async () => {
    const tg = window.Telegram?.WebApp
    const startParam = tg?.initDataUnsafe?.start_param || ''
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    const urlAction = urlParams.get('action')

    console.log('SOFE Friends debug:', { startParam, urlToken, urlAction, initDataUnsafe: tg?.initDataUnsafe })

    let token = null
    if (startParam.startsWith('friend_')) {
      token = startParam.replace('friend_', '')
    } else if (urlAction === 'accept_friend' && urlToken) {
      token = urlToken
    }

    console.log('SOFE invite token:', token)

    if (!token) return

    try {
      const res = await api.post('/friends/accept-invite', { token })
      console.log('SOFE invite result:', res.data)
      if (res.data.success) {
        haptic('medium')
        alert(`✅ Вы теперь подруги с ${res.data.friend.name}! 🌸`)
        loadData()
      } else if (res.data.already_friends) {
        alert(`Вы уже подруги с ${res.data.friend?.name || 'этим пользователем'}!`)
      }
    } catch(e) {
      console.error('SOFE Invite error:', e.response?.data || e.message)
      alert('Ошибка: ' + (e.response?.data?.error || e.message))
    }
  }

  const handleGetInviteLink = async () => {
    haptic('light')
    try {
      const res = await api.post('/friends/invite')
      setInviteLink(res.data)
    } catch(e) {}
  }

  const handleShareInvite = () => {
    haptic('medium')
    if (inviteLink) {
      const text = `${inviteLink.text}\n\n${inviteLink.link}`
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink.link)}&text=${encodeURIComponent(inviteLink.text)}`)
      } else {
        navigator.clipboard?.writeText(text)
        alert('Ссылка скопирована!')
      }
    }
  }

  const handleAddByContact = () => {
    haptic('light')
    // Open Telegram contact picker
    if (window.Telegram?.WebApp?.requestContact) {
      window.Telegram.WebApp.requestContact?.()
    } else {
      alert('Открой SOFE в Telegram чтобы добавить из контактов')
    }
  }

  const handleAccept = async (friendshipId) => {
    haptic('medium')
    try {
      await api.put(`/friends/${friendshipId}/accept`)
      loadData()
    } catch(e) {}
  }

  const handleRemove = async (friendId) => {
    if (!confirm('Удалить из друзей?')) return
    haptic('light')
    try {
      await api.delete(`/friends/${friendId}`)
      loadData()
    } catch(e) {}
  }

  const handleInviteToEvent = async (friendId, event) => {
    haptic('medium')
    try {
      await api.post('/friends/invite-event', {
        friend_id: friendId,
        event_id: event.id,
        event_title: event.title,
        event_date: event.date,
        event_time: event.time,
        event_location: event.location
      })
      alert(`✅ Приглашение отправлено!`)
    } catch(e) {
      alert('Ошибка отправки')
    }
  }

  const handleUpdateLocation = async () => {
    haptic('light')
    navigator.geolocation?.getCurrentPosition(async (pos) => {
      try {
        await api.post('/friends/location', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          share: !shareLocation
        })
        setShareLocation(s => !s)
        haptic('medium')
      } catch(e) {}
    }, () => alert('Разреши доступ к геолокации в настройках'))
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return ''
    const diff = (Date.now() - new Date(dateStr)) / 60000
    if (diff < 60) return `${Math.round(diff)} мин назад`
    if (diff < 1440) return `${Math.round(diff/60)} ч назад`
    return `${Math.round(diff/1440)} дн назад`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ color: 'white', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 900, fontSize: 18 }}>Подруги</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{friends.length} друзей</div>
        </div>
        <button onClick={handleUpdateLocation}
          style={{ background: shareLocation ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, padding: '6px 12px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          {shareLocation ? '📍 Геолокация вкл' : '📍 Поделиться'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--white)', borderBottom: '0.5px solid var(--border)' }}>
        {[['friends', `Подруги (${friends.length})`], ['requests', `Запросы (${requests.length})`], ['add', 'Добавить']].map(([t, l]) => (
          <button key={t} onClick={() => { haptic('light'); setTab(t) }}
            style={{ flex: 1, padding: '12px 4px', fontSize: 12, fontWeight: 700, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--pink)' : '2px solid transparent', color: tab === t ? 'var(--pink)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: 100 }}>

        {/* Friends list */}
        {tab === 'friends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
            {!loading && friends.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>👯‍♀️</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Пока нет подруг</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Пригласи подруг и следите за прогрессом вместе!</div>
                <button className="btn-primary" onClick={() => setTab('add')}>Добавить подругу</button>
              </div>
            )}
            {friends.map(friend => (
              <div key={friend.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedFriend(selectedFriend?.id === friend.id ? null : friend)}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    🌸
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{friend.name || `@${friend.username}`}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {goalLabel[friend.goal] || '❤️ Здоровье'} · {friend.calories || 2000} ккал
                    </div>
                    {friend.share_location && friend.lat && parseFloat(friend.lat) !== 0 && (
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2, fontWeight: 600 }}>
                        📍 На карте · {timeAgo(friend.location_updated)}
                      </div>
                    )}
                  </div>
                  <i className={`ti ti-chevron-${selectedFriend?.id === friend.id ? 'up' : 'down'}`} style={{ color: '#ccc' }} />
                </div>

                {/* Expanded actions */}
                {selectedFriend?.id === friend.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Действия:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {friend.share_location && friend.lat && parseFloat(friend.lat) !== 0 && (
                        <button onClick={(e) => { e.stopPropagation(); haptic('light'); window.open(`https://yandex.ru/maps/?pt=${friend.lng},${friend.lat}&z=15`, '_blank') }}
                          style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--green-light)', border: 'none', color: 'var(--green-dark)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                          📍 На карте
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); haptic('light'); setTab('invite_event_' + friend.id) }}
                        style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--pink-light)', border: 'none', color: 'var(--pink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}
                        onClick={(e) => { e.stopPropagation(); haptic('light')
                          if (events.length === 0) { alert('Нет предстоящих мероприятий'); return }
                          const names = events.map((ev, i) => `${i+1}. ${ev.emoji} ${ev.title}`).join('\n')
                          const idx = prompt(`Выбери мероприятие (введи номер):\n${names}`)
                          const ev = events[parseInt(idx) - 1]
                          if (ev) handleInviteToEvent(friend.id, ev)
                        }}>
                        📅 Пригласить на событие
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleRemove(friend.id) }}
                        style={{ padding: '8px 14px', borderRadius: 10, background: '#FEE2E2', border: 'none', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Friend requests */}
        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div>Нет входящих запросов</div>
              </div>
            )}
            {requests.map(req => (
              <div key={req.id} className="card">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌸</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{req.name || `@${req.username}`}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>хочет добавить тебя в подруги</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={() => handleAccept(req.friendship_id)}>✅ Принять</button>
                  <button className="btn-outline" style={{ flex: 1, padding: '10px' }} onClick={() => handleRemove(req.id)}>Отклонить</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add friends */}
        {tab === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Invite link */}
            <div className="card">
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>📨 Пригласить по ссылке</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Отправь подруге ссылку — она откроет SOFE и вы станете друзьями автоматически
              </div>
              {!inviteLink ? (
                <button className="btn-primary" onClick={handleGetInviteLink}>Создать ссылку-приглашение</button>
              ) : (
                <div>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, wordBreak: 'break-all', color: 'var(--text-muted)' }}>
                    {inviteLink.link}
                  </div>
                  <button className="btn-primary" onClick={handleShareInvite}>
                    📤 Поделиться в Telegram
                  </button>
                </div>
              )}
            </div>

            {/* Add from contacts */}
            <div className="card">
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>👥 Из контактов Telegram</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Выбери контакт из Telegram — если она уже в SOFE, запрос отправится автоматически
              </div>
              <button className="btn-outline" onClick={handleAddByContact}>
                Открыть контакты
              </button>
            </div>

            {/* Location sharing */}
            <div className="card" style={{ background: shareLocation ? 'var(--green-light)' : 'var(--white)', border: shareLocation ? '1.5px solid var(--green)' : '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📍 Моя геолокация</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {shareLocation ? 'Подруги видят тебя на карте' : 'Подруги не видят тебя на карте'}
                  </div>
                </div>
                <div onClick={handleUpdateLocation}
                  style={{ width: 48, height: 26, borderRadius: 13, background: shareLocation ? 'var(--green)' : '#ddd', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: shareLocation ? 24 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
