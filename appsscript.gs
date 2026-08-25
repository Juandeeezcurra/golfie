// ============================================================
// GOLFIE — Google Apps Script Backend
// ============================================================
// 1. Abrí tu Google Sheet
// 2. Extensiones → Apps Script → pegá este código
// 3. Implementar → Nueva implementación → Web App
//    - Ejecutar como: Yo
//    - Quién tiene acceso: Cualquiera
// 4. Copiá la URL y pegala en index.html (APPS_SCRIPT_URL)
// ============================================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch(action) {
      case 'addRound':    result = addRound(data); break;
      case 'updateRound': result = updateRound(data); break;
      case 'addHole':     result = addHole(data); break;
      case 'addClubFeedback': result = addClubFeedback(data); break;
      case 'deleteRound': result = deleteRoundRows(data); break;
      default: result = { error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== ROUNDS ====================
const ROUND_HEADERS = [
  'round_id','date','course_name','tees','slope_rating','course_rating',
  'hcp_index','weather','total_score','par_total','total_putts',
  'fairways_hit','greens_in_regulation','holes_played','completed','user_id'
];

// Fila (1-based) de la ronda, o 0 si no está.
function findRoundRow(sheet, roundId, userId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('round_id');
  const userCol = headers.indexOf('user_id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) !== String(roundId)) continue;
    if (!ownedBy(data[i], userCol, userId)) continue;
    return i + 1;
  }
  return 0;
}

// Upsert, no append: si la ronda ya existe no se duplica. Esto es lo que deja
// que la app reencole una ronda perdida sin miedo a crear filas repetidas.
function addRound(d) {
  const sheet = getOrCreateSheet('Rounds', ROUND_HEADERS);
  const headers = sheet.getRange(1, 1, 1, ROUND_HEADERS.length).getValues()[0];
  const row = findRoundRow(sheet, d.round_id, d.user_id);

  if (row) {
    setCell(sheet, row, headers, 'user_id', d.user_id || '');
    return { round_id: d.round_id, existed: true };
  }

  sheet.appendRow([
    d.round_id, d.date, d.course_name, d.tees,
    d.slope_rating, d.course_rating, d.hcp_index || '',
    d.weather || '', '', '', '', '', '', '', false, d.user_id || ''
  ]);

  return { round_id: d.round_id, inserted: true };
}

function updateRound(d) {
  const sheet = getOrCreateSheet('Rounds', ROUND_HEADERS);
  let row = findRoundRow(sheet, d.round_id, d.user_id);

  // Si el addRound original nunca llegó (se cortó la señal en la cancha),
  // creamos la fila acá en vez de descartar la ronda entera.
  if (!row) {
    addRound(d);
    row = findRoundRow(sheet, d.round_id, d.user_id);
    if (!row) return { updated: false, error: 'Round not found' };
  }

  const headers = sheet.getRange(1, 1, 1, ROUND_HEADERS.length).getValues()[0];
  setCell(sheet, row, headers, 'total_score', d.total_score || '');
  setCell(sheet, row, headers, 'par_total', d.par_total || '');
  setCell(sheet, row, headers, 'total_putts', d.total_putts || '');
  setCell(sheet, row, headers, 'fairways_hit', d.fairways_hit || '');
  setCell(sheet, row, headers, 'greens_in_regulation', d.greens_in_regulation || '');
  setCell(sheet, row, headers, 'holes_played', d.holes_played || '');
  setCell(sheet, row, headers, 'completed', d.completed || false);
  setCell(sheet, row, headers, 'user_id', d.user_id || '');
  return { updated: true };
}

// Borra la ronda y todo lo que cuelga de ella. De abajo hacia arriba: borrar
// de arriba corre los índices de las filas que faltan revisar.
function deleteRoundRows(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let removed = 0;

  ['Rounds', 'Holes', 'ClubFeedback'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    const idCol = data[0].indexOf('round_id');
    const userCol = data[0].indexOf('user_id');
    if (idCol < 0) return;

    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idCol]) !== String(d.round_id)) continue;
      if (!ownedBy(data[i], userCol, d.user_id)) continue;
      sheet.deleteRow(i + 1);
      removed++;
    }
  });

  return { removed };
}

// ==================== HOLES ====================
function addHole(d) {
  const sheet = getOrCreateSheet('Holes', [
    'round_id','hole_number','par','score','putts',
    'fairway_hit','green_in_regulation','penalties',
    'up_and_down','sand_save','user_id'
  ]);

  // Upsert: if hole exists, update it
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const roundCol = headers.indexOf('round_id');
  const holeCol = headers.indexOf('hole_number');
  const userCol = headers.indexOf('user_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][roundCol] === d.round_id && data[i][holeCol] === d.hole_number
        && ownedBy(data[i], userCol, d.user_id)) {
      const row = i + 1;
      const vals = [d.round_id, d.hole_number, d.par, d.score, d.putts,
        d.fairway_hit === null ? '' : d.fairway_hit,
        d.green_in_regulation, d.penalties,
        d.up_and_down, d.sand_save, d.user_id || ''];
      sheet.getRange(row, 1, 1, vals.length).setValues([vals]);
      return { updated: true, hole: d.hole_number };
    }
  }

  sheet.appendRow([
    d.round_id, d.hole_number, d.par, d.score, d.putts,
    d.fairway_hit === null ? '' : d.fairway_hit,
    d.green_in_regulation, d.penalties,
    d.up_and_down, d.sand_save, d.user_id || ''
  ]);

  return { inserted: true, hole: d.hole_number };
}

