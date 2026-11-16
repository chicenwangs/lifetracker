# Mobile overhaul sprint — tracker

Caveman doc. Started 2026-11-16. Parent: [#106](https://github.com/chicenwangs/lifetracker/issues/106) (guidelines G1–G14, audit, DECISIONS). Decisions are final — don't re-ask.
One branch + one PR per issue, off `main`, into `main`. Desktop stays as it is.

## Dev setup (once)

- `cd app && npm run db:seed:phone` → `data/phone-dev.db` + login in `data/TEST-LOGIN.txt` (both gitignored). Reseed = delete the db first.
- Preview: `.claude/launch.json` entry `mobile-dev` (port 5176, that db). Local only, not committed.
- Phone e2e: `npm run test:e2e:phone` (projects `phone` 412×915, `phone-landscape` 915×412). Tests in `tests/e2e/phone/`.
- Helpers (`tests/e2e/phone/helpers.ts`): `swipe`, `longPress` (real CDP touch), `expectTappable` (tap lands; catches clipping), `expectTargets48` (+ `targets48-allowlist.json`), `noDesktopHints`.
- Shots: preview running, then (in `app/`) `node scripts/phone-shots.mjs [--out test-results/phone-after]`. Baseline = `test-results/phone-baseline/` (gitignored, 2026-11-16); e2e artifacts go to `test-results/run/`, so a test run keeps it. Landscape Add sheet = desktop layout until #110, so its shot shows the screen under it.
- `test.fixme` in `smoke.spec.ts` = checks waiting on an issue. Turn them on when it lands.

## Status

| Group          | #         | Issue                                                                    | State                                      | PR   |
| -------------- | --------- | ------------------------------------------------------------------------ | ------------------------------------------ | ---- |
| setup          | —         | Dev setup: seed, phone projects, helpers, shots, this doc                | DONE 2026-11-16                            | #119 |
| 1 foundation   | #92       | One bottom sheet — handle, swipe down, Back, half then full              | DONE 2026-11-16                            | #122 |
| 1 foundation   | #91       | Android Back closes the top layer + predictive back                      | DONE 2026-11-16 (real-phone check owed)    | #123 |
| 1 foundation   | #88       | Tab bar Today · Calendar · + · Keep · Pages; More → account sheet        | DONE 2026-11-16                            | #124 |
| 1 foundation   | #89       | Top app bar with Back + title on deeper screens                          | DONE 2026-11-16                            | #125 |
| 1 foundation   | #90       | Instant tab switch — keep state, fade-through, no load-in                | DONE 2026-11-16 (cache-first data = #105)  | #126 |
| 1 foundation   | #101      | 48 dp targets + thumb zone (empty the allowlist)                         | DONE 2026-11-16                            | #127 |
| 1 foundation   | #111      | Undo toast above the bottom bar                                          | DONE 2026-11-16                            | #128 |
| 1 foundation   | #109      | In-app dialogs instead of confirm / prompt                               | DONE 2026-11-16                            | #129 |
| 1 foundation   | #118      | Sheets and inputs above the keyboard                                     | DONE 2026-11-16 (real-keyboard check owed) | #130 |
| 1 foundation   | #110      | Phone layout in landscape (turns on landscape smoke)                     | DONE 2026-11-16                            | #131 |
| 2 interactions | #93       | + adds the right thing per tab, grows into the sheet                     | DONE 2026-11-16                            | #133 |
| 2 interactions | #94       | Today date strip; days slide with the finger                             | DONE 2026-11-16                            | #134 |
| 2 interactions | #95       | Calendar tab: Week + Month, swipe periods, day agenda                    | DONE 2026-11-17                            | #135 |
| 2 interactions | #96       | Hold to pick up; row swipe done / delete + Undo                          | DONE 2026-11-17                            | #136 |
| 2 interactions | #97       | Keep: hold to drag, hold to select, swipe to archive                     | DONE 2026-11-17                            | #137 |
| 2 interactions | #102      | Native haptics (needs real phone)                                        | DONE 2026-11-16                            | #132 |
| 3 screens      | #98       | Pages list + editor for phone, toolbar above keyboard                    | DONE 2026-11-17                            | #138 |
| 3 screens      | #99       | Full-screen touch search                                                 | DONE 2026-11-17                            | #139 |
| 3 screens      | #100      | Settings as a list of sections                                           | DONE 2026-11-17                            | #140 |
| 3 screens      | #103      | Pull to refresh                                                          | DONE 2026-11-17                            | #141 |
| 3 screens      | #107      | Keep note editor: icon toolbar + overflow                                | DONE 2026-11-17                            | #142 |
| 3 screens      | #108      | Item opens as a phone sheet                                              | DONE 2026-11-17                            | #143 |
| 3 screens      | #115      | Touch wording + phone help (turns on wording checks)                     | DONE 2026-11-17                            | #144 |
| 4 polish       | #104      | Teach each gesture once                                                  | DONE 2026-11-17                            | #147 |
| 4 polish       | #84 / #83 | Phone onboarding tour                                                    | DONE 2026-11-17                            | #148 |
| 4 polish       | #105      | Open instantly offline (owner 2026-11-17: server wins, latest edit wins) | todo                                       |      |
| 4 polish       | #112      | Notification Done / Snooze (needs real phone)                            | todo                                       |      |
| 4 polish       | #113      | Refresh on resume                                                        | DONE 2026-11-17                            | #145 |
| 4 polish       | #114      | System bars follow theme, screen edges (needs real phone)                | todo                                       |      |
| 4 polish       | #116      | Text sizes + system font size                                            | DONE 2026-11-17                            | #146 |
| 4 polish       | #117      | App shortcuts + share target (needs real phone)                          | PR open                                    |      |

Mark a row DONE (date + PR) when merged.

## Done per issue

- [ ] `npm run lint` + `npm run check` + `npm run test:unit` green
- [ ] desktop e2e (`npm run test:e2e`) green — v1 regression too
- [ ] phone e2e (`npm run test:e2e:phone`) green; fixme for this issue turned on
- [ ] phone shots before/after in the PR (`scripts/phone-shots.mjs`)
- [ ] every gesture has a tap path + a TalkBack action
- [ ] popups and menus in changed containers pass `expectTappable` (toBeVisible misses clipping)
- [ ] desktop unchanged (shots or e2e prove it)
- [ ] Android-only items marked "needs real phone" in the PR
- [ ] this table row filled
