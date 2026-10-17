// ============================================================
// D1 falso sobre el SQLite nativo de Node (node:sqlite)
// ============================================================
// Implementa la porción de la API de D1 que usa src/db.js (prepare/bind/
// first/all/run) para poder probar la lógica del Worker en Node, sin
// levantar Cloudflare. Sólo para tests: en producción corre el D1 real.
// ============================================================

import { DatabaseSync } from 'node:sqlite';

class FakeStatement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new FakeStatement(this.db, this.sql, values);
  }
  async first() {
    const row = this.db.prepare(this.sql).get(...this.values);
    return row === undefined ? null : row;
  }
  async all() {
    const results = this.db.prepare(this.sql).all(...this.values);
    return { results, success: true };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }
}

export class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }
  prepare(sql) {
    return new FakeStatement(this.db, sql);
  }
  exec(sql) {
    this.db.exec(sql);
  }
}
