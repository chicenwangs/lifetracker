// Card 09 C8: the in-app reminder action treats a 404 (a completion already cancelled the reminder) as handled
// and refreshes the planner; any other failure is still a real error.
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/client/api';
import { actReminder } from '../../src/lib/client/reminderAction';

const ok = async () => ({ ok: true });
const notFound = async () => {
	throw new ApiError(404, 'not_found', 'Not found');
};
const boom = async () => {
	throw new ApiError(500, 'error', 'Boom');
};

describe('C8 the inbox and a cancelled reminder', () => {
	it('C8 a Done on a reminder a completion already cancelled counts as handled and refreshes', async () => {
		expect(await actReminder('rem_x', 'done', notFound)).toBe(true);
		expect(await actReminder('rem_x', 'snooze10', notFound)).toBe(true); // any action, same outcome
	});

	it('C8 a normal Done refreshes, a snooze does not, and any other failure is rethrown', async () => {
		expect(await actReminder('rem_x', 'done', ok)).toBe(true);
		expect(await actReminder('rem_x', 'tomorrow', ok)).toBe(false);
		await expect(actReminder('rem_x', 'done', boom)).rejects.toThrow('Boom');
	});
});
