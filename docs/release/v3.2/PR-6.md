# PR 6 — feat: print week

- Desktop `/week` gets a ⋯ ("More actions") menu in the week bar with **Print week** → `window.print()`. The phone week agenda has no entry (it has no week bar).
- `@media print` on `/week`: hides the app header, phone nav, week nav/view/overlap controls, type bar, side column, foot hint and slot popup; white page, black ink; item/block colour only on the left edge of an event; blocks' status buttons/X hidden; `@page A4 landscape` with a slight zoom so the grid fits one page. The week title stays.
- Files: `app/src/routes/week/+page.svelte` · `app/tests/e2e/flow.spec.ts`.
- Tests: e2e (desktop): menu item calls print; `emulateMedia('print')` hides `header.hdr`/`nav.mbar` and keeps 7 visible day columns.
- Doc line that must change: `docs/BUILD-NOTES.md` — Week → Print week (desktop ⋯ menu).
