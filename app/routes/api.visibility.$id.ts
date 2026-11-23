import { getServerLibraryServices } from '~/composition/server/library.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import { createChangeVisibilityAction } from '~/routes/.server/change-video-visibility-action';

export const action = createChangeVisibilityAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
