<!-- FR-S1..S9 (rev 2026-11-08). Swap codes: make yours + send it; enter theirs. View-only; pick what each code shows. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { colorsFor } from '$lib/colors';
	import { prettyDate, utcToLocal } from '$lib/time';
	import { typeName, typesState } from '$lib/client/itemtypes.svelte';
	let { data, form } = $props();

	const tz = $derived(data.user?.timezone ?? 'Asia/Kuala_Lumpur');
	const when = (z: string) => {
		const l = utcToLocal(z, tz);
		return `${prettyDate(l.date).split(' ').slice(0, 3).join(' ')} ${l.time}`;
	};
	// every type of mine (custom ones too), then No type + Planner blocks. Ticked = the type's "share by default".
	const KINDS = $derived([
		...typesState.list.map((t) => ({ k: t.key, label: t.name, on: t.shareDefault })),
		{ k: 'None', label: 'No type', on: false },
		{ k: 'Blocks', label: 'Planner blocks', on: true },
	]);
	const sw = (k: string) => (k === 'Blocks' ? null : colorsFor(k === 'None' ? null : k));
	/** a partner's custom type I don't have shows as "custom type" */
	const label = (k: string) =>
		k === 'Blocks' ? 'Planner blocks' : k === 'None' ? 'No type' : (typeName(k) ?? 'a custom type');
	const kinds = (v: string[]) => v.map(label).join(', ') || 'nothing';
	let copied = $state(false);
</script>

<svelte:head><title>Sharing · Life Tracker</title></svelte:head>

