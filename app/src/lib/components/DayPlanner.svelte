<!-- custom. props: date, lanes[{calendarId, name, blocks[], editable}], dueToday[], tz.
 grid 00-24, hour 48px, scroll to 07:00 on mount, now line every 60s, prev/next/Today.
 blocks per lane: clipBlockToDay -> pieces ; column pack overlaps.
 pointer: empty drag -> create ; body -> move ; 6px edges -> resize ; snap15 ; optimistic ; pointerup PATCH ; error revert.
 drop 'application/x-lt-item' -> POST block 60m.
 keys: focus block, arrows ±15m move, shift+arrows resize.
 lanes: OFF 1 ; ON me + up to 2 more, extras packed in lane 3.
 P3: both-free band 08-22 gaps >= 60m. -->
<script lang="ts">
	// PSEUDO only. Phase 1 builds.
</script>
