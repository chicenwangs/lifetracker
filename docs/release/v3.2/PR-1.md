# PR 1 — fix: Keep trash Restore 404

- User-visible: none in this PR. The Restore 404 was already fixed and shipped in v3.1.2 (#244: the PATCH route checks the owner via `keep.get()` before `need()`, because `level()` returns null for trashed rows).
- This PR adds the missing unit test: owner restores a trashed note; another user gets 404 and cannot restore it. `level()` is unchanged.
- Files: `app/tests/unit/keep.test.ts`.
- Tests: unit.
- Doc line that must change: none (the old "Keep Restore 404" known issue is already absent from `AGENTS.md`).
