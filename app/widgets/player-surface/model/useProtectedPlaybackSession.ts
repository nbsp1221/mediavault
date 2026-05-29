import { useEffect, useRef, useState } from 'react';

const DEFAULT_PLAYBACK_REFRESH_INTERVAL_MS = 12 * 60 * 1000;
const DEFAULT_PLAYBACK_REFRESH_RETRY_INTERVAL_MS = 60 * 1000;

interface ClearKeyResponse {
  keys: Array<{
    k: string;
    kid: string;
  }>;
}

interface DrmConfig {
  key: string;
  keyId: string;
}

interface PlaybackTokenResponse {
  success: boolean;
  token?: string;
  urls?: {
    clearkey: string;
    manifest: string;
  };
}

interface UseProtectedPlaybackSessionInput {
  enabled: boolean;
  refreshIntervalMs?: number;
  videoId: string;
  videoUrl: string;
}

interface ProtectedPlaybackSessionState {
  drmConfig: DrmConfig | null;
  error: string | null;
  isLoading: boolean;
  manifestUrl: string | null;
  token: string | null;
}

interface StoredProtectedPlaybackSessionState extends ProtectedPlaybackSessionState {
  sourceKey: string;
}

function createBootstrapPendingState(sourceKey: string): StoredProtectedPlaybackSessionState {
  return {
    drmConfig: null,
    error: null,
    isLoading: true,
    manifestUrl: null,
    sourceKey,
    token: null,
  };
}

function createExternalPlaybackState(sourceKey: string, videoUrl: string): StoredProtectedPlaybackSessionState {
  return {
    drmConfig: null,
    error: null,
    isLoading: false,
    manifestUrl: videoUrl,
    sourceKey,
    token: null,
  };
}

function createCurrentSourceState(
  sourceKey: string,
  isExternalVideo: boolean,
  videoUrl: string,
): StoredProtectedPlaybackSessionState {
  return isExternalVideo
    ? createExternalPlaybackState(sourceKey, videoUrl)
    : createBootstrapPendingState(sourceKey);
}

function toPublicState(state: StoredProtectedPlaybackSessionState): ProtectedPlaybackSessionState {
  return {
    drmConfig: state.drmConfig,
    error: state.error,
    isLoading: state.isLoading,
    manifestUrl: state.manifestUrl,
    token: state.token,
  };
}

export function useProtectedPlaybackSession(
  input: UseProtectedPlaybackSessionInput,
): ProtectedPlaybackSessionState {
  const isExternalVideo = input.videoUrl.startsWith('http');
  const sourceKey = `${input.videoId}::${input.videoUrl}`;
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<StoredProtectedPlaybackSessionState>(() => createCurrentSourceState(
    sourceKey,
    isExternalVideo,
    input.videoUrl,
  ));

  useEffect(() => {
    if (!input.enabled || isExternalVideo) {
      return;
    }

    let isDisposed = false;

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleRefresh = (delayMs: number) => {
      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(() => {
        void hydrateProtectedPlaybackSession(true);
      }, delayMs);
    };

    const hydrateProtectedPlaybackSession = async (isRefresh: boolean) => {
      if (!isRefresh) {
        setState(createBootstrapPendingState(sourceKey));
      }

      try {
        const tokenResponse = await fetch(`/videos/${input.videoId}/token`, {
          credentials: 'include',
        });
        const tokenPayload = await tokenResponse.json() as PlaybackTokenResponse;

        if (!tokenResponse.ok || !tokenPayload.success || !tokenPayload.token || !tokenPayload.urls) {
          throw new Error('Could not prepare the playback token.');
        }

        const clearKeyResponse = await fetch(tokenPayload.urls.clearkey, {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${tokenPayload.token}`,
          },
        });
        const clearKeyPayload = await clearKeyResponse.json() as ClearKeyResponse;
        const clearKey = clearKeyPayload.keys[0];

        if (!clearKeyResponse.ok || !clearKey?.kid || !clearKey?.k) {
          throw new Error('Could not load the ClearKey license.');
        }

        if (isDisposed) {
          return;
        }

        setState({
          drmConfig: {
            key: clearKey.k,
            keyId: clearKey.kid,
          },
          error: null,
          isLoading: false,
          manifestUrl: tokenPayload.urls.manifest,
          sourceKey,
          token: tokenPayload.token,
        });
        scheduleRefresh(input.refreshIntervalMs ?? DEFAULT_PLAYBACK_REFRESH_INTERVAL_MS);
      }
      catch (error) {
        if (isDisposed) {
          return;
        }

        if (isRefresh) {
          setState(prev => ({
            ...prev,
            isLoading: false,
          }));
          scheduleRefresh(Math.min(
            input.refreshIntervalMs ?? DEFAULT_PLAYBACK_REFRESH_INTERVAL_MS,
            DEFAULT_PLAYBACK_REFRESH_RETRY_INTERVAL_MS,
          ));
          return;
        }

        setState({
          drmConfig: null,
          error: error instanceof Error ? error.message : 'Protected playback bootstrap failed.',
          isLoading: false,
          manifestUrl: null,
          sourceKey,
          token: null,
        });
      }
    };

    void hydrateProtectedPlaybackSession(false);

    return () => {
      isDisposed = true;
      clearRefreshTimer();
    };
  }, [
    input.enabled,
    input.refreshIntervalMs,
    input.videoId,
    input.videoUrl,
    isExternalVideo,
    sourceKey,
  ]);

  if (state.sourceKey !== sourceKey) {
    return toPublicState(createCurrentSourceState(sourceKey, isExternalVideo, input.videoUrl));
  }

  return toPublicState(state);
}
