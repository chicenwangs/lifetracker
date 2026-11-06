// Client side of user prefs. Server (users.theme / plan_mode) = truth; cookie lt_theme only
// keeps the login page in the same theme before anyone is signed in.
import { patch } from './api';
import { showError } from './toast.svelte';

export type Theme = 'dark' | 'light';
export type PlanMode = 'night' | 'morning' | 'off';

export const themeState = $state<{ value: Theme }>({ value: 'dark' });

export function initTheme(t: Theme) {
	themeState.value = t;
}

function apply(t: Theme) {
	document.documentElement.dataset.theme = t;
	document.cookie = `lt_theme=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export async function setTheme(t: Theme, save = true) {
	const prev = themeState.value;
	themeState.value = t;
	apply(t);
	if (!save) return;
	try {
		await patch('/api/me/prefs', { theme: t });
	} catch (e) {
		themeState.value = prev;
		apply(prev);
		showError(e);
	}
}

export async function setPlanMode(m: PlanMode) {
	await patch('/api/me/prefs', { planMode: m });
}
