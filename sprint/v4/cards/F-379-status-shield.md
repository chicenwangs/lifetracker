# Card F-379 · fix: tap shield around Today status squares (issue #379)

- Source: GitHub issue #379 (S2, phone web) · SPRINT §6 fix-card rule (branch `v4/fix-<issue>`) · no BREAKDOWN PR / PLAN / DESIGN section (a QA bug, not a planned feature); DESIGN §3 for the states line · decisions: D-V4-40 · no wireframe board
- Needs: F-378 (the shared shield) · Size: S · Branch: `v4/fix-379`

## What

On Today, three taps on a row's status square 20–60 ms apart change the tapped row once, but the list re-renders after the first toggle and the later taps land on a different row's status square, changing an unrelated item (issue #379). This card reuses F-378's shield: `cycleRow()` raises it before the `/cycle` POST and holds it for 250 ms from that raise; there is no second arm after the refresh, so a burst yields one transition. Today's optimistic `over[id]` still shows the first step immediately. No server route or access check changes.

Owner decisions that apply: none.

## Done when

Tests are titled with the id (`C1 ...`) in the spec.

- C1 One transition per burst (phone 412×915, `phone` project): Today with two own rows (unique titles; the target starts `todo`), tap the target's status square 3× 20–60 ms apart. The target goes `todo → doing` exactly once and is not `done`; a read after the burst shows `doing`.
- C2 No unrelated row changes: the other row's status is unchanged (API and UI), no toast names its title (`Not started: "…"`, `Started: "…"`, `Done: "…"`), and its status square is not focused/activated.
- C3 One request: the burst sends exactly one `POST /api/{items|blocks}/<target>/cycle` (request listener); no `/cycle` for any other row and no queued PATCH.
- C4 Shield, then release: a tap at 200 ms after the first does nothing; after ~300 ms (the release probe) the same square advances again (`doing → done`), proving the UI responds and the shield released by itself. No visible overlay or copy.
- C5 Undo (separate test, target starts `todo`): after the first transition and after the shield expires, the toast Undo restores the target to `todo` and the list shows it; the Undo button is reachable and no `Ctrl+Z` wording appears on phone (`noDesktopHints`).
- C6 Phone path: status squares keep the touch hit area ≥ 48 dp (`StatusSquare.svelte:109-115`) and the row's ⋯ path still works; no new sheet/layer, Back unchanged; `noDesktopHints` passes on Today.
- C7 States: empty Today shows "Nothing planned." and no square, so the shield never raises (`app/src/routes/today/+page.svelte:320-326`). A failed cycle shows the existing error toast (`role="alert"`), clears the optimistic `over[id]` (`:101`) and leaves every row at its server status; no other row changes. Loading stays the server-rendered list — no skeleton added (DESIGN §3, existing screen).
- C8 Other callers: Home `/` (`+page.svelte:68,77`) and `ItemView.svelte:247` use the same `cycleRow`; a tick there still commits once, and the item sheet's `onResult`/`follow()` runs before the refresh (contract at `rowOps.ts:47-57`). A tick in the open item sheet does not leave it unclickable after the shield — a deliberate second tap after ~300 ms works.
- C9 Permission/sharing: no server change; partner (`theirs`) rows still show no status square and no ⋯ on Today (`rowOf()` at `app/src/routes/today/+page.svelte:106-109`), so a shared row cannot be cycled before or after the shield.
- C10 Desktop: a single click on a status square still cycles once and the toast Undo path works; the diff adds no desktop-specific UI or copy. (If the shield turns out touch-only, desktop is simply untouched; see F-378's scope question.)

## Out of scope

- Server/API changes; the `/cycle` route and every access check.
- Swipe/`toggleDone` and row-gesture bursts (the bug is the status square). `rowGestures.ts` stays as is.
- Adding Undo where none exists; #310 (status-square Undo) is closed.
- Redesigning the optimistic status or the list animation; only the burst is guarded.
- Week/Month/Keep list layout changes.

## Files likely touched

- `app/src/lib/client/tapShield.ts` (from F-378: reuse, no copy)
- `app/src/lib/client/rowOps.ts` (`cycleRow` at 47–76: raise before `post`; no re-arm after `refresh`)
- `app/src/routes/today/+page.svelte` (`over` at 86, `statusOf()` 93–96, `cycle()` 97–102)
- `app/src/lib/components/StatusSquare.svelte` (read-only: click handler 30–37; no change expected)
- `app/src/routes/+page.svelte` (read-only: shared `cycleRow` callers at 68 and 77)
- `app/src/lib/components/ItemView.svelte` (read-only: `cycleRow` at 247)
- `app/tests/e2e/phone/v4-fix-379.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)
- `app/playwright.config.ts` (read-only: `phone` / `phone-landscape` projects)

## Tests

- Builder: `app/tests/e2e/phone/v4-fix-379.spec.ts` for C1–C10. Run the coordinate burst in the `phone` project; `phone-landscape` keeps the one-transition/no-unrelated-change checks (row positions differ). No unit test: the shield is DOM-only (`app/vite.config.ts:8`) and `cycleRow` needs a fetch + DOM.
- Blind (tester, from Done when only): `app/tests/e2e/phone/v4-fix-379-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md` one line under the v4.0.0 section: rapid taps on a status square no longer change another row. `docs/v2/FEATURES.md` unchanged — one tap = one change is already the rule.

## Decided

- Decided: D-V4-40 — every `cycleRow` caller (Home, Today, ItemView) uses the shared helper; touch/coarse only, Undo toast exempt, 250 ms; a deliberate double-tap inside 250 ms counts once.
