# Life Tracker — Technical Design Document

**Document version:** 1.0  
**Document type:** Technical Design Document (TDD)  
**Parent documents:**  
- [Life Tracker Product Requirements Document v1.0](./Life_Tracker_PRD_v1.0.md)
- [Life Tracker Feature Specification v1.0](./Life_Tracker_Feature_Specification_v1.0.md)

**Repository:** https://github.com/chicenwangs/lifetracker  
**Product owner:** Jeremy (`chicenwangs`)  
**Document date:** 12 November 2026  
**Status:** Proposed technical baseline for implementation. Existing stack constraints are preserved. New module architecture is specified; items explicitly marked as owner decision or technical spike are not silently approved.

---

## 1. Purpose and authority

This document defines the technical architecture for the expanded Life Tracker product. It translates the PRD and Feature Specification into a concrete design for:

- Application structure and module boundaries.
- Database entities, relationships, indexes, and migration strategy.
- Server-side services and repository responsibilities.
- API conventions and representative endpoint contracts.
- Pages editor and database architecture.
- Keep storage and organisation.
- Search and knowledge graph generation.
- Attachments and file access.
- Reminders and browser push.
- Undo and duplicate operations.
- Page sharing, permissions, and collaboration.
- PWA and offline behaviour.
- Security, testing, deployment, backup, and implementation sequencing.

The PRD defines what the product must do. The Feature Specification defines the required user-facing behaviour. This document defines how the application should be built.

### 1.1 Normative language

- **MUST**: required for the design to satisfy the approved product requirements.
- **MUST NOT**: prohibited.
- **SHOULD**: expected unless a documented reason is approved.
- **MAY**: optional.
- **Decision required**: cannot be finalised without the product owner.
- **Spike required**: a short implementation experiment must validate feasibility before committing to a dependency or design.

### 1.2 Source precedence

1. Latest owner-approved product decisions.
2. PRD v1.0.
3. Feature Specification v1.0.
4. This TDD for technical choices.
5. Current repository implementation and handoff documents for existing technical facts.
6. Older requirements and technical notes only where they do not conflict with newer documents.

This document does not claim that new modules are already implemented. It describes the target architecture.

---

## 2. Existing technical baseline

The repository's current technical documents identify the following stack and constraints:

| Area | Existing baseline | TDD treatment |
|---|---|---|
| Language | Strict TypeScript | Retain |
| Framework | SvelteKit 2 and Svelte 5 runes | Retain |
| Runtime | Node.js 22 LTS | Retain |
| Adapter | `@sveltejs/adapter-node` | Retain |
| Database | SQLite 3 using `better-sqlite3` | Retain for current self-hosted deployment |
| ORM/migrations | Drizzle ORM and Drizzle Kit | Retain |
| Validation | Zod | Retain at API boundaries |
| Password hashing | `@node-rs/argon2`, Argon2id | Retain |
| Calendar | FullCalendar v6 MIT plugins | Retain |
| Day planner | Custom Svelte components | Retain |
| Time handling | `date-fns` and `@date-fns/tz` | Retain and centralise |
| Tests | Vitest and Playwright | Retain |
| Styling | Plain CSS and design tokens | Retain |
| Markdown | `marked` and `isomorphic-dompurify` | Retain for safe rendering where appropriate |

The repository's current notes also document a modular server layout, owner-scoped repository functions, session-based authentication, soft deletion for planner items/blocks, SQLite WAL mode, forward-only migrations, and a self-hosted Docker deployment.

### 2.1 Existing constraints that must not be broken

1. Node 22 remains the runtime target. Do not upgrade to Node 24 as part of module work without a separate native-dependency compatibility review.
2. Keep the existing `better-sqlite3` version pinned until native build compatibility is verified on Windows and Linux.
3. Keep database migrations forward-only in production.
4. Keep the existing database file and user data. Do not replace the database with a new empty database to simplify module development.
5. Existing date semantics for planner items must remain intact:
   - Date-only calendar fields are local calendar dates, not UTC instants.
   - Planner block start/end values are UTC instants.
   - All-day FullCalendar end dates are exclusive at the UI boundary and inclusive in the existing data model.
6. Continue to enforce owner/access scoping in server repository functions. Route handlers must not construct arbitrary SQL.
7. Do not trust `owner_id`, `user_id`, `calendar_id`, permission, or audit fields supplied by the browser.
8. Keep current account, calendar, session, invite, and share-key behaviour working during migrations.

### 2.2 Current application shape

The existing application is a SvelteKit modular monolith:

- Svelte routes render the application and expose server endpoints.
- `hooks.server.ts` initialises the database, loads sessions, applies route guards, and sets security headers.
- `lib/server` contains authentication, access control, validation, database access, and repositories.
- `lib/server/repo/*` owns data access and ownership scoping.
- `lib` contains shared pure utilities and client-side helpers.
- Svelte components implement the planner UI.
- SQLite is the persistent application database.
- Docker packages the Node application for self-hosting.

The expanded application MUST remain a modular monolith. Keep and Pages are modules inside the same deployment, not separately deployed services.

---

## 3. Architecture overview

### 3.1 Target architecture

```text
Browser / Installed PWA
        |
        | HTTPS / same-origin requests
        v
SvelteKit application (Node 22)
  |
  +-- Route and page layer
  |     +-- Home / Week
  |     +-- Keep
  |     +-- Pages workspace / Page editor
  |     +-- Knowledge graph
  |     +-- Settings / sharing / help
  |
  +-- Application services
  |     +-- Authentication and session
  |     +-- Access-control service
  |     +-- Planner service
  |     +-- Keep service
  |     +-- Pages and block service
  |     +-- Database service
  |     +-- Search service
  |     +-- Graph projection service
  |     +-- Attachment service
  |     +-- Reminder and notification service
  |     +-- Undo/action service
  |     +-- Import/export service
  |
  +-- Repository layer
  |     +-- users / sessions / calendars / items / blocks
  |     +-- keep notes / labels / binders / checklist items
  |     +-- pages / page blocks / links / shortcuts
  |     +-- databases / properties / records / values
  |     +-- attachments / references
  |     +-- reminders / push subscriptions
  |     +-- shares / undo actions / revisions
  |
  +-- SQLite database (WAL)
  |
  +-- Private file storage directory
  |
  +-- Background task runner (same application deployment)
        +-- due reminders
        +-- expired undo cleanup
        +-- expired trash cleanup
        +-- stale upload cleanup
        +-- push retry/cleanup
```

### 3.2 Architectural rules

- The application remains one deployable Node process/container for the initial target.
- All module data is stored in the same SQLite database, with clear table ownership and foreign keys.
- Private binary files are stored outside the public static directory.
- Routes parse input, authenticate, call services, and return responses. They do not contain business rules or raw SQL.
- Services implement multi-repository workflows and transactions.
- Repositories own SQL, row mapping, owner scoping, and persistence invariants.
- Zod schemas validate every external input.
- Shared services are reused by modules rather than reimplemented separately.
- Client-side code is never an authority for permissions or data ownership.
- Background tasks must be safe to run more than once. A reminder must not be delivered twice because a job was retried.

### 3.3 Why a modular monolith

The product is a personal self-hosted application, not a multi-tenant SaaS platform at internet scale. A modular monolith avoids the operational and development overhead of separate services, message brokers, distributed transactions, and independent deployments.

SQLite is suitable for the current deployment and expected single-instance usage when writes are short and transactions are carefully managed. The design must avoid long-running write transactions and must not hold a transaction open while sending push notifications or processing large files.

A move to PostgreSQL or a separate worker process is a future scaling decision, not a prerequisite for implementing Keep or Pages.

---

## 4. Repository and code organisation

The existing folder structure should be extended rather than replaced.

