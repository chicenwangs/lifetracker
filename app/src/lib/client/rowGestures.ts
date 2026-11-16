// Row gestures on phone lists (#96, G8 / G9). Swipe right = done, left = delete: the row follows the finger and
// the action shows underneath; past 35 % of the width it fires. Hold (~0.45 s) = lift (shadow + buzz), then drag
// up / down and drop. Taps and vertical scrolling still work. Always pair with the row's ⋯ actions (tap path).
import { buzz } from './haptics';

export type RowGestures = {
	done?: () => unknown;
	remove?: () => unknown;
	/** hold + drag: live feedback (finger offset and position), then the drop */
	drag?: (dy: number, x: number, y: number) => void;
	drop?: (dy: number, x: number, y: number) => unknown;
};

export function rowGestures(node: HTMLElement, opts: RowGestures) {
	let o = opts;
	let sx = 0;
	let sy = 0;
	let dx = 0;
	let dy = 0;
	let mode: 'x' | 'y' | 'lift' | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let swallow = false;
	const under = document.createElement('div');
	under.className = 'lt-under';
	under.setAttribute('aria-hidden', 'true');

	function showUnder(x: number) {
		const p = node.parentElement;
		if (!p) return;
		if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
		Object.assign(under.style, {
			top: `${node.offsetTop}px`,
			left: `${node.offsetLeft}px`,
			width: `${node.offsetWidth}px`,
			height: `${node.offsetHeight}px`,
		});
		under.dataset.act = x > 0 ? 'done' : 'delete';
		under.textContent = x > 0 ? '✓ Done' : 'Delete';
		if (!under.isConnected) p.insertBefore(under, node);
	}
	function slide(x: number, anim: boolean) {
		node.style.transition = anim ? 'translate 160ms var(--ease)' : 'none';
		node.style.translate = x ? `${x}px 0` : '';
		if (x) showUnder(x);
		else if (!anim) under.remove();
	}
	function reset() {
		clearTimeout(timer);
		mode = null;
		dx = dy = 0;
		node.classList.remove('lt-lifted');
	}
	const start = (e: TouchEvent) => {
		const t = e.touches[0];
		if (!t || e.touches.length > 1) return;
		sx = t.clientX;
		sy = t.clientY;
		reset();
		if (o.drop)
			timer = setTimeout(() => {
				mode = 'lift';
				node.classList.add('lt-lifted');
				buzz('pickup');
			}, 450);
	};
	const move = (e: TouchEvent) => {
		const t = e.touches[0];
		if (!t) return;
		dx = t.clientX - sx;
		dy = t.clientY - sy;
		if (mode === 'lift' || mode === 'x') e.stopPropagation(); // this row owns the gesture (not the day swipe)
		if (mode === 'lift') {
			e.preventDefault(); // the page holds still while an item is carried
			node.style.translate = `0 ${dy}px`;
			o.drag?.(dy, t.clientX, t.clientY);
			return;
		}
		if (!mode && Math.hypot(dx, dy) > 10) {
			clearTimeout(timer);
			mode = Math.abs(dx) > 1.5 * Math.abs(dy) && (o.done || o.remove) ? 'x' : 'y';
		}
		if (mode === 'x') {
			e.preventDefault();
			e.stopPropagation();
			if ((dx > 0 && !o.done) || (dx < 0 && !o.remove)) dx = 0;
			slide(dx, false);
		}
	};
	const end = (e: TouchEvent) => {
		clearTimeout(timer);
		const t = e.changedTouches[0];
		if (mode === 'lift') {
			swallow = true;
			node.style.translate = '';
			node.classList.remove('lt-lifted');
			void o.drop?.(dy, t?.clientX ?? sx, t?.clientY ?? sy + dy);
		} else if (mode === 'x') {
			swallow = true;
			const go = Math.abs(dx) > node.offsetWidth * 0.35;
			if (go && dx < 0) {
				slide(-node.offsetWidth, true); // delete: the row leaves, the list refresh removes it
				void o.remove?.();
				setTimeout(() => (under.remove(), slide(0, false)), 400);
			} else {
				if (go) void o.done?.();
				slide(0, true);
				setTimeout(() => under.remove(), 170);
			}
		}
		mode = null;
	};
	// the tap that ends a hold or swipe must not also open the row
	const click = (e: MouseEvent) => {
		if (!swallow) return;
		swallow = false;
		e.preventDefault();
		e.stopPropagation();
	};
	const menu = (e: Event) => o.drop && e.preventDefault(); // Android's link menu on a long press
	node.addEventListener('touchstart', start, { passive: true });
	node.addEventListener('touchmove', move, { passive: false });
	node.addEventListener('touchend', end);
	node.addEventListener('touchcancel', reset);
	node.addEventListener('click', click, true);
	node.addEventListener('contextmenu', menu);
	return {
		update(next: RowGestures) {
			o = next;
		},
		destroy() {
			clearTimeout(timer);
			under.remove();
			node.removeEventListener('touchstart', start);
			node.removeEventListener('touchmove', move);
			node.removeEventListener('touchend', end);
			node.removeEventListener('touchcancel', reset);
			node.removeEventListener('click', click, true);
			node.removeEventListener('contextmenu', menu);
		},
	};
}
