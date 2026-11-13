# Life Tracker — Feature Specification

**Document version:** 1.0  
**Document type:** Feature Specification (FS)  
**Parent document:** [Life Tracker Product Requirements Document v1.0](./Life_Tracker_PRD_v1.0.md)  
**Product owner:** Jeremy (`chicenwangs`)  
**Repository:** https://github.com/chicenwangs/lifetracker  
**Document date:** 12 November 2026  
**Status:** Detailed behaviour baseline for implementation planning  
**Default timezone:** `Asia/Kuala_Lumpur`

---

## 1. Purpose and relationship to the PRD

This document translates the approved product requirements into concrete user-facing behaviour. It defines screens, controls, interaction rules, validation, loading/empty/error states, and test cases. It is intended to let implementation work proceed without each developer independently deciding what a feature means.

The PRD remains authoritative for product scope. This Feature Specification is authoritative for the detailed behaviour defined here. The Technical Design Document will define how the approved behaviour is implemented: application architecture, data model, APIs, libraries, storage, migrations, synchronisation, and deployment.

### 1.1 Requirement language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT:** required for acceptance.
- **SHOULD / SHOULD NOT:** expected unless a documented technical or usability reason is approved.
- **MAY:** optional capability, not a release blocker unless separately promoted to a MUST.

### 1.2 Priority labels

| Priority | Meaning |
|---|---|
| P0 — Preserve | Existing behaviour that must not regress while the product expands. |
| P1 — Core | Required for the first usable release of the affected feature. |
| P2 — Extended | Required for the complete planned feature set, but may follow the core release. |
| P3 — Deferred | Explicitly planned for a later milestone or dependent on an unresolved decision. |

A priority label is not a statement that the feature is already implemented.

### 1.3 Status labels

| Status | Meaning |
|---|---|
| Existing baseline | Described in current repository build notes; not independently re-tested by this document. |
| New requirement | Approved product behaviour that must be implemented. |
| Deferred | In approved scope but intentionally not required for the first usable release. |
| Blocked by decision | Cannot be finalised until an owner decision listed in Section 20 is made. |

### 1.4 Scope precedence

1. Current owner-approved PRD and later owner decisions.
2. This Feature Specification for detailed behaviour.
3. Current repository build notes for existing implementation facts.
4. Older requirements and technical documents, only where they do not conflict with newer decisions.

Older project documents that describe Workouts as a separate module, mobile as an afterthought, or Keep/Pages as excluded are superseded for future planning. Existing data and working features must not be deleted merely because the old plan has changed.

---

## 2. Product structure and global conventions

### 2.1 Primary experiences

Life Tracker has three primary experiences:

| Experience | Route concept | Purpose | Independent module? |
|---|---|---|---|
| Life Planner | Home and Week | Calendar, time planning, planner blocks, scheduled work | Yes, within the application |
| Keep | Dedicated Keep route | Quick notes, checklists, binders, labels, attachments and reminders | Yes, within the application |
| Pages | Pages workspace and Page routes | Flexible documents, tables, databases, relations and knowledge graph | Yes, within the application |

Keep is a separate user experience reachable from the primary header. It is not a new independently deployed application. Pages is a general-purpose workspace. A workout tracker is a user-created Page, not a separate module.

### 2.2 Shared interaction conventions

1. A successful save must be acknowledged by a saved state or by the normal disappearance of a save indicator. A failed save must remain visible to the user.
2. Destructive actions must be distinguishable from ordinary navigation or close actions.
3. Controls that appear on hover on desktop must have a touch-accessible alternative on mobile.
4. Keyboard shortcuts must not break normal text editing or browser navigation.
5. Empty states must explain what the user can create or do next. They must not look like a failed load.
6. Loading, empty, error, and permission-denied states must be visually distinct.
7. A list or graph must never reveal the title, content, attachment, or metadata of an object the current user cannot access.
8. The same item must not be duplicated in a list merely because it belongs to multiple binders or has multiple labels. Filter results must return each note once.
9. User-visible dates and times use the user's selected timezone. Storage and conversion rules are implementation concerns defined by the Technical Design Document.
10. The application must not show a success message before the server or local persistence layer confirms that the operation succeeded.

### 2.3 Primary header

The desktop header contains, in this order:

1. Application mark.
2. Home.
3. Week.
4. Keep.
5. Zero to three user-pinned Page shortcuts.
6. Existing global actions that remain in the header, such as quick add and account/settings access.

The exact position of search and quick-add may preserve the current header arrangement, provided the three primary experiences and Page shortcuts remain clear and the header does not overflow at supported desktop widths.

**Header Page shortcut rules**

- A `Pin to header` action is available from an eligible Page.
- A pinned Page appears after Keep.
- The user can reorder pinned Pages.
- The user can unpin a Page without deleting it.
- A maximum of three Page shortcuts is enforced by the application, not only by hiding the button.
- When three Pages are already pinned, the pin action is disabled or offers a clear replacement/unpin path; it must not create a fourth slot.
- If the Page title changes, the shortcut label updates to the current Page title unless a separate custom-label capability is later approved.
- If the user loses access to a shared Page, the shortcut is removed or shown as unavailable without leaking its content.

**Acceptance checks**

- With zero pinned Pages, the header shows Home, Week, and Keep without blank placeholder slots.
- With one, two, or three pinned Pages, all appear after Keep.
- Attempting to pin a fourth Page does not succeed.
- Unpinning a Page does not modify the Page itself.
- Reordering shortcuts persists for that user across sessions and devices.

### 2.4 Global application states

Every primary route must support these states:

| State | Expected presentation |
|---|---|
| Loading | Stable skeleton or progress state; avoid flashing an empty-state message before data resolves. |
| Loaded with data | Normal content. |
| Loaded with no data | Purpose-specific empty state and primary create action. |
| Network/server error | Clear message that data could not be loaded or saved; provide retry where retry is safe. |
| Signed out/session expired | Return to sign-in while preserving a safe return destination where supported. |
| Permission denied | Show an unavailable/permission message without rendering protected data. |
| Offline | Show offline status and identify which actions are available locally. |

---

## 3. Life Planner feature specifications

### 3.1 PL-UI-01 — Home

**Priority:** P0 — Preserve  
**Status:** Existing baseline with required bug fixes and undo expansion.

Home remains the main calendar and daily planning screen.

**Existing documented layout**

- Month calendar occupies approximately two-thirds of the desktop content width.
- Day planner occupies approximately one-third.
- Due-today calendar items can be dragged into the day planner.
- Month items use their existing type colours and title/time presentation.
- Day planner supports time blocks, drag-to-create, move, resize, and a configurable visible-hour range.
- At narrower desktop widths, the planner moves below the calendar.

**Required behaviour**

- Preserve the current month navigation and calendar interaction.
- Preserve day-planner navigation between previous day, next day, and Today.
- Preserve the existing visible-hour controls and planner block behaviour.
- Preserve the existing item type/status presentation.
- Preserve current user-specific calendar data and settings.
- Do not change Home into a dashboard that displaces the calendar as the primary experience.

**States**

- No calendar items: show the month calendar and an empty planner, with the existing quick-add affordance.
- No planner blocks: show an empty timeline with the existing drag-to-create affordance.
- Loading: retain the page geometry while data loads.
- Failed refresh: retain the last confirmed state where possible and display an error/retry indication; do not silently replace it with an empty calendar.

### 3.2 PL-UI-02 — Week

**Priority:** P0 — Preserve  
**Status:** Existing baseline.

Week remains a distinct weekly schedule view with a seven-day time grid and its existing side information.

Preserve:

- Weekly time grid and all-day row.
- Existing week navigation and selection.
- Existing month heatmap and week-of-month navigation.
- Existing Not Scheduled list and drag interactions.
- Existing statistics.
- Existing overlap calendar display and its privacy treatment.

Week is not replaced by a Pages database calendar view. A database calendar view is a separate Pages capability.

### 3.3 PL-UI-03 — Delete/remove control consistency

**Priority:** P1 — Core bug fix.

The current build notes describe hover `⊗` delete controls on calendar chips, planner blocks, and Week rows. The reported defect is that the `X` control sometimes does not appear.

**Required behaviour**

- Every deletable calendar chip, planner block, all-day chip, and list row exposes the correct delete/remove control in its supported interaction state.
- On desktop, controls may appear on hover and keyboard focus. The control must remain visible while the pointer is over the control itself.
- On touch devices, the same operation must be available through a visible action or item action menu; hover cannot be the only trigger.
- The control must not be clipped, covered by a sibling, placed outside the hit area, or hidden by an incorrect stacking context.
- The accessible name must identify the operation and object, such as `Delete Study networking`.
- Activating the control must invoke the existing deletion flow and global undo behaviour where eligible.

**Failure cases**

- If deletion fails, the item remains visible and an error is shown.
- Double activation must not create two deletion operations.
- Deleting an item with linked planner blocks follows the existing item deletion rules; linked objects must not become orphaned.

### 3.4 PL-UI-04 — Item and planner block behaviour

**Priority:** P0 — Preserve.

Preserve existing item detail fields and interactions: title, type, date, optional time, optional inclusive end date, status, markdown notes, and the private/secret flag used by shared calendars.

Preserve current planner block operations:

- Drag an empty time slot to create a draft block.
- Drag a block body to move it.
- Drag a block edge to resize it.
- Use 15-minute snapping.
- Preserve the existing minimum block duration of 15 minutes.
- Support overnight blocks as already documented.
- Preserve keyboard operation for planner block movement/editing where currently supported.

Do not reinterpret item dates as UTC timestamps or silently shift a date when an item is moved between calendar days. Existing repository time rules remain authoritative until a new technical decision is approved.

