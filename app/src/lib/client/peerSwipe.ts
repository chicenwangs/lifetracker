// Swipe between peers (days, weeks, months; G3, #94 #95): the element follows the finger, the neighbour's name
// peeks in from the side, past a quarter of its width it slides out and steps, else it snaps back.
// Vertical scrolling stays (axis lock). Always pair it with a tap path (buttons, strip, date picker).
export type PeerSwipe = { step: (n: 1 | -1) => unknown; peek?: (n: 1 | -1) => string };

export function peerSwipe(node: HTMLElement, opts: PeerSwipe) {
	let o = opts;
	let sx = 0;
	let sy = 0;
	let dx = 0;
	let axis: 'x' | 'y' | null = null;
	const tag = document.createElement('div');
	tag.className = 'lt-peek';
	tag.setAttribute('aria-hidden', 'true');
	node.style.touchAction = 'pan-y';
	if (getComputedStyle(node).position === 'static') node.style.position = 'relative';

	function set(x: number, anim: boolean) {
		dx = x;
		node.style.transition = anim ? 'translate 160ms var(--ease)' : 'none';
		node.style.translate = x ? `${x}px 0` : '';
		const n = x < 0 ? 1 : -1;
		if (x && o.peek) {
			tag.textContent = o.peek(n);
			tag.classList.toggle('prev', n < 0);
			if (!tag.isConnected) node.append(tag);
		} else tag.remove();
	}
	const start = (e: TouchEvent) => {
		const t = e.touches[0];
		if (!t || e.touches.length > 1) return;
		sx = t.clientX;
		sy = t.clientY;
		axis = null;
	};
	const move = (e: TouchEvent) => {
		const t = e.touches[0];
		if (!t) return;
		const x = t.clientX - sx;
		const y = t.clientY - sy;
		if (!axis && Math.hypot(x, y) > 10) axis = Math.abs(x) > 1.5 * Math.abs(y) ? 'x' : 'y';
		if (axis === 'x') set(x, false);
	};
	const end = () => {
		if (axis === 'x' && Math.abs(dx) > node.clientWidth / 4) {
			const n = dx < 0 ? 1 : -1;
			set(-n * node.clientWidth, true);
			setTimeout(async () => {
				await o.step(n);
				set(0, false); // the new peer shows in place
			}, 160);
		} else if (dx) set(0, true);
		axis = null;
	};
	node.addEventListener('touchstart', start, { passive: true });
	node.addEventListener('touchmove', move, { passive: true });
	node.addEventListener('touchend', end);
	node.addEventListener('touchcancel', end);
	return {
		update(next: PeerSwipe) {
			o = next;
		},
		destroy() {
			node.removeEventListener('touchstart', start);
			node.removeEventListener('touchmove', move);
			node.removeEventListener('touchend', end);
			node.removeEventListener('touchcancel', end);
			tag.remove();
		},
	};
}
