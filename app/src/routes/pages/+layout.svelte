<!-- Pages: shared left tree on every Pages screen (UX-AUDIT #8), collapsible. Phone: tree on its own page. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { post } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	import type { PageNode } from '$lib/types';

	let { data, children } = $props();
	const nodes = $derived(data.tree as PageNode[]);
	const kids = (id: string | null) => nodes.filter((n) => n.parentId === id);
	let open = $state<Record<string, boolean>>({});
	let hidden = $state(false);
	const cur = $derived(page.params.id ?? '');
	// keep the open page's ancestors expanded
	$effect(() => {
		let p = nodes.find((n) => n.id === cur)?.parentId;
		while (p) {
			open[p] = true;
			p = nodes.find((n) => n.id === p)?.parentId ?? null;
		}
	});
	async function create(parentId: string | null) {
		try {
			const r = await post<{ page: { id: string } }>('/api/pages', { parentId });
			if (parentId) open[parentId] = true;
			await invalidateAll();
			await goto(`/pages/${r.page.id}`);
		} catch (e) {
			showError(e);
		}
	}
	async function createDb() {
		try {
			const r = await post<{ database: { pageId: string } }>('/api/databases', { title: 'Database' });
			await invalidateAll();
			await goto(`/pages/${r.database.pageId}`);
		} catch (e) {
			showError(e);
		}
	}
	const onIndex = $derived(page.url.pathname === '/pages');
</script>

<div class="wrap" class:index={onIndex}>
	{#if !hidden}
		<nav class="tree card" aria-label="Pages">
			<div class="head">
				<b>Pages</b>
				<button class="mini" type="button" aria-label="New page" title="New page" onclick={() => create(null)}
					>+</button
				>
				<button class="mini" type="button" aria-label="New database" title="New database" onclick={createDb}
					>▤</button
				>
				<button
					class="mini"
					type="button"
					aria-label="Hide page list"
					title="Hide"
					onclick={() => (hidden = true)}>«</button
				>
			</div>
			{#snippet branch(parent: string | null, depth: number)}
				<ul role={depth ? 'group' : 'tree'} aria-label={depth ? undefined : 'Page tree'}>
					{#each kids(parent) as n (n.id)}
						{@const has = kids(n.id).length > 0}
						<li role="treeitem" aria-expanded={has ? !!open[n.id] : undefined} aria-selected={n.id === cur}>
							<div class="row" class:on={n.id === cur} style:padding-left="{depth * 14 + 4}px">
								{#if has}
									<button
										class="mini tw"
										type="button"
										aria-label="{open[n.id] ? 'Collapse' : 'Expand'} {n.title || 'Untitled'}"
										onclick={() => (open[n.id] = !open[n.id])}>{open[n.id] ? '▾' : '▸'}</button
									>
								{:else}<span class="tw"></span>{/if}
								<a href="/pages/{n.id}" class:untitled={!n.title}
									>{n.icon ? `${n.icon} ` : ''}{n.title || 'Untitled'}</a
								>
								<button
									class="mini add"
									type="button"
									aria-label="New page inside {n.title || 'Untitled'}"
									title="New subpage"
									onclick={() => create(n.id)}>+</button
								>
							</div>
							{#if has && open[n.id]}{@render branch(n.id, depth + 1)}{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
			{#if nodes.length}{@render branch(null, 0)}{:else}<p class="hint">No pages yet.</p>{/if}
			<div class="foot">
				<a href="/pages/archive" class:on={page.url.pathname === '/pages/archive'}>Archive</a>
				<a href="/pages/trash" class:on={page.url.pathname === '/pages/trash'}>Trash</a>
			</div>
		</nav>
	{:else}
		<button
			class="mini show"
			type="button"
			aria-label="Show page list"
			title="Show pages"
			onclick={() => (hidden = false)}>»</button
		>
	{/if}
	<section class="main">{@render children()}</section>
</div>

<style>
	.wrap {
		display: flex;
		gap: 20px;
		padding: 8px 24px 40px;
		max-width: 1440px;
		margin: 0 auto;
		align-items: flex-start;
	}
	.tree {
		width: 260px;
		flex: none;
		padding: 10px;
		position: sticky;
		top: 80px;
		max-height: calc(100vh - 100px);
		overflow-y: auto;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 6px;
	}
	.head b {
		flex: 1;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: 8px;
	}
	.row.on {
		background: var(--pill);
		font-weight: 600;
	}
	.row a {
		flex: 1;
		min-width: 0;
		padding: 4px 6px;
		font-size: 14px;
		color: var(--ink);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-height: 24px;
	}
	.untitled {
		color: var(--muted) !important;
	}
	.tw {
		width: 24px;
		flex: none;
	}
	.mini {
		min-width: 24px;
		min-height: 24px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		font-size: 12px;
	}
	.mini.tw {
		border: 0;
	}
	.add {
		opacity: 0;
	}
	.row:hover .add,
	.row:focus-within .add {
		opacity: 1;
	}
	@media (hover: none) {
		.add {
			opacity: 1;
		}
	}
	.foot {
		display: flex;
		gap: 12px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--rule);
		font-size: 13px;
	}
	.foot a {
		color: var(--ink);
	}
	.foot a.on {
		font-weight: 700;
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	@media (max-width: 699px) {
		.wrap {
			flex-direction: column;
			padding: 8px 12px 104px;
		}
		.tree {
			position: static;
			width: 100%;
			max-height: none;
		}
		/* phone: the tree IS the All pages screen; on a page it gets out of the way */
		.wrap:not(.index) .tree {
			display: none;
		}
	}
</style>
