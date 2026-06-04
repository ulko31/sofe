require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.vercel.app'
const GROQ_TOKEN = process.env.HF_TOKEN || process.env.GROQ_TOKEN
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

// Lazy load db to avoid circular issues
let db
function getDb() {
  if (!db) db = require('./db/init')
  return db
}

const openAppButton = (url = MINI_APP_URL) => [[{
  text: '🌸 Открыть SOFE',
  web_app: { url }
}]]

// ── Helper: get user by telegram_id ───────────────────────
function getUser(telegramId) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId))
}

// ── Helper: today stats ───────────────────────────────────
function getTodayStats(userId) {
  const today = new Date().toISOString().split('T')[0]
  const meals = getDb().prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(userId, today)
  const trackers = getDb().prepare('SELECT * FROM trackers WHERE user_id = ? AND date = ?').get(userId, today) || {}
  const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
  return { consumed, meals, trackers, today }
}

// ── Helper: upcoming events ───────────────────────────────
function getUpcomingEvents(days = 7) {
  const today = new Date().toISOString().split('T')[0]
  const future = new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
  try {
    return getDb().prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC').all(today, future)
  } catch(e) { return [] }
}

// ── Helper: ask Groq ──────────────────────────────────────
async function askGroq(systemPrompt, userMessage) {
  if (!GROQ_TOKEN) return null
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 400,
        temperature: 0.7
      })
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch(e) {
    return null
  }
}

// ── /start ────────────────────────────────────────────────
bot.onText(/\/start friend_(.+)/, async (msg, match) => {
  const token = match[1]
  const name = msg.from.first_name || 'красотка'

  // Auto-accept friendship via API
  try {
    // Find who sent the invite
    const decoded = Buffer.from(token, 'base64url').toString()
    const [inviterId] = decoded.split(':')
    const db = require('./db/init')
    const inviter = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(inviterId))
    const inviterName = inviter?.name || 'пользователь SOFE'

    // Find or create recipient user
    let recipient = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(msg.from.id))

    if (recipient) {
      // Auto-accept friendship
      const existing = db.prepare(`
        SELECT * FROM friendships
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `).get(parseInt(inviterId), recipient.id, recipient.id, parseInt(inviterId))

      if (!existing) {
        db.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'accepted')")
          .run(parseInt(inviterId), recipient.id)
      } else if (existing.status !== 'accepted') {
        db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id)
      }

      await bot.sendMessage(msg.chat.id,
        `🌸 *Привет, ${name}!*

✅ Ты и *${inviterName}* теперь подруги в SOFE!

Открой приложение чтобы увидеть подругу на карте и пригласить на тренировку 💪`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{
            text: '🌸 Открыть SOFE',
            web_app: { url: MINI_APP_URL }
          }]] }
        }
      )
    } else {
      // User not registered yet - send them to register first
      await bot.sendMessage(msg.chat.id,
        `🌸 *Привет, ${name}!*

*${inviterName}* приглашает тебя в SOFE!

Зарегистрируйся в приложении, и вы автоматически станете подругами 👯`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{
            text: '✅ Открыть SOFE и принять',
            web_app: { url: `${MINI_APP_URL}?invite=${token}` }
          }]] }
        }
      )
    }
  } catch(e) {
    console.error('Friend invite error:', e.message)
    await bot.sendMessage(msg.chat.id,
      `🌸 Привет, ${name}! Открой SOFE чтобы принять приглашение в друзья!`,
      { reply_markup: { inline_keyboard: [[{ text: '🌸 Открыть SOFE', web_app: { url: MINI_APP_URL } }]] } }
    )
  }
})

bot.onText(/^\/start$/, async (msg) => {
  const name = msg.from.first_name || 'красотка'
  await bot.sendMessage(msg.chat.id,
    `✨ Привет, *${name}*! Я SOFE — твой персональный ИИ-помощник для здоровья.\n\n` +
    `Что я умею:\n` +
    `🥗 Считать калории — напиши что съела\n` +
    `💪 Советовать тренировки\n` +
    `📊 Показывать статистику дня\n` +
    `🎯 Мотивировать и поддерживать\n` +
    `📅 Напоминать о мероприятиях\n\n` +
    `Просто напиши мне что угодно или используй команды 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['📊 Статистика дня', '🥗 Добавить еду'],
          ['💪 Тренировка', '📅 Мероприятия'],
          ['🏆 Мои достижения', '🌸 Открыть приложение']
        ],
        resize_keyboard: true
      }
    }
  )
})

// ── /today — day stats ────────────────────────────────────
bot.onText(/\/today|📊 Статистика дня/, async (msg) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся в приложении!',
      { reply_markup: { inline_keyboard: openAppButton() } })
  }

  const { consumed, trackers } = getTodayStats(user.id)
  const goal = user.calories || 2000
  const remaining = Math.max(0, goal - consumed)
  const pct = Math.round((consumed / goal) * 100)
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))

  await bot.sendMessage(msg.chat.id,
    `📊 *Твой день, ${user.name?.split(' ')[0] || 'красотка'}!*\n\n` +
    `🔥 Калории: *${consumed}* / ${goal} ккал\n` +
    `${bar} ${pct}%\n` +
    `✅ Осталось: *${remaining} ккал*\n\n` +
    `💧 Вода: *${(trackers.water || 0).toFixed(1)} л*\n` +
    `🏃 Шаги: *${(trackers.steps || 0).toLocaleString('ru')}*\n` +
    `😴 Сон: *${trackers.sleep || 0} ч*\n\n` +
    `${remaining > 500 ? '🍽 Можно ещё поесть!' : remaining > 0 ? '👍 Почти норма!' : '🎯 Норма выполнена!'}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton() } }
  )
})

