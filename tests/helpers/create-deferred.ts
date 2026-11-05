function notInitialized(): never {
  throw new Error('Deferred promise is not initialized');
}

/** Control asynchronous UI operations without timers or non-null assertions. */
export function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = notInitialized;
  let reject: (reason?: unknown) => void = notInitialized;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
