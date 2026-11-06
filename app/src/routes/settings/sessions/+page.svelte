<!-- FR-A4/A5. Devices. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { prettyDate, utcToLocal } from '$lib/time';
	let { data, form } = $props();
	const when = (z: string) => {
		const l = utcToLocal(z, data.user?.timezone ?? 'Asia/Kuala_Lumpur');
		return `${prettyDate(l.date)} ${l.time}`;
	};
</script>

<svelte:head><title>Devices · Life Tracker</title></svelte:head>

<div class="card panel">
	<div class="row" style="justify-content: space-between">
		<h1>Devices</h1>
		<form method="post" action="?/others" use:enhance>
			<button class="btn" type="submit" disabled={data.sessions.length < 2}>Sign out everywhere else</button>
		</form>
	</div>
	{#if form?.removed !== undefined}<span class="ok-note"
			>Signed out {form.removed} other device{form.removed === 1 ? '' : 's'}.</span
		>{/if}
	{#if form?.message}<span class="alert">{form.message}</span>{/if}
	<table class="plain">
		<thead><tr><th>Device</th><th>Signed in</th><th>Last seen</th><th>Remember</th><th></th></tr></thead>
		<tbody>
			{#each data.sessions as s (s.key)}
				<tr>
					<td
						><b>{s.device}</b>{#if s.current}
							<span class="muted">· this device</span>{/if}<br /><span class="hint">{s.ip ?? ''}</span></td
					>
					<td>{when(s.createdAt)}</td>
					<td>{when(s.lastSeenAt)}</td>
					<td>{s.remember ? '30 days' : 'Browser session'}</td>
					<td>
						{#if !s.current}
							<form method="post" action="?/revoke" use:enhance>
								<input type="hidden" name="key" value={s.key} />
								<button class="btn sm danger" type="submit">Revoke</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
