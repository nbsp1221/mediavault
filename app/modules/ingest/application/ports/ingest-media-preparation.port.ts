import type {
  IngestMediaAnalysis,
  IngestMediaPreparationStrategy,
} from '~/modules/ingest/domain/media-preparation-policy';

export interface PrepareIngestMediaCommand {
  analysis: IngestMediaAnalysis;
  onPhase?: (phase: 'packaging' | 'preparing' | 'thumbnail' | 'verifying') => Promise<void>;
  signal?: AbortSignal;
  sourcePath: string;
  strategy: IngestMediaPreparationStrategy;
  title: string;
  videoId: string;
  workspaceRootDir?: string;
}

export interface PrepareIngestMediaResult {
  dashEnabled: boolean;
  message: string;
}

export interface IngestMediaPreparationPort {
  prepareMedia(command: PrepareIngestMediaCommand): Promise<PrepareIngestMediaResult>;
}
