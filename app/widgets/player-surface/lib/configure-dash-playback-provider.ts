interface DrmConfig {
  key: string;
  keyId: string;
}

interface DashPlaybackRequest {
  headers?: Record<string, string>;
  url: string;
}

interface DashPlaybackProviderInstance {
  addRequestInterceptor?: (callback: (request: DashPlaybackRequest) => Promise<DashPlaybackRequest>) => void;
  extend?: (parentNameString: string, childInstance: () => Record<string, unknown>, override: boolean) => void;
  getProtectionController?: () => unknown;
  off?: (event: string, callback: () => void) => void;
  on?: (event: string, callback: () => void) => void;
  setProtectionData?(data: unknown): void;
}

interface ConfigureDashPlaybackProviderInput {
  drmConfig: DrmConfig | null;
  provider: DashPlaybackProviderInstance;
  token: string | null;
}

export async function configureDashPlaybackProvider(
  input: ConfigureDashPlaybackProviderInput,
) {
  const token = input.token;

  if (token) {
    if (input.provider.addRequestInterceptor) {
      input.provider.addRequestInterceptor(async request => ({
        ...request,
        headers: withPlaybackAuthorizationHeader(request.headers, token),
      }));
    }

    if (input.provider.extend) {
      const modifyRequest = (request: DashPlaybackRequest) => ({
        ...request,
        headers: withPlaybackAuthorizationHeader(request.headers, token),
      });

      input.provider.extend('RequestModifier', () => ({
        modifyRequest,
        modifyRequestHeader: (request: { setRequestHeader: (header: string, value: string) => void }) => {
          request.setRequestHeader('Authorization', `Bearer ${token}`);
          return request;
        },
        modifyRequestURL: (requestUrl: string) => requestUrl,
      }), true);
    }
  }

  const drmConfig = input.drmConfig;

  if (!drmConfig || !input.provider.setProtectionData) {
    return;
  }

  const attachProtectionData = () => {
    input.provider.setProtectionData?.({
      'org.w3.clearkey': {
        clearkeys: {
          [drmConfig.keyId]: drmConfig.key,
        },
      },
    });
  };

  const tryAttachProtectionData = () => {
    try {
      attachProtectionData();
      return true;
    }
    catch {
      return false;
    }
  };

  try {
    input.provider.getProtectionController?.();
  }
  catch {
    // Some dash.js builds materialize the protection controller lazily and may throw while probing.
  }

  if (tryAttachProtectionData()) {
    return;
  }

  if (input.provider.on && input.provider.off) {
    const handleStreamInitialized = () => {
      input.provider.off?.('streamInitialized', handleStreamInitialized);
      tryAttachProtectionData();
    };

    input.provider.on('streamInitialized', handleStreamInitialized);
  }
}

function withPlaybackAuthorizationHeader(
  headers: Record<string, string> | undefined,
  token: string,
): Record<string, string> {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
