# Card 02 · fix: Android (phone) desktop-word hints

- Source: BREAKDOWN PR 2 (lines 16–19) · PLAN §5 item 8, §8 PR 2 · DESIGN §0 ("Phone copy: Tap, never Click. No key hints on phone.") · decisions D-V4-03, D-V4-15 · no board
- Needs: — · Size: S · Branch: `v4/02-android-hints`

## What

The phone (and the Android WebView) must never show or read out desktop wording: `Ctrl`, `Click`, `Esc`, `PC view`, `+ Add N`, "Press N". Sweep every phone surface — tabs, sheets, the item sheet and QuickAdd — and render keyboard hints only for `pointer: fine`. Copy-only: nothing new is stored or mutated.

Owner decisions that apply: none. D-V4-03 (scope, `pointer: fine`) and D-V4-15 (QuickAdd hints, coarse-pointer test, regex) settle the questions.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `noDesktopHints` passes (zero hits) in the `phone` projects on `/`, `/today`, `/week`, `/month`, `/keep`, `/keep?scope=trash`, `/pages` with at least one page, a page `/pages/[id]` with the editor open, `/item/[id]`, `/more` and every `/settings/*` page. The page and item are created in `beforeAll` through the API (the `smoke.spec.ts` pattern: `POST /api/pages`, `POST /api/quickadd`), so the test needs no data from another spec.
- C2 The same holds with these layers open: the Add sheet, the item sheet (`ItemPeek` → `ItemView`), the page ⋯ menu, the `/` slash menu, and the search palette.
- C3 No visible text, `aria-label`, `aria-description` or `title` in C1–C2 matches the helper rule after it is widened to `\b(ctrl|click|esc)\b|double-click|right-click|pc view` (`noDesktopHints` in `app/tests/e2e/phone/helpers.ts`), so TalkBack reads nothing desktop-only.
- C4 Keyboard hints are shown only for a fine pointer. In a 900×700 context with `hasTouch: true` (coarse pointer) the header search hint, QuickAdd's footer (`Enter` / `/` / `Esc`), QuickAdd's `N` shortcut, and the palette/slash footers are hidden or absent (`checkVisibility` false) and absent from `title`/`aria-label`. QuickAdd must not open on `N` in that context (`QuickAdd.svelte:225-233,317-320`; `AppHeader.svelte:154` renders QuickAdd on every screen, so the gate is `pointer: fine`, never the width).
- C5 Desktop unchanged at 1440×900 (fine pointer): the search hint, the Add hint and the menu footers are still shown and read as today.
- C6 Phone path: the `phone` (412×915) and `phone-landscape` (915×412) projects run C1–C3; the 900×700 coarse context runs C4; Back closes the top layer first; every control the sweep touches stays ≥ 48 dp (`expectTargets48`).
- C7 No data or behaviour change: no mutation, so no undo entry is created or lost.
- C8 States: no new screen. `Tip: Ctrl+K …` in `app/src/routes/pages/+page.svelte:18` is gated with the other hints. The empty-Pages state is not separately e2e-tested: on the shared e2e DB at least one page exists before the sweep (D-V4-03), so `/pages` has no reachable empty list.

## Out of scope

- Real-device / emulator checks: `SPRINT.md` §1.4 forbids installing the APK. Android is a WebView over the same CSS and is covered by the phone projects.
- Changing any keyboard shortcut, the desktop help page, or the desktop `?` shortcuts panel contents (a shortcut stays a shortcut).
- Native Android shell strings: none exist under `mobile/android/app/src/main`; if one appears, it is a separate card.
- `KeepNote.svelte`'s desktop Close (`title="Esc"`, line 718): it is `display:none` on phone (`KeepNote.svelte:1150`), so it is not a phone hint and does not change.

## Files likely touched

- `app/src/lib/components/AppHeader.svelte` (`Search Ctrl+K` at line 152, `KEYS` panel at 255, phone CSS at 523–605)
- `app/src/lib/components/CommandPalette.svelte` (footer at line 216, already hidden when `phone`)
- `app/src/lib/components/QuickAdd.svelte` (`N` opener at 225–233, footer at 317–320; no phone CSS today)
- `app/src/lib/components/ItemView.svelte` (`title="Close (Esc)"` at line 510)
- `app/src/lib/components/ItemPeek.svelte` (the phone item sheet that wraps `ItemView`)
- `app/src/lib/components/CommandInput.svelte` (Esc handling at 143–149, if copy is added)
- `app/src/lib/editor/SlashMenu.svelte` (keys footer at line 41, phone CSS at 88–92)
- `app/src/lib/editor/PageEditor.svelte` (`(Ctrl+B/I/U)` titles at 270–286)
- `app/src/routes/pages/+page.svelte` (`Tip: Ctrl+K …` at line 18)
- `app/src/lib/client/phone.ts` (`isPhone()`), `app/src/routes/settings/help/+page.svelte` (already has phone copy at 47–56)
- `app/tests/e2e/phone/smoke.spec.ts` (tab loop, lines 44–58), `app/tests/e2e/phone/pages.spec.ts`, `app/tests/e2e/phone/itemsheet.spec.ts`, `app/tests/e2e/phone/helpers.ts`
- `app/tests/e2e/v4/02-hints-coarse.spec.ts` (new; 900×700 `hasTouch`), `app/tests/e2e/v4/02-hints-desktop.spec.ts` (new; C5) — `app/tests/e2e/v4/` is a new directory

## Tests

- Builder: extend `app/tests/e2e/phone/smoke.spec.ts` with C2's layers and the `/item/[id]` state (item via `POST /api/quickadd` in `beforeAll`); widen the helper regex; `app/tests/e2e/v4/02-hints-coarse.spec.ts` for C4; `app/tests/e2e/v4/02-hints-desktop.spec.ts` for C5.
- Blind (tester, from Done when only): `app/tests/e2e/phone/v4-02-blind.spec.ts`, `app/tests/e2e/v4/02-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md` (one line: hints only for a fine pointer). The phone-copy rule lives in `AGENTS.md` §Product facts and DESIGN §0, not in `docs/v2/FEATURES.md`; `AGENTS.md` §Known issues and `CLAUDE.md` only if a line changes.

## Decided

- Decided: D-V4-03 — close on tests + docs staying clean (the BREAKDOWN "Known issue 3" line is stale); hints gated on `pointer: fine`; the sweep covers the main tabs plus every sheet/layer listed in C2; keep the "Android" title and note the WebView coverage.
- Decided: D-V4-15 — gate QuickAdd's footer hints and the `N` shortcut off on phone (the old premise that its opener was hidden was false); test coarse pointer with a 900×700 `hasTouch: true` context; widen the hint regex to `double-click`/`right-click`.
