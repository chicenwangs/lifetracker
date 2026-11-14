// In-process job runner (DESIGN §13, §19). One replica (ADR-001), so no leader election. Started after migrations,
// stopped before the DB closes. Claim due reminders in a txn, send outside it, record the result. One row = one send.
import * as webpush from 'web-push';
import { createHash } from 'node:crypto';
import { handle } from './db';
import { env } from './env';
import { newId } from './crypto';
import { sourceInfo, type Source } from './reminders';
import { isoPlus, nowUtcIso } from '$lib/time';

const db = () => handle().sqlite;
const LATE_MS = 60 * 60_000; // D-14: more than an hour late = "missed", shown once, marked late
const STUCK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export const pushEnabled = () => !!env().VAPID_PUBLIC_KEY && !!env().VAPID_PRIVATE_KEY;

// ---------- subscriptions ----------
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function subscribe(
	userId: string,
	sub: { endpoint: string; keys: { p256dh: string; auth: string } },
	ua: string | null,
) {
	const h = hash(sub.endpoint);
	db().prepare(`DELETE FROM push_subscriptions WHERE endpoint_hash = ?`).run(h); // same device re-subscribes / switches account
	db().prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint_hash, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		.run(newId('psub'), userId, h, sub.endpoint, sub.keys.p256dh, sub.keys.auth, ua?.slice(0, 300) ?? null, nowUtcIso()); // prettier-ignore
}
/** turning push off deletes our row at once: the push service may keep accepting for a while (ADR-006) */
export function unsubscribe(userId: string, endpoint: string): boolean {
	return (
		db()
			.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?`)
			.run(userId, hash(endpoint)).changes > 0
	);
}
export const subscriptionCount = (userId: string) =>
	(
		db()
			.prepare(`SELECT count(*) AS n FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL`)
			.get(userId) as { n: number }
	).n;

/** send to every live device of a user. Payload = title + route only (no private body, DESIGN §13). */
export async function pushTo(
	userId: string,
	payload: { title: string; body?: string; route: string },
): Promise<{ sent: number; failed: number; error?: string }> {
	if (!pushEnabled()) return { sent: 0, failed: 0 };
	const e = env();
	const subs = db().prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL`).all(userId) as { id: string; endpoint: string; p256dh: string; auth: string }[]; // prettier-ignore
	let sent = 0;
	let failed = 0;
	let error: string | undefined;
	for (const s of subs) {
		try {
			await webpush.sendNotification(
				{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
				JSON.stringify(payload),
				{
					vapidDetails: { subject: e.VAPID_SUBJECT ?? 'mailto:admin@localhost.invalid', publicKey: e.VAPID_PUBLIC_KEY as string, privateKey: e.VAPID_PRIVATE_KEY as string }, // prettier-ignore
					TTL: 3600,
					urgency: 'high', // FCM 'normal' waits for a sleeping Android phone to wake: reminders came late or not at all
				},
			);
			db().prepare(`UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?`).run(nowUtcIso(), s.id);
			sent++;
		} catch (err) {
			const code = (err as { statusCode?: number }).statusCode;
			if (code === 404 || code === 410)
				db().prepare(`UPDATE push_subscriptions SET revoked_at = ? WHERE id = ?`).run(nowUtcIso(), s.id);
			failed++;
			error = code === 404 || code === 410 ? 'device expired' : code === 401 || code === 403 ? 'push keys rejected' : 'push service error'; // prettier-ignore
			// never log the endpoint or keys (secrets)
			console.error(`[job] push failed: ${code ?? (err as Error).message?.slice(0, 80)}`);
		}
	}
	return { sent, failed, error };
}

// ---------- reminders tick ----------
type Claimed = { id: string; owner_id: string; source_type: Source; source_id: string; rule_kind: string; rel_value: number | null; rel_unit: string | null; due_at: string; attempts: number }; // prettier-ignore

export async function tick(now = Date.now()): Promise<number> {
	const t = nowUtcIso(now);
	db()
		.prepare(`UPDATE reminders SET status = 'scheduled' WHERE status = 'processing' AND claimed_at < ?`)
		.run(nowUtcIso(now - STUCK_MS));
	const claimed = db()
		.transaction(() => db().prepare(`UPDATE reminders SET status = 'processing', claimed_at = ? WHERE id IN (SELECT id FROM reminders WHERE status = 'scheduled' AND due_at <= ? ORDER BY due_at LIMIT 50) RETURNING *`).all(t, t) as Claimed[])(); // prettier-ignore
	for (const r of claimed) {
		const info = sourceInfo(r.owner_id, r.source_type, r.source_id);
		const set = (status: string, extra = '') => db().prepare(`UPDATE reminders SET status = ?, sent_at = ?, updated_at = ? ${extra} WHERE id = ?`).run(status, t, t, r.id); // prettier-ignore
		if (!info || !info.live) {
			set('cancelled');
			continue;
		}
		// re-check: a relative reminder follows its source; if it moved later, wait for the new time
		if (r.rule_kind === 'relative' && info.ref && r.rel_value && r.rel_unit) {
			const ms =
				{ minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[r.rel_unit as 'minute'] *
				r.rel_value;
			const due = isoPlus(info.ref, -ms);
			if (Date.parse(due) > now) {
				db().prepare(`UPDATE reminders SET status = 'scheduled', due_at = ? WHERE id = ?`).run(due, r.id);
				continue;
			}
		}
		const prefs = db().prepare(`SELECT notify_planner, notify_keep, notify_pages FROM users WHERE id = ?`).get(r.owner_id) as { notify_planner: number; notify_keep: number; notify_pages: number }; // prettier-ignore
		const on = { planner: prefs.notify_planner, keep: prefs.notify_keep, pages: prefs.notify_pages }[
			info.kind
		];
		if (!on) {
			set('cancelled', ", last_error = 'kind turned off'");
			continue;
		}
		const late = now - Date.parse(r.due_at) > LATE_MS;
		const res = await pushTo(r.owner_id, {
			title: info.title,
			body: late ? 'Missed reminder' : 'Reminder',
			route: info.route,
		});
		if (res.failed && !res.sent && r.attempts + 1 < MAX_ATTEMPTS) {
			// all devices failed: back off and retry (2, 4, 8, 16 min)
			db().prepare(`UPDATE reminders SET status = 'scheduled', attempts = attempts + 1, due_at = ?, last_error = 'push failed' WHERE id = ?`).run(isoPlus(t, 2 ** (r.attempts + 1) * 60_000), r.id); // prettier-ignore
			continue;
		}
		// in-app always gets it (inbox); "sent" = handed to the push service, never "delivered"
		set(late ? 'missed' : 'sent', res.failed && !res.sent ? ", last_error = 'push failed, in-app only'" : '');
	}
	return claimed.length;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export function start(): void {
	if (timer || env().JOBS_ENABLED !== 'true') return;
	timer = setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await tick();
		} catch (e) {
			console.error(`[job] reminders: ${(e as Error).message}`); // app keeps serving
		} finally {
			running = false;
		}
	}, env().REMINDER_POLL_INTERVAL_MS);
	timer.unref();
}
export function stop(): void {
	if (timer) clearInterval(timer);
	timer = null;
}
export const jobsRunning = () => !!timer;
