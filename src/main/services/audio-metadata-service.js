/**
 * Multi-format metadata extraction.
 *
 * Supported parsers:
 * - MP3 via ID3 parser
 * - FLAC via Vorbis comments + picture block
 * - MP4/M4A via `ilst` atoms
 */
import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { readMp3Metadata } from './id3-metadata-service.js';

const MAX_READ = 8 * 1024 * 1024;
const MAX_ART_BYTES = 700 * 1024;

function trim(value) {
  return String(value || '').replace(/\u0000+/g, '').trim();
}

function parseReplayGainDb(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDataUrl(mime, bytes) {
  if (!bytes?.length || bytes.length > MAX_ART_BYTES) return '';
  const safeMime = mime?.startsWith('image/') ? mime : 'image/jpeg';
  return `data:${safeMime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function parseFlacPicture(block) {
  if (!block || block.length < 32) return '';
  let o = 0;
  const readU32 = () => {
    const v = block.readUInt32BE(o);
    o += 4;
    return v;
  };

  try {
    readU32(); // picture type
    const mimeLen = readU32();
    const mime = trim(block.subarray(o, o + mimeLen).toString('utf8'));
    o += mimeLen;

    const descLen = readU32();
    o += descLen;

    // width/height/depth/colors
    readU32();
    readU32();
    readU32();
    readU32();

    const dataLen = readU32();
    const imageData = block.subarray(o, o + dataLen);
    return toDataUrl(mime || 'image/jpeg', imageData);
  } catch {
    return '';
  }
}

function parseFlac(buffer) {
  if (buffer.subarray(0, 4).toString('utf8') !== 'fLaC') return null;

  const out = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    author: '',
    trackNumber: 0,
    artworkDataUrl: '',
    replayGainTrackDb: null,
    replayGainAlbumDb: null
  };

  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer[offset];
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = buffer.readUIntBE(offset + 1, 3);
    offset += 4;
    if (offset + length > buffer.length) break;

    const block = buffer.subarray(offset, offset + length);

    // Vorbis comment
    if (type === 4 && block.length > 8) {
      let cursor = 0;
      const vendorLen = block.readUInt32LE(cursor);
      cursor += 4 + vendorLen;
      if (cursor + 4 <= block.length) {
        const count = block.readUInt32LE(cursor);
        cursor += 4;
        for (let i = 0; i < count && cursor + 4 <= block.length; i += 1) {
          const itemLen = block.readUInt32LE(cursor);
          cursor += 4;
          const item = block.subarray(cursor, cursor + itemLen).toString('utf8');
          cursor += itemLen;

          const sep = item.indexOf('=');
          if (sep <= 0) continue;
          const key = item.slice(0, sep).toUpperCase();
          const value = trim(item.slice(sep + 1));

          if (key === 'TITLE' && !out.title) out.title = value;
          if (key === 'ARTIST' && !out.artist) out.artist = value;
          if (key === 'ALBUM' && !out.album) out.album = value;
          if (key === 'GENRE' && !out.genre) out.genre = value;
          if ((key === 'COMPOSER' || key === 'AUTHOR') && !out.author) out.author = value;
          if (key === 'TRACKNUMBER' && !out.trackNumber) out.trackNumber = Number(value) || 0;
          if (key === 'REPLAYGAIN_TRACK_GAIN' && out.replayGainTrackDb === null) out.replayGainTrackDb = parseReplayGainDb(value);
          if (key === 'REPLAYGAIN_ALBUM_GAIN' && out.replayGainAlbumDb === null) out.replayGainAlbumDb = parseReplayGainDb(value);
        }
      }
    }

    // Picture block
    if (type === 6 && !out.artworkDataUrl) {
      out.artworkDataUrl = parseFlacPicture(block);
    }

    offset += length;
    if (isLast) break;
  }

  return out;
}

function decodeDataBoxText(dataBox) {
  if (!dataBox || dataBox.length < 8) return '';
  // data atom: [4 bytes type/locale][payload]
  return trim(dataBox.subarray(8).toString('utf8'));
}

function findAtom(buffer, atomType, start = 0, end = buffer.length) {
  let offset = start;
  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    if (size < 8) break;
    if (type === atomType) {
      return { start: offset, end: offset + size };
    }
    offset += size;
  }
  return null;
}

function parseMp4(buffer) {
  const moov = findAtom(buffer, 'moov');
  if (!moov) return null;

  const udta = findAtom(buffer, 'udta', moov.start + 8, moov.end);
  const meta = findAtom(buffer, 'meta', (udta || moov).start + 8, (udta || moov).end);
  if (!meta) return null;

  const ilst = findAtom(buffer, 'ilst', meta.start + 12, meta.end);
  if (!ilst) return null;

  const out = {
    title: '',
    artist: '',
    album: '',
    genre: '',
    author: '',
    trackNumber: 0,
    artworkDataUrl: '',
    replayGainTrackDb: null,
    replayGainAlbumDb: null
  };

  let offset = ilst.start + 8;
  while (offset + 8 <= ilst.end) {
    const size = buffer.readUInt32BE(offset);
    if (size < 8 || offset + size > ilst.end) break;

    const key = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    const atomStart = offset + 8;
    const atomEnd = offset + size;
    const dataAtom = findAtom(buffer, 'data', atomStart, atomEnd);

    if (dataAtom) {
      const data = buffer.subarray(dataAtom.start + 8, dataAtom.end);
      if (key === '©nam' && !out.title) out.title = decodeDataBoxText(data);
      if (key === '©ART' && !out.artist) out.artist = decodeDataBoxText(data);
      if ((key === 'aART' || key === '©wrt') && !out.author) out.author = decodeDataBoxText(data);
      if (key === '©alb' && !out.album) out.album = decodeDataBoxText(data);
      if (key === '©gen' && !out.genre) out.genre = decodeDataBoxText(data);
      if (key === 'trkn' && !out.trackNumber && data.length >= 12) {
        out.trackNumber = data.readUInt16BE(10) || 0;
      }
      if (key === '----') {
        const text = decodeDataBoxText(data).toLowerCase();
        const db = parseReplayGainDb(text);
        if (db !== null) {
          if (text.includes('album') && out.replayGainAlbumDb === null) out.replayGainAlbumDb = db;
          if (text.includes('track') && out.replayGainTrackDb === null) out.replayGainTrackDb = db;
        }
      }
      if (key === 'covr' && !out.artworkDataUrl && data.length > 8) {
        const type = data.readUInt32BE(0);
        const payload = data.subarray(8);
        const mime = type === 13 ? 'image/jpeg' : type === 14 ? 'image/png' : 'image/jpeg';
        out.artworkDataUrl = toDataUrl(mime, payload);
      }
    }

    offset += size;
  }

  return out;
}

async function readHead(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const stats = await handle.stat();
    const toRead = Math.min(Number(stats.size || 0), MAX_READ);
    const buf = Buffer.alloc(toRead);
    const read = await handle.read(buf, 0, toRead, 0);
    return buf.subarray(0, read.bytesRead);
  } finally {
    await handle.close().catch(() => {});
  }
}

export async function readAudioMetadata(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.mp3') {
    const mp3 = await readMp3Metadata(filePath);
    if (!mp3) return null;
    return {
      title: trim(mp3.title),
      artist: trim(mp3.artist),
      album: trim(mp3.album),
      genre: trim(mp3.genre),
      author: trim(mp3.author),
      artworkDataUrl: trim(mp3.artworkDataUrl),
      trackNumber: 0
    };
  }

  if (ext === '.flac' || ext === '.m4a' || ext === '.mp4') {
    try {
      const head = await readHead(filePath);
      const parsed = ext === '.flac' ? parseFlac(head) : parseMp4(head);
      if (!parsed) return null;
      return {
      title: trim(parsed.title),
      artist: trim(parsed.artist),
      album: trim(parsed.album),
      genre: trim(parsed.genre),
      author: trim(parsed.author),
      artworkDataUrl: trim(parsed.artworkDataUrl),
      trackNumber: Number(parsed.trackNumber || 0),
      replayGainTrackDb: Number.isFinite(Number(parsed.replayGainTrackDb)) ? Number(parsed.replayGainTrackDb) : null,
      replayGainAlbumDb: Number.isFinite(Number(parsed.replayGainAlbumDb)) ? Number(parsed.replayGainAlbumDb) : null
    };
  } catch {
      return null;
    }
  }

  return null;
}
