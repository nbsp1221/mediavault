import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const development = process.argv.includes('--development');
process.env.NODE_ENV = development ? 'development' : (process.env.NODE_ENV ?? 'production');

const [{ createRequestHandler }, { default: express }] = await Promise.all([
  import('@react-router/express'),
  import('express'),
]);
const app = express();
const server = createServer(app);
app.disable('x-powered-by');

let vite;
let loadBuild;
if (development) {
  const { createServer: createViteServer, isRunnableDevEnvironment } = await import('vite');
  vite = await createViteServer({
    appType: 'custom',
    server: { middlewareMode: true, ws: { server } },
  });
  loadBuild = async () => {
    const environment = vite.environments.ssr;
    if (!isRunnableDevEnvironment(environment)) {
      throw new Error('The React Router SSR environment must support the Node.js module runner.');
    }
    return environment.runner.import('virtual:react-router/server-build');
  };
  app.use(vite.middlewares);
} else {
  const build = await import('./build/server/index.js');
  loadBuild = () => Promise.resolve(build);
  app.use(
    '/assets',
    express.static(fileURLToPath(new URL('./build/client/assets/', import.meta.url)), {
      immutable: true,
      maxAge: '1y',
    }),
  );
  app.use(
    express.static(fileURLToPath(new URL('./build/client/', import.meta.url)), { maxAge: '1h' }),
  );
}

async function getBuild() {
  const build = await loadBuild();
  const publicOrigin = build.entry.module.getPublicOrigin();
  if (!publicOrigin) {
    return build;
  }
  // React Router's proxy-origin allowlist takes host:port, while app CSRF still checks the full origin.
  const allowedActionOrigins = Array.isArray(build.allowedActionOrigins)
    ? build.allowedActionOrigins
    : [];
  return {
    ...build,
    allowedActionOrigins: [...new Set([...allowedActionOrigins, new URL(publicOrigin).host])],
  };
}

// Keep the startup instance until shutdown; request-time SSR imports never start workers.
const initialBuild = await getBuild();
let stopping = false;
app.use((_request, response, next) => {
  if (stopping) {
    response.status(503).set('Connection', 'close').end('Server is shutting down.');
    return;
  }
  next();
});
app.use(
  createRequestHandler({ build: getBuild, mode: development ? 'development' : 'production' }),
);

let shutdownPromise;

function shutdown(exitCode = 0) {
  if (shutdownPromise) {
    return shutdownPromise;
  }
  stopping = true;
  const deadline = setTimeout(() => {
    console.error('Server shutdown exceeded its 30-second deadline.');
    server.closeAllConnections();
    process.exit(1);
  }, 30_000);
  const httpClosed = new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && (!('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING')) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  // WebSocket upgrades otherwise keep the development HTTP server from draining.
  vite?.ws.close();
  shutdownPromise = (async () => {
    try {
      await Promise.all([
        httpClosed,
        initialization
          .catch(() => undefined)
          .then(() => initialBuild.entry.module.shutdownServer()),
      ]);
      await vite?.close();
      clearTimeout(deadline);
      process.exit(exitCode);
    } catch {
      clearTimeout(deadline);
      console.error('Server shutdown failed before all resources could drain.');
      process.exit(1);
    }
  })();
  return shutdownPromise;
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
server.on('error', () => {
  console.error('The HTTP server could not start.');
  void shutdown(1);
});
const initialization = initialBuild.entry.module.initializeServer();
try {
  await initialization;
  if (!stopping) {
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? '0.0.0.0';
    server.listen(port, host, () => {
      console.info(`Mediavault listening on http://${host}:${port}`);
    });
  }
} catch (error) {
  await initialBuild.entry.module.shutdownServer();
  await vite?.close();
  throw error;
}
