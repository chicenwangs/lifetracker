# Card 22 · feat: page templates

- Source: BREAKDOWN PR 22 (lines 159–163) · PLAN §1b (line 29), §3E item 6 (line 142), §5 item 5 (line 181: undo covers from-template), §8 PR 22 (line 286), §8 line 299 · DESIGN §2.6 (lines 96–111; boards D-P5 `wireframes/v4/index.html:286`, M-P5 `:307`, D-P5b `:320`), §0 (lines 13, 14), §3 (lines 157–166) · `docs/v2/FEATURES.md` PG-TEMPLATE line 129 (today "LATER") · decisions O-3
- Needs: 15 (`pages.is_template` column), 17 (duplicate page + its undo) · Size: M · Branch: `v4/22-page-templates`

## What

Any page can be marked as a template. Templates leave the sidebar tree, appear in the New page ▾ menu (desktop) / the add sheet (phone), get a pill in the page header, and produce a copy titled "Untitled <template name>" without ever changing when the template itself is edited. The copy is card 17's duplicate with a different title, so its links, icon, blocks and database schema come along; records do not.

Owner decisions that apply: **O-3** — a duplicate copies the database schema only, not records (DESIGN §4.1 default, kept). A page made from a template therefore has empty databases.

## Done when

Tests are titled with the id (`C1 ...`).

