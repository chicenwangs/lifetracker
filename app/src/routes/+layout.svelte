<!-- root: import app.css. step 5+: if data.user -> AppHeader above children. -->
<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}
