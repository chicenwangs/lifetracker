// PSEUDO
// CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
// randomBase32(n) -> n chars via crypto.randomInt(32)
// newId(prefix) -> prefix + '_' + randomBase32(16)            (80 bits)
// sessionToken() -> randomBase32(32)                           (160 bits)
// sha256hex(s) ; hmac(s) = HMAC-SHA256(env.APP_SECRET, s) hex
// timingSafeEqualStr(a, b)
// formatCode(prefix, 12 chars) -> 'LT-XXXX-XXXX-XXXX' | 'INV-XXXX-XXXX-XXXX'
// normaliseCode(input, prefix) -> 12 chars | null:
//    upper -> trim -> strip leading prefix + separators -> drop spaces/dashes -> O->0, I/L->1
//    -> exactly 12 chars all in CROCKFORD else null
