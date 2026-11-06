import { json } from '@sveltejs/kit';
import { api, body, me } from '$lib/server/http';
import * as courses from '$lib/server/repo/courses';

export const GET = api((e) => json({ courses: courses.list(me(e).id) }));
export const POST = api(async (e) => {
	const u = me(e);
	return json({ course: courses.create(u.id, await body(e, courses.courseSchema)) }, { status: 201 });
});
