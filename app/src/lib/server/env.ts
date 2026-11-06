// PSEUDO: zod schema, parse process.env ONCE, export frozen `env`.
// NODE_ENV enum dev|production|test
// DATABASE_PATH string ; SEED_DIR string
// ORIGIN url (no trailing slash)              -> secureCookies = ORIGIN.startsWith('https://')
// APP_SECRET string min 32                    (required all envs)
// SETUP_TOKEN string optional (empty = setup disabled)
// ADDRESS_HEADER optional ; TZ default Asia/Kuala_Lumpur
// on fail: print which var bad (never value) -> process.exit(1)
