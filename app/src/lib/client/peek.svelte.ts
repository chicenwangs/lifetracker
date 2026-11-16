// Centre peek. Open state lives here (not in page.state: invalidateAll() resets page.state).
// pushState gives the peek its own URL + history entry, so Back closes it and reload = full page.
import { pushState } from '$app/navigation';
import { calendarChanged } from './bus.svelte';
import { isPhone } from './phone';

export const peek = $state<{ id: string | null; origin: { x: number; y: number } | null }>({
	id: null,
	origin: null,
});

let lastPointer: { x: number; y: number } | null = null;
let pushed = false;
let closing = false; // history.back() sent, popstate not yet seen

if (typeof window !== 'undefined') {
	window.addEventListener(
		'pointerdown',
		(e) => {
			lastPointer = { x: e.clientX, y: e.clientY };
		},
		{ capture: true },
	);
	// phone (#108): any link to an item opens the item sheet, wherever it is (Week, Due today, search, steps)
	window.addEventListener(
		'click',
		(e) => {
			const a = (e.target as Element | null)?.closest?.('a[href^="/item/"]') as HTMLAnchorElement | null;
			const id = a?.pathname.match(/^\/item\/([^/]+)$/)?.[1];
			if (!a || !id || a.hasAttribute('data-sveltekit-reload') || e.defaultPrevented) return;
			if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || !isPhone()) return;
			e.preventDefault(); // SvelteKit's router skips prevented clicks
			openItem(id);
		},
		{ capture: true },
	);
	// Back button (or our own history.back) closes the peek
	window.addEventListener('popstate', () => {
		closing = false;
		if (peek.id && location.pathname !== `/item/${peek.id}`) {
			pushed = false;
			peek.id = null;
			// a refresh still in flight while the URL changed can be dropped -> refetch once on close
			calendarChanged();
		}
	});
}

export function openItem(id: string) {
	if (closing) return;
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
	if (!peek.id || closing) return;
	if (pushed) {
		closing = true;
		history.back(); // popstate clears peek.id
	} else {
		peek.id = null;
		calendarChanged();
	}
}
