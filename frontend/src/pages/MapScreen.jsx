import { useState, useEffect, useRef } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const YANDEX_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY || ''

// Default city center — Moscow
const DEFAULT_CENTER = [55.751, 37.618]

const CATEGORIES = [
  { id: 'all', label: 'Все', icon: '🗺' },
  { id: 'studio', label: 'Студии', icon: '🏋️' },
  { id: 'cafe', label: 'Кафе', icon: '🥗' },
  { id: 'spa', label: 'Спа', icon: '💆' },
  { id: 'friends', label: 'Подруги', icon: '👯' }
]

// Demo places — replaced by real ones from admin
const DEMO_PLACES = [
  { id: 1, type: 'studio', name: 'ELASTICA Studio', address: 'ул. Тверская, 14', rating: 4.9, coords: [55.762, 37.606], color: '#E8437A', emoji: '🏋️', tags: ['Пилатес', 'Йога', 'Стретчинг'] },
  { id: 2, type: 'studio', name: 'ForMe Fitness', address: 'Кутузовский пр., 22', rating: 4.7, coords: [55.743, 37.558], color: '#E8437A', emoji: '💪', tags: ['FIT', 'Кардио'] },
  { id: 3, type: 'studio', name: 'NF Studio', address: 'ул. Арбат, 35', rating: 4.8, coords: [55.750, 37.592], color: '#E8437A', emoji: '🧘', tags: ['Йога', 'Медитация'] },
  { id: 4, type: 'cafe', name: 'Здоровое меню', address: 'Большая Никитская, 10', rating: 4.6, coords: [55.757, 37.601], color: '#4CAF50', emoji: '🥗', tags: ['ПП еда', 'Смузи'] },
  { id: 5, type: 'cafe', name: 'GreenPoint', address: 'ул. Маросейка, 7', rating: 4.8, coords: [55.757, 37.638], color: '#4CAF50', emoji: '🌿', tags: ['Вегетарианское'] },
  { id: 6, type: 'spa', name: 'Relax Spa', address: 'ул. Мясницкая, 24', rating: 4.9, coords: [55.763, 37.635], color: '#9B59B6', emoji: '💆', tags: ['Массаж'] }
]

