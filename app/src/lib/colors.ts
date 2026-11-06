// Type colours (TECHNICAL §9). Colour never alone: chips also carry text/badge/stripes.
import type { ItemType } from './types';

// CSS var refs (app.css) so light/dark swap without re-render. Hex values live in app.css.
export const TYPE_COLORS: Record<ItemType | 'None' | 'Busy', { bg: string; ink: string; line: string }> = {
	Work: { bg: 'var(--work-bg)', ink: 'var(--work-ink)', line: 'var(--work-line)' },
	Exam: { bg: 'var(--exam-bg)', ink: 'var(--exam-ink)', line: 'var(--exam-line)' },
	Event: { bg: 'var(--event-bg)', ink: 'var(--event-ink)', line: 'var(--event-line)' },
	Hobby: { bg: 'var(--hobby-bg)', ink: 'var(--hobby-ink)', line: 'var(--hobby-line)' },
	Dating: { bg: 'var(--dating-bg)', ink: 'var(--dating-ink)', line: 'var(--dating-line)' },
	None: { bg: 'var(--none-bg)', ink: 'var(--none-ink)', line: 'var(--none-line)' },
	Busy: { bg: 'var(--busy-bg)', ink: 'var(--busy-ink)', line: 'var(--busy-line)' },
};

export const USER_COLORS = ['#1C1917', '#0F766E', '#6D28D9', '#B45309'] as const;

export function typeClass(t: ItemType | null | undefined): string {
	return `t-${(t ?? 'None').toLowerCase()}`;
}
export function colorsFor(t: ItemType | null | undefined) {
	return TYPE_COLORS[t ?? 'None'];
}
/** FR-H11: linked item type -> block type -> None */
export function blockType(b: { itemType: ItemType | null; type: ItemType | null }): ItemType | null {
	return b.itemType ?? b.type ?? null;
}
