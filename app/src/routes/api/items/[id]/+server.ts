// PSEUDO: PATCH: access = accessFor ; owner -> ownerSchema ; edit grantee -> granteePatchSchema ; set updated_by. DELETE owner only -> softDelete
// pattern: me = locals.user ; body = schema.strict().parse ; result = repo.x(me, ...) ; null -> 404 ; json(result)
