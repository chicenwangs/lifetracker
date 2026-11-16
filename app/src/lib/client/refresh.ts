// invalidateAll that knows when a refresh is running. Any popstate (Back closing a layer, layers.ts #91) makes
// SvelteKit drop the refresh in flight, so layers.ts refetches once, but only when one was running.
import { invalidateAll as kitInvalidateAll } from '$app/navigation';

let running = 0;
export const refreshing = () => running > 0;

export async function invalidateAll() {
	running++;
	try {
		await kitInvalidateAll();
	} finally {
		running--;
	}
}
