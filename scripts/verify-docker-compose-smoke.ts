import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addAuthUser } from './auth-add-user';

const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

interface ComposeScenario {
  command?: string[];
  env: Record<string, string | undefined>;
  forbiddenLogIncludes?: string[];
  expectLogIncludes?: string[];
  expectedFinalState: 'exited' | 'healthy' | 'unhealthy';
  name: string;
  storageDir?: string;
}

function createProjectName(name: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`.toLowerCase();
  return `mediavault-compose-smoke-${name}-${suffix}`.replace(/[^a-z0-9_-]/g, '-');
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface ComposeConfig {
  services?: Record<string, {
    build?: {
      target?: string;
    };
    healthcheck?: {
      test?: unknown;
    };
    ports?: Array<{
      published?: number | string;
      target?: number | string;
    }>;
  }>;
}

async function runCommand(command: string[]): Promise<CommandResult> {
  const process = Bun.spawn(command, {
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode, stderr, stdout };
}

async function runDocker(args: string[]) {
  return runCommand(['docker', ...args]);
}

async function runCompose(
  composeFile: string,
  projectName: string,
  args: string[],
) {
  return runCommand(['docker', 'compose', '-p', projectName, '-f', composeFile, ...args]);
}

function envBlock(env: Record<string, string | undefined>): string {
  return Object.entries(env)
    .flatMap(([key, value]) => (value === undefined ? [] : [`      ${key}: ${JSON.stringify(value)}`]))
    .join('\n');
}

function commandBlock(command: string[] | undefined): string {
  if (!command) {
    return '';
  }

  return `\n    command: ${JSON.stringify(command)}`;
}

function volumesBlock(storageDir: string | undefined): string {
  if (!storageDir) {
    return '';
  }

  return `\n    volumes:\n      - ${JSON.stringify(`${storageDir}:/app/storage`)}`;
}

async function writeComposeFile(
  rootDir: string,
  imageTag: string,
  scenario: ComposeScenario,
): Promise<string> {
  const composeFile = path.join(rootDir, `${scenario.name}.compose.yaml`);
  const content = `services:
  mediavault:
    image: ${JSON.stringify(imageTag)}
    environment:
${envBlock(scenario.env)}${volumesBlock(scenario.storageDir)}${commandBlock(scenario.command)}
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://localhost:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 2s
      timeout: 10s
      retries: 3
      start_period: 1s
`;

  await writeFile(composeFile, content);
  return composeFile;
}

async function inspectState(containerId: string): Promise<string> {
  const result = await runDocker([
    'inspect',
    '-f',
    '{{if ne .State.Status "running"}}{{.State.Status}}{{else if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    containerId,
  ]);

  return result.stdout.trim();
}

async function getContainerId(composeFile: string, projectName: string): Promise<string> {
  const result = await runCompose(composeFile, projectName, ['ps', '-q', 'mediavault']);
  const containerId = result.stdout.trim();
  if (!containerId) {
    throw new Error(`Scenario ${projectName} did not create a mediavault container`);
  }

  return containerId;
}

function isExpectedState(state: string, expected: ComposeScenario['expectedFinalState']): boolean {
  if (expected === 'exited') {
    return state === 'exited' || state === 'dead';
  }

  return state === expected;
}

function composeUpArgsFor(scenario: ComposeScenario): string[] {
  return scenario.expectedFinalState === 'healthy'
    ? ['up', '--wait', '--wait-timeout', '90']
    : ['up', '-d'];
}

async function waitForExpectedState(
  composeFile: string,
  projectName: string,
  scenario: ComposeScenario,
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const containerId = await getContainerId(composeFile, projectName);
  let lastState = 'unknown';

  while (Date.now() < deadline) {
    lastState = await inspectState(containerId);
    if (isExpectedState(lastState, scenario.expectedFinalState)) {
      return lastState;
    }

    if (scenario.expectedFinalState !== 'exited' && (lastState === 'exited' || lastState === 'dead')) {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Scenario ${scenario.name} expected ${scenario.expectedFinalState}, got ${lastState}`);
}

async function readLogs(composeFile: string, projectName: string): Promise<string> {
  const result = await runCompose(composeFile, projectName, ['logs', '--no-color', 'mediavault']);

  return `${result.stdout}\n${result.stderr}`;
}

function assertScenarioLogs(scenario: ComposeScenario, logs: string): void {
  for (const expectedLog of scenario.expectLogIncludes ?? []) {
    if (!logs.includes(expectedLog)) {
      throw new Error(`Scenario ${scenario.name} logs did not include ${shellQuote(expectedLog)}.\nLogs:\n${logs}`);
    }
  }

  for (const forbiddenLog of scenario.forbiddenLogIncludes ?? []) {
    if (logs.includes(forbiddenLog)) {
      throw new Error(`Scenario ${scenario.name} logs leaked ${shellQuote(forbiddenLog)}.\nLogs:\n${logs}`);
    }
  }
}

function assertComposeConfigContract(config: ComposeConfig): void {
  const service = config.services?.mediavault;
  if (!service) {
    throw new Error('services.mediavault is missing');
  }

  if (service.build?.target !== 'production') {
    throw new Error('services.mediavault.build.target must be production');
  }

  const publishesDefaultPort = service.ports?.some(port => (
    String(port.published) === '3000' &&
    String(port.target) === '3000'
  ));
  if (!publishesDefaultPort) {
    throw new Error('services.mediavault.ports must publish 3000:3000');
  }

  const healthcheckTest = Array.isArray(service.healthcheck?.test)
    ? service.healthcheck.test.join(' ')
    : String(service.healthcheck?.test ?? '');
  if (!healthcheckTest.includes('http://localhost:3000/health/ready')) {
    throw new Error('services.mediavault.healthcheck.test must use /health/ready');
  }
}

