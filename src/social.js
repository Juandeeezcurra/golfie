// ============================================================
// GOLFIE — PERFILES Y AMIGOS
// ============================================================
// Opt-in: sin perfil nadie aparece ni puede recibir solicitudes. Lo público
// es el `username`; el código de usuario (user_id) es el secreto con el que
// cada dispositivo se identifica y NUNCA sale en una respuesta.
//
// Un amigo (aceptado) sólo ve un resumen: sus rondas terminadas recientes y
// los hoyos de esas rondas. Nada de palos, clima ni datos de otros jugadores.
// ============================================================

import { rowFromSql } from './db.js';
import { SHEETS } from './schema.js';

const USER_RE = /^u-[a-z0-9]{6,24}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RECENT_ROUNDS = 20;
// La foto es un JPEG chico (la app lo achica a ~192px) guardado como data URL.
// Se valida el formato exacto: es lo único que se vuelca luego en un <img src>.
const AVATAR_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_CHARS = 60000;

function requireUser(id) {
  const userId = String(id || '').trim();
  if (!USER_RE.test(userId)) throw new Error('Código de usuario inválido.');
  return userId;
}

function normUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

const publicProfile = p => ({ username: p.username, display_name: p.display_name || p.username, avatar: p.avatar || '' });

async function profileOf(db, userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first();
}

async function profileByUsername(db, username) {
  return db.prepare('SELECT * FROM profiles WHERE username = ?').bind(username).first();
}

async function requireProfile(db, userId) {
  const me = await profileOf(db, userId);
  if (!me) throw new Error('Primero creá tu perfil.');
  return me;
}

