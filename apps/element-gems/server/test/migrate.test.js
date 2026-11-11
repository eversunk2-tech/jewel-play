/* 최고점 도전 모드 D1 마이그레이션 시험 (spec §46.3.2~46.3.3·46.3.7, 46.5 서버 항목 ①)
 * Plan 의 로컬 SQLite 시험(41개 단언)을 node:test 로 옮긴 것이다. 옛 schema.sql(= 마이그레이션 전 운영 DB 와 같은 모양)은 **이 파일 안에 고정 문자열**로 둔다
 * (schema.sql 이 새 것으로 바뀐 뒤에도 "옛 DB" 를 다시 만들 수 있게). 마이그레이션 SQL 은 ../migrations/ 의 실제 파일을 그대로 읽어 실행한다.
 * 테스트는 파일 안에서 순서대로 실행되며 같은 DB(S.db)를 이어서 쓴다(① 열 추가 -> ② 인덱스 -> ... -> ④ 옛 인덱스 삭제). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const core = require('../src/core');

const SERVER = path.join(__dirname, '..');
const MIG = path.join(SERVER, 'migrations');
const read = (f) => fs.readFileSync(f, 'utf8');
const m1a = read(path.join(MIG, 'migrate-1a-alter.oneline.sql'));
const m1b = read(path.join(MIG, 'migrate-1b-indexes.oneline.sql'));
const m3 = read(path.join(MIG, 'migrate-3-drop-old-indexes.oneline.sql'));

/* ---- 마이그레이션 전 운영 DB 의 schema.sql (커밋 ea84476 시점 그대로, 고정) ---- */
const OLD_SCHEMA = `-- element-gems 명예의 전당 D1 스키마 (spec §19.4.2)
-- 여러 번 실행해도 안전합니다(IF NOT EXISTS). D1 대시보드 Console에 전체를 붙여넣고 Execute 하세요.

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pid_hash      TEXT    NOT NULL UNIQUE,            -- SHA-256(playerId) 16진수. 원본 ID는 저장하지 않음
  pub           TEXT    NOT NULL UNIQUE,            -- 공개용 무작위 8자(순위 조회용). 순위표 응답엔 없음
  nick          TEXT    NOT NULL,                   -- 표시용(대소문자 유지)
  nick_key      TEXT    NOT NULL,                   -- 소문자 정규화(중복·검색용)
  tag           INTEGER NOT NULL CHECK (tag BETWEEN 0 AND 9999),
  avatar        INTEGER NOT NULL CHECK (avatar BETWEEN 1 AND 16),
  -- 난이도별 스테이지 최고 남은 시간(정수 초, 미클리어 -1) 10개를 쉼표로: "65,40,-1,-1,..."
  prog_easy     TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  prog_normal   TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  prog_hard     TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  stars_easy    INTEGER NOT NULL DEFAULT 0, stars_normal INTEGER NOT NULL DEFAULT 0, stars_hard INTEGER NOT NULL DEFAULT 0,
  left_easy     INTEGER NOT NULL DEFAULT 0, left_normal  INTEGER NOT NULL DEFAULT 0, left_hard  INTEGER NOT NULL DEFAULT 0,
  best_easy     INTEGER NOT NULL DEFAULT 0, best_normal  INTEGER NOT NULL DEFAULT 0, best_hard  INTEGER NOT NULL DEFAULT 0,  -- 최고 클리어 레벨 0~10
  total_stars   INTEGER NOT NULL DEFAULT 0,         -- 전체 탭 '별 점수' = 초보 별x1 + 중수 별x2 + 고수 별x3 (최대 180, 정렬 키). 열 이름은 total_stars 유지
  total_left    INTEGER NOT NULL DEFAULT 0,         -- 남은 시간 합계: 세 난이도 단순 합(가중 없음)
  up_all        INTEGER NOT NULL DEFAULT 0,         -- 순위 점수가 마지막으로 오른 시각(초, epoch) - 동점 선착순
  up_easy       INTEGER NOT NULL DEFAULT 0, up_normal INTEGER NOT NULL DEFAULT 0, up_hard INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1,2)),   -- 0 보임 / 1 관리자 숨김 / 2 이름 변경 요청(순위 제외)
  nick_changes  INTEGER NOT NULL DEFAULT 0,         -- 오늘 닉네임 변경 횟수
  nick_day      INTEGER NOT NULL DEFAULT 0,         -- 위 횟수가 속한 한국 시간 날짜 번호
  created_at    INTEGER NOT NULL,
  last_write_at INTEGER NOT NULL,                   -- 마지막 쓰기(제출 간격 제한용)
  UNIQUE (nick_key, tag)
);

-- 순위 조회용 부분 인덱스(숨김·별 0개 제외). 정렬 키와 같은 순서 -> ORDER BY가 인덱스를 그대로 사용
CREATE INDEX IF NOT EXISTS idx_rank_all    ON players (total_stars DESC, total_left DESC, up_all ASC,    id ASC) WHERE hidden = 0 AND total_stars > 0;
CREATE INDEX IF NOT EXISTS idx_rank_easy   ON players (stars_easy  DESC, left_easy   DESC, up_easy ASC,   id ASC) WHERE hidden = 0 AND stars_easy  > 0;
CREATE INDEX IF NOT EXISTS idx_rank_normal ON players (stars_normal DESC, left_normal DESC, up_normal ASC, id ASC) WHERE hidden = 0 AND stars_normal > 0;
CREATE INDEX IF NOT EXISTS idx_rank_hard   ON players (stars_hard  DESC, left_hard   DESC, up_hard ASC,   id ASC) WHERE hidden = 0 AND stars_hard  > 0;

-- 등록(프로필 생성) 한도·관리자 실패 횟수용: 이름 + 시간 창. 원본 IP는 저장하지 않음(IP 해시만). 오래된 행은 가끔 DELETE
CREATE TABLE IF NOT EXISTS rate_limits ( k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL );
`;
const OLD_SCHEMA_SHA256 = '5d50ef8ebd3451c489932f7b8ca05b0ea15f91902014b1246ac52a664d90a48d';

