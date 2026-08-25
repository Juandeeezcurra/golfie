const { makeBackend, makeClient, rowsOf } = require('../harness.js');

// Deja una ronda completa SÓLO en el celular (lo que pasó con Cañuelas).
function seedLocal(app, name, rid) {
  const r = { round_id: rid, user_id: app.getUserId(), date: new Date().toISOString(),
    course_name: name, tees: 'Blancos', slope_rating: 130, course_rating: 71,
    total_score: 90, par_total: 72, total_putts: 34, holes_played: 18, completed: true };
  app.saveRoundToLS(r);
  const holes = {};
  for (let i = 1; i <= 18; i++) holes[i] = { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2,
    fairway_hit: true, green_in_regulation: false, penalties: 0, up_and_down: false, sand_save: false };
  app.saveToLS('holes_' + rid, holes);
  app.saveToLS('clubs_' + rid, { Driver: { rating: 'bien', tags: ['Recto'] } });
  return r;
}

module.exports = async function (ok) {
console.log('\n1) Ronda normal: todo llega al Sheet');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const rid = 'r-ok-1';
  const r = { round_id: rid, date: '2026-08-20', course_name: 'Olivos', tees: 'Blancos',
              slope_rating: 130, course_rating: 71 };
  await app.postToSheets('addRound', r);
  for (let i = 1; i <= 3; i++) await app.postToSheets('addHole', { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 });
  await app.postToSheets('updateRound', { ...r, total_score: 88, holes_played: 3, completed: true });
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'la ronda está en Rounds');
  ok(rowsOf(b.ss, 'Holes').length === 3, 'los 3 hoyos están en Holes');
  ok(rowsOf(b.ss, 'Rounds')[0].total_score === 88, 'el score final se guardó');
  ok(app.queueGet().length === 0, 'la cola quedó vacía');
}

console.log('\n2) Cañuelas: ronda que quedó sólo en el celular');
{
  const b = makeBackend(); const { app } = makeClient(b);
  seedLocal(app, 'Cañuelas', 'r-canuelas');
  ok(rowsOf(b.ss, 'Rounds').length === 0, 'arranca ausente del Sheet');
  await app.syncFromServer();
  const rounds = rowsOf(b.ss, 'Rounds');
  ok(rounds.length === 1 && rounds[0].course_name === 'Cañuelas', 'reconcile la subió al Sheet');
  ok(rounds[0].total_score === 90, 'con el score correcto');
  ok(rowsOf(b.ss, 'Holes').length === 18, 'los 18 hoyos también subieron');
  ok(rowsOf(b.ss, 'ClubFeedback').length === 1, 'el feedback de palos también');
  ok(app.queueGet().length === 0, 'la cola quedó vacía');
}

console.log('\n3) Reconciliar de nuevo no duplica nada');
{
  const b = makeBackend(); const { app } = makeClient(b);
  seedLocal(app, 'Cañuelas', 'r-canuelas');
  await app.syncFromServer();
  await app.syncFromServer();
  await app.syncFromServer();
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'sigue habiendo 1 sola ronda');
  ok(rowsOf(b.ss, 'Holes').length === 18, 'siguen siendo 18 hoyos');
  ok(rowsOf(b.ss, 'ClubFeedback').length === 1, 'sigue habiendo 1 feedback');
}

console.log('\n4) Carrera: guardar hoyos en paralelo no pierde ninguno');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const rid = 'r-race';
  await app.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Jockey', tees: 'Azules' });
  // 18 postToSheets sin await entre sí: es exactamente el patrón de saveHole()
  await Promise.all(Array.from({ length: 18 }, (_, i) =>
    app.postToSheets('addHole', { round_id: rid, hole_number: i + 1, par: 4, score: 4, putts: 2 })));
  await app.flushPending();
  ok(rowsOf(b.ss, 'Holes').length === 18, 'llegaron los 18 hoyos, sin perder ninguno');
  ok(app.queueGet().length === 0, 'la cola quedó vacía');
}

console.log('\n5) Sin señal: nada se pierde, se recupera al volver');
{
  const b = makeBackend();
  const offline = makeClient(b, { online: false });
  const rid = 'r-offline';
  await offline.app.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Cañuelas', tees: 'Blancos' });
  for (let i = 1; i <= 18; i++) await offline.app.postToSheets('addHole', { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 });
  ok(rowsOf(b.ss, 'Rounds').length === 0, 'sin red no llegó nada al Sheet');
  ok(offline.app.queueGet().length === 19, 'los 19 cambios quedaron en la cola');
  offline.net.offline = false;                 // vuelve la señal
  await offline.app.flushPending();
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'al volver la señal subió la ronda');
  ok(rowsOf(b.ss, 'Holes').length === 18, 'y los 18 hoyos');
  ok(offline.app.queueGet().length === 0, 'la cola se vació recién ahora');
}

console.log('\n6) POST que el navegador no deja leer (CORS)');
{
  const b = makeBackend(); const { app, net } = makeClient(b, { readable: false });
  const rid = 'r-cors';
  await app.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Pilar', tees: 'Blancos' });
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'el dato igual llegó (fallback no-cors)');
  ok(app.queueGet().length === 1, 'queda en la cola porque no hubo confirmación');
  await app.syncFromServer();
  ok(app.queueGet().length === 0, 'el sync confirma que ya está y limpia la cola');
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'sin duplicar la fila');
}

console.log('\n7) Aislamiento entre usuarios');
{
  const b = makeBackend();
  const yo = makeClient(b); const otro = makeClient(b);
  await yo.app.postToSheets('addRound', { round_id: 'r-mia', date: 'x', course_name: 'Olivos', tees: 'Blancos' });
  await otro.app.postToSheets('addRound', { round_id: 'r-suya', date: 'x', course_name: 'Palermo GC', tees: 'Rojos' });
  await yo.app.syncFromServer();
  const mias = yo.app.loadRounds().map(r => r.course_name);
  ok(mias.length === 1 && mias[0] === 'Olivos', 'sólo veo la mía, no la de Palermo GC');
  ok(rowsOf(b.ss, 'Rounds').length === 2, 'las dos siguen guardadas en el Sheet');
}

console.log('\n8) Borrar una ronda la saca del Sheet y no vuelve');
{
  const b = makeBackend(); const { app } = makeClient(b);
  seedLocal(app, 'Cañuelas', 'r-del');
  await app.syncFromServer();
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'la ronda está en el Sheet');
  await app.postToSheets('deleteRound', { round_id: 'r-del' });
  app.saveToLS('rounds', app.loadRounds().filter(r => r.round_id !== 'r-del'));
  app.saveToLS('holes_r-del', {}); app.saveToLS('clubs_r-del', {});
  ok(rowsOf(b.ss, 'Rounds').length === 0, 'se borró del Sheet');
  ok(rowsOf(b.ss, 'Holes').length === 0, 'sus hoyos también');
  await app.syncFromServer();
  ok(app.loadRounds().length === 0, 'y no volvió con el próximo sync');
}

};
