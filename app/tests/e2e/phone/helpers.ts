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
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await setHints(page, HINTS); // first-use hints (#104) off, except in hints.spec
}

export const HINTS = ['today', 'calendar', 'month', 'keep'];
/** which first-use gesture hints count as already seen (#104) */
export const setHints = (page: Page, seen: string[]) =>
	page.evaluate(async (hintsSeen) => {
		await fetch('/api/me/prefs', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hintsSeen }) }); // prettier-ignore
	}, seen);

export const bottomBar = (page: Page) => page.getByRole('navigation', { name: 'Phone navigation' });

/** one CDP session per gesture: a touch started on one session can't be moved from another */
export async function finger(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	return { send, done: () => cdp.detach() };
}
async function centre(el: Locator) {
	await el.evaluate((n) => n.scrollIntoView({ block: 'center' })); // a finger can only touch what is on screen (not under the bar)
	const b = await el.boundingBox();
	if (!b) throw new Error('element not visible');
	return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

/** finger swipe across 80 % of the element (or `distance` px), 10 move steps */
export async function swipe(
	page: Page,
	el: Locator,
	dir: 'left' | 'right' | 'up' | 'down',
	distance?: number,
) {
	const c = await centre(el);
	const across = dir === 'left' || dir === 'right' ? c.w : c.h;
	const span = distance ?? 0.8 * across;
	const sign = dir === 'left' || dir === 'up' ? -1 : 1;
	const dx = dir === 'left' || dir === 'right' ? (sign * span) / 2 : 0;
	const dy = dir === 'up' || dir === 'down' ? (sign * span) / 2 : 0;
	// default: swipe inside the element; explicit distance: start at the centre and travel that far
	const sx = distance === undefined ? c.x - dx : c.x;
	const sy = distance === undefined ? c.y - dy : c.y;
	const f = await finger(page);
	await f.send('touchStart', sx, sy);
	for (let i = 1; i <= 10; i++) await f.send('touchMove', sx + (2 * dx * i) / 10, sy + (2 * dy * i) / 10);
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

/** toBeVisible() can't see clipping (overflow) or cover (another layer on top); this checks a tap at the
 * centre of every match lands on it. Use it for popups and menus, e.g. inside sheets (#120 clipped the / menu). */
export async function expectTappable(el: Locator) {
	await expect(el.first()).toBeVisible();
	for (const one of await el.all()) {
		await one.evaluate((n) => n.scrollIntoView({ block: 'center' })); // not just 'in view': fixed bars sit on the edges
		const hit = () =>
			one.evaluate((n) => {
				const r = n.getBoundingClientRect();
				const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return !!at && n.contains(at);
			});
		await expect.poll(hit, { message: `tap misses ${await one.innerText().catch(() => '?')}` }).toBe(true);
	}
}

/** Fails on any visible control whose hit area is under 48×48 CSS px (#101, G5). Hit area = the element box, a
 * wrapping <label>, or an absolutely placed ::before / ::after hit-slop (visual can stay smaller). Inline links in
 * running text are exempt (WCAG 2.5.8). Allowlist (targets48-allowlist.json) = known gaps by label. */
export async function expectTargets48(page: Page) {
	const small = await page.evaluate(() => {
		const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"])'; // prettier-ignore
		const hit = (el: Element) => {
			const r = el.getBoundingClientRect();
			let w = r.width;
			let h = r.height;
			for (const p of ['::before', '::after']) {
				const cs = getComputedStyle(el, p);
				if (cs.content === 'none' || cs.position !== 'absolute') continue;
				w = Math.max(w, parseFloat(cs.width) || 0);
				h = Math.max(h, parseFloat(cs.height) || 0);
			}
			return { w, h };
		};
		const out: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>(sel)) {
			if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
			const r = el.getBoundingClientRect();
			if (r.width <= 1 || r.height <= 1 || el.closest('[aria-hidden="true"]')) continue; // sr-only / hidden helpers
			if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p')) continue;
			const own = hit(el);
			const lab = el.closest('label');
			const box = lab ? hit(lab) : own;
			// round like the label below: sub-pixel layout (e.g. 47.99 on Linux CI fonts) is 48 dp
			if (Math.round(Math.max(own.w, box.w)) >= 48 && Math.round(Math.max(own.h, box.h)) >= 48) continue;
			const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('name') || el.tagName).trim().slice(0, 40); // prettier-ignore
			out.push(`${label} (${Math.round(own.w)}×${Math.round(own.h)})`);
		}
		return out;
	});
	const known = new Set<string>(allow);
	expect(small.filter((s) => !known.has(s.replace(/ \(\d+×\d+\)$/, '')))).toEqual([]);
}

/** Fails on desktop wording shown or read out on phone: Ctrl, Click, Esc, PC view (G13, #115). */
export async function noDesktopHints(page: Page) {
	await page.waitForLoadState('networkidle'); // hydrated: phone-only wording is set after mount
	const hits = await page.evaluate(() => {
		const out: string[] = [];
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			const t = n.textContent ?? '';
			if (
				/\b(ctrl|click|esc)\b|double-click|right-click|pc view/i.test(t) &&
				n.parentElement?.checkVisibility({ checkVisibilityCSS: true })
			)
				out.push(t.trim().slice(0, 60));
		}
		// what TalkBack reads counts too (#115: "Not started. Click to start")
		for (const el of document.querySelectorAll<HTMLElement>('[aria-label], [aria-description], [title]')) {
			if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
			for (const at of ['aria-label', 'aria-description', 'title']) {
				const t = el.getAttribute(at) ?? '';
				if (/\b(ctrl|click|esc)\b|double-click|right-click|pc view/i.test(t))
					out.push(`[${at}] ${t.slice(0, 60)}`);
			}
		}
		return out;
	});
	expect(hits).toEqual([]);
}
