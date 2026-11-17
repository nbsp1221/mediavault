import { useMediaAttach } from '@videojs/react';
import { VideoPlayer, VideoSkin } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import type { ShakaMedia } from '~/pages/player/lib/shaka-media';
import { createShakaPlayback } from '~/pages/player/lib/shaka-playback';
import { Alert, AlertDescription, AlertTitle } from '~/shared/ui/alert';
import '@videojs/react/video/skin.css';

interface SecureVideoProps {
  autoPlay?: boolean;
  licenseUrl: string;
  manifestUrl: string;
  onEnded?: () => void;
  title: string;
  token: string;
  videoId: string;
}

export function SecureVideo(props: SecureVideoProps) {
  return (
    <VideoPlayer title={props.title}>
      <ShakaVideoElement {...props} />
    </VideoPlayer>
  );
}

function ShakaVideoElement({
  autoPlay,
  licenseUrl,
  manifestUrl,
  onEnded,
  title,
  token,
  videoId,
}: SecureVideoProps) {
  // This pinned Video.js integration hook attaches our native-delegating media to its existing controls/store.
  const attachMedia = useMediaAttach();
  const videoRef = useRef<HTMLVideoElement>(null);
  const tokenRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let registeredMedia: ShakaMedia | null = null;
    const playback = createShakaPlayback({
      licenseUrl,
      manifestUrl,
      onError: (message) => {
        setReady(false);
        setError(message);
      },
      onMedia: (media) => {
        if (media) {
          registeredMedia = media;
          attachMedia?.(media);
        } else {
          attachMedia?.((current) => (current === registeredMedia ? null : current));
        }
      },
      onReady: () => setReady(true),
      origin: window.location.origin,
      readToken: () => tokenRef.current,
      video,
      videoId,
    });
    void playback.start();
    return () => {
      void playback.destroy().catch(() => {});
    };
  }, [attachMedia, licenseUrl, manifestUrl, videoId]);
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-black"
      data-media-player
      data-can-play={ready || undefined}
      data-player-engine="shaka"
    >
      <VideoSkin className="aspect-video w-full">
        <video
          aria-label={title}
          autoPlay={autoPlay}
          className="size-full object-contain"
          onEnded={onEnded}
          playsInline
          ref={videoRef}
        />
      </VideoSkin>
      {!ready && !error ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white"
          role="status"
        >
          Preparing secure playback
        </p>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6">
          <Alert variant="destructive">
            <AlertTitle>Playback error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
