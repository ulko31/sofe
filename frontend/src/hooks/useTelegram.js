import { useEffect, useState } from 'react'

export function useTelegram() {
  const [tg] = useState(() => window.Telegram?.WebApp)
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!tg) return
    tg.ready()
    tg.expand()
    tg.setHeaderColor('#E8437A')
    tg.setBackgroundColor('#F7F5F0')

    const u = tg.initDataUnsafe?.user
    if (u) {
      setUser({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        username: u.username,
        photoUrl: u.photo_url
      })
    }
  }, [tg])

  const showAlert = (msg) => tg?.showAlert(msg)
  const showConfirm = (msg, cb) => tg?.showConfirm(msg, cb)
  const haptic = (type = 'light') => tg?.HapticFeedback?.impactOccurred(type)
  const close = () => tg?.close()

  return { tg, user, showAlert, showConfirm, haptic, close }
}
