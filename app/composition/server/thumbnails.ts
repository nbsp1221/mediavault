import { ThumbnailDecryptionService } from '~/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service';

interface LoadDecryptedThumbnailResponseInput {
  eTagPrefix: string;
  request: Request;
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
