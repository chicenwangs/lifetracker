// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface SafeUser {
			id: string;
			username: string;
			displayName: string;
			role: 'admin' | 'member';
			color: string;
			timezone: string;
			overlapOn: boolean;
			theme: 'dark' | 'light';
			planMode: 'night' | 'morning' | 'off' | null;
		}
		interface SessionInfo {
			id: string;
			remember: boolean;
			expiresAt: string;
			absoluteExpiresAt: string;
			lastSeenAt: string;
		}
		interface Locals {
			user: SafeUser | null;
			session: SessionInfo | null;
		}
		interface PageState {
			peekId?: string;
		}
		interface Error {
			code: string;
			message: string;
		}
	}
}

export {};
