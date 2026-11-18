import type { VideoReadAccessScope } from '../../application/policies/video-read-access-scope';

export function videoReadScopeSql(scope: VideoReadAccessScope): { sql: string; params: string[] } {
  return scope.type === 'public_only'
    ? { sql: "videos.visibility = 'public'", params: [] }
    : { sql: "(videos.visibility = 'public' OR videos.owner_id = ?)", params: [scope.ownerId] };
}
