# Life Tracker — Product Requirements Document (PRD)

**Document version:** 1.0  
**Document status:** Baseline product scope approved for planning; implementation details are intentionally deferred to the Technical Design Document  
**Product owner:** Jeremy (`chicenwangs`)  
**Repository:** <https://github.com/chicenwangs/lifetracker>  
**Document date:** 12 November 2026  
**Primary product language:** English  
**Default timezone:** `Asia/Kuala_Lumpur`  

---

## 1. Purpose of this document

This document defines what Life Tracker is intended to become, which user problems it solves, which features belong in the product, how those features should behave, and how completion will be judged.

It is the product-level source of truth for the expanded Life Tracker scope. It is not an implementation guide. Database schemas, API contracts, component architecture, libraries, deployment changes, and detailed algorithms belong in the Technical Design Document and Feature Specification.

The PRD is deliberately explicit about three different kinds of information:

- **Existing baseline:** behaviour already described as implemented in the repository's current build notes and handoff documentation. This is not a claim that every item has been independently re-tested during preparation of this PRD.
- **Approved product requirement:** a requirement established by the product owner in the project discussion and formalised here.
- **Deferred decision:** a matter that must be decided before the affected feature is implemented. It is not permission for an implementer to invent behaviour.

When an older project document conflicts with this PRD, the newer product-owner decisions in this PRD take precedence for future product planning. Existing implementation and data must not be removed merely because an older requirement has been superseded; changes to them must be planned and migrated deliberately.

## 2. Product overview

### 2.1 Product definition

Life Tracker is a self-hosted personal productivity and knowledge-management application. It combines a calendar and day planner, a quick-capture notes experience, and a flexible document-and-database workspace in one application.

The product has three primary experiences:

1. **Life Planner:** organise time, calendar items, scheduled work, and reminders.
2. **Keep:** capture and organise notes, checklists, links, images, drawings, attachments, and reminders.
3. **Pages:** create and organise flexible documents, tables, and databases. Pages also provide the user's general-purpose workspace for trackers such as workout logs.

These experiences share the same application, user accounts, settings, and platform services. Keep is a distinct experience and route inside Life Tracker; it is not a separately deployed application. Pages is a workspace capability, not a collection of hardcoded application-specific trackers.

### 2.2 Product vision

Give users one self-hosted place to plan their time, capture information quickly, and build an organised personal knowledge base. The product should make common actions fast while allowing users to create their own structures when a dedicated feature would be unnecessary.

### 2.3 Product principles

1. **Personal data ownership:** the product is designed to be self-hosted and must not require a third-party productivity SaaS account to operate its core features.
2. **One application, coherent experience:** the main product areas share identity, navigation, settings, and common services.
3. **Separate experiences, shared foundation:** Life Planner, Keep, and Pages have distinct workflows and interfaces without becoming unrelated applications.
4. **Capture should be quick:** Keep must make adding a note or checklist faster than opening a full document editor.
5. **Pages should be flexible:** users create their own pages, tables, databases, and relationships. The application must not need a new code module for every personal tracking use case.
6. **Desktop and mobile are deliberate experiences:** mobile must not be treated only as a compressed desktop layout.
7. **Privacy is the default:** private information is not exposed to another user unless it is explicitly shared.
8. **Progressive delivery:** the complete product scope is defined here, but implementation is divided into independently testable releases.

## 3. Product goals and success outcomes

### 3.1 Goals

- Preserve and improve the existing calendar and planner workflow.
- Add a full quick-capture notes experience comparable in capability to Kept's web-compatible feature set.
- Add a Notion-style flexible workspace based on pages, blocks, tables, and databases.
- Allow any eligible Pages page to be pinned as a top-level navigation shortcut, with a strict maximum of three shortcuts.
- Provide an automatically generated knowledge graph as an alternate way to view relationships between Pages content.
- Provide application-wide reminders and push notifications.
- Support automatic light/dark theme switching based on the user's configured timezone and schedule.
- Provide a dedicated mobile-focused PWA experience while retaining the same application data and account.
- Add page sharing, file access controls, and collaborative editing as later product capabilities.
- Provide first-time onboarding and in-product documentation after the main feature set is stable.

### 3.2 Success outcomes

Life Tracker is successful when:

- A user can complete ordinary calendar and planning tasks without losing the existing core workflow.
- A user can capture, find, organise, archive, restore, and receive reminders for notes without entering Pages.
- A user can create a new Page and build a useful document or tracker from reusable content blocks and databases without developer intervention.
- A workout tracker can be created as an ordinary Page using tables/database features; no dedicated Workouts module is required.
- A user can navigate to any important Page from the Pages workspace and can pin no more than three frequently used Pages in the header.
- The graph view is generated from actual page relationships and selecting a graph node opens the corresponding Page.
- Automatic theme mode switches at the configured local times and does not unexpectedly change calendar views.
- The mobile experience is usable with touch input and can be installed as a PWA.
- Shared pages and their attachments are accessible only to users who have the required permission.

### 3.3 Non-goals

Life Tracker is not intended to become:

- A collection of separately deployed microservices.
- A native iOS or Android application as part of this scope.
- A replacement for a full project-management suite with enterprise resource planning, advanced project scheduling, or workforce management.
- A general-purpose spreadsheet application with arbitrary formulas, macros, or spreadsheet scripting in the initial Pages release.
- A social network or public publishing platform by default.
- A fitness platform with a dedicated workout module. Workout tracking is a user-created Pages document/database.
- A product that requires AI features to make its core functions useful.

## 4. Users, accounts, and access model

### 4.1 User types

| User type | Description | Product capabilities |
|---|---|---|
| Owner/admin | The primary operator of the self-hosted instance | Uses the product, manages instance-level settings and users, and can use all modules allowed by the account model |
| Registered member | A person with an account on the same Life Tracker instance | Uses their own Life Planner, Keep, and Pages content; may access content explicitly shared with them |
| Page collaborator | A registered member who has received access to a specific Page | Can view or edit the shared Page according to its permission |

A page collaborator is an access role on a Page, not a separate account type.

### 4.2 Existing account baseline

The current repository handoff describes account login, open sign-up by default, an admin setting to switch sign-up to invite-only, and calendar sharing through one-time share codes. Current calendar grants are described as view-only in the build notes.

The expanded product scope must preserve the existing account system unless a separate migration is approved. Page sharing is a new permission system and must not silently reuse calendar permissions as if they were equivalent.

### 4.3 Ownership and privacy

- Each user's private notes and Pages are private by default.
- A calendar share does not automatically grant access to Keep notes or Pages.
- A Page share does not automatically grant access to the owner's entire workspace.
- A file attached to a shared Page must be protected by the Page's access rules.
- Access checks must be enforced by the server. Hiding a link or button in the interface is not sufficient protection.
- Revoking a share must remove the recipient's access on subsequent authorised requests and must prevent stale cached content from remaining accessible where access checks apply.

