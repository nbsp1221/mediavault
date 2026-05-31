import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

Object.defineProperties(window, {
  AbortController: {
    configurable: true,
    value: globalThis.AbortController,
  },
  AbortSignal: {
    configurable: true,
    value: globalThis.AbortSignal,
  },
});

const NativeRequest = globalThis.Request;

function CompatibleRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  try {
    return new NativeRequest(input, init);
  }
  catch (error) {
    if (init?.signal && error instanceof TypeError && error.message.includes('Expected signal')) {
      return new NativeRequest(input, {
        ...init,
        signal: undefined,
      });
    }

    throw error;
  }
}

Object.setPrototypeOf(CompatibleRequest, NativeRequest);
CompatibleRequest.prototype = NativeRequest.prototype;

Object.defineProperties(globalThis, {
  Request: {
    configurable: true,
    value: CompatibleRequest,
  },
});

Object.defineProperties(window, {
  Request: {
    configurable: true,
    value: CompatibleRequest,
  },
});

afterEach(() => {
  cleanup();
});
