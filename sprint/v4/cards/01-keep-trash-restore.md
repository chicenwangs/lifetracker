# Card 01 · fix: Keep trash Restore 404

- Source: BREAKDOWN PR 1 (lines 10–14) · PLAN §5 item 8, §6 v3.2 row 0, §8 PR 1 · DESIGN §0 (undo toast), §3 (states) · decisions D-V4-02 · no board (`wireframes/v4/index.html` covers v3.3 + v4.0 only)
- Needs: — · Size: S · Branch: `v4/01-keep-trash-restore`

## What

A note in Keep Trash must come back with Restore. The old bug: `PATCH /api/keep/notes/:id {trashed:false}` returned 404 because the shared access check hides rows with `deleted_at` set. #244 already fixed the route (`level()` / `need()` untouched); this card delivers the missing regression tests (API, desktop, phone) and keeps the docs true. No behaviour change (D-V4-02).

Owner decisions that apply: none. D-V4-02 sets the scope: route fix kept, tests + doc cleanup only, restore stays owner-only.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 Owner path (API): a trashed note is restored by `PATCH /api/keep/notes/:id {trashed:false}`; it returns 200 with `trashed === false`, leaves `scope=trash` and is back in the active list (`keep.list(me)`).
- C2 Permission (API, not a unit test — the rule is in the route): the same PATCH from another user, and from a user the note is shared with, returns 404 `not_found`; the owner's note stays in Trash. Only the note's owner can restore (`app/src/routes/api/keep/notes/[id]/+server.ts:22-27`).
- C3 Desktop e2e: `/keep` → delete a note → `/keep?scope=trash` → Restore → Trash shows "Trash is empty." and the note is visible again on `/keep`. New titled test in `app/tests/e2e/v4/01-keep-restore.spec.ts` (the existing `flow.spec.ts:837` step stays green but does not carry this id).
- C4 Undo: after Restore the "Restored" toast offers Undo; Undo sends `{trashed:true}` and puts the note back in Trash.
- C5 `app/src/lib/server/repo/shares.ts` (`level()` / `need()`) is not changed (diff check); trashed notes still 404 on read/edit paths, and a restored note is editable again (asserted after C1).
- C6 Phone path: `/keep?scope=trash` at 412×915 shows Restore and Delete forever at ≥ 48 dp; tap Restore → the note is back in the active list; `noDesktopHints` passes. Nothing opens a layer on this path, so there is no Back-closes-a-layer clause (D-V4-02).
- C7 States: empty Trash shows "Trash is empty." with no Restore. The only UI path to a Restore is the owner's own note, so a refused restore cannot be produced in the UI; the 404 is asserted at API level (C2). The page is server-rendered, so no loading skeleton is added.
- C8 Docs: `AGENTS.md` §Known issues lists three items (graph sigma at line 72, theme midnight hazard at 73, stale service worker at 74) and none is Keep restore, so nothing is removed there; `CLAUDE.md` carries no Keep-restore line. `docs/BUILD-NOTES.md` and `docs/v2/FEATURES.md` gain one sentence: "Restore from Trash works" (BREAKDOWN PR 1, D-V4-02). No issue number is cited as evidence (#364 is a docs issue, not a QA record).

## Out of scope

- Changing `level()` / `need()` or any other access path (`PLAN.md` §5.8: v4 adds more restore paths, so the shared check stays strict).
- The 30-day purge, Delete forever, archive/restore (already work).
- Shared-note restore by a non-owner (D-V4-02: owner-only, 404).

## Files likely touched

- `app/src/routes/api/keep/notes/[id]/+server.ts` (the #244 fix is at lines 22–27)
- `app/src/lib/server/repo/keep.ts` (`update()` handles `trashed`; `get()`/`own()` accept trashed rows)
- `app/src/lib/server/repo/shares.ts` (read-only: must not change)
- `app/src/routes/keep/+page.svelte` (Restore at lines 338 and 434; `quick()` at line 136)
- `app/tests/unit/keep.test.ts` (KEEP-010 restore; repo level only)
- `app/tests/e2e/v4/01-keep-restore.spec.ts` (new; C1–C4; `app/tests/e2e/v4/` is a new directory)
- `app/tests/e2e/flow.spec.ts` (read-only: line 837 stays green)
- `app/tests/e2e/phone/keep.spec.ts` (no trash/restore test today)
- `app/tests/e2e/phone/helpers.ts` (`noDesktopHints`, `expectTargets48`, `signIn`)
- `app/tests/e2e/phone/targets48-allowlist.json` (only if a 48 dp gap is real and accepted)

## Tests

- Builder: unit only where the rule is repo-level (`keep.update` restore; `keep.get` accepts a trashed row) in `app/tests/unit/keep.test.ts`; C1–C4 in `app/tests/e2e/v4/01-keep-restore.spec.ts` (C2's second user uses the open-signup flow of `flow.spec.ts:581-604`, because vitest has no route harness); C6 in `app/tests/e2e/phone/keep.spec.ts`.
- Blind (tester, from Done when only): `app/tests/e2e/v4/01-blind.spec.ts`, `app/tests/e2e/phone/v4-01-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md`, `AGENTS.md` §Known issues, `CLAUDE.md` (only if a line changes — C8 shows the Known issues list does not).

## Decided

- Decided: D-V4-02 — keep the route fix (#244, code wins); this card delivers regression tests + doc cleanup only, no behaviour change; restore stays owner-only (another user gets 404).
