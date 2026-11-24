import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Type-aware strict rules for every TypeScript file. Each folder is checked
// against its own tsconfig so client code can't import server-only types.
const strict = [js.configs.recommended, ...tseslint.configs.strictTypeChecked];

const sharedRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    { allowNumber: true },
  ],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  eqeqeq: ['error', 'always'],
  'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
};

const area = (glob, project, browser) => ({
  extends: strict,
  files: [glob],
  languageOptions: {
    ecmaVersion: 2023,
    globals: browser ? globals.browser : globals.node,
    parserOptions: { project: [project], tsconfigRootDir: import.meta.dirname },
  },
  rules: sharedRules,
});

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'eslint.config.js',
      '**/vite.config.ts',
      'vitest.config.ts',
    ],
  },
  area('src/server/**/*.{ts,tsx}', './tools/tsconfig.server.json', false),
  area('src/shared/**/*.{ts,tsx}', './tools/tsconfig.shared.json', true),
  {
    ...area('src/client/**/*.{ts,tsx}', './tools/tsconfig.client.json', true),
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...sharedRules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
    },
  },
]);
