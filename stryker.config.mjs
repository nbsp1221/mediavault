/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: [
    'app/modules/**/domain/**/*.ts',
    'app/modules/**/application/use-cases/**/*.ts',
    '!**/*.{test,spec}.ts',
  ],
  vitest: {
    configFile: 'vite.config.ts',
    related: true,
  },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: {
    fileName: 'coverage/mutation/mutation.html',
  },
  jsonReporter: {
    fileName: 'coverage/mutation/mutation.json',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 70,
  },
};
