const { makeBackend, makeClient, rowsOf } = require('../harness.js');

// Reproduce el estado real del celular: rondas ajenas y propias, todas sin
// user_id, ya guardadas en localStorage por los syncs viejos.
function seedEstadoReal(app) {
  const rounds = [];
  const mk = (rid, cancha) => {
    rounds.push({ round_id: rid, date:'2026-08-20', course_name: cancha, tees:'Blancos',
      slope_rating:130, course_rating:71, total_score:90, par_total:72, holes_played:18, completed:true });
    const holes = {};
    for (let i=1;i<=18;i++) holes[i] = { round_id:rid, hole_number:i, par:4, score:5, putts:2 };
    app.saveToLS('holes_'+rid, holes);
  };
  for (let i=0;i<10;i++) mk('r-palermo-'+i, 'Palermo GC');   // ajenas
  mk('r-mia-1', 'Olivos');                                    // tuya, vieja
  mk('r-mia-2', 'Cañuelas');                                  // tuya, vieja
  app.saveToLS('rounds', rounds);
}

module.exports = async function (ok) {
console.log('\nA) reconcile ya no adopta rondas sin dueño');
{
  const b = makeBackend(); const { app } = makeClient(b);
  seedEstadoReal(app);
  await app.syncFromServer();
  ok(app.queueGet().length === 0, 'no encoló nada (antes eran 200+ ítems)');
  ok(rowsOf(b.ss,'Rounds').length === 0, 'no subió ninguna Palermo al Sheet');
}

console.log('\nB) La cola envenenada se purga al arrancar');
{
  const b = makeBackend(); const { app, store } = makeClient(b);
  seedEstadoReal(app);
  // Simulamos los 210 pendientes que dejó la versión anterior.
  const cola = [];
  app.loadRounds().forEach(r => {
    cola.push({ id:'q'+cola.length, endpoint:'addRound', data:{ ...r, user_id: app.getUserId() }, ts:1 });
    for (let i=1;i<=18;i++) cola.push({ id:'q'+cola.length, endpoint:'addHole',
      data:{ round_id:r.round_id, hole_number:i, par:4, score:5, putts:2, user_id: app.getUserId() }, ts:1 });
  });
  app.saveToLS('pending_sync', cola);
  ok(app.queueGet().length === 228, 'arranca con ' + app.queueGet().length + ' pendientes');
  const sacados = app.purgeOrphanQueue();
  ok(sacados === 228, 'purgeOrphanQueue sacó los ' + sacados + ' de rondas sin dueño');
  ok(app.queueGet().length === 0, 'la cola quedó vacía sin subir nada');
  ok(rowsOf(b.ss,'Rounds').length === 0, 'el Sheet quedó limpio');
}

console.log('\nC) Limpieza: marco Olivos y Cañuelas como mías, Palermo no');
{
  const b = makeBackend(); const { app } = makeClient(b, { checked: ['Olivos','Cañuelas'] });
  seedEstadoReal(app);
  ok(app.orphanRounds().length === 12, 'detecta las 12 rondas sin identificar');

  // Simula el modal: tildar sólo Olivos y Cañuelas.
  const marcadas = new Set(['Olivos','Cañuelas']);
  app.__setCheckboxes(marcadas);
  app.applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await app.flushPending();

  const nombres = app.loadRounds().map(r => r.course_name).sort();
  ok(nombres.length === 2, 'quedan 2 rondas en la app: ' + nombres.join(', '));
  ok(!nombres.includes('Palermo GC'), 'Palermo GC desapareció de la app');
  ok(app.orphanRounds().length === 0, 'ya no hay rondas sin identificar');

  const enSheet = rowsOf(b.ss,'Rounds').map(r => r.course_name).sort();
  ok(enSheet.length === 2 && !enSheet.includes('Palermo GC'), 'al Sheet subieron sólo las tuyas: ' + enSheet.join(', '));
  ok(rowsOf(b.ss,'Holes').length === 36, 'con sus 36 hoyos (18 x 2)');

  await app.syncFromServer();
  const despues = app.loadRounds().map(r => r.course_name).sort();
  ok(despues.length === 2 && !despues.includes('Palermo GC'), 'y Palermo no vuelve con el sync');
}

console.log('\nD) Palermo ya subido al Sheet se borra también de ahí');
{
  const b = makeBackend(); const { app } = makeClient(b);
  seedEstadoReal(app);
  // Simulamos el daño ya hecho: Palermo subida con tu código.
  for (const r of app.loadRounds().filter(r => r.course_name === 'Palermo GC'))
    await app.postToSheets('addRound', r);
  ok(rowsOf(b.ss,'Rounds').length === 10, 'el Sheet tiene las 10 Palermo firmadas con tu código');

  app.__setCheckboxes(new Set(['Olivos','Cañuelas']));
  app.applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await app.flushPending();
  const enSheet = rowsOf(b.ss,'Rounds').map(r => r.course_name);
  ok(!enSheet.includes('Palermo GC'), 'se borraron del Sheet');
  ok(enSheet.length === 2, 'y quedaron sólo las tuyas');
}

};
