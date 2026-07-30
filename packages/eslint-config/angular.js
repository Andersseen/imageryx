import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/**
 * Shared config for Angular apps/libraries. Selector prefixes are supplied
 * per-project via `withAngular(prefix)` since each package owns its own
 * element/attribute namespace (e.g. "ix" for the dashboard shell).
 */
export function withAngular(prefix = 'ix') {
  return tseslint.config(
    ...base,
    {
      files: ['**/*.ts'],
      extends: [...angular.configs.tsRecommended],
      processor: angular.processInlineTemplates,
      rules: {
        '@angular-eslint/component-selector': [
          'error',
          { type: 'element', prefix, style: 'kebab-case' },
        ],
        '@angular-eslint/directive-selector': [
          'error',
          { type: 'attribute', prefix, style: 'camelCase' },
        ],
        '@angular-eslint/prefer-standalone': 'error',
        '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      },
    },
    {
      files: ['**/*.html'],
      extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    },
  );
}

export default withAngular;
