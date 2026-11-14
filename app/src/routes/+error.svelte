<!-- Any route error: a readable card instead of the bare default page. -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · Life Tracker</title></svelte:head>

<main class="err">
	<section class="card">
		<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
		<p class="hint">
			{page.status === 404
				? "This page doesn't exist, or you can't open it."
				: (page.error?.message ?? 'Try again in a moment.')}
		</p>
		<a class="btn primary" href="/">Go home</a>
	</section>
</main>

<style>
	.err {
		max-width: 520px;
		margin: 0 auto;
		padding: 24px 16px;
	}
	.card {
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	h1 {
		margin: 0;
		font-size: 24px;
	}
</style>
