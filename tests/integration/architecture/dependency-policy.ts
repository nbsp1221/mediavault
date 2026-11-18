import type { SourceDependency } from './source-dependencies';

const runtimeConfigContracts = new Set([
  'app/shared/config/app-config.server.ts',
  'app/shared/config/public-env.server.ts',
  'app/shared/config/runtime-config-contract.server.ts',
]);
const storageContracts = new Set([
  'app/modules/storage/infrastructure/sqlite/primary-sqlite.database.ts',
  'app/modules/storage/infrastructure/sqlite/initialized-primary-sqlite.database.ts',
]);

export function dependencyViolation({ from, to }: SourceDependency): string | null {
  const sourceModule = /^app\/modules\/([^/]+)\/(domain|application|infrastructure)\//.exec(from);
  const targetModule = /^app\/modules\/([^/]+)\/(domain|application|infrastructure)\//.exec(to);
  const core = sourceModule?.[2] === 'domain' || sourceModule?.[2] === 'application';

  if (
    sourceModule &&
    /^app\/(routes|composition|pages|features|entities|widgets|shared\/ui)\//.test(to)
  ) {
    return 'Backend modules must not depend on HTTP, composition or UI';
  }

  if (core && targetModule?.[2] === 'infrastructure') {
    return 'Application core must not depend on infrastructure';
  }
  if (sourceModule?.[2] === 'domain' && targetModule?.[2] === 'application') {
    return 'Domain must not depend on application orchestration';
  }
  if (core && /^app\/shared\/(config|lib\/(http|server))\//.test(to)) {
    const readinessConfig =
      from === 'app/modules/runtime/application/production-readiness.policy.ts' &&
      runtimeConfigContracts.has(to);
    if (!readinessConfig) {
      return 'Business core must not consume server configuration or HTTP helpers';
    }
  }
  if (
    /^app\/(pages|features|entities|widgets)\//.test(from) &&
    (/^app\/(routes|composition)\//.test(to) ||
      targetModule?.[2] === 'infrastructure' ||
      /(?:\.server\.|\/\.server\/)/.test(to))
  ) {
    return 'Browser UI must consume browser-safe contracts';
  }
  if (from.startsWith('app/composition/') && to.startsWith('app/routes/')) {
    return 'Composition must not depend on HTTP adapters';
  }
  if (
    sourceModule?.[2] === 'infrastructure' &&
    targetModule?.[2] === 'infrastructure' &&
    sourceModule[1] !== targetModule[1]
  ) {
    if (storageContracts.has(to)) {
      return null;
    } // Shared single-database I/O contract.
    if (
      from === 'app/modules/storage/infrastructure/sqlite/primary-schema.sql.ts' &&
      to === 'app/modules/ingest/infrastructure/jobs/ingest-job-schema.sql.ts'
    ) {
      return null;
    } // Fresh schema assembly.
    if (
      targetModule[1] === 'media-assets' &&
      ['ingest', 'playback', 'thumbnail'].includes(sourceModule[1])
    ) {
      return null;
    }
    return 'Use a public contract or composition adapter instead of another business module infrastructure';
  }
  return null;
}