### 3.5 PL-UI-05 — Existing quick-add

**Priority:** P0 — Preserve.

The existing `N` quick-add palette and its command grammar must remain functional. It currently supports title, day, time, type, destination commands, a live timeline preview, and batch entry. It defaults to planner-only behaviour, while `/calendar` and `/both` select other destinations.

This Feature Specification does not redefine the existing parser grammar. Any new reminder syntax must be added without breaking existing commands or changing the meaning of existing commands.

### 3.6 PL-UNDO-01 — Global undo manager

**Priority:** P1 — Core.

**Entry points**

- `Ctrl+Z` on desktop.
- An explicit Undo action in the centred undo notification where applicable.
- Any existing explicit per-action Undo controls remain valid and must route through the same action history.

**Scope**

The global undo system must support reversible mutations from Home, Week, Keep, and Pages as each becomes available. The list of supported action types is defined below.

| Module | Reversible actions required |
|---|---|
| Life Planner | Create, edit, move, resize, duplicate, delete/restore supported calendar items and planner blocks |
| Keep | Create, edit, reorder, move between binders, pin/unpin, archive/restore, trash/restore, checklist edits and completion |
| Pages | Create Page, edit title, move Page, create/edit/reorder/duplicate/delete blocks, create/edit/delete supported database records and relations |

An action that cannot be safely reversed must not be presented as undoable. Permanent deletion is not undoable after the permanent-delete operation succeeds.

**Keyboard rules**

- `Ctrl+Z` invokes the latest supported application action when focus is outside a text-editing control.
- In input, textarea, contenteditable, and rich-text editing contexts, native/editor text undo takes precedence.
- The application must not hijack `Ctrl+Z` while the user is editing a text value.
- Browser back/forward navigation must not be triggered by the shortcut.
- On macOS, `Cmd+Z` SHOULD provide equivalent behaviour if the application supports the platform. This is a platform usability requirement, not a separate undo model.

**Action history rules**

- The newest eligible action is undone first.
- After undo, the action is removed from the active undo stack.
- Undoing one action must not undo earlier actions in the same user operation unless the user repeats the shortcut.
- Multi-record operations that are atomic in the interface (for example, deleting an item together with linked blocks) are one undo unit.
- Undo must restore original ordering, dates, times, properties, references, and relationships for the affected object.
- An undo failure must not partially restore an operation. The application must show an error and leave the last confirmed state intact.
- A new independent action after an undo starts a new forward history branch. Redo is not required by the current PRD and must not be added as a dependency of this release.

**History lifetime**

The initial requirement is an application-session undo history. It is not a cross-device or durable historical version system. Refresh/relogin persistence is not promised by this Feature Specification. Persistent version history is a separate later capability.

**Undo notification**

- Show a small temporary notification near the horizontal and vertical centre of the viewport after a successful undo.
- Include an undo icon, a concise description, and the `Ctrl+Z` hint on desktop.
- Reuse the existing five-second notification duration unless usability testing demonstrates that it is insufficient.
- A subsequent undo updates the notification to the most recently undone action rather than leaving multiple notifications covering the screen.
- The notification must not block interaction with the rest of the page.
- On mobile, the notification must not obstruct the primary bottom navigation or active editor controls.

**Acceptance tests**

- Create an item; `Ctrl+Z` removes it.
- Move an item; `Ctrl+Z` restores its original date/time.
- Delete an item with linked blocks; one undo restores the item and linked blocks together.
- Edit text in an input; `Ctrl+Z` undoes the text edit, not a prior calendar action.
- Trigger two supported actions; two successive undo operations reverse them in reverse order.
- Attempt to undo a permanent deletion; no false success is shown.

### 3.7 PL-DUP-01 — Alt-drag duplication

**Priority:** P1 — Core for desktop planner.

**Trigger**

The user presses and holds `Alt` before or during a drag of a supported item/block and drops it at a valid destination.

**Result**

- The original remains at its original location and retains its original data.
- A new independent object is created at the drop destination.
- The new object receives a new identity and new creation/update metadata.
- The copied visible content and relevant user-editable properties are retained.
- Any destination-specific date/time or position is derived from the drop target, not copied as the old position.
- The new object is selected or otherwise clearly indicated after creation.
- The operation creates one undo entry.

**Invalid drop**

If the drop target is invalid, the duplicate is not created and the source remains unchanged. The interface must not create a duplicate at an unintended fallback location.

**Object mapping not fully settled**

The exact duplication mapping for linked calendar items, linked planner blocks, multi-day items, item status, private state, and linked associations is listed as decision D-05 in Section 20. Until approved, implementation must not silently duplicate linked objects in a way that changes their privacy, calendar membership, or relationship semantics. A standalone planner block duplicate is the minimum safe target.

---

## 4. Theme and timezone feature specifications

### 4.1 TH-UI-01 — Theme selector

**Priority:** P1 — Core.

The user's theme setting must expose exactly three modes:

- Light.
- Dark.
- Automatic.

Selecting Light or Dark applies that theme regardless of the time of day. Selecting Automatic calculates the active theme from the user's schedule and timezone.

The current header sun/moon toggle may remain as a quick theme control, but its state must be consistent with the three-mode preference. It must not make the persisted setting ambiguous.

### 4.2 TH-UI-02 — Automatic schedule defaults

Default schedule:

| Local time | Active theme |
|---|---|
| 07:00–16:59 | Light |
| 17:00–06:59 | Dark |

Boundary behaviour is exact:

- 06:59:59 → Dark.
- 07:00:00 → Light.
- 16:59:59 → Light.
- 17:00:00 → Dark.

The settings interface must allow the user to change the start of the Light period and the start of the Dark period. The selected times are interpreted in the selected timezone.

### 4.3 TH-UI-03 — Timezone preference

- Default value: `Asia/Kuala_Lumpur`.
- Display label: `Malaysia (Kuala Lumpur, UTC+08:00)` or an equivalent clear label.
- The setting must support selection of other valid IANA timezones.
- The setting is a user preference and must be consistent across the user's signed-in devices.
- Changing the timezone recalculates the currently active theme immediately.
- Timezone selection must not silently change calendar items' stored local dates or planner schedule values.

The Settings UI must clearly distinguish timezone from theme schedule. The timezone controls how the schedule is interpreted; it is not itself a theme mode.

### 4.4 TH-UI-04 — Manual override and automatic mode

- Selecting Light forces Light.
- Selecting Dark forces Dark.
- Selecting Automatic restores schedule-driven behaviour.
- Changing schedule times while in Light or Dark mode saves the schedule but does not override the selected fixed theme.
- Changing schedule times while in Automatic mode recalculates the active theme immediately.

### 4.5 TH-UI-05 — Schedule validation

- Both schedule times are required in Automatic mode.
- Times must be valid local clock times.
- The implementation must define and test the case where Light and Dark start times are identical. Recommended user-facing validation is to reject identical times and explain that the two periods must be distinct. This is a specification recommendation and must be confirmed before implementation if the product owner wants a different rule.
- The interface must show the resulting Light and Dark periods in plain language before the user saves.

### 4.6 Theme test cases

| Test ID | Setup | Expected result |
|---|---|---|
| TH-01 | Automatic, 06:59 Malaysia time | Dark |
| TH-02 | Automatic, 07:00 Malaysia time | Light |
| TH-03 | Automatic, 16:59 Malaysia time | Light |
| TH-04 | Automatic, 17:00 Malaysia time | Dark |
| TH-05 | Fixed Light, 22:00 | Light |
| TH-06 | Fixed Dark, 10:00 | Dark |
| TH-07 | Automatic; change timezone | Active theme recalculated using new timezone |
| TH-08 | Automatic; change start time | Active theme recalculated immediately after save |
| TH-09 | Calendar page open during theme switch | Calendar view and selected date remain unchanged |

---

## 5. Keep feature specifications

### 5.1 Keep navigation and layout

**Priority:** P1 — Core.

Keep is opened through the `Keep` item in the primary header. It has its own route and its own note-oriented layout. The Keep interface must not render the Pages tree or require users to create a Page before making a note.

**Desktop layout elements**

1. Keep page title.
2. Search field.
3. Note creation control.
4. Binder navigation/selector.
5. Label filter/selector.
6. Pinned notes area when non-empty.
7. Active notes collection.
8. Access to Archived and Trash collections.
9. Note cards/list items.

The exact desktop grid density may be set in visual design, but each note must remain readable and selectable. Grid/list layout selection is P2 and must not delay core note creation.

**Empty states**

- No notes: show a clear `Create note` action.
- No notes in selected binder: explain that the binder is empty and offer to add an existing note or create one.
- No search matches: show the search term and a clear action to clear search/filters.
- Empty Archive or Trash: show an informational empty state; do not show a create-note control as though notes belong in those views.

### 5.2 KEEP-01 — Create a text note

**Priority:** P1 — Core.

**Entry points**

- Main `New note` action.
- Quick-add action within Keep.
- Optional keyboard shortcut only if assigned and documented consistently with existing shortcuts.

**Interaction**

1. User activates New note.
2. A new editable note appears immediately.
3. User may type a title, body, or both.
4. The note saves automatically.
5. The user can leave the note without pressing a separate Save button.
6. The note appears in the active note collection.

**Required fields**

- Title: optional.
- Body: optional at initial creation; an entirely empty note may be discarded if the user exits without entering content. The exact empty-draft retention behaviour must be consistent and tested.

**Autosave**

- Changes must be persisted after a short debounce and when focus leaves the editor.
- The UI must distinguish saving, saved, and save failed.
- If the save fails, the user's unsaved text must remain on screen and be eligible for retry.
- Navigating away while a save is pending must not discard the user's input without warning.

