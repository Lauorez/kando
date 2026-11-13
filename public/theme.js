// Loaded before the stylesheet is painted to avoid a flash of the wrong theme.
(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('kando-theme') || 'system'; } catch {}
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  const media = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#141a18' : '#f7f8f7';
  };
  apply();
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme');
    select.value = preference;
    select.addEventListener('change', () => {
      preference = select.value;
      try { localStorage.setItem('kando-theme', preference); } catch {}
      apply();
    });
  });
})();
