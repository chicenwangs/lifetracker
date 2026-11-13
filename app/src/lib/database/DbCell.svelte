<!-- One property value, edited in place. Saves on change; a value the server rejects stays typed, with the reason
     under it (PG-DB). A stored value that no longer fits the type shows as is with ⚠ (D-19). -->
<script lang="ts">
	import { asText } from '$lib/dbvalues';
	import type { DbProp } from '$lib/types';

	let {
		prop,
		value,
		invalid = false,
		label,
		onsave,
	}: {
		prop: DbProp;
		value: unknown;
		invalid?: boolean;
		label: string;
		/** resolves with an error message, or null when saved */
		onsave: (v: unknown) => Promise<string | null>;
	} = $props();

	let err = $state<string | null>(null);
	let draft = $state<string | null>(null); // rejected text stays in the box
	const shown = $derived(draft ?? (invalid ? String(value ?? '') : value == null ? '' : String(value)));
	const opts = $derived(prop.config.options ?? []);
	const picked = $derived(Array.isArray(value) ? (value as string[]) : []);

	async function save(v: unknown, typed?: string) {
		err = await onsave(v);
		draft = err && typed !== undefined ? typed : null;
	}
	const chip = (c: string) => `background: var(--${c}-bg); color: var(--${c}-ink)`;
</script>

<div class="cell" class:bad={!!err || invalid}>
	{#if prop.type === 'checkbox'}
		<input
			type="checkbox"
			aria-label={label}
			checked={value === true}
			onchange={(e) => save(e.currentTarget.checked)}
		/>
	{:else if prop.type === 'select'}
		<select
			aria-label={label}
			style={chip(opts.find((o) => o.id === value)?.color ?? 'none')}
			onchange={(e) => save(e.currentTarget.value || null)}
		>
			<option value="" selected={value == null}>—</option>
			{#each opts as o (o.id)}<option value={o.id} selected={o.id === value}>{o.label}</option>{/each}
		</select>
	{:else if prop.type === 'multi_select'}
		<details>
			<summary aria-label={label}>
				{#each opts.filter((o) => picked.includes(o.id)) as o (o.id)}<span class="chip" style={chip(o.color)}
						>{o.label}</span
					>{:else}<span class="hint">—</span>{/each}
			</summary>
			<div class="pick">
				{#each opts as o (o.id)}
					<label
						><input
							type="checkbox"
							checked={picked.includes(o.id)}
							onchange={(e) =>
								save(e.currentTarget.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
						/>
						{o.label}</label
					>
				{:else}<span class="hint">No options yet. Add them from the column menu.</span>{/each}
			</div>
		</details>
	{:else}
		<input
			type={prop.type === 'date' && !invalid ? 'date' : 'text'}
			inputmode={prop.type === 'number' ? 'decimal' : undefined}
			aria-label={label}
			aria-invalid={!!err || invalid}
			placeholder={prop.type === 'title' ? 'Untitled' : ''}
			value={shown}
			onchange={(e) => save(e.currentTarget.value, e.currentTarget.value)}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
		/>
		{#if prop.type === 'url' && value && !invalid}<a
				href={String(value)}
				target="_blank"
				rel="noopener noreferrer nofollow"
				aria-label="Open link">↗</a
			>{/if}
	{/if}
	{#if invalid && !err}<span class="warn" title="This value doesn't fit the column type. Edit it to fix."
			>⚠ <span class="sr-only">{asText('text', value)} doesn't fit the column type</span></span
		>{/if}
	{#if err}<div class="err" role="alert">{err}</div>{/if}
</div>

<style>
	.cell {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	input:not([type='checkbox']),
	select {
		font: inherit;
		color: var(--ink);
		background: transparent;
		border: 1.5px solid transparent;
		border-radius: 6px;
		min-height: 28px;
		padding: 0 6px;
		min-width: 60px;
		width: 100%;
		flex: 1;
	}
	select {
		width: auto;
		flex: none;
		border-radius: 999px;
	}
	input:not([type='checkbox']):hover,
	input:not([type='checkbox']):focus {
		border-color: var(--rule);
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		margin: 3px;
		accent-color: var(--ink);
	}
	.bad input:not([type='checkbox']) {
		border-color: var(--danger);
	}
	.err {
		flex-basis: 100%;
		color: var(--danger);
		font-size: 12px;
		white-space: normal;
	}
	.warn {
		color: var(--danger);
	}
	details {
		position: relative;
	}
	summary {
		list-style: none;
		cursor: pointer;
		min-height: 28px;
		min-width: 40px;
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.chip {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.pick {
		position: absolute;
		z-index: 6;
		top: 100%;
		left: 0;
		background: var(--card);
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 160px;
	}
	.pick label {
		display: flex;
		gap: 6px;
		align-items: center;
		min-height: 24px;
	}
</style>
