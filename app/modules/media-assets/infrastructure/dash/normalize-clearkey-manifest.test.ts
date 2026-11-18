import { describe, expect, test } from 'vitest';
import { normalizeClearKeyManifest } from './normalize-clearkey-manifest.server';

describe('ClearKey manifest format', () => {
  test('normalizes common PSSH protection while preserving the encrypted asset identity', () => {
    const input =
      '<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b" value="old"><cenc:pssh>fixture</cenc:pssh></ContentProtection>';
    const normalized = normalizeClearKeyManifest(input);
    expect(normalized).toBe(
      '<ContentProtection schemeIdUri="urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e" value="ClearKey1.0"><cenc:pssh>fixture</cenc:pssh></ContentProtection>',
    );
    expect(normalizeClearKeyManifest(normalized)).toBe(normalized);
  });

  test('adds a missing ClearKey value and leaves unrelated protection unchanged', () => {
    expect(
      normalizeClearKeyManifest(
        '<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b">',
      ),
    ).toContain('value="ClearKey1.0"');
    const unrelated =
      '<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc">';
    expect(normalizeClearKeyManifest(unrelated)).toBe(unrelated);
  });
});
