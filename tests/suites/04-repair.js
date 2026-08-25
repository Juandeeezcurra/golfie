const { makeBackend, makeClient, rowsOf } = require('../harness.js');

module.exports = async function (ok) {
console.log('\nE) Tu estado real: Palermo YA adoptada con tu código');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const uid = app.getUserId();
  const rounds = [];
  const mk = (rid, cancha) => {
    rounds.push({ round_id:rid, user_id:uid, date:'2026-08-20', course_name:cancha, tees:'Blancos',
      slope_rating:130, course_rating:71, total_score:90, par_total:72, holes_played:18, completed:true });
    const h = {}; for (let i=1;i<=18;i++) h[i]={round_id:rid,hole_number:i,par:4,score:5,putts:2};
    app.saveToLS('holes_'+rid, h);
  };
  for (let i=0;i<10;i++) mk('r-pal-'+i,'Palermo GC');
  mk('r-mia','Cañuelas');
  app.saveToLS('rounds', rounds);
  for (const r of rounds) {
    await app.postToSheets('addRound', r);
    for (let i=1;i<=18;i++) await app.postToSheets('addHole', { round_id:r.round_id, hole_number:i, par:4, score:5, putts:2 });
  }

  ok(app.orphanRounds().length === 0, 'la limpieza no las ve (ya tienen tu código) — por eso no salía el aviso');
  ok(rowsOf(b.ss,'Rounds').length === 11, 'el Sheet tiene las 11');

  const resumen = Object.fromEntries(app.coursesSummary().map(([c,n])=>[c,n.total]));
  ok(resumen['Palermo GC'] === 10 && resumen['Cañuelas'] === 1, 'reparar sí las lista: ' + JSON.stringify(resumen));

  app.__setCheckboxes(new Set(['Palermo GC']), true);
  app.applyRepair();
  await new Promise(r => setTimeout(r, 0));   // dejamos asentar el flush en vuelo
  await app.flushPending();

  ok(app.loadRounds().length === 1, 'en la app queda 1 sola ronda');
  ok(app.loadRounds()[0].course_name === 'Cañuelas', 'y es Cañuelas');
  const enSheet = rowsOf(b.ss,'Rounds').map(r=>r.course_name);
  ok(enSheet.length === 1 && enSheet[0] === 'Cañuelas', 'en el Sheet también quedó sólo Cañuelas');
  ok(rowsOf(b.ss,'Holes').length === 18, 'los hoyos de Palermo se borraron del Sheet');

  await app.syncFromServer();
  ok(app.loadRounds().length === 1, 'Palermo NO vuelve con el sync');
  ok(app.queueGet().length === 0, 'la cola quedó vacía');
}

console.log('\nF) Borrado a mano en el Sheet: reconcile lo resucita (por diseño)');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const uid = app.getUserId();
  const r = { round_id:'r-x', user_id:uid, date:'x', course_name:'Palermo GC', tees:'Blancos', total_score:90 };
  app.saveToLS('rounds', [r]);
  await app.postToSheets('addRound', r);
  ok(rowsOf(b.ss,'Rounds').length === 1, 'está en el Sheet');

  b.ss.getSheetByName('Rounds').deleteRow(2);          // lo borrás a mano
  ok(rowsOf(b.ss,'Rounds').length === 0, 'lo borraste a mano del Sheet');
  await app.syncFromServer();
  ok(rowsOf(b.ss,'Rounds').length === 1, 'volvió: sigue en el celular, así que reconcile lo sube de nuevo');

  // La forma correcta: borrar desde la app.
  app.__setCheckboxes(new Set(['Palermo GC']), true);
  app.applyRepair();
  await new Promise(r => setTimeout(r, 0));
  await app.flushPending();
  ok(rowsOf(b.ss,'Rounds').length === 0, 'borrado desde la app: se va de los dos lados');
  await app.syncFromServer();
  ok(rowsOf(b.ss,'Rounds').length === 0, 'y ahora sí no vuelve');
}

};
