<!-- Item peek: centre panel on desktop, the shared phone bottom sheet on phone (#92). Close = Esc, backdrop, ×, Back. -->
<script lang="ts">
	import ItemView from './ItemView.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { calendarChanged } from '$lib/client/bus.svelte';
	import { backClosesEntry } from '$lib/client/layers';
	import { closePeekEntry } from '$lib/client/peek.svelte';

	let { id, origin, onclose }: { id: string; origin?: { x: number; y: number }; onclose: () => void } =
		$props();
</script>

<!-- Card 09 SHOULD 3: the peek's /item/<id> entry is the layer's entry too, so Back closes the sheet
     first without a second history entry. The BottomSheet keeps `back={false}`. -->
<div use:backClosesEntry={closePeekEntry}>
	<BottomSheet label="Item" {origin} intro="grow" back={false} {onclose}>
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
</div>
