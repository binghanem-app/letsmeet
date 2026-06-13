import { readFileSync } from 'fs'
import { createSign } from 'crypto'

// ── fill these in ──────────────────────────────────────────────────────────────
const TEAM_ID    = 'QLTZRDA2Z4'
const CLIENT_ID  = 'com.binghanem.letsmeet.siwa'
const KEY_ID     = 'GLKHPH69UF'
const KEY_FILE   = process.argv[2]   // pass path to .p8 as argument
// ──────────────────────────────────────────────────────────────────────────────

if (!KEY_FILE) {
  console.error('Usage: node generate-apple-secret.mjs path/to/AuthKey_GLKHPH69UF.p8')
  process.exit(1)
}

const privateKey = readFileSync(KEY_FILE, 'utf8')
const now        = Math.floor(Date.now() / 1000)
const exp        = now + 15777000  // ~6 months

const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID })).toString('base64url')
const payload = Buffer.from(JSON.stringify({
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
})).toString('base64url')

const data = `${header}.${payload}`
const sign = createSign('SHA256')
sign.update(data)
const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url')

console.log('\n── Apple Client Secret (paste into Supabase) ──\n')
console.log(`${data}.${sig}`)
console.log('\n──────────────────────────────────────────────\n')
