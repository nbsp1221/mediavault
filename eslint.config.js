import retn0 from '@retn0/eslint-config';
import eslintConfigOxlint from '@retn0/eslint-config-oxlint';
import oxlintConfig from './oxlint.config.mts';

export default retn0(
  { environments: ['node', 'browser'], react: true, vitest: true },
  eslintConfigOxlint(oxlintConfig),
  {
    ignores: [
      '.react-router/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'app/shared/ui/**',
    ],
  },
  {
    files: ['**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}', 'tests/support/**/*.ts'],
    // Async test doubles may satisfy an asynchronous port without awaiting work themselves.
    rules: { '@typescript-eslint/require-await': 'off' },
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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/components/ui/*'],
              message: 'Use shadcn primitives from ~/shared/ui/* instead of deprecated UI paths.',
            },
            {
              group: ['@radix-ui/*', 'radix-ui'],
              message:
                'Import vendor primitives only inside ~/shared/ui/* and consume them elsewhere via ~/shared/ui/*.',
            },
          ],
        },
      ],
    },
  },
);
