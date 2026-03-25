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
    description: 'Balanced dark mode with bright text and cool blue accents.',
    tokens: {
      '--bg': '#07111f',
      '--bg-soft': '#101c32',
      '--surface': '#16233f',
      '--surface-strong': '#1d2d4f',
      '--line': '#2d416c',
      '--text': '#f5f8ff',
      '--muted': '#a8b9da',
      '--accent': '#6bc6ff',
      '--accent-soft': '#1f5b90',
      '--danger': '#ff6f7d'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deeper blue-black contrast for a moody, high-glow look.',
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
    id: 'light',
    label: 'Light',
    description: 'Clean daylight surfaces with strong text contrast.',
    tokens: {
      '--bg': '#f5f7fb',
      '--bg-soft': '#ffffff',
      '--surface': '#ffffff',
      '--surface-strong': '#edf2f8',
      '--line': '#d5deeb',
      '--text': '#0f1a2b',
      '--muted': '#50627e',
      '--accent': '#155eef',
      '--accent-soft': '#dbe7ff',
      '--danger': '#b4232d'
    }
  },
  {
    id: 'sage-daybreak',
    label: 'Sage Daybreak',
    description: 'Soft green-gold palette for a calmer, editorial feel.',
    tokens: {
      '--bg': '#edf5f1',
      '--bg-soft': '#f7f8f4',
      '--surface': '#f7f8f4',
      '--surface-strong': '#ddebe4',
      '--line': '#bbd2c7',
      '--text': '#12211b',
      '--muted': '#4d7f6a',
      '--accent': '#7c8d4b',
      '--accent-soft': '#dce3c0',
      '--danger': '#b4232d'
    }
  },
  {
    id: 'mauve-morning',
    label: 'Mauve Morning',
    description: 'Warm mauve neutrals with a softer music-editor aesthetic.',
    tokens: {
      '--bg': '#f1eef5',
      '--bg-soft': '#ffffff',
      '--surface': '#f8f6fa',
      '--surface-strong': '#e7dfea',
      '--line': '#c8b9c7',
      '--text': '#261529',
      '--muted': '#615162',
      '--accent': '#8f6f8d',
      '--accent-soft': '#e7dcea',
      '--danger': '#b4232d'
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
