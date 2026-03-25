/**
 * Preferences renderer entry point.
 *
 * This file orchestrates section navigation, global error/info banners, and delegates
 * control rendering/event handling to focused modules.
 */

import { SettingsManager } from '../settings/settings-manager.js';
import { bindPreferencesEvents } from './event-router.js';
import { PREFERENCES_SEARCH_INDEX, PREFERENCES_SECTIONS, renderSection } from './sections.js';
import { escapeHtml, sectionButton } from './view-helpers.js';

function fatalPrefsError(message) {
  const root = document.getElementById('prefs');
  if (!root) return;
  root.innerHTML = `<div class="prefs-fatal" role="alert"><h2>Preferences Error</h2><div>${escapeHtml(message)}</div></div>`;
}

if (!window.musicApi) {
  fatalPrefsError('The preload API (window.musicApi) is unavailable.');
  throw new Error('window.musicApi is undefined');
}

const api = window.musicApi;
const settingsManager = new SettingsManager(api);

let activeSectionId = 'general';
let infoMessage = '';
let errorMessage = '';
let diagnosticsText = '';
let unbindEvents = null;
let renderQueued = false;
let searchQuery = '';
let confirmModalState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
  resolve: null
};

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function setInfo(message) {
  infoMessage = String(message || '');
  errorMessage = '';
  requestRender();
}

function setError(message) {
  errorMessage = String(message || 'Unexpected preferences error.');
  infoMessage = '';
  requestRender();
}

function clearMessages() {
  errorMessage = '';
  infoMessage = '';
}

function openConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  if (confirmModalState.open) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    confirmModalState = {
      open: true,
      title: String(title || 'Confirm Action'),
      message: String(message || ''),
      confirmLabel: String(confirmLabel || 'Confirm'),
      cancelLabel: String(cancelLabel || 'Cancel'),
      danger: Boolean(danger),
      resolve
    };
    requestRender();
  });
}

function closeConfirmModal(result = false) {
  if (!confirmModalState.open) return;
  const resolver = confirmModalState.resolve;
  confirmModalState = {
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
    resolve: null
  };
  requestRender();
  resolver?.(result);
}