<div class="stack">
	<section class="card panel">
		<h1>Sharing</h1>
		<p class="muted">
			Swap codes to see each other's calendar. Make a code and send it to the other person; they enter it
			below on their account. Then they make one for you. Shared calendars are view-only.
		</p>
		{#if form?.ok}<span class="ok-note" role="status">{form.ok}</span>{/if}
		{#if form?.msg}<span class="alert" role="alert">{form.msg}</span>{/if}
	</section>

	<section class="card panel">
		<h2>1 · Share my calendar</h2>
		{#if form?.code}
			<div class="code" role="status">
				<code aria-label="Your share code">{form.code}</code>
				<button
					class="btn sm"
					type="button"
					onclick={() => {
						navigator.clipboard?.writeText(form.code);
						copied = true;
					}}>{copied ? 'Copied' : 'Copy'}</button
				>
				<span class="hint"
					>Shown once. One person can use it, until {when(form.expiresAt)}. Send it to them.</span
				>
			</div>
		{/if}
		<form
			method="post"
			action="?/make"
			use:enhance={() =>
				async ({ update }) => {
					copied = false;
					await update({ reset: false });
				}}
		>
			<fieldset>
				<legend class="label">They can see</legend>
				<div class="kinds">
					{#each KINDS as { k, label: name, on } (k)}
						{@const c = sw(k)}
						<label class="kind">
							<input type="checkbox" name="types" value={k} checked={on} />
							{#if c}<span class="swatch" style:background={c.bg} style:border-color={c.ink}></span>{/if}
							{name}
						</label>
					{/each}
				</div>
				<span class="hint">Items marked "Keep secret" always show as Busy.</span>
			</fieldset>
			<div class="opts">
				<label class="field">
					<span class="label">Everything else</span>
					<select class="input" name="hiddenAs">
						<option value="busy">Show as Busy (time only)</option>
						<option value="none">Hide completely</option>
					</select>
				</label>
				<label class="field">
					<span class="label">Code works for</span>
					<select class="input" name="expiry">
						<option value="7d">7 days</option>
						<option value="24h">24 hours</option>
					</select>
				</label>
			</div>
			<div class="row">
				<button class="btn primary" type="submit">Make a code</button>
				{#if form?.makeMsg}<span class="alert">{form.makeMsg}</span>{/if}
			</div>
		</form>
		{#if data.unused.length}
			<h3>Codes not used yet</h3>
			{#each data.unused as k (k.id)}
				<form method="post" action="?/cancel" use:enhance class="line">
					<input type="hidden" name="id" value={k.id} />
					<span>Shows {kinds(k.visibleTypes)} · until {when(k.expiresAt)}</span>
					<button class="btn sm" type="submit">Cancel</button>
				</form>
			{/each}
		{/if}
	</section>

	<section class="card panel">
		<h2>2 · Enter their code</h2>
		<form method="post" action="?/redeem" use:enhance class="redeem">
			<label class="field grow">
				<span class="label">Code from the other person</span>
				<input
					class="input mono"
					name="code"
					required
					autocomplete="off"
					spellcheck="false"
					placeholder="LT-XXXX-XXXX-XXXX"
					value={form?.typed ?? ''}
				/>
			</label>
			<button class="btn primary" type="submit">Add calendar</button>
		</form>
		{#if form?.redeemMsg}<span class="alert" role="alert">{form.redeemMsg}</span>{/if}
		{#if form?.redeemed}<span class="ok-note" role="status"
				>You can now see {form.redeemed}'s calendar on Home and Week.</span
			>{/if}
	</section>

	<section class="card panel">
		<h2>Calendars I can see</h2>
		{#each data.received as g (g.id)}
			<div class="person">
				<span class="badge" style:background={g.color} aria-hidden="true"
					>{g.name.slice(0, 1).toUpperCase()}</span
				>
				<span class="who"><b>{g.name}</b><span class="hint">Shows {kinds(g.visibleTypes)}</span></span>
				<form method="post" action="?/overlap" use:enhance>
					<input type="hidden" name="id" value={g.id} />
					<input type="hidden" name="on" value={g.inOverlap ? '0' : '1'} />
					<button class="btn sm" type="submit" aria-pressed={g.inOverlap}
						>{g.inOverlap ? 'Shown' : 'Hidden'}</button
					>
				</form>
				<form method="post" action="?/leave" use:enhance>
					<input type="hidden" name="id" value={g.id} />
					<button class="btn sm danger" type="submit">Leave</button>
				</form>
			</div>
		{:else}
			<span class="muted">None yet. Enter someone's code above.</span>
		{/each}
	</section>

	<section class="card panel">
		<h2>Who can see my calendar</h2>
		{#each data.given as g (g.id)}
			<div class="person">
				<span class="badge" style:background={g.color} aria-hidden="true"
					>{g.name.slice(0, 1).toUpperCase()}</span
				>
				<span class="who"
					><b>{g.name}</b><span class="hint"
						>Sees {kinds(g.visibleTypes)}{g.hiddenAs === 'busy' ? ', rest as Busy' : ''}</span
					></span
				>
				<form method="post" action="?/remove" use:enhance>
					<input type="hidden" name="id" value={g.id} />
					<button class="btn sm danger" type="submit">Remove</button>
				</form>
			</div>
		{:else}
			<span class="muted">Nobody. Your calendar is private.</span>
		{/each}
	</section>
</div>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		font-size: 16px;
	}
	h3 {
		font-size: 13px;
		color: var(--quiet);
		margin-top: 4px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.kind {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		font-size: 13px;
	}
	.kind:has(input:checked) {
		border-color: var(--ink);
		background: var(--hover);
	}
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid;
	}
	.opts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 600px) {
		.opts {
			grid-template-columns: 1fr;
		}
	}
	.code {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px;
		border: 1.5px dashed var(--ink);
		border-radius: 10px;
	}
	.code code,
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.code code {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.line {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
	}
	.redeem {
		flex-direction: row;
		align-items: flex-end;
		gap: 10px;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1 1 260px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-top: 1px solid var(--rule);
	}
	.person form {
		flex-direction: row;
	}
	.badge {
		width: 28px;
		height: 28px;
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-weight: 700;
		font-size: 13px;
		flex: none;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 45%, transparent);
	}
	.who {
		display: flex;
		flex-direction: column;
		margin-right: auto;
	}
</style>
