// #378: the Add sheet closes under a fingertip that is still tapping; the rest of the burst lands on the row
// underneath (⋯ opens, the next tap deletes). Absorb touch input for a short window after a close.
// D-V4-39: touch / coarse pointers only (desktop unchanged), the Undo toast stays tappable, 250 ms.
const WINDOW_MS = 250;
const EVENTS = ['pointerdown', 'pointerup', 'pointercancel', 'click'] as const;

let until = 0;
let listening = false;
let last = 'touch'; // the press under way: not every browser sends click as a PointerEvent

function swallow(e: Event) {
	const type = e instanceof PointerEvent ? e.pointerType : last;
	if (e instanceof PointerEvent) last = e.pointerType;
	if (Date.now() > until) return;
	if (type === 'mouse') return; // desktop keeps its clicks, even on a touch screen
	// the toast is the undo path: it must stay tappable, even right after a close
	if (e.target instanceof Element && e.target.closest('.toast')) return;
	e.preventDefault();
	e.stopImmediatePropagation();
	e.stopPropagation();
}

/** Absorb stray taps for `ms` (default 250) from a sheet's close. No-op with a mouse (fine pointer). */
export function raiseShield(ms = WINDOW_MS) {
	if (typeof window === 'undefined' || !matchMedia('(pointer: coarse)').matches) return;
	until = Math.max(until, Date.now() + ms);
	if (listening) return;
	listening = true;
	for (const type of EVENTS) addEventListener(type, swallow, true);
}
