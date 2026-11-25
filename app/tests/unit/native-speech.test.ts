// v4 PR 13: the Keep quick-note mic exists only in the app, and only when the installed APK has the Speech plugin.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSpeech, speech } from '../../src/lib/client/native';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
	delete g.Capacitor;
});

describe('speech bridge', () => {
	it('is off on the web and in an APK without the plugin', () => {
		expect(hasSpeech()).toBe(false);
		g.Capacitor = { isNativePlatform: () => true, Plugins: {} };
		expect(hasSpeech()).toBe(false);
	});
	it('forwards listen({ preferOffline: true }) in the app', async () => {
		const listen = vi.fn(async () => ({ text: 'buy milk' }));
		const stop = vi.fn(async () => {});
		g.Capacitor = { isNativePlatform: () => true, Plugins: { Speech: { listen, stop } } };
		expect(hasSpeech()).toBe(true);
		const r = await speech()!.listen({ preferOffline: true });
		expect(listen).toHaveBeenCalledWith({ preferOffline: true });
		expect(r.text).toBe('buy milk');
	});
});
