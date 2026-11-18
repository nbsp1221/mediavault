const W3C_COMMON_PSSH_SCHEME_ID_URI = 'urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b';
const DASH_IF_CLEARKEY_SCHEME_ID_URI = 'urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e';

export function normalizeClearKeyManifest(manifest: string): string {
  if (!manifest.includes(W3C_COMMON_PSSH_SCHEME_ID_URI)) {
    return manifest;
  }

  return manifest.replaceAll(
    /<ContentProtection\b([^>]*schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b"[^>]*)>/g,
    (_match, attributes: string) => {
      const normalizedAttributes = attributes
        .replace(W3C_COMMON_PSSH_SCHEME_ID_URI, DASH_IF_CLEARKEY_SCHEME_ID_URI)
        .replace(/\svalue="[^"]*"/, '');

      return `<ContentProtection${normalizedAttributes} value="ClearKey1.0">`;
    },
  );
}
