(() => {
  const allowedThemes = new Set([
    'dark',
    'light',
    'midnight',
    'solarized',
    'forest',
    'neon',
    'nhk-room',
    'nhk-paranoia-neon'
  ]);

  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  const theme = allowedThemes.has(savedTheme) ? savedTheme : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
