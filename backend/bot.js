require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://your-app.netlify.app'

console.log('🤖 SOFE Bot started')

// Handle friend invite deep links
bot.onText(/\/start friend_(.+)/, async (msg, match) => {
  const token = match[1]
  const chatId = msg.chat.id
  const name = msg.from.first_name || 'красотка'

  await bot.sendMessage(chatId,
    `🌸 *Привет, ${name}!*

Тебя приглашают дружить в SOFE!

Открой приложение чтобы принять запрос и начать следить за прогрессом вместе 💪`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{
          text: '✅ Принять приглашение',
          web_app: { url: `${MINI_APP_URL}?action=accept_friend&token=${token}` }
        }]]
      }
    }
  )
})

// /start
bot.onText(/\/start/, async (msg) => {
  const name = msg.from.first_name || 'красотка'
  await bot.sendMessage(msg.chat.id,
    `✨ Привет, *${name}*! Я SOFE — твой персональный ИИ-помощник для здоровья.\n\n` +
    `Я помогу тебе:\n` +
    `🥗 Контролировать питание\n` +
    `🏋️ Отслеживать тренировки\n` +
    `💧 Следить за водным балансом\n` +
    `😴 Анализировать сон\n\n` +
    `Нажми кнопку ниже, чтобы открыть приложение 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{
          text: '🌸 Открыть SOFE',
          web_app: { url: MINI_APP_URL }
        }]]
      }
    }
  )
})

// /menu
bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    '📱 Главное меню SOFE:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌸 Открыть приложение', web_app: { url: MINI_APP_URL } }],
          [
            { text: '🥗 Питание', web_app: { url: `${MINI_APP_URL}?tab=nutrition` } },
            { text: '🏋️ Тренировки', web_app: { url: `${MINI_APP_URL}?tab=workouts` } }
          ],
          [{ text: '📊 Мой прогресс', web_app: { url: `${MINI_APP_URL}?tab=profile` } }]
        ]
      }
    }
  )
})

// /help
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🆘 *Помощь*\n\n` +
    `/start — приветствие и открытие приложения\n` +
    `/menu — быстрое меню\n` +
    `/stats — твоя статистика за сегодня\n` +
    `/help — эта справка\n\n` +
    `По всем вопросам пиши: @sofe_support`,
    { parse_mode: 'Markdown' }
  )
})

// /stats
bot.onText(/\/stats/, async (msg) => {
  // In production, fetch from DB using msg.from.id
  await bot.sendMessage(msg.chat.id,
    `📊 *Статистика за сегодня*\n\n` +
    `🔥 Калории: откройте приложение для деталей\n` +
    `💧 Вода: отслеживайте в приложении\n` +
    `🏃 Шаги: подключите умные часы\n\n`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📱 Открыть SOFE', web_app: { url: MINI_APP_URL } }]]
      }
    }
  )
})

// Daily reminder (example — use node-cron in production)
// const cron = require('node-cron')
// cron.schedule('0 9 * * *', async () => {
//   // Send reminders to all users from DB
// })

// Handle unknown commands
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/') && !['/start', '/menu', '/help', '/stats'].includes(msg.text)) {
    await bot.sendMessage(msg.chat.id, 'Не знаю такой команды. Напиши /help')
  }
})

bot.on('polling_error', (err) => console.error('Bot error:', err.message))
