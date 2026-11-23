// Desktop keyboard contract for aria-modal dialogs (#279): focus moves in, Tab wraps inside, Escape closes only the
// topmost one (even when focus is elsewhere), focus returns to the opener. Use together with `use:backCloses`.
import { isPhone } from './phone';

const stack: HTMLElement[] = [];
const FOCUSABLE =
	'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

export function modal(node: HTMLElement, close: () => void) {
	const opener = document.activeElement as HTMLElement | null;
	const items = () =>
		[...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
	const onKey = (e: KeyboardEvent) => {
		if (stack[stack.length - 1] !== node) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			return close();
		}
		if (e.key !== 'Tab') return;
		const f = items();
		const a = document.activeElement;
		const first = f[0];
		const last = f[f.length - 1];
		const other = a?.closest('[aria-modal="true"]');
		if (other && other !== node) return; // a sheet that is not ours (BottomSheet) owns the focus
		if (!first) return e.preventDefault();
		if (!a || !node.contains(a) || (e.shiftKey && a === first) || (!e.shiftKey && a === last)) {
			e.preventDefault();
			(e.shiftKey ? last : first)?.focus();
		}
	};
	stack.push(node);
	addEventListener('keydown', onKey, true);
	// after the dialog's own autofocus (mount order): only if nothing inside took focus
	queueMicrotask(() => {
		if (!isPhone() && !node.contains(document.activeElement))
			(items()[0] ?? node).focus({ preventScroll: true });
	});
	return {
		update(next: () => void) {
			close = next;
		},
		destroy() {
			removeEventListener('keydown', onKey, true);
			stack.splice(stack.indexOf(node), 1);
			if (!isPhone() && opener?.isConnected) opener.focus({ preventScroll: true });
		},
	};
}