// ── /events — upcoming events ─────────────────────────────
bot.onText(/\/events|📅 Мероприятия/, async (msg) => {
  const events = getUpcomingEvents(14)
  if (events.length === 0) {
    return bot.sendMessage(msg.chat.id, '📭 Нет предстоящих мероприятий.',
      { reply_markup: { inline_keyboard: openAppButton() } })
  }

  const text = events.slice(0, 5).map(e => {
    const d = new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    return `${e.emoji} *${e.title}*\n📅 ${d}, ${e.time}\n📍 ${e.location}`
  }).join('\n\n')

  await bot.sendMessage(msg.chat.id,
    `📅 *Ближайшие мероприятия:*\n\n${text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton(`${MINI_APP_URL}?tab=calendar`) } }
  )
})

// ── /motivate ─────────────────────────────────────────────
bot.onText(/\/motivate|🎯/, async (msg) => {
  const user = getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'

  const motivations = [
    `💪 *${name}*, ты уже делаешь всё правильно — просто продолжай! Каждый маленький шаг имеет значение.`,
    `🌟 Помни: прогресс, а не совершенство! *${name}*, ты молодец что не сдаёшься.`,
    `🔥 *${name}*, сильные женщины не рождаются — они создают себя каждый день. Ты одна из них!`,
    `✨ Один хороший выбор сегодня — это уже победа, *${name}*! Стакан воды, прогулка, здоровый обед — всё считается.`,
    `🌸 *${name}*, твоё тело делает всё возможное для тебя каждый день. Ответь ему заботой!`
  ]

  const text = motivations[Math.floor(Math.random() * motivations.length)]
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
})

// ── /achieve — share achievement ──────────────────────────
bot.onText(/\/share|\/achieve|🏆 Мои достижения/, async (msg) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся!',
      { reply_markup: { inline_keyboard: openAppButton() } })
  }

  const { consumed, trackers } = getTodayStats(user.id)
  const createdAt = new Date(user.created_at || Date.now())
  const days = Math.max(1, Math.floor((Date.now() - createdAt) / 86400000))
  const name = user.name?.split(' ')[0] || 'пользователь'
  const goal = user.calories || 2000
  const goalMap = { lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддержать форму', health: 'здоровье' }

  const card =
    `🏆 *Достижения ${name} в SOFE*\n\n` +
    `📅 В приложении уже *${days} дней*\n` +
    `🎯 Цель: *${goalMap[user.goal] || 'здоровье'}*\n` +
    `🔥 Сегодня: *${consumed}* из ${goal} ккал\n` +
    `💧 Вода сегодня: *${(trackers.water || 0).toFixed(1)} л*\n\n` +
    `_Присоединяйся к SOFE: ${MINI_APP_URL}_`

  await bot.sendMessage(msg.chat.id, card, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📤 Поделиться', switch_inline_query: card.replace(/\*/g, '').replace(/_/g, '') }],
        [{ text: '🌸 Открыть SOFE', web_app: { url: MINI_APP_URL } }]
      ]
    }
  })
})

// ── /eat — quick food log ─────────────────────────────────
bot.onText(/\/eat (.+)|🥗 Добавить еду/, async (msg, match) => {
  const user = getUser(msg.from.id)
  if (!user?.onboarded) {
    return bot.sendMessage(msg.chat.id, '👋 Сначала зарегистрируйся!',
      { reply_markup: { inline_keyboard: openAppButton() } })
  }

  const foodText = match?.[1]
  if (!foodText || foodText === '🥗 Добавить еду') {
    return bot.sendMessage(msg.chat.id,
      `🥗 *Быстрое добавление еды*\n\nНапиши что съела, например:\n• \`/eat куриная грудка 200г\`\n• \`/eat овсянка\`\n• \`/eat кофе с молоком\`\n\nИли используй приложение для точного подсчёта 👇`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton() } }
    )
  }

  // Ask Groq to parse food
  const systemPrompt = `Ты помощник по подсчёту калорий. Пользователь написал что съел. 
Ответь ТОЛЬКО JSON без пояснений: {"name": "название на русском", "calories": число, "protein": г, "fat": г, "carbs": г, "weight": г}
Если вес не указан — используй стандартную порцию. Калории считай для указанного веса.`

  let calories = 200
  let name = foodText
  let protein = 0, fat = 0, carbs = 0

  const aiReply = await askGroq(systemPrompt, foodText)
  if (aiReply) {
    try {
      const match = aiReply.match(/\{[^}]+\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        name = parsed.name || foodText
        calories = Math.round(parsed.calories) || 200
        protein = parsed.protein || 0
        fat = parsed.fat || 0
        carbs = parsed.carbs || 0
      }
    } catch(e) {}
  }

  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getHours()
  const mealType = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 19 ? 'dinner' : 'snack'
  const typeMap = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин', snack: 'перекус' }

  getDb().prepare('INSERT INTO meals (user_id, name, calories, protein, fat, carbs, type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, name, calories, protein, fat, carbs, mealType, today)

  const { consumed } = getTodayStats(user.id)
  const remaining = Math.max(0, (user.calories || 2000) - consumed)

  await bot.sendMessage(msg.chat.id,
    `✅ *Добавлено в ${typeMap[mealType]}!*\n\n` +
    `🍽 ${name}\n` +
    `🔥 ${calories} ккал · Б:${protein}г · Ж:${fat}г · У:${carbs}г\n\n` +
    `📊 Сегодня: *${consumed} ккал* | Осталось: *${remaining} ккал*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton() } }
  )
})

// ── /workout — workout advice ─────────────────────────────
bot.onText(/\/workout|💪 Тренировка/, async (msg) => {
  const user = getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'
  const goalMap = { lose_weight: 'похудение', gain_muscle: 'набор мышц', maintain: 'поддержание формы', health: 'здоровье' }
  const goal = goalMap[user?.goal] || 'здоровье'

  const systemPrompt = `Ты тренер-эксперт. Дай краткий конкретный совет по тренировке на сегодня.
Учти цель пользователя: ${goal}. Ответ 3-4 предложения на русском. Будь мотивирующей!`

  const advice = await askGroq(systemPrompt, `Посоветуй тренировку для цели: ${goal}`)

  await bot.sendMessage(msg.chat.id,
    `💪 *Тренировка для тебя, ${name}!*\n\n${advice || 'Сегодня отлично подойдёт 30 минут кардио + растяжка. Начни с разминки 5 минут и не забудь про воду! 💧'}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton(`${MINI_APP_URL}?tab=workouts`) } }
  )
})

