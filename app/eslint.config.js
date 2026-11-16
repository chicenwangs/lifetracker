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
	// TS checks undefined names itself (typescript-eslint guidance)
	{ files: ['**/*.ts', '**/*.svelte'], rules: { 'no-undef': 'off' } },
	// no paths.base in this app -> resolve() adds nothing
	{ rules: { 'svelte/no-navigation-without-resolve': 'off' } },
	{ files: ['tests/**'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
	// Back closing a layer drops a refresh in flight; the wrapper lets layers.ts redo it (#91)
	{
		files: ['src/**'],
		ignores: ['src/lib/client/refresh.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '$app/navigation',
							importNames: ['invalidateAll'],
							message: 'Use invalidateAll from $lib/client/refresh.',
						},
					],
				},
			],
		},
	},
	{ ignores: ['build/', '.svelte-kit/', 'drizzle/', 'node_modules/'] },
);
