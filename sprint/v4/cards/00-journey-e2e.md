# Card 00 · test: working-site journey (desktop + phone)

- Source: BOARD 00 · `.opencode/agents/v4-planner.md` line 14 · no BREAKDOWN PR, no PLAN/DESIGN section, no wireframe board
- Needs: — · Size: M · Branch: `v4/00-journey-e2e`

## What

Two end-to-end specs, one desktop and one phone, that use the app like a person: sign in, add a timed item, see it on Today and Week, create and edit a page, add a Keep note, search, and undo a delete. They run in every full gate, so a v4 change that breaks a basic path fails before merge.

Owner decisions that apply: none. D-V4-01 and D-V4-14 settle the test-only questions (sign-in, timed item, Undo path, `Saved` wait, alert selector).

## Done when

Tests are titled with the id (`C1 ...`) in the spec.

- C1 Desktop `tests/e2e/journey.spec.ts` signs in the way `tests/e2e/phone/helpers.ts` `signIn` does: `goto('/')`; if it lands on `/setup`, `#tk` = `e2e-setup-token-long-enough`, `#p`/`#cp` = the setup password; if `/login`, `#u` = `jeremy`, `#p` = that password; then click "Skip tour" if it is visible and land on Home `/`. It does not change `flow.spec.ts` (which keeps its fresh-DB `/setup` assumption) and does not add a second project or DB (D-V4-01).
- C2 Desktop: quick add a **timed** item dated today (`<unique title> today 3pm`; no `/calendar`, that is all-day); it is visible on `/today` (which lists only timed items, `app/src/routes/today/+page.svelte:67-68`) and on `/week` in its day.
- C3 Desktop: create a page, type a paragraph, wait until the page status reads `Saved` (autosave debounce is 600 ms, `PageEditor.svelte:136`; status at `app/src/routes/pages/[id]/+page.svelte:172`), reload; the text is still there.
- C4 Desktop: add a Keep note with a title and body on `/keep`; it shows in the list and survives a reload.
- C5 Desktop: search (`Ctrl+K` → `CommandPalette`) finds the item, the page and the note by the unique title; clicking a result opens the right screen.
- C6 Undo: open the C2 item in ItemView, press `Delete item`; it leaves `/today` and `/week` and the toast offers Undo; Undo restores it and it is back on both. Then delete a second item and press `Ctrl+Z`; it is back. (The QuickAdd log and the mobile Add toast have no Undo button; D-V4-14 names ItemView's delete as the journey's undo path.)
- C7 Phone `tests/e2e/phone/journey.spec.ts` walks the same path through the bottom bar: Add sheet → add the timed item, Today row, Week tab, Keep note, new page with typed text, search via the header magnifier, open the item sheet and `Delete item` → toast Undo restores it. Uses `signIn`, `bottomBar` and the shared helpers; Back closes the Add sheet before the page.
- C8 Phone path: every tap target the journey uses is ≥ 48 dp (`expectTargets48` on Today, Week, Keep, Pages and the open Add sheet) and `noDesktopHints` passes on every screen it opens.
- C9 Both specs take "today" from the running app (project timezone `Asia/Kuala_Lumpur`), use a per-run unique title, never a hard-coded date, and contain no `.only`, `skip` or `fixme`.
- C10 The desktop file runs in the `desktop` project only (`testIgnore: 'phone/**'`); the phone file runs in `phone` and `phone-landscape` (`app/playwright.config.ts:31-39`).
- C11 States: the walk depends on no data another spec created (it works on a fresh DB and on one other specs have used); each screen shows its normal or empty state (Today's "Nothing planned." is acceptable); no `[role=alert]` element appears at any point (error toasts set it; D-V4-14).

## Out of scope

- Any app code. This card only adds tests.
- Offline, sharing/permission checks, print, notifications, real Android device. `SPRINT.md` §1.4 forbids installing the APK.
- Error injection / network-failure states (a happy-path journey only).
- Changing `flow.spec.ts` or adding a second Playwright project/DB.

## Files likely touched

- `app/tests/e2e/journey.spec.ts` (new)
- `app/tests/e2e/phone/journey.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (`signIn`, `bottomBar`, `noDesktopHints`, `expectTargets48`)
- `app/tests/e2e/flow.spec.ts` (read-only: its `api()` helper and fresh-DB setup step are the patterns; the file itself does not change)
- `app/playwright.config.ts` (read-only: projects, `E2E_DIR`, timezone)
- `app/src/lib/editor/PageEditor.svelte` (read-only: 600 ms autosave)
- `app/src/lib/components/ItemView.svelte` (read-only: `Delete item` path the journey uses)

## Tests

- Builder: the two specs above; they are the deliverable.
- Blind (tester, from Done when only): none new — this card is itself test work. The tester reads the two specs against C1–C11 and runs them in the phone projects as the independent check.

## Docs

- None user-visible. No `docs/BUILD-NOTES.md` / `docs/v2/FEATURES.md` change.

## Decided

- Decided: D-V4-01 — sign-in handles both `/setup` and `/login` like `tests/e2e/phone/helpers.ts`; desktop asserts Home `/` and uses `/today` for the list-shaped checks; the spec creates a page, then edits it.
- Decided: D-V4-14 — the journey adds a timed item; Undo = delete the added item via ItemView and the toast restores it; sign-in handles `/setup` and `/login`; wait for `Saved`; assert no `[role=alert]`.
