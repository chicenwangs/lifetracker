// PSEUDO (FR-A7)
// create(admin, {expiry:'1d'|'3d'|'7d', label?}) -> {plain code ONCE}
//   raw = randomBase32(12) ; insert {code_hash: hmac(raw), label, expires_at} ; return formatCode('INV', raw)
// list(admin) -> unused + used + revoked (never code)
// revoke(admin, id)
// signup({code, username, display_name, password}, ip):
//   ratelimit signup:ip 10 ; norm = normaliseCode(code,'INV') ; null -> generic error
//   zod passwordRule ; username unique check
//   tx: UPDATE invites SET used_by=?, used_at=now WHERE code_hash=hmac(norm) AND used_at IS NULL
//         AND revoked_at IS NULL AND expires_at>now  -> changes != 1 -> generic 'Invite not valid'
//       insert member user + default calendar ; set invites.used_by = new id
//   -> createSession(remember default ON)
