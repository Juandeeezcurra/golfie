// ============================================================
// GOLFIE — WORKER ENTRY
// ============================================================
// Reemplaza a doGet/doPost de Apps Script, con el MISMO contrato que ya usa
// golfie.html — no hubo que tocar el frontend más que el valor de
// APPS_SCRIPT_URL (ahora '/api', mismo origen):
//
//   GET  /api?action=ping
//   GET  /api?action=getRounds&user_id=...        -> array
//   GET  /api?action=getHoles&user_id=...          -> array
//   GET  /api?action=getClubFeedback&user_id=...   -> array
//   POST /api  { action: 'addRound'|'updateRound'|'addHole'|'addClubFeedback'|'deleteRound', ... }
//        -> { ok: true, result } | { ok: false, error }
// ============================================================

import { addRound, updateRound, deleteRoundRows, addHole, addClubFeedback, savePlayer, addRoundPlayer, getRounds, getHoles, getClubFeedback, getPlayers, getRoundPlayers } from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleGet(url, env) {
  const action = url.searchParams.get('action');
  const userId = String(url.searchParams.get('user_id') || '').trim();

  // La app pregunta la versión antes de reconciliar: contra un backend
  // append-only (el Apps Script viejo) reenviar datos duplicaría filas.
  if (action === 'ping') return json({ ok: true, v: 3, caps: ['players', 'round_players', 'player_holes', 'formats'] });

  // Sin código de usuario no se devuelve nada: evita que un dispositivo se
  // baje las rondas de todos los que alguna vez pegaron al backend.
  if (!userId) return json([]);

  if (action === 'getRounds') return json(await getRounds(env.DB, userId));
  if (action === 'getHoles') return json(await getHoles(env.DB, userId));
  if (action === 'getClubFeedback') return json(await getClubFeedback(env.DB, userId));
  if (action === 'getPlayers') return json(await getPlayers(env.DB, userId));
  if (action === 'getRoundPlayers') return json(await getRoundPlayers(env.DB, userId));

  return json({ error: 'Unknown action' });
}

async function handlePost(request, env) {
  let data;
  try {
    data = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, error: 'Body invalido: se esperaba JSON.' });
  }

  try {
    let result;
    switch (data.action) {
      case 'addRound': result = await addRound(env.DB, data); break;
      case 'updateRound': result = await updateRound(env.DB, data); break;
      case 'addHole': result = await addHole(env.DB, data); break;
      case 'addClubFeedback': result = await addClubFeedback(env.DB, data); break;
      case 'deleteRound': result = await deleteRoundRows(env.DB, data); break;
      case 'savePlayer': result = await savePlayer(env.DB, data); break;
      case 'addRoundPlayer': result = await addRoundPlayer(env.DB, data); break;
      default: return json({ ok: false, error: 'Unknown action: ' + data.action });
    }
    return json({ ok: true, result });
  } catch (err) {
    return json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api') {
      if (!env.DB) return json({ ok: false, error: 'Falta el binding DB de D1.' }, 503);
      if (request.method === 'POST') return handlePost(request, env);
      return handleGet(url, env);
    }

    // Todo lo demás lo sirve el binding de static assets (public/).
    return env.ASSETS.fetch(request);
  },
};
