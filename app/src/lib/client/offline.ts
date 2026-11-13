// Offline Keep (DESIGN §17, D-06). A note edited with no network waits here and is sent, in order, once back online.
// Clash (409: changed elsewhere meanwhile) = keep both: the server version stays, mine becomes a new "(offline copy)".
// 403/404 (unshared, deleted) = dropped. Sign-out wipes it.
// shortcut: localStorage instead of IndexedDB; fine for text + checklists. Move to IndexedDB if files go offline.
import { ApiError, patch, post } from './api';

const KEY = 'lt_keep_queue';
export type Op = { key: string; noteId: string | null; revision?: number; payload: Record<string, unknown> };

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
		/* private mode / full: nothing kept, the editor still shows "offline" */
	}
};
export const queued = () => read().length;
export const isOffline = (e: unknown) => e instanceof ApiError && e.code === 'offline';

/** one entry per note: a later edit replaces the payload, the base revision stays the first one seen */
export function enqueue(op: Op): void {
	const q = read();
	const cur = q.find((o) => o.key === op.key);
	if (cur) cur.payload = { ...cur.payload, ...op.payload };
	else q.push(op);
	write(q);
}

let running: Promise<{ sent: number; copies: number }> | null = null;
export function flushQueue(): Promise<{ sent: number; copies: number }> {
	running ??= (async () => {
		let sent = 0;
		let copies = 0;
		for (const op of read()) {
			try {
				if (op.noteId) await patch(`/api/keep/notes/${op.noteId}`, { ...op.payload, revision: op.revision });
				else await post('/api/keep/notes', op.payload);
				sent++;
			} catch (e) {
				if (isOffline(e)) break; // still offline: keep the rest for next time
				if (e instanceof ApiError && e.status === 409) {
					const p = op.payload as { title?: string };
					await post('/api/keep/notes', { ...op.payload, title: `${p.title ?? ''} (offline copy)`.trim() }).catch(() => {}); // prettier-ignore
					copies++;
				}
				// 400/403/404: can't be saved any more; dropped (the server copy, if any, is unchanged)
			}
			write(read().filter((o) => o.key !== op.key));
		}
		return { sent, copies };
	})().finally(() => (running = null));
	return running;
}

export const wipe = () => write([]);
