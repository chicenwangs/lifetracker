<!-- Share one page or note (FEATURES §8): names the thing, pick a registered user, Can view / Can edit, change, revoke.
     Only this page/note: subpages, linked pages and other notes are never included (D-01, D-02). No public links (D-04). -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch, get, post } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';

	type Share = { id: string; username: string; name: string; permission: 'view' | 'edit' };
	let { kind, id, name, onclose }: { kind: 'page' | 'note'; id: string; name: string; onclose: () => void } =
		$props();
	let list = $state<Share[]>([]);
	let username = $state('');
	let permission = $state<'view' | 'edit'>('view');
	let err = $state('');
	const url = $derived(`/api/shares/${kind}/${id}`);
	onMount(() => void get<{ shares: Share[] }>(url).then((r) => (list = r.shares), showError));

	async function put(u: string, p: 'view' | 'edit') {
		err = '';
		try {
			list = (await post<{ shares: Share[] }>(url, { username: u, permission: p })).shares;
			return true;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Not shared';
			return false;
		}
	}
	async function add(ev: SubmitEvent) {
		ev.preventDefault();
		if (username.trim() && (await put(username.trim(), permission))) username = '';
	}
	async function revoke(s: Share) {
		try {
			list = (await apiFetch<{ shares: Share[] }>('DELETE', url, { shareId: s.id })).shares;
		} catch (e) {
			showError(e);
		}
	}
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dlg card" role="dialog" aria-modal="true" aria-label="Share {name}">
	<h2>Share "{name || 'Untitled'}"</h2>
	<p class="hint">
		Only this {kind}.{kind === 'page'
			? ' Subpages and linked pages stay private unless you share them too.'
			: ''}
	</p>
	<form class="row" onsubmit={add}>
		<input
			aria-label="Username"
			placeholder="Username"
			bind:value={username}
			maxlength="64"
			autocomplete="off"
		/>
		<select aria-label="Permission" bind:value={permission}>
			<option value="view">Can view</option>
			<option value="edit">Can edit</option>
		</select>
		<button class="btn sm primary" type="submit" disabled={!username.trim()}>Share</button>
	</form>
	{#if err}<p class="alert" role="alert">{err}</p>{/if}
	<ul>
		{#each list as s (s.id)}
			<li>
				<span>{s.name} <span class="hint">@{s.username}</span></span>
				<select
					aria-label="Permission for {s.name}"
					value={s.permission}
					onchange={(e) => put(s.username, e.currentTarget.value as 'view' | 'edit')}
				>
					<option value="view">Can view</option>
					<option value="edit">Can edit</option>
				</select>
				<button class="btn sm" type="button" onclick={() => revoke(s)}>Remove</button>
			</li>
		{:else}<li class="hint">Private. Only you can open it.</li>{/each}
	</ul>
	<div class="row end"><button class="btn sm" type="button" onclick={onclose}>Done</button></div>
</div>
<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgb(0 0 0 / 0.3);
	}
	.dlg {
		position: fixed;
		z-index: 81;
		left: 50%;
		top: 15vh;
		transform: translateX(-50%);
		width: min(440px, calc(100vw - 32px));
		padding: 18px;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 17px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 10px 0;
	}
	.row input {
		flex: 1;
		min-width: 0;
	}
	.end {
		justify-content: flex-end;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 14px;
	}
	li {
		display: flex;
		gap: 8px;
		align-items: center;
		min-height: 36px;
	}
	li > span:first-child {
		flex: 1;
	}
</style>
