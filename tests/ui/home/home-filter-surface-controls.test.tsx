import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { HomeFilterSurface } from '../../../app/features/home-tag-filter/ui/HomeFilterSurface';
import { createHomeLibraryFilters } from '../../../app/widgets/home-library/model/home-library-filters';

vi.mock('../../../app/features/video-metadata/ui/VideoTagInput', () => ({
  VideoTagInput: ({
    ariaLabel,
    onChange,
    value,
  }: {
    ariaLabel: string;
    onChange: (tags: string[]) => void;
    value: string[];
  }) => (
    <button onClick={() => onChange([...value, ariaLabel === 'Require tags' ? 'drama' : 'spoiler'])} type="button">
      {ariaLabel}
    </button>
  ),
}));

vi.mock('../../../app/features/video-metadata/ui/VideoTaxonomyCombobox', () => ({
  VideoTaxonomyMultiSelect: ({ onChange }: { onChange: (value: string[]) => void }) => (
    <button onClick={() => onChange(['noir'])} type="button">
      Genre filter
    </button>
  ),
  VideoTaxonomySingleSelect: ({ onChange }: { onChange: (value?: string) => void }) => (
    <button onClick={() => onChange('movie')} type="button">
      Content type filter
    </button>
  ),
}));

vi.mock('~/shared/ui/drawer', () => ({
  Drawer: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    open ? <div data-testid="mock-drawer">{children}</div> : null
  ),
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <section aria-label="Filters" role="dialog">{children}</section>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('~/shared/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    open ? <div data-testid="mock-sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: ReactNode }) => (
    <section aria-label="Filters" role="dialog">{children}</section>
  ),
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const originalMatchMedia = window.matchMedia;

function setDesktopMediaQuery(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

describe('home filter surface controls', () => {
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  test('applies desktop filter field changes directly to committed filters', () => {
    setDesktopMediaQuery(true);
    const handleFiltersChange = vi.fn();

    render(
      <HomeFilterSurface
        contentTypes={[{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }]}
        filters={createHomeLibraryFilters({ query: 'vault' })}
        genres={[{ active: true, label: 'Noir', slug: 'noir', sortOrder: 10 }]}
        onFiltersChange={handleFiltersChange}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Require tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exclude tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'Content type filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Genre filter' }));

    expect(handleFiltersChange).toHaveBeenCalledWith(expect.objectContaining({
      includeTags: ['drama'],
      query: 'vault',
    }));
    expect(handleFiltersChange).toHaveBeenCalledWith(expect.objectContaining({
      excludeTags: ['spoiler'],
      query: 'vault',
    }));
    expect(handleFiltersChange).toHaveBeenCalledWith(expect.objectContaining({
      contentTypeSlug: 'movie',
      query: 'vault',
    }));
    expect(handleFiltersChange).toHaveBeenCalledWith(expect.objectContaining({
      genreSlugs: ['noir'],
      query: 'vault',
    }));
  });

  test('keeps closed mobile drafts isolated until the drawer opens again', () => {
    setDesktopMediaQuery(false);
    const handleFiltersChange = vi.fn();

    const { rerender } = render(
      <HomeFilterSurface
        contentTypes={[]}
        filters={createHomeLibraryFilters({ includeTags: ['drama'], query: 'vault' })}
        genres={[]}
        onFiltersChange={handleFiltersChange}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Require tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(handleFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({
      includeTags: ['drama'],
    }));

    rerender(
      <HomeFilterSurface
        contentTypes={[]}
        filters={createHomeLibraryFilters({ includeTags: ['comedy'], query: 'vault' })}
        genres={[]}
        onFiltersChange={handleFiltersChange}
        onOpenChange={vi.fn()}
        open={false}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();

    rerender(
      <HomeFilterSurface
        contentTypes={[]}
        filters={createHomeLibraryFilters({ includeTags: ['comedy'], query: 'vault' })}
        genres={[]}
        onFiltersChange={handleFiltersChange}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(handleFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({
      includeTags: ['comedy'],
    }));
  });
});
