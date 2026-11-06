// Drizzle mirror of TECHNICAL §4 (SQL = truth).
// Not expressible here, patched into drizzle/0000 SQL by hand:
//   users.username COLLATE NOCASE. FTS5 table lives in custom migration 0001.
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex, unique } from 'drizzle-orm/sqlite-core';

export const TYPES = ['Work', 'Exam', 'Event', 'Hobby', 'Dating'] as const;
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
		icsTokenHash: text('ics_token_hash'),
		createdAt: text('created_at').notNull().default(nowZ),
	},
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
		type: text('type', { enum: TYPES }), // NULL = None
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
		check('items_type', nullOrIn('type', TYPES)),
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
		type: text('type', { enum: TYPES }),
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
		check('blocks_type', nullOrIn('type', TYPES)),
		check('blocks_status', inList('status', STATUSES)),
		check('blocks_start_z', sql`start_at LIKE '%Z'`),
		check('blocks_end_z', sql`end_at LIKE '%Z'`),
		check('blocks_range', sql`end_at > start_at`),
		check('blocks_exdates_json', nullOrJson('exdates')),
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
