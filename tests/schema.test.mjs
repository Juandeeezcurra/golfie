// ============================================================
// ESQUEMA vs MIGRACIONES
// ============================================================
// Hay dos verdades sobre la forma de la base: src/schema.js (que es lo que
// usan los tests y la capa de datos) y migrations/ (que es lo que corre
// contra la base real). Si se separan, los tests pasan en verde mientras
// producción falla con "no such column".
//
// Este test aplica TODAS las migraciones en orden sobre una base vacía y
// compara el resultado contra buildSchemaSql(). Agregar una columna a
// schema.js sin escribir la migración rompe acá.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildSchemaSql } from '../src/schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function columnsOf(db) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);

  const out = {};
  for (const t of tables) {
    out[t] = db.prepare(`PRAGMA table_info(${t})`).all()
      .map(c => `${c.name} ${c.type}`)
      .sort();
  }
  return out;
}

test('las migraciones construyen exactamente el esquema de src/schema.js', () => {
  const migrationsDir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.length, 'no hay migraciones');

  const fromMigrations = new DatabaseSync(':memory:');
  for (const f of files) {
    fromMigrations.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }

  const fromSchema = new DatabaseSync(':memory:');
  fromSchema.exec(buildSchemaSql());

  assert.deepEqual(
    columnsOf(fromMigrations),
    columnsOf(fromSchema),
    'el esquema que arman las migraciones no coincide con src/schema.js: falta escribir una migración'
  );
});

test('ninguna migración ya aplicada se edita después (0001 crea, el resto altera)', () => {
  const first = fs.readFileSync(path.join(ROOT, 'migrations', '0001_init.sql'), 'utf8');
  // Si 0001 incluyera una columna que otra migración agrega con ALTER, una
  // base nueva fallaría con "duplicate column name".
  assert.ok(!/course_id/.test(first), '0001 no debe incluir columnas agregadas por migraciones posteriores');
});
