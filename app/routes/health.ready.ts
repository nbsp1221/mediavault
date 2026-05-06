import { checkProductionReadiness } from '~/composition/server/runtime-readiness';

interface HealthReadyLoaderDependencies {
  checkProductionReadiness: typeof checkProductionReadiness;
}

export function createHealthReadyLoader(deps: HealthReadyLoaderDependencies) {
  return async function loader() {
    const report = await deps.checkProductionReadiness();

    return new Response(null, { status: report.ready ? 204 : 503 });
  };
}

export const loader = createHealthReadyLoader({
  checkProductionReadiness,
});
