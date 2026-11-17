import { LogOut, User } from 'lucide-react';
import { Form, Link, useLocation } from 'react-router';
import { useRootUser } from '~/shared/hooks/use-root-user';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';

export function ProductAccountMenu() {
  const user = useRootUser();
  const location = useLocation();

  if (!user) {
    const redirectTo =
      location.pathname.startsWith('/') && !location.pathname.startsWith('//')
        ? `${location.pathname}${location.search}${location.hash}`
        : '/';
    return (
      <Button asChild size="sm" variant="outline">
        <Link to={`/login?${new URLSearchParams({ redirectTo })}`}>Sign in</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Account menu"
          className="size-10 overflow-hidden rounded-full"
          size="icon"
          title="Account Menu"
          variant="ghost"
        >
          <User aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium leading-none">Account</p>
            <p className="truncate text-xs leading-none text-muted-foreground">{user.username}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Form action="/api/auth/logout" method="post">
            <DropdownMenuItem
              asChild
              onSelect={(event) => event.preventDefault()}
              variant="destructive"
            >
              <button className="w-full" type="submit">
                <LogOut data-icon="inline-start" />
                Logout
              </button>
            </DropdownMenuItem>
          </Form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