/* ---- 옛 Worker 의 SQL (커밋 ea84476 의 server/src/worker.js 에서 그대로) ---- */
const INSERT_SQL =
  'INSERT INTO players (pid_hash, pub, nick, nick_key, tag, avatar, prog_easy, prog_normal, prog_hard,' +
  ' stars_easy, stars_normal, stars_hard, left_easy, left_normal, left_hard, best_easy, best_normal, best_hard,' +
  ' total_stars, total_left, up_all, up_easy, up_normal, up_hard, hidden, nick_changes, nick_day, created_at, last_write_at)' +
  ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const UPDATE_SQL =
  'UPDATE players SET nick=?, nick_key=?, tag=?, avatar=?, prog_easy=?, prog_normal=?, prog_hard=?,' +
  ' stars_easy=?, stars_normal=?, stars_hard=?, left_easy=?, left_normal=?, left_hard=?, best_easy=?, best_normal=?, best_hard=?,' +
  ' total_stars=?, total_left=?, up_all=?, up_easy=?, up_normal=?, up_hard=?, hidden=?, nick_changes=?, nick_day=?, last_write_at=?' +
  ' WHERE id = ?';
const BOARDS = { all: ['total_stars', 'total_left', 'up_all'], easy: ['stars_easy', 'left_easy', 'up_easy'], normal: ['stars_normal', 'left_normal', 'up_normal'], hard: ['stars_hard', 'left_hard', 'up_hard'] };
const oldTopSql = (b) => { const [s, l, u] = BOARDS[b]; return 'SELECT nick, tag, avatar, ' + s + ' AS stars FROM players WHERE hidden = 0 AND ' + s + ' > 0 ORDER BY ' + s + ' DESC, ' + l + ' DESC, ' + u + ' ASC, id ASC LIMIT 50'; };
function oldRankSql(b) { const [s, l, u] = BOARDS[b]; const base = 'SELECT COUNT(*) FROM players WHERE hidden = 0 AND ' + s + ' > 0 AND '; return 'SELECT (' + base + s + ' > ?) + (' + base + s + ' = ? AND ' + l + ' > ?) + (' + base + s + ' = ? AND ' + l + ' = ? AND ' + u + ' < ?) + (' + base + s + ' = ? AND ' + l + ' = ? AND ' + u + ' = ? AND id < ?) + 1 AS rank'; }

