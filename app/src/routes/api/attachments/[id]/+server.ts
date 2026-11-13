// Download. Raster images inline, everything else as a download. Private, never cached, never sniffed.
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { api, me } from '$lib/server/http';
import { readable } from '$lib/server/attachments';

export const GET = api((e) => {
	const { row, path, inline } = readable(me(e).id, e.params.id ?? '');
	const ascii = row.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'content-type': row.mime_type,
			'content-length': String(row.byte_size),
			'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
			'x-content-type-options': 'nosniff',
			'cache-control': 'private, no-store',
			'content-security-policy': "default-src 'none'; sandbox",
		},
	});
});
