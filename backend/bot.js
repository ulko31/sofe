require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const cron = require('node-cron')

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.vercel.app'
const GROQ_TOKEN = process.env.GROQ_TOKEN || process.env.HF_TOKEN
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

let db
function getDb() {
  if (!db) db = require('./db/init')
  return db
}

const openAppBtn = [[{ text: '🌸 Открыть SOFE', web_app: { url: MINI_APP_URL } }]]

function getUser(telegramId) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId))
}

function getTodayStats(userId) {
  const today = new Date().toISOString().split('T')[0]
  const meals = getDb().prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(userId, today)
  const trackers = getDb().prepare('SELECT * FROM trackers WHERE user_id = ? AND date = ?').get(userId, today) || {}
  return { consumed: meals.reduce((s, m) => s + (m.calories || 0), 0), meals, trackers }
}

function getUpcomingEvents(days = 7) {
  const today = new Date().toISOString().split('T')[0]
  const future = new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
  try { return getDb().prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC').all(today, future) }
  catch(e) { return [] }
}

async function askGroq(system, user) {
  if (!GROQ_TOKEN) return null
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 400, temperature: 0.7 })
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch(e) { return null }
}

async function send(chatId, text, keyboard = null) {
  try {
    const opts = { parse_mode: 'Markdown' }
    if (keyboard) opts.reply_markup = { inline_keyboard: keyboard }
    await bot.sendMessage(chatId, text, opts)
  } catch(e) {
    if (!e.message?.includes('blocked') && !e.message?.includes('not found')) {
      console.error('Send error:', e.message)
    }
  }
}

// ── /start friend_TOKEN ───────────────────────────────────
bot.onText(/\/start friend_(.+)/, async (msg, match) => {
  const token = match[1]
  const name = msg.from.first_name || 'красотка'
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const [inviterId] = decoded.split(':')
    const inviterIdInt = parseInt(inviterId)
    const db = getDb()
    const inviter = db.prepare('SELECT * FROM users WHERE id = ?').get(inviterIdInt)
    const inviterName = inviter?.name || 'пользователь SOFE'
    const recipient = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(msg.from.id))

    if (recipient) {
      const existing = db.prepare('SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').get(inviterIdInt, recipient.id, recipient.id, inviterIdInt)
      if (!existing) {
        db.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')").run(inviterIdInt, recipient.id)
      } else if (existing.status !== 'accepted') {
        db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id)
      }
      await send(msg.chat.id,
        `🌸 *Привет, ${name}!*\n\n✅ Ты и *${inviterName}* теперь подруги в SOFE!\n\nОткрой приложение чтобы увидеть подругу на карте 💪`,
        openAppBtn
      )
    } else {
      await send(msg.chat.id,
        `🌸 *Привет, ${name}!*\n\n*${inviterName}* приглашает тебя в SOFE!\n\nЗарегистрируйся и вы автоматически станете подругами 👯`,
        [[{ text: '✅ Зарегистрироваться в SOFE', web_app: { url: `${MINI_APP_URL}?invite=${token}` } }]]
      )
    }
  } catch(e) {
    console.error('Friend invite error:', e.message)
    await send(msg.chat.id, `🌸 Привет, ${name}! Открой SOFE!`, openAppBtn)
  }
})

// ── /start ────────────────────────────────────────────────
bot.onText(/^\/start$/, async (msg) => {
  const name = msg.from.first_name || 'красотка'
  await bot.sendMessage(msg.chat.id,
    `✨ Привет, *${name}*\\! Я SOFE — твой ИИ\\-помощник для здоровья\\.\n\nЧто умею:\n🥗 Считать калории\n💪 Советовать тренировки\n📊 Статистика дня\n📅 Мероприятия\n\nПросто напиши мне что угодно 👇`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        keyboard: [
          ['📊 Статистика дня', '🥗 Добавить еду'],
          ['💪 Тренировка', '📅 Мероприятия'],
          ['🏆 Достижения', '🌸 Открыть приложение']
        ],
        resize_keyboard: true
      }
    }
  )
})

