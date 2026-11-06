// PSEUDO
// sqlite = new Database(env.DATABASE_PATH)
// pragma journal_mode=WAL; foreign_keys=ON; busy_timeout=5000; synchronous=NORMAL
// db = drizzle(sqlite, { schema })
// tx(fn) = sqlite.transaction(fn)            ; txImmediate(fn) = transaction(fn).immediate
// migrateOnBoot() = migrate(db, { migrationsFolder: './drizzle' })
// healthy() -> try select 1 -> bool