```text
app/src/
  hooks.server.ts
  lib/
    types/
    time.ts
    colors.ts
    quickadd.ts
    components/
      shared/
      planner/
      keep/
      pages/
      database/
      graph/
    client/
      api/
      toast/
      undo/
      preferences/
      offline/
    server/
      db.ts
      schema.ts
      env.ts
      crypto.ts
      auth.ts
      access/
        planner-access.ts
        keep-access.ts
        page-access.ts
        attachment-access.ts
      services/
        planner-service.ts
        keep-service.ts
        pages-service.ts
        database-service.ts
        search-service.ts
        graph-service.ts
        attachment-service.ts
        reminder-service.ts
        push-service.ts
        undo-service.ts
        import-export-service.ts
      repo/
        users.ts
        sessions.ts
        calendars.ts
        items.ts
        blocks.ts
        keep-notes.ts
        keep-checklists.ts
        keep-labels.ts
        keep-binders.ts
        pages.ts
        page-blocks.ts
        page-links.ts
        page-shortcuts.ts
        databases.ts
        database-properties.ts
        database-records.ts
        database-values.ts
        attachments.ts
        reminders.ts
        push-subscriptions.ts
        page-shares.ts
        keep-shares.ts
        undo-actions.ts
        revisions.ts
      validation/
        planner.ts
        keep.ts
        pages.ts
        databases.ts
        attachments.ts
        reminders.ts
        sharing.ts
    routes/
      (existing planner routes)
      keep/
      pages/
      api/
        keep/
        pages/
        databases/
        attachments/
        reminders/
        push/
        undo/
  drizzle/
    migrations/
  tests/
    unit/
    integration/
    e2e/
```

The exact SvelteKit route-group syntax may follow the existing repository conventions. The important boundary is that each module has its own route/UI area while shared services live in `lib/server/services`.

### 4.1 Dependency direction

Allowed:

```text
Route -> Service -> Repository -> Database
Component -> Client API helper -> Route endpoint
Service -> Shared service / Repository
```

Not allowed:

- Component imports server repository code.
- Route builds SQL directly.
- Repository imports Svelte components.
- A repository calls another route endpoint internally.
- Client-provided owner IDs determine row ownership.
- A Keep module directly manipulates Pages tables instead of using a shared service/API boundary.

---

## 5. Database design principles

### 5.1 Database engine and transaction model

Continue using SQLite through `better-sqlite3` and Drizzle.

Required connection pragmas:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

All multi-row operations that must remain consistent MUST use a transaction. Examples:

- Create a Page and its initial title block.
- Delete an item and its linked planner blocks.
- Create a Keep note and its binder/label relationships.
- Create a database record and its initial values.
- Create an attachment reference and update its owning content.
- Apply an undo operation and mark its undo record as consumed.
- Claim a due reminder before sending it.

Never hold a SQLite write transaction open during network I/O, file streaming, push delivery, or expensive graph layout calculation.

### 5.2 IDs

Continue the current text ID convention:

- Prefix by entity type.
- Cryptographically random suffix.
- At least 80 bits of random entropy for newly generated IDs.
- Example prefixes: `kn_`, `kb_`, `kl_`, `pg_`, `pbl_`, `pdb_`, `pdp_`, `pdr_`, `att_`, `rem_`, `und_`.

IDs are identifiers, not permission tokens. Knowing an ID must not grant access.

### 5.3 Ownership

Every private top-level resource must have an `owner_id` or a parent relationship from which its owner can be derived and verified.

Repositories MUST scope reads and writes by the authenticated user or by an explicit access context generated by the access-control service.

Never accept ownership fields from request bodies. The authenticated session determines the acting user.

### 5.4 Timestamps

- Store instants in UTC ISO 8601 with `Z`.
- Store date-only values as `YYYY-MM-DD`.
- Store user timezone as an IANA timezone identifier, e.g. `Asia/Kuala_Lumpur`.
- Convert for display and schedule evaluation in one shared time utility.
- Do not parse a date-only string with `new Date('YYYY-MM-DD')`.
- Do not store local wall-clock time as if it were a UTC instant.

For reminders, persist the resolved due instant in UTC and retain the source rule/offset so rescheduling can recalculate it.

### 5.5 JSON columns

JSON text columns are permitted for structured, versioned block attributes, note drawing payloads, small settings, and snapshot data. They MUST:

- Be validated with Zod before persistence.
- Have a documented schema/version.
- Use SQLite `json_valid()` checks where practical.
- Not replace relational tables for entities requiring filtering, indexing, joins, access checks, or independent lifecycle.

Do not store an entire Pages workspace or all database records in one JSON document.

---

## 6. Target database schema

The following is the logical schema. It is not a literal migration file. Column names and Drizzle definitions must be reconciled with existing tables before generating migrations.

### 6.1 Existing tables retained

Retain existing tables for:

- `app_meta`
- `users`
- `sessions`
- `rate_limits`
- `invites`
- `calendars`
- `items`
- `blocks`
- `share_keys`
- `grants`

Do not drop dormant legacy tables as part of the first Keep/Pages migration. Removing old tables is a separate cleanup task requiring a verified backup and migration plan.

### 6.2 User preferences additions

Add or extend user preference storage for:

| Field | Type | Purpose |
|---|---|---|
| `timezone` | TEXT | IANA timezone; default `Asia/Kuala_Lumpur` |
| `theme_mode` | TEXT | `light`, `dark`, or `auto` |
| `theme_light_start` | TEXT | Local time `HH:MM`, default `07:00` |
| `theme_dark_start` | TEXT | Local time `HH:MM`, default `17:00` |
| `pinned_page_ids` | Prefer relational table | Do not store as JSON if reorder/query constraints require a relation |

Preferred design: create a separate `user_preferences` table if the current `users` table is already carrying too many settings. Existing `users.theme` must be migrated without changing the user's currently selected visual theme.

### 6.3 Page shortcuts

```sql
CREATE TABLE page_shortcuts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, page_id),
  UNIQUE (user_id, sort_order)
);
```

Enforce the maximum of three at the service layer and with the `sort_order` range. The service must perform pin/unpin/reorder in a transaction and must verify the user can access the Page.

### 6.4 Pages

```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT,
  cover_attachment_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX pages_owner_parent_sort
  ON pages(owner_id, parent_page_id, sort_order);
CREATE INDEX pages_owner_updated
  ON pages(owner_id, updated_at);
```

Rules:

- `parent_page_id` must reference a Page owned by the same owner for private pages.
- A Page cannot be its own parent or be moved under a descendant.
- Page identity does not change when title or parent changes.
- `deleted_at` is used for recoverable deletion if the final Pages trash behaviour is retained.
- `revision` increments on every successful content or metadata mutation.
- Access to shared Pages must be checked through the page-access service; owner scoping alone is not sufficient after sharing is introduced.

### 6.5 Page blocks

```sql
CREATE TABLE page_blocks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_block_id TEXT REFERENCES page_blocks(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL,
  position_key TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX page_blocks_page_position
  ON page_blocks(page_id, position_key);
CREATE INDEX page_blocks_parent
  ON page_blocks(parent_block_id);
```

`position_key` represents ordering and allows insertion/reordering without rewriting every block in normal cases. Use a deterministic ordering strategy with periodic rebalancing. The selected key-generation algorithm must be covered by unit tests.

`content_json` stores the block's typed content only. It must not contain ownership or access-control authority.

The initial block schema includes:

| Block | Stored content |
|---|---|
| Paragraph | Rich-text document JSON |
| Heading | Rich-text document JSON and heading level |
| Bulleted/numbered list | List item content and nesting |
| To-do | Text content and checked state |
| Divider | Minimal attributes |
| Quote/callout | Rich-text document JSON and optional style |
| Simple table | Table rows/cells in a versioned structure |
| Image | Attachment reference ID and alt text |
| File | Attachment reference ID and display name |
| Link/bookmark | Validated URL, optional title/preview metadata |
| Internal Page link | Target Page ID |
| Database embed | Database ID and view ID/configuration |

Do not store binary file bytes inside `content_json`.

### 6.6 Page links

