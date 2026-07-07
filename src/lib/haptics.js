import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

// Thin wrapper around Capacitor Haptics — every call is fire-and-forget and
// swallows errors, since haptics are a "nice to have" that must never crash
// or block an action (and are a silent no-op on web/preview anyway).
function safe(fn) {
  try { fn()?.catch?.(() => {}) } catch { /* ignore */ }
}

export const haptics = {
  // General button taps, toggles, opening a sheet.
  tap: () => safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  // Selecting an option (RSVP choice, category pick, tab switch).
  select: () => safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  // A completed swipe action (delete revealed/triggered, swipe-back committed).
  swipeCommit: () => safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  // A meaningful success (message sent, plan created, profile saved).
  success: () => safe(() => Haptics.notification({ type: NotificationType.Success })),
  // A destructive/blocking action (delete, block, remove).
  warning: () => safe(() => Haptics.notification({ type: NotificationType.Warning })),
}
