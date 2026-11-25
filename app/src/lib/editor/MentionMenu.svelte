<!-- "[[" link picker (PR 19, DESIGN 2.4). Desktop popover at the caret; phone BottomSheet above the keyboard.
     Arrow keys / Enter / Esc come from the shared Suggestion render; this only draws the rows. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import { isPhone } from '$lib/client/phone';
	import type { MenuState, MentionItem } from './extensions.svelte';

	let {
		s,
		onpick,
		onclose,
	}: {
		s: MenuState<MentionItem>;
		onpick: (i: MentionItem) => void;
		onclose?: () => void;
	} = $props();
	let phone = $state(false);
	let ih = $state(innerHeight); // shrinks with the on-screen keyboard (#282)
	onMount(() => (phone = isPhone()));
	const below = $derived(ih - s.y - 64); // 64 = docked toolbar
	const up = $derived(below < 200 && s.top > below);
	const header = $derived(s.q.trim() ? 'Pages' : 'Recent');
	const empty = $derived(!s.items.some((i) => !i.create) && !!s.q.trim());

	/** the typed query inside the title, bolded */
	function parts(title: string): [string, string, string] {
		const q = s.q.trim();
		const i = q ? title.toLowerCase().indexOf(q.toLowerCase()) : -1;
		return i < 0
			? [title, '', '']
			: [title.slice(0, i), title.slice(i, i + q.length), title.slice(i + q.length)];
	}
</script>

<svelte:window bind:innerHeight={ih} />

{#snippet rows()}
	<p class="head">{header}</p>
	{#if empty}<p class="none">No page called that</p>{/if}
	{#each s.items as item, i (item.create ?? item.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			role="option"
			tabindex="-1"
			aria-selected={i === s.index}
			class:create={!!item.create}
			class:arch={item.archived}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onpick(item)}
		>
			{#if item.create}
				<b>+ Create page "{item.create}"</b>
			{:else}
				<span class="ic" aria-hidden="true">{item.icon ?? '·'}</span>
				{@const [a, b, c] = parts(item.title)}
				<span class="t"
					>{a}{#if b}<b>{b}</b>{/if}{c}</span
				>
				{#if item.archived}<span class="hint">archived</span>{/if}
				{#if item.path}<span class="path">{item.path}</span>{/if}
			{/if}
		</div>
	{/each}
{/snippet}

{#if phone}
	<BottomSheet label="Link a page" keepFocus onclose={() => onclose?.()}>
		<div class="list" aria-label="Link a page" role="listbox">
			{@render rows()}
		</div>
	</BottomSheet>
{:else}
	<div
		class="menu"
		role="listbox"
		aria-label="Link a page"
		style:left="{s.x}px"
		style:top={up ? null : `${s.y + 4}px`}
		style:bottom={up ? `${ih - s.top + 4}px` : null}
		style:max-height="{Math.max(120, Math.min(340, up ? s.top - 8 : below))}px"
	>
		{@render rows()}
		<div class="keys" aria-hidden="true">↑↓ move · Enter link · Esc cancel</div>
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: 95;
		width: 320px;
		max-width: calc(100vw - 24px);
		overflow: auto;
		background: var(--card);
		color: var(--ink);
		border: 1.5px solid var(--border);
		border-radius: 12px;
		padding: 6px;
		box-shadow: -4px 4px 0 var(--accent);
	}
	.head {
		margin: 4px 8px 6px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--quiet);
	}
	.none {
		margin: 4px 8px 6px;
		font-size: 12.5px;
		color: var(--quiet);
	}
	[role='option'] {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		min-height: 32px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 13.5px;
	}
	[role='option']:hover,
	[role='option'][aria-selected='true'] {
		background: var(--pill);
		color: var(--pill-ink);
	}
	.ic {
		flex: none;
		width: 18px;
		text-align: center;
	}
	.t {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.path,
	.hint {
		flex: none;
		font-size: 11.5px;
		color: var(--faint);
	}
	[role='option'][aria-selected='true'] .path,
	[role='option'][aria-selected='true'] .hint {
		color: inherit;
		opacity: 0.8;
	}
	.arch .t {
		color: var(--quiet);
	}
	.create b {
		font-weight: 600;
	}
	.keys {
		margin: 6px 8px 2px;
		font-size: 11px;
		color: var(--quiet);
	}
	/* phone: 48 dp rows, max 5 visible (DESIGN 2.4) */
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.list {
			max-height: 240px;
			overflow: auto;
		}
		[role='option'] {
			min-height: 48px;
		}
	}
</style>
