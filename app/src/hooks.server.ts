// PSEUDO — runs on every request
//
// init():                              // once, before first request
//   env = parseEnv()                    // fail fast
//   mkdir dirname(DATABASE_PATH)
//   db = openDb(); migrate(db, './drizzle')
//   purgeTrash(); purgeExpiredKeys(); purgeExpiredSessions()
//   setInterval(purgeExpiredKeys, 1h); setInterval(purgeTrash, 24h)
//
// handle({event, resolve}):
//   1 proxy:   if env.ADDRESS_HEADER and header missing -> 400   (fail closed, not via tunnel)
//   2 origin:  if method not GET/HEAD and Origin != env.ORIGIN -> 403 (missing Origin = 403)
//   3 session: {user, session} = auth.loadSession(event.cookies) ; auth.slide(session) (max 1 write / 5 min)
//              event.locals.user = user ; event.locals.session = session
//   4 guard:   public = /login /signup /setup /healthz /cal/*.ics + static
//              if !user and !public:
//                 /api/*  -> 401 json
//                 else    -> redirect /login?next=<path>   (path only)
//   5 res = resolve(event)
//   6 headers: Referrer-Policy same-origin, X-Content-Type-Options nosniff,
//              Permissions-Policy camera=(), microphone=(), geolocation=()
//   return res
//
// handleError: log code + path only (never tokens/cookies/body). return {code:'internal', message:'Something broke'}