### 5.3 KEEP-02 — Checklist notes

**Priority:** P1 — Core.

A checklist is a note type with a title and ordered checklist items.

**Interactions**

- Add a new item using the final empty row or an Add item control.
- Edit the item text inline.
- Check or uncheck an item.
- Reorder items by drag on pointer devices; provide a menu or keyboard alternative.
- Delete an item.
- Create a nested child item.
- Expand and collapse nested groups where nesting exists.
- Preserve completion state after reload.

**Completion behaviour**

- Checking an item marks only that item complete.
- Unchecking restores it to incomplete.
- Checking a parent does not automatically check every descendant unless the user explicitly chooses a bulk action. This avoids silently changing several checklist states.
- Completed items remain visible. A separate optional filter may hide completed items, but the default must not erase them.

**Nesting**

Kept documents nested checklist support. Life Tracker must support nested items. The maximum supported nesting depth is blocked pending owner decision D-08. The editor must not silently flatten items beyond the supported depth.

### 5.4 KEEP-03 — Images and image notes

**Priority:** P1 — Core attachment capability.

Users can attach one or more images to a note and create image-focused notes.

**Interactions**

- Select image files using the browser file picker.
- Paste an image from the clipboard where browser support permits.
- Show an upload/progress state.
- Show a thumbnail after successful upload.
- Open an image in a larger preview/lightbox.
- Remove an image from a note without automatically deleting the underlying file if referenced elsewhere.

**Validation and failures**

- Unsupported image type: reject with a readable explanation.
- File too large: reject before or during upload with the configured size limit shown.
- Upload failure: retain the note and identify the failed attachment; allow retry.
- Broken preview: show the filename or generic unavailable-image state rather than a broken image icon alone.

Allowed MIME types and maximum file size are blocked pending D-10.

### 5.5 KEEP-04 — Drawings

**Priority:** P2 — Extended.

A drawing note provides a blank canvas on which the user can draw with pointer, touch, or stylus input where supported.

Minimum interaction requirements:

- Create a new drawing note.
- Draw strokes.
- Undo the most recent stroke within the drawing editor.
- Clear the drawing with an explicit confirmation or reversible action.
- Save the drawing as part of the note.
- Reopen and continue editing the saved drawing.
- Remove a drawing from a note.

Colour palette, stroke width controls, eraser, background selection, and export format must be specified in the drawing feature detail before implementation. Drawing-specific undo must not conflict with the application-wide undo shortcut: while the drawing canvas is focused, the drawing editor's undo takes precedence.

### 5.6 KEEP-05 — Links and link previews

**Priority:** P2 — Extended.

- A URL pasted into a note is recognised as a link.
- The user can open the URL in a new browser context.
- Where preview information is available, show a compact preview with title, site/domain, and image where provided.
- If preview retrieval fails, keep the URL usable as a normal link.
- Preview retrieval must not block note saving.
- Preview generation must not expose private note text to the external website.
- Unsafe protocols must not be rendered as active links.

### 5.7 KEEP-06 — General file attachments

**Priority:** P2 — Extended.

- A user can attach a file using a file picker.
- The note shows the file name and a suitable type indicator.
- The user can download/open the file if authorised.
- The user can remove the attachment reference from the note.
- The attachment remains protected by the note's access permissions.
- A failed upload is recoverable without recreating the entire note.

Maximum file size, supported file types, and inline preview formats are blocked pending D-10. The application must not claim that every file type has a preview.

### 5.8 KEEP-07 — Labels

**Priority:** P1 — Core.

**Label management**

- Create a label.
- Rename a label.
- Delete a label.
- Apply a label to a note.
- Remove a label from a note.
- Apply multiple labels to one note.
- Filter the collection by one or more labels.

**Deletion behaviour**

Deleting a label removes the label and its associations. It does not delete notes.

**Display behaviour**

Labels are visible on notes where space permits and visible in the label filter area. Long label names must not break card layout; they may wrap or truncate with an accessible full name.

### 5.9 KEEP-08 — Binders

**Priority:** P1 — Core.

A binder is a named collection of notes. It is not a parent note and is not a Page.

**Interactions**

- Create binder.
- Rename binder.
- Delete binder.
- Open binder.
- Add an existing note to one or more binders.
- Remove a note from a binder.
- Reorder binders.
- Reorder notes within a binder.

**Membership rules**

- A note may belong to multiple binders.
- Removing a note from one binder does not remove it from another binder.
- Deleting a binder does not delete member notes.
- A note with no binder remains in the general notes collection.
- The same note appears once in a binder's note list even if multiple labels are applied to it.

### 5.10 KEEP-09 — Colour and background

**Priority:** P2 — Extended.

Users can choose a note colour from a defined palette. Users may also choose a background image if that capability is retained from the Kept reference set.

- The default note appearance uses the standard application surface.
- Changing a note colour changes presentation only; it does not change note type or permissions.
- Text and controls must remain legible against every available colour/background.
- Colour must not be the only indicator of note state.
- Removing a background returns the note to its normal surface.

Whether background images are required for the first Keep release is blocked pending D-09.

### 5.11 KEEP-10 — Pinning and ordering

**Priority:** P1 — Core.

- Pinning places a note in the Pinned collection/area.
- Unpinning returns it to its normal collection position.
- Pinning does not move a note into Archive or Trash.
- Users can reorder notes in the active collection and within binders.
- Pinned notes remain findable by search.
- A note in Trash must not remain in the active pinned area.

### 5.12 KEEP-11 — Archive

**Priority:** P1 — Core.

- Archive removes a note from the default active collection without deleting it.
- Archived notes remain searchable when the search scope includes Archive.
- Users can open an archived note.
- Users can unarchive/restore it to the active collection.
- Archiving a note does not remove its labels or binder memberships unless a later approved rule says otherwise.
- Archived notes do not trigger active reminders unless the reminder system's lifecycle rules explicitly allow them; this is blocked pending D-11.

### 5.13 KEEP-12 — Trash and permanent deletion

**Priority:** P1 — Core.

- Delete sends a note to Trash.
- The note disappears from active and archived collections.
- Trash lists deleted notes with enough information for the user to identify them.
- Restore returns the note to the active collection unless its former state is explicitly retained by the final lifecycle design.
- Permanent deletion requires an explicit second action.
- Permanent deletion removes the note and its exclusive content according to retention rules.
- If an attachment is shared or referenced elsewhere, deleting the note must not silently delete the shared file.

Automatic trash retention duration is not defined by the PRD and remains a decision for the owner/technical design. Do not copy the current Life Planner's 30-day trash purge rule to Keep without approval.

### 5.14 KEEP-13 — Search and filters

**Priority:** P1 — Core basic search; P2 — advanced filters.

Search must support:

- Note title.
- Note body text.
- Checklist item text.
- Labels.
- Binders.
- Note type (text, checklist, image, drawing, link, attachment) where applicable.
- Active, pinned, archived, and trash scopes.
- Date-related filtering/query support as a later enhancement.

**Search interaction**

- Search is available at the top of Keep.
- Results update after a deliberate input interval or submission; the interface must remain responsive while searching.
- The current query and filters are visible.
- Clearing the query restores the selected collection.
- Selecting a result opens the exact note.
- Search result ordering must be deterministic and documented by the implementation; do not imply relevance ranking if the implementation only sorts by date.

**Permissions**

Only notes accessible to the current user can appear in search results or snippets.

### 5.15 KEEP-14 — Reminders

**Priority:** P1 — Core time reminders; P2 — push delivery.

A reminder is attached to a note and represents an explicit date/time or an approved relative reminder command where the note has an associated scheduled time.

**Interactions**

- Add reminder.
- Select date and time.
- Save reminder.
- Edit reminder.
- Remove reminder.
- View upcoming reminder on the note.
- Open the note from a delivered notification.

Multiple reminders may be associated with a note. Adding a second reminder must not silently replace the first.

Relative command syntax is defined in Section 10. The UI must not accept a relative command if there is no unambiguous reference date/time.

### 5.16 KEEP-15 — Sharing and collaboration

**Priority:** P3 — Advanced.

A note can be shared with another registered user. The share control must identify the recipient and current permission.

Permission levels:

- View.
- Edit.

The owner can change a recipient's permission and revoke access. Recipients see the note in a shared area or a clearly marked shared context; the note must not be mistaken for their privately owned note.

When two users edit a shared note at the same time, changes must be synchronised and conflict behaviour must be explicit. The realtime update and conflict-resolution design is not finalised here; this capability is blocked until D-12 is approved and the Technical Design Document specifies the sync strategy.

### 5.17 KEEP-16 — Offline viewing and editing

**Priority:** P3 — Advanced.

- Previously downloaded/cached notes can be viewed while offline.
- If offline editing is enabled, a visible pending-sync indicator appears.
- Local changes are queued until connection returns.
- The interface must not report a change as server-synchronised while the device is offline.
- Sync failure must be visible and retryable.
- Conflict resolution must not silently overwrite one user's edit with another user's edit.

The offline conflict policy is blocked by D-12.

### 5.18 KEEP-17 — Import and export

**Priority:** P2 — Extended.

**Google Keep Takeout import**

- User selects a supported Takeout export.
- Application validates the archive and identifies supported files.
- Import preview reports the number and categories of notes to import where that information is available.
- User explicitly starts the import.
- Existing Life Tracker notes are not overwritten by imported notes.
- Imported notes preserve supported content, checklist items, images, labels, colours, and timestamps where the source provides them and mapping is possible.
- The result report distinguishes imported, skipped, and failed entries.

**Export**

- User can export their Keep content in a documented portable format.
- Export includes notes, checklist structure, labels, binders, reminders, and attachment files where supported.
- Export must clearly state any data that cannot be represented in the chosen format.

