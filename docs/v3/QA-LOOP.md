# QA loop — 5 passes, overnight

Caveman doc. Run by opencode (`qa/qa-night.ps1`). Goal: find real phone bugs left after the Mobile overhaul (#106).
Every finding must survive 4 checks before it becomes a GitHub issue. No proof = no issue.

## Framework

**What to check = ISO/IEC 25010:2023** (the software quality model teams use worldwide). One checklist per quality:

| 25010 quality | Phone checklist (use these, cite the rule) |
|---|---|
| Functional suitability | PRD + FEATURES (`docs/v2/`), `docs/v2/RELEASE-PARITY.md`, sprint issues in `docs/v3/MOBILE-SPRINT.md` |
| Interaction capability (usability, a11y) | CLAUDE.md "Phone rules", Nielsen's 10 heuristics, WCAG 2.2 AA, TalkBack labels |
| Reliability | offline queue (#105), Back stack (#91), resume (#113), no lost text |
| Performance efficiency | tab switch, first open, scroll jank (Android core app quality: PERF) |
| Compatibility | portrait + landscape, font size 100 / 130 / 200 % (#116), light / dark (#114) |
| Security | OWASP MASVS v2 basics: data wiped on sign-out, nothing private in URLs / logs / widgets |
| Maintainability | only when it causes a user-visible bug (cite file:line) |

**How to be sure = 5 passes** (ISTQB-style test process: find → reproduce → confirm → triage → report).
Different agents do pass 1, 2 and 3 for the same finding. A finding that fails any check is dropped, with the reason.

**Subagents: one at a time.** There is one emulator and Playwright uses a fixed port, so two agents at once would tap
over each other. Start a subagent, wait for its report, then start the next. Subagents give fresh, independent eyes per
slice / batch (their own context), not speed. Batches of at most 8 findings.

## Setup (done by `qa/qa-night.ps1`, not by agents)

- Fresh seeded DB `data/qa/app.db`, login in `data/qa/TEST-LOGIN.txt`.
- Server: `http://localhost:4174` (same URL inside the emulator via `adb reverse`).
- Emulator running, debug app installed and pointed at that server.
- Run folder: `data/qa/runs/<date>/` (gitignored). Ledger: `<run>/findings.json`.

## Tools agents use

- Emulator: `adb` (`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`; older runs used `C:\Android\Sdk\...`).
  - Screenshot: `adb exec-out screencap -p > <run>/shots/<id>-<n>.png`
  - Screen tree (exact text, labels, bounds): `adb shell uiautomator dump /sdcard/u.xml` then `adb pull /sdcard/u.xml <run>/ui/<id>.xml`
  - Tap / swipe / type / Back: `adb shell input tap X Y`, `input swipe X1 Y1 X2 Y2 300`, `input text "..."`, `input keyevent 4`
  - Font size: `adb shell settings put system font_scale 1.3` (reset to 1.0 after). Dark: `adb shell cmd uimode night yes|no`
  - Offline: `adb shell svc wifi disable` + `svc data disable` (enable after)
- Browser phone tests: in `app/`, `npx playwright test --project=phone --project=phone-landscape --trace off`
- Code: read only. Cite `path:line`.

## Emulator CDP (better than screenshots)

`uiautomator dump` only sees one empty `<WebView>` node — it cannot read app text. The **debug** APK enables WebView debugging, so drive the real page over Chrome DevTools Protocol:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:4174 tcp:4174                       # server on the host
& $adb shell cat /proc/net/unix | Select-String webview_devtools
# -> @webview_devtools_remote_<rendererpid>
& $adb forward tcp:9223 localabstract:webview_devtools_remote_<rendererpid>
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9223/json).Content   # page list + ws URL
```

Then connect a WebSocket to `webSocketDebuggerUrl` (Node 22 has a global `WebSocket`) and use `Runtime.evaluate` (`returnByValue: true`, `awaitPromise: true`, `userGesture: true`), `Input.insertText`, `Input.dispatchKeyEvent`, `Page.captureScreenshot`.

- Read the page: `document.body.innerText`, `location.href`, `document.title`.
- Click: find by label/text and call `.click()`; bottom sheets and menus are `div[role="dialog"]`, often missing from the accessibility snapshot but present in the DOM.
- Type into a Svelte input: native setter + `dispatchEvent(new Event('input',{bubbles:true}))`, or `Input.insertText` after focusing.
- Assert on `[role=status]` for toasts ("Added …", "Moved to Trash", "Restored").
- Signs the app is stale, not broken: click does nothing, `fetch('/healthz')` fails, page shows old rows. Relaunch or rebuild; `vite dev` + service worker can serve a cached page.
- Screenshot (`Page.captureScreenshot`) is for the report only — read the DOM for the facts.

A throwaway client lives at `%TEMP%\opencode\cdp.cjs` in the 2026-11-19 run (eval / shot / text / key / log); rewrite it in 20 lines if it is gone.

## Ledger — `<run>/findings.json`

```json
[{ "id": "F-today-03", "slice": "today", "quality": "Interaction capability", "rule": "CLAUDE.md: hit areas >= 48 dp",
   "title": "...", "steps": ["..."], "expected": "...", "actual": "...",
   "evidence": ["shots/F-today-03-1.png", "ui/F-today-03.xml"],
   "status": "candidate|reproduced|confirmed|rejected|filed", "reject": "",
   "repro": { "by": "", "tries": 2, "evidence": [] }, "skeptic": { "verdict": "", "cause": "path:line", "rule": "" },
   "severity": "", "dupOf": "", "issue": "" }]
```

Subagents run in parallel, so they never write `findings.json`. Each writes only its own part file
`<run>/parts/p<pass>-<slice or batch>.json` (same fields, its findings only). After a pass, the main agent merges the
parts into `findings.json`. Re-running a pass is safe (skip findings already past it).

## Pass 1 — Find (subagents: `qa-scout`, one per slice, one after another)

Slices: `today` · `calendar` (Week, Month, agenda) · `keep` (list, note editor, share) · `pages` (list, editor, toolbar)
· `shell` (tab bar, top bar, search, settings, account sheet, tour, hints) · `system` (offline, reminders + notification
actions, resume, system bars, shortcuts, font size, landscape, TalkBack labels).

Each scout: walk its slice on the emulator **and** run its Playwright phone specs; check every row of the framework
table that applies. Max 12 candidates per slice, best first. Each candidate needs steps, expected (with the rule it
breaks), actual, and at least one evidence file that exists. Status `candidate`.

## Pass 2 — Reproduce (subagents: `qa-repro`, never the scout of that slice)

For each `candidate`: fresh start (force-stop app, relaunch), follow the steps exactly, twice. Both tries show the
bug, with new evidence = `reproduced`. Else `rejected` ("could not reproduce: …"). Don't fix the steps to make it
happen; if steps were wrong, reject.

## Pass 3 — Challenge (subagents: `qa-skeptic`)

For each `reproduced`: try to prove it is **not** a bug.
- By design? Check CLAUDE.md phone rules, `docs/v2/PRD.md` §12 decisions (D-xx), `docs/v3/MOBILE-SPRINT.md`, issue #106.
- Emulator-only? (haptics, notification drawer layout, real keyboard, camera cut-out) → reject "needs real phone".
- Test-data artefact or flaky timing? → reject.
- Desktop changed? Check desktop too (Playwright `--project=desktop`): desktop must stay as it was.
Confirm only with a cited rule **and** a code cause (`path:line`). Status `confirmed` or `rejected`.

## Pass 4 — Triage (main agent)

- Merge `confirmed` findings with the same code cause (keep the clearest, list the others).
- Search GitHub, open and closed: `gh issue list --state all --search "<keywords>"`. Same bug already filed → `dupOf`.
- Severity: **S1** data loss / can't use a tab · **S2** feature broken, no workaround · **S3** works with a workaround /
  rule broken (48 dp, wording, a11y) · **S4** cosmetic.
- Write `<run>/report.md`: counts per pass (found / reproduced / confirmed / rejected + reasons), table of confirmed.

## Pass 5 — File (main agent)

For `confirmed`, not `dupOf`, S1 first: `gh issue create`, **max 10 per night**.
- Title: `Phone: <what is wrong> (<screen>)`
- Labels: `qa-loop`, `mobile`, `bug` (create `qa-loop` once if missing: `gh label create qa-loop --color BFD4F2`).
- Body: steps · expected (rule) · actual · evidence file names (in `data/qa/runs/<date>/`) · cause `path:line` ·
  25010 quality · severity · `Found by the QA loop; reproduced twice; checked against the specs.`
- Last line: `<!-- qa-fp: <slice>|<cause path:line>|<short title> -->` (next nights search for it to avoid duplicates).
- Set `status: filed`, `issue: #N`. Append the issue list to `report.md`.

## Hard rules (all passes)

- Read only. Never edit code, commit, push, merge, or touch other issues (no edit / close / comment on issues the loop
  didn't open).
- Never invent: UI text comes from `uiautomator dump` or a screenshot, code from the file. A claim without a file = drop it.
- Don't re-report the "needs real phone" items in MOBILE-SPRINT.md unless the emulator clearly shows them broken.
- Leave the emulator as found: font 1.0, light/dark back, wifi + data on.

## Run it

- One-time setup: Android Studio, SDK in `C:\Android\Sdk`, one emulator in Device Manager, `opencode` and `gh` signed in.
- First night by hand (watch it once): in PowerShell at the repo root,
  `powershell -NoProfile -ExecutionPolicy Bypass -File qa\qa-night.ps1`
- Only some passes: `... -File qa\qa-night.ps1 -From 4 -To 5` (same date = same run folder, finished passes are skipped).
- Results: `data/qa/runs/<date>/report.md`, `night.log`, `pass-N.log`, issues labelled `qa-loop` on GitHub.

## Schedule (every night 01:13, wakes the PC)

PowerShell as your user, once:

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\jeremy josh\Desktop\life-tracker\qa\qa-night.ps1"' -WorkingDirectory 'C:\Users\jeremy josh\Desktop\life-tracker'
$t = New-ScheduledTaskTrigger -Daily -At 1:13am
$s = New-ScheduledTaskSettingsSet -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 6) -StartWhenAvailable
Register-ScheduledTask -TaskName 'LifeTracker QA night' -Action $a -Trigger $t -Settings $s
```

Stop: `Unregister-ScheduledTask -TaskName 'LifeTracker QA night'`. PC must be plugged in and only asleep (not off).
