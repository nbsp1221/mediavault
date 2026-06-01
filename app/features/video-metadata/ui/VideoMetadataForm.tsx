import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { VideoTagInput } from '~/features/video-metadata/ui/VideoTagInput';
import {
  VideoTaxonomyMultiSelect,
  VideoTaxonomySingleSelect,
} from '~/features/video-metadata/ui/VideoTaxonomyCombobox';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/shared/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/shared/ui/form';
import { Input } from '~/shared/ui/input';
import { Textarea } from '~/shared/ui/textarea';

const formSchema = z.object({
  contentTypeSlug: z.string().nullable().optional(),
  description: z.string().max(1000, 'Description must be within 1000 characters').optional(),
  genreSlugs: z.array(z.string()),
  tags: z.array(z.string()),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be within 200 characters'),
});

export type VideoMetadataFormValues = z.infer<typeof formSchema>;

interface VideoMetadataFormProps {
  contentTypes: VideoTaxonomyItem[];
  error?: string | null;
  formId?: string;
  genres: VideoTaxonomyItem[];
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSave: (data: VideoMetadataFormValues) => Promise<void>;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  renderActions?: boolean;
  video: HomeLibraryVideo;
}

function createDefaultValues(video: HomeLibraryVideo): VideoMetadataFormValues {
  return {
    contentTypeSlug: video.contentTypeSlug ?? null,
    description: video.description || '',
    genreSlugs: video.genreSlugs ?? [],
    tags: video.tags,
    title: video.title,
  };
}

export function VideoMetadataForm({
  contentTypes,
  error,
  formId,
  genres,
  onCancel,
  onDirtyChange,
  onSave,
  onSubmittingChange,
  renderActions = true,
  video,
}: VideoMetadataFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<VideoMetadataFormValues>({
    defaultValues: createDefaultValues(video),
    resolver: zodResolver(formSchema),
  });

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    form.reset(createDefaultValues(video));
  }, [form, video]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const handleSubmit = async (values: VideoMetadataFormValues) => {
    setIsSubmitting(true);
    try {
      await onSave({
        contentTypeSlug: values.contentTypeSlug ?? null,
        description: values.description,
        genreSlugs: values.genreSlugs,
        tags: values.tags,
        title: values.title,
      });
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-6">
        <section aria-labelledby="video-basic-information-heading">
          <Card>
            <CardHeader>
              <CardTitle id="video-basic-information-heading" className="text-base">
                Basic information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter video title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        className="resize-none"
                        placeholder="Enter video description"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <VideoTagInput
                        ariaLabel="Tags"
                        onChange={field.onChange}
                        placeholder="Add tags like family, action, watch-later"
                        value={field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="video-classification-heading">
          <Card>
            <CardHeader>
              <CardTitle id="video-classification-heading" className="text-base">
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contentTypeSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content type</FormLabel>
                    <FormControl>
                      <VideoTaxonomySingleSelect
                        ariaLabel="Content type"
                        onChange={field.onChange}
                        options={contentTypes}
                        placeholder="No content type"
                        value={field.value ?? undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="genreSlugs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Genre</FormLabel>
                    <FormControl>
                      <VideoTaxonomyMultiSelect
                        ariaLabel="Genre"
                        onChange={field.onChange}
                        options={genres}
                        placeholder="No genres"
                        value={field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </section>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        )}

        {renderActions && (
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button disabled={isSubmitting} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? (
                    <>
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                      Saving...
                    </>
                  )
                : 'Save changes'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
