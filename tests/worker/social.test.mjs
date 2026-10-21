import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, get, post, rowsOf } from './helpers.mjs';

const ANA = 'u-anaanaana1', LEO = 'u-leoleoleo2', ZED = 'u-zedzedzed3';

async function setup() {
  const env = makeEnv();
  await post(env, 'saveProfile', { user_id: ANA, username: 'Ana_G', display_name: 'Ana' });
  await post(env, 'saveProfile', { user_id: LEO, username: 'leo', display_name: 'Leo' });
  return env;
}

async function connect(env, a = ANA, b = LEO, bName = 'ana_g', aName = 'leo') {
  await post(env, 'requestFriend', { user_id: a, username: aName });
  return post(env, 'respondFriend', { user_id: b, username: bName, accept: true });
}

test('crear perfil: el usuario se normaliza y es único', async () => {
  const env = makeEnv();
  const ok = await post(env, 'saveProfile', { user_id: ANA, username: '@Ana_G', display_name: 'Ana' });
  assert.equal(ok.ok, true);
  assert.equal(ok.result.username, 'ana_g');
  const dup = await post(env, 'saveProfile', { user_id: LEO, username: 'ANA_G', display_name: 'Leo' });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /en uso/);
});

test('usuarios inválidos y códigos inválidos se rechazan', async () => {
  const env = makeEnv();
  assert.equal((await post(env, 'saveProfile', { user_id: ANA, username: 'a b', display_name: 'x' })).ok, false);
  assert.equal((await post(env, 'saveProfile', { user_id: ANA, username: 'ab', display_name: 'x' })).ok, false);
  assert.equal((await post(env, 'saveProfile', { user_id: 'cualquiera', username: 'anaana' })).ok, false);
});

test('editar el perfil propio no choca con el propio usuario', async () => {
  const env = await setup();
  const r = await post(env, 'saveProfile', { user_id: ANA, username: 'ana_g', display_name: 'Ana García' });
  assert.equal(r.ok, true);
  assert.equal((await get(env, 'getSocial', { user_id: ANA })).profile.display_name, 'Ana García');
});

test('buscar: por prefijo, sin uno mismo, y sin exponer códigos de usuario', async () => {
  const env = await setup();
  const found = await get(env, 'searchProfiles', { user_id: LEO, q: 'ana' });
  assert.equal(found.length, 1);
  assert.equal(found[0].username, 'ana_g');
  assert.equal(found[0].relation, 'none');
  assert.ok(!JSON.stringify(found).includes(ANA), 'no se filtra el user_id');
  assert.deepEqual(await get(env, 'searchProfiles', { user_id: LEO, q: 'leo' }), [], 'no te encontrás a vos');
  assert.deepEqual(await get(env, 'searchProfiles', { user_id: LEO, q: 'an' }), [], 'mínimo 3 letras');
});

test('buscar requiere tener perfil', async () => {
  const env = await setup();
  const r = await get(env, 'searchProfiles', { user_id: ZED, q: 'ana' });
  assert.match(r.error, /perfil/);
});

test('el guión bajo del usuario no funciona como comodín', async () => {
  const env = await setup();
  await post(env, 'saveProfile', { user_id: ZED, username: 'anaxg', display_name: 'X' });
  const found = await get(env, 'searchProfiles', { user_id: LEO, q: 'ana_g' });
  assert.deepEqual(found.map(p => p.username), ['ana_g']);
});

test('solicitud: queda pendiente, el otro la ve y al aceptar son amigos', async () => {
  const env = await setup();
  await post(env, 'requestFriend', { user_id: ANA, username: 'leo' });
  const leo = await get(env, 'getSocial', { user_id: LEO });
  assert.deepEqual(leo.incoming.map(p => p.username), ['ana_g']);
  assert.deepEqual((await get(env, 'getSocial', { user_id: ANA })).outgoing.map(p => p.username), ['leo']);
  assert.equal((await get(env, 'searchProfiles', { user_id: ANA, q: 'leo' }))[0].relation, 'sent');
  assert.equal((await get(env, 'searchProfiles', { user_id: LEO, q: 'ana' }))[0].relation, 'received');

  await post(env, 'respondFriend', { user_id: LEO, username: 'ana_g', accept: true });
  assert.deepEqual((await get(env, 'getSocial', { user_id: ANA })).friends.map(p => p.username), ['leo']);
  assert.deepEqual((await get(env, 'getSocial', { user_id: LEO })).friends.map(p => p.username), ['ana_g']);
});

