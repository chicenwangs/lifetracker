// In-app reminder channel (PRD §8): while the app is open, check for reminders that went off and show each once.
import { get } from './api';
import { showToast } from './toast.svelte';

type Hit = { id: string; title: string; route: string; late: boolean };
async function check() {
	if (document.visibilityState !== 'visible') return;
	try {
		const r = await get<{ reminders: Hit[] }>('/api/reminders/inbox');
		for (const h of r.reminders) showToast(`⏰ ${h.title}${h.late ? ' (missed)' : ''}`, { ms: 10_000 });
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
