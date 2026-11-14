<!-- Settings › Help (FEATURES §11): restart the tour + short guides. Only things that are shipped. -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { patch } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { onMount } from 'svelte';
	import { isApp, updater } from '$lib/client/native';

	// Android app: native update check (the pages themselves always come fresh from the server)
	let app = $state<{ current: string; latest?: string; available?: boolean } | null>(null);
	let busy = $state(false);
	onMount(() => {
		if (isApp()) app = { current: '…' };
	});
	async function checkUpdate() {
		busy = true;
		try {
			app = (await updater()?.check()) ?? null;
			if (!app?.latest) showToast("Couldn't check for updates. Try again later.");
			else if (!app.available) showToast(`You have the newest app (${app.current}).`);
		} catch (e) {
			showError(e);
		} finally {
			busy = false;
		}
	}

	async function restart() {
		try {
			await patch('/api/me/prefs', { tourState: 'new' });
			await goto('/');
			await invalidateAll();
		} catch (e) {
			showError(e);
		}
	}
	const GUIDES = [
		{ h: 'Home and Week', p: ['Month on the left, the day planner on the right. Click a day to plan it.', 'Drag on empty planner time, type a title. Drag edges to resize. No mouse? Every block has Start / End in its menu, and due items have Schedule….', 'Alt-drag copies a block. Ctrl+Z undoes the last change.'] },
		{ h: 'Quick add (N)', p: ['"dentist fri 3pm", "exam 12 dec /deadline", "gym 7-8am /planner".', '/calendar puts it on the calendar, /planner blocks time, /both does both. /remind 1d 2h adds reminders.'] },
		{ h: 'Keep', p: ['Notes and checklists (nest 4 deep). Labels and binders to sort them; pin, archive, Trash for 30 days.', 'Share… on a note gives one person view or edit. Offline edits wait on this device and send when you are back.'] },
		{ h: 'Pages', p: ['Type / for blocks: headings, lists, to-dos, tables, images, files, a database, a link to another page.', 'Ctrl+K finds pages, notes and items. Graph shows how pages link. Share… on a page gives one person view or edit (only that page).'] },
		{ h: 'Reminders', p: ['/remind 1w 3d 2d 1d 2h 15min in quick add, or on an item or note. They show inside the app; turn on push in Notifications to get them when it is closed.'] },
		{ h: 'Phone', p: ['Opens on Today. + adds a plan or a quick note. Week and Month are for reading; plan the week on a PC.', 'Install: the Android app (life-tracker-X.Y.Z.apk on the GitHub release) adds Today and Keep widgets and reminder alarms. Or Add to Home Screen in the browser menu.'] },
	]; // prettier-ignore
</script>

<svelte:head><title>Help · Life Tracker</title></svelte:head>

<section class="card panel">
	<h1>Help</h1>
	<p class="muted">The welcome tour shows the main parts in 6 steps.</p>
	<button class="btn primary" type="button" onclick={restart}>Restart the tour</button>
</section>
{#if app}
	<section class="card panel">
		<h2>Android app</h2>
		<p class="muted">
			App {app.current}{app.latest ? ` · newest ${app.latest}` : ''}. Pages update by themselves; the app
			itself (widgets, alarms) updates here.
		</p>
		{#if app.available}
			<button class="btn primary" type="button" onclick={() => updater()?.install()}
				>Update to {app.latest}</button
			>
		{:else}
			<button class="btn" type="button" disabled={busy} onclick={checkUpdate}>Check for updates</button>
		{/if}
	</section>
{/if}
{#each GUIDES as g (g.h)}
	<section class="card panel">
		<h2>{g.h}</h2>
		{#each g.p as p (p)}<p>{p}</p>{/each}
	</section>
{/each}
