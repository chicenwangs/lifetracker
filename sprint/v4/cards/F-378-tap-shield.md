# Card F-378 · fix: tap shield after the Add sheet (issue #378)

- Source: GitHub issue #378 (S2, phone web) · SPRINT §6 fix-card rule (branch `v4/fix-<issue>`) · no BREAKDOWN PR / PLAN / DESIGN section (a QA bug, not a planned feature); DESIGN §3 for the states line · decisions: D-V4-39 · no wireframe board
- Needs: — · Size: S · Branch: `v4/fix-378`

## What

On the phone, three taps on "Save note" 20–60 ms apart create one note, but the later taps hit the Today row revealed when the sheet closes: the row's action bar opens and an unrelated item is soft-deleted (issue #378). The suspected cause is `saveNote()` in `MobileAdd.svelte` closing the sheet (line 79) with nothing to absorb the rest of the tap sequence. This card adds one small shared tap shield in `app/src/lib/client/tapShield.ts` that absorbs stray pointer input for 250 ms after the Add sheet closes, raised from the sheet's `close()` (the path `saveNote()` uses). No server route or access rule changes.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`) in the spec.

- C1 One note per burst (phone 412×915, `phone` project): open Today, Add → Quick note, type a unique note, tap "Save note" 3× 20–60 ms apart at the same screen point. Exactly one note with that text exists afterwards (`GET /api/keep/notes?scope=active&q=<unique>` returns one; a second identical note fails). The sheet is closed after the first tap.
- C2 No unrelated row changes: snapshot every own item/block on Today before the burst (id, status, date, time). After the burst every row still exists with the same values; the only change is the one new note. No toast names another row's title (`Deleted "…"`, `Not started: "…"`, `Started: "…"`, `Done: "…"`), and no action sheet is open.
- C3 Shield, then release: during the burst and a tap at 200 ms after Save, no row underneath activates — no action sheet, no status change, no navigation. After ~300 ms (the release probe), a tap on the underlying row's ⋯ opens its action sheet. The shield is invisible (no overlay, no copy) and releases by itself; it is not a permanent blocker.
- C4 One submission = one object: the burst sends exactly one `POST /api/keep/notes` (request listener) and the new note count is +1, not +2/+3. The existing `busy` guard (Save disabled while posting, `MobileAdd.svelte:147`) still covers taps that arrive before the close.
- C5 Phone path: the Add sheet stays the shared `BottomSheet`; "Save note" and "Close" stay ≥ 48 dp; Back closes the sheet before the page (`use:backCloses`); `noDesktopHints` passes on Today and the open sheet. The shield adds no visible element and no new copy (DESIGN §0).
- C6 Undo: after the shield expires, a deliberate Delete of the unrelated Today row (swipe left or ⋯ → Delete) shows the usual Undo toast and Undo restores it — the fix does not break the existing undo path. Note creation itself has no Undo entry today (`POST /api/keep/notes` is not journaled; `saveNote()` shows "Note saved" with no Undo), so this card does not claim one; see Decided.
- C7 States: empty note keeps "Save note" disabled and creates nothing (no shield needed). A failed save keeps the text in the box, shows the existing error toast (`role="alert"`, `MobileAdd.svelte:94`), leaves the sheet open and creates no note. A queued offline save still closes with "Note saved · Waiting to sync" (`:90-92`). The shield adds no loading or empty state.
- C8 Permission/sharing: the diff changes no server route and no `level()`/`need()` call. The note is created in the signed-in user's own Keep; partner rows (`theirs`) on Today still have no status square and no ⋯ (`app/src/routes/today/+page.svelte:284-288`, `rowOf()` at 106-109). No shared row becomes editable through the shield.

## Out of scope

- Any server/API change, including adding Undo for note creation (see Decided).
- The Add sheet's Plan tab (it keeps the sheet open on success; no close = no shield needed).
- Other sheets/close paths outside the Add sheet. The shield module is shared so F-379 can reuse it; this card wires only the Add sheet.
- Desktop quick add (`QuickAdd.svelte`) and desktop pointer behaviour (see the touch-only question).
- `StatusSquare` / `rowOps` changes (F-379 owns the status-square burst).
- #310 (status-square Undo, closed) and any other QA issue.

## Files likely touched

- `app/src/lib/client/tapShield.ts` (new: one `raiseShield(ms = 250)` plus a capture-phase listener; client-only, no Svelte state)
- `app/src/lib/components/MobileAdd.svelte` (`close()` at 30–33, `saveNote()` at 71–98; raise the shield in `close()` before the sheet unmounts)
- `app/src/lib/components/BottomSheet.svelte` (read-only: `onclose` calls `MobileAdd.close`; only touched if the shield is raised centrally instead — prefer read-only)
- `app/src/routes/today/+page.svelte` (read-only: the row/action-bar path under the sheet; no change)
- `app/tests/e2e/phone/v4-fix-378.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (`signIn`, `finger`, `swipe`, `noDesktopHints`, `expectTargets48`; read-only)
- `app/playwright.config.ts` (read-only: `phone` / `phone-landscape` projects)

## Tests

- Builder: `app/tests/e2e/phone/v4-fix-378.spec.ts` for C1–C7. Run the coordinate burst in the `phone` project only (412×915); in `phone-landscape` run the no-regression checks (sheet closes, one note, no unrelated change) or skip the coordinate part like `status.spec.ts:24`. No unit test: the shield is DOM-only and vitest runs `environment: 'node'` (`app/vite.config.ts:6-9`).
- Blind (tester, from Done when only): `app/tests/e2e/phone/v4-fix-378-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md` one line under the v4.0.0 section: rapid taps after Save note no longer reach the row beneath. `docs/v2/FEATURES.md` unchanged — it already states one tap = one change; R1 writes the v4 section.

## Decided

- Decided: D-V4-39 — shield only (note creation keeps its pre-existing no-Undo; "Undo works" = a deliberate delete's Undo); touch/coarse pointers only, desktop unchanged; the Undo toast is exempt; the window is 250 ms.
