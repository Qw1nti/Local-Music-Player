/**
 * Centralized event routing for Preferences controls.
 */
import { applyImportedSettings, mergePlaylists } from '../services/data-transfer-client.js';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function toControlValue(target) {
  if (target instanceof HTMLInputElement) {
    if (target.type === 'checkbox') return target.checked;
    if (target.type === 'range') return Number(target.value);
    if (target.type === 'color') {
      return HEX_COLOR_RE.test(target.value) ? target.value : null;
    }
    return target.value;
  }

  if (target instanceof HTMLSelectElement) {
    return target.value;
  }

  return undefined;
}

export function bindPreferencesEvents({
  api,
  settingsManager,
  getDiagnosticsText,
  refreshDiagnostics,
  getActiveSection,
  setActiveSection,
  getSearchQuery,
  setSearchQuery,
  onRender,
  onInfo,
  onError,
  openConfirmModal,
  closeConfirmModal
}) {
  const pendingSettingTimers = new Map();

  const commitSetting = (path, value) => {
    void settingsManager.set(path, value).catch((error) => {
      onError(error instanceof Error ? error.message : `Failed to update ${path}.`);
      onRender();
    });
  };

  const scheduleSettingCommit = (path, value, delayMs = 0) => {
    const existing = pendingSettingTimers.get(path);
    if (existing) clearTimeout(existing);

    if (!delayMs) {
      pendingSettingTimers.delete(path);
      commitSetting(path, value);
      return;
    }

    const timer = setTimeout(() => {
      pendingSettingTimers.delete(path);
      commitSetting(path, value);
    }, delayMs);
    pendingSettingTimers.set(path, timer);
  };

  const handleClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const nextSection = target.getAttribute('data-section');
    if (nextSection) {
      setActiveSection(nextSection);
      onRender();
      return;
    }

    const themePick = target.getAttribute('data-theme-pick');
    if (themePick) {
      void settingsManager
        .set('themes.activeThemeId', themePick)
        .catch((error) => onError(error instanceof Error ? error.message : 'Unable to switch theme.'));
      return;
    }

    if (target.id === 'resetSettingsBtn') {
      void openConfirmModal?.({
        title: 'Reset Settings',
        message: 'Reset all settings to defaults? This will restore the built-in configuration.',
        confirmLabel: 'Reset',
        cancelLabel: 'Keep Settings',
        danger: true
      }).then((confirmed) => {
        if (!confirmed) return;
        void settingsManager
          .reset()
          .then(() => onInfo('Settings reset to defaults.'))
          .catch((error) => onError(error instanceof Error ? error.message : 'Failed to reset settings.'));
      });
      return;
    }

    if (target.id === 'prefsConfirmCancelBtn' || target.id === 'prefsModal') {
      closeConfirmModal?.(false);
      return;
    }

    if (target.id === 'prefsConfirmActionBtn') {
      closeConfirmModal?.(true);
      return;
    }

    if (target.id === 'clearLibraryBtn') {
      void openConfirmModal?.({
        title: 'Clear Library Cache',
        message: 'Clear saved library state? You will need to re-import your music.',
        confirmLabel: 'Clear Cache',
        cancelLabel: 'Keep Cache',
        danger: true
      }).then((confirmed) => {
        if (!confirmed) return;
        void api
          .clearLibraryState()
          .then(() => {
            onInfo('Library cache cleared. Restart the app to re-import.');
          })
          .catch((error) => onError(error instanceof Error ? error.message : 'Failed to clear library cache.'));
      });
      return;
    }

    if (target.id === 'exportDataBtn') {
      void api
        .loadLibraryState()
        .then((libraryState) =>
          api.exportData({
            playlists: Array.isArray(libraryState?.playlists) ? libraryState.playlists : [],
            settings: settingsManager.get()
          })
        )
        .then((result) => {
          if (!result?.canceled) onInfo(`Exported data to ${result.filePath}`);
        })
        .catch((error) => onError(error instanceof Error ? error.message : 'Export failed.'));
      return;
    }

    if (target.id === 'importDataBtn') {
      void api
        .importData()
        .then(async (result) => {
          if (result?.canceled) return;
          const data = result?.data || {};
          if (Array.isArray(data.playlists)) {
            const current = await api.loadLibraryState();
            const mergedPlaylists = mergePlaylists(current?.playlists || [], data.playlists);
            await api.saveLibraryState({
              ...current,
              playlists: mergedPlaylists
            });
          }
          if (data.settings && typeof data.settings === 'object') {
            await applyImportedSettings(settingsManager, data.settings);
          }
          onInfo(`Imported data file: ${result.filePath}`);
        })
        .catch((error) => onError(error instanceof Error ? error.message : 'Import failed.'));
      return;
    }

    if (target.id === 'refreshDiagnosticsBtn') {
      void refreshDiagnostics().catch((error) => onError(error instanceof Error ? error.message : 'Failed to refresh diagnostics.'));
      return;
    }

    if (target.id === 'clearDiagnosticsBtn') {
      void api
        .clearDiagnosticsLogs()
        .then(() => refreshDiagnostics())
        .then(() => onInfo('Diagnostics logs cleared.'))
        .catch((error) => onError(error instanceof Error ? error.message : 'Failed to clear diagnostics logs.'));
      return;
    }

    if (target.id === 'copyDiagnosticsBtn') {
      const text = String(getDiagnosticsText?.() || '');
      void navigator.clipboard
        .writeText(text)
        .then(() => onInfo('Diagnostics log copied to clipboard.'))
        .catch(() => onError('Clipboard access failed.'));
      return;
    }

    if (target.id === 'exportThemeBtn') {
      const tokens = settingsManager.get()?.themes?.customTheme?.tokens || {};
      const json = JSON.stringify(tokens, null, 2);

      void navigator.clipboard
        .writeText(json)
        .then(() => {
          onInfo('Custom theme JSON copied to clipboard.');
          target.textContent = 'Copied';
          setTimeout(() => {
            target.textContent = 'Copy JSON';
          }, 900);
        })
        .catch(() => {
          onError('Clipboard access failed. Copy is unavailable in this environment.');
        });
    }
  };

  const handleInput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'prefsSearchInput' && target instanceof HTMLInputElement) {
      setSearchQuery(target.value);
      onRender();
      return;
    }

    const path = target.getAttribute('data-setting');
    if (!path) return;

    const value = toControlValue(target);
    if (value === undefined || value === null) return;

    const isThemeTokenUpdate = path.startsWith('themes.customTheme.tokens.');
    const isRange = target instanceof HTMLInputElement && target.type === 'range';
    const delayMs = isThemeTokenUpdate ? 120 : isRange ? 80 : 0;

    scheduleSettingCommit(path, value, delayMs);
  };

  const handleKeydown = (event) => {
    const modalOpen = Boolean(document.getElementById('prefsModal') && !document.getElementById('prefsModal').classList.contains('hidden'));
    if (modalOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirmModal?.(false);
        return;
      }
      if (event.key === 'Tab') {
        const modal = document.querySelector('#prefsModal .modal-card');
        if (!modal) return;
        const focusables = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => el instanceof HTMLElement && !el.hasAttribute('disabled')
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.getElementById('prefsSearchInput')?.focus();
      return;
    }

    if (event.key === 'Escape' && getSearchQuery()) {
      setSearchQuery('');
      onRender();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const sections = Array.from(document.querySelectorAll('.prefs-nav [data-section]'));
    const currentIndex = sections.findIndex((el) => el.getAttribute('data-section') === getActiveSection());
    if (currentIndex < 0) return;

    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), sections.length - 1);
    const next = sections[nextIndex];
    const nextSection = next?.getAttribute('data-section');
    if (!nextSection || nextSection === getActiveSection()) return;

    setActiveSection(nextSection);
    onRender();
    next.focus();
  };

  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);

  return () => {
    for (const timer of pendingSettingTimers.values()) {
      clearTimeout(timer);
    }
    pendingSettingTimers.clear();

    document.removeEventListener('click', handleClick);
    document.removeEventListener('input', handleInput);
    document.removeEventListener('keydown', handleKeydown);
  };
}
