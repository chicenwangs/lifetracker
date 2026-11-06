// Browser fetch helper. Same-origin JSON. Throws ApiError with server message.
export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
	}
}

export async function apiFetch<T>(
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(path, {
		method,
		headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
		credentials: 'same-origin',
	});
	if (res.status === 401) {
		location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
		throw new ApiError(401, 'unauthorized', 'Log in first');
	}
	const data: unknown = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = (data as { error?: { code?: string; message?: string } }).error;
		throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`);
	}
	return data as T;
}

export const get = <T>(p: string) => apiFetch<T>('GET', p);
export const post = <T>(p: string, b: unknown = {}) => apiFetch<T>('POST', p, b);
export const patch = <T>(p: string, b: unknown) => apiFetch<T>('PATCH', p, b);
export const del = <T>(p: string) => apiFetch<T>('DELETE', p);
