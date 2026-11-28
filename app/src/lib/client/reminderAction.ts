// Card 09: the in-app reminder action's outcome. A completion cancels the finished occurrence's exact reminders,
// so a Done on one of them afterwards is a 404 — already handled, not a failure. Pure: unit-tested.
import { ApiError } from './api';

export type ReminderAction = 'done' | 'snooze10' | 'tomorrow';

/** run one reminder action; true = the planner should refresh (a Done, or a reminder already handled) */
export async function actReminder(
	id: string,
	action: ReminderAction,
	send: (id: string, action: ReminderAction) => Promise<unknown>,
): Promise<boolean> {
	try {
		await send(id, action);
	} catch (e) {
		// 404 = a completion already cancelled it (or the finished occurrence's sibling): handled, never an error
		if (!(e instanceof ApiError && e.status === 404)) throw e;
		return true;
	}
	return action === 'done';
}
