# fix #414 (attempt 3) — the Save tap itself missed in CI landscape

- The CI dump from 9a9c2f0 said: `{url:/today, sheet:true, sheetOpen:true, note:"Save guard phone-landscape", saveDisabled:false, toast:null, active:"Add"}`. Sheet open, Save enabled and filled, no snackbar, yet no save → the raw CDP touch at the measured Save centre pressed nothing. Not reproducible locally (50+ runs, CPU-throttled, with and without a reminder snackbar); a CI-landscape-only input/layout quirk.
- Fix: press Save with `save.click()` — Playwright re-checks the button is the hit target at the click point and retries on a toast or layout shift. The two remaining burst touches stay real CDP touches at the same spot, and every guard assertion is unchanged (guard mounts, it covers the Save point, the burst does not reach the page, the toast says Note saved). The failure dump stays.
- The earlier snackbar fix (close a stray reminder toast, confirm the Save point) and the enabled check are kept: both are real hazards (a snackbar covered Save in landscape and its buttons snooze the reminder).
- Files: `app/tests/e2e/phone/plus.spec.ts`.
- Tests: phone `plus.spec.ts` full file on phone + phone-landscape, 2 repetitions (40 passed); `#378` alone 6 repetitions each project (12 passed); lint, svelte-check, unit 448.
- App hazard still open for LEAD: `UndoToast` (z-index 100) sits above a phone BottomSheet (80), so a tap meant for a sheet button can hit a snackbar action.
