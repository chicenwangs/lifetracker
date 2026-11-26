<!-- Database block (FEATURES PG-DB / PG-RECORDS, wireframes Database + MDb): view tabs, filter + sort pills,
     Columns (hide / reorder), table with in-place cells, column menu, new record. Phone (≤700 px) = cards.
     Every action is a button or field: no drag anywhere. -->
<script lang="ts">
	import { askConfirm, askText } from '$lib/client/dialog.svelte';
	import { goto } from '$app/navigation';
	import { del, get, patch, post, ApiError } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { asText, NO_VALUE_OPS, OP_LABEL, OPS, PROP_TYPES, type Filter, type PropType, type ViewConfig } from '$lib/dbvalues'; // prettier-ignore
	import type { DatabaseDTO, DbProp, DbRow } from '$lib/types';
	import { onMount } from 'svelte';
	import { isPhone } from '$lib/client/phone';
	import { peerSwipe } from '$lib/client/peerSwipe';
	import { backCloses } from '$lib/client/layers';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import { boardGroups, NO_VALUE, type BoardGroup } from './board';
	import DbCell from './DbCell.svelte';

	let { databaseId }: { databaseId: string } = $props();
	const TYPE_LABEL: Record<PropType, string> = { title: 'Aa Title', text: '¶ Text', number: '# Number', date: '▦ Date', checkbox: '☑ Checkbox', select: '◉ Select', multi_select: '◎ Multi-select', url: '↗ URL' }; // prettier-ignore
	const COLORS = ['work', 'hobby', 'exam', 'event', 'dating', 'none'];

	let d = $state<DatabaseDTO | null>(null);
	let gone = $state(false);
	let panel = $state<'filter' | 'sort' | 'cols' | 'add' | null>(null);
	let openProp = $state<string | null>(null);
	let nf = $state<{ prop: string; op: string; value: string }>({ prop: '', op: '', value: '' });
	let ns = $state<{ prop: string; dir: 'asc' | 'desc' }>({ prop: '', dir: 'asc' });
	let np = $state('');
	// v4 PR 23: board view state
	let addingView = $state(false);
	let viewCfgOpen = $state(false);
	let menuFor = $state<string | null>(null);
	let moving = $state<string | null>(null); // drag (desktop) or long-press pick-up (phone)
	let activeCol = $state(0);
	let phoneNow = $state(false);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let swallowedClick = false; // the click a long press would otherwise fire on the card's title
	onMount(() => (phoneNow = isPhone()));

	const view = $derived(d?.views.find((v) => v.id === d?.viewId));
	const cfg = $derived<ViewConfig>(view?.config ?? {});
	const ordered = $derived.by(() => {
		if (!d) return [];
		const order = cfg.order ?? [];
		const ix = (p: DbProp) => (order.includes(p.id) ? order.indexOf(p.id) : 1e6);
		return [...d.props].sort((a, b) => ix(a) - ix(b));
	});
	const cols = $derived(ordered.filter((p) => !(cfg.hidden ?? []).includes(p.id)));
	const prop = (id: string) => d?.props.find((p) => p.id === id);
	const titleProp = $derived(d?.props.find((p) => p.type === 'title'));
	const title = (r: DbRow) => (titleProp && (r.values[titleProp.id] as string)) || 'Untitled';
	// board: the group property is the saved one, else the first select property; cards show 2 properties
	const selectProps = $derived((d?.props ?? []).filter((p) => p.type === 'select'));
	const isBoard = $derived(view?.type === 'board');
	const groupProp = $derived<DbProp | undefined>(
		(cfg.groupBy ? prop(cfg.groupBy) : undefined) ?? selectProps[0],
	);
	const boardCols = $derived(groupProp && d ? boardGroups(d.rows, groupProp) : []);
	const cardProps = $derived.by(() => {
		if (!d) return [] as DbProp[];
		const picked = (cfg.cardProps ?? [])
			.map((id) => prop(id))
			.filter((p): p is DbProp => !!p && p.type !== 'title');
		return picked.length ? picked.slice(0, 2) : d.props.filter((p) => p.type !== 'title').slice(0, 2);
	});
	// gallery (PR 25): cards with a cover chain (picture link, page cover, page icon), title and the chosen properties
	const isGallery = $derived(view?.type === 'gallery');
	const coverProp = $derived(cfg.coverProp ? prop(cfg.coverProp) : undefined);
	const cardSize = $derived<'S' | 'M' | 'L'>(cfg.cardSize ?? 'M');
	const coverOf = (r: DbRow) => {
		const v = coverProp ? r.values[coverProp.id] : null;
		// DESIGN 2.7: a picture link on the record -> its page cover -> --ground with the page icon
		if (
			typeof v === 'string' &&
			(/^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)([?#]\S*)?$/i.test(v) ||
				/^\/api\/attachments\/att_[0-9a-z]+$/.test(v))
		)
			return v;
		return r.coverId ? `/api/attachments/${r.coverId}` : '';
	};
	function setCover(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		void saveBoard({ coverProp: id || null });
	}
	function setSize(e: Event) {
		void saveBoard({ cardSize: (e.currentTarget as HTMLSelectElement).value as 'S' | 'M' | 'L' });
	}

	async function load(viewId: string | undefined = d?.viewId) {
		try {
			const q = viewId ? `&view=${viewId}` : '';
			d = (await get<{ database: DatabaseDTO }>(`/api/databases/${databaseId}?limit=100${q}`)).database;
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) gone = true;
			else showError(e);
		}
	}
	async function more() {
		if (!d) return;
		try {
			const r = await get<{ database: DatabaseDTO }>(
				`/api/databases/${databaseId}?limit=100&offset=${d.rows.length}&view=${d.viewId}`,
			);
			d.rows.push(...r.database.rows);
		} catch (e) {
			showError(e);
		}
	}
	$effect(() => {
		void databaseId;
		void load('');
	});

	async function run(f: () => Promise<unknown>, reload = true) {
		try {
			await f();
			if (reload) await load();
		} catch (e) {
			showError(e);
		}
	}
	/** D-19: the server answers 409 with what would be lost; ask, then send again with confirm */
	async function confirmed(send: (confirm: boolean) => Promise<unknown>) {
		try {
			await send(false);
		} catch (e) {
			if (!(e instanceof ApiError) || e.code !== 'values_lost') return showError(e);
			if (!(await askConfirm(`${e.message}\n\nGo ahead?`, { ok: 'Go ahead', danger: true }))) return;
			await send(true).catch(showError);
		}
		await load();
	}
	const saveView = (c: ViewConfig) => run(() => patch(`/api/database-views/${d?.viewId}`, { config: c }));

	// ---------- views ----------
	async function renameView() {
		const name = await askText('Rename the view', { value: view?.name, ok: 'Rename' });
		if (name) void run(() => patch(`/api/database-views/${d?.viewId}`, { name }));
	}
	async function deleteView() {
		if (!(await askConfirm(`Delete the view "${view?.name}"? Records stay.`, { ok: 'Delete', danger: true })))
			return;
		void run(async () => {
			await del(`/api/database-views/${d?.viewId}`);
			await load('');
		}, false);
	}

	// ---------- filter + sort ----------
	function addFilter() {
		const p = prop(nf.prop);
		if (!p || !nf.op) return;
		const noValue = NO_VALUE_OPS.includes(nf.op);
		if (p.type === 'number' && !noValue && (nf.value.trim() === '' || !Number.isFinite(Number(nf.value))))
			return showError(new Error('Number filters need a number, like 40.'));
		const value =
			p.type === 'number' ? Number(nf.value) : p.type === 'checkbox' ? nf.value === 'yes' : nf.value;
		const f: Filter = noValue ? { prop: p.id, op: nf.op } : { prop: p.id, op: nf.op, value };
		void saveView({ ...cfg, filters: [...(cfg.filters ?? []), f] });
		panel = null;
		nf = { prop: '', op: '', value: '' };
	}
	function filterText(f: Filter) {
		const p = prop(f.prop);
		if (!p) return 'removed column';
		let v = '';
		if (!NO_VALUE_OPS.includes(f.op))
			v =
				p.type === 'checkbox'
					? f.value
						? 'checked'
						: 'unchecked'
					: asText(p.type === 'multi_select' ? 'select' : p.type, f.value, p.config);
		return `${p.name} ${OP_LABEL[f.op] ?? f.op} ${v}`.trim();
	}

	// ---------- columns ----------
	function toggleHidden(id: string) {
		const h = cfg.hidden ?? [];
		void saveView({ ...cfg, hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] });
	}
	function shift(id: string, dir: -1 | 1) {
		const ids = ordered.map((p) => p.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
		void saveView({ ...cfg, order: ids });
	}
	function addProp(type: PropType) {
		const name = np.trim() || TYPE_LABEL[type].replace(/^\S+ /, '');
		np = '';
		panel = null;
		void run(() => post(`/api/databases/${databaseId}/properties`, { name, type }));
	}
	function renameProp(p: DbProp, name: string) {
		if (name.trim() && name.trim() !== p.name)
			void run(() => patch(`/api/database-properties/${p.id}`, { name }));
	}
	const retype = (p: DbProp, type: PropType) =>
		confirmed((confirm) => patch(`/api/database-properties/${p.id}`, { type, confirm }));
	function setOptions(p: DbProp, text: string) {
		const old = p.config.options ?? [];
		const labels = [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))]; // prettier-ignore
		const options = labels.map(
			(label, i) =>
				old.find((o) => o.label === label) ?? {
					id: crypto.randomUUID().slice(0, 8),
					label,
					color: COLORS[(old.length + i) % COLORS.length] as string,
				},
		);
		void confirmed((confirm) => patch(`/api/database-properties/${p.id}`, { config: { options }, confirm }));
	}
	function deleteProp(p: DbProp) {
		openProp = null;
		void confirmed((c) => del(`/api/database-properties/${p.id}${c ? '?confirm=1' : ''}`));
	}

	// ---------- records ----------
	async function setValue(r: DbRow, p: DbProp, v: unknown): Promise<string | null> {
		try {
			const out = await patch<{ values: Record<string, unknown> }>(`/api/database-records/${r.id}`, {
				values: { [p.id]: v },
			});
			r.values[p.id] = out.values[p.id];
			r.invalid = r.invalid?.filter((x) => x !== p.id);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : 'Not saved';
		}
	}
	// a new record joins the list as is, even when the current filter would hide it: it must be fillable
	const addRecord = () =>
		run(async () => {
			const r = await post<{ row: DbRow }>(`/api/databases/${databaseId}/records`, {});
			d?.rows.push(r.row);
			if (d) d.total++;
		}, false);
	const openRecord = (r: DbRow) =>
		run(async () => {
			const p = await post<{ pageId: string }>(`/api/database-records/${r.id}/page`);
			await goto(`/pages/${p.pageId}`);
		}, false);
	async function deleteRecord(r: DbRow) {
		if (
			!(await askConfirm(`Delete "${title(r)}"? Its page goes to Trash for 30 days; its values are gone.`, {
				ok: 'Delete',
				danger: true,
			}))
		)
			return;
		void run(() => del(`/api/database-records/${r.id}`));
	}
	const toggle = (p: typeof panel) => (panel = panel === p ? null : p);

	// ---------- board (v4 PR 23) ----------
	function addViewOfType(type: 'table' | 'board' | 'gallery') {
		addingView = false;
		void (async () => {
			const name = await askText('Name the view', {
				value: type === 'gallery' ? 'Gallery' : type === 'board' ? 'Board' : 'Table',
				ok: 'Add',
			});
			if (!name) return;
			await run(async () => {
				const r = await post<{ view: { id: string } }>(`/api/databases/${databaseId}/views`, {
					name,
					type,
				});
				await load(r.view.id);
			}, false);
		})();
	}
	const saveBoard = (c: ViewConfig) => saveView({ ...cfg, ...c });
	function setGroup(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		void saveBoard({ groupBy: id || null });
	}
	function setCard(i: 0 | 1, e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		const cur = cardProps.map((p) => p.id);
		while (cur.length < 2) cur.push('');
		cur[i] = v;
		void saveBoard({ cardProps: cur.filter(Boolean).slice(0, 2) });
	}
	/** one move = PATCH the group value; the toast Undo puts the old value back. */
	async function move(r: DbRow, optId: string) {
		swallowedClick = false;
		const p = groupProp;
		if (!p) return;
		const old = (r.values[p.id] as string | null | undefined) ?? null;
		if ((old ?? NO_VALUE) === optId) return;
		menuFor = null;
		moving = null;
		try {
			const out = await patch<{ values: Record<string, unknown> }>(`/api/database-records/${r.id}`, {
				values: { [p.id]: optId || null },
			});
			r.values[p.id] = out.values[p.id];
			const label = optId ? (p.config.options?.find((o) => o.id === optId)?.label ?? optId) : 'No value';
			showToast(`Moved to ${label}`, {
				undo: async () => {
					await patch(`/api/database-records/${r.id}`, { values: { [p.id]: old } });
					await load();
				},
			});
		} catch (e) {
			showError(e);
		}
	}
	async function newIn(col: BoardGroup) {
		await run(async () => {
			const r = await post<{ row: DbRow }>(`/api/databases/${databaseId}/records`, {});
			if (groupProp && col.id)
				await patch(`/api/database-records/${r.row.id}`, { values: { [groupProp.id]: col.id } });
			await load();
		}, false);
	}
	function pickStart(r: DbRow, e: PointerEvent) {
		px0 = e.clientX;
		if (!phoneNow) return;
		clearTimeout(pressTimer);
		swallowedClick = false; // a fresh press starts clean: only THIS long press may swallow the next click
		pressTimer = setTimeout(() => {
			moving = r.id;
			swallowedClick = true;
		}, 500);
	}
	function pickEnd() {
		clearTimeout(pressTimer);
	}
	let px0 = 0;
	function pickMove(e: PointerEvent) {
		if (Math.abs(e.clientX - px0) > 10) clearTimeout(pressTimer); // a swipe is not a pick-up
	}
	const boardStep = (n: 1 | -1) => {
		activeCol = Math.min(boardCols.length - 1, Math.max(0, activeCol + n));
	};
	/** phone: a chip tap drops a picked-up card on that column, else switches which column shows. */
	function chipTap(i: number) {
		swallowedClick = false;
		const id = moving;
		moving = null;
		activeCol = i;
		if (id) {
			const r = d?.rows.find((x) => x.id === id);
			if (r) void move(r, boardCols[i]?.id ?? '');
		}
	}
	function dropAt(col: BoardGroup) {
		const id = moving;
		moving = null;
		if (!id) return;
		const r = d?.rows.find((x) => x.id === id);
		if (r) void move(r, col.id);
	}
