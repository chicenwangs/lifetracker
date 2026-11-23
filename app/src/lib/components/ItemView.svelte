<!-- Item = one big markdown page (FR-I1..I5). Used as the centre peek and as the /item/[id] page.
     Title edits in place. Properties edit inline. Right column: Delete · History · Time blocks
     (the real day timeline: this item's blocks in its colour, others muted; drag empty time = linked block). -->
<script lang="ts">
	import Reminders from './Reminders.svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import StatusSquare from './StatusSquare.svelte';
	import Markdown from './Markdown.svelte';
	import DayPlanner from './DayPlanner.svelte';
	import { typeOf, typesState } from '$lib/client/itemtypes.svelte';
	import { askScope, type RepeatScope } from '$lib/client/dialog.svelte';
	import { colorsFor } from '$lib/colors';
	import {
		baseItemId,
		describeRRule,
		formatRRule,
		nthWeekdayOfDate,
		parseRRule,
		presetsForDate,
		WD_CODES,
		WD_SHORT,
		type Freq,
		type WdCode,
	} from '$lib/rrule';
	import { addDays, examCountdown, prettyDate, todayLocal, utcToLocal, weekdayOf } from '$lib/time';
	import {
		nextStatus,
		type BlockDTO,
		type ItemDTO,
		type ItemType,
		type Status,
		type UndoRef,
	} from '$lib/types';
	import { cycleRow } from '$lib/client/rowOps';
	import { undoLast } from '$lib/client/undo.svelte';
	import { get, patch, post } from '$lib/client/api';
	import { enqueueAction, isOffline } from '$lib/client/offline';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { removeItem } from '$lib/client/remove';
	import { duplicate } from '$lib/client/altdrag';
	import { isPhone } from '$lib/client/phone';

	interface View {
		item: ItemDTO & { notes: string | null };
		parent: { id: string; title: string } | null;
		steps: ItemDTO[];
		blocks: BlockDTO[];
		history: {
			createdAt: string | null;
			startedAt: string | null;
			completedAt: string | null;
			updatedAt: string | null;
			updatedBy: string | null;
			source: string | null;
		};
		today: string;
		tz: string;
	}

	let {
		id,
		initial = null,
		peek = false,
		onclose,
		onchanged,
		ondeleted,
	}: {
		id: string;
		initial?: View | null;
		peek?: boolean;
		onclose?: () => void;
		/** any write: host refreshes its calendar */
		onchanged?: () => void;
		ondeleted?: (parentId: string | null) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let v = $state<View | null>(initial);
	let failed = $state(false);
	let planDate = $state('');
	let dayBlocks = $state<BlockDTO[]>([]);
	// #158: editing one date of a repeating item detaches it into its own row; keep showing that row
	let detached = $state<string | null>(null);
	const viewId = $derived(detached ?? id);
	function follow(sent: string, got: { item?: { id: string } } | undefined) {
		if (got?.item && sent === it?.id && got.item.id !== sent) detached = got.item.id;
	}

	const it = $derived(v?.item);
	const c = $derived(colorsFor(it?.type ?? null));
	const cd = $derived(it && v ? examCountdown(it, v.today, !!typeOf(it.type)?.countsDown) : null);
	const STATUS_WORD = { todo: 'Not started', doing: 'In progress', done: 'Done' } as const;

	// sequence numbers: a slow older response never overwrites a newer one
	let loadSeq = 0;
	let daySeq = 0;
	async function load() {
		const n = ++loadSeq;
		try {
			const r = await get<View>(`/api/items/${encodeURIComponent(viewId)}/view`);
			if (n !== loadSeq) return;
			v = r;
			failed = false;
		} catch (e) {
			if (n !== loadSeq) return;
			failed = true;
			showError(e);
		}
	}
	async function loadDay() {
		if (!planDate) return;
		const n = ++daySeq;
		try {
			const r = await get<{ blocks: BlockDTO[] }>(
				`/api/calendar?from=${planDate}&to=${addDays(planDate, 1)}`,
			);
			if (n === daySeq) dayBlocks = r.blocks;
		} catch (e) {
			if (n === daySeq) showError(e);
		}
	}
	async function changed() {
		await Promise.all([load(), loadDay()]);
		onchanged?.();
	}

	let phone = $state(false); // phone wording (#108); set after mount so SSR and hydration agree
	onMount(async () => {
		phone = isPhone();
		if (!v) await load();
		planDate = v ? startDay(v) : '';
		await loadDay();
	});

	/** planner opens on: next upcoming block of this item, else today (block time before it's due), else its date */
	function startDay(view: View): string {
		const up = view.blocks
			.map((b) => utcToLocal(b.startAt, view.tz).date)
			.filter((d) => d >= view.today)
			.sort()[0];
		if (up) return up;
		const d = view.item.date;
		return d && d < view.today ? d : view.today;
	}

	async function save(p: Record<string, unknown>) {
		if (!it) return;
		let body = p;
		if (it.rrule && !('rrule' in p) && !('scope' in p)) {
			const scope = await askScope(`Edit repeating item "${it.title}"?`, { ok: 'Save' });
			if (!scope) {
				await load();
				return;
			}
			body = { ...p, scope };
		}
		try {
			const r = await patch<{ item: { id: string }; undo?: UndoRef }>(`/api/items/${encodeURIComponent(it.id)}`, body); // prettier-ignore
			follow(it.id, r);
			await changed();
			const u = r.undo; // #293: touch has no Ctrl+Z
			showToast('Saved', {
				undo: u ? async () => void ((await undoLast(u.id)) && (await changed())) : undefined,
			});
		} catch (e) {
			if (isOffline(e)) {
				Object.assign(it, p);
				enqueueAction({
					key: `/api/items/${it.id}`,
					method: 'PATCH',
					path: `/api/items/${it.id}`,
					payload: { ...body }, // #208: with the repeat scope the user picked
				});
				showToast('Saved · Waiting to sync');
				return;
			}
			showError(e);
			await load();
		}
	}
	async function cycle(itemId: string, cur: Status, name: string) {
		const r = await cycleRow('items', itemId, cur, name, changed, (got) => follow(itemId, got));
		if (r === 'queued' && it && it.id === itemId) it.status = nextStatus(cur); // shown now, sent on reconnect
	}
	async function cycleBlock(blockId: string) {
		try {
			await post(`/api/blocks/${blockId}/cycle`);
			await changed();
		} catch (e) {
			showError(e);
		}
	}

	// ---------- repeat (#72) ----------
	let customRepeat = $state(false);
	let cFreq = $state<Freq>('WEEKLY');
	let cInterval = $state(1);
	let cDays = $state<WdCode[]>(['MO']);
	let cMonthKind = $state<'day' | 'nth'>('day');
	let cEndKind = $state<'never' | 'until' | 'count'>('never');
	let cUntil = $state('');
	let cCount = $state(5);

	function openCustomRepeat() {
		if (!it?.date) return;
		const p = parseRRule(it.rrule);
		cFreq = p?.freq ?? 'WEEKLY';
		cInterval = p?.interval ?? 1;
		const defWd = WD_CODES[weekdayOf(it.date) - 1] as WdCode;
		cDays = p?.freq === 'WEEKLY' && p.byday?.length ? (p.byday as WdCode[]) : [defWd];
		cMonthKind = p?.freq === 'MONTHLY' && p.byday?.length ? 'nth' : 'day';
		cEndKind = p?.until ? 'until' : p?.count ? 'count' : 'never';
		cUntil = p?.until ?? addDays(it.date, 30);
		cCount = p?.count ?? 5;
		customRepeat = true;
	}
	function toggleWd(w: WdCode) {
		if (cDays.includes(w)) {
			if (cDays.length > 1) cDays = cDays.filter((x) => x !== w);
		} else {
			cDays = [...cDays, w].sort((a, b) => WD_CODES.indexOf(a) - WD_CODES.indexOf(b));
		}
	}
	async function applyCustomRepeat() {
		if (!it?.date) return;
		const dNum = Number(it.date.slice(8, 10));
		const nth = nthWeekdayOfDate(it.date);
		const rule = formatRRule({
			freq: cFreq,
			interval: Math.max(1, Math.min(99, Number(cInterval) || 1)),
			byday:
				cFreq === 'WEEKLY' ? cDays : cFreq === 'MONTHLY' && cMonthKind === 'nth' ? [nth.token] : undefined,
			bymonthday: cFreq === 'MONTHLY' && cMonthKind === 'day' ? dNum : undefined,
			until: cEndKind === 'until' && cUntil ? cUntil : undefined,
			count: cEndKind === 'count' ? Math.max(1, Math.min(999, Number(cCount) || 5)) : undefined,
		});
		customRepeat = false;
		await save({ rrule: rule });
	}
	/** #263: a repeat end is visible on the normal row, not only inside Custom… */
	async function setRepeatEndKind(kind: 'never' | 'until' | 'count') {
		const p = parseRRule(it?.rrule ?? '');
		if (!p) return;
		await save({
			rrule: formatRRule({
				...p,
				until: kind === 'until' ? it?.date || undefined : undefined,
				count: kind === 'count' ? p.count || 5 : undefined,
			}),
		});
	}
	async function setRepeatEnd(date: string | null) {
		const p = parseRRule(it?.rrule ?? '');
		if (!p) return;
		await save({ rrule: formatRRule({ ...p, until: date ?? undefined, count: undefined }) });
	}
	async function setRepeatCount(n: number) {
		const p = parseRRule(it?.rrule ?? '');
		if (!p) return;
		await save({ rrule: formatRRule({ ...p, count: Math.max(1, Math.min(999, n || 5)), until: undefined }) });
	}

	// ---------- title: edit in place ----------
	let editingTitle = $state(false);
	let titleDraft = $state('');
	let titleEl: HTMLTextAreaElement | undefined = $state();
	async function startTitle() {
		if (!it) return;
		titleDraft = it.title;
		editingTitle = true;
		await tick();
		titleEl?.focus();
		titleEl?.select();
		grow(titleEl);
	}
	async function endTitle(commit: boolean) {
		if (!editingTitle || !it) return;
		editingTitle = false;
		const t = titleDraft.replace(/\s+/g, ' ').trim();
		if (commit && t && t !== it.title) {
			v = v && { ...v, item: { ...v.item, title: t } }; // optimistic
			await save({ title: t });
		}
	}

	// ---------- notes: the page body ----------
	let editingNotes = $state(false);
	let notesDraft = $state('');
	let notesEl: HTMLTextAreaElement | undefined = $state();
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	// #243: notes on a repeating item ask the same scope as every other field, once per edit
	let notesScope: RepeatScope | null = null;
	const notes = $derived(it?.notes ?? '');

	async function startNotes(e?: MouseEvent) {
		if ((e?.target as HTMLElement | undefined)?.closest('a')) return; // let links work
		if (it?.rrule) {
			const scope = await askScope(`Edit notes on repeating item "${it.title}"?`, { ok: 'Edit' });
			if (!scope) return;
			notesScope = scope;
		}
		notesDraft = notes;
		editingNotes = true;
		await tick();
		notesEl?.focus();
		grow(notesEl);
	}
	function onNotesInput() {
		grow(notesEl);
		saveState = 'saving';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(flushNotes, 700);
	}
	async function flushNotes(): Promise<boolean> {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;
		if (!it || notesDraft === (it.notes ?? '')) {
			saveState = saveState === 'saving' ? 'saved' : saveState;
			return true;
		}
		const val = notesDraft.trim() === '' ? null : notesDraft;
		const body = notesScope ? { notes: val, scope: notesScope } : { notes: val };
		try {
			const sent = it.id;
			follow(sent, await patch<{ item: { id: string } }>(`/api/items/${encodeURIComponent(sent)}`, body));
			if (detached) await load();
			if (v) v = { ...v, item: { ...v.item, notes: val } };
			saveState = 'saved';
			onchanged?.();
			return true;
		} catch (e) {
			if (isOffline(e)) {
				// #209: offline notes wait on this device like every other edit
				const path = `/api/items/${it.id}`;
				enqueueAction({ key: path, method: 'PATCH', path, payload: body });
				if (v) v = { ...v, item: { ...v.item, notes: val } };
				saveState = 'saved';
				showToast('Saved · Waiting to sync');
				return true;
			}
			saveState = 'idle';
			showError(e);
			return false;
		}
	}
	// a save still waiting on its 700 ms timer must not be dropped when the view closes or the page unloads
	onDestroy(() => {
		if (saveTimer) void flushNotes();
	});
	function onUnload() {
		if (!saveTimer || !it) return;
		// keepalive: the request outlives the page
		void fetch(`/api/items/${it.id}`, {
			method: 'PATCH',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				notes: notesDraft.trim() === '' ? null : notesDraft,
				...(notesScope ? { scope: notesScope } : {}),
			}),
		});
	}
	async function endNotes() {
		// failed save: stay in the editor so the draft isn't lost
		if (await flushNotes()) {
			editingNotes = false;
			notesScope = null;
		}
	}
	function grow(el: HTMLTextAreaElement | undefined) {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}

	async function del() {
		if (!it) return;
		const parent = it.parentId;
		const ok = await removeItem(it.id, it.title, () => onchanged?.(), !!it.rrule);
		if (ok) ondeleted?.(parent);
	}

	/** #251: the item equivalent of Alt-drag copy, reachable by click or keyboard. */
	function duplicateItem() {
		if (!it) return;
		void duplicate('item', baseItemId(it.id), { date: it.date ?? todayLocal(v?.tz ?? 'Asia/Kuala_Lumpur') });
	}

	const fmtZ = (z: string | null) => (z ? prettyDate(z.slice(0, 10)) : '—');
	const fmtBlock = (b: BlockDTO) => {
		if (!v) return { date: '', text: '' };
		const s = utcToLocal(b.startAt, v.tz);
		const e = utcToLocal(b.endAt, v.tz);
		return { date: s.date, text: `${prettyDate(s.date)} · ${s.time}–${e.time}` };
	};
	const stepsDone = $derived(v ? v.steps.filter((s) => s.status === 'done').length : 0);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && peek && !editingTitle && !editingNotes) onclose?.();
	}
	function dragItem(e: DragEvent) {
		if (!it || !e.dataTransfer) return;
		e.dataTransfer.setData('application/x-lt-item', it.id);
		e.dataTransfer.effectAllowed = 'copy';
	}
