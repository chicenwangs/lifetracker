// Sessions, cookies, passwords, login (FR-A1..A11, TECHNICAL §5).
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import { serial } from './serial';
import { z } from 'zod';
import { env } from './env';
import { sessionToken, sha256hex } from './crypto';
import * as rl from './ratelimit';
import * as sessionsRepo from './repo/sessions';
import * as usersRepo from './repo/users';
import { isoPlus, nowUtcIso } from '$lib/time';
import commonRaw from './common-passwords.txt?raw';

const H = 3_600_000;
const D = 24 * H;
export const REMEMBER_IDLE = 30 * D;
export const REMEMBER_ABS = 90 * D;
export const REMEMBER_RENEW_BELOW = 15 * D;
export const SESSION_IDLE = 12 * H;
export const SESSION_ABS = 7 * D;
const TOUCH_EVERY = 5 * 60_000;

// ---------- passwords ----------
const ARGON = {
	algorithm: 2 /* Argon2id (const enum, not importable) */,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
} as const;
const PARAMS_TAG = '$argon2id$v=19$m=19456,t=2,p=1$';

const COMMON = new Set(
	commonRaw
		.split(/\r?\n/)
		.map((l) => l.trim().toLowerCase())
		.filter((l) => l && !l.startsWith('#')),
);

export const passwordSchema = z
	.string()
	.min(10, 'Password needs 10+ characters.')
	.max(128, 'Password max 128 characters.')
	.refine((p) => !COMMON.has(p.toLowerCase()), 'That password is too common. Pick another.');

export function hashPassword(p: string): Promise<string> {
	return argonHash(p, ARGON);
}

let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
	dummy ??= argonHash('dummy-password-for-timing', ARGON);
	return dummy;
}

/** null/unknown hash -> verify dummy (same timing) -> false */
export async function verifyPassword(hash: string | null | undefined, p: string): Promise<boolean> {
	if (!hash) {
		await argonVerify(await dummyHash(), p).catch(() => false);
		return false;
	}
	try {
		return await argonVerify(hash, p);
	} catch {
		return false;
	}
}

export function needsRehash(hash: string): boolean {
	return !hash.startsWith(PARAMS_TAG);
}

// ---------- cookies ----------
export function cookieName(): string {
	return env().secureCookies ? '__Host-lt_session' : 'lt_session';
}

function setCookie(cookies: Cookies, token: string, remember: boolean): void {
	cookies.set(cookieName(), token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: env().secureCookies,
		...(remember ? { maxAge: REMEMBER_IDLE / 1000 } : {}),
	});
}

export function clearCookie(cookies: Cookies): void {
	cookies.delete(cookieName(), { path: '/', secure: env().secureCookies });
}

// ---------- sessions ----------
function toInfo(s: sessionsRepo.SessionRow): App.SessionInfo {
	return {
		id: s.id,
		remember: s.remember,
		expiresAt: s.expiresAt,
		absoluteExpiresAt: s.absoluteExpiresAt,
		lastSeenAt: s.lastSeenAt,
	};
}

export function createSession(
	userId: string,
	remember: boolean,
	meta: { userAgent?: string | null; ip?: string | null },
	cookies: Cookies,
	now: number = Date.now(),
): App.SessionInfo {
	const token = sessionToken();
	const nowIso = nowUtcIso(now);
	const row: sessionsRepo.SessionRow = {
		id: sha256hex(token),
		userId,
		remember,
		expiresAt: isoPlus(nowIso, remember ? REMEMBER_IDLE : SESSION_IDLE),
		absoluteExpiresAt: isoPlus(nowIso, remember ? REMEMBER_ABS : SESSION_ABS),
		createdAt: nowIso,
		lastSeenAt: nowIso,
		userAgent: meta.userAgent?.slice(0, 300) ?? null,
		ip: meta.ip ?? null,
	};
	sessionsRepo.insert(row);
	setCookie(cookies, token, remember);
	return toInfo(row);
}

export function loadSession(
	cookies: Cookies,
	now: number = Date.now(),
): { user: App.SafeUser; session: App.SessionInfo } | null {
	const token = cookies.get(cookieName());
	if (!token) return null;
	const sid = sha256hex(token);
	const r = sessionsRepo.getWithUser(sid);
	const nowIso = nowUtcIso(now);
	if (!r || !r.u.passwordHash || r.s.expiresAt <= nowIso || r.s.absoluteExpiresAt <= nowIso) {
		if (r) sessionsRepo.remove(sid);
		clearCookie(cookies);
		return null;
	}
	const session = slide(r.s, token, cookies, now);
	return { user: usersRepo.safe(r.u), session };
}

