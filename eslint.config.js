import { createConfigs } from '@retn0/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...createConfigs(),
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    ignores: [
      '.react-router',
      '.stryker-tmp',
      'build',
      'playwright-report',
      'test-results',
      'app/shared/ui/**/*',
      'app/components/ui/**/*',
    ],
  },
  {
    rules: {
      '@stylistic/operator-linebreak': ['error', 'after', {
        overrides: {
          '?': 'before',
          ':': 'before',
          '&': 'before',
          '|': 'before',
        },
      }],
      '@stylistic/multiline-ternary': ['error', 'always-multiline', {
        ignoreJSX: true,
      }],
      '@stylistic/jsx-one-expression-per-line': ['error', { allow: 'non-jsx' }],
    },
  },
  {
    files: [
      '**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': ['warn'],
    },
  },
  {
    files: [
      'app/entities/**/*.{ts,tsx}',
      'app/features/**/*.{ts,tsx}',
      'app/pages/**/*.{ts,tsx}',
      'app/routes/**/*.{ts,tsx}',
      'app/widgets/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['~/components/ui/*'],
            message: 'Use shadcn primitives from ~/shared/ui/* instead of deprecated UI paths.',
          },
          {
            group: ['@radix-ui/*', 'radix-ui'],
            message: 'Import vendor primitives only inside ~/shared/ui/* and consume them elsewhere via ~/shared/ui/*.',
          },
        ],
      }],
    },
  },
]);
