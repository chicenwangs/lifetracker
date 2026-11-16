<!-- Item peek: centre panel on desktop, the shared phone bottom sheet on phone (#92). Close = Esc, backdrop, ×, Back. -->
<script lang="ts">
	import ItemView from './ItemView.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { calendarChanged } from '$lib/client/bus.svelte';

	let { id, origin, onclose }: { id: string; origin?: { x: number; y: number }; onclose: () => void } =
		$props();
</script>

<BottomSheet label="Item" {origin} intro="grow" {onclose}>
	{#key id}<ItemView
			{id}
			peek
			{onclose}
			onchanged={calendarChanged}
			ondeleted={() => {
				calendarChanged();
				onclose();
			}}
		/>{/key}
</BottomSheet>
