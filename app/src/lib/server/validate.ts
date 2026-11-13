// Shared zod pieces.
import { z } from 'zod';
import { isDate } from '$lib/time';
import { STATUSES } from '$lib/types';

export const zDate = z.string().refine(isDate, 'must be YYYY-MM-DD');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');
export const zIsoZ = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'must be UTC YYYY-MM-DDTHH:MM:SSZ')
	.refine((s) => {
		const t = Date.parse(s); // Feb 31 parses (rolls over): require a round trip
		return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 19) + 'Z' === s;
	}, 'bad instant');
/** an item type key (built-in `Work`… or custom `ity_…`); existence is checked against the owner's types in the repo */
export const zType = z
	.string()
	.regex(/^[A-Za-z0-9_]{1,40}$/, 'bad type')
	.nullable();
export const zStatus = z.enum(STATUSES);
export const zId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9a-z]{6,32}$`), 'bad id');
export const zTitle = z.string().trim().min(1, 'Title needed').max(300);
