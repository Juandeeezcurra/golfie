// Modal único reutilizable. `html` permite cuerpos ricos (los usan las
// pantallas de reparar/limpiar datos); `safe: true` pinta el botón de
// confirmar en verde en vez de rojo.
export function showModal({ title, body, html, confirmText, safe, onConfirm, onCancel }) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  const bodyEl = document.getElementById('modal-body');
  if (html) bodyEl.innerHTML = html; else bodyEl.textContent = body;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = confirmText || 'Confirmar';
  btn.className = 'modal-confirm' + (safe ? ' safe' : '');
  overlay.style.display = 'flex';
  const close = () => { overlay.style.display = 'none'; };
  const cancel = () => { close(); if (onCancel) onCancel(); };
  document.getElementById('modal-cancel').onclick = cancel;
  overlay.onclick = e => { if (e.target === overlay) cancel(); };
  btn.onclick = () => { close(); if (onConfirm) onConfirm(); };
}