/** Sliding expiry. DB write max once per 5 min. Never past absolute. */
export function slide(
	s: sessionsRepo.SessionRow,
	token: string,
	cookies: Cookies,
	now: number = Date.now(),
): App.SessionInfo {
	if (now - Date.parse(s.lastSeenAt) < TOUCH_EVERY) return toInfo(s);
	const nowIso = nowUtcIso(now);
	let expiresAt = s.expiresAt;
	if (s.remember) {
		if (Date.parse(s.expiresAt) - now < REMEMBER_RENEW_BELOW) {
			expiresAt = isoPlus(nowIso, REMEMBER_IDLE);
			setCookie(cookies, token, true);
		}
	} else {
		expiresAt = isoPlus(nowIso, SESSION_IDLE);
	}
	if (expiresAt > s.absoluteExpiresAt) expiresAt = s.absoluteExpiresAt;
	sessionsRepo.touch(s.id, expiresAt, nowIso);
	return toInfo({ ...s, expiresAt, lastSeenAt: nowIso });
}

export function currentSid(cookies: Cookies): string | null {
	const t = cookies.get(cookieName());
	return t ? sha256hex(t) : null;
}

export function logout(cookies: Cookies): void {
	const sid = currentSid(cookies);
	if (sid) sessionsRepo.remove(sid);
	clearCookie(cookies);
}

// ---------- login ----------
export const LOGIN_PAIR_MAX = 5;
export const LOGIN_IP_MAX = 30;
export const LOGIN_USER_SLOW = 20;

export type LoginResult =
	{ ok: true; user: App.SafeUser } | { ok: false; status: 400 | 429; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function login(
	input: { username: string; password: string; remember: boolean },
	meta: { ip: string; userAgent: string | null },
	cookies: Cookies,
	opts: { now?: number; slowMs?: number } = {},
): Promise<LoginResult> {
	// one attempt at a time per client IP: limits are checked and recorded around the argon2 await
	return serial(`login:${meta.ip}`, () => loginOnce(input, meta, cookies, opts));
}

async function loginOnce(
	input: { username: string; password: string; remember: boolean },
	meta: { ip: string; userAgent: string | null },
	cookies: Cookies,
	opts: { now?: number; slowMs?: number },
): Promise<LoginResult> {
	const now = opts.now ?? Date.now();
	// usernames are [a-z0-9_.-]; anything else (e.g. "|" to forge a limit key) is just a wrong login
	const typed = input.username.trim().toLowerCase();
	const u = /^[a-z0-9_.-]{1,64}$/.test(typed) ? typed : '';
	const kPair = `login:u:${u}|${meta.ip}`;
	const kIp = `login:ip:${meta.ip}`;
	const kUser = `login:u:${u}`;

	for (const k of [kPair, kIp]) {
		const st = rl.check(k, now);
		if (st.locked)
			return { ok: false, status: 429, message: `Too many tries. Try again in ${st.minutesLeft} min.` };
	}
	if (rl.check(kUser, now).count >= LOGIN_USER_SLOW) await sleep(opts.slowMs ?? 2000);

	const row = u ? usersRepo.byUsername(u) : undefined;
	const ok = await verifyPassword(row?.passwordHash, input.password);
	if (!ok || !row) {
		const pair = rl.fail(kPair, LOGIN_PAIR_MAX, 15, now);
		const ip = rl.fail(kIp, LOGIN_IP_MAX, 15, now);
		rl.fail(kUser, 0, 15, now);
		if (pair.locked || ip.locked)
			return { ok: false, status: 429, message: 'Too many tries. Try again in 15 min.' };
		const left = LOGIN_PAIR_MAX - pair.count;
		return {
			ok: false,
			status: 400,
			message: `Wrong username or password. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
		};
	}

	rl.clear(kPair);
	if (row.passwordHash && needsRehash(row.passwordHash)) {
		usersRepo.setPasswordHash(row.id, await hashPassword(input.password));
	}
	// fixation: kill whatever session cookie came in
	const old = currentSid(cookies);
	if (old) sessionsRepo.remove(old);
	createSession(row.id, input.remember, { userAgent: meta.userAgent, ip: meta.ip }, cookies, now);
	return { ok: true, user: usersRepo.safe(row) };
}

/** same-origin path only. blocks //evil, /\evil, https://evil */
export function safeNext(next: string | null | undefined): string {
	if (!next || !/^\/(?![/\\])/.test(next)) return '/';
	try {
		const o = env().ORIGIN;
		const u = new URL(next, o);
		return u.origin === new URL(o).origin ? u.pathname + u.search + u.hash : '/';
	} catch {
		return '/';
	}
}

// ---------- password change ----------
export async function changePassword(
	user: App.SafeUser,
	current: string,
	next: string,
	cookies: Cookies,
	meta: { ip: string; userAgent: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
	const row = usersRepo.byId(user.id);
	if (!row || !(await verifyPassword(row.passwordHash, current)))
		return { ok: false, message: 'Current password is wrong.' };
	const p = passwordSchema.safeParse(next);
	if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? 'Bad password.' };
	usersRepo.setPasswordHash(user.id, await hashPassword(next));
	const sid = currentSid(cookies);
	const remember = sid ? (sessionsRepo.getWithUser(sid)?.s.remember ?? true) : true;
	sessionsRepo.removeAllFor(user.id); // others + current
	createSession(user.id, remember, meta, cookies); // rotate current
	return { ok: true };
}
