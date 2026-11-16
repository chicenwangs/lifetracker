// Import FIRST in tsx scripts. $lib/colors pulls in a client .svelte.ts file whose $state rune only Vite compiles;
// a plain pass-through is enough for server-side code that never reads it reactively.
(globalThis as Record<string, unknown>).$state = <T>(v: T) => v;
