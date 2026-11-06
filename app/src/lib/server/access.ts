// MOST IMPORTANT FILE (TECHNICAL §7). Server-only filtering. Client never sees hidden data.
// PSEUDO
// Access = {calendarId, ownerId, mine, permission:'owner'|'edit'|'view', visible:Set<TypeKey|'blocks'>, hiddenAs, color, ownerName}
//
// listAccess(me, {overlapOnly}):
//   own = my default calendar -> {permission:'owner', visible: ALL}
//   grants = WHERE grantee_id=me AND revoked_at IS NULL (AND in_overlap=1 if overlapOnly AND me.overlap_on)
//   return [own, ...grants.map(toAccess)]
//
// accessFor(me, calendarId) -> Access | throw 404
// assertCanWrite(me, calendarId) -> owner or edit grant else 404
//
// isItemVisible(item, a) = a.mine || (a.visible.has(item.type ?? 'None') && !item.private)
//
// filterItem(item, a, me):
//   a.mine -> full own DTO
//   visible -> {id,title,type,status,date,time,end_date, theirs:true, ownerColor, ownerInitial, editable: a.permission=='edit'}
//              NO notes, course_id, parent_id, steps, created_by, private
//   a.hiddenAs=='busy' -> {id: busyId(item.id, me), busy:true, title:'Busy', type:null, date, time, end_date}
//   else -> null (drop)
// busyId(id, me) = 'busy_' + hmac(id + me).slice(0,16)
//
// filterBlock(block, linkedItem|null, a, me):
//   a.mine -> full
//   vis = a.visible.has('blocks') && (!block.item_id || isItemVisible(linkedItem, a))
//   vis -> {id,label,type,start_at,end_at,status, item_id only if linkedItem visible, theirs, editable}
//   busy -> {id: busyId, busy:true, label:'Busy', start_at, end_at}   (no label/type/item_id)
//   else null
//
// granteePatchSchema = zod strict {title?, date?, time?, end_date?, status?}  (blocks: start_at?, end_at?, label?)
// writable(row, a): busy rows never ; must be visible ; a.permission in owner|edit
