import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { LibraryVideo } from '~/modules/library/domain/library-video';
import { type VideoViewer, VideoAccessPolicy } from '~/modules/library/domain/policies/video-access.policy';

export function toHomeLibraryVideoDto(
  video: LibraryVideo,
  viewer: VideoViewer,
): HomeLibraryVideo {
  return {
    contentTypeSlug: video.contentTypeSlug,
    createdAt: video.createdAt,
    description: video.description,
    duration: video.duration,
    genreSlugs: [...(video.genreSlugs ?? [])],
    id: video.id,
    isPrivate: video.visibility === 'private',
    permissions: VideoAccessPolicy.describePermissions({
      ownerId: video.ownerId,
      viewer,
      visibility: video.visibility,
    }),
    tags: [...video.tags],
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    videoUrl: video.videoUrl,
  };
}