/* ---- 새 Worker 의 SQL: 시험이 Worker 와 같은 모양인지는 api.test.js(EXPLAIN)가 따로 본다. 여기서는 spec §46.3.3 의 식을 그대로 쓴다 ---- */
const newTopSql = (b) => { const [s, l, u] = BOARDS[b]; return 'SELECT nick, tag, avatar, ' + s + ' AS stars, best_score AS score FROM players WHERE hidden = 0 AND ' + s + ' > 0 ORDER BY ' + s + ' DESC, best_score DESC, ' + l + ' DESC, ' + u + ' ASC, id ASC LIMIT 50'; };
function newRankSql(b) {
  const [s, l, u] = BOARDS[b];
  const base = 'SELECT COUNT(*) FROM players WHERE hidden = 0 AND ' + s + ' > 0 AND ';
  return 'SELECT (' + base + s + ' > ?) + (' +
    base + s + ' = ? AND best_score > ?) + (' +
    base + s + ' = ? AND best_score = ? AND ' + l + ' > ?) + (' +
    base + s + ' = ? AND best_score = ? AND ' + l + ' = ? AND ' + u + ' < ?) + (' +
    base + s + ' = ? AND best_score = ? AND ' + l + ' = ? AND ' + u + ' = ? AND id < ?) + 1 AS rank';
}
function newRankParams(r, b) { const [s, l, u] = BOARDS[b]; const S = r[s]; const B = r.best_score; const L = r[l]; const U = r[u]; return [S, S, B, S, B, L, S, B, L, U, S, B, L, U, r.id]; }

function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(91000001);
const ri = (n) => Math.floor(rnd() * n);

/** 가짜 선수: 별·남은 시간·달성 시각에 동점이 많이 나오도록 좁은 범위에서 뽑는다 */
function makePlayers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = { easy: ri(31) > 14 ? ri(4) * 5 + 15 : ri(31), normal: ri(31) > 14 ? 20 + ri(3) * 5 : ri(31), hard: ri(31) > 20 ? 18 + ri(4) * 4 : ri(31) };
    const l = { easy: s.easy ? s.easy * (3 + ri(3)) : 0, normal: s.normal ? s.normal * (2 + ri(3)) : 0, hard: s.hard ? s.hard * (1 + ri(3)) : 0 };
    ['easy', 'normal', 'hard'].forEach((d) => { l[d] = Math.round(l[d] / 10) * 10; });      // 남은 시간을 10 의 배수로 둥글게(동점 유도)
    out.push({ s, l, hidden: ri(40) === 0 ? 1 + ri(2) : 0, up: 1700000000 + ri(30) });         // 달성 시각도 일부러 겹치게
  }
  return out;
}
let SEQ = 0;
/** 옛 Worker 의 INSERT 로 넣는다(열 목록 명시 = 새 열을 모른다) */
function insertOld(db, P) {
  const ins = db.prepare(INSERT_SQL);
  return P.map((p) => {
    const i = SEQ++;
    const total = p.s.easy + 2 * p.s.normal + 3 * p.s.hard;
    const tl = p.l.easy + p.l.normal + p.l.hard;
    const r = ins.run('h' + i, 'P' + String(i).padStart(7, '0'), 'n' + i, 'n' + i, i % 10000, 1 + (i % 16), core.EMPTY_PROG_STR, core.EMPTY_PROG_STR, core.EMPTY_PROG_STR,
      p.s.easy, p.s.normal, p.s.hard, p.l.easy, p.l.normal, p.l.hard, 0, 0, 0, total, tl, p.up, p.up, p.up + 1, p.up + 2, p.hidden, 0, 0, 1700000000, 1700000000);
    return Number(r.lastInsertRowid);
  });
}
function refRows(db, board) {
  const [s, l, u] = BOARDS[board];
  const rows = db.prepare('SELECT id, hidden, ' + s + ' AS stars, best_score AS score, ' + l + ' AS lft, ' + u + ' AS up FROM players').all().map((r) => Object.assign({}, r)).filter((r) => r.hidden === 0 && r.stars > 0);
  rows.sort((a, b) => (b.stars - a.stars) || (b.score - a.score) || (b.lft - a.lft) || (a.up - b.up) || (a.id - b.id));
  return rows;
}
const count = (db, sql, ...p) => db.prepare(sql).get(...p).n;
const oldIdx = "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('idx_rank_all','idx_rank_easy','idx_rank_normal','idx_rank_hard')";
const newIdx = "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('idx_rank2_all','idx_rank2_easy','idx_rank2_normal','idx_rank2_hard')";
const plan = (db, sql, params) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map((r) => r.detail);

