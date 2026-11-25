// In-app confirm / text / repeat-scope dialogs (#109, #72): the browser's confirm() / prompt() show the site address and ignore the
// theme on a phone. One dialog at a time; Dialog.svelte (root layout) renders it. Back / Esc / scrim = cancel.
export type RepeatScope = 'this' | 'following' | 'all';

export type Ask =
	| { kind: 'confirm'; text: string; ok: string; danger: boolean; done: (v: boolean) => void }
	| {
			kind: 'text';
			text: string;
			ok: string;
			value: string;
			label: string;
			/** returns a message to show inline and keep the dialog open, or null when the value is fine */
			check?: (v: string) => string | null;
			done: (v: string | null) => void;
	  }
	| {
			kind: 'scope';
			text: string;
			ok: string;
			danger: boolean;
			done: (v: RepeatScope | null) => void;
	  };

export const dialog = $state<{ current: Ask | null }>({ current: null });

function open(a: Ask) {
	dialog.current?.done(null as never); // a new question cancels the old one
	dialog.current = a;
}

/** true = the user chose `ok`. `danger` paints it red (deletes). */
export function askConfirm(text: string, opts: { ok?: string; danger?: boolean } = {}) {
	return new Promise<boolean>((done) =>
		open({
			kind: 'confirm',
			text,
			ok: opts.ok ?? 'OK',
			danger: opts.danger ?? false,
			done: (v) => done(!!v),
		}),
	);
}

/** the trimmed text, or null when cancelled */
export function askText(
	text: string,
	opts: { value?: string; ok?: string; label?: string; check?: (v: string) => string | null } = {},
) {
	return new Promise<string | null>((done) =>
		open({
			kind: 'text',
			text,
			ok: opts.ok ?? 'OK',
			value: opts.value ?? '',
			label: opts.label ?? text,
			check: opts.check,
			done: (v) => done(v === null ? null : v.trim()),
		}),
	);
}

/** repeating item scope choice (#72): 'this' | 'following' | 'all' | null */
export function askScope(text: string, opts: { ok?: string; danger?: boolean } = {}) {
	return new Promise<RepeatScope | null>((done) =>
		open({
			kind: 'scope',
			text,
			ok: opts.ok ?? 'OK',
			danger: opts.danger ?? false,
			done: (v) => done(v),
		}),
	);
}

export function answer(v: boolean | string | null) {
	const a = dialog.current;
	if (!a) return;
	dialog.current = null;
	if (a.kind === 'confirm') a.done(v === true);
	else if (a.kind === 'scope') a.done(v === 'this' || v === 'following' || v === 'all' ? v : null);
	else a.done(typeof v === 'string' ? v : null);
}
