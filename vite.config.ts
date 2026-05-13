import type { Plugin } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { reactRouterHonoServer } from 'react-router-hono-server/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolveViteEnvDir } from './scripts/vite-env-files';

function normalizeRequestPath(url: string | undefined): string {
  try {
    const pathname = new URL(url ?? '/', 'http://local.invalid').pathname;
    return decodeURIComponent(pathname).replace(/\/+/g, '/');
  }
  catch {
    return '/';
  }
}

function isSensitiveDirectDevPath(pathname: string): boolean {
  return pathname === '/.env' ||
    pathname.startsWith('/.env.') ||
    pathname.startsWith('/storage/') ||
    pathname.startsWith('/binaries/') ||
    pathname.startsWith('/build/') ||
    pathname.startsWith('/test-results/') ||
    pathname.startsWith('/.playwright-mcp/') ||
    pathname.startsWith('/app/composition/server/') ||
    pathname.startsWith('/app/shared/lib/server/') ||
    /^\/app\/shared\/config\/.*\.server\.[cm]?[tj]sx?$/.test(pathname) ||
    /^\/app\/modules\/[^/]+\/infrastructure\//.test(pathname) ||
    /^\/app\/routes\/api\./.test(pathname) ||
    /^\/app\/routes\/videos\./.test(pathname) ||
    /^\/app\/routes\/health\.ready\.[cm]?[tj]sx?$/.test(pathname) ||
    /^\/app\/routes\/.*\.server\.[cm]?[tj]sx?$/.test(pathname);
}

function denySensitiveDirectDevRequests(): Plugin {
  return {
    name: 'mediavault-deny-sensitive-direct-dev-requests',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = normalizeRequestPath(req.url);

        if (!isSensitiveDirectDevPath(pathname)) {
          next();
          return;
        }

        res.statusCode = 403;
        res.end('Forbidden');
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const projectRoot = process.cwd().replace(/\\/g, '/');

  return {
    plugins: [
      denySensitiveDirectDevRequests(),
      // Use Hono server only in production build
      ...(command === 'build' ? [reactRouterHonoServer({ runtime: 'bun' })] : []),
      tailwindcss(),
      ...(process.env.VITEST ? [] : [reactRouter()]),
      tsconfigPaths(),
    ],
    build: {
      target: 'es2022',
    },
    server: {
      allowedHosts: [],
      cors: false,
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          'storage/**',
          `${projectRoot}/storage/**`,
          'binaries/**',
          `${projectRoot}/binaries/**`,
          'build/**',
          `${projectRoot}/build/**`,
          'test-results/**',
          `${projectRoot}/test-results/**`,
          '.playwright-mcp/**',
          `${projectRoot}/.playwright-mcp/**`,
        ],
        strict: true,
      },
      host: '127.0.0.1',
    },
    optimizeDeps: {
      entries: [
        'app/entry.client.tsx',
        'app/root.tsx',
        'app/routes/**/*.{ts,tsx}',
        '!app/routes/**/*.server.{ts,tsx}',
        '!app/routes/**/*.test.{ts,tsx}',
      ],
      include: [
        '@vidstack/react',
        '@vidstack/react/player/layouts/default',
        'dashjs',
      ],
    },
    envDir: resolveViteEnvDir(process.env),
    test: {
      globals: true,
      exclude: ['node_modules', 'build', 'public'],
      fileParallelism: false,
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'json-summary', 'html'],
        include: ['app/**/*.{ts,tsx}'],
        exclude: [
          'app/**/*.test.{ts,tsx}',
          'app/**/*.spec.{ts,tsx}',
          'app/entry.client.tsx',
          'app/entry.server.tsx',
          'app/routes.ts',
          'app/server.ts',
          'app/shared/ui/**/*',
          'app/components/ui/**/*',
        ],
        thresholds: {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'modules',
            environment: 'node',
            include: [
              'app/modules/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            environment: 'node',
            include: [
              'tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            setupFiles: [
              'tests/setup/ui-test.setup.ts',
            ],
            include: [
              'tests/ui/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            ],
          },
        },
      ],
    },
  };
});
