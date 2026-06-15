function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function Avatar({ url, name, color, size = 38, style: extra }) {
  const base = {
    width: size, height: size, borderRadius: '50%',
    flexShrink: 0, ...extra,
  }

  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        style={{ ...base, objectFit: 'cover', display: 'block' }}
        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
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
