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
		interface Error {
			code: string;
			message: string;
		}
	}
}

export {};
