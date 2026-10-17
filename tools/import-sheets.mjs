// ============================================================
// GOLFIE — IMPORT DEL EXPORT DE SHEETS A D1
// ============================================================
//   node tools/import-sheets.mjs --local   [--file golfie-export.json]
//   node tools/import-sheets.mjs --remote
//   node tools/import-sheets.mjs --dry-run   (sólo genera el SQL, no lo aplica)
//
// Lee el JSON que devuelve exportAll() (tools/export-from-sheets.gs), lo
// convierte a SQL y lo aplica con wrangler. Es idempotente: arranca
// borrando las tablas, así que se puede correr las veces que haga falta
// mientras se prueba la migración.
// ============================================================

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { COLUMNS, TABLE_OF, SHEETS, T } from '../src/schema.js';

// El export histórico no contiene perfiles de jugadores ni relaciones de
// ronda. Nunca vaciar esas tablas al reimportar el respaldo de Sheets.
const IMPORT_SHEETS = [SHEETS.ROUNDS, SHEETS.HOLES, SHEETS.CLUB_FEEDBACK];

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const local = args.includes('--local');
const fileArg = args.indexOf('--file');
const file = fileArg >= 0 ? args[fileArg + 1] : 'golfie-export.json';
const dryRun = args.includes('--dry-run');

if (!remote && !local && !dryRun) {
  console.error('Falta --local o --remote (o --dry-run para sólo generar el SQL).');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No existe ${file}. Corré exportAll() en Apps Script primero (ver tools/export-from-sheets.gs).`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!data.tables) {
  console.error('El JSON no tiene .tables. Revisá que sea la salida de exportAll().');
  process.exit(1);
}

function sqlLiteral(value, type) {
  if (value === undefined || value === null || value === '') return 'NULL';
  if (type === T.BOOL) {
    return (value === true || value === 'TRUE' || value === 'true' || value === 1) ? '1' : '0';
  }
  if (type === T.NUM) {
    const n = Number(value);
    return isNaN(n) ? 'NULL' : String(n);
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const stmts = [];
const counts = {};

for (const name of IMPORT_SHEETS) {
  stmts.push(`DELETE FROM ${TABLE_OF[name]};`);
}
// Las tarjetas de ronda importadas son sólo del usuario principal; no dejes
// relaciones actuales apuntando a rondas que acabamos de reemplazar.
stmts.push('DELETE FROM round_players;');

for (const name of IMPORT_SHEETS) {
  const rows = data.tables[name] || [];
  counts[name] = rows.length;
  if (!rows.length) continue;
  const cols = COLUMNS[name];
  const colNames = Object.keys(cols);
  // INSERT multi-fila en tandas, para no generar una sentencia gigante.
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
// shell:true porque en Windows 'npx' es npx.cmd y execFileSync no lo resuelve solo.
execFileSync('npx', ['wrangler', 'd1', 'execute', 'golfie', target, '--file', outFile, '--yes'], {
  stdio: 'inherit',
  shell: true,
});
console.log('Import completo.');
