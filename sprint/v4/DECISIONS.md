# v4 decisions

Owner decisions (`O-`) override everything. MAIN adds `D-V4-xx` when a card leaves a question open (SPRINT.md §8). The owner may change any D-V4 later.
At release (card R1) both lists go into `docs/v2/PRD.md` §12 as D-xx.

## Owner (O-)

| Id | Decision | Source |
|---|---|---|
| O-1 | PLAN.md §7 items 1–8 hold as written (Slipped = one-off + from-completion only; `on_calendar = 0` hidden on Month, shown on Week; visibility per type; ICS export private = "Busy", own items only; digest text and counts; type cap stays 10, starter pack fills free slots; Markdown import `#` = child page; voice plugin built, release notes mention `RECORD_AUDIO`). | PLAN §7, 2026-11-25 |
| O-2 | One release: **v4.0.0** holds everything (v3.2 + v3.3 scope + Pages overhaul). No v3.2 / v3.3 tags. Replaces PLAN §7 item 9. | owner, 2026-11-26 |
| O-3 | Duplicate page copies the database **schema only**, not records. | DESIGN §4.1 default, kept |
| O-4 | Slipped strip starts **collapsed in phone landscape only**; expanded elsewhere. | DESIGN §4.2 default, kept |
| O-5 | Today: when a repeating entry shows both its item occurrence row and its linked planner block row, **hide the block row**; keep "Skip this one". | owner, 2026-11-26 |
| O-6 | Keep: tapping + while viewing Trash or Archive **switches the view to Notes**, so the new note is visible. | owner, 2026-11-26 |
| O-7 | Voice note permission text: "Speech is turned into text by Android's speech service, on your phone when it can." | owner, 2026-11-26 |
| O-8 | Voice note: the owner does one real-phone dictation test before release. MAIN writes `NEEDS_REAL_PHONE: voice dictation` in PROGRESS; never claims it works. | owner, 2026-11-26 |
| O-9 | Repeat from completion is hidden for rules with UNTIL or COUNT. | owner, 2026-11-26 |
| O-10 | Phone: a toast or reminder snackbar never covers an open BottomSheet's button row (it sits above it). | owner, 2026-11-26 |
| O-11 | Finishing one occurrence of a repeating series resets the series status to `todo` (normal repeats and from-completion). | owner, 2026-11-26 |
| O-12 | Phone landscape with the soft keyboard open: editor space is left as is (no tab-bar hiding). | owner, 2026-11-26 |

## Sprint (D-V4-)

| Id | Question | Choice | Why | Cards |
|---|---|---|---|---|
