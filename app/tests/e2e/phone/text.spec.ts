// Text sizes on phone (#116): nothing under 12 px; at 130 % and 200 % text (the Android font setting) the
// tab screens wrap instead of running off the side. Screenshots land in test-results/ for review.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
const SCREENS = ['/today', '/week', '/month', '/keep', '/pages', '/settings'];

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	// a busy day so small labels (month +N, chips, times) are on screen
	await page.evaluate(async (tag) => {
		const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
		for (let i = 0; i < 5; i++)
			await fetch('/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `Text ${tag} ${i} with a fairly long title to wrap`, date: today, time: `1${i}:00` }) }); // prettier-ignore
	}, info.project.name);
});
test.afterAll(() => page.context().close());

const small = () =>
	page.evaluate(() => {
		const out = new Set<string>();
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = w.nextNode(); n; n = w.nextNode()) {
			const el = n.parentElement;
			if (!el || !n.textContent?.trim() || el.closest('.sr-only')) continue;
			if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
			const fs = parseFloat(getComputedStyle(el).fontSize);
			if (fs < 12) out.add(`${fs}px ${el.tagName.toLowerCase()}.${el.className} "${n.textContent.trim().slice(0, 20)}"`);
		}
		return [...out];
	}); // prettier-ignore

for (const p of SCREENS)
	test(`${p}: no text under 12 px; holds at 130 % and 200 %`, async () => {
		const info = test.info();
		await page.goto(p);
		await page.waitForLoadState('networkidle');
		expect(await small()).toEqual([]);
		for (const z of [1, 1.3, 2]) {
			if (z > 1) await page.reload({ waitUntil: 'networkidle' });
			// Android's font setting = WebView text zoom: every font size scales, the layout does not
			const cut = await page.evaluate((zoom) => {
				for (const el of document.querySelectorAll<HTMLElement>('body *'))
					el.dataset.fs ??= getComputedStyle(el).fontSize;
				for (const el of document.querySelectorAll<HTMLElement>('body *'))
					el.style.fontSize = `${parseFloat(el.dataset.fs ?? '16') * zoom}px`;
				const out = new Set<string>();
				const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				for (let n = w.nextNode(); n; n = w.nextNode()) {
					const el = n.parentElement;
					if (!el || !n.textContent?.trim() || el.closest('.sr-only')) continue;
					if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
					// a sideways scroller (chip rows) may hold more than the screen: swipe reaches it
					let sc: HTMLElement | null = el;
					while (sc && !/auto|scroll/.test(getComputedStyle(sc).overflowX)) sc = sc.parentElement;
					if (sc) continue;
					const r = document.createRange();
					r.selectNodeContents(n);
					const b = r.getBoundingClientRect();
					if (b.width && (b.right > innerWidth + 1 || b.left < -1))
						out.add(n.textContent.trim().slice(0, 20));
				}
				return [...out];
			}, z);
			await page.screenshot({ path: info.outputPath(`${p.slice(1)}-${z * 100}.png`) });
			expect(cut, `text off screen at ${z * 100} %`).toEqual([]);
		}
	});
