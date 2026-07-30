import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import turbo from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';

/**
 * Shared base config for plain TypeScript packages: Workers, Node tooling,
 * and non-Angular library stubs. Angular apps/libraries extend `./angular.js`
 * instead, which layers on top of this.
 */
export const base = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.output/**',
      '**/.wrangler/**',
      '**/.angular/**',
      '**/.analog/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { turbo },
    rules: {
      'turbo/no-undeclared-env-vars': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },
  prettier,
);

export default base;
