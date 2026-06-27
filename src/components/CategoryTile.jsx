import coffee from '../assets/categories/coffee.png'
import dinner from '../assets/categories/dinner.png'
import movies from '../assets/categories/movies.png'
import hangout from '../assets/categories/hangout.png'
import outdoors from '../assets/categories/outdoors.png'
import trip from '../assets/categories/trip.png'
import custom from '../assets/categories/custom.png'

// Maps a plan's vibe (the preset label) to its illustrated tile. Anything that
// isn't one of the six presets — including typed/custom plans (vibe null) —
// falls back to the "custom" tile (calendar + sparkles).
export const CATEGORY_IMG = {
  Coffee: coffee,
  Dinner: dinner,
  Movies: movies,
  'Hang out': hangout,
  Outdoors: outdoors,
  Trip: trip,
}

export default function CategoryTile({ vibe, size = 50, radius, style }) {
  const src = CATEGORY_IMG[vibe] || custom
  const r = radius != null ? radius : Math.round(size * 0.3)
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size, borderRadius: r, objectFit: 'cover', display: 'block', flexShrink: 0, ...style }}
    />
  )
}
