# ADR-002 — Pages editor = Tiptap 3

Status: **GO** (2026-11-13). Spike S-1 `spikes/s1-tiptap`, **22/22 checks**. Tested: `@tiptap/* 3.33.1`, Svelte 5.57.

## Decision
Use Tiptap (ProseMirror) for the Pages editor. MIT packages only, self-hosted. No Tiptap cloud, no paid extensions.
Packages: `core`, `pm`, `starter-kit`, `extension-table`, `extension-list` (to-do lists), `suggestion` (`/` menu). Pin exact versions.

## What the spike proved (DESIGN §6 list)
| Need | Result |
|---|---|
| JSON round-trip | load → save → load → save = same JSON. Headings, bold, link, lists, to-do (checked), code, quote, table, rule all survive. |
| `/` menu as an extension | Works with `@tiptap/suggestion`. Popup = Svelte component. Filter, arrows, Enter, Escape, popup removed after. |
| Selection under Svelte updates | 50 re-renders around + into the editor component: selection and editor DOM unchanged; typing between updates lands at the caret. |
| Block select / move / duplicate / delete | Plain ProseMirror transactions on top-level nodes (`blocks.js`, ~30 lines). Undo works. |
| Theme tokens | Editor text follows `--ink` when `data-theme` flips. |
| Mount / destroy | 100 fast cycles + 10 typed-into editors: destroyed editors do **not** pile up. |
| Self-hosted | Every request stayed on localhost. No page errors. |

## Rules for P3 (learned the hard way in the spike)
- **Editor is not `$state`.** Create in `onMount`, `editor.destroy()` in its teardown. Svelte must never proxy it.
- Svelte popups from an extension: `mount()`/`unmount()` + one `$state` object in a `.svelte.js` file.
- **Undo groups edits < 500 ms apart.** A block move/duplicate/delete right after typing undoes both. Each block op must close the history group first.
- StarterKit adds an **empty trailing paragraph** after a non-text last block. Store it as is (don't "fix" it on save, or round-trip breaks).
- Link mark saves default attrs `target=_blank`, `rel="noopener noreferrer nofollow"`. Matches DESIGN §6. Still sanitise hrefs server side.
- After typing, the **last** destroyed editor stays reachable until the next one is typed into (1 object, never more). Bounded, accepted. Cause not traced.
- Tests: never return the editor from `page.waitForFunction` — the handle pins it and looks like a leak.

## Cost
457 KB JS, **146 KB gzip** (editor + Svelte runtime). Load only on Pages routes (dynamic import). Keep does not use it (DESIGN §8).

## Not covered
Phone keyboards / IME, paste from Word/Notion, drag handle UI, co-edit (ADR-008, P7), stable block ids (ADR-003 open point).
