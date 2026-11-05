import { z } from 'zod';
import type { IngestVideoAnalysisPort } from '~/modules/ingest/application/ports/ingest-video-analysis.port';
import type { IngestMediaAnalysis } from '~/modules/ingest/domain/media-preparation-policy';
import { getFFprobePath } from '~/shared/config/video-tools.server';
import {
  type SupervisedProcessOptions,
  runSupervisedProcess,
} from '~/shared/lib/server/supervised-process.server';

interface Dependencies {
  ffprobePath?: string;
  spawn?: SupervisedProcessOptions['spawn'];
  timeoutMs?: number;
}

export class FfprobeIngestVideoAnalysisAdapter implements IngestVideoAnalysisPort {
  constructor(private readonly deps: Dependencies = {}) {}

  async analyze(
    inputPath: string,
    options?: { signal?: AbortSignal },
  ): Promise<IngestMediaAnalysis> {
    const result = await runSupervisedProcess({
      args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
      command: this.deps.ffprobePath ?? getFFprobePath(),
      signal: options?.signal,
      spawn: this.deps.spawn,
      timeoutMs: this.deps.timeoutMs ?? 30_000,
    });
    try {
      return parseFfprobeOutput(result.stdout);
    } catch (error) {
      throw new Error(
        `Failed to parse ffprobe output: ${error instanceof Error ? error.message : 'Invalid media facts'}`,
        { cause: error },
      );
    }
  }
}

function parseFfprobeOutput(stdout: string): IngestMediaAnalysis {
  const parsed = z
    .object({
      format: z
        .object({ duration: z.string().optional(), format_name: z.string().optional() })
        .optional(),
      streams: z
        .array(
          z.object({
            codec_name: z.string().optional(),
            codec_type: z.string().optional(),
            height: z.number().optional(),
            index: z.number().optional(),
            width: z.number().optional(),
          }),
        )
        .optional(),
    })
    .parse(JSON.parse(stdout));
  const duration = Number.parseFloat(parsed.format?.duration ?? '0');
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error('duration is not finite');
  }
  const primaryVideo = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const primaryAudio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const analysis: IngestMediaAnalysis = { duration };
  if (parsed.format?.format_name) {
    analysis.containerFormat = parsed.format.format_name;
  }
  if (primaryVideo) {
    analysis.primaryVideo = {
      codecName: primaryVideo.codec_name,
      height: primaryVideo.height,
      streamIndex: typeof primaryVideo.index === 'number' ? primaryVideo.index : 0,
      width: primaryVideo.width,
    };
  }
  if (primaryAudio) {
    analysis.primaryAudio = {
      codecName: primaryAudio.codec_name,
      streamIndex: typeof primaryAudio.index === 'number' ? primaryAudio.index : 0,
    };
  }
  return analysis;
}
