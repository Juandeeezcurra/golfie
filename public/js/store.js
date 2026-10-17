// ============================================================
// GOLFIE — PERSISTENCIA LOCAL
// ============================================================
// Único lugar que conoce el namespace `golfie_` de localStorage.
// Es una factory para que los tests puedan crear varios "dispositivos"
// independientes contra el mismo backend simulado.
// ============================================================

const PREFIX = 'golfie_';

export function createStore(storage) {
  function saveToLS(key, val) {
    storage.setItem(PREFIX + key, JSON.stringify(val));
  }

  function loadFromLS(key) {
    try { return JSON.parse(storage.getItem(PREFIX + key)); } catch { return null; }
  }

  function removeKey(key) {
    storage.removeItem(PREFIX + key);
  }

  function loadRounds() {
    return loadFromLS('rounds') || [];
  }

  function saveRounds(rounds) {
    saveToLS('rounds', rounds);
  }

  function saveRoundToLS(round) {
    const rounds = loadRounds();
    const idx = rounds.findIndex(r => r.round_id === round.round_id);
    if (idx >= 0) rounds[idx] = round; else rounds.unshift(round);
    saveToLS('rounds', rounds);
  }

  // Las canchas guardadas, más las que se puedan deducir de rondas pasadas.
  function listCourses() {
    const saved = loadFromLS('courses') || [];
    const merged = [...saved];
    const names = saved.map(c => c.name.toLowerCase());
    loadRounds().forEach(r => {
      if (r.course_name && !names.includes(r.course_name.toLowerCase())) {
        merged.push({
          name: r.course_name,
          tees: r.tees || '',
          slope: r.slope_rating || '',
          rating: r.course_rating || '',
        });
        names.push(r.course_name.toLowerCase());
      }
    });
    return merged;
  }

  function saveCourse(course) {
    const courses = listCourses();
    const exists = courses.find(c => c.name.toLowerCase() === course.name.toLowerCase());
    if (exists) return courses;
    courses.unshift(course);
    if (courses.length > 20) courses.pop();
    saveToLS('courses', courses);
    return courses;
  }

  function holeKey(roundId, playerId = 'me') {
    return playerId === 'me' ? 'holes_' + roundId : 'holes_' + roundId + '_' + playerId;
  }

  function loadHoles(roundId, playerId = 'me') {
    return loadFromLS(holeKey(roundId, playerId)) || {};
  }

  function saveHoles(roundId, holesMap, playerId = 'me') { saveToLS(holeKey(roundId, playerId), holesMap); }

  function loadPlayers() { return loadFromLS('players') || []; }
  function savePlayers(players) { saveToLS('players', players); }
  function savePlayerToLS(player) {
    const players = loadPlayers();
    const i = players.findIndex(p => p.player_id === player.player_id);
    if (i < 0) players.push(player); else players[i] = { ...players[i], ...player };
    savePlayers(players);
  }

  function loadRoundPlayers(roundId) { return loadFromLS('round_players_' + roundId) || []; }
  function saveRoundPlayers(roundId, players) { saveToLS('round_players_' + roundId, players); }
  function saveRoundPlayerToLS(roundId, player) {
    const players = loadRoundPlayers(roundId);
    const i = players.findIndex(p => p.player_id === player.player_id);
    if (i < 0) players.push(player); else players[i] = { ...players[i], ...player };
    saveRoundPlayers(roundId, players);
  }

  function loadClubs(roundId) {
    return loadFromLS('clubs_' + roundId) || {};
  }

  function saveClubs(roundId, clubsMap) {
    saveToLS('clubs_' + roundId, clubsMap);
  }

  function removeRoundData(roundId) {
    loadRoundPlayers(roundId).forEach(p => removeKey(holeKey(roundId, p.player_id)));
    removeKey('holes_' + roundId);
    removeKey('clubs_' + roundId);
    removeKey('round_players_' + roundId);
  }

  // ---------- IDENTIDAD ----------
  // Todo lo que se sube va firmado con este código, y el sync sólo trae de
  // vuelta lo que lo tenga. Sin esto la base es compartida y cada dispositivo
  // se baja las rondas de todos los demás.
  function newUserCode() {
    let s = '';
    while (s.length < 10) s += Math.random().toString(36).slice(2);
    return 'u-' + s.slice(0, 10);
  }

  function getUserId() {
    let id = storage.getItem(PREFIX + 'user_id');
    if (!id) {
      id = newUserCode();
      storage.setItem(PREFIX + 'user_id', id);
    }
    return id;
  }

  // Vincula este dispositivo a un código existente (para ver las mismas rondas
  // en el celular y en la compu). Devuelve false si el código no es válido.
  function setUserId(id) {
    id = String(id || '').trim().toLowerCase();
    if (!/^u-[a-z0-9]{6,24}$/.test(id)) return false;
    storage.setItem(PREFIX + 'user_id', id);
    return true;
  }

  return {
    saveToLS, loadFromLS, removeKey,
    loadRounds, saveRounds, saveRoundToLS,
    listCourses, saveCourse,
    loadHoles, saveHoles, loadClubs, saveClubs, removeRoundData,
    loadPlayers, savePlayers, savePlayerToLS,
    loadRoundPlayers, saveRoundPlayers, saveRoundPlayerToLS,
    newUserCode, getUserId, setUserId,
  };
}
