// One toast at a time (FR-H6 undo 5 s). Errors use the same slot.
export interface Toast {
	id: number;
	text: string;
	kind: 'info' | 'error';
	undo?: () => void | Promise<void>;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const toast = $state<{ current: Toast | null }>({ current: null });

export function showToast(
	text: string,
	opts: { undo?: Toast['undo']; kind?: Toast['kind']; ms?: number } = {},
) {
	if (timer) clearTimeout(timer);
	const t: Toast = { id: ++seq, text, kind: opts.kind ?? 'info', undo: opts.undo };
	toast.current = t;
	timer = setTimeout(() => {
		if (toast.current?.id === t.id) toast.current = null;
	}, opts.ms ?? 5000);
}

export function showError(e: unknown) {
	showToast(e instanceof Error ? e.message : 'Something went wrong', { kind: 'error', ms: 6000 });
}

export function closeToast() {
	toast.current = null;
}
