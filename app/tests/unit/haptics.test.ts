// #102: one helper; the app's native plugin wins, the browser falls back to vibrate (not with reduced motion).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buzz } from '../../src/lib/client/haptics';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
	delete g.Capacitor;
	vi.unstubAllGlobals();
});

describe('buzz', () => {
	it('uses the native Haptics plugin in the app', () => {
		const feel = vi.fn(() => Promise.resolve());
		const vibrate = vi.fn();
		g.Capacitor = { Plugins: { Haptics: { feel } } };
		vi.stubGlobal('navigator', { vibrate });
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		buzz('success');
		expect(feel).toHaveBeenCalledWith({ kind: 'success' });
		expect(vibrate).not.toHaveBeenCalled();
	});
	it('vibrates in a browser, but not with reduced motion', () => {
		const vibrate = vi.fn();
		vi.stubGlobal('navigator', { vibrate });
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		buzz('tick');
		expect(vibrate).toHaveBeenCalledWith(8);
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		buzz('tick');
		expect(vibrate).toHaveBeenCalledTimes(1);
	});
});
