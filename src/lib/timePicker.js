// Shared by Create Plan and Edit Plan's hour/minute/AM-PM wheel pickers.
export const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
export const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
export const AMPM = ['AM', 'PM']

export function to24(h, ap) {
  const n = parseInt(h)
  return ap === 'AM' ? (n === 12 ? 0 : n) : (n === 12 ? 12 : n + 12)
}

// Reverse of to24 — split a 24h hour into the 12h/AM-PM parts the picker uses.
export function from24(h24) {
  const ap = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return { hour: String(h12), ampm: ap }
}

// The wheel only offers 5-minute steps — round an arbitrary stored minute
// down to the nearest one so editing an older/odd-minute plan still lands on
// a valid option instead of silently mismatching.
export function roundMinuteTo5(min) {
  return String(Math.floor(min / 5) * 5).padStart(2, '0')
}
