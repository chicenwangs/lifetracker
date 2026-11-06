# repo layer

ALL SQL + ALL scoping lives here. Routes call repo only. Never accept owner_id/calendar_id/created_by/updated_by from client.
Not yours = return null -> route throws 404 (never 403, never reveal).
Every create/update/delete of searchable rows calls search.upsertFts/deleteFts.
