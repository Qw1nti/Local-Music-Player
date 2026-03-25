import { extname } from 'node:path';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../../shared/constants/audio.js';

const EXT_SET = new Set(SUPPORTED_AUDIO_EXTENSIONS);

export function isSupportedAudioFilePath(filePath) {
  return EXT_SET.has(extname(filePath).toLowerCase());
}
