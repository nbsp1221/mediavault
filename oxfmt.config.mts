import config from '@retn0/oxfmt-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...config,
  ignorePatterns: [
    '.claude/settings.local.json',
    'node_modules/**',
    '.react-router/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'app/shared/ui/**',
  ],
});
