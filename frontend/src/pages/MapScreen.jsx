import { useState, useEffect, useRef } from 'react'
import { useTelegram } from '../hooks/useTelegram'
import api from '../utils/api'

const YANDEX_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY || ''
const DEFAULT_CENTER = [55.751, 37.618]

const CATEGORIES = [
  { id: 'all', label: 'Все', icon: '🗺' },
  { id: 'studio', label: 'Студии', icon: '🏋️' },
  { id: 'cafe', label: 'Кафе', icon: '🥗' },
  { id: 'spa', label: 'Спа', icon: '💆' },
  { id: 'friends', label: 'Подруги', icon: '👯' }
]

export default function MapScreen({ user }) {
  const { haptic } = useTelegram()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [userLocation, setUserLocation] = useState(DEFAULT_CENTER)
  const [places, setPlaces] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)

  // Load places from public API
  useEffect(() => {
    api.get('/places').then(r => {
      setPlaces(Array.isArray(r.data) ? r.data.map(p => ({
        ...p,
        coords: [parseFloat(p.lat) || 0, parseFloat(p.lng) || 0],
        tags: Array.isArray(p.tags) ? p.tags : JSON.parse(p.tags || '[]')
      })).filter(p => p.coords[0] !== 0) : [])
    }).catch(() => setPlaces([])).finally(() => setLoading(false))

    api.get('/friends').then(r => {
      setFriends((r.data || []).filter(f => f.share_location && f.lat && parseFloat(f.lat) !== 0))
    }).catch(() => {})
  }, [])

  // Group places by parent (for chains)
  const groupedPlaces = places.reduce((acc, p) => {
    if (!p.parent_id) {
      if (!acc[p.id]) acc[p.id] = { ...p, branches: [] }
    } else {
      if (!acc[p.parent_id]) acc[p.parent_id] = { branches: [] }
      acc[p.parent_id].branches = acc[p.parent_id].branches || []
      acc[p.parent_id].branches.push(p)
    }
    return acc
  }, {})
  const placesGrouped = Object.values(groupedPlaces).filter(p => p.name)

  const friendPlaces = friends.map(f => ({
    id: 'f_' + f.id, type: 'friends',
    name: f.name || f.username || 'Подруга',
    address: 'Обновлено недавно',
    coords: [parseFloat(f.lat), parseFloat(f.lng)],
    color: '#FF9800', emoji: '👩', tags: [], rating: 0, branches: []
  }))

  const allItems = [...placesGrouped, ...friendPlaces]
  const filtered = category === 'all' ? allItems
    : category === 'friends' ? friendPlaces
    : placesGrouped.filter(p => p.type === category)

  // Load Yandex Maps
  useEffect(() => {
    if (!YANDEX_KEY) return
    if (window.ymaps) { setMapLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_KEY}&lang=ru_RU`
    script.async = true
    script.onload = () => window.ymaps?.ready(() => setMapLoaded(true))
    script.onerror = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Geolocation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {}, { timeout: 5000 }
    )
  }, [])

  // Init map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current || !window.ymaps || !YANDEX_KEY) return
    window.ymaps.ready(() => {
      const map = new window.ymaps.Map(mapRef.current, {
        center: userLocation, zoom: 13, controls: ['zoomControl']
      })
      mapInstanceRef.current = map
      renderMarkers(map, filtered)
    })
  }, [mapLoaded])

  useEffect(() => {
    if (!mapInstanceRef.current || !window.ymaps) return
    mapInstanceRef.current.geoObjects.removeAll()
    renderMarkers(mapInstanceRef.current, filtered)
  }, [category, places, friends])

  function renderMarkers(map, items) {
    const userMark = new window.ymaps.Placemark(userLocation, {}, { preset: 'islands#pinkCircleDotIcon' })
    map.geoObjects.add(userMark)

    items.forEach(place => {
      if (!place.coords?.[0]) return
      const mark = new window.ymaps.Placemark(
        place.coords,
        { balloonContentHeader: place.name, balloonContentBody: place.address },
        { preset: 'islands#circleDotIcon', iconColor: place.color || '#E8437A' }
      )
      mark.events.add('click', () => { haptic('light'); setSelected(place) })
      map.geoObjects.add(mark)

      // Add branch markers too
      ;(place.branches || []).forEach(branch => {
        if (!branch.lat || parseFloat(branch.lat) === 0) return
        const bMark = new window.ymaps.Placemark(
          [parseFloat(branch.lat), parseFloat(branch.lng)],
          { balloonContentHeader: place.name, balloonContentBody: branch.address },
          { preset: 'islands#circleDotIcon', iconColor: place.color || '#E8437A' }
        )
        bMark.events.add('click', () => { haptic('light'); setSelected(place) })
        map.geoObjects.add(bMark)
      })
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Карта</h2>
        <button onClick={() => {
          navigator.geolocation?.getCurrentPosition(
            pos => {
              setUserLocation([pos.coords.latitude, pos.coords.longitude])
              if (mapInstanceRef.current) mapInstanceRef.current.setCenter([pos.coords.latitude, pos.coords.longitude], 14)
            },
            () => alert('Разреши геолокацию в настройках Telegram')
          )
        }} style={{ background: 'var(--pink-light)', border: 'none', borderRadius: 20, padding: '6px 12px', color: 'var(--pink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          📍 Моя позиция
        </button>
      </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { haptic('light'); setCategory(cat.id); setSelected(null) }}
              style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', border: 'none', background: category === cat.id ? 'var(--pink)' : 'var(--bg)', color: category === cat.id ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map or list */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {YANDEX_KEY ? (
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>
              🗺 Добавь VITE_YANDEX_MAPS_KEY для карты
            </div>
          </div>
        )}
        {!mapLoaded && YANDEX_KEY && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Загружаем карту...</p>
          </div>
        )}
      </div>

      {/* Places cards - horizontal scroll */}
      {!selected && (
        <div style={{ background: 'var(--white)', borderTop: '0.5px solid var(--border)', flexShrink: 0, paddingBottom: 100 }}>
          {loading ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {category === 'friends' ? '👯 Нет подруг с геолокацией' : '📍 Нет мест в этой категории'}
              </div>
              {category !== 'friends' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Добавь места через Панель администратора</div>
              )}
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                {filtered.length} мест{filtered.length !== 1 ? '' : 'о'}
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '4px 16px 12px' }}>
                {filtered.map(place => (
                  <div key={place.id} onClick={() => handlePlaceClick(place)}
                    style={{ flexShrink: 0, width: 140, background: 'var(--bg)', borderRadius: 12, padding: 12, cursor: 'pointer', border: '0.5px solid var(--border)' }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{place.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{place.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.address}</div>
                    {place.rating > 0 && <div style={{ fontSize: 11, color: '#FFB347', marginTop: 4, fontWeight: 700 }}>★ {place.rating}</div>}
                    {place.branches?.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--pink)', marginTop: 4, fontWeight: 700 }}>+{place.branches.length} адреса</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Selected place card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: 20, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', zIndex: 10, paddingBottom: 'max(90px, env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selected.type === 'cafe' ? 'var(--green-light)' : selected.type === 'spa' ? '#F3E5F5' : selected.type === 'friends' ? '#FFF3E0' : 'var(--pink-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {selected.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selected.address}</div>
                {selected.rating > 0 && <div style={{ fontSize: 12, color: '#FFB347', marginTop: 2 }}>★ {selected.rating}</div>}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <i className="ti ti-x" />
            </button>
          </div>

          {/* Branches */}
          {selected.branches?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Адреса:</div>
              {[{ address: selected.address, lat: selected.coords?.[0], lng: selected.coords?.[1] }, ...selected.branches].map((b, i) => (
                <div key={i} onClick={() => { if (mapInstanceRef.current && b.lat) mapInstanceRef.current.setCenter([parseFloat(b.lat), parseFloat(b.lng)], 16) }}
                  style={{ fontSize: 12, padding: '6px 0', borderBottom: i < selected.branches.length ? '0.5px solid var(--border)' : 'none', cursor: 'pointer', color: 'var(--text)' }}>
                  📍 {b.address}
                </div>
              ))}
            </div>
          )}

          {(selected.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {selected.tags.map(tag => <span key={tag} className="badge badge-pink" style={{ fontSize: 11 }}>{tag}</span>)}
            </div>
          )}

          {selected.description && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>{selected.description}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { haptic('medium'); window.open(`https://yandex.ru/maps/?rtext=~${selected.coords[0]},${selected.coords[1]}&rtt=auto`, '_blank') }}
              className="btn-primary" style={{ flex: 1 }}>
              <i className="ti ti-navigation" style={{ marginRight: 6 }} /> Маршрут
            </button>
            {selected.phone && (
              <button onClick={() => window.open(`tel:${selected.phone}`)} className="btn-outline" style={{ flex: 1 }}>Позвонить</button>
            )}
            {selected.website && (
              <button onClick={() => window.open(selected.website, '_blank')} className="btn-outline" style={{ flex: 1 }}>Сайт</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
