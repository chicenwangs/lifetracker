import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// one page per browser spike; `vite build` reports the real bundle cost of each library
export default defineConfig({
	plugins: [svelte()],
	build: {
		rollupOptions: {
			input: {
				s1: resolve(import.meta.dirname, 's1-tiptap/index.html'),
				s2: resolve(import.meta.dirname, 's2-graph/index.html'),
			},
		},
	},
});
