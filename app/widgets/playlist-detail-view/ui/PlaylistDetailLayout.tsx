import { cn } from '~/shared/lib/utils';

interface PlaylistDetailLayoutProps {
  infoSlot: React.ReactNode;
  videosSlot: React.ReactNode;
  className?: string;
}

export function PlaylistDetailLayout({ infoSlot, videosSlot, className }: PlaylistDetailLayoutProps) {
  return (
    <div
      className={cn(
        'w-full',
        className,
      )}
    >
      <div className="w-full">
        <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <div className="space-y-6">{infoSlot}</div>
          <div className="space-y-6 min-w-0">{videosSlot}</div>
        </div>
      </div>
    </div>
  );
}
