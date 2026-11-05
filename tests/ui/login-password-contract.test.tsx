import type * as ReactRouter from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { validateUserPassword } from '~/modules/user/domain/value-objects/user-password';
import { LoginPage } from '~/pages/login/ui/LoginPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof ReactRouter>('react-router')),
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams()],
}));

const credentialsSchema = z.object({ password: z.string(), username: z.string() });

/** The simulated endpoint uses the same browser-safe password policy as the real auth use case. */
function createPolicyCheckingFetch() {
  return vi.fn<typeof fetch>(async (_request, init) => {
    if (typeof init?.body !== 'string') {
      throw new Error('Expected JSON credentials');
    }
    const body: unknown = JSON.parse(init.body);
    const credentials = credentialsSchema.parse(body);
    const accepted = validateUserPassword(credentials.password).ok;
    return Response.json(
      { success: accepted, error: accepted ? undefined : 'Invalid username or password' },
      { status: accepted ? 200 : 401 },
    );
  });
}

async function submitPassword(password: string) {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText('Username'), 'owner');
  const input = screen.getByLabelText('Password');
  await user.click(input);
  await user.paste(password);
  expect(input).toHaveValue(password);
  expect(input).not.toHaveAttribute('maxlength');
  expect(input).not.toHaveAttribute('minlength');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

function expectExactCredentials(
  fetchMock: ReturnType<typeof createPolicyCheckingFetch>,
  password: string,
) {
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/login', {
    body: JSON.stringify({ password, username: 'owner' }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

describe('login password client/server agreement', () => {
  afterEach(() => {
    navigate.mockReset();
    vi.unstubAllGlobals();
  });

  test.each(['\r', '\n'])(
    'keeps native password-field line-break behavior and rejects such account passwords %#',
    async (lineBreak) => {
      const user = userEvent.setup();
      render(<LoginPage />);
      const raw = 'x'.repeat(14) + lineBreak;
      const input = screen.getByLabelText('Password');
      await user.click(input);
      await user.paste(raw);
      expect(input).toHaveValue('x'.repeat(14));
      expect(validateUserPassword(raw)).toEqual({ ok: false, reason: 'PASSWORD_HAS_LINE_BREAK' });
    },
  );

  test.each([
    ['minimum astral Unicode', '🔒'.repeat(15)],
    ['maximum ASCII', 'a'.repeat(128)],
    ['maximum astral Unicode (256 UTF-16 code units)', '🔒'.repeat(128)],
    ['whitespace-only', ' '.repeat(15)],
    ['leading and trailing spaces', '  password with spaces  '],
    ['unnormalized combining characters', 'e\u0301'.repeat(64)],
  ])('submits accepted %s passwords unchanged', async (_label, password) => {
    const fetchMock = createPolicyCheckingFetch();
    vi.stubGlobal('fetch', fetchMock);
    await submitPassword(password);
    expectExactCredentials(fetchMock, password);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each([
    ['14 Unicode code points', '🔒'.repeat(14)],
    ['129 ASCII code points', 'a'.repeat(129)],
    ['129 astral Unicode code points', '🔒'.repeat(129)],
  ])(
    'preserves rejected %s input and shows the server generic credential error',
    async (_label, password) => {
      const fetchMock = createPolicyCheckingFetch();
      vi.stubGlobal('fetch', fetchMock);
      await submitPassword(password);
      expectExactCredentials(fetchMock, password);
      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
