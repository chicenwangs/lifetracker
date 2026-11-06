<!-- TEMP (step 2). Step 5 replaces with Home: month calendar 2/3 | planner 1/3. -->
<script lang="ts">
	let { data } = $props();
</script>

<main style="padding: 40px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start">
	<h1>Hi {data.user?.displayName}</h1>
	<p class="muted">Logged in. Calendar comes in step 5.</p>
	<form method="post" action="/logout"><button class="btn">Sign out</button></form>
</main>