function render() {
  const root = document.getElementById('prefs');
  const settings = settingsManager.get();
  if (!root || !settings) return;

  const sectionMeta = PREFERENCES_SECTIONS.find((section) => section.id === activeSectionId) || PREFERENCES_SECTIONS[0];
  const navHtml = PREFERENCES_SECTIONS.map((section) => sectionButton(section.id, section.label, activeSectionId)).join('');
  const fallbackSections = searchQuery
    ? PREFERENCES_SEARCH_INDEX.filter(
        (entry) =>
          entry.sectionId !== activeSectionId && entry.terms.join(' ').toLowerCase().includes(searchQuery.toLowerCase())
      ).map((entry) => entry.sectionId)
    : [];

  root.innerHTML = `
    <div class="prefs-shell">
      <aside class="prefs-sidebar glass-panel" aria-label="Preferences sections">
        <div class="prefs-brand">
          <span class="eyebrow">Settings</span>
          <h1>Preferences</h1>
          <p>Fine-tune the experience with a calmer, denser control surface.</p>
        </div>
        <nav class="prefs-nav">${navHtml}</nav>
      </aside>

      <main class="prefs-main">
        <div class="prefs-header glass-panel">
          <div>
            <span class="eyebrow">Section</span>
            <h2>${escapeHtml(sectionMeta.label)}</h2>
            <p>${escapeHtml(sectionMeta.description || '')}</p>
          </div>
          <span class="pill">Settings are saved automatically</span>
        </div>
        <div class="prefs-search glass-panel">
          <input id="prefsSearchInput" type="search" value="${escapeHtml(searchQuery)}" placeholder="Search settings..." aria-label="Search preferences" />
        </div>

        <div class="banner ${infoMessage ? '' : 'hidden'}" role="status" aria-live="polite">${escapeHtml(infoMessage)}</div>
        <div class="banner error ${errorMessage ? '' : 'hidden'}" role="alert">${escapeHtml(errorMessage)}</div>

        ${renderSection(settings, activeSectionId)}
        ${
          searchQuery
            ? `<div class="prefs-search-fallback ${fallbackSections.length ? '' : 'hidden'}">
                <h3>Results in other sections</h3>
                <div class="fallback-links">
                  ${fallbackSections
                    .map((sectionId) => {
                      const section = PREFERENCES_SECTIONS.find((item) => item.id === sectionId);
                      if (!section) return '';
                      return `<button data-section="${section.id}">Open ${escapeHtml(section.label)}</button>`;
                    })
                    .join('')}
                </div>
              </div>`
            : ''
        }
      </main>
    </div>
    <div id="prefsModal" class="app-modal ${confirmModalState.open ? '' : 'hidden'}" aria-hidden="${confirmModalState.open ? 'false' : 'true'}"></div>
  `;

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const rows = [...root.querySelectorAll('.setting-row')];
    let visibleCount = 0;
    for (const row of rows) {
      const text = String(row.textContent || '').toLowerCase();
      const visible = text.includes(q);
      row.classList.toggle('hidden', !visible);
      if (visible) visibleCount += 1;
    }
    const sections = [...root.querySelectorAll('.prefs-section')];
    for (const section of sections) {
      const hasVisible = section.querySelector('.setting-row:not(.hidden)');
      if (section.querySelector('.setting-row')) {
        section.classList.toggle('hidden', !hasVisible);
      }
    }
    if (!visibleCount) {
      const fallback = root.querySelector('.prefs-search-fallback');
      if (fallback) fallback.classList.remove('hidden');
    }
  }

  if (activeSectionId === 'diagnostics') {
    const pre = document.getElementById('diagnosticsLogOutput');
    if (pre) pre.textContent = diagnosticsText || 'No diagnostics logs yet.';
  }

  const modalHost = document.getElementById('prefsModal');
  if (modalHost) {
    if (confirmModalState.open) {
      modalHost.innerHTML = `
        <div class="modal-card ${confirmModalState.danger ? 'is-danger' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(confirmModalState.title)}">
          <h3>${escapeHtml(confirmModalState.title)}</h3>
          <div class="modal-copy">${escapeHtml(confirmModalState.message)}</div>
          <div class="modal-actions">
            <button id="prefsConfirmCancelBtn" type="button">${escapeHtml(confirmModalState.cancelLabel)}</button>
            <button id="prefsConfirmActionBtn" type="button" class="${confirmModalState.danger ? 'destructive' : ''}">${escapeHtml(confirmModalState.confirmLabel)}</button>
          </div>
        </div>
      `;
      modalHost.classList.remove('hidden');
      modalHost.setAttribute('aria-hidden', 'false');
    } else {
      modalHost.innerHTML = '';
      modalHost.classList.add('hidden');
      modalHost.setAttribute('aria-hidden', 'true');
    }
  }

  if (confirmModalState.open) {
    const modalPrimary = document.getElementById('prefsConfirmActionBtn');
    if (modalPrimary instanceof HTMLElement && !modalPrimary.contains(document.activeElement)) {
      modalPrimary.focus();
    }
  }
}

async function bootstrap() {
  await settingsManager.init();
  const loadDiagnostics = async () => {
    const logs = await api.getDiagnosticsLogs(250);
    diagnosticsText = (logs || [])
      .map((entry) => {
        const ts = new Date(Number(entry.ts || Date.now())).toISOString();
        const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        return `[${ts}] ${String(entry.level || 'info').toUpperCase()} ${String(entry.message || '')}${ctx}`;
      })
      .join('\n');
  };
  await loadDiagnostics().catch(() => {
    diagnosticsText = 'Failed to load diagnostics logs.';
  });
  render();

  unbindEvents = bindPreferencesEvents({
    api,
    settingsManager,
    getDiagnosticsText: () => diagnosticsText,
    refreshDiagnostics: async () => {
      await loadDiagnostics();
      requestRender();
    },
    getActiveSection: () => activeSectionId,
    setActiveSection: (next) => {
      if (!PREFERENCES_SECTIONS.some((section) => section.id === next)) return;
      activeSectionId = next;
      clearMessages();
      if (next === 'diagnostics') {
        void loadDiagnostics().then(() => requestRender());
      }
    },
    getSearchQuery: () => searchQuery,
    setSearchQuery: (value) => {
      searchQuery = String(value || '').trim();
    },
    onRender: requestRender,
    onInfo: setInfo,
    onError: setError,
    openConfirmModal,
    closeConfirmModal
  });

  settingsManager.onChange(() => requestRender());
}

window.addEventListener('beforeunload', () => {
  unbindEvents?.();
  settingsManager.destroy();
});

void bootstrap().catch((error) => {
  fatalPrefsError(error instanceof Error ? error.message : 'Failed to initialize preferences.');
});
