import { beforeEach, describe, expect, it } from 'vitest';
import * as auth from '../../src/lib/server/auth';
import { runSetup, setupOpen } from '../../src/lib/server/setup';
import { createInvite, setSignupOpen, signup, signupOpen } from '../../src/lib/server/invites';
import * as sessionsRepo from '../../src/lib/server/repo/sessions';
import { freshDb, fakeCookies } from './helpers';

const PW = 'correct horse battery';
const IP = '1.2.3.4';
const meta = { ip: IP, userAgent: 'vitest' };

async function setupAdmin() {
	const r = await runSetup(
		{ token: 'setup-token-123', username: 'Jeremy', displayName: 'Jeremy', password: PW },
		IP,
	);
	if (!r.ok) throw new Error(r.message);
	return r.userId;
}

beforeEach(() => {
	freshDb();
});

describe('setup', () => {
	it('creates admin once, then closed', async () => {
		expect(setupOpen()).toBe(true);
		await setupAdmin();
		expect(setupOpen()).toBe(false);
		const again = await runSetup(
			{ token: 'setup-token-123', username: 'x', displayName: 'x', password: PW },
			IP,
		);
		expect(again).toMatchObject({ ok: false, status: 404 });
	});
	it('wrong token rejected + rate limited', async () => {
		for (let i = 0; i < 5; i++) {
			const r = await runSetup({ token: 'nope', username: 'jeremy', displayName: 'J', password: PW }, IP);
			expect(r.ok).toBe(false);
		}
		const r = await runSetup(
			{ token: 'setup-token-123', username: 'jeremy', displayName: 'J', password: PW },
			IP,
		);
		expect(r).toMatchObject({ ok: false, status: 429 });
	});
	it('setup disabled when SETUP_TOKEN empty', () => {
		freshDb({ SETUP_TOKEN: '' });
		expect(setupOpen()).toBe(false);
	});
	it('password rules: length + common list', async () => {
		const short = await runSetup(
			{ token: 'setup-token-123', username: 'j', displayName: 'J', password: 'short' },
			IP,
		);
		expect(short.ok).toBe(false);
		const common = await runSetup(
			{ token: 'setup-token-123', username: 'jeremy', displayName: 'J', password: 'QwertyUIOP' },
			IP,
		);
		expect(common).toMatchObject({ ok: false, message: expect.stringMatching(/common/) });
	});
});

describe('login', () => {
	beforeEach(async () => {
		await setupAdmin();
	});

	it('ok + remember sets Max-Age 30d', async () => {
		const c = fakeCookies();
		const r = await auth.login({ username: ' JEREMY ', password: PW, remember: true }, meta, c);
		expect(r.ok).toBe(true);
		const ck = c.jar.get('lt_session');
		expect(ck?.opts).toMatchObject({
			httpOnly: true,
			sameSite: 'lax',
			path: '/',
			secure: false,
			maxAge: 30 * 86400,
		});
		expect(auth.loadSession(c)?.user.username).toBe('jeremy');
	});

	it('no remember = browser-session cookie (no maxAge)', async () => {
		const c = fakeCookies();
		await auth.login({ username: 'jeremy', password: PW, remember: false }, meta, c);
		expect(c.jar.get('lt_session')?.opts.maxAge).toBeUndefined();
	});

	it('https ORIGIN -> __Host- cookie, secure', async () => {
		freshDb({ ORIGIN: 'https://lt.example.com' });
		await setupAdmin();
		const c = fakeCookies();
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c);
		expect(c.jar.get('__Host-lt_session')?.opts.secure).toBe(true);
	});

	it('same message for wrong pw and unknown user, tries count down, lock after 5', async () => {
		const c = fakeCookies();
		const a = await auth.login({ username: 'jeremy', password: 'wrongwrong1', remember: true }, meta, c);
		expect(a).toMatchObject({ ok: false, status: 400, message: 'Wrong username or password. 4 tries left.' });
		const b = await auth.login({ username: 'ghost', password: 'wrongwrong1', remember: true }, meta, c);
		expect(b).toMatchObject({ ok: false, message: 'Wrong username or password. 4 tries left.' });
		for (let i = 0; i < 3; i++)
			await auth.login({ username: 'jeremy', password: 'x'.repeat(10), remember: true }, meta, c);
		const locked = await auth.login(
			{ username: 'jeremy', password: 'x'.repeat(10), remember: true },
			meta,
			c,
		);
		expect(locked).toMatchObject({ ok: false, status: 429 });
		const evenRight = await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c);
		expect(evenRight).toMatchObject({
			ok: false,
			status: 429,
			message: expect.stringMatching(/Try again in \d+ min/),
		});
		// other IP still fine (admin not locked out)
		const other = await auth.login(
			{ username: 'jeremy', password: PW, remember: true },
			{ ...meta, ip: '9.9.9.9' },
			c,
		);
		expect(other.ok).toBe(true);
	});

	it('lock expires after 15 min', async () => {
		const c = fakeCookies();
		const t0 = Date.now();
		for (let i = 0; i < 5; i++)
			await auth.login({ username: 'jeremy', password: 'x'.repeat(10), remember: true }, meta, c, {
				now: t0,
			});
		const later = await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c, {
			now: t0 + 16 * 60_000,
		});
		expect(later.ok).toBe(true);
	});

	it('kills old session on login (fixation)', async () => {
		const c = fakeCookies();
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c);
		const sid1 = auth.currentSid(c);
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c);
		expect(sessionsRepo.getWithUser(sid1!)).toBeUndefined();
	});
});