</script>

<svelte:window onkeydown={onKey} onbeforeunload={onUnload} />

<div class="iv" class:peek>
	<header class="top">
		<nav aria-label="Breadcrumb" class="crumb">
			{#if peek}<span>Calendar</span>{:else}<a href="/?d={it?.date ?? ''}">Home</a>{/if}
			{#if v?.parent}<span>/</span><a href="/item/{v.parent.id}">{v.parent.title}</a>{/if}
			{#if it}<span>/</span><span class="cur">{it.title}</span>{/if}
		</nav>
		<div class="acts">
			{#if peek && it}<a class="btn sm ghost" href="/item/{it.id}" data-sveltekit-reload
					>{phone ? 'Open full' : 'Open as page'}</a
				>{/if}
			{#if peek}
				<button
					class="close"
					type="button"
					aria-label="Close"
					title="Close (Esc)"
					onclick={() => onclose?.()}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg
					>
				</button>
			{/if}
		</div>
	</header>

	{#if !v || !it}
		<div class="loading">{failed ? 'Could not load this item.' : 'Loading…'}</div>
	{:else}
		<div class="cols">
			<section class="main" aria-label="Item">
				<div class="kick" style:color={c.edge}>
					<StatusSquare
						status={it.status}
						size={22}
						ink={c.edge}
						oncycle={() => cycle(it.id, it.status, it.title)}
					/>
					<span>{(it.type ?? 'None').toUpperCase()} · {STATUS_WORD[it.status].toUpperCase()}</span>
					{#if cd}
						<span class="count" class:soon={cd.days <= 3}>{cd.long}</span>
					{/if}
				</div>

				<h1 class="title" class:done={it.status === 'done'}>
					{#if editingTitle}
						<label class="sr-only" for="iv-title">Title</label>
						<textarea
							id="iv-title"
							class="title-in"
							rows="1"
							maxlength="300"
							bind:this={titleEl}
							bind:value={titleDraft}
							oninput={() => grow(titleEl)}
							onblur={() => endTitle(true)}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									endTitle(true);
								}
								if (e.key === 'Escape') {
									e.stopPropagation();
									endTitle(false);
								}
							}}></textarea>
					{:else}
						<button class="title-btn" type="button" title="Rename" onclick={startTitle}>
							<span class="tt">{it.title}</span>
							<svg
								class="pen"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg
							>
						</button>
					{/if}
				</h1>

				<div class="props">
					<label class="prop">
						<span>Type</span>
						<select
							value={it.type ?? ''}
							onchange={(e) => save({ type: (e.currentTarget.value || null) as ItemType | null })}
						>
							<option value="">None</option>
							{#each typesState.list as t (t.key)}<option value={t.key}>{t.name}</option>{/each}
						</select>
					</label>
					<label class="prop">
						<span>Date</span>
						<input
							type="date"
							value={it.date ?? ''}
							onchange={(e) => save({ date: e.currentTarget.value || null })}
						/>
					</label>
					<label class="prop">
						<span>Time</span>
						<input
							type="time"
							step="900"
							value={it.time ?? ''}
							disabled={!it.date}
							onchange={(e) => save({ time: e.currentTarget.value || null })}
						/>
					</label>
					<label class="prop">
						<span>Until</span>
						<input
							type="date"
							value={it.endDate ?? ''}
							min={it.date ?? undefined}
							disabled={!it.date}
							onchange={(e) => save({ endDate: e.currentTarget.value || null })}
						/>
					</label>
					{#if !it.parentId}
						{@const presets = it.date ? presetsForDate(it.date) : [{ value: '', label: 'Does not repeat' }]}
						{@const curRRule = it.rrule ?? ''}
						{@const isCustom = !!curRRule && !presets.some((p) => p.value === curRRule)}
						{@const curRule = parseRRule(curRRule)}
						<label class="prop">
							<span>Repeat</span>
							<select
								aria-label="Repeat"
								value={curRRule}
								disabled={!it.date}
								onchange={(e) => {
									const val = e.currentTarget.value;
									if (val === '__custom__') openCustomRepeat();
									else {
										customRepeat = false;
										void save({ rrule: val || null });
									}
								}}
							>
								{#each presets as p (p.value)}
									<option value={p.value}>{p.label}</option>
								{/each}
								{#if isCustom}
									<option value={curRRule}>{describeRRule(curRRule)}</option>
								{/if}
								<option value="__custom__">Custom…</option>
							</select>
						</label>
						{#if curRule}
							{@const endKind = curRule.count ? 'count' : curRule.until ? 'until' : 'never'}
							<label class="prop">
								<span>Repeat ends</span>
								<select
									aria-label="Repeat ends"
									value={endKind}
									onchange={(e) => setRepeatEndKind(e.currentTarget.value as 'never' | 'until' | 'count')}
								>
									<option value="never">Never</option>
									<option value="until">On date</option>
									<option value="count">After N times</option>
								</select>
							</label>
							{#if endKind === 'until'}
								<label class="prop">
									<span>End date</span>
									<input
										type="date"
										value={curRule.until ?? ''}
										min={it.date ?? undefined}
										onchange={(e) => setRepeatEnd(e.currentTarget.value || null)}
									/>
								</label>
							{:else if endKind === 'count'}
								<label class="prop">
									<span>Occurrences</span>
									<input
										type="number"
										min="1"
										max="999"
										value={curRule.count ?? 5}
										onchange={(e) => setRepeatCount(Number(e.currentTarget.value))}
									/>
								</label>
							{/if}
						{/if}
					{/if}
					<label class="prop check" title="Shows as Busy to anyone you share with">
						<input
							type="checkbox"
							checked={it.private}
							onchange={(e) => save({ private: e.currentTarget.checked })}
						/>
						<span>Keep secret</span>
					</label>
				</div>
				{#if customRepeat && it.date}
					{@const nth = nthWeekdayOfDate(it.date)}
					<div class="card box cust-rep" role="region" aria-label="Custom repeat">
						<div class="crow">
							<span>Repeat every</span>
							<input type="number" min="1" max="99" aria-label="Repeat interval" bind:value={cInterval} />
							<select aria-label="Repeat frequency" bind:value={cFreq}>
								<option value="DAILY">{cInterval === 1 ? 'day' : 'days'}</option>
								<option value="WEEKLY">{cInterval === 1 ? 'week' : 'weeks'}</option>
								<option value="MONTHLY">{cInterval === 1 ? 'month' : 'months'}</option>
								<option value="YEARLY">{cInterval === 1 ? 'year' : 'years'}</option>
							</select>
						</div>
						{#if cFreq === 'WEEKLY'}
							<div class="crow wds" role="group" aria-label="Repeat on weekdays">
								{#each WD_CODES as w (w)}
									<button
										type="button"
										class="bchip"
										class:on={cDays.includes(w)}
										aria-pressed={cDays.includes(w)}
										onclick={() => toggleWd(w)}>{WD_SHORT[w]}</button
									>
								{/each}
							</div>
						{:else if cFreq === 'MONTHLY'}
							<div class="crow">
								<select aria-label="Monthly repeat mode" bind:value={cMonthKind}>
									<option value="day">Monthly on day {Number(it.date.slice(8, 10))}</option>
									<option value="nth">Monthly on the {nth.label}</option>
								</select>
							</div>
						{/if}
						<div class="crow">
							<span>Ends</span>
							<select aria-label="Repeat ends" bind:value={cEndKind}>
								<option value="never">Never</option>
								<option value="until">On date</option>
								<option value="count">After occurrences</option>
							</select>
							{#if cEndKind === 'until'}
								<input type="date" aria-label="Repeat end date" min={it.date} bind:value={cUntil} />
							{:else if cEndKind === 'count'}
								<input type="number" min="1" max="999" aria-label="Occurrence count" bind:value={cCount} />
								<span>times</span>
							{/if}
						</div>
						<div class="crow">
							<button class="btn sm primary" type="button" onclick={applyCustomRepeat}>Apply repeat</button>
							<button class="btn sm" type="button" onclick={() => (customRepeat = false)}>Cancel</button>
						</div>
					</div>
				{/if}

				<div class="doc">
					{#if editingNotes}
						<label class="sr-only" for="iv-notes">Notes (Markdown)</label>
						<textarea
							id="iv-notes"
							class="notes-in"
							bind:this={notesEl}
							bind:value={notesDraft}
							oninput={onNotesInput}
							onblur={endNotes}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									e.stopPropagation();
									endNotes();
								}
							}}
							placeholder="Write anything. Markdown works: # heading, - list, **bold**, [link](https://…)"
						></textarea>
						<div class="savestate" aria-live="polite">
							{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''} · {phone
								? 'Tap outside to finish'
								: 'Esc or click away to finish'}
						</div>
					{:else if notes}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div class="rendered" onclick={startNotes}>
							<Markdown source={notes} />
						</div>
						<button class="btn sm ghost editbtn" type="button" onclick={() => startNotes()}>Edit</button>
					{:else}
						<button class="empty" type="button" onclick={() => startNotes()}>
							{phone ? 'Tap to write notes' : 'Click to write. Markdown works.'}
						</button>
					{/if}
				</div>

				{#if v.steps.length}
					<div class="steps">
						<h2>Steps <span class="muted">{stepsDone}/{v.steps.length}</span></h2>
						{#each v.steps as s (s.id)}
							{@const sc = colorsFor(s.type)}
							<div class="step">
								<StatusSquare
									status={s.status}
									ink={sc.edge}
									oncycle={() => cycle(s.id, s.status, s.title)}
								/>
								<a href="/item/{s.id}" class:done={s.status === 'done'}>{s.title}</a>
								<span class="muted">{s.date ? prettyDate(s.date) : ''}</span>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<aside class="side" aria-label="Item details">
				<div class="card box delbox">
					<button class="btn sm" type="button" onclick={duplicateItem}>Duplicate</button>
					<button class="btn danger sm" type="button" onclick={del}>Delete item</button>
					<a href="/trash" class="hint">Trash</a>
				</div>

				<div class="card box">
					<Reminders source="planner_item" sourceId={baseItemId(it.id)} tz={v.tz} repeating={!!it.rrule} />
				</div>

				<div class="card box hist">
					<h2>History</h2>
					<dl>
						<dt>Created</dt>
						<dd>{fmtZ(v.history.createdAt)}{v.history.source === 'notion' ? ' (Notion)' : ''}</dd>
						<dt>Started</dt>
						<dd>{fmtZ(v.history.startedAt)}</dd>
						<dt>Completed</dt>
						<dd>{fmtZ(v.history.completedAt)}</dd>
						<dt>Edited</dt>
						<dd>{fmtZ(v.history.updatedAt)}{v.history.updatedBy ? ` by ${v.history.updatedBy}` : ''}</dd>
					</dl>
				</div>

				<div class="card box tb">
					<div class="tbh">
						<h2>Time blocks</h2>
						<span
							class="dragme"
							draggable="true"
							ondragstart={dragItem}
							role="button"
							tabindex="-1"
							style:background={c.bg}
							style:color={c.ink}
							title="Drag onto the timeline for a 60-min block">⠿ Drag me</span
						>
					</div>
					{#if v.blocks.length}
						<div class="blist">
							{#each v.blocks as b (b.id)}
								{@const f = fmtBlock(b)}
								<button
									type="button"
									class="bchip"
									class:on={f.date === planDate}
									style:background={c.bg}
									style:color={c.ink}
									onclick={async () => {
										planDate = f.date;
										await loadDay();
									}}>{f.text}</button
								>
							{/each}
						</div>
					{:else}
						<span class="hint">Drag on empty time below to block time for this. Same timeline as Home.</span>
					{/if}
					{#if planDate}
						{#key planDate}
							<DayPlanner
								date={planDate}
								tz={v.tz}
								blocks={dayBlocks}
								linkItemId={it.id}
								focusItemId={it.id}
								tip={false}
								height={460}
								onnav={async (d) => {
									planDate = d;
									await loadDay();
								}}
								onchanged={changed}
								oncycle={cycleBlock}
								onopenitem={() => {}}
							/>
						{/key}
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</div>

<style>
	.iv {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 36px;
	}
	.crumb {
		display: flex;
		gap: 8px;
		font-size: 13px;
		color: var(--quiet);
		flex-wrap: wrap;
		min-width: 0;
	}
	.crumb .cur {
		max-width: 40ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.acts {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.close {
		width: 34px;
		height: 34px;
		border-radius: 17px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--ink);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}
	.close:hover {
		background: var(--hover);
	}
	.loading {
		padding: 60px 0;
		text-align: center;
		color: var(--quiet);
	}
	/* both columns start on the same line (fixes the uneven right side) */
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 24px;
		align-items: start;
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.kick {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: max(var(--fs-min), 11px);
		font-weight: 700;
		letter-spacing: 0.06em;
		min-height: 22px;
	}
	.count {
		letter-spacing: 0;
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid currentColor;
	}
	.count.soon {
		background: var(--exam-bg);
		color: var(--exam-ink);
		border-color: var(--exam-bg);
	}

	/* ---- title: hover = dotted underline + pencil ---- */
	.title {
		font-size: 30px;
		font-weight: 700;
		line-height: 1.2;
	}
	.title-btn {
		all: unset;
		cursor: text;
		display: inline;
		border-radius: 6px;
	}
	.title-btn:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 4px;
	}
	.title-btn .tt {
		text-decoration-line: none;
		text-underline-offset: 6px;
		text-decoration-thickness: 2px;
	}
	.title.done .tt {
		text-decoration-line: line-through;
	}
	.title-btn:hover .tt,
	.title-btn:focus-visible .tt {
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-decoration-color: var(--quiet);
	}
	.pen {
		display: inline-block;
		vertical-align: middle;
		margin-left: 8px;
		color: var(--quiet);
		opacity: 0;
		transition: opacity 0.12s;
	}
	.title-btn:hover .pen,
	.title-btn:focus-visible .pen {
		opacity: 1;
	}
	.title-in {
		font: inherit;
		color: inherit;
		width: 100%;
		border: 0;
		border-bottom: 2px dotted var(--quiet);
		background: transparent;
		padding: 0;
		resize: none;
		overflow: hidden;
		outline: none;
		display: block;
	}

	/* ---- properties ---- */
	.props {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--rule);
	}
	.prop {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 4px 0 10px;
		border: 1px solid var(--rule);
		border-radius: 8px;
		font-size: 13px;
		background: var(--card);
	}
	.prop:hover {
		border-color: var(--border);
	}
	.prop > span {
		color: var(--quiet);
		font-size: 12px;
	}
	.prop select,
	.prop input:not([type='checkbox']) {
		border: 0;
		background: transparent;
		color: var(--ink);
		height: 28px;
		font-size: 13px;
		font-weight: 600;
		padding: 0 4px;
		cursor: pointer;
	}
	.prop select option {
		background: var(--card);
	}
	.prop input:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.prop.check {
		padding-right: 10px;
		cursor: pointer;
	}
	.prop.check input {
		width: 15px;
		height: 15px;
		accent-color: var(--ink);
	}
	.prop.check span {
		color: var(--ink);
		font-weight: 600;
	}

	/* ---- the page body ---- */
	.doc {
		position: relative;
		min-height: 52vh;
		font-size: 15px;
		line-height: 1.6;
	}
	.rendered {
		cursor: text;
		min-height: 52vh;
		padding: 4px 0 40px;
	}
	.editbtn {
		position: absolute;
		top: -4px;
		right: 0;
		opacity: 0;
	}
	.doc:hover .editbtn,
	.editbtn:focus-visible {
		opacity: 1;
	}
	.notes-in {
		width: 100%;
		min-height: 52vh;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 14px;
		line-height: 1.6;
		padding: 4px 0;
		overflow: hidden;
	}
	.savestate {
		font-size: 12px;
		color: var(--quiet);
		position: sticky;
		bottom: 0;
		padding: 6px 0;
		background: linear-gradient(transparent, var(--card) 40%);
	}
	.empty {
		all: unset;
		display: flex;
		align-items: flex-start;
		width: 100%;
		min-height: 52vh;
		color: var(--quiet);
		cursor: text;
		padding: 4px 0;
	}
	.empty:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid var(--rule);
		padding-top: 12px;
	}
	h2 {
		font-size: 14px;
		font-weight: 700;
	}
	.step {
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 14px;
	}
	.step a {
		flex: 1;
		min-width: 0;
		color: var(--ink);
	}
	.done {
		text-decoration: line-through;
	}

	/* ---- right column ---- */
	.box {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.delbox {
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		flex-wrap: wrap;
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		font-size: 13px;
	}
	dt {
		color: var(--quiet);
	}
	dd {
		margin: 0;
	}
	.tb {
		padding-bottom: 0;
		gap: 10px;
	}
	.tb :global(.planner) {
		border: 0;
		border-top: 1px solid var(--rule);
		border-radius: 0;
		margin: 0 -14px;
	}
	.tbh {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.dragme {
		font-size: 12px;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 6px;
		cursor: grab;
		user-select: none;
	}
	.blist {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.bchip {
		border: 0;
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.bchip.on {
		box-shadow: inset 0 0 0 1.5px currentColor;
	}
	.cust-rep {
		gap: 8px;
	}
	.crow {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 13px;
	}
	.crow input[type='number'] {
		width: 64px;
	}
	.wds .bchip {
		min-width: 36px;
		min-height: 32px;
	}
	/* phone peek: the shared bottom sheet owns the visible Close (#92); desktop keeps this one */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.top .close {
			display: none;
		}
		/* #108: no desktop breadcrumb (the top bar / sheet says where you are); fields = one 48 dp row each */
		.crumb {
			visibility: hidden;
		}
		/* the day timeline + drag chip are desktop mouse tools; phone plans blocks in Today. Trash: account sheet */
		.tb,
		.delbox .hint {
			display: none;
		}
		.title-btn {
			min-height: 48px;
		}
		.props {
			flex-direction: column;
			gap: 0;
		}
		.prop {
			height: auto;
			min-height: 48px;
			justify-content: space-between;
			border: 0;
			border-bottom: 1px solid var(--rule);
			border-radius: 0;
			padding: 0 4px;
			background: none;
		}
		.prop > span {
			font-size: 14px;
		}
		.prop select,
		.prop input:not([type='checkbox']) {
			height: 44px;
			font-size: 15px;
			text-align: right;
		}
		.prop.check {
			justify-content: flex-start;
			gap: 12px;
		}
		.prop.check input {
			width: 22px;
			height: 22px;
		}
	}
</style>