test('rechazar borra la solicitud; sólo el destinatario puede responder', async () => {
  const env = await setup();
  await post(env, 'requestFriend', { user_id: ANA, username: 'leo' });
  const self = await post(env, 'respondFriend', { user_id: ANA, username: 'leo', accept: true });
  assert.equal(self.ok, false, 'quien envió no puede aceptar su propia solicitud');
  await post(env, 'respondFriend', { user_id: LEO, username: 'ana_g', accept: false });
  assert.equal(rowsOf(env, 'friendships').length, 0);
});

test('si los dos se invitan, quedan conectados sin duplicar filas', async () => {
  const env = await setup();
  await post(env, 'requestFriend', { user_id: ANA, username: 'leo' });
  await post(env, 'requestFriend', { user_id: LEO, username: 'ana_g' });
  assert.equal(rowsOf(env, 'friendships').length, 1);
  assert.equal(rowsOf(env, 'friendships')[0].status, 'accepted');
});

test('no se puede invitar a uno mismo ni a quien no existe', async () => {
  const env = await setup();
  assert.equal((await post(env, 'requestFriend', { user_id: ANA, username: 'ana_g' })).ok, false);
  assert.equal((await post(env, 'requestFriend', { user_id: ANA, username: 'nadie' })).ok, false);
});

test('dejar de ser amigos (o cancelar) funciona desde cualquiera de los dos lados', async () => {
  const env = await setup();
  await connect(env);
  await post(env, 'removeFriend', { user_id: LEO, username: 'ana_g' });
  assert.deepEqual((await get(env, 'getSocial', { user_id: ANA })).friends, []);
});

async function seedRounds(env, userId) {
  await post(env, 'addRound', { user_id: userId, round_id: 'r-1', date: '2026-10-10T10:00:00Z', course_name: 'Olivos', tees: 'Blancos', slope_rating: 130, course_rating: 71, weather: 'Lluvia' });
  await post(env, 'addHole', { user_id: userId, round_id: 'r-1', hole_number: 1, par: 4, score: 5, putts: 2 });
  await post(env, 'addHole', { user_id: userId, round_id: 'r-1', hole_number: 1, player_id: 'p-pinte', par: 4, score: 9, putts: 3 });
  await post(env, 'updateRound', { user_id: userId, round_id: 'r-1', total_score: 90, par_total: 72, completed: true });
  await post(env, 'addRound', { user_id: userId, round_id: 'r-2', date: '2026-10-11T10:00:00Z', course_name: 'Olivos', tees: 'Blancos' });
  await post(env, 'addRound', { user_id: userId, round_id: 'r-3', date: '2026-10-12T10:00:00Z', course_name: 'Equipos', tees: 'Blancos', format: 'scramble' });
  await post(env, 'updateRound', { user_id: userId, round_id: 'r-3', total_score: 80, par_total: 72, completed: true, format: 'scramble' });
}

test('datos de un amigo: sólo rondas terminadas, sin scramble, y sin datos privados', async () => {
  const env = await setup();
  await seedRounds(env, LEO);
  await connect(env);
  const data = await get(env, 'getFriendData', { user_id: ANA, username: 'leo' });
  assert.equal(data.profile.username, 'leo');
  assert.deepEqual(data.rounds.map(r => r.round_id), ['r-1'], 'ni la en curso ni el scramble');
  assert.equal(data.holes.length, 1, 'sólo su tarjeta, no la de otros jugadores');
  assert.equal(data.holes[0].score, 5);
  const text = JSON.stringify(data);
  assert.ok(!text.includes(LEO) && !text.includes(ANA), 'no se filtra ningún código de usuario');
  assert.ok(!('weather' in data.rounds[0]));
});

