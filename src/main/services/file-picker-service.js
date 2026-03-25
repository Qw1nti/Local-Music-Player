/**
 * Native file/folder pickers (main process).
 *
 * The renderer triggers these through IPC; paths are returned to the renderer so it can
 * request scanning/import. We keep filesystem access centralized in main for safety.
 */
import { dialog } from 'electron';

export async function pickAudioFiles(window) {
  const selection = await dialog.showOpenDialog(window, {
    title: 'Select audio files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus'] }]
  });

  return { paths: selection.canceled ? [] : selection.filePaths };
}

export async function pickAudioFolder(window) {
  const selection = await dialog.showOpenDialog(window, {
    title: 'Select music folder',
    properties: ['openDirectory']
  });

  return { path: selection.canceled ? null : selection.filePaths[0] || null };
}
