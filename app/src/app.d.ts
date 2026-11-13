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
			/** theme to paint now (themeMode resolved against the clock) */
			theme: 'dark' | 'light';
			themeMode: 'dark' | 'light' | 'auto';
			themeLightStart: string;
			themeDarkStart: string;
			planMode: 'night' | 'morning' | 'off' | null;
			tourState: 'new' | 'skipped' | 'done';
			region: 'my' | 'us';
			qaTarget: 'timeline' | 'calendar';
			blockMin: number;
			visibleHours: string;
			hiddenTypes: string[];
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
