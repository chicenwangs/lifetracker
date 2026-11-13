// Database property values, filters and sorts (DESIGN §7, FEATURES PG-DB / PG-SORTFILTER). Pure, shared.
// Operator list per type is written here first, as the spec asks.

export const PROP_TYPES = [
	'title',
	'text',
	'number',
	'date',
	'checkbox',
	'select',
	'multi_select',
	'url',
] as const;
export type PropType = (typeof PROP_TYPES)[number];
export interface SelectOption {
	id: string;
	label: string;
	color: string;
}
export interface PropConfig {
	options?: SelectOption[];
}

export const OPS: Record<PropType, readonly string[]> = {
	title: ['contains', 'not_contains', 'is', 'is_empty', 'not_empty'],
	text: ['contains', 'not_contains', 'is', 'is_empty', 'not_empty'],
	url: ['contains', 'not_contains', 'is', 'is_empty', 'not_empty'],
	number: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'not_empty'],
	date: ['is', 'before', 'after', 'is_empty', 'not_empty'],
	checkbox: ['is'],
	select: ['is', 'is_not', 'is_empty', 'not_empty'],
	multi_select: ['contains', 'not_contains', 'is_empty', 'not_empty'],
};
export const OP_LABEL: Record<string, string> = { contains: 'contains', not_contains: "doesn't contain", is: 'is', is_not: 'is not', is_empty: 'is empty', not_empty: 'is not empty', eq: '=', ne: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', before: 'is before', after: 'is after' }; // prettier-ignore
export const NO_VALUE_OPS = ['is_empty', 'not_empty'];

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s); // prettier-ignore

/** check one value for a property. null = empty (always allowed, except an empty title shows "Untitled"). */
export function checkValue(type: PropType, v: unknown, config: PropConfig = {}): { ok: true; value: unknown } | { ok: false; error: string } {
	if (v === null || v === undefined || v === '') return { ok: true, value: type === 'checkbox' ? false : null };
	switch (type) {
		case 'title':
			return typeof v === 'string' && v.length <= 300 ? { ok: true, value: v.trim() || null } : { ok: false, error: 'Title: text up to 300 characters.' };
		case 'text':
			return typeof v === 'string' && v.length <= 10_000 ? { ok: true, value: v } : { ok: false, error: 'Text: up to 10,000 characters.' };
		case 'number': {
			const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : NaN;
			return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Number: type digits, like 42 or 3.5.' };
		}
		case 'date':
			return typeof v === 'string' && isDate(v) ? { ok: true, value: v } : { ok: false, error: 'Date: pick a date (YYYY-MM-DD).' };
		case 'checkbox':
			return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: 'Checkbox: on or off.' };
		case 'select':
			return typeof v === 'string' && config.options?.some((o) => o.id === v) ? { ok: true, value: v } : { ok: false, error: 'Select: pick one of the options.' };
		case 'multi_select':
			if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && config.options?.some((o) => o.id === x))) return { ok: false, error: 'Multi-select: pick from the options.' };
			return { ok: true, value: v.length ? [...new Set(v as string[])] : null };
		case 'url':
			return typeof v === 'string' && /^(https?:\/\/|mailto:)\S+$/i.test(v.trim()) && v.length <= 2000 ? { ok: true, value: v.trim() } : { ok: false, error: 'URL: must start with http://, https:// or mailto:.' };
	}
} // prettier-ignore

/** the value as plain text (display, contains-filters, sort fallback) */
export function asText(type: PropType, v: unknown, config: PropConfig = {}): string {
	if (v === null || v === undefined) return '';
	const opt = (id: unknown) => config.options?.find((o) => o.id === id)?.label ?? '';
	if (type === 'select') return opt(v);
	if (type === 'multi_select') return Array.isArray(v) ? v.map(opt).join(', ') : '';
	if (type === 'checkbox') return v ? 'Yes' : 'No';
	return String(v);
}

export interface Filter {
	prop: string;
	op: string;
	value?: unknown;
}
export interface ViewConfig {
	sort?: { prop: string; dir: 'asc' | 'desc' } | null;
	filters?: Filter[];
	conj?: 'and' | 'or';
	hidden?: string[];
	order?: string[];
}

const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

export function matches(type: PropType, op: string, v: unknown, want: unknown, config: PropConfig = {}): boolean {
	if (op === 'is_empty') return type === 'checkbox' ? v !== true : empty(v);
	if (op === 'not_empty') return type === 'checkbox' ? v === true : !empty(v);
	switch (type) {
		case 'number': {
			if (typeof v !== 'number' || typeof want !== 'number') return false;
			return { eq: v === want, ne: v !== want, gt: v > want, lt: v < want, gte: v >= want, lte: v <= want }[op] ?? false;
		}
		case 'date':
			if (typeof v !== 'string' || typeof want !== 'string') return false;
			return op === 'is' ? v === want : op === 'before' ? v < want : op === 'after' ? v > want : false;
		case 'checkbox':
			return (v === true) === (want === true);
		case 'select':
			return op === 'is' ? v === want : op === 'is_not' ? v !== want : false;
		case 'multi_select': {
			const has = Array.isArray(v) && v.includes(want);
			return op === 'contains' ? has : op === 'not_contains' ? !has : false;
		}
		default: {
			const a = asText(type, v, config).toLowerCase();
			const b = String(want ?? '').toLowerCase();
			return op === 'contains' ? a.includes(b) : op === 'not_contains' ? !a.includes(b) : op === 'is' ? a === b : false;
		}
	}
} // prettier-ignore

/** sort compare; empty values always last (both directions) */
export function compare(type: PropType, a: unknown, b: unknown, config: PropConfig = {}): number {
	if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
	if (type === 'number') return (a as number) - (b as number);
	if (type === 'checkbox') return Number(a) - Number(b);
	if (type === 'select') {
		const ix = (id: unknown) => config.options?.findIndex((o) => o.id === id) ?? 0;
		return ix(a) - ix(b);
	}
	return asText(type, a, config).localeCompare(asText(type, b, config), undefined, {
		numeric: true,
		sensitivity: 'base',
	});
}
