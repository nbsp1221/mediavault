import { describe, expect, test } from 'vitest';
import type { IngestMediaAnalysis } from './media-preparation-policy';
import { selectIngestMediaPreparationStrategy } from './media-preparation-policy';

function analysis(input: Partial<IngestMediaAnalysis>): IngestMediaAnalysis {
  return {
    duration: 120,
    ...input,
  };
}

describe('selectIngestMediaPreparationStrategy', () => {
  test.each([
    ['h264', 'aac'],
    ['hevc', 'aac'],
    ['H264', 'AAC'],
  ])('preserves accepted %s video with %s audio', (videoCodec, audioCodec) => {
    expect(
      selectIngestMediaPreparationStrategy(
        analysis({
          primaryAudio: {
            codecName: audioCodec,
            streamIndex: 1,
          },
          primaryVideo: {
            codecName: videoCodec,
            streamIndex: 0,
          },
        }),
      ),
    ).toBe('remux_then_package');
  });

  test.each([
    ['h264', 'ac3'],
    ['hevc', 'dts'],
    ['h264', 'flac'],
  ])('preserves accepted %s video and transcodes %s audio', (videoCodec, audioCodec) => {
    expect(
      selectIngestMediaPreparationStrategy(
        analysis({
          primaryAudio: {
            codecName: audioCodec,
            streamIndex: 1,
          },
          primaryVideo: {
            codecName: videoCodec,
            streamIndex: 0,
          },
        }),
      ),
    ).toBe('copy_video_transcode_audio');
  });

  test.each(['h264', 'hevc'])(
    'preserves accepted %s video and synthesizes missing audio',
    (videoCodec) => {
      expect(
        selectIngestMediaPreparationStrategy(
          analysis({
            primaryVideo: {
              codecName: videoCodec,
              streamIndex: 0,
            },
          }),
        ),
      ).toBe('copy_video_synthesize_audio');
    },
  );

  test.each([
    ['vp9', 'aac'],
    ['av1', 'aac'],
  ])(
    'transcodes non-allowlisted %s video and keeps AAC-normalized audio',
    (videoCodec, audioCodec) => {
      expect(
        selectIngestMediaPreparationStrategy(
          analysis({
            primaryAudio: {
              codecName: audioCodec,
              streamIndex: 1,
            },
            primaryVideo: {
              codecName: videoCodec,
              streamIndex: 0,
            },
          }),
        ),
      ).toBe('transcode_video_copy_audio');
    },
  );

  test.each([
    ['xvid', 'mp3'],
    ['vp9', undefined],
  ])('fully transcodes non-allowlisted %s video with %s audio', (videoCodec, audioCodec) => {
    expect(
      selectIngestMediaPreparationStrategy(
        analysis({
          primaryAudio: audioCodec
            ? {
                codecName: audioCodec,
                streamIndex: 1,
              }
            : undefined,
          primaryVideo: {
            codecName: videoCodec,
            streamIndex: 0,
          },
        }),
      ),
    ).toBe('full_transcode');
  });

  test('rejects input without a video stream', () => {
    expect(
      selectIngestMediaPreparationStrategy(
        analysis({
          primaryAudio: {
            codecName: 'aac',
            streamIndex: 0,
          },
        }),
      ),
    ).toBe('reject');
  });

  test('rejects input without a video codec name', () => {
    expect(
      selectIngestMediaPreparationStrategy(
        analysis({
          primaryVideo: {
            streamIndex: 0,
          },
        }),
      ),
    ).toBe('reject');
  });
});
