<!-- FR-Q3. Courses + quick-add #aliases. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>Courses · Life Tracker</title></svelte:head>

<div class="card panel">
	<h1>Courses</h1>
	<p class="hint">
		Aliases are quick-add tags: <code>#ds</code>, <code>#sysprog</code>. A course tag sets type Work unless
		you add <code>!type</code>.
	</p>
	{#if form?.message}<span class="alert" role="alert">{form.message}</span>{/if}
	{#each data.courses as c (c.id)}
		<form
			class="crow"
			method="post"
			action="?/save"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<input type="hidden" name="id" value={c.id} />
			<label class="sr-only" for="code-{c.id}">Code</label>
			<input id="code-{c.id}" class="input sm code" name="code" value={c.code} required />
			<label class="sr-only" for="name-{c.id}">Name</label>
			<input id="name-{c.id}" class="input sm" name="name" value={c.name} required />
			<label class="sr-only" for="al-{c.id}">Aliases</label>
			<input
				id="al-{c.id}"
				class="input sm"
				name="aliases"
				value={c.aliases.join(' ')}
				placeholder="aliases"
			/>
			<label class="act"><input type="checkbox" name="active" checked={c.active} /> Active</label>
			<button class="btn sm" type="submit">Save</button>
			<button
				class="btn sm danger"
				type="submit"
				formaction="?/remove"
				onclick={(e) =>
					!confirm(`Delete ${c.code}? Items keep their data but lose the course.`) && e.preventDefault()}
				>Delete</button
			>
		</form>
	{:else}
		<span class="muted">No courses yet. Import from Notion, or add one.</span>
	{/each}
</div>

<form class="card panel" method="post" action="?/add" use:enhance>
	<h2>Add course</h2>
	<div class="crow">
		<label class="sr-only" for="n-code">Code</label>
		<input id="n-code" class="input sm code" name="code" placeholder="DS" required />
		<label class="sr-only" for="n-name">Name</label>
		<input id="n-name" class="input sm" name="name" placeholder="Data Structures" required />
		<label class="sr-only" for="n-al">Aliases</label>
		<input id="n-al" class="input sm" name="aliases" placeholder="ds datastruct" />
		<button class="btn sm primary" type="submit">Add</button>
	</div>
</form>

<style>
	.crow {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.crow .input {
		flex: 1 1 160px;
		width: auto;
	}
	.crow .code {
		flex: 0 0 90px;
	}
	.act {
		display: flex;
		gap: 4px;
		align-items: center;
		font-size: 13px;
	}
	code {
		background: var(--ground);
		padding: 1px 4px;
		border-radius: 4px;
	}
</style>
