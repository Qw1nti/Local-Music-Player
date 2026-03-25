/**
 * Library persistence (main process).
 *
 * Stores the user's library state in Electron's `userData` directory.
 * The JSON payload shape is validated defensively before writing.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { createDefaultState, isValidStateShape } from '../../shared/helpers/default-state.js';

const STATE_FILE_NAME = 'library-state.json';

function getStatePath() {
  return join(app.getPath('userData'), STATE_FILE_NAME);
}

export async function loadLibraryState() {
  try {
    const raw = await readFile(getStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return isValidStateShape(parsed) ? parsed : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export async function saveLibraryState(state) {
  if (!isValidStateShape(state)) {
    throw new Error('Invalid library state payload.');
  }

  const userDataDir = app.getPath('userData');
  await mkdir(userDataDir, { recursive: true });
  await writeFile(getStatePath(), JSON.stringify(state, null, 2), 'utf-8');
}

export async function clearLibraryState() {
  try {
    await rm(getStatePath(), { force: true });
  } catch {
    // ignore delete errors
  }
}
