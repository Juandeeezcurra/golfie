// ============================================================
// GOLFIE — ARRANQUE
// ============================================================
// Crea las instancias (store + sync), conecta las pantallas al router y
// expone en window los handlers que usan los onclick del HTML.
// ============================================================

import { app } from './context.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { goTo, switchTab, onEnter } from './ui/router.js';
import { showToast } from './ui/toast.js';
import { renderHome, renderUserCode, showUserCode, showSettings, setCourseMode } from './ui/home.js';
import { renderHistory, deleteRound, deleteCurrentRound } from './ui/history.js';
import { loadCoursesIntoState, prefillHcp, filterCourses, selectTee, pickCatalogCourse, pickFreeCourse, startRound, initSetup, renderRoundPlayers, toggleRoundPlayer, toggleScrambleTeam, addFriend } from './ui/setup.js';
import { renderCourseFormHoles, saveNewCourse } from './ui/course-form.js';
import { loadCatalog } from './catalog.js';
import { setPar, changeScore, changePutts, changePenalties, toggleStat, saveHole, prevHole, nextHole, confirmAbort, toggleScoreVisibility } from './ui/tracker.js';
import { initClubFeedback, setSemaforo, toggleTag, finishRound } from './ui/clubs.js';
import { viewRound, exportRoundCSV, switchDashboardPlayer } from './ui/dashboard.js';
import {
  renderPending, renderCleanup, renderHold, renderStatusLines,
  showRepair, showCleanup, showHold, clearQueue,
} from './ui/repair.js';
import {
  renderFriendsList, showAddFriend, viewFriend, renderFriendDetailScreen,
  editCurrentFriend, viewFriendRound, applySuggestedHandicap,
} from './ui/friends.js';

// ---------- INSTANCIAS ----------
app.store = createStore(window.localStorage);
app.sync = createSync({
  store: app.store,
  fetchFn: (...args) => window.fetch(...args),
  navigatorRef: navigator,
  apiUrl: '/api',
  onQueueChange: () => renderPending(),
  onDataChange: () => { renderStatusLines(); renderHome(); },
  onStatus: text => {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = text;
  },
  onToast: (msg, ms) => showToast(msg, ms),
});

// ---------- PANTALLAS ----------
onEnter('home', renderHome);
onEnter('history', renderHistory);
onEnter('new-round', () => { loadCoursesIntoState(); prefillHcp(); renderRoundPlayers(); });
onEnter('new-course', renderCourseFormHoles);
onEnter('friends', renderFriendsList);
onEnter('friend-detail', renderFriendDetailScreen);

// ---------- HANDLERS DEL HTML ----------
// El markup usa onclick="..." inline, así que estas funciones tienen que ser
// globales. Es el puente entre el HTML y los módulos.
Object.assign(window, {
  goTo, switchTab,
  renderHome, showUserCode, showSettings, setCourseMode,
  renderHistory, deleteRound, deleteCurrentRound,
  filterCourses, selectTee, pickCatalogCourse, pickFreeCourse, startRound,
  renderRoundPlayers, toggleRoundPlayer, toggleScrambleTeam, addFriend,
  renderCourseFormHoles, saveNewCourse,
  setPar, changeScore, changePutts, changePenalties, toggleStat, saveHole, prevHole, nextHole, confirmAbort,
  toggleScoreVisibility,
  initClubFeedback, setSemaforo, toggleTag, finishRound,
  viewRound, exportRoundCSV, switchDashboardPlayer,
  showRepair, showCleanup, showHold, clearQueue,
  renderFriendsList, showAddFriend, viewFriend, editCurrentFriend, viewFriendRound, applySuggestedHandicap,
  renderPending, renderCleanup, renderHold,
  flushPending: () => app.sync.flushPending(),
});

// ---------- INIT ----------
function init() {
  initSetup();
  // El catálogo se carga al arrancar y no al entrar a "nueva ronda": si
  // retomás una ronda a medias desde el home, el tracker necesita la cancha
  // para saber el par y el stroke index de cada hoyo.
  loadCatalog();
  loadCoursesIntoState();
  renderUserCode();
  app.sync.purgeOrphanQueue();   // antes de cualquier envío: frena lo que reconcile encoló de más
  renderStatusLines();
  renderHome();
  initClubFeedback();
  app.sync.flushPending();
  app.sync.syncFromServer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Volver a intentar en cuanto haya señal otra vez, o al volver a la app.
window.addEventListener('online', () => app.sync.flushPending());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') app.sync.flushPending();
});

// Service worker: hace que la app abra sin señal (antes dependía de la caché
// del navegador). Se registra después del arranque para no competir con la
// primera carga.
//
// Escotilla de emergencia: abrir la app con ?nosw=1 desregistra el SW y borra
// sus cachés. Un service worker roto se autoperpetúa (se sirve a sí mismo
// desde la caché), así que tiene que haber una forma de salir sin reinstalar.
if ('serviceWorker' in navigator) {
  if (location.search.includes('nosw=1')) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW no registrado:', err));
    });
  }
}
