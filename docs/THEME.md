# THEME — "gradient C" (light + dark), shipped 2026-11-09

Caveman doc. Cosmetic only: no behaviour, data or API change. Values live in `app/src/app.css` (`:root` = light, `:root[data-theme='dark']` = dark). Wireframes: canvas "Life Tracker Wireframes" (light rows on top, `…Dark.dc.html` twins below). Replaces TECHNICAL §9 palette.

## Page
- `body` bg = `var(--page)` (layered radial gradients, `fixed`) over `--page-base`.
  - Light: Pink Chalk #F3A2BD top-left, Tender #F7E7D8 top-right, Sea Breeze #C9DAE7 bottom-left, Delicate Lilac #B6B1D9 bottom-right.
  - Dark: plum #4A1E3F, clay #3A2A30, deep sea #16304A, violet #2E2866 over #0E0D2A.
- Header: no bar (transparent + blur, still sticky). App mark left of nav.

## Tokens (light → dark)
| token | light | dark | used for |
|---|---|---|---|
| `--ink` | #00003D | #F3F1FA | text |
| `--quiet` | #3D3D6B | #B9B6D6 | secondary text |
| `--faint` | #6B6B8F | #8E8BB5 | other-month days |
| `--card` | #FFFFFF | #17163A | cards |
| `--card-edge` | #00003D | #6E6BA0 | 1.5px card border |
| `--border` | #00003D | #9E9BD0 | 1.5px control border |
| `--accent` | #F3D053 | same | hard shadow colour |
| `--shadow-card` / `--shadow-btn` | -6px 6px 0 / -2px 2px 0 accent | same | bottom-left shadow |
| `--strip-a` | #CED3EE | #2B2D5C | month + week bar (`.strip`) |
| `--strip-b` | #D3EECE | #3D3D6B | planner head, timeline preview |
| `--strip-c` | #EECFD4 | #4A2638 | week map head |
| `--pill` | #FFFFFF | #CED3EE | active header nav pill |
| `--pill-card` | #CED3EE | #CED3EE | active tab / settings link (navy text) |
| `--seg-on` | #00003D | #CED3EE | segmented toggle on, overlap track |
| `--primary` | #00003D | #CED3EE | `.btn.primary` |
| `--theme-btn` | #FAEDB8 (moon) | #17163A (yellow sun) | theme button |
| `--today` | #00003D | #F3D053 | today number, selected day |
| `--now` | #00003D | #F3D053 | now line |
| `--toast` | #00003D | #CED3EE | undo toast |
| `--ground` | #F3F2FA | #201F48 | soft fills, tab track |
| `--rule` | #E3E4F0 | #2C2B55 | grid lines |
| `--alert-bg/ink` | #FBE3E1 / #8E2B26 | #4A1F1D / #F2A19C | `.alert` |
| `--ok-bg/ink` | #D3EECE / #00003D | #1E3B2C / #F3F1FA | `.ok-note` |
| `--danger` | #A83A35 | #F2A19C | `.btn.danger` |
| `--heat` | #00003D | #CED3EE | week map fill |

## Types — same chips both themes
bg / ink (text on chip) / edge (on a plain card):
Work #CED3EE / #00003D / navy (dark: #CED3EE) · Exam #C6534D / #FFFFFF / #C6534D (dark: #F2A19C) · Event #D3EECE · Hobby #FAEDB8 · Dating #EECFD4 · None #E6E7F0 (all navy text; edge navy light, own pastel dark). Busy light #E6E7F0 / #3D3D6B, dark #3A3966 / #D9D7EE. `--*-line` = bg.
- Exam white text = 4.4:1 (just under AA). #B84A44 gives 5.1:1 if wanted.
- Status square: transparent fill, type-ink border; done = ink fill, check in chip bg (`--sq-on` / `--bg`).
- `USER_COLORS` unchanged (stored data). Ink badge keeps its ring on dark.
