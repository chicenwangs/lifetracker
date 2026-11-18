// In-app reminder channel (PRD §8, #112): while the app is open, check for reminders that went off and show each once.
// Actions match the Android notification: Done · Snooze 10 min · Tomorrow; tapping opens that item's sheet.
import { goto } from '$app/navigation';
import { get, post } from './api';
import { calendarChanged } from './bus.svelte';
import { openItem } from './peek.svelte';
import { invalidateAll } from './refresh';
import { showToast, toast } from './toast.svelte';

type Hit = {
	id: string;
	title: string;
	route: string;
	sourceType?: string;
	sourceId?: string;
	late: boolean;
	more?: number;
};

async function act(id: string, action: 'done' | 'snooze10' | 'tomorrow') {
	await post(`/api/reminders/${id}`, { action });
	if (action === 'done') {
		calendarChanged();
		await invalidateAll();
	}
}

async function check() {
	// #198: one toast slot, so one reminder at a time, and never over an Undo / error still showing
	if (document.visibilityState !== 'visible' || toast.current) return;
	try {
		const r = await get<{ reminders: Hit[] }>('/api/reminders/inbox');
		for (const h of r.reminders) {
			if (h.more) setTimeout(check, 16_000);
			showToast(`⏰ ${h.title}${h.late ? ' (missed)' : ''}${h.more ? ` · ${h.more} more` : ''}`, {
				ms: 15_000,
				onclick: () => (h.sourceType === 'planner_item' && h.sourceId ? openItem(h.sourceId) : goto(h.route)),
				actions: [
					{ label: 'Done', run: () => act(h.id, 'done') },
					{ label: 'Snooze 10 min', run: () => act(h.id, 'snooze10') },
					{ label: 'Tomorrow', run: () => act(h.id, 'tomorrow') },
				],
			});
		}
	} catch {
		/* offline or signed out: try again next time */
	}
}
/** start polling (every minute + when the tab comes back); returns a stop function */
export function watchInbox(): () => void {
	void check();
	const t = setInterval(check, 60_000);
	const v = () => void check();
	document.addEventListener('visibilitychange', v);
	return () => {
		clearInterval(t);
		document.removeEventListener('visibilitychange', v);
	};
}
