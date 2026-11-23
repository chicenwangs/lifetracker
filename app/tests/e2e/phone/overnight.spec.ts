// #292: a block that crosses midnight shows on both days in the phone Week and Month agendas.
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let label = '';

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	label = `Overnight ${info.project.name}`;
	// 23:00-01:00 on 2030-03-05 in Asia/Kuala_Lumpur (UTC+8, the default zone)
	await page.evaluate(async (l) => {
		await fetch('/api/blocks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ startAt: '2030-03-05T15:00:00Z', endAt: '2030-03-05T17:00:00Z', label: l }) }); // prettier-ignore
	}, label);
});
test.afterAll(() => page.context().close());

test('Week: the next day shows the continuation', async () => {
	await page.goto('/week?w=2030-03-04');
	for (const d of ['2030-03-05', '2030-03-06'])
		await expect(page.locator(`section[data-date="${d}"]`)).toContainText(label);
});

test('Month: the next day agenda shows the continuation', async () => {
	await page.goto('/month?m=2030-03&d=2030-03-06');
	await expect(page.getByRole('region', { name: /Agenda for/ })).toContainText(label);
});
