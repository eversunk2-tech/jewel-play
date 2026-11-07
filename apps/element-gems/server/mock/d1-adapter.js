/* element-gems server - mock/d1-adapter.js
 * Node 내장 node:sqlite 를 Cloudflare D1 과 같은 모양(prepare().bind().first()/all()/run(), batch())으로 감싼다.
 * 로컬 목 서버와 자동 시험에서 src/worker.js 의 handle() 을 그대로 돌리기 위한 얇은 어댑터다. (Cloudflare 계정 불필요)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

class Statement {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params || []; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  _stmt() { return this.db.prepare(this.sql); }
  async first(col) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    const o = Object.assign({}, row);
    return col ? o[col] : o;
  }
  async all() {
    const rows = this._stmt().all(...this.params).map((r) => Object.assign({}, r));
    return { success: true, results: rows, meta: { changes: 0 } };
  }
  async run() {
    const r = this._stmt().run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  _runSync() {
    const s = this._stmt();
    if (/^\s*(select|with|pragma|explain)/i.test(this.sql)) return { success: true, results: s.all(...this.params).map((r) => Object.assign({}, r)), meta: { changes: 0 } };
    const r = s.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

class D1Like {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Statement(this.db, sql, []); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  exec(sql) { this.db.exec(sql); }
}

/** file: DB 파일 경로(없으면 메모리). schema.sql 을 적용한 D1 호환 객체를 돌려준다 */
function createDb(file) {
  const db = new DatabaseSync(file || ':memory:');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return new D1Like(db);
}

module.exports = { createDb, D1Like, SCHEMA_PATH };