describe('session expiry', () => {
	beforeEach(async () => {
		await setupAdmin();
	});

	it('no-remember: idle 12h -> dead', async () => {
		const c = fakeCookies();
		const t0 = Date.now();
		await auth.login({ username: 'jeremy', password: PW, remember: false }, meta, c, { now: t0 });
		expect(auth.loadSession(c, t0 + 11 * 3600_000)).not.toBeNull(); // slides to +12h from here
		expect(auth.loadSession(c, t0 + 11 * 3600_000 + 12 * 3600_000 + 1000)).toBeNull();
		expect(c.jar.has('lt_session')).toBe(false);
	});

	it('remember: slides, but hard cap 90 days', async () => {
		const c = fakeCookies();
		const t0 = Date.now();
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c, { now: t0 });
		const D = 86_400_000;
		for (let d = 20; d <= 80; d += 20) expect(auth.loadSession(c, t0 + d * D)).not.toBeNull();
		expect(auth.loadSession(c, t0 + 91 * D)).toBeNull();
	});

	it('remember: idle 31 days -> dead', async () => {
		const c = fakeCookies();
		const t0 = Date.now();
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, c, { now: t0 });
		expect(auth.loadSession(c, t0 + 31 * 86_400_000)).toBeNull();
	});
});

describe('safeNext', () => {
	it('only same-origin paths', () => {
		expect(auth.safeNext('/week?x=1')).toBe('/week?x=1');
		expect(auth.safeNext('//evil.com')).toBe('/');
		expect(auth.safeNext('/\\evil.com')).toBe('/');
		expect(auth.safeNext('https://evil.com')).toBe('/');
		expect(auth.safeNext('')).toBe('/');
		expect(auth.safeNext(null)).toBe('/');
	});
});

describe('password change', () => {
	it('kills other sessions, rotates current', async () => {
		await setupAdmin();
		const a = fakeCookies();
		const b = fakeCookies();
		const r1 = await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, a);
		await auth.login({ username: 'jeremy', password: PW, remember: true }, meta, b);
		if (!r1.ok) throw new Error();
		const oldA = auth.currentSid(a);
		const r = await auth.changePassword(r1.user, PW, 'new pass phrase 42', a, meta);
		expect(r.ok).toBe(true);
		expect(auth.loadSession(b)).toBeNull();
		expect(auth.currentSid(a)).not.toBe(oldA);
		expect(auth.loadSession(a)).not.toBeNull();
		const bad = await auth.changePassword(r1.user, 'wrong', 'another pass 42', a, meta);
		expect(bad.ok).toBe(false);
	});
});

describe('invites + signup', () => {
	it('open by default: no code needed, 5 accounts per IP per 15 min, usernames unique', async () => {
		await setupAdmin();
		expect(signupOpen()).toBe(true);
		const r = await signup({ username: 'neina', displayName: 'Neina', password: PW }, IP);
		expect(r.ok).toBe(true);
		expect(await signup({ username: 'neina', displayName: 'N', password: PW }, IP)).toMatchObject({
			ok: false,
			message: 'Username taken.',
		});
		for (let i = 0; i < 4; i++)
			expect((await signup({ username: `u${i}x`, displayName: 'U', password: PW }, IP)).ok).toBe(true);
		expect(await signup({ username: 'u9x', displayName: 'U', password: PW }, IP)).toMatchObject({
			ok: false,
			status: 429,
		});
	});
	it('invite-only: code needed, single use, generic error', async () => {
		const admin = await setupAdmin();
		setSignupOpen(false);
		expect(await signup({ username: 'nocode', displayName: 'N', password: PW }, IP)).toMatchObject({
			ok: false,
			message: 'Invite code needed.',
		});
		const { code } = createInvite(admin, { expiry: '1d', label: 'for Neina' });
		const ok = await signup(
			{ code: code.toLowerCase(), username: 'neina', displayName: 'Neina', password: PW },
			IP,
		);
		expect(ok.ok).toBe(true);
		const again = await signup({ code, username: 'neina2', displayName: 'N', password: PW }, IP);
		expect(again).toMatchObject({ ok: false, message: 'Invite code not valid.' });
		const junk = await signup(
			{ code: 'INV-0000-0000-0000', username: 'neina3', displayName: 'N', password: PW },
			IP,
		);
		expect(junk).toMatchObject({ ok: false, message: 'Invite code not valid.' });
		const c = fakeCookies();
		expect((await auth.login({ username: 'neina', password: PW, remember: true }, meta, c)).ok).toBe(true);
	});
});
