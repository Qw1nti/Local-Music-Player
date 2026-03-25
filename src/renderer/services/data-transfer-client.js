function normalizePlaylist(playlist) {
  const id = String(playlist?.id || '').trim();
  const name = String(playlist?.name || '').trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    trackIds: [...new Set((playlist.trackIds || []).map((value) => String(value || '').trim()).filter(Boolean))],
    createdAt: Number(playlist.createdAt || Date.now()),
    updatedAt: Number(playlist.updatedAt || Date.now())
  };
}

export function mergePlaylists(existing, incoming) {
  const normalizedExisting = Array.isArray(existing) ? existing.map(normalizePlaylist).filter(Boolean) : [];
  const normalizedIncoming = Array.isArray(incoming) ? incoming.map(normalizePlaylist).filter(Boolean) : [];

  const byId = new Map(normalizedExisting.map((playlist) => [playlist.id, playlist]));

  for (const playlist of normalizedIncoming) {
    const prev = byId.get(playlist.id);
    if (!prev) {
      byId.set(playlist.id, playlist);
      continue;
    }

    byId.set(playlist.id, {
      ...prev,
      ...playlist,
      trackIds: [...new Set([...(prev.trackIds || []), ...(playlist.trackIds || [])])],
      updatedAt: Math.max(Number(prev.updatedAt || 0), Number(playlist.updatedAt || 0), Date.now())
    });
  }

  return [...byId.values()];
}

export function buildSettingsImportEntries(settings) {
  return [
    ['general.launchOnStartup', settings?.general?.launchOnStartup],
    ['general.resumeLastSession', settings?.general?.resumeLastSession],
    ['general.startupPage', settings?.general?.startupPage],
    ['general.rememberLastTrack', settings?.general?.rememberLastTrack],
    ['playback.defaultVolume', settings?.playback?.defaultVolume],
    ['playback.crossfadeMs', settings?.playback?.crossfadeMs],
    ['playback.gaplessPlayback', settings?.playback?.gaplessPlayback],
    ['playback.replayGain', settings?.playback?.replayGain],
    ['playback.endOfQueueBehavior', settings?.playback?.endOfQueueBehavior],
    ['library.autoScanOnLaunch', settings?.library?.autoScanOnLaunch],
    ['library.showMissingTracks', settings?.library?.showMissingTracks],
    ['appearance.uiScale', settings?.appearance?.uiScale],
    ['appearance.density', settings?.appearance?.density],
    ['appearance.showAlbumArt', settings?.appearance?.showAlbumArt],
    ['themes.activeThemeId', settings?.themes?.activeThemeId],
    ['advanced.debugLogging', settings?.advanced?.debugLogging]
  ];
}

export async function applyImportedSettings(settingsManager, settings) {
  const entries = buildSettingsImportEntries(settings);
  for (const [path, value] of entries) {
    if (value === undefined) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await settingsManager.set(path, value);
    } catch {
      // Skip invalid imported value; validation remains in main process.
    }
  }
}
