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
  data: Record<string, string>
): Promise<number> {
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
      aps: { alert: { title, body }, sound: 'default', badge: 1 },
      ...data,
    }),
  })

  return res.status
}

// ── Notification copy by kind ─────────────────────────────────────────────────

function titleForKind(kind: string): string {
  const map: Record<string, string> = {
    message:     'New message 💬',
    invite:      "You're invited! 🎉",
    rsvp:        'New RSVP',
    request:     'Friend request 👋',
    reminder:    'Reminder ⏰',
    plan_update: 'Plan update',
  }
  return map[kind] ?? "Let's Meet"
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
      .select('apns_token, notif_chat, notif_invite')
      .eq('id', record.recipient)
      .single()

    if (!profile?.apns_token) return new Response('No token', { status: 200 })

    // Respect per-kind opt-outs
    if (record.kind === 'message' && profile.notif_chat  === false) return new Response('Opted out', { status: 200 })
    if (record.kind === 'invite'  && profile.notif_invite === false) return new Response('Opted out', { status: 200 })

    const title  = titleForKind(record.kind)
    const body   = record.body ?? ''
    const data: Record<string, string> = { type: record.kind }
    if (record.plan_id) data.plan_id = record.plan_id

    const status = await sendPush(profile.apns_token, title, body, data)

    return new Response(JSON.stringify({ apns_status: status }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
