require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const cron = require('node-cron')
const { query, queryOne, run, exec } = require('./db/turso')

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.vercel.app'
const GROQ_TOKEN = process.env.GROQ_TOKEN || process.env.HF_TOKEN
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

// ── Клавиатура ────────────────────────────────────────────
const mainKeyboard = {
  keyboard: [
    ['📊 Статистика дня', '🥗 Добавить еду'],
    ['💪 Тренировка', '📅 Мероприятия'],
    ['🏆 Достижения', '🌸 Открыть приложение']
  ],
  resize_keyboard: true,
  persistent: true
}

const openAppBtn = (url = MINI_APP_URL) => [[{ text: '🌸 Открыть SOFE', web_app: { url } }]]

// ── Helpers ───────────────────────────────────────────────
async function getUser(telegramId) {
  return queryOne('SELECT * FROM users WHERE telegram_id = ?', [String(telegramId)])
}

async function getTodayStats(userId) {
  const today = new Date().toISOString().split('T')[0]
  const meals = await query('SELECT * FROM meals WHERE user_id = ? AND date = ?', [userId, today])
  const trackers = await queryOne('SELECT * FROM trackers WHERE user_id = ? AND date = ?', [userId, today]) || {}
  return { consumed: meals.reduce((s, m) => s + (m.calories || 0), 0), meals, trackers }
}

async function getUpcomingEvents(days = 7) {
  try {
    // Get all events and filter in JS to handle different date formats
    const allEvents = await query('SELECT * FROM events ORDER BY date ASC LIMIT 50')
    const now = new Date()
    now.setHours(0,0,0,0)
    const filtered = (allEvents || []).filter(e => {
      if (!e.date) return false
      const d = new Date(e.date)
      return !isNaN(d) && d >= now
    })
    console.log(`Events: found ${allEvents?.length || 0} total, ${filtered.length} upcoming`)
    return filtered.slice(0, 10)
  }
  catch(e) { console.error('events error:', e.message); return [] }
}

async function askGroq(system, userMsg) {
  if (!GROQ_TOKEN) {
    console.error('❌ GROQ_TOKEN not set')
    return null
  }
  try {
    console.log('🔄 Groq request to:', GROQ_URL, 'model:', MODEL)
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }], max_tokens: 400, temperature: 0.7 })
    })
    console.log('📡 Groq status:', res.status)
    const data = await res.json()
    console.log('📦 Groq response:', JSON.stringify(data).substring(0, 200))
    if (!res.ok) return null
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch(e) {
    console.error('❌ Groq fetch error:', e.message)
    return null
  }
}

