require('dotenv').config()
const cron = require('node-cron')
const TelegramBot = require('node-telegram-bot-api')
const db = require('./db/init')

const bot = new TelegramBot(process.env.BOT_TOKEN)
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.netlify.app'

function getAllUsers() {
  return db.prepare('SELECT * FROM users WHERE onboarded = 1').all()
}

function getTodayStats(userId) {
  const today = new Date().toISOString().split('T')[0]
  const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(userId, today)
  const trackers = db.prepare('SELECT * FROM trackers WHERE user_id = ? AND date = ?').get(userId, today)
  const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
  return { consumed, trackers: trackers || { water: 0, steps: 0 } }
}

function getUpcomingEvents(hours = 24) {
  const now = new Date()
  const future = new Date(now.getTime() + hours * 60 * 60 * 1000)
  const today = now.toISOString().split('T')[0]
  const futureDate = future.toISOString().split('T')[0]
  return db.prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC').all(today, futureDate)
}

async function sendMessage(telegramId, text, keyboard = null) {
  try {
    const opts = { parse_mode: 'Markdown' }
    if (keyboard) opts.reply_markup = { inline_keyboard: keyboard }
    await bot.sendMessage(telegramId, text, opts)
  } catch(e) {
    // User blocked bot or other error — skip silently
    if (!e.message?.includes('blocked') && !e.message?.includes('not found')) {
      console.error(`Send error for ${telegramId}:`, e.message)
    }
  }
}

const openAppButton = [[{ text: '🌸 Открыть SOFE', web_app: { url: MINI_APP_URL } }]]

