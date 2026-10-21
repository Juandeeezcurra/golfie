// ============================================================
// GOLFIE — CAPA DE DATOS (D1)
// ============================================================
// Port 1:1 de la lógica de negocio de appsscript.gs (addRound, updateRound,
// deleteRoundRows, addHole, addClubFeedback, getRounds/getHoles/getClubFeedback)
// a consultas SQL sobre D1. El contrato con el frontend no cambia: mismos
// nombres de acción, mismos campos, mismos upserts por round_id/hole_number/club.
//
// Diferencia clave respecto del original: el filtro "ownedBy" (fila sin dueño
// = adoptable, fila de otro usuario = invisible) se expresa directo en el
// WHERE en vez de escanear la hoja entera en JS.
// ============================================================

import { COLUMNS, SHEETS } from './schema.js';

const EMPTY = '';

function fromSql(value, type) {
  if (value === null || value === undefined) return EMPTY;
  if (type === 'bool') return value === 1 || value === '1' || value === true;
  if (type === 'num') {
    if (value === EMPTY) return EMPTY;
    const n = Number(value);
    return isNaN(n) ? EMPTY : n;
  }
  return value;
}

function toSql(value, type) {
  if (value === undefined || value === null || value === EMPTY) return null;
  if (type === 'bool') {
    return (value === true || value === 'TRUE' || value === 'true' || value === 1) ? 1 : 0;
  }
  if (type === 'num') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return value.toString();
}

function rowFromSql(name, raw) {
  if (!raw) return null;
  const cols = COLUMNS[name];
  const obj = {};
  for (const [col, type] of Object.entries(cols)) obj[col] = fromSql(raw[col], type);
  return obj;
}

async function insertRow(db, name, table, obj) {
  const cols = COLUMNS[name];
  const colNames = Object.keys(cols);
  const values = colNames.map(c => toSql(obj[c], cols[c]));
  const placeholders = colNames.map(() => '?').join(', ');
  await db.prepare(`INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders})`)
    .bind(...values).run();
}

async function updateRowBySeq(db, name, table, seq, partial) {
  const cols = COLUMNS[name];
  const setCols = Object.keys(partial);
  const values = setCols.map(c => toSql(partial[c], cols[c]));
  await db.prepare(`UPDATE ${table} SET ${setCols.map(c => c + ' = ?').join(', ')} WHERE _seq = ?`)
    .bind(...values, seq).run();
}

// Una fila es tuya si su user_id coincide, o si no tiene dueño (fila vieja,
// previa al user_id). Se expresa directo en SQL para no traer filas de otros
// usuarios a memoria.
const OWNED = "(user_id = ? OR user_id = '' OR user_id IS NULL)";

// ==================== ROUNDS ====================

async function findOwnedRound(db, roundId, userId) {
  const row = await db.prepare(`SELECT * FROM rounds WHERE round_id = ? AND ${OWNED} ORDER BY _seq LIMIT 1`)
    .bind(roundId, userId || '').first();
  return row;
}

// Upsert, no append: si la ronda ya existe (tuya o sin dueño) no se duplica.
export async function addRound(db, d) {
  const existing = await findOwnedRound(db, d.round_id, d.user_id);
  if (existing) {
    await updateRowBySeq(db, SHEETS.ROUNDS, 'rounds', existing._seq, {
      course_name: d.course_name, tees: d.tees, course_id: d.course_id || '', tee_id: d.tee_id || '',
      course_holes_count: d.course_holes_count || '', format: d.format || 'stroke',
      slope_rating: d.slope_rating, course_rating: d.course_rating, hcp_index: d.hcp_index ?? '',
      user_id: d.user_id || '',
    });
    return { round_id: d.round_id, existed: true };
  }

  await insertRow(db, SHEETS.ROUNDS, 'rounds', {
    round_id: d.round_id,
    date: d.date,
    course_name: d.course_name,
    tees: d.tees,
    course_id: d.course_id || '',
    tee_id: d.tee_id || '',
    course_holes_count: d.course_holes_count || '',
    format: d.format || 'stroke',
    slope_rating: d.slope_rating,
    course_rating: d.course_rating,
    hcp_index: d.hcp_index ?? '',
    weather: d.weather || '',
    total_score: '',
    par_total: '',
    total_putts: '',
    fairways_hit: '',
    greens_in_regulation: '',
    holes_played: '',
    completed: false,
    user_id: d.user_id || '',
  });
  return { round_id: d.round_id, inserted: true };
}

