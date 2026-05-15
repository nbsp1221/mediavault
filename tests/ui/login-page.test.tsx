import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LoginPage } from '~/pages/login/ui/LoginPage';

const navigateMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [currentSearchParams, vi.fn()],
  };
});

function renderLoginPage(initialEntry: string = '/login') {
  const url = new URL(initialEntry, 'http://localhost');
  currentSearchParams = new URLSearchParams(url.search);

  return {
    user: userEvent.setup(),
    ...render(<LoginPage />),
  };
}

describe('LoginPage', () => {
  afterEach(() => {
    currentSearchParams = new URLSearchParams();
    navigateMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('renders accessible username and password fields', () => {
    renderLoginPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Mediavault' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText(/shared password/i)).not.toBeInTheDocument();
  });

  test('shows an error alert when login fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ success: false, error: 'Invalid username or password' }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 401,
        },
      )) as unknown as typeof fetch,
    );

    const { user } = renderLoginPage();

    await user.type(screen.getByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('navigates to redirect target after successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ success: true, user: { id: 'user-1' } }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      )) as unknown as typeof fetch,
    );

    const { user } = renderLoginPage('/login?redirectTo=%2Fvault');

    await user.type(screen.getByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      body: JSON.stringify({
        password: 'correct-password',
        username: 'owner',
      }),
    }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/vault', { replace: true });
    });
  });

  test('requires both username and password before submitting', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { user } = renderLoginPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
