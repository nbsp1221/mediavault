import { type RequestListener, createServer } from 'node:http';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const defaultTimeouts = {
  headersMs: MINUTE,
  requestBodyMs: 5 * MINUTE,
  uploadBodyMs: 4 * 60 * MINUTE,
  uploadIdleMs: MINUTE,
};

export function createHttpServer(handleRequest: RequestListener, timeouts = defaultTimeouts) {
  return createServer(
    { headersTimeout: timeouts.headersMs, requestTimeout: timeouts.uploadBodyMs },
    (request, response) => {
      const hasBody =
        request.headers['transfer-encoding'] !== undefined ||
        Number(request.headers['content-length']) > 0;

      if (hasBody) {
        const upload =
          request.method === 'POST' && /^\/api\/uploads\/*(?:\?|$)/i.test(request.url ?? '');
        const socket = request.socket;

        const expire = () => {
          if (request.complete) {
            return;
          }
          if (response.headersSent || !response.socket) {
            request.destroy();
            return;
          }
          // Finish the 408 and explicitly close the incomplete input stream. Ending the
          // response alone can leave the multipart reader waiting after Node detaches it.
          response.writeHead(408, { Connection: 'close' }).end(() => {
            request.destroy();
          });
        };

        // Node's parser applies one deadline to the whole server. Apply the shorter body
        // deadline here for other routes. Socket reads let us watch uploads without consuming
        // the request stream before React Router's authentication and multipart handling.
        const deadline = setTimeout(
          expire,
          upload ? timeouts.uploadBodyMs : timeouts.requestBodyMs,
        ).unref();
        const idle = upload ? setTimeout(expire, timeouts.uploadIdleMs).unref() : undefined;

        const refreshIdle = () => {
          idle?.refresh();
        };

        if (idle) {
          socket.on('data', refreshIdle);
        }

        const cleanup = () => {
          clearTimeout(deadline);
          clearTimeout(idle);
          socket.off('data', refreshIdle);
          socket.off('close', cleanup);
        };

        request.once('end', cleanup);
        socket.once('close', cleanup);
      }

      handleRequest(request, response);
    },
  );
}