// ── /today ────────────────────────────────────────────────
bot.onText(/\/today|📊 Статистика дня/, async (msg) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) return send(msg.chat.id, '👋 Сначала зарегистрируйся в приложении!', openAppBtn)
  const { consumed, trackers } = getTodayStats(user.id)
  const goal = user.calories || 2000
  const remaining = Math.max(0, goal - consumed)
  const pct = Math.min(100, Math.round((consumed / goal) * 100))
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  await send(msg.chat.id,
    `📊 *Твой день, ${user.name?.split(' ')[0] || 'красотка'}\\!*\n\n🔥 Калории: *${consumed}* / ${goal}\n${bar} ${pct}%\n✅ Осталось: *${remaining}*\n\n💧 Вода: *${(trackers.water || 0).toFixed(1)} л*\n🏃 Шаги: *${trackers.steps || 0}*`,
    openAppBtn
  )
})

// ── /events ───────────────────────────────────────────────
bot.onText(/\/events|📅 Мероприятия/, async (msg) => {
  const events = getUpcomingEvents(14)
  if (!events.length) return send(msg.chat.id, '📭 Нет предстоящих мероприятий.', openAppBtn)
  const text = events.slice(0, 5).map(e => {
    const d = new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    return `${e.emoji} *${e.title}*\n📅 ${d}, ${e.time}\n📍 ${e.location}`
  }).join('\n\n')
  await send(msg.chat.id, `📅 *Ближайшие мероприятия:*\n\n${text}`, openAppBtn)
})

// ── /share ────────────────────────────────────────────────
bot.onText(/\/share|🏆 Достижения/, async (msg) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) return send(msg.chat.id, '👋 Сначала зарегистрируйся!', openAppBtn)
  const { consumed, trackers } = getTodayStats(user.id)
  const days = Math.max(1, Math.floor((Date.now() - new Date(user.created_at || Date.now())) / 86400000))
  const goalMap = { lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддержать форму', health: 'здоровье' }
  await send(msg.chat.id,
    `🏆 *Достижения ${user.name?.split(' ')[0] || 'пользователя'} в SOFE*\n\n📅 В приложении: *${days} дней*\n🎯 Цель: *${goalMap[user.goal] || 'здоровье'}*\n🔥 Сегодня: *${consumed}* из ${user.calories || 2000} ккал\n💧 Вода: *${(trackers.water || 0).toFixed(1)} л*`,
    openAppBtn
  )
})

// ── /eat ─────────────────────────────────────────────────
bot.onText(/\/eat (.+)/, async (msg, match) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) return send(msg.chat.id, '👋 Сначала зарегистрируйся!', openAppBtn)
  const foodText = match[1]
  const system = `Ты помощник по калориям. Ответь ТОЛЬКО JSON: {"name":"название","calories":число,"protein":г,"fat":г,"carbs":г}. Калории для порции которую описал пользователь.`
  let calories = 200, name = foodText, protein = 0, fat = 0, carbs = 0
  const reply = await askGroq(system, foodText)
  if (reply) {
    try {
      const m = reply.match(/\{[^}]+\}/)
      if (m) { const p = JSON.parse(m[0]); name = p.name || foodText; calories = Math.round(p.calories) || 200; protein = p.protein || 0; fat = p.fat || 0; carbs = p.carbs || 0 }
    } catch(e) {}
  }
  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getHours()
  const type = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'dinner' : 'snack'
  getDb().prepare('INSERT INTO meals (user_id, name, calories, protein, fat, carbs, type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(user.id, name, calories, protein, fat, carbs, type, today)
  const { consumed } = getTodayStats(user.id)
  await send(msg.chat.id, `✅ *${name}* — ${calories} ккал добавлено\\!\n\nСегодня всего: *${consumed}* ккал`, openAppBtn)
})

// ── /workout ──────────────────────────────────────────────
bot.onText(/\/workout|💪 Тренировка/, async (msg) => {
  const user = getUser(msg.from.id)
  const goal = { lose_weight: 'похудение', gain_muscle: 'набор мышц', maintain: 'поддержание', health: 'здоровье' }[user?.goal] || 'здоровье'
  const advice = await askGroq(`Ты тренер. Дай короткий совет по тренировке на сегодня (3-4 предложения на русском) для цели: ${goal}.`, 'Совет на сегодня')
  await send(msg.chat.id, `💪 *Тренировка для тебя\\!*\n\n${advice || 'Сегодня отлично подойдёт 30 минут кардио + растяжка!'}`, openAppBtn)
})

