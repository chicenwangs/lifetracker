# v4 QA contract

One opencode session (QA-MAIN) tests what the v4 build session merges, round after round, and files bugs as GitHub issues the build session fixes. Caveman rules. CLAUDE.md hard rules win over this file. Code wins over docs.
Builds on `docs/v3/QA-LOOP.md` (5 passes, emulator over CDP): that file's tool tips still apply.

## 0. Where things are

| What | Where |
|---|---|
| QA clone (QA-MAIN works here, read-only for code) | `C:\Users\Public\lt-v4\qa` |
| QA servers (production build, throwaway DBs) | 4401 new seed · 4402 v3.1.2 data x200 upgraded · 4403 empty (first run). Logins: `C:\Users\Public\lt-v4\qa-runs\env\ENV.md` |
| Your e2e port (test suites) | `E2E_PORT=4411` |
| Rounds | `C:\Users\Public\lt-v4\qa-runs\round-NNN\` (charters.md, parts\, findings.json, shots\, report.md) |
| Security details (never in git, never in issues) | `C:\Users\Public\lt-v4\qa-private\SEC-<round>-<n>.md` |
| QA progress (QA-MAIN only writes) | `C:\Users\Public\lt-v4\state\QA-PROGRESS.md` |
| Build session's state (read only) | `C:\Users\Public\lt-v4\state\PROGRESS.md`, `BOARD.md` |
| What "right" means | `docs/v4/PLAN.md` (§7 owner decisions), `docs/v4/BREAKDOWN.md`, `docs/v4/DESIGN.md` (§3 states), `sprint/v4/DECISIONS.md`, `sprint/v4/cards/`, `docs/v2/PRD.md` §12, `docs/v2/FEATURES.md`, `docs/v2/RELEASE-PARITY.md`, CLAUDE.md phone rules |

Environment: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Public\lt-v4\bin\qa-env.ps1 -Up | -Reset | -Status | -Down | -Emulator`.
Subagents: `qa4-scout` finds · `qa4-pentester` attacks · `qa4-repro` reproduces · `qa4-skeptic` challenges · `qa4-verifier` confirms the site works, verifies fixes, runs regression.

## 1. Hard rules (never)