## 5. Application information architecture and navigation

### 5.1 Primary navigation

The top navigation must provide direct access to:

1. **Home** — the existing month calendar and day-planner experience.
2. **Week** — the existing weekly planner experience.
3. **Keep** — the independent quick-capture notes experience.
4. **Up to three pinned Pages** — user-selected shortcuts to Pages.

The three custom Page shortcuts are in addition to Home, Week, and Keep. The maximum is three pinned Page shortcuts per user. The cap is strict; the interface must not allow a fourth shortcut to be added.

### 5.2 Pages entry point

The user must always be able to reach the Pages workspace and browse all Pages, including when no Page is pinned. Pinned Page shortcuts are convenience links and must not be the only way to access Pages.

The Pages workspace must provide the page tree/navigation area, page creation, search within Pages, and access to the graph view.

### 5.3 Page shortcut behaviour

- A user can select any Page they have permission to access as a top-navigation shortcut, subject to the product's sharing rules.
- A user can add, remove, and reorder their pinned Page shortcuts.
- A Page can be opened from its shortcut without changing its underlying parent or location in the page hierarchy.
- Removing a shortcut does not delete, archive, move, or otherwise modify the Page.
- If a pinned Page is deleted or access is revoked, its shortcut must no longer lead to inaccessible content. The interface must remove or clearly invalidate that shortcut.
- The maximum of three applies per user, not per browser or device.

### 5.4 Navigation consistency

The application must keep shared controls and account/settings access recognisable across Home, Week, Keep, and Pages. Each module may have its own content navigation and toolbars. The user must be able to return to the primary navigation without losing unsaved content.

## 6. Life Planner requirements

### 6.1 Existing baseline

The repository's build notes describe the existing core as including:

- Home with a month calendar and day planner.
- A Week page with a weekly time grid and supporting information.
- Calendar items and planner blocks.
- Quick-add command input.
- Item detail/editing.
- Trash and some undo/restore flows.
- User accounts and calendar sharing.
- A manual light/dark theme toggle.

This PRD does not replace the existing detailed Life Planner specification. Existing calendar and planner behaviour remains in scope and must not regress while new modules are added.

### 6.2 PL-FR-01 — Existing planner functionality is preserved

The existing Home, Week, item, quick-add, and calendar-sharing workflows must continue to operate unless a separately approved requirement changes them.

**Acceptance criteria**

- Existing calendar items remain available after new modules are introduced.
- Existing planner blocks retain their scheduling and editing behaviour.
- Existing user accounts and calendar-sharing relationships remain intact after database migrations.
- Navigation to Keep and Pages does not remove or replace Home or Week.

### 6.3 PL-FR-02 — Correct missing delete control

The intermittent issue where an `X` delete/remove control does not appear must be investigated and corrected for every affected item/block/chip surface.

**Acceptance criteria**

- Every item or block that is intended to expose a delete/remove control exposes it consistently under the supported interaction conditions.
- The control remains reachable by keyboard and touch where the corresponding interface supports those inputs.
- The control does not appear over unrelated content or become inaccessible because of clipping, stacking, or hover-state transitions.
- Deleting an object follows the existing deletion/trash rules and can be undone where the relevant operation supports undo.

### 6.4 PL-FR-03 — Application-wide undo

`Ctrl+Z` must invoke the application's undo behaviour globally, rather than working only in a limited page or component context.

The undo system must cover supported user-initiated mutations across Life Planner, Keep, and Pages as those modules are introduced. An undo action must reverse the most recent eligible action in the application's shared action history, not an unrelated browser or text-field action.

At minimum, the supported mutation categories must include:

- Creating an item, block, note, checklist item, Page, block-editor block, database record, or attachment reference.
- Editing titles, text, properties, dates, times, and supported content.
- Moving or reordering an object.
- Resizing a planner block.
- Duplicating an object.
- Archiving, restoring, or deleting an object where the operation is reversible.
- Changing a supported relationship, such as a Page link or database relation.

**Keyboard behaviour**

- `Ctrl+Z` triggers undo on supported desktop browsers and operating systems.
- The shortcut must not intercept ordinary text editing while the user's focus is inside an editable text input, textarea, or rich-text editor. In those contexts, the editor's own text undo takes precedence unless the application explicitly exposes an application-level undo action for that editor.
- The shortcut must not trigger browser navigation or undo unrelated browser actions.

**Feedback behaviour**

- After an undo, display a small temporary notification near the centre of the viewport.
- The notification must identify the action that was undone in plain language (for example, `Moved “Study networking”` or `Deleted “Meeting notes”`), with wording adjusted to make clear that the action was reversed.
- The notification must not obscure the user's work for an extended period.
- The notification is feedback, not a confirmation dialog; it must not require user input to complete the undo.

**Acceptance criteria**

- `Ctrl+Z` reverses the most recent supported application action from Home, Week, Keep, and Pages.
- The displayed message identifies the reversed action and target where a target exists.
- The original object state is restored, including relevant relationships and ordering.
- Undo does not reverse an unrelated browser or operating-system action.
- If an action cannot be undone, the application does not report a false success.

### 6.5 PL-FR-04 — Alt-drag duplication

On supported draggable objects in Life Planner, holding `Alt` while dragging an object must create a duplicate rather than move the original.

**Required behaviour**

- The source object remains unchanged.
- A new independent object is created at the drop destination.
- The duplicate retains the source's relevant content and properties, except for identifiers, creation metadata, and any fields that must be unique to the new object.
- The duplicate must not inherit access to a private object that the current user is not permitted to copy.
- The action must be undoable through the global undo system.

The exact set of draggable object types and duplicate-field mapping must be documented in the Feature Specification before implementation. At minimum, calendar items and planner blocks must be considered.

### 6.6 PL-FR-05 — No automatic calendar-view switching in this requirement

The previously described 7:00 AM to 5:00 PM timezone behaviour is an automatic light/dark theme requirement, not a requirement to switch between calendar views. The product must not automatically change Home, Week, or planner view based on the theme schedule.

## 7. Theme and timezone requirements

### 7.1 TH-FR-01 — Theme modes

The application must support three theme modes:

- **Light:** always use the light palette.
- **Dark:** always use the dark palette.
- **Automatic:** choose the theme from the user's configured local-time schedule.

The existing manual theme choice must remain available. The current dark-by-default behaviour may remain the default for existing users until the user selects another mode; new-user default behaviour must be consistent with the product's current design decision and be recorded in the Feature Specification.

### 7.2 TH-FR-02 — Automatic theme schedule

The default automatic schedule is:

| Local time | Theme |
|---|---|
| 7:00 AM through 4:59 PM | Light |
| 5:00 PM through 6:59 AM | Dark |

The boundary is inclusive at the start of each period: at 07:00 the theme is Light; at 17:00 the theme is Dark.