async function validateCheckedInComposeConfig(rootDir: string): Promise<void> {
  const projectDir = path.join(rootDir, 'checked-in-compose-config');
  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, '.env'), '');

  const result = await runCommand([
    'docker',
    'compose',
    '--project-directory',
    projectDir,
    '--env-file',
    path.join(projectDir, '.env'),
    '-f',
    path.resolve('docker-compose.yaml'),
    'config',
    '--format',
    'json',
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`checked-in docker-compose.yaml config failed:\n${result.stderr}`);
  }

  try {
    assertComposeConfigContract(JSON.parse(result.stdout) as ComposeConfig);
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`checked-in docker-compose.yaml config contract failed: ${reason}\nConfig:\n${result.stdout}`);
  }

  console.log('✓ checked-in docker-compose.yaml config');
}

async function runScenario(rootDir: string, imageTag: string, scenario: ComposeScenario): Promise<void> {
  const projectName = createProjectName(scenario.name);
  const composeFile = await writeComposeFile(rootDir, imageTag, scenario);

  try {
    const up = await runCompose(composeFile, projectName, composeUpArgsFor(scenario));
    if (up.exitCode !== 0) {
      throw new Error(`docker compose up failed for ${scenario.name}:\n${up.stderr}`);
    }

    const state = await waitForExpectedState(composeFile, projectName, scenario);
    const logs = await readLogs(composeFile, projectName);
    assertScenarioLogs(scenario, logs);

    console.log(`✓ ${scenario.name}: ${state}`);
  }
  finally {
    await runCompose(composeFile, projectName, ['down', '-v', '--remove-orphans']);
  }
}

async function createStorageDir(rootDir: string, name: string): Promise<string> {
  const storageDir = path.join(rootDir, name, 'storage');
  await mkdir(storageDir, { recursive: true });
  await chmod(path.dirname(storageDir), 0o777);
  await chmod(storageDir, 0o777);
  return storageDir;
}

async function createSeededStorageDir(rootDir: string, name: string): Promise<string> {
  const storageDir = await createStorageDir(rootDir, name);
  const result = await addAuthUser({
    confirmPassword: 'compose-test-password',
    dbPath: path.join(storageDir, 'db.sqlite'),
    password: 'compose-test-password',
    userId: 'compose-test-owner',
    username: 'owner',
  });

  if (!result.ok) {
    throw new Error(`Failed to seed Compose auth user: ${result.reason}`);
  }

  return storageDir;
}

async function main(): Promise<void> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'mediavault-docker-compose-smoke-'));
  const imageTag = `mediavault-docker-compose-smoke:${Date.now()}`;

  try {
    await validateCheckedInComposeConfig(rootDir);

    console.log(`Building ${imageTag}`);
    const build = await runDocker([
      'build',
      '--target',
      'production',
      '-t',
      imageTag,
      '.',
    ]);
    if (build.exitCode !== 0) {
      throw new Error(`docker build failed:\n${build.stderr}`);
    }

    const baseEnv = {
      NODE_ENV: 'production',
      PORT: '3000',
      STORAGE_DIR: '/app/storage',
      VIDEO_JWT_SECRET: 'compose-test-video-jwt-secret',
      VIDEO_MASTER_ENCRYPTION_SEED: 'compose-test-master-encryption-seed',
    };
    const forbiddenSecretLogValues = [
      baseEnv.VIDEO_JWT_SECRET,
      baseEnv.VIDEO_MASTER_ENCRYPTION_SEED,
    ];

    const scenarios: ComposeScenario[] = [
      {
        env: baseEnv,
        expectedFinalState: 'healthy',
        forbiddenLogIncludes: forbiddenSecretLogValues,
        name: 'configured',
        storageDir: await createSeededStorageDir(rootDir, 'configured'),
      },
      {
        env: {
          ...baseEnv,
          VIDEO_JWT_SECRET: undefined,
        },
        expectLogIncludes: ['VIDEO_JWT_SECRET'],
        expectedFinalState: 'exited',
        forbiddenLogIncludes: forbiddenSecretLogValues,
        name: 'missing-secret',
        storageDir: await createStorageDir(rootDir, 'missing-secret'),
      },
      {
        command: [
          'bun',
          '-e',
          'import { writeFileSync } from \'node:fs\'; writeFileSync(\'/tmp/blocked-storage\', \'blocked\'); process.env.STORAGE_DIR = \'/tmp/blocked-storage\'; await import(\'./build/server/index.js\');',
        ],
        env: baseEnv,
        expectLogIncludes: ['STORAGE_DIR'],
        expectedFinalState: 'exited',
        forbiddenLogIncludes: forbiddenSecretLogValues,
        name: 'blocked-storage',
      },
      {
        env: {
          ...baseEnv,
          FFMPEG_PATH: '/missing/ffmpeg',
        },
        expectLogIncludes: ['ffmpeg'],
        expectedFinalState: 'unhealthy',
        forbiddenLogIncludes: forbiddenSecretLogValues,
        name: 'missing-media-tool',
        storageDir: await createSeededStorageDir(rootDir, 'missing-media-tool'),
      },
    ];

    for (const scenario of scenarios) {
      await runScenario(rootDir, imageTag, scenario);
    }
  }
  finally {
    await runDocker(['image', 'rm', '-f', imageTag]);
    await rm(rootDir, { force: true, recursive: true });
  }
}

await main();
