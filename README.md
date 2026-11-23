# Life Tracker

A self-hosted planner, notebook and wiki in one app. It runs as a single service with one SQLite file — no separate database, queue or external service to manage.

**[Download the latest release](https://github.com/chicenwangs/lifetracker/releases/latest)** · **[Docker image: `ghcr.io/chicenwangs/lifetracker`](https://github.com/chicenwangs/lifetracker/pkgs/container/lifetracker)** · **Current version: 3.1.1**

![Life Tracker](https://img.shields.io/badge/version-3.1.1-blue) ![Tests](https://img.shields.io/badge/tests-386%20unit%20%7C%2028%20desktop%20%7C%20246%20phone-green)

---

## Features

### Plan the day, week and month

- **Month and week calendars** with typed item colours, status squares and drag-and-drop.
- **Day planner** with 15-minute snap, drag to create, move and resize, midnight-crossing blocks, and a "not scheduled" tray.
- **Quick add** in one line: `Class tomorrow 3pm to 4pm /hobby /calendar`. Dates, times, types, destinations and reminders are typed, not picked from a long form.
- **Ctrl+K / Cmd+K command palette** to jump to pages, notes and items, or run actions.
- **Undo** with Ctrl+Z / Cmd+Z for planner, notes, pages and databases.
- **Keyboard and screen-reader friendly**: every drag has a button path, hit targets meet WCAG 2.2 minimums, and the app is checked with axe in light and dark themes.

### Repeats that are easy to read

- Daily, weekly, monthly and yearly rules, including selected weekdays, intervals, `UNTIL` dates and occurrence counts.
- A repeat row shows **Never / On date / After N** without opening a separate editor, and the rule is written in plain words.
- Editing one occurrence asks **This item / This and following / All items**, so changing notes or a date never silently rewrites the whole series.
- Quick add understands `every tue until 2027-05-18` and `for 6 months`, and writes the correct start date and repeat rule.

### Notes, wiki and databases

- **Keep notes** with autosave, nested checklists, labels, binders, pinning, archive, trash, search and attachments.
- **Pages** with a tree, nested blocks, a `/` insert menu, inline formatting, internal links, tables, databases, archive/trash and a link graph.
- **Databases** with title, text, number, date, checkbox, select, multi-select and URL properties; records open as pages.
- **Search** across pages, notes and planner items, with access filtering.

### Reminders

- Relative reminders (`1w`, `3d`, `2d`, `1d`, `2h`, `15min`) before an item, or exact times.
- Repeating items advance reminders to later occurrences; "Done" ticks only the occurrence it belongs to.
- In-app reminders with actions: **Done**, **Snooze 10 min**, **Tomorrow**.
- Browser push notifications when enabled; the Android app uses exact alarms without Firebase.

### Sharing and access

- Share calendars and pages with other registered users; the same access checks cover notes and database records.
- View-only or edit access, with revocation that takes effect on the next request.
- Hidden types appear as **Busy** to people who are not allowed to see their titles.
- Passwords use argon2id; sessions are HttpOnly cookies; writes are protected by an Origin check.

### Made for desktop and phone

- Responsive layout: a focused phone UI with Today, Calendar, Add, Keep and Pages, and a full desktop UI.
- Installable web app (PWA) with a service worker. Keep edits and quick adds queue offline and sync when the connection returns.
- Light, dark and automatic themes, editable schedule, per-user timezone, and 12/24-hour clocks.
- Custom item types with colours, quick-add slugs and a "counts down" option.

### Android app

- Six home-screen widgets: Today timeline, Keep, Now & Next, Quick add, Countdowns and Week ahead.
- Exact-alarm reminders, system-bar theming, and an in-app updater that checks GitHub Releases.
- The app loads the server's own pages, so features update with the server; only native changes need a new APK.

---

## Download

| What                                  | Link                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Latest release, deploy bundle and APK | [GitHub Releases](https://github.com/chicenwangs/lifetracker/releases/latest)                                    |
| Docker image                          | `ghcr.io/chicenwangs/lifetracker:3.1.1`                                                                          |
| Android APK                           | `life-tracker-3.1.1.apk` on the [v3.1.1 release](https://github.com/chicenwangs/lifetracker/releases/tag/v3.1.1) |
| Deploy bundle                         | `deploy-v3.1.1.tar.gz` on the release page                                                                       |

The published APK points at the project's hosted instance. To use the Android app with your own server, build it from source after setting your server URL in `mobile/capacitor.config.json` and `mobile/android/app/src/main/res/values/strings.xml`.

---

## Install with Docker

You need Docker Engine with the Compose plugin. The image is private unless access has been granted.

```bash
mkdir -p /opt/life-tracker && cd /opt/life-tracker
curl -L -o deploy.tar.gz \
  https://github.com/chicenwangs/lifetracker/releases/download/v3.1.1/deploy-v3.1.1.tar.gz
tar -xzf deploy.tar.gz
cp .env.example .env && chmod 600 .env
mkdir -p data && chmod 700 data
```

If the repository is private, authenticate with GitHub first (`gh auth login`) and use `gh release download v3.1.1 -p 'deploy-*.tar.gz'` instead of the `curl` line above.

Edit `.env`:

- `APP_VERSION=3.1.1`
- `ORIGIN` — the exact browser URL, with no trailing slash.
- `APP_SECRET` — a long random value: `openssl rand -base64 48`.
- `SETUP_TOKEN` — a long random value used only to create the first account.
- `TZ` — your timezone, for example `Asia/Kuala_Lumpur`.

For a local network test, leave `ADDRESS_HEADER` empty and uncomment the `ports:` line in `compose.yaml`. Behind Cloudflare Tunnel, create `tunnel.env` (`cp tunnel.env.example tunnel.env && chmod 600 tunnel.env`; compose fails if the file is missing), put `TUNNEL_TOKEN` in it, keep the port commented, set `ADDRESS_HEADER=CF-Connecting-IP`, and run:

```bash
docker compose --profile tunnel up -d
```

Then open your `ORIGIN` URL, go to `/setup`, enter the setup token and create the first account. Remove `SETUP_TOKEN` from `.env` and restart afterwards. Check `/healthz` for `{"ok":true,"db":true,"version":"3.1.1"}`.

Before any upgrade, run `sudo ./backup.sh`. To upgrade, set the new `APP_VERSION` in `.env`, then `docker compose pull app && docker compose up -d app`. Rollback is the previous version tag; if that version ran a database migration, restore the backup first.

---

## Run from source

Requires **Node 22**.

```bash
git clone https://github.com/chicenwangs/lifetracker.git
cd lifetracker
mkdir -p data/seed
cp .env.example app/.env
```

Set `APP_SECRET` and `SETUP_TOKEN` in `app/.env`, then:

```bash
cd app
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. Use a separate database file for testing; `DATABASE_PATH=../data/app.db` in the example points at the normal data directory.

Useful commands from `app/`:

| Command                  | What it does                         |
| ------------------------ | ------------------------------------ |
| `npm run check`          | Svelte and TypeScript check          |
| `npm run lint`           | Prettier and ESLint                  |
| `npm run test:unit`      | Vitest unit tests                    |
| `npm run test:e2e`       | Playwright desktop tests             |
| `npm run test:e2e:phone` | Playwright phone and landscape tests |

Build the Android shell with JDK 21 and the Android SDK installed:

```bash
cd mobile
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Project layout

| Path                      | What it contains                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `app/`                    | SvelteKit app: calendar, planner, quick add, Keep, Pages, reminders, sharing, phone UI, PWA and offline queue. |
| `mobile/`                 | Capacitor 8 Android shell, widgets, exact-alarm reminders, theme bars and updater.                             |
| `deploy/`                 | Production Compose file, environment example, backup and restore scripts.                                      |
| `docs/v2/`                | Product specification, feature list, design decisions and release notes.                                       |
| `docs/DEPLOYMENT.md`      | From local development to an image.                                                                            |
| `docs/SERVICE-HANDOFF.md` | Operations: deploy, upgrade, rollback, backup and troubleshooting.                                             |
| `.github/workflows/`      | CI and the tagged release pipeline.                                                                            |

All user data lives under `data/`, which is gitignored. Never commit it.
