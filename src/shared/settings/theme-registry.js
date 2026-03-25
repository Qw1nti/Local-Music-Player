/**
 * Built-in theme registry.
 *
 * Themes are expressed as CSS variable tokens. The renderer applies them by writing
 * variables onto the root element.
 */

export const BUILTIN_THEMES = [
  {
    id: 'dark',
    label: 'Dark',
    tokens: {
      '--bg': '#091021',
      '--bg-soft': '#111a33',
      '--surface': '#16213f',
      '--surface-strong': '#1b2a4e',
      '--line': '#2c3f68',
      '--text': '#f4f8ff',
      '--muted': '#9cb1d8',
      '--accent': '#5bc0ff',
      '--accent-soft': '#1b5ea6',
      '--danger': '#ff6f7d'
    }
  },
  {
    id: 'light',
    label: 'Light',
    tokens: {
      '--bg': '#f5f7fb',
      '--bg-soft': '#ffffff',
      '--surface': '#ffffff',
      '--surface-strong': '#eef2f8',
      '--line': '#d7deec',
      '--text': '#0f1a2b',
      '--muted': '#52627c',
      '--accent': '#155eef',
      '--accent-soft': '#dbe7ff',
      '--danger': '#c6283d'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    tokens: {
      '--bg': '#050714',
      '--bg-soft': '#0a0f25',
      '--surface': '#0f1733',
      '--surface-strong': '#131f44',
      '--line': '#26325c',
      '--text': '#e8ecff',
      '--muted': '#9aa7c2',
      '--accent': '#7c89ff',
      '--accent-soft': '#28306f',
      '--danger': '#ff6b8b'
    }
  },
  {
    id: 'neon',
    label: 'Neon',
    tokens: {
      '--bg': '#070810',
      '--bg-soft': '#0c0f1e',
      '--surface': '#111532',
      '--surface-strong': '#151b43',
      '--line': '#2b2f6b',
      '--text': '#f7fbff',
      '--muted': '#9ea8d6',
      '--accent': '#00e5ff',
      '--accent-soft': '#113a55',
      '--danger': '#ff4df3'
    }
  },
  {
    id: 'minimal',
    label: 'Minimal',
    tokens: {
      '--bg': '#0f1115',
      '--bg-soft': '#141720',
      '--surface': '#161b24',
      '--surface-strong': '#1a2030',
      '--line': '#2a3142',
      '--text': '#f4f6fb',
      '--muted': '#a7b0c2',
      '--accent': '#c8ff2c',
      '--accent-soft': '#2b3520',
      '--danger': '#ff6f7d'
    }
  },
  {
    id: 'sage-daybreak',
    label: 'Sage Daybreak',
    tokens: {
      '--bg': '#eff6f3',
      '--bg-soft': '#f7f6ed',
      '--surface': '#f5f6ef',
      '--surface-strong': '#deede7',
      '--line': '#bddbd0',
      '--text': '#12211b',
      '--muted': '#48846e',
      '--accent': '#8f843d',
      '--accent-soft': '#e0dbb8',
      '--danger': '#c6283d'
    }
  },
  {
    id: 'olive-nightfall',
    label: 'Olive Nightfall',
    tokens: {
      '--bg': '#0d1713',
      '--bg-soft': '#16170d',
      '--surface': '#202112',
      '--surface-strong': '#24210f',
      '--line': '#404224',
      '--text': '#f5f6ef',
      '--muted': '#b3b77b',
      '--accent': '#b3a54d',
      '--accent-soft': '#6b632e',
      '--danger': '#ff6f7d'
    }
  },
  {
    id: 'violet-afterdark',
    label: 'Violet Afterdark',
    tokens: {
      '--bg': '#000000',
      '--bg-soft': '#291528',
      '--surface': '#3a3e3b',
      '--surface-strong': '#291528',
      '--line': '#9e829c',
      '--text': '#f0eff4',
      '--muted': '#c7b7c5',
      '--accent': '#9e829c',
      '--accent-soft': '#3a3e3b',
      '--danger': '#ff6f7d'
    }
  },
  {
    id: 'mauve-morning',
    label: 'Mauve Morning',
    tokens: {
      '--bg': '#f0eff4',
      '--bg-soft': '#ffffff',
      '--surface': '#f6f5f8',
      '--surface-strong': '#e7e1eb',
      '--line': '#c9bac7',
      '--text': '#291528',
      '--muted': '#5a5059',
      '--accent': '#9e829c',
      '--accent-soft': '#e7dfe6',
      '--danger': '#c6283d'
    }
  }
];

export const THEME_TOKEN_KEYS = Object.freeze(Object.keys(BUILTIN_THEMES[0]?.tokens || {}));

export function isBuiltinThemeId(themeId) {
  return BUILTIN_THEMES.some((theme) => theme.id === themeId);
}

const LIGHT_THEME_IDS = new Set(['light', 'sage-daybreak', 'mauve-morning']);

export function isLightThemeId(themeId) {
  return LIGHT_THEME_IDS.has(String(themeId || ''));
}

export function getThemeById(themeId) {
  return BUILTIN_THEMES.find((theme) => theme.id === themeId) || BUILTIN_THEMES[0];
}
