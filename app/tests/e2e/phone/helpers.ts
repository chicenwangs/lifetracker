// Phone e2e helpers (Mobile overhaul #106). Real touch events via CDP, Chromium only.
import { expect, type Locator, type Page } from '@playwright/test';
import allow from './targets48-allowlist.json' with { type: 'json' };

export const PW = 'good pass phrase';

/** Fresh DB -> /setup as jeremy; already set up -> /login. Skips the desktop tour. */
export async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		await page.fill('#u', 'jeremy');
		await page.fill('#p', PW);
		await page.click('button[type=submit]');
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

export const bottomBar = (page: Page) => page.getByRole('navigation', { name: 'Phone navigation' });

/** one CDP session per gesture: a touch started on one session can't be moved from another */
async function finger(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	return { send, done: () => cdp.detach() };
}
async function centre(el: Locator) {
	const b = await el.boundingBox();
	if (!b) throw new Error('element not visible');
	return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

/** finger swipe across 80 % of the element, 10 move steps */
export async function swipe(page: Page, el: Locator, dir: 'left' | 'right' | 'up' | 'down') {
	const c = await centre(el);
	const dx = dir === 'left' ? -0.4 * c.w : dir === 'right' ? 0.4 * c.w : 0;
	const dy = dir === 'up' ? -0.4 * c.h : dir === 'down' ? 0.4 * c.h : 0;
	const f = await finger(page);
	await f.send('touchStart', c.x - dx, c.y - dy);
	for (let i = 1; i <= 10; i++)
		await f.send('touchMove', c.x - dx + (2 * dx * i) / 10, c.y - dy + (2 * dy * i) / 10);
	await f.send('touchEnd');
	await f.done();
}

/** hold a finger still on the element's centre */
export async function longPress(page: Page, el: Locator, ms = 600) {
	const c = await centre(el);
	const f = await finger(page);
	await f.send('touchStart', c.x, c.y);
	await page.waitForTimeout(ms);
	await f.send('touchEnd');
	await f.done();
}

/** Fails on any visible control under 48×48 CSS px. Allowlist (targets48-allowlist.json) = known gaps by label;
 * empty it as #101 lands. shortcut: measures the element box, so a ::before hit-slop doesn't count; read it from
 * getComputedStyle if #101 uses pseudo-element hit areas. */
export async function expectTargets48(page: Page) {
	const small = await page.evaluate(() => {
		const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [tabindex]:not([tabindex="-1"])'; // prettier-ignore
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>(sel)) {
			if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0 || (r.width >= 48 && r.height >= 48)) continue;
			const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('name') || el.tagName).trim().slice(0, 40); // prettier-ignore
			out.push(`${label} (${Math.round(r.width)}×${Math.round(r.height)})`);
		}
		return out;
	});
	const known = new Set<string>(allow);
	expect(small.filter((s) => !known.has(s.replace(/ \(\d+×\d+\)$/, '')))).toEqual([]);
}

/** Fails on visible desktop wording: Ctrl, Click, Esc, PC view (G13, #115). */
export async function noDesktopHints(page: Page) {
	const hits = await page.evaluate(() => {
		const out: string[] = [];
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			const t = n.textContent ?? '';
			if (
				/\b(ctrl|click|esc)\b|pc view/i.test(t) &&
				n.parentElement?.checkVisibility({ checkVisibilityCSS: true })
			)
				out.push(t.trim().slice(0, 60));
		}
		return out;
	});
	expect(hits).toEqual([]);
}
