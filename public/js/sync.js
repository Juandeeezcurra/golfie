// ============================================================
// GOLFIE — SINCRONIZACIÓN (CÓDIGO SAGRADO)
// ============================================================
// Invariantes que no se pueden romper (ver tests/README.md):
//   1. Nada sale de la cola sin confirmación del servidor.
//   2. Toda escritura es idempotente (upserts): reenviar nunca duplica.
//   3. "Sin user_id" NO es "mío".
//   4. El servidor nunca devuelve filas sin dueño.
//   5. Nada masivo en silencio: por encima de RECONCILE_LIMIT se pide permiso.
//   6. El celular es la fuente de verdad de qué rondas existen.
//
// Es una factory y no un módulo con estado global para que los tests puedan
// levantar dos clientes independientes contra el mismo backend.
// ============================================================

// Por encima de esto, reconcile no sube nada solo: pregunta primero.
// Un bug que confunda de quién son los datos puede querer subir cientos de
// registros de golpe, y eso tiene que ser visible antes de tocar el servidor,
// no después. Una ronda entera son ~20 registros, así que el límite deja
// pasar la recuperación normal de una o dos rondas.
export const RECONCILE_LIMIT = 40;

export function createSync({
  store,
  fetchFn,
  navigatorRef = { onLine: true },
  apiUrl = '/api',
  onQueueChange = () => {},
  onDataChange = () => {},
  onStatus = () => {},
  onToast = () => {},
}) {
  let lastSyncError = '';
  let flushing = false;

  // ---------- COLA ----------

  function newQueueId() {
    return 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function queueGet() {
    const q = store.loadFromLS('pending_sync') || [];
    let changed = false;
    q.forEach(it => { if (!it.id) { it.id = newQueueId(); changed = true; } });
    if (changed) store.saveToLS('pending_sync', q);
    return q;
  }

  // Identifica la escritura para poder deduplicarla.
  function queueKey(endpoint, d) {
    if (endpoint === 'addHole') return [endpoint, d.round_id, d.player_id || 'me', d.hole_number ?? ''].join('|');
    if (endpoint === 'savePlayer') return [endpoint, d.player_id || ''].join('|');
    if (endpoint === 'addRoundPlayer') return [endpoint, d.round_id || '', d.player_id || ''].join('|');
    return [endpoint, d.round_id, d.hole_number != null ? d.hole_number : '', d.club || ''].join('|');
  }

  // Saca de la cola SÓLO lo confirmado, releyendo lo que haya ahora. Antes se
  // pisaba la cola entera con un array viejo, y se perdía todo lo encolado
  // mientras el flush estaba en vuelo (guardar el hoyo 5 durante el flush del 4).
  function queueRemove(doneIds) {
    if (!doneIds.size) return;
    store.saveToLS('pending_sync', queueGet().filter(it => !doneIds.has(it.id)));
  }

  function enqueue(endpoint, data) {
    const q = queueGet();
    q.push({ id: newQueueId(), endpoint, data: { ...data, user_id: store.getUserId() }, ts: Date.now() });
    store.saveToLS('pending_sync', q);
  }

  // Tags de un palo como texto comparable (llegan como array o como "a,b").
  function clubTags(v) {
    return (Array.isArray(v) ? v : String(v || '').split(',')).filter(Boolean).map(String).sort().join(',');
  }

  function sameFields(a, b, fields) {
    return fields.every(key => {
      const fallback = key === 'format' ? 'stroke' : key === 'player_id' ? 'me' : '';
      const av = a && a[key] != null && a[key] !== '' ? a[key] : fallback;
      const bv = b && b[key] != null && b[key] !== '' ? b[key] : fallback;
      return String(av) === String(bv);
    });
  }

  async function postToSheets(endpoint, data) {
    try {
      const needsV3 = ['savePlayer', 'addRoundPlayer'].includes(endpoint) || (endpoint === 'addHole' && data.player_id && data.player_id !== 'me');
      if (needsV3 && await backendVersion() < 3) return false;
      enqueue(endpoint, data);
      onQueueChange();
      await flushPending();
    } catch (e) { console.warn('Sync error:', e); }
  }

  async function sendOne(item) {
    const body = JSON.stringify({ action: item.endpoint, ...item.data });
    try {
      const res = await fetchFn(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error((out && out.error) || 'respuesta inesperada');
      return true;
    } catch (e) {
      if (!navigatorRef.onLine) throw e;
      // El navegador puede impedirnos leer la respuesta. Mandamos a ciegas y lo
      // dejamos en la cola: las escrituras son idempotentes, así que reenviar no
      // duplica nada, y reconcile() confirma después si efectivamente llegó.
      try { await fetchFn(apiUrl, { method: 'POST', mode: 'no-cors', body }); } catch {}
      throw new Error('sin confirmación: ' + e.message);
    }
  }

  async function flushPending() {
    if (flushing) return;   // un solo flush a la vez: dos en paralelo se pisaban la cola
    flushing = true;
    try {
      let guard = 0;
      while (queueGet().length && guard++ < 50) {
        const done = new Set();
        let stalled = false;
        for (const item of queueGet()) {
          try { await sendOne(item); done.add(item.id); }
          catch (e) {
            console.warn('Queda pendiente:', item.endpoint, e.message);
            lastSyncError = item.endpoint + ': ' + e.message;
            stalled = true;
            break;          // preservamos el orden: si uno no entra, el resto espera
          }
        }
        queueRemove(done);
        if (stalled) break;
      }
    } finally {
      flushing = false;
      onQueueChange();
    }
  }

  function clearQueue() {
    store.saveToLS('pending_sync', []);
    onQueueChange();
    // Seguro: reconcile vuelve a encolar lo que sea tuyo y falte en el servidor.
    onToast('Cola vaciada', 2500);
  }

  // ---------- RONDAS SIN DUEÑO ----------
  // Rondas que quedaron en el celular sin user_id: pueden ser tuyas (previas al
  // código) o ajenas (entraron por el sync viejo, que traía todo).
  // No hay forma de distinguirlas automáticamente, así que decide el usuario.

  function orphanRounds() {
    const uid = store.getUserId();
    return store.loadRounds().filter(r => r.round_id && String(r.user_id || '').trim() !== uid);
  }

  function purgeQueueForRound(rid) {
    store.saveToLS('pending_sync', queueGet().filter(it => String((it.data || {}).round_id) !== String(rid)));
  }

  // Al arrancar sacamos de la cola todo lo que pertenezca a rondas sin dueño:
  // nunca debieron encolarse.
  function purgeOrphanQueue() {
    const orphans = new Set(orphanRounds().map(r => String(r.round_id)));
    if (!orphans.size) return 0;
    const antes = queueGet().length;
    store.saveToLS('pending_sync', queueGet().filter(it => !orphans.has(String((it.data || {}).round_id))));
    return antes - queueGet().length;
  }

  // Canchas presentes en el celular, con cuántas rondas y cuántas sin dueño.
  function coursesSummary() {
    const uid = store.getUserId();
    const m = {};
    store.loadRounds().forEach(r => {
      const c = r.course_name || '—';
      m[c] = m[c] || { total: 0, orphan: 0 };
      m[c].total++;
      if (String(r.user_id || '').trim() !== uid) m[c].orphan++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }

  // ---------- DIAGNÓSTICO ----------
  // Prueba la conexión de verdad, contra el backend real, y devuelve qué pasa.
  // El POST de prueba usa deleteRound con un id inexistente: no escribe nada.
  async function diagnose() {
    const out = [];
    try {
      const t0 = Date.now();
      const res = await fetchFn(apiUrl + '?action=ping');
      const j = await res.json();
      out.push('Lectura: OK · backend v' + ((j && j.v) || '?') + ' · ' + (Date.now() - t0) + 'ms');
    } catch (e) { out.push('Lectura: FALLA · ' + e.message); }

    try {
      const t0 = Date.now();
      const res = await fetchFn(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteRound', round_id: '__diagnostico__', user_id: store.getUserId() }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      out.push('Escritura: ' + (j && j.ok ? 'OK, confirmada' : 'responde pero sin ok') + ' · ' + (Date.now() - t0) + 'ms');
    } catch (e) { out.push('Escritura: SIN CONFIRMAR · ' + e.message); }

    return out;
  }

  // El backend viejo sólo hacía append: reconciliar contra él duplicaría filas.
  // Por eso sólo reconciliamos si responde v>=2.
  async function backendVersion() {
    try {
      const res = await fetchFn(apiUrl + '?action=ping');
      const out = await res.json();
      return (out && out.v) || 0;
    } catch { return 0; }
  }

  // ---------- RECONCILIACIÓN ----------
  // Red de seguridad. Compara lo que hay en el celular contra lo que hay en el
  // servidor y reencola lo que falte. Es lo que recupera una ronda perdida
  // porque se cortó la señal en la cancha o porque la cola se vació de más.
  function reconcile(srvRounds, srvHoles, srvCF, srvPlayers = [], srvRoundPlayers = {}, supportsPlayers = false) {
    const uid = store.getUserId();
    const onServer = new Set(srvRounds.map(r => String(r.round_id)));
    const serverRoundById = new Map(srvRounds.map(r => [String(r.round_id), r]));
    const yaEnCola = new Set(queueGet().map(it => queueKey(it.endpoint, it.data || {})));
    const propuesta = [];

    // Propone, no encola. Quien llama decide si es una cantidad razonable.
    const add = (endpoint, data) => {
      const k = queueKey(endpoint, data);
      if (yaEnCola.has(k)) return;      // ya está esperando, no la proponemos dos veces
      yaEnCola.add(k);
      propuesta.push({ endpoint, data });
    };

    store.loadRounds().forEach(r => {
      if (!r.round_id) return;
      // Propiedad exacta. Una ronda sin user_id NO es mía: las que se colaron
      // de otra gente también están sin dueño en el celular, y adoptarlas las
      // subía al servidor firmadas con mi código. Se resuelven a mano.
      if (String(r.user_id || '').trim() !== uid) return;
      const rid = String(r.round_id);
      const roundFields = ['course_name', 'tees', 'course_id', 'tee_id', 'course_holes_count', 'slope_rating', 'course_rating', 'hcp_index'];
      if (supportsPlayers) roundFields.push('format');

      if (!onServer.has(rid)) {
        add('addRound', r);
        if (r.total_score !== null && r.total_score !== undefined && r.total_score !== '') {
          add('updateRound', r);
        }
      } else if (!sameFields(serverRoundById.get(rid), r, roundFields)) {
        add('addRound', r);
      }

      const holesLocal = store.loadHoles(rid);
      const holesSrv = srvHoles[rid] || {};
      const holesSrvMe = holesSrv.me || holesSrv;
      Object.values(holesLocal).forEach(h => {
        if (!h || h.hole_number === null || h.hole_number === undefined) return;
        const remote = holesSrvMe[h.hole_number];
        const fields = ['par', 'score', 'putts', 'fairway_hit', 'green_in_regulation', 'penalties', 'up_and_down', 'sand_save'];
        if (supportsPlayers) fields.push('stroke_index', 'hole_length');
        if (!remote || !sameFields(remote, h, fields)) add('addHole', { ...h, player_id: 'me', round_id: rid });
      });

      if (supportsPlayers) store.loadRoundPlayers(rid).forEach(player => {
        const pid = player.player_id;
        if (!pid) return;
        const remote = (srvRoundPlayers[rid] || {})[pid];
        if (!remote || !sameFields(remote, player, ['team_id', 'playing_handicap'])) add('addRoundPlayer', { ...player, round_id: rid });
      });

      if (supportsPlayers) store.loadRoundPlayers(rid).forEach(player => {
        const pid = player.player_id;
        if (!pid || pid === 'me') return;
        const playerHoles = store.loadHoles(rid, pid);
        const serverPlayerHoles = holesSrv[pid] || {};
        Object.values(playerHoles).forEach(h => {
          if (!h || h.hole_number == null) return;
          const remote = serverPlayerHoles[h.hole_number];
          const fields = ['par', 'score', 'putts', 'fairway_hit', 'green_in_regulation', 'penalties', 'up_and_down', 'sand_save', 'stroke_index', 'hole_length'];
          if (!remote || !sameFields(remote, h, fields)) add('addHole', { ...h, player_id: pid, round_id: rid });
        });
      });

      const clubsLocal = store.loadClubs(rid);
      const clubsSrv = srvCF[rid] || {};
      Object.entries(clubsLocal).forEach(([club, fb]) => {
        if (!fb) return;
        const remote = clubsSrv[club];
        const mine = { rating: fb.rating || '', tags: clubTags(fb.tags) };
        // Sin nada que decir y nada en el servidor: no hay qué subir. Si el
        // servidor ya tiene exactamente esto, tampoco. Si difiere (una
        // corrección de palos, incluso borrar un semáforo), se sube.
        if (remote === undefined ? (!mine.rating && !mine.tags)
          : (remote.rating || '') === mine.rating && clubTags(remote.tags) === mine.tags) return;
        add('addClubFeedback', { round_id: rid, club, rating: mine.rating, tags: (fb.tags || []).join(',') });
      });
    });

    if (supportsPlayers) {
      const serverPlayerById = new Map(srvPlayers.map(p => [String(p.player_id), p]));
      store.loadPlayers().forEach(p => {
        if (!p.player_id || p.player_id === 'me') return;
        const remote = serverPlayerById.get(String(p.player_id));
        if (!remote || !sameFields(remote, p, ['name', 'handicap_index'])) add('savePlayer', p);
      });
    }

    return propuesta;
  }

  // Lo que el servidor ya tiene confirmado sale de la cola, así no se reenvía
  // para siempre cuando el navegador no nos deja leer la respuesta del POST.
  function pruneQueue(srvRounds, srvHoles, srvCF, srvPlayers = [], srvRoundPlayers = {}, supportsPlayers = false) {
    const byId = {};
    srvRounds.forEach(r => byId[String(r.round_id)] = r);
    const drop = new Set();

    queueGet().forEach(it => {
      const d = it.data || {};
      const rid = String(d.round_id);
      const sr = byId[rid];
      const roundFields = ['course_name', 'tees', 'course_id', 'tee_id', 'course_holes_count', 'slope_rating', 'course_rating', 'hcp_index'];
      if (supportsPlayers) roundFields.push('format');
      if (it.endpoint === 'addRound' && sr && sameFields(sr, d, roundFields)) drop.add(it.id);
      if (it.endpoint === 'updateRound' && sr &&
          sr.total_score !== '' && sr.total_score !== null && sr.total_score !== undefined &&
          Number(sr.total_score) === Number(d.total_score)) drop.add(it.id);
      const holesForRound = srvHoles[rid] || {};
      const playerHoles = holesForRound[d.player_id || 'me'] || holesForRound;
      const holeFields = ['par', 'score', 'putts', 'fairway_hit', 'green_in_regulation', 'penalties', 'up_and_down', 'sand_save'];
      if (supportsPlayers) holeFields.push('stroke_index', 'hole_length');
      if (it.endpoint === 'addHole' && playerHoles[d.hole_number] && sameFields(playerHoles[d.hole_number], d, holeFields)) drop.add(it.id);
      const remoteClub = (srvCF[rid] || {})[d.club];
      if (it.endpoint === 'addClubFeedback' && remoteClub !== undefined
          && (remoteClub.rating || '') === (d.rating || '') && clubTags(remoteClub.tags) === clubTags(d.tags)) drop.add(it.id);
      const remotePlayer = srvPlayers.find(p => String(p.player_id) === String(d.player_id));
      if (it.endpoint === 'savePlayer' && remotePlayer && sameFields(remotePlayer, d, ['name', 'handicap_index'])) drop.add(it.id);
      const remoteRoundPlayer = (srvRoundPlayers[rid] || {})[d.player_id];
      if (it.endpoint === 'addRoundPlayer' && remoteRoundPlayer && sameFields(remoteRoundPlayer, d, ['team_id', 'playing_handicap'])) drop.add(it.id);
    });

    queueRemove(drop);
    return drop.size;
  }

  // ---------- SYNC DESDE EL SERVIDOR ----------
  async function syncFromServer() {
    const uid = store.getUserId();
    const q = '&user_id=' + encodeURIComponent(uid);
    let srvRounds = [], srvHoles = {}, srvCF = {}, srvPlayers = [], srvRoundPlayers = {};
    try {
      onStatus('Actualizando...');

      // Rondas
      const rRes = await fetchFn(apiUrl + '?action=getRounds' + q);
      const serverRounds = await rRes.json();
      if (Array.isArray(serverRounds) && serverRounds.length) {
        const localRounds = store.loadRounds();
        const localMap = {};
        localRounds.forEach(lr => { if (lr.round_id) localMap[lr.round_id] = lr; });

        // Merge por campo: base = servidor, campos locales no-vacíos ganan.
        // Excepción: campos de estado terminal — si el servidor ya tiene un
        // valor válido, ese gana siempre.
        const TERMINAL_FIELDS = ['completed', 'total_score', 'par_total', 'holes_played', 'total_putts', 'fairways_hit', 'fairway_holes', 'greens_in_regulation', 'hcp_index', 'hcp_differential'];
        // Doble filtro: el servidor ya filtra por user_id, pero acá no entra
        // nada que no sea tuyo aunque el servidor devolviera de más.
        // Rondas con una corrección todavía sin subir: ahí gana lo local, si no
        // el total viejo del servidor pisaba la edición.
        const pendingUpdate = new Set(queueGet().filter(it => it.endpoint === 'updateRound').map(it => String(it.data && it.data.round_id)));
        const validServer = serverRounds.filter(r =>
          r.round_id && String(r.round_id).trim() && r.course_name &&
          String(r.user_id || '').trim() === uid);
        srvRounds = validServer;
        const merged = validServer.map(sr => {
          const lr = localMap[sr.round_id];
          if (!lr) return sr;
          const result = { ...sr };
          Object.keys(lr).forEach(k => {
            if (TERMINAL_FIELDS.includes(k) && !pendingUpdate.has(String(sr.round_id))) {
              if (sr[k] !== undefined && sr[k] !== null && sr[k] !== '') return;
            }
            if (lr[k] !== undefined && lr[k] !== null && lr[k] !== '') result[k] = lr[k];
          });
          return result;
        });

        // Agregar rondas que sólo están en local
        localRounds.forEach(lr => {
          if (lr.round_id && !validServer.find(r => r.round_id === lr.round_id)) merged.push(lr);
        });

        merged.sort((a, b) => new Date(b.date) - new Date(a.date));
        store.saveRounds(merged);
      }

      // Hoyos — por ronda, jugador y número de hoyo.
      const hRes = await fetchFn(apiUrl + '?action=getHoles' + q);
      const serverHoles = await hRes.json();
      if (Array.isArray(serverHoles)) {
        const grouped = {};
        serverHoles.forEach(h => {
          if (!grouped[h.round_id]) grouped[h.round_id] = {};
          const pid = h.player_id || 'me';
          if (!grouped[h.round_id][pid]) grouped[h.round_id][pid] = {};
          grouped[h.round_id][pid][h.hole_number] = h;
        });
        srvHoles = grouped;
        Object.entries(grouped).forEach(([rid, byPlayer]) => {
          Object.entries(byPlayer).forEach(([pid, remoteHoles]) => {
            const merged = { ...remoteHoles, ...store.loadHoles(rid, pid) };
            store.saveHoles(rid, merged, pid);
          });
        });

        // Recalcular el score de rondas que tienen hoyos pero no total_score
        const roundsToFix = store.loadRounds();
        let fixed = false;
        roundsToFix.forEach(r => {
          if (r.total_score) return;
          const holesMap = (grouped[r.round_id] || {}).me || store.loadHoles(r.round_id);
          if (!holesMap) return;
          const holesArr = Object.values(holesMap);
          if (!holesArr.length) return;
          r.total_score = holesArr.reduce((a, h) => a + (Number(h.score) || 0), 0);
          r.par_total = holesArr.reduce((a, h) => a + (Number(h.par) || 0), 0);
          r.holes_played = holesArr.length;
          r.total_putts = holesArr.reduce((a, h) => a + (Number(h.putts) || 0), 0);
          if (holesArr.length >= (Number(r.course_holes_count) || 18)) r.completed = true;
          fixed = true;
        });
        if (fixed) store.saveRounds(roundsToFix);
      }

      // Feedback de palos — por ronda como { club: { rating, tags[] } }
      const cRes = await fetchFn(apiUrl + '?action=getClubFeedback' + q);
      const serverCF = await cRes.json();
      if (Array.isArray(serverCF)) {
        const grouped = {};
        serverCF.forEach(cf => {
          if (!grouped[cf.round_id]) grouped[cf.round_id] = {};
          grouped[cf.round_id][cf.club] = {
            rating: cf.rating || '',
            tags: cf.tags ? String(cf.tags).split(',').filter(Boolean) : [],
          };
        });
        srvCF = grouped;
        // Igual con los palos: si hay una corrección pendiente de esa ronda, se conserva lo local.
        const pendingClubs = new Set(queueGet().filter(it => it.endpoint === 'addClubFeedback').map(it => String(it.data && it.data.round_id)));
        Object.entries(grouped).forEach(([rid, cf]) => { if (!pendingClubs.has(String(rid))) store.saveClubs(rid, cf); });
      }

      const version = await backendVersion();
      if (version >= 3) {
        const [pRes, rpRes] = await Promise.all([
          fetchFn(apiUrl + '?action=getPlayers' + q),
          fetchFn(apiUrl + '?action=getRoundPlayers' + q),
        ]);
        const remotePlayers = await pRes.json();
        const remoteRoundPlayers = await rpRes.json();
        if (Array.isArray(remotePlayers)) {
          srvPlayers = remotePlayers;
          const mergedPlayers = new Map(store.loadPlayers().map(p => [String(p.player_id), p]));
          remotePlayers.forEach(p => mergedPlayers.set(String(p.player_id), { ...(mergedPlayers.get(String(p.player_id)) || {}), ...p }));
          store.savePlayers([...mergedPlayers.values()]);
        }
        if (Array.isArray(remoteRoundPlayers)) {
          remoteRoundPlayers.forEach(p => {
            if (!srvRoundPlayers[p.round_id]) srvRoundPlayers[p.round_id] = {};
            srvRoundPlayers[p.round_id][p.player_id] = p;
          });
          store.loadRounds().forEach(r => {
            const merged = new Map(store.loadRoundPlayers(r.round_id).map(p => [String(p.player_id), p]));
            Object.values(srvRoundPlayers[r.round_id] || {}).forEach(p => merged.set(String(p.player_id), { ...(merged.get(String(p.player_id)) || {}), ...p }));
            store.saveRoundPlayers(r.round_id, [...merged.values()]);
          });
        }
      }

      if (version >= 2) {
        pruneQueue(srvRounds, srvHoles, srvCF, srvPlayers, srvRoundPlayers, version >= 3);
        const propuesta = reconcile(srvRounds, srvHoles, srvCF, srvPlayers, srvRoundPlayers, version >= 3);
        if (propuesta.length > RECONCILE_LIMIT) {
          // Demasiado para hacerlo en silencio. Queda esperando el visto bueno.
          store.saveToLS('reconcile_hold', propuesta);
        } else if (propuesta.length) {
          store.saveToLS('reconcile_hold', []);
          propuesta.forEach(h => enqueue(h.endpoint, h.data));
          onToast('Subiendo ' + propuesta.length + ' registro(s) que faltaban', 3000);
        }
      }
      await flushPending();
      onDataChange();
      onStatus('');
    } catch (e) {
      console.warn('Sync from server failed:', e);
      lastSyncError = 'sync: ' + e.message;
    } finally {
      // Pase lo que pase el cartel se limpia: antes podía quedar en
      // "Actualizando..." para siempre si algo fallaba a mitad de camino.
      onStatus('');
    }
  }

  return {
    RECONCILE_LIMIT,
    queueGet, queueKey, queueRemove, enqueue, clearQueue,
    postToSheets, flushPending,
    orphanRounds, purgeQueueForRound, purgeOrphanQueue, coursesSummary,
    diagnose, backendVersion,
    reconcile, pruneQueue, syncFromServer,
    getLastSyncError: () => lastSyncError,
  };
}
