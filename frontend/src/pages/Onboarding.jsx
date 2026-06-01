import { useState } from 'react'
import { updateProfile } from '../utils/api'

const steps = [
  { key: 'name', title: 'Как тебя зовут?', subtitle: 'Это поможет нам персонализировать опыт', type: 'text', placeholder: 'Твоё имя' },
  { key: 'goal', title: 'Какая твоя цель?', subtitle: 'Выбери одну главную', type: 'choice', options: [
    { value: 'lose_weight', label: '🏃‍♀️ Похудеть', desc: 'Снизить вес и жировую массу' },
    { value: 'gain_muscle', label: '💪 Набрать мышцы', desc: 'Увеличить мышечную массу' },
    { value: 'maintain', label: '⚖️ Поддерживать', desc: 'Сохранить текущую форму' },
    { value: 'health', label: '❤️ Здоровье', desc: 'Улучшить самочувствие и энергию' }
  ]},
  { key: 'calories', title: 'Сколько калорий в день?', subtitle: 'Примерная норма — мы поможем рассчитать', type: 'number', placeholder: '2000', suffix: 'ккал' },
  { key: 'activity', title: 'Уровень активности', subtitle: 'Как часто ты тренируешься?', type: 'choice', options: [
    { value: 'low', label: '🛋 Низкий', desc: 'Сижу большую часть дня' },
    { value: 'medium', label: '🚶 Средний', desc: '1-3 тренировки в неделю' },
    { value: 'high', label: '🏋️ Высокий', desc: '4-5 тренировок в неделю' },
    { value: 'very_high', label: '🔥 Очень высокий', desc: 'Каждый день' }
  ]}
]

export default function Onboarding({ onComplete, tgUser }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    name: tgUser?.firstName || '',
    goal: '',
    calories: '2000',
    activity: ''
  })
  const [loading, setLoading] = useState(false)

  const current = steps[step]

  const next = async () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1)
    } else {
      setLoading(true)
      try {
        const res = await updateProfile({ ...data, onboarded: true, telegram_id: tgUser?.id })
        onComplete(res.data.user)
      } catch (e) {
        console.error(e)
        onComplete({ ...data, onboarded: true })
      } finally {
        setLoading(false)
      }
    }
  }

  const canProceed = () => {
    if (current.type === 'choice') return !!data[current.key]
    if (current.type === 'text') return data[current.key].trim().length > 0
    if (current.type === 'number') return parseInt(data[current.key]) > 0
    return true
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '48px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--pink)', letterSpacing: -1, marginBottom: 4 }}>SOFE</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>твой ИИ-ассистент для здоровья</div>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, padding: '0 24px', marginBottom: 32 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= step ? 'var(--pink)' : 'var(--pink-mid)',
            transition: 'background 0.3s'
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '0 24px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>{current.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>{current.subtitle}</p>

        {current.type === 'text' && (
          <input
            type="text"
            value={data[current.key]}
            onChange={e => setData(d => ({ ...d, [current.key]: e.target.value }))}
            placeholder={current.placeholder}
            style={{ fontSize: 16, padding: '14px 16px' }}
            autoFocus
          />
        )}

        {current.type === 'number' && (
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              value={data[current.key]}
              onChange={e => setData(d => ({ ...d, [current.key]: e.target.value }))}
              placeholder={current.placeholder}
              style={{ fontSize: 20, fontWeight: 800, padding: '14px 60px 14px 16px' }}
            />
            {current.suffix && (
              <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
                {current.suffix}
              </span>
            )}
          </div>
        )}

        {current.type === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {current.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => setData(d => ({ ...d, [current.key]: opt.value }))}
                style={{
                  padding: '14px 16px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                  border: data[current.key] === opt.value ? '2px solid var(--pink)' : '1.5px solid var(--border)',
                  background: data[current.key] === opt.value ? 'var(--pink-light)' : 'var(--white)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800 }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Button */}
      <div style={{ padding: '24px 24px max(24px, env(safe-area-inset-bottom))' }}>
        <button
          className="btn-primary"
          onClick={next}
          disabled={!canProceed() || loading}
          style={{ opacity: canProceed() ? 1 : 0.5 }}
        >
          {loading ? 'Сохраняем...' : step === steps.length - 1 ? '🚀 Начать!' : 'Далее →'}
        </button>
      </div>
    </div>
  )
}
