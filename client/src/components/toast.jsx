const ICON_SVG = {
  ok:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
};

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  el.innerHTML = `${ICON_SVG[type] || ICON_SVG.ok}<span></span>`;
  el.querySelector('span').textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