### 5.19 KEEP-18 — Backup and restore

**Priority:** P2 — Extended.

A full server backup must include Keep records and uploaded media/attachments. Restore must be documented and tested as part of the application backup capability. A per-user export is distinct from an instance-wide administrative backup.

### 5.20 Keep acceptance suite

| Test ID | Action | Expected result |
|---|---|---|
| KEEP-001 | Create a text note with title and body | Note persists and appears in active notes |
| KEEP-002 | Create a note with body only | Note is valid; title remains optional |
| KEEP-003 | Edit a note, navigate away after save | Latest text remains after reopening |
| KEEP-004 | Simulate save failure | Unsaved text remains visible; error and retry are available |
| KEEP-005 | Create checklist and check one item | Only selected item becomes complete |
| KEEP-006 | Add nested checklist item | Child appears under correct parent and persists |
| KEEP-007 | Add two labels and two binders | Note is included in both label and binder filters |
| KEEP-008 | Delete a binder | Binder disappears; notes remain |
| KEEP-009 | Delete a label | Label disappears; notes remain |
| KEEP-010 | Pin then archive a note | Note is not displayed as active pinned content |
| KEEP-011 | Archive then restore a note | Note returns according to defined restore behaviour |
| KEEP-012 | Trash then restore a note | Note is recoverable |
| KEEP-013 | Permanently delete a note | Explicit confirmation occurs; note is no longer recoverable through Trash |
| KEEP-014 | Search for checklist text | Correct note appears in results |
| KEEP-015 | Upload an unsupported file | Upload is rejected with explanation |
| KEEP-016 | Upload an image successfully | Image is displayed and can be reopened |
| KEEP-017 | Add a time reminder | Reminder appears on the note and is registered with notification service |
| KEEP-018 | Import malformed Takeout archive | Import fails safely with a useful report; existing data remains unchanged |
| KEEP-019 | User A opens User B's private note URL | Access is denied; note content is not returned |
| KEEP-020 | Revoke access to a shared note | Recipient cannot access it on the next authorised request |

---

## 6. Pages feature specifications

### 6.1 Pages workspace entry and layout

**Priority:** P1 — Core.

Pages has two primary surfaces:

1. **Pages workspace:** page navigation, search, creation, and workspace-level graph access.
2. **Page editor:** the content area for a selected Page.

**Desktop composition**

- Left navigation area: page tree and workspace navigation.
- Main area: selected Page content/editor.
- Page header: Page title and Page-level actions.
- Optional contextual toolbar or slash menu for block editing.

The left navigation area may collapse to give more room to the Page editor. The Page editor must not become unusable when the navigation area is collapsed.

### 6.2 PAGE-01 — Create Page

**Priority:** P1 — Core.

**Entry points**

- `New page` button in the Pages workspace.
- Add-child-page action from a parent Page.
- Add-page action in a page-tree group.
- Optional create-from-template entry if templates are introduced later.

**Interaction**

1. User activates New page.
2. A new Page is created in the selected location or workspace root.
3. The new Page opens in the editor.
4. The user can enter a title and add blocks.
5. The Page is saved automatically or through the editor's normal save mechanism.

A title may initially be empty while the user starts typing. The final saved Page must have a valid display title. If no title is provided, use an explicit untitled placeholder until the user renames it; do not generate a random user-visible title.

### 6.3 PAGE-02 — Page hierarchy

**Priority:** P1 — Core.

**Page-tree interactions**

- Expand/collapse a parent Page.
- Open a Page.
- Create a child Page.
- Move a Page to another parent.
- Reorder sibling Pages.
- Rename a Page.
- Open the Page action menu.
- Delete or archive a Page according to the approved lifecycle design.

**Move validation**

- A Page cannot be its own parent.
- A Page cannot be moved under its descendant.
- A user cannot move a Page into a parent they cannot edit.
- Moving a Page does not alter its stable identity.
- Links to the moved Page continue to work.

The delete-versus-archive lifecycle for Pages is not fully decided in the PRD. Until decided, the implementation must not permanently destroy a Page on a single ambiguous action.

### 6.4 PAGE-03 — Page editor surface

**Priority:** P1 — Core.

The editor displays an ordered sequence of blocks belonging to the selected Page.

**Page header controls**

- Editable Page title.
- Page action menu.
- Pin/unpin to header.
- Copy internal Page link.
- Share action when sharing is enabled.
- Optional breadcrumbs showing parent Pages.

**Editor behaviour**

- Each block is visually identifiable as an editable unit.
- Clicking or keyboard-focusing a text block allows editing.
- The editor supports insertion before/after a block.
- Empty Pages show a clear first-block prompt or slash-command affordance.
- Saving state is visible while a change is pending.
- A failed save preserves the unsaved content and provides retry.

### 6.5 PAGE-04 — Initial block types

**Priority:** P1 — Core.

| Block | Inserted presentation | Editing behaviour | Required formatting |
|---|---|---|---|
| Paragraph | Normal text line/block | Inline text editing | Basic inline formatting |
| Heading 1 | Largest page heading | Inline text editing | Basic inline formatting |
| Heading 2 | Section heading | Inline text editing | Basic inline formatting |
| Heading 3 | Subsection heading | Inline text editing | Basic inline formatting |
| Bulleted list | Bullet with editable text | Enter creates next item; empty item exits list | Nested list indentation where supported |
| Numbered list | Numbered item | Enter creates next item; empty item exits list | Ordered list numbering |
| To-do | Checkbox and text | Toggle checkbox; edit text | Checked state persists |
| Divider | Horizontal separation | No text editing | Delete or move as a block |
| Simple table | Grid of cells | Cell editing and row/column operations | Plain cell content |
| Image | Rendered image | Replace, remove, open preview | Alt text/accessibility metadata required |
| File | File name/type card | Download/open, remove reference | File metadata presentation |
| External link | Link/bookmark block | Edit URL and display text | Safe URL validation |
| Internal Page link | Page reference card/link | Select destination Page | Stable Page reference |
| Database | Database view block | Open/edit database | Database-specific operations |

### 6.6 PAGE-05 — Slash-command menu

**Priority:** P1 — Core.

**Trigger**

Typing `/` at the start of an eligible empty block or in a block context where the insertion menu is supported opens the block menu.

**Menu behaviour**

- Show available block types.
- Allow filtering by subsequent typed characters.
- Arrow Up/Down moves selection.
- Enter selects the highlighted result.
- Escape closes the menu without inserting a block.
- Mouse/touch selection is supported.
- If no block type matches, show a no-results state.
- The slash and filter text must not be lost if the user cancels the menu; it should remain ordinary text or be removed according to a single documented editor rule. The chosen rule must be consistent and tested.

The menu must not trigger inside a URL, code block, or ordinary text context where `/` should remain literal. Exact trigger-context rules belong in the editor implementation specification.

### 6.7 PAGE-06 — Block manipulation

**Priority:** P1 — Core.

**Block menu/actions**

- Duplicate.
- Delete.
- Move up/down where drag is unavailable.
- Convert to another supported block type where conversion is valid.
- Copy.
- Cut.
- Paste.

**Drag behaviour**

- A visible drag handle appears on hover/focus on desktop.
- The user can drag a block to a valid insertion position.
- A drop indicator shows the destination before drop.
- Invalid drops do not change the original order.
- Touch users must have a move/reorder menu alternative.

**Multi-block behaviour**

Multi-select and group movement are P2. They are not required for the first editor release.

### 6.8 PAGE-07 — Inline text formatting

**Priority:** P1 — Core.

Required inline formatting:

- Bold.
- Italic.
- Underline.
- Strikethrough.
- Inline code.
- Hyperlink.

Formatting must work with selected text and preserve surrounding text. The editor must not lose formatting when content is saved, reopened, copied, or moved between compatible text blocks.

### 6.9 PAGE-08 — Simple table block

**Priority:** P1 — Core.

A simple table is a content block, not a database.

**Required operations**

- Create a table with an initial editable grid.
- Add row.
- Delete row.
- Add column.
- Delete column.
- Edit each cell.
- Navigate cells by keyboard.
- Copy/paste text into cells where supported.
- Reorder the table block within the Page.
- Delete the table block.

**Explicit limitations**

- No sorting.
- No filtering.
- No property types.
- No relations.
- No alternate views.
- No computed formula cells.

Those capabilities belong to Databases.

### 6.10 PAGE-09 — Database creation and configuration

**Priority:** P1 — Core database table; P2 — additional views.

A database is a structured collection with properties and records. It may be created inline inside a Page or as a full-page database.

**Creation flow**

1. User inserts a Database block or selects New database.
2. Application creates a database with a default Title property and initial table view.
3. User renames the database.
4. User adds properties and records.
5. Database view renders the records using the configured columns.

**Initial property types**

| Type | Input/control | Validation |
|---|---|---|
| Title | Single-line text | Required for display; empty records show an untitled placeholder until named |
| Text | Text input/textarea | Plain text; no type coercion |
| Number | Numeric input | Must parse as a valid number; display formatting is a later option |
| Date | Date picker | Valid date; optional time only if the date property configuration supports it |
| Checkbox | Checkbox | Boolean state |
| Select | Single-choice menu | Value must be one of the configured options |
| Multi-select | Multi-choice menu | Values must be from configured options; duplicates are not allowed |
| URL | URL input | Valid supported URL scheme |

**Property operations**

- Add property.
- Rename property.
- Change display order.
- Change supported property type only when the conversion can be handled safely; otherwise require a warning/confirmation and preserve data or block the conversion.
- Delete property only after clear confirmation if values will be removed.

