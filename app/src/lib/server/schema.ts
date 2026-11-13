// Drizzle mirror of TECHNICAL §4 (SQL = truth).
// Not expressible here, patched into drizzle/0000 SQL by hand:
//   users.username COLLATE NOCASE. FTS5 table lives in custom migration 0001.
import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
	unique,
} from 'drizzle-orm/sqlite-core';

// v2: item/block `type` = an item_types.key of the calendar owner (validated in the service), NULL = No type.
// Built-in keys keep the v1 values (Work Exam Event Hobby Dating) so live data and share codes need no rewrite.
export const BUILTIN_TYPES = ['Work', 'Exam', 'Event', 'Hobby', 'Dating'] as const;
export const STATUSES = ['todo', 'doing', 'done'] as const;
export const EFFORTS = ['light', 'moderate', 'heavy'] as const;
export const FACT_CATEGORIES = ['likes', 'info', 'hates', 'wants', 'bucket_list', 'misc'] as const;
export const IDEA_STAGES = ['idea', 'filmed', 'edited', 'posted'] as const;

const nowZ = sql`(strftime('%Y-%m-%dT%H:%M:%SZ','now'))`;
const inList = (col: string, vals: readonly string[]) =>
	sql.raw(`${col} IN (${vals.map((v) => `'${v}'`).join(',')})`);
const nullOrIn = (col: string, vals: readonly string[]) =>
	sql.raw(`${col} IS NULL OR ${col} IN (${vals.map((v) => `'${v}'`).join(',')})`);
const jsonValid = (col: string) => sql.raw(`json_valid(${col})`);
const nullOrJson = (col: string) => sql.raw(`${col} IS NULL OR json_valid(${col})`);

// ---------- core ----------
export const appMeta = sqliteTable('app_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
});

export const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		username: text('username').notNull().unique(), // + COLLATE NOCASE (patched in SQL)
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash'), // NULL = cannot log in
		role: text('role', { enum: ['admin', 'member'] })
			.notNull()
			.default('member'),
		color: text('color').notNull().default('#1C1917'),
		timezone: text('timezone').notNull().default('Asia/Kuala_Lumpur'),
		overlapOn: integer('overlap_on', { mode: 'boolean' }).notNull().default(true),
		theme: text('theme', { enum: ['dark', 'light'] })
			.notNull()
			.default('dark'),
		// NULL = not asked yet (first-use tutorial asks). night = plan before bed, morning = plan on waking
		planMode: text('plan_mode', { enum: ['night', 'morning', 'off'] }),
		icsTokenHash: text('ics_token_hash'),
		// v2 prefs (DESIGN §5). `theme` above = last fixed choice, kept for rollback; theme_mode is read.
		themeMode: text('theme_mode', { enum: ['light', 'dark', 'auto'] })
			.notNull()
			.default('auto'),
		themeLightStart: text('theme_light_start').notNull().default('07:00'),
		themeDarkStart: text('theme_dark_start').notNull().default('17:00'),
		tourState: text('tour_state', { enum: ['new', 'skipped', 'done'] })
			.notNull()
			.default('new'),
		region: text('region', { enum: ['my', 'us'] })
			.notNull()
			.default('my'),
		qaTarget: text('qa_target', { enum: ['timeline', 'calendar'] })
			.notNull()
			.default('timeline'),
		blockMin: integer('block_min').notNull().default(60),
		visibleHours: text('visible_hours').notNull().default('7-24'),
		hiddenTypes: text('hidden_types', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		createdAt: text('created_at').notNull().default(nowZ),
	},
	// v2 column CHECKs (theme_mode, tour_state, region, qa_target, block_min, hidden_types) are in drizzle/0003 SQL:
	// adding them here makes drizzle-kit rebuild `users` and drop the hand-patched COLLATE NOCASE.
	() => [check('users_role', inList('role', ['admin', 'member']))],
);
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(), // sha256hex(token)
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		remember: integer('remember', { mode: 'boolean' }).notNull(),
		expiresAt: text('expires_at').notNull(),
		absoluteExpiresAt: text('absolute_expires_at').notNull(),
		createdAt: text('created_at').notNull(),
		lastSeenAt: text('last_seen_at').notNull(),
		userAgent: text('user_agent'),
		ip: text('ip'),
	},
	(t) => [index('sessions_user').on(t.userId)],
);

