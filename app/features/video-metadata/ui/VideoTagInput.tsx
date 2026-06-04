import { X } from 'lucide-react';
import { useState } from 'react';
import {
  formatVideoTagLabel,
  normalizeVideoTags,
} from '~/modules/library/domain/video-tag';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';

interface VideoTagInputProps {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  placeholder?: string;
  value: string[];
}

function splitTagInput(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

export function VideoTagInput({
  ariaLabel,
  disabled = false,
  onChange,
  placeholder = 'Add tags',
  value,
}: VideoTagInputProps) {
  const [draft, setDraft] = useState('');
  const selectedTags = Array.isArray(value) ? value : [];

  const addDraftTags = (rawValue: string) => {
    const nextTags = normalizeVideoTags([
      ...selectedTags,
      ...splitTagInput(rawValue),
    ]);

    onChange(nextTags);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    onChange(selectedTags.filter(existingTag => existingTag !== tag));
  };

  return (
    <div className="min-h-11 rounded-lg border border-input bg-input/30 p-2 transition-colors focus-within:border-ring">
      {selectedTags.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <Badge key={tag} variant="secondary" className="h-6 gap-1 rounded-md px-2 text-xs font-medium">
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
        className="h-6 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
        disabled={disabled}
        onBlur={() => {
          if (draft.trim().length > 0) {
            addDraftTags(draft);
          }
        }}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={(event) => {
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
    </div>
  );
}
