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
	courseId: string | null;
	parentId: string | null;
	private: boolean;
	stepsDone: number;
	stepsTotal: number;
	editable: boolean;
	theirs?: false;
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
}

export interface CourseDTO {
	id: string;
	code: string;
	name: string;
	aliases: string[];
	active: boolean;
}

export interface GoalDTO {
	id: string;
	period: string;
	text: string;
	done: boolean;
	sort: number;
}

export interface CalendarPayload {
	items: ItemDTO[];
	blocks: BlockDTO[];
}

export interface ApiError {
	error: { code: string; message: string };
}
