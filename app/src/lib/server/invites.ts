// Invite codes + signup (FR-A7). Code shown once, stored as HMAC.
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, txImmediate } from './db';
import { invites } from './schema';
import { formatCode, hmac, newId, normaliseCode, randomBase32 } from './crypto';
import { hashPassword, passwordSchema } from './auth';
import { usernameSchema } from './setup';
import * as rl from './ratelimit';
import * as usersRepo from './repo/users';
import * as meta from './repo/meta';
import { isoPlus, nowUtcIso } from '$lib/time';

const EXPIRY = { '1d': 1, '3d': 3, '7d': 7 } as const;
export const inviteCreateSchema = z
	.object({ expiry: z.enum(['1d', '3d', '7d']), label: z.string().trim().max(60).optional() })
	.strict();

export function createInvite(
	adminId: string,
	input: unknown,
): { code: string; id: string; expiresAt: string } {
	const p = inviteCreateSchema.parse(input);
	const raw = randomBase32(12);
	const now = nowUtcIso();
	const id = newId('inv');
	const expiresAt = isoPlus(now, EXPIRY[p.expiry] * 86_400_000);
	db()
		.insert(invites)
		.values({
			id,
			codeHash: hmac(raw),
			label: p.label ?? null,
			createdBy: adminId,
			expiresAt,
			createdAt: now,
		})
		.run();
	return { code: formatCode('INV', raw), id, expiresAt };
}

export function listInvites() {
	return db()
		.select({
			id: invites.id,
			label: invites.label,
			expiresAt: invites.expiresAt,
			usedAt: invites.usedAt,
			usedBy: invites.usedBy,
			revokedAt: invites.revokedAt,
			createdAt: invites.createdAt,
		})
		.from(invites)
		.orderBy(desc(invites.createdAt))
		.all();
}

export function revokeInvite(id: string): boolean {
	return (
		db()
			.update(invites)
			.set({ revokedAt: nowUtcIso() })
			.where(and(eq(invites.id, id), isNull(invites.usedAt), isNull(invites.revokedAt)))
			.run().changes > 0
	);
}

// Sign-ups: OPEN by default (anyone makes their own account). Admin can switch to invite-only.
const SIGNUP_KEY = 'signup_open';
export function signupOpen(): boolean {
	return meta.get(SIGNUP_KEY) !== '0';
}
export function setSignupOpen(open: boolean): void {
	meta.set(SIGNUP_KEY, open ? '1' : '0');
}
/** accounts one IP may create per 15 min while sign-up is open */
const OPEN_PER_IP = 5;

export const signupSchema = z
	.object({
		code: z.string().default(''),
		username: usernameSchema,
		displayName: z.string().trim().min(1, 'Display name needed.').max(60),
		password: passwordSchema,
	})
	.strict();

const MEMBER_COLORS = ['#0F766E', '#6D28D9', '#B45309'];
const BAD = 'Invite code not valid.';

export type SignupResult = { ok: true; userId: string } | { ok: false; status: 400 | 429; message: string };

export async function signup(input: unknown, ip: string): Promise<SignupResult> {
	const key = `signup:ip:${ip}`;
	const st = rl.check(key);
	if (st.locked)
		return { ok: false, status: 429, message: `Too many tries. Try again in ${st.minutesLeft} min.` };

	const p = signupSchema.safeParse(input);
	if (!p.success) return { ok: false, status: 400, message: p.error.issues[0]?.message ?? 'Bad input.' };

	if (signupOpen()) {
		const okKey = `signup:ok:${ip}`;
		const made = rl.check(okKey);
		if (made.locked)
			return {
				ok: false,
				status: 429,
				message: `Too many new accounts. Try again in ${made.minutesLeft} min.`,
			};
		if (usersRepo.byUsername(p.data.username)) return { ok: false, status: 400, message: 'Username taken.' };
		const hash = await hashPassword(p.data.password);
		const userId = newId('usr');
		const created = txImmediate(() => {
			if (usersRepo.byUsername(p.data.username)) return false;
			const color = MEMBER_COLORS[(usersRepo.count() - 1 + MEMBER_COLORS.length) % MEMBER_COLORS.length];
			usersRepo.createWithCalendar({
				id: userId,
				username: p.data.username,
				displayName: p.data.displayName,
				passwordHash: hash,
				role: 'member',
				color,
			});
			return true;
		});
		if (!created) return { ok: false, status: 400, message: 'Username taken.' };
		rl.fail(okKey, OPEN_PER_IP);
		return { ok: true, userId };
	}

	if (!p.data.code.trim()) return { ok: false, status: 400, message: 'Invite code needed.' };
	const norm = normaliseCode(p.data.code, 'INV');
	if (!norm) {
		rl.fail(key, 10);
		return { ok: false, status: 400, message: BAD };
	}
	if (usersRepo.byUsername(p.data.username)) return { ok: false, status: 400, message: 'Username taken.' };
	const hash = await hashPassword(p.data.password);
	const now = nowUtcIso();
	const userId = newId('usr');

	const ok = txImmediate(() => {
		const used = db()
			.update(invites)
			.set({ usedAt: now })
			.where(
				and(
					eq(invites.codeHash, hmac(norm)),
					isNull(invites.usedAt),
					isNull(invites.revokedAt),
					gt(invites.expiresAt, now),
				),
			)
			.run().changes;
		if (used !== 1) return false;
		const color = MEMBER_COLORS[(usersRepo.count() - 1 + MEMBER_COLORS.length) % MEMBER_COLORS.length];
		usersRepo.createWithCalendar({
			id: userId,
			username: p.data.username,
			displayName: p.data.displayName,
			passwordHash: hash,
			role: 'member',
			color,
		});
		db()
			.update(invites)
			.set({ usedBy: userId })
			.where(eq(invites.codeHash, hmac(norm)))
			.run();
		return true;
	});
	if (!ok) {
		rl.fail(key, 10);
		return { ok: false, status: 400, message: BAD };
	}
	return { ok: true, userId };
}
