import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHttpServer } from './create-http-server';

const server = createHttpServer(
  (incoming, response) => {
    if (incoming.url === '/early-response') {
      response.writeHead(202).flushHeaders();
    }
    incoming.on('end', () => {
      if (!response.headersSent) {
        response.writeHead(204).end();
      }
    });
    incoming.resume();
  },
  { headersMs: 600, requestBodyMs: 400, uploadBodyMs: 1_800, uploadIdleMs: 350 },
);

let port: number;

beforeAll(async () => {
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test HTTP server must have a TCP port');
  }
  port = address.port;
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

function openRequest(path: string, options: { method?: string; length?: number } = {}) {
  const client = request({
    agent: false,
    host: '127.0.0.1',
    port,
    path,
    method: options.method ?? 'POST',
    headers: options.length === undefined ? {} : { 'Content-Length': options.length },
  });
  const status = new Promise<number | undefined>((resolve, reject) => {
    client.once('response', (response) => {
      response.on('error', reject);
      response.resume();
      resolve(response.statusCode);
    });
    client.once('error', reject);
  });
  return { client, status };
}

test('answers a request without a body', async () => {
  const { client, status } = openRequest('/health/ready', { method: 'GET' });
  client.end();
  await expect(status).resolves.toBe(204);
});

test('allows a progressing upload to outlast the regular request-body deadline', async () => {
  const { client, status } = openRequest('/api/uploads');
  client.write('first');
  for (let chunk = 0; chunk < 5; chunk += 1) {
    await delay(125);
    client.write('next');
  }
  client.end();
  await expect(status).resolves.toBe(204);
});

test('times out an upload when no more bytes arrive', async () => {
  const closedBody = new Promise<void>((resolve) => {
    server.once('request', (incoming) => {
      incoming.once('close', resolve);
    });
  });
  const { client, status } = openRequest('/api/uploads', { length: 100 });
  client.write('partial');
  await expect(status).resolves.toBe(408);
  await closedBody;
});

test('times out a progressing upload when it reaches the upload deadline', async () => {
  const { client, status } = openRequest('/api/uploads');
  client.write('first');
  const sending = setInterval(() => client.write('next'), 100);
  try {
    await expect(status).resolves.toBe(408);
  } finally {
    clearInterval(sending);
  }
});

test('keeps the regular deadline for metadata even when it continues sending bytes', async () => {
  const { client, status } = openRequest('/api/uploads/stage/commit');
  client.write('first');
  const sending = setInterval(() => client.write('next'), 100);
  try {
    await expect(status).resolves.toBe(408);
  } finally {
    clearInterval(sending);
  }
});

test('closes a timed-out connection if the application already sent headers', async () => {
  const { client, status } = openRequest('/early-response', { length: 100 });
  const closed = once(client, 'close');
  client.write('partial');
  await expect(status).resolves.toBe(202);
  await closed;
});
