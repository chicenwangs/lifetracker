// Client side of user prefs. Server (users.*) = truth; cookie lt_theme only keeps the login page in the same
// theme before anyone is signed in.
import { patch } from './api';
import { showError } from './toast.svelte';
import { resolveTheme, type Theme, type ThemeMode } from '$lib/theme';

export type { Theme, ThemeMode };
export type PlanMode = 'night' | 'morning' | 'off';

export const themeState = $state<{ value: Theme; mode: ThemeMode; light: string; dark: string; tz: string }>({
	value: 'dark',
	mode: 'dark',
	light: '07:00',
	dark: '17:00',
	tz: 'Asia/Kuala_Lumpur',
});

let tick: ReturnType<typeof setInterval> | null = null;

function apply(t: Theme) {
	themeState.value = t;
	document.documentElement.dataset.theme = t;
	document.cookie = `lt_theme=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
const recalc = () => apply(resolveTheme(themeState.mode, themeState.light, themeState.dark, themeState.tz));

export function initTheme(u: Pick<App.SafeUser, 'theme' | 'themeMode' | 'themeLightStart' | 'themeDarkStart' | 'timezone'>) {
	Object.assign(themeState, { value: u.theme, mode: u.themeMode, light: u.themeLightStart, dark: u.themeDarkStart, tz: u.timezone });
	// Auto: re-check every minute so the switch happens without a reload. Never changes view or date.
	if (typeof window !== 'undefined' && !tick) tick = setInterval(() => themeState.mode === 'auto' && recalc(), 60_000);
} // prettier-ignore

/** save any theme fields; optimistic, rolls back on error */
export async function saveTheme(p: Partial<{ themeMode: ThemeMode; themeLightStart: string; themeDarkStart: string }>) {
	const prev = { ...themeState };
	if (p.themeMode) themeState.mode = p.themeMode;
	if (p.themeLightStart) themeState.light = p.themeLightStart;
	if (p.themeDarkStart) themeState.dark = p.themeDarkStart;
	recalc();
	try {
		await patch('/api/me/prefs', p);
	} catch (e) {
		Object.assign(themeState, prev);
		apply(prev.value);
		showError(e);
		throw e;
	}
}

/** header sun/moon: a fixed choice (leaves Auto) */
export const setTheme = (t: Theme) => saveTheme({ themeMode: t }).catch(() => {});

export async function setPlanMode(m: PlanMode) {
	await patch('/api/me/prefs', { planMode: m });
}
