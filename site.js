document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('current-year');
  if (year) year.textContent = String(new Date().getFullYear());
});


/* Accessible cross-universe menu; no native dialogs. */
(() => {
  const switcher = document.querySelector('[data-universe-switch]');
  if (!switcher) return;
  const trigger = switcher.querySelector('[data-universe-trigger]');
  const menu = switcher.querySelector('[data-universe-menu]');
  const entries = [...menu.querySelectorAll('a[href]')];
  const setOpen = (open) => {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    switcher.classList.toggle('is-open', open);
  };
  trigger.addEventListener('click', () => setOpen(menu.hidden));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      entries[event.key === 'ArrowDown' ? 0 : entries.length - 1]?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    const position = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      entries[(position + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      entries[event.key === 'Home' ? 0 : entries.length - 1]?.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!switcher.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      trigger.focus();
    }
  });
  switcher.addEventListener('focusout', (event) => {
    if (!switcher.contains(event.relatedTarget)) setOpen(false);
  });
})();