Changing a property type must not silently corrupt existing values. Exact conversion rules are deferred to the Technical Design Document.

### 6.11 PAGE-10 — Database records

**Priority:** P1 — Core.

- Add a record.
- Edit record properties.
- Delete a record.
- Open the record as a Page.
- Return to the parent database.
- Sort and filter the visible records.
- Reorder visible columns.
- Hide/show columns.

A record opened as a Page must retain its identity as a database record. It is not an unrelated duplicate Page.

### 6.12 PAGE-11 — Database views

**Priority:** P1 table; P2 additional views.

**Table view — P1**

- Rows represent database records.
- Columns represent properties.
- Users can edit visible values inline where the property type allows it.
- Users can sort and filter.
- Users can hide/show/reorder columns.

**Board view — P2**

- Records are grouped by a supported Select property.
- Records can be moved between groups, changing the corresponding property value.

**Calendar view — P2**

- Requires a Date property.
- Records are positioned by that date.
- Selecting a record opens it.
- This is a Pages database view, not the Life Planner calendar.

**List view — P2**

- Records are shown as a compact ordered list.

**Gallery view — P2**

- Records are shown as cards.
- A cover/image property or configured image source is needed for image cards; the behaviour must be defined before implementation.

### 6.13 PAGE-12 — Database sorting and filtering

**Priority:** P1 — Core for table view.

Sorting:

- Select a property.
- Select ascending or descending order.
- Multiple sort rules may be P2.
- Sorting affects the current view, not the underlying record identity.

Filtering:

- Select a property.
- Select an operator valid for the property type.
- Enter/select a comparison value.
- Combine filters using explicitly visible AND/OR logic when multiple filters are supported.
- Clear an individual filter or all filters.

The product must not show an operator that is invalid for the selected property type. The initial supported operator list must be documented in the database Feature Detail before implementation.

### 6.14 PAGE-13 — Relations and formulas

**Priority:** P3 — Deferred after initial database release.

A relation connects a record/Page to another record/Page without copying the target's content. A relation must be navigable from both ends where the relation is defined as reciprocal.

Formula and rollup capabilities are deferred. They must not be represented as supported until their input types, operators, null behaviour, error handling, and evaluation rules are specified.

### 6.15 PAGE-14 — Internal Page links

**Priority:** P1 — Core.

**Create link**

- User selects an internal Page link block or inline link command.
- User searches Pages they can access.
- Selecting a result inserts the stable Page reference.

**Display**

- Show the current Page title.
- Identify the link as internal.
- Selecting it opens the destination Page if the current user has access.

**Rename/move behaviour**

- Destination rename updates the displayed title.
- Destination move does not break the link.
- Destination deletion or access revocation displays an unavailable state and does not expose cached content.

### 6.16 PAGE-15 — Pages search

**Priority:** P1 — Core.

Search covers Page titles and searchable text content. Search results identify the Page and relevant location/context where available. Selecting a result opens the Page.

Search must respect page permissions. The graph, sidebar, and search results must not disclose inaccessible Page titles or excerpts.

Database property search/filtering is a separate database-view function.

### 6.17 PAGE-16 — Knowledge graph

**Priority:** P1 — Read-only graph for hierarchy and explicit links; P2 — database relations and advanced filters.

**Entry points**

- `Knowledge Graph` in Pages navigation.
- A Page-level action to view the graph around the selected Page may be added when local graph support is available.

**Node model**

- Each node represents a Page or Page-backed database record that the user may access.
- Each node has a visible title/label.
- Selecting a node opens its source Page/record.

**Edge model**

Initial edge types:

1. Parent-child relationship.
2. Explicit internal Page link.

Later edge type:

3. Database relation.

**Graph controls**

- Pan.
- Zoom in/out.
- Reset view/fit graph.
- Select a node.
- Show the selected node's title and relationship context.
- Drag a node to reposition it for the current visual session.

Node dragging changes graph layout only. It does not change Page hierarchy or create a Page link.

**Filters — P2**

- Relationship type.
- Page group/workspace area.
- Local graph around selected Page.

**Privacy**

- Only accessible Pages/records are included.
- A linked but inaccessible Page is not rendered with its title/content.
- The graph must not leak a count or identifying metadata for private links unless explicitly approved.

**Performance fallback**

If the graph is too large to render comfortably, the user must be able to view a local subset or apply filters. The graph must not prevent normal Page editing from working.

### 6.18 PAGE-17 — Page shortcuts

**Priority:** P1 — Core.

The Page action menu includes `Pin to header` or `Unpin from header` depending on current state.

- A maximum of three shortcuts is enforced.
- Pinning order is preserved.
- User may reorder shortcuts from the header or shortcut manager.
- Removing a shortcut does not move or delete the Page.
- A pinned Page title change updates its displayed shortcut text.

### 6.19 PAGE-18 — Page templates

**Priority:** P3 — Deferred.

The product may add templates for common Page/database layouts. Templates are convenience content, not special modules. A workout tracker template may be provided later, but the user must already be able to create a workout tracker manually from ordinary blocks and tables/database features.

### 6.20 Pages acceptance suite

| Test ID | Action | Expected result |
|---|---|---|
| PAGE-001 | Create a Page | Page appears in the workspace and opens in the editor |
| PAGE-002 | Create a child Page | Child appears under correct parent |
| PAGE-003 | Move a Page under its descendant | Operation is rejected |
| PAGE-004 | Rename a linked Page | Existing link resolves and displays new title |
| PAGE-005 | Insert paragraph and heading using slash menu | Correct blocks appear at insertion point |
| PAGE-006 | Cancel slash menu | No unwanted block is inserted and text behaviour is consistent |
| PAGE-007 | Reorder blocks | New order persists after reload |
| PAGE-008 | Duplicate a block | Duplicate content is independent of source |
| PAGE-009 | Create simple table and add row/column | Table structure persists |
| PAGE-010 | Create database | Default table view is created |
| PAGE-011 | Add a Number property and invalid text value | Invalid value is rejected with explanation |
| PAGE-012 | Add and edit records | Values persist and remain associated with correct records |
| PAGE-013 | Sort and filter table | Visible records match configured sort/filter |
| PAGE-014 | Open database record | Record opens as its own Page-backed record |
| PAGE-015 | Create internal Page link | Link opens correct destination |
| PAGE-016 | Move destination Page | Link remains valid |
| PAGE-017 | Open knowledge graph | Graph contains accessible Page nodes and valid edges |
| PAGE-018 | Select graph node | Correct source Page opens |
| PAGE-019 | Drag graph node | Layout changes; Page hierarchy and links do not change |
| PAGE-020 | Attempt to pin a fourth Page | Operation is blocked |
| PAGE-021 | Create a workout tracking Page with table/database | Works without a dedicated Workouts module |
| PAGE-022 | User A searches for User B's private Page | No title/snippet/content is disclosed |

---

## 7. File and attachment specifications

### 7.1 FILE-01 — Attachment selection

**Priority:** P2 — Extended for Pages; P1/P2 according to Keep release plan.

An attachment may be added to a supported Keep note or Pages block using a browser file picker. Paste/drop upload may be supported where reliable.

Before upload, the UI must show the selected filename. During upload, it must show progress or an explicit uploading state. On success, it must display the file reference. On failure, it must display an error and allow retry.

The application must not report a file as attached before the upload and reference creation succeed.

### 7.2 FILE-02 — Attachment presentation

- Images may show an inline preview.
- Other files show a filename, file-type indicator, and available size information.
- Selecting a file opens/downloads it according to its type and browser behaviour.
- A missing or deleted file shows an unavailable state, not a false working link.
- The attachment block can be removed without automatically deleting the underlying file.

### 7.3 FILE-03 — Attachment access

Every attachment request must verify that the current user has access to the note/Page that references the file or has an explicit file grant. Knowing a file ID or URL is not sufficient authorisation.

### 7.4 FILE-04 — Shared Page attachments

If a Page is shared with a recipient and an attachment is part of that Page's content, the recipient can access that attachment only while they have access to the relevant Page and the share policy permits the file. Revocation must prevent further authorised access.

Sharing one Page does not automatically share:

- Other private Pages that link to it.
- Other Pages linked from it.
- All files owned by the Page owner.
- Other notes in Keep.

Whether child Pages inherit access is blocked by D-01. Whether database records inherit parent database access is blocked by D-03.

### 7.5 FILE-05 — File lifecycle

- Removing a file block removes the reference from that Page.
- Removing the last reference may make a file eligible for cleanup, but the actual deletion/retention rule belongs in the Technical Design Document.
- A file referenced by another note/Page must not be deleted as a side effect of deleting one reference.
- Permanent deletion must be explicit and permission-checked.

### 7.6 FILE-06 — Upload validation

Before implementation, set and document:

- Maximum individual file size.
- Maximum total upload size per operation, if applicable.
- Supported MIME types.
- Whether executable files are rejected.
- Whether archive files are permitted.
- Image formats eligible for preview.
- Behaviour for a file whose extension and detected MIME type disagree.

These values are blocked by D-10. The UI must obtain the actual configured limits and must not hardcode a different limit from the server.

---

## 8. Page sharing and collaboration specifications

### 8.1 SHARE-01 — Share a Page

**Priority:** P3 — Advanced.

A Page owner/editor with permission to manage sharing can open a Share dialog from the Page header.

The dialog must allow the user to:

1. Select an existing registered user.
2. Assign `Can view` or `Can edit`.
3. Confirm the share.
4. View existing recipients and their permission.
5. Change permission.
6. Revoke access.

The dialog must clearly state which Page is being shared. It must not imply that the entire workspace is being shared.

Public/anonymous link sharing is not included in the default specification. It requires a separate owner decision (D-04).

