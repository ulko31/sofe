const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const db = require('../db/init')

const HF_TOKEN = process.env.HF_TOKEN
const MODEL = 'mistralai/Mistral-7B-Instruct-v0.3'

function buildSystemPrompt(user, todayStats) {
  return `Ты SOFE — персональный ИИ-ассистент по здоровью и питанию. Ты дружелюбная, заботливая и мотивирующая подруга-эксперт.

Данные пользователя:
- Имя: ${user?.name || 'пользователь'}
- Цель: ${({ lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддерживать вес', health: 'улучшить здоровье' })[user?.goal] || 'здоровье'}
- Норма калорий: ${user?.calories || 2000} ккал/день
- Потреблено сегодня: ${todayStats?.consumed || 0} ккал
- Осталось: ${Math.max(0, (user?.calories || 2000) - (todayStats?.consumed || 0))} ккал

Правила:
- Отвечай коротко и по делу (2-4 предложения)
- Используй эмодзи умеренно
- Давай конкретные советы по питанию и тренировкам
- Учитывай данные пользователя при ответах
- Всегда отвечай на русском языке
- Не давай медицинских диагнозов`
}

// POST /api/ai/chat
router.post('/chat', auth, async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Message required' })
  if (!HF_TOKEN) return res.status(500).json({ error: 'AI not configured' })

  // Get today stats for context
  const today = new Date().toISOString().split('T')[0]
  const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(req.user.id, today)
  const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
  const todayStats = { consumed }

  const systemPrompt = buildSystemPrompt(req.user, todayStats)

  // Build messages for Mistral instruct format
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ]

  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${MODEL}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 300,
          temperature: 0.7,
          stream: false
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('HF error:', err)

      // Model loading — tell frontend to retry
      if (response.status === 503) {
        return res.status(503).json({ error: 'model_loading', message: 'Модель загружается, подожди 20 секунд...' })
      }
      return res.status(500).json({ error: 'AI error', message: 'Ошибка ИИ, попробуй ещё раз' })
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content?.trim()

    if (!reply) return res.status(500).json({ error: 'Empty response' })

    res.json({ reply })
  } catch (e) {
    console.error('AI fetch error:', e)
    res.status(500).json({ error: 'Network error' })
  }
})

// GET /api/ai/suggestions — quick suggestion buttons
router.get('/suggestions', auth, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const meals = db.prepare('SELECT * FROM meals WHERE user_id = ? AND date = ?').all(req.user.id, today)
  const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0)
  const remaining = Math.max(0, (req.user.calories || 2000) - consumed)

  const suggestions = [
    '🥗 Что съесть на обед?',
    '💪 Посоветуй тренировку',
    `📊 Как мой прогресс сегодня?`,
    '💧 Сколько воды нужно?',
    '😴 Советы для хорошего сна',
    remaining < 300 ? '⚠️ Я почти превысила норму калорий' : `🍽 Осталось ${remaining} ккал — что съесть?`
  ]

  res.json(suggestions)
})

module.exports = router
