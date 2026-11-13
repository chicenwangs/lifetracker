// Shared types (client + server).
/** v2: an item type key from the owner's item_types (built-ins keep their v1 keys: Work Exam Event Hobby Dating). */
export type ItemType = string;
export type TypeKey = ItemType | 'None';

export interface ItemTypeDTO {
	id: string;
	key: string;
	name: string;
	bg: string;
	ink: string;
	slug: string;
	position: number;
	builtin: boolean;
	shareDefault: boolean;
	countsDown: boolean;
	isDefault: boolean;
	/** items + blocks using it (Settings only) */
	used?: number;
}
export const STATUSES = ['todo', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export function nextStatus(s: Status): Status {
	return s === 'todo' ? 'doing' : s === 'doing' ? 'done' : 'todo';
}

export interface ItemDTO {
	id: string;
	title: string;
	type: ItemType | null;
	status: Status;
	date: string | null;
	time: string | null;
	endDate: string | null;
	parentId: string | null;
	private: boolean;
	stepsDone: number;
	stepsTotal: number;
	editable: boolean;
	/** someone else's calendar, shared with me (read-only) */
	theirs?: boolean;
	owner?: PartnerTag;
	/** a hidden type shown only as "Busy" */
	busy?: boolean;
}

export interface PartnerTag {
	id: string;
	name: string;
	initial: string;
	color: string;
}

export interface BlockDTO {
	id: string;
	label: string;
	type: ItemType | null;
	startAt: string;
	endAt: string;
	status: Status;
	itemId: string | null;
	itemType: ItemType | null;
	editable: boolean;
	theirs?: boolean;
	owner?: PartnerTag;
	busy?: boolean;
}

/** what a share code / grant lets the other person see: a type key, 'None' = no type, 'Blocks' = planner blocks */
export type ShareKind = string;

export interface CalendarPayload {
	items: ItemDTO[];
	blocks: BlockDTO[];
}

/** returned by every journaled write (DESIGN §11) */
export interface UndoRef {
	id: string;
	label: string;
}

export interface ApiError {
	error: { code: string; message: string };
}

/** week page month heatmap cell */
export interface HeatDay {
	date: string;
	inMonth: boolean;
	/** planner minutes on this day (midnight-crossing blocks split per day) */
	blockedMin: number;
	/** all-day items on this day that are not done and have no block */
	unblocked: number;
}

/** an uploaded file (DESIGN §12) */
export interface AttachmentDTO {
	id: string;
	name: string;
	mime: string;
	size: number;
	url: string;
}

// ---------- Keep (FEATURES §5) ----------
export interface ChecklistItem {
	id: string;
	text: string;
	checked: boolean;
	parentId: string | null;
}
export interface NoteDTO {
	id: string;
	type: 'text' | 'checklist';
	title: string;
	body: string;
	color: string | null;
	pinned: boolean;
	archived: boolean;
	trashed: boolean;
	labels: string[];
	binders: string[];
	items: ChecklistItem[];
	images: AttachmentDTO[];
	createdAt: string;
	updatedAt: string;
	revision: number;
}
export interface LabelDTO {
	id: string;
	name: string;
	count: number;
}
export interface BinderDTO {
	id: string;
	name: string;
	count: number;
}

// ---------- Pages (FEATURES §6) ----------
export interface PageNode {
	id: string;
	parentId: string | null;
	title: string;
	icon: string | null;
}
export interface PageDTO extends PageNode {
	archived: boolean;
	revision: number;
	updatedAt: string;
	createdAt: string;
	/** Tiptap JSON doc assembled from the page's blocks */
	doc: { type: 'doc'; content: unknown[] };
	crumbs: { id: string; title: string }[];
	/** internal link targets in this page -> current title, or null = unavailable (gone / not mine) */
	links: Record<string, { title: string; archived: boolean } | null>;
	pinned: boolean;
}

// ---------- Databases (FEATURES PG-DB, DESIGN §7) ----------
export interface DbProp {
	id: string;
	name: string;
	type: import('./dbvalues').PropType;
	config: import('./dbvalues').PropConfig;
}
export interface DbView {
	id: string;
	name: string;
	type: 'table' | 'board' | 'calendar' | 'list' | 'gallery';
	config: import('./dbvalues').ViewConfig;
}
export interface DbRow {
	id: string;
	pageId: string | null;
	/** propertyId -> stored value */
	values: Record<string, unknown>;
	/** properties whose stored value no longer fits the type (D-19: kept, flagged) */
	invalid?: string[];
}
export interface DatabaseDTO {
	id: string;
	title: string;
	pageId: string;
	props: DbProp[];
	views: DbView[];
	viewId: string;
	rows: DbRow[];
	total: number;
}

// ---------- Graph (DESIGN §10) ----------
export interface GraphDTO {
	nodes: { id: string; title: string; kind: 'page' | 'record'; archived: boolean; parentId: string | null }[];
	edges: { source: string; target: string; relation: 'parent' | 'link' }[];
	truncated: boolean;
	generatedAt: string;
}

// ---------- Reminders (FEATURES §9) ----------
export interface ReminderDTO {
	id: string;
	kind: 'relative' | 'absolute';
	/** "2 hour" style rule for relative ones */
	offset: string | null;
	dueAt: string | null;
	status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'missed';
}