### 8.2 SHARE-02 — View permission

A user with `Can view` may:

- Open the shared Page.
- Read content and database views included by the approved sharing rules.
- Open attachments included by the approved sharing rules.
- Follow links only when the target is independently accessible.

A user with `Can view` may not:

- Edit Page content.
- Create or delete blocks.
- Change Page hierarchy.
- Modify database records or properties.
- Change sharing permissions.

### 8.3 SHARE-03 — Edit permission

A user with `Can edit` may edit the shared Page and permitted content. The exact scope for child Pages, database records, and attached files is determined by the explicit sharing inheritance rules. It must not be inferred that edit permission on one Page grants edit permission on every linked Page.

### 8.4 SHARE-04 — Access revocation

When access is revoked:

- The recipient no longer sees the Page in their shared Pages list.
- Direct navigation to the Page is denied.
- Search results no longer reveal the Page.
- Graph data no longer reveals the Page or its protected relationships.
- Attachment requests for files accessible only through that Page are denied.
- Any cached display must not be treated as current authorised access. Offline cache invalidation behaviour must be specified for offline support.

### 8.5 SHARE-05 — Real-time collaboration

**Priority:** P3 — Advanced and blocked by D-06/D-12.

The intended user experience is Google Docs-style simultaneous editing of a shared Page. At minimum, authorised editors must see saved changes from other collaborators without manually refreshing the Page.

Before implementation, the Technical Design Document must define:

- Concurrent edit handling.
- Conflict resolution.
- Block identity and concurrent movement/deletion behaviour.
- Presence indicators, if included.
- Reconnection after network interruption.
- Version/history and recovery expectations.

The product must never silently overwrite a collaborator's confirmed edit without a defined conflict policy.

---

## 9. Reminder and notification specifications

### 9.1 NOTIF-01 — Reminder creation surface

A reminder may be created from a supported Life Planner item, Keep note, Pages to-do block, or date-bearing database record.

The reminder editor must show:

- The source item title or identifying label.
- The scheduled date/time used as the reference, where applicable.
- The selected reminder time or relative offset.
- A save/confirm action.
- An edit/remove action for existing reminders.

### 9.2 NOTIF-02 — Approved relative syntax

The parser must recognise these commands exactly:

| Command | Offset | Reference |
|---|---:|---|
| `/remind 1w` | 7 days before | Associated item date/time |
| `/remind 3d` | 3 days before | Associated item date/time |
| `/remind 2d` | 2 days before | Associated item date/time |
| `/remind 1d` | 1 day before | Associated item date/time |
| `/remind 2h` | 2 hours before | Associated item date/time |

The command is not measured from the moment the command is entered. For example, if an item is scheduled for 20 November at 10:00 and the user adds `/remind 2h`, the reminder is scheduled for 20 November at 08:00 in the applicable item/user timezone.

This example illustrates the rule; the item date/time and user timezone determine the actual calculation.

### 9.3 NOTIF-03 — Multiple reminders

- One item can have multiple reminders.
- Adding a new reminder does not overwrite existing reminders.
- The reminder list displays each offset/time distinctly.
- Duplicate reminder definitions for the same item and trigger time must be prevented or handled consistently; exact duplicate behaviour must be defined before implementation.
- Each reminder can be edited or removed individually.

### 9.4 NOTIF-04 — Rescheduling

When an item with relative reminders changes its scheduled date/time, each reminder is recalculated from the new reference time. The user must not receive notifications at the old trigger time after the reschedule has been saved.

If an item has an absolute reminder rather than a relative one, rescheduling the item does not automatically change that reminder unless the user explicitly chooses that behaviour. Absolute reminder support is an extension and must be specified separately.

### 9.5 NOTIF-05 — Push notification permission

- The application explains why push permission is needed before requesting it.
- The browser permission prompt is initiated by user action.
- Permission denied does not disable the application.
- Settings display notification status and provide a route to browser permission settings where supported.
- The interface distinguishes reminder scheduled, notification permission granted, and notification actually delivered. These are different states.

### 9.6 NOTIF-06 — Notification content

A notification should identify:

- Reminder source/module.
- Related item title.
- Time/context sufficient for the user to understand the reminder.
- An action that opens the related item when supported.

Notification content must not reveal a private item's details to another account or an unauthorised device context.

### 9.7 NOTIF-07 — Missed and all-day reminders

The handling of all-day items, past-due reminder creation, quiet hours, and missed delivery is blocked by D-11. The implementation must not silently choose a reminder time (for example, midnight or 9:00 AM) without owner approval.

### 9.8 Reminder acceptance suite

| Test ID | Action | Expected result |
|---|---|---|
| NOTIF-001 | Add `/remind 1w` to dated/timed item | Trigger is seven days before item time |
| NOTIF-002 | Add `/remind 3d` | Trigger is three days before item time |
| NOTIF-003 | Add `/remind 2d` | Trigger is two days before item time |
| NOTIF-004 | Add `/remind 1d` | Trigger is one day before item time |
| NOTIF-005 | Add `/remind 2h` | Trigger is two hours before item time |
| NOTIF-006 | Add two reminders to same item | Both remain configured |
| NOTIF-007 | Reschedule relative-reminder item | All relative reminders recalculate |
| NOTIF-008 | Remove one reminder | Only selected reminder is removed |
| NOTIF-009 | Deny browser notification permission | App remains usable and does not claim push is enabled |
| NOTIF-010 | Open notification for accessible item | Correct source item opens |
| NOTIF-011 | Open notification after access revoked | Protected content remains inaccessible |

---

## 10. Mobile and PWA specifications

### 10.1 MOB-01 — Mobile route composition

**Priority:** P1 design requirement; implementation may be staged.

The mobile interface is a separate layout composition over the same application data and account. It is not a separate mobile application and must not fork user data.

At minimum, mobile navigation must expose:

- Home.
- Week.
- Keep.
- Pages.
- Pinned Pages, with no more than three.
- Settings/account access.

The final choice of bottom navigation, drawer, or a combined pattern is pending D-13. All routes and limits are fixed regardless of the selected visual pattern.

### 10.2 MOB-02 — Mobile Home

The month calendar and planner must be adapted for phone viewing. The desktop two-column layout must not simply be scaled down until controls become unusable.

The mobile design must prioritise:

- Current date and calendar navigation.
- A readable agenda/day view.
- Fast create/quick-add.
- Easy access to item details.
- A clear way to move between calendar and planner content.

The exact default mobile calendar presentation is a design decision to be recorded in the mobile wireframe specification.

### 10.3 MOB-03 — Mobile Week

Week must remain available on mobile. A seven-column desktop grid may be replaced with a phone-appropriate day/agenda navigation pattern. The mobile Week screen must preserve access to the same weekly data and must not create a separate mobile-only schedule.

### 10.4 MOB-04 — Touch alternatives

- Hover-only controls must have tap/press equivalents.
- Drag-and-drop must have menu-based or tap-based alternatives for move, resize, and reorder operations.
- Touch targets must be large enough to activate reliably.
- Long-press must not be the only way to perform an essential action unless an obvious alternative exists.
- Text selection and scrolling must not accidentally trigger destructive drag actions.

### 10.5 MOB-05 — PWA installation

- Provide a valid web app manifest.
- Provide suitable application icons.
- Use standalone display mode where supported.
- Application launch must open the application rather than a browser-tab-like embedded view where the platform supports standalone installation.
- The app must remain functional in a normal mobile browser when not installed.

### 10.6 MOB-06 — Offline application shell

The application shell and static resources may be cached. A cached shell does not imply that all data is available offline.

The UI must display an offline indicator when connectivity is unavailable. Server-dependent actions must not display success while offline.

### 10.7 MOB-07 — Offline Keep

Keep's offline requirements are detailed in Section 5.17. Offline edits must be visibly pending and must not be confused with server-saved content.

### 10.8 MOB-08 — Push support

Push notifications require a secure supported browser context and user permission. When unsupported, the app must leave reminders available through in-app mechanisms and show the actual capability state.

### 10.9 Mobile acceptance suite

| Test ID | Action | Expected result |
|---|---|---|
| MOB-001 | Open Home on phone viewport | Controls and content are usable without horizontal desktop-layout overflow |
| MOB-002 | Navigate to Week | Weekly data is accessible through mobile-appropriate navigation |
| MOB-003 | Open Keep | Notes can be created and edited by touch |
| MOB-004 | Open Pages | Page navigation and editor remain usable at phone width |
| MOB-005 | Attempt planner move without dragging | A touch-accessible move action is available |
| MOB-006 | Install PWA on supported browser | Installed app launches in standalone mode |
| MOB-007 | Disable network | Offline state is visible; unsupported server actions do not falsely succeed |
| MOB-008 | Enable push where supported | Permission state and push subscription state are accurately represented |

---

## 11. Onboarding and help specifications

### 11.1 ONB-01 — Tutorial eligibility

The guided tutorial is shown automatically only to a user who has not completed or skipped it. The tutorial must not be restarted automatically at every login.

The application records the tutorial state per user. Tutorial state must survive sign-out/sign-in on another device.

### 11.2 ONB-02 — Tutorial sequence

The initial tour covers essential application concepts only:

1. Welcome and purpose of Life Tracker.
2. Home calendar and navigation.
3. Planner and creating/moving scheduled blocks.
4. Quick-add and the main create action.
5. Keep entry point and quick notes.
6. Pages entry point and basic Page creation.
7. Finish and invite the user to explore.

The final sequence may be shortened to match the implemented release. A step may not highlight a feature that is unavailable to that user.

### 11.3 ONB-03 — Spotlight behaviour

