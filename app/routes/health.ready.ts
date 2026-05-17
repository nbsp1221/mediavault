import { checkProductionReadiness } from '~/composition/server/runtime-readiness';

interface HealthReadyLoaderDependencies {
  checkProductionReadiness: typeof checkProductionReadiness;
}

export function createHealthReadyLoader(deps: HealthReadyLoaderDependencies) {
  return async function loader() {
    try {
      const report = await deps.checkProductionReadiness();

      return new Response(null, { status: report.ready ? 204 : 503 });
    }
    catch {
      return new Response(null, { status: 503 });
    }
  };
}

export const loader = createHealthReadyLoader({
  checkProductionReadiness,
});
