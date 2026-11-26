// POST raw file body, ?name=<file name>, Content-Type required (SvelteKit drops bodies without one, ADR-005).
// GET = limits for the UI (check size + type before sending: an early refusal can look like a dropped connection).
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { ALLOWED_EXT, images, save } from '$lib/server/attachments';
import { env } from '$lib/server/env';

// GET = limits for the UI, or ?list=images = the owner's ready images (page cover picker, v4.0 PR 31)
export const GET = api((e) =>
	e.url.searchParams.get('list') === 'images'
		? json({ images: images(me(e).id) })
		: json({ maxBytes: env().MAX_UPLOAD_BYTES, types: ALLOWED_EXT }),
);

export const POST = api(async (e) => {
	const u = me(e);
	const len = e.request.headers.get('content-length');
	const att = await save(
		u.id,
		e.request.body,
		e.url.searchParams.get('name') ?? '',
		len === null ? null : Number(len),
	);
	return json({ attachment: att }, { status: 201 });
});
