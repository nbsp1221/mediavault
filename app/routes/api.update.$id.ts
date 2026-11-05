import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { createUpdateVideoAction } from '~/routes/.server/update-video-action';

export const action = createUpdateVideoAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