export const rateLimits = sqliteTable('rate_limits', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	windowStart: text('window_start').notNull(),
	lockedUntil: text('locked_until'),
});

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(),
	codeHash: text('code_hash').notNull().unique(),
	label: text('label'),
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	expiresAt: text('expires_at').notNull(),
	usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
	usedAt: text('used_at'),
	revokedAt: text('revoked_at'),
	createdAt: text('created_at').notNull(),
});

// ---------- calendar ----------
export const calendars = sqliteTable(
	'calendars',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at').notNull().default(nowZ),
	},
	(t) => [
		uniqueIndex('calendars_one_default')
			.on(t.ownerId)
			.where(sql`is_default = 1`),
	],
);

// DORMANT since 2026-11-08: courses feature removed from the app. Table + items.course_id kept so existing
// data is not destroyed; nothing reads or writes them. Drop with a migration if wanted.
export const courses = sqliteTable(
	'courses',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		name: text('name').notNull(),
		aliases: text('aliases', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		sourceRef: text('source_ref'),
	},
	(t) => [
		unique('courses_owner_code').on(t.ownerId, t.code),
		check('courses_aliases_json', jsonValid('aliases')),
	],
);

export const items = sqliteTable(
	'items',
	{
		id: text('id').primaryKey(),
		calendarId: text('calendar_id')
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		type: text('type'), // item_types.key; NULL = None
		status: text('status', { enum: STATUSES }).notNull().default('todo'),
		date: text('date'), // local YYYY-MM-DD; NULL = Unscheduled
		time: text('time'), // local HH:MM; NULL = all-day
		endDate: text('end_date'), // local, inclusive
		courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
		parentId: text('parent_id').references((): ReturnType<typeof text> => items.id, { onDelete: 'set null' }),
		notes: text('notes'),
		private: integer('private', { mode: 'boolean' }).notNull().default(false),
		rrule: text('rrule'),
		exdates: text('exdates', { mode: 'json' }).$type<string[]>(),
		startedAt: text('started_at'),
		completedAt: text('completed_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
		deletedAt: text('deleted_at'),
		deletedBatch: text('deleted_batch'),
		source: text('source'),
	},
	(t) => [
		index('items_cal_range').on(t.calendarId, t.date, sql`COALESCE(end_date, date)`),
		index('items_parent').on(t.parentId),
		index('items_course').on(t.courseId),
		check('items_title_len', sql`length(title) BETWEEN 1 AND 300`),
		check('items_status', inList('status', STATUSES)),
		check('items_date_fmt', sql`date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
		check('items_time_fmt', sql`time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'`),
		check('items_end_date', sql`end_date IS NULL OR (date IS NOT NULL AND end_date >= date)`),
		check('items_exdates_json', nullOrJson('exdates')),
		check('items_source', sql`source IS NULL OR source = 'notion'`),
	],
);

export const blocks = sqliteTable(
	'blocks',
	{
		id: text('id').primaryKey(),
		calendarId: text('calendar_id')
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
		label: text('label').notNull(),
		type: text('type'), // item_types.key; NULL = None
		startAt: text('start_at').notNull(),
		endAt: text('end_at').notNull(),
		status: text('status', { enum: STATUSES }).notNull().default('todo'),
		rrule: text('rrule'),
		exdates: text('exdates', { mode: 'json' }).$type<string[]>(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
		deletedAt: text('deleted_at'),
		deletedBatch: text('deleted_batch'),
	},
	(t) => [
		index('blocks_cal_start').on(t.calendarId, t.startAt),
		index('blocks_item').on(t.itemId),
		check('blocks_status', inList('status', STATUSES)),
		check('blocks_start_z', sql`start_at LIKE '%Z'`),
		check('blocks_end_z', sql`end_at LIKE '%Z'`),
		check('blocks_range', sql`end_at > start_at`),
		check('blocks_exdates_json', nullOrJson('exdates')),
	],
);

// ---------- v2: item types (FEATURES §3b) ----------
export const itemTypes = sqliteTable(
	'item_types',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		key: text('key').notNull(), // value stored in items.type / blocks.type / share kinds
		name: text('name').notNull(),
		bg: text('bg').notNull(),
		ink: text('ink').notNull(),
		slug: text('slug').notNull(), // quick add "/slug"
		position: integer('position').notNull(),
		builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
		shareDefault: integer('share_default', { mode: 'boolean' }).notNull().default(false),
		countsDown: integer('counts_down', { mode: 'boolean' }).notNull().default(false),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	(t) => [
		uniqueIndex('item_types_owner_key').on(t.ownerId, t.key),
		uniqueIndex('item_types_owner_slug').on(t.ownerId, sql`slug COLLATE NOCASE`),
		uniqueIndex('item_types_one_default')
			.on(t.ownerId)
			.where(sql`is_default = 1`),
		check('item_types_name_len', sql`length(name) BETWEEN 1 AND 30`),
		check('item_types_slug', sql`slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 1 AND 20`),
	],
);

// ---------- v2: attachments (DESIGN §12, ADR-005) ----------
export const attachments = sqliteTable(
	'attachments',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull().unique(),
		originalName: text('original_name').notNull(),
		mimeType: text('mime_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		sha256: text('sha256'),
		status: text('status', { enum: ['uploading', 'ready', 'failed'] }).notNull(),
		createdAt: text('created_at').notNull(),
		deletedAt: text('deleted_at'),
	},
	(t) => [
		index('attachments_owner').on(t.ownerId),
		check('attachments_status', inList('status', ['uploading', 'ready', 'failed'])),
	],
);

export const attachmentRefs = sqliteTable(
	'attachment_refs',
	{
		id: text('id').primaryKey(),
		attachmentId: text('attachment_id')
			.notNull()
			.references(() => attachments.id, { onDelete: 'cascade' }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sourceType: text('source_type').notNull(),
		sourceId: text('source_id').notNull(),
		createdAt: text('created_at').notNull(),
	},
	(t) => [
		uniqueIndex('attachment_refs_unique').on(t.attachmentId, t.sourceType, t.sourceId),
		index('attachment_refs_source').on(t.sourceType, t.sourceId),
	],
);

// ---------- v2: undo journal (DESIGN §11) ----------
export const undoActions = sqliteTable(
	'undo_actions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		// [{table, id, before: row|null, after: updated_at|null}] — rows as stored, restored as a whole
		rows: text('rows', { mode: 'json' }).notNull().$type<unknown[]>(),
		createdAt: text('created_at').notNull(),
		expiresAt: text('expires_at').notNull(),
		undoneAt: text('undone_at'),
	},
	(t) => [
		index('undo_user').on(t.userId, t.createdAt),
		index('undo_expires').on(t.expiresAt),
		check('undo_rows_json', jsonValid('rows')),
	],
);

// ---------- v2: Keep (DESIGN §5, §8). Order = REAL position (midpoint insert); see BUILD-NOTES. ----------
export const keepNotes = sqliteTable(
	'keep_notes',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		noteType: text('note_type', { enum: ['text', 'checklist'] })
			.notNull()
			.default('text'),
		title: text('title').notNull().default(''),
		body: text('body').notNull().default(''),
		color: text('color'),
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
		position: real('position').notNull(),
		archivedAt: text('archived_at'),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		revision: integer('revision').notNull().default(1),
	},
	(t) => [
		index('keep_notes_list').on(t.ownerId, t.deletedAt, t.archivedAt, t.pinned, t.position),
		check('keep_notes_type', inList('note_type', ['text', 'checklist'])),
		check('keep_notes_title_len', sql`length(title) <= 300`),
		check('keep_notes_body_len', sql`length(body) <= 20000`),
	],
);

export const keepChecklistItems = sqliteTable(
	'keep_checklist_items',
	{
		id: text('id').primaryKey(),
		noteId: text('note_id')
			.notNull()
			.references(() => keepNotes.id, { onDelete: 'cascade' }),
		parentItemId: text('parent_item_id'),
		text: text('text').notNull().default(''),
		checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
		position: real('position').notNull(),
	},
	(t) => [
		index('keep_items_note').on(t.noteId, t.position),
		check('keep_items_text_len', sql`length(text) <= 1000`),
	],
);

export const keepLabels = sqliteTable(
	'keep_labels',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		position: real('position').notNull(),
		createdAt: text('created_at').notNull(),
	},
	(t) => [uniqueIndex('keep_labels_owner_name').on(t.ownerId, sql`name COLLATE NOCASE`)],
);
export const keepNoteLabels = sqliteTable(
	'keep_note_labels',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => keepNotes.id, { onDelete: 'cascade' }),
		labelId: text('label_id')
			.notNull()
			.references(() => keepLabels.id, { onDelete: 'cascade' }),
	},
	(t) => [primaryKey({ columns: [t.noteId, t.labelId] }), index('keep_nl_label').on(t.labelId)],
);

