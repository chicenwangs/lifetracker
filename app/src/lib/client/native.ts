// Android app shell (mobile/): Capacitor injects window.Capacitor into the server's own pages.
// Plugins are reached through that global, so the web build needs no Capacitor package.
type Updater = {
	check(): Promise<{ current: string; latest?: string; available?: boolean }>;
	install(): Promise<void>;
};
type SystemBars = {
	setStyle(opts: { style: 'DARK' | 'LIGHT' }): Promise<void>;
};
type ThemeBars = {
	setDark(opts: { dark: boolean }): Promise<void>;
};
type Session = { signOut(): Promise<void> };
type Speech = {
	listen(o: { preferOffline?: boolean }): Promise<{ text: string }>;
	stop(): Promise<void>;
};
type Cap = {
	isNativePlatform?: () => boolean;
	Plugins?: {
		Updater?: Updater;
		SystemBars?: SystemBars;
		ThemeBars?: ThemeBars;
		Session?: Session;
		Speech?: Speech;
	};
};
const cap = () => (globalThis as { Capacitor?: Cap }).Capacitor;

export const isApp = () => !!cap()?.isNativePlatform?.();
export const updater = () => cap()?.Plugins?.Updater;
/** v4 PR 13: the Keep quick-note mic. App only, and only when the installed APK carries the plugin. */
export const speech = () => cap()?.Plugins?.Speech;
export const hasSpeech = () => isApp() && !!speech();
/** #201: the Android app drops its alarms, notifications, cached sync and widget data (no-op on the web) */
export const signOutNative = (): Promise<void> =>
	cap()
		?.Plugins?.Session?.signOut()
		.catch(() => {}) ?? Promise.resolve();

/** #114: status + navigation bars follow the chosen theme (dark icons on light, light icons on dark). */
export function setSystemBarsDark(dark: boolean): void {
	const p = cap()?.Plugins;
	p?.SystemBars?.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
	p?.ThemeBars?.setDark({ dark }).catch(() => {});
}