// ==================== CLUB FEEDBACK ====================
function addClubFeedback(d) {
  const sheet = getOrCreateSheet('ClubFeedback', [
    'round_id','club','rating','tags','timestamp','user_id'
  ]);

  // Upsert por ronda+palo: reenviar el mismo feedback no genera filas nuevas.
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const roundCol = headers.indexOf('round_id');
  const clubCol = headers.indexOf('club');
  const userCol = headers.indexOf('user_id');
  const vals = [d.round_id, d.club, d.rating || '', d.tags || '',
    new Date().toISOString(), d.user_id || ''];

  for (let i = 1; i < data.length; i++) {
    if (data[i][roundCol] === d.round_id && data[i][clubCol] === d.club
        && ownedBy(data[i], userCol, d.user_id)) {
      sheet.getRange(i + 1, 1, 1, vals.length).setValues([vals]);
      return { club: d.club, updated: true };
    }
  }

  sheet.appendRow(vals);
  return { club: d.club, inserted: true };
}

// ==================== HELPERS ====================
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers.length) {
    // La hoja puede tener menos columnas que headers (pasa al agregar user_id
    // a una planilla vieja); sin esto, getRange de más abajo tira error.
    const missing = headers.length - sheet.getMaxColumns();
    if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (existing.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// Una fila es tuya si su user_id coincide. Las filas viejas (sin user_id)
// se consideran huérfanas y no pertenecen a nadie.
function ownedBy(row, userCol, userId) {
  if (userCol < 0) return true;
  const owner = String(row[userCol] || '').trim();
  // Fila sin dueño = reclamable. El round_id es aleatorio y sólo lo tiene
  // guardado quien creó la ronda, así que si lo presenta, es suya. Esto deja
  // que las filas viejas (previas al user_id) se adopten solas al reenviarse.
  // Ojo: doGet nunca devuelve filas sin dueño, así que no se filtran de vuelta.
  return owner === '' || owner === String(userId || '').trim();
}

function setCell(sheet, row, headers, field, value) {
  const col = headers.indexOf(field) + 1;
  if (col > 0) sheet.getRange(row, col).setValue(value);
}

// ==================== GET (opcional) ====================
function doGet(e) {
  const action = e.parameter.action;
  const userId = String((e.parameter && e.parameter.user_id) || '').trim();

  // La app pregunta la versión antes de reconciliar: contra el backend viejo
  // (append-only) reenviar datos duplicaría filas.
  if (action === 'ping') return jsonOut({ ok: true, v: 2 });

  // Sin código de usuario no se devuelve nada. La app está publicada como
  // "cualquiera puede acceder", así que sin este filtro cada dispositivo se
  // baja las rondas de todos los que alguna vez abrieron la app.
  if (!userId) return jsonOut([]);

  if (action === 'getRounds') {
    return jsonOut(forUser(sheetToObjects('Rounds'), userId));
  }

  if (action === 'getHoles') {
    return jsonOut(forUser(sheetToObjects('Holes'), userId));
  }

  if (action === 'getClubFeedback') {
    return jsonOut(forUser(sheetToObjects('ClubFeedback'), userId));
  }

  return jsonOut({ error: 'Unknown action' });
}

function forUser(rows, userId) {
  return rows.filter(r => String(r.user_id || '').trim() === userId);
}

function sheetToObjects(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== MIGRACIÓN (correr a mano una sola vez) ====================
// Después de borrar del Sheet las rondas que no son tuyas, corré esto desde el
// editor de Apps Script con tu código (el que muestra la app en el home) para
// adoptar las filas viejas, que quedaron sin user_id.
//
//   claimLegacyRows('u-xxxxxxxxxx');
//
function claimLegacyRows(userId) {
  userId = String(userId || '').trim();
  if (!/^u-[a-z0-9]{6,24}$/.test(userId)) throw new Error('Código inválido: ' + userId);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let total = 0;

  ['Rounds', 'Holes', 'ClubFeedback'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    // Si la hoja todavía no tiene la columna, la creamos acá mismo.
    let col = data[0].indexOf('user_id') + 1;
    if (col < 1) {
      col = data[0].length + 1;
      if (sheet.getMaxColumns() < col) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
      sheet.getRange(1, col).setValue('user_id').setFontWeight('bold');
      data.forEach(r => r.push(''));
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col - 1] || '').trim() !== '') continue;
      sheet.getRange(i + 1, col).setValue(userId);
      total++;
    }
  });

  Logger.log('Filas adoptadas: ' + total);
  return total;
}