export const keepBinders = sqliteTable(
	'keep_binders',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		position: real('position').notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	(t) => [index('keep_binders_owner').on(t.ownerId, t.position)],
);
export const keepNoteBinders = sqliteTable(
	'keep_note_binders',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => keepNotes.id, { onDelete: 'cascade' }),
		binderId: text('binder_id')
			.notNull()
			.references(() => keepBinders.id, { onDelete: 'cascade' }),
		position: real('position').notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.noteId, t.binderId] }),
		index('keep_nb_binder').on(t.binderId, t.position),
	],
);

// ---------- v2: Pages (DESIGN §5, §6, ADR-003) ----------
export const pages = sqliteTable(
	'pages',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		parentPageId: text('parent_page_id').references((): ReturnType<typeof text> => pages.id, {
			onDelete: 'set null',
		}),
		title: text('title').notNull().default(''),
		icon: text('icon'),
		position: real('position').notNull(),
		archivedAt: text('archived_at'),
		archivedBatch: text('archived_batch'),
		lastOpenedAt: text('last_opened_at'),
		deletedAt: text('deleted_at'),
		deletedBatch: text('deleted_batch'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
		revision: integer('revision').notNull().default(1),
	},
	(t) => [
		index('pages_tree').on(t.ownerId, t.parentPageId, t.position),
		index('pages_archived').on(t.ownerId, t.archivedAt),
		index('pages_opened').on(t.ownerId, t.lastOpenedAt),
		check('pages_title_len', sql`length(title) <= 300`),
	],
);