```sql
CREATE TABLE page_links (
  id TEXT PRIMARY KEY,
  source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  target_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  source_block_id TEXT REFERENCES page_blocks(id) ON DELETE SET NULL,
  relation_type TEXT NOT NULL DEFAULT 'link',
  created_at TEXT NOT NULL,
  UNIQUE(source_page_id, target_page_id, source_block_id)
);
CREATE INDEX page_links_source ON page_links(source_page_id);
CREATE INDEX page_links_target ON page_links(target_page_id);
```

The parent-child hierarchy is stored on `pages.parent_page_id`; it is not duplicated as a `page_links` row. Explicit internal links are stored in `page_links`. Database relations are stored in the database relation model.

A service must keep the link table synchronised with internal-link blocks. The source of truth is the block content; `page_links` is a queryable projection. Rebuild the projection from blocks if consistency validation detects a mismatch.

### 6.7 Keep notes

```sql
CREATE TABLE keep_notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (
    note_type IN ('text','checklist','image','drawing','link')
  ),
  title TEXT,
  body_json TEXT CHECK (body_json IS NULL OR json_valid(body_json)),
  url TEXT,
  color TEXT,
  background_key TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX keep_notes_owner_updated
  ON keep_notes(owner_id, updated_at);
CREATE INDEX keep_notes_owner_pinned
  ON keep_notes(owner_id, is_pinned, updated_at);
CREATE INDEX keep_notes_owner_archive
  ON keep_notes(owner_id, archived_at, deleted_at);
```

A note's body format must be versioned. Note type determines which fields are valid. Validate the type/content combination at the service boundary.

### 6.8 Keep checklist items

```sql
CREATE TABLE keep_checklist_items (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES keep_notes(id) ON DELETE CASCADE,
  parent_item_id TEXT REFERENCES keep_checklist_items(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX keep_checklist_note_sort
  ON keep_checklist_items(note_id, parent_item_id, sort_order);
```

The service enforces maximum nesting depth from the approved Keep specification. The Feature Specification's four-level target is the baseline unless the owner changes it. Parent items must belong to the same note. A cycle is impossible through the supported API and must be explicitly rejected.

### 6.9 Keep labels and binders

```sql
CREATE TABLE keep_labels (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, name)
);

CREATE TABLE keep_note_labels (
  note_id TEXT NOT NULL REFERENCES keep_notes(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES keep_labels(id) ON DELETE CASCADE,
  PRIMARY KEY(note_id, label_id)
);

CREATE TABLE keep_binders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE keep_note_binders (
  note_id TEXT NOT NULL REFERENCES keep_notes(id) ON DELETE CASCADE,
  binder_id TEXT NOT NULL REFERENCES keep_binders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(note_id, binder_id)
);
```

Labels and binders are independent many-to-many relationships. Deleting a label or binder removes only its associations, not the notes.

### 6.10 Databases

Use a relational representation. Do not store the whole database as one JSON array.

```sql
CREATE TABLE page_databases (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled database',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE database_properties (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES page_databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (
    property_type IN (
      'title','text','number','date','checkbox',
      'select','multi_select','url'
    )
  ),
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE database_records (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES page_databases(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE database_values (
  record_id TEXT NOT NULL REFERENCES database_records(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES database_properties(id) ON DELETE CASCADE,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(record_id, property_id)
);

CREATE INDEX db_records_database_sort
  ON database_records(database_id, sort_order);
CREATE INDEX db_values_property
  ON database_values(property_id);
```

Property values are stored as validated JSON because each property type has a different value shape. The service must validate the value against the property's type before saving. The server must also verify that the record and property belong to the same database.

A record may have a corresponding Page. The record's Page is not a separate unrelated copy. The service must keep the record identity and Page identity linked. Deleting a record must follow a defined lifecycle for its Page; this must be tested and documented before release.

### 6.11 Database views

```sql
CREATE TABLE database_views (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES page_databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  view_type TEXT NOT NULL CHECK (
    view_type IN ('table','board','calendar','list','gallery')
  ),
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`config_json` contains view-specific presentation configuration such as visible columns, grouping property, filters, sorting, and calendar date property. Validate it against a versioned schema for each view type.

### 6.12 Attachments and references

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('uploading','ready','quarantined','failed')
  ),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE attachment_refs (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('keep_note','page_block','page_cover')
  ),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(attachment_id, source_type, source_id)
);
CREATE INDEX attachment_refs_source
  ON attachment_refs(source_type, source_id);
CREATE INDEX attachment_refs_attachment
  ON attachment_refs(attachment_id);
```

The source relationship uses a polymorphic reference and therefore cannot rely on a normal foreign key to all source tables. The attachment service must validate that the source exists and is writable, and deletion workflows must clean up references transactionally.

### 6.13 Reminders and push subscriptions

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('planner_item','planner_block','keep_note','page_block','database_record')
  ),
  source_id TEXT NOT NULL,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('relative','absolute')),
  relative_value INTEGER,
  relative_unit TEXT CHECK (relative_unit IN ('minute','hour','day','week')),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('scheduled','processing','sent','failed','cancelled')
  ),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX reminders_due
  ON reminders(status, due_at);
CREATE INDEX reminders_source
  ON reminders(source_type, source_id);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  revoked_at TEXT
);
CREATE INDEX push_subscriptions_user
  ON push_subscriptions(user_id, revoked_at);
```

Do not store the raw subscription endpoint as an identifier in logs. Do not log `p256dh` or `auth_secret`. Push subscription secrets must be treated as credentials.

### 6.14 Undo actions

```sql
CREATE TABLE undo_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  undone_at TEXT,
  sequence INTEGER NOT NULL
);
CREATE INDEX undo_user_sequence
  ON undo_actions(user_id, sequence DESC);
CREATE INDEX undo_expiry
  ON undo_actions(expires_at);
```

Undo snapshots contain only the minimum data needed to reverse the action. They must not become an unrestricted second copy of all user content. Sensitive data must be protected by the same access controls as the source object. Expired records are purged.

### 6.15 Sharing and revisions

Create explicit resource-level share tables for Pages and Keep notes rather than reusing calendar grants:

- `page_shares`
- `keep_note_shares`

Each share must identify owner, recipient, resource, permission (`view` or `edit`), creation/revocation timestamps, and the actor who granted it.

The exact inheritance rules for child Pages, linked Pages, and database records remain blocked by PRD decisions D-01 through D-04. The schema must not imply inheritance before those decisions are approved.

For future collaboration and history, create a revision model only after the collaboration approach is selected. The first private editor release can use the `revision` integer on each Page/record and optimistic concurrency. Do not build a generic event-sourcing system for all application data.

---

## 7. Pages editor architecture

### 7.1 Core model

A Page is metadata plus an ordered list of blocks. A block is a typed, independently identifiable content unit. Databases are first-class structured resources that can be embedded as a block or opened as a full-page view.

The application must not use one giant HTML string as the Page's source of truth.

### 7.2 Editor library

Use a ProseMirror-based editor engine through Tiptap for rich-text editing, subject to a short Svelte 5 integration spike before broad implementation.

The spike must prove:

1. Svelte 5 can mount and destroy the editor without leaked listeners.
2. Rich-text JSON round-trips through save/load.
3. Keyboard input and selection remain stable when Svelte state updates.
4. Slash-menu insertion can be implemented without replacing the editor core.
5. A block can be selected, moved, duplicated, and deleted.
6. The editor works with the application's CSS tokens and light/dark themes.
7. The chosen extensions can be self-hosted without a runtime dependency on a paid cloud service.

If the spike fails, do not build a custom rich-text engine. Re-evaluate the editor integration and record the result in an architecture decision record.

### 7.3 Block registry

Implement a typed block registry. Each block type defines:

- Stable type name.
- Schema version.
- Zod validation schema.
- Editor renderer.
- Read-only renderer.
- Serialization/deserialization.
- Optional toolbar actions.
- Optional graph/search projection behaviour.
- Migration function for older block schema versions.

Example conceptual type:

```ts
type PageBlockType =
  | 'paragraph'
  | 'heading'
  | 'bulleted_list'
  | 'numbered_list'
  | 'todo'
  | 'divider'
  | 'quote'
  | 'callout'
  | 'simple_table'
  | 'image'
  | 'file'
  | 'bookmark'
  | 'page_link'
  | 'database';

