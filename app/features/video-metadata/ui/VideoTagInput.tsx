import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { formatVideoTagLabel, videoTagsSchema } from '~/modules/library/domain/video-tag';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';

interface VideoTagInputProps {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  onValidationChange?: (error: string | null) => void;
  placeholder?: string;
  value: string[];
}

function splitTagInput(value: string): string[] {
  return value.split(',').filter((part) => part.length > 0 && !/^\p{Zs}+$/u.test(part));
}

export function VideoTagInput({
  ariaLabel,
  disabled = false,
  onChange,
  onValidationChange,
  placeholder = 'Add tags',
  value,
}: VideoTagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const selectedTags = Array.isArray(value) ? value : [];

  const validateDraft = (rawValue: string, tags = selectedTags) => {
    const parts = splitTagInput(rawValue);
    const result = videoTagsSchema.safeParse([...tags, ...parts]);
    const message = result.success ? null : (result.error.issues[0]?.message ?? 'Invalid tags.');
    setError(message);
    onValidationChange?.(message);
    return result;
  };

  const addDraftTags = (rawValue: string) => {
    const result = validateDraft(rawValue);
    if (!result.success) {
      return;
    }
    onChange(result.data);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    const nextTags = selectedTags.filter((existingTag) => existingTag !== tag);
    onChange(nextTags);
    validateDraft(draft, nextTags);
  };

  return (
    <div className="min-h-11 rounded-lg border border-input bg-input/30 p-2 transition-colors focus-within:border-ring">
      {selectedTags.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-6 gap-1 rounded-md px-2 text-xs font-medium"
            >
              {formatVideoTagLabel(tag)}
              <Button
                aria-label={`Remove ${formatVideoTagLabel(tag)} tag`}
                disabled={disabled}
                onClick={() => removeTag(tag)}
                size="sm"
                type="button"
                variant="ghost"
                className="size-4 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <X className="size-3" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}

      <Input
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-6 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
        disabled={disabled}
        onBlur={() => {
          if (draft.trim().length > 0) {
            addDraftTags(draft);
          }
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          validateDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addDraftTags(draft);
          }

          if (event.key === 'Backspace' && draft.length === 0 && selectedTags.length > 0) {
            onChange(selectedTags.slice(0, -1));
          }
        }}
        placeholder={placeholder}
        value={draft}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