/** one row per top-level editor node; content_json = that node's Tiptap JSON (ADR-003) */
export const pageBlocks = sqliteTable(
	'page_blocks',
	{
		id: text('id').primaryKey(),
		pageId: text('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		parentBlockId: text('parent_block_id'),
		blockType: text('block_type').notNull(),
		position: real('position').notNull(),
		contentJson: text('content_json').notNull(),
		schemaVersion: integer('schema_version').notNull().default(1),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => [
		index('page_blocks_page').on(t.pageId, t.position),
		check('page_blocks_json', jsonValid('content_json')),
	],
);

/** projection of internal links, rebuilt on every save (never the source of truth) */
export const pageLinks = sqliteTable(
	'page_links',
	{
		id: text('id').primaryKey(),
		sourcePageId: text('source_page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		targetPageId: text('target_page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		sourceBlockId: text('source_block_id').notNull(),
		createdAt: text('created_at').notNull(),
	},
	(t) => [
		uniqueIndex('page_links_unique').on(t.sourceBlockId, t.targetPageId),
		index('page_links_target').on(t.targetPageId),
		index('page_links_source').on(t.sourcePageId),
	],
);

export const pageShortcuts = sqliteTable(
	'page_shortcuts',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		pageId: text('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		slot: integer('slot').notNull(),
		createdAt: text('created_at').notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.pageId] }),
		uniqueIndex('page_shortcuts_slot').on(t.userId, t.slot),
		check('page_shortcuts_slot_range', sql`slot BETWEEN 0 AND 2`),
	],
);

