import { createHash } from 'node:crypto';

export function trackIdForPath(filePath) {
  return createHash('sha1').update(filePath).digest('hex');
}
