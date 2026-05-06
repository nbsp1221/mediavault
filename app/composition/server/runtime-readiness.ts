import {
  type MediaToolProbeResult,
  type ProductionReadinessIssue,
  type ProductionReadinessReport,
  type RuntimeEnvironment,
  type StorageProbeResult,
  classifyMediaToolProbeResults,
  classifyStorageProbeResults,
  collectCriticalProductionSecretIssues,
  createProductionReadinessReport,
  isProductionRuntime,
} from '~/modules/runtime/application/production-readiness.policy';
import {
  type RuntimeStorageProbeConfig,
  probeConfiguredStorage,
} from '~/modules/runtime/infrastructure/filesystem-runtime-probes.server';
import {
  probeMediaTools,
} from '~/modules/runtime/infrastructure/media-tool-runtime-probes.server';
import { getPrimaryStorageConfig } from '~/modules/storage/infrastructure/config/storage-config.server';
import { createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

interface RuntimeReadinessLogger {
  error: (message: string) => void;
  warn: (message: string) => void;
}

interface RuntimeReadinessServicesInput {
  env?: RuntimeEnvironment;
  getStorageConfig?: () => RuntimeStorageProbeConfig;
  logger?: RuntimeReadinessLogger;
  mediaProbeCacheTtlMs?: number;
  probeMediaTools?: () => Promise<MediaToolProbeResult[]>;
  probeStorage?: (config: RuntimeStorageProbeConfig) => Promise<StorageProbeResult[]>;
  runDatabaseStartupProbe?: (databasePath: string) => Promise<void>;
}

interface RuntimeReadinessServices {
  assertProductionStartupPreflight: () => Promise<void>;
  checkProductionReadiness: () => Promise<ProductionReadinessReport>;
}

const DEFAULT_MEDIA_PROBE_CACHE_TTL_MS = 5_000;

function defaultLogger(): RuntimeReadinessLogger {
  return {
    error: message => console.error(message),
    warn: message => console.warn(message),
  };
}

function createIssueSignature(issues: ProductionReadinessIssue[]): string {
  return issues
    .map(issue => `${issue.code}:${issue.subject}:${issue.severity}`)
    .sort()
    .join('|');
}

function formatIssueSummary(issues: ProductionReadinessIssue[]): string {
  return issues.map(issue => issue.message).join('; ');
}

async function runDefaultDatabaseStartupProbe(databasePath: string): Promise<void> {
  await createMigratedPrimarySqliteDatabase({ dbPath: databasePath });
}

function createDatabaseStartupIssue(): ProductionReadinessIssue {
  return {
    code: 'database-unavailable',
    message: 'Production startup preflight failed: DATABASE_SQLITE_PATH is not usable',
    severity: 'startup-blocking',
    subject: 'DATABASE_SQLITE_PATH',
  };
}

function createNonProductionReadinessIssue(): ProductionReadinessIssue {
  return {
    code: 'non-production-runtime',
    message: 'Production readiness is not available outside production runtime',
    severity: 'readiness-only',
    subject: 'NODE_ENV',
  };
}

export function createRuntimeReadinessServices(
  input: RuntimeReadinessServicesInput = {},
): RuntimeReadinessServices {
  const env = input.env ?? process.env;
  const getStorageConfig = input.getStorageConfig ?? getPrimaryStorageConfig;
  const logger = input.logger ?? defaultLogger();
  const runStorageProbe = input.probeStorage ?? probeConfiguredStorage;
  const runMediaProbe = input.probeMediaTools ?? probeMediaTools;
  const runDatabaseStartupProbe = input.runDatabaseStartupProbe ?? runDefaultDatabaseStartupProbe;
  const mediaProbeCacheTtlMs = input.mediaProbeCacheTtlMs ?? DEFAULT_MEDIA_PROBE_CACHE_TTL_MS;
  let cachedMediaProbe:
    | { expiresAt: number; results: MediaToolProbeResult[] }
    | null = null;
  let inFlightMediaProbe: Promise<MediaToolProbeResult[]> | null = null;
  let lastLoggedReadinessIssueSignature = '';

  async function checkMediaTools(): Promise<MediaToolProbeResult[]> {
    const now = Date.now();
    if (cachedMediaProbe && cachedMediaProbe.expiresAt > now) {
      return cachedMediaProbe.results;
    }

    if (!inFlightMediaProbe) {
      inFlightMediaProbe = runMediaProbe()
        .then((results) => {
          cachedMediaProbe = {
            expiresAt: Date.now() + mediaProbeCacheTtlMs,
            results,
          };

          return results;
        })
        .finally(() => {
          inFlightMediaProbe = null;
        });
    }

    return inFlightMediaProbe;
  }

  async function collectStartupIssues(): Promise<ProductionReadinessIssue[]> {
    if (!isProductionRuntime(env)) {
      return [];
    }

    const secretIssues = collectCriticalProductionSecretIssues(env);
    const storageConfig = getStorageConfig();
    const storageIssues = classifyStorageProbeResults(await runStorageProbe(storageConfig));

    if (secretIssues.length > 0 || storageIssues.length > 0) {
      return [...secretIssues, ...storageIssues];
    }

    try {
      await runDatabaseStartupProbe(storageConfig.databasePath);
      return [];
    }
    catch {
      return [createDatabaseStartupIssue()];
    }
  }

  return {
    async assertProductionStartupPreflight() {
      const issues = await collectStartupIssues();
      if (issues.length === 0) {
        return;
      }

      const message = formatIssueSummary(issues);
      logger.error(message);
      throw new Error(message);
    },

    async checkProductionReadiness() {
      if (!isProductionRuntime(env)) {
        return createProductionReadinessReport({
          issues: [createNonProductionReadinessIssue()],
        });
      }

      const secretIssues = collectCriticalProductionSecretIssues(env);
      const storageIssues = classifyStorageProbeResults(await runStorageProbe(getStorageConfig()));
      const startupIssues = [...secretIssues, ...storageIssues];
      const mediaIssues = startupIssues.length > 0
        ? []
        : classifyMediaToolProbeResults(await checkMediaTools());
      const report = createProductionReadinessReport({
        issues: [...startupIssues, ...mediaIssues],
      });

      if (!report.ready) {
        const signature = createIssueSignature(report.issues);
        if (signature !== lastLoggedReadinessIssueSignature) {
          logger.warn(formatIssueSummary(report.issues));
          lastLoggedReadinessIssueSignature = signature;
        }
      }
      else {
        lastLoggedReadinessIssueSignature = '';
      }

      return report;
    },
  };
}

const defaultRuntimeReadinessServices = createRuntimeReadinessServices();

export const assertProductionStartupPreflight =
  defaultRuntimeReadinessServices.assertProductionStartupPreflight;

export const checkProductionReadiness =
  defaultRuntimeReadinessServices.checkProductionReadiness;
