import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProductShell } from '../../../app/widgets/product-shell/ui/ProductShell';

const rootUserMock = vi.fn<() => { id: string; username: string } | null>();

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => rootUserMock(),
}));

function renderShell(
  initialPath = '/',
  shellProps: Partial<ComponentProps<typeof ProductShell>> = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ProductShell
        title="Videos"
        description="Page summary"
        actions={<button type="button">Page action</button>}
        {...shellProps}
      >
        <div>Page content</div>
      </ProductShell>
    </MemoryRouter>,
  );
}

describe('ProductShell', () => {
  beforeEach(() => {
    rootUserMock.mockReset();
  });

  test('anonymous visitors see videos and public playlists in the product shell', () => {
    rootUserMock.mockReturnValue(null);
    renderShell('/');

    expect(screen.getByRole('heading', { name: 'Videos' })).toBeInTheDocument();
    expect(screen.getByText('Page summary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
    expect(screen.queryByRole('link', { name: 'Upload' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  test('authenticated viewers see implemented destinations and no placeholder actions', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/playlists');
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Upload' })).toHaveAttribute('href', '/add-videos');
    expect(screen.getByLabelText('Account menu')).toBeInTheDocument();
    for (const label of ['Favorites', 'History', 'Settings', 'Soon', 'Storage']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  test('open mobile navigation revalidates when the root session becomes anonymous', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    const { rerender } = renderShell('/');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(within(dialog).getByRole('link', { name: 'Upload' })).toBeInTheDocument();

    rootUserMock.mockReturnValue(null);
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <ProductShell
          title="Videos"
          description="Page summary"
          actions={<button type="button">Page action</button>}
        >
          <div>Page content</div>
        </ProductShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Videos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upload' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings, Soon' })).not.toBeInTheDocument();
  });

  test('opens mobile navigation with the same product destinations', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    const { container } = renderShell('/');

    const toggleButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);

    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(toggleButton).toHaveAttribute('aria-controls', 'product-mobile-navigation');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Videos' })).toBeInTheDocument();
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[id]')).map(
      (element) => element.id,
    );
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    expect(within(dialog).getByRole('link', { name: 'Playlists' })).toHaveAttribute(
      'href',
      '/playlists',
    );
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('closes mobile navigation from close, escape, brand, and navigation links', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/');

    const toggleButton = screen.getByRole('button', { name: 'Open navigation menu' });

    await user.click(toggleButton);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();

    await user.click(toggleButton);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Navigation menu' })).getByRole('link', {
        name: 'Mediavault home',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();

    await user.click(toggleButton);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Navigation menu' })).getByRole('link', {
        name: 'Upload',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  test('renders a leading action, page actions, and account controls without duplicating mobile navigation', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/', {
      leadingAction: <button type="button">Back to library</button>,
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Back to library' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Page action' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
  });

  test('preserves both supplied browse-mode action handlers for their responsive presentations', async () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    const desktopAction = vi.fn();
    const mobileAction = vi.fn();
    const user = userEvent.setup();
    renderShell('/playlists', {
      headerMode: 'browse',
      actions: (
        <button onClick={desktopAction} type="button">
          Desktop create
        </button>
      ),
      mobileActions: (
        <button onClick={mobileAction} type="button">
          Compact create
        </button>
      ),
    });
    expect(screen.getByRole('button', { name: 'Compact create' }).closest('.hidden')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Compact create' }));
    expect(mobileAction).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Desktop create' }));
    expect(desktopAction).toHaveBeenCalledOnce();
  });

  test('keeps the product header top row at a stable shell height', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    const { container } = renderShell('/', {
      headerMode: 'browse',
      toolbar: <div>Search tools</div>,
    });

    const headerTopRow = container.querySelector('header > div');

    expect(headerTopRow).toHaveClass('h-14 md:h-18');
    expect(screen.getByRole('button', { name: 'Page action' }).closest('.hidden')).not.toBeNull();
    expect(within(screen.getByRole('banner')).getByText('Search tools')).toBeInTheDocument();
  });

  test('aligns the desktop header top row with the sidebar brand height', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    const { container } = renderShell('/');

    const headerTopRow = container.querySelector('header > div');
    const sidebarBrandArea = screen.getByLabelText('Mediavault home').parentElement;

    expect(headerTopRow).toHaveClass('md:h-18');
    expect(sidebarBrandArea).toHaveClass('h-18');
  });

  test('uses a low-emphasis account trigger instead of a primary action', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/');

    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute(
      'data-variant',
      'ghost',
    );
  });

  test('can scope the account action to desktop-only focused edit headers', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/', {
      accountActionVisibility: 'desktop-only',
      mobileActions: <button type="button">Save</button>,
    });

    expect(screen.getByRole('button', { name: 'Account menu' }).closest('div')).toHaveClass(
      'hidden md:block',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('supports a full-width watch context while keeping Videos active', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', username: 'owner' });
    renderShell('/player/video-1', {
      activeRoute: 'videos',
      contentWidth: 'full',
      description: '90 seconds • Added Mar 9, 2026',
      headerMode: 'context',
      title: 'Watch fixture',
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Watch fixture' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
