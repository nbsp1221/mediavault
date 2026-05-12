import crypto from 'node:crypto';

const THUMBNAIL_MAGIC = Buffer.from('MVTH', 'ascii');
const THUMBNAIL_VERSION = 1;
const THUMBNAIL_GCM_NONCE_SIZE = 12;
const THUMBNAIL_GCM_AUTH_TAG_SIZE = 16;
const THUMBNAIL_HEADER_SIZE = THUMBNAIL_MAGIC.length + 1 + THUMBNAIL_GCM_NONCE_SIZE + THUMBNAIL_GCM_AUTH_TAG_SIZE;
const ALGORITHM = 'aes-128-gcm';

export function encryptThumbnailEnvelope(input: {
  imageData: Buffer;
  key: Buffer;
  videoId: string;
}): Buffer {
  assertThumbnailKey(input.key);

  const nonce = crypto.randomBytes(THUMBNAIL_GCM_NONCE_SIZE);
  const cipher = crypto.createCipheriv(ALGORITHM, input.key, nonce, {
    authTagLength: THUMBNAIL_GCM_AUTH_TAG_SIZE,
  });
  cipher.setAAD(createThumbnailAad(input.videoId));
  const ciphertext = Buffer.concat([
    cipher.update(input.imageData),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    THUMBNAIL_MAGIC,
    Buffer.from([THUMBNAIL_VERSION]),
    nonce,
    authTag,
    ciphertext,
  ]);
}

export function decryptThumbnailEnvelope(input: {
  encryptedBuffer: Buffer;
  key: Buffer;
  videoId: string;
}): Buffer {
  assertThumbnailKey(input.key);
  assertThumbnailEnvelopeFormat(input.encryptedBuffer);

  const nonceStart = THUMBNAIL_MAGIC.length + 1;
  const tagStart = nonceStart + THUMBNAIL_GCM_NONCE_SIZE;
  const ciphertextStart = tagStart + THUMBNAIL_GCM_AUTH_TAG_SIZE;
  const nonce = input.encryptedBuffer.subarray(nonceStart, tagStart);
  const authTag = input.encryptedBuffer.subarray(tagStart, ciphertextStart);
  const ciphertext = input.encryptedBuffer.subarray(ciphertextStart);
  const decipher = crypto.createDecipheriv(ALGORITHM, input.key, nonce, {
    authTagLength: THUMBNAIL_GCM_AUTH_TAG_SIZE,
  });
  decipher.setAAD(createThumbnailAad(input.videoId));
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  }
  catch (error) {
    throw new Error('Failed to authenticate thumbnail envelope', {
      cause: error,
    });
  }
}

export function validateEncryptedFormat(encryptedBuffer: Buffer): boolean {
  return isThumbnailEnvelopeFormat(encryptedBuffer);
}

export function looksLikeJpeg(buffer: Buffer | undefined): buffer is Buffer {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return false;
  }

  if (buffer[buffer.length - 2] !== 0xFF || buffer[buffer.length - 1] !== 0xD9) {
    return false;
  }

  let cursor = 2;
  let sawFrameMarker = false;
  let sawScanHeaderDependency = false;
  let sawStartOfScan = false;

  while (cursor < buffer.length) {
    const segment = readNextJpegSegment(buffer, cursor);
    if (!segment) {
      return false;
    }

    if (segment.marker === 0xD9) {
      return sawStartOfScan &&
        sawFrameMarker &&
        sawScanHeaderDependency &&
        segment.nextCursor === buffer.length;
    }

    cursor = segment.nextCursor;

    if (segment.isStandalone) {
      continue;
    }

    if (!validateJpegSegment(segment, buffer)) {
      return false;
    }

    if (isScanHeaderDependencyMarker(segment.marker)) {
      sawScanHeaderDependency = true;
    }

    if (isStartOfFrameMarker(segment.marker)) {
      sawFrameMarker = true;
    }

    if (segment.marker === 0xDA) {
      if (!sawFrameMarker || !sawScanHeaderDependency) {
        return false;
      }

      sawStartOfScan = true;
      cursor = readNextScanMarkerOffset(buffer, segment.segmentEnd);

      if (cursor === -1) {
        return false;
      }

      continue;
    }

    cursor = segment.segmentEnd;
  }

  return false;
}

