// Back closes the top layer first (G2, #91). Every open sheet, dialog or menu owns one history entry, so the
// browser Back, the Android Back button (MainActivity: WebView history back) and predictive back all close it.
// Item peek and Keep note keep their own entries (they have URLs / their own popstate).
import { pushState, replaceState } from '$app/navigation';
import { invalidateAll, refreshing } from './refresh';

type Layer = { close: () => void; gone: boolean };
const stack: Layer[] = [];
let skip = 0; // popstates from our own history.back() after a layer closed in the UI
let leaving = false; // a link / goto is replacing the page: its new entry replaces the layer's

if (typeof window !== 'undefined')
	addEventListener('popstate', () => {
		const self = skip > 0;
		const top = self ? (skip--, null) : stack.pop();
		if (top) {
			top.gone = true;
			top.close();
		}
		// SvelteKit drops a data refresh in flight on any popstate (e.g. save + close a dialog): refetch once
		// (next task: SvelteKit's own popstate listener resets its load token after ours runs)
		if ((self || top) && refreshing()) setTimeout(() => void invalidateAll());
	});

/** call right before a goto() that closes a layer (beforeNavigate can fire too late for the layer's Back) */
export function leave() {
	leaving = true;
	setTimeout(() => (leaving = false), 50);
}
/** root layout: beforeNavigate(leavingPage) so a goto() from a closing layer doesn't undo itself */
export function leavingPage(nav: { type: string }) {
	if (nav.type !== 'popstate') leave();
}
// a link inside a menu: the menu closes (and its anchor leaves the DOM) before SvelteKit starts the navigation
if (typeof window !== 'undefined')
	addEventListener(
		'click',
		(e) => {
			const a = (e.target as Element | null)?.closest?.('a[href]');
			if (a && !a.hasAttribute('download') && !(a as HTMLAnchorElement).target) leave();
		},
		true,
	);

// SvelteKit keeps shallow state here; unlike page.state it survives invalidateAll()
const ours = (id: number) => history.state?.['sveltekit:states']?.layer === id;
let ids = 0;
let pending: { id: number; dropped: boolean } | null = null; // a closed layer about to go back

/** Svelte action for a layer's root element: `use:backCloses={() => (open = false)}`. */
export function backCloses(_node: HTMLElement, close: () => void) {
	const id = ++ids;
	const layer: Layer = { close: () => close(), gone: false };
	// a layer swapped for a new one in the same tick (e.g. a new slot popup) reuses its entry
	if (pending && ours(pending.id)) {
		pending.dropped = true;
		replaceState('', { layer: id });
	} else pushState('', { layer: id });
	pending = null;
	stack.push(layer);
	return {
		update(next: () => void) {
			close = next;
		},
		destroy() {
			const i = stack.indexOf(layer);
			if (i >= 0) stack.splice(i, 1);
			if (layer.gone) return; // closed by Back: its entry is already used
			// after this flush (a layer swapped in the same tick reuses the entry), but still in this task: a later
			// timer could fire after a new navigation began. Links and goto() have set leaving by now.
			const mine = { id, dropped: false };
			pending = mine;
			queueMicrotask(() => {
				if (mine.dropped) return;
				if (pending === mine) pending = null;
				if (leaving || !ours(id)) return;
				skip++;
				history.back();
			});
		},
	};
}