// ── /motivate ─────────────────────────────────────────────
bot.onText(/\/motivate/, async (msg) => {
  const name = getUser(msg.from.id)?.name?.split(' ')[0] || msg.from.first_name || 'красотка'
  const texts = [
    `💪 *${name}*, ты уже делаешь всё правильно — просто продолжай\\!`,
    `🌟 Прогресс, а не совершенство\\! *${name}*, ты молодец что не сдаёшься\\.`,
    `🔥 Сильные женщины создают себя каждый день\\. Ты одна из них, *${name}*\\!`
  ]
  await send(msg.chat.id, texts[Math.floor(Math.random() * texts.length)])
})

// ── /help ─────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  await send(msg.chat.id,
    `🆘 *Команды SOFE:*\n\n/today — статистика дня\n/eat \\[еда\\] — добавить еду\n/workout — совет по тренировке\n/events — мероприятия\n/share — достижения\n/motivate — мотивация\n\n💡 *Или просто напиши* — отвечу как ИИ\\-ассистент\\!`
  )
})

// ── Кнопка открыть приложение ─────────────────────────────
bot.onText(/🌸 Открыть приложение/, async (msg) => {
  await send(msg.chat.id, '🌸', openAppBtn)
})

// ── Свободный ИИ-чат ──────────────────────────────────────
const SKIP = ['/start', '/today', '/events', '/share', '/eat', '/workout', '/motivate', '/help', '🌸', '📊', '🥗', '💪', '📅', '🏆']
bot.on('message', async (msg) => {
  if (!msg.text) return
  if (SKIP.some(s => msg.text.startsWith(s))) return

  const user = getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'
  const { consumed } = user ? getTodayStats(user.id) : { consumed: 0 }
  const events = getUpcomingEvents(7).slice(0, 3).map(e => `${e.emoji} ${e.title} (${e.date})`).join(', ')

  const system = `Ты SOFE — дружелюбный ИИ-ассистент по здоровью в Telegram. Пользователь: ${name}, цель: ${user?.goal || 'здоровье'}, норма: ${user?.calories || 2000} ккал, съела сегодня: ${consumed} ккал.${events ? ` Мероприятия: ${events}.` : ''} Отвечай коротко (2-4 предложения), по-дружески, на русском.`

  try {
    await bot.sendChatAction(msg.chat.id, 'typing')
    const reply = await askGroq(system, msg.text)
    await send(msg.chat.id, reply || '🌸 Открой приложение SOFE для полного функционала!', openAppBtn)
  } catch(e) { console.error('AI error:', e.message) }
})

// ── УВЕДОМЛЕНИЯ (cron) ────────────────────────────────────
function getAllUsers() {
  return getDb().prepare('SELECT * FROM users WHERE onboarded = 1').all()
}

