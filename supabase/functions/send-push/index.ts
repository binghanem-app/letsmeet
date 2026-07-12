import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APNS_KEY_ID    = Deno.env.get('APNS_KEY_ID')!
const APNS_TEAM_ID   = Deno.env.get('APNS_TEAM_ID')!
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY')! // contents of .p8 file
const BUNDLE_ID      = 'com.binghanem.letsmeet'
const APNS_HOST      = 'https://api.push.apple.com'

// ── JWT signing ──────────────────────────────────────────────────────────────

function toBase64Url(input: string | ArrayBuffer): string {
  const str = typeof input === 'string'
    ? btoa(unescape(encodeURIComponent(input)))
    : btoa(String.fromCharCode(...new Uint8Array(input)))
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeApnsJwt(): Promise<string> {
  const pem = APNS_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const header  = toBase64Url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
  const payload = toBase64Url(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
  const sigInput = `${header}.${payload}`

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(sigInput)
  )

  return `${sigInput}.${toBase64Url(sig)}`
}

// ── Send to APNs ─────────────────────────────────────────────────────────────

async function sendPush(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
  badge: number,
  subtitle?: string
): Promise<{ status: number; text: string }> {
  const jwt = await makeApnsJwt()

  const res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'authorization':   `bearer ${jwt}`,
      'apns-topic':      BUNDLE_ID,
      'apns-push-type':  'alert',
      'apns-priority':   '10',
      'content-type':    'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title, body, ...(subtitle ? { subtitle } : {}) }, sound: 'default', badge },
      ...data,
    }),
  })

  const text = await res.text()
  return { status: res.status, text }
}

// ── Notification copy by kind ─────────────────────────────────────────────────

function titleForKind(kind: string): string {
  const map: Record<string, string> = {
    message:     'New message 💬',
    invite:      "You're invited! 🎉",
    rsvp:        'Plan reply',
    request:     'Friend request 👋',
    reminder:    'Reminder ⏰',
    plan_update: 'Plan update',
  }
  return map[kind] ?? "Let's Meet"
}

// ── Map DB notification kind -> the data.type string the app listens for ─────────
// The iOS app (App.jsx) routes pushes by data.type using these literals:
//   'chat' | 'plan_invite' | 'plan_response' | 'friend_request'
// The DB stores kinds as: message | invite | rsvp | plan_update | request | reminder
// Without this remap, every push fails in-app routing / foreground handling.
function typeForKind(kind: string): string {
  const map: Record<string, string> = {
    message:     'chat',
    invite:      'plan_invite',
    rsvp:        'plan_response',
    plan_update: 'plan_response',
    request:     'friend_request',
    reminder:    'reminder',
  }
  return map[kind] ?? kind
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record  = payload.record

    if (!record) return new Response('No record', { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch recipient profile (token + notif prefs)
    const { data: profile } = await supabase
      .from('profiles')
      .select('apns_token, notif_push, notif_chat, notif_invite, notif_plan_responses, notif_friend_requests')
      .eq('id', record.recipient)
      .single()

    if (!profile?.apns_token) {
      console.log(`No apns_token for recipient ${record.recipient} (kind=${record.kind})`)
      return new Response('No token', { status: 200 })
    }

    // Ignore debug sentinel values that may be stored in apns_token
    if (!/^[0-9a-fA-F]{64}$/.test(profile.apns_token)) {
      console.log(`apns_token is not a valid device token (kind=${record.kind}): ${profile.apns_token.slice(0, 16)}`)
      return new Response('Invalid token', { status: 200 })
    }

    // Master push switch off → never send.
    if (profile.notif_push === false) return new Response('Push off', { status: 200 })

    // Respect per-kind opt-outs. ('dm' honors the same Chat Messages toggle —
    // previously it bypassed all prefs.)
    if ((record.kind === 'message' || record.kind === 'dm') && profile.notif_chat === false) return new Response('Opted out', { status: 200 })
    if (record.kind === 'invite'      && profile.notif_invite          === false) return new Response('Opted out', { status: 200 })
    if ((record.kind === 'rsvp' || record.kind === 'plan_update') && profile.notif_plan_responses === false) return new Response('Opted out', { status: 200 })
    if (record.kind === 'request'     && profile.notif_friend_requests === false) return new Response('Opted out', { status: 200 })

    let title    = titleForKind(record.kind)
    let body     = record.body ?? ''
    let subtitle: string | undefined
    const data: Record<string, string> = { type: typeForKind(record.kind) }
    if (record.plan_id) data.plan_id = record.plan_id
    // DM deep link: the app opens the thread with data.peer (= the sender).
    // Without it, tapping a DM push could only land on the Messages tab.
    if (record.kind === 'dm' && record.actor) data.peer = record.actor

    // Chat pushes read like a chat app (owner): title = SENDER NAME (bold),
    // body = the actual message. Group chat adds the plan title as subtitle.
    // The stored notification body keeps its old context-rich format (it also
    // feeds in-app lists and 1.0), so the message text is EXTRACTED here.
    if (record.kind === 'dm' || record.kind === 'message') {
      const { data: actor } = await supabase
        .from('profiles').select('first_name, last_name')
        .eq('id', record.actor).single()
      const senderName = actor
        ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || "Let's Meet"
        : "Let's Meet"
      title = senderName

      if (record.kind === 'message') {
        // App formats: `Name in "Plan": "msg"` / `Name sent a photo|GIF|voice message in "Plan"`
        const msg = body.match(/^.* in "(.*)": "([\s\S]*)"$/)
        const media = body.match(/^.* sent a (photo|GIF|voice message) in "(.*)"$/)
        if (msg) { subtitle = msg[1]; body = msg[2] }
        else if (media) {
          subtitle = media[2]
          body = media[1] === 'photo' ? '📷 Photo' : media[1] === 'GIF' ? 'GIF' : '🎤 Voice message'
        }
      } else {
        // DM format: `Name: msg` — strip the name (it's the title now).
        const prefix = `${senderName}: `
        if (body.startsWith(prefix)) body = body.slice(prefix.length)
      }
    }

    // App-icon badge = recipient's real unread notification count (incl. this one).
    const { count: unread } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', record.recipient)
      .eq('read', false)

    const { status, text } = await sendPush(profile.apns_token, title, body, data, unread ?? 1, subtitle)
    console.log(`APNs response: ${status} (type=${data.type}) → ${record.recipient} ${text}`)

    // APNs 410 = device token no longer valid; clear it so we stop trying.
    if (status === 410) {
      await supabase.from('profiles').update({ apns_token: null }).eq('id', record.recipient)
      console.log(`Cleared dead apns_token for ${record.recipient}`)
    }

    return new Response(JSON.stringify({ apns_status: status }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
