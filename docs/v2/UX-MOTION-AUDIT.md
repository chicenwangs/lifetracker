# UX + motion audit — 20 principles (2026-11-14)

Caveman doc. Owner asked: check web app, Android app and widgets against 20 principles, apply what fits.
Rule of thumb: motion = feedback, never decoration. Quick (120–300 ms), transform/opacity only, all off with `prefers-reduced-motion`.
Tokens: `--ease` cubic-bezier(.2,.8,.2,1) · `--t-fast` 120 ms · `--t` 220 ms (`app.css`).

| # | Principle | What it means for us | Before | Done now | Later / not doing |
|---|---|---|---|---|---|
| 1 | Squash and stretch | Things you press give a little | Done square popped to 1.2 | Done square squashes (0.82) then overshoots (1.18) then settles · + button squashes into its shadow | — |
| 2 | Anticipation | Small wind-up before the action | Buttons press flat into the shadow | Same on the + (bottom bar), note cards shrink 2% on press | — |
| 3 | Staging | Make the one thing that matters obvious | Now = thin outline | **Now = full-row band** on Today (light grey / one step lighter navy) and Today widget · past rows greyed | — |
| 4 | Pose to pose | Clear start and end states | Keyframes only define the "from" pose | — (fits as is) | — |
| 5 | Follow through | Motion settles after the main move | — | Tick draws itself just after the box fills | — |
| 6 | Slow in, slow out | Ease, never linear | `--ease` everywhere | — | — |
| 7 | Arcs | Natural paths | Sheets slide straight up | — | Not worth it: straight is clearer on a phone |
| 8 | Secondary action | A small extra that backs the main one | Now dot ping | Haptic tick (`navigator.vibrate(8)`) on status change (app + Android Chrome) | — |
| 9 | Timing (snappy) | Under ~300 ms for feedback | 120–320 ms | Kept. Card fade 320 ms + 60 ms stagger | — |
| 10 | Exaggeration | Feedback you can't miss | Pop was small | Bigger squash/overshoot on done; widget tick redraws at once | — |
| 11 | Solid drawing (3D) | Depth that reads as real | Hard yellow shadows on cards + buttons | **Widgets now use the same card + shadow** (were flat dark boxes) | — |
| 12 | Appeal | One consistent look | Widgets didn't match the app | Widgets: app colours, type-coloured boxes, tick squares, note colours, Light/Dark/Auto | — |
| 13 | Fitts's law | Big + near = fast | + centred in bottom bar | **Widget + bottom-right** (thumb) · Keep note tools moved to the bottom on phone · day ‹ › 44 px | — |
| 14 | Bigger hit areas | ≥ 24 px (WCAG), ≥ 40 on touch | Squares 24 px hit area | Squares **40 px on touch** (`pointer: coarse`) · widget ticks 40 dp · rows ≥ 44 dp | — |
| 15 | Hick's law | Fewer choices = faster | More page grouped | Widgets: one job each (7 small ones, not 1 big) · Quick add = 2 buttons only | — |
| 16 | Miller's law | Chunk lists (~7) | Lists flat | Week widget = 7 days × 3 lines · notes chunked pinned/others | — |
| 17 | Doherty threshold | Answer in < 400 ms | Status change was already optimistic on web | Widget ticks change on screen before the server replies | Skeletons for slow loads: not needed yet |
| 18 | Postel's law | Accept messy input | Quick add parses free text | — | — |
| 19 | Jakob's law | Work like apps people know | — | **Android edge-swipe back closes a Keep note** (was: jumped to Today) · Keep widget works like Google Keep's (scroll, tap, + bottom-right) · no blue browser tap flash | — |
| 20 | Frequency of use | Most-used = fastest to reach | Today is home, + in the middle | Widgets for the daily things: Today, Now/Next, To do, Quick add, Keep | — |

## Fixed from the owner's notes (same pass)
- Tick invisible on Today: `StatusSquare` set its own `color`, so the default ink (`currentColor`) became the "on" colour → fill, border and tick all the box colour. Fill now = ink, only the tick = on-colour.
- "Back to now" button gone. Timeline still opens on now.
- Blue tap flash: `-webkit-tap-highlight-color: transparent` (press styles give the feedback).
- Keep on phone: editor text fills the screen, tools at the bottom (was all packed at the top). Open note = own history step.

## Widgets (Android) — what each is for
| Widget | Size | Use case | Tap |
|---|---|---|---|
| Today timeline | 4×3 | Your day from now, tick things off | row → item / Today · square → done · + → quick add |
| Keep notes | 3×3 | Recent notes, pinned first, scroll like Google Keep | note → open · + (bottom-right) → new note |
| Now and next | 4×1 | Glance: what's on, time left (bar), what's next | → Today |
| Quick add | 3×1 | Capture fast | + Plan → quick add · + Note → new note |
| To do today | 3×2 | Today's untimed tasks, tick them | square → done · row → item |
| Countdowns | 3×2 | Exams and deadlines: days left | → item |
| Week ahead | 4×3 | 7 days × first 3 things | day → that day's Today |
Ideas from: Google Keep (scroll + bottom-right +), Google Calendar / TickTick (agenda, ticks in widget), Todoist (to-do list widget), Structured / Things (now + next), countdown apps (days-left tiles).
All follow Light / Dark / Auto from Settings › Preferences.
