# v4 board (MAIN is the only writer)

States: `todo` → `carded` → `building` → `checking` → `pr` → `merged` · `blocked`. Order = top to bottom, respecting Needs.
Fix cards `F-<issue>` are added at the bottom (S1/S2 go first in the queue regardless of row).

| Card | Title | Needs | State | Branch | PR | Last gate | Notes |
|---|---|---|---|---|---|---|---|
| 00 | test: working-site journey e2e (desktop + phone): sign in, add item, Today, Week, page edit, Keep note, search, undo | — | todo | | | | runs in every full gate |
| 01 | fix: Keep trash Restore 404 | — | todo | | | | |
| 02 | fix: Android desktop-word hints | — | todo | | | | Android |
| 03 | feat: reschedule action set + Postpone/Skip | — | todo | | | | |
| 04 | feat: Slipped list | 03 | todo | | | | O-1, O-4 |
| 05 | refactor: `agenda()` query | — | todo | | | | |
| 06 | feat: print week | — | todo | | | | |
| 07 | feat: ICS export | 05 | todo | | | | O-1 |
| 08 | db: migration 0011 | — | todo | | | | gate site |
| 09 | feat: repeat from completion | 08 | todo | | | | O-9, O-11 |
| 10 | feat: `on_calendar` type flag | 08 | todo | | | | O-1 |
| 11 | feat: ICS file import | 08, 10 | todo | | | | |
| 12 | feat: daily digest | 08, 05 | todo | | | | O-1, Android |
| 13 | feat: voice note (Android) | — | todo | | | | O-7, O-8, Android, NEEDS_REAL_PHONE |
| 14 | feat: type starter pack | 10 | todo | | | | O-1 |
| 15 | db: migration 0012 | 08 | todo | | | | gate site |
| 16 | feat: page emoji icon | 15 | todo | | | | PageEditor clash: one at a time |
| 17 | feat: duplicate page | 15 | todo | | | | O-3 |
| 18 | feat: callout, toggle, table of contents | 15 | todo | | | | PageEditor clash |
| 19 | feat: `[[` mention + recent 10 | 15 | todo | | | | PageEditor clash |
| 20 | feat: backlinks panel | 15 | todo | | | | |
| 21 | feat: 2-hop local graph | 20 | todo | | | | |
| 22 | feat: page templates | 15, 17 | todo | | | | |
| 23 | feat: DB board view | 15 | todo | | | | sets the view-switch pattern |
| 24 | feat: DB calendar view | 23 | todo | | | | |
| 25 | feat: DB gallery view | 23 | todo | | | | |
| 26 | feat: starter templates | 22, 23, 25 | todo | | | | |
| 27 | feat: Markdown import | 18 | todo | | | | O-1 |
| 28 | feat: Markdown export | 18 | todo | | | | |
| 29 | feat: block drag handles + multi-select | 18 | todo | | | | |
| 30 | feat: reminders on page to-dos | 15 | todo | | | | |
| 31 | feat: page cover image | 15 | todo | | | | |
| R1 | chore: release prep v4.0.0 (versions app + Android, RELEASE-NOTES incl. RECORD_AUDIO, AGENTS.md, CLAUDE.md, BUILD-NOTES, FEATURES, PRD §12 decisions) | all | todo | | | | never tags |
