import retn0 from '@retn0/oxlint-config';

export default retn0(
  { react: true, vitest: true },
  {
    ignorePatterns: [
      'node_modules/**',
      '.react-router/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'app/shared/ui/**',
    ],
    overrides: [
      {
        files: [
          'app/routes/**/*.{ts,tsx}',
          'app/composition/server/**/*.{ts,tsx}',
          'tests/**/*.{ts,tsx}',
        ],
        // React Router deliberately models loader/action HTTP failures as thrown Responses.
        rules: {
          'typescript/only-throw-error': ['error', { allow: [{ from: 'lib', name: 'Response' }] }],
        },
      },
      {
        files: ['**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}', 'tests/support/**/*.ts'],
        // Async fixtures model I/O contracts even when a particular stub resolves immediately.
        rules: { 'typescript/require-await': 'off' },
      },
    ],
  },
);
