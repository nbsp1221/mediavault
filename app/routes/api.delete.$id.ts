import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { createDeleteVideoAction } from '~/routes/.server/delete-video-action';

export const action = createDeleteVideoAction({
  getServerLibraryServices,
  requireProtectedApiSessionValue,
});
