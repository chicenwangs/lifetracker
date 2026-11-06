<!-- FullCalendar dayGridMonth, firstDay 1, dayMaxEvents 4. events from props via time.itemToFc.
 eventContent -> mount ItemChip. editable per event.
 eventDrop -> PATCH {date} keep time ; fail revert ; ok -> UndoToast(5s, patch back)
 eventDragStop: if pointer inside planner rect -> y -> time -> POST block 60m linked
 eventClick own -> goto /item/id ; theirs -> read-only card popover
 refetch on overlap toggle, window focus, every 60s -->
<script lang="ts">
  // PSEUDO only. Phase 1 builds.
</script>
