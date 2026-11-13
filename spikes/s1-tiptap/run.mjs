// S-1: Tiptap + Svelte 5. Checks from DESIGN §6. Run: npm run s1
import { check, finish, withPage } from '../lib/harness.mjs';

const FIXTURE = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'plain ' },
				{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
				{ type: 'text', text: ' ' },
				{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
			],
		},
		{
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
			],
		},
		{
			type: 'taskList',
			content: [
				{
					type: 'taskItem',
					attrs: { checked: true },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
				},
			],
		},
		{ type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
		{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'q' }] }] },
		{
			type: 'table',
			content: [
				{
					type: 'tableRow',
					content: ['c1', 'c2'].map((t) => ({
						type: 'tableCell',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
					})),
				},
			],
		},
		{ type: 'horizontalRule' },
	],
};

const top = (page) => page.evaluate(() => window.__editor.getJSON().content.map((n) => n.type));
const texts = (page) =>
	page.evaluate(() => window.__editor.getJSON().content.map((n) => n.content?.[0]?.text ?? ''));

await withPage('/s1-tiptap/', async (page, { hosts, errors }) => {
	await page.waitForFunction(() => !!window.__editor); // boolean: returning the editor would pin it (JSHandle)

	// 1 JSON round-trip: load -> save -> load -> save gives the same JSON, nothing dropped
	const [a, b] = await page.evaluate((fx) => {
		const e = window.__editor;
		e.commands.setContent(fx);
		const a = e.getJSON();
		e.commands.setContent(a);
		return [JSON.stringify(a), JSON.stringify(e.getJSON())];
	}, FIXTURE);
	// StarterKit's TrailingNode adds an empty paragraph after a non-text last block: expected, stored as is
	const want = [...FIXTURE.content.map((n) => n.type), 'paragraph'].join();
	const kept =
		want ===
		JSON.parse(a)
			.content.map((n) => n.type)
			.join();
	check('JSON round-trip is stable', a === b);
	check(
		'all block types + marks survive',
		kept && a.includes('"bold"') && a.includes('example.com') && a.includes('"checked":true'),
	);

	// 2 "/" menu as an extension, Svelte popup, keyboard only
	await page.evaluate(() => window.__editor.commands.setContent('<p></p>'));
	await page.click('.ProseMirror');
	await page.keyboard.type('/hea');
	const shown = await page.locator('.slash [role=option]').allTextContents();
	await page.keyboard.press('Enter');
	check('/ menu filters as you type', shown.join() === 'Heading 1', shown.join());
	check('/ menu Enter turns the block into a heading', (await top(page))[0] === 'heading');
	check('/ menu popup removed after pick', (await page.locator('[data-slash]').count()) === 0);
	await page.keyboard.press('Enter');
	await page.keyboard.type('/');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	check('/ menu arrows pick the third entry (to-do list)', (await top(page)).includes('taskList'));
	await page.keyboard.type('/zzz');
	await page.keyboard.press('Escape');
	check('/ menu Escape closes it', (await page.locator('[data-slash]').count()) === 0);

	// 3 selection survives Svelte re-renders around and into the editor component
	await page.evaluate(() => {
		window.__editor.commands.setContent('<p>hello world</p>');
		window.__editor.commands.setTextSelection({ from: 3, to: 8 });
		window.__node = window.__editor.view.dom;
	});
	for (let i = 0; i < 50; i++) await page.evaluate(() => window.__bump());
	const sel = await page.evaluate(() => ({
		from: window.__editor.state.selection.from,
		to: window.__editor.state.selection.to,
		same: window.__node === window.__editor.view.dom,
		tick: document.getElementById('tick').textContent,
		dom: window.getSelection().toString(),
	}));
	check(
		'50 Svelte updates: selection unchanged',
		sel.from === 3 && sel.to === 8 && sel.dom === 'llo w',
		JSON.stringify(sel),
	);
	check('50 Svelte updates: editor DOM not re-created', sel.same && sel.tick === '50');
	await page.keyboard.type('X');
	await page.evaluate(() => window.__bump());
	await page.keyboard.type('Y');
	check(
		'typing between updates lands at the caret',
		(await texts(page))[0] === 'heXYorld',
		(await texts(page))[0],
	);
	check('onUpdate reaches Svelte state', (await page.textContent('#status')).includes('edited'));

	// 4 block select / move / duplicate / delete
	const ops = (fn, arg) => page.evaluate(([f, x]) => window.__blocks[f](window.__editor.view, x), [fn, arg]);
	await page.evaluate(() => {
		window.__editor.commands.setContent('<p>A</p><p>B</p><p>C</p>');
		window.__editor.commands.setTextSelection(5); // inside B
	});
	await ops('select');
	check(
		'block select = node selection',
		await page.evaluate(() => window.__editor.state.selection.node?.textContent === 'B'),
	);
	await ops('move', -1);
	check('block move up', (await texts(page)).join('') === 'BAC');
	await ops('move', 1);
	await ops('move', 1);
	await ops('move', 1); // past the end: no-op
	check('block move down stops at the end', (await texts(page)).join('') === 'ACB');
	await ops('duplicate');
	check('block duplicate', (await texts(page)).join('') === 'ACBB');
	await page.waitForTimeout(600); // history merges edits < 500 ms apart into one undo step
	await ops('remove');
	check('block delete', (await texts(page)).join('') === 'ACB');
	await page.keyboard.press('Control+z');
	check('undo restores only the deleted block', (await texts(page)).join('') === 'ACBB');

	// 5 theme tokens
	const ink = () => page.evaluate(() => getComputedStyle(document.querySelector('.ProseMirror')).color);
	const light = await ink();
	await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
	check('editor follows the theme tokens', light !== (await ink()), `${light} -> ${await ink()}`);

	// 6 mount/destroy: 100 quick cycles, then 10 editors that were typed into; count live objects on the heap
	await page.evaluate(() => delete window.__node); // DOM nodes point back at their view (pmViewDesc)
	await page.keyboard.type('/'); // leave a popup open on purpose: destroy must clean it up too
	for (let i = 0; i < 200; i++) await page.evaluate(() => window.__toggle());
	for (let i = 0; i < 10; i++) {
		await page.click('.ProseMirror');
		await page.keyboard.type('abc');
		await page.evaluate(() => window.__toggle());
		await page.waitForFunction(() => !window.__editor);
		await page.evaluate(() => window.__toggle());
		await page.waitForFunction(() => !!window.__editor);
	}
	await page.evaluate(() => window.__toggle());
	await page.waitForFunction(() => !window.__editor && !document.querySelector('.ProseMirror'));
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('HeapProfiler.collectGarbage');
	const live = [];
	for (const i of [0, 1]) {
		const { result } = await cdp.send('Runtime.evaluate', { expression: `window.__protos[${i}]` });
		const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId });
		const n = await cdp.send('Runtime.callFunctionOn', {
			objectId: objects.objectId,
			functionDeclaration: 'function(){return this.length}',
			returnByValue: true,
		});
		live.push(n.result.value);
	}
	// measured: the last editor that received typing stays reachable (1, never more); untouched ones all go
	check(
		'111 mount/destroy cycles: destroyed editors do not pile up (at most the last typed-in one)',
		live[0] <= 1 && live[1] <= 1,
		`editors ${live[0]}, views ${live[1]}`,
	);
	check('no leftover editor or popup DOM', (await page.locator('.ProseMirror, [data-slash]').count()) === 0);

	// 7 self-hosted only + clean console
	check(
		'no request left localhost',
		[...hosts].every((h) => h.startsWith('localhost')),
		[...hosts].join(),
	);
	check('no page errors', errors.length === 0, errors.join(' | '));
});
finish();
