// In-app dialogs (#109): themed text + confirm dialogs, Back / Cancel close them, delete button is red.
import { expect, test, type Page } from '@playwright/test';
import { expectTappable, signIn } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;

test.beforeAll(async ({ browser }, info) => {
	const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
	page = await (
		await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
	).newPage();
	await signIn(page);
	page.on('dialog', (d) => {
		throw new Error(`browser ${d.type()} dialog shown: ${d.message()}`);
	});
});
test.afterAll(() => page.context().close());

test('New binder asks in an in-app text dialog; Back cancels it', async () => {
	await page.goto('/keep');
	await page.getByRole('button', { name: 'New binder' }).click();
	const dlg = page.getByRole('alertdialog');
	await expect(dlg).toContainText('Binder name');
	await page.goBack();
	await expect(dlg).toBeHidden();
	expect(new URL(page.url()).pathname).toBe('/keep');

	await page.getByRole('button', { name: 'New binder' }).click();
	await expectTappable(dlg.getByRole('button'));
	await dlg.getByRole('textbox').fill('Dialog binder');
	await dlg.getByRole('button', { name: 'Add' }).click();
	await expect(dlg).toBeHidden();
	await expect(page.getByRole('link', { name: 'Dialog binder' }).first()).toBeVisible();
});

test('delete for good asks with a red Delete; Cancel keeps the note', async () => {
	await page.evaluate(async () => {
		const r = await fetch('/api/keep/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Dialog note', body: 'x' }) }); // prettier-ignore
		const id = ((await r.json()) as { note: { id: string } }).note.id;
		await fetch(`/api/keep/notes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); // prettier-ignore
	});
	await page.goto('/keep?scope=trash');
	await page.getByRole('button', { name: 'Delete forever' }).first().click();
	const dlg = page.getByRole('alertdialog');
	const del = dlg.getByRole('button', { name: 'Delete' });
	await expect(del).toHaveClass(/danger/);
	await dlg.getByRole('button', { name: 'Cancel' }).click();
	await expect(dlg).toBeHidden();
	await expect(page.getByText('Dialog note')).toBeVisible();
	await page.getByRole('button', { name: 'Delete forever' }).first().click();
	await del.click();
	await expect(page.getByText('Dialog note')).toBeHidden();
});
