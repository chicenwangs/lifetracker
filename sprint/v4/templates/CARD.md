# Card NN · <type>: <title>

- Source: BREAKDOWN PR NN · PLAN §<n> · DESIGN §<n> (boards <ids>) · decisions <O-x, D-V4-x>
- Needs: <card ids or —> · Size: S | M | L · Branch: `v4/NN-<slug>`

## What

One short paragraph: the user-visible change and why.

## Done when

Each line is observable and testable. Tests are titled with the id (`C1 ...`).

- C1 ...
- C2 ...
- Cn Phone path: ... (≥ 48 dp, BottomSheet, Back closes it, no Ctrl/Click copy)
- Cn Undo: ... (every mutation has an undo entry)
- Cn States: empty / error / loading as DESIGN §3

## Out of scope

- ...

## Files likely touched

- `app/src/...` (real paths, checked to exist)

## Tests

- Builder: unit ..., e2e desktop `tests/e2e/...`, phone `tests/e2e/phone/...`
- Blind (tester, from Done when only): `tests/e2e/v4/NN-blind.spec.ts`, `tests/e2e/phone/v4-NN-blind.spec.ts`, `tests/unit/v4-NN-blind.test.ts`

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (+ others if behaviour they describe changes)

## Open questions

- (planner lists them; MAIN replaces each with "Decided: D-V4-xx ...")