interface BlockDefinition<T> {
  type: PageBlockType;
  schemaVersion: number;
  validate(value: unknown): T;
  renderEditor: Component;
  renderReadonly: Component;
  migrate?(oldVersion: number, value: unknown): T;
}
```

This registry allows new block types to be added without changing the Page persistence model.

### 7.4 Block ordering

Use a fractional/order-key approach rather than integer indexes that require rewriting every block after each insertion.

Rules:

- New block between A and B receives an order key between them.
- If no representable key remains, rebalance the Page's order keys in a short transaction.
- Sort by `position_key`, then stable ID as a deterministic tie-breaker.
- Reordering a block updates only affected order keys where possible.
- Concurrent reordering is protected by Page revision checks.

### 7.5 Autosave

The editor uses debounced autosave:

1. User changes a block.
2. Client marks the Page dirty.
3. A short debounce groups rapid keystrokes.
4. Client sends the changed block(s) and expected Page revision.
5. Server validates access, block schema, and expected revision.
6. Server persists the update in a transaction and increments the Page revision.
7. Server returns the new revision.
8. Client marks the content saved.

If the request fails:

- Keep the unsaved local content in memory.
- Show a persistent unsaved/error state.
- Offer retry.
- Do not replace local edits with stale server content.

The debounce interval is a UI tuning value, not a data correctness mechanism. The server revision check prevents stale writes.

### 7.6 Concurrent edit behaviour

The initial private Pages release uses optimistic concurrency control:

- Every Page has a monotonically increasing revision.
- Every mutation includes `expectedRevision`.
- If the stored revision differs, the server returns `409 Conflict`.
- The client preserves the user's local draft and offers reload/compare/retry options.
- The server never silently overwrites a newer Page revision.

True simultaneous Google Docs-style collaborative editing is a later capability. It requires a selected OT/CRDT design and explicit handling of shared cursors, offline edits, deletion, and permissions. Do not claim real-time co-editing based only on polling or last-write-wins.

### 7.7 Slash menu

The slash menu is a client-side editor extension. It reads the block registry to list allowed insertions. It does not own persistence. Selecting an entry inserts a typed block into the editor transaction; normal autosave persists it.

### 7.8 Page rendering and sanitisation

- Rich text is stored as structured JSON.
- External HTML is not trusted.
- If HTML import/rendering is required, sanitise it using the existing DOMPurify configuration.
- Do not render arbitrary scripts, inline event handlers, unsafe URLs, or untrusted embeds.
- External links use safe URL schemes and appropriate `rel` attributes.
- Server-side read-only rendering and client editing must use the same block schema versions.

---

## 8. Database engine architecture

### 8.1 Separate simple tables from databases

A simple table is content embedded in one Page block. It is appropriate for manually entered rows and columns with no independent records.

A database is a first-class resource with:

- Database metadata.
- Properties.
- Records.
- Typed values.
- Saved views.
- Optional relation properties in a later phase.

Do not implement simple tables as databases or databases as giant table-block JSON.

### 8.2 Property type validation

Each property type has a server-side validator.

| Type | Stored value | Validation |
|---|---|---|
| Title | String | Non-empty after trim; configured length limit |
| Text | String | String length limit |
| Number | Number or null | Finite numeric value |
| Date | Date-only string or null | Strict `YYYY-MM-DD` |
| Checkbox | Boolean | Strict boolean |
| Select | Option ID or null | Must exist in property's option config |
| Multi-select | Array of option IDs | Every option must exist; duplicates removed |
| URL | String or null | Valid URL with allowed scheme |

Option identifiers must be stable IDs, not labels. Renaming an option must not invalidate record values.

### 8.3 Database query execution

The server must apply filters and sorting using validated property definitions. Never accept raw SQL, SQL fragments, arbitrary operators, or column names from the client.

For small self-hosted databases, it is acceptable to load a bounded set of candidate records and evaluate some filters in application code. However, pagination and limits must be enforced. Do not return an unbounded database to the browser.

### 8.4 Relations and rollups

Relations are a later database milestone. The design must use explicit relation records with source database, source record, target database, and target record identities. The service must validate both ends and permission to access both resources.

Rollups and formulas must use a constrained expression model. Do not evaluate arbitrary JavaScript or user-provided code. Formula syntax, supported operators, recursion limits, and error states require a separate feature specification.

---

## 9. Keep architecture

### 9.1 Module boundary

Keep has its own routes, components, services, and repositories. It reuses shared authentication, access control, attachments, reminders, undo, and search services.

Keep does not reuse the Pages block editor as its note editor. The quick-capture experience must remain lightweight.

### 9.2 Note representation

- Text notes use versioned structured rich-text content.
- Checklist notes use relational checklist rows so individual items can be toggled and reordered efficiently.
- Image notes use attachment references.
- Drawing notes use a versioned vector/stroke JSON payload; do not store a screenshot as the only editable representation.
- Link notes store a validated URL and optional preview metadata.
- General file attachments use the shared attachment service.

### 9.3 Binder and label queries

Binder membership and labels are many-to-many. The Keep list query must return a note once even when it matches several selected labels or belongs to multiple binders.

Recommended query approach:

- Start from notes scoped to the authenticated owner.
- Apply archive/trash/pinned filters.
- Use `EXISTS` subqueries for label and binder filters.
- Sort using the requested stable ordering.
- Apply pagination after filtering.

### 9.4 Archive and trash

- Archive is a reversible state (`archived_at`).
- Trash is a reversible state (`deleted_at`).
- Permanent deletion removes the note and cascaded checklist/association records after explicit confirmation.
- Attachments are deleted only when no valid references remain and the retention policy permits deletion.
- Undo of trash restores the note and its related content within the supported undo window.

### 9.5 Kept parity boundary

The implementation target is the web/PWA feature set described in the Feature Specification. Native-only features are not included. Before development begins, create a parity checklist from the Kept reference and map each item to:
- Implement in Keep core.
- Implement in Keep extended.
- Excluded because native-only.
- Requires a product decision.

Do not copy Kept source code or branding. Use it as a behavioural reference only.

---

## 10. Search architecture

### 10.1 Search engine

Use SQLite FTS5, which is already part of the existing technical baseline, for full-text search across supported text content.

Index these content sources:

- Planner item titles and notes, subject to existing calendar visibility rules.
- Keep note titles and text bodies.
- Keep checklist item text.
- Page titles and text-bearing blocks.
- Database record title/text values where approved for search.

### 10.2 Search index table

Use a common search projection with fields conceptually equivalent to:

```sql
CREATE VIRTUAL TABLE content_search USING fts5(
  owner_id UNINDEXED,
  resource_type UNINDEXED,
  resource_id UNINDEXED,
  title,
  body
);
```

For shared resources, search results must be filtered through the access service. The index is a discovery projection, not an access-control authority.

### 10.3 Index maintenance

Repository/service operations must update the search projection in the same database transaction as the source content where practical:

- Create/update: insert or replace indexed text.
- Archive: retain or exclude according to the module's search filter.
- Trash/delete: remove from active search.
- Restore: reinsert.
- Rename/move: update title/path metadata.
- Import: rebuild affected rows.
- Schema migration: rebuild if the indexed representation changes.

A scheduled or admin-triggered full rebuild command must be available for repair.

### 10.4 Search response

Return only fields needed for results:

- Resource type.
- Resource ID.
- Display title.
- Short safe snippet.
- Updated timestamp.
- Navigation URL/route identifier.

Do not return full note/page content in the search result list. Recheck access when opening the result.

---

## 11. Knowledge graph architecture

### 11.1 Graph is a projection, not a second database

The graph is generated from:

1. Page parent-child relationships.
2. Explicit internal Page links.
3. Database relations when implemented.

It must not store a separate manually maintained copy of Page content. It is a read model derived from the Pages database.

### 11.2 Graph query pipeline

```text
Authenticated user
   |
   v
