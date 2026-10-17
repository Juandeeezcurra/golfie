// ============================================================
// GOLFIE — CATÁLOGO DE CANCHAS
// ============================================================
// Las canchas precargadas vienen de un JSON versionado en el repo
// (public/data/courses.json), no de la base: son datos de referencia
// iguales para todos, que nadie "posee". El service worker los precachea,
// así que funcionan sin señal.
//
// Las canchas que carga el usuario a mano viven en localStorage. Todavía no
// se sincronizan entre dispositivos; eso llega cuando el Worker sume tablas
// propias.
// ============================================================

import { app } from './context.js';

const CUSTOM_KEY = 'custom_courses';

let preloaded = null;
let loadError = null;

export async function loadCatalog(fetchFn = (...a) => fetch(...a)) {
  if (preloaded) return preloaded;
  try {
    const res = await fetchFn('/data/courses.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    preloaded = Array.isArray(data) ? data : (data.courses || []);
    loadError = null;
  } catch (e) {
    // Sin catálogo la app sigue andando: se puede escribir el nombre a mano.
    console.warn('No se pudo cargar el catálogo de canchas:', e);
    preloaded = [];
    loadError = e.message;
  }
  return preloaded;
}

export function catalogError() {
  return loadError;
}

export function customCourses() {
  return app.store.loadFromLS(CUSTOM_KEY) || [];
}

export function saveCustomCourse(course) {
  const list = customCourses().filter(c => c.course_id !== course.course_id);
  list.unshift(course);
  app.store.saveToLS(CUSTOM_KEY, list);
  return list;
}

export function deleteCustomCourse(courseId) {
  app.store.saveToLS(CUSTOM_KEY, customCourses().filter(c => c.course_id !== courseId));
}

// Catálogo completo: las precargadas más las tuyas.
export function allCourses() {
  return [...customCourses(), ...(preloaded || [])];
}

export function findCourse(courseId) {
  return allCourses().find(c => c.course_id === courseId) || null;
}

export function searchCourses(query) {
  const q = String(query || '').trim().toLowerCase();
  const list = allCourses();
  if (!q) return list;
  return list.filter(c =>
    String(c.name || '').toLowerCase().includes(q) ||
    String(c.club || '').toLowerCase().includes(q) ||
    String(c.city || '').toLowerCase().includes(q) ||
    (c.aliases || []).some(alias => String(alias).toLowerCase().includes(q))
  );
}

// Id estable a partir del nombre, para las canchas cargadas a mano.
export function slugify(name) {
  return 'custom-' + String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
