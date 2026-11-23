# STRUCTURE — where everything lives (2026-11-19)

Caveman doc. Real tree, not the 2026-11-08 plan (that file is in git history). Only directories and the files you will actually touch.

```
life-tracker/
  AGENTS.md                 session brain (read first)
  CLAUDE.md                 agent rules
  README.md                 entry point + doc order
  app/                      SvelteKit app (all web features)
  mobile/                   Android shell (Capacitor 8 + Java plugins)
  deploy/                   prod bundle: compose.yaml, .env.example, backup.sh, restore.sh
  scripts/transform_notion.py   raw Notion export → data/seed
  data/                     gitignored personal data
    app.db                  real data
    qa/                     throwaway sweep DB + runs/ (reports, shots, verdicts)
    seed/ notion-raw/ audit/ snapshot/
  docs/                     see docs map at the end
  wireframes/               v2/ = current canvas, top level = v1 reference
  spikes/                   S-1…S-4 throwaway experiments (not shipped)
  qa/                       QA-loop scratch (playwright helpers, notes)
  .github/workflows/        ci.yml, release.yml
  .opencode/ .claude/       agent config (local, untracked)
```

## app/

```
app/
  package.json              scripts + deps (version = release version)
  .env / .env.example       NODE_ENV, DATABASE_PATH, SEED_DIR, ORIGIN, TZ, APP_SECRET, SETUP_TOKEN,
                            VAPID_*, JOBS_ENABLED, UPLOAD_QUOTA_BYTES, ADDRESS_HEADER
  drizzle/                  0000_init … 0010_v2_default_reminder (forward-only) + meta/
  drizzle.config.ts
  playwright.config.ts      desktop / phone / phone-landscape projects, temp DB, port 4173
  scripts/                  seed.ts, reset-password.mjs
  static/                   icons, manifest, offline
  src/
    app.html app.css app.d.ts
    hooks.server.ts         session, security headers, redirects
    lib/
      time.ts               day/time helpers (owner-local vs UTC)
      quickadd.ts           the one quick-add parser (pure; client preview + server)
      planner-layout.ts     timeline lanes, overlaps
      planahead.ts          "before bed" day rollover
      rrule.ts              repeating items
      colors.ts hours.ts itemtypes.ts theme.ts settings-sections.ts types.ts
      dbvalues.ts remind.ts graph-layout.worker.ts
      server/
        env.ts db.ts http.ts validate.ts schema.ts serial.ts
        auth.ts crypto.ts ratelimit.ts setup.ts invites.ts access.ts
        calendar.ts graph.ts itemview.ts native.ts search.ts
        attachments.ts reminders.ts jobs.ts push-related helpers in reminders/native
        undo.ts purge.ts seed.ts dormant.ts
        common-passwords.txt
        repo/              items calendars blocks users sessions meta itemtypes
                           keep pages databases shares sharekeys grants
      client/
        api.ts toast.svelte.ts bus.svelte.ts peek.svelte.ts dialog.svelte.ts
        layers.ts          Back closes the top layer
        offline.ts         queue + replay
        refresh.ts         the only invalidateAll caller
        mobile.svelte.ts   phone bottom sheet state
        rowGestures.ts rowOps.ts peerSwipe.ts phone.ts
        undo.svelte.ts inbox.ts partner.ts haptics.ts native.ts push.ts
        prefs.svelte.ts hours.svelte.ts itemtypes.svelte.ts altdrag.ts remove.ts obj.ts
      components/
        AppHeader MobileBar MobileAdd BottomSheet Dialog ActionSheet AccountSheet
        DayPlanner DraftBlock RollHandle QuickAdd CommandInput QASlots TypeBar SlotCommand
        MonthCalendar WeekCalendar WeekMap PhoneWeek CalSwitch TimelinePreview
        ItemView ItemPeek DueTodayChips ScheduleButton Reminders UndoToast
        KeepNote Markdown ShareDialog Tour GestureHint PullRefresh OverlapToggle
        StatusSquare AuthShell AppIcon CommandPalette
      editor/ database/    Tiptap + databases internals
    routes/
      +layout(.server).ts +layout.svelte   shell, mobile nav, tour, offline badge
      +page.svelte / today / week / month / item/[id]
      keep/ pages/ pages/[id]/ pages/graph/ pages/archive/ pages/shared/ pages/trash/
      more/ trash/ login/ signup/ setup/
      settings/{account,preferences,notifications,sharing,sessions,users,types,import,help}
      api/                 attachments blocks calendar database-properties database-records
                           databases database-views graph items item-types keep me native pages
                           page-shortcuts push quickadd reminders search shares trash undo unscheduled
  tests/
    unit/                  29 vitest files (parser, time, repo, migrations/rehearsal, security…)
    e2e/                   desktop specs (flow, appbar, dialogs, …)
    e2e/phone/             phone + landscape specs (smoke, tabs, text, today, toast, tour…)
```

