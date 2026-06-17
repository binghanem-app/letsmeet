import { useState } from 'react'

function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function Avatar({ url, name, color, size = 38, style: extra }) {
  // Track the specific url that failed so a changed prop re-attempts the image
  // (lists reuse this component). Falls back to initials on broken/blocked URLs
  // without ever touching DOM siblings.
  const [failedUrl, setFailedUrl] = useState(null)
  const base = {
    width: size, height: size, borderRadius: '50%',
    flexShrink: 0, ...extra,
  }

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt={name || ''}
        style={{ ...base, objectFit: 'cover', display: 'block' }}
        onError={() => setFailedUrl(url)}
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
