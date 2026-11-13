// Item type rules shared by client + server (FEATURES §3b). Pure.
import type { ItemTypeDTO } from './types';

export const MAX_TYPES = 10; // D-24: 10 total incl. the 5 built-ins

/** seeded for every account (same rows as drizzle/0003). Keys = v1 values already in the data. */
export const BUILTIN_TYPES = [
	{ key: 'Work', name: 'Work', bg: '#CED3EE', ink: '#00003D', slug: 'work', shareDefault: false, countsDown: false, isDefault: false },
	{ key: 'Exam', name: 'Deadline', bg: '#B84A44', ink: '#FFFFFF', slug: 'deadline', shareDefault: false, countsDown: true, isDefault: false },
	{ key: 'Event', name: 'Event', bg: '#D3EECE', ink: '#00003D', slug: 'event', shareDefault: true, countsDown: false, isDefault: true },
	{ key: 'Hobby', name: 'Hobby', bg: '#FAEDB8', ink: '#00003D', slug: 'hobby', shareDefault: false, countsDown: false, isDefault: false },
	{ key: 'Dating', name: 'Date', bg: '#EECFD4', ink: '#00003D', slug: 'date', shareDefault: true, countsDown: false, isDefault: false },
] as const; // prettier-ignore

/** v1 quick-add words that keep working for the built-in they always meant */
export const LEGACY_SLUGS: Record<string, string> = { work: 'Work', exam: 'Exam', event: 'Event', hobby: 'Hobby', date: 'Dating', dating: 'Dating' }; // prettier-ignore

/** quick-add destination words: a type slug can't take these */
export const RESERVED_SLUGS = ['calendar', 'cal', 'both', 'planner', 'plan', 'timeline', 'block', 'remind'];

/** picker swatches for new types (curated, readable with navy or white text). Partner teal #0F766E left out. */
export const TYPE_SWATCHES = ['#CED3EE', '#D3EECE', '#FAEDB8', '#EECFD4', '#B84A44', '#C9DAE7', '#E5D4F5', '#F7D9B8', '#BFE3DC', '#E6E7F0', '#3D5A80', '#6D28D9']; // prettier-ignore

export const slugify = (name: string) =>
	name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]/g, '')
		.slice(0, 20);

function lum(hex: string): number {
	const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
		number,
		number,
		number,
	];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
	return (x + 0.05) / (y + 0.05);
}
/** navy or white, whichever reads better on bg */
export function inkFor(bg: string): '#00003D' | '#FFFFFF' {
	return contrast(bg, '#00003D') >= contrast(bg, '#FFFFFF') ? '#00003D' : '#FFFFFF';
}

/** slug -> key for the parser: the user's slugs, plus v1 words for built-ins they still own */
export function slugMap(types: Pick<ItemTypeDTO, 'key' | 'slug'>[]): Record<string, string> {
	const keys = new Set(types.map((t) => t.key));
	const m: Record<string, string> = {};
	for (const [w, k] of Object.entries(LEGACY_SLUGS)) if (keys.has(k)) m[w] = k;
	for (const t of types) m[t.slug] = t.key;
	return m;
}

export const defaultTypes = (): ItemTypeDTO[] =>
	BUILTIN_TYPES.map((t, i) => ({ ...t, id: `builtin_${i}`, position: i, builtin: true }));