Users must be able to change the light-mode start time and dark-mode start time. The schedule must support a valid overnight dark period.

### 7.3 TH-FR-03 — Timezone selection

- The user must have a configurable timezone setting.
- The default timezone is `Asia/Kuala_Lumpur` (Malaysia).
- The timezone selector must identify Malaysia clearly as the default option.
- The selected timezone is used to evaluate the automatic theme schedule.
- The setting must be stored per user and apply consistently across that user's signed-in devices.
- Changing the timezone must cause the automatic theme to be recalculated using the newly selected timezone.

The existing application already uses `Asia/Kuala_Lumpur` as its default timezone for date-related behaviour in its documented baseline. The Technical Design Document must define how the existing timezone preference is reused so the product does not accidentally create two conflicting timezone settings.

### 7.4 TH-FR-04 — Manual override

A user can select Light or Dark to override the automatic schedule. Selecting Automatic returns control to the configured schedule. A manual selection must not silently change the configured schedule times.

### 7.5 Theme acceptance criteria

- At 06:59 local time under the default schedule, Automatic mode displays Dark.
- At 07:00 local time, Automatic mode displays Light.
- At 16:59 local time, Automatic mode displays Light.
- At 17:00 local time, Automatic mode displays Dark.
- A timezone change recalculates the active theme without requiring the user to sign out.
- Manual Light and Dark modes remain fixed regardless of time.
- The theme is consistent across authenticated pages and the sign-in experience where the existing theme mechanism supports it.

## 8. Keep requirements

### 8.1 Product definition

Keep is Life Tracker's quick-capture notes experience. It is a distinct module and route reachable from the top navigation beside Home and Week. It is not a Pages document editor and must not require users to create or organise a Pages hierarchy before writing a quick note.