export async function updateRound(db, d) {
  let existing = await findOwnedRound(db, d.round_id, d.user_id);

  // Si el addRound original nunca llegó (se cortó la señal en la cancha),
  // creamos la fila acá en vez de descartar la ronda entera.
  if (!existing) {
    await addRound(db, d);
    existing = await findOwnedRound(db, d.round_id, d.user_id);
    if (!existing) return { updated: false, error: 'Round not found' };
  }

  await updateRowBySeq(db, SHEETS.ROUNDS, 'rounds', existing._seq, {
    total_score: d.total_score || '',
    par_total: d.par_total || '',
    total_putts: d.total_putts || '',
    fairways_hit: d.fairways_hit || '',
    greens_in_regulation: d.greens_in_regulation || '',
    holes_played: d.holes_played || '',
    completed: d.completed || false,
    format: d.format || 'stroke',
    user_id: d.user_id || '',
  });
  return { updated: true };
}

// Borra la ronda y todo lo que cuelga de ella, en las 3 tablas a la vez.
export async function deleteRoundRows(db, d) {
  let removed = 0;
  for (const table of ['rounds', 'holes', 'club_feedback', 'round_players']) {
    const res = await db.prepare(`DELETE FROM ${table} WHERE round_id = ? AND ${OWNED}`)
      .bind(d.round_id, d.user_id || '').run();
    removed += (res.meta && res.meta.changes) || 0;
  }
  return { removed };
}

// ==================== HOLES ====================

export async function addHole(db, d) {
  const existing = await db.prepare(
    `SELECT _seq FROM holes WHERE round_id = ? AND hole_number = ? AND player_id = ? AND ${OWNED} LIMIT 1`
  ).bind(d.round_id, d.hole_number, d.player_id || 'me', d.user_id || '').first();

  const obj = {
    round_id: d.round_id,
    hole_number: d.hole_number,
    player_id: d.player_id || 'me',
    par: d.par,
    stroke_index: d.stroke_index,
    hole_length: d.hole_length,
    score: d.score,
    putts: d.putts,
    fairway_hit: d.fairway_hit === null || d.fairway_hit === undefined ? '' : d.fairway_hit,
    green_in_regulation: d.green_in_regulation,
    penalties: d.penalties,
    up_and_down: d.up_and_down,
    sand_save: d.sand_save,
    bunker: d.bunker,
    user_id: d.user_id || '',
  };

  if (existing) {
    await updateRowBySeq(db, SHEETS.HOLES, 'holes', existing._seq, obj);
    return { updated: true, hole: d.hole_number };
  }
  await insertRow(db, SHEETS.HOLES, 'holes', obj);
  return { inserted: true, hole: d.hole_number };
}

// ==================== CLUB FEEDBACK ====================

export async function addClubFeedback(db, d) {
  const existing = await db.prepare(
    `SELECT _seq FROM club_feedback WHERE round_id = ? AND club = ? AND ${OWNED} LIMIT 1`
  ).bind(d.round_id, d.club, d.user_id || '').first();

  const obj = {
    round_id: d.round_id,
    club: d.club,
    rating: d.rating || '',
    tags: d.tags || '',
    timestamp: new Date().toISOString(),
    user_id: d.user_id || '',
  };

  if (existing) {
    await updateRowBySeq(db, SHEETS.CLUB_FEEDBACK, 'club_feedback', existing._seq, obj);
    return { club: d.club, updated: true };
  }
  await insertRow(db, SHEETS.CLUB_FEEDBACK, 'club_feedback', obj);
  return { club: d.club, inserted: true };
}

// ==================== LECTURA (equivalente a doGet) ====================
// Filtro estricto: nunca se devuelve una fila sin dueño. La "app" está
// publicada sin autenticación, así que sin esto cada dispositivo vería las
// rondas de todos los que alguna vez usaron el backend.

export async function getRounds(db, userId) {
  if (!userId) return [];
  const { results } = await db.prepare('SELECT * FROM rounds WHERE user_id = ? ORDER BY _seq')
    .bind(userId).all();
  return results.map(r => rowFromSql(SHEETS.ROUNDS, r));
}

export async function getHoles(db, userId) {
  if (!userId) return [];
  const { results } = await db.prepare('SELECT * FROM holes WHERE user_id = ? ORDER BY _seq')
    .bind(userId).all();
  return results.map(r => rowFromSql(SHEETS.HOLES, r));
}

