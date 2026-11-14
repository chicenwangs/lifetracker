// Env parsed once. Fail fast on boot. Never print values.
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const schema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	DATABASE_PATH: z.string().min(1),
	SEED_DIR: z.string().min(1).default('../data/seed'),
	ORIGIN: z
		.string()
		.url()
		.refine((v) => !v.endsWith('/'), 'no trailing slash')
		.refine((v) => /^https?:\/\//.test(v), 'must be http(s)')
		.refine((v) => {
			try {
				return new URL(v).origin === v;
			} catch {
				return false;
			}
		}, 'must be a bare origin like https://planner.example.com (lower case, no path)'),
	APP_SECRET: z.string().min(32, 'need 32+ chars'),
	// guards /setup while the site may already be public: long enough not to guess
	SETUP_TOKEN: z
		.string()
		.optional()
		.default('')
		.refine((v) => v === '' || v.length >= 20, 'need 20+ chars (or leave empty)'),
	ADDRESS_HEADER: z
		.string()
		.optional()
		.transform((v) => (v ? v : undefined)),
	TZ: z.string().default('Asia/Kuala_Lumpur'),
	/** attachments (DESIGN §12). Empty = next to the database: /app/data/uploads in the image. Must be on the volume. */
	UPLOAD_DIR: z
		.string()
		.optional()
		.transform((v) => v || undefined),
	/** D-12: 25 MB. Server truth; the UI reads it from /api/attachments/limits. */
	MAX_UPLOAD_BYTES: z.coerce
		.number()
		.int()
		.min(1024)
		.max(1024 * 1024 * 1024)
		.default(25 * 1024 * 1024),
	/** Web Push (D-23 yes). No keys = push off; the app still runs and reminders show in-app. `npx web-push generate-vapid-keys` */
	VAPID_PUBLIC_KEY: z
		.string()
		.optional()
		.transform((v) => v || undefined),
	VAPID_PRIVATE_KEY: z
		.string()
		.optional()
		.transform((v) => v || undefined),
	VAPID_SUBJECT: z
		.string()
		.optional()
		.transform((v) => (v && v !== 'mailto:' ? v : undefined)), // .env.example ships a bare 'mailto:'
	/** in-process job runner (reminders). Default on. */
	JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
	REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(30_000),
});

export type Env = z.infer<typeof schema> & { secureCookies: boolean; uploadDir: string };

export function parseEnv(source: Record<string, string | undefined>): Env {
	const r = schema.safeParse(source);
	if (!r.success) {
		const bad = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
		throw new Error(`Bad env:\n  ${bad.join('\n  ')}`);
	}
	const secureCookies = r.data.ORIGIN.startsWith('https://');
	// public https in prod = behind a proxy/tunnel: without the real-IP header every user shares one IP,
	// so one person's bad passwords would lock everyone out
	if (r.data.NODE_ENV === 'production' && secureCookies && !r.data.ADDRESS_HEADER)
		throw new Error(
			'Bad env:\n  ADDRESS_HEADER: required when ORIGIN is https in production (e.g. CF-Connecting-IP)',
		);
	if (!!r.data.VAPID_PUBLIC_KEY !== !!r.data.VAPID_PRIVATE_KEY)
		throw new Error('Bad env:\n  VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together (set both or neither)');
	const uploadDir =
		r.data.UPLOAD_DIR ??
		join(dirname(r.data.DATABASE_PATH === ':memory:' ? tmpdir() + '/x' : r.data.DATABASE_PATH), 'uploads');
	return Object.freeze({ ...r.data, secureCookies, uploadDir });
}

let cached: Env | null = null;

/**
 * Call once at boot (hooks init) with SvelteKit `$env/dynamic/private`
 * (dev: loads app/.env; prod: real process env). CLI scripts pass process.env.
 */
export function initEnv(source: Record<string, string | undefined>): Env {
	cached = parseEnv(source);
	return cached;
}

export function env(): Env {
	if (!cached) throw new Error('env not initialised. hooks init (or script) must call initEnv first.');
	return cached;
}
