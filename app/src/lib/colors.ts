// Type colours. Colour never alone: chips also carry text/badge/stripes.
// Built-ins in their default colour use theme-aware CSS vars (app.css); custom or recoloured types use their
// stored bg/ink. A key we don't know (a partner's custom type) gets the neutral Busy look.
import type { ItemType } from './types';
import { BUILTIN_TYPES } from './itemtypes';
import { typeOf } from './client/itemtypes.svelte';

// edge = the type colour on a plain card (text, borders); ink = text on the chip bg.
// CSS var refs (app.css) so light/dark swap without re-render. Hex values live in app.css.
export const TYPE_COLORS: Record<
	'Work' | 'Exam' | 'Event' | 'Hobby' | 'Dating' | 'None' | 'Busy',
	{ bg: string; ink: string; line: string; edge: string }
> = {
	Work: { bg: 'var(--work-bg)', ink: 'var(--work-ink)', line: 'var(--work-line)', edge: 'var(--work-edge)' },
	Exam: { bg: 'var(--exam-bg)', ink: 'var(--exam-ink)', line: 'var(--exam-line)', edge: 'var(--exam-edge)' },
	Event: {
		bg: 'var(--event-bg)',
		ink: 'var(--event-ink)',
		line: 'var(--event-line)',
		edge: 'var(--event-edge)',
	},
	Hobby: {
		bg: 'var(--hobby-bg)',
		ink: 'var(--hobby-ink)',
		line: 'var(--hobby-line)',
		edge: 'var(--hobby-edge)',
	},
	Dating: {
		bg: 'var(--dating-bg)',
		ink: 'var(--dating-ink)',
		line: 'var(--dating-line)',
		edge: 'var(--dating-edge)',
	},
	None: { bg: 'var(--none-bg)', ink: 'var(--none-ink)', line: 'var(--none-line)', edge: 'var(--none-edge)' },
	Busy: { bg: 'var(--busy-bg)', ink: 'var(--busy-ink)', line: 'var(--busy-line)', edge: 'var(--busy-edge)' },
};

/** badge colours (DESIGN §5b): 8, never a type colour. [0] = admin default. */
export const USER_COLORS = [
	'#1C1917',
	'#0F766E',
	'#6D28D9',
	'#B45309',
	'#1D4ED8',
	'#BE123C',
	'#4D7C0F',
	'#0E7490',
] as const;

const BUILTIN_BG = new Map<string, string>(BUILTIN_TYPES.map((t) => [t.key, t.bg]));

/** CSS class for a type: built-ins keep t-work… (styles in app.css), anything else t-custom */
export function typeClass(t: ItemType | null | undefined): string {
	if (!t) return 't-none';
	return BUILTIN_BG.has(t) && (typeOf(t)?.bg ?? BUILTIN_BG.get(t)) === BUILTIN_BG.get(t)
		? `t-${t.toLowerCase()}`
		: 't-custom';
}
export function colorsFor(t: ItemType | null | undefined): {
	bg: string;
	ink: string;
	line: string;
	edge: string;
} {
	if (!t) return TYPE_COLORS.None;
	const mine = typeOf(t);
	if (BUILTIN_BG.has(t) && (!mine || mine.bg === BUILTIN_BG.get(t))) return TYPE_COLORS[t as 'Work'];
	if (!mine) return TYPE_COLORS.Busy;
	return { bg: mine.bg, ink: mine.ink, line: mine.bg, edge: 'var(--ink)' };
}
/** FR-H11: linked item type -> block type -> None */
export function blockType(b: { itemType: ItemType | null; type: ItemType | null }): ItemType | null {
	return b.itemType ?? b.type ?? null;
}