The desired reference is the web-compatible functionality of [Kept](https://github.com/ericerkz/kept), which describes support for text notes, nested checklists, image notes, drawings, links, attachments, labels, binders, colours, backgrounds, pinning, archive, trash, search, filters, reminders, browser push notifications, sharing, collaboration, offline editing/sync, backups, and Google Keep Takeout import.

The intention is functional similarity, not reuse of Kept's code or branding. Life Tracker must retain its own interface, data model, visual identity, and integration with the rest of the application.

### 8.2 KEEP-FR-01 — Notes

Users must be able to:

- Create a note.
- Edit a note.
- Save changes automatically.
- Add or remove a title.
- Write and format note text using the supported note editor.
- View the note's creation and modification information.
- Duplicate a note.
- Delete a note to Trash.
- Restore a note from Trash.
- Permanently delete a note from Trash.

Text capture must remain low-friction. Creating a basic text note must not require filling in a title, label, binder, colour, or reminder.

### 8.3 KEEP-FR-02 — Checklist notes

Users must be able to create checklist notes with:

- Multiple checklist items.
- Completion and uncompletion of each item.
- Reordering items.
- Nested checklist items.
- Editing and deleting individual items.
- Collapsing or expanding checklist sections where supported by the chosen interaction design.

Nested checklist support must have a defined maximum depth in the Feature Specification. The reference project Kept documents nested checklists up to four levels deep; matching that limit is the baseline target unless the owner changes it.

### 8.4 KEEP-FR-03 — Note types and attachments

Keep must support:

- Plain text notes.
- Checklist notes.
- Image notes and images attached to notes.
- Drawing notes/canvases.
- Links with a readable URL and link preview where preview data can be retrieved safely.
- General file attachments, including common documents and archives.

The application must show attachment names and appropriate previews where possible. Users must be able to open or download their own attachments. Unsupported file previews must fall back to a safe filename/type presentation; a preview is not required for every file format.

### 8.5 KEEP-FR-04 — Labels

Users must be able to create, rename, delete, and apply labels to notes. A note may have more than one label. Users must be able to filter the note collection by label.

Deleting a label must not delete the notes associated with it. The application must remove the label association and preserve the notes.

### 8.6 KEEP-FR-05 — Binders

A binder is a named collection used to group related notes.

Users must be able to:

- Create, rename, and delete binders.
- Add notes to a binder and remove notes from a binder.
- View the notes in a binder.
- Reorder binders.
- Reorder notes within a binder.
- Add one note to more than one binder.

Deleting a binder must not delete its notes. It removes the binder and its membership relationships only.

Binders and labels are distinct concepts. Binders are collections; labels are descriptive tags that can be used to filter notes. A note may have both.

### 8.7 KEEP-FR-06 — Visual organisation

Users must be able to:

- Choose from a defined set of note colours.
- Choose a note background image where supported.
- Pin and unpin notes.
- View pinned notes in a clearly identifiable area or ordering.
- Switch between supported grid and list presentations if included in the final interaction design.
- Drag and drop to reorder notes and checklist items where the interface supports dragging.

Colour must not be the only indication of a note's category or state.

### 8.8 KEEP-FR-07 — Archive and Trash

- Users can archive notes without deleting them.
- Archived notes are excluded from the default active-notes view and remain searchable/filterable.
- Users can restore archived notes.
- Users can send notes to Trash.
- Users can restore notes from Trash.
- Users can permanently delete notes.
- Permanent deletion must require an explicit action.
- Deleting a binder or label must not cascade into note deletion.

### 8.9 KEEP-FR-08 — Search and filters

Users must be able to search note titles and note content. Search must support filters for note type, labels, binder, pinned state, and archive/trash state where relevant.

Search results must open the corresponding note. Search must not expose notes the current user is not authorised to access.

### 8.10 KEEP-FR-09 — Reminders

Users must be able to attach one or more time-based reminders to a note. A reminder must be editable, dismissible, and removable. Reminder delivery must use the shared Life Tracker notification service defined in Section 10.

Location/geofence reminders are not part of the initial web/PWA scope because they depend on native mobile background-location capabilities.

### 8.11 KEEP-FR-10 — Sharing and collaboration

Users must eventually be able to share an individual note with another user on the same Life Tracker instance. Sharing must support at least view and edit permissions. Multiple authorised users must be able to collaborate on a shared note, with changes synchronised between sessions.

Shared-note access must be independent from calendar sharing. A calendar share must not expose Keep notes.

The detailed conflict behaviour for simultaneous edits must be defined in the Technical Design Document before collaborative editing is implemented.

### 8.12 KEEP-FR-11 — Offline access and synchronisation

The mobile PWA should support viewing previously downloaded/cached notes while offline. The planned offline-editing capability must queue local changes and synchronise them when connectivity returns.

The product must provide clear sync state so users can distinguish saved/synchronised, pending, and failed changes. The conflict-resolution policy for the same note being edited in multiple places must be specified before offline editing is released.

### 8.13 KEEP-FR-12 — Import, export, backup, and restore

- Keep should support importing a Google Keep Takeout export.
- The import process must report imported, skipped, and failed items.
- Import must not silently overwrite existing notes.
- Users must have a documented way to export their Keep data.
- Backup and restore must preserve notes, checklist structure, labels, binders, colours, attachments, and reminder definitions where the data format supports them.

### 8.14 Keep features excluded from web/PWA parity

The following Kept capabilities are native-platform-specific and are not required for the Life Tracker web/PWA product scope:

- Native iOS and Android home-screen widgets.
- Native OS share-sheet integration.
- Device-only mode that operates without a Life Tracker account or server.
- Native geofencing/location-triggered reminders.
- Native-only integrations such as Apple Reminders.

These exclusions do not prevent the PWA from supporting browser-based notifications, file selection, offline caching, or installation where the browser supports them.

### 8.15 Keep acceptance criteria

- A user can create and edit a text note without first creating a binder or label.
- A note can contain a checklist with nested items, and checking an item persists after reload.
- A note can be assigned multiple labels and multiple binders.
- Deleting a binder or label does not delete its notes.
- A pinned note is visibly distinguished from an unpinned note.
- Archived notes can be found and restored.
- Trashed notes can be restored or permanently deleted.
- Search finds matching note titles and bodies and respects permissions.
- A time reminder can be set on a note and is delivered through the shared notification mechanism when that mechanism is enabled.
- An imported Google Keep Takeout file produces a summary of successful and unsuccessful imports.
- A user's Keep content is not visible to another account unless explicitly shared.

## 9. Pages requirements

### 9.1 Product definition

Pages is Life Tracker's flexible workspace. It is primarily a recreation of Notion's page-based workspace model: users create pages, organise them into a hierarchy, edit page content using blocks, and create structured tables and databases.

Pages also offers a knowledge graph view. The graph is a visualisation of existing Pages and their relationships. It is not a separate knowledge store and is not the primary way to create or edit content.

Pages must be general-purpose. A user-created workout tracker, reading log, university tracker, homelab inventory, or similar system is represented using Pages content and database features rather than a dedicated hardcoded application module.

### 9.2 PAGE-FR-01 — Workspace and page creation

Users must be able to:

- Open a Pages workspace that lists all Pages they can access.
- Create a new Page.
- Give a Page a title.
- Edit a Page title.
- Open and edit a Page.
- Move a Page within the hierarchy.
- Delete a Page using an explicit delete action.
- Restore a deleted Page if deletion is soft-deletion in the final product design.
- Reorder sibling Pages.
- Expand and collapse nested Pages in the navigation tree.
- Search Pages by title and content.

Pages must have stable identities so that links, database relations, attachments, and graph nodes continue to refer to the same Page when its title or parent changes.

### 9.3 PAGE-FR-02 — Nested page hierarchy

A Page may contain child Pages. Users can create a child Page from the parent Page or from the page navigation tree. Users can move an existing Page to another parent, subject to permission and cycle-prevention rules.

Moving a Page must not break its stable identity or links from other Pages. A Page cannot become its own parent or be moved under one of its descendants.

The Pages workspace must provide a clear page tree. The page tree is a navigation hierarchy; it is not the same as the graph of cross-page links.

### 9.4 PAGE-FR-03 — Block-based editor

A Page is composed of ordered content blocks. Each block is a separately identifiable unit of content that can be edited and manipulated.

The editor must provide, at minimum, these block types in the initial usable release:

| Block type | Required behaviour |
|---|---|
| Paragraph | Enter and edit normal text |
| Heading 1 | Create a top-level section heading |
| Heading 2 | Create a second-level heading |
| Heading 3 | Create a third-level heading |
| Bulleted list | Create and edit unordered list items |
| Numbered list | Create and edit ordered list items |
| To-do/checklist | Toggle completion and edit task text |
| Divider | Insert a visual separator |
| Simple table | Create and edit rows and columns as content |
| Image | Upload and display an image |
| File | Attach a downloadable file |
| Link/bookmark | Store and open an external URL |
| Internal Page link | Link to another Page in the same Life Tracker workspace |
| Database | Insert or create a structured database |

Additional block types may be added after the initial editor is stable:

- Quote.
- Callout.
- Toggle/collapsible block.
- Code block with syntax highlighting.
- Embed.
- Video or other supported media embed.

The editor must not treat an entire Page as one unstructured HTML field. The product-level requirement is that content is managed as individually addressable blocks; the Technical Design Document defines the storage representation.

### 9.5 PAGE-FR-04 — Block insertion and slash menu

Typing `/` in an eligible empty or active editor block must open a block-insertion menu. The menu must allow the user to search for and insert an available block type.

The menu must support keyboard navigation and selection. Selecting a block type inserts the corresponding block at the current editor position.

The menu must close when the user cancels or completes a selection. It must not appear when `/` is typed in a context where it is ordinary text and the editor has not entered block-command mode.

### 9.6 PAGE-FR-05 — Block manipulation

Users must be able to:

- Edit a block in place.
- Insert a block before or after the current block.
- Reorder blocks.
- Duplicate a block.
- Delete a block.
- Change a block to another compatible block type where supported.
- Copy and paste content.
- Select multiple blocks where supported by the editor.
- Undo supported block operations through the global undo system.

Moving blocks must preserve their content and supported metadata. Deleting a block must not delete a file that is also referenced by another Page unless the user explicitly deletes the underlying file and has permission to do so.

### 9.7 PAGE-FR-06 — Text editing and formatting

The editor must support basic inline formatting:

- Bold.
- Italic.
- Underline.
- Strikethrough.
- Inline code.
- Hyperlinks.

Formatting must remain editable after saving and reopening a Page. The editor must preserve text and formatting when blocks are reordered or moved within a Page.

### 9.8 PAGE-FR-07 — Simple tables

A simple table is a content block for manually structured information. It must support:

- Creating a table with rows and columns.
- Adding and removing rows.
- Adding and removing columns.
- Editing cell content.
- Moving between cells with the keyboard.
- Preserving the table as one block within the Page.

A simple table is not a database. It does not require typed properties, filters, relations, or alternate views.

### 9.9 PAGE-FR-08 — Databases

Pages must support databases as structured collections of records. A database may be embedded in a Page or presented as a full-page database.

A database record must have a stable identity and a title. A record may open as a Page so the user can add additional content to it.

The initial database property types must include:

- Title.
- Text.
- Number.
- Date.
- Checkbox.
- Select.
- Multi-select.
- URL.

The initial database view must include a table view. The product should subsequently support:

- Board view.
- Calendar view.
- List view.
- Gallery view.

Database operations must include:

- Create and rename a database.
- Create, edit, and delete records.
- Add, rename, reorder, and remove properties.
- Edit property values.
- Sort records by supported properties.
- Filter records by supported properties.
- Hide, show, and reorder columns in a table view.
- Save named views with their own display, sorting, and filtering settings.
- Open a record as a Page.

Deleting a property must not silently delete the entire database or unrelated record content. The final data-retention behaviour for removed properties must be specified in the Technical Design Document.

### 9.10 PAGE-FR-09 — Relations and formulas

After the basic database model is stable, Pages must support relationships between Pages and database records. A relation allows one record or Page to reference another without duplicating its content.

The later database capability set may include:

- Relations between databases.
- Relations between database records and Pages.
- Formula properties.
- Rollups based on relations.

These are part of the intended long-term Notion-like workspace, but they are not a prerequisite for the first usable Pages release. Their exact operators, limits, and user interface must be specified before implementation.

### 9.11 PAGE-FR-10 — Internal Page links

Users must be able to create a link from one Page to another Page. The link must reference the destination Page's stable identity rather than relying only on its title or URL slug.

If the destination Page is renamed or moved, the link must continue to resolve. If the destination Page is deleted or access is revoked, the source Page must show a safe unavailable/deleted state rather than exposing content the user cannot access.

### 9.12 PAGE-FR-11 — Search

Users must be able to search Pages by title and body content. Search results must identify the matching Page and open it. Search must respect page permissions and must not expose titles or snippets from inaccessible Pages.

Database property filtering is provided by database views and is distinct from general Pages search.

### 9.13 PAGE-FR-12 — Knowledge graph

Pages must provide an optional graph view that visualises the user's existing Pages and their relationships.

**Graph nodes**

- Each node represents a Page or database record that is represented as a Page.
- Nodes must have stable references to their source Page/record.
- Selecting a node opens the corresponding Page or record.

**Graph edges**

The initial relationship types are:

1. Parent-child hierarchy.
2. Explicit internal Page links.
3. Database relations, when database relations are implemented.

**Graph interaction**

- Pan around the graph.
- Zoom in and out.
- Move nodes for visual exploration.
- Select a node to navigate to its source content.
- Show a readable title or label for each node.
- Distinguish relationship types in a way that does not rely on colour alone.
- Provide a local graph around a selected Page, in addition to the full workspace graph, when implemented.
- Provide filters for relationship type and relevant Page groupings when implemented.

The graph is generated from the Pages content model. Creating or removing an internal Page link or database relation updates the graph data. The initial graph is read-only with respect to content relationships: users create relationships in the Page editor or database, not by editing graph edges.

Attachments are not graph nodes by default. The graph must not show every image or file as a node unless a later explicit file-graph feature is approved. This keeps the default graph focused on knowledge relationships rather than becoming a file explorer.

The graph is an optional visualisation. Pages must remain fully usable when the graph view is not open or is unavailable.

### 9.14 PAGE-FR-13 — Page templates and user-created trackers

A user must be able to build a tracker from ordinary Pages blocks and databases. No dedicated code module is required for each kind of tracker.

The workout-tracking use case is specifically in scope as a user-created Page that uses tables and/or databases. The product must not introduce a separate Workouts top-level module as part of this scope.

A workout Page may contain tables for exercise names, sets, repetitions, weight, date, and other fields selected by the user. The application does not need special exercise logic, rest timers, personal-record calculations, or workout programming to satisfy this requirement.

Reusable Page/database templates may be added later, but the ability to build the workout tracker manually from the general Page system must not depend on templates.

### 9.15 PAGE-FR-14 — Pinning Pages to the header

Any Page the user can access may be selected as a top-navigation shortcut, up to three shortcuts per user. This requirement is defined in Section 5 and applies to Pages.

### 9.16 PAGE-FR-15 — Page sharing

Users must eventually be able to share selected Pages with other registered users on the same Life Tracker instance.

The permission levels required are:

- **Can view:** recipient can read the shared Page and permitted content but cannot edit it.
- **Can edit:** recipient can edit the shared Page and its permitted content.

The share owner must be able to review and revoke access. A private Page remains private until explicitly shared.

Collaborative editing should allow multiple authorised users to edit a shared Page and see changes synchronised without manually refreshing the page. The final collaboration model, conflict handling, presence indicators, and version-history behaviour must be specified in the Technical Design Document and Feature Specification before implementation.

### 9.17 PAGE-FR-16 — File attachments and sharing

Pages must support file attachments as content blocks. Files are stored and managed through a shared attachment capability rather than being embedded as unstructured binary content inside the Page document.

For page sharing:

- A recipient with permission to view a Page must be able to access the files attached to that Page where the file is part of the shared content.
- A recipient must not be able to access an attachment by guessing or reusing its URL or identifier after access is revoked.
- A Page's attachment references must not expose files attached only to unrelated private Pages.
- Removing an attachment block must not automatically delete the underlying stored file if it is referenced elsewhere.
- Deleting the underlying file must require an explicit action and appropriate permission.

The exact inheritance behaviour for child Pages, linked Pages, and shared database records is an owner decision listed in Section 15. No implementation may infer that sharing one Page grants access to every linked Page.

### 9.18 Pages acceptance criteria

- A user can create a Page, edit its title, add content blocks, save, leave, and reopen it with the content intact.
- A user can create a nested Page and move it without breaking internal links.
- The slash menu can insert each initial block type at the current editor position.
- Blocks can be reordered, duplicated, and deleted without corrupting neighbouring blocks.
- A simple table supports adding/removing rows and columns and editing cells.
- A database supports records, defined property types, sorting, filtering, and table view.
- A database record can open as a Page.
- Internal Page links resolve after the destination Page is renamed or moved.
- The graph displays the source Pages and the supported relationships between them.
- Selecting a graph node opens the correct Page.
- A workout tracker can be built using the ordinary Page and table/database features without a dedicated Workouts module.
- No more than three Page shortcuts can be pinned to the top navigation.
- An inaccessible Page or file is not exposed through graph data, search results, or stale links.

## 10. Notifications and reminders

### 10.1 NOT-FR-01 — Shared notification capability

Life Tracker must provide one notification capability that can be used by Life Planner, Keep, and Pages. Each module must not implement a separate, incompatible reminder system.

The notification capability must support:

- Creating a reminder associated with a supported item.
- Editing a reminder.
- Removing a reminder.
- Delivering an in-application notification where the user is active.
- Delivering a browser push notification when the user has granted permission and the browser/platform supports it.
- Showing the reminder's source so the user can open the related item.
- Respecting the user's notification permission and settings.

### 10.2 NOT-FR-02 — Reminder command syntax

The reminder parser must recognise these exact relative-duration commands:

| Command | Meaning |
|---|---|
| `/remind 1w` | One week before the associated scheduled date/time |
| `/remind 3d` | Three days before the associated scheduled date/time |
| `/remind 2d` | Two days before the associated scheduled date/time |
| `/remind 1d` | One day before the associated scheduled date/time |
| `/remind 2h` | Two hours before the associated scheduled date/time |

The command is relative to the date/time of the item being created or edited. It is not relative to the moment when the user types the command.

A single item may have multiple reminders. Adding a reminder must not replace previously configured reminders unless the user explicitly removes or edits them.

The parser must reject unsupported or malformed duration values with a clear explanation; it must not silently interpret an unknown value as a supported duration.

### 10.3 NOT-FR-03 — Supported reminder sources

The reminder system must be designed for use by:

- Life Planner calendar items and planner-related items that have a reminder-relevant scheduled date/time.
- Keep notes.
- Pages to-do blocks and database records that have a reminder-relevant date property.

A reminder attached to a Keep note may use an explicitly selected date/time even if the note has no calendar schedule.

### 10.4 NOT-FR-04 — Browser push permissions

- The application must request browser notification permission only in response to a clear user action or an appropriate onboarding/settings interaction.
- Denying permission must not prevent the user from using Life Tracker.
- The interface must show whether push notifications are enabled, denied, or not yet requested where the browser exposes that state.
- Push delivery requires a supported browser and a secure origin. The application must not claim that a notification was delivered when the browser has not confirmed or cannot provide that information.

### 10.5 NOT-FR-05 — Reminder rescheduling and lifecycle

If the associated item's scheduled date/time changes, reminders defined relative to that item must be recalculated. If the item is deleted, reminders associated with it must not continue to fire as though the item were active. Restoring the item must restore or recalculate its reminders according to the final lifecycle rules.

### 10.6 Reminder decisions requiring specification

Before implementation, the Feature Specification must define:

- The default delivery time for reminders attached to all-day or date-only items.
- Behaviour when a reminder time has already passed when it is created.
- Whether missed reminders are delivered late, discarded, or shown as overdue.
- The exact user controls for quiet hours and notification categories.

These behaviours are deliberately not guessed in this PRD.

### 10.7 Notification acceptance criteria

- Each supported reminder command creates the expected relative reminder.
- Two or more reminders can coexist on one item.
- Rescheduling an item recalculates its relative reminders.
- Removing an item prevents its active reminders from firing.
- A user who denies push permission can continue using reminders through supported in-app mechanisms.
- A browser push notification, when supported and permitted, identifies the source item and opens the correct content when selected.

## 11. Mobile application and PWA

### 11.1 MOB-FR-01 — Separate mobile-focused experience

The mobile interface must be designed specifically for phone-sized screens and touch interaction. It must not simply shrink the desktop layout.

The mobile and desktop experiences share:

- The same accounts and authentication.
- The same server-side application and data.
- The same content and permissions.
- The same underlying product rules.

They may use different navigation, page composition, component arrangements, and interaction patterns.

### 11.2 MOB-FR-02 — Mobile navigation

The mobile interface must provide a navigation pattern appropriate for a phone. It must expose Home, Week, Keep, Pages, and user-pinned Pages without requiring desktop hover behaviour.

The exact bottom-navigation versus drawer arrangement is a visual-design decision. It must be resolved in the design/feature specification before implementation; it must not change the information architecture or the three-shortcut maximum.

### 11.3 MOB-FR-03 — Touch interactions

All critical user flows must be operable without a mouse or keyboard. Drag-and-drop interactions must have touch-accessible alternatives, including tap-based menus or long-press interactions where appropriate.

### 11.4 MOB-FR-04 — PWA installation

The application must be installable as a PWA on supported browsers and platforms. The installed experience must use standalone display mode where supported, with suitable application icons and install metadata.

### 11.5 MOB-FR-05 — Offline behaviour

The PWA must provide an offline application shell and a defined level of cached data access. The initial offline capability must not claim that server-dependent actions have succeeded while disconnected.

Keep has a specific offline-view/edit/synchronisation target in Section 8. Pages offline editing is not a launch prerequisite; it may be added after page editing and sync behaviour are stable.

### 11.6 MOB acceptance criteria

- The PWA can be installed on supported mobile browsers.
- The installed application opens without browser URL chrome where the platform supports standalone PWA mode.
- Home, Week, Keep, and Pages are usable on a phone-sized viewport.
- No essential feature requires hover-only interaction.
- Calendar and planner operations have touch-accessible alternatives to desktop dragging.
- Offline state is clearly indicated when the application cannot reach the server.

## 12. Onboarding and documentation

### 12.1 ONB-FR-01 — First-time tutorial

A guided product tour must be shown to a new user on their first eligible sign-in after the tutorial is introduced. It must not repeatedly appear for existing users who have already completed or skipped it.

The tutorial must explain only the essential actions needed to begin using Life Tracker. It does not need to explain every button, setting, or advanced option.

### 12.2 ONB-FR-02 — Tutorial presentation

- Highlight the relevant interface element.
- Dim the surrounding interface while a step is active.
- Display a short explanation near the highlighted element.
- Provide Next, Back where applicable, Skip, and Finish controls.
- Allow the user to skip the tutorial at any time.
- Record whether the user completed or skipped the tutorial so it is not automatically repeated.

### 12.3 ONB-FR-03 — Module-specific help

The Settings area must contain a documentation/tutorial page. It must explain the core workflows and provide a way to restart the initial tutorial.

When Keep and Pages are added, their essential workflows must have module-specific help. Introducing a new module must not force existing users to replay the entire application tutorial.

### 12.4 ONB acceptance criteria

- A new user is offered the tutorial once.
- A user can skip it immediately or at any step.
- A completed or skipped tutorial is not automatically replayed on each login.
- The user can access documentation from Settings.
- The user can deliberately restart the tutorial from Settings.

## 13. Shared platform capabilities

The following capabilities support more than one module and must be treated as shared product services rather than independently implemented duplicates.

| Shared capability | Consumers | Product requirement |
|---|---|---|
| Authentication/account | All modules | One account and sign-in experience |
| User preferences | All modules | Shared user-level preferences, including timezone and theme mode |
| Notification/reminder | Life Planner, Keep, Pages | One reminder lifecycle and delivery capability |
| File attachments | Keep, Pages | Consistent upload, storage, access, and download behaviour |
| Search | Keep and Pages initially | Search must respect permissions and identify the source module |
| Sharing/permissions | Calendar, Keep, Pages | Explicitly scoped permissions; no accidental permission inheritance across modules |
| Undo | Life Planner, Keep, Pages | Consistent application-level action history and feedback |
| Page navigation | Pages and header | Stable page identities and up to three user-pinned shortcuts |

This PRD defines the product need for shared capabilities. The Technical Design Document defines whether a shared capability is implemented through common code, shared services, or another internal design. The product must remain one deployable application unless a separate architectural decision is approved.

## 14. Non-functional requirements

### 14.1 NFR-01 — Data ownership and self-hosting

- The application must remain suitable for self-hosting.
- Core functionality must not depend on a paid third-party productivity service.
- User content must be stored in the Life Tracker deployment or in storage explicitly configured by its operator.
- The application must provide a reliable backup and restore path for all user content, including newly introduced notes, Pages, databases, and attachments.

### 14.2 NFR-02 — Privacy and security

- All private content is private by default.
- All read and write operations must enforce ownership and sharing permissions on the server.
- Shared files must use the same access policy as the content that references them, unless a separate explicit file-sharing rule is approved.
- Search, graph generation, exports, and notifications must not leak content that the current user cannot access.
- Secret or private content must not be included in another user's calendar/share response.
- The product must not add third-party analytics or telemetry without explicit owner approval.

### 14.3 NFR-03 — Accessibility

- Controls must be semantic and keyboard accessible.
- Visible focus indicators must be provided.
- Colour must not be the only signal for status, category, permission, or relationship type.
- Text and interface contrast must meet the project's accessibility target (WCAG AA contrast as the baseline; 4.5:1 for normal text and 3:1 for large text and relevant graphical controls).
- Dialogs, menus, and guided-tour steps must manage focus correctly.

### 14.4 NFR-04 — Reliability and data integrity

- Saving a successful user action must not silently lose data on page navigation or reload.
- Database migrations must preserve existing user data.
- Backup and restore must include uploaded files and their metadata, not only database rows.
- Interrupted uploads must not leave apparently valid but unusable attachments.
- Offline changes must be visibly pending until synchronisation succeeds.

### 14.5 NFR-05 — Performance

The current repository's requirements set a baseline target of Home under 1.5 seconds on LAN and under 3 seconds through the external tunnel. New modules must not materially regress the existing Life Planner baseline.

The Feature Specification and Technical Design Document must define separate measurable targets for:

- Opening the Keep overview with a representative note collection.
- Opening and editing a Page of representative size.
- Loading a database view with representative row counts.
- Rendering a knowledge graph with representative node/edge counts.
- Uploading and opening files within the configured size limits.

Those values are not invented in this PRD because no representative production dataset or hosting capacity has been agreed for the new modules.

### 14.6 NFR-06 — Browser and platform support

- Desktop support must retain the current project's supported modern browsers.
- Mobile support must target current mobile browsers that support the required PWA capabilities.
- Push notifications, standalone display, file access, and offline APIs must be feature-detected; unsupported capabilities must degrade gracefully.

### 14.7 NFR-07 — Maintainability

- New modules must not be implemented as unrelated duplicated applications.
- Product features must have testable acceptance criteria.
- Critical workflows must have automated tests at suitable unit and end-to-end levels.
- The implementation must preserve the project's existing linting, type-checking, and testing quality gates.

## 15. Explicit decisions still required

The following questions are not resolved by the current product-owner instructions. They must be decided before implementation reaches the affected feature. Until then, implementers must not invent a default and present it as owner-approved.

| ID | Decision | Why it matters | Must be decided by |
|---|---|---|---|
| D-01 | When sharing a parent Page, are child Pages shared automatically, individually, or only when explicitly selected? | Defines inheritance and accidental data exposure | Page-sharing design |
| D-02 | Do internal Page links expose the destination Page to a collaborator, or does the collaborator need a separate grant? | Defines link behaviour and permissions | Page-sharing design |
| D-03 | Can a shared database be edited as a whole, or can individual records have separate permissions? | Defines collaborative database access | Database/sharing design |
| D-04 | Can Pages be shared through public/anonymous links, or only with registered Life Tracker accounts? | Defines authentication and exposure model | Page-sharing design |
| D-05 | What happens when two users edit the same block simultaneously? | Required for Google Docs-like collaboration | Collaboration technical design |
| D-06 | What is the default reminder delivery time for an all-day or date-only item? | Relative reminder needs a clock time | Reminder specification |
| D-07 | What is the behaviour for reminders created after their trigger time? | Prevents ambiguous missed-reminder behaviour | Reminder specification |
| D-08 | What are the default notification quiet hours and controls? | Affects user experience and delivery | Notification settings design |
| D-09 | What is the default theme mode for brand-new accounts: Dark or Automatic? | Existing application is dark by default, while automatic mode is new | Theme settings design |
| D-10 | What is the maximum nested checklist depth in Keep? | Kept currently documents four levels | Keep editor specification |
| D-11 | What is the maximum allowed upload size and which file types are accepted? | Required for storage, security, and UI limits | Attachment technical design |
| D-12 | What are the conflict rules for offline edits to the same note? | Required before offline editing is enabled | Offline sync design |
| D-13 | Which mobile navigation composition is preferred (bottom navigation, drawer, or another pattern)? | Visual choice; does not alter product structure | Mobile wireframes |
| D-14 | Should Keep support background images as well as note colours? | Kept supports backgrounds; scope should be confirmed against desired parity | Keep visual design |
| D-15 | Should a pinned Page shortcut support a custom display label/icon independent of the Page title/icon? | Affects header customisation | Navigation design |

A decision may be closed by the product owner or by a later approved product document. Until closed, the affected implementation must remain blocked or use a clearly isolated prototype that is not treated as the final product behaviour.

## 16. Scope exclusions

The following are explicitly outside the current approved product scope:

1. **Places, Lists, People, and Ideas as separate modules.** These were removed from the current Life Tracker application direction. Do not reintroduce them as top-level modules without a new product decision.
2. **Workouts as a dedicated module.** Workout tracking is a user-created Page using tables and/or databases.
3. **Separate deployment per module.** Keep and Pages are routes/modules inside the Life Tracker application.
4. **Native iOS/Android applications.** The approved mobile target is a mobile-focused web/PWA experience.
5. **Native-only Kept capabilities.** OS widgets, native share sheets, device-only mode, native geofencing, and native platform integrations are excluded as described in Section 8.14.
6. **A graph editor as the primary way to create content relationships.** The initial knowledge graph is generated from Page links and hierarchy and is read-only with respect to relationships.
7. **A general-purpose spreadsheet engine.** Pages databases provide structured records and views; advanced spreadsheet formulas/macros are not part of the initial release.
8. **Automatic switching of calendar views based on time.** The 7:00 AM–5:00 PM schedule applies to theme switching only.
9. **AI-generated notes, AI summaries, AI graph relationships, or AI assistants.** These are not required for the defined product.
10. **Unrestricted anonymous file hosting.** Attachments are content associated with authorised notes or Pages, not a public file-sharing service.

## 17. Delivery priorities and release boundaries

The entire product scope is approved as the target direction, but implementation must be staged. Feature completion must be assessed against the acceptance criteria, not against the number of screens or database tables created.

### Release 1 — Life Planner refinement and shared foundations

- Fix the intermittent missing delete control.
- Extend undo into a consistent application-wide capability.
- Add Alt-drag duplication for the agreed planner object types.
- Add automatic theme mode and timezone/schedule preferences.
- Introduce the shared navigation model and three-slot Page shortcut rule.
- Establish the product-level shared-service boundaries required by future modules.

### Release 2 — Keep core

- Separate Keep route and navigation entry.
- Text notes and checklist notes.
- Labels and binders.
- Colours, pinning, archive, and trash.
- Search and ordering.
- Image, drawing, link, and file attachment support.
- Integration with the shared notification system.

### Release 3 — Keep extended capabilities

- Browser push reminders.
- Import/export and backup/restore.
- Note sharing and collaborative editing.
- PWA offline viewing and editing/synchronisation.

### Release 4 — Pages foundation

- Pages workspace and hierarchy.
- Block editor and slash menu.
- Initial block types and block manipulation.
- Internal Page links.
- Page search.
- Page pinning in the header.

### Release 5 — Pages databases

- Simple tables.
- Structured databases and properties.
- Table view, sorting, filtering, and saved views.
- Database records that open as Pages.
- Later database views and relations.

### Release 6 — Knowledge graph and sharing foundation

- Graph generated from page hierarchy and explicit links.
- Graph navigation and filters.
- Attachment storage and references.
- Page-level sharing and permission enforcement.
- Collaborative editing and version/history behaviour after the required decisions are closed.

### Release 7 — Mobile/PWA completion

- Dedicated mobile layouts and navigation.
- Touch interaction alternatives.
- PWA installation and application shell.
- Offline capabilities and push notification support.

Mobile design must be considered during earlier implementation. This release means completion of the dedicated mobile experience, not the first time mobile is considered.

### Release 8 — Onboarding and final polish

- First-time tutorial.
- Settings documentation/tutorial page.
- Module-specific help.
- Accessibility, performance, and usability review.

The release order is a recommended dependency sequence, not a calendar commitment. No delivery dates are defined by this PRD.

## 18. Product-level acceptance checklist

Life Tracker's expanded product scope is ready for general use only when all applicable items below pass:

### Life Planner
- [ ] Existing Home and Week workflows still function.
- [ ] The intermittent missing delete control is fixed.
- [ ] `Ctrl+Z` works globally for supported application actions.
- [ ] Undo feedback identifies the reversed action.
- [ ] Alt-drag duplicates supported planner objects without modifying the source.

### Theme and timezone
- [ ] Light, Dark, and Automatic modes are available.
- [ ] Default schedule is Light 07:00–17:00 and Dark 17:00–07:00 in the configured timezone.
- [ ] Malaysia (`Asia/Kuala_Lumpur`) is the default timezone.
- [ ] Users can change the timezone and schedule.
- [ ] Theme mode does not switch calendar views.

### Keep
- [ ] Keep is accessible from the main header beside Week.
- [ ] Text notes and nested checklists work.
- [ ] Images, drawings, links, and file attachments work.
- [ ] Binders and labels are separate, functional organisation features.
- [ ] Pin, archive, trash, restore, search, and ordering work.
- [ ] Reminders use the shared notification system.
- [ ] Import/export, sharing, collaboration, and offline behaviour meet their approved release requirements.

### Pages
- [ ] Users can create and nest Pages.
- [ ] Users can edit Pages using the block editor.
- [ ] The slash menu inserts supported blocks.
- [ ] Blocks can be moved, duplicated, and deleted.
- [ ] Simple tables and structured databases both work.
- [ ] Database records can open as Pages.
- [ ] Internal links survive destination renames and moves.
- [ ] The knowledge graph is generated from actual Page relationships.
- [ ] A workout tracker can be created using ordinary Pages functionality.
- [ ] Up to three Pages can be pinned in the top navigation, never more.
- [ ] Page sharing and file permissions do not leak private content.

### Notifications
- [ ] The five agreed reminder commands parse correctly.
- [ ] Multiple reminders can be set for one item.
- [ ] Reminders recalculate when their associated scheduled time changes.
- [ ] Browser push works when supported and permitted.
- [ ] Unsupported push behaviour degrades gracefully.

### Mobile/PWA
- [ ] The mobile interface is intentionally designed for phone-sized screens.
- [ ] Core workflows are touch-operable.
- [ ] The PWA installs on supported browsers.
- [ ] Offline state and pending changes are visible.

### Onboarding
- [ ] New users are offered a concise guided tour.
- [ ] The tour can be skipped.
- [ ] Completion/skip state is saved.
- [ ] Help and tutorial documentation are available from Settings.

## 19. Change control

This PRD is the baseline for product scope. A scope change must record:

1. What requirement is being added, changed, or removed.
2. Why the change is needed.
3. Which modules, shared services, data, permissions, and user workflows are affected.
4. Whether the change alters an acceptance criterion or release dependency.
5. Whether it creates migration or backwards-compatibility work.

A developer must not interpret an implementation convenience as permission to remove an approved user-facing requirement. A product-owner decision that changes scope must be reflected in this PRD before the implementation is treated as the new baseline.

## 20. Repository baseline and source references

The initial existing-product baseline was checked against the following repository documents on 12 November 2026:

- [README.md](https://github.com/chicenwangs/lifetracker/blob/main/README.md) — repository overview, code areas, and the documented application status.
- [docs/REQUIREMENTS.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/REQUIREMENTS.md) — previous functional requirements and acceptance criteria.
- [docs/P1-NOTES.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/P1-NOTES.md) — documented behaviour of the current build; this file says it takes precedence over older requirements and technical notes where they differ.
- [docs/HANDOFF.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/HANDOFF.md) — project handoff, code map, deployment status, and current next steps.
- [docs/TECHNICAL.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/TECHNICAL.md) — existing technical baseline and time/data/security rules.
- [Kept repository](https://github.com/ericerkz/kept) — reference for the desired Keep-like web feature set.

The repository README and HANDOFF contain different reported unit-test counts (237 and 258 respectively). This PRD does not choose between those figures. The current test count must be verified from the repository/CI before it is used as a release metric.

## 21. Glossary

| Term | Meaning |
|---|---|
| Life Planner | The calendar and scheduling experience consisting of Home, Week, calendar items, and planner blocks |
| Keep | The quick-capture notes experience inside Life Tracker |
| Pages | The flexible document and database workspace inside Life Tracker |
| Page | A user-created document/container in Pages with a stable identity |
| Block | An individually editable content unit inside a Page |
| Simple table | A manually edited table block without database behaviour |
| Database | A structured collection of records with properties and views |
| Record | An individual entry in a database; may open as a Page |
| Binder | A named collection of Keep notes |
| Label | A tag that can be applied to Keep notes and used for filtering |
| Attachment | A stored file referenced by a note or Page |
| Page shortcut | A user-selected Page link displayed in the main header; maximum three per user |
| Knowledge graph | A generated visualisation of Pages and their relationships |
| Reminder | A scheduled notification associated with a supported item |
| PWA | Progressive Web App, the installable web application experience on supported browsers |

---

**End of Product Requirements Document**
