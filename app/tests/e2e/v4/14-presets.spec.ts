// Card 14 (O-1 item 6, D-V4-11, D-V4-21) on desktop: Settings › Types gets "+ Add a preset ▾" with the five
// starter types (Class has Month calendar off), the 10-type cap disables it, a type whose name already exists is
// "(have it)", a taken slug is the existing bad_slug toast, and the new type is usable at once (/class, Week).
import { expect, test, type Page } from '@playwright/test';

const PW = 'good pass phrase';
// flow.spec.ts ends by resetting jeremy's password; a lone run has the setup password
const PASSWORDS = ['reset pass phrase 1', PW];

async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.fill('#tk', 'e2e-setup-token-long-enough');
		await page.fill('#p', PW);
		await page.fill('#cp', PW);
		await page.click('button[type=submit]');
	} else if (page.url().includes('/login')) {
		for (const pw of PASSWORDS) {
			await page.fill('#u', 'jeremy');
			await page.fill('#p', pw);
			await page.click('button[type=submit]');
			await page.waitForURL((u) => !/^\/(login|setup)/.test(u.pathname), { timeout: 5000 }).catch(() => {});
			if (!page.url().includes('/login')) break;
		}
	}
	await expect(page).not.toHaveURL(/\/(setup|login)/);
	const skip = page.getByRole('button', { name: 'Skip tour' });
	await skip.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

/** JSON fetch as the page's user (same helper shape as flow.spec.ts) */
const api = (page: Page, m: string, p: string, b?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(p as string, {
				method: m as string,
				headers: { 'content-type': 'application/json' },
				body: b ? JSON.stringify(b) : undefined,
			});
			return { s: r.status, j: await r.json().catch(() => null) };
		},
		[m, p, b] as const,
	);
interface TypeRow {
	id: string;
	key: string;
	name: string;
	slug: string;
	bg: string;
	position: number;
	builtin: boolean;
	onCalendar: boolean;
}
const types = async (page: Page) =>
	((await api(page, 'GET', '/api/item-types')).j as { types: TypeRow[] }).types;

/** the shared e2e DB keeps what earlier specs wrote: start from the five built-ins, Month on, nothing hidden */
async function reset(page: Page) {
	for (const t of (await types(page)).filter((t) => !t.builtin)) {
		const r = await api(page, 'DELETE', `/api/item-types/${t.id}`, { moveTo: null });
		expect(r.s).toBe(200);
	}
	for (const t of await types(page))
		if (!t.onCalendar) await api(page, 'PATCH', `/api/item-types/${t.id}`, { onCalendar: true });
	await api(page, 'PATCH', '/api/me/prefs', { hiddenTypes: [] });
}

const mkItem = async (page: Page, body: Record<string, unknown>) => {
	const r = await api(page, 'POST', '/api/items', body);
	expect(r.s).toBe(201);
	return r.j.item.id as string;
};
const drop = (page: Page, id: string) => api(page, 'DELETE', `/api/items/${id}`);
/** owner-local date n days from now (Asia/Kuala_Lumpur project timezone) */
const day = (page: Page, n: number) =>
	page.evaluate((days) => {
		const d = new Date(Date.now() + days * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}, n);
const presetBtn = (page: Page) => page.getByRole('button', { name: /Add a preset/ });
const presetRow = (page: Page, name: string) => page.locator('.presets .preset', { hasText: name });

test('C1/C2/C3 five presets in order, cap disabled with its helper, a name already on the account is (have it)', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings/types');
	const add = presetBtn(page);
	await expect(add).toBeEnabled();
	// DESIGN line 29 helper stays as is
	await expect(page.getByText('Off = hidden on Month, still on Week, Today and reminders.')).toBeVisible();
	await add.click();
	const rows = page.locator('.presets .preset');
	await expect(rows).toHaveCount(5);
	expect(await rows.allInnerTexts()).toEqual(['Class', 'Errand', 'Health', 'Chore', 'Study']);
	expect(
		await page
			.locator('.presets .dot')
			.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor)),
	).toEqual([
		'rgb(211, 238, 206)',
		'rgb(250, 237, 184)',
		'rgb(238, 207, 212)',
		'rgb(230, 231, 240)',
		'rgb(201, 218, 231)',
	]);
	await page.keyboard.press('Escape');
	await expect(rows).toHaveCount(0);

	// the menu hangs under its button (not at the viewport's corner) and a pointer at each row's centre hits
	// that row — the sticky header must never cover it (regression: the popover was outside the relative wrapper)
	await add.click();
	const wrap = (await page.locator('.addpreset').boundingBox())!;
	const menu = (await page.locator('.presets').boundingBox())!;
	expect(Math.abs(menu.x - wrap.x)).toBeLessThanOrEqual(1);
	expect(menu.y).toBeGreaterThanOrEqual(wrap.y + wrap.height - 1);
	for (const one of await page.locator('.presets .preset').all()) {
		const hit = await one.evaluate((n) => {
			const r = n.getBoundingClientRect();
			const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
			return !!at && n.contains(at);
		});
		expect(hit).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(rows).toHaveCount(0);

	// C3: the built-in Event renamed to Class -> the Class preset is greyed with "(have it)" and does nothing
	const event = (await types(page)).find((t) => t.key === 'Event') as TypeRow;
	await api(page, 'PATCH', `/api/item-types/${event.id}`, { name: 'Class' });
	try {
		await page.reload();
		await add.click();
		const cls = presetRow(page, 'Class');
		await expect(cls).toBeDisabled();
		await expect(cls).toContainText('(have it)');
		expect(await types(page)).toHaveLength(5);
	} finally {
		await api(page, 'PATCH', `/api/item-types/${event.id}`, { name: 'Event' });
	}

	// C2: 9/10 keeps the button on; the 10th disables it and shows the cap helper
	for (let i = 1; i <= 4; i++) {
		const r = await api(page, 'POST', '/api/item-types', {
			name: `Extra ${i}`,
			bg: '#3D5A80',
			slug: `extra${i}`,
		});
		expect(r.s).toBe(201);
	}
	await page.reload();
	await expect(add).toBeEnabled();
	expect(
		await api(page, 'POST', '/api/item-types', { name: 'Extra 5', bg: '#3D5A80', slug: 'extra5' }),
	).toMatchObject({ s: 201 });
	try {
		await page.reload();
		await expect(add).toBeDisabled();
		await expect(page.getByText('Remove a type to add more')).toBeVisible();
		const extra = (await types(page)).find((t) => t.slug === 'extra1') as TypeRow;
		await api(page, 'DELETE', `/api/item-types/${extra.id}`, { moveTo: null });
		await page.reload();
		await expect(add).toBeEnabled();
		await expect(page.getByText('Remove a type to add more')).toHaveCount(0);
	} finally {
		await reset(page);
	}
});