export default function MapScreen({ user }) {
  const { haptic } = useTelegram()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [userLocation, setUserLocation] = useState(DEFAULT_CENTER)
  const [places, setPlaces] = useState(DEMO_PLACES)

  const [friends, setFriends] = useState([])

  // Load friends with location
  useEffect(() => {
    api.get('/friends').then(r => {
      setFriends((r.data || []).filter(f => f.share_location && f.lat))
    }).catch(() => {})
  }, [])

  // Load real places from backend
  useEffect(() => {
    api.get('/admin/places').then(r => {
      if (r.data?.places?.length > 0) {
        setPlaces(r.data.places.map(p => ({
          ...p,
          coords: [parseFloat(p.lat) || DEFAULT_CENTER[0], parseFloat(p.lng) || DEFAULT_CENTER[1]],
          tags: Array.isArray(p.tags) ? p.tags : JSON.parse(p.tags || '[]')
        })))
      }
    }).catch(() => {})
  }, [])

  const friendPlaces = friends.map(f => ({
    id: 'f_' + f.id, type: 'friends',
    name: f.name || f.username || 'Подруга',
    address: 'Онлайн · обновлено недавно',
    coords: [parseFloat(f.lat), parseFloat(f.lng)],
    color: '#FF9800', emoji: '👩',
    tags: [f.goal ? 'Цель: ' + f.goal : 'SOFE'],
    rating: 0
  }))
  const allItems = [...places, ...friendPlaces]
  const filtered = category === 'all' ? allItems : category === 'friends' ? friendPlaces : places.filter(p => p.type === category)

  // Load Yandex Maps
  useEffect(() => {
    if (window.ymaps) { setMapLoaded(true); return }
    if (!YANDEX_KEY) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_KEY}&lang=ru_RU`
    script.async = true
    script.onload = () => window.ymaps.ready(() => setMapLoaded(true))
    script.onerror = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Try geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => setUserLocation(DEFAULT_CENTER),
        { timeout: 5000 }
      )
    }
  }, [])

  // Init map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current || !window.ymaps || !YANDEX_KEY) return
    window.ymaps.ready(() => {
      const map = new window.ymaps.Map(mapRef.current, {
        center: userLocation,
        zoom: 13,
        controls: ['zoomControl']
      })
      mapInstanceRef.current = map
      renderMarkers(map, places)
    })
  }, [mapLoaded])

  // Update markers when category or places change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.ymaps) return
    mapInstanceRef.current.geoObjects.removeAll()
    renderMarkers(mapInstanceRef.current, filtered)
  }, [category, places])

  function renderMarkers(map, items) {
    // User location
    const userMark = new window.ymaps.Placemark(userLocation, {}, {
      preset: 'islands#pinkCircleDotIcon'
    })
    map.geoObjects.add(userMark)

    items.forEach(place => {
      if (!place.coords?.[0] || !place.coords?.[1]) return
      const mark = new window.ymaps.Placemark(
        place.coords,
        { balloonContentHeader: place.name, balloonContentBody: place.address, hintContent: place.name },
        { preset: 'islands#circleDotIcon', iconColor: place.color || '#E8437A' }
      )
      mark.events.add('click', () => { haptic('light'); setSelected(place) })
      map.geoObjects.add(mark)
    })
  }

  const handlePlaceClick = (place) => {
    haptic('light')
    setSelected(place)
    if (mapInstanceRef.current && place.coords?.[0]) {
      mapInstanceRef.current.setCenter(place.coords, 15, { duration: 300 })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '48px 16px 12px', background: 'var(--white)', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Карта</h2>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { haptic('light'); setCategory(cat.id); setSelected(null) }}
              style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', border: 'none', background: category === cat.id ? 'var(--pink)' : 'var(--bg)', color: category === cat.id ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {YANDEX_KEY ? (
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          // Fallback — simple list view when no API key
          <div style={{ padding: 16, overflowY: 'auto', height: '100%', background: 'var(--bg)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>
              🗺 Для отображения карты добавь VITE_YANDEX_MAPS_KEY
            </div>
            {filtered.map(place => (
              <div key={place.id} className="card" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setSelected(place)}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 28 }}>{place.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{place.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{place.address}</div>
                    {place.rating > 0 && <div style={{ fontSize: 11, color: '#FFB347', marginTop: 2 }}>★ {place.rating}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!mapLoaded && YANDEX_KEY && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Загружаем карту...</p>
          </div>
        )}
      </div>

      {/* Places list */}
      {!selected && filtered.length > 0 && (
        <div style={{ background: 'var(--white)', borderTop: '0.5px solid var(--border)', flexShrink: 0, paddingBottom: 70 }}>
          <div style={{ padding: '10px 16px 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
            {filtered.length} мест
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 16px 12px' }}>
            {filtered.map(place => (
              <div key={place.id} onClick={() => handlePlaceClick(place)}
                style={{ flexShrink: 0, width: 130, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: 12, cursor: 'pointer', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{place.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{place.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{place.address}</div>
                {place.rating > 0 && <div style={{ fontSize: 11, color: '#FFB347', marginTop: 4, fontWeight: 700 }}>★ {place.rating}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected place card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 20, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', zIndex: 10, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selected.type === 'cafe' ? 'var(--green-light)' : selected.type === 'spa' ? '#F3E5F5' : 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                {selected.emoji}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.address}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>
              <i className="ti ti-x" />
            </button>
          </div>

          {selected.rating > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span className="badge" style={{ background: '#FFF9E6', color: '#E65100', fontSize: 12 }}>★ {selected.rating}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {(selected.tags || []).map(tag => (
              <span key={tag} className="badge badge-pink" style={{ fontSize: 11 }}>{tag}</span>
            ))}
          </div>

          {selected.description && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>{selected.description}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { haptic('medium'); window.open(`https://yandex.ru/maps/?rtext=~${selected.coords[0]},${selected.coords[1]}&rtt=auto`, '_blank') }}
              className="btn-primary" style={{ flex: 1 }}>
              <i className="ti ti-navigation" style={{ marginRight: 6 }} />
              Маршрут
            </button>
            {selected.phone && (
              <button onClick={() => window.open(`tel:${selected.phone}`)} className="btn-outline" style={{ flex: 1 }}>
                Позвонить
              </button>
            )}
            {!selected.phone && (
              <button onClick={() => haptic('light')} className="btn-outline" style={{ flex: 1 }}>
                Записаться
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
