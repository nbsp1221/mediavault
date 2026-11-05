import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Form, useNavigate } from 'react-router';
import type { Playlist } from '~/entities/playlist/model/playlist';
import { PlaylistCard } from '~/entities/playlist/ui/PlaylistCard';
import {
  playlistPageSchema,
  playlistRequest,
} from '~/features/playlist-management/api/playlist-api';
import { PlaylistEditorDialog } from '~/features/playlist-management/ui/PlaylistEditorDialog';
import { useRootUser } from '~/shared/hooks/use-root-user';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Button } from '~/shared/ui/button';
import { Input } from '~/shared/ui/input';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface PlaylistsPageProps {
  playlists: Playlist[];
  total: number;
  searchQuery: string;
  hasMore: boolean;
}

export function PlaylistsPage({
  playlists,
  total,
  searchQuery,
  hasMore: initialHasMore,
}: PlaylistsPageProps) {
  const user = useRootUser();
  const navigate = useNavigate();
  const [items, setItems] = useState(playlists);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [query, setQuery] = useState(searchQuery);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState({ playlists, initialHasMore, searchQuery });
  const pageControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    pageControllerRef.current = controller;
    return () => controller.abort();
  }, [source]);
  if (
    source.playlists !== playlists ||
    source.initialHasMore !== initialHasMore ||
    source.searchQuery !== searchQuery
  ) {
    setSource({ playlists, initialHasMore, searchQuery });
    setItems(playlists);
    setHasMore(initialHasMore);
    setQuery(searchQuery);
    setError(null);
    setLoading(false);
  }

  const loadMore = async () => {
    const controller = pageControllerRef.current;
    if (loading || !controller) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(items.length) });
      if (searchQuery) {
        params.set('q', searchQuery);
      }
      const page = await playlistRequest(
        `/api/playlists?${params}`,
        { signal: controller.signal },
        playlistPageSchema,
      );
      if (controller.signal.aborted) {
        return;
      }
      setItems((previous) => [
        ...previous,
        ...page.playlists.filter(
          (playlist) => !previous.some((existing) => existing.id === playlist.id),
        ),
      ]);
      setHasMore(page.hasMore);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Unable to load playlists.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  return (
    <ProductShell
      actions={
        user ? (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus data-icon="inline-start" />
            New playlist
          </Button>
        ) : undefined
      }
      activeRoute="playlists"
      contentWidth="wide"
      description={`${total} accessible playlists`}
      headerMode="browse"
      mobileActions={
        user ? (
          <Button
            aria-label="New playlist"
            className="size-11"
            onClick={() => setCreating(true)}
            size="icon"
            type="button"
          >
            <Plus aria-hidden />
          </Button>
        ) : undefined
      }
      title="Playlists"
      toolbar={
        <Form
          action="/playlists"
          className="flex w-full max-w-xl items-center gap-2"
          method="get"
          role="search"
        >
          <Input
            aria-label="Search playlists"
            name="q"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search playlists..."
            type="search"
            value={query}
          />
          <Button aria-label="Search playlists" size="icon" type="submit" variant="outline">
            <Search />
          </Button>
          {query ? (
            <Button
              onClick={() => {
                setQuery('');
                void navigate('/playlists');
              }}
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
        </Form>
      }
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            {searchQuery ? 'No playlists match this search.' : 'No playlists available.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
        {hasMore ? (
          <Button
            className="self-center"
            disabled={loading}
            onClick={() => void loadMore()}
            type="button"
            variant="outline"
          >
            {loading ? 'Loading...' : 'Load more playlists'}
          </Button>
        ) : null}
      </div>
      {user ? (
        <PlaylistEditorDialog
          onOpenChange={setCreating}
          onSaved={(id) => {
            void navigate(`/playlists/${encodeURIComponent(id)}`);
          }}
          open={creating}
        />
      ) : null}
    </ProductShell>
  );
}
