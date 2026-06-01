import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProductShell } from '../../../app/widgets/product-shell/ui/ProductShell';

const rootUserMock = vi.fn();
const toastMock = vi.fn();

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => rootUserMock(),
}));

vi.mock('sonner', () => ({
  toast: (message: string, options?: { id?: string }) => toastMock(message, options),
}));

function renderShell(initialPath = '/', shellProps: Partial<ComponentProps<typeof ProductShell>> = {}) {
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
    toastMock.mockReset();
  });

  test('anonymous visitors see only videos in the product shell', () => {
    rootUserMock.mockReturnValue(null);
    renderShell('/');

    expect(screen.getByRole('heading', { name: 'Videos' })).toBeInTheDocument();
    expect(screen.getByText('Page summary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Playlists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upload' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Favorites/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  test('authenticated owners see sidebar IA and coming-soon feedback without fake links', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    renderShell('/playlists');
    const beforeClickLocation = window.location.pathname;

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Upload' })).toHaveAttribute('href', '/add-videos');
    expect(screen.getByRole('button', { name: 'Favorites, Soon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History, Soon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings, Soon' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Account menu')).toBeInTheDocument();
    for (const prototypeOnlyLabel of ['Collections', 'Recently Added', 'Import', 'Trash', 'Devices', 'Security']) {
      expect(screen.queryByText(prototypeOnlyLabel)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/GB of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Favorites, Soon' }));
    await user.click(screen.getByRole('button', { name: 'History, Soon' }));
    await user.click(screen.getByRole('button', { name: 'Settings, Soon' }));

    expect(toastMock).toHaveBeenCalledWith('Favorites is coming soon.', { id: 'product-nav-favorites' });
    expect(toastMock).toHaveBeenCalledWith('History is coming soon.', { id: 'product-nav-history' });
    expect(toastMock).toHaveBeenCalledWith('Settings is coming soon.', { id: 'product-nav-settings' });
    expect(window.location.pathname).toBe(beforeClickLocation);
  });

  test('coming-soon destinations are keyboard-operable and use stable toast ids', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    renderShell('/');

    screen.getByRole('button', { name: 'Favorites, Soon' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(toastMock).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenNthCalledWith(1, 'Favorites is coming soon.', { id: 'product-nav-favorites' });
    expect(toastMock).toHaveBeenNthCalledWith(2, 'Favorites is coming soon.', { id: 'product-nav-favorites' });
  });

  test('open mobile navigation revalidates when the root session becomes anonymous', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    const { rerender } = renderShell('/');

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(within(dialog).getByRole('link', { name: 'Upload' })).toBeInTheDocument();

    rootUserMock.mockReturnValue(null);
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <ProductShell title="Videos" description="Page summary" actions={<button type="button">Page action</button>}>
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
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    const { container } = renderShell('/');

    const toggleButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);

    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(toggleButton).toHaveAttribute('aria-controls', 'product-mobile-navigation');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Videos' })).toBeInTheDocument();
    const ids = Array.from(container.querySelectorAll<HTMLElement>('[id]')).map(element => element.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Favorites, Soon' }));

    expect(toastMock).toHaveBeenCalledWith('Favorites is coming soon.', { id: 'product-nav-favorites' });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('closes mobile navigation from close, escape, brand, and navigation links', async () => {
    const user = userEvent.setup();
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
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
    await user.click(within(screen.getByRole('dialog', { name: 'Navigation menu' })).getByRole('link', { name: 'Mediavault home' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();

    await user.click(toggleButton);
    await user.click(within(screen.getByRole('dialog', { name: 'Navigation menu' })).getByRole('link', { name: 'Upload' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
  });

  test('renders a leading action, page actions, and account controls without duplicating mobile navigation', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    renderShell('/', {
      leadingAction: <button type="button">Back to library</button>,
    });

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'Back to library' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Page action' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
  });

  test('keeps the product header top row at a stable shell height', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    const { container } = renderShell('/', {
      headerMode: 'browse',
      toolbar: <div>Search tools</div>,
    });

    const headerTopRow = container.querySelector('header > div');

    expect(headerTopRow).toHaveClass('h-14 md:h-18');
    expect(within(screen.getByRole('banner')).getByText('Search tools')).toBeInTheDocument();
  });

  test('aligns the desktop header top row with the sidebar brand height', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    const { container } = renderShell('/');

    const headerTopRow = container.querySelector('header > div');
    const sidebarBrandArea = screen.getByLabelText('Mediavault home').parentElement;

    expect(headerTopRow).toHaveClass('md:h-18');
    expect(sidebarBrandArea).toHaveClass('h-18');
  });

  test('uses a low-emphasis account trigger instead of a primary action', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    renderShell('/');

    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('data-variant', 'ghost');
  });

  test('can scope the account action to desktop-only focused edit headers', () => {
    rootUserMock.mockReturnValue({ id: 'owner-1', role: 'admin', username: 'owner' });
    renderShell('/', {
      accountActionVisibility: 'desktop-only',
      mobileActions: <button type="button">Save</button>,
    });

    expect(screen.getByRole('button', { name: 'Account menu' }).closest('div')).toHaveClass('hidden md:block');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
