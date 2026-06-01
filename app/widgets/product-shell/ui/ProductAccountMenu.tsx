import { LogOut, User } from 'lucide-react';
import { Link } from 'react-router';
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

  if (!user) {
    return null;
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
            <p className="truncate text-xs leading-none text-muted-foreground">
              {user.username}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild variant="destructive">
            <Link to="/api/auth/logout">
              <LogOut data-icon="inline-start" />
              Logout
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
