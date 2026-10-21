// Router de pantallas. No importa nada: quien quiera correr algo al entrar a
// una pantalla se registra con onEnter(). Así se evitan ciclos de imports
// entre el router y las pantallas que navegan.

const hooks = {};
const TAB_SCREENS = ['home', 'history', 'friends'];

export function onEnter(screen, fn) {
  (hooks[screen] = hooks[screen] || []).push(fn);
}

export function goTo(screen) {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('show');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(screen);
  if (el) el.classList.add('active');
  document.getElementById('bottom-nav').classList.toggle('hidden', !TAB_SCREENS.includes(screen));
  (hooks[screen] || []).forEach(fn => fn());
  window.scrollTo(0, 0);
}

export function switchTab(tab) {
  document.getElementById('bn-home').classList.toggle('active', tab === 'home');
  document.getElementById('bn-history').classList.toggle('active', tab === 'history');
  document.getElementById('bn-friends').classList.toggle('active', tab === 'friends');
  goTo(tab);
}
