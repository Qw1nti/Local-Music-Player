/**
 * Export/import helpers for playlists/settings data snapshots.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { dialog } from 'electron';

function buildExportPayload(payload) {
  return {
    version: 1,
    exportedAt: Date.now(),
    playlists: Array.isArray(payload?.playlists) ? payload.playlists : [],
    settings: payload?.settings && typeof payload.settings === 'object' ? payload.settings : null
  };
}

export async function exportPlayerData(window, payload) {
  const target = await dialog.showSaveDialog(window, {
    title: 'Export Playlists and Settings',
    defaultPath: 'local-music-player-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (target.canceled || !target.filePath) {
    return { canceled: true };
  }

  const exportPayload = buildExportPayload(payload);
  await mkdir(dirname(target.filePath), { recursive: true });
  await writeFile(target.filePath, JSON.stringify(exportPayload, null, 2), 'utf-8');
  return { canceled: false, filePath: target.filePath };
}

export async function importPlayerData(window) {
  const picked = await dialog.showOpenDialog(window, {
    title: 'Import Playlists and Settings',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  const filePath = picked.filePaths?.[0];
  if (picked.canceled || !filePath) {
    return { canceled: true };
  }

  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const payload = buildExportPayload(parsed);

  return {
    canceled: false,
    filePath,
    data: payload
  };
}
