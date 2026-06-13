import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const GAPI_KEY = 'AIzaSyCNapPdmmlN0RO1vCFijGivCUcqtQLsJdM'

// ─── presets ─────────────────────────────────────────────────────────────────
const PRESETS = [
  { emoji: '🍽️', label: 'Dinner',    sub: 'Restaurant, anywhere' },
  { emoji: '☕',  label: 'Coffee',    sub: 'Quick café catch-up' },
  { emoji: '🍹',  label: 'Drinks',    sub: 'Bar or rooftop' },
  { emoji: '🎬',  label: 'Movies',    sub: 'Cinema night' },
  { emoji: '🌿',  label: 'Outdoors',  sub: 'Park, hike, or beach' },
  { emoji: '🏠',  label: 'Hang out',  sub: "Someone's place" },
  { emoji: '🎉',  label: 'Party',     sub: 'Celebrate something' },
  { emoji: '✈️',  label: 'Trip',      sub: 'Weekend getaway' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}
function distLabel(meters) {
  if (!meters) return ''
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']
function formatDateLabel(d) {
  if (!d) return 'No date set'
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}
function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ─── WheelPicker ─────────────────────────────────────────────────────────────
function WheelPicker({ items, value, onChange, width = 56 }) {
  const ref = useRef(null)
  const ITEM_H = 40
  const idx = items.indexOf(value)

  useEffect(() => {
    if (ref.current && idx >= 0) ref.current.scrollTop = idx * ITEM_H
  }, [idx])

  function onScroll() {
    const i = Math.round(ref.current.scrollTop / ITEM_H)
    if (items[i] !== undefined) onChange(items[i])
  }

  return (
    <div style={{ position: 'relative', width, height: ITEM_H * 3, overflow: 'hidden' }}>
      {/* selection band — behind scroll items */}
      <div style={{ position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H, background: '#F5F2EE', borderRadius: 10, pointerEvents: 'none', zIndex: 0 }}/>
      {/* fade top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to bottom, #FBF7F4, transparent)', pointerEvents: 'none', zIndex: 2 }}/>
      {/* fade bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to top, #FBF7F4, transparent)', pointerEvents: 'none', zIndex: 2 }}/>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ height: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory', paddingTop: ITEM_H, paddingBottom: ITEM_H, position: 'relative', zIndex: 1 }}
        className="no-scrollbar"
      >
        {items.map(item => (
          <div
            key={item}
            style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', scrollSnapAlign: 'center', font: "600 18px 'Plus Jakarta Sans'", color: '#1F2933', cursor: 'pointer' }}
            onClick={() => {
              onChange(item)
              const i = items.indexOf(item)
              ref.current.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 1 — Plan name ───────────────────────────────────────────────────────
function StepName({ value, onChange, onVibeChange }) {
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120) }, [])

  return (
    <div className="fade-up">
      <h2 style={{ margin: '0 0 5px', font: "600 26px 'Fredoka'", color: '#1F2933' }}>What's the plan?</h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#9A9087' }}>Give it a name your friends will recognise.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1.5px solid ${value.trim() ? '#FF6B4A' : '#EBE2DB'}`, borderRadius: 16, padding: '4px 15px', marginBottom: 26 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => { onChange(e.target.value); onVibeChange?.(null) }}
          placeholder="e.g. Friday night dinner"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 15px 'Plus Jakarta Sans'", color: '#1F2933', padding: '14px 0' }}
        />
        {value && <span onClick={() => { onChange(''); onVibeChange?.(null) }} style={{ fontSize: 19, color: '#C4BBB2', cursor: 'pointer' }}>×</span>}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B6ADA4', letterSpacing: .4, marginBottom: 12 }}>YOUR USUAL</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {PRESETS.map(p => (
          <div
            key={p.label}
            onClick={() => { onChange(p.label); onVibeChange?.(p.label) }}
            style={{ display: 'flex', alignItems: 'center', gap: 13, background: value === p.label ? '#FFF1EC' : '#fff', border: `1.5px solid ${value === p.label ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 16, padding: '12px 15px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 24, lineHeight: 1 }}>{p.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 15px 'Plus Jakarta Sans'", color: value === p.label ? '#FF6B4A' : '#1F2933' }}>{p.label}</div>
              <div style={{ fontSize: 12.5, color: '#9A9087', marginTop: 1 }}>{p.sub}</div>
            </div>
            {value === p.label && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2 — Location ────────────────────────────────────────────────────────
function StepPlace({ value, onChange }) {
  const [mode, setMode] = useState('search') // 'search' | 'type'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [nearby, setNearby] = useState([])
  const [suggested, setSuggested] = useState([])
  const [searching, setSearching] = useState(false)
  const [geo, setGeo] = useState(null)
  const [geoLabel, setGeoLabel] = useState('your location')
  const [typedName, setTypedName] = useState(value?.typed || '')
  const debounce = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setGeo(loc)
      // reverse geocode for label
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.lat},${loc.lng}&key=${GAPI_KEY}`)
        .then(r => r.json()).then(d => {
          const comp = d.results?.[0]?.address_components?.find(c => c.types.includes('locality') || c.types.includes('sublocality'))
          if (comp) setGeoLabel(comp.long_name)
        }).catch(() => {})
      loadNearby(loc)
    })
  }, [])

  async function loadNearby(loc) {
    try {
      const [nearRes, sugRes] = await Promise.all([
        fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GAPI_KEY, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName' },
          body: JSON.stringify({ includedTypes: ['restaurant','bar','cafe','movie_theater'], maxResultCount: 5, locationRestriction: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 800 } } }),
        }),
        fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GAPI_KEY, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName' },
          body: JSON.stringify({ includedTypes: ['park','shopping_mall','bowling_alley','night_club'], maxResultCount: 5, locationRestriction: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 1500 } } }),
        }),
      ])
      const [nearData, sugData] = await Promise.all([nearRes.json(), sugRes.json()])
      const toPlace = (p) => ({
        name: p.displayName?.text,
        sub: p.primaryTypeDisplayName?.text || p.formattedAddress?.split(',')[1]?.trim() || '',
        dist: distLabel(haversine(loc.lat, loc.lng, p.location?.latitude, p.location?.longitude)),
        lat: p.location?.latitude, lng: p.location?.longitude,
        address: p.formattedAddress,
      })
      setNearby((nearData.places || []).map(toPlace))
      setSuggested((sugData.places || []).map(toPlace))
    } catch (e) { /* silently ignore if blocked */ }
  }

  function handleSearch(q) {
    setQuery(q)
    if (q.trim() && isSelected) onChange(null)   // typing again clears the current pick
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); return }
    debounce.current = setTimeout(() => doSearch(q), 400)
  }

  async function doSearch(q) {
    setSearching(true)
    try {
      const body = { textQuery: q }
      if (geo) body.locationBias = { circle: { center: { latitude: geo.lat, longitude: geo.lng }, radius: 10000 } }
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GAPI_KEY, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResults((data.places || []).slice(0, 8).map(p => ({
        name: p.displayName?.text,
        sub: p.primaryTypeDisplayName?.text || p.formattedAddress?.split(',')[0] || '',
        dist: geo ? distLabel(haversine(geo.lat, geo.lng, p.location?.latitude, p.location?.longitude)) : '',
        lat: p.location?.latitude, lng: p.location?.longitude,
        address: p.formattedAddress,
      })))
    } catch (e) { setResults([]) }
    setSearching(false)
  }

  function selectPlace(p) {
    onChange({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, typed: null })
  }

  const isSelected = value && !value.typed
  const mapsUrl = value?.name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.name + (value.address ? ', ' + value.address : ''))}` : null

  return (
    <div className="fade-up">
      <h2 style={{ margin: '0 0 5px', font: "600 26px 'Fredoka'", color: '#1F2933' }}>Where to?</h2>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: '#9A9087' }}>Search a place, or just type the name.</p>

      {/* mode toggle */}
      <div style={{ display: 'flex', background: '#F5F2EE', borderRadius: 14, padding: 4, marginBottom: 18, gap: 4 }}>
        {['search', 'type'].map(m => (
          <div key={m} onClick={() => setMode(m)} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 11, background: mode === m ? '#fff' : 'transparent', font: "600 14px 'Plus Jakarta Sans'", color: mode === m ? '#1F2933' : '#9A9087', cursor: 'pointer', boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.07)' : 'none', transition: 'all .15s' }}>
            {m === 'search' ? 'Search map' : 'Type a name'}
          </div>
        ))}
      </div>

      {mode === 'search' ? (
        <div>
          {/* search input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: `1.5px solid ${query ? '#FF6B4A' : '#EBE2DB'}`, borderRadius: 14, padding: '4px 14px', marginBottom: 16 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3" strokeLinecap="round"/></svg>
            <input
              autoFocus
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search restaurants, bars, parks…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933', padding: '12px 0' }}
            />
            {searching && <div className="spin" style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid #F0E5DE', borderTopColor: '#FF6B4A', flexShrink: 0 }}/>}
            {query && !searching && <span onClick={() => { setQuery(''); setResults([]) }} style={{ fontSize: 18, color: '#C4BBB2', cursor: 'pointer' }}>×</span>}
          </div>

          {/* selected place */}
          {isSelected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFF1EC', border: '1.5px solid #FF6B4A', borderRadius: 14, padding: '12px 15px', marginBottom: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B4A" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933' }}>{value.name}</div>
                <div style={{ fontSize: 12, color: '#B6ADA4', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.address}</div>
              </div>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#FF6B4A', textDecoration: 'none', flexShrink: 0 }}>Open in Maps</a>}
              <span onClick={() => { onChange(null); setQuery(''); setResults([]) }} style={{ fontSize: 18, color: '#C4BBB2', cursor: 'pointer', flexShrink: 0 }}>×</span>
            </div>
          )}

          {/* search results — hidden once a place is selected */}
          {query && results.length > 0 && !isSelected && (
            <PlaceList label={null} places={results} onSelect={selectPlace} selected={value}/>
          )}
          {query && results.length === 0 && !searching && !isSelected && (
            <p style={{ textAlign: 'center', padding: '20px 0', fontSize: 13.5, color: '#9A9087' }}>No places found. Try another search.</p>
          )}

          {/* nearby (when no query and nothing selected) */}
          {!query && !isSelected && nearby.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B6ADA4', letterSpacing: .4, marginBottom: 10 }}>NEAREST TO YOU <span style={{ fontWeight: 400, textTransform: 'none' }}>via Google Maps</span></div>
              <PlaceList label={null} places={nearby} onSelect={selectPlace} selected={value}/>
            </>
          )}
          {!query && !isSelected && suggested.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B6ADA4', letterSpacing: .4, margin: '16px 0 10px' }}>SUGGESTED NEAR YOU</div>
              <PlaceList label={null} places={suggested} onSelect={selectPlace} selected={value}/>
            </>
          )}
          {!query && !isSelected && !nearby.length && !suggested.length && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: '#B6ADA4' }}>
              {geo ? `Showing places near ${geoLabel}` : 'Allow location to see nearby places'}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: `1.5px solid ${typedName ? '#FF6B4A' : '#EBE2DB'}`, borderRadius: 14, padding: '4px 14px', marginBottom: 14 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B6ADA4" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            <input
              autoFocus
              value={typedName}
              onChange={e => { setTypedName(e.target.value); onChange(e.target.value.trim() ? { name: e.target.value.trim(), typed: true } : null) }}
              placeholder="e.g. My place, The usual spot…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933', padding: '13px 0' }}
            />
            {typedName && <span onClick={() => { setTypedName(''); onChange(null) }} style={{ fontSize: 18, color: '#C4BBB2', cursor: 'pointer' }}>×</span>}
          </div>
          <div style={{ display: 'flex', gap: 9, padding: '12px 14px', background: '#F5F2EE', borderRadius: 13 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9087" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
            <span style={{ fontSize: 13, color: '#9A9087', lineHeight: 1.5 }}>Type any place name — no map pin needed. Great for homes or spots your friends already know.</span>
          </div>
        </div>
      )}
    </div>
  )
}

function PlaceList({ places, onSelect, selected }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 4 }}>
      {places.map((p, i) => {
        const sel = selected?.name === p.name
        return (
          <div key={i} onClick={() => onSelect(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? '#FFF1EC' : '#fff', border: `1.5px solid ${sel ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: sel ? '#FFE0D6' : '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={sel ? '#FF6B4A' : '#9A9087'} strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: sel ? '#FF6B4A' : '#1F2933', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: '#9A9087', marginTop: 1 }}>{p.sub}</div>
            </div>
            {p.dist && <span style={{ fontSize: 12, color: '#B6ADA4', flexShrink: 0 }}>{p.dist}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 3 — Date & Time ─────────────────────────────────────────────────────
const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55']
const AMPM = ['AM','PM']

function to24(h, ap) {
  const n = parseInt(h)
  return ap === 'AM' ? (n === 12 ? 0 : n) : (n === 12 ? 12 : n + 12)
}

function getDefaultTime() {
  const now = new Date()
  const rawNext = Math.ceil((now.getMinutes() + 1) / 5) * 5
  const h24 = rawNext >= 60 ? now.getHours() + 1 : now.getHours()
  const effMin = rawNext >= 60 ? 0 : rawNext
  if (h24 >= 24) return { hour: '12', minute: '05', ampm: 'AM' }
  const ap = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return { hour: String(h12), minute: String(effMin).padStart(2, '0'), ampm: ap }
}

function StepDateTime({ date, hour, minute, ampm, onDateChange, onHour, onMinute, onAmpm }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const isToday = isSameDay(date, today)

  // Min valid time for today: next 5-min slot from now
  const now = new Date()
  const rawNext = Math.ceil((now.getMinutes() + 1) / 5) * 5
  const minH24 = rawNext >= 60 ? now.getHours() + 1 : now.getHours()
  const minMin = rawNext >= 60 ? 0 : rawNext

  const availAmpm = isToday ? (minH24 < 12 ? AMPM : ['PM']) : AMPM

  function getAvailHours(ap) {
    if (!isToday) return HOURS
    return HOURS.filter(h => to24(h, ap) >= minH24)
  }

  function getAvailMinutes(h, ap) {
    if (!isToday) return MINUTES
    const h24 = to24(h, ap)
    if (h24 > minH24) return MINUTES
    if (h24 === minH24) return MINUTES.filter(m => parseInt(m) >= minMin)
    return [MINUTES[0]]
  }

  const availHours = getAvailHours(ampm)
  const availMinutes = getAvailMinutes(hour, ampm)

  // Snap to earliest valid slot when switching to/from today
  useEffect(() => {
    if (!isToday) return
    let curAmpm = ampm
    if (!availAmpm.includes(curAmpm)) {
      curAmpm = 'PM'; onAmpm('PM')
    }
    const hrs = getAvailHours(curAmpm)
    let curHour = hour
    if (!hrs.includes(curHour)) {
      curHour = hrs[0] || '12'; onHour(curHour)
    }
    const mins = getAvailMinutes(curHour, curAmpm)
    if (!mins.includes(minute)) {
      onMinute(mins[0] || '00')
    }
  }, [isToday])

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d))

  function prev() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function next() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  const timeLabel = `${hour}:${minute} ${ampm}`
  const dateLabel = date ? formatDateLabel(date) : 'No date'

  return (
    <div className="fade-up">
      <h2 style={{ margin: '0 0 5px', font: "600 26px 'Fredoka'", color: '#1F2933' }}>When works?</h2>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: '#9A9087' }}>Pick any date — even months ahead.</p>

      {/* calendar */}
      <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 20, padding: '14px 12px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div onClick={prev} style={{ width: 34, height: 34, borderRadius: 10, background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </div>
          <span style={{ font: "600 15px 'Fredoka'", color: '#1F2933' }}>{MONTHS[viewMonth]} {viewYear}</span>
          <div onClick={next} style={{ width: 34, height: 34, borderRadius: 10, background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#C4BBB2', padding: '3px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0' }}>
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`}/>
            const past = d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
            const sel = isSameDay(d, date)
            const tod = isSameDay(d, today)
            return (
              <div key={i} onClick={() => !past && onDateChange(sel ? null : d)} style={{ textAlign: 'center', padding: '7px 0', borderRadius: 9, cursor: past ? 'default' : 'pointer', background: sel ? '#FF6B4A' : 'transparent', color: sel ? '#fff' : past ? '#D5CFC8' : tod ? '#FF6B4A' : '#1F2933', fontWeight: sel || tod ? 700 : 500, fontSize: 13.5, outline: tod && !sel ? '2px solid #FFCFC4' : 'none', outlineOffset: -2 }}>
                {d.getDate()}
              </div>
            )
          })}
        </div>
      </div>

      {/* time */}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B6ADA4', letterSpacing: .4, marginBottom: 12 }}>TIME</div>
      <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 0, justifyContent: 'center', marginBottom: 12 }}>
        <WheelPicker key={`h-${ampm}-${isToday}`} items={availHours} value={hour} onChange={onHour} width={60}/>
        <span style={{ font: "700 22px 'Plus Jakarta Sans'", color: '#C4BBB2', padding: '0 4px', marginTop: -4 }}>:</span>
        <WheelPicker key={`m-${hour}-${ampm}-${isToday}`} items={availMinutes} value={minute} onChange={onMinute} width={60}/>
        <div style={{ width: 14 }}/>
        <WheelPicker key={`ap-${isToday}`} items={availAmpm} value={ampm} onChange={onAmpm} width={52}/>
      </div>

      {(date || hour) && (
        <div style={{ textAlign: 'center', font: "600 14px 'Plus Jakarta Sans'", color: '#FF6B4A', background: '#FFF1EC', borderRadius: 12, padding: '10px 16px' }}>
          {dateLabel} · {timeLabel}
        </div>
      )}
    </div>
  )
}

// ─── Step 4 — Invite ──────────────────────────────────────────────────────────
function StepInvite({ session, selectedIds, onToggle }) {
  const [tab, setTab] = useState('circles') // 'circles' | 'friends'
  const [circles, setCircles] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: gs }, { data: fs }] = await Promise.all([
      supabase.from('groups').select('id, name, color').eq('owner', session.user.id),
      supabase.from('friendships').select('requester, addressee').or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`).eq('status', 'accepted'),
    ])

    const COLORS = ['#FF6B4A','#5B7CFA','#12B886','#F5A623','#A78BFA','#EC6A9C']
    const circleList = (gs || []).map((g, i) => ({ ...g, color: g.color || COLORS[i % COLORS.length] }))
    const fIds = (fs || []).map(f => f.requester === session.user.id ? f.addressee : f.requester)

    if (fIds.length) {
      const [{ data: profiles }, { data: nicks }, { data: memberships }] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, username, avatar_color').in('id', fIds),
        supabase.from('friend_nicknames').select('friend_id, nickname').eq('user_id', session.user.id).in('friend_id', fIds),
        supabase.from('group_members').select('group_id, member').in('member', fIds),
      ])
      const nickMap = {}; (nicks || []).forEach(n => { nickMap[n.friend_id] = n.nickname })
      const memMap = {}; (memberships || []).forEach(m => { if (!memMap[m.member]) memMap[m.member] = []; memMap[m.member].push(m.group_id) })
      const friendList = (profiles || []).map(p => ({
        ...p,
        displayName: nickMap[p.id] || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
        groupIds: memMap[p.id] || [],
      }))
      setFriends(friendList)

      // build circles with member detail
      setCircles(circleList.map(c => ({
        ...c,
        members: friendList.filter(f => f.groupIds.includes(c.id)),
      })))
    } else {
      setCircles(circleList.map(c => ({ ...c, members: [] })))
    }
    setLoading(false)
  }

  // toggle whole circle
  function toggleCircle(c) {
    const ids = c.members.map(m => m.id)
    const allIn = ids.every(id => selectedIds.includes(id))
    ids.forEach(id => {
      if (allIn) { if (selectedIds.includes(id)) onToggle(id) }
      else { if (!selectedIds.includes(id)) onToggle(id) }
    })
  }

  return (
    <div className="fade-up">
      <h2 style={{ margin: '0 0 5px', font: "600 26px 'Fredoka'", color: '#1F2933' }}>Who's invited?</h2>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#9A9087' }}>Pick whole circles, or add individual friends.</p>

      {/* tab toggle */}
      <div style={{ display: 'flex', background: '#F5F2EE', borderRadius: 14, padding: 4, marginBottom: 18, gap: 4 }}>
        {['circles','friends'].map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 11, background: tab === t ? '#fff' : 'transparent', font: "600 14px 'Plus Jakarta Sans'", color: tab === t ? '#1F2933' : '#9A9087', cursor: 'pointer', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.07)' : 'none', transition: 'all .15s' }}>
            {t === 'circles' ? 'Circles' : 'All friends'}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 66, borderRadius: 16, background: '#F1E8E2' }}/>)}
        </div>
      ) : tab === 'circles' ? (
        circles.length === 0 ? (
          <Empty text="No circles yet" sub="Create circles on the Friends tab first."/>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {circles.map(c => {
              const allIn = c.members.length > 0 && c.members.every(m => selectedIds.includes(m.id))
              return (
                <div key={c.id} onClick={() => toggleCircle(c)} style={{ display: 'flex', alignItems: 'center', gap: 13, background: allIn ? '#FFF1EC' : '#fff', border: `1.5px solid ${allIn ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 16, padding: '13px 15px', cursor: 'pointer' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "600 15px 'Plus Jakarta Sans'", color: allIn ? '#FF6B4A' : '#1F2933' }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color: '#9A9087', marginTop: 2 }}>{c.members.length} {c.members.length === 1 ? 'person' : 'people'}</div>
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: allIn ? '#FF6B4A' : '#F5F2EE', border: `2px solid ${allIn ? '#FF6B4A' : '#E7DED7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                    {allIn && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        friends.length === 0 ? (
          <Empty text="No friends yet" sub="Add friends first, then invite them to plans."/>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {friends.map(f => {
              const sel = selectedIds.includes(f.id)
              // find which circle they're in
              const viaCircle = circles.find(c => f.groupIds.includes(c.id))
              return (
                <div key={f.id} onClick={() => onToggle(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: sel ? '#FFF1EC' : '#fff', border: `1.5px solid ${sel ? '#FF6B4A' : '#F1E8E2'}`, borderRadius: 16, padding: '11px 14px', cursor: 'pointer' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: f.avatar_color || '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: "600 14px 'Plus Jakarta Sans'", flexShrink: 0 }}>
                    {initials(f.displayName)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: sel ? '#FF6B4A' : '#1F2933' }}>{f.displayName}</div>
                    {viaCircle && <div style={{ fontSize: 12, color: '#9A9087', marginTop: 1 }}>via {viaCircle.name}</div>}
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: sel ? '#FF6B4A' : '#F5F2EE', border: `2px solid ${sel ? '#FF6B4A' : '#E7DED7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
                    {sel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7"/></svg>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

function Empty({ text, sub }) {
  return (
    <div style={{ background: '#fff', border: '1.5px dashed #E7DED7', borderRadius: 18, padding: '28px 20px', textAlign: 'center' }}>
      <p style={{ margin: '0 0 5px', font: "600 16px 'Fredoka'", color: '#1F2933' }}>{text}</p>
      <p style={{ margin: 0, fontSize: 13, color: '#9A9087' }}>{sub}</p>
    </div>
  )
}

// ─── Step 5 — Review ──────────────────────────────────────────────────────────
function StepReview({ title, place, date, hour, minute, ampm, inviteeCount }) {
  const dateLabel = date ? formatDateLabel(date) : 'Date TBD'
  const timeLabel = `${hour}:${minute} ${ampm}`
  const placeLabel = place ? place.name : 'TBD'

  return (
    <div className="fade-up">
      <h2 style={{ margin: '0 0 5px', font: "600 26px 'Fredoka'", color: '#1F2933' }}>Ready to send?</h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#9A9087' }}>Here's what your friends will see.</p>

      <div style={{ background: '#fff', border: '1px solid #F1E8E2', borderRadius: 22, overflow: 'hidden', marginBottom: 16 }}>
        {/* coral header */}
        <div style={{ background: 'linear-gradient(135deg, #FF6B4A 0%, #FF9070 100%)', padding: '22px 22px 18px' }}>
          <div style={{ font: "600 22px 'Fredoka'", color: '#fff', marginBottom: 2 }}>{title || 'Untitled plan'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)' }}>You're hosting · Let's meet up</div>
        </div>
        {/* details */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ReviewRow icon="📍" label="Where" value={placeLabel}/>
          <ReviewRow icon="📅" label="When" value={`${dateLabel} · ${timeLabel}`}/>
          <ReviewRow icon="👥" label="Invited" value={inviteeCount === 0 ? 'No one yet — add friends' : `${inviteeCount} friend${inviteeCount === 1 ? '' : 's'}`}/>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 15px', background: '#F0FAF5', borderRadius: 14, border: '1px solid #C3EDD8' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E9C6B" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
        <span style={{ fontSize: 13, color: '#0E9C6B', lineHeight: 1.5 }}>Friends can mark themselves as In, Out, or Maybe. You'll see responses in real time.</span>
      </div>
    </div>
  )
}

function ReviewRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: 18, lineHeight: 1.1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#B6ADA4', marginBottom: 2 }}>{label.toUpperCase()}</div>
        <div style={{ font: "600 14.5px 'Plus Jakarta Sans'", color: '#1F2933' }}>{value}</div>
      </div>
    </div>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({ title, inviteeCount, onSeeWhosComing, onBackHome }) {
  return (
    <div className="fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: 26, background: 'linear-gradient(135deg, #FF6B4A, #FF9070)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, boxShadow: '0 16px 32px -10px rgba(255,107,74,.55)' }}>
        <span style={{ fontSize: 40 }}>🎉</span>
      </div>
      <h2 style={{ margin: '0 0 8px', font: "600 28px 'Fredoka'", color: '#1F2933' }}>Invite sent!</h2>
      <p style={{ margin: '0 0 6px', font: "600 16px 'Plus Jakarta Sans'", color: '#1F2933' }}>{title}</p>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: '#9A9087', lineHeight: 1.5 }}>
        {inviteeCount > 0 ? `${inviteeCount} friend${inviteeCount === 1 ? '' : 's'} just got the invite.` : 'Your plan is ready.'}<br/>
        We'll let you know who's in.
      </p>
      <button onClick={onSeeWhosComing} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 18, background: '#FF6B4A', color: '#fff', font: "600 17px 'Fredoka'", cursor: 'pointer', boxShadow: '0 12px 26px -10px rgba(255,107,74,.75)', marginBottom: 12 }}>
        See who's coming
      </button>
      <button onClick={onBackHome} style={{ width: '100%', padding: 16, border: '1.5px solid #E7DED7', borderRadius: 18, background: '#fff', color: '#7B7268', font: "600 16px 'Fredoka'", cursor: 'pointer' }}>
        Back to home
      </button>
    </div>
  )
}

// ─── CreateScreen ─────────────────────────────────────────────────────────────
export default function CreateScreen({ session, onDone, onCancel, onViewPlan }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [createdPlanId, setCreatedPlanId] = useState(null)
  const [sending, setSending] = useState(false)

  // form state
  const [title, setTitle] = useState('')
  const [place, setPlace] = useState(null)
  const [date, setDate] = useState(new Date())
  const [hour, setHour] = useState(() => getDefaultTime().hour)
  const [minute, setMinute] = useState(() => getDefaultTime().minute)
  const [ampm, setAmpm] = useState(() => getDefaultTime().ampm)
  const [invitees, setInvitees] = useState([])
  const [vibe, setVibe] = useState(null)

  const TOTAL = 5

  function toggleInvitee(id) {
    setInvitees(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  function canContinue() {
    if (step === 0) return title.trim().length > 0
    if (step === 2) return !!date
    return true
  }

  async function send() {
    setSending(true)
    const h24 = ampm === 'PM'
      ? (parseInt(hour) === 12 ? 12 : parseInt(hour) + 12)
      : (parseInt(hour) === 12 ? 0 : parseInt(hour))
    const startsAt = date
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), h24, parseInt(minute), 0)
      : new Date()

    const { data: plan, error } = await supabase.from('plans').insert({
      host: session.user.id,
      title: title.trim(),
      place_name: place?.name || null,
      place_address: place?.address || null,
      place_lat: place?.lat || null,
      place_lng: place?.lng || null,
      starts_at: startsAt.toISOString(),
      time_label: `${hour}:${minute} ${ampm}`,
      vibe: vibe || null,
    }).select('id').single()

    if (!error && invitees.length) {
      await supabase.from('plan_invitees').insert(
        invitees.map(uid => ({ plan_id: plan.id, invitee: uid, rsvp: 'invited' }))
      )
      const { data: hp } = await supabase.from('profiles').select('first_name, last_name').eq('id', session.user.id).single()
      const hostName = hp ? `${hp.first_name || ''} ${hp.last_name || ''}`.trim() || 'Someone' : 'Someone'
      await supabase.from('notifications').insert(
        invitees.map(uid => ({
          recipient: uid,
          actor: session.user.id,
          kind: 'invite',
          plan_id: plan.id,
          body: `${hostName} invited you to "${title.trim()}"`,
        }))
      )
    }
    setCreatedPlanId(plan?.id)
    setSending(false)
    setDone(true)
  }

  if (done) {
    return (
      <div style={{ height: '100%', background: '#FBF7F4' }}>
        <SuccessScreen
          title={title}
          inviteeCount={invitees.length}
          onSeeWhosComing={() => { if (onViewPlan) { onViewPlan(createdPlanId) } else { onDone?.() } }}
          onBackHome={onDone}
        />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FBF7F4' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0', flexShrink: 0 }}>
        <button onClick={() => step === 0 ? onCancel?.() : setStep(s => s - 1)} style={{ border: 'none', background: '#F5F2EE', borderRadius: 12, padding: '9px 15px', font: "600 14px 'Plus Jakarta Sans'", color: '#7B7268', cursor: 'pointer' }}>
          {step === 0 ? 'Cancel' : '← Back'}
        </button>
        <span style={{ font: "600 14px 'Plus Jakarta Sans'", color: '#B6ADA4' }}>Step {step + 1} of {TOTAL}</span>
        {step > 0 && step < TOTAL - 1
          ? <button onClick={() => setStep(s => s + 1)} style={{ border: 'none', background: 'transparent', font: "600 14px 'Plus Jakarta Sans'", color: '#B6ADA4', cursor: 'pointer', padding: '9px 4px' }}>Skip</button>
          : <div style={{ width: 60 }}/>
        }
      </div>

      {/* progress bar */}
      <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
        <div style={{ height: 4, background: '#F1E8E2', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((step + 1) / TOTAL) * 100}%`, background: '#FF6B4A', borderRadius: 4, transition: 'width .3s' }}/>
        </div>
      </div>

      {/* step content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 24px' }}>
        {step === 0 && <StepName value={title} onChange={setTitle} onVibeChange={setVibe}/>}
        {step === 1 && <StepPlace value={place} onChange={setPlace}/>}
        {step === 2 && <StepDateTime date={date} hour={hour} minute={minute} ampm={ampm} onDateChange={setDate} onHour={setHour} onMinute={setMinute} onAmpm={setAmpm}/>}
        {step === 3 && <StepInvite session={session} selectedIds={invitees} onToggle={toggleInvitee}/>}
        {step === 4 && <StepReview title={title} place={place} date={date} hour={hour} minute={minute} ampm={ampm} inviteeCount={invitees.length}/>}
      </div>

      {/* bottom CTA */}
      <div style={{ padding: '10px 20px 20px', flexShrink: 0, background: '#FBF7F4', borderTop: '1px solid #F1E8E2' }}>
        {step < TOTAL - 1 ? (
          <button
            onClick={() => canContinue() && setStep(s => s + 1)}
            style={{ width: '100%', padding: 17, border: 'none', borderRadius: 18, background: canContinue() ? '#FF6B4A' : '#E7DED7', color: '#fff', font: "600 17px 'Fredoka'", cursor: canContinue() ? 'pointer' : 'default', boxShadow: canContinue() ? '0 12px 26px -10px rgba(255,107,74,.75)' : 'none', transition: 'all .2s' }}
          >
            {step === 3 && invitees.length > 0 ? `Continue · ${invitees.length} invited` : 'Continue'}
          </button>
        ) : (
          <button onClick={send} disabled={sending} style={{ width: '100%', padding: 17, border: 'none', borderRadius: 18, background: '#FF6B4A', color: '#fff', font: "600 17px 'Fredoka'", cursor: 'pointer', boxShadow: '0 12px 26px -10px rgba(255,107,74,.75)' }}>
            {sending ? 'Sending…' : 'Send invites 🎉'}
          </button>
        )}
      </div>
    </div>
  )
}
