import { useState, useEffect, useRef } from 'react'
import { useTelegram } from '../hooks/useTelegram'

const YANDEX_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY || ''

const CATEGORIES = [
  { id: 'all', label: 'Все', icon: '🗺' },
  { id: 'studio', label: 'Студии', icon: '🏋️' },
  { id: 'cafe', label: 'Кафе', icon: '🥗' },
  { id: 'spa', label: 'Спа', icon: '💆' },
  { id: 'friends', label: 'Подруги', icon: '👯' }
]

// Demo places — в реальном приложении грузятся с бэкенда
const DEMO_PLACES = [
  { id: 1, type: 'studio', name: 'ELASTICA Studio', address: 'ул. Тверская, 14', rating: 4.9, price: '★★★', coords: [55.762, 37.606], color: '#E8437A', emoji: '🏋️', tags: ['Пилатес', 'Йога', 'Стретчинг'] },
  { id: 2, type: 'studio', name: 'ForMe Fitness', address: 'Кутузовский пр., 22', rating: 4.7, price: '★★', coords: [55.743, 37.558], color: '#E8437A', emoji: '💪', tags: ['FIT', 'Кардио', 'Силовые'] },
  { id: 3, type: 'studio', name: 'NF Studio', address: 'ул. Арбат, 35', rating: 4.8, price: '★★★', coords: [55.750, 37.592], color: '#E8437A', emoji: '🧘', tags: ['Йога', 'Медитация'] },
  { id: 4, type: 'cafe', name: 'Здоровое меню', address: 'Большая Никитская, 10', rating: 4.6, price: '★★', coords: [55.757, 37.601], color: '#4CAF50', emoji: '🥗', tags: ['ПП еда', 'Смузи', 'Боулы'] },
  { id: 5, type: 'cafe', name: 'GreenPoint', address: 'ул. Маросейка, 7', rating: 4.8, price: '★★', coords: [55.757, 37.638], color: '#4CAF50', emoji: '🌿', tags: ['Вегетарианское', 'Соки'] },
  { id: 6, type: 'cafe', name: 'Fit Kitchen', address: 'Пресненская наб., 12', rating: 4.5, price: '★', coords: [55.748, 37.539], color: '#4CAF50', emoji: '🍱', tags: ['Готовые наборы', 'Доставка'] },
  { id: 7, type: 'spa', name: 'Relax Spa', address: 'ул. Мясницкая, 24', rating: 4.9, price: '★★★', coords: [55.763, 37.635], color: '#9B59B6', emoji: '💆', tags: ['Массаж', 'Обёртывания'] },
  { id: 8, type: 'spa', name: 'Beauty Oasis', address: 'Ленинградский пр., 80', rating: 4.7, price: '★★', coords: [55.789, 37.574], color: '#9B59B6', emoji: '✨', tags: ['СПА', 'Флоатинг'] },
  { id: 9, type: 'friends', name: 'Аня К.', address: 'В 500м от тебя', rating: null, coords: [55.754, 37.622], color: '#FF9800', emoji: '👩', tags: ['Онлайн', 'Бегает по утрам'] },
  { id: 10, type: 'friends', name: 'Маша Л.', address: 'В 1.2км от тебя', rating: null, coords: [55.745, 37.610], color: '#FF9800', emoji: '👩‍🦱', tags: ['Йога', 'ПП питание'] }
]

