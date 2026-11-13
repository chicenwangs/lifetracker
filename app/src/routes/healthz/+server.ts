import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handle, healthy } from '$lib/server/db';
import { jobsRunning } from '$lib/server/jobs';
import { backlog } from '$lib/server/reminders';

// No auth, no setup redirect. Docker HEALTHCHECK + homelab monitor.
export const GET: RequestHandler = () => {
	const ok = healthy(handle());
	return json(
		{
			ok,
			db: ok,
			version: process.env.APP_VERSION ?? 'dev',
			jobs: jobsRunning(),
			reminderBacklog: ok ? backlog() : null,
		},
		{ status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
	);
};