const S = { db: null, oldTop: null };

test('고정한 옛 schema 문자열이 변하지 않았고, 한 줄 SQL 파일 3개가 있다', () => {
  assert.equal(crypto.createHash('sha256').update(OLD_SCHEMA).digest('hex'), OLD_SCHEMA_SHA256, '옛 schema 고정 문자열을 고치면 안 된다(마이그레이션 시험의 출발점)');
  assert.ok(!/best_score|idx_rank2_/.test(OLD_SCHEMA));
  for (const x of [m1a, m1b, m3]) assert.ok(x.trim().length > 20);
});

test('옛 DB: 가짜 선수 1,500명을 넣는다 · 마이그레이션 전에는 best_score 열이 없고 SELECT best_score 는 오류(확인 쿼리)', () => {
  S.db = new DatabaseSync(':memory:');
  S.db.exec(OLD_SCHEMA);
  insertOld(S.db, makePlayers(1500));
  assert.equal(count(S.db, 'SELECT COUNT(*) n FROM players'), 1500);
  S.oldTop = {};
  for (const b of Object.keys(BOARDS)) S.oldTop[b] = S.db.prepare(oldTopSql(b)).all().map((r) => JSON.stringify(r));
  assert.equal(count(S.db, "SELECT COUNT(*) n FROM pragma_table_info('players') WHERE name='best_score'"), 0);
  assert.throws(() => S.db.prepare('SELECT best_score FROM players LIMIT 1').get(), /no such column: best_score/);
  assert.equal(count(S.db, oldIdx), 4);
  assert.equal(count(S.db, newIdx), 0);
});

test('새 schema.sql 을 마이그레이션 전의 옛 DB 에 붙이면 안전하게 실패한다(테이블·옛 인덱스 불변, 새 인덱스는 만들어지지 않음) - spec §46.3.8', () => {
  const copy = new DatabaseSync(':memory:');
  copy.exec(OLD_SCHEMA);
  insertOld(copy, makePlayers(30));
  const colsBefore = copy.prepare("SELECT name FROM pragma_table_info('players') ORDER BY cid").all().map((r) => r.name).join(',');
  assert.throws(() => copy.exec(read(path.join(SERVER, 'schema.sql'))), /no such column: best_score/);
  assert.equal(copy.prepare("SELECT name FROM pragma_table_info('players') ORDER BY cid").all().map((r) => r.name).join(','), colsBefore);
  assert.equal(count(copy, oldIdx), 4);
  assert.equal(count(copy, newIdx), 0);
  assert.equal(count(copy, 'SELECT COUNT(*) n FROM players'), 30);
});

test('1a: ALTER TABLE ADD COLUMN best_score … NOT NULL DEFAULT 0 - 기존 행 전원 0점, 정의가 sqlite_master 에 보이고, 두 번째 실행은 duplicate column 오류', () => {
  S.db.exec(m1a);
  assert.equal(count(S.db, "SELECT COUNT(*) n FROM pragma_table_info('players') WHERE name='best_score'"), 1);
  assert.equal(count(S.db, 'SELECT COUNT(*) n FROM players WHERE best_score <> 0'), 0);
  assert.match(S.db.prepare("SELECT sql FROM sqlite_master WHERE name='players'").get().sql, /best_score INTEGER NOT NULL DEFAULT 0/);
  assert.throws(() => S.db.exec(m1a), /duplicate column name: best_score/);
});