export default function MapScreen({ user }) {
  const { haptic } = useTelegram()
  const mapRef = useRef(null)
  const ymapsRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [userLocation, setUserLocation] = useState([55.751, 37.618]) // Moscow default

  const filtered = category === 'all' ? DEMO_PLACES : DEMO_PLACES.filter(p => p.type === category)

  // Load Yandex Maps script
  useEffect(() => {
    if (window.ymaps) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_KEY}&lang=ru_RU`
    script.async = true
    script.onload = () => {
      window.ymaps.ready(() => {
        ymapsRef.current = window.ymaps
        setMapLoaded(true)
      })
    }
    document.head.appendChild(script)
  }, [])

  // Get user location
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {} // keep default Moscow
    )
  }, [])

  // Init map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return
    const ymaps = ymapsRef.current || window.ymaps
    if (!ymaps) return

    ymaps.ready(() => {
      const map = new ymaps.Map(mapRef.current, {
        center: userLocation,
        zoom: 13,
        controls: ['zoomControl']
      })

      mapInstanceRef.current = map
      addPlacemarksToMap(map, ymaps, DEMO_PLACES)
    })
  }, [mapLoaded])

  // Update placemarks when category changes
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return
    const ymaps = ymapsRef.current || window.ymaps
    if (!ymaps) return
    mapInstanceRef.current.geoObjects.removeAll()
    addPlacemarksToMap(mapInstanceRef.current, ymaps, filtered)
  }, [category, mapLoaded])

  function addPlacemarksToMap(map, ymaps, places) {
    // User location marker
    const userMark = new ymaps.Placemark(userLocation, {}, {
      preset: 'islands#pinkCircleDotIcon',
      iconColor: '#E8437A'
    })
    map.geoObjects.add(userMark)

    // Place markers
    places.forEach(place => {
      const mark = new ymaps.Placemark(place.coords, {
        balloonContentHeader: place.name,
        balloonContentBody: `${place.address}<br/>${(place.tags || []).join(', ')}`,
        hintContent: place.name
      }, {
        preset: 'islands#circleDotIcon',
        iconColor: place.color
      })

      mark.events.add('click', () => {
        haptic('light')
        setSelected(place)
      })

      map.geoObjects.add(mark)
    })
  }

  const handlePlaceClick = (place) => {
    haptic('light')
    setSelected(place)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(place.coords, 15, { duration: 300 })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '48px 16px 12px', background: 'var(--white)', borderBottom: '0.5px solid var(--border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Карта</h2>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { haptic('light'); setCategory(cat.id); setSelected(null) }}
              style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', transition: 'all 0.15s', border: 'none', background: category === cat.id ? 'var(--pink)' : 'var(--bg)', color: category === cat.id ? 'white' : 'var(--text-muted)' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapLoaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Загружаем карту...</p>
          </div>
        )}
      </div>

      {/* Places list — bottom sheet */}
      <div style={{ background: 'var(--white)', borderTop: '0.5px solid var(--border)', maxHeight: selected ? '0' : '220px', overflow: 'hidden', transition: 'max-height 0.3s' }}>
        <div style={{ padding: '12px 16px 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          {filtered.length} мест рядом
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 16px 16px' }}>
          {filtered.map(place => (
            <div key={place.id} onClick={() => handlePlaceClick(place)}
              style={{ flexShrink: 0, width: 140, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 12, cursor: 'pointer', border: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{place.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{place.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{place.address}</div>
              {place.rating && <div style={{ fontSize: 11, color: '#FFB347', marginTop: 4, fontWeight: 700 }}>★ {place.rating}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Selected place card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 20, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selected.type === 'studio' ? 'var(--pink-light)' : selected.type === 'cafe' ? 'var(--green-light)' : selected.type === 'spa' ? '#F3E5F5' : '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                {selected.emoji}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.address}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)', fontSize: 20 }}>
              <i className="ti ti-x" />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {(selected.tags || []).map(tag => (
              <span key={tag} className="badge badge-pink" style={{ fontSize: 11 }}>{tag}</span>
            ))}
            {selected.rating && <span className="badge" style={{ background: '#FFF9E6', color: '#E65100', fontSize: 11 }}>★ {selected.rating}</span>}
            {selected.price && <span className="badge badge-green" style={{ fontSize: 11 }}>{selected.price}</span>}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                haptic('medium')
                window.open(`https://yandex.ru/maps/?rtext=~${selected.coords[0]},${selected.coords[1]}&rtt=auto`, '_blank')
              }}
              className="btn-primary" style={{ flex: 1 }}
            >
              <i className="ti ti-navigation" style={{ marginRight: 6 }} />
              Маршрут
            </button>
            {selected.type !== 'friends' && (
              <button onClick={() => haptic('light')} className="btn-outline" style={{ flex: 1 }}>
                Записаться
              </button>
            )}
            {selected.type === 'friends' && (
              <button onClick={() => haptic('light')} className="btn-outline" style={{ flex: 1 }}>
                Написать
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
