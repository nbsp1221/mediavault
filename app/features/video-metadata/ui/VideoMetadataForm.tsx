import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
  const titleValue = useWatch({ control: form.control, name: 'title' }) ?? '';
  const descriptionValue = useWatch({ control: form.control, name: 'description' }) ?? '';

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
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <section aria-labelledby="video-basic-information-heading">
          <Card className="gap-0 rounded-xl border-border/70 bg-card/60 py-0 shadow-none">
            <CardHeader className="px-4 pt-4 pb-0 lg:px-5 lg:pt-5">
              <CardTitle id="video-basic-information-heading" className="text-sm">
                Basic information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 px-4 pt-5 pb-4 lg:px-5 lg:pb-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Title</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          className="h-10 rounded-lg bg-input/30 pr-20 text-sm"
                          placeholder="Enter video title"
                          {...field}
                        />
                      </FormControl>
                      <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums text-muted-foreground" aria-live="polite">
                        {`${titleValue.length} / 200`}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Description</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Textarea
                          className="min-h-28 resize-none rounded-lg bg-input/30 pb-8 text-sm leading-5"
                          placeholder="Enter video description"
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <span className="absolute right-3 bottom-3 text-xs tabular-nums text-muted-foreground" aria-live="polite">
                        {`${descriptionValue.length} / 1000`}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Tags</FormLabel>
                    <FormControl>
                      <VideoTagInput
                        ariaLabel="Tags"
                        onChange={field.onChange}
                        placeholder="Add tag"
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
          <Card className="gap-0 rounded-xl border-border/70 bg-card/60 py-0 shadow-none">
            <CardHeader className="px-4 pt-4 pb-0 lg:px-5 lg:pt-5">
              <CardTitle id="video-classification-heading" className="text-sm">
                Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 px-4 pt-5 pb-4 sm:grid-cols-2 lg:px-5 lg:pb-5">
              <FormField
                control={form.control}
                name="contentTypeSlug"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Content type</FormLabel>
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
                  <FormItem className="gap-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Genre</FormLabel>
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