test('1b: 새 인덱스 4개 생성(두 번 실행해도 무해)·옛 인덱스 4개는 아직 있다(옛 Worker 롤백 대비)', () => {
  S.db.exec(m1b);
  S.db.exec(m1b);
  assert.equal(count(S.db, newIdx), 4);
  assert.equal(count(S.db, oldIdx), 4);
  assert.equal(count(S.db, "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name LIKE 'idx_rank%'"), 8);
});

test('① 뒤 ② 전의 상태: 옛 Worker 의 상위 50 쿼리 결과가 같고, 옛 INSERT·UPDATE 는 새 열을 DEFAULT 0 으로 두며 건드리지 않는다', () => {
  for (const b of Object.keys(BOARDS)) {
    const now = S.db.prepare(oldTopSql(b)).all().map((r) => JSON.stringify(r));
    assert.deepEqual(now, S.oldTop[b], '옛 상위 50 [' + b + ']');
  }
  const id = insertOld(S.db, [{ s: { easy: 3, normal: 0, hard: 0 }, l: { easy: 30, normal: 0, hard: 0 }, hidden: 0, up: 1700000100 }])[0];
  assert.equal(S.db.prepare('SELECT best_score b FROM players WHERE id = ?').get(id).b, 0, '옛 INSERT(열 목록 명시)는 새 열을 DEFAULT 0 으로 채운다');
  S.db.prepare('UPDATE players SET best_score = 777 WHERE id = ?').run(id);
  S.db.prepare(UPDATE_SQL).run('nx', 'nx', 1, 1, core.EMPTY_PROG_STR, core.EMPTY_PROG_STR, core.EMPTY_PROG_STR, 4, 0, 0, 40, 0, 0, 0, 0, 0, 4, 40, 1700000200, 1700000200, 0, 0, 0, 0, 0, 1700000200, id);
  assert.equal(S.db.prepare('SELECT best_score b FROM players WHERE id = ?').get(id).b, 777, '옛 UPDATE 는 best_score 를 건드리지 않는다');
  S.db.prepare('DELETE FROM players WHERE id = ?').run(id);
  assert.equal(count(S.db, 'SELECT COUNT(*) n FROM players'), 1500);
});

test('전원 best_score = 0 이면 새 정렬 = 옛 정렬(4개 보드, 순위가 하나도 안 바뀐다)이고, 새 내 순위식 = 옛 내 순위식(모든 선수)', () => {
  for (const b of Object.keys(BOARDS)) {
    const a = S.db.prepare(oldTopSql(b)).all().map((r) => r.nick + '#' + r.tag);
    const c = S.db.prepare(newTopSql(b)).all().map((r) => r.nick + '#' + r.tag);
    assert.deepEqual(c, a, b);
  }
  for (const b of Object.keys(BOARDS)) {
    const [s, l, u] = BOARDS[b];
    let diffs = 0;
    const rows = S.db.prepare('SELECT * FROM players WHERE hidden = 0 AND ' + s + ' > 0').all();
    for (const r of rows) {
      const S_ = r[s]; const L = r[l]; const U = r[u];
      const o = S.db.prepare(oldRankSql(b)).get(S_, S_, L, S_, L, U, S_, L, U, r.id).rank;
      const n = S.db.prepare(newRankSql(b)).get(...newRankParams(r, b)).rank;
      if (o !== n) diffs++;
    }
    assert.equal(diffs, 0, b + ' 내 순위 불일치 (n=' + rows.length + ')');
    assert.ok(rows.length > 1000);
  }
});

