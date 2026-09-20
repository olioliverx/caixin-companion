const preference = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.body.dataset.theme = preference.matches ? 'dark' : 'light';
}
applyTheme();
preference.addEventListener('change', applyTheme);
