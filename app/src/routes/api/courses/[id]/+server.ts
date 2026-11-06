import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as courses from '$lib/server/repo/courses';

export const PATCH = api(async (e) => {
	const u = me(e);
	const p = await body(e, courses.courseSchema.partial().strict());
	return json({ course: courses.update(u.id, e.params.id ?? '', p) });
});
export const DELETE = api((e) => {
	courses.remove(me(e).id, e.params.id ?? '');
	return json({ ok: true });
});
