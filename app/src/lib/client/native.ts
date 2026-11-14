// Android app shell (mobile/): Capacitor injects window.Capacitor into the server's own pages.
// Plugins are reached through that global, so the web build needs no Capacitor package.
type Updater = {
	check(): Promise<{ current: string; latest?: string; available?: boolean }>;
	install(): Promise<void>;
};
type Cap = { isNativePlatform?: () => boolean; Plugins?: { Updater?: Updater } };
const cap = () => (globalThis as { Capacitor?: Cap }).Capacitor;

export const isApp = () => !!cap()?.isNativePlatform?.();
export const updater = () => cap()?.Plugins?.Updater;
