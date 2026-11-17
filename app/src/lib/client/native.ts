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
type Cap = {
	isNativePlatform?: () => boolean;
	Plugins?: { Updater?: Updater; SystemBars?: SystemBars; ThemeBars?: ThemeBars };
};
const cap = () => (globalThis as { Capacitor?: Cap }).Capacitor;

export const isApp = () => !!cap()?.isNativePlatform?.();
export const updater = () => cap()?.Plugins?.Updater;

/** #114: status + navigation bars follow the chosen theme (dark icons on light, light icons on dark). */
export function setSystemBarsDark(dark: boolean): void {
	const p = cap()?.Plugins;
	p?.SystemBars?.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
	p?.ThemeBars?.setDark({ dark }).catch(() => {});
}
