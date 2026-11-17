import { useId, useState } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '~/shared/ui/field';
import { Input } from '~/shared/ui/input';
import { NativeSelect, NativeSelectOption } from '~/shared/ui/native-select';
import { Textarea } from '~/shared/ui/textarea';
import { type PlaylistEditorValues, playlistRequest } from '../api/playlist-api';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a playlist name.')
    .max(255, 'Use no more than 255 characters.'),
  description: z.string().max(1000, 'Use no more than 1000 characters.'),
  isPublic: z.boolean(),
});

interface PlaylistEditorDialogProps {
  initialValues?: PlaylistEditorValues;
  playlistId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (playlistId: string) => void;
}

function PlaylistEditorForm({
  initialValues,
  playlistId,
  onSaved,
  onCancel,
}: Omit<PlaylistEditorDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const id = useId();
  const [values, setValues] = useState<PlaylistEditorValues>(
    initialValues ?? { name: '', description: '', isPublic: false },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof PlaylistEditorValues, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
      );
      return;
    }
    setErrors({});
    setError(null);
    setSaving(true);
    try {
      const result = await playlistRequest(
        playlistId ? `/api/playlists/${encodeURIComponent(playlistId)}` : '/api/playlists',
        {
          method: playlistId ? 'PUT' : 'POST',
          body: JSON.stringify(playlistId ? parsed.data : { ...parsed.data, type: 'user_created' }),
        },
      );
      const savedId = playlistId ?? result.playlistId;
      if (typeof savedId !== 'string' || !savedId) {
        throw new Error('The playlist response did not include its ID.');
      }
      onSaved(savedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the playlist.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)} data-disabled={saving}>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input
            aria-invalid={Boolean(errors.name)}
            disabled={saving}
            id={`${id}-name`}
            maxLength={255}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, name: event.target.value }))
            }
            value={values.name}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(errors.description)} data-disabled={saving}>
          <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
          <Textarea
            aria-invalid={Boolean(errors.description)}
            disabled={saving}
            id={`${id}-description`}
            maxLength={1000}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, description: event.target.value }))
            }
            value={values.description}
          />
          {errors.description ? <FieldError>{errors.description}</FieldError> : null}
        </Field>
        <Field data-disabled={saving}>
          <FieldLabel htmlFor={`${id}-visibility`}>Visibility</FieldLabel>
          <NativeSelect
            disabled={saving}
            id={`${id}-visibility`}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, isPublic: event.target.value === 'public' }))
            }
            value={values.isPublic ? 'public' : 'private'}
          >
            <NativeSelectOption value="private">Private</NativeSelectOption>
            <NativeSelectOption value="public">Public</NativeSelectOption>
          </NativeSelect>
          <FieldDescription>
            Public playlists can be viewed by anyone. Private videos remain available only to their
            owners.
          </FieldDescription>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button disabled={saving} onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Saving...' : playlistId ? 'Save playlist' : 'Create playlist'}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

export function PlaylistEditorDialog({
  initialValues,
  playlistId,
  open,
  onOpenChange,
  onSaved,
}: PlaylistEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{playlistId ? 'Edit playlist' : 'New playlist'}</DialogTitle>
          <DialogDescription>
            Organize videos without changing their individual access permissions.
          </DialogDescription>
        </DialogHeader>
        <PlaylistEditorForm
          initialValues={initialValues}
          key={`${playlistId ?? 'new'}-${open}`}
          onCancel={() => onOpenChange(false)}
          onSaved={(id) => {
            onOpenChange(false);
            onSaved(id);
          }}
          playlistId={playlistId}
        />
      </DialogContent>
    </Dialog>
  );
}
