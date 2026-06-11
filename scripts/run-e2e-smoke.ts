import { spawnSync } from 'node:child_process';

const E2E_SMOKE_SPECS = [
  'tests/e2e/anonymous-public-access.spec.ts',
  'tests/e2e/home-library-owner-smoke.spec.ts',
  'tests/e2e/add-videos-owner-upload-smoke.spec.ts',
  'tests/e2e/playlist-owner-smoke.spec.ts',
  'tests/e2e/product-shell-smoke.spec.ts',
  'tests/e2e/player-layout.spec.ts',
  'tests/e2e/player-browser-playback.spec.ts',
];

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.error) {
    throw result.error;
  }

  return 1;
}

function runRequired(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const status = runCommand(command, args, env);

  if (status !== 0) {
    process.exit(status);
  }
}

runRequired('bun', ['run', 'check:hermetic-inputs']);
runRequired('bun', ['run', 'download:ffmpeg']);
runRequired('bun', ['run', 'download:shaka']);

const installBrowserArgs = ['playwright', 'install'];
if (process.env.LOCAL_STREAMER_PLAYWRIGHT_INSTALL_DEPS === 'true') {
  installBrowserArgs.push('--with-deps');
}
installBrowserArgs.push('chromium');

runRequired('bunx', installBrowserArgs);
runRequired('bun', ['run', 'test:e2e', '--', ...E2E_SMOKE_SPECS]);