interface JpegSegment {
  isStandalone: boolean;
  marker: number;
  nextCursor: number;
  segmentDataStart: number;
  segmentEnd: number;
  segmentLength: number;
}

function readNextJpegMarkerOffset(buffer: Buffer, startIndex: number): number {
  for (let index = Math.max(startIndex, 0); index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xFF && buffer[index + 1] !== 0x00 && buffer[index + 1] !== 0xFF) {
      return index;
    }
  }

  return -1;
}

function readNextScanMarkerOffset(buffer: Buffer, startIndex: number): number {
  return readNextJpegMarkerOffset(buffer, startIndex);
}

function readNextJpegSegment(buffer: Buffer, startIndex: number): JpegSegment | null {
  const markerOffset = readNextJpegMarkerOffset(buffer, startIndex);
  if (markerOffset === -1 || markerOffset + 1 >= buffer.length) {
    return null;
  }

  const marker = buffer[markerOffset + 1];
  const isStandalone = isStandaloneJpegMarker(marker);
  const nextCursor = markerOffset + 2;

  if (isStandalone) {
    return {
      isStandalone: true,
      marker,
      nextCursor,
      segmentDataStart: nextCursor,
      segmentEnd: nextCursor,
      segmentLength: 0,
    };
  }

  if (markerOffset + 3 >= buffer.length) {
    return null;
  }

  const segmentLength = buffer.readUInt16BE(markerOffset + 2);
  const segmentDataStart = markerOffset + 4;
  const segmentEnd = markerOffset + 2 + segmentLength;

  if (segmentLength < 2 || segmentEnd > buffer.length) {
    return null;
  }

  return {
    isStandalone: false,
    marker,
    nextCursor,
    segmentDataStart,
    segmentEnd,
    segmentLength,
  };
}

function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01;
}

function isStartOfFrameMarker(marker: number): boolean {
  return (marker >= 0xC0 && marker <= 0xC3) ||
    (marker >= 0xC5 && marker <= 0xC7) ||
    (marker >= 0xC9 && marker <= 0xCB) ||
    (marker >= 0xCD && marker <= 0xCF);
}

function isScanHeaderDependencyMarker(marker: number): boolean {
  return marker === 0xC4 || marker === 0xDB;
}

function validateJpegSegment(segment: JpegSegment, buffer: Buffer): boolean {
  const payloadLength = segment.segmentLength - 2;

  if (payloadLength <= 0) {
    return false;
  }

  if (segment.marker === 0xDA) {
    return validateStartOfScanSegment(segment, payloadLength, buffer);
  }

  if (isStartOfFrameMarker(segment.marker)) {
    return payloadLength >= 6;
  }

  if (segment.marker === 0xC4) {
    return payloadLength >= 17;
  }

  if (segment.marker === 0xDB) {
    return payloadLength >= 65;
  }

  if (segment.marker === 0xDD) {
    return payloadLength === 2;
  }

  return true;
}

function validateStartOfScanSegment(segment: JpegSegment, payloadLength: number, buffer: Buffer): boolean {
  if (payloadLength < 6) {
    return false;
  }

  const componentCount = buffer[segment.segmentDataStart];
  const expectedMinimumPayload = 1 + (componentCount * 2) + 3;

  return componentCount > 0 && payloadLength >= expectedMinimumPayload;
}

function createThumbnailAad(videoId: string): Buffer {
  return Buffer.from(`mediavault-thumbnail:v1:${videoId}`, 'utf8');
}

function assertThumbnailKey(key: Buffer): void {
  if (key.length !== 16) {
    throw new Error('Invalid thumbnail encryption key length');
  }
}

function assertThumbnailEnvelopeFormat(encryptedBuffer: Buffer): void {
  if (!isThumbnailEnvelopeFormat(encryptedBuffer)) {
    throw new Error('Unsupported thumbnail envelope format');
  }
}

function isThumbnailEnvelopeFormat(encryptedBuffer: Buffer): boolean {
  return encryptedBuffer.length > THUMBNAIL_HEADER_SIZE &&
    encryptedBuffer.subarray(0, THUMBNAIL_MAGIC.length).equals(THUMBNAIL_MAGIC) &&
    encryptedBuffer[THUMBNAIL_MAGIC.length] === THUMBNAIL_VERSION;
}
