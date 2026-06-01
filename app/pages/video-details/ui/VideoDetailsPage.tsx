import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { Button } from '~/shared/ui/button';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';
import { VideoDetailsView } from '~/widgets/video-details/ui/VideoDetailsView';

interface VideoDetailsPageProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  redirectTo: string;
  video: HomeLibraryVideo;
}

export function VideoDetailsPage(props: VideoDetailsPageProps) {
  const navigate = useNavigate();
  const [isMetadataSubmitting, setIsMetadataSubmitting] = useState(false);
  const metadataFormId = `video-metadata-form-${props.video.id}`;
  const canEditMetadata = props.video.permissions.canEdit;

  const handleCancel = () => {
    void navigate(props.redirectTo);
  };

  return (
    <ProductShell
      accountActionVisibility="desktop-only"
      activeRoute="videos"
      actions={canEditMetadata ? (
        <>
          <Button disabled={isMetadataSubmitting} onClick={handleCancel} size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isMetadataSubmitting} form={metadataFormId} size="sm" type="submit">
            {isMetadataSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
        </>
      ) : undefined}
      contentWidth="wide"
      description="Edit and manage your video"
      leadingAction={(
        <Button aria-label="Back to library" onClick={handleCancel} size="icon-sm" type="button" variant="ghost">
          <ArrowLeft aria-hidden />
        </Button>
      )}
      mobileActions={canEditMetadata ? (
        <Button disabled={isMetadataSubmitting} form={metadataFormId} size="sm" type="submit" variant="ghost">
          {isMetadataSubmitting ? 'Saving...' : 'Save'}
        </Button>
      ) : undefined}
      title="Video details"
    >
      <div className="max-w-none px-0 py-0">
        <VideoDetailsView
          {...props}
          metadataFormId={metadataFormId}
          onMetadataSubmittingChange={setIsMetadataSubmitting}
          renderMetadataActions={false}
          showPageHeader={false}
        />
      </div>
    </ProductShell>
  );
}
