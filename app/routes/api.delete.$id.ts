import { getServerLibraryServices } from '~/composition/server/library.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import { createDeleteVideoAction } from '~/routes/.server/delete-video-action';

export const action = createDeleteVideoAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
