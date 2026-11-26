// Phone layout = narrow, or a short touch screen (phone turned sideways, #110). CSS uses the same rule:
// @media (max-width: 699px), (pointer: coarse) and (max-height: 500px). Tablets (taller than 500) keep desktop.
import { readable } from 'svelte/store';

export const PHONE_MQ = '(max-width: 699px), (pointer: coarse) and (max-height: 500px)';
export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE_MQ).matches;

/**
 * Keyboard hints belong to a fine pointer (D-V4-03): a touch tablet is coarse even at desktop width.
 * A store, so a 2-in-1 that switches between a mouse and a touch screen follows the change. Starts false
 * (SSR has no matchMedia) and flips after hydration.
 */
export const finePointer = readable(false, (set) => {
	const mq = typeof matchMedia === 'undefined' ? null : matchMedia('(pointer: fine)');
	if (!mq) return;
	queueMicrotask(() => set(mq.matches)); // after hydration: the server rendered no hints, so the first client render must agree
	const update = (e: MediaQueryListEvent) => set(e.matches);
	mq.addEventListener('change', update);
	return () => mq.removeEventListener('change', update); // the signed-in shell subscribes for a session
});
