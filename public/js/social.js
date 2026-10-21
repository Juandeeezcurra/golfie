// ============================================================
// GOLFIE — PERFILES Y AMIGOS (capa de datos)
// ============================================================
// Habla con las acciones sociales del Worker. Lo que viene de un amigo vive
// sólo en memoria de la pantalla: nunca entra al store local ni al sync, así
// no se mezcla con tus rondas. Sólo se guarda en el teléfono el resumen de
// conexiones (para mostrarlo sin señal).
// ============================================================

import { app } from './context.js';

const CACHE_KEY = 'social';

export async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, user_id: app.store.getUserId(), ...params });
  const res = await fetch('/api?' + qs);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

export async function apiPost(action, data = {}) {
  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, user_id: app.store.getUserId(), ...data }),
  });
  const out = await res.json();
  if (!out || out.ok !== true) throw new Error((out && out.error) || 'No se pudo completar.');
  return out.result;
}

export function cachedSocial() {
  return app.store.loadFromLS(CACHE_KEY) || null;
}

export function clearSocialCache() {
  app.store.removeKey(CACHE_KEY);
}

export async function refreshSocial() {
  const social = await apiGet('getSocial');
  app.store.saveToLS(CACHE_KEY, social);
  return social;
}

// Mensaje para mostrar: los errores de red no deberían verse como un fallo raro.
export function friendlyError(e) {
  const msg = e && e.message ? e.message : '';
  if (e instanceof TypeError || /fetch|network|load failed/i.test(msg)) return 'Sin conexión. Probá de nuevo cuando tengas señal.';
  return msg || 'No se pudo completar.';
}
