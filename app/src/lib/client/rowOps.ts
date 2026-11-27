// Row actions shared by phone lists (#96): done, delete, move. Each one shows a toast with Undo.
import { isoPlus } from '$lib/time';
import { nextStatus, type BlockDTO, type ItemDTO, type Status } from '$lib/types';
import { patch, post } from './api';
import { buzz } from './haptics';
import { enqueueAction, isOffline } from './offline';
import { removeBlock, removeItem } from './remove';
import { raiseShield } from './tapShield';
import { showError, showToast } from './toast.svelte';
import { undoLast } from './undo.svelte';
import type { UndoRef } from '$lib/types';

type Row = ItemDTO | BlockDTO;
type Refresh = () => void | Promise<void>;
const isBlock = (x: Row): x is BlockDTO => 'startAt' in x;
const path = (x: Row) => `/api/${isBlock(x) ? 'blocks' : 'items'}/${x.id}`;
const nameOf = (x: Row) => (isBlock(x) ? x.label : x.title);
const hhmm = (m: number) =>
	`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface RescheduleOpts {
	/** C7: day of the earliest linked planner block (it stays where it is) */
	blockDay?: string | null;
	/** the PATCH response, before the refresh (the item sheet follows a detached occurrence) */
	onResult?: (r: { item?: { id: string }; undo?: UndoRef }) => void;
	/** Undo from the toast: a detached occurrence's row is gone, so the caller may close instead of refetching */
	onUndone?: () => void | Promise<void>;
}

export async function change(
	x: Row,
	body: Record<string, unknown>,
	text: string,
	refresh: Refresh,
	opts: RescheduleOpts = {},
) {
	try {
		// #163: Undo = the server's undo journal (a repeating date was detached; a reverse PATCH would copy it again)
		const r = await patch<{ undo?: UndoRef; item?: { id: string } }>(path(x), body);
		opts.onResult?.(r);
		await refresh();
		const u = r.undo;
		showToast(text, {
			undo: u
				? async () => {
						if (!(await undoLast(u.id))) return;
						await (opts.onUndone ? opts.onUndone() : refresh());
					}
				: undefined,
		});
	} catch (e) {
		if (isOffline(e)) {
			Object.assign(x, body);
			enqueueAction({ key: path(x), method: 'PATCH', path: path(x), payload: body });
			showToast(`${text} · Waiting to sync`);
			return;
		}
		showError(e);
	}
}

const TICK_TEXT: Record<Status, string> = { todo: 'Not started', doing: 'Started', done: 'Done' };

/**
 * Tap a status square (#293, #310): POST /cycle, then a toast with Undo. Offline = queued PATCH. One helper
 * for every tick, so Today and the item sheet cannot drift apart.
 * `onResult` runs before `refresh` (the item sheet follows a repeating date that was detached into its own row).
 * `seenDate` (card 09 MUST 2) is the series date the tick saw, so a replayed from-completion tick no-ops.
 * #379: the list re-renders on this tick, so a touch burst is shielded from the raise until 250 ms after it;
 * there is no second raise after the refresh (a deliberate double-tap inside the window counts once).
 */
export async function cycleRow(
	kind: 'items' | 'blocks',
	id: string,
	cur: Status,
	name: string,
	refresh: Refresh,
	onResult?: (r: { item?: { id: string } }) => void,
	seenDate?: string | null,
): Promise<'ok' | 'queued' | 'failed'> {
	const next = nextStatus(cur);
	const p = `/api/${kind}/${encodeURIComponent(id)}`;
	const date = kind === 'items' ? seenDate : null;
	raiseShield(); // touch / coarse only: desktop ticks stay unshielded
	try {
		const r = await post<{ item?: { id: string }; undo?: UndoRef }>(
			`${p}/cycle`,
			date ? { seenDate: date } : undefined,
		);
		onResult?.(r);
		await refresh();
		if (next === 'done') buzz('success');
		const u = r.undo;
		showToast(`${TICK_TEXT[next]}: "${name}"`, {
			undo: u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined,
		});
		return 'ok';
	} catch (e) {
		if (!isOffline(e)) {
			showError(e);
			return 'failed';
		}
		enqueueAction({
			key: p,
			method: 'PATCH',
			path: p,
			payload: { status: next, ...(date ? { seenDate: date } : {}) },
		});
		showToast(`${TICK_TEXT[next]}: "${name}" · Waiting to sync`);
		return 'queued';
	}
}

/** swipe right / ⋯ Done: done <-> not done. A from-completion series carries the date the row showed. */
export function toggleDone(x: Row, refresh: Refresh) {
	const was: Status = x.status;
	const now: Status = was === 'done' ? 'todo' : 'done';
	if (now === 'done') buzz('success');
	const body: Record<string, unknown> = { status: now };
	if (now === 'done' && !isBlock(x) && x.date) body.seenDate = x.date;
	return change(x, body, now === 'done' ? `Done: "${nameOf(x)}"` : `Not done: "${nameOf(x)}"`, refresh);
}

/** swipe left / ⋯ Delete (Undo in the toast) */
export function deleteRow(x: Row, refresh: Refresh) {
	return isBlock(x) ? removeBlock(x.id, x.label, refresh) : removeItem(x.id, x.title, refresh);
}

/** hold + drag / ⋯ Move: shift by minutes (same day for items, clamped) and / or days */
export function moveRow(x: Row, by: { minutes?: number; days?: number }, refresh: Refresh) {
	const dm = (by.minutes ?? 0) + (by.days ?? 0) * 1440;
	if (!dm) return;
	if (isBlock(x)) {
		const ms = dm * 60_000;
		return change(x, { startAt: isoPlus(x.startAt, ms), endAt: isoPlus(x.endAt, ms) }, `Moved "${x.label}"`, refresh); // prettier-ignore
	}
	const body: Record<string, unknown> = {};
	if (by.days && x.date) {
		const d = new Date(`${x.date}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + by.days);
		body.date = d.toISOString().slice(0, 10);
	}
	if (by.minutes && x.time) {
		body.time = hhmm(Math.min(1439, Math.max(0, mins(x.time) + by.minutes)));
	}
	return change(x, body, `Moved "${x.title}"${body.time ? ` to ${body.time}` : ''}`, refresh);
}