Page access service
   |
   v
Fetch accessible Pages
   |
   +--> Parent-child edges
   |
   +--> Explicit internal-link edges
   |
   +--> Database relation edges (later)
   |
   v
Graph projection DTO
   |
   v
Client graph layout and interaction
```

The graph service returns only accessible nodes and edges. A relationship to an inaccessible Page must not reveal the target title, ID, or content. The service may omit the edge or return a non-identifying unavailable state only if the product owner approves that behaviour.

### 11.3 Graph response model

```ts
interface GraphNode {
  id: string;
  title: string;
  pageType: 'page' | 'database_record';
  route: string;
  parentId?: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: 'parent_child' | 'page_link' | 'database_relation';
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
}
```

The graph DTO must not contain block content, private note text, attachment URLs, or share secrets.

### 11.4 Layout

The browser performs visual layout. The server returns the graph model. Use a graph rendering library only after a small integration spike confirms:

- Svelte 5 compatibility.
- Keyboard-accessible node selection.
- Pan/zoom.
- Stable rendering for representative graph sizes.
- No external runtime service dependency.
- Acceptable mobile fallback.

The graph is a visual exploration feature, not a replacement for the page tree. Provide a list/tree fallback if graph rendering fails.

### 11.5 Graph performance

- Support a full workspace graph with pagination/limits or progressive loading if the number of nodes becomes large.
- Support a local graph around a selected Page as a later optimisation.
- Do not calculate expensive force-directed layout on every server request.
- Cache only derived graph data with a clear invalidation strategy; permission changes must invalidate or bypass stale cached results.
- Do not cache graph responses across users unless the cache key includes the complete permission context.

---

## 12. File storage and attachment security

### 12.1 Storage model

Store binary files in a private storage directory outside `static/` and outside any publicly served web root.

Example:

```text
/app/data/
  app.db
  uploads/
    ab/
      <random-storage-key>
