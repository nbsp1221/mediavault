import type shaka from 'shaka-player';
import { HTMLVideoAdapter } from '@videojs/media/dom';
import { MediaTracksMixin } from '@videojs/media/media-tracks';

export type TrackEngine = Pick<
  shaka.Player,
  | 'getVideoTracks'
  | 'getAudioTracks'
  | 'getTextTracks'
  | 'selectVideoTrack'
  | 'selectAudioTrack'
  | 'selectTextTrack'
  | 'configure'
  | 'addEventListener'
  | 'removeEventListener'
>;

/** Video.js owns the controls and list implementations; this seam only translates Shaka selections. */
export class ShakaMedia extends MediaTracksMixin(HTMLVideoAdapter) {
  override get streamType() {
    return 'on-demand' as const;
  }
  readonly #dispose: Array<() => void> = [];
  #synchronizing = false;
  #videoKey = '';
  #audioKey = '';

  constructor(
    readonly engine: TrackEngine,
    video: HTMLVideoElement,
  ) {
    super();
    this.attach(video);
    for (const name of [
      'trackschanged',
      'audiotrackschanged',
      'variantchanged',
      'adaptation',
      'audiotrackchanged',
      'textchanged',
      'texttrackvisibility',
    ]) {
      const sync = () => this.syncTracks();

      engine.addEventListener(name, sync);
      this.#dispose.push(() => {
        engine.removeEventListener(name, sync);
      });
    }

    const selectVideo = () => {
      if (this.#synchronizing) {
        return;
      }
      const rendition = [...this.videoRenditions].find((item) => item.selected);
      engine.configure({ abr: { enabled: !rendition } });
      const track = rendition ? engine.getVideoTracks()[Number(rendition.id)] : undefined;
      if (track && !track.active) {
        engine.selectVideoTrack(track);
      }
    };

    const selectAudio = () => {
      if (this.#synchronizing) {
        return;
      }
      const tracks = engine.getAudioTracks();
      const selected = [...this.audioTracks].find(
        (item) => item.enabled && !tracks[Number(item.id)]?.active,
      );
      const track = selected ? tracks[Number(selected.id)] : undefined;
      if (track) {
        engine.selectAudioTrack(track);
      }
    };

    this.videoRenditions.addEventListener('change', selectVideo);
    this.audioTracks.addEventListener('change', selectAudio);
    this.#dispose.push(() => this.videoRenditions.removeEventListener('change', selectVideo));
    this.#dispose.push(() => this.audioTracks.removeEventListener('change', selectAudio));
  }

  // Shaka 5.3's default NativeTextDisplayer publishes each language to video.textTracks
  // and translates native mode changes back to selectTextTrack(). Delegate that list intact.

  syncTracks() {
    this.#synchronizing = true;
    try {
      const videoTracks = this.engine.getVideoTracks();
      const videoKey = JSON.stringify(
        videoTracks.map(({ width, height, codecs, bandwidth, frameRate }) => [
          width,
          height,
          codecs,
          bandwidth,
          frameRate,
        ]),
      );
      if (videoKey !== this.#videoKey) {
        this.#videoKey = videoKey;
        Array.from(this.videoTracks).forEach((item) => this.removeVideoTrack(item));
        if (videoTracks.length) {
          const main = this.addVideoTrack('main');
          main.selected = true;
          videoTracks.forEach((track, index) => {
            const rendition = main.addRendition(
              '',
              track.width ?? undefined,
              track.height ?? undefined,
              track.codecs ?? undefined,
              track.bandwidth,
              track.frameRate ?? undefined,
            );
            rendition.id = String(index);
          });
        }
      }
      for (const rendition of this.videoRenditions) {
        rendition.active = videoTracks[Number(rendition.id)]?.active ?? false;
      }
      const audioTracks = this.engine.getAudioTracks();
      const audioKey = JSON.stringify(
        audioTracks.map(({ language, label, roles, channelsCount }) => [
          language,
          label,
          roles,
          channelsCount,
        ]),
      );
      if (audioKey !== this.#audioKey) {
        this.#audioKey = audioKey;
        Array.from(this.audioTracks).forEach((item) => this.removeAudioTrack(item));
        audioTracks.forEach((track, index) => {
          const item = this.addAudioTrack(
            track.primary ? 'main' : 'alternative',
            track.label ?? track.language,
            track.language,
          );
          item.id = String(index);
        });
      }
      for (const item of this.audioTracks) {
        item.enabled = audioTracks[Number(item.id)]?.active ?? false;
      }
    } finally {
      this.#synchronizing = false;
    }
  }

  override destroy() {
    this.#dispose.splice(0).forEach((dispose) => dispose());
    super.destroy();
  }
}
