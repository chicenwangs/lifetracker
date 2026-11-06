// Tiny cross-component signal: bump after any calendar write so views refetch.
export const calendarBus = $state({ version: 0 });
export function calendarChanged() {
	calendarBus.version++;
}