test('최고점을 넣은 뒤(절반 0점, 나머지 좁은 범위 + 일부러 같은 값 반복): 새 상위 50 = JS 참조 정렬, 새 내 순위식 = 모든 선수의 참조 순위 (4개 보드)', () => {
  const upd = S.db.prepare('UPDATE players SET best_score = ? WHERE id = ?');
  for (const r of S.db.prepare('SELECT id FROM players').all()) { const x = ri(10); upd.run(x < 5 ? 0 : x < 8 ? (1 + ri(6)) * 1000 : 1000 + ri(30000), r.id); }
  const nick = new Map(S.db.prepare('SELECT id, nick FROM players').all().map((r) => [r.id, r.nick]));
  let tiedGroups = 0;
  for (const b of Object.keys(BOARDS)) {
    const ref = refRows(S.db, b);
    const top = S.db.prepare(newTopSql(b)).all().map((r) => r.nick + '|' + r.score);
    assert.deepEqual(top, ref.slice(0, 50).map((r) => nick.get(r.id) + '|' + r.score), '상위 50 [' + b + ']');
    let wrong = 0;
    ref.forEach((r, i) => {
      const full = S.db.prepare('SELECT * FROM players WHERE id = ?').get(r.id);
      if (S.db.prepare(newRankSql(b)).get(...newRankParams(full, b)).rank !== i + 1) wrong++;
    });
    assert.equal(wrong, 0, '내 순위 불일치 [' + b + '] n=' + ref.length);
    const keys = {};
    ref.forEach((r) => { const k = r.stars + ':' + r.score; keys[k] = (keys[k] || 0) + 1; });
    tiedGroups += Object.values(keys).filter((n) => n > 1).length;
    assert.ok(ref.every((r) => r.hidden === 0 && r.stars > 0), '숨김(hidden≠0)·별 0개 선수는 순위에 없다 [' + b + ']');
  }
  assert.ok(tiedGroups > 200, '(별, 최고점)이 같은 묶음이 충분해야 동점 규칙을 시험하는 것: ' + tiedGroups);
});

test('EXPLAIN QUERY PLAN: 상위 50 은 4개 보드 모두 새 인덱스 한 줄(정렬용 임시 B-트리 없음), 내 순위 5개 부분 질의는 모두 COVERING INDEX 범위 탐색(표 전체 스캔 없음)', () => {
  for (const b of Object.keys(BOARDS)) {
    const p = plan(S.db, newTopSql(b), []);
    assert.ok(p.some((d) => d.includes('idx_rank2_' + b)), JSON.stringify(p));
    assert.ok(!p.some((d) => /TEMP B-TREE/.test(d)), JSON.stringify(p));
    assert.equal(p.length, 1, JSON.stringify(p));
  }
  for (const b of Object.keys(BOARDS)) {
    const r = S.db.prepare('SELECT * FROM players WHERE hidden = 0 AND ' + BOARDS[b][0] + ' > 0 LIMIT 1 OFFSET 400').get();
    const p = plan(S.db, newRankSql(b), newRankParams(r, b));
    assert.equal(p.filter((d) => d.includes('COVERING INDEX idx_rank2_' + b)).length, 5, b + ' ' + JSON.stringify(p));
    assert.ok(!p.some((d) => /SCAN players$/.test(d)), JSON.stringify(p));
  }
  // 새·옛 인덱스가 함께 있는 동안 옛 쿼리(롤백한 옛 Worker)는 옛 인덱스를 쓴다
  assert.ok(plan(S.db, oldTopSql('all'), []).some((d) => d.includes('idx_rank_all')));
});

test('3: 옛 인덱스 4개를 지운 뒤에도 새 쿼리가 정확하고(정렬 단계 없음), 롤백한 옛 쿼리도 결과는 맞다(정렬 단계만 생김)', () => {
  S.db.exec(m3);
  assert.equal(count(S.db, oldIdx), 0);
  assert.equal(count(S.db, newIdx), 4);
  for (const b of Object.keys(BOARDS)) {
    const ref = refRows(S.db, b);
    let wrong = 0;
    ref.forEach((r, i) => { const full = S.db.prepare('SELECT * FROM players WHERE id = ?').get(r.id); if (S.db.prepare(newRankSql(b)).get(...newRankParams(full, b)).rank !== i + 1) wrong++; });
    assert.equal(wrong, 0, b);
    const p = plan(S.db, newTopSql(b), []);
    assert.ok(p.some((d) => d.includes('idx_rank2_' + b)) && !p.some((d) => /TEMP B-TREE/.test(d)), JSON.stringify(p));
  }
  const old = S.db.prepare(oldTopSql('hard')).all();
  assert.ok(old.length > 0);
  assert.ok(plan(S.db, oldTopSql('hard'), []).some((d) => /TEMP B-TREE/.test(d)), '옛 쿼리는 정렬 단계가 생길 뿐');
  // 옛 정렬(남은 시간 우선)과 새 정렬은 점수가 섞인 DB 에서 달라질 수 있다 - 그래서 롤백한 옛 Worker 는 점수를 무시한 순서를 보여 준다(정상)
});

