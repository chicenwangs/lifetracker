#!/usr/bin/env node
// Plain JS (runs in prod container). docker compose exec app node scripts/reset-password.mjs <username>
// PSEUDO
// username = argv[2] else usage exit 1
// db = better-sqlite3(DATABASE_PATH) ; user = by username NOCASE else 'no such user' exit 1
// pw = prompt hidden twice from stdin (never argv) ; check 10..128 ; match
// hash = argon2id same params ; UPDATE users SET password_hash
// DELETE sessions WHERE user_id ; DELETE rate_limits WHERE key LIKE 'login:u:<username>%'
// print 'Password reset. All sessions for <username> signed out.'