- C1 `pages.is_template` (card 15) can be set and cleared through `POST /api/pages/:id/template {on}` (D-V4-34), owner-only (`need('page', uid, id, 'owner')`, `shares.ts:40-46`): on a page shared with me with an edit share the action is not offered and the request is 403; a page id I cannot see is 404. A reload keeps the flag.
- C2 `pages.tree()` excludes `is_template = 1` (`repo/pages.ts:32-38`), so after `Make template` the page disappears from the sidebar tree and from a fresh load's tree; its subpages do not reappear as top-level rows either (they keep their parent id). `pages.recent()` excludes them while `findByTitle` and search include them (D-V4-34).
- C3 Page ⋯ shows exactly one of `Make template` / `Stop being a template` in the second group, directly after `Duplicate` (DESIGN lines 99, 103 and board D-P5); the label reflects the current flag. On a template page the header shows a `--ground` pill `Template · edits don't change pages made from it` (DESIGN line 111; board D-P5b).
- C4 Desktop: the sidebar header's single `New page` button (`pages/+layout.svelte:94-107`) becomes `New page ▾` with `Blank page` first and `From template ▸` under it; the submenu lists the user's templates (icon + title). With none it shows `No templates yet. Use ⋯ › Make template on any page.` (DESIGN lines 105–111). Only these two rows ship here; starter templates and Import Markdown arrive in cards 26/27 (D-V4-34).
- C5 `From template ▸` → `<template>` creates a page that is card 17's duplicate of the template with title `Untitled <template name>` (trimmed to the 300-character cap, `schema.ts:482`), placed with the `Put under` picker like Markdown import (D-V4-34), and opens it. Blocks and icon match the template, `page_links` is rebuilt for the copy (card 17 C3), child pages and shares are not copied, and each database block is created with its properties and views and **zero records** (O-3; BREAKDOWN lines 128–129, 161).
- C6 Editing the template after a copy exists changes nothing in that copy: title, body, blocks and database schema of the copy stay as they were (test: make copy, edit template, reload the copy). Editing a copy never changes the template either.
- C7 The copy is not a template (`is_template = 0`) and appears in the tree; the template keeps its own flag, blocks and shares. `New from template` twice makes two independent pages with different ids.
- C8 Templates stay searchable: the header search finds a template by its title and body, and `GET /api/pages/find` returns it (the FTS index already covers every live page, `search.ts:12-26, 45-68`, `repo/pages.ts:408-413`); search results open the template page, showing C3's pill.
- C9 Undo: `Make template` / `Stop being a template` shows a toast whose Undo sets the flag back (CLAUDE.md "every mutation gets an undo entry"; DESIGN line 13). `New from template` shows `Created from template · Undo` and Undo trashes the copy through the same path as card 17 (DELETE → Trash, no journal row; D-V4-23; PLAN line 181 lists from-template in undo coverage).
- C10 Phone: `Make template` / `Stop being a template` is a row in the page actions sheet, ≥ 48 dp, and the template pill renders on the page; the template list opens from the Add sheet's Page tab (D-V4-34), rows ≥ 48 dp; Back closes the sheet before the page; no "Ctrl"/"Click"/Esc text is visible or read out (`expectTargets48`, `noDesktopHints`; DESIGN §0 lines 11, 15; board M-P5).
- C11 States (DESIGN §3): loading — the menu rows are disabled while a flag request runs, a double tap makes one change; empty — `No templates yet. Use ⋯ › Make template on any page.`; error — a failed flip keeps the old flag and shows `showError`; offline — the usual offline toast, nothing queued; on a view-only share neither `Make template` nor `New from template` is offered, while a template shared with me still shows its pill.
- C12 Docs: `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-TEMPLATE row moves off "LATER", PG-CREATE gets the New page ▾ path, the tests line).

## Out of scope

- Starter templates (Watch list, Workout log, Dev tracker) — card 26; this card only ships the user's own templates.
- Markdown import (card 27) and its `Import Markdown…` row; starter-template rows in the same menu (cards 26/27, D-V4-34).
- Template variables, placeholders, auto-dating a copy, or editing a template from the copy.
- Cover images (card 31) inside a copied page: whatever card 17's duplicate copies is what the copy gets.
- A "Templates" page in the sidebar footer or a template archive/trash view.

## Files likely touched

- `app/src/lib/server/repo/pages.ts` (`tree` 32–38, `recent` 41–45, `get` 58–95, `create` 209–223, `update` 226–275; `duplicate` from card 17)
- `app/src/routes/pages/+layout.server.ts` (tree + recent 4–7; add the template list)
- `app/src/routes/pages/+layout.svelte` (New page button 94–107, tree 109–151, footer 153–157)
- `app/src/routes/pages/[id]/+page.svelte` (menu 204–238, header 152–169, title block 240–254, styles 298–468)
- `app/src/routes/api/pages/[id]/+server.ts` (PATCH 14–22) or a new `app/src/routes/api/pages/[id]/template/+server.ts`
- `app/src/lib/components/NewPageMenu.svelte` (new)
- `app/src/lib/components/MobileAdd.svelte` (phone add sheet 101–154, gains the Page tab of D-V4-34)
- `app/src/lib/client/newPage.ts` (`createPage` 11–25, read-only or extended)
- `app/src/lib/server/schema.ts` (`pages` 454–484, read-only: card 15 adds the column)
- `app/src/lib/types.ts` (`PageDTO` 157–170, `PageNode` 151–156)
- `app/tests/unit/pages.test.ts`, `app/tests/unit/v4-22-templates.test.ts` (new)
- `app/tests/e2e/v4/22-templates.spec.ts` (new), `app/tests/e2e/phone/v4-22-templates.spec.ts` (new)
- `app/tests/e2e/phone/helpers.ts` (read-only)

## Tests

- Builder: unit — flag round trip, tree exclusion (`recent()` excludes templates, D-V4-34), a copy titled `Untitled <template name>` with the template's blocks and a database of properties + views and 0 records (O-3), copy independence both ways, the copy is not a template — in `app/tests/unit/v4-22-templates.test.ts`; desktop e2e make template → gone from the tree → New page ▾ → From template → content copied → edit the template, copy unchanged → undo — `app/tests/e2e/v4/22-templates.spec.ts`; phone actions-sheet row, 48 dp, Back — `app/tests/e2e/phone/v4-22-templates.spec.ts`.
- Blind (tester, from Done when only): `app/tests/unit/v4-22-blind.test.ts`, `app/tests/e2e/v4/22-blind.spec.ts`, `app/tests/e2e/phone/v4-22-blind.spec.ts`.

## Docs

- `docs/BUILD-NOTES.md`, `docs/v2/FEATURES.md` (§6 Pages: PG-TEMPLATE, PG-CREATE).

## Decided

- Decided: D-V4-34 — dedicated owner-only `POST /api/pages/:id/template {on}`; a `Put under` picker like Markdown import; `recent()` excludes templates, `findByTitle` and search include them; desktop Blank + From template ▾, phone Add sheet Page tab Blank + templates; hide Make template on record and archived/trashed pages; remove pins and say so in the toast; owner only.