// ---------- v2: Databases (DESIGN §5, §7, ADR-004). A database lives on a page (its block). ----------
export const pageDatabases = sqliteTable(
	'page_databases',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		pageId: text('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		title: text('title').notNull().default(''),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		revision: integer('revision').notNull().default(1),
	},
	(t) => [index('page_databases_owner').on(t.ownerId), index('page_databases_page').on(t.pageId)],
);
export const PROPERTY_TYPES = [
	'title',
	'text',
	'number',
	'date',
	'checkbox',
	'select',
	'multi_select',
	'url',
] as const;
export const databaseProperties = sqliteTable(
	'database_properties',
	{
		id: text('id').primaryKey(),
		databaseId: text('database_id')
			.notNull()
			.references(() => pageDatabases.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		propertyType: text('property_type', { enum: PROPERTY_TYPES }).notNull(),
		configJson: text('config_json').notNull().default('{}'),
		position: real('position').notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	(t) => [
		index('db_props_db').on(t.databaseId, t.position),
		check('db_props_type', inList('property_type', PROPERTY_TYPES)),
		check('db_props_config', jsonValid('config_json')),
	],
);
export const databaseRecords = sqliteTable(
	'database_records',
	{
		id: text('id').primaryKey(),
		databaseId: text('database_id')
			.notNull()
			.references(() => pageDatabases.id, { onDelete: 'cascade' }),
		pageId: text('page_id').references(() => pages.id, { onDelete: 'set null' }),
		position: real('position').notNull(),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull(),
		revision: integer('revision').notNull().default(1),
	},
	(t) => [index('db_records_db').on(t.databaseId, t.position), uniqueIndex('db_records_page').on(t.pageId)],
);
export const databaseValues = sqliteTable(
	'database_values',
	{
		recordId: text('record_id')
			.notNull()
			.references(() => databaseRecords.id, { onDelete: 'cascade' }),
		propertyId: text('property_id')
			.notNull()
			.references(() => databaseProperties.id, { onDelete: 'cascade' }),
		valueJson: text('value_json').notNull(),
		updatedAt: text('updated_at').notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.recordId, t.propertyId] }),
		check('db_values_json', jsonValid('value_json')),
	],
);
export const databaseViews = sqliteTable(
	'database_views',
	{
		id: text('id').primaryKey(),
		databaseId: text('database_id')
			.notNull()
			.references(() => pageDatabases.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		viewType: text('view_type', { enum: ['table', 'board', 'calendar', 'list', 'gallery'] })
			.notNull()
			.default('table'),
		configJson: text('config_json').notNull().default('{}'),
		position: real('position').notNull(),
	},
	(t) => [
		index('db_views_db').on(t.databaseId, t.position),
		check('db_views_config', jsonValid('config_json')),
	],
);

// ---------- sharing ----------
export const shareKeys = sqliteTable(
	'share_keys',
	{
		id: text('id').primaryKey(),
		calendarId: text('calendar_id')
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		keyHash: text('key_hash').notNull().unique(),
		permission: text('permission', { enum: ['view', 'edit'] }).notNull(),
		visibleTypes: text('visible_types', { mode: 'json' }).$type<string[]>().notNull(),
		hiddenAs: text('hidden_as', { enum: ['busy', 'none'] }).notNull(),
		expiresAt: text('expires_at').notNull(),
		usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
		usedAt: text('used_at'),
		revokedAt: text('revoked_at'),
		createdAt: text('created_at').notNull(),
	},
	() => [
		check('share_keys_perm', inList('permission', ['view', 'edit'])),
		check('share_keys_types_json', jsonValid('visible_types')),
		check('share_keys_hidden', inList('hidden_as', ['busy', 'none'])),
	],
);

export const grants = sqliteTable(
	'grants',
	{
		id: text('id').primaryKey(),
		calendarId: text('calendar_id')
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		granteeId: text('grantee_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		permission: text('permission', { enum: ['view', 'edit'] }).notNull(),
		visibleTypes: text('visible_types', { mode: 'json' }).$type<string[]>().notNull(),
		hiddenAs: text('hidden_as', { enum: ['busy', 'none'] }).notNull(),
		inOverlap: integer('in_overlap', { mode: 'boolean' }).notNull().default(true),
		createdAt: text('created_at').notNull(),
		revokedAt: text('revoked_at'),
	},
	(t) => [
		unique('grants_cal_grantee').on(t.calendarId, t.granteeId),
		index('grants_grantee').on(t.granteeId),
		check('grants_perm', inList('permission', ['view', 'edit'])),
		check('grants_types_json', jsonValid('visible_types')),
		check('grants_hidden', inList('hidden_as', ['busy', 'none'])),
	],
);

// ---------- private modules (owner only) ----------
const ownerRef = () =>
	text('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' });

// DORMANT since 2026-11-08: goals feature removed from the app (table kept, data untouched).
export const goals = sqliteTable(
	'goals',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		period: text('period').notNull(),
		text: text('text').notNull(),
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		sort: integer('sort').notNull().default(0),
	},
	(t) => [
		index('goals_owner').on(t.ownerId, t.period),
		check('goals_period', sql`period GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]'`),
	],
);