1. Never touch `planner.jeremyjosh.org` (not even to compare), never `data/app.db`, never real data. Attacks only against 127.0.0.1:4401-4403.
2. Never edit code, commit, push, open PRs, or touch `C:\Users\Public\lt-v4\build`, `gate`, `v312`, `bin`. Never run `bin\gate.ps1` (it belongs to the build session).
3. Never install an APK any way except `qa-env.ps1 -Emulator`. Never on a real phone.
4. Never download or run tools from the internet. Use what is installed: node, Playwright, curl, PowerShell, adb, `npm audit`.
5. Never put exploit details in GitHub: the repo is public. Security issues are vague; details go to `qa-private\`.
6. Never invent. No evidence file = no finding. UI text comes from the DOM, a dump or a screenshot; code from the file (`path:line`).
7. Only touch issues QA opened (label `qa-loop`): create, comment, reopen. Never close or delete any issue, never edit others.
8. Leave the emulator and servers as found (font 1.0, wifi on, `qa-env -Down` only at the end of a round if asked to stop).

## 2. How good teams test (what each lens is built on)

- **Quality model:** ISO/IEC 25010 (functional suitability, usability/accessibility, reliability, performance, compatibility, security, maintainability).
- **Test design (ISTQB):** equivalence partitions, boundary values, decision tables, state transitions, pairwise combinations, error guessing.
- **Exploratory testing in charters (session-based test management):** each charter = one mission, one area, one timebox, notes + evidence. Product heuristic SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time). Oracles FEW HICCUPPS (History, Image, Comparable products, Claims = docs, User expectations, Product consistency, Purpose, Statutes = rules).
- **Risk-based order:** test where failure is likely x costly first (data loss, sharing/privacy, migrations, new v4 code).
- **Security:** threat model first (STRIDE), then OWASP WSTG test cases, OWASP ASVS 5.0 level 2 checks, OWASP Top 10 and API Security Top 10, MASVS basics for the app.
- **Accessibility:** WCAG 2.2 AA + Nielsen's 10 heuristics + CLAUDE.md phone rules.
- **Reliability:** fault injection (offline, slow network, server restart mid-action), concurrency, interruption.
- **Proof before filing:** reproduce twice on fresh data by someone else, try to disprove, dedupe, then file with a suggested regression test. Verify every fix after it merges (retest + regression).

## 3. Lenses (one per round, in this order, then repeat)

| # | Lens | Charter ideas (pick the riskiest first, never repeat a charter unchanged) |
|---|---|---|
| 1 | Functional vs spec | every v4 card's Done-when lines on the running build · DESIGN §3 states (empty, error, loading) · owner decisions O-1..O-12 · v3.1.2 features still work (RELEASE-PARITY) · desktop and phone |
| 2 | Break testing | huge / empty / whitespace / emoji / RTL / HTML / Markdown text everywhere · dates: midnight, DST, leap day, year end, end before start, time zone change · double submit, rapid taps, two tabs, two users on one page · reload / Back / offline in the middle of a save · undo chains and undo after reload · malformed and huge imports (Markdown, ICS) · big data on 4402 |
| 3 | Security / pentest | `qa4-pentester` (section 5) |
| 4 | Phone, accessibility, compatibility | 48 dp, Back closes the top layer, no Ctrl/Click/Esc text, BottomSheet · keyboard-only desktop, focus visible, labels, contrast, 320 px reflow, reduced motion · portrait + landscape, font 130 / 200 %, dark / light · Edge desktop (`channel: 'msedge'`) · the emulator app (`qa-env -Emulator`): Back, offline queue, resume, widgets on the QA server. Native-only things the emulator can't show go on the NEEDS_REAL_PHONE list in the report |
| 5 | Data, upgrade, performance | on 4402: every v3.1.2 record still there and correct after upgrade · round trips (Markdown export -> import, ICS export -> import, duplicate page) · budgets: each main screen usable < 2.5 s on 4402, common API calls < 500 ms, no memory growth over 50 navigations · server logs clean |
| 6 | Regression + fix verification | `qa4-verifier`: unit + all e2e projects on the QA clone (`E2E_PORT=4411`, `TZ=Asia/Kuala_Lumpur`), every closed `qa-loop` issue re-checked, flaky tests listed |

## 4. One round

1. **Setup.** `git -C C:\Users\Public\lt-v4\qa fetch`, `qa-env.ps1 -Up` (builds `origin/main`). Note the sha. Build fails = S1 issue, round ends.
2. **Working site.** `qa4-verifier` mode SITE on 4401 and 4402, desktop + phone (and the emulator app in lens 4): sign in, add an item, Today, Week, Month, a page, a database, Keep, search, undo, sign out. Result line `WORKING SITE: CONFIRMED at <sha7>` with screenshots, or an S1 issue. This happens every round, whatever the lens.
3. **Fix verification.** `qa4-verifier` mode FIXES: every `qa-loop` issue closed since the last round (`gh issue list --label qa-loop --state closed --search "closed:>=<last round date>"`). Fixed: comment `Verified fixed at <sha7> (QA round N)`. Not fixed: `gh issue reopen` + comment with new evidence.
4. **Charters.** QA-MAIN writes 4-8 charters for this round's lens in `charters.md`: mission, area, risk, oracle (doc line), timebox. New v4 code and recently merged cards first (`gh pr list --state merged --label v4.0 --limit 20`).
5. **Find.** One subagent per charter (`qa4-scout`, or `qa4-pentester` in lens 3), **one at a time** (they share the servers and the emulator). Each writes its own `parts\p1-<charter>.json` (ledger format in `docs/v3/QA-LOOP.md`), max 10 candidates, evidence files in `shots\`.
6. **Reproduce.** `qa-env.ps1 -Reset` (fresh DBs, same build). `qa4-repro`, never the finder: follow the written steps exactly, twice. Both show it = `reproduced`, else `rejected` with the reason.
7. **Challenge.** `qa4-skeptic`: try to prove each `reproduced` is not a bug (by design, owner decision, card, test-data artefact, flaky timing, emulator-only). Confirm only with a cited rule or doc line **and** a code cause `path:line`.
8. **Triage + file.** QA-MAIN merges same-cause findings, searches GitHub open + closed (`gh issue list --state all --search "<words>"`), sets severity (section 6), files `confirmed` ones, S1 first, max 12 per round (section 7).
9. **Report.** `round-NNN\report.md`: sha, lens, working-site line, fixes verified/reopened, counts per pass (found / reproduced / confirmed / rejected + reasons), issues filed, NEEDS_REAL_PHONE list. Update QA-PROGRESS (NOW line + entry). Next round, next lens.

## 5. Pentest lens (qa4-pentester)

Threat model first: list entry points (`app/src/routes/**/+server.ts`, form actions, `api/**`, uploads, imports, ICS feed, push, service worker), assets (other users' items/pages/notes, sessions, tokens), and STRIDE threats per entry point. Then test, with two users A and B on 4401 (create B as A in Settings > Users, or via /signup if open):
- **Access control (most important):** every API route and page id: can B read, change or delete A's item, page, block, note, attachment, database, reminder, share, template, ICS token by id? View-only share can't edit? Removed share loses access at once? Soft-deleted items stay private?
- **Auth + sessions:** login rate limit, user enumeration, cookie flags (HttpOnly, Secure when https, SameSite), session ends on sign-out and password change, setup token, signup rules, `next=` open redirect.
- **CSRF:** state-changing requests without / with a foreign `Origin` header.
- **XSS:** stored script in every text a user can enter (titles, blocks, callouts, toggles, mentions, DB properties, Keep notes, file names, Markdown import, ICS import fields, cover image URL), shown to the same and to another user; reflected via query params.
- **Injection:** search / FTS operators, SQL-ish input, path traversal in names, header injection.
- **Uploads + imports:** wrong type disguised (SVG/HTML as image), oversize, zip/Markdown bombs, deep nesting, huge ICS.
- **ICS export:** token entropy, revoke works, private items show only "Busy", no other users' items.
- **SSRF:** any server-side fetch of a user-given URL (grep `fetch(` under `app/src/lib/server`).
- **Headers + leaks:** CSP, frame-ancestors / X-Frame-Options, nosniff, Referrer-Policy; stack traces or paths in errors; secrets in the client bundle (`app\build\client`); private data in the service worker cache after sign-out; `npm audit --omit=dev` (high/critical only).
- **Abuse:** very large JSON bodies, many requests in a burst, slow requests.
Evidence = the exact request and response (headers + first lines of body). File exploitable findings S1/S2 even when they need a logged-in partner account.

## 6. Severity

- **S1:** data loss or corruption; another user's data readable or changeable; stored XSS; secret leak; site or app won't start, sign in or load a main screen; upgrade breaks v3.1.2 data.
- **S2:** a feature is broken with no workaround; a security weakness that needs special conditions; a crash on a common path.
- **S3:** works with a workaround; a rule broken (48 dp, copy, WCAG AA, phone rules); a performance budget missed.
- **S4:** cosmetic.

## 7. Filing

- Labels: `qa-loop`, the severity (`S1`..`S4`, create once with `gh label create S1 --color b60205` etc. if missing), and an area: `security`, `mobile`, `desktop`, `accessibility`, `performance`, `bug`.
- Title: `<Area>: <what is wrong> (<screen>)`. Security: `Security: <area> needs hardening (Sx)` only.
- Body: `Severity: Sx` · build sha · server (port + DB) · numbered minimal steps · expected (quote the doc line or decision id) · actual · evidence (file names in `qa-runs\round-NNN\`, request/response snippets) · cause `path:line` · `Reproduced 2/2 on fresh data by qa4-repro; checked by qa4-skeptic.` · suggested regression test (one line) · last line `<!-- qa-fp: <area>|<cause path:line>|<short title> -->`.
- Security body: severity, area, one vague sentence, then `Details: C:\Users\Public\lt-v4\qa-private\SEC-<round>-<n>.md (local file on the dev PC, never commit or paste it)`. The private file holds everything: steps, requests, responses, impact, fix idea.
- The build session reads `Severity:` from the label or the body, fixes S1/S2 first and closes issues only through merged PRs (`Fixes #n`).

## 8. Sign-off

`QA SIGN-OFF at <sha>` goes at the top of QA-PROGRESS when, on builds that contain every card (build PROGRESS shows `stage=S3`):
- two full cycles in a row (lenses 1-6) found no new S1 or S2,
- no `qa-loop` S1/S2 issue is open, and every closed one is verified,
- every round's working-site check said CONFIRMED.
Any new S1/S2 removes the sign-off. Keep testing after sign-off (next cycle). The owner tags v4.0.0 when the build session says READY and QA says SIGN-OFF at the same or a newer sha.

## 9. Context and restarts

Everything lives in files (QA-PROGRESS, rounds, ENV.md, GitHub issues). A fresh session continues from them. Keep QA-MAIN lean: give subagents paths and charters, ask for short reports. When your context gets long, finish the current step, update QA-PROGRESS, and end with `CONTEXT FULL: restart me with the same prompt`.