</script>

{#if gone}
	<p class="hint dbv">This database is unavailable.</p>
{:else if !d}
	<p class="hint dbv">Loading database…</p>
{:else}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<section
		class="dbv"
		aria-label="Database {d.title || 'Untitled'}"
		data-db={d.id}
		onmousedown={(e) => {
			// phone, inside the page editor: a real mousedown on a button or a board card must not move the editor
			// caret (it can re-render the block between down and up and swallow the click / drop the long press).
			// Desktop keeps the default so HTML5 drag on a card still starts.
			if (phoneNow && (e.target as HTMLElement).closest('button, .bcard')) e.preventDefault();
		}}
	>
		{#snippet boardCfg()}
			{#if isGallery}
				<label
					>Cover
					<select aria-label="Cover property" value={coverProp?.id ?? ''} onchange={setCover}>
						<option value="">None</option>
						{#each (d?.props ?? []).filter((p) => p.type === 'url') as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</label>
				<label
					>Card size
					<select aria-label="Card size" value={cardSize} onchange={setSize}>
						<option value="S">Small</option>
						<option value="M">Medium</option>
						<option value="L">Large</option>
					</select>
				</label>
			{:else}
				<label
					>Group by
					<select aria-label="Group by" value={groupProp?.id ?? ''} onchange={setGroup}>
						{#each selectProps as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
				</label>
			{/if}
			<label
				>Card shows
				<select aria-label="Card property 1" value={cardProps[0]?.id ?? ''} onchange={(e) => setCard(0, e)}>
					<option value="">None</option>
					{#each (d?.props ?? []).filter((p) => p.type !== 'title') as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
				<select aria-label="Card property 2" value={cardProps[1]?.id ?? ''} onchange={(e) => setCard(1, e)}>
					<option value="">None</option>
					{#each (d?.props ?? []).filter((p) => p.type !== 'title') as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
		{/snippet}
		<input
			class="dbtitle"
			aria-label="Database name"
			placeholder="Untitled database"
			maxlength="300"
			value={d.title}
			onchange={(e) => {
				const t = e.currentTarget.value;
				void run(() => patch(`/api/databases/${databaseId}`, { title: t }));
			}}
		/>
		<div class="tabs">
			<div class="tl" role="tablist" aria-label="Views">
				{#each d.views as v (v.id)}
					<button type="button" role="tab" aria-selected={v.id === d.viewId} onclick={() => load(v.id)}
						>▤ {v.name}</button
					>
				{/each}
			</div>
			<button type="button" class="soft" aria-expanded={addingView} onclick={() => (addingView = !addingView)}
				>+ View</button
			>
			{#if addingView && !phoneNow}
				<div class="panel row" role="group" aria-label="New view type">
					<button type="button" onclick={() => addViewOfType('table')}>Table</button>
					<button type="button" onclick={() => addViewOfType('board')}>Board</button>
					<button type="button" onclick={() => addViewOfType('gallery')}>Gallery</button>
				</div>
			{/if}
			<span class="grow"></span>
			{#if isBoard || isGallery}
				<button
					type="button"
					class="soft"
					aria-expanded={viewCfgOpen}
					onclick={() => (viewCfgOpen = !viewCfgOpen)}>View settings</button
				>
			{/if}
			<button type="button" class="soft" onclick={renameView}>Rename view</button>
			{#if d.views.length > 1}
				<button type="button" class="soft" onclick={deleteView}>Delete view</button>
			{/if}
		</div>

		{#if (isBoard || isGallery) && viewCfgOpen && !phoneNow}
			<div class="panel row" role="group" aria-label="View settings">
				{@render boardCfg()}
			</div>
		{/if}
		{#if phoneNow && addingView}
			<BottomSheet label="New view" onclose={() => (addingView = false)}>
				<div class="row">
					<button type="button" class="btn" onclick={() => addViewOfType('table')}>Table</button>
					<button type="button" class="btn" onclick={() => addViewOfType('gallery')}>Gallery</button>
					<button type="button" class="btn primary" onclick={() => addViewOfType('board')}>Board</button>
				</div>
			</BottomSheet>
		{/if}
		{#if phoneNow && (isBoard || isGallery) && viewCfgOpen}
			<BottomSheet label="View settings" onclose={() => (viewCfgOpen = false)}>
				<div class="panel row" role="group" aria-label="View settings">
					{@render boardCfg()}
				</div>
			</BottomSheet>
		{/if}

		<div class="bar">
			{#each cfg.filters ?? [] as f, i (i)}
				<button
					type="button"
					class="pill on"
					aria-label="Remove filter: {filterText(f)}"
					onclick={() => saveView({ ...cfg, filters: (cfg.filters ?? []).filter((_, j) => j !== i) })}
					>{filterText(f)} ✕</button
				>
			{/each}
			{#if cfg.sort && prop(cfg.sort.prop)}
				<button
					type="button"
					class="pill on"
					aria-label="Remove sort: {prop(cfg.sort.prop)?.name} {cfg.sort.dir === 'asc' ? '↑' : '↓'}"
					onclick={() => saveView({ ...cfg, sort: null })}
					>{prop(cfg.sort.prop)?.name} {cfg.sort.dir === 'asc' ? '↑' : '↓'} ✕</button
				>
			{/if}
			{#if (cfg.filters ?? []).length > 1}
				<button type="button" class="pill" onclick={() => saveView({ ...cfg, filters: [] })}>Clear all</button
				>
				<button
					type="button"
					class="pill"
					title="How filters combine"
					onclick={() => saveView({ ...cfg, conj: cfg.conj === 'or' ? 'and' : 'or' })}
					>Match {cfg.conj === 'or' ? 'any' : 'all'}</button
				>
			{/if}
			<button type="button" class="pill" aria-expanded={panel === 'filter'} onclick={() => toggle('filter')}
				>+ Filter</button
			>
			<button type="button" class="pill" aria-expanded={panel === 'sort'} onclick={() => toggle('sort')}
				>+ Sort</button
			>
			<button type="button" class="pill" aria-expanded={panel === 'add'} onclick={() => toggle('add')}
				>+ Property</button
			>
			<span class="grow"></span>
			<button type="button" class="btn sm" aria-expanded={panel === 'cols'} onclick={() => toggle('cols')}
				>Columns</button
			>
			<button type="button" class="btn sm primary" onclick={addRecord}>New record</button>
		</div>

		{#if panel === 'filter'}
			{@const fp = prop(nf.prop)}
			<form
				class="panel"
				onsubmit={(e) => {
					e.preventDefault();
					addFilter();
				}}
			>
				<select
					aria-label="Filter column"
					bind:value={nf.prop}
					onchange={() => {
						nf.op = OPS[prop(nf.prop)?.type ?? 'text'][0] ?? '';
						const t = prop(nf.prop);
						nf.value =
							t?.type === 'select' || t?.type === 'multi_select' ? (t.config.options?.[0]?.id ?? '') : '';
					}}
				>
					<option value="" disabled>Column…</option>
					{#each d.props as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
				{#if fp}
					<select aria-label="Filter rule" bind:value={nf.op}>
						{#each OPS[fp.type] as o (o)}<option value={o}>{OP_LABEL[o]}</option>{/each}
					</select>
					{#if !NO_VALUE_OPS.includes(nf.op)}
						{#if fp.type === 'checkbox'}
							<select aria-label="Filter value" bind:value={nf.value}>
								<option value="yes">checked</option>
								<option value="">unchecked</option>
							</select>
						{:else if fp.type === 'select' || fp.type === 'multi_select'}
							<select aria-label="Filter value" bind:value={nf.value}>
								{#each fp.config.options ?? [] as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
							</select>
						{:else}
							<input
								aria-label="Filter value"
								type={fp.type === 'date' ? 'date' : 'text'}
								inputmode={fp.type === 'number' ? 'decimal' : undefined}
								bind:value={nf.value}
							/>
						{/if}
					{/if}
					<button class="btn sm" type="submit">Add filter</button>
				{/if}
			</form>
		{:else if panel === 'sort'}
			<form
				class="panel"
				onsubmit={(e) => {
					e.preventDefault();
					if (ns.prop) void saveView({ ...cfg, sort: { ...ns } });
					panel = null;
				}}
			>
				<select aria-label="Sort column" bind:value={ns.prop}>
					<option value="" disabled>Column…</option>
					{#each d.props as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<select aria-label="Sort direction" bind:value={ns.dir}>
					<option value="asc">Ascending ↑</option>
					<option value="desc">Descending ↓</option>
				</select>
				<button class="btn sm" type="submit">Sort</button>
			</form>
		{:else if panel === 'cols'}
			<div class="panel col" role="group" aria-label="Columns">
				{#each ordered as p, i (p.id)}
					<div class="colrow">
						<label
							><input
								type="checkbox"
								checked={!(cfg.hidden ?? []).includes(p.id)}
								disabled={p.type === 'title'}
								onchange={() => toggleHidden(p.id)}
							/>
							{p.name}</label
						>
						<button
							type="button"
							class="mini"
							aria-label="Move {p.name} left"
							disabled={i === 0}
							onclick={() => shift(p.id, -1)}>←</button
						>
						<button
							type="button"
							class="mini"
							aria-label="Move {p.name} right"
							disabled={i === ordered.length - 1}
							onclick={() => shift(p.id, 1)}>→</button
						>
					</div>
				{/each}
			</div>
		{:else if panel === 'add'}
			<div class="panel col" role="group" aria-label="Add property">
				<input aria-label="Property name" placeholder="Property name" maxlength="100" bind:value={np} />
				<div class="types">
					{#each PROP_TYPES.filter((t) => t !== 'title') as t (t)}
						<button type="button" onclick={() => addProp(t)}>{TYPE_LABEL[t]}</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if isGallery}
			{#if !(d?.rows ?? []).length}
				<div class="panel bempty" role="group" aria-label="Gallery">
					<p>No records yet.</p>
					<button type="button" class="btn sm primary" onclick={addRecord}>New record</button>
				</div>
			{:else}
				<div class="gal" data-size={cardSize} role="list" aria-label="Cards">
					{#each d?.rows ?? [] as r (r.id)}
						<article class="gcard" role="listitem">
							<button type="button" class="gbody" onclick={() => openRecord(r)}>
								<span class="gcover">
									{#if coverOf(r)}<img src={coverOf(r)} alt="" loading="lazy" />
									{:else if r.icon}<span class="gicon" aria-hidden="true">{r.icon}</span>{/if}
								</span>
								<span class="gmeta">
									<b>{title(r)}</b>
									{#each cardProps as p (p.id)}
										{#if asText(p.type, r.values[p.id] ?? null, p.config)}
											<span class="bchip">{p.name}: {asText(p.type, r.values[p.id] ?? null, p.config)}</span>
										{/if}
									{/each}
								</span>
							</button>
						</article>
					{/each}
				</div>
			{/if}
		{:else if isBoard}
			{#if !selectProps.length}
				<div class="panel bempty" role="group" aria-label="Board">
					<p>Board groups cards by a select property.</p>
					<button type="button" class="btn sm primary" onclick={() => (panel = 'add')}
						>Add a select property</button
					>
				</div>
			{:else}
				<div class="bchips" role="tablist" aria-label="Board columns">
					{#each boardCols as c, i (c.id)}
						<button
							type="button"
							role="tab"
							aria-selected={activeCol === i}
							class:on={activeCol === i}
							onclick={() => chipTap(i)}>{c.label} <span class="cnt">{c.rows.length}</span></button
						>
					{/each}
				</div>
				{#if moving && phoneNow}
					<p class="hint" role="status">Tap a column above to move the card.</p>
				{/if}
				<div
					class="board"
					use:peerSwipe={{
						step: boardStep,
						peek: (n) => boardCols[activeCol + n]?.label ?? '',
					}}
				>
					{#each boardCols as c, i (c.id)}
						<section
							class="bcol"
							class:on={activeCol === i}
							aria-label="{c.label}, {c.rows.length} cards"
							ondragover={(e) => e.preventDefault()}
							ondrop={() => dropAt(c)}
						>
							<header class="bhead">
								{#if c.color}<span class="bdot" style="background: var(--{c.color}-bg)" aria-hidden="true"
									></span>{/if}
								<b>{c.label}</b><span class="cnt">{c.rows.length}</span>
							</header>
							{#each c.rows as r (r.id)}
								<article
									class="bcard"
									data-record={r.id}
									draggable="true"
									ondragstart={(e) => {
										moving = r.id;
										e.dataTransfer?.setData('text/plain', r.id);
									}}
									ondragend={() => (moving = null)}
									onpointerdown={(e) => pickStart(r, e)}
									onpointermove={pickMove}
									onpointerup={pickEnd}
									onpointercancel={pickEnd}
								>
									<div class="bctop">
										<button
											type="button"
											class="bct"
											onclick={() => {
												if (swallowedClick) return void (swallowedClick = false);
												openRecord(r);
											}}>{title(r)}</button
										>
										<button
											type="button"
											class="mini"
											aria-label="Actions for {title(r)}"
											aria-expanded={menuFor === r.id}
											onclick={() => (menuFor = menuFor === r.id ? null : r.id)}>⋯</button
										>
									</div>
									{#if cardProps.length}
										<div class="bprops">
											{#each cardProps as p (p.id)}
												{#if asText(p.type, r.values[p.id] ?? null, p.config)}
													<span class="bchip"
														>{p.name}: {asText(p.type, r.values[p.id] ?? null, p.config)}</span
													>
												{/if}
											{/each}
										</div>
									{/if}
									{#if menuFor === r.id}
										<div
											class="bmenu"
											role="menu"
											aria-label="Actions for {title(r)}"
											use:backCloses={() => (menuFor = null)}
										>
											<button type="button" role="menuitem" onclick={() => openRecord(r)}>Open</button>
											{#each boardCols as g (g.id)}
												{#if (r.values[groupProp?.id ?? ''] ?? '') !== g.id}
													<button type="button" role="menuitem" onclick={() => move(r, g.id)}
														>Move to {g.label}</button
													>
												{/if}
											{/each}
											<button type="button" role="menuitem" class="danger" onclick={() => deleteRecord(r)}
												>Delete</button
											>
										</div>
									{/if}
								</article>
							{/each}
							<button type="button" class="soft bnew" onclick={() => newIn(c)}>+ New</button>
						</section>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="scroll">
				<table>
					<thead>
						<tr>
							{#each cols as p (p.id)}
								<th>
									<button
										type="button"
										class="th"
										aria-expanded={openProp === p.id}
										aria-label="Column {p.name}"
										data-ico={TYPE_LABEL[p.type].split(' ')[0]}
										onclick={() => (openProp = openProp === p.id ? null : p.id)}>{p.name}</button
									>
									{#if openProp === p.id}
										<div class="pmenu" role="group" aria-label="{p.name} column settings">
											<label
												>Name
												<input
													value={p.name}
													maxlength="100"
													onchange={(e) => renameProp(p, e.currentTarget.value)}
												/></label
											>
											{#if p.type !== 'title'}
												<label
													>Type
													<select
														value={p.type}
														onchange={(e) => retype(p, e.currentTarget.value as PropType)}
													>
														{#each PROP_TYPES.filter((t) => t !== 'title') as t (t)}
															<option value={t}>{TYPE_LABEL[t]}</option>
														{/each}
													</select></label
												>
											{/if}
											{#if p.type === 'select' || p.type === 'multi_select'}
												<label
													>Options (comma between)
													<input
														value={(p.config.options ?? []).map((o) => o.label).join(', ')}
														placeholder="Light, Moderate, Heavy"
														onchange={(e) => setOptions(p, e.currentTarget.value)}
													/></label
												>
											{/if}
											<div class="colrow">
												<button type="button" class="btn sm" onclick={() => shift(p.id, -1)}>← Move</button>
												<button type="button" class="btn sm" onclick={() => shift(p.id, 1)}>Move →</button>
											</div>
											{#if p.type !== 'title'}
												<div class="colrow">
													<button
														type="button"
														class="btn sm"
														onclick={() => {
															openProp = null;
															toggleHidden(p.id);
														}}>Hide</button
													>
													<button type="button" class="btn sm danger" onclick={() => deleteProp(p)}
														>Delete…</button
													>
												</div>
											{/if}
										</div>
									{/if}
								</th>
							{/each}
							<th class="act"
								><button
									type="button"
									class="th"
									aria-label="Add property"
									aria-expanded={panel === 'add'}
									onclick={() => toggle('add')}>+</button
								></th
							>
						</tr>
					</thead>
					<tbody>
						{#each d.rows as r (r.id)}
							<tr>
								{#each cols as p (p.id)}
									<td data-label={p.name} class:ttl={p.type === 'title'}>
										<DbCell
											prop={p}
											value={r.values[p.id] ?? null}
											invalid={r.invalid?.includes(p.id)}
											label="{p.name} of {title(r)}"
											onsave={(v) => setValue(r, p, v)}
										/>
									</td>
								{/each}
								<td class="act">
									<button
										type="button"
										class="mini"
										aria-label="Open {title(r)} as page"
										onclick={() => openRecord(r)}>Open</button
									>
									<button
										type="button"
										class="mini"
										aria-label="Delete {title(r)}"
										onclick={() => deleteRecord(r)}>✕</button
									>
								</td>
							</tr>
						{/each}
						<tr class="new"
							><td colspan={cols.length + 1}
								><button type="button" class="soft" onclick={addRecord}>+ New record</button></td
							></tr
						>
					</tbody>
				</table>
			</div>
		{/if}
		<div class="hint foot">
			{d.total} record{d.total === 1 ? '' : 's'}{(cfg.filters ?? []).length ? ' · filtered' : ''}
			{#if d.rows.length < d.total}
				· showing {d.rows.length} <button type="button" class="soft" onclick={more}>Load more</button>
			{/if}
		</div>
	</section>
{/if}

<style>
	.dbv {
		margin: 12px 0;
		font-size: 13.5px;
		white-space: normal;
	}
	.dbtitle {
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
		background: transparent;
		border: 0;
		width: 100%;
		min-height: 28px;
	}
	.tabs,
	.bar,
	.panel,
	.colrow {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.tabs {
		border-bottom: 1.5px solid var(--rule);
		margin-bottom: 10px;
		gap: 2px;
	}
	.tl {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.tabs button {
		font: inherit;
		font-weight: 600;
		color: var(--ink);
		background: transparent;
		border: 0;
		border-bottom: 2.5px solid transparent;
		padding: 6px 10px;
		min-height: 32px;
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		border-bottom-color: var(--ink);
	}
	.tabs .soft,
	.soft {
		font: inherit;
		font-weight: 500;
		color: var(--muted);
		background: transparent;
		border: 0;
		min-height: 28px;
		padding: 0 8px;
		cursor: pointer;
	}
	.grow {
		flex: 1;
	}
	.bar {
		margin-bottom: 10px;
	}
	.pill {
		font: inherit;
		font-size: 12.5px;
		color: var(--ink);
		background: var(--card);
		border: 1.5px dashed var(--muted);
		border-radius: 999px;
		min-height: 28px;
		padding: 0 10px;
		cursor: pointer;
	}
	.pill.on {
		border-style: solid;
		border-color: var(--ink);
		background: var(--pill);
		color: var(--pill-ink);
	}
	.panel {
		border: 1.5px solid var(--ink);
		border-radius: 10px;
		padding: 10px;
		margin-bottom: 10px;
	}
	.panel.col {
		flex-direction: column;
		align-items: stretch;
	}
	.panel input:not([type='checkbox']),
	.panel select,
	.pmenu input,
	.pmenu select {
		font: inherit;
		min-height: 30px;
		padding: 0 8px;
		border: 1.5px solid var(--border);
		border-radius: 8px;
		background: var(--card);
		color: var(--ink);
	}
	.colrow label {
		flex: 1;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.types {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 6px;
	}
	.types button {
		font: inherit;
		text-align: left;
		background: var(--pill);
		color: var(--pill-ink);
		border: 1px solid var(--rule);
		border-radius: 8px;
		min-height: 32px;
		padding: 0 8px;
		cursor: pointer;
	}
	.mini {
		font: inherit;
		font-size: 12px;
		min-width: 24px;
		min-height: 24px;
		color: var(--ink);
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: 6px;
		cursor: pointer;
	}
	.scroll {
		overflow-x: auto;
		scrollbar-width: none;
		border: 1.5px solid var(--ink);
		border-radius: 10px;
		min-height: 120px;
	}
	.scroll::-webkit-scrollbar {
		display: none;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		margin: 0;
	}
	th,
	td {
		border: 0;
		border-bottom: 1px solid var(--rule);
		padding: 4px 8px;
		text-align: left;
		vertical-align: top;
		white-space: nowrap;
		min-width: 90px;
	}
	th {
		position: relative;
		border-bottom: 1.5px solid var(--ink);
	}
	.th::before {
		content: attr(data-ico) ' '; /* icon kept out of the text so "Column X" holds all visible text */
	}
	.th {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
		background: transparent;
		border: 0;
		min-height: 28px;
		min-width: 24px;
		cursor: pointer;
	}
	.act {
		min-width: 0;
		width: 1%;
	}
	.ttl {
		font-weight: 600;
		min-width: 160px;
	}
	.pmenu {
		position: absolute;
		z-index: 7;
		top: 100%;
		left: 0;
		width: 240px;
		background: var(--card);
		border: 1.5px solid var(--ink);
		border-radius: 10px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		white-space: normal;
		font-weight: 400;
	}
	.pmenu label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--muted);
	}
	.foot {
		margin-top: 6px;
	}
	/* phone: 48 dp hit areas (#285) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.dbtitle,
		.tabs button,
		.tabs .soft,
		.soft,
		.pill,
		.types button,
		.th,
		.mini,
		.panel input:not([type='checkbox']),
		.panel select,
		.pmenu input,
		.pmenu select {
			min-height: 48px;
		}
		.mini,
		.th {
			min-width: 48px;
		}
		.bct,
		.bmenu button {
			min-height: 48px;
		}
	}
	@media (max-width: 700px) {
		/* MDb: one card per record */
		thead {
			display: none;
		}
		.scroll {
			border: 0;
		}
		tr {
			display: block;
			border: 1.5px solid var(--ink);
			border-radius: 12px;
			padding: 8px;
			margin-bottom: 8px;
		}
		tr.new {
			border-style: dashed;
		}
		td {
			display: flex;
			gap: 8px;
			align-items: center;
			border: 0;
			white-space: normal;
			width: auto;
		}
		td[data-label]::before {
			content: attr(data-label);
			flex: 0 0 90px;
			font-size: 12px;
			color: var(--muted);
		}
		td.ttl::before {
			display: none;
		}
	}

	/* v4 PR 23: board view (columns 260 px on desktop; phone shows one column + a chips row) */
	.bchip {
		font-size: 11px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--ground);
		color: var(--quiet);
	}
	.bchips {
		display: none;
	}
	.board {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		align-items: flex-start;
		padding: 4px 0;
	}
	.bcol {
		flex: 0 0 260px;
		width: 260px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--ground);
		min-height: 84px;
	}
	.bhead {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 4px;
	}
	.bdot {
		width: 10px;
		height: 10px;
		border-radius: 5px;
	}
	.cnt {
		color: var(--quiet);
		font-size: 12px;
	}
	.bcard {
		position: relative;
		padding: 6px;
		border-radius: 8px;
		border: 1.5px solid var(--card-edge);
		background: var(--card);
		user-select: none; /* long press lifts the card, it must not start text selection in the editor */
		touch-action: manipulation;
	}
	.bctop {
		display: flex;
		gap: 4px;
		align-items: flex-start;
	}
	.bct {
		flex: 1;
		min-width: 0;
		padding: 2px;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.bprops {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 0 2px 2px;
	}
	.bmenu {
		position: absolute;
		right: 4px;
		top: 28px;
		z-index: 5;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		padding: 4px;
		border-radius: 8px;
		border: 1.5px solid var(--card-edge);
		background: var(--card);
		box-shadow: -4px 4px 0 var(--accent);
	}
	.bmenu button {
		padding: 6px 8px;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.bmenu button:hover {
		background: var(--hover, rgb(0 0 0 / 0.06));
	}
	.bmenu .danger {
		color: var(--danger);
	}
	.bempty {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
	}
	.bempty p {
		margin: 0;
	}
	/* v4 PR 25: gallery view (card width 180/240/320 px, 16:9 cover, title + 2 chips) */
	.gal {
		display: grid;
		grid-template-columns: repeat(auto-fill, 180px);
		gap: 12px;
		padding: 4px 0;
		justify-content: start;
	}
	.gal[data-size='M'] {
		grid-template-columns: repeat(auto-fill, 240px);
	}
	.gal[data-size='L'] {
		grid-template-columns: repeat(auto-fill, 320px);
	}
	.gcard {
		display: flex;
		border: 1.5px solid var(--card-edge);
		border-radius: 10px;
		background: var(--card);
		overflow: hidden;
	}
	.gbody {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.gcover {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 16 / 9;
		background: var(--ground);
	}
	.gicon {
		font-size: 30px;
		line-height: 1;
	}
	.gcover img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.gmeta {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.gal,
		.gal[data-size='S'],
		.gal[data-size='M'] {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.gal[data-size='L'] {
			grid-template-columns: 1fr;
		}
		.gbody {
			min-height: 48px;
		}
		.bchips {
			display: flex;
			gap: 6px;
			overflow-x: auto;
			padding-bottom: 4px;
		}
		.bchips button {
			min-height: 48px;
			padding: 0 12px;
			border-radius: 999px;
			border: 1.5px solid var(--border);
			background: transparent;
			color: var(--ink);
			font: inherit;
			white-space: nowrap;
		}
		.bchips button.on {
			background: var(--pill);
			color: var(--pill-ink);
		}
		.board {
			display: block;
			overflow: visible;
		}
		.bcol {
			display: none;
			width: auto;
		}
		.bcol.on {
			display: flex;
		}
	}
</style>
