// PSEUDO (FR-S2..S7, TECHNICAL §7)
// create(me, {permission, expiry:'1h'|'24h'|'7d', visible_types[], hidden_as}) -> plain 'LT-...' ONCE
//   calendar = my default ; raw = randomBase32(12) ; insert share_keys {key_hash: hmac(raw), ...}
// listUnused(me) -> keys created_by me AND used_at NULL AND revoked NULL AND not expired
// revoke(me, id) -> set revoked_at (own only else 404)
// redeem(me, input):
//   if ratelimit locked redeem:me -> 429
//   norm = normaliseCode(input,'LT') ; null -> fail + generic
//   txImmediate:
//     UPDATE share_keys SET used_by=me, used_at=now WHERE key_hash=hmac(norm) AND used_at IS NULL
//        AND revoked_at IS NULL AND expires_at>now AND created_by<>me   -> changes!=1 -> fail + generic
//     key = select it
//     INSERT grants ... ON CONFLICT(calendar_id, grantee_id) DO UPDATE SET permission, visible_types,
//        hidden_as, in_overlap=1, revoked_at=NULL
//   return grant summary (owner name)
// purgeExpired(): delete unused keys past expiry
