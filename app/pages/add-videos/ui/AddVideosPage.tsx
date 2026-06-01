import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { useAddVideosView } from '~/widgets/add-videos/model/useAddVideosView';
import { AddVideosView } from '~/widgets/add-videos/ui/AddVideosView';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface AddVideosPageProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
}

export function AddVideosPage({ contentTypes, genres }: AddVideosPageProps) {
  const {
    canAddToLibrary,
    handleAddToLibrary,
    handleChooseFiles,
    handleClearSession,
    handleContentTypeChange,
    handleDescriptionChange,
    handleGenreSlugsChange,
    handleRemoveSession,
    handleRetryUpload,
    handleTagsChange,
    handleTitleChange,
    pageError,
    session,
  } = useAddVideosView();

  return (
    <ProductShell
      activeRoute="upload"
      contentWidth="standard"
      description="Choose one video, review its details, then add it to your library."
      title="Upload a video"
    >
      <div className="[&>div]:max-w-none [&>div]:px-0 [&>div]:py-0">
        <AddVideosView
          canAddToLibrary={canAddToLibrary}
          contentTypes={contentTypes}
          genres={genres}
          onAddToLibrary={() => { void handleAddToLibrary(); }}
          onChooseFiles={handleChooseFiles}
          onClearSession={handleClearSession}
          onContentTypeChange={handleContentTypeChange}
          onDescriptionChange={handleDescriptionChange}
          onGenreSlugsChange={handleGenreSlugsChange}
          onRemoveSession={() => { void handleRemoveSession(); }}
          onRetryUpload={handleRetryUpload}
          onTagsChange={handleTagsChange}
          onTitleChange={handleTitleChange}
          pageError={pageError}
          session={session}
          showPageHeader={false}
        />
      </div>
    </ProductShell>
  );
}
