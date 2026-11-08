// Env parsed once. Fail fast on boot. Never print values.
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
});

export type Env = z.infer<typeof schema> & { secureCookies: boolean };

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
	return Object.freeze({ ...r.data, secureCookies });
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