async function send(chatId, text, inlineKeyboard = null) {
  try {
    const opts = { parse_mode: 'Markdown' }
    if (inlineKeyboard) opts.reply_markup = { inline_keyboard: inlineKeyboard }
    await bot.sendMessage(chatId, text, opts)
  } catch(e) {
    if (e.message?.includes('parse')) {
      // Retry without markdown
      try { await bot.sendMessage(chatId, text.replace(/[*_`]/g, ''), { reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined }) }
      catch(e2) {}
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
    const inviter = await queryOne('SELECT * FROM users WHERE id = ?', [inviterIdInt])
    const inviterName = inviter?.name || 'пользователь SOFE'
    const recipient = await queryOne('SELECT * FROM users WHERE telegram_id = ?', [String(msg.from.id)])

    if (recipient) {
      const existing = await queryOne(
        'SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
        [inviterIdInt, recipient.id, recipient.id, inviterIdInt])
      if (!existing) {
        await run("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')", [inviterIdInt, recipient.id])
      } else if (existing.status !== 'accepted') {
        await run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [existing.id])
      }
      await bot.sendMessage(msg.chat.id,
        `🌸 *Привет, ${name}!*\n\n✅ Ты и *${inviterName}* теперь подруги в SOFE!\n\nОткрой приложение чтобы увидеть подругу на карте 💪`,
        { parse_mode: 'Markdown', reply_markup: { keyboard: mainKeyboard.keyboard, resize_keyboard: true, inline_keyboard: openAppBtn() } }
      )
    } else {
      await bot.sendMessage(msg.chat.id,
        `🌸 *Привет, ${name}!*\n\n*${inviterName}* приглашает тебя в SOFE!\n\nЗарегистрируйся и станете подругами автоматически 👯`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Открыть SOFE', web_app: { url: `${MINI_APP_URL}?invite=${token}` } }]] } }
      )
    }
  } catch(e) {
    console.error('Friend invite error:', e.message)
    await bot.sendMessage(msg.chat.id, `🌸 Привет, ${name}!`, { reply_markup: { inline_keyboard: openAppBtn() } })
  }
})

// ── /start ────────────────────────────────────────────────
bot.onText(/^\/start$/, async (msg) => {
  const name = msg.from.first_name || 'красотка'
  await bot.sendMessage(msg.chat.id,
    `✨ Привет, *${name}*! Я SOFE — твой ИИ-помощник для здоровья 🌸\n\nЧто умею:\n🥗 Считать калории — напиши что съела\n💪 Советовать тренировки\n📊 Показывать статистику дня\n📅 Рассказывать о мероприятиях\n🏆 Делиться достижениями\n\nПросто напиши мне что угодно! 👇`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard }
  )
})

// ── Статистика ────────────────────────────────────────────
bot.onText(/\/today|📊 Статистика дня/, async (msg) => {
  const user = await getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся в приложении!',
      { reply_markup: { inline_keyboard: openAppBtn() } })
  }
  const { consumed, trackers } = await getTodayStats(user.id)
  const goal = user.calories || 2000
  const remaining = Math.max(0, goal - consumed)
  const pct = Math.min(100, Math.round((consumed / goal) * 100))
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  await bot.sendMessage(msg.chat.id,
    `📊 *Твой день, ${user.name?.split(' ')[0] || 'красотка'}!*\n\n🔥 Калории: *${consumed}* / ${goal} ккал\n${bar} ${pct}%\n✅ Осталось: *${remaining} ккал*\n\n💧 Вода: *${(trackers.water || 0).toFixed ? Number(trackers.water||0).toFixed(1) : 0} л*\n🏃 Шаги: *${trackers.steps || 0}*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn(), keyboard: mainKeyboard.keyboard, resize_keyboard: true } }
  )
})

// ── Мероприятия ───────────────────────────────────────────
bot.onText(/\/events|📅 Мероприятия/, async (msg) => {
  const events = await getUpcomingEvents(14)
  if (!events.length) {
    return bot.sendMessage(msg.chat.id, '📭 Нет предстоящих мероприятий.',
      { reply_markup: { inline_keyboard: openAppBtn(`${MINI_APP_URL}?tab=calendar`) } })
  }
  const text = events.slice(0, 5).map(e => {
    const d = new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    return `${e.emoji} *${e.title}*\n📅 ${d}, ${e.time}\n📍 ${e.location}`
  }).join('\n\n')
  await bot.sendMessage(msg.chat.id, `📅 *Ближайшие мероприятия:*\n\n${text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn(`${MINI_APP_URL}?tab=calendar`) } })
})

// ── Достижения ────────────────────────────────────────────
bot.onText(/\/share|🏆 Достижения/, async (msg) => {
  const user = await getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся!',
      { reply_markup: { inline_keyboard: openAppBtn() } })
  }
  const { consumed, trackers } = await getTodayStats(user.id)
  const days = Math.max(1, Math.floor((Date.now() - new Date(user.created_at || Date.now())) / 86400000))
  const goalMap = { lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддержать форму', health: 'здоровье' }
  await bot.sendMessage(msg.chat.id,
    `🏆 *Достижения ${user.name?.split(' ')[0] || 'пользователя'} в SOFE*\n\n📅 В приложении: *${days} дней*\n🎯 Цель: *${goalMap[user.goal] || 'здоровье'}*\n🔥 Сегодня: *${consumed}* из ${user.calories || 2000} ккал\n💧 Вода: *${Number(trackers.water||0).toFixed(1)} л*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn() } })
})

// ── Добавить еду ──────────────────────────────────────────
bot.onText(/\/eat (.+)|🥗 Добавить еду/, async (msg, match) => {
  const user = await getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся!',
      { reply_markup: { inline_keyboard: openAppBtn() } })
  }
  const foodText = match?.[1]
  if (!foodText || foodText === '🥗 Добавить еду') {
    return bot.sendMessage(msg.chat.id,
      `🥗 *Быстрое добавление еды*\n\nНапиши что съела, например:\n• /eat куриная грудка 200г\n• /eat овсянка\n• /eat кофе с молоком\n\nИли используй приложение 👇`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn() } })
  }
  const system = `Ты помощник по калориям. Ответь ТОЛЬКО JSON без пояснений: {"name":"название","calories":число,"protein":г,"fat":г,"carbs":г}. Калории для указанной порции.`
  let name = foodText, calories = 200, protein = 0, fat = 0, carbs = 0
  const reply = await askGroq(system, foodText)
  if (reply) {
    try {
      const m = reply.match(/\{[^}]+\}/)
      if (m) { const p = JSON.parse(m[0]); name = p.name || foodText; calories = Math.round(p.calories)||200; protein = p.protein||0; fat = p.fat||0; carbs = p.carbs||0 }
    } catch(e) {}
  }
  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getHours()
  const type = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'dinner' : 'snack'
  await run('INSERT INTO meals (user_id, name, calories, protein, fat, carbs, type, date) VALUES (?,?,?,?,?,?,?,?)',
    [user.id, name, calories, protein, fat, carbs, type, today])
  const { consumed } = await getTodayStats(user.id)
  await bot.sendMessage(msg.chat.id,
    `✅ *${name}* — ${calories} ккал добавлено!\n\nСегодня всего: *${consumed} ккал*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn() } })
})

// ── Тренировка ────────────────────────────────────────────
bot.onText(/\/workout|💪 Тренировка/, async (msg) => {
  const user = await getUser(msg.from.id)
  const goal = { lose_weight: 'похудение', gain_muscle: 'набор мышц', maintain: 'поддержание', health: 'здоровье' }[user?.goal] || 'здоровье'
  const advice = await askGroq(
    `Ты тренер. Дай короткий конкретный совет по тренировке на сегодня (3-4 предложения на русском) для цели: ${goal}. Будь мотивирующей!`,
    'Совет на сегодня'
  )
  await bot.sendMessage(msg.chat.id,
    `💪 *Тренировка для тебя!*\n\n${advice || 'Сегодня отлично подойдёт 30 минут кардио + растяжка. Начни с разминки и не забудь про воду! 💧'}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppBtn(`${MINI_APP_URL}?tab=workouts`) } })
})

