/**
 * Shared HTML helpers for Preferences rendering.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function sectionButton(id, label, activeSectionId) {
  const active = id === activeSectionId ? 'active' : '';
  return `<button class="${active}" data-section="${id}">${escapeHtml(label)}</button>`;
}

export function settingRow(title, desc, controlHtml) {
  return `
    <div class="setting-row">
      <div>
        <div class="setting-title">${escapeHtml(title)}</div>
        <div class="setting-desc">${escapeHtml(desc)}</div>
      </div>
      <div class="control">${controlHtml}</div>
    </div>
  `;
}

export function toggleControl(path, checked, disabled = false) {
  return `<label class="pill"><input type="checkbox" data-setting="${escapeHtml(path)}" ${
    checked ? 'checked' : ''
  } ${disabled ? 'disabled' : ''} /> <span>${checked ? 'On' : 'Off'}</span></label>`;
}

export function selectControl(path, value, options, disabled = false) {
  const opts = options
    .map(
      (opt) =>
        `<option value="${escapeHtml(opt.value)}" ${opt.value === value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
    )
    .join('');
  return `<select data-setting="${escapeHtml(path)}" ${disabled ? 'disabled' : ''}>${opts}</select>`;
}

export function rangeControl(path, value, min, max, step, suffix = '', disabled = false) {
  return `
    <div class="control">
      <input type="range" data-setting="${escapeHtml(path)}" min="${min}" max="${max}" step="${step}" value="${value}" ${
        disabled ? 'disabled' : ''
      } />
      <span class="pill">${escapeHtml(String(value))}${escapeHtml(suffix)}</span>
    </div>
  `;
}

export function colorControl(path, value) {
  return `<input type="color" data-setting="${escapeHtml(path)}" value="${escapeHtml(value)}" />`;
}
