import { useState } from 'react'
import api from '../utils/api'

const ACTIVITY_MULTIPLIERS = {
  low: 1.2,
  medium: 1.375,
  high: 1.55,
  very_high: 1.725
}

const GOAL_ADJUSTMENTS = {
  lose_weight: -300,
  gain_muscle: +200,
  maintain: 0,
  health: 0
}

function calcCalories(goal, activity, weight, height, age, gender) {
  // Mifflin-St Jeor formula
  const w = parseFloat(weight) || 60
  const h = parseFloat(height) || 165
  const a = parseFloat(age) || 25
  const bmr = gender === 'male'
    ? 10 * w + 6.25 * h - 5 * a + 5
    : 10 * w + 6.25 * h - 5 * a - 161
  const multiplier = ACTIVITY_MULTIPLIERS[activity] || 1.375
  const adjustment = GOAL_ADJUSTMENTS[goal] || 0
  return Math.round(bmr * multiplier + adjustment)
}

const steps = [
  { key: 'name', title: 'Как тебя зовут?', subtitle: 'Это поможет нам персонализировать опыт', type: 'text', placeholder: 'Твоё имя' },
  {
    key: 'body', title: 'Параметры тела', subtitle: 'Нужны для точного расчёта калорий', type: 'body'
  },
  {
    key: 'goal', title: 'Какая твоя цель?', subtitle: 'Выбери одну главную', type: 'choice',
    options: [
      { value: 'lose_weight', label: '🏃‍♀️ Похудеть', desc: 'Снизить вес и жировую массу' },
      { value: 'gain_muscle', label: '💪 Набрать мышцы', desc: 'Увеличить мышечную массу' },
      { value: 'maintain', label: '⚖️ Поддерживать', desc: 'Сохранить текущую форму' },
      { value: 'health', label: '❤️ Здоровье', desc: 'Улучшить самочувствие и энергию' }
    ]
  },
  {
    key: 'activity', title: 'Уровень активности', subtitle: 'Как часто ты тренируешься?', type: 'choice',
    options: [
      { value: 'low', label: '🛋 Низкий', desc: 'Сижу большую часть дня' },
      { value: 'medium', label: '🚶 Средний', desc: '1-3 тренировки в неделю' },
      { value: 'high', label: '🏋️ Высокий', desc: '4-5 тренировок в неделю' },
      { value: 'very_high', label: '🔥 Очень высокий', desc: 'Каждый день' }
    ]
  },
  { key: 'calories', title: 'Норма калорий', subtitle: 'Рассчитана автоматически. Можешь изменить.', type: 'number', placeholder: '2000', suffix: 'ккал' }
]

export default function Onboarding({ onComplete, tgUser }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState({
    name: tgUser?.firstName || '',
    age: '', weight: '', height: '', gender: 'female',
    goal: '', activity: '', calories: '2000'
  })
  const [loading, setLoading] = useState(false)

  const current = steps[step]

  // Auto-calculate calories when goal or activity changes
  const handleChoice = (key, value) => {
    const newData = { ...data, [key]: value }
    if (key === 'goal' || key === 'activity') {
      const goal = key === 'goal' ? value : data.goal
      const activity = key === 'activity' ? value : data.activity
      if (goal && activity) {
        newData.calories = String(calcCalories(goal, activity, data.weight, data.height, data.age, data.gender))
      }
    }
    setData(newData)
  }

  const next = async () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1)
    } else {
      setLoading(true)
      try {
        const res = await api.put('/user/profile', {
          ...data,
          age: parseInt(data.age) || null,
          weight: parseFloat(data.weight) || null,
          height: parseFloat(data.height) || null,
          calories: parseInt(data.calories) || 2000,
          onboarded: true,
          telegram_id: tgUser?.id
        })
        onComplete(res.data.user)
      } catch (e) {
        console.error(e)
        onComplete({ ...data, calories: parseInt(data.calories) || 2000, onboarded: true })
      } finally {
        setLoading(false)
      }
    }
  }

  const canProceed = () => {
    if (current.type === 'body') return true // all optional
    if (current.type === 'choice') return !!data[current.key]
    if (current.type === 'text') return data[current.key].trim().length > 0
    if (current.type === 'number') return parseInt(data[current.key]) > 0
    return true
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '48px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--pink)', letterSpacing: -1, marginBottom: 4 }}>SOFE</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>твой ИИ-ассистент для здоровья</div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '0 24px', marginBottom: 32 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--pink)' : 'var(--pink-mid)', transition: 'background 0.3s' }} />
        ))}
      </div>

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

        {current.type === 'body' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Возраст</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" value={data.age} onChange={e => setData(d => ({ ...d, age: e.target.value }))} placeholder="25" style={{ paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>лет</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Рост</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" value={data.height} onChange={e => setData(d => ({ ...d, height: e.target.value }))} placeholder="165" style={{ paddingRight: 36 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>см</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Вес</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" value={data.weight} onChange={e => setData(d => ({ ...d, weight: e.target.value }))} placeholder="60" style={{ paddingRight: 24 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>кг</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Пол</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['female','👩 Жен'],['male','👨 Муж']].map(([v,l]) => (
                    <button key={v} onClick={() => setData(d => ({ ...d, gender: v }))}
                      style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: data.gender === v ? '2px solid var(--pink)' : '1.5px solid var(--border)', background: data.gender === v ? 'var(--pink-light)' : 'white', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {current.type === 'number' && (
          <div>
            {data.goal && data.activity && (
              <div style={{ background: 'var(--pink-light)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 12, fontSize: 13, color: 'var(--pink)', fontWeight: 600 }}>
                ✨ Рассчитано по твоей цели и активности
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={data[current.key]}
                onChange={e => setData(d => ({ ...d, [current.key]: e.target.value }))}
                placeholder={current.placeholder}
                style={{ fontSize: 24, fontWeight: 800, padding: '14px 70px 14px 16px' }}
              />
              {current.suffix && (
                <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>
                  {current.suffix}
                </span>
              )}
            </div>
          </div>
        )}

        {current.type === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {current.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleChoice(current.key, opt.value)}
                style={{
                  padding: '14px 16px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                  border: data[current.key] === opt.value ? '2px solid var(--pink)' : '1.5px solid var(--border)',
                  background: data[current.key] === opt.value ? 'var(--pink-light)' : 'var(--white)',
                  transition: 'all 0.15s', cursor: 'pointer', fontFamily: 'Nunito, sans-serif'
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800 }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

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
