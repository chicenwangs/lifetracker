# Release parity — live v1.1.0 vs wireframes

Caveman doc. 2026-11-12. Source = git tag `v1.1.0` (9 Nov, "gradient C theme, motion, month double-click add, quick add fix") in `chicenwangs/lifetracker`, routes + components + BUILD-NOTES (then P1-NOTES). Main has 1 later merge (#4 audit fixes, not released).
Rule (owner): **every live feature stays.** Core loop tested 1 week. New design may restyle, never drop.

## Live screens (v1.1.0)
`/` Home · `/week` · `/item/[id]` (peek + full) · `/trash` · `/login` · `/signup` · `/setup` · Settings: `account` `preferences` `sessions` (Devices) `sharing` `users` `import`.

## Feature check

| Live feature | Wireframe before | Now |
|---|---|---|
| Month 2/3 + planner 1/3, colour chips w/ time prefix, square cycle, done = strike | ✓ | ✓ |
| Type legend pills under month header | legend at bottom, then type bar | ✓ type bar (same place, + filter + add) |
| Month/Week toggle in calendar header | removed by audit | **restored** (live, tested) |
| Footer help line (square meaning, drag hints, double-click) | ✗ | **added** |
| Double-click month day → slot popover | ✗ | **added** (Add states board) |
| Deadline countdown badge `5d` / `Today` / `2d late`, red ≤ 3 d | ✗ (only "Due 17:00") | **added** on month + due chips |
| Due-today chips drag onto planner | ✓ (+ Schedule button) | ✓ |
| Hover ⊗ on chips, blocks, rows; Undo toast via trash | States board | ✓ |
| Overlap switch (only when shared), partner stripes + badge | ✓ | ✓ |
| Planner: visible hours roll handles top + bottom, striped strip names hidden blocks | top strip only | **added** bottom handle + both strips |
| Planner drag empty → draft box with command box + Planner/Calendar/Both | ✗ | **added** (Add states board) |
| Plan before bed: Home opens tomorrow + "Today is wrapped up…" | ✗ | **added** (banner state + Preferences) |
| Week grid, odd-hour bands, dotted today, all-day row | ✓ | ✓ |
| Week drag slot → popover command box | ✗ | **added** (Add states board) |
| Week map: "Week N of M", Blocked legend l0–l4 / 6 h+, red dot = not blocked, click row = go | label removed by audit | **restored** label + legend |
| Not scheduled: drag onto grid; drag block onto panel = unschedule; Undo | ✓ list, ✗ drop-back | **added** drop zone hint |
| Week stats: Blocked time · Completed · In progress | showed type hours | **replaced** with live stats (type hours kept below) |
| Quick add N: centred over blur, log of adds w/ Undo, ghost hint, `/` menu, slots, live timeline window, free/overlaps pill | ✗ desktop | **added** board |
| Item peek: title edit, Type/Date/Time/Until/Keep secret, Markdown notes autosave, Steps, History, Time blocks planner, Delete, Open as page | ✗ | **added** board |
| Trash: list + Restore, empty state | link only | **added** |
| Avatar menu: Account · Devices · Preferences · Sharing · Sign out | avatar → Settings | **added** menu |
| Settings › Account: display name, badge colour, change password | ✗ | **added** |
| Settings › Preferences: Theme + "When do you plan your day?" (Before bed / Morning / Off) | theme only | **added** plan section |
| Settings › Devices: sessions, remember flag, last seen, sign out everywhere else | ✗ | **added** |
| Settings › Sharing: make code (types, Busy/Hide, 24 h/7 d), enter code, I can see (Shown/Hidden, Leave), who sees mine (Remove), unused codes (Cancel) | ✗ | **added** board |
| Settings › Users (admin): Open / Invite only, invite codes, accounts | ✗ | **added** |
| Settings › Import from Notion: target user, seed counts, run | ✗ | **added** |
| Login (remember me), Sign up (open / invite code), Setup (token) | phone login only | **added** desktop auth board |
| Dark theme default | light only drawn | not drawn (cosmetic, THEME.md exact) — ask if wanted |

## Changed on purpose (not dropped)
- "Exam" label → **Deadline** (data unchanged).
- Week title "Week of 9 Nov" (live shows range); heatmap keeps "Week N of M".
- "Not scheduled" (desktop, live name kept) vs "No time set" (phone + Home list).
- Undo toast moves centre (new global undo); old bottom toast behaviour folded in.

## Unreleased on main (PR #4) — keep in mind
Undated items, secret title leak fix, orphan steps, notes autosave fix. Bug fixes; no UI change.
