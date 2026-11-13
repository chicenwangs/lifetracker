<!-- The app mark (calendar + one time block). currentColor: white on dark, ink on light. Favicon = static/favicon.svg -->
<script lang="ts">
	let { size = 24, label = 'Life Tracker' }: { size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	role={label ? 'img' : undefined}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<rect x="4" y="6" width="24" height="22" rx="5" fill="none" stroke="currentColor" stroke-width="2.5" />
	<path d="M11 3.5v5M21 3.5v5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
	<rect x="9.5" y="14" width="13" height="8" rx="2.5" fill="currentColor" />
</svg>
