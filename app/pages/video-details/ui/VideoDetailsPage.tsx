import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { VideoDetailsView } from '~/widgets/video-details/ui/VideoDetailsView';

interface VideoDetailsPageProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  redirectTo: string;
  video: HomeLibraryVideo;
}

export function VideoDetailsPage(props: VideoDetailsPageProps) {
  return <VideoDetailsView {...props} />;
}