test('새 설치용 schema.sql(실제 파일) = 옛 schema + 1a + 1b + 3 의 결과: 열 집합·인덱스 정의가 같고, 마이그레이션한 DB 에 다시 붙여도 무해', () => {
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(read(path.join(SERVER, 'schema.sql')));
  const cols = (d) => d.prepare("SELECT name, type, \"notnull\" nn, dflt_value d FROM pragma_table_info('players') ORDER BY name").all().map((r) => JSON.stringify(Object.assign({}, r)));
  assert.deepEqual(cols(fresh), cols(S.db));
  const idx = (d) => d.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_rank%' ORDER BY name").all().map((r) => r.name + ':' + r.sql.replace(/\s+/g, ' '));
  assert.deepEqual(idx(fresh), idx(S.db));
  assert.equal(idx(fresh).length, 4);
  assert.ok(idx(fresh).every((x) => x.startsWith('idx_rank2_')));
  const rl = (d) => d.prepare("SELECT sql FROM sqlite_master WHERE name='rate_limits'").get().sql;
  assert.equal(rl(fresh), rl(S.db));
  // 마이그레이션된 DB 에 새 schema 를 다시 붙여도 무해(열 추가 없음, 인덱스는 IF NOT EXISTS), 새 DB 에 1a 를 잘못 적용하면 duplicate column
  S.db.exec(read(path.join(SERVER, 'schema.sql')));
  assert.equal(count(S.db, newIdx), 4);
  assert.throws(() => fresh.exec(m1a), /duplicate column name: best_score/);
  fresh.exec(m1b);
  assert.equal(count(fresh, newIdx), 4);
  // 새 설치 DB 의 열 목록 안에 best_score 가 하나뿐
  assert.equal(count(fresh, "SELECT COUNT(*) n FROM pragma_table_info('players') WHERE name='best_score'"), 1);
});

test('파일 일관성: 한 줄 SQL 3개에 "--" 주석이 없고 정말 한 줄이다 · migrate.sql(읽기용)의 문장 = 한 줄 파일 3개 · check.sql·ops.sql 의 쿼리가 모두 실행된다', () => {
  assert.ok([m1a, m1b, m3].every((x) => x.indexOf('--') < 0), '한 줄 SQL 에 -- 가 있으면 D1 콘솔이 줄바꿈을 지울 때 뒤 문장을 삼킨다');
  assert.ok([m1a, m1b, m3].every((x) => x.trim().indexOf('\n') < 0));
  assert.ok([m1a, m1b, m3].every((x) => /;\s*$/.test(x.trim())));
  const strip = (t) => t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/\s+/g, ' ').trim();
  const master = read(path.join(MIG, 'migrate.sql'));
  assert.equal(strip(master), [m1a, m1b, m3].map((x) => x.replace(/\s+/g, ' ').trim()).join(' '));
  const run = (file, pre) => {
    let n = 0;
    for (const stmt of strip(pre ? read(path.join(MIG, file)).replace(pre, '') : read(path.join(MIG, file))).split(';').map((x) => x.trim()).filter(Boolean)) { n++; S.db.prepare(stmt).all(); }
    return n;
  };
  assert.equal(run('check.sql', /-- \[[^\n]*\n/g), 8);
  assert.equal(run('ops.sql'), 4);
  // 조치용 문장(주석 처리됨)이 실수로 살아 있지 않다
  const ops = read(path.join(MIG, 'ops.sql'));
  assert.ok(!ops.split('\n').some((l) => /^\s*(UPDATE|DELETE|DROP|ALTER|INSERT)\b/i.test(l)), 'ops.sql 의 실행 가능한 줄은 읽기 전용 SELECT 뿐');
  assert.ok(/점수만 0으로 되돌리는 것은 소용없음/.test(ops));
  const check = read(path.join(MIG, 'check.sql'));
  assert.ok(!check.split('\n').some((l) => /^\s*(UPDATE|DELETE|DROP|ALTER|INSERT)\b/i.test(l)));
});
