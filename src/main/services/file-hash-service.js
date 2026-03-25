/**
 * Content hashing helper used for duplicate detection.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function hashFileSha1(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
