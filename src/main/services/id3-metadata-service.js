/**
 * Minimal ID3 metadata extractor for MP3 files (main process, no external deps).
 *
 * Extracts: title, artist, album, genre, author/composer, and first APIC artwork frame.
 */

import { open } from 'node:fs/promises';

const MAX_TAG_READ_BYTES = 2 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 450 * 1024;

function synchsafeToInt(bytes) {
  return ((bytes[0] & 0x7f) << 21) | ((bytes[1] & 0x7f) << 14) | ((bytes[2] & 0x7f) << 7) | (bytes[3] & 0x7f);
}

function isLikelyFrameId(id) {
  return /^[A-Z0-9]{4}$/.test(id);
}

function trimNulls(value) {
  return value.replace(/\u0000+$/g, '').trim();
}

function decodeTextPayload(payload) {
  if (!payload || payload.length < 2) return '';

  const encoding = payload[0];
  const body = payload.subarray(1);

  try {
    if (encoding === 0) {
      return trimNulls(body.toString('latin1'));
    }

    if (encoding === 1) {
      if (body.length < 2) return '';
      if (body[0] === 0xff && body[1] === 0xfe) {
        return trimNulls(body.subarray(2).toString('utf16le'));
      }
      if (body[0] === 0xfe && body[1] === 0xff) {
        const swapped = Buffer.alloc(Math.max(body.length - 2, 0));
        for (let i = 2; i + 1 < body.length; i += 2) {
          swapped[i - 2] = body[i + 1];
          swapped[i - 1] = body[i];
        }
        return trimNulls(swapped.toString('utf16le'));
      }
      return trimNulls(body.toString('utf16le'));
    }

    if (encoding === 2) {
      const swapped = Buffer.alloc(body.length);
      for (let i = 0; i + 1 < body.length; i += 2) {
        swapped[i] = body[i + 1];
        swapped[i + 1] = body[i];
      }
      return trimNulls(swapped.toString('utf16le'));
    }

    return trimNulls(body.toString('utf8'));
  } catch {
    return '';
  }
}

function removeUnsync(buffer) {
  const out = [];
  for (let i = 0; i < buffer.length; i += 1) {
    const current = buffer[i];
    if (current === 0xff && i + 1 < buffer.length && buffer[i + 1] === 0x00) {
      out.push(0xff);
      i += 1;
      continue;
    }
    out.push(current);
  }
  return Buffer.from(out);
}

function readNullTerminatedAscii(buffer, start) {
  let end = start;
  while (end < buffer.length && buffer[end] !== 0x00) end += 1;
  return { value: buffer.subarray(start, end).toString('latin1').trim(), next: end + 1 };
}

function findTextTerminator(buffer, start, encoding) {
  if (encoding === 0 || encoding === 3) {
    for (let i = start; i < buffer.length; i += 1) {
      if (buffer[i] === 0x00) return i;
    }
    return buffer.length;
  }

  for (let i = start; i + 1 < buffer.length; i += 2) {
    if (buffer[i] === 0x00 && buffer[i + 1] === 0x00) return i;
  }
  return buffer.length;
}

function parseApicFrame(payload) {
  if (!payload || payload.length < 8) return null;

  const encoding = payload[0];
  const mimeInfo = readNullTerminatedAscii(payload, 1);
  let cursor = mimeInfo.next;

  if (cursor >= payload.length) return null;
  cursor += 1; // picture type

  const descEnd = findTextTerminator(payload, cursor, encoding);
  cursor = descEnd;
  if (encoding === 0 || encoding === 3) cursor += 1;
  else cursor += 2;

  if (cursor >= payload.length) return null;

  const image = payload.subarray(cursor);
  if (!image.length || image.length > MAX_ARTWORK_BYTES) return null;

  const mime = mimeInfo.value && mimeInfo.value.includes('/') ? mimeInfo.value.toLowerCase() : 'image/jpeg';
  if (!mime.startsWith('image/')) return null;

  return `data:${mime};base64,${image.toString('base64')}`;
}

function parseFrames(tagBuffer, majorVersion) {
  const out = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    author: '',
    artworkDataUrl: ''
  };

  let cursor = 0;

  while (cursor + 10 <= tagBuffer.length) {
    const id = tagBuffer.subarray(cursor, cursor + 4).toString('latin1');
    if (!isLikelyFrameId(id)) break;

    const sizeBytes = tagBuffer.subarray(cursor + 4, cursor + 8);
    const size = majorVersion === 4 ? synchsafeToInt(sizeBytes) : sizeBytes.readUInt32BE(0);
    if (!size || size < 0 || cursor + 10 + size > tagBuffer.length) break;

    const payload = tagBuffer.subarray(cursor + 10, cursor + 10 + size);

    if (id === 'TIT2' && !out.title) out.title = decodeTextPayload(payload);
    if (id === 'TPE1' && !out.artist) out.artist = decodeTextPayload(payload);
    if (id === 'TALB' && !out.album) out.album = decodeTextPayload(payload);
    if (id === 'TCON' && !out.genre) out.genre = decodeTextPayload(payload);
    if ((id === 'TPE2' || id === 'TCOM') && !out.author) out.author = decodeTextPayload(payload);
    if (id === 'APIC' && !out.artworkDataUrl) out.artworkDataUrl = parseApicFrame(payload) || '';

    cursor += 10 + size;
  }

  return out;
}

export async function readMp3Metadata(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');

    const header = Buffer.alloc(10);
    const headerRead = await handle.read(header, 0, 10, 0);
    if (headerRead.bytesRead < 10) return null;

    if (header.subarray(0, 3).toString('latin1') !== 'ID3') return null;

    const majorVersion = header[3];
    if (majorVersion !== 3 && majorVersion !== 4) return null;

    const flags = header[5];
    const tagSize = synchsafeToInt(header.subarray(6, 10));
    if (!tagSize) return null;

    const toRead = Math.min(tagSize, MAX_TAG_READ_BYTES);
    const tag = Buffer.alloc(toRead);
    const readResult = await handle.read(tag, 0, toRead, 10);
    let tagData = tag.subarray(0, readResult.bytesRead);

    if (flags & 0x80) {
      tagData = removeUnsync(tagData);
    }

    const parsed = parseFrames(tagData, majorVersion);
    if (!parsed.title && !parsed.artist && !parsed.album && !parsed.genre && !parsed.author && !parsed.artworkDataUrl) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}
