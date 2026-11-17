import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryFilters } from '../../../app/pages/home/model/home-library-filters';
import { createHomeLibraryFilters } from '../../../app/pages/home/model/home-library-filters';
import { HomeFilterSurface } from '../../../app/pages/home/ui/HomeFilterSurface';

vi.mock('~/shared/ui/drawer', () => ({
  Drawer: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div data-testid="mock-drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <section aria-label="Filters" role="dialog">
      {children}
    </section>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const originalMatchMedia = window.matchMedia;

function installMobileMediaQuery() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

function ControlledMobileFilterSurface() {
  const [filters, setFilters] = useState<HomeLibraryFilters>(() =>
    createHomeLibraryFilters({ query: 'Action' }),
  );
  const [open, setOpen] = useState(true);

  return (
    <>
      <output data-testid="filters">{JSON.stringify(filters)}</output>
      <button onClick={() => setOpen(true)} type="button">
        Reopen filters
      </button>
      <HomeFilterSurface
        contentTypes={[]}
        filters={filters}
        genres={[]}
        onFiltersChange={setFilters}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

describe('mobile home filter surface', () => {
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  test('prevents applying invalid tag drafts and resets them explicitly', async () => {
    installMobileMediaQuery();
    const user = userEvent.setup();
    render(<ControlledMobileFilterSurface />);
    fireEvent.change(screen.getByLabelText('Require tags'), {
      target: { value: '가'.repeat(101) },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('100 characters');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":[]');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Require tags')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    await user.type(screen.getByLabelText('Require tags'), '가족 여행{Enter}');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":["가족 여행"]');
  });

  test('keeps mobile filters as draft until apply and resets metadata while preserving query', async () => {
    installMobileMediaQuery();
    const user = userEvent.setup();

    render(<ControlledMobileFilterSurface />);

    expect(screen.getByTestId('filters')).toHaveTextContent('"query":"Action"');
    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":[]');

    await user.type(screen.getByLabelText('Require tags'), 'Drama{Enter}');

    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":[]');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":["drama"]');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reopen filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByTestId('filters')).toHaveTextContent('"query":"Action"');
    expect(screen.getByTestId('filters')).toHaveTextContent('"includeTags":[]');
  });
});