```

The storage key is generated by the server and is not derived from the original filename. The original filename is metadata only.

### 12.2 Upload flow

1. Authenticate the user.
2. Validate that the user can write to the target note/Page.
3. Validate file size and allowed type.
4. Create an `uploading` attachment row.
5. Stream bytes to a temporary file with a generated storage key.
6. Enforce the size limit while streaming, not only from the browser's claimed size.
7. Compute SHA-256 while writing.
8. Perform MIME/content checks and reject unsafe types according to the approved allowlist.
9. Move the completed file to its final private storage key.
10. Mark the attachment `ready`.
11. Create the attachment reference in the same logical operation.
12. Return attachment metadata, never a public filesystem path.

If the process fails, remove the temporary file and mark or clean the incomplete row. A cleanup task removes stale `uploading` records and temporary files.

### 12.3 Download flow

All private downloads go through an authenticated route:

- Authenticate the requester.
- Resolve the attachment.
- Check the requester can access at least one valid source reference.
- Confirm the attachment is ready and not deleted/quarantined.
- Stream the file with safe headers.
- Use `Content-Disposition` safely.
- Set `X-Content-Type-Options: nosniff`.
- Do not expose the absolute storage path.

A direct predictable `/uploads/<filename>` static URL is prohibited.

### 12.4 MIME and file handling

- Do not trust browser-supplied MIME type.
- Compare extension, declared type, and detected content where possible.
- Reject executable or otherwise prohibited content types based on the approved allowlist.
- Render unknown types as downloadable attachments, not inline active content.
- Images must be served with safe content headers.
- SVG uploads require sanitisation or download-only handling; do not inline untrusted SVG.
- File names must be normalised for display and protected against header injection/path traversal.

### 12.5 Reference lifecycle

An attachment can be referenced by more than one supported content object. Removing one reference must not delete the binary while other references remain.

A garbage-collection task may delete an unreferenced attachment after a defined grace period. The grace period and maximum upload size are owner decisions before public release.

---

## 13. Reminders, scheduler, and push notifications

### 13.1 Scheduler design

Use a lightweight in-process scheduler initially. It runs within the same Node deployment and polls due reminders at a short fixed interval.

The scheduler must:

- Start only after database migrations and application initialisation succeed.
- Be disabled in test processes unless a test explicitly starts it.
- Claim due reminders in a short transaction.
- Mark them `processing` before network delivery.
- Send notifications outside the transaction.
- Mark success/failure after delivery.
- Recover reminders stuck in `processing` after a bounded timeout.
- Be idempotent so a retry cannot create multiple successful deliveries for the same reminder.

If deployment later runs multiple application replicas, the scheduler must be moved to a single elected worker or use a robust lease/claim strategy. The initial single-instance deployment must not introduce a queue system unnecessarily.

### 13.2 Relative reminder resolution

Commands map to stored relative rules:

| Input | Stored value |
|---|---|
| `/remind 1w` | `relative_value=1`, `relative_unit='week'` |
| `/remind 3d` | `relative_value=3`, `relative_unit='day'` |
| `/remind 2d` | `relative_value=2`, `relative_unit='day'` |
| `/remind 1d` | `relative_value=1`, `relative_unit='day'` |
| `/remind 2h` | `relative_value=2`, `relative_unit='hour'` |

The parser is a pure shared function with the same grammar on client preview and server validation. The server is authoritative.

The source service resolves the reminder due instant using the source item's scheduling semantics and the user's timezone. When the source schedule changes, recalculate the due instant in a transaction.

### 13.3 Notification delivery channels

Initial channels:

1. In-app notification state.
2. Browser Web Push when the user has an active subscription and the browser supports it.

Do not claim a push notification was displayed merely because the push service accepted a request. Web Push delivery is not equivalent to user-visible display confirmation.

### 13.4 Web Push

- Generate VAPID keys for the deployment.
- Store VAPID private key in environment/secrets, not SQLite or source control.
- Store push subscription endpoint and keys per user/device.
- Encrypt transport according to the Web Push protocol using a maintained library.
- Remove subscriptions that return permanent gone/invalid responses.
- Retry transient failures with bounded backoff.
- Never log endpoint secrets or subscription authentication material.

### 13.5 Reminder lifecycle

- `scheduled`: waiting for due time.
- `processing`: claimed by worker.
- `sent`: delivery request accepted by channel.
- `failed`: permanent or exhausted delivery failure.
- `cancelled`: source deleted or reminder removed.

Missed reminder policy, all-day default time, and quiet hours remain owner decisions. The implementation must not invent them.

---

## 14. Global undo and Alt-drag duplication

### 14.1 Undo architecture

Use a per-user action journal for supported reversible operations. Do not attempt to make every database mutation generically reversible.

Each service operation that supports undo must:

1. Validate the actor and resource access.
2. Capture the minimum before-state needed.
3. Perform the mutation in a transaction.
4. Capture the resulting after-state or version.
5. Insert an undo action record in the same transaction.
6. Return the action ID and user-readable action description.

Undo service:

1. Find the latest unexpired, not-yet-undone action for the current user.
2. Verify the current resource state still matches the action's expected after-state/version.
3. Apply the inverse operation in a transaction.
4. Mark the undo action as undone.
5. Create a redo record only if redo is later approved.
6. Return a safe description for the UI toast.

### 14.2 Conflict handling

Undo must not blindly overwrite later changes. If the target has been modified by another action or collaborator after the recorded operation, the service must refuse the undo and explain that the action can no longer be safely reversed.

### 14.3 Text editor behaviour

When focus is inside a text input, textarea, or rich-text editor, the editor's own undo takes precedence. The application-level undo handler must detect editable contexts and not steal `Ctrl+Z`.

When focus is outside an editor, the global undo service handles `Ctrl+Z`.

### 14.4 Action coverage

Each module explicitly registers supported action types. Initial target actions:

- Planner: create/update/move/resize/delete/duplicate.
- Keep: create/update/checklist toggle/reorder/archive/trash.
- Pages: create/update/move/reorder/delete block, create/delete Page, pin/unpin.
- Databases: create/update/delete record and property changes only when the before-state can be restored safely.

Permanent deletion, external push delivery, and irreversible import operations are not undoable.

### 14.5 Alt-drag

The client detects `Alt` during supported drag operations and requests a duplicate operation. The server performs the copy using a service-specific field allowlist. It must not clone IDs, ownership, audit metadata, sharing grants, reminders, or attachment access blindly.

The original object remains unchanged. The new object is created at the destination and an undo action is recorded.

---

## 15. Access control and sharing

### 15.1 Central access service

Create separate policy functions for:

- Planner/calendar resources.
- Keep notes.
- Pages and databases.
- Attachments.

The service API should expose explicit checks such as:

```ts
assertCanReadPage(userId, pageId)
assertCanWritePage(userId, pageId)
assertCanReadKeepNote(userId, noteId)
assertCanWriteKeepNote(userId, noteId)
assertCanReadAttachment(userId, attachmentId)
```

Do not use a generic `isOwner` boolean as the only permission check after sharing exists.

### 15.2 Existing calendar sharing

Keep the current calendar sharing model and its existing privacy filtering. Do not reuse calendar grants for Pages or Keep. A user who can view another user's calendar must not automatically see their notes or Pages.

### 15.3 Page and Keep sharing

Use explicit resource grants with `view` and `edit` permissions. The service checks access on every read/write operation.

The following rules are mandatory regardless of unresolved inheritance decisions:

- Private by default.
- No access by guessing an ID.
- No access through a stale URL after revocation.
- Search and graph results filter by access.
- Attachment download checks source-resource access.
- A view grant cannot mutate content.
- An edit grant cannot change ownership or grant access to another user unless explicitly authorised.
- Permission checks happen server-side.

### 15.4 Unresolved sharing decisions

The following must be decided before the relevant sharing implementation:

- Whether parent Page shares inherit to children.
- Whether internal links expose linked Pages.
- Whether database records can have independent permissions.
- Whether anonymous/public share links are supported.

Until decided, implement private-only Pages/Keep and a schema capable of explicit grants without enabling implicit inheritance.

### 15.5 Collaboration

The first shareable release may support sequential editing with revision conflict detection. True simultaneous collaborative editing is not complete until a CRDT/OT strategy is selected and implemented.

Recommended technical evaluation for the collaboration milestone:

- Evaluate Yjs with a self-hosted persistence provider and a Svelte-compatible editor binding.
- Confirm SQLite persistence and document compaction behaviour.
- Confirm server-side permission checks on every collaboration connection and update.
- Confirm reconnect/offline merge behaviour.
- Confirm how deletions, revocation, and version history work.

Do not add a WebSocket collaboration server to the first private Pages release. Keep the editor's persistence boundary independent so collaboration can be added later.

---

## 16. Timezone and automatic theme

### 16.1 Preferences

Store:

- `theme_mode`: `light | dark | auto`
- `timezone`: IANA identifier, default `Asia/Kuala_Lumpur`
- `theme_light_start`: `07:00`
- `theme_dark_start`: `17:00`

### 16.2 Evaluation

Use the shared timezone utility. Given the current instant and the user's timezone:

- Local time >= 07:00 and < 17:00: Light.
- Otherwise: Dark.

The schedule is a daily local wall-clock schedule. It is not a UTC schedule and must respect timezone changes and daylight-saving rules in timezones that use them.

### 16.3 SSR and hydration

The server should render the theme using the authenticated user's stored preference. The sign-in page may use the existing theme cookie as a fallback. Avoid a flash from the wrong theme during hydration.

Manual Light/Dark modes bypass schedule evaluation. Automatic mode evaluates on initial render and when the application becomes active after a long background period. A timer may update the theme at the next boundary while the page is open, but correctness must not depend on a timer firing exactly at 07:00 or 17:00.

---

## 17. PWA and offline architecture

### 17.1 PWA

Use the SvelteKit service worker and web app manifest. The PWA must be same-origin with the application and use the existing authentication/session model.

Cache:

- Static application assets with versioned cache names.
- App shell resources.
- Only explicitly approved read-only public/static resources.

Do not cache authenticated private API responses by default in a generic Cache Storage strategy.

### 17.2 Offline Keep

Offline Keep requires a deliberate local data store, not only a service-worker cache. Use IndexedDB for explicitly cached notes and pending operations.

Each local mutation must include:

- Operation ID.
- Resource ID.
- Base revision.
- Mutation payload.
- Creation time.
- Sync state.

When online:

1. Send queued operations in deterministic order.
2. Server validates permissions and base revision.
3. Successful operation is acknowledged and removed from queue.
4. Conflict is retained for user resolution.
5. Permanent permission failure is surfaced and local protected data is handled according to the offline privacy policy.

The exact offline conflict UX and local-data encryption/retention policy must be decided before enabling offline edits for shared content.

### 17.3 Offline Pages

Offline Pages editing is not part of the first PWA release. The editor persistence layer should be designed so a future local operation queue can be added, but do not claim offline Page editing until conflict resolution and attachment behaviour are implemented.

### 17.4 Push and PWA caveats

Push notification support depends on browser/platform capability, user permission, secure context, and an active subscription. The application must detect capability and explain unavailable states rather than presenting a nonfunctional enable button.

---

## 18. API conventions

### 18.1 General rules

- Same-origin JSON API.
- Session authentication through existing secure cookies.
- Validate request bodies and query parameters with Zod.
- Reject unknown fields on sensitive mutations.
- Derive acting user from session.
- Return consistent error objects.
- Use HTTP status codes correctly.
- Never return filesystem paths, password hashes, session tokens, or push subscription secrets.

### 18.2 Response envelope

Success responses may use the existing repository convention. New endpoints should consistently return:

```json
{
  "data": {},
  "meta": {}
}
```

Errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

Do not expose stack traces or SQL errors to the browser.

### 18.3 Representative endpoints

#### Keep

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/keep/notes` | List notes with filters and pagination |
| POST | `/api/keep/notes` | Create note |
| GET | `/api/keep/notes/:id` | Read note |
| PATCH | `/api/keep/notes/:id` | Update note |
| DELETE | `/api/keep/notes/:id` | Move note to Trash |
| POST | `/api/keep/notes/:id/restore` | Restore note |
| POST | `/api/keep/notes/:id/archive` | Archive/unarchive |
| POST | `/api/keep/notes/:id/pin` | Pin/unpin |
| GET/POST/PATCH/DELETE | `/api/keep/labels` | Manage labels |
| GET/POST/PATCH/DELETE | `/api/keep/binders` | Manage binders |
| POST | `/api/keep/notes/:id/reminders` | Add reminder |

#### Pages

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/pages` | List accessible Pages |
| POST | `/api/pages` | Create Page |
| GET | `/api/pages/:id` | Read Page metadata and blocks |
| PATCH | `/api/pages/:id` | Update Page metadata with revision |
| DELETE | `/api/pages/:id` | Delete/archive Page according to approved lifecycle |
| POST | `/api/pages/:id/move` | Move Page |
| GET | `/api/pages/:id/blocks` | Read blocks |
| POST | `/api/pages/:id/blocks` | Insert block |
| PATCH | `/api/pages/:id/blocks/:blockId` | Update block |
| DELETE | `/api/pages/:id/blocks/:blockId` | Delete block |
| POST | `/api/pages/:id/blocks/reorder` | Reorder blocks |
| GET | `/api/pages/:id/graph` | Local graph |
| GET | `/api/graph` | Workspace graph |
| GET | `/api/page-shortcuts` | Read pinned Pages |
| PUT | `/api/page-shortcuts` | Replace ordered list, maximum three |

#### Databases

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/databases` | List/create databases |
| GET/PATCH/DELETE | `/api/databases/:id` | Read/update/delete database |
| GET/POST | `/api/databases/:id/properties` | List/create properties |
| PATCH/DELETE | `/api/database-properties/:id` | Update/delete property |
| GET/POST | `/api/databases/:id/records` | List/create records |
| PATCH/DELETE | `/api/database-records/:id` | Update/delete record |
| PATCH | `/api/database-records/:id/values` | Update record values |
| GET/POST/PATCH/DELETE | `/api/databases/:id/views` | Manage saved views |