- Dim the non-highlighted interface.
- Highlight one target control or region.
- Place a short explanation near the target without covering it.
- Show progress through the steps.
- Provide Next, Back when applicable, Skip, and Finish.
- Keep the target usable only when the step explicitly asks the user to interact with it; otherwise the overlay may temporarily block background interaction.
- If the target cannot be found due to viewport/layout change, the tour must recover by repositioning or skipping the invalid step rather than freezing.

### 11.4 ONB-04 — Tutorial restart

Settings must contain a Help/Documentation area with:

- A way to restart the general tutorial.
- A short explanation of Home and Week.
- A Keep guide.
- A Pages guide.
- A reminder/notification guide.
- A mobile/PWA guide when those features are available.

Documentation must not claim that a feature exists when it is not yet released.

### 11.5 ONB acceptance suite

| Test ID | Action | Expected result |
|---|---|---|
| ONB-001 | First eligible login | Tutorial appears |
| ONB-002 | Skip on first step | Tutorial closes and skip state is saved |
| ONB-003 | Complete tutorial | Completion state is saved |
| ONB-004 | Log in again | Tutorial does not automatically reappear |
| ONB-005 | Restart from Settings | Tutorial begins again on request |
| ONB-006 | Resize viewport during step | Spotlight repositions or handles missing target safely |
| ONB-007 | User lacks access to a module | Tour does not show an unusable module step |

---

## 12. Search and cross-module discovery

### 12.1 SEARCH-01 — Module search

The first search releases may remain module-specific:

- Keep search searches Keep notes.
- Pages search searches Pages and Page content.
- Existing Life Planner search work remains separate unless a later shared search design is approved.

Search results must identify which module owns the result. Selecting a result opens the source object.

### 12.2 SEARCH-02 — Cross-module search

A unified search across Life Planner, Keep, and Pages is a later shared capability. It must provide filters by module and must respect each module's permissions. It must not delay the initial Keep or Pages search implementation.

---

## 13. Shared undo, autosave, and error behaviour

### 13.1 SAVE-01 — Autosave feedback

Where an editor autosaves, it must expose the following states:

| State | Meaning | UI behaviour |
|---|---|---|
| Unsaved | User changed content not yet submitted | Show unsaved/pending state |
| Saving | Save request in progress | Show saving indicator without blocking editing unnecessarily |
| Saved | Persistence confirmed | Show saved state or remove transient status |
| Failed | Save did not succeed | Preserve local edit, show failure, allow retry |
| Offline pending | Change is stored locally but not synchronised | Show pending/offline state; never label as server-saved |
| Conflict | Server and local versions cannot be reconciled automatically | Preserve both sides or a recoverable draft; request an explicit resolution |

### 13.2 SAVE-02 — Navigation with pending edits

- The application should attempt to finish an active save before navigation.
- If a save fails, the user must receive a warning before the unsaved content is discarded.
- If the feature supports a local draft, preserve it and indicate that it has not reached the server.
- The application must not silently discard typed content.

### 13.3 ERR-01 — Error messaging

Error messages must state what failed and the next useful action. Avoid exposing stack traces, SQL errors, internal paths, authentication secrets, or raw server responses.

### 13.4 ERR-02 — Retry behaviour

Retry is appropriate for idempotent reads and safely repeatable uploads/saves. A retry must not create duplicate notes, database records, reminders, or uploads. If the application cannot determine whether an operation succeeded, it must refresh/verify the result before asking the user to repeat it.

---

## 14. Data lifecycle and deletion behaviour

This section describes user-visible deletion rules. The Technical Design Document will define the actual retention mechanism.

| Object | Initial lifecycle requirement |
|---|---|
| Life Planner item/block | Preserve current documented soft-delete/trash and restoration behaviour |
| Keep note | Move to Trash; restore; permanent deletion is explicit |
| Keep binder | Delete binder only; notes remain |
| Keep label | Delete label only; notes remain |
| Keep checklist item | Remove item; undo where supported |
| Pages Page | Must not be permanently destroyed by an ambiguous single action; exact archive/trash behaviour is a decision |
| Page block | Delete block; preserve underlying attachment if referenced elsewhere |
| Database record | Delete record with a recoverable or confirmed lifecycle defined before release |
| Database property | Removing a property must warn if stored values will be lost; exact retention/conversion behaviour is a technical decision |
| File/attachment | Remove reference separately from permanent file deletion; protect shared references |
| Page share | Revoke access without deleting the Page |

The current Life Planner has a documented trash flow with a 30-day purge rule. This retention period must not be copied automatically to Keep or Pages without owner approval.

---

## 15. Accessibility and interaction requirements

### 15.1 A11Y-01 — Keyboard access

- All primary navigation elements must be keyboard reachable.
- Menus and dialogs must support keyboard navigation and Escape dismissal where appropriate.
- The current focus must be visible.
- Status controls and checkboxes must be operable with Space/Enter as appropriate.
- The slash menu and database menus must be keyboard operable.
- Undo shortcuts must respect text-editing focus.

### 15.2 A11Y-02 — Screen-reader labels

- Icon-only controls must have accessible names.
- Delete/remove labels must identify the target object where possible.
- The current theme mode and notification state must be conveyed in accessible text, not colour alone.
- Graph nodes must expose their title and be selectable by keyboard or through an accessible node list.

### 15.3 A11Y-03 — Colour and contrast

- Type colours, note colours, status colours, graph relationship colours, and sharing states must not be the only source of information.
- Text contrast must meet the product's WCAG AA baseline.
- Focus indicators must remain visible in both Light and Dark themes.
- Background images must not make note text unreadable.

### 15.4 A11Y-04 — Motion

- Drag feedback and graph motion should respect reduced-motion preferences.
- Animations must not be required to understand the result of an action.
- The user must be able to operate the application without relying on animation timing.

---

## 16. Cross-feature interaction rules

### 16.1 Life Planner ↔ Keep

A Keep note may be converted or linked to a calendar/planner item through an explicit user action. The user must be able to choose the destination and understand whether the action creates a copy, a link, or a new item. This exact conversion/link behaviour is not yet part of the approved PRD and must not be implemented as an implicit side effect.

### 16.2 Keep ↔ Pages

The first release does not require automatic conversion of every note into a Page. A later explicit `Move to Pages` or `Create Page from note` action may be added, but its copy-vs-move and attachment behaviour must be specified first.

### 16.3 Pages ↔ Life Planner

A Page or database record may eventually link to a calendar item. This is not required for the first Pages release. Do not duplicate calendar records into Pages databases as an implicit integration.

### 16.4 Pages ↔ Files

Page attachment blocks reference shared stored files. The Page graph excludes files by default. An optional future file filter may show file relationships, but this is not part of the initial graph release.

### 16.5 Theme across modules

Theme mode applies consistently to Home, Week, Keep, Pages, sign-in, Settings, dialogs, and overlays. A module must not persist a separate conflicting theme choice.

### 16.6 User timezone across modules

The selected user timezone applies to date/time presentation and reminder interpretation according to the existing product time rules. Automatic theme boundaries use the same configured timezone. A module must not introduce an unrelated timezone preference unless a future requirement explicitly needs one.

---

## 17. Screen and surface inventory

This inventory is used to plan wireframes and tests. It is not a claim that every screen is already implemented.

| ID | Screen/surface | Required controls/content | Release |
|---|---|---|---|
| UI-001 | Primary application header | Home, Week, Keep, up to three Page shortcuts, existing global actions | M1 |
| UI-002 | Home | Month calendar, day planner, current item/block actions | Existing + M1 |
| UI-003 | Week | Weekly grid, all-day row, side information | Existing |
| UI-004 | Item detail/peek | Title, date/time, type, status, notes, privacy, history, linked blocks | Existing |
| UI-005 | Trash | Existing Life Planner trash and restoration | Existing |
| UI-006 | Settings > Preferences | Theme mode, schedule, timezone | M1 |
| UI-007 | Keep overview | Search, binder/label filters, pinned notes, active notes, Archive/Trash | M2 |
| UI-008 | Keep note editor | Title, content, note actions, save state | M2 |
| UI-009 | Checklist editor | Items, nesting, completion, reorder controls | M2 |
| UI-010 | Keep binder management | Create, rename, reorder, delete, membership | M2 |
| UI-011 | Keep label management | Create, rename, delete, assign/filter | M2 |
| UI-012 | Keep Archive | Archived note list and restore | M2 |
| UI-013 | Keep Trash | Deleted note list, restore, permanent delete | M2 |
| UI-014 | Keep reminder editor | Date/time or relative reminder, list, edit/remove | M2 |
| UI-015 | Keep attachment/drawing surfaces | Upload, preview, draw, retry, remove | M2/M3 |
| UI-016 | Pages workspace | Page tree, search, New page, graph entry | M4 |
| UI-017 | Page editor | Title, blocks, Page actions, save status | M4 |
| UI-018 | Slash menu | Searchable block insertion menu | M4 |
| UI-019 | Simple table editor | Grid, row/column controls, cell inputs | M4 |
| UI-020 | Database editor/table view | Properties, records, sort/filter, view selector | M5 |
| UI-021 | Database record Page | Record properties and Page content | M5 |
| UI-022 | Knowledge graph | Nodes, edges, pan/zoom, select, fit | M6 |
| UI-023 | Page share dialog | Recipient, view/edit permission, revoke | M6 |
| UI-024 | Attachment viewer/card | File metadata, preview/open/download | M3/M6 |
| UI-025 | Mobile Home | Mobile calendar/planner composition | M7 |
| UI-026 | Mobile Week | Mobile weekly navigation | M7 |
| UI-027 | Mobile Keep | Touch note list/editor | M7 |
| UI-028 | Mobile Pages | Touch workspace/editor | M7 |
| UI-029 | Tutorial overlay | Spotlight, step copy, Next/Back/Skip/Finish | M8 |
| UI-030 | Settings > Help | Guides and restart tutorial | M8 |

