import { spawn } from 'node:child_process';
import type { RuntimeEnvInput } from '~/shared/config/runtime-env.server';
import {
  getFFmpegPath,
  getFFprobePath,
  getShakaPackagerPath,
} from '~/shared/config/video-tools.server';
import type {
  MediaToolProbeResult,
  RuntimeMediaToolName,
} from '../application/production-readiness.policy';

export const DEFAULT_MEDIA_TOOL_PROBE_TIMEOUT_MS = 2_000;

export interface MediaToolPaths {
  ffmpeg: string;
  ffprobe: string;
  packager: string;
}

export interface MediaToolCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface MediaToolCommandOptions {
  timeoutMs: number;
}

export type MediaToolCommandRunner = (
  command: string,
  args: string[],
  options: MediaToolCommandOptions,
) => Promise<MediaToolCommandResult>;

export interface ProbeMediaToolsInput {
  env?: RuntimeEnvInput;
  paths?: MediaToolPaths;
  runner?: MediaToolCommandRunner;
  timeoutMs?: number;
}

interface ToolProbeDefinition {
  args: string[];
  command: string;
  tool: RuntimeMediaToolName;
}

export function resolveMediaToolPaths(env?: RuntimeEnvInput): MediaToolPaths {
  return {
    ffmpeg: getFFmpegPath(env),
    ffprobe: getFFprobePath(env),
    packager: getShakaPackagerPath(env),
  };
}

function getVersionArgs(tool: RuntimeMediaToolName): string[] {
  return tool === 'packager' ? ['--version'] : ['-version'];
}

function getErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const runMediaToolCommand: MediaToolCommandRunner = (
  command,
  args,
  options,
) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs,
  });

  let settled = false;
  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.on('error', (error) => {
    if (settled) {
      return;
    }

    settled = true;
    reject(error);
  });

  child.on('close', (exitCode, signal) => {
    if (settled) {
      return;
    }

    settled = true;
    if (signal === 'SIGKILL') {
      reject(new Error(`timed out after ${options.timeoutMs}ms`));
      return;
    }

    resolve({
      exitCode: exitCode ?? 1,
      stderr,
      stdout,
    });
  });
});

async function probeTool(
  definition: ToolProbeDefinition,
  runner: MediaToolCommandRunner,
  timeoutMs: number,
): Promise<MediaToolProbeResult> {
  try {
    const result = await runner(definition.command, definition.args, { timeoutMs });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        reason: `version command exited with ${result.exitCode}`,
        tool: definition.tool,
      };
    }

    return { ok: true, tool: definition.tool };
  }
  catch (error) {
    return {
      ok: false,
      reason: getErrorReason(error),
      tool: definition.tool,
    };
  }
}

export async function probeMediaTools(
  input: ProbeMediaToolsInput = {},
): Promise<MediaToolProbeResult[]> {
  const paths = input.paths ?? resolveMediaToolPaths(input.env);
  const runner = input.runner ?? runMediaToolCommand;
  const timeoutMs = input.timeoutMs ?? DEFAULT_MEDIA_TOOL_PROBE_TIMEOUT_MS;

  const definitions: ToolProbeDefinition[] = [
    { args: getVersionArgs('ffmpeg'), command: paths.ffmpeg, tool: 'ffmpeg' },
    { args: getVersionArgs('ffprobe'), command: paths.ffprobe, tool: 'ffprobe' },
    { args: getVersionArgs('packager'), command: paths.packager, tool: 'packager' },
  ];

  return Promise.all(definitions.map(definition => probeTool(definition, runner, timeoutMs)));
}
