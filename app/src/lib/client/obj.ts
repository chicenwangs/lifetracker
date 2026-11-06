/** copy of o without key k (no dynamic delete) */
export function without<T>(o: Record<string, T>, k: string): Record<string, T> {
	return Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));
}
