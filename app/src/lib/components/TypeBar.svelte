<!-- Type bar (FEATURES §3b): one chip per type, click = show/hide (saved per user), "+" = new type, n / 10. -->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { patch, post } from '$lib/client/api';
	import { typesState } from '$lib/client/itemtypes.svelte';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { colorsFor, typeClass } from '$lib/colors';
	import { contrast, inkFor, MAX_TYPES, RESERVED_SLUGS, slugify, TYPE_SWATCHES } from '$lib/itemtypes';

	const full = $derived(typesState.list.length >= MAX_TYPES);
	const shared = $derived((page.data.shared ?? []) as { id: string; name: string; color: string }[]);

	async function toggle(key: string) {
		const prev = typesState.hidden;
		const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
		typesState.hidden = next;
		try {
			await patch('/api/me/prefs', { hiddenTypes: next });
		} catch (e) {
			typesState.hidden = prev;
			showError(e);
		}
	}

	// ---------- new type popover ----------
	let open = $state(false);
	let name = $state('');
	let bg = $state(TYPE_SWATCHES[6] ?? '#E5D4F5');
	let slug = $state('');
	let slugTouched = $state(false);
	let countsDown = $state(false);
	let busy = $state(false);
	let err = $state('');
	const autoSlug = $derived(slugTouched ? slug : slugify(name));
	const ink = $derived(inkFor(bg));
	const ratio = $derived(contrast(bg, ink));
	const slugProblem = $derived(
		!autoSlug
			? ''
			: RESERVED_SLUGS.includes(autoSlug)
				? `/${autoSlug} is a quick-add option`
				: typesState.list.some((t) => t.slug === autoSlug)
					? `/${autoSlug} is taken`
					: '',
	);

	function reset() {
		name = '';
		slug = '';
		slugTouched = false;
		countsDown = false;
		err = '';
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		err = '';
		try {
			await post('/api/item-types', { name, bg, slug: autoSlug || undefined, countsDown });
			await invalidateAll();
			showToast(`Added type "${name.trim()}"`);
			open = false;
			reset();
		} catch (x) {
			err = x instanceof Error ? x.message : 'Could not add the type.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="bar" role="group" aria-label="Item types: click to show or hide">
	{#each typesState.list as t (t.key)}
		{@const off = typesState.hidden.includes(t.key)}
		{@const c = colorsFor(t.key)}
		<button
			type="button"
			class="chip {typeClass(t.key)}"
			class:off
			style:--bg={c.bg}
			style:--fg={c.ink}
			aria-pressed={!off}
			title="{off ? 'Show' : 'Hide'} {t.name}{t.isDefault ? ' (default for quick add)' : ''}{t.countsDown
				? ' · counts down'
				: ''}"
			onclick={() => toggle(t.key)}
		>
			<span class="sw" aria-hidden="true"></span>{t.name}{#if t.isDefault}<span aria-hidden="true">
					★</span
				>{/if}
		</button>
	{/each}
	<div class="new">
		<button
			type="button"
			class="plus"
			disabled={full}
			aria-expanded={open}
			aria-label="New type"
			title={full ? `You have ${MAX_TYPES} types. Delete one in Settings first.` : 'New type'}
			onclick={() => (open = !open)}>+</button
		>
		{#if open}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<form class="pop card" onsubmit={add} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
				<label class="field"
					><span class="label">Name</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={name} maxlength="30" required autofocus /></label
				>
				<div class="field">
					<span class="label">Colour</span>
					<div class="swatches" role="radiogroup" aria-label="Colour">
						{#each TYPE_SWATCHES as s (s)}
							<button
								type="button"
								role="radio"
								aria-checked={bg === s}
								aria-label={s}
								class="pick"
								class:on={bg === s}
								style:background={s}
								onclick={() => (bg = s)}
							></button>
						{/each}
					</div>
				</div>
				<label class="field"
					><span class="label">Quick-add word</span>
					<span class="slug"
						>/<input
							value={autoSlug}
							maxlength="20"
							oninput={(e) => {
								slugTouched = true;
								slug = e.currentTarget.value.toLowerCase().replace(/[^a-z0-9]/g, '');
							}}
						/></span
					>
					{#if slugProblem}<span class="hint bad">{slugProblem}</span>{/if}
				</label>
				<label class="opt"><input type="checkbox" bind:checked={countsDown} /> Counts down to the date</label>
				<div class="preview">
					<span class="chip" style:--bg={bg} style:--fg={ink}
						><span class="sw"></span>{name || 'New type'}</span
					>
					<span class="hint">Text contrast {ratio.toFixed(1)}:1 {ratio >= 4.5 ? '✓' : '(low)'}</span>
				</div>
				{#if err}<span class="alert" role="alert">{err}</span>{/if}
				<div class="row">
					<span class="hint">{MAX_TYPES - typesState.list.length} slots left</span>
					<button class="btn sm primary" type="submit" disabled={busy || !name.trim() || !!slugProblem}
						>Add type</button
					>
				</div>
				<a class="hint" href="/settings/types">Manage all types in Settings</a>
			</form>
		{/if}
	</div>
	{#each shared as s (s.id)}
		<span class="key" title="Striped entries with this badge are {s.name}'s"
			><span class="who" style:background={s.color}>{s.name.slice(0, 1).toUpperCase()}</span>{s.name} (shared)</span
		>
	{/each}
	<span class="count">{typesState.list.length} / {MAX_TYPES} types</span>
</div>
<svelte:window onclick={(e) => open && !(e.target as HTMLElement).closest('.new') && (open = false)} />

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 24px;
		padding: 0 8px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}
	.chip.off {
		background: transparent;
		color: var(--muted);
		border-color: var(--rule);
		text-decoration: line-through;
	}
	.sw {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--fg);
		opacity: 0.6;
	}
	.chip.off .sw {
		background: var(--bg);
		opacity: 1;
	}
	.new {
		position: relative;
	}
	.plus {
		width: 24px;
		height: 24px;
		border: 1.5px dashed var(--ink);
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
		font-weight: 700;
	}
	.plus:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.pop {
		position: absolute;
		top: 30px;
		left: 0;
		z-index: 30;
		width: 280px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pick {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1.5px solid var(--rule);
		cursor: pointer;
	}
	.pick.on {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
	.slug {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.slug input {
		flex: 1;
	}
	.bad {
		color: var(--exam-edge);
	}
	.preview,
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.opt {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 13px;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--muted);
	}
	.who {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		color: #fff;
		font-size: 10px;
		display: grid;
		place-items: center;
	}
	.count {
		margin-left: auto;
		font-size: 11px;
		color: var(--muted);
	}
</style>
