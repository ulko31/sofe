const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { query } = require('../db/turso')

const GROQ_TOKEN = process.env.GROQ_TOKEN || process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'openai/gpt-oss-20b'

function buildSystemPrompt(user, todayStats) {
  return `Ты SOFE — персональный ИИ-ассистент по здоровью и питанию. Ты дружелюбная, заботливая и мотивирующая подруга-эксперт.

Данные пользователя:
- Имя: ${user?.name || 'пользователь'}
- Цель: ${({ lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддерживать вес', health: 'улучшить здоровье' })[user?.goal] || 'здоровье'}
- Норма калорий: ${user?.calories || 2000} ккал/день
- Потреблено сегодня: ${todayStats?.consumed || 0} ккал
- Осталось: ${Math.max(0, (user?.calories || 2000) - (todayStats?.consumed || 0))} ккал

Правила:
- Всегда отвечай только на русском языке
- Отвечай коротко и по делу (2–4 предложения)
- Давай конкретные, безопасные советы по питанию и тренировкам
- Учитывай данные пользователя при ответах
- Используй эмодзи умеренно
- Не давай медицинских диагнозов`
}

// POST /api/ai/chat
router.post('/chat', auth, async (req, res) => {
  const { message, history = [] } = req.body || {}
  const cleanMessage = String(message || '').trim()
  if (!cleanMessage) return res.status(400).json({ error: 'Message required' })
  if (!GROQ_TOKEN) return res.status(503).json({ error: 'AI not configured', message: 'ИИ временно не настроен' })

  try {
    const today = new Date().toISOString().split('T')[0]
    const meals = await query('SELECT calories FROM meals WHERE user_id = ? AND date = ?', [req.user.id, today])
    const consumed = meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0)

    const messages = [
      { role: 'system', content: buildSystemPrompt(req.user, { consumed }) },
      ...history.slice(-6)
        .filter(item => ['user', 'assistant'].includes(item?.role) && item?.content)
        .map(item => ({ role: item.role, content: String(item.content).slice(0, 2000) })),
      { role: 'user', content: cleanMessage.slice(0, 2000) }
    ]

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 400,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const details = await response.text()
      console.error(`Groq chat error ${response.status}:`, details.slice(0, 500))
      if (response.status === 429) return res.status(429).json({ error: 'rate_limit', message: 'Слишком много запросов. Попробуй через минуту.' })
      if (response.status === 401 || response.status === 403) return res.status(503).json({ error: 'AI auth error', message: 'ИИ временно недоступен' })
      return res.status(502).json({ error: 'AI error', message: 'ИИ временно не ответил. Попробуй ещё раз.' })
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) return res.status(502).json({ error: 'Empty response', message: 'ИИ вернул пустой ответ. Попробуй ещё раз.' })

    res.json({ reply })
  } catch (error) {
    console.error('AI chat error:', error.message)
    res.status(500).json({ error: 'AI request failed', message: 'Не удалось связаться с ИИ. Попробуй ещё раз.' })
  }
})

// GET /api/ai/suggestions — quick suggestion buttons
router.get('/suggestions', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const meals = await query('SELECT calories FROM meals WHERE user_id = ? AND date = ?', [req.user.id, today])
    const consumed = meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0)
    const remaining = Math.max(0, (req.user.calories || 2000) - consumed)

    res.json([
      '🥗 Что съесть на обед?',
      '💪 Посоветуй тренировку',
      '📊 Как мой прогресс сегодня?',
      '💧 Сколько воды нужно?',
      '😴 Советы для хорошего сна',
      remaining < 300 ? '⚠️ Я почти превысила норму калорий' : `🍽 Осталось ${remaining} ккал — что съесть?`
    ])
  } catch (error) {
    console.error('AI suggestions error:', error.message)
    res.status(500).json({ error: 'Suggestions unavailable' })
  }
})

module.exports = router
