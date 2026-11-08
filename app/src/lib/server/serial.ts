// Per-key in-process queue. The app is one Node process (one SQLite writer), so this makes
// "check limit -> await argon2 -> record result" atomic per key: parallel requests can't all slip past a limit.
const tails = new Map<string, Promise<unknown>>();

export function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const prev = tails.get(key) ?? Promise.resolve();
	const run = prev.then(fn, fn);
	const tail = run.catch(() => undefined);
	tails.set(key, tail);
	void tail.then(() => {
		if (tails.get(key) === tail) tails.delete(key);
	});
	return run;
}
