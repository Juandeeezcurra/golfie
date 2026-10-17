import { app } from '../context.js';
import { state, CLUBS, TAGS } from '../state.js';
import { jsStr } from '../util.js';
import { roundTotals } from '../core/stats.js';
import { goTo } from './router.js';
import { renderDashboard } from './dashboard.js';

export function initClubFeedback() {
  const list = document.getElementById('clubs-list');
  if (!list) return;
  list.innerHTML = CLUBS.map(club => `
    <div class="club-row" id="club-${club.replace(/\s/g, '_')}">
      <div class="club-name-row">
        <div class="club-name">${club}</div>
        <div class="semaforo">
          <div class="sem-btn verde" onclick="setSemaforo('${jsStr(club)}','verde',this)"></div>
          <div class="sem-btn amarillo" onclick="setSemaforo('${jsStr(club)}','amarillo',this)"></div>
          <div class="sem-btn rojo" onclick="setSemaforo('${jsStr(club)}','rojo',this)"></div>
        </div>
      </div>
      <div class="tags-wrap" id="tags-${club.replace(/\s/g, '_')}">
        ${TAGS.map(tag => `<div class="tag" onclick="toggleTag('${jsStr(club)}','${jsStr(tag)}',this)">${tag}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

export function setSemaforo(club, color, el) {
  if (!state.clubFeedback[club]) state.clubFeedback[club] = { rating: null, tags: [] };
  const prev = state.clubFeedback[club].rating;
  state.clubFeedback[club].rating = prev === color ? null : color;
  const row = document.getElementById('club-' + club.replace(/\s/g, '_'));
  row.querySelectorAll('.sem-btn').forEach(b => b.classList.remove('active'));
  if (state.clubFeedback[club].rating) el.classList.add('active');
}

export function toggleTag(club, tag, el) {
  if (!state.clubFeedback[club]) state.clubFeedback[club] = { rating: null, tags: [] };
  const tags = state.clubFeedback[club].tags;
  const idx = tags.indexOf(tag);
  if (idx >= 0) { tags.splice(idx, 1); el.classList.remove('active'); }
  else { tags.push(tag); el.classList.add('active'); }
}

export function finishRound() {
  const roundId = state.currentRound.round_id;
  const holesMap = app.store.loadHoles(roundId, 'me');
  const holes = Object.values(holesMap);
  state.currentPlayerId = 'me';
  state.holes = holesMap;
  const totals = roundTotals(holes);
  const target = Number(state.currentRound.course_holes_count) || 18;
  const allPlayersComplete = (state.roundPlayers.length ? state.roundPlayers : [{ player_id: 'me' }])
    .every(p => Object.keys(app.store.loadHoles(roundId, p.player_id)).length >= target);

  const roundUpdate = {
    ...state.currentRound,
    ...totals,
    completed: allPlayersComplete,
  };

  state.currentRound = roundUpdate;
  app.store.saveRoundToLS(roundUpdate);
  app.store.saveClubs(roundUpdate.round_id, state.clubFeedback);

  Object.entries(state.clubFeedback).forEach(([club, fb]) => {
    if (fb.rating || fb.tags.length) {
      app.sync.postToSheets('addClubFeedback', {
        round_id: state.currentRound.round_id,
        club,
        rating: fb.rating,
        tags: fb.tags.join(','),
      });
    }
  });

  app.sync.postToSheets('updateRound', roundUpdate);
  renderDashboard(roundUpdate, holes);
  goTo('dashboard');
}
