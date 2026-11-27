// Card 03 (D-V4-04, D-V4-16): one reschedule action set. `targetDate` is pure; every move goes through the
// row-mutation path in rowOps (one PATCH = one undo entry + toast, or the offline queue).
import { splitOccId } from '$lib/rrule';
import { addDays, diffDays, isDate, prettyDate, todayLocal, weekdayOf } from '$lib/time';
import type { ItemDTO, UndoRef } from '$lib/types';
import { post } from './api';
import { themeState } from './prefs.svelte';
import { change, type RescheduleOpts } from './rowOps';
import { showError, showToast } from './toast.svelte';
import { undoLast } from './undo.svelte';

export type RescheduleKind = 'today' | 'tomorrow' | 'nextWeekday' | 'plusWeek';

/** the list, in order (the card fixes it; card 04 reuses it) */
export const RESCHEDULE: { kind: RescheduleKind; label: string }[] = [
	{ kind: 'today', label: 'Today' },
	{ kind: 'tomorrow', label: 'Tomorrow' },
	{ kind: 'nextWeekday', label: 'Next weekday' },
	{ kind: 'plusWeek', label: '+1 week' },
];
export const PICK_DATE = 'Pick date…';
export const SKIP_LABEL = 'Skip this one';

/** owner-local YYYY-MM-DD for a kind (D-V4-04: no tz argument; `today` is already owner-local) */
export function targetDate(kind: RescheduleKind, today: string): string {
	if (kind === 'today') return today;
	if (kind === 'tomorrow') return addDays(today, 1);
	if (kind === 'plusWeek') return addDays(today, 7);
	// next weekday: Mon–Thu -> the next day; Fri, Sat, Sun -> Monday
	const wd = weekdayOf(today);
	return addDays(today, wd <= 4 ? 1 : 8 - wd);
}

/** the shown occurrence of a repeating series (`id@date` with a rule); its postpone detaches it */
export const isOccurrence = (x: ItemDTO): boolean => !!x.rrule && splitOccId(x.id).occDate !== null;

export function reschedule(
	x: ItemDTO,
	kind: RescheduleKind,
	refresh: () => void | Promise<void>,
	opts: RescheduleOpts = {},
) {
	return rescheduleTo(x, targetDate(kind, todayLocal(themeState.tz)), refresh, opts);
}

/** C3/C4: one PATCH {date, endDate?}; a multi-day span moves with it, the time stays */
export function rescheduleTo(
	x: ItemDTO,
	date: string,
	refresh: () => void | Promise<void>,
	opts: RescheduleOpts = {},
) {
	if (!x.date || !isDate(date)) return;
	if (date === x.date) return; // already there (an occurrence would only detach itself)
	const body: Record<string, unknown> = { date };
	if (x.endDate && x.endDate !== x.date) body.endDate = addDays(date, diffDays(x.date, x.endDate));
	const text = `Moved "${x.title}" to ${prettyDate(date)}${
		opts.blockDay ? ` · Planner block stays on ${prettyDate(opts.blockDay)}` : ''
	}`;
	return change(x, body, text, refresh, opts);
}

/** C8/C15: Skip one occurrence. Own route; offline or refused = the usual toast, nothing queued (D-V4-04). */
export async function skipRow(x: ItemDTO, refresh: () => void | Promise<void>): Promise<boolean> {
	try {
		const r = await post<{ undo?: UndoRef }>(`/api/items/${encodeURIComponent(x.id)}/skip`);
		await refresh();
		const u = r.undo;
		showToast(`Skipped this one: "${x.title}"`, {
			undo: u ? async () => void ((await undoLast(u.id)) && (await refresh())) : undefined,
		});
		return true;
	} catch (e) {
		showError(e);
		return false;
	}
}
