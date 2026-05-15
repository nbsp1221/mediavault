import { Bell, LogOut, Menu, Search, Upload, User } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  type HomeNavigationItem,
  HOME_LIBRARY_ITEMS,
  HOME_MANAGEMENT_ITEMS,
  HOME_SETTINGS_ITEMS,
} from '~/entities/home-shell/model/home-navigation';
import { useRootUser } from '~/shared/hooks/use-root-user';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';
import { Input } from '~/shared/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '~/shared/ui/sidebar';

interface AddVideosShellProps {
  children: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

function NavigationSection({
  items,
  pathname,
  title,
}: {
  items: HomeNavigationItem[];
  pathname: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="mb-3 px-3 text-base font-semibold uppercase tracking-wide text-sidebar-foreground/70">
        {title}
      </h3>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                asChild
                className="gap-3 px-3 py-3 text-sm font-medium"
                isActive={isActive}
                size="default"
              >
                <Link to={item.path}>
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}

function AddVideosSidebar() {
  const location = useLocation();
  const { isMobile } = useSidebar();

  return (
    <Sidebar className="border-r" collapsible={isMobile ? 'offcanvas' : 'none'}>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <svg className="h-5 w-5 fill-current text-primary-foreground" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-sidebar-foreground">Mediavault</span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 space-y-6 p-4">
        <NavigationSection
          items={HOME_LIBRARY_ITEMS}
          pathname={location.pathname}
          title="Library"
        />
        <NavigationSection
          items={HOME_MANAGEMENT_ITEMS}
          pathname={location.pathname}
          title="Manage"
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <NavigationSection
          items={HOME_SETTINGS_ITEMS}
          pathname={location.pathname}
          title="Settings"
        />
      </SidebarFooter>
    </Sidebar>
  );
}

function AddVideosHeader({
  searchQuery = '',
  onSearchChange,
}: Omit<AddVideosShellProps, 'children'>) {
  const user = useRootUser();

  return (
    <header className="bg-background/80 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <div className="flex flex-1 items-center gap-4">
          <SidebarTrigger className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-sidebar-accent md:hidden">
            <Menu className="h-5 w-5" />
          </SidebarTrigger>

          <div className="hidden max-w-xl flex-1 md:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full rounded-full border-border bg-card pl-10 focus:ring-primary"
                onChange={event => onSearchChange?.(event.target.value)}
                placeholder="Search titles and tags..."
                type="search"
                value={searchQuery}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            asChild
            className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
          >
            <Link to="/add-videos">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </Link>
          </Button>

          <Button
            className="relative rounded-full transition-colors hover:bg-sidebar-accent"
            size="icon"
            variant="ghost"
          >
            <Bell className="h-5 w-5" />
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-8 w-8 overflow-hidden rounded-full bg-primary"
                  size="icon"
                  title="Account Menu"
                  variant="ghost"
                >
                  <div className="flex h-full w-full items-center justify-center bg-primary">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium leading-none">Account</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.username}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
                  <a href="/api/auth/logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border px-4 pb-4 md:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full border-border bg-card pl-10"
            onChange={event => onSearchChange?.(event.target.value)}
            placeholder="Search titles and tags..."
            type="search"
            value={searchQuery}
          />
        </div>
      </div>
    </header>
  );
}

export function AddVideosShell({
  children,
  searchQuery = '',
  onSearchChange,
}: AddVideosShellProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AddVideosSidebar />
        <div className="flex flex-1 flex-col">
          <AddVideosHeader
            onSearchChange={onSearchChange}
            searchQuery={searchQuery}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
