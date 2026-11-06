// PSEUDO: POST {key} -> grant (generic errors, ratelimit)
// pattern: me = locals.user ; body = schema.strict().parse ; result = repo.x(me, ...) ; null -> 404 ; json(result)
