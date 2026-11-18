export function getPlaylistFailureStatus(reason: string): number {
  switch (reason) {
    case 'PLAYLIST_NOT_FOUND':
    case 'VIDEO_NOT_FOUND_IN_PLAYLIST':
      return 404;
    case 'PLAYLIST_PERMISSION_DENIED':
      return 403;
    case 'PLAYLIST_QUERY_UNAVAILABLE':
      return 503;
    case 'PLAYLIST_MUTATION_FAILED':
      return 500;
    default:
      return reason.startsWith('DUPLICATE_') ? 409 : 400;
  }
}

export function playlistFailureResponse(
  result: { reason: string; message: string },
  headers?: Headers,
): Response {
  return Response.json(
    { success: false, error: result.message },
    { headers, status: getPlaylistFailureStatus(result.reason) },
  );
}
