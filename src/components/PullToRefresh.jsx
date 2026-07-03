import { useRef, useState } from 'react'

// Pull-down-to-refresh wrapper. Becomes the scrollable container itself, so
// pass it the same `style`/`className` the original scroll <div> had.
// `onRefresh` is an async function; the spinner spins until it resolves.
export default function PullToRefresh({ onRefresh, children, style, className }) {
  const elRef    = useRef(null)
  const startY   = useRef(null)
  const pulling  = useRef(false)
  const [pull, setPull]           = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const THRESH = 68

  function atTop() { return (elRef.current?.scrollTop || 0) <= 0 }

  function onTouchStart(e) {
    if (refreshing || !atTop()) { pulling.current = false; return }
    startY.current = e.touches[0].clientY
    pulling.current = true
  }
  function onTouchMove(e) {
    if (!pulling.current || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && atTop()) {
      setPull(Math.min(dy * 0.5, THRESH + 24))   // rubber-band resistance
    } else if (dy <= 0) {
      pulling.current = false
      setPull(0)
    }
  }
  async function onTouchEnd() {
    if (!pulling.current) return
    pulling.current = false
    if (pull >= THRESH && !refreshing) {
      setRefreshing(true)
      setPull(THRESH)
      try { await onRefresh?.() } catch { /* ignore */ }
      setRefreshing(false)
      setPull(0)
    } else {
      setPull(0)
    }
  }

  const active = pull > 0 || refreshing
  const height = refreshing ? THRESH : pull

  return (
    <div
      ref={elRef}
      className={className}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div style={{
        height, overflow: 'hidden', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', paddingBottom: active ? 8 : 0,
        transition: pulling.current ? 'none' : 'height .22s ease',
      }}>
        {active && (
          <div
            className={refreshing ? 'spin' : ''}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              border: '2.5px solid #E7DED7', borderTopColor: '#FF6B4A',
              opacity: refreshing ? 1 : Math.min(pull / THRESH, 1),
              transform: refreshing ? 'none' : `rotate(${pull * 4}deg)`,
            }}
          />
        )}
      </div>
      {children}
    </div>
  )
}
