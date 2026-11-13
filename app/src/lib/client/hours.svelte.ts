// Client state for the visible hour range. users.visible_hours = truth (follows you to every device);
// cookie lt_hours = first-paint cache only.
import { clampHours, DEFAULT_HOURS, type HourRange } from '$lib/hours';
import { patch } from './api';
import { showError } from './toast.svelte';

export const hoursState = $state<HourRange & { ready: boolean }>({ ...DEFAULT_HOURS, ready: false });

export function initHours(r: HourRange) {
	if (hoursState.ready) return;
	hoursState.start = r.start;
	hoursState.end = r.end;
	hoursState.ready = true;
}

/** live update while dragging; save=true writes the cookie (on release) */
export function setHours(start: number, end: number, moving: 'start' | 'end', save = false) {
	const r = clampHours(start, end, moving);
	hoursState.start = r.start;
	hoursState.end = r.end;
	hoursState.ready = true;
	if (!save) return;
	document.cookie = `lt_hours=${r.start}-${r.end}; Path=/; Max-Age=31536000; SameSite=Lax`;
	patch('/api/me/prefs', { visibleHours: `${r.start}-${r.end}` }).catch(showError);
}
