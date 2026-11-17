import type { VideoTaxonomyItem } from '../../domain/video-taxonomy';
import type { LibraryVideoSourcePort } from '../ports/library-video-source.port';

interface LoadVideoMetadataVocabularySuccess {
  ok: true;
  data: {
    contentTypes: VideoTaxonomyItem[];
    genres: VideoTaxonomyItem[];
  };
}

interface LoadVideoMetadataVocabularyFailure {
  ok: false;
  reason: 'VOCABULARY_SOURCE_UNAVAILABLE';
}

export type LoadVideoMetadataVocabularyResult =
  | LoadVideoMetadataVocabularySuccess
  | LoadVideoMetadataVocabularyFailure;

interface LoadVideoMetadataVocabularyUseCaseDependencies {
  videoSource: LibraryVideoSourcePort;
}

export class LoadVideoMetadataVocabularyUseCase {
  constructor(private readonly deps: LoadVideoMetadataVocabularyUseCaseDependencies) {}

  async execute(): Promise<LoadVideoMetadataVocabularyResult> {
    try {
      const [contentTypes, genres] = await Promise.all([
        this.deps.videoSource.listActiveContentTypes(),
        this.deps.videoSource.listActiveGenres(),
      ]);

      return {
        ok: true,
        data: {
          contentTypes,
          genres,
        },
      };
    } catch {
      return {
        ok: false,
        reason: 'VOCABULARY_SOURCE_UNAVAILABLE',
      };
    }
  }
}
