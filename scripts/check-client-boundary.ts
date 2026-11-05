import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const forbidden = [
  {
    category: 'server secret configuration',
    pattern:
      /MEDIAVAULT_(?:DATABASE_ENCRYPTION_KEY|PLAYBACK_JWT_SECRET|MEDIA_KEY_DERIVATION_SECRET|AUTH_CLIENT_COOKIE_SECRET|ADMIN_API_TOKEN)/,
  },
  {
    category: 'Node.js builtin or browser-external shim',
    pattern:
      /\bnode:(?:crypto|fs(?:\/promises)?|path|child_process|worker_threads)\b|__vite-browser-external/,
  },
  {
    category: 'native database or password implementation',
    pattern: /\b(?:better-sqlite3(?:-multiple-ciphers)?|argon2)\b/,
  },
  {
    category: 'application server implementation',
    pattern:
      /\b(?:getServerAuthServices|createServerIngestServices|SqliteLibraryVideoMetadataRepository|SqlitePlaylistRepository)\b/,
  },
];

export interface ClientBoundaryViolation {
  category: string;
  filePath: string;
}

/** Audit shipped text artifacts without printing their contents or any secret values. */
export async function findClientBoundaryViolations(
  clientDir = path.resolve('build/client'),
): Promise<ClientBoundaryViolation[]> {
  const violations: ClientBoundaryViolation[] = [];
  const directories = [clientDir];
  while (directories.length > 0) {
    const directory = directories.shift();
    if (!directory) {
      continue;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(file);
        continue;
      }
      if (!entry.isFile() || !/\.(?:[cm]?js|map|json|html|css)$/.test(entry.name)) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      for (const rule of forbidden) {
        if (rule.pattern.test(source)) {
          violations.push({ category: rule.category, filePath: path.relative(clientDir, file) });
        }
      }
    }
  }
  return violations.sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.category.localeCompare(b.category),
  );
}

if (import.meta.main) {
  const violations = await findClientBoundaryViolations();
  if (violations.length > 0) {
    console.error('Production client boundary audit failed:');
    for (const violation of violations) {
      console.error(`- ${violation.filePath}: ${violation.category}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Production client boundary audit passed.');
  }
}
