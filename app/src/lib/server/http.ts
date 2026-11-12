// JSON API helpers. Errors {error:{code,message}}. 404 = not found OR not yours.
import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod';

export class ApiFail extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
	}
}

export const notFound = (): never => {
	throw new ApiFail(404, 'not_found', 'Not found');
};
export const bad = (message: string, code = 'bad_request'): never => {
	throw new ApiFail(400, code, message);
};

export function errJson(e: unknown): Response {
	if (e instanceof ApiFail)
		return json({ error: { code: e.code, message: e.message } }, { status: e.status });
	throw e;
}

export function me(event: RequestEvent): App.SafeUser {
	const u = event.locals.user;
	if (!u) throw new ApiFail(401, 'unauthorized', 'Log in first');
	return u;
}

/** admin-only settings pages: everyone else gets a plain 404 */
export function admin(locals: App.Locals): App.SafeUser {
	const u = locals.user;
	if (!u || u.role !== 'admin') error(404, { code: 'not_found', message: 'Not found' });
	return u;
}

export async function body<T extends z.ZodType>(event: RequestEvent, schema: T): Promise<z.infer<T>> {
	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		bad('Body must be JSON');
	}
	const p = schema.safeParse(raw);
	if (!p.success) {
		const i = p.error.issues[0];
		bad(i ? `${i.path.join('.') || 'body'}: ${i.message}` : 'Bad input');
	}
	return (p as { data: z.infer<T> }).data;
}

/** wrap handler: ApiFail -> JSON error */
export function api(fn: (event: RequestEvent) => Promise<Response> | Response) {
	return async (event: RequestEvent): Promise<Response> => {
		try {
			return await fn(event);
		} catch (e) {
			return errJson(e);
		}
	};
}