// ── 8:00 — Утреннее приветствие ───────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Morning notification')
  const users = getAllUsers()
  const greetings = ['Доброе утро', 'Привет', 'Солнышко, доброе утро']
  const tips = [
    '💧 Начни день со стакана воды — это запустит метаболизм!',
    '🧘 Попробуй 5 минут растяжки сразу после пробуждения.',
    '🥗 Хороший завтрак — залог продуктивного дня.',
    '☀️ Выйди на 10 минут на свежий воздух — это улучшит настроение.',
    '🏃 Даже 20-минутная прогулка сегодня — уже победа!'
  ]

  for (const user of users) {
    const greeting = greetings[Math.floor(Math.random() * greetings.length)]
    const tip = tips[Math.floor(Math.random() * tips.length)]
    const name = user.name?.split(' ')[0] || 'красотка'
    const goalCal = user.calories || 2000

    await sendMessage(user.telegram_id,
      `🌸 *${greeting}, ${name}!*\n\nТвоя цель на сегодня — *${goalCal} ккал*.\n\n${tip}\n\nЗафиксируй завтрак и начни день правильно! 💪`,
      openAppButton
    )
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// ── 12:00 — Напоминание об обеде ─────────────────────────
cron.schedule('0 12 * * *', async () => {
  console.log('⏰ Lunch notification')
  const users = getAllUsers()
  for (const user of users) {
    const { consumed, trackers } = getTodayStats(user.id)
    const goalCal = user.calories || 2000
    const remaining = goalCal - consumed
    const name = user.name?.split(' ')[0] || 'красотка'

    if (consumed < 300) {
      // Hasn't eaten yet
      await sendMessage(user.telegram_id,
        `☀️ *${name}, время обеда!*\n\nТы ещё ничего не записала сегодня — не забудь зафиксировать завтрак и обед 🥗\n\nОсталось: *${remaining} ккал*`,
        openAppButton
      )
    } else {
      await sendMessage(user.telegram_id,
        `☀️ *Время обеда, ${name}!*\n\nУже съедено: *${consumed} ккал*\nОсталось: *${remaining} ккал*\n\nОтличный повод добавить обед в дневник! 🥙`,
        openAppButton
      )
    }
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// ── 14:00 и 17:00 — Напоминание о воде ──────────────────
// ── Проверка очереди уведомлений из базы ────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS notifications_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, type TEXT, data TEXT,
      sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`)
    const pending = db.prepare("SELECT * FROM notifications_queue WHERE sent = 0 LIMIT 10").all()
    for (const notif of pending) {
      try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(notif.user_id)
        if (!user) continue
        const data = JSON.parse(notif.data || '{}')
        let text = ''
        if (notif.type === 'event_invite') {
          const d = new Date(data.event_date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
          text = `🎉 *${data.from_name}* приглашает тебя на мероприятие!

📅 *${data.event_title}*
🗓 ${d}, ${data.event_time}
📍 ${data.event_location}`
        }
        if (text) {
          await sendMessage(user.telegram_id, text, [[{ text: '📅 Открыть события', web_app: { url: MINI_APP_URL + '?tab=calendar' } }]])
        }
        db.prepare("UPDATE notifications_queue SET sent = 1 WHERE id = ?").run(notif.id)
      } catch(e) { console.error('Notif error:', e.message) }
    }
  } catch(e) {}
})

const waterReminder = async () => {
  console.log('⏰ Water notification')
  const users = getAllUsers()
  const messages = [
    '💧 Привет! Ты выпила воду за последние пару часов? Стакан воды прямо сейчас — и ты молодец! 🌊',
    '💧 Напоминаю про воду! Рекомендация — 8 стаканов в день. Как у тебя дела? 😊',
    '🚰 Время для стакана воды! Гидратация — залог хорошего самочувствия и красивой кожи ✨'
  ]

  for (const user of users) {
    const { trackers } = getTodayStats(user.id)
    const water = trackers?.water || 0

    if (water < 1.5) {
      const msg = messages[Math.floor(Math.random() * messages.length)]
      await sendMessage(user.telegram_id, msg, openAppButton)
      await new Promise(r => setTimeout(r, 100))
    }
  }
}

cron.schedule('0 14 * * *', waterReminder, { timezone: 'Europe/Moscow' })
cron.schedule('0 17 * * *', waterReminder, { timezone: 'Europe/Moscow' })

// ── 19:00 — Вечернее подведение итогов ──────────────────
cron.schedule('0 19 * * *', async () => {
  console.log('⏰ Evening notification')
  const users = getAllUsers()

  for (const user of users) {
    const { consumed, trackers } = getTodayStats(user.id)
    const goalCal = user.calories || 2000
    const remaining = goalCal - consumed
    const water = trackers?.water || 0
    const name = user.name?.split(' ')[0] || 'красотка'

    let status = ''
    let emoji = ''
    if (consumed === 0) {
      status = 'Ты ещё не добавила ни одного приёма пищи 😮 Не забудь зафиксировать!'
      emoji = '📝'
    } else if (remaining > 500) {
      status = `Осталось ещё *${remaining} ккал* — можно добавить лёгкий ужин!`
      emoji = '🌙'
    } else if (remaining > 0) {
      status = `Почти у цели! Осталось *${remaining} ккал* 🎯`
      emoji = '✨'
    } else {
      status = `Норма достигнута! Постарайся не превышать 🌟`
      emoji = '🏆'
    }

    const waterStatus = water >= 1.5 ? `💧 Вода: ${water.toFixed(1)}л ✅` : `💧 Вода: ${water.toFixed(1)}л — выпей ещё!`

    await sendMessage(user.telegram_id,
      `${emoji} *Вечерний отчёт, ${name}!*\n\n🔥 Калорий сегодня: *${consumed}* из ${goalCal}\n${waterStatus}\n\n${status}`,
      openAppButton
    )
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// ── За 2 часа до мероприятия ─────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  const events = getUpcomingEvents(2.5)
  if (events.length === 0) return

  const now = new Date()
  const users = getAllUsers()

  for (const event of events) {
    const eventDate = new Date(`${event.date}T${event.time}:00`)
    const diffMs = eventDate - now
    const diffMin = Math.round(diffMs / 60000)

    // Notify at ~120 minutes before
    if (diffMin >= 100 && diffMin <= 130) {
      console.log(`⏰ Event reminder: ${event.title}`)
      for (const user of users) {
        await sendMessage(user.telegram_id,
          `🔔 *Напоминание!*\n\nЧерез 2 часа: *${event.emoji} ${event.title}*\n📍 ${event.location}\n⏰ ${event.time}\n\n${event.description ? event.description.slice(0, 100) + '...' : ''}`,
          [[{ text: '📅 Открыть календарь', web_app: { url: MINI_APP_URL + '?tab=calendar' } }]]
        )
        await new Promise(r => setTimeout(r, 100))
      }
    }
  }
})

// ── Понедельник 9:00 — Мотивация на неделю ───────────────
cron.schedule('0 9 * * 1', async () => {
  console.log('⏰ Weekly motivation')
  const users = getAllUsers()
  const motivations = [
    '🌟 Новая неделя — новые возможности! Ты поставила цели на прошлой неделе. Эта неделя — твоя!',
    '💪 Понедельник — лучший день чтобы начать. Не "с понедельника", а прямо сейчас!',
    '✨ Ты уже делаешь всё правильно, просто продолжай. Каждый маленький шаг имеет значение!'
  ]

  for (const user of users) {
    const name = user.name?.split(' ')[0] || 'красотка'
    const msg = motivations[Math.floor(Math.random() * motivations.length)]

    // Check upcoming week events
    const events = db.prepare("SELECT * FROM events WHERE date BETWEEN date('now') AND date('now', '+7 days') ORDER BY date ASC LIMIT 3").all()
    let eventsText = ''
    if (events.length > 0) {
      eventsText = '\n\n📅 *На этой неделе:*\n' + events.map(e => `${e.emoji} ${e.title} — ${new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}`).join('\n')
    }

    await sendMessage(user.telegram_id,
      `🌸 *Привет, ${name}!*\n\n${msg}${eventsText}`,
      openAppButton
    )
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

console.log('🔔 Notification service started')
console.log('Schedule (Moscow time):')
console.log('  08:00 — Morning greeting')
console.log('  09:00 Mon — Weekly motivation')
console.log('  12:00 — Lunch reminder')
console.log('  14:00 — Water reminder')
console.log('  17:00 — Water reminder')
console.log('  19:00 — Evening summary')
console.log('  every 30min — Event reminders (2h before)')