export async function getClubFeedback(db, userId) {
  if (!userId) return [];
  const { results } = await db.prepare('SELECT * FROM club_feedback WHERE user_id = ? ORDER BY _seq')
    .bind(userId).all();
  return results.map(r => rowFromSql(SHEETS.CLUB_FEEDBACK, r));
}

// ==================== JUGADORES ====================

export async function savePlayer(db, d) {
  if (!String(d.player_id || '').trim() || !String(d.name || '').trim()) throw new Error('Falta el id o nombre del jugador.');
  const userId = d.user_id || '';
  const existing = await db.prepare(`SELECT _seq FROM players WHERE player_id = ? AND ${OWNED} LIMIT 1`)
    .bind(d.player_id, userId).first();
  const row = { player_id: d.player_id, name: d.name, handicap_index: d.handicap_index ?? '', user_id: userId };
  if (existing) {
    await updateRowBySeq(db, SHEETS.PLAYERS, 'players', existing._seq, row);
    return { updated: true, player_id: d.player_id };
  }
  await insertRow(db, SHEETS.PLAYERS, 'players', row);
  return { inserted: true, player_id: d.player_id };
}

export async function addRoundPlayer(db, d) {
  if (!String(d.round_id || '').trim() || !String(d.player_id || '').trim()) throw new Error('Falta la ronda o el jugador.');
  const userId = d.user_id || '';
  if (!await findOwnedRound(db, d.round_id, userId)) throw new Error('La ronda no pertenece a este usuario.');
  const existing = await db.prepare(`SELECT _seq FROM round_players WHERE round_id = ? AND player_id = ? AND ${OWNED} LIMIT 1`)
    .bind(d.round_id, d.player_id, userId).first();
  const row = { round_id: d.round_id, player_id: d.player_id, team_id: d.team_id || '',
    playing_handicap: d.playing_handicap ?? '', user_id: userId };
  if (existing) {
    await updateRowBySeq(db, SHEETS.ROUND_PLAYERS, 'round_players', existing._seq, row);
    return { updated: true, player_id: d.player_id };
  }
  await insertRow(db, SHEETS.ROUND_PLAYERS, 'round_players', row);
  return { inserted: true, player_id: d.player_id };
}

export async function getPlayers(db, userId) {
  if (!userId) return [];
  const { results } = await db.prepare('SELECT * FROM players WHERE user_id = ? ORDER BY _seq').bind(userId).all();
  return results.map(r => rowFromSql(SHEETS.PLAYERS, r));
}

// round_players no guarda nombre ni handicap (son del perfil del jugador,
// en la tabla `players`) — se resuelven acá con un JOIN. Sin esto, cualquier
// dispositivo que no haya CREADO la ronda (otro teléfono, la compu vinculada
// por código) recibe jugadores sin nombre y el switcher del dashboard
// termina mostrando "Jugador" genérico para todos.
export async function getRoundPlayers(db, userId) {
  if (!userId) return [];
  const { results } = await db.prepare(`
    SELECT rp.*, p.name AS p_name, p.handicap_index AS p_hcp
    FROM round_players rp
    LEFT JOIN players p ON p.player_id = rp.player_id AND (p.user_id = rp.user_id OR p.user_id = '' OR p.user_id IS NULL)
    WHERE rp.user_id = ? ORDER BY rp._seq
  `).bind(userId).all();
  return results.map(r => ({
    ...rowFromSql(SHEETS.ROUND_PLAYERS, r),
    name: r.player_id === 'me' ? 'Yo' : (r.p_name || ''),
    handicap_index: r.p_hcp == null ? '' : r.p_hcp,
  }));
}

// ==================== MIGRACIÓN (correr a mano una sola vez) ====================
// Equivalente a claimLegacyRows() de appsscript.gs. Se corre con wrangler,
// no vía la API: ver tools/claim-legacy.mjs.
export async function claimLegacyRows(db, userId) {
  userId = String(userId || '').trim();
  if (!/^u-[a-z0-9]{6,24}$/.test(userId)) throw new Error('Código inválido: ' + userId);

  let total = 0;
  for (const table of ['rounds', 'holes', 'club_feedback']) {
    const res = await db.prepare(
      `UPDATE ${table} SET user_id = ? WHERE user_id = '' OR user_id IS NULL`
    ).bind(userId).run();
    total += (res.meta && res.meta.changes) || 0;
  }
  return total;
}
