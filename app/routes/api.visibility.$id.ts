import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { createChangeVisibilityAction } from '~/routes/.server/change-video-visibility-action';

export const action = createChangeVisibilityAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
