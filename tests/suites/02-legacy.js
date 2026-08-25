const { makeBackend, makeClient, rowsOf } = require('../harness.js');

module.exports = async function (ok) {
console.log('\n9) Filas viejas sin dueño: se adoptan a mano, nunca solas');
{
  const b = makeBackend(); const { app } = makeClient(b);
  const sh = b.ss.insertSheet('Rounds');
  sh.getRange(1,1,1,16).setValues([['round_id','date','course_name','tees','slope_rating',
    'course_rating','hcp_index','weather','total_score','par_total','total_putts',
    'fairways_hit','greens_in_regulation','holes_played','completed','user_id']]);
  sh.appendRow(['r-vieja','2026-05-01','Olivos','Blancos',130,71,'','',85,72,32,8,6,18,true,'']);
  sh.appendRow(['r-palermo','2026-05-02','Palermo GC','Rojos',120,70,'','',99,72,40,2,1,18,true,'']);

  // El celular tiene las dos: la tuya vieja y una de Palermo que entró por el sync viejo.
  app.saveToLS('rounds', [
    { round_id:'r-vieja', date:'2026-05-01', course_name:'Olivos', tees:'Blancos', total_score:85, holes_played:18, completed:true },
    { round_id:'r-palermo', date:'2026-05-02', course_name:'Palermo GC', tees:'Rojos', total_score:99, holes_played:18, completed:true }
  ]);

  await app.syncFromServer();
  ok(app.queueGet().length === 0, 'el sync no encoló nada por su cuenta');
  ok(rowsOf(b.ss,'Rounds').every(r => r.user_id === ''), 'ninguna fila del Sheet se firmó sola');
  ok(app.orphanRounds().length === 2, 'las 2 quedan marcadas como sin identificar');

  // Ahora decidís: Olivos es tuya, Palermo no.
  app.__setCheckboxes(new Set(['Olivos']));
  app.applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await app.flushPending();

  const filas = rowsOf(b.ss,'Rounds');
  const vieja = filas.find(r => r.round_id === 'r-vieja');
  ok(filas.length === 1, 'en el Sheet quedó 1 sola fila');
  ok(vieja && vieja.user_id === app.getUserId(), 'Olivos quedó firmada como tuya, sin duplicarse');
  ok(!filas.find(r => r.round_id === 'r-palermo'), 'la de Palermo GC se borró del Sheet');

  await app.syncFromServer();
  const enApp = app.loadRounds().map(r => r.course_name);
  ok(enApp.length === 1 && enApp[0] === 'Olivos', 'en la app queda sólo Olivos');
  ok(app.orphanRounds().length === 0, 'no quedan rondas sin identificar');
}
};
