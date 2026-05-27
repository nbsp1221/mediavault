import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import { SqliteCanonicalVideoMetadataAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter';
import { ThumbnailDecryptionService } from '~/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service';

interface LoadDecryptedThumbnailResponseInput {
  eTagPrefix: string;
  request: Request;
  videoRead?: LibraryVideoReadPort;
  viewer: VideoViewer;
  videoId: string;
}

function createThumbnailDecryptionService() {
  return new ThumbnailDecryptionService({
    logger: console,
  });
}

export async function loadDecryptedThumbnailResponse(
  input: LoadDecryptedThumbnailResponseInput,
): Promise<Response> {
  try {
    const videoRead = input.videoRead ?? new SqliteCanonicalVideoMetadataAdapter();
    const accessibleVideo = await videoRead.findLibraryVideoById(
      input.videoId,
      createVideoReadAccessScope(input.viewer),
    );

    if (!accessibleVideo) {
      return new Response('Thumbnail not found', { status: 404 });
    }

    const thumbnailDecryptionService = createThumbnailDecryptionService();
    const result = await thumbnailDecryptionService.decryptThumbnail({
      validateAccess: true,
      videoId: input.videoId,
    });

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return new Response('Thumbnail not found', { status: 404 });
      }

      console.error('Failed to decrypt thumbnail:', result.error);
      return new Response('Failed to load thumbnail', { status: 500 });
    }

    const { imageBuffer, mimeType, size } = result.data;
    const eTag = `"${input.eTagPrefix}-${input.videoId}-${size}"`;
    const ifNoneMatch = input.request.headers.get('If-None-Match');

    if (ifNoneMatch === eTag) {
      return new Response(null, { status: 304 });
    }

    return new Response(imageBuffer, {
      headers: {
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': size.toString(),
        'Content-Type': mimeType,
        'ETag': eTag,
      },
    });
  }
  catch (error) {
    console.error('Unexpected error in thumbnail decryption:', error);
    return new Response('Failed to load thumbnail', { status: 500 });
  }
}
