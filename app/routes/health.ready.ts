import { checkProductionReadiness } from '~/composition/server/runtime-readiness.server';
import { createHealthReadyLoader } from '~/routes/.server/health-ready-loader';

export const loader = createHealthReadyLoader({ checkProductionReadiness });
