import { PassThrough } from 'node:stream';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';

export { getPublicOrigin } from '~/shared/config/app-config.server';
export { initializeServer, shutdownServer } from './server';

export const streamTimeout = 5_000;

/** Stream the document using the same Node.js renderer in development and production. */
export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          body.once('close', () => clearTimeout(abortTimeout));
          responseHeaders.set('Content-Type', 'text/html');
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error: unknown) {
          clearTimeout(abortTimeout);
          reject(
            error instanceof Error
              ? error
              : new Error('Document rendering failed.', { cause: error }),
          );
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error('Streaming render error:', error);
          }
        },
      },
    );

    const abortTimeout = setTimeout(abort, streamTimeout + 1_000);
    abortTimeout.unref();
  });
}