#### Attachments, reminders, undo, push

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/attachments` | Upload attachment |
| GET | `/api/attachments/:id` | Download after access check |
| DELETE | `/api/attachments/:id` | Delete if authorised and unreferenced |
| POST | `/api/reminders` | Create reminder |
| PATCH/DELETE | `/api/reminders/:id` | Update/remove reminder |
| POST | `/api/undo` | Undo latest eligible action |
| GET | `/api/undo` | Read current user's available undo description |
| POST | `/api/push/subscribe` | Register browser subscription |
| DELETE | `/api/push/subscribe/:id` | Revoke subscription |

Endpoint names may be adjusted to match existing routing conventions, but the resource boundaries and security behaviour must remain.

### 18.4 Concurrency

Mutations to Pages and database records include `expectedRevision`. A mismatch returns `409 CONFLICT` with the current revision and a safe conflict code. The response must not include inaccessible content.

### 18.5 Pagination

All list endpoints that can grow must support bounded pagination. The server enforces a maximum page size. The browser cannot request an unlimited result set.

---

## 19. Background tasks and lifecycle jobs

The initial deployment uses a lightweight job runner started by the application after database initialisation.

Tasks:

| Task | Frequency/trigger | Safety |
|---|---|---|
| Due reminders | Short polling interval | Claim atomically; idempotent delivery |
| Stale processing reminders | Periodic | Requeue or fail according to retry policy |
| Expired undo actions | Daily | Delete only expired records |
| Planner trash purge | Preserve existing policy | Do not purge before retention window |
| Keep/Page trash purge | After retention policy is approved | Respect attachment references |
| Stale uploads | Periodic | Remove orphan temporary files |
| Attachment garbage collection | Periodic | Delete only unreferenced files past grace period |
| Push subscription cleanup | On permanent push failure/periodic | Revoke invalid subscriptions |
| Search rebuild | Manual/admin or repair task | Transaction-safe rebuild |

The job runner must expose health state for monitoring. A scheduler failure must be logged and surfaced in health diagnostics without making the main application unusable.

---

## 20. Security design

### 20.1 Authentication

Retain existing session and password design. All new private routes require an authenticated session.

### 20.2 Authorization

Every operation must check:

- Actor identity.
- Resource ownership or explicit share grant.
- Required permission level.
- Relationship validity (e.g. block belongs to Page; record/property belong to database).
- Whether the resource is archived, trashed, or deleted.
- Whether the operation is allowed in the current lifecycle state.

### 20.3 CSRF and origin

Retain existing same-origin/origin checks and secure cookie rules. New upload and mutation endpoints must use the same protection.

### 20.4 Input validation

- Zod validates all external inputs.
- Strict schemas for privileged and permission-sensitive mutations.
- Limit string lengths, array lengths, nesting depth, file size, graph result size, and database query complexity.
- Reject unknown block types and unsupported schema versions.
- Reject malformed dates and timezone identifiers.

### 20.5 XSS

- Never trust Page/Keep rich-text JSON.
- Render only known block schemas.
- Sanitise imported HTML.
- Reject unsafe URL schemes.
- Do not inline untrusted SVG or HTML attachments.
- Keep CSP and security headers enabled.

### 20.6 File security

- Private storage only.
- Random storage keys.
- Streaming size enforcement.
- Content-type checks.
- Access-controlled download.
- No path traversal.
- No user-controlled filesystem paths.
- No public static upload path.

### 20.7 Secrets

- `APP_SECRET`, VAPID private key, and other credentials live in environment/secrets.
- Do not commit secrets or include them in logs.
- Push subscription authentication keys are private credentials.
- Attachment storage keys are not authorisation tokens.

### 20.8 Auditability

Record `created_by` and `updated_by` for collaborative resources. Share grants record who granted access and when. Do not create an unrestricted audit log containing full private content by default.

---

## 21. Testing strategy

### 21.1 Unit tests — Vitest

Required unit test areas:

- Timezone/theme schedule evaluation.
- Reminder command parsing and due-time resolution.
- Block schema validation and migration.
- Database property validation.
- Fractional ordering and rebalance.
- Page hierarchy cycle prevention.
- Search query construction and result filtering.
- Graph projection and inaccessible-node filtering.
- Attachment filename and MIME validation.
- Undo inverse operations and conflict detection.
- Permission policy functions.

### 21.2 Integration tests

Use a temporary SQLite database with real migrations.

Test:

- Repository owner scoping.
- Page and block CRUD.
- Keep note/checklist/binder/label relationships.
- Database property and value constraints.
- Attachment reference lifecycle.
- Reminder claiming and retry.
- Undo transactions.
- Page/Keep permission enforcement.
- Search index synchronisation.
- Graph projection from actual Page hierarchy and links.

### 21.3 End-to-end tests — Playwright

Required user flows:

1. Existing Home and Week planner regression.
2. Automatic theme changes using a controlled clock/timezone.
3. Create/edit/archive/trash/restore a Keep note.
4. Create a nested checklist and toggle items.
5. Create binder and labels and filter notes.
6. Upload and download an attachment through authenticated routes.
7. Create a Page and insert each initial block type.
8. Reorder, duplicate, and delete blocks.
9. Create a database, properties, records, and table view.
10. Pin three Pages and reject a fourth.
11. Open graph and navigate to a Page node.
12. Create reminder and verify scheduler state/delivery mock.
13. Undo a supported action and verify restored data.
14. Confirm user B cannot access user A's private Keep/Page/file data.
15. Confirm calendar sharing does not expose Keep or Pages.

### 21.4 Security regression tests

For every private resource type, test:

- Anonymous request.
- Authenticated unrelated user.
- Owner.
- View collaborator.
- Edit collaborator.
- Revoked collaborator.
- Guessed resource ID.
- Guessed attachment ID.
- Stale route after revocation.

Tests must inspect response bodies to ensure hidden titles, content, metadata, and storage paths are absent—not merely assert a 403/404 status.

### 21.5 Migration tests

- Start from a copy of the current production-like database.
- Apply all migrations.
- Verify existing users, sessions, calendars, items, blocks, grants, and settings.
- Verify old theme preference is preserved.
- Verify planner dates and instants are unchanged.
- Verify backup can be restored.
- Verify migrations are safe on an empty database and on an existing populated database.

---

## 22. Deployment, backup, and operations

### 22.1 Runtime

- Node.js 22 LTS.
- Existing Docker image and deployment flow.
- One application instance for the initial architecture.
- SQLite database on persistent storage.
- Upload directory on persistent storage.
- No runtime dependency on external SaaS for core functionality.

### 22.2 Environment additions

Potential new environment variables:

| Variable | Purpose |
|---|---|
| `UPLOAD_DIR` | Private attachment storage directory |
| `MAX_UPLOAD_BYTES` | Server-enforced upload limit |
| `VAPID_PUBLIC_KEY` | Browser push public key |
| `VAPID_PRIVATE_KEY` | Browser push private key |
| `VAPID_SUBJECT` | VAPID contact identifier |
| `REMINDER_WORKER_ENABLED` | Enable/disable in-process scheduler |
| `REMINDER_POLL_INTERVAL_MS` | Scheduler polling interval |

Values and defaults must be documented in `.env.example` and validated at boot. Upload limit must be selected by the owner before public release.

### 22.3 Backup

A complete backup includes:

- SQLite database.
- Private uploads directory.
- Required environment secrets, stored separately and securely.
- Deployment configuration needed to restore the service.

SQLite backup must use a consistent backup mechanism compatible with WAL mode. Do not copy only `app.db` while active writes are occurring unless using a safe SQLite backup procedure.

### 22.4 Restore

Restore procedure:

1. Stop the application.
2. Restore the database snapshot.
3. Restore the upload directory from the matching backup.
4. Restore required secrets.
5. Start the application.
6. Verify migrations.
7. Run integrity checks.
8. Verify attachment references and file existence.
9. Verify login and a sample planner, Keep, and Pages record.
10. Resume normal access.

### 22.5 Health checks

Extend health diagnostics to report:

- Database connectivity.
- Migration state.
- Upload directory writable/readable.
- Background scheduler running or intentionally disabled.
- Reminder backlog count.
- Last successful backup information if available.

Do not expose sensitive paths, secrets, or user content in unauthenticated health responses.

---

## 23. Migration and implementation plan

### Phase 0 — Design and technical spikes

- Confirm current repository branch and exact schema.
- Run baseline tests and record current counts.
- Inspect current database migrations and backup/restore.
- Spike Tiptap/Svelte 5 editor integration.
- Spike graph rendering library.
- Validate private file streaming and size enforcement.
- Validate Web Push in target browsers.
- Record Architecture Decision Records (ADRs) for selected libraries and unresolved decisions.

Exit criteria: no selected dependency is assumed compatible without a working spike.

### Phase 1 — Shared foundations

- Add user timezone/theme schedule preferences.
- Add Page shortcut persistence.
- Add shared undo action service.
- Add attachment storage foundation.
- Add shared reminder schema/service skeleton.
- Add Keep/Pages access service boundaries.
- Add module route skeletons and navigation.

Exit criteria: existing planner regressions pass; migrations preserve all existing data.

### Phase 2 — Keep core

- Notes.
- Checklists.
- Labels.
- Binders.
- Pin/archive/trash.
- Search.
- Attachments.
- Undo coverage.

Exit criteria: Keep core acceptance tests pass; no cross-user data leakage.

### Phase 3 — Pages core

- Page tree.
- Block registry and editor.
- Basic block types.
- Internal Page links.
- Search.
- Page pinning.
- Undo coverage.

Exit criteria: users can create and maintain normal documents without database functionality.

### Phase 4 — Databases

- Database model.
- Properties and typed values.
- Table view.
- Sorting/filtering.
- Record Pages.
- Saved views.

Exit criteria: workout tracker can be built using ordinary database features.

### Phase 5 — Graph

- Parent-child graph.
- Internal link graph.
- Client layout.
- Node navigation.
- Access filtering.
- Performance and mobile fallback.

Exit criteria: graph reflects source data and cannot leak inaccessible Pages.

### Phase 6 — Reminders and push

- Reminder parser integration.
- Scheduler.
- In-app notifications.
- Web Push.
- Retry and cleanup.
- User notification settings.

Exit criteria: due reminders are processed idempotently and permission failures are handled.

### Phase 7 — Sharing and collaboration

- Resolve D-01 to D-04.
- Implement explicit Page/Keep grants.
- Add attachment permission checks.
- Add sequential shared editing with revision conflicts.
- Evaluate and implement CRDT/OT only after ADR approval.
- Add revocation and security regression tests.

Exit criteria: permission inheritance and conflict behaviour are documented and tested.

### Phase 8 — PWA/offline and onboarding

- Mobile-specific interface.
- PWA install.
- Offline Keep.
- Push permission UX.
- Tutorial.
- Settings documentation.
- Accessibility/performance review.

Exit criteria: mobile workflows are usable and offline state is honest and recoverable.

---

## 24. Technical decisions requiring owner approval

| ID | Decision | Recommendation | Reason |
|---|---|---|---|
| T-01 | Maximum upload size | Choose a modest initial limit and make it configurable | Prevents unbounded storage use |
| T-02 | Allowed attachment types | Start with common image, PDF, text, and office formats; treat unknown formats as download-only or reject | Reduces attack surface |
| T-03 | Attachment garbage-collection grace period | Use a delayed cleanup window after the last reference is removed | Protects against accidental removal and undo |
| T-04 | Default theme for new accounts | Decide between current Dark default and Automatic | Existing users should retain their current theme |
| T-05 | All-day reminder time | Choose a default local clock time | A date-only item has no natural reminder instant |
| T-06 | Missed reminder policy | Decide whether to send late, mark missed, or discard | Prevents surprising notifications |
| T-07 | Quiet hours | Decide default and user controls | Notification experience |
| T-08 | Page share inheritance | Explicitly define parent/child and linked Page rules | Security boundary |
| T-09 | Database record sharing | Decide whether record permissions are independent | Security and data model |
| T-10 | Public links | Decide whether anonymous sharing is ever allowed | Exposure and authentication model |
| T-11 | Collaborative editing | Approve CRDT/OT approach after prototype | Required for simultaneous editing |
| T-12 | Offline conflict UX | Decide whether conflicts are manual, duplicate-copy, or merge-assisted | Prevents silent data loss |
| T-13 | Keep checklist nesting | Confirm four-level maximum | Kept reference parity |
| T-14 | Graph library | Approve after Svelte 5, accessibility, and scale spike | Avoids locking in unsuitable dependency |
| T-15 | Editor library | Approve Tiptap after integration spike | Core Pages dependency |

Recommendations are technical recommendations, not decisions already made by the owner.

---

## 25. Architecture decision records required

Create one ADR per major decision and store under `docs/adr/`.

Required ADRs:

1. `ADR-001-modular-monolith-and-sqlite.md` — retain single SvelteKit deployment and SQLite.
2. `ADR-002-pages-editor-engine.md` — editor library and Svelte integration.
3. `ADR-003-page-block-storage.md` — typed block JSON and relational block rows.
4. `ADR-004-database-record-model.md` — property/value schema and record-to-Page mapping.
5. `ADR-005-attachment-storage.md` — private filesystem storage and download authorisation.
6. `ADR-006-reminder-scheduler.md` — in-process scheduler and idempotent claim model.
7. `ADR-007-knowledge-graph-renderer.md` — graph library and layout strategy.
8. `ADR-008-collaborative-editing.md` — CRDT/OT and persistence approach, deferred until collaboration milestone.
9. `ADR-009-offline-sync.md` — IndexedDB operation queue and conflict handling.

An ADR records context, considered alternatives, decision, consequences, and date. If an approved decision changes, supersede the ADR rather than silently rewriting history.

---

## 26. Definition of technical completion

A feature is technically complete only when:

- Its behaviour satisfies the PRD and Feature Specification.
- Its schema and migrations are committed.
- Its server validation and access checks are implemented.
- Its repository/service boundaries follow this TDD.
- Its error and empty states are implemented.
- Unit and integration tests cover its important invariants.
- Playwright covers its main user workflow.
- Security tests verify ownership and permission boundaries.
- Existing planner tests still pass.
- Documentation and environment examples are updated.
- Backup and restore include any new persistent data.
- No unresolved decision is silently implemented as if approved.

---

## 27. References

### Project documents

- [Life Tracker PRD v1.0](./Life_Tracker_PRD_v1.0.md)
- [Life Tracker Feature Specification v1.0](./Life_Tracker_Feature_Specification_v1.0.md)
- [Current repository TECHNICAL.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/TECHNICAL.md)
- [Current repository P1-NOTES.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/P1-NOTES.md)
- [Current repository HANDOFF.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/HANDOFF.md)

### Technology references

- [SvelteKit documentation](https://svelte.dev/docs/kit)
- [Svelte 5 documentation](https://svelte.dev/docs/svelte/overview)
- [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview)
- [SQLite documentation](https://www.sqlite.org/docs.html)
- [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)
- [Tiptap documentation](https://tiptap.dev/docs)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

---

**End of Technical Design Document**
