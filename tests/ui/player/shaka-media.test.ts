import { getMediaElement } from '@videojs/media/dom';
import { describe, expect, test, vi } from 'vitest';
import { ShakaMedia, type TrackEngine } from '~/pages/player/lib/shaka-media';

function videoTrack(
  height: number,
  active: boolean,
): ReturnType<TrackEngine['getVideoTracks']>[number] {
  return {
    active,
    bandwidth: height * 1000,
    codecs: 'avc1.640029',
    colorGamut: null,
    frameRate: 24,
    hdr: null,
    height,
    label: null,
    language: 'und',
    mimeType: 'video/mp4',
    pixelAspectRatio: '1:1',
    roles: [],
    videoLayout: null,
    width: (height * 16) / 9,
  };
}

function audioTrack(
  language: string,
  active: boolean,
): ReturnType<TrackEngine['getAudioTracks']>[number] {
  return {
    accessibilityPurpose: null,
    active,
    audioSamplingRate: 44100,
    channelsCount: 2,
    codecs: 'mp4a.40.2',
    label: language === 'en' ? 'English' : 'Spanish',
    language,
    mimeType: 'audio/mp4',
    originalLanguage: language,
    primary: language === 'en',
    roles: [],
    spatialAudio: false,
  };
}

function harness() {
  const videos = [videoTrack(360, true), videoTrack(720, false)];
  const audios = [audioTrack('en', true), audioTrack('es', false)];
  const engine = {
    getVideoTracks: () => videos,
    getAudioTracks: () => audios,
    getTextTracks: () => [],
    selectVideoTrack: vi.fn<TrackEngine['selectVideoTrack']>(),
    selectAudioTrack: vi.fn<TrackEngine['selectAudioTrack']>(),
    selectTextTrack: vi.fn<TrackEngine['selectTextTrack']>(),
    configure: vi.fn<TrackEngine['configure']>().mockReturnValue(true),
    addEventListener: vi.fn<TrackEngine['addEventListener']>(),
    removeEventListener: vi.fn<TrackEngine['removeEventListener']>(),
  } satisfies TrackEngine;
  const video = document.createElement('video');
  return { videos, audios, engine, video, media: new ShakaMedia(engine, video) };
}

async function flushChanges() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Shaka to Video.js track translation', () => {
  test('publishes real rendition dimensions and active state without replacing unchanged choices', async () => {
    const { media, videos } = harness();
    media.syncTracks();
    await flushChanges();
    expect([...media.videoRenditions].map((item) => [item.height, item.active])).toEqual([
      [360, true],
      [720, false],
    ]);
    const rendition = media.videoRenditions[1];
    videos[0].active = false;
    videos[1].active = true;
    media.syncTracks();
    expect(media.videoRenditions[1]).toBe(rendition);
    expect(media.videoRenditions[1]?.active).toBe(true);
    media.destroy();
  });
  test('manual quality disables ABR; Auto restores it without a new player', async () => {
    const { media, engine, videos } = harness();
    media.syncTracks();
    await flushChanges();
    const hd = media.videoRenditions[1];
    hd.selected = true;
    await flushChanges();
    expect(engine.configure).toHaveBeenLastCalledWith({ abr: { enabled: false } });
    expect(engine.selectVideoTrack).toHaveBeenCalledWith(videos[1]);
    media.videoRenditions.selectedIndex = -1;
    await flushChanges();
    expect(engine.configure).toHaveBeenLastCalledWith({ abr: { enabled: true } });
    media.destroy();
  });
  test('audio language choices select their original Shaka track and reflect subsequent adaptation', async () => {
    const { media, engine, audios } = harness();
    media.syncTracks();
    await flushChanges();
    expect([...media.audioTracks].map((item) => [item.label, item.language, item.enabled])).toEqual(
      [
        ['English', 'en', true],
        ['Spanish', 'es', false],
      ],
    );
    const spanish = media.audioTracks[1];
    spanish.enabled = true;
    await flushChanges();
    expect(engine.selectAudioTrack).toHaveBeenCalledWith(audios[1]);
    audios[0].active = false;
    audios[1].active = true;
    media.syncTracks();
    expect(media.audioTracks[0]?.enabled).toBe(false);
    expect(media.audioTracks[1]?.enabled).toBe(true);
    media.destroy();
  });
  test('forwards native caption lists, cues and mode changes intact for Shaka NativeTextDisplayer', () => {
    const { media, video } = harness();
    const english = {
      id: '1',
      kind: 'subtitles',
      label: 'English',
      language: 'en',
      mode: 'disabled',
      cues: [{ startTime: 0, endTime: 5, text: 'English caption' }],
    };
    const spanish = {
      ...english,
      id: '2',
      label: 'Spanish',
      language: 'es',
      cues: [{ startTime: 0, endTime: 5, text: 'Spanish caption' }],
    };
    const nativeList = Object.assign(new EventTarget(), { 0: english, 1: spanish, length: 2 });
    Object.defineProperty(video, 'textTracks', { value: nativeList });
    expect(media.textTracks).toBe(nativeList);
    const second = media.textTracks[1];
    second.mode = 'showing';
    expect(spanish.mode).toBe('showing');
    expect(second.cues).toBe(spanish.cues);
    media.destroy();
  });
  test('removes obsolete tracks and all engine listeners on destruction', async () => {
    const { media, videos, audios, engine } = harness();
    media.syncTracks();
    await flushChanges();
    videos.splice(1, 1);
    audios.splice(1, 1);
    media.syncTracks();
    expect(media.videoRenditions.length).toBe(1);
    expect(media.audioTracks.length).toBe(1);
    media.destroy();
    expect(engine.removeEventListener).toHaveBeenCalledTimes(
      engine.addEventListener.mock.calls.length,
    );
    expect(getMediaElement(media)).toBeNull();
  });
});
