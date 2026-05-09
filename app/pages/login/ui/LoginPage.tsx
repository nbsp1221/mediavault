import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card';
import { Input } from '~/shared/ui/input';
import { Label } from '~/shared/ui/label';

interface LoginPageProps {
  authConfigured?: boolean;
  configurationError?: string | null;
}

export function LoginPage({
  authConfigured = true,
  configurationError = null,
}: LoginPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');

  const redirectTo = (() => {
    const candidate = searchParams.get('redirectTo');

    if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
      return '/';
    }

    return candidate;
  })();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        body: JSON.stringify({ password }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Unlock failed');
        return;
      }

      navigate(redirectTo, { replace: true });
    }
    catch (submissionError) {
      console.error('Unlock failed:', submissionError);
      setError('Unlock failed');
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <h1 className="text-inherit font-inherit">Unlock your vault</h1>
          </CardTitle>
          <CardDescription>
            <p>Enter the shared password to access Mediavault.</p>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="shared-password">Shared password</Label>
              <Input
                id="shared-password"
                autoComplete="current-password"
                disabled={isSubmitting || !authConfigured}
                onChange={event => setPassword(event.target.value)}
                placeholder="Enter password"
                required
                type="password"
                value={password}
              />
            </div>

            {!authConfigured && (
              <Alert aria-live="polite" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {configurationError || 'Shared-password auth is not configured. Set AUTH_SHARED_PASSWORD and restart the server.'}
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert aria-live="polite" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={isSubmitting || !authConfigured} type="submit">
              {isSubmitting ? 'Unlocking...' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
