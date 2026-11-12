import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';

export default [
  { ignores: ['node_modules/', '**/dist/', 'android/', 'spec/vectors/', '.plans/'] },
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
];
