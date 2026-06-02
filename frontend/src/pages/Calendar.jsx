import { useState, useEffect } from 'react'
import { useTelegram } from '../hooks/useTelegram'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

const TYPE_LABELS = {
  workout: '🏋️ Тренировка',
  workshop: '🎓 Мастер-класс',
  online: '💻 Онлайн',
  community: '👯 Комьюнити',
  consultation: '👩‍⚕️ Консультация',
  challenge: '🏆 Челлендж'
}

export default function Calendar() {
  const { haptic } = useTelegram()
  const [events, setEvents] = useState([])
  const [today] = useState(new Date())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    // Try backend first, fallback to events.json
    import('../utils/api').then(({ default: api }) => {
      api.get('/events/all').then(r => {
        setEvents(r.data || [])
      }).catch(() => {
        fetch('/events.json')
          .then(r => r.json())
          .then(data => setEvents(data.events || []))
          .catch(() => setEvents([]))
      })
    })
  }, [])

  // Build calendar grid
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday-first grid
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i))

  const getEventsForDay = (date) => {
    if (!date) return []
    const ds = date.toISOString().split('T')[0]
    return events.filter(e => e.date === ds)
  }

  const selectedDayEvents = getEventsForDay(selectedDay)

  const isSameDay = (a, b) => a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const isToday = (date) => isSameDay(date, today)
  const isSelected = (date) => isSameDay(date, selectedDay)

  const prevMonth = () => {
    haptic('light')
    setCurrentDate(new Date(year, month - 1, 1))
  }
  const nextMonth = () => {
    haptic('light')
    setCurrentDate(new Date(year, month + 1, 1))
  }

  // Upcoming events (next 30 days)
  const upcoming = events
    .filter(e => {
      const d = new Date(e.date)
      const diff = (d - today) / 86400000
      return diff >= 0 && diff <= 30
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10)

  return (
    <div className="screen">
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Календарь</h2>

      {/* Month navigation */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-chevron-left" />
          </button>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{MONTHS[month]} {year}</div>
          <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-chevron-right" />
          </button>
        </div>

        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {days.map((date, i) => {
            const dayEvents = getEventsForDay(date)
            const hasEvents = dayEvents.length > 0
            return (
              <div key={i}
                onClick={() => { if (date) { haptic('light'); setSelectedDay(date) } }}
                style={{
                  aspectRatio: '1', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10, cursor: date ? 'pointer' : 'default',
                  background: isSelected(date) ? 'var(--pink)' : isToday(date) ? 'var(--pink-light)' : 'transparent',
                  position: 'relative'
                }}>
                {date && (
                  <>
                    <span style={{
                      fontSize: 13, fontWeight: isToday(date) || isSelected(date) ? 900 : 500,
                      color: isSelected(date) ? 'white' : isToday(date) ? 'var(--pink)' : 'var(--text)'
                    }}>{date.getDate()}</span>
                    {hasEvents && (
                      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected(date) ? 'rgba(255,255,255,0.8)' : e.color }} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDayEvents.length > 0 && (
        <div>
          <div className="section-header">
            <h3>{selectedDay.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDayEvents.length} событий</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedDayEvents.map(event => (
              <div key={event.id} onClick={() => { haptic('light'); setSelectedEvent(event) }}
                className="card" style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${event.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 24 }}>{event.emoji}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{event.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {event.time !== '00:00' ? `${event.time} — ${event.endTime}` : 'Весь день'}
                      </div>
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 18, marginTop: 2 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <i className="ti ti-map-pin" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.location}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDayEvents.length === 0 && selectedDay && (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13 }}>Нет событий на этот день</div>
        </div>
      )}

      {/* Upcoming events */}
      <div>
        <div className="section-header"><h3>Ближайшие события</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcoming.map(event => {
            const d = new Date(event.date)
            const diff = Math.ceil((d - today) / 86400000)
            return (
              <div key={event.id} onClick={() => { haptic('light'); setSelectedEvent(event) }}
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: 'var(--white)', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: event.color + '20', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 18 }}>{event.emoji}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{event.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                    {event.time !== '00:00' && ` · ${event.time}`}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: diff === 0 ? 'var(--pink)' : diff <= 3 ? '#FF9800' : 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                  {diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : `через ${diff} дн`}
                </div>
              </div>
            )
          })}
          {upcoming.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Нет ближайших событий</div>
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: selectedEvent.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                  {selectedEvent.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{selectedEvent.title}</div>
                  <div style={{ fontSize: 12, color: selectedEvent.color, fontWeight: 700, marginTop: 2 }}>
                    {TYPE_LABELS[selectedEvent.type] || selectedEvent.type}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ color: 'var(--text-muted)', fontSize: 22 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <i className="ti ti-calendar" style={{ fontSize: 16, color: 'var(--text-muted)', width: 20 }} />
                <span style={{ fontSize: 13 }}>
                  {new Date(selectedEvent.date).toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              {selectedEvent.time !== '00:00' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <i className="ti ti-clock" style={{ fontSize: 16, color: 'var(--text-muted)', width: 20 }} />
                  <span style={{ fontSize: 13 }}>{selectedEvent.time} — {selectedEvent.endTime}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <i className="ti ti-map-pin" style={{ fontSize: 16, color: 'var(--text-muted)', width: 20 }} />
                <span style={{ fontSize: 13 }}>{selectedEvent.location}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{selectedEvent.description}</p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedEvent.link ? (
                <a href={selectedEvent.link} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => haptic('medium')}>
                    Перейти по ссылке →
                  </button>
                </a>
              ) : (
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => { haptic('medium'); setSelectedEvent(null) }}>
                  Записаться
                </button>
              )}
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setSelectedEvent(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
