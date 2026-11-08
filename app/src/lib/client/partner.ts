// Someone else's (shared, read-only) entries: same look everywhere (month, week, planner).
// Striped in the Type colour, dashed edge, owner's initial badge. "Busy" = neutral grey.
import { blockType, colorsFor, TYPE_COLORS } from '$lib/colors';
import type { BlockDTO, ItemDTO, PartnerTag } from '$lib/types';

export function entryColors(x: ItemDTO | BlockDTO) {
	if (x.busy) return TYPE_COLORS.Busy;
	return 'startAt' in x ? colorsFor(blockType(x)) : colorsFor(x.type);
}

export function theirClasses(x: ItemDTO | BlockDTO): string[] {
	if (!x.theirs) return [];
	return ['lt-theirs', ...(x.busy ? ['lt-busy', 't-busy'] : [])];
}

export function badge(o: PartnerTag): HTMLSpanElement {
	const b = document.createElement('span');
	b.className = 'lt-who';
	b.style.background = o.color;
	b.textContent = o.initial;
	b.title = `${o.name}'s calendar`;
	b.setAttribute('aria-label', `${o.name}'s`);
	return b;
}
