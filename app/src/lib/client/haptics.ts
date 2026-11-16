// One haptics helper for every phone gesture (#102, G8/G11). App: the Haptics plugin (MainActivity) uses the
// phone's own haptic feedback, so the system setting turns it off. Browser: a short vibrate where allowed.
// Never call it on scroll.
type Kind = 'pickup' | 'tick' | 'success' | 'warning';
type Haptics = { feel(o: { kind: Kind }): Promise<void> };
const plugin = () =>
	(globalThis as { Capacitor?: { Plugins?: { Haptics?: Haptics } } }).Capacitor?.Plugins?.Haptics;
const MS: Record<Kind, number | number[]> = {
	pickup: 15,
	tick: 8,
	success: [10, 40, 10],
	warning: [30, 50, 30],
};

/** pickup = lift, tick = snap / small step, success = done / added, warning = deleted */
export function buzz(kind: Kind) {
	const p = plugin();
	if (p) return void p.feel({ kind }).catch(() => {});
	if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(MS[kind]);
}
