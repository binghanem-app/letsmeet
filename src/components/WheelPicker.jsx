import { useRef, useEffect } from 'react'

// iOS-style scrolling wheel picker (used for hour/minute/AM-PM in Create and
// Edit Plan's date/time pickers).
export default function WheelPicker({ items, value, onChange, width = 56 }) {
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
    <div style={{ position: 'relative', width, height: ITEM_H * 3, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)' }}>
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
            style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', scrollSnapAlign: 'center', font: "600 18px -apple-system", color: '#1F2933', cursor: 'pointer' }}
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
