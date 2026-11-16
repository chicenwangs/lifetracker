<!-- Settings › Help (FEATURES §11): restart the tour + short guides. Only things that are shipped. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$lib/client/refresh';
	import { patch } from '$lib/client/api';
	import { showError, showToast } from '$lib/client/toast.svelte';
	import { onMount } from 'svelte';
	import { isApp, updater } from '$lib/client/native';
	import { isPhone } from '$lib/client/phone';

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
			await goto(isPhone() ? '/today' : '/'); // phone tour walks the tab bar from Today (#83)
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
	// phone (#115): one section per tab, each gesture with its tap alternative; no keys, no left / right
	const PHONE = [
		{ h: 'Everywhere', p: ['+ in the middle of the bar adds the right thing for the tab you are on.', 'Pull down at the top of a tab to refresh, or tap the open tab again.', 'Back closes the top sheet or menu first. Search is the magnifier at the top; your picture opens account, Settings and Trash.'] },
		{ h: 'Today', p: ['Swipe the day sideways for the day before or after, or tap a day in the week strip. Tap the date for any day.', 'Swipe a row right = done, left = delete (Undo on the toast). Hold a row, then drag it to a new time. ⋯ on a row does the same by tap.'] },
		{ h: 'Calendar', p: ['Week | Month at the top. Swipe sideways for the week or month before or after.', 'Month: tap a day to see its plans below. Week: hold a row and drag it onto another day, or use ⋯ › Move.'] },
		{ h: 'Keep', p: ['Swipe a note sideways to archive it (Undo on the toast). Hold a note to select it, then tap more; hold and drag to reorder.', 'In a note: + adds a checklist or an image, the colour dot sets its colour, ⋮ has share, labels, archive and delete. The bell sets a reminder.'] },
		{ h: 'Pages', p: ['Search and Recent at the top, then all your pages. + makes a new page.', 'While you type, the tools sit just above the keyboard. ⋯ there moves, copies or deletes the block you are in. Type / for blocks.'] },
		{ h: 'Reminders', p: ['/remind 1d 2h in quick add, or the bell in a note. Turn on push in Notifications to get them when the app is closed.'] },
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
{#each PHONE as g (g.h)}
	<section class="card panel ph">
		<h2>{g.h}</h2>
		{#each g.p as p (p)}<p>{p}</p>{/each}
	</section>
{/each}
{#each GUIDES as g (g.h)}
	<section class="card panel desk">
		<h2>{g.h}</h2>
		{#each g.p as p (p)}<p>{p}</p>{/each}
	</section>
{/each}

<style>
	.panel.ph {
		display: none;
	}
	@media (max-width: 699px), (pointer: coarse) and (max-height: 500px) {
		.panel.ph {
			display: flex;
		}
		.panel.desk {
			display: none;
		}
	}
</style>