// ── Мотивация ─────────────────────────────────────────────
bot.onText(/\/motivate/, async (msg) => {
  const user = await getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'
  const texts = [
    `💪 *${name}*, ты уже делаешь всё правильно — просто продолжай! Каждый маленький шаг имеет значение.`,
    `🌟 Прогресс, а не совершенство! *${name}*, ты молодец что не сдаёшься.`,
    `🔥 Сильные женщины создают себя каждый день. Ты одна из них, *${name}*!`,
    `✨ Один хороший выбор сегодня — это уже победа, *${name}*!`
  ]
  await bot.sendMessage(msg.chat.id, texts[Math.floor(Math.random() * texts.length)],
    { parse_mode: 'Markdown' })
})

// ── Открыть приложение ────────────────────────────────────
bot.onText(/🌸 Открыть приложение/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🌸 Открываю SOFE!',
    { reply_markup: { inline_keyboard: openAppBtn() } })
})

// ── /help ─────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🆘 *Команды SOFE:*\n\n/today — статистика дня\n/eat [еда] — добавить еду\n/workout — совет по тренировке\n/events — мероприятия\n/share — достижения\n/motivate — мотивация\n\n💡 Или просто напиши мне что угодно — отвечу как ИИ-ассистент!`,
    { parse_mode: 'Markdown' })
})

// ── Свободный ИИ-чат ──────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text) return
  // Skip commands and keyboard buttons (handled by onText above)
  if (msg.text.startsWith('/')) return
  if (['📊 Статистика дня', '🥗 Добавить еду', '💪 Тренировка', '📅 Мероприятия', '🏆 Достижения', '🌸 Открыть приложение'].includes(msg.text)) return

  const user = await getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'
  const { consumed } = user ? await getTodayStats(user.id) : { consumed: 0 }
  const events = (await getUpcomingEvents(7)).slice(0, 3).map(e => `${e.emoji} ${e.title} (${e.date})`).join(', ')

  const system = `Ты SOFE — дружелюбный ИИ-ассистент по здоровью в Telegram. Пользователь: ${name}, цель: ${user?.goal || 'здоровье'}, норма: ${user?.calories || 2000} ккал, съела сегодня: ${consumed} ккал.${events ? ` Мероприятия: ${events}.` : ''} Отвечай коротко (2-4 предложения), по-дружески, на русском. 1-2 эмодзи.`

  try {
    await bot.sendChatAction(msg.chat.id, 'typing')
    if (!GROQ_TOKEN) {
      console.error('GROQ_TOKEN not set!')
      return bot.sendMessage(msg.chat.id, '⚙️ ИИ не настроен. Добавь GROQ_TOKEN в переменные окружения.')
    }
    const reply = await askGroq(system, msg.text)
    console.log('Groq reply:', reply ? 'OK' : 'NULL')
    await bot.sendMessage(msg.chat.id,
      reply || '🤔 Не удалось получить ответ. Попробуй ещё раз.',
      { reply_markup: { inline_keyboard: openAppBtn() } })
  } catch(e) { console.error('AI error:', e.message) }
})

// ── УВЕДОМЛЕНИЯ ───────────────────────────────────────────
async function getAllUsers() {
  return query("SELECT * FROM users WHERE onboarded = 1 AND notifications_enabled != 0")
}

