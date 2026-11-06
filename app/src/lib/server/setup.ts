// First run (FR-A6). /setup 404 once app_meta.setup_done = '1'.
import { z } from 'zod';
import { env } from './env';
import { txImmediate } from './db';
import { timingSafeEqualStr } from './crypto';
import { hashPassword, passwordSchema } from './auth';
import * as rl from './ratelimit';
import * as meta from './repo/meta';
import * as usersRepo from './repo/users';

export const usernameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9_.-]{3,32}$/, 'Username: 3-32 chars, letters, numbers, . _ -');

export const setupSchema = z
	.object({
		token: z.string().min(1),
		username: usernameSchema,
		displayName: z.string().trim().min(1, 'Display name needed.').max(60),
		password: passwordSchema,
	})
	.strict();

export function isSetupDone(): boolean {
	return meta.get('setup_done') === '1';
}

/** false -> route must 404 */
export function setupOpen(): boolean {
	return !isSetupDone() && env().SETUP_TOKEN.length > 0;
}

export type SetupResult =
	{ ok: true; userId: string } | { ok: false; status: 400 | 404 | 429; message: string };

export async function runSetup(input: unknown, ip: string): Promise<SetupResult> {
	if (!setupOpen()) return { ok: false, status: 404, message: 'Not found' };
	const key = `setup:ip:${ip}`;
	const st = rl.check(key);
	if (st.locked)
		return { ok: false, status: 429, message: `Too many tries. Try again in ${st.minutesLeft} min.` };

	const p = setupSchema.safeParse(input);
	if (!p.success) return { ok: false, status: 400, message: p.error.issues[0]?.message ?? 'Bad input.' };
	if (!timingSafeEqualStr(p.data.token, env().SETUP_TOKEN)) {
		rl.fail(key, 5);
		return { ok: false, status: 400, message: 'Setup token is wrong.' };
	}
	const hash = await hashPassword(p.data.password);
	const created = txImmediate(() => {
		if (isSetupDone() || usersRepo.count() > 0) return null;
		const u = usersRepo.createWithCalendar({
			username: p.data.username,
			displayName: p.data.displayName,
			passwordHash: hash,
			role: 'admin',
			color: '#1C1917',
		});
		meta.set('setup_done', '1');
		return u;
	});
	if (!created) return { ok: false, status: 404, message: 'Not found' };
	rl.clear(key);
	return { ok: true, userId: created.id };
}
