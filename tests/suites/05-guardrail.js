const { makeBackend, makeClient, rowsOf } = require('../harness.js');

// El freno que faltaba cuando reconcile subió 210 registros en silencio.
module.exports = async function (ok) {

console.log('  freno de subida masiva');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const uid = app.getUserId();
  const rounds = [];
  for (let i = 0; i < 10; i++) {
    const rid = 'r-' + i;
    rounds.push({ round_id: rid, user_id: uid, date: '2026-08-20', course_name: 'Palermo GC',
      tees: 'Blancos', total_score: 90, holes_played: 18, completed: true });
    const h = {};
    for (let n = 1; n <= 18; n++) h[n] = { round_id: rid, hole_number: n, par: 4, score: 5, putts: 2 };
    app.saveToLS('holes_' + rid, h);
  }
  app.saveToLS('rounds', rounds);

  await app.syncFromServer();
  ok(app.queueGet().length === 0, 'no encoló nada solo: son más de ' + app.RECONCILE_LIMIT + ' registros');
  ok(rowsOf(b.ss, 'Rounds').length === 0, 'no tocó el Sheet sin permiso');
  ok((app.loadFromLS('reconcile_hold') || []).length > app.RECONCILE_LIMIT, 'quedaron esperando tu visto bueno');

  app.applyHold();                                  // das el OK explícito
  await new Promise(r => setTimeout(r, 0));
  await app.flushPending();
  ok(rowsOf(b.ss, 'Rounds').length === 10, 'recién ahí sube');
  ok((app.loadFromLS('reconcile_hold') || []).length === 0, 'y la espera se limpia');
}

console.log('  recuperar una ronda suelta no molesta');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const uid = app.getUserId();
  const rid = 'r-una';
  app.saveToLS('rounds', [{ round_id: rid, user_id: uid, date: 'x', course_name: 'Cañuelas',
    tees: 'Blancos', total_score: 90, holes_played: 18, completed: true }]);
  const h = {};
  for (let n = 1; n <= 18; n++) h[n] = { round_id: rid, hole_number: n, par: 4, score: 5, putts: 2 };
  app.saveToLS('holes_' + rid, h);

  await app.syncFromServer();
  ok((app.loadFromLS('reconcile_hold') || []).length === 0, 'no frena una ronda sola');
  ok(rowsOf(b.ss, 'Rounds').length === 1, 'la sube sin preguntar, como debe');
  ok(rowsOf(b.ss, 'Holes').length === 18, 'con sus 18 hoyos');
}
};
