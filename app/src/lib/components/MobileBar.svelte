<!-- Phone bottom bar (#88, G1): Today · Calendar · + · Keep · Pages. Only under 700 px. Account lives in the
     avatar sheet (AccountSheet). A screen outside the tabs (Settings, Trash, an item) keeps the last tab lit.
     #90: a tab reopens where you left it (URL + scroll), re-tap = top, switch = fade-through. -->
<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, beforeNavigate, goto, onNavigate, preloadCode } from '$app/navigation';
	import { onMount } from 'svelte';
	import { openAdd } from '$lib/client/mobile.svelte';
	import { post } from '$lib/client/api';
	import { buzz } from '$lib/client/haptics';
	import { showError } from '$lib/client/toast.svelte';
	import { invalidateAll } from '$lib/client/refresh';
	import { createFromTemplate } from '$lib/client/newPage';
	import ActionSheet from './ActionSheet.svelte';

	const TABS = [
		// icons = wireframe MBar
		{
			href: '/today',
			label: 'Today',
			icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
			match: (p: string) => p.startsWith('/today'),
		},
		{
			href: '/week',
			label: 'Calendar',
			icon: 'M5 4.5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM3 9.5h18M9 9.5v11M15 9.5v11',
			match: (p: string) => p.startsWith('/week') || p.startsWith('/month'),
		},
		null,
		{
			href: '/keep',
			label: 'Keep',
			icon: 'M5 3h10l4 4v14H5zM9 12h6M9 16h4',
			match: (p: string) => p.startsWith('/keep'),
		},
		{
			href: '/pages',
			label: 'Pages',
			icon: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h7M8 12h7M8 16h4',
			match: (p: string) => p.startsWith('/pages'),
		},
	];
	let last = $state('/today');
	const current = $derived(TABS.find((t) => t?.match(page.url.pathname))?.href);
	$effect(() => {
		if (current) last = current;
	});
	const on = (href: string) => (current ?? last) === href;
	const addLabel = $derived(
		page.url.pathname.startsWith('/keep')
			? 'New note'
			: page.url.pathname.startsWith('/pages')
				? 'New page'
				: 'Add',
	);

	// each tab remembers its last URL (open day / week / filters) and every URL its scroll
	const lastUrl = $state<Record<string, string>>({});
	const scrolls: Record<string, number> = {}; // not UI state
	const key = (u: URL) => u.pathname + u.search;
	$effect(() => {
		if (current) lastUrl[current] = key(page.url);
	});
	beforeNavigate(({ from }) => {
		if (from) scrolls[key(from.url)] = scrollY;
	});
	let viaTab = false;
	afterNavigate(({ to }) => {
		if (!viaTab || !to) return;
		scrollTo(0, scrolls[key(to.url)] ?? 0);
	});
	function tap(e: MouseEvent, root: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
		e.preventDefault();
		if (on(root) && current) {
			// re-tap the active tab: top of its root screen; already at the top = refresh (#103 tap path)
			if (key(page.url) === root) {
				if (scrollY > 0) return scrollTo({ top: 0, behavior: 'smooth' });
				buzz('tick');
				return invalidateAll();
			}
			viaTab = true;
			scrolls[root] = 0;
			return goto(root, { noScroll: true });
		}
		viaTab = true;
		goto(lastUrl[root] ?? root, { noScroll: true });
	}
	// M3 fade-through between tabs (G1); the bar itself stays put (view-transition-name)
	onNavigate((nav) => {
		const fade =
			viaTab && 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!fade) return;
		return new Promise<void>((done) =>
			document.startViewTransition(async () => {
				done();
				await nav.complete;
			}),
		);
	});
	afterNavigate(() => setTimeout(() => (viaTab = false)));
	// v4.0 PR 22: on Pages, + offers the templates when there are any (DESIGN's add sheet)
	const templates = $derived(
		(page.data as { templates?: { id: string; title: string; icon: string | null }[] }).templates ?? [],
	);
	let pagePick = $state(false);
	async function newPage(templateId: string | null) {
		try {
			if (templateId) return void (await createFromTemplate(templateId));
			const made = await post<{ page: { id: string } }>('/api/pages', { parentId: null });
			await invalidateAll();
			await goto(`/pages/${made.page.id}`);
		} catch (err) {
			showError(err);
		}
	}
	// + makes what this tab makes (#93, G6): a note on Keep, a page on Pages, else an item on the day on screen
	async function add(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		buzz('tick');
		const p = page.url.pathname;
		if (p.startsWith('/keep')) {
			const u = new URL(page.url);
			// #400: a note saved while the list shows Trash/Archive is invisible - switch to Notes first
			if (u.searchParams.has('scope')) u.searchParams.delete('scope');
			u.searchParams.set('new', '');
			return goto(u, { noScroll: true, keepFocus: true });
		}
		if (p.startsWith('/pages')) {
			return (pagePick = true);
		}
		const d = page.data as { day?: string; from?: string; to?: string; today?: string; sel?: string };
		const day = p.startsWith('/today')
			? d.day
			: p.startsWith('/week') && d.from && d.today && !(d.today >= d.from && d.today < (d.to ?? ''))
				? d.from
				: p.startsWith('/month')
					? d.sel
					: undefined;
		openAdd('', 'plan', { day, from });
	}
	// warm app: every tab's code ready before the first tap
	onMount(() => {
		const warm = () => TABS.forEach((t) => t && preloadCode(t.href));
		if ('requestIdleCallback' in window) requestIdleCallback(warm);
		else setTimeout(warm, 1500);
	});
