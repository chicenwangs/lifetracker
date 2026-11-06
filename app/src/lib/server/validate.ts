// Shared zod pieces.
import { z } from 'zod';
import { isDate } from '$lib/time';
import { STATUSES, TYPES } from '$lib/types';

export const zDate = z.string().refine(isDate, 'must be YYYY-MM-DD');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');
export const zIsoZ = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'must be UTC YYYY-MM-DDTHH:MM:SSZ')
	.refine((s) => !Number.isNaN(Date.parse(s)), 'bad instant');
export const zType = z.enum(TYPES).nullable();
export const zStatus = z.enum(STATUSES);
export const zId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9a-z]{6,32}$`), 'bad id');
export const zTitle = z.string().trim().min(1, 'Title needed').max(300);
