<!-- First-use gesture hint on phone (#104, G7): one small card the first time a screen with gestures opens.
     "Got it" = never again for this user (users.hints_seen). Not while the welcome tour is still to come. -->
<script lang="ts" module>
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once per mount; `gone` drives the UI
	const dismissed = new Set<string>(); // this visit's dismissals: the user data may not be reloaded yet
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { patch } from '$lib/client/api';
	import { isPhone } from '$lib/client/phone';

	let { id, text }: { id: string; text: string } = $props();
	let phone = $state(false);
	let gone = $state(false);
	onMount(() => (phone = isPhone()));
	const user = $derived(page.data.user);
	const show = $derived(
		phone &&
			!gone &&
			!!user &&
			user.tourState !== 'new' &&
			!user.hintsSeen.includes(id) &&
			!dismissed.has(id),
	);

	function done() {
		gone = true;
		dismissed.add(id);
		const seen = [...new Set([...(user?.hintsSeen ?? []), ...dismissed])];
		void patch('/api/me/prefs', { hintsSeen: seen }).catch(() => (gone = false));
	}
</script>

{#if show}
	<div class="hint card" role="note">
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
			><path
				d="M9 11V5a2 2 0 0 1 4 0v6M13 10a2 2 0 0 1 4 0v3M17 12a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l2 2"
			/></svg
		>
		<p>{text}</p>
		<button class="btn sm" type="button" onclick={done}>Got it</button>
	</div>
{/if}

<style>
	.hint {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 12px;
		margin: 0 0 10px;
		font-size: 14px;
	}
	p {
		flex: 1;
		margin: 0;
		line-height: 1.35;
	}
	.btn {
		flex: none;
		min-height: 48px;
	}
</style>