// ── /help ─────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🆘 *Команды SOFE:*\n\n` +
    `/today — статистика дня\n` +
    `/eat [еда] — добавить приём пищи\n` +
    `/workout — совет по тренировке\n` +
    `/events — ближайшие мероприятия\n` +
    `/share — поделиться достижениями\n` +
    `/motivate — получить мотивацию\n` +
    `/help — эта справка\n\n` +
    `💡 *Или просто напиши мне что угодно* — я отвечу как ИИ-ассистент!`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: openAppButton() } }
  )
})

// ── 🌸 Open app button ────────────────────────────────────
bot.onText(/🌸 Открыть приложение/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Открываю SOFE! 🌸',
    { reply_markup: { inline_keyboard: openAppButton() } })
})

// ── Free-form AI chat ─────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/') || msg.text.startsWith('🌸') || msg.text.startsWith('📊') || msg.text.startsWith('🥗') || msg.text.startsWith('💪') || msg.text.startsWith('📅') || msg.text.startsWith('🏆')) return

  const user = getUser(msg.from.id)
  const name = user?.name?.split(' ')[0] || msg.from.first_name || 'красотка'

  // Check if it looks like a food entry
  const foodKeywords = ['съела', 'поела', 'выпила', 'ел', 'ела', 'завтрак', 'обед', 'ужин', 'перекус']
  const isFoodEntry = foodKeywords.some(k => msg.text.toLowerCase().includes(k))

  let systemPrompt
  if (isFoodEntry) {
    systemPrompt = `Ты помощник SOFE по питанию. Если пользователь описывает еду — помоги оценить калории и дай совет.
Ответь коротко (2-3 предложения) на русском. Имя пользователя: ${name}.`
  } else {
    const { consumed } = user ? getTodayStats(user.id) : { consumed: 0 }
    const events = getUpcomingEvents(7).slice(0, 3).map(e => `${e.emoji} ${e.title} (${e.date})`).join(', ')
    systemPrompt = `Ты SOFE — дружелюбный ИИ-ассистент по здоровью и питанию в Telegram.
Пользователь: ${name}, цель: ${user?.goal || 'здоровье'}, норма: ${user?.calories || 2000} ккал, съела сегодня: ${consumed} ккал.
${events ? `Предстоящие мероприятия: ${events}` : ''}
Отвечай коротко (2-4 предложения), по-дружески, на русском. 1-2 эмодзи.`
  }

  try {
    await bot.sendChatAction(msg.chat.id, 'typing')
    const reply = await askGroq(systemPrompt, msg.text)
    if (reply) {
      await bot.sendMessage(msg.chat.id, reply, {
        reply_markup: { inline_keyboard: openAppButton() }
      })
    } else {
      await bot.sendMessage(msg.chat.id,
        `Открой приложение SOFE для полного функционала! 🌸`,
        { reply_markup: { inline_keyboard: openAppButton() } }
      )
    }
  } catch(e) {
    console.error('Bot AI error:', e.message)
  }
})

bot.on('polling_error', (err) => console.error('Bot error:', err.message))
console.log('🤖 SOFE Bot started with AI')
