// Share codes (FR-S2..S7, rev 2026-11-08: view-only). Code `LT-XXXX-XXXX-XXXX` shown ONCE, stored as HMAC.
// Single use. Redeem -> grant on the code owner's calendar for the redeemer. Mutual = both make + both redeem.
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, txImmediate } from '../db';
import { grants, shareKeys } from '../schema';
import { formatCode, hmac, newId, normaliseCode, randomBase32 } from '../crypto';
import * as calendarsRepo from './calendars';
import * as rl from '../ratelimit';
import { bad } from '../http';
import { isoPlus, nowUtcIso } from '$lib/time';
import * as itemTypes from './itemtypes';
import { MAX_TYPES } from '$lib/itemtypes';

const EXPIRY_H = { '24h': 24, '7d': 24 * 7 } as const;
export const shareKeyCreateSchema = z
	.object({
		types: z.array(z.string().max(40)).max(MAX_TYPES + 2),
		hiddenAs: z.enum(['busy', 'none']),
		expiry: z.enum(['24h', '7d']),
	})
	.strict();

export function create(meId: string, input: unknown): { id: string; code: string; expiresAt: string } {
	const p = shareKeyCreateSchema.parse(input);
	const ok = new Set([...itemTypes.list(meId).map((t) => t.key), 'None', 'Blocks']);
	if (p.types.some((t) => !ok.has(t))) bad('unknown type in the share list', 'bad_type');
	if (listUnused(meId).length >= 20) bad('You have 20 open codes. Cancel some first.');
	const cal = calendarsRepo.defaultFor(meId);
	const raw = randomBase32(12);
	const now = nowUtcIso();
	const id = newId('shk');
	const expiresAt = isoPlus(now, EXPIRY_H[p.expiry] * 3_600_000);
	db()
		.insert(shareKeys)
		.values({
			id,
			calendarId: cal.id,
			createdBy: meId,
			keyHash: hmac(raw),
			permission: 'view',
			visibleTypes: [...new Set(p.types)],
			hiddenAs: p.hiddenAs,
			expiresAt,
			createdAt: now,
		})
		.run();
	return { id, code: formatCode('LT', raw), expiresAt };
}

/** my codes nobody has used yet (not expired, not cancelled) */
export function listUnused(meId: string) {
	const now = nowUtcIso();
	return db()
		.select({
			id: shareKeys.id,
			visibleTypes: shareKeys.visibleTypes,
			hiddenAs: shareKeys.hiddenAs,
			expiresAt: shareKeys.expiresAt,
			createdAt: shareKeys.createdAt,
		})
		.from(shareKeys)
		.where(
			and(
				eq(shareKeys.createdBy, meId),
				isNull(shareKeys.usedAt),
				isNull(shareKeys.revokedAt),
				gt(shareKeys.expiresAt, now),
			),
		)
		.orderBy(desc(shareKeys.createdAt))
		.all();
}

export function revoke(meId: string, id: string): boolean {
	return (
		db()
			.update(shareKeys)
			.set({ revokedAt: nowUtcIso() })
			.where(
				and(
					eq(shareKeys.id, id),
					eq(shareKeys.createdBy, meId),
					isNull(shareKeys.usedAt),
					isNull(shareKeys.revokedAt),
				),
			)
			.run().changes > 0
	);
}

const BAD = 'That code is not valid. Check it or ask for a new one.';
export type RedeemResult =
	{ ok: true; grantId: string; calendarId: string } | { ok: false; status: 400 | 429; message: string };

/** FR-S4..S6: single use, generic error, 5 bad tries / 15 min per user, never own, re-redeem replaces settings */
export function redeem(meId: string, input: string): RedeemResult {
	const key = `redeem:${meId}`;
	const st = rl.check(key);
	if (st.locked)
		return { ok: false, status: 429, message: `Too many tries. Try again in ${st.minutesLeft} min.` };
	const norm = normaliseCode(input, 'LT');
	if (!norm) {
		rl.fail(key, 5);
		return { ok: false, status: 400, message: BAD };
	}
	const mine = calendarsRepo.defaultFor(meId);
	const now = nowUtcIso();
	const r = txImmediate((): RedeemResult => {
		const k = db()
			.select()
			.from(shareKeys)
			.where(
				and(
					eq(shareKeys.keyHash, hmac(norm)),
					isNull(shareKeys.usedAt),
					isNull(shareKeys.revokedAt),
					gt(shareKeys.expiresAt, now),
				),
			)
			.get();
		if (!k) return { ok: false, status: 400, message: BAD };
		if (k.calendarId === mine.id || k.createdBy === meId)
			return {
				ok: false,
				status: 400,
				message: "That's your own code. Send it to the other person instead.",
			};
		db().update(shareKeys).set({ usedAt: now, usedBy: meId }).where(eq(shareKeys.id, k.id)).run();
		const existing = db()
			.select({ id: grants.id })
			.from(grants)
			.where(and(eq(grants.calendarId, k.calendarId), eq(grants.granteeId, meId)))
			.get();
		const settings = {
			permission: 'view' as const,
			visibleTypes: k.visibleTypes,
			hiddenAs: k.hiddenAs,
			revokedAt: null,
		};
		if (existing) {
			db().update(grants).set(settings).where(eq(grants.id, existing.id)).run();
			return { ok: true, grantId: existing.id, calendarId: k.calendarId };
		}
		const id = newId('grt');
		db()
			.insert(grants)
			.values({ id, calendarId: k.calendarId, granteeId: meId, inOverlap: true, createdAt: now, ...settings })
			.run();
		return { ok: true, grantId: id, calendarId: k.calendarId };
	});
	if (!r.ok) rl.fail(key, 5);
	return r;
}
