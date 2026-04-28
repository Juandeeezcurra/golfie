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
function addRound(d) {
  const sheet = getOrCreateSheet('Rounds', [
    'round_id','date','course_name','tees','slope_rating','course_rating',
    'hcp_index','weather','total_score','par_total','total_putts',
    'fairways_hit','greens_in_regulation','holes_played','completed'
  ]);

  sheet.appendRow([
    d.round_id, d.date, d.course_name, d.tees,
    d.slope_rating, d.course_rating, d.hcp_index || '',
    d.weather || '', '', '', '', '', '', '', false
  ]);

  return { round_id: d.round_id };
}

function updateRound(d) {
  const sheet = getOrCreateSheet('Rounds', []);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const roundIdCol = headers.indexOf('round_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][roundIdCol] === d.round_id) {
      const row = i + 1;
      setCell(sheet, row, headers, 'total_score', d.total_score || '');
      setCell(sheet, row, headers, 'par_total', d.par_total || '');
      setCell(sheet, row, headers, 'total_putts', d.total_putts || '');
      setCell(sheet, row, headers, 'fairways_hit', d.fairways_hit || '');
      setCell(sheet, row, headers, 'greens_in_regulation', d.greens_in_regulation || '');
      setCell(sheet, row, headers, 'holes_played', d.holes_played || '');
      setCell(sheet, row, headers, 'completed', d.completed || false);
      return { updated: true };
    }
  }
  return { updated: false, error: 'Round not found' };
}

// ==================== HOLES ====================
function addHole(d) {
  const sheet = getOrCreateSheet('Holes', [
    'round_id','hole_number','par','score','putts',
    'fairway_hit','green_in_regulation','penalties',
    'up_and_down','sand_save'
  ]);

  // Upsert: if hole exists, update it
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const roundCol = headers.indexOf('round_id');
  const holeCol = headers.indexOf('hole_number');

  for (let i = 1; i < data.length; i++) {
    if (data[i][roundCol] === d.round_id && data[i][holeCol] === d.hole_number) {
      const row = i + 1;
      const vals = [d.round_id, d.hole_number, d.par, d.score, d.putts,
        d.fairway_hit === null ? '' : d.fairway_hit,
        d.green_in_regulation, d.penalties,
        d.up_and_down, d.sand_save];
      sheet.getRange(row, 1, 1, vals.length).setValues([vals]);
      return { updated: true, hole: d.hole_number };
    }
  }

  sheet.appendRow([
    d.round_id, d.hole_number, d.par, d.score, d.putts,
    d.fairway_hit === null ? '' : d.fairway_hit,
    d.green_in_regulation, d.penalties,
    d.up_and_down, d.sand_save
  ]);

  return { inserted: true, hole: d.hole_number };
}

// ==================== CLUB FEEDBACK ====================
function addClubFeedback(d) {
  const sheet = getOrCreateSheet('ClubFeedback', [
    'round_id','club','rating','tags','timestamp'
  ]);

  sheet.appendRow([
    d.round_id, d.club, d.rating || '', d.tags || '',
    new Date().toISOString()
  ]);

  return { club: d.club };
}

// ==================== HELPERS ====================
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function setCell(sheet, row, headers, field, value) {
  const col = headers.indexOf(field) + 1;
  if (col > 0) sheet.getRange(row, col).setValue(value);
}

// ==================== GET (opcional) ====================
function doGet(e) {
  const action = e.parameter.action;
  if (action === 'getRounds') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rounds');
    if (!sheet) return jsonOut([]);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h,i) => obj[h] = row[i]);
      return obj;
    });
    return jsonOut(rows);
  }
  return jsonOut({ error: 'Unknown action' });
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