---

## 18. Regression test requirements

New feature implementation must not invalidate the existing Life Planner baseline.

### 18.1 Existing regression areas

The repository's current build notes document tests covering:

- Setup and login/session behaviour.
- Remember-me cookies and lockout.
- Month calendar chips.
- Planner drag, resize, and overnight behaviour.
- Calendar chip to planner block conversion.
- Quick-add palette and live timeline.
- Week drag selection, Not Scheduled, heatmap, and roll handling.
- Item detail/peek.
- Sign-up and calendar sharing/overlap/removal.
- Theme.
- Plan-ahead behaviour.
- Password reset.

These behaviours must remain covered after new modules and migrations are added.

### 18.2 Required new regression areas

- Header layout at wide desktop, narrow desktop, tablet, and phone widths.
- Page shortcut limit and ordering.
- Theme schedule boundaries and timezone change.
- Undo scope and keyboard focus handling.
- Alt-drag source preservation and duplicate location.
- Keep note autosave and failed-save recovery.
- Keep binder/label non-destructive deletion.
- Keep archive/trash separation.
- Keep attachment permission checks.
- Pages nested hierarchy and move-cycle prevention.
- Editor block persistence and reorder.
- Simple table vs database behaviour separation.
- Database property validation and filters.
- Page link stability after rename/move.
- Graph permissions and navigation.
- Shared Page and attachment access revocation.
- Reminder recalculation after rescheduling.
- Mobile touch alternatives.
- Tutorial skip/completion persistence.

### 18.3 Test data requirements

Tests must include at least:

- Two independent user accounts.
- One private Page.
- One Page shared with view permission.
- One Page shared with edit permission.
- One private attachment and one shared attachment.
- Nested Pages and cross-links.
- A database with multiple property types and records.
- A Keep note in multiple binders and with multiple labels.
- Notes in active, pinned, archived, and trash states.
- Reminder records in more than one module.

Use isolated test data and fresh databases for end-to-end tests where practical. Do not use the product owner's real personal notes or attachments in automated test fixtures.

---

## 19. Implementation readiness gates

A feature is ready to be implemented when:

1. Its parent PRD requirement is identified.
2. Its user interaction and resulting state are defined.
3. Validation and failure cases are identified.
4. Permission implications are defined.
5. Relevant acceptance tests are written or planned.
6. Any blocked owner decision is closed.
7. Its dependencies are available or explicitly planned.

A feature is ready to be released when:

1. Its acceptance tests pass.
2. Existing regression tests pass.
3. Keyboard and touch alternatives work where required.
4. Loading, empty, error, and denied states are present.
5. Data migrations preserve existing data.
6. Backup and restore include the new data and attachments.
7. Security checks confirm correct ownership and access filtering.
8. Documentation describes only shipped behaviour.

---

## 20. Decisions and blockers carried forward from PRD v1.0

These are explicit blockers or design decisions. They must not be silently resolved by implementers.

| ID | Question | Affected feature | Required decision |
|---|---|---|---|
| D-01 | Does sharing a parent Page grant access to child Pages? | Page hierarchy/sharing/graph | Explicit inheritance rule |
| D-02 | Does following an internal Page link require a separate permission grant? | Page links/sharing/graph | Link access rule |
| D-03 | Can shared database access be scoped per record? | Databases/sharing | Database/record permission boundary |
| D-04 | Are public/anonymous Page links allowed, or only registered users? | Sharing | Allowed recipient model |
| D-05 | What exactly is copied by Alt-drag for linked items/blocks, status, privacy and relationships? | Life Planner duplication | Field-by-field duplication mapping |
| D-06 | What happens when multiple users edit the same block simultaneously? | Pages/Keep collaboration | Conflict and concurrent edit policy |
| D-07 | What is the default theme for new accounts: Dark or Automatic? | Theme | New-account default |
| D-08 | What is the maximum Keep checklist nesting depth? | Keep | Maximum nesting value |
| D-09 | Are note background images required in the first Keep release? | Keep | Include/exclude background image capability for first release |
| D-10 | What are file size limits and allowed MIME types? | Keep/Pages/files | Supported upload policy |
| D-11 | What is the behaviour for reminders on archived/all-day/past-due items and during quiet hours? | Notifications | Reminder lifecycle and delivery policy |
| D-12 | What is the offline conflict policy for edits to the same note/Page? | Keep/Pages PWA | Sync conflict policy |
| D-13 | Which mobile navigation composition is preferred? | Mobile | Bottom bar, drawer, or hybrid |
| D-14 | How are Pages archived/deleted/restored and how long is Trash retained? | Pages lifecycle | Page retention and recovery policy |
| D-15 | How are database property type changes converted when existing values are incompatible? | Databases | Conversion, confirmation, and preservation rules |
| D-16 | Are custom shortcut labels/icons required, or do shortcuts always use the Page's current title/icon? | Header shortcuts | Shortcut presentation rule |
| D-17 | Are identical Light/Dark schedule start times allowed? | Theme | Validation rule |
| D-18 | Which object types support Alt-drag duplication in the first release? | Life Planner | Supported object list |
| D-19 | Are Keep notes with active reminders still notified while archived? | Keep/notifications | Archive/reminder interaction |
| D-20 | How long are Keep notes retained in Trash before automatic purge? | Keep lifecycle | Retention duration |

### 20.1 Decision handling

A decision may be closed in a later owner-approved revision of this document or in a linked decision record. When closed, record the selected behaviour, date, and any affected requirement IDs. The implementation must then follow the chosen rule consistently in the UI, server permission checks, data lifecycle, and tests.

---

## 21. Requirement traceability matrix

| PRD area | Feature Specification sections | Primary test groups |
|---|---|---|
| Navigation and three Page shortcuts | 2.3, 6.18, 17 | Header, PAGE-020 |
| Existing Life Planner | 3.1–3.5 | Existing regression suite |
| Global undo | 3.6 | Undo tests |
| Alt-drag duplication | 3.7 | Duplication tests |
| Automatic theme/timezone | 4 | TH tests |
| Keep notes/checklists | 5.1–5.3 | KEEP-001–008 |
| Keep images/drawings/links/files | 5.4–5.7 | KEEP-015–016 and attachment tests |
| Keep labels/binders/colours/pinning | 5.8–5.10 | KEEP-007–010 |
| Keep archive/trash/search | 5.11–5.14 | KEEP-011–014 |
| Keep reminders/sharing/offline/import | 5.15–5.19 | KEEP reminder/share/import tests |
| Pages and block editor | 6.1–6.8 | PAGE-001–009 |
| Tables and databases | 6.9–6.14 | PAGE-009–014 |
| Page links/search/graph | 6.15–6.17 | PAGE-015–019, PAGE-022 |
| Page shortcuts | 6.18 | PAGE-020 |
| Files and attachments | 7 | FILE tests |
| Page sharing/collaboration | 8 | SHARE tests |
| Reminders/push | 9 | NOTIF tests |
| Mobile/PWA | 10 | MOB tests |
| Tutorial/help | 11 | ONB tests |
| Autosave/error handling | 13 | SAVE/ERR tests |

---

## 22. External reference and repository baseline

### 22.1 Life Tracker repository documents

The detailed existing-product behaviour in this specification was cross-checked against the following repository files on 12 November 2026:

- [docs/P1-NOTES.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/P1-NOTES.md) — current build notes and explicit overrides to older project documents.
- [docs/REQUIREMENTS.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/REQUIREMENTS.md) — previous functional requirements and existing calendar/planner behaviour.
- [docs/TECHNICAL.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/TECHNICAL.md) — current technical conventions, time rules, storage and access-control baseline.
- [docs/HANDOFF.md](https://github.com/chicenwangs/lifetracker/blob/main/docs/HANDOFF.md) — repository state, code map, and test baseline.
- [Life Tracker PRD v1.0](./Life_Tracker_PRD_v1.0.md) — approved product scope for the expanded application.

### 22.2 Kept reference

The Keep feature baseline uses the published feature list from [Kept's repository](https://github.com/ericerkz/kept). The current repository describes text notes, nested checklists, image notes, drawings, links, attachments, drag-and-drop ordering, labels, binders, colours, background images, pinning, archive, trash, search/filters, link previews, time reminders, browser push, collaboration, offline viewing/editing, Takeout import, and backup/restore. Native-only functionality such as home-screen widgets, location reminders, device-only mode, and native share-sheet integration is excluded from Life Tracker's web/PWA requirements.

Kept is a functional reference only. This specification does not authorise copying Kept's source code, assets, branding, or licensed implementation into Life Tracker.

---

## 23. Document completion checklist

- [x] Derived from Life Tracker PRD v1.0.
- [x] Existing Life Planner behaviour distinguished from new requirements.
- [x] Keep described as a separate in-app experience.
- [x] Pages described as a flexible workspace, not hardcoded feature modules.
- [x] Workout tracking specified as a user-created Page/database.
- [x] Three-shortcut header maximum defined.
- [x] Automatic theme clarified as time-based light/dark switching.
- [x] Reminder syntax specified exactly.
- [x] Knowledge graph behaviour and default relationship types defined.
- [x] Attachment permission expectations defined.
- [x] Mobile/PWA, onboarding, and shared platform behaviour specified.
- [x] Acceptance test cases and traceability included.
- [x] Unresolved owner decisions listed explicitly.
- [ ] Owner decisions in Section 20 closed.
- [ ] Technical design and data model approved in Document 3.

**End of Feature Specification.**
