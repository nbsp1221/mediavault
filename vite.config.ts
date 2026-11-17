import type { Plugin } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import developmentWatch from './nodemon.json' with { type: 'json' };
import { resolveViteEnvDir } from './scripts/vite-env-files.ts';

export function normalizeRequestUrl(url: string | undefined): { pathname: string; search: string } {
  try {
    const parsedUrl = new URL(url ?? '/', 'http://local.invalid');

    return {
      pathname: decodeURIComponent(parsedUrl.pathname).replace(/\/+/g, '/'),
      search: parsedUrl.search,
    };
  } catch {
    return {
      pathname: '/',
      search: '',
    };
  }
}

export function isSensitiveDirectDevPath(pathname: string, search = ''): boolean {
  const isViteModuleImport = new URLSearchParams(search).has('import');

  if (isViteModuleImport && pathname === '/app/routes/videos.$videoId.edit.tsx') {
    return false;
  }

  return (
    pathname.includes('/.server/') ||
    pathname.endsWith('/.server') ||
    pathname === '/.env' ||
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
    pathname.startsWith('/app/routes/api.') ||
    pathname.startsWith('/app/routes/videos.') ||
    /^\/app\/routes\/health\.ready\.[cm]?[tj]sx?$/.test(pathname) ||
    /^\/app\/routes\/.*\.server\.[cm]?[tj]sx?$/.test(pathname)
  );
}

function denySensitiveDirectDevRequests(): Plugin {
  return {
    name: 'mediavault-deny-sensitive-direct-dev-requests',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const { pathname, search } = normalizeRequestUrl(req.url);

        if (!isSensitiveDirectDevPath(pathname, search)) {
          next();
          return;
        }

        res.statusCode = 403;
        res.end('Forbidden');
      });
    },
  };
}

export default defineConfig(() => {
  const projectRoot = process.cwd().replace(/\\/g, '/');

  return {
    plugins: [
      denySensitiveDirectDevRequests(),
      tailwindcss(),
      ...(process.env.VITEST ? [] : [reactRouter()]),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      target: 'es2022',
    },
    server: {
      allowedHosts: [],
      cors: false,
      // Backend edits use a complete, drained process restart, never an SSR worker hot-swap.
      watch: { ignored: developmentWatch.watch.map((file) => `${projectRoot}/${file}`) },
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          '**/.server/**',
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
      include: ['@videojs/react', '@videojs/media', 'shaka-player'],
    },
    envDir: resolveViteEnvDir(process.env),
    test: {
      globals: true,
      exclude: ['node_modules', 'build', 'public'],
      coverage: {
        provider: 'v8' as const,
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
            setupFiles: ['tests/setup/runtime-test-env.setup.ts'],
            include: ['app/modules/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            environment: 'node',
            setupFiles: ['tests/setup/runtime-test-env.setup.ts'],
            include: ['tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            setupFiles: ['tests/setup/ui-test.setup.ts'],
            include: ['tests/ui/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          },
        },
      ],
    },
  };
});