test('C4/C6/C8/C11 add Class: one type after the last, no undo toast, /class fills the chip, Week yes Month no', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	const before = await types(page);
	await page.goto('/settings/types');
	await presetBtn(page).click();
	const row = presetRow(page, 'Class');
	// C4: a real pointer click on the first menu row creates it (the row must not sit under the sticky header)
	await row.click();
	await expect(page.getByLabel('Name of Class')).toBeVisible();
	// C8: two rapid clicks in one tick create one type (the page guards the second)
	await presetBtn(page).click();
	await presetRow(page, 'Errand').evaluate((n) => {
		(n as HTMLButtonElement).click();
		(n as HTMLButtonElement).click();
	});
	await expect(page.getByLabel('Name of Errand')).toBeVisible();
	expect((await types(page)).filter((t) => t.slug === 'errand')).toHaveLength(1);
	const made = (await types(page)).filter((t) => t.slug === 'class');
	expect(made).toHaveLength(1);
	const cls = made[0] as TypeRow;
	expect(cls.onCalendar).toBe(false); // Class ships with Month calendar off
	expect(cls.position).toBe(Math.max(...before.map((t) => t.position)) + 1); // after the last type
	expect((await types(page)).slice(0, 5)).toEqual(before); // nothing existing renamed, recoloured, moved or gone
	await expect(page.locator('.toast')).toHaveCount(0); // C11: no undo toast, no journal entry

	// C6: the type is usable at once — its chip is on Home and /class fills the palette's Type slot
	await page.goto('/');
	await expect(page.getByRole('button', { name: /^Class$/ })).toBeVisible();
	await page.locator('button.opener').click();
	await page.keyboard.type('revision fri /class');
	await expect(page.locator('#qa-slots')).toContainText('Class');
	await page.keyboard.press('Escape'); // clear the typed words; the next page leaves the palette behind

	// C4/C6: an item of the new type is on Week but not on Month (Class is off the Month calendar)
	const stamp = Date.now().toString(36);
	const today = await day(page, 0);
	const id = await mkItem(page, { title: `Revision ${stamp}`, type: cls.key, date: today });
	try {
		await page.goto('/week');
		await expect(page.getByRole('button', { name: /^Class$/ })).toBeVisible(); // the week type bar has it too
		await expect(page.getByText(`Revision ${stamp}`).filter({ visible: true }).first()).toBeVisible();
		await page.goto(`/?m=${today.slice(0, 7)}&d=${today}`);
		await expect(page.locator('.lt-chip', { hasText: `Revision ${stamp}` })).toHaveCount(0);
	} finally {
		await drop(page, id);
		await reset(page);
	}
});

test('C7/C12 a taken slug is the bad_slug error naming the owner; the list re-reads, nothing half-created', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	expect(
		await api(page, 'POST', '/api/item-types', { name: 'Health hub', bg: '#3D5A80', slug: 'health' }),
	).toMatchObject({ s: 201 });
	try {
		await page.goto('/settings/types');
		await presetBtn(page).click();
		await presetRow(page, 'Health').click();
		await expect(page.getByRole('alert')).toContainText('/health is used by Health hub.');
		// the menu closes on the error; the list re-read is still the stored one
		await expect(page.locator('.presets')).toHaveCount(0);
		await expect(page.getByLabel('Name of Health hub')).toBeVisible();
		expect((await types(page)).filter((t) => t.name === 'Health')).toHaveLength(0);
	} finally {
		await reset(page);
	}
});

test('C12 offline: the preset create fails with the usual error toast and is not queued', async ({
	page,
}) => {
	await signIn(page);
	await reset(page);
	await page.goto('/settings/types');
	await presetBtn(page).click();
	await page.context().setOffline(true);
	try {
		await presetRow(page, 'Errand').click();
		await expect(page.getByRole('alert')).toContainText("You're offline. Not saved.");
	} finally {
		await page.context().setOffline(false);
	}
	expect((await types(page)).filter((t) => t.slug === 'errand')).toHaveLength(0);
	await reset(page);
});
