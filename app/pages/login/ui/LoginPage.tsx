import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card';
import { Input } from '~/shared/ui/input';
import { Label } from '~/shared/ui/label';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

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
        body: JSON.stringify({ password, username }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Sign in failed');
        return;
      }

      navigate(redirectTo, { replace: true });
    }
    catch (submissionError) {
      console.error('Sign in failed:', submissionError);
      setError('Sign in failed');
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
            <h1 className="text-inherit font-inherit">Sign in to Mediavault</h1>
          </CardTitle>
          <CardDescription>
            <p>Enter your account credentials to continue.</p>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                disabled={isSubmitting}
                onChange={event => setUsername(event.target.value)}
                placeholder="Enter username"
                required
                type="text"
                value={username}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                autoComplete="current-password"
                disabled={isSubmitting}
                onChange={event => setPassword(event.target.value)}
                placeholder="Enter password"
                required
                type="password"
                value={password}
              />
            </div>

            {error && (
              <Alert aria-live="polite" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
