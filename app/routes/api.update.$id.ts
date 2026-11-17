import { getServerLibraryServices } from '~/composition/server/library.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import { createUpdateVideoAction } from '~/routes/.server/update-video-action';

export const action = createUpdateVideoAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
