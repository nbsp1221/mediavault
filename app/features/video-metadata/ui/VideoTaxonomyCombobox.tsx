import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { cn } from '~/shared/lib/utils';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/shared/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/shared/ui/popover';

interface VideoTaxonomySingleSelectProps {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (slug: string | undefined) => void;
  options: VideoTaxonomyItem[];
  placeholder: string;
  value?: string;
}

interface VideoTaxonomyMultiSelectProps {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (slugs: string[]) => void;
  options: VideoTaxonomyItem[];
  placeholder: string;
  value: string[];
}

function getOptionLabel(options: VideoTaxonomyItem[], slug: string) {
  return options.find(option => option.slug === slug)?.label ?? slug;
}

export function VideoTaxonomySingleSelect({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder,
  value,
}: VideoTaxonomySingleSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value ? getOptionLabel(options, value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          aria-expanded={open}
          className="h-10 w-full justify-between rounded-lg border-input bg-input/30 px-3 font-normal hover:bg-input/50"
          disabled={disabled}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className={cn('truncate text-sm', !value && 'text-muted-foreground')}>{selectedLabel}</span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Search options..." />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__empty__"
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                <Check className={cn(!value ? 'opacity-100' : 'opacity-0')} />
                No selection
              </CommandItem>
              {options.map(option => (
                <CommandItem
                  key={option.slug}
                  value={option.slug}
                  onSelect={() => {
                    onChange(option.slug);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(value === option.slug ? 'opacity-100' : 'opacity-0')} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function VideoTaxonomyMultiSelect({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder,
  value,
}: VideoTaxonomyMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabels = useMemo(() => value.map(slug => getOptionLabel(options, slug)), [options, value]);

  const toggleValue = (slug: string) => {
    onChange(value.includes(slug)
      ? value.filter(existingSlug => existingSlug !== slug)
      : [...value, slug]);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map(slug => (
            <Badge key={slug} variant="secondary" className="h-6 gap-1 rounded-md px-2 text-xs font-medium">
              {getOptionLabel(options, slug)}
              <Button
                aria-label={`Remove ${getOptionLabel(options, slug)} genre`}
                disabled={disabled}
                onClick={() => onChange(value.filter(existingSlug => existingSlug !== slug))}
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

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={ariaLabel}
            aria-expanded={open}
            className="h-10 w-full justify-between rounded-lg border-input bg-input/30 px-3 font-normal hover:bg-input/50"
            disabled={disabled}
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className={cn('truncate text-sm', value.length === 0 && 'text-muted-foreground')}>
              {selectedLabels.length > 0 ? `${selectedLabels.length} selected` : placeholder}
            </span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder="Search options..." />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map(option => (
                  <CommandItem
                    key={option.slug}
                    value={option.slug}
                    onSelect={() => toggleValue(option.slug)}
                  >
                    <Check className={cn(value.includes(option.slug) ? 'opacity-100' : 'opacity-0')} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
