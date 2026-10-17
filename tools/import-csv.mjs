// ============================================================
// GOLFIE — IMPORT DESDE CSV (Rounds/Holes/ClubFeedback) A D1
// ============================================================
// Alternativa a tools/import-sheets.mjs que NO requiere tocar el Apps
// Script: en el Sheet, con cada pestaña abierta, Archivo → Descargar →
// Valores separados por comas (.csv), y pasarle las 3 rutas acá.
//
//   node tools/import-csv.mjs --local \
//     --rounds "Golfie - Rounds.csv" \
//     --holes "Golfie - Holes.csv" \
//     --club-feedback "Golfie - ClubFeedback.csv"
//
//   node tools/import-csv.mjs --remote --rounds ... --holes ... --club-feedback ...
//   node tools/import-csv.mjs --dry-run --rounds ...   (sólo genera el SQL)
//
// Cualquiera de las 3 rutas puede omitirse si esa hoja no tiene datos.
// Idempotente: arranca borrando las 3 tablas.
// ============================================================

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { COLUMNS, TABLE_OF, SHEETS, T } from '../src/schema.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const local = args.includes('--local');
const dryRun = args.includes('--dry-run');

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const FILES = {
  [SHEETS.ROUNDS]: argVal('--rounds'),
  [SHEETS.HOLES]: argVal('--holes'),
  [SHEETS.CLUB_FEEDBACK]: argVal('--club-feedback'),
};

if (!remote && !local && !dryRun) {
  console.error('Falta --local o --remote (o --dry-run para sólo generar el SQL).');
  process.exit(1);
}
if (!FILES[SHEETS.ROUNDS] && !FILES[SHEETS.HOLES] && !FILES[SHEETS.CLUB_FEEDBACK]) {
  console.error('Pasá al menos uno de --rounds / --holes / --club-feedback con la ruta al CSV.');
  process.exit(1);
}

// Parser de CSV mínimo pero correcto: comillas, comas y saltos de línea
// dentro de un campo (así exporta Sheets cuando una celda tiene comas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsvAsObjects(path) {
  const text = fs.readFileSync(path, 'utf8').replace(/^﻿/, ''); // BOM de Excel/Sheets
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0];
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
  // Si una fila tiene más o menos campos que encabezados, zippear en silencio
  // corre todo lo que sigue una columna y mezcla datos entre campos. Mejor
  // fallar fuerte que importar una fila corrida sin que nadie lo note.
  dataRows.forEach((r, i) => {
    if (r.length !== headers.length) {
      throw new Error(`${path}: la fila ${i + 2} tiene ${r.length} campos, esperaba ${headers.length} (encabezados: ${headers.join(', ')})`);
    }
  });
  return dataRows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function sqlLiteral(value, type) {
  if (value === undefined || value === null || value === '') return 'NULL';
  if (type === T.BOOL) {
    return (value === true || value === 'TRUE' || value === 'true' || value === 1) ? '1' : '0';
  }
  if (type === T.NUM) {
    // Sheets exporta decimales con coma en locale es-AR (ej. hcp_index
    // "12,3"), nunca con dos comas ni mezclado con un punto: sólo en ese
    // caso puntual se reinterpreta la coma como separador decimal.
    const normalized = /^-?\d+,\d+$/.test(value) ? value.replace(',', '.') : value;
    const n = Number(normalized);
    return isNaN(n) ? 'NULL' : String(n);
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const stmts = [];
const counts = {};

for (const name of Object.keys(FILES)) {
  if (!FILES[name]) continue;
  stmts.push(`DELETE FROM ${TABLE_OF[name]};`);
}
if (FILES[SHEETS.ROUNDS]) stmts.push('DELETE FROM round_players;');

for (const [name, path] of Object.entries(FILES)) {
  if (!path) continue;
  if (!fs.existsSync(path)) {
    console.error(`No existe el archivo: ${path}`);
    process.exit(1);
  }
  const rows = readCsvAsObjects(path);
  counts[name] = rows.length;
  if (!rows.length) continue;
  const cols = COLUMNS[name];
  const colNames = Object.keys(cols);
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(row => '(' + colNames.map(c => {
        if (name === SHEETS.HOLES && c === 'player_id' && !row[c]) return sqlLiteral('me', cols[c]);
        if (name === SHEETS.ROUNDS && c === 'format' && !row[c]) return sqlLiteral('stroke', cols[c]);
        return sqlLiteral(row[c], cols[c]);
      }).join(', ') + ')')
      .join(',\n  ');
    stmts.push(`INSERT INTO ${TABLE_OF[name]} (${colNames.join(', ')}) VALUES\n  ${values};`);
  }
}

const sql = stmts.join('\n\n') + '\n';
const outFile = '.wrangler/golfie-import.sql';
fs.mkdirSync('.wrangler', { recursive: true });
fs.writeFileSync(outFile, sql);

console.log('Filas por tabla:');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
console.log(`\nSQL generado: ${outFile} (${stmts.length} sentencias)`);

if (dryRun) {
  console.log('\n--dry-run: no se aplicó nada.');
  process.exit(0);
}

const target = remote ? '--remote' : '--local';
console.log(`\nAplicando a D1 (${target})...`);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'golfie', target, '--file', outFile, '--yes'], {
  stdio: 'inherit',
  shell: true,
});
console.log('Import completo.');