// Очередь уведомлений (приглашения и т.д.)
cron.schedule('*/5 * * * *', async () => {
  try {
    await exec(`CREATE TABLE IF NOT EXISTS notifications_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, data TEXT, sent INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
    const pending = await query("SELECT * FROM notifications_queue WHERE sent = 0 LIMIT 10")
    for (const notif of pending) {
      try {
        const user = await queryOne('SELECT * FROM users WHERE id = ?', [notif.user_id])
        if (!user) continue
        const data = JSON.parse(notif.data || '{}')
        if (notif.type === 'event_invite') {
          const d = new Date(data.event_date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
          await send(user.telegram_id,
            `🎉 *${data.from_name}* приглашает тебя!\n\n📅 *${data.event_title}*\n🗓 ${d}, ${data.event_time}\n📍 ${data.event_location}`,
            openAppBtn(`${MINI_APP_URL}?tab=calendar`))
        }
        await run("UPDATE notifications_queue SET sent = 1 WHERE id = ?", [notif.id])
      } catch(e) {}
    }
  } catch(e) {}
})

// Утро 8:00
cron.schedule('0 8 * * *', async () => {
  const users = await getAllUsers()
  const tips = ['💧 Начни день со стакана воды!', '🧘 5 минут растяжки с утра!', '🥗 Хороший завтрак — залог дня!', '☀️ 10 минут на свежем воздухе!']
  for (const user of users) {
    if (!user.notify_morning) continue
    const name = user.name?.split(' ')[0] || 'красотка'
    await send(user.telegram_id,
      `🌸 *Доброе утро, ${name}!*\n\nТвоя цель: *${user.calories || 2000} ккал*\n\n${tips[Math.floor(Math.random() * tips.length)]}`,
      openAppBtn())
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Обед 12:00
cron.schedule('0 12 * * *', async () => {
  const users = await getAllUsers()
  for (const user of users) {
    if (!user.notify_meals) continue
    const { consumed } = await getTodayStats(user.id)
    const remaining = Math.max(0, (user.calories || 2000) - consumed)
    const name = user.name?.split(' ')[0] || 'красотка'
    await send(user.telegram_id,
      `☀️ *Время обеда, ${name}!*\n\nСъедено: *${consumed} ккал* · Осталось: *${remaining} ккал*`,
      openAppBtn())
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Вода 14:00 и 17:00
const waterRemind = async () => {
  const users = await getAllUsers()
  for (const user of users) {
    if (!user.notify_water) continue
    const { trackers } = await getTodayStats(user.id)
    if ((trackers.water || 0) < 1.5) {
      await send(user.telegram_id, `💧 Привет! Выпей стакан воды прямо сейчас 🌊`, openAppBtn())
      await new Promise(r => setTimeout(r, 100))
    }
  }
}
cron.schedule('0 14 * * *', waterRemind, { timezone: 'Europe/Moscow' })
cron.schedule('0 17 * * *', waterRemind, { timezone: 'Europe/Moscow' })

// Вечер 19:00
cron.schedule('0 19 * * *', async () => {
  const users = await getAllUsers()
  for (const user of users) {
    const { consumed, trackers } = await getTodayStats(user.id)
    const goal = user.calories || 2000
    const remaining = Math.max(0, goal - consumed)
    const name = user.name?.split(' ')[0] || 'красотка'
    const status = consumed === 0 ? '📝 Не забудь зафиксировать приёмы пищи!' : remaining > 0 ? `Осталось *${remaining} ккал*` : '🎯 Норма выполнена!'
    await send(user.telegram_id,
      `🌙 *Вечерний отчёт, ${name}!*\n\n🔥 Калории: *${consumed}* / ${goal}\n💧 Вода: *${Number(trackers.water||0).toFixed(1)} л*\n\n${status}`,
      openAppBtn())
    await new Promise(r => setTimeout(r, 100))
  }
}, { timezone: 'Europe/Moscow' })

// Напоминание о мероприятиях за 2 часа
cron.schedule('*/30 * * * *', async () => {
  const now = new Date()
  const events = await getUpcomingEvents(1)
  for (const event of events) {
    try {
      const eventTime = new Date(`${event.date}T${event.time || '00:00'}:00`)
      const diff = Math.round((eventTime - now) / 60000)
      if (diff >= 100 && diff <= 130) {
        const users = await getAllUsers()
        for (const user of users) {
          if (!user.notify_events) continue
          await send(user.telegram_id,
            `🔔 *Напоминание!*\n\nЧерез 2 часа: *${event.emoji} ${event.title}*\n📍 ${event.location}\n⏰ ${event.time}`,
            openAppBtn(`${MINI_APP_URL}?tab=calendar`))
          await new Promise(r => setTimeout(r, 100))
        }
      }
    } catch(e) {}
  }
})

bot.on('polling_error', err => {
  if (!err.message?.includes('ETELEGRAM: 409')) {
    console.error('Polling error:', err.message)
  }
})

console.log('🤖 SOFE Bot started')
console.log('🔑 GROQ_TOKEN:', GROQ_TOKEN ? 'SET (' + GROQ_TOKEN.substring(0, 8) + '...)' : 'NOT SET')
