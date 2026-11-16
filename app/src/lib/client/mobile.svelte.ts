// Phone "+ Add" sheet state (FEATURES §10). One sheet for the whole app, opened from the bottom bar or Today.
// pushState gives the sheet its own history entry, so Android Back closes it without leaving the page (#92).
import { pushState } from '$app/navigation';

export const addSheet = $state<{ open: boolean; tab: 'plan' | 'note'; text: string }>({
	open: false,
	tab: 'plan',
	text: '',
});

let pushed = false;
let closing = false; // history.back() sent, popstate not yet seen

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', () => {
		closing = false;
		if (addSheet.open && pushed) {
			pushed = false;
			addSheet.open = false;
		}
	});
}

export function openAdd(text = '', tab: 'plan' | 'note' = 'plan') {
	if (closing) return;
	Object.assign(addSheet, { open: true, tab, text });
	if (!pushed) {
		pushState(location.pathname + location.search + location.hash, { ...history.state, addSheet: true });
		pushed = true;
	}
}

export function closeAdd() {
	if (!addSheet.open) return;
	if (pushed && !closing) {
		closing = true;
		history.back(); // popstate clears addSheet.open
	} else {
		addSheet.open = false;
	}
}