// Fila de amistad entre dos usuarios, en cualquier sentido.
async function friendshipBetween(db, a, b) {
  return db.prepare(
    'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).bind(a, b, b, a).first();
}

export async function saveProfile(db, d) {
  const userId = requireUser(d.user_id);
  const username = normUsername(d.username);
  if (!USERNAME_RE.test(username)) throw new Error('El usuario tiene que tener entre 3 y 20 letras, números o guión bajo.');
  const displayName = String(d.display_name || '').trim().slice(0, 30) || username;

  const taken = await profileByUsername(db, username);
  if (taken && taken.user_id !== userId) throw new Error('Ese usuario ya está en uso.');

  const mine = await profileOf(db, userId);

  // Sin `avatar` en el pedido se conserva la foto; con '' se quita.
  let avatar = mine && mine.avatar ? mine.avatar : '';
  if (d.avatar !== undefined) {
    if (d.avatar === '' || d.avatar === null) avatar = '';
    else if (typeof d.avatar === 'string' && d.avatar.length <= MAX_AVATAR_CHARS && AVATAR_RE.test(d.avatar)) avatar = d.avatar;
    else throw new Error('La foto no es válida.');
  }

  if (mine) {
    await db.prepare('UPDATE profiles SET username = ?, display_name = ?, avatar = ? WHERE user_id = ?')
      .bind(username, displayName, avatar, userId).run();
  } else {
    await db.prepare('INSERT INTO profiles (user_id, username, display_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, username, displayName, avatar, new Date().toISOString()).run();
  }
  return { username, display_name: displayName };
}

export async function deleteProfile(db, d) {
  const userId = requireUser(d.user_id);
  await db.prepare('DELETE FROM friendships WHERE requester_id = ? OR addressee_id = ?').bind(userId, userId).run();
  await db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(userId).run();
  return { deleted: true };
}

export async function getSocial(db, userIdRaw) {
  const userId = requireUser(userIdRaw);
  const me = await profileOf(db, userId);
  const out = { profile: me ? publicProfile(me) : null, friends: [], incoming: [], outgoing: [] };
  if (!me) return out;

  const { results } = await db.prepare(`
    SELECT f.status, f.requester_id, p.username, p.display_name, p.avatar
    FROM friendships f
    JOIN profiles p ON p.user_id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE f.requester_id = ? OR f.addressee_id = ?
    ORDER BY f._seq
  `).bind(userId, userId, userId).all();

  results.forEach(r => {
    const person = publicProfile(r);
    if (r.status === 'accepted') out.friends.push(person);
    else if (r.requester_id === userId) out.outgoing.push(person);
    else out.incoming.push(person);
  });
  return out;
}

export async function searchProfiles(db, userIdRaw, query) {
  const userId = requireUser(userIdRaw);
  await requireProfile(db, userId);
  const q = normUsername(query);
  if (!/^[a-z0-9_]{3,20}$/.test(q)) return [];

  const like = q.replace(/_/g, '\\_') + '%';
  const { results } = await db.prepare(
    "SELECT user_id, username, display_name, avatar FROM profiles WHERE username LIKE ? ESCAPE '\\' AND user_id != ? ORDER BY (username = ?) DESC, username LIMIT 10"
  ).bind(like, userId, q).all();

  const out = [];
  for (const p of results) {
    const f = await friendshipBetween(db, userId, p.user_id);
    const relation = !f ? 'none' : f.status === 'accepted' ? 'friends' : f.requester_id === userId ? 'sent' : 'received';
    out.push({ ...publicProfile(p), relation });
  }
  return out;
}

export async function requestFriend(db, d) {
  const userId = requireUser(d.user_id);
  await requireProfile(db, userId);
  const target = await profileByUsername(db, normUsername(d.username));
  if (!target) throw new Error('No encontramos a ese usuario.');
  if (target.user_id === userId) throw new Error('Ese sos vos.');

  const existing = await friendshipBetween(db, userId, target.user_id);
  if (existing) {
    if (existing.status === 'accepted') return { status: 'friends' };
    if (existing.requester_id === userId) return { status: 'sent' };
    // Ya te había invitado él: pedirle lo mismo equivale a aceptar.
    await db.prepare("UPDATE friendships SET status = 'accepted' WHERE _seq = ?").bind(existing._seq).run();
    return { status: 'friends' };
  }
  await db.prepare('INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, target.user_id, 'pending', new Date().toISOString()).run();
  return { status: 'sent' };
}

export async function respondFriend(db, d) {
  const userId = requireUser(d.user_id);
  await requireProfile(db, userId);
  const from = await profileByUsername(db, normUsername(d.username));
  const pending = from && await db.prepare(
    "SELECT _seq FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'"
  ).bind(from.user_id, userId).first();
  if (!pending) throw new Error('No hay una solicitud de ese usuario.');

  if (d.accept === true || d.accept === 'true') {
    await db.prepare("UPDATE friendships SET status = 'accepted' WHERE _seq = ?").bind(pending._seq).run();
    return { status: 'friends' };
  }
  await db.prepare('DELETE FROM friendships WHERE _seq = ?').bind(pending._seq).run();
  return { status: 'declined' };
}

// Sirve para dejar de ser amigos y también para cancelar una solicitud enviada.
export async function removeFriend(db, d) {
  const userId = requireUser(d.user_id);
  const other = await profileByUsername(db, normUsername(d.username));
  if (!other) return { removed: 0 };
  const res = await db.prepare(
    'DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
  ).bind(userId, other.user_id, other.user_id, userId).run();
  return { removed: (res.meta && res.meta.changes) || 0 };
}

export async function getFriendData(db, userIdRaw, usernameRaw) {
  const userId = requireUser(userIdRaw);
  await requireProfile(db, userId);
  const friend = await profileByUsername(db, normUsername(usernameRaw));
  const link = friend && await friendshipBetween(db, userId, friend.user_id);
  if (!link || link.status !== 'accepted') throw new Error('No son amigos todavía.');

  const { results: roundRows } = await db.prepare(
    "SELECT * FROM rounds WHERE user_id = ? AND completed = 1 AND (format IS NULL OR format != 'scramble') ORDER BY date DESC, _seq DESC LIMIT ?"
  ).bind(friend.user_id, RECENT_ROUNDS).all();
  const rounds = roundRows.map(r => {
    const round = rowFromSql(SHEETS.ROUNDS, r);
    delete round.user_id;
    delete round.weather;
    return round;
  });

  let holes = [];
  if (rounds.length) {
    const marks = rounds.map(() => '?').join(', ');
    const { results } = await db.prepare(
      `SELECT * FROM holes WHERE user_id = ? AND round_id IN (${marks}) AND (player_id = 'me' OR player_id = '' OR player_id IS NULL) ORDER BY _seq`
    ).bind(friend.user_id, ...rounds.map(r => r.round_id)).all();
    holes = results.map(r => {
      const hole = rowFromSql(SHEETS.HOLES, r);
      delete hole.user_id;
      hole.player_id = 'me';
      return hole;
    });
  }
  return { profile: publicProfile(friend), rounds, holes };
}
