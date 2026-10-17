// ============================================================
// GOLFIE — EXPORT DE SHEETS (paso único de migración a Cloudflare)
// ============================================================
// 1. Pegá esto AL FINAL de tu appsscript.gs en el editor de Apps Script.
// 2. Agregá este case dentro de doGet, junto a los demás:
//
//      if (action === 'exportAll') return jsonOut(exportAll());
//
// 3. Guardá y Implementar → Administrar implementaciones → Editar →
//    Nueva versión → Implementar (así tu Web App existente sirve el export).
// 4. Pedí el export:
//
//      curl -s "<TU_APPS_SCRIPT_URL>?action=exportAll" > golfie-export.json
//
// 5. Importá a D1 (ver tools/import-sheets.mjs):
//
//      node tools/import-sheets.mjs --local --file golfie-export.json
//      node tools/import-sheets.mjs --remote --file golfie-export.json
//
// Exporta TODAS las filas, incluidas las sin user_id (huérfanas): el import
// las deja igual de huérfanas en D1, así que claimLegacyRows/'repair' en la
// app sigue funcionando igual que antes de migrar.
// ============================================================

function exportAll() {
  var out = { exported_at: new Date().toISOString(), tables: {} };

  ['Rounds', 'Holes', 'ClubFeedback'].forEach(function (name) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) { out.tables[name] = []; return; }
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) { out.tables[name] = []; return; }
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    out.tables[name] = values
      .filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); })
      .map(function (row) {
        var obj = {};
        headers.forEach(function (h, i) {
          var v = row[i];
          // Las fechas vuelven como Date de Sheets: se normalizan a ISO para
          // que el import no dependa de la zona horaria del importador.
          if (Object.prototype.toString.call(v) === '[object Date]') {
            v = Utilities.formatDate(v, Session.getScriptTimeZone() || 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
          }
          obj[h] = v;
        });
        return obj;
      });
  });

  var counts = {};
  Object.keys(out.tables).forEach(function (k) { counts[k] = out.tables[k].length; });
  out.counts = counts;
  return out;
}
