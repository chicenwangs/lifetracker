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
	// phone All pages (wireframe MPages): search titles + 5 recent
	let q = $state('');
	const hits = $derived(
		q.trim()
			? nodes.filter((n) => (n.title || 'Untitled').toLowerCase().includes(q.trim().toLowerCase()))
			: [],
	);
	const recent = $derived((data.recent ?? []) as { id: string; title: string; lastOpenedAt: string }[]);
	const shortDay = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	const pinned = $derived(new Set(((page.data.pins ?? []) as { id: string }[]).map((p) => p.id)));
	const tools = [
		{ href: '/pages/graph', label: 'Knowledge graph' },
		{ href: '/pages/shared', label: 'Shared with me' },
		{ href: '/pages/archive', label: 'Archive' },
		{ href: '/pages/trash', label: 'Trash' },
	];
</script>

<div class="wrap" class:index={onIndex}>
	{#if onIndex}
		<section class="phonehead" aria-labelledby="all-h">
			<h1 id="all-h">All pages</h1>
			<label class="find"
				><span class="sr-only">Search pages</span><input
					type="search"
					placeholder="Search pages"
					bind:value={q}
				/></label
			>
			{#if q.trim()}
				<ul class="hits" aria-label="Matching pages">
					{#each hits as n (n.id)}<li><a href="/pages/{n.id}">{n.title || 'Untitled'}</a></li>{:else}<li
							class="hint"
						>
							No page title matches. Ctrl+K searches the text too.
						</li>{/each}
				</ul>
			{:else if recent.length}
				<h2 class="lbl">Recent</h2>
				<ul class="recent" aria-label="Recent pages">
					{#each recent as r (r.id)}
						<li>
							<a href="/pages/{r.id}"
								><b>{r.title || 'Untitled'}</b><span class="hint">{shortDay(r.lastOpenedAt)}</span></a
							>
						</li>
					{/each}
				</ul>
				<h2 class="lbl">All</h2>
			{/if}
		</section>
	{/if}
	{#if !hidden}
		<nav class="tree card" aria-label="Pages">
			<div class="head">
				<button class="btn primary sm grow" type="button" onclick={() => create(null)}>New page</button>
				<button class="mini" type="button" aria-label="New database" title="New database" onclick={createDb}
					>▤</button
				>
				<button
					class="mini"
					type="button"
					aria-label="Hide page list"
					title="Hide page list"
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
								<a
									href="/pages/{n.id}"
									class:untitled={!n.title}
									aria-current={n.id === cur ? 'page' : undefined}
									><span class="t">{n.icon ? `${n.icon} ` : ''}{n.title || 'Untitled'}</span
									>{#if pinned.has(n.id)}<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											role="img"
											aria-label="Pinned to header"><path d="M12 17v5M9 10.8V4h6v6.8l3 3.2H6z" /></svg
										>{/if}</a
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
				{#each tools as t (t.href)}
					<a href={t.href} aria-current={page.url.pathname === t.href ? 'page' : undefined}>{t.label}</a>
				{/each}
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
		gap: 24px;
		padding: 8px 32px 40px;
		max-width: 1440px;
		margin: 0 auto;
		align-items: flex-start;
	}
	.tree {
		width: 240px;
		flex: none;
		padding: 12px;
		position: sticky;
		top: 80px;
		max-height: calc(100vh - 100px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
	}
	.grow {
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
		border-radius: 7px;
		min-height: 32px;
	}
	.row:hover {
		background: var(--hover);
	}
	.row.on {
		background: var(--pill-card);
	}
	.row.on a,
	.row.on .mini {
		color: var(--pill-ink);
	}
	.row a {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 6px 5px 0;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--ink);
		text-decoration: none;
	}
	.row.on a {
		font-weight: 700;
	}
	.row a .t {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row a svg {
		flex: none;
		color: var(--quiet);
	}
	.untitled {
		color: var(--quiet) !important;
	}
	.tw {
		width: 24px;
		flex: none;
	}
	.mini {
		min-width: 32px;
		min-height: 32px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-btn);
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
	}
	.mini.tw,
	.mini.add {
		min-width: 24px;
		min-height: 28px;
		border: 0;
		background: transparent;
		color: var(--quiet);
		font-size: 12px;
	}
	.mini.add {
		font-size: 14px;
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
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1.5px solid var(--rule);
	}
	.foot a {
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: 0 8px;
		border-radius: 7px;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--ink);
		text-decoration: none;
	}
	.foot a:hover {
		background: var(--hover);
	}
	.foot a[aria-current='page'] {
		background: var(--pill-card);
		color: var(--pill-ink);
		font-weight: 700;
	}
	.hint {
		margin: 4px 8px;
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	/* index, archive, trash, graph cards (the page editor has its own bar + column) */
	.main :global(.panel) {
		padding: 20px 24px;
	}
	.main :global(.panel h1) {
		margin: 0 0 6px;
		font-size: 26px;
	}
	.main :global(.panel h2) {
		font-size: 17px;
	}
	.phonehead {
		display: none;
	}
	@media (max-width: 699px) {
		.phonehead {
			display: flex;
			flex-direction: column;
			gap: 8px;
			width: 100%;
			min-width: 0;
		}
		.phonehead h1 {
			margin: 4px 0 0;
			font-size: 20px;
		}
		.find {
			display: block;
		}
		.find input {
			width: 100%;
			box-sizing: border-box;
			min-height: 44px;
			padding: 0 12px;
			font: inherit;
			font-size: 15px;
			border: 1.5px solid var(--border);
			border-radius: 12px;
			background: var(--card);
			color: var(--ink);
		}
		.lbl {
			margin: 6px 0 0;
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--quiet);
		}
		.recent {
			display: flex;
			gap: 10px;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			scroll-padding: 0 12px;
			margin: 0 -12px;
			padding: 2px 12px 8px;
		}
		.recent li {
			flex: none;
			scroll-snap-align: start;
		}
		.recent a {
			width: 132px;
			min-height: 88px;
			box-sizing: border-box;
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: 10px;
			border: 1.5px solid var(--card-edge);
			border-radius: 14px;
			background: var(--card);
			box-shadow: var(--shadow-btn);
			color: var(--ink);
			text-decoration: none;
		}
		.recent .hint {
			margin-top: auto;
		}
		.hits {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.hits a {
			display: flex;
			align-items: center;
			min-height: 44px;
			padding: 0 12px;
			border-radius: 10px;
			background: var(--card);
			color: var(--ink);
			font-weight: 600;
			text-decoration: none;
		}
		.wrap {
			flex-direction: column;
			padding: 8px 12px 24px;
		}
		.tree {
			position: static;
			width: 100%;
			max-height: none;
		}
		.head .mini:last-child {
			display: none; /* nothing to hide it for on a phone */
		}
		/* phone: the tree IS the All pages screen; on a page it gets out of the way */
		.wrap:not(.index) .tree {
			display: none;
		}
	}
</style>
