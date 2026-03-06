(() => {
  const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'];
  const SPOTIFY_SCOPES = ['user-library-read', 'user-read-email', 'user-read-private'];
  const STORAGE_KEY = 'local_spotify_state_v1';
  const DIRECTORY_DB = 'local-spotify-directory-db';
  const PKCE_KEY = 'spotify_pkce_verifier';
  const THEME_STORAGE_KEY = 'app_theme';
  const CONCURRENT_METADATA_READS = 6;
  const THEMES = [
    'dark',
    'light',
    'midnight',
    'solarized',
    'forest',
    'neon',
    'nhk-room',
    'nhk-paranoia-neon'
  ];
  const FEATURES = {
    queuePanel: true,
    advancedLibraryViews: true,
    smartPlaylists: true
  };

  const THEME_LABELS = {
    dark: 'Dark',
    light: 'Light',
    midnight: 'Midnight',
    solarized: 'Solarized',
    forest: 'Forest',
    neon: 'Neon',
    'nhk-room': 'NHK Room (Inspired)',
    'nhk-paranoia-neon': 'NHK Paranoia Neon (Inspired)'
  };

  const state = {
    currentView: 'library',
    activePlaylistId: null,
    search: '',
    localTracks: [],
    spotifyTracks: [],
    playlists: [],
    matchOverrides: {},
    spotifyAuth: null,
    spotifyProfile: null,
    spotifyOfflineMode: false,
    linkedDirectoryName: null,
    fileMap: new Map(),
    queue: [],
    queueIndex: -1,
    queueOriginalOrder: [],
    shuffleEnabled: false,
    repeatMode: 'off',
    denseMode: false,
    theme: 'dark',
    settingsTab: 'general',
    libraryView: 'songs',
    sortBy: 'title',
    sortDir: 'asc',
    trackStats: {},
    autoRescanOnStartup: true,
    spotifyCompactRows: false,
    selectedTrackIds: []
  };
  const albumArtObjectUrls = new Set();

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = 0.9;

  const els = {
    navButtons: [...document.querySelectorAll('.nav-btn')],
    playlistSidebar: document.getElementById('playlistSidebar'),
    createPlaylistBtn: document.getElementById('createPlaylistBtn'),
    searchInput: document.getElementById('searchInput'),
    importFolderBtn: document.getElementById('importFolderBtn'),
    importFilesBtn: document.getElementById('importFilesBtn'),
    densityToggleBtn: document.getElementById('densityToggleBtn'),
    filesInput: document.getElementById('filesInput'),
    status: document.getElementById('status'),
    error: document.getElementById('error'),
    views: {
      library: document.getElementById('viewLibrary'),
      spotify: document.getElementById('viewSpotify'),
      playlists: document.getElementById('viewPlaylists'),
      settings: document.getElementById('viewSettings'),
      queue: document.getElementById('viewQueue')
    },
    nowTitle: document.getElementById('nowTitle'),
    nowSub: document.getElementById('nowSub'),
    nowArt: document.getElementById('nowArt'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    prevBtn: document.getElementById('prevBtn'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    nextBtn: document.getElementById('nextBtn'),
    seekRange: document.getElementById('seekRange'),
    timeCurrent: document.getElementById('timeCurrent'),
    timeDuration: document.getElementById('timeDuration'),
    volumeRange: document.getElementById('volumeRange'),
    playerBar: document.querySelector('.player-bar')
  };

  function showStatus(message) {
    els.status.textContent = message;
    els.status.classList.remove('hidden');
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function clearMessages() {
    els.status.classList.add('hidden');
    els.error.classList.add('hidden');
  }

  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDurationMs(ms) {
    return formatTime(Math.round(ms / 1000));
  }

  function normalizeText(value) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function generateId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  function getConfig() {
    const fromWindow = window.APP_CONFIG || {};
    const savedClientId = localStorage.getItem('spotify_client_id') || '';
    const savedRedirect = localStorage.getItem('spotify_redirect_uri') || '';

    return {
      spotifyClientId: fromWindow.spotifyClientId || savedClientId,
      spotifyRedirectUri:
        fromWindow.spotifyRedirectUri || savedRedirect || window.location.origin + window.location.pathname
    };
  }

  function normalizeTheme(theme) {
    return THEMES.includes(theme) ? theme : 'dark';
  }

  function applyTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    state.theme = nextTheme;
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';

    // Dev behavior: do not keep a service worker on localhost, so refresh always gets latest code.
    if (isLocalhost) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      } catch {
        // ignore cleanup errors
      }
      return;
    }

    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch {
      // PWA install still works without SW; fail quietly.
    }
  }

  function isAudioFile(name) {
    const lower = name.toLowerCase();
    return AUDIO_EXTS.some((ext) => lower.endsWith(ext));
  }

  function stemFromFilename(fileName) {
    return fileName.replace(/\.[^/.]+$/, '').replace(/[\-_]+/g, ' ').trim();
  }

  function inferMetaFromName(fileName) {
    const stem = stemFromFilename(fileName);
    const parts = stem.split(' - ');
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: 'Unknown Artist', title: stem || 'Unknown Title' };
  }

  function trimNulls(value) {
    return value.replace(/\u0000/g, '').trim();
  }

  function isBlobUrl(value) {
    return typeof value === 'string' && value.startsWith('blob:');
  }

  function revokeAlbumArtUrl(value) {
    if (!isBlobUrl(value)) return;
    try {
      URL.revokeObjectURL(value);
    } catch {
      // Ignore blob revocation errors.
    }
    albumArtObjectUrls.delete(value);
  }

  function revokeTrackAlbumArt(track) {
    revokeAlbumArtUrl(track?.albumArtUrl);
  }

  function revokeAllAlbumArtUrls() {
    [...albumArtObjectUrls].forEach((url) => revokeAlbumArtUrl(url));
  }

  function isUserAbortError(err) {
    if (!err) return false;
    const name = typeof err === 'object' && 'name' in err ? String(err.name) : '';
    const message = typeof err === 'object' && 'message' in err ? String(err.message) : '';
    return name === 'AbortError' || /aborted|abort/i.test(message);
  }

  function decodeBytes(bytes, encoding) {
    try {
      if (encoding === 0) return trimNulls(new TextDecoder('iso-8859-1').decode(bytes));
      if (encoding === 1) return trimNulls(new TextDecoder('utf-16').decode(bytes));
      if (encoding === 2) return trimNulls(new TextDecoder('utf-16be').decode(bytes));
      if (encoding === 3) return trimNulls(new TextDecoder('utf-8').decode(bytes));
    } catch {
      // fall through to utf-8 fallback
    }
    return trimNulls(new TextDecoder().decode(bytes));
  }

  function decodeTextFrame(frameData) {
    if (!frameData?.length) return '';
    const encoding = frameData[0];
    return decodeBytes(frameData.subarray(1), encoding);
  }

  function findTerminator(bytes, start, encoding) {
    if (encoding === 1 || encoding === 2) {
      for (let i = start; i + 1 < bytes.length; i += 1) {
        if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
      }
      return bytes.length;
    }
    for (let i = start; i < bytes.length; i += 1) {
      if (bytes[i] === 0) return i;
    }
    return bytes.length;
  }

  function synchsafeToInt(a, b, c, d) {
    return ((a & 0x7f) << 21) | ((b & 0x7f) << 14) | ((c & 0x7f) << 7) | (d & 0x7f);
  }

  function readId3v1Meta(bytes) {
    if (bytes.length < 128) return null;
    const start = bytes.length - 128;
    if (String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2]) !== 'TAG') return null;

    const decodeV1 = (offset, len) => trimNulls(new TextDecoder('iso-8859-1').decode(bytes.subarray(start + offset, start + offset + len)));
    return {
      title: decodeV1(3, 30),
      artist: decodeV1(33, 30),
      album: decodeV1(63, 30)
    };
  }

  async function readMp3Tags(file) {
    if (!file.name.toLowerCase().endsWith('.mp3')) return null;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const tags = { title: '', artist: '', album: '', albumArtUrl: '' };

    if (bytes.length >= 10 && String.fromCharCode(bytes[0], bytes[1], bytes[2]) === 'ID3') {
      const version = bytes[3];
      const tagSize = synchsafeToInt(bytes[6], bytes[7], bytes[8], bytes[9]);
      let offset = 10;
      const end = Math.min(bytes.length, 10 + tagSize);

      while (offset + 10 <= end) {
        const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        if (!frameId.trim()) break;

        const frameSize =
          version === 4
            ? synchsafeToInt(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
            : ((bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]) >>> 0;

        if (!frameSize || frameSize < 0) break;
        const frameStart = offset + 10;
        const frameEnd = frameStart + frameSize;
        if (frameEnd > end) break;

        const frameData = bytes.subarray(frameStart, frameEnd);

        if (frameId === 'TIT2' && !tags.title) tags.title = decodeTextFrame(frameData);
        if (frameId === 'TPE1' && !tags.artist) tags.artist = decodeTextFrame(frameData);
        if (frameId === 'TALB' && !tags.album) tags.album = decodeTextFrame(frameData);

        if (frameId === 'APIC' && !tags.albumArtUrl && frameData.length > 4) {
          const enc = frameData[0];
          let cursor = 1;
          const mimeEnd = findTerminator(frameData, cursor, 0);
          const mime = trimNulls(new TextDecoder('iso-8859-1').decode(frameData.subarray(cursor, mimeEnd))) || 'image/jpeg';
          cursor = Math.min(mimeEnd + 1, frameData.length);

          cursor += 1;
          if (cursor >= frameData.length) {
            offset = frameEnd;
            continue;
          }

          const descEnd = findTerminator(frameData, cursor, enc);
          cursor = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
          if (cursor < frameData.length) {
            const imageBytes = frameData.subarray(cursor);
            if (imageBytes.length > 0) {
              const blob = new Blob([imageBytes], { type: mime });
              tags.albumArtUrl = URL.createObjectURL(blob);
              albumArtObjectUrls.add(tags.albumArtUrl);
            }
          }
        }

        offset = frameEnd;
      }
    }

    const v1 = readId3v1Meta(bytes);
    if (v1) {
      tags.title = tags.title || v1.title;
      tags.artist = tags.artist || v1.artist;
      tags.album = tags.album || v1.album;
    }

    return tags;
  }

  async function getFileDuration(file) {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      const url = URL.createObjectURL(file);
      tempAudio.src = url;
      tempAudio.preload = 'metadata';

      tempAudio.onloadedmetadata = () => {
        const duration = Number.isFinite(tempAudio.duration) ? Math.round(tempAudio.duration) : 0;
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      tempAudio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  }

  async function filesToTracks(files, source) {
    const supportedFiles = files.filter((file) => isAudioFile(file.name));
    const tracks = new Array(supportedFiles.length);
    let cursor = 0;

    async function worker() {
      while (cursor < supportedFiles.length) {
        const index = cursor;
        cursor += 1;
        const file = supportedFiles[index];
        const inferred = inferMetaFromName(file.name);
        const id3 = await readMp3Tags(file).catch(() => null);
        const durationSec = await getFileDuration(file);
        tracks[index] = {
          id: `local_${file.name}_${file.size}_${file.lastModified}`,
          fileName: file.name,
          title: id3?.title || inferred.title,
          artist: id3?.artist || inferred.artist,
          album: id3?.album || 'Unknown Album',
          durationSec,
          albumArtUrl: id3?.albumArtUrl || '',
          size: file.size,
          lastModified: file.lastModified,
          source
        };
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENT_METADATA_READS, supportedFiles.length) },
      () => worker()
    );
    await Promise.all(workers);
    return tracks.filter(Boolean);
  }

  async function walkDirectory(handle, out) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && isAudioFile(entry.name)) {
        out.push(await entry.getFile());
      }
      if (entry.kind === 'directory') {
        await walkDirectory(entry, out);
      }
    }
  }


  function mergeLocalTracks(nextTracks) {
    const merged = new Map(state.localTracks.map((track) => [track.id, track]));
    nextTracks.forEach((track) => {
      const previous = merged.get(track.id);
      if (previous && previous.albumArtUrl !== track.albumArtUrl) {
        revokeTrackAlbumArt(previous);
      }
      merged.set(track.id, track);
    });
    state.localTracks = [...merged.values()];
  }

  function trackIdFromFile(file) {
    return `local_${file.name}_${file.size}_${file.lastModified}`;
  }

  function uniquePlaylistName(baseName) {
    const smartNames = new Set(getSmartPlaylists().map((playlist) => playlist.name));
    const existing = new Set(state.playlists.map((playlist) => playlist.name));
    const base = baseName || 'Imported Folder';
    let candidate = base;
    let i = 2;
    while (existing.has(candidate) || smartNames.has(candidate)) {
      candidate = `${base} (${i})`;
      i += 1;
    }
    return candidate;
  }

  function playlistNameFromImport(tracks, folderName) {
    const albums = [...new Set(tracks.map((track) => track.album).filter((album) => album && album !== 'Unknown Album'))];
    if (albums.length === 1) return albums[0];
    return folderName || 'Imported Folder';
  }

  function createPlaylistFromFolderImport(tracks, folderName) {
    if (!tracks.length) return null;

    const playlistName = uniquePlaylistName(playlistNameFromImport(tracks, folderName));
    const playlist = {
      id: generateId('playlist'),
      name: playlistName,
      createdAt: Date.now(),
      items: tracks.map((track) => ({ id: generateId('item'), localTrackId: track.id }))
    };

    state.playlists.unshift(playlist);
    state.activePlaylistId = playlist.id;
    return playlist;
  }


  async function importFromFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => isAudioFile(file.name));
    if (!files.length) {
      showError('No supported audio files selected.');
      return;
    }

    clearMessages();
    const tracks = await filesToTracks(files, 'files');
    tracks.forEach((track, index) => {
      state.fileMap.set(track.id || trackIdFromFile(files[index]), files[index]);
    });
    mergeLocalTracks(tracks);
    saveState();
    showStatus(`Imported ${tracks.length} file${tracks.length === 1 ? '' : 's'}.`);
    render();
  }

  async function importFromFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      showError('Directory picker is not supported in this browser. Use Import Files instead.');
      return;
    }

    clearMessages();
    const handle = await window.showDirectoryPicker().catch((err) => {
      if (isUserAbortError(err)) return null;
      throw err;
    });
    if (!handle) return;
    const files = [];
    await walkDirectory(handle, files);

    if (!files.length) {
      showError('No supported audio files found in the selected folder.');
      return;
    }

    const tracks = await filesToTracks(files, 'directory');
    tracks.forEach((track, index) => {
      state.fileMap.set(track.id || trackIdFromFile(files[index]), files[index]);
    });
    mergeLocalTracks(tracks);
    const createdPlaylist = createPlaylistFromFolderImport(tracks, handle.name || 'Imported Folder');
    state.linkedDirectoryName = handle.name || null;
    await saveDirectoryHandle(handle).catch(() => {
      showError('Imported folder, but could not persist directory permission.');
    });
    saveState();
    const playlistNote = createdPlaylist ? ` and created playlist "${createdPlaylist.name}"` : '';
    showStatus(`Imported ${tracks.length} track${tracks.length === 1 ? '' : 's'} from ${handle.name}${playlistNote}.`);
    render();
  }

  async function reconnectSavedDirectory() {
    const handle = await loadDirectoryHandle().catch(() => null);
    if (!handle) {
      showError('No saved folder handle found. Import a folder first.');
      return;
    }

    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
      permission = await handle.requestPermission({ mode: 'read' });
    }
    if (permission !== 'granted') {
      showError('Directory permission was denied.');
      return;
    }

    clearMessages();
    const files = [];
    await walkDirectory(handle, files);
    const tracks = await filesToTracks(files, 'directory');

    const previousDirectoryIds = new Set(
      state.localTracks.filter((track) => track.source === 'directory').map((track) => track.id)
    );
    previousDirectoryIds.forEach((id) => state.fileMap.delete(id));
    tracks.forEach((track, index) => {
      state.fileMap.set(track.id || trackIdFromFile(files[index]), files[index]);
    });
    state.localTracks = state.localTracks.filter((track) => track.source !== 'directory');
    mergeLocalTracks(tracks);

    state.linkedDirectoryName = handle.name || state.linkedDirectoryName;
    saveState();
    showStatus(`Reconnected ${tracks.length} track${tracks.length === 1 ? '' : 's'} from ${state.linkedDirectoryName}.`);
    render();
  }

  async function openDirectoryDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DIRECTORY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open directory db'));
    });
  }

  async function saveDirectoryHandle(handle) {
    const db = await openDirectoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(handle, 'handle');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadDirectoryHandle() {
    const db = await openDirectoryDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get('handle');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  }

  function saveState() {
    const persisted = {
      localTracks: state.localTracks.map((track) => ({
        ...track,
        albumArtUrl: track.albumArtUrl?.startsWith('blob:') ? '' : track.albumArtUrl || ''
      })),
      spotifyTracks: state.spotifyTracks,
      playlists: state.playlists,
      matchOverrides: state.matchOverrides,
      spotifyAuth: state.spotifyAuth,
      linkedDirectoryName: state.linkedDirectoryName,
      activePlaylistId: state.activePlaylistId,
      denseMode: state.denseMode,
      theme: state.theme,
      queue: state.queue,
      queueIndex: state.queueIndex,
      queueOriginalOrder: state.queueOriginalOrder,
      shuffleEnabled: state.shuffleEnabled,
      repeatMode: state.repeatMode,
      libraryView: state.libraryView,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      trackStats: state.trackStats,
      autoRescanOnStartup: state.autoRescanOnStartup,
      spotifyCompactRows: state.spotifyCompactRows
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      state.localTracks = (parsed.localTracks || []).map((track) => ({
        ...track,
        albumArtUrl: track.albumArtUrl || ''
      }));
      state.spotifyTracks = parsed.spotifyTracks || [];
      state.playlists = parsed.playlists || [];
      state.matchOverrides = parsed.matchOverrides || {};
      state.spotifyAuth = parsed.spotifyAuth || null;
      state.linkedDirectoryName = parsed.linkedDirectoryName || null;
      state.activePlaylistId = parsed.activePlaylistId || null;
      state.denseMode = Boolean(parsed.denseMode);
      state.queue = parsed.queue || [];
      state.queueIndex = Number.isInteger(parsed.queueIndex) ? parsed.queueIndex : -1;
      state.queueOriginalOrder = parsed.queueOriginalOrder || [];
      state.shuffleEnabled = Boolean(parsed.shuffleEnabled);
      state.repeatMode = parsed.repeatMode || 'off';
      state.libraryView = parsed.libraryView || 'songs';
      state.sortBy = parsed.sortBy || 'title';
      state.sortDir = parsed.sortDir || 'asc';
      state.trackStats = parsed.trackStats || {};
      state.autoRescanOnStartup = parsed.autoRescanOnStartup !== false;
      state.spotifyCompactRows = Boolean(parsed.spotifyCompactRows);
      const savedTheme = parsed.theme || localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
      applyTheme(savedTheme);
    } catch {
      showError('Failed to parse saved state. Starting clean.');
    }
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PKCE_KEY);
    state.localTracks = [];
    state.spotifyTracks = [];
    state.playlists = [];
    state.matchOverrides = {};
    state.spotifyAuth = null;
    state.spotifyProfile = null;
    state.linkedDirectoryName = null;
    state.fileMap = new Map();
    state.activePlaylistId = null;
    state.selectedTrackIds = [];
    state.queue = [];
    state.queueIndex = -1;
    state.queueOriginalOrder = [];
    state.shuffleEnabled = false;
    state.repeatMode = 'off';
    state.libraryView = 'songs';
    state.sortBy = 'title';
    state.sortDir = 'asc';
    state.trackStats = {};
    state.spotifyCompactRows = false;
    state.settingsTab = 'general';
    revokeAllAlbumArtUrls();
    audio.pause();
    if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    audio.src = '';
    render();
  }

  function getCurrentTrack() {
    if (state.queueIndex < 0 || state.queueIndex >= state.queue.length) return null;
    return state.queue[state.queueIndex];
  }

  function togglePlayPause() {
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => showError('Cannot play audio.'));
    else audio.pause();
    renderPlayer();
  }

  function durationClose(durationMs, durationSec) {
    if (!durationMs || !durationSec) return true;
    return Math.abs(Math.round(durationMs / 1000) - durationSec) <= 3;
  }

  function artistMatch(spotifyArtists, localArtist) {
    const local = normalizeText(localArtist);
    return spotifyArtists.some((a) => {
      const s = normalizeText(a);
      return s === local || s.includes(local) || local.includes(s);
    });
  }

  function autoMatch(spotifyTrack) {
    const title = normalizeText(spotifyTrack.name);

    const strong = state.localTracks.find((local) => {
      const localTitle = normalizeText(local.title);
      const titleOk = localTitle === title || localTitle.includes(title) || title.includes(localTitle);
      return titleOk && artistMatch(spotifyTrack.artists, local.artist) && durationClose(spotifyTrack.durationMs, local.durationSec);
    });
    if (strong) return { localTrackId: strong.id, reason: 'auto' };

    return { localTrackId: null, reason: 'none' };
  }

  function getMatch(spotifyTrackId) {
    const overridden = state.matchOverrides[spotifyTrackId];
    if (overridden && state.localTracks.some((t) => t.id === overridden)) {
      return { localTrackId: overridden, reason: 'manual' };
    }
    const spotifyTrack = state.spotifyTracks.find((t) => t.id === spotifyTrackId);
    if (!spotifyTrack) return { localTrackId: null, reason: 'none' };
    return autoMatch(spotifyTrack);
  }

  function spotifyConfigured() {
    const config = getConfig();
    return Boolean(config.spotifyClientId);
  }

  async function detectSpotifyReachability() {
    // Lightweight probe: if this fails due to blocked network/CORS-level issues,
    // treat Spotify integration as offline for user messaging.
    try {
      await fetch('https://accounts.spotify.com', { method: 'HEAD', mode: 'no-cors' });
      state.spotifyOfflineMode = false;
    } catch {
      state.spotifyOfflineMode = true;
    }
  }

  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(len));
    let out = '';
    for (const v of values) out += chars[v % chars.length];
    return out;
  }

  async function sha256(input) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  }

  function b64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const byte of bytes) str += String.fromCharCode(byte);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function spotifyLogin() {
    clearMessages();
    await detectSpotifyReachability();
    if (state.spotifyOfflineMode) {
      showError('Spotify appears unreachable on this network. Local playback still works in Offline Mode.');
      render();
      return;
    }
    const config = getConfig();
    if (!config.spotifyClientId) {
      showError('Set Spotify Client ID in Settings first.');
      return;
    }

    const verifier = randomString(96);
    localStorage.setItem(PKCE_KEY, verifier);
    const challenge = b64Url(await sha256(verifier));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotifyClientId,
      redirect_uri: config.spotifyRedirectUri,
      scope: SPOTIFY_SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: challenge
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async function exchangeCodeForToken(code) {
    const config = getConfig();
    const verifier = localStorage.getItem(PKCE_KEY);
    if (!verifier) throw new Error('Missing PKCE verifier. Try logging in again.');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotifyRedirectUri,
      client_id: config.spotifyClientId,
      code_verifier: verifier
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) {
      throw new Error(`Spotify token exchange failed (${res.status})`);
    }

    const token = await res.json();
    state.spotifyAuth = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope,
      tokenType: token.token_type
    };
    saveState();
  }

  async function refreshSpotifyToken() {
    if (!state.spotifyAuth?.refreshToken) throw new Error('No refresh token. Login again.');
    const config = getConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: state.spotifyAuth.refreshToken,
      client_id: config.spotifyClientId
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);

    const token = await res.json();
    state.spotifyAuth = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || state.spotifyAuth.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope,
      tokenType: token.token_type
    };
    saveState();
  }

  async function ensureFreshToken() {
    if (!state.spotifyAuth) throw new Error('Not logged in to Spotify.');
    if (state.spotifyAuth.expiresAt - Date.now() < 60_000) {
      await refreshSpotifyToken();
    }
    return state.spotifyAuth.accessToken;
  }

  async function spotifyGet(path) {
    const accessToken = await ensureFreshToken();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Spotify API failed (${res.status})`);
    return res.json();
  }

  async function fetchSpotifyProfile() {
    try {
      const profile = await spotifyGet('/me');
      state.spotifyProfile = profile;
      state.spotifyOfflineMode = false;
    } catch (err) {
      state.spotifyOfflineMode = true;
      throw err;
    }
  }

  async function fetchLikedSongs() {
    clearMessages();
    await detectSpotifyReachability();
    if (state.spotifyOfflineMode) {
      showError('Spotify is unreachable. You are in Offline Mode for Spotify features.');
      render();
      return;
    }
    showStatus('Fetching Spotify liked songs...');
    let offset = 0;
    const limit = 50;
    let total = Infinity;
    const out = [];

    while (offset < total) {
      const page = await spotifyGet(`/me/tracks?limit=${limit}&offset=${offset}`);
      total = page.total;

      for (const item of page.items) {
        const t = item.track;
        if (!t || !t.id) continue;
        out.push({
          id: t.id,
          name: t.name,
          artists: t.artists.map((a) => a.name),
          album: t.album.name,
          albumArtUrl: t.album.images?.[0]?.url || '',
          durationMs: t.duration_ms,
          uri: t.uri,
          addedAt: item.added_at
        });
      }

      offset += page.limit;
    }

    state.spotifyTracks = out;
    state.spotifyOfflineMode = false;
    saveState();
    showStatus(`Loaded ${out.length} liked songs.`);
    render();
  }

  function filterLocalTracks() {
    const tokens = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const tracks = [...state.localTracks];

    const filtered = tokens.length
      ? tracks.filter((t) => {
          const hay = `${t.title} ${t.artist} ${t.album}`.toLowerCase();
          return tokens.every((token) => hay.includes(token));
        })
      : tracks;

    const dir = state.sortDir === 'asc' ? 1 : -1;
    const valueFor = (track) => {
      switch (state.sortBy) {
        case 'artist':
          return track.artist || '';
        case 'album':
          return track.album || '';
        case 'duration':
          return track.durationSec || 0;
        case 'dateAdded':
          return track.lastModified || 0;
        case 'title':
        default:
          return track.title || '';
      }
    };

    return filtered.sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function filterSpotifyTracks() {
    const tokens = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return state.spotifyTracks;

    return state.spotifyTracks.filter((t) => {
      const hay = `${t.name} ${t.artists.join(' ')} ${t.album}`.toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }

  function getSmartPlaylists() {
    const recentlyAdded = [...state.localTracks]
      .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
      .map((t) => ({ id: `smart_recent_added_${t.id}`, localTrackId: t.id }));

    const mostPlayed = [...state.localTracks]
      .sort((a, b) => {
        const aStat = state.trackStats[a.id] || { playCount: 0 };
        const bStat = state.trackStats[b.id] || { playCount: 0 };
        return (bStat.playCount || 0) - (aStat.playCount || 0);
      })
      .filter((t) => (state.trackStats[t.id]?.playCount || 0) > 0)
      .map((t) => ({ id: `smart_most_played_${t.id}`, localTrackId: t.id }));

    return [
      {
        id: 'smart_recent_added',
        name: 'Recently Added',
        createdAt: 0,
        items: recentlyAdded,
        smart: true
      },
      {
        id: 'smart_most_played',
        name: 'Most Played',
        createdAt: 0,
        items: mostPlayed,
        smart: true
      }
    ];
  }

  function getActivePlaylist() {
    const smart = getSmartPlaylists().find((p) => p.id === state.activePlaylistId);
    if (smart) return smart;
    return state.playlists.find((p) => p.id === state.activePlaylistId) || null;
  }

  function resolvePlaylistPlayableTracks(playlist) {
    if (!playlist) return [];
    const localMap = new Map(state.localTracks.map((t) => [t.id, t]));
    const output = [];

    for (const item of playlist.items) {
      if (item.localTrackId && localMap.has(item.localTrackId)) {
        output.push(localMap.get(item.localTrackId));
        continue;
      }
      if (item.spotifyTrackId) {
        const match = getMatch(item.spotifyTrackId);
        if (match.localTrackId && localMap.has(match.localTrackId)) {
          output.push(localMap.get(match.localTrackId));
        }
      }
    }

    return output;
  }

  function updatePlayStats(trackId) {
    const existing = state.trackStats[trackId] || { playCount: 0, lastPlayed: 0 };
    state.trackStats[trackId] = {
      playCount: existing.playCount + 1,
      lastPlayed: Date.now()
    };
    saveState();
  }

  function setQueueAndPlay(queue, trackId) {
    state.queue = [...queue];
    state.queueOriginalOrder = [...queue];
    state.queueIndex = queue.findIndex((t) => t.id === trackId);
    if (state.queueIndex < 0 && queue.length > 0) state.queueIndex = 0;

    const track = getCurrentTrack();
    if (!track) return;

    const file = state.fileMap.get(track.id);
    if (!file) {
      showError('Audio file is not currently loaded in memory. Re-import folder/files.');
      audio.pause();
      if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      audio.src = '';
      renderPlayer();
      return;
    }

    const url = URL.createObjectURL(file);
    if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    audio.src = url;
    audio.play().catch(() => showError('Browser blocked autoplay. Click Play.'));

    updatePlayStats(track.id);
    renderPlayer();
  }

  function addToQueueById(trackId) {
    const track = state.localTracks.find((t) => t.id === trackId);
    if (!track) return;
    state.queue.push(track);
    state.queueOriginalOrder.push(track);
    saveState();
    render();
  }

  function playNextById(trackId) {
    const track = state.localTracks.find((t) => t.id === trackId);
    if (!track) return;

    if (!state.queue.length) {
      state.queue = [track];
      state.queueOriginalOrder = [track];
      state.queueIndex = 0;
      setQueueAndPlay(state.queue, track.id);
      return;
    }

    const insertAt = Math.max(state.queueIndex + 1, 0);
    state.queue.splice(insertAt, 0, track);

    const insertOriginalAt = state.queueOriginalOrder.findIndex((t) => t.id === getCurrentTrack()?.id);
    if (insertOriginalAt >= 0) {
      state.queueOriginalOrder.splice(insertOriginalAt + 1, 0, track);
    } else {
      state.queueOriginalOrder.push(track);
    }

    saveState();
    render();
  }

  function removeQueueAt(index) {
    if (index < 0 || index >= state.queue.length) return;
    const removed = state.queue[index];
    state.queue.splice(index, 1);

    const idxOrig = state.queueOriginalOrder.findIndex((t) => t.id === removed.id);
    if (idxOrig >= 0) state.queueOriginalOrder.splice(idxOrig, 1);

    if (index < state.queueIndex) state.queueIndex -= 1;
    if (state.queueIndex >= state.queue.length) state.queueIndex = state.queue.length - 1;
    saveState();
    render();
  }

  function moveQueueItem(from, to) {
    if (from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) return;
    const [item] = state.queue.splice(from, 1);
    state.queue.splice(to, 0, item);
    if (state.queueIndex === from) state.queueIndex = to;
    else if (from < state.queueIndex && to >= state.queueIndex) state.queueIndex -= 1;
    else if (from > state.queueIndex && to <= state.queueIndex) state.queueIndex += 1;
    saveState();
    render();
  }

  function clearQueue() {
    state.queue = [];
    state.queueOriginalOrder = [];
    state.queueIndex = -1;
    audio.pause();
    audio.src = '';
    state.selectedTrackIds = [];
    saveState();
    render();
  }

  function normalizeTrackSelection() {
    const validIds = new Set(state.localTracks.map((track) => track.id));
    state.selectedTrackIds = state.selectedTrackIds.filter((id) => validIds.has(id));
  }

  function toggleTrackSelection(trackId, checked) {
    const selected = new Set(state.selectedTrackIds);
    if (checked) selected.add(trackId);
    else selected.delete(trackId);
    state.selectedTrackIds = [...selected];
  }

  function selectAllVisibleTracks() {
    const visibleIds = filterLocalTracks().map((track) => track.id);
    const visibleSet = new Set(visibleIds);
    const selected = new Set(state.selectedTrackIds);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

    if (allSelected) {
      visibleIds.forEach((id) => selected.delete(id));
    } else {
      visibleIds.forEach((id) => selected.add(id));
    }

    state.selectedTrackIds = [...selected].filter((id) => visibleSet.has(id) || state.localTracks.some((t) => t.id === id));
  }

  function deletePlaylistById(playlistId) {
    const playlist = state.playlists.find((p) => p.id === playlistId);
    if (!playlist || playlist.smart) return;
    if (!window.confirm(`Delete playlist "${playlist.name}"?`)) return;

    state.playlists = state.playlists.filter((p) => p.id !== playlistId);
    if (state.activePlaylistId === playlistId) {
      state.activePlaylistId = state.playlists[0]?.id || 'smart_recent_added';
    }
    saveState();
    showStatus(`Deleted playlist "${playlist.name}".`);
    render();
  }

  function deleteTracksByIds(trackIds) {
    const removeSet = new Set(trackIds.filter(Boolean));
    if (!removeSet.size) return;
    const removedTracks = state.localTracks.filter((track) => removeSet.has(track.id));

    const current = getCurrentTrack();
    const currentRemoved = current ? removeSet.has(current.id) : false;

    state.localTracks = state.localTracks.filter((track) => !removeSet.has(track.id));
    removeSet.forEach((id) => state.fileMap.delete(id));
    removedTracks.forEach((track) => revokeTrackAlbumArt(track));

    state.queue = state.queue.filter((track) => !removeSet.has(track.id));
    state.queueOriginalOrder = state.queueOriginalOrder.filter((track) => !removeSet.has(track.id));

    if (currentRemoved) {
      audio.pause();
      if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      audio.src = '';
      state.queueIndex = -1;
    } else {
      const nextCurrentId = current?.id;
      state.queueIndex = nextCurrentId ? state.queue.findIndex((track) => track.id === nextCurrentId) : -1;
    }

    state.playlists = state.playlists.map((playlist) => ({
      ...playlist,
      items: playlist.items.filter((item) => !(item.localTrackId && removeSet.has(item.localTrackId)))
    }));

    Object.keys(state.matchOverrides).forEach((spotifyTrackId) => {
      if (removeSet.has(state.matchOverrides[spotifyTrackId])) {
        delete state.matchOverrides[spotifyTrackId];
      }
    });

    Object.keys(state.trackStats).forEach((trackId) => {
      if (removeSet.has(trackId)) delete state.trackStats[trackId];
    });

    state.selectedTrackIds = state.selectedTrackIds.filter((id) => !removeSet.has(id));
    normalizeTrackSelection();
    saveState();
    showStatus(`Deleted ${removeSet.size} song${removeSet.size === 1 ? '' : 's'}.`);
    render();
  }

  function hashId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
  }

  function toggleShuffle() {
    state.shuffleEnabled = !state.shuffleEnabled;

    if (state.shuffleEnabled) {
      state.queueOriginalOrder = [...state.queue];
      const current = getCurrentTrack();
      const rest = state.queue.filter((t) => !current || t.id !== current.id);
      rest.sort((a, b) => hashId(a.id) - hashId(b.id));
      state.queue = current ? [current, ...rest] : rest;
      state.queueIndex = current ? 0 : -1;
    } else {
      const current = getCurrentTrack();
      state.queue = [...state.queueOriginalOrder];
      state.queueIndex = current ? state.queue.findIndex((t) => t.id === current.id) : -1;
    }

    saveState();
    renderPlayer();
    if (FEATURES.queuePanel) renderQueue();
  }

  function cycleRepeatMode() {
    const modes = ['off', 'all', 'one'];
    const current = modes.indexOf(state.repeatMode);
    state.repeatMode = modes[(current + 1) % modes.length];
    saveState();
    renderPlayer();
  }

  function nextTrack(fromEnded = false) {
    if (!state.queue.length) return;

    const current = getCurrentTrack();
    if (fromEnded && state.repeatMode === 'one' && current) {
      setQueueAndPlay(state.queue, current.id);
      return;
    }

    if (state.queueIndex < state.queue.length - 1) {
      const next = state.queue[state.queueIndex + 1];
      setQueueAndPlay(state.queue, next.id);
      return;
    }

    if (state.repeatMode === 'all' && state.queue.length > 0) {
      setQueueAndPlay(state.queue, state.queue[0].id);
      return;
    }

    audio.pause();
    renderPlayer();
  }

  function prevTrack() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (state.queueIndex <= 0) return;
    const prev = state.queue[state.queueIndex - 1];
    setQueueAndPlay(state.queue, prev.id);
  }

  function renderLibrary() {
    const tracks = filterLocalTracks();
    normalizeTrackSelection();

    const viewTabs = FEATURES.advancedLibraryViews ? `
      <div class="inline-group">
        <button class="chip-btn ${state.libraryView === 'songs' ? 'primary' : ''}" data-library-view="songs">Songs</button>
        <button class="chip-btn ${state.libraryView === 'artists' ? 'primary' : ''}" data-library-view="artists">Artists</button>
        <button class="chip-btn ${state.libraryView === 'albums' ? 'primary' : ''}" data-library-view="albums">Albums</button>
      </div>
      <div class="inline-group">
        <label>Sort
          <select id="sortSelect">
            <option value="title" ${state.sortBy === 'title' ? 'selected' : ''}>Title</option>
            <option value="artist" ${state.sortBy === 'artist' ? 'selected' : ''}>Artist</option>
            <option value="album" ${state.sortBy === 'album' ? 'selected' : ''}>Album</option>
            <option value="duration" ${state.sortBy === 'duration' ? 'selected' : ''}>Duration</option>
            <option value="dateAdded" ${state.sortBy === 'dateAdded' ? 'selected' : ''}>Date Added</option>
          </select>
        </label>
        <button id="sortDirBtn" class="chip-btn quiet">${state.sortDir === 'asc' ? 'Asc' : 'Desc'}</button>
      </div>
    ` : '';

    if (FEATURES.advancedLibraryViews && state.libraryView === 'artists') {
      const counts = new Map();
      for (const t of tracks) counts.set(t.artist, (counts.get(t.artist) || 0) + 1);
      const rows = [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([artist, count], i) => `<tr style="--row:${i}"><td>${escapeHtml(artist)}</td><td>${count}</td><td><button class="chip-btn" data-play-artist="${escapeHtml(artist)}">Play Artist</button></td></tr>`)
        .join('');

      els.views.library.innerHTML = `
        <div class="panel-head">
          <div><h2>Library</h2><p class="panel-sub">Browse artists from your local tracks.</p></div>
          <span class="count-pill">${tracks.length} tracks</span>
        </div>
        ${viewTabs}
        <table><thead><tr><th>Artist</th><th>Tracks</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3">No artists found</td></tr>'}</tbody></table>
      `;
      return;
    }

    if (FEATURES.advancedLibraryViews && state.libraryView === 'albums') {
      const counts = new Map();
      for (const t of tracks) counts.set(t.album, (counts.get(t.album) || 0) + 1);
      const rows = [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([album, count], i) => `<tr style="--row:${i}"><td>${escapeHtml(album)}</td><td>${count}</td></tr>`)
        .join('');

      els.views.library.innerHTML = `
        <div class="panel-head">
          <div><h2>Library</h2><p class="panel-sub">Browse albums from your local tracks.</p></div>
          <span class="count-pill">${tracks.length} tracks</span>
        </div>
        ${viewTabs}
        <table><thead><tr><th>Album</th><th>Tracks</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No albums found</td></tr>'}</tbody></table>
      `;
      return;
    }

    if (tracks.length === 0) {
      els.views.library.innerHTML = `
        <div class="panel-head">
          <div>
            <h2>Local Library</h2>
            <p class="panel-sub">Your imported files and playable tracks.</p>
          </div>
          <span class="count-pill">0 tracks</span>
        </div>
        ${viewTabs}
        <p>Import a folder or files to start.</p>
      `;
      return;
    }

    const selectedSet = new Set(state.selectedTrackIds);
    const selectedVisibleCount = tracks.filter((track) => selectedSet.has(track.id)).length;
    const allVisibleSelected = tracks.length > 0 && selectedVisibleCount === tracks.length;

    const rows = tracks
      .map((track, index) => {
        const checked = selectedSet.has(track.id) ? 'checked' : '';
        return `
        <tr style="--row:${index}">
          <td><input type="checkbox" data-track-select="${track.id}" ${checked} aria-label="Select ${escapeHtml(track.title)}" /></td>
          <td><div class="art-thumb ${track.albumArtUrl ? '' : 'placeholder'}" ${track.albumArtUrl ? `style="background-image:url('${track.albumArtUrl}')"` : ''}></div></td>
          <td>${escapeHtml(track.title)}</td>
          <td>${escapeHtml(track.artist)}</td>
          <td>${escapeHtml(track.album)}</td>
          <td>${formatTime(track.durationSec)}</td>
          <td>
            <button class="chip-btn" data-play-track="${track.id}">Play</button>
            <button class="chip-btn quiet" data-play-next="${track.id}">Play Next</button>
            <button class="chip-btn quiet" data-add-queue="${track.id}">Add Queue</button>
            <button class="chip-btn quiet" data-add-local="${track.id}">Add Playlist</button>
            <button class="chip-btn quiet" data-delete-track="${track.id}">Delete</button>
          </td>
        </tr>
      `;
      })
      .join('');

    els.views.library.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Local Library</h2>
          <p class="panel-sub">Browse, play, and queue your local collection.</p>
        </div>
        <span class="count-pill">${tracks.length} tracks</span>
      </div>
      ${viewTabs}
      <div class="inline-group bulk-actions">
        <button id="selectAllTracksBtn" class="chip-btn quiet">${allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}</button>
        <button id="deleteSelectedTracksBtn" class="chip-btn" ${state.selectedTrackIds.length ? '' : 'disabled'}>Delete Selected (${state.selectedTrackIds.length})</button>
      </div>
      <table>
        <thead>
          <tr><th></th><th>Art</th><th>Title</th><th>Artist</th><th>Album</th><th>Duration</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderSpotify() {
    const tracks = filterSpotifyTracks();
    const config = getConfig();

    let authLine = 'Not logged in';
    if (state.spotifyAuth) {
      authLine = `Logged in${state.spotifyProfile?.display_name ? ` as ${escapeHtml(state.spotifyProfile.display_name)}` : ''}. Token expires ${new Date(state.spotifyAuth.expiresAt).toLocaleString()}`;
    }

    const rows = tracks
      .map((track, index) => {
        const match = getMatch(track.id);
        const matchedLocal = match.localTrackId ? state.localTracks.find((t) => t.id === match.localTrackId) : null;

        return `
          <tr style="--row:${index}" class="spotify-row">
            <td>
              <div class="spotify-cell">
                ${track.albumArtUrl ? `<img src="${track.albumArtUrl}" alt="cover" />` : '<div class="art-thumb placeholder"></div>'}
                <div class="spotify-main">
                  <div class="spotify-title">${escapeHtml(track.name)}</div>
                  <div class="spotify-meta">${escapeHtml(track.artists.join(', '))} · ${escapeHtml(track.album)}</div>
                  <div class="spotify-uri">${escapeHtml(track.uri)}</div>
                </div>
              </div>
            </td>
            <td>${formatDurationMs(track.durationMs)}</td>
            <td class="spotify-actions">
              <button class="chip-btn quiet" data-add-spotify-ref="${track.id}">Add Ref</button>
              ${matchedLocal ? `<button class="chip-btn quiet" data-add-queue="${matchedLocal.id}">Add Queue</button>` : ''}
            </td>
          </tr>
        `;
      })
      .join('');

    els.views.spotify.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Spotify Liked</h2>
          <p class="panel-sub">Metadata sync only. Playback always uses local files.</p>
        </div>
        <span class="count-pill">${tracks.length} liked</span>
      </div>
      ${state.spotifyOfflineMode
        ? '<p class="tag missing">Offline Mode: Spotify domains are unreachable on this network. Local playback remains available.</p>'
        : ''}
      <div class="inline-group">
        <button id="spotifyLoginBtn" class="chip-btn primary" ${config.spotifyClientId ? '' : 'disabled'}>Connect Spotify</button>
        <button id="spotifyRefreshBtn" class="chip-btn" ${state.spotifyAuth ? '' : 'disabled'}>Refresh Likes</button>
        <button id="buildLikesPlaylistBtn" class="chip-btn" ${state.spotifyTracks.length ? '' : 'disabled'}>Build Playlist</button>
      </div>
      <p><strong>Spotify auth:</strong> ${authLine}</p>
      ${config.spotifyClientId ? '' : '<p class="tag missing">Set Spotify Client ID in Settings.</p>'}
      ${tracks.length === 0 ? '<p>No liked songs loaded.</p>' : `<table class="spotify-table"><thead><tr><th>Track</th><th>Duration</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
    `;
  }

  function renderPlaylists() {
    const playlist = getActivePlaylist();

    if (!playlist) {
      els.views.playlists.innerHTML = `
        <div class="panel-head">
          <div>
            <h2>Playlists</h2>
            <p class="panel-sub">Curate local tracks and Spotify references.</p>
          </div>
        </div>
        <p>Select or create a playlist.</p>
      `;
      return;
    }

    const playableTracks = resolvePlaylistPlayableTracks(playlist);

    const playRows = playableTracks
      .map((track, index) => `
        <tr style="--row:${index}">
          <td>${escapeHtml(track.title)}</td>
          <td>${escapeHtml(track.artist)}</td>
          <td>${escapeHtml(track.album)}</td>
          <td>${formatTime(track.durationSec)}</td>
          <td>
            <button class="chip-btn" data-play-playlist-track="${track.id}">Play</button>
            <button class="chip-btn quiet" data-play-next="${track.id}">Play Next</button>
            <button class="chip-btn quiet" data-add-queue="${track.id}">Add Queue</button>
          </td>
        </tr>
      `)
      .join('');

    const rawRows = playlist.items
      .map((item, index) => {
        let type = 'Local';
        let name = 'Unknown';
        let status = 'Missing';

        if (item.localTrackId) {
          const local = state.localTracks.find((t) => t.id === item.localTrackId);
          name = local ? local.title : 'Missing local file';
          status = local ? 'Playable' : 'Missing local file';
        }

        if (item.spotifyTrackId) {
          type = 'Spotify ref';
          const spotify = state.spotifyTracks.find((t) => t.id === item.spotifyTrackId);
          const match = getMatch(item.spotifyTrackId);
          name = spotify ? spotify.name : 'Unknown Spotify track';
          status = match.localTrackId ? 'Matched to local' : 'No local match';
        }

        return `
          <tr style="--row:${index}">
            <td>${type}</td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(status)}</td>
            <td>
              <button class="chip-btn quiet" data-remove-playlist-item="${item.id}">Remove</button>
              ${playlist.smart ? '' : `<button class="chip-btn quiet" data-playlist-up="${index}">Up</button><button class="chip-btn quiet" data-playlist-down="${index}">Down</button>`}
            </td>
          </tr>
        `;
      })
      .join('');

    els.views.playlists.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(playlist.name)}${playlist.smart ? ' (Smart)' : ''}</h2>
          <p class="panel-sub">Manage playlist items and playable matches.</p>
        </div>
        <span class="count-pill">${playlist.items.length} items</span>
      </div>
      <div class="inline-group">
        <button id="renamePlaylistBtn" ${playlist.smart ? 'disabled' : ''}>Rename</button>
        <button id="deletePlaylistBtn" ${playlist.smart ? 'disabled' : ''}>Delete</button>
      </div>

      <h3>Playable Tracks (${playableTracks.length})</h3>
      ${playableTracks.length
        ? `<table><thead><tr><th>Title</th><th>Artist</th><th>Album</th><th>Duration</th><th></th></tr></thead><tbody>${playRows}</tbody></table>`
        : '<p>No playable local tracks in this playlist yet.</p>'}

      <h3>All Playlist Items</h3>
      ${playlist.items.length
        ? `<table><thead><tr><th>Type</th><th>Name</th><th>Status</th><th></th></tr></thead><tbody>${rawRows}</tbody></table>`
        : '<p>No items in playlist.</p>'}
    `;
  }

  function renderSettings() {
    const config = getConfig();
    const isAppearance = state.settingsTab === 'appearance';
    const tabButtons = `
      <div class="settings-tabs">
        <button id="settingsTabGeneralBtn" class="${!isAppearance ? 'active' : ''}">General</button>
        <button id="settingsTabAppearanceBtn" class="${isAppearance ? 'active' : ''}">Appearance</button>
      </div>
    `;

    const themeOptions = THEMES.map((theme) => {
      const selected = state.theme === theme ? 'selected' : '';
      const label = THEME_LABELS[theme] || theme;
      return `<option value="${theme}" ${selected}>${label}</option>`;
    }).join('');

    const swatches = THEMES.map((theme) => {
      const label = THEME_LABELS[theme] || theme;
      const active = state.theme === theme ? 'active' : '';
      return `
        <button
          class="theme-swatch ${active}"
          data-theme-pick="${theme}"
          data-theme-preview="${theme}"
          title="${label}"
          aria-label="Switch to ${label} theme"
        >${label}</button>
      `;
    }).join('');

    const generalPanel = `
      <div class="inline-group">
        <label>Spotify Client ID <input id="spotifyClientIdInput" value="${escapeHtml(config.spotifyClientId || '')}" /></label>
        <label>Redirect URI <input id="spotifyRedirectInput" value="${escapeHtml(config.spotifyRedirectUri || '')}" /></label>
      </div>
      <div class="inline-group">
        <button id="saveSpotifyConfigBtn">Save Spotify Config</button>
        <button id="reconnectDirBtn" ${typeof window.showDirectoryPicker === 'function' ? '' : 'disabled'}>Reconnect Saved Directory</button>
        <button id="spotifyLogoutBtn" ${state.spotifyAuth ? '' : 'disabled'}>Log Out Spotify</button>
        <button id="clearLibraryBtn">Clear Library Cache</button>
        <button id="clearCacheBtn">Clear All Local Cache</button>
      </div>
      <div class="inline-group">
        <label><input type="checkbox" id="autoRescanToggle" ${state.autoRescanOnStartup ? 'checked' : ''}/> Auto-rescan on startup</label>
        <label><input type="checkbox" id="spotifyCompactRowsToggle" ${state.spotifyCompactRows ? 'checked' : ''}/> Compact Spotify row mode</label>
      </div>
      <p><strong>File System Access API:</strong> ${typeof window.showDirectoryPicker === 'function' ? 'Supported' : 'Not supported (file fallback only)'}</p>
      <p><strong>Linked directory:</strong> ${escapeHtml(state.linkedDirectoryName || 'None')}</p>
      <p><strong>Spotify auth:</strong> ${state.spotifyAuth ? 'Logged in' : 'Not logged in'}</p>
      <p><strong>Token expiry:</strong> ${state.spotifyAuth ? new Date(state.spotifyAuth.expiresAt).toLocaleString() : 'N/A'}</p>
      <p><strong>Density mode:</strong> ${state.denseMode ? 'Compact' : 'Comfortable'}</p>
    `;

    const appearancePanel = `
      <div class="appearance-section">
        <h3>Appearance</h3>
        <p class="panel-sub">Choose a global theme for the entire app.</p>
        <div class="inline-group">
          <label>Theme
            <select id="themeSelect">${themeOptions}</select>
          </label>
        </div>
        <div class="theme-swatches">${swatches}</div>
      </div>
    `;

    els.views.settings.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Settings & Diagnostics</h2>
          <p class="panel-sub">Configure Spotify PKCE and local behavior.</p>
        </div>
      </div>
      ${tabButtons}
      <div class="settings-panel">
        ${isAppearance ? appearancePanel : generalPanel}
      </div>
    `;
  }

  function renderQueue() {
    const current = getCurrentTrack();
    const rows = state.queue
      .map((track, index) => `
        <tr style="--row:${index}">
          <td>${index === state.queueIndex ? '<span class="tag">Now</span>' : ''}</td>
          <td>${escapeHtml(track.title)}</td>
          <td>${escapeHtml(track.artist)}</td>
          <td>
            <button class="chip-btn quiet" data-queue-play="${index}">Play</button>
            <button class="chip-btn quiet" data-queue-up="${index}" ${index === 0 ? 'disabled' : ''}>Up</button>
            <button class="chip-btn quiet" data-queue-down="${index}" ${index === state.queue.length - 1 ? 'disabled' : ''}>Down</button>
            <button class="chip-btn quiet" data-queue-remove="${index}">Remove</button>
          </td>
        </tr>
      `)
      .join('');

    els.views.queue.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Queue</h2>
          <p class="panel-sub">Manage upcoming tracks and playback order.</p>
        </div>
        <span class="count-pill">${state.queue.length} in queue</span>
      </div>
      <div class="inline-group">
        <button id="clearQueueBtn" ${state.queue.length ? '' : 'disabled'}>Clear Queue</button>
      </div>
      <p><strong>Current:</strong> ${current ? `${escapeHtml(current.title)} - ${escapeHtml(current.artist)}` : 'None'}</p>
      ${state.queue.length
        ? `<table><thead><tr><th></th><th>Track</th><th>Artist</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p>Queue is empty.</p>'}
    `;
  }

  function renderSidebarPlaylists() {
    const smart = FEATURES.smartPlaylists ? getSmartPlaylists() : [];
    const smartHtml = smart
      .map((p) => {
        const active = p.id === state.activePlaylistId;
        return `<button class="playlist-side-item ${active ? 'active' : ''}" data-pick-playlist="${p.id}">${escapeHtml(p.name)}</button>`;
      })
      .join('');

    const userHtml = state.playlists
      .map((p) => {
        const active = p.id === state.activePlaylistId;
        return `
          <div class="playlist-side-row ${active ? 'active' : ''}">
            <button class="playlist-side-item ${active ? 'active' : ''}" data-pick-playlist="${p.id}">${escapeHtml(p.name)}</button>
            <button class="playlist-delete-btn" data-delete-playlist="${p.id}" title="Delete playlist" aria-label="Delete ${escapeHtml(p.name)}">x</button>
          </div>
        `;
      })
      .join('');

    els.playlistSidebar.innerHTML = smartHtml + (userHtml || '<div class="playlist-side-item">No custom playlists yet</div>');
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    const artwork = track
      ? [{ src: track.albumArtUrl || '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
      : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.title || 'Local Mixer',
      artist: track?.artist || 'Unknown Artist',
      album: track?.album || '',
      artwork
    });

    navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      renderPlayer();
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || audio.currentTime + 5);
      renderPlayer();
    });
  }

  function renderPlayer() {
    const track = getCurrentTrack();
    const hasTrack = Boolean(track);
    els.nowTitle.textContent = track ? track.title : 'No track selected';
    els.nowSub.textContent = track ? `${track.artist} · ${track.album}` : '-';
    els.prevBtn.textContent = '<<';
    els.nextBtn.textContent = '>>';
    els.playPauseBtn.textContent = audio.paused ? '>' : '||';
    els.shuffleBtn.textContent = 'S';
    els.repeatBtn.textContent = state.repeatMode === 'off' ? 'R0' : state.repeatMode === 'all' ? 'RA' : 'R1';
    els.shuffleBtn.classList.toggle('active', state.shuffleEnabled);
    els.repeatBtn.classList.toggle('active', state.repeatMode !== 'off');
    els.playPauseBtn.setAttribute('aria-pressed', String(!audio.paused && hasTrack));
    els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffleEnabled));
    els.repeatBtn.setAttribute('aria-pressed', String(state.repeatMode !== 'off'));
    els.prevBtn.setAttribute('aria-label', 'Previous track');
    els.playPauseBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    els.nextBtn.setAttribute('aria-label', 'Next track');
    els.shuffleBtn.setAttribute('aria-label', 'Shuffle queue');
    els.repeatBtn.setAttribute(
      'aria-label',
      `Repeat mode ${state.repeatMode === 'off' ? 'off' : state.repeatMode === 'all' ? 'all tracks' : 'current track'}`
    );
    els.prevBtn.disabled = !hasTrack;
    els.nextBtn.disabled = !hasTrack;
    els.playPauseBtn.disabled = !hasTrack;
    els.seekRange.disabled = !hasTrack;

    if (track?.albumArtUrl) {
      els.nowArt.style.backgroundImage = `url('${track.albumArtUrl}')`;
      els.nowArt.classList.remove('placeholder');
    } else {
      els.nowArt.style.backgroundImage = '';
      els.nowArt.classList.add('placeholder');
    }

    els.timeCurrent.textContent = formatTime(audio.currentTime);
    els.timeDuration.textContent = formatTime(audio.duration || track?.durationSec || 0);
    els.seekRange.max = String(Math.max(audio.duration || track?.durationSec || 1, 1));
    els.seekRange.value = String(Math.min(audio.currentTime || 0, Number(els.seekRange.max)));
    els.seekRange.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} elapsed`);
    els.volumeRange.setAttribute('aria-valuetext', `Volume ${Math.round(audio.volume * 100)} percent`);
    els.playerBar.classList.toggle('is-playing', !audio.paused && Boolean(track));

    updateMediaSession(track);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    }
  }

  function renderViewSwitch() {
    Object.entries(els.views).forEach(([key, el]) => {
      if (key === state.currentView) {
        el.classList.add('active');
        el.classList.remove('view-enter');
        requestAnimationFrame(() => el.classList.add('view-enter'));
      } else {
        el.classList.remove('active');
        el.classList.remove('view-enter');
      }
    });

    els.navButtons.forEach((btn) => {
      const isActive = btn.getAttribute('data-view') === state.currentView;
      btn.classList.toggle('active', isActive);
    });
  }

  function render() {
    document.body.classList.toggle('dense-mode', state.denseMode);
    document.body.classList.toggle('spotify-compact', state.spotifyCompactRows);
    els.densityToggleBtn.textContent = state.denseMode ? 'Comfortable' : 'Compact';
    renderViewSwitch();
    renderSidebarPlaylists();
    renderLibrary();
    renderSpotify();
    renderPlaylists();
    renderSettings();
    if (FEATURES.queuePanel) renderQueue();
    renderPlayer();
  }

  function ensurePlaylist() {
    if (state.activePlaylistId && !String(state.activePlaylistId).startsWith('smart_')) return state.activePlaylistId;
    if (!state.playlists.length) {
      const created = { id: generateId('playlist'), name: 'New Playlist', createdAt: Date.now(), items: [] };
      state.playlists.unshift(created);
      state.activePlaylistId = created.id;
      saveState();
      return created.id;
    }
    state.activePlaylistId = state.playlists[0].id;
    saveState();
    return state.activePlaylistId;
  }

  function addLocalToPlaylist(localTrackId) {
    const playlistId = ensurePlaylist();
    const playlist = state.playlists.find((p) => p.id === playlistId);
    playlist.items.push({ id: generateId('item'), localTrackId });
    saveState();
    showStatus('Added local track to playlist.');
    render();
  }

  function addSpotifyRefToPlaylist(spotifyTrackId) {
    const playlistId = ensurePlaylist();
    const playlist = state.playlists.find((p) => p.id === playlistId);
    playlist.items.push({ id: generateId('item'), spotifyTrackId });
    saveState();
    showStatus('Added Spotify reference to playlist.');
    render();
  }

  function createPlaylist() {
    const name = window.prompt('Playlist name?', `Playlist ${state.playlists.length + 1}`);
    if (!name || !name.trim()) return;
    const playlist = {
      id: generateId('playlist'),
      name: name.trim(),
      createdAt: Date.now(),
      items: []
    };
    state.playlists.unshift(playlist);
    state.activePlaylistId = playlist.id;
    state.currentView = 'playlists';
    saveState();
    render();
  }

  function buildPlaylistFromLikes() {
    const matchedLocalIds = [];
    for (const s of state.spotifyTracks) {
      const match = getMatch(s.id);
      if (match.localTrackId) matchedLocalIds.push(match.localTrackId);
    }

    const unique = [...new Set(matchedLocalIds)];
    const playlist = {
      id: generateId('playlist'),
      name: `Spotify Likes (${new Date().toLocaleDateString()})`,
      createdAt: Date.now(),
      items: unique.map((id) => ({ id: generateId('item'), localTrackId: id }))
    };

    state.playlists.unshift(playlist);
    state.activePlaylistId = playlist.id;
    state.currentView = 'playlists';
    saveState();
    showStatus(`Created playlist with ${unique.length} matched tracks.`);
    render();
  }


  function handleAuthCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (!code && !error) return Promise.resolve();

    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    history.replaceState({}, document.title, url.toString());

    if (error) {
      showError(`Spotify auth error: ${error}`);
      return Promise.resolve();
    }

    return exchangeCodeForToken(code)
      .then(() => fetchSpotifyProfile())
      .then(() => {
        showStatus('Spotify login successful.');
      })
      .catch((err) => showError(err.message || 'Spotify login failed.'));
  }

  function wireEvents() {
    els.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.currentView = btn.getAttribute('data-view');
        render();
      });
    });

    els.createPlaylistBtn.addEventListener('click', createPlaylist);

    els.searchInput.addEventListener('input', () => {
      state.search = els.searchInput.value;
      render();
    });

    els.densityToggleBtn.addEventListener('click', () => {
      state.denseMode = !state.denseMode;
      saveState();
      render();
    });

    els.importFolderBtn.addEventListener('click', () => {
      importFromFolder().catch((err) => showError(err.message || 'Folder import failed.'));
    });

    els.importFilesBtn.addEventListener('click', () => els.filesInput.click());

    els.filesInput.addEventListener('change', () => {
      if (!els.filesInput.files?.length) return;
      importFromFiles(els.filesInput.files).catch((err) => showError(err.message || 'File import failed.'));
      els.filesInput.value = '';
    });

    els.prevBtn.addEventListener('click', prevTrack);
    els.playPauseBtn.addEventListener('click', togglePlayPause);
    els.nextBtn.addEventListener('click', () => nextTrack(false));
    els.shuffleBtn.addEventListener('click', toggleShuffle);
    els.repeatBtn.addEventListener('click', cycleRepeatMode);

    els.seekRange.addEventListener('input', () => {
      audio.currentTime = Number(els.seekRange.value);
      renderPlayer();
    });

    els.volumeRange.addEventListener('input', () => {
      audio.volume = Number(els.volumeRange.value);
    });

    audio.addEventListener('timeupdate', renderPlayer);
    audio.addEventListener('loadedmetadata', renderPlayer);
    audio.addEventListener('play', renderPlayer);
    audio.addEventListener('pause', renderPlayer);
    audio.addEventListener('ended', () => nextTrack(true));
    audio.addEventListener('error', () => {
      showError('Unable to play this audio file. It may be unsupported or corrupted.');
      renderPlayer();
    });

    document.addEventListener('keydown', (evt) => {
      const tag = evt.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if (evt.code === 'Space') {
        evt.preventDefault();
        togglePlayPause();
      }
      if (evt.code === 'ArrowLeft') {
        evt.preventDefault();
        audio.currentTime = Math.max(audio.currentTime - 5, 0);
        renderPlayer();
      }
      if (evt.code === 'ArrowRight') {
        evt.preventDefault();
        audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || audio.currentTime + 5);
        renderPlayer();
      }
      if (evt.key.toLowerCase() === 'n') {
        evt.preventDefault();
        nextTrack(false);
      }
      if (evt.key.toLowerCase() === 'p') {
        evt.preventDefault();
        prevTrack();
      }
    });

    document.body.addEventListener('click', (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;

      const libraryView = target.getAttribute('data-library-view');
      if (libraryView) {
        state.libraryView = libraryView;
        saveState();
        render();
        return;
      }

      if (target.id === 'sortDirBtn') {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        saveState();
        render();
        return;
      }

      const playTrackId = target.getAttribute('data-play-track');
      if (playTrackId) {
        const queue = filterLocalTracks();
        setQueueAndPlay(queue, playTrackId);
        return;
      }

      const playArtist = target.getAttribute('data-play-artist');
      if (playArtist) {
        const queue = filterLocalTracks().filter((t) => t.artist === playArtist);
        if (queue.length) setQueueAndPlay(queue, queue[0].id);
        return;
      }

      const playNextId = target.getAttribute('data-play-next');
      if (playNextId) {
        playNextById(playNextId);
        return;
      }

      const addQueueId = target.getAttribute('data-add-queue');
      if (addQueueId) {
        addToQueueById(addQueueId);
        return;
      }

      const addLocalId = target.getAttribute('data-add-local');
      if (addLocalId) {
        addLocalToPlaylist(addLocalId);
        return;
      }

      const addSpotifyRef = target.getAttribute('data-add-spotify-ref');
      if (addSpotifyRef) {
        addSpotifyRefToPlaylist(addSpotifyRef);
        return;
      }

      const removePlaylistItemId = target.getAttribute('data-remove-playlist-item');
      if (removePlaylistItemId) {
        const p = getActivePlaylist();
        if (!p || p.smart) return;
        p.items = p.items.filter((i) => i.id !== removePlaylistItemId);
        saveState();
        render();
        return;
      }

      const playlistUp = target.getAttribute('data-playlist-up');
      if (playlistUp !== null) {
        const p = getActivePlaylist();
        if (!p || p.smart) return;
        const i = Number(playlistUp);
        if (i > 0) {
          [p.items[i - 1], p.items[i]] = [p.items[i], p.items[i - 1]];
          saveState();
          render();
        }
        return;
      }

      const playlistDown = target.getAttribute('data-playlist-down');
      if (playlistDown !== null) {
        const p = getActivePlaylist();
        if (!p || p.smart) return;
        const i = Number(playlistDown);
        if (i < p.items.length - 1) {
          [p.items[i + 1], p.items[i]] = [p.items[i], p.items[i + 1]];
          saveState();
          render();
        }
        return;
      }

      const deleteTrackId = target.getAttribute('data-delete-track');
      if (deleteTrackId) {
        const track = state.localTracks.find((t) => t.id === deleteTrackId);
        if (!track) return;
        if (!window.confirm(`Delete song "${track.title}"?`)) return;
        deleteTracksByIds([deleteTrackId]);
        return;
      }

      if (target.id === 'selectAllTracksBtn') {
        selectAllVisibleTracks();
        render();
        return;
      }

      if (target.id === 'deleteSelectedTracksBtn') {
        if (!state.selectedTrackIds.length) return;
        if (!window.confirm(`Delete ${state.selectedTrackIds.length} selected songs?`)) return;
        deleteTracksByIds([...state.selectedTrackIds]);
        return;
      }

      const pickPlaylistId = target.getAttribute('data-pick-playlist');
      if (pickPlaylistId) {
        state.activePlaylistId = pickPlaylistId;
        state.currentView = 'playlists';
        saveState();
        render();
        return;
      }

      const deletePlaylistId = target.getAttribute('data-delete-playlist');
      if (deletePlaylistId) {
        deletePlaylistById(deletePlaylistId);
        return;
      }

      const playPlaylistTrackId = target.getAttribute('data-play-playlist-track');
      if (playPlaylistTrackId) {
        const p = getActivePlaylist();
        const queue = resolvePlaylistPlayableTracks(p);
        setQueueAndPlay(queue, playPlaylistTrackId);
        return;
      }

      const queuePlay = target.getAttribute('data-queue-play');
      if (queuePlay !== null) {
        const i = Number(queuePlay);
        const track = state.queue[i];
        if (track) setQueueAndPlay(state.queue, track.id);
        return;
      }

      const queueUp = target.getAttribute('data-queue-up');
      if (queueUp !== null) {
        const i = Number(queueUp);
        moveQueueItem(i, i - 1);
        return;
      }

      const queueDown = target.getAttribute('data-queue-down');
      if (queueDown !== null) {
        const i = Number(queueDown);
        moveQueueItem(i, i + 1);
        return;
      }

      const queueRemove = target.getAttribute('data-queue-remove');
      if (queueRemove !== null) {
        removeQueueAt(Number(queueRemove));
        return;
      }

      if (target.id === 'clearQueueBtn') {
        clearQueue();
        return;
      }

      if (target.id === 'spotifyLoginBtn') {
        spotifyLogin().catch((err) => showError(err.message || 'Spotify login failed.'));
        return;
      }

      if (target.id === 'spotifyRefreshBtn') {
        fetchLikedSongs().catch((err) => showError(err.message || 'Failed to fetch liked songs.'));
        return;
      }

      if (target.id === 'buildLikesPlaylistBtn') {
        buildPlaylistFromLikes();
        return;
      }

      if (target.id === 'renamePlaylistBtn') {
        const p = getActivePlaylist();
        if (!p || p.smart) return;
        const next = window.prompt('Rename playlist', p.name);
        if (!next || !next.trim()) return;
        p.name = next.trim();
        saveState();
        render();
        return;
      }

      if (target.id === 'deletePlaylistBtn') {
        const p = getActivePlaylist();
        if (!p || p.smart) return;
        deletePlaylistById(p.id);
        return;
      }

      if (target.id === 'settingsTabGeneralBtn') {
        state.settingsTab = 'general';
        render();
        return;
      }

      if (target.id === 'settingsTabAppearanceBtn') {
        state.settingsTab = 'appearance';
        render();
        return;
      }

      const themePick = target.getAttribute('data-theme-pick');
      if (themePick) {
        applyTheme(themePick);
        saveState();
        render();
        return;
      }

      if (target.id === 'saveSpotifyConfigBtn') {
        const clientInput = document.getElementById('spotifyClientIdInput');
        const redirectInput = document.getElementById('spotifyRedirectInput');
        localStorage.setItem('spotify_client_id', clientInput.value.trim());
        localStorage.setItem('spotify_redirect_uri', redirectInput.value.trim());
        showStatus('Spotify config saved.');
        render();
        return;
      }

      if (target.id === 'reconnectDirBtn') {
        reconnectSavedDirectory().catch((err) => showError(err.message || 'Reconnect failed.'));
        return;
      }

      if (target.id === 'clearLibraryBtn') {
        state.localTracks.forEach((track) => revokeTrackAlbumArt(track));
        state.localTracks = [];
        state.fileMap = new Map();
        state.linkedDirectoryName = null;
        state.selectedTrackIds = [];
        state.queue = [];
        state.queueOriginalOrder = [];
        state.queueIndex = -1;
        audio.pause();
        if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        audio.src = '';
        saveState();
        showStatus('Library cache cleared. Re-import your folder/files.');
        render();
        return;
      }

      if (target.id === 'spotifyLogoutBtn') {
        state.spotifyAuth = null;
        state.spotifyProfile = null;
        saveState();
        showStatus('Logged out from Spotify metadata session.');
        render();
        return;
      }

      if (target.id === 'clearCacheBtn') {
        if (!window.confirm('Clear all local cache and saved metadata?')) return;
        clearState();
        showStatus('Local cache cleared.');
      }
    });

    document.body.addEventListener('change', (evt) => {
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;

      const trackSelectId = target.getAttribute('data-track-select');
      if (trackSelectId && 'checked' in target) {
        toggleTrackSelection(trackSelectId, target.checked);
        render();
        return;
      }

      if (target.id === 'themeSelect') {
        applyTheme(target.value);
        saveState();
        render();
      }

      if (target.id === 'sortSelect') {
        state.sortBy = target.value;
        saveState();
        render();
      }

      if (target.id === 'autoRescanToggle') {
        state.autoRescanOnStartup = target.checked;
        saveState();
      }

      if (target.id === 'spotifyCompactRowsToggle') {
        state.spotifyCompactRows = target.checked;
        saveState();
        render();
      }
    });
  }

  async function bootstrap() {
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
    await registerServiceWorker();
    loadState();
    wireEvents();

    if (state.spotifyAuth) {
      fetchSpotifyProfile().catch(() => {
        state.spotifyProfile = null;
      });
    }

    await handleAuthCallback();

    if (typeof window.showDirectoryPicker === 'function') {
      const handle = await loadDirectoryHandle().catch(() => null);
      if (handle) {
        state.linkedDirectoryName = handle.name;
        if (state.autoRescanOnStartup) {
          try {
            await reconnectSavedDirectory();
          } catch {
            // keep app usable even if permissions are denied
          }
        }
      }
    } else {
      els.importFolderBtn.disabled = true;
      els.importFolderBtn.title = 'Directory picker unsupported in this browser';
    }

    render();
  }

  bootstrap().catch((err) => {
    showError(err.message || 'Failed to initialize app.');
  });
})();
