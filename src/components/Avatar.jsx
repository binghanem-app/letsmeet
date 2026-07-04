import { useState, useRef, useEffect } from 'react'

function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function Avatar({ url, name, color, size = 38, style: extra }) {
  // Retry transient image load failures (flaky mobile network) a couple of times
  // before falling back to initials. Otherwise a single blip permanently downgrades
  // the avatar to initials until the component remounts — which is why some photos
  // "sometimes" don't show and reappear after leaving/re-entering a screen.
  const [failed, setFailed] = useState(false)
  const [bust, setBust]     = useState(0)   // cache-bust to force a fresh <img> load
  const retries = useRef(0)

  // Reset when the url prop changes (lists reuse this component across users).
  useEffect(() => { setFailed(false); setBust(0); retries.current = 0 }, [url])

  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, ...extra }

  if (url && !failed) {
    const src = bust ? `${url}${url.includes('?') ? '&' : '?'}retry=${bust}` : url
    return (
      <img
        key={src}
        src={src}
        alt={name || ''}
        style={{ ...base, objectFit: 'cover', display: 'block' }}
        onError={() => {
          if (retries.current < 2) {
            retries.current += 1
            const n = retries.current
            setTimeout(() => setBust(n), 500 * n)   // 0.5s, then 1s
          } else {
            setFailed(true)
          }
        }}
      />
    )
  }

  return (
    <div style={{
      ...base,
      background: color || '#A78BFA',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', font: `700 ${Math.round(size * 0.34)}px -apple-system`,
    }}>
      {initials(name)}
    </div>
  )
}
