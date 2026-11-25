// Offline queue (#105, DESIGN §17, D-06). Keep notes + planner adds, ticks and edits wait here when offline
// and sync in order when back online. Conflict rule (owner 2026-11-17): the server wins, the latest edit wins —
// each offline edit carries its `editedAt` timestamp; if the server's copy changed later, the server's version stays.
import { ApiError, patch, post } from './api';

const KEY = 'lt_keep_queue';
const ACT_KEY = 'lt_action_queue';

export type Op = {
	key: string;
	noteId: string | null;
	revision?: number;
	editedAt?: string;
	payload: Record<string, unknown>;
};

export type ActionOp = {
	key: string;
	method: 'POST' | 'PATCH';
	path: string;
	payload: Record<string, unknown>;
	editedAt: string;
};

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const notify = () => {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event('lt:queue'));
};

// #402: the server can come back while the browser still says online (no `online` event). Retry while ops wait;
// flushQueue() keeps one run in flight and the retry stops as soon as both queues are empty.
const RETRY_MS = 30_000;
let retry: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry() {
	if (retry || queued() === 0) return;
	retry = setTimeout(() => {
		retry = null;
		void flushQueue();
	}, RETRY_MS);
}
function stopRetry() {
	if (retry) clearTimeout(retry);
	retry = null;
}

const read = (): Op[] => {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Op[];
	} catch {
		return [];
	}
};
const write = (q: Op[]) => {
	try {
		if (q.length) localStorage.setItem(KEY, JSON.stringify(q));
		else localStorage.removeItem(KEY);
	} catch {
		/* private mode / full */
	}
	notify();
	if (q.length) scheduleRetry();
	else if (queued() === 0) stopRetry(); // the other queue may still be waiting
};

const readActions = (): ActionOp[] => {
	try {
		return JSON.parse(localStorage.getItem(ACT_KEY) ?? '[]') as ActionOp[];
	} catch {
		return [];
	}
};
const writeActions = (q: ActionOp[]) => {
	try {
		if (q.length) localStorage.setItem(ACT_KEY, JSON.stringify(q));
		else localStorage.removeItem(ACT_KEY);
	} catch {
		/* private mode / full */
	}
	notify();
	if (q.length) scheduleRetry();
	else if (queued() === 0) stopRetry(); // the other queue may still be waiting
};

export const queued = () => read().length + readActions().length;
/** is this note's edit still waiting to sync (#286) */
export const noteQueued = (key: string) => read().some((o) => o.key === key);
export const isOffline = (e: unknown) => e instanceof ApiError && e.code === 'offline';
/** worth retrying later: no network, session expired, or the server failed (only a clear 4xx drops an op) */
const keepForLater = (e: unknown) =>
	isOffline(e) ||
	(e instanceof ApiError && (e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500));

/** one entry per note: a later edit replaces the payload and updates editedAt */
export function enqueue(op: Op): void {
	const q = read();
	const editedAt = op.editedAt ?? nowIso();
	const cur = q.find((o) => o.key === op.key);
	if (cur) {
		cur.payload = { ...cur.payload, ...op.payload };
		cur.editedAt = editedAt;
	} else q.push({ ...op, editedAt });
	write(q);
}

/** queue a planner add, tick or field edit made while offline (#105) */
export function enqueueAction(op: Omit<ActionOp, 'editedAt'> & { editedAt?: string }): void {
	const q = readActions();
	const editedAt = op.editedAt ?? nowIso();
	const cur = op.method === 'PATCH' ? q.find((o) => o.key === op.key && o.method === 'PATCH') : undefined;
	if (cur) {
		cur.payload = { ...cur.payload, ...op.payload };
		cur.editedAt = editedAt;
	} else q.push({ ...op, editedAt });
	writeActions(q);
}

/** pending offline PATCH fields for an item or block path (survives reloads while offline) */
export function pendingPatch(path: string): Record<string, unknown> | undefined {
	return readActions().find((o) => o.method === 'PATCH' && o.path === path)?.payload;
}

let running: Promise<{ sent: number; copies: number; planner: number }> | null = null;
export function flushQueue(): Promise<{ sent: number; copies: number; planner: number }> {
	running ??= (async () => {
		let sent = 0;
		let copies = 0;
		let planner = 0;
		for (const op of read()) {
			try {
				if (op.noteId)
					await patch(`/api/keep/notes/${op.noteId}`, {
						...op.payload,
						revision: op.revision,
						...(op.editedAt ? { editedAt: op.editedAt } : {}),
					});
				else await post('/api/keep/notes', op.payload);
				sent++;
			} catch (e) {
				if (keepForLater(e)) break; // offline / signed out / server down: keep the rest for next time (#181)
				if (e instanceof ApiError && e.status === 409) {
					const p = op.payload as { title?: string };
					await post('/api/keep/notes', { ...op.payload, title: `${p.title ?? ''} (offline copy)`.trim() }).catch(() => {}); // prettier-ignore
					copies++;
				}
			}
			write(read().filter((o) => o.key !== op.key));
		}
		for (const op of readActions()) {
			try {
				if (op.method === 'PATCH') await patch(op.path, { ...op.payload, editedAt: op.editedAt });
				else await post(op.path, op.payload);
				planner++;
			} catch (e) {
				if (keepForLater(e)) break;
				// 400/403/404: item was deleted or invalid; drop from queue
			}
			writeActions(readActions().filter((o) => o.key !== op.key));
		}
		return { sent, copies, planner };
	})().finally(() => {
		running = null;
		if (queued() > 0) scheduleRetry();
		else stopRetry();
	});
	return running;
}

export const wipe = () => {
	stopRetry();
	write([]);
	writeActions([]);
	if (typeof caches !== 'undefined') void caches.delete('lt-data-v1').catch(() => {});
};

// #313: the wipe waits for a *successful* sign-out. The submit only marks it; the next page that loads signed out
// (after /logout redirected) wipes. A failed sign-out (offline) leaves the user signed in: the mark goes, the queue stays.
const OUT_KEY = 'lt_signing_out';
export const markSignOut = () => {
	try {
		localStorage.setItem(OUT_KEY, '1');
	} catch {
		/* private mode */
	}
};
export const settleSignOut = (signedIn: boolean) => {
	try {
		if (localStorage.getItem(OUT_KEY) === null) return;
		localStorage.removeItem(OUT_KEY);
	} catch {
		return;
	}
	if (!signedIn) wipe();
};
