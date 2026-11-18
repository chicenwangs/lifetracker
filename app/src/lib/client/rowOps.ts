// Row actions shared by phone lists (#96): done, delete, move. Each one shows a toast with Undo.
import { isoPlus } from '$lib/time';
import type { BlockDTO, ItemDTO, Status } from '$lib/types';
import { patch } from './api';
import { buzz } from './haptics';
import { enqueueAction, isOffline } from './offline';
import { removeBlock, removeItem } from './remove';
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

async function change(x: Row, body: Record<string, unknown>, text: string, refresh: Refresh) {
	try {
		// #163: Undo = the server's undo journal (a repeating date was detached; a reverse PATCH would copy it again)
		const u = (await patch<{ undo?: UndoRef }>(path(x), body)).undo;
		await refresh();
		showToast(text, {
			undo: u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined,
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

/** swipe right / ⋯ Done: done <-> not done */
export function toggleDone(x: Row, refresh: Refresh) {
	const was: Status = x.status;
	const now: Status = was === 'done' ? 'todo' : 'done';
	if (now === 'done') buzz('success');
	return change(x, { status: now }, now === 'done' ? `Done: "${nameOf(x)}"` : `Not done: "${nameOf(x)}"`, refresh); // prettier-ignore
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