test('sin ser amigos (o con solicitud pendiente) no se ve nada', async () => {
  const env = await setup();
  await seedRounds(env, LEO);
  assert.match((await get(env, 'getFriendData', { user_id: ANA, username: 'leo' })).error, /amigos/);
  await post(env, 'requestFriend', { user_id: ANA, username: 'leo' });
  assert.match((await get(env, 'getFriendData', { user_id: ANA, username: 'leo' })).error, /amigos/);
  assert.match((await get(env, 'getFriendData', { user_id: ZED, username: 'leo' })).error, /perfil/);
});

test('al borrar el perfil se cortan las amistades y deja de aparecer', async () => {
  const env = await setup();
  await connect(env);
  await post(env, 'deleteProfile', { user_id: LEO });
  assert.deepEqual((await get(env, 'getSocial', { user_id: ANA })).friends, []);
  assert.deepEqual(await get(env, 'searchProfiles', { user_id: ANA, q: 'leo' }), []);
});

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/';

test('los nombres de usuario son únicos aunque cambie el uso de mayúsculas o el @', async () => {
  const env = await setup();
  for (const variant of ['ANA_G', '@ana_g', 'Ana_G', ' ana_g ']) {
    const r = await post(env, 'saveProfile', { user_id: ZED, username: variant, display_name: 'Otro' });
    assert.equal(r.ok, false, `"${variant}" ya está tomado`);
  }
  assert.equal(rowsOf(env, 'profiles').length, 2);
  // ...y la base lo garantiza aunque falle el chequeo de la app.
  assert.throws(() => env.DB.db.prepare("INSERT INTO profiles (user_id, username) VALUES ('u-otro123456', 'leo')").run());
});

test('foto de perfil: se guarda, se conserva al editar y se puede quitar', async () => {
  const env = await setup();
  const ok = await post(env, 'saveProfile', { user_id: ANA, username: 'ana_g', display_name: 'Ana', avatar: JPEG });
  assert.equal(ok.ok, true);
  await post(env, 'saveProfile', { user_id: ANA, username: 'ana_g', display_name: 'Ana G' });
  assert.equal((await get(env, 'getSocial', { user_id: ANA })).profile.avatar, JPEG, 'editar el nombre no borra la foto');
  await post(env, 'saveProfile', { user_id: ANA, username: 'ana_g', display_name: 'Ana G', avatar: '' });
  assert.equal((await get(env, 'getSocial', { user_id: ANA })).profile.avatar, '');
});

test('foto de perfil: sólo se aceptan JPEG chicos en base64', async () => {
  const env = await setup();
  const bad = [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:text/html;base64,PHNjcmlwdD4=',
    'https://example.com/foto.jpg',
    'data:image/jpeg;base64,AAAA" onerror="alert(1)',
    JPEG + 'A'.repeat(70000),
  ];
  for (const avatar of bad) {
    const r = await post(env, 'saveProfile', { user_id: ANA, username: 'ana_g', display_name: 'Ana', avatar });
    assert.equal(r.ok, false);
  }
  assert.equal((await get(env, 'getSocial', { user_id: ANA })).profile.avatar, '');
});

test('la foto les llega a los amigos: lista, búsqueda y ficha', async () => {
  const env = await setup();
  await post(env, 'saveProfile', { user_id: LEO, username: 'leo', display_name: 'Leo', avatar: JPEG });
  assert.equal((await get(env, 'searchProfiles', { user_id: ANA, q: 'leo' }))[0].avatar, JPEG);
  await post(env, 'requestFriend', { user_id: ANA, username: 'leo' });
  assert.equal((await get(env, 'getSocial', { user_id: LEO })).incoming[0].avatar, '');
  await post(env, 'respondFriend', { user_id: LEO, username: 'ana_g', accept: true });
  assert.equal((await get(env, 'getSocial', { user_id: ANA })).friends[0].avatar, JPEG);
  assert.equal((await get(env, 'getFriendData', { user_id: ANA, username: 'leo' })).profile.avatar, JPEG);
});
