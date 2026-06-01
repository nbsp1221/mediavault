import { Search, X } from 'lucide-react';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';

interface PlaylistSearchFieldProps {
  ariaLabel?: string;
  onChange: (query: string) => void;
  value: string;
}

export function PlaylistSearchField({
  ariaLabel,
  onChange,
  value,
}: PlaylistSearchFieldProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={ariaLabel}
        className="w-full rounded-md border-border bg-card pl-10 pr-10 focus:ring-primary"
        onChange={event => onChange(event.target.value)}
        placeholder="Search playlists..."
        type="search"
        value={value}
      />
      {value.length > 0 ? (
        <Button
          aria-label="Clear search"
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md p-0"
          onClick={() => onChange('')}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
