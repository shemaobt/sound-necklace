import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'docs/**', // inclui a referência executável — nunca lintar, nunca tocar
      '.worktrees/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Complexidade: warn, não bloqueia (CLAUDE.md gate 5 — porte fiel 1:1 pode exceder).
      complexity: ['warn', { max: 15 }],
      // Zod 4: só import da raiz — subpaths de era misturam v3/v4 silenciosamente.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'zod/v3', message: 'Importe de "zod" (raiz, v4).' },
            { name: 'zod/v4', message: 'Importe de "zod" (raiz, v4).' },
          ],
        },
      ],
    },
  },
);
