document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('current-year');
  if (year) year.textContent = String(new Date().getFullYear());
});


/* Native details: JavaScript only enhances dismissal and arrow-key navigation. */
(() => {
  const switcher = document.querySelector('[data-universe-switch]');
  if (!switcher) return;
  const summary = switcher.querySelector('[data-universe-trigger]');
  const menu = switcher.querySelector('[data-universe-menu]');
  const entries = [...menu.querySelectorAll('a[href]')];
  const close = (restoreFocus = false) => {
    switcher.open = false;
    if (restoreFocus) summary.focus();
  };
  summary.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      switcher.open = true;
      entries[event.key === 'ArrowDown' ? 0 : entries.length - 1]?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    const position = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      entries[(position + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      entries[event.key === 'Home' ? 0 : entries.length - 1]?.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (switcher.open && !switcher.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && switcher.open) close(true);
  });
})();