// Очередь уведомлений (приглашения на мероприятия)
cron.schedule('*/5 * * * *', async () => {
  try {
    getDb().exec(`CREATE TABLE IF NOT EXISTS notifications_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, data TEXT, sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
    const pending = getDb().prepare("SELECT * FROM notifications_queue WHERE sent = 0 LIMIT 10").all()
    for (const notif of pending) {
      try {
        const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(notif.user_id)
        if (!user) continue
        const data = JSON.parse(notif.data || '{}')
        if (notif.type === 'event_invite') {
          const d = new Date(data.event_date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
          await send(user.telegram_id, `🎉 *${data.from_name}* приглашает тебя!\n\n📅 *${data.event_title}*\n🗓 ${d}, ${data.event_time}\n📍 ${data.event_location}`, openAppBtn)
        }
        getDb().prepare("UPDATE notifications_queue SET sent = 1 WHERE id = ?").run(notif.id)
      } catch(e) {}
    }
  } catch(e) {}
})

// Утро 8:00
cron.schedule('0 8 * * *', async () => {
  const users = getAllUsers()
  const tips = ['💧 Начни день со стакана воды!', '🧘 5 минут растяжки с утра творят чудеса!', '🥗 Хороший завтрак — залог продуктивного дня!', '☀️ 10 минут на свежем воздухе улучшат настроение!']
  for (const user of users) {
    const name = user.name?.split(' ')[0] || 'красотка'
    await send(user.telegram_id, `🌸 *Доброе утро, ${name}\\!*\n\nТвоя цель: *${user.calories || 2000} ккал*\n\n${tips[Math.floor(Math.random() * tips.length)]}`, openAppBtn)
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Обед 12:00
cron.schedule('0 12 * * *', async () => {
  for (const user of getAllUsers()) {
    const { consumed } = getTodayStats(user.id)
    const remaining = Math.max(0, (user.calories || 2000) - consumed)
    const name = user.name?.split(' ')[0] || 'красотка'
    await send(user.telegram_id, `☀️ *Время обеда, ${name}\\!*\n\nСъедено: *${consumed} ккал* · Осталось: *${remaining} ккал*`, openAppBtn)
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Вода 14:00 и 17:00
const waterRemind = async () => {
  for (const user of getAllUsers()) {
    const { trackers } = getTodayStats(user.id)
    if ((trackers.water || 0) < 1.5) {
      await send(user.telegram_id, `💧 Привет! Ты выпила воду за последние часы? Стакан воды прямо сейчас — и ты молодец! 🌊`, openAppBtn)
      await new Promise(r => setTimeout(r, 100))
    }
  }
}
cron.schedule('0 14 * * *', waterRemind, { timezone: 'Europe/Moscow' })
cron.schedule('0 17 * * *', waterRemind, { timezone: 'Europe/Moscow' })

// Вечер 19:00
cron.schedule('0 19 * * *', async () => {
  for (const user of getAllUsers()) {
    const { consumed, trackers } = getTodayStats(user.id)
    const goal = user.calories || 2000
    const remaining = Math.max(0, goal - consumed)
    const name = user.name?.split(' ')[0] || 'красотка'
    const status = consumed === 0 ? '📝 Не забудь зафиксировать приёмы пищи\\!' : remaining > 0 ? `Осталось *${remaining} ккал*` : '🎯 Норма выполнена\\!'
    await send(user.telegram_id, `🌙 *Вечерний отчёт, ${name}\\!*\n\n🔥 Калории: *${consumed}* / ${goal}\n💧 Вода: *${(trackers.water || 0).toFixed(1)} л*\n\n${status}`, openAppBtn)
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Напоминание о мероприятиях за 2 часа
cron.schedule('*/30 * * * *', async () => {
  const now = new Date()
  const events = getUpcomingEvents(1)
  for (const event of events) {
    const eventTime = new Date(`${event.date}T${event.time || '00:00'}:00`)
    const diff = Math.round((eventTime - now) / 60000)
    if (diff >= 100 && diff <= 130) {
      for (const user of getAllUsers()) {
        await send(user.telegram_id, `🔔 *Напоминание\\!*\n\nЧерез 2 часа: *${event.emoji} ${event.title}*\n📍 ${event.location}\n⏰ ${event.time}`, openAppBtn)
        await new Promise(r => setTimeout(r, 100))
      }
    }
  }
})

// Понедельник 9:00 — мотивация
cron.schedule('0 9 * * 1', async () => {
  const events = getUpcomingEvents(7).slice(0, 3)
  const eventsText = events.length ? '\n\n📅 *На этой неделе:*\n' + events.map(e => `${e.emoji} ${e.title} — ${new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}`).join('\n') : ''
  for (const user of getAllUsers()) {
    const name = user.name?.split(' ')[0] || 'красотка'
    await send(user.telegram_id, `🌸 *Новая неделя, ${name}\\!*\n\nПонедельник — лучший день начать\\.${eventsText}`, openAppBtn)
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

bot.on('polling_error', err => console.error('Polling error:', err.message))
console.log('🤖 SOFE Bot started with AI + notifications')