export const workoutSplit = sqliteTable(
	'workout_split',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		weekday: integer('weekday').notNull(),
		exercise: text('exercise').notNull(),
		sort: integer('sort').notNull(),
		currentKg: real('current_kg'),
		currentEffort: text('current_effort', { enum: EFFORTS }),
		legacyWeeks: text('legacy_weeks', { mode: 'json' }).$type<unknown>(),
	},
	(t) => [
		index('wsplit_owner').on(t.ownerId, t.weekday),
		check('wsplit_weekday', sql`weekday BETWEEN 1 AND 7`),
		check('wsplit_effort', nullOrIn('current_effort', EFFORTS)),
		check('wsplit_legacy_json', nullOrJson('legacy_weeks')),
	],
);

export const workoutLogs = sqliteTable(
	'workout_logs',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		date: text('date').notNull(),
		exercise: text('exercise').notNull(),
		weightKg: real('weight_kg'),
		effort: text('effort', { enum: EFFORTS }),
		sets: integer('sets'),
		reps: integer('reps'),
		note: text('note'),
		createdAt: text('created_at').notNull(),
	},
	(t) => [
		index('wlogs_owner_date').on(t.ownerId, t.date),
		check('wlogs_effort', nullOrIn('effort', EFFORTS)),
	],
);

export const places = sqliteTable(
	'places',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		name: text('name').notNull(),
		city: text('city').notNull(),
		areas: text('areas', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		cuisines: text('cuisines', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		openWhen: text('open_when', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		closedOn: text('closed_on', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		halal: integer('halal', { mode: 'boolean' }).notNull().default(false),
		visited: integer('visited', { mode: 'boolean' }).notNull().default(false),
		approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
		rating: integer('rating'),
		notes: text('notes'),
		lastVisited: text('last_visited'),
		deletedAt: text('deleted_at'),
		deletedBatch: text('deleted_batch'),
	},
	(t) => [
		index('places_owner').on(t.ownerId, t.city),
		check('places_areas_json', jsonValid('areas')),
		check('places_cuisines_json', jsonValid('cuisines')),
		check('places_open_json', jsonValid('open_when')),
		check('places_closed_json', jsonValid('closed_on')),
		check('places_rating', sql`rating IS NULL OR rating BETWEEN 1 AND 5`),
	],
);

export const lists = sqliteTable(
	'lists',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		name: text('name').notNull(),
		sort: integer('sort').notNull().default(0),
	},
	(t) => [index('lists_owner').on(t.ownerId)],
);

export const listItems = sqliteTable(
	'list_items',
	{
		id: text('id').primaryKey(),
		listId: text('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		note: text('note'),
		link: text('link'),
		itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
		createdAt: text('created_at').notNull(),
		sort: integer('sort').notNull().default(0),
	},
	(t) => [index('list_items_list').on(t.listId, t.sort)],
);

export const people = sqliteTable(
	'people',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		name: text('name').notNull(),
		aliases: text('aliases', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
	},
	(t) => [index('people_owner').on(t.ownerId), check('people_aliases_json', jsonValid('aliases'))],
);

export const personFacts = sqliteTable(
	'person_facts',
	{
		id: text('id').primaryKey(),
		personId: text('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		category: text('category', { enum: FACT_CATEGORIES }).notNull(),
		text: text('text').notNull(),
		detail: text('detail'),
		itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
		sort: integer('sort').notNull().default(0),
	},
	(t) => [
		index('facts_person').on(t.personId, t.category),
		check('facts_category', inList('category', FACT_CATEGORIES)),
	],
);

export const ideas = sqliteTable(
	'ideas',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		channel: text('channel').notNull(),
		stage: text('stage', { enum: IDEA_STAGES }).notNull().default('idea'),
		text: text('text').notNull(),
		createdAt: text('created_at').notNull(),
		sort: integer('sort').notNull().default(0),
	},
	(t) => [
		index('ideas_owner').on(t.ownerId, t.stage, t.sort),
		check('ideas_stage', inList('stage', IDEA_STAGES)),
	],
);

export const stepTemplates = sqliteTable(
	'step_templates',
	{
		id: text('id').primaryKey(),
		ownerId: ownerRef(),
		name: text('name').notNull(),
		steps: text('steps', { mode: 'json' }).$type<{ title: string; days_before: number }[]>().notNull(),
	},
	() => [check('step_templates_json', jsonValid('steps'))],
);
