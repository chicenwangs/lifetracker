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
