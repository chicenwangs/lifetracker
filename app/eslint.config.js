import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	js.configs.recommended,
	...ts.configs.strict,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser, svelteConfig } },
	},
	{ rules: { '@typescript-eslint/no-explicit-any': 'error' } },
	{ ignores: ['build/', '.svelte-kit/', 'drizzle/', 'node_modules/'] },
);