</script>

<nav class="mbar" aria-label="Phone navigation">
	{#each TABS as t, i (i)}
		{#if t}
			<a
				href={lastUrl[t.href] ?? t.href}
				class:on={on(t.href)}
				aria-current={on(t.href) ? 'page' : undefined}
				onclick={(e) => tap(e, t.href)}
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill={on(t.href) ? 'currentColor' : 'none'}
					fill-opacity="0.25"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d={t.icon} /></svg
				>
				<span>{t.label}</span>
			</a>
		{:else}
			<button class="add" type="button" aria-label={addLabel} onclick={add}>+</button>
		{/if}
	{/each}
</nav>

{#if pagePick}
	<ActionSheet
		title="New page"
		hint={templates.length ? undefined : 'No templates yet. Use the page menu > Make template on any page.'}
		actions={[
			{ label: 'Blank page', run: () => newPage(null) },
			...templates.map((t) => ({
				label: `${t.icon ? `${t.icon} ` : ''}${t.title || 'Untitled'}`,
				run: () => newPage(t.id),
			})),
		]}
		onclose={() => (pagePick = false)}
	/>
{/if}

<style>
	.mbar {
		display: none;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.mbar {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 50;
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			align-items: center;
			/* #114: side insets for landscape notch; bottom for gesture bar */
			padding: 4px calc(8px + env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom))
				calc(8px + env(safe-area-inset-left));
			background: var(--card);
			border-top: 1.5px solid var(--border);
			view-transition-name: mbar;
		}
		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			font-size: 12px;
			color: var(--ink);
			text-decoration: none;
			padding: 2px 0;
			min-height: 56px;
			justify-content: center;
		}
		a svg {
			box-sizing: content-box;
			padding: 4px 16px;
			border-radius: 999px;
		}
		a.on {
			font-weight: 700;
		}
		/* big system text (#116): a label too wide for its fifth of the bar ends in … (name stays whole) */
		a {
			min-width: 0;
		}
		a span {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		a.on svg {
			background: var(--pill-card);
			color: var(--pill-ink);
		}
		.add {
			justify-self: center;
			width: 56px;
			height: 56px;
			margin-top: -22px;
			border-radius: 50%;
			border: 1.5px solid var(--border);
			background: var(--accent);
			color: #00003d;
			font-size: 28px;
			box-shadow: var(--shadow-btn);
			cursor: pointer;
			transition:
				transform var(--t-fast) var(--ease),
				box-shadow var(--t-fast) var(--ease);
		}
		/* press: squash into the shadow (anticipation), spring back on release */
		.add:active {
			transform: translate(-2px, 2px) scale(0.92);
			box-shadow: 0 0 0 var(--accent);
		}
	}
</style>
