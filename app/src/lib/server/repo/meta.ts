import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appMeta } from '../schema';

export function get(key: string): string | undefined {
	return db().select().from(appMeta).where(eq(appMeta.key, key)).get()?.value;
}

export function set(key: string, value: string): void {
	db()
		.insert(appMeta)
		.values({ key, value })
		.onConflictDoUpdate({ target: appMeta.key, set: { value } })
		.run();
}

/** keys with a prefix (digest marks are purged in the job tick; app_meta is tiny) */
export function keys(prefix: string): string[] {
	return db()
		.select({ key: appMeta.key })
		.from(appMeta)
		.all()
		.map((r) => r.key)
		.filter((k) => k.startsWith(prefix));
}

export function del(key: string): void {
	db().delete(appMeta).where(eq(appMeta.key, key)).run();
}
