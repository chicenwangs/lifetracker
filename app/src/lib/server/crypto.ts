import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomBase32(n: number): string {
	let s = '';
	for (let i = 0; i < n; i++) s += CROCKFORD[randomInt(32)];
	return s;
}

/** prefix_ + 16 base32 chars (80 bits). */
export function newId(prefix: string): string {
	return `${prefix}_${randomBase32(16).toLowerCase()}`;
}

/** 160-bit session token. */
export function sessionToken(): string {
	return randomBase32(32);
}

export function sha256hex(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

export function hmacWith(secret: string, s: string): string {
	return createHmac('sha256', secret).update(s).digest('hex');
}

export function hmac(s: string): string {
	return hmacWith(env().APP_SECRET, s);
}

export function timingSafeEqualStr(a: string, b: string): boolean {
	// hash both so lengths match and length is not leaked
	const ha = createHash('sha256').update(a).digest();
	const hb = createHash('sha256').update(b).digest();
	return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** 12 raw chars -> 'LT-XXXX-XXXX-XXXX'. */
export function formatCode(prefix: 'LT' | 'INV', raw: string): string {
	return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/**
 * User input -> 12 canonical chars or null.
 * upper -> trim -> strip leading prefix + separators -> drop spaces/dashes -> O->0, I/L->1 -> 12 chars of alphabet.
 */
export function normaliseCode(input: string, prefix: 'LT' | 'INV'): string | null {
	let s = input.toUpperCase().trim();
	const re = new RegExp(`^${prefix}[\\s\\-_:]*`);
	s = s.replace(re, '');
	s = s.replace(/[\s\-_]/g, '');
	s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
	if (s.length !== 12) return null;
	for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
	return s;
}
