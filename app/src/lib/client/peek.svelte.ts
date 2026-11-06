// Centre peek. Open state lives here (not in page.state: invalidateAll() resets page.state).
// pushState gives the peek its own URL + history entry, so Back closes it and reload = full page.
import { pushState } from '$app/navigation';

export const peek = $state<{ id: string | null; origin: { x: number; y: number } | null }>({
	id: null,
	origin: null,
});

let lastPointer: { x: number; y: number } | null = null;
let pushed = false;

if (typeof window !== 'undefined') {
	window.addEventListener(
		'pointerdown',
		(e) => {
			lastPointer = { x: e.clientX, y: e.clientY };
		},
		{ capture: true },
	);
	// Back button (or our own history.back) closes the peek
	window.addEventListener('popstate', () => {
		if (peek.id && location.pathname !== `/item/${peek.id}`) {
			pushed = false;
			peek.id = null;
		}
	});
}

export function openItem(id: string) {
	peek.origin = lastPointer;
	if (peek.id && pushed) {
		// swap item inside an open peek without stacking history
		history.replaceState(history.state, '', `/item/${id}`);
	} else {
		pushState(`/item/${id}`, { peekId: id });
		pushed = true;
	}
	peek.id = id;
}

export function closePeek() {
	if (!peek.id) return;
	if (pushed)
		history.back(); // popstate clears peek.id
	else peek.id = null;
}
