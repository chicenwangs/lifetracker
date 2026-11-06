// PSEUDO — table rate_limits(key, count, window_start, locked_until). Window 15 min.
// check(key, max) -> {locked:boolean, minutesLeft, triesLeft}
//    row = get(key); if row.locked_until > now -> locked
//    if row.window_start older 15 min -> treat count 0
// fail(key, max, lockMin=15): count++ (reset if window old) ; if count >= max -> locked_until = now+lockMin
// clear(key)
// keys: login:u:<user>|<ip> (5), login:ip:<ip> (30), login:u:<user> (>20 -> 2 s delay, no lock),
//       redeem:<userId> (5), signup:ip:<ip> (10), setup:ip:<ip> (5)
