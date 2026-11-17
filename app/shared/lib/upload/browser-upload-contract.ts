const GIGABYTE = 1024 * 1024 * 1024;

export const BROWSER_UPLOAD_SUPPORTED_EXTENSIONS = [
  '.mp4',
  '.avi',
  '.mkv',
  '.mov',
  '.webm',
  '.m4v',
  '.flv',
  '.wmv',
] as const;

export const BROWSER_UPLOAD_ACCEPT = BROWSER_UPLOAD_SUPPORTED_EXTENSIONS.join(',');
export const BROWSER_UPLOAD_SUPPORTED_FORMATS_LABEL = 'MP4, AVI, MKV, MOV, WebM, M4V, FLV, WMV';
export const BROWSER_UPLOAD_MAX_BYTES = 4 * GIGABYTE;
export const BROWSER_UPLOAD_MAX_SIZE_LABEL = '4 GB';

export function isSupportedBrowserUploadFilename(filename: string): boolean {
  const extension = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : '';

  return BROWSER_UPLOAD_SUPPORTED_EXTENSIONS.some((supported) => supported === extension);
}
