// Shared types (client + server).
export const TYPES = ['Work', 'Exam', 'Event', 'Hobby', 'Dating'] as const;
export type ItemType = (typeof TYPES)[number];
export type TypeKey = ItemType | 'None';
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

/** what a share code / grant lets the other person see. 'None' = items with no type; 'Blocks' = planner blocks */
export const SHARE_KINDS = ['Work', 'Exam', 'Event', 'Hobby', 'Dating', 'None', 'Blocks'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface CalendarPayload {
	items: ItemDTO[];
	blocks: BlockDTO[];
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
