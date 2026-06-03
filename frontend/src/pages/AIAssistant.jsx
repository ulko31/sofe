import { useState, useEffect, useRef } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const GROQ_TOKEN = import.meta.env.VITE_GROQ_TOKEN
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

function buildSystemPrompt(user, consumed, eventsText) {
  return `Ты SOFE — персональный ИИ-ассистент по здоровью и питанию. Ты дружелюбная, заботливая и мотивирующая подруга-эксперт.

Данные пользователя:
- Имя: ${user?.name || 'пользователь'}
- Цель: ${{ lose_weight: 'похудеть', gain_muscle: 'набрать мышцы', maintain: 'поддерживать вес', health: 'улучшить здоровье' }[user?.goal] || 'здоровье'}
- Норма калорий: ${user?.calories || 2000} ккал/день
- Потреблено сегодня: ${consumed} ккал
- Осталось: ${Math.max(0, (user?.calories || 2000) - consumed)} ккал
${eventsText ? `\nПредстоящие мероприятия на платформе:\n${eventsText}` : ''}

Правила:
- ВСЕГДА отвечай только на русском языке
- Отвечай коротко — 2-4 предложения
- Давай конкретные советы с цифрами
- 1-2 эмодзи на ответ
- Если спрашивают про мероприятия — расскажи о предстоящих из списка выше
- Никогда не давай медицинских диагнозов`
}

export default function AIAssistant({ user, onBack }) {
  const { haptic } = useTelegram()
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Привет, ${user?.name?.split(' ')[0] || 'красотка'}! 🌸 Я SOFE — твой персональный ассистент по здоровью. Спроси меня что угодно про питание, тренировки или самочувствие!` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [todayConsumed, setTodayConsumed] = useState(0)
  const [eventsText, setEventsText] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/ai/suggestions').then(r => setSuggestions(r.data)).catch(() => {
      setSuggestions([
        '🥗 Что съесть на обед?',
        '💪 Посоветуй тренировку',
        '💧 Сколько воды нужно?',
        '😴 Советы для хорошего сна',
        '📅 Какие мероприятия скоро?'
      ])
    })
    api.get('/nutrition/today').then(r => setTodayConsumed(r.data.consumed || 0)).catch(() => {})

    // Load upcoming events for context
    api.get('/events/all').then(r => {
      const events = r.data || []
      const now = new Date()
      const upcoming = events
        .filter(e => new Date(e.date) >= now)
        .slice(0, 5)
        .map(e => `- ${e.emoji} ${e.title} (${new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}, ${e.time}, ${e.location})`)
        .join('\n')
      if (upcoming) setEventsText(upcoming)
    }).catch(() => {
      // Try events.json fallback
      fetch('/events.json').then(r => r.json()).then(data => {
        const events = data.events || []
        const now = new Date()
        const upcoming = events
          .filter(e => new Date(e.date) >= now)
          .slice(0, 5)
          .map(e => `- ${e.emoji} ${e.title} (${new Date(e.date).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}, ${e.time}, ${e.location})`)
          .join('\n')
        if (upcoming) setEventsText(upcoming)
      }).catch(() => {})
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    haptic('light')
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])

    if (!GROQ_TOKEN) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚙️ Токен Groq не настроен. Добавь VITE_GROQ_TOKEN в переменные Vercel.' }])
      setLoading(false)
      return
    }

    const history = messages.slice(-8)
    const systemPrompt = buildSystemPrompt(user, todayConsumed, eventsText)

    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            userMsg
          ],
          max_tokens: 400,
          temperature: 0.7
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        if (response.status === 401) throw new Error('invalid_token')
        if (response.status === 429) throw new Error('rate_limit')
        throw new Error(errData.error?.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      const reply = data.choices?.[0]?.message?.content?.trim()
      if (!reply) throw new Error('empty')

      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch(e) {
      console.error('Groq error:', e.message)
      let errMsg = 'Что-то пошло не так 😔 Попробуй ещё раз.'
      if (e.message === 'invalid_token') errMsg = '🔑 Токен Groq недействителен. Создай новый на console.groq.com и обнови VITE_GROQ_TOKEN на Vercel.'
      if (e.message === 'rate_limit') errMsg = '⏳ Слишком много запросов. Подожди минуту и попробуй снова.'
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--pink)', padding: '48px 16px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ color: 'white', fontSize: 22, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
        <div>
          <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>SOFE ИИ-ассистент</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>на базе Llama 3 · Groq</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' }}>🤖</div>
            )}
            <div style={{
              maxWidth: '78%', padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user' ? 'var(--pink)' : 'var(--white)',
              color: msg.role === 'user' ? 'white' : 'var(--text)',
              fontSize: 14, lineHeight: 1.6,
              border: msg.role === 'assistant' ? '0.5px solid var(--border)' : 'none',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
            <div style={{ background: 'var(--white)', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', border: '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(j => (
                  <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pink)', animation: `bounce 1s ${j*0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && suggestions.length > 0 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)}
              style={{ padding: '8px 14px', borderRadius: 20, background: 'var(--white)', border: '1.5px solid var(--pink-mid)', color: 'var(--pink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input — sticky at bottom */}
      <div style={{ background: 'var(--white)', borderTop: '0.5px solid var(--border)', padding: '12px 16px 32px', display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Напиши свой вопрос..."
          rows={1}
          style={{ flex: 1, resize: 'none', borderRadius: 20, padding: '12px 18px', fontSize: 15, maxHeight: 120, lineHeight: 1.4, border: '1.5px solid var(--pink-mid)', outline: 'none', fontFamily: 'Nunito, sans-serif', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, background: input.trim() && !loading ? 'var(--pink)' : '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: input.trim() ? 'pointer' : 'default', transition: 'background 0.2s' }}>
          <i className="ti ti-send" style={{ color: 'white', fontSize: 20 }} />
        </button>
      </div>

      <style>{`@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}