## mobile/

```
mobile/
  capacitor.config.json     appId io.github.chicenwangs.lifetracker, server.url = live site
  package.json              Capacitor deps + build scripts (no version field)
  README.md                 build, sign, release, emulator steps
  www/                      offline shell / assets
  android/
    app/build.gradle        versionName appVersion, versionCode appCode (from mobile build)
    app/src/main/AndroidManifest.xml   permissions, widget receivers
    app/src/main/assets/capacitor.config.json   copied at build (debug build → localhost)
    app/src/main/java/io/github/chicenwangs/lifetracker/
      MainActivity.java     WebView wiring, downloads, deep links
      Updater.java UpdaterPlugin.java     GitHub release check + install
      SessionPlugin.java    sign-out clears alarms/notifications/cache/widget data
      ThemeBarsPlugin.java Theme.java     status/nav bar colours
      HapticsPlugin.java    haptics bridge
      Widgets.java WidgetAction.java     6 widgets (Timeline, Keep, NowNext, Quick, Countdown, Week)
      Reminders.java        exact alarms + notifications (no FCM)
      SyncWorker.java       periodic /api/native refresh for widgets
      Native.java           base URL + helpers
    app/src/main/res/       layouts, drawables, strings, widget metadata
```

## docs/

| File | Role |
|---|---|
| `AGENTS.md` (root) | one-page session brain |
| `HANDOFF.md` | current state, env, code map, known issues, next |
| `v2/PRD.md` `FEATURES.md` `DESIGN.md` | v2/v3 product truth (D-xx decisions) |
| `v2/PHASES.md` | release history + test counts per phase |
| `v2/CHAT-HANDOFF.md` | v2.0.4 snapshot + v2.1 backlog (superseded banner) |
| `v2/RELEASE-NOTES.md` `RELEASE-PARITY.md` | what shipped; v1 feature parity |
| `v2/UX-AUDIT.md` `UX-MOTION-AUDIT.md` `SYSTEM-AUDIT.md` | UX + de-hard-wiring rules |
| `v3/MOBILE-SPRINT.md` `v3/QA-LOOP.md` `v3/QA-RUN-2026-11-19.md` | mobile sprint, QA method, last real run |
| `BUILD-NOTES.md` | what the app does now, newest first |
| `SERVICE-HANDOFF.md` | ops contract (deploy/upgrade/rollback/backup/checks) |
| `DEPLOYMENT.md` | local dev → Docker image |
| `REVIEW.md` | review fixes + open owner decisions |
| `THEME.md` | colours, tokens, dark-mode rules |
| `security/*` | 2026-11-15 audits |
| `adr/*` | architecture decisions 001–009 |
| `REQUIREMENTS.md` `TECHNICAL.md` `PSEUDOCODE.md` | v1 spec — history only |
| `v2/source/*` | original v1 PRD/spec/TDD (90/68/78 KB) — history only |
