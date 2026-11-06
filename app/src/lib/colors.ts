// Type colours (TECHNICAL §9). Colour never alone: chips also carry text/badge/stripes.
import type { ItemType } from './types';

export const TYPE_COLORS: Record<ItemType | 'None' | 'Busy', { bg: string; ink: string }> = {
	Work: { bg: '#DBEAFE', ink: '#1E3A8A' },
	Exam: { bg: '#FEE2E2', ink: '#7F1D1D' },
	Event: { bg: '#DCFCE7', ink: '#14532D' },
	Hobby: { bg: '#FEF3C7', ink: '#713F12' },
	Dating: { bg: '#FCE7F3', ink: '#831843' },
	None: { bg: '#E7E5E4', ink: '#292524' },
	Busy: { bg: '#E7E5E4', ink: '#44403C' },
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
