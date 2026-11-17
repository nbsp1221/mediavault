import { Search, X } from 'lucide-react';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';

interface HomeSearchFieldProps {
  ariaLabel?: string;
  value: string;
  onChange: (query: string) => void;
}

export function HomeSearchField({ ariaLabel, value, onChange }: HomeSearchFieldProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={ariaLabel}
        type="search"
        placeholder="Search titles and tags..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-full border-border bg-card pr-10 pl-10 focus:ring-primary"
      />
      {value.length > 0 ? (
        <Button
          aria-label="Clear search"
          className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 rounded-full p-0"
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
