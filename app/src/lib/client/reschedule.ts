// Reschedule action set (PLAN §3A): one list of moves for ItemView, the phone row ⋯ sheets and the Slipped
// list. Postpone = PATCH the date (the server keeps the time and a multi-day span) · Skip = one EXDATE.
import { addDays, isDate, prettyDate, todayLocal, utcToLocal, weekdayOf } from '$lib/time';
import type { ItemDTO, UndoRef } from '$lib/types';
import { askText } from './dialog.svelte';
import { patch, post } from './api';
import { enqueueAction, isOffline } from './offline';
import { showError, showToast } from './toast.svelte';
import { undoLast } from './undo.svelte';

export type PostponeKind = 'today' | 'tomorrow' | 'next-weekday' | 'week';
type Refresh = () => void | Promise<void>;
type Reply = { item: { id: string }; undo?: UndoRef };

/** pure: the owner-local date a quick move lands on. Fri, Sat or Sun "next weekday" = Monday. */
export function targetDate(kind: PostponeKind, today: string, tz: string): string {
	const from = today || todayLocal(tz); // date math is tz-free; tz only finds "today" when the caller has none
	if (kind === 'today') return from;
	if (kind === 'tomorrow') return addDays(from, 1);
	if (kind === 'week') return addDays(from, 7);
	const wd = weekdayOf(from);
	return addDays(from, wd >= 5 ? 8 - wd : 1);
}

export interface MoveOpts {
	refresh: Refresh;
	/** a repeating occurrence was detached into this new row (the item sheet follows it) */
	onResult?: (r: Reply) => void;
	/** a skipped occurrence is gone (the item sheet moves on to the series) */
	onSkip?: () => void;
	tz?: string;
	/** a linked planner block does not move with the item: the toast says which day it stays on */
	blocks?: { startAt: string }[];
}

const undoOf = (u: UndoRef | undefined, refresh: Refresh) =>
	u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined;

/** one postpone: PATCH the date, then a toast with Undo. */
export async function reschedule(item: ItemDTO, date: string, opts: MoveOpts) {
	if (!item.date) return;
	if (date === item.date) return void showToast(`Already on ${prettyDate(date)}`);
	const path = `/api/items/${encodeURIComponent(item.id)}`;
	try {
		const r = await patch<Reply>(path, { date });
		opts.onResult?.(r);
		await opts.refresh();
		const block = opts.blocks?.[0];
		const stays =
			block && opts.tz
				? ` · Planner block stays on ${prettyDate(utcToLocal(block.startAt, opts.tz).date)}`
				: '';
		showToast(`Moved "${item.title}" to ${prettyDate(date)}${stays}`, {
			undo: undoOf(r.undo, opts.refresh),
		});
		return r;
	} catch (e) {
		if (isOffline(e)) {
			Object.assign(item, { date });
			enqueueAction({ key: path, method: 'PATCH', path, payload: { date } });
			showToast('Moved · Waiting to sync');
			return;
		}
		showError(e);
	}
}

/** one skip: drop this date from the series. Undo = the EXDATE is removed again (journal before-row). */
export async function skip(item: ItemDTO, opts: MoveOpts) {
	if (!item.occurrenceDate) return;
	try {
		const r = await post<Reply>(`/api/items/${encodeURIComponent(item.id)}/skip`);
		opts.onSkip?.();
		await opts.refresh();
		showToast(`Skipped "${item.title}"`, { undo: undoOf(r.undo, opts.refresh) });
		return r;
	} catch (e) {
		showError(e); // offline: "You're offline. Not saved." (only PATCH moves wait in the queue)
	}
}

export interface MoveAction {
	label: string;
	danger?: boolean;
	run: () => unknown;
}

/** the shared list (ActionSheet / PR 4 rows). Skip shows only on an occurrence of a repeat. */
export function postpones(item: ItemDTO, opts: MoveOpts & { today: string; tz: string }): MoveAction[] {
	if (!item.date) return [];
	const move = (kind: PostponeKind) => reschedule(item, targetDate(kind, opts.today, opts.tz), opts);
	const list: MoveAction[] = [
		{ label: 'Today', run: () => move('today') },
		{ label: 'Tomorrow', run: () => move('tomorrow') },
		{ label: 'Next weekday', run: () => move('next-weekday') },
		{ label: '+1 week', run: () => move('week') },
		{ label: 'Pick date…', run: () => pick(item, opts) },
	];
	if (item.rrule && item.occurrenceDate) list.push({ label: 'Skip this one', run: () => skip(item, opts) });
	return list;
}

async function pick(item: ItemDTO, opts: MoveOpts & { today: string }) {
	const d = await askText('Move to which day? (YYYY-MM-DD)', {
		value: item.date ?? opts.today,
		ok: 'Move',
	});
	if (d && !isDate(d)) return showToast('Not a date. Use YYYY-MM-DD.', { kind: 'error' });
	if (d) await reschedule(item, d, opts);
}
