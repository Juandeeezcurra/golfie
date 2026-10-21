// ============================================================
// GOLFIE — AMIGOS
// ============================================================
// Un amigo es un `player` liviano (nombre + handicap, sin login) que puede
// sumarse a cualquiera de tus rondas. Acá se arma, a partir de sus hoyos
// guardados en cada ronda donde participó, el mismo tipo de objeto "ronda"
// que usa core/insights.js para vos — así toda esa lógica (tendencia,
// handicap sugerido, distribución de scores) se reutiliza tal cual, sin
// duplicar una sola fórmula.
// ============================================================

import { app } from './context.js';
import { roundTotals } from './core/stats.js';

export function listFriends() {
  return app.store.loadPlayers();
}

export function findFriend(playerId) {
  return listFriends().find(p => p.player_id === playerId) || null;
}

// Todas las rondas donde participó este jugador, con SUS totales (no los de
// 'me'): el total_score/par_total/etc. de la ronda original es tuyo, así que
// acá se recalculan desde sus propios hoyos.
export function friendRounds(playerId) {
  return app.store.loadRounds()
    .map(round => {
      const participant = app.store.loadRoundPlayers(round.round_id).find(p => p.player_id === playerId);
      if (!participant) return null;
      const holes = Object.values(app.store.loadHoles(round.round_id, playerId));
      if (!holes.length) return null;
      const totals = roundTotals(holes);
      const target = Number(round.course_holes_count) || 18;
      return {
        ...round,
        ...totals,
        completed: holes.length >= target,
        hcp_index: participant.handicap_index,
        _holes: holes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function friendAllHoles(playerId) {
  return friendRounds(playerId).flatMap(r => r._holes);
}

// Cuántas rondas jugó con vos (para la lista de amigos, sin calcular todo).
export function friendRoundCount(playerId) {
  return app.store.loadRounds().reduce((n, round) =>
    n + (app.store.loadRoundPlayers(round.round_id).some(p => p.player_id === playerId) ? 1 : 0), 0);
}

export function saveFriend(player) {
  app.store.savePlayerToLS(player);
  app.sync.postToSheets('savePlayer', player);
}
