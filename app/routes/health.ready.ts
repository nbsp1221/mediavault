import { checkProductionReadiness } from '~/composition/server/runtime-readiness';
import { createHealthReadyLoader } from '~/routes/.server/health-ready-loader';

export const loader = createHealthReadyLoader({ checkProductionReadiness });
