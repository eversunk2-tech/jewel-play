/* 최고점 도전 모드: 옛 Worker·옛 클라이언트 호환과 배포 순서 시험 (spec §46.3.4 호환 표, §46.3.7, 46.5 서버 항목 ⑤ ⑥)
 *  - 옛 Worker = 커밋 ea84476(최고점 도전 모드 이전, 지금 운영 중인 것)의 dist/worker.js 사본 `fixtures/worker.old.mjs` (고정, sha256 으로 지킨다)
 *  - 옛 DB = 같은 시점의 schema.sql (migrate.test.js 와 같은 고정 문자열을 쓰지 않고 fixtures/schema.old.sql 에서 읽는다)
 *  옛 번들은 시계를 옵션으로 받지 않으므로(fetch(request, env)만 있다) 호출하는 동안만 Date.now 를 시험 시계로 바꾼다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { D1Like } = require('../mock/d1-adapter');
const worker = require('../src/worker');
const { uuid, prog } = require('./helpers');

const FIX = path.join(__dirname, 'fixtures');
const MIG = path.join(__dirname, '..', 'migrations');
const OLD_WORKER_FILE = path.join(FIX, 'worker.old.mjs');
const OLD_WORKER_SHA256 = 'd33629edf69eb8a2741653ad326a547385bbab1f66a2e278532d41827bf670af';
const OLD_SCHEMA_FILE = path.join(FIX, 'schema.old.sql');
const OLD_SCHEMA_SHA256 = '5d50ef8ebd3451c489932f7b8ca05b0ea15f91902014b1246ac52a664d90a48d';
const read = (f) => fs.readFileSync(f, 'utf8');
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const m1a = () => read(path.join(MIG, 'migrate-1a-alter.oneline.sql'));
const m1b = () => read(path.join(MIG, 'migrate-1b-indexes.oneline.sql'));
const m3 = () => read(path.join(MIG, 'migrate-3-drop-old-indexes.oneline.sql'));

let OLD = null;
async function oldWorker() {
  if (!OLD) OLD = (await import(pathToFileURL(OLD_WORKER_FILE).href)).default;
  return OLD;
}
function oldDb() { const d = new DatabaseSync(':memory:'); d.exec(read(OLD_SCHEMA_FILE)); return new D1Like(d); }
function newDb() { return require('../mock/d1-adapter').createDb(); }

let ipSeq = 0;
/** kind: 'old' | 'new'. 호출하는 동안 Date.now 를 clock.ms 로 바꾼다 */
function caller(kind, env, clock) {
  return async function call(method, p, body, headers) {
    const realNow = Date.now;
    Date.now = () => clock.ms;
    try {
      const init = { method, headers: Object.assign({ 'cf-connecting-ip': '10.2.' + Math.floor(ipSeq / 200) + '.' + (ipSeq++ % 200) }, headers || {}) };
      if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
      const req = new Request('https://hall.example' + p, init);
      const res = kind === 'old' ? (await oldWorker()).fetch(req, env) : worker.handle(req, env, { now: () => clock.ms });
      const r = await res;
      const text = await r.text();
      return { status: r.status, headers: r.headers, json: JSON.parse(text), text };
    } finally { Date.now = realNow; }
  };
}
const mkEnv = (DB) => ({ DB, ALLOWED_ORIGINS: 'https://eversunk2-tech.github.io', LB_CACHE_SEC: '0', IP_SALT: 'compat-salt' });
const newClock = () => ({ ms: Date.UTC(2026, 10, 7, 1, 0, 0) });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const sync = (call, body) => call('POST', '/api/sync', Object.assign({ v: 1 }, body));
const rowsOf = (DB, sql, ...p) => DB.db.prepare(sql).all(...p).map((r) => Object.assign({}, r));

test('고정 사본 무결성: 옛 Worker 번들과 옛 schema 가 바뀌지 않았다', () => {
  assert.equal(sha(fs.readFileSync(OLD_WORKER_FILE)), OLD_WORKER_SHA256, 'fixtures/worker.old.mjs 를 고치지 마세요(운영 중인 Worker 와 같아야 한다)');
  assert.equal(sha(fs.readFileSync(OLD_SCHEMA_FILE)), OLD_SCHEMA_SHA256);
  assert.ok(!/best_score|score/.test(read(OLD_WORKER_FILE).replace(/\/\/.*$/gm, '')), '옛 번들은 점수를 모른다');
});

test('새 클라이언트 + 옛 Worker(옛 DB): s 를 무시하고 d 가 있으면 400 이 없다, s 만 있으면 400 bad_request, 응답·순위표에 score 가 없다', async () => {
  const clock = newClock();
  const DB = oldDb();
  const call = caller('old', mkEnv(DB), clock);
  const pid = uuid();
  let r = await sync(call, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70]), s: 12340 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.me.score, undefined, '그래서 새 클라이언트는 ack(me.score)가 없으면 다음에 다시 보낸다');
  assert.equal(r.json.me.stars.all, 3);
  clock.ms += 10000;
  r = await sync(call, { pid, d: prog([70, 66]), s: 99999 });
  assert.equal(r.status, 200);
  assert.equal(r.json.changed, true);
  clock.ms += 10000;
  r = await sync(call, { pid, s: 5000 });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'bad_request');
  r = await sync(call, { pid, d: prog([70, 66]), s: 'abc' });
  assert.equal(r.status, 200, '옛 Worker 는 이상한 s 도 무시한다');
  const lb = await call('GET', '/api/leaderboard?board=all');
  assert.equal(lb.json.rows.length, 1);
  assert.equal(lb.json.rows[0].score, undefined);
});

test('같은 동작 순서를 옛 Worker(옛 DB)와 새 Worker(새 DB)에 시키면, 옛 클라이언트가 보는 응답(상태·본문·헤더)이 score 필드를 빼고 똑같다 (s 없는 본문)', async () => {
  const run = async (kind) => {
    const clock = newClock();
    const DB = kind === 'old' ? oldDb() : newDb();
    const call = caller(kind, mkEnv(DB), clock);
    const out = [];
    const rec = (label, r) => out.push({ label, status: r.status, retry: r.headers.get('retry-after'), cache: r.headers.get('cache-control'), json: r.json });
    const A = '11111111-2222-4333-8444-555555555551';
    const B = '11111111-2222-4333-8444-555555555552';
    const C = '11111111-2222-4333-8444-555555555553';
    const pubs = {};
    let r;
    r = await sync(call, { pid: A, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70, 40]) }); rec('A 등록', r); pubs.A = r.json.me.pub;
    r = await sync(call, { pid: B, profile: { nick: '달토끼', avatar: 5 }, d: prog([], [70]) }); rec('B 등록', r); pubs.B = r.json.me.pub;
    r = await sync(call, { pid: C, profile: { nick: '새싹이', avatar: 9 } }); rec('C 등록(진행 없음)', r); pubs.C = r.json.me.pub;
    r = await sync(call, { pid: A, d: prog([70, 40, 20]) }); rec('A 같은 초에 변경 -> 429', r);
    clock.ms += 10000;
    r = await sync(call, { pid: A, d: prog([70, 40, 20]) }); rec('A 변경', r);
    r = await sync(call, { pid: A, d: prog([70, 40, 20]) }); rec('A 변경 없음', r);
    r = await sync(call, { pid: A, d: prog([10, 10, 10]) }); rec('A 낮은 값 무시', r);
    clock.ms += 10000;
    r = await sync(call, { pid: B, profile: { nick: '달토끼', avatar: 7 } }); rec('B 아바타 변경', r);
    r = await sync(call, { pid: A, d: { easy: [1] } }); rec('A 잘못된 d', r);
    r = await sync(call, { pid: A, d: prog([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }); rec('A 잘못된 길이', r);
    r = await sync(call, { pid: uuid(), profile: { nick: '시발', avatar: 1 } }); rec('금칙어', r);
    r = await sync(call, { pid: uuid(), d: prog([70]) }); rec('profile 없는 첫 제출', r);
    r = await call('POST', '/api/sync', { pid: A, d: prog([70]) }); rec('v 없음', r);
    r = await call('POST', '/api/sync', { v: 2, pid: A, d: prog([70]) }); rec('v 2', r);
    for (const b of ['all', 'easy', 'normal', 'hard']) { r = await call('GET', '/api/leaderboard?board=' + b); rec('순위표 ' + b, r); }
    for (const [k, b] of [['A', 'all'], ['B', 'normal'], ['C', 'all'], ['A', 'hard']]) { r = await call('GET', `/api/rank?board=${b}&pub=${pubs[k]}`); rec('내 순위 ' + k + ' ' + b, r); }
    r = await call('GET', '/api/rank?board=all&pub=ZZZZZZZZ'); rec('없는 pub', r);
    r = await call('GET', '/api/health'); rec('health', r);
    r = await call('POST', '/api/delete', { v: 1, pid: A }); rec('A 삭제', r);
    r = await call('GET', '/api/leaderboard?board=all'); rec('삭제 뒤 순위표', r);
    r = await call('GET', '/api/nope'); rec('없는 주소', r);
    return out;
  };
  const strip = (x) => {                                             // 무작위(pub·번호표)와 새 필드(score·scoreRejected)를 뺀다
    if (Array.isArray(x)) return x.map(strip);
    if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) if (!['pub', 'tag', 'score', 'scoreRejected'].includes(k)) o[k] = strip(x[k]); return o; }
    return x;
  };
  const a = await run('old');
  const b = await run('new');
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].status, a[i].status, a[i].label + ' 상태');
    assert.equal(b[i].retry, a[i].retry, a[i].label + ' Retry-After');
    assert.equal(b[i].cache, a[i].cache, a[i].label + ' Cache-Control');
    assert.deepEqual(strip(b[i].json), strip(a[i].json), a[i].label);
    assert.deepEqual(a[i].json && JSON.stringify(a[i].json).includes('"score"'), false, a[i].label + ': 옛 Worker 응답에는 score 가 없다');
  }
  // 새 필드가 실제로 더해졌다(시험이 알맹이 없는 비교가 아님)
  const reg = b.find((x) => x.label === 'A 등록');
  assert.equal(reg.json.me.score, 0);
  assert.ok(b.find((x) => x.label === '순위표 all').json.rows.every((x) => x.score === 0));
  assert.equal(b.find((x) => x.label === '내 순위 A all').json.score, 0);
});

test('새 Worker + 옛 클라이언트 본문(s 없음): 점수가 있는 사람의 점수·정렬을 건드리지 않고 모든 엔드포인트가 성공한다', async () => {
  const clock = newClock();
  const DB = newDb();
  const call = caller('new', mkEnv(DB), clock);
  const a = uuid();
  const reg = await sync(call, { pid: a, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70]), s: 44000 });
  assert.equal(reg.json.me.score, 44000);
  clock.ms += 120000;
  for (const body of [{ d: prog([70, 66]) }, { d: prog([70, 66]) }, { profile: { nick: '별빛냥', avatar: 8 } }, { profile: { nick: '별빛냥', avatar: 8 }, d: prog([70, 66, 55]) }]) {
    clock.ms += 5000;
    const r = await sync(call, Object.assign({ pid: a }, body));
    assert.equal(r.status, 200, JSON.stringify(body));
    assert.equal(r.json.me.score, 44000);
    assert.equal(rowsOf(DB, 'SELECT best_score FROM players')[0].best_score, 44000);
  }
  assert.equal((await call('GET', '/api/leaderboard?board=all')).json.rows[0].score, 44000);
  assert.equal((await call('GET', '/api/rank?board=all&pub=' + reg.json.me.pub)).json.rank, 1);
  assert.equal((await call('POST', '/api/delete', { v: 1, pid: a })).json.deleted, true);
});

test('배포 순서 ① DB 마이그레이션 → 옛 Worker 계속 동작 → ② 새 Worker 로 교체 → 롤백(옛 Worker) → ④ 옛 인덱스 삭제 (spec §46.3.7), 사이에 데이터 손실 없음', async () => {
  const clock = newClock();
  const DB = oldDb();
  const callOld = caller('old', mkEnv(DB), clock);
  const callNew = caller('new', mkEnv(DB), clock);
  // 옛 Worker + 옛 DB 로 12명 등록
  const players = [];
  for (let i = 0; i < 12; i++) {
    const pid = String(20000000 + i) + '-2222-4333-8444-' + String(555555550000 + i);
    const d = prog([], []);
    for (let k = 0; k <= i % 4; k++) d.normal[k] = 40 + (i % 3) * 10;
    clock.ms += 5000;
    const r = await sync(callOld, { pid, profile: { nick: '선수' + String.fromCharCode(0xAC00 + i), avatar: 1 + (i % 16) }, d });
    assert.equal(r.status, 200, r.text);
    players.push({ pid, pub: r.json.me.pub });
  }
  const order = async (call) => (await call('GET', '/api/leaderboard?board=normal')).json.rows.map((x) => x.nick + x.tag);
  const before = await order(callOld);
  assert.equal(before.length, 12);
  // ① 마이그레이션 1a, 1b
  DB.exec(m1a());
  DB.exec(m1b());
  clock.ms += 100000;
  assert.deepEqual(await order(callOld), before, '마이그레이션 뒤에도 옛 Worker 순위표가 같은 순서');
  const dd = prog([], []); for (let k = 0; k < 6; k++) dd.normal[k] = 70;
  clock.ms += 10000;
  let up = await sync(callOld, { pid: players[0].pid, d: dd });
  assert.ok(up.status === 200 && up.json.changed === true, '옛 Worker 의 UPDATE: ' + up.text);
  const np = await sync(callOld, { pid: '99999999-2222-4333-8444-555555555555', profile: { nick: '새친구', avatar: 2 }, d: prog([], []) });
  assert.equal(np.status, 200, '옛 Worker 의 INSERT');
  const rk = await callOld('GET', '/api/rank?board=normal&pub=' + players[0].pub);
  assert.ok(rk.status === 200 && rk.json.rank >= 1, '옛 Worker 의 내 순위');
  assert.equal(rowsOf(DB, 'SELECT COUNT(*) n FROM players WHERE best_score <> 0')[0].n, 0, '옛 Worker 는 best_score 를 건드리지 않는다');
  // ② 새 Worker: 같은 DB, 같은 사람들
  clock.ms += 100000;
  const nowOrder = await order(callNew);
  assert.equal(nowOrder.length, 12, '새친구는 별이 0개라 순위표에 없다');
  const scoreUp = await sync(callNew, { pid: players[5].pid, d: prog([], []), s: 8000 });
  assert.equal(scoreUp.status, 200, scoreUp.text);
  assert.equal(scoreUp.json.me.score, 8000);
  assert.equal(rowsOf(DB, 'SELECT best_score FROM players WHERE pub = ?', players[5].pub)[0].best_score, 8000);
  // 롤백: 다시 옛 Worker. 점수를 모르는 채로 모든 요청이 성공하고 점수는 그대로
  clock.ms += 100000;
  const dd2 = prog([], []); for (let k = 0; k < 7; k++) dd2.normal[k] = 70;
  up = await sync(callOld, { pid: players[5].pid, d: dd2 });
  assert.ok(up.status === 200 && up.json.changed === true);
  assert.equal(rowsOf(DB, 'SELECT best_score FROM players WHERE pub = ?', players[5].pub)[0].best_score, 8000, '롤백한 옛 Worker 가 점수를 지우지 않는다');
  assert.equal((await callOld('GET', '/api/leaderboard?board=all')).status, 200);
  // ④ 옛 인덱스 삭제: 새 Worker 도 옛 Worker(롤백)도 동작
  DB.exec(m3());
  assert.equal(rowsOf(DB, "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('idx_rank_all','idx_rank_easy','idx_rank_normal','idx_rank_hard')")[0].n, 0);
  assert.equal(rowsOf(DB, "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('idx_rank2_all','idx_rank2_easy','idx_rank2_normal','idx_rank2_hard')")[0].n, 4);
  clock.ms += 100000;
  for (const call of [callNew, callOld]) {
    for (const b of ['all', 'easy', 'normal', 'hard']) assert.equal((await call('GET', '/api/leaderboard?board=' + b)).status, 200);
    assert.equal((await call('GET', '/api/rank?board=normal&pub=' + players[5].pub)).status, 200);
  }
  const final = (await callNew('GET', '/api/leaderboard?board=normal')).json;
  assert.equal(final.of, 12);
  assert.equal(final.rows.length, 12);
  // 점수 있는 선수가 같은 별 묶음에서 앞선다(새 정렬)
  const stars = final.rows.map((x) => x.stars);
  assert.deepEqual(stars, stars.slice().sort((x, y) => y - x));
  const withScore = final.rows.findIndex((x) => x.score === 8000);
  assert.ok(withScore >= 0);
  assert.ok(final.rows.slice(0, withScore).every((x) => x.stars > final.rows[withScore].stars || x.score >= 8000), '같은 별에서는 점수 있는 사람이 점수 없는 사람보다 앞');
});

test('순서를 어긴 경우(spec §46.3.7): 열이 없는 DB 에 새 Worker 를 먼저 올리면 쓰기·순위표는 500 server_error(데이터 불변), 변경 없는 제출은 통과, health 는 항상 ok, 마이그레이션하면 바로 복구', async () => {
  const clock = newClock();
  const DB = oldDb();
  const callOld = caller('old', mkEnv(DB), clock);
  const callNew = caller('new', mkEnv(DB), clock);
  const pid = uuid();
  const reg = await sync(callOld, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70]) });
  assert.equal(reg.status, 200);
  clock.ms += 100000;
  const snapshot = JSON.stringify(rowsOf(DB, 'SELECT * FROM players'));
  await quiet(async () => {
    assert.equal((await callNew('GET', '/api/health')).status, 200);
    const lb = await callNew('GET', '/api/leaderboard?board=all');
    assert.equal(lb.status, 500);
    assert.equal(lb.json.error.code, 'server_error');
    const rk = await callNew('GET', '/api/rank?board=all&pub=' + reg.json.me.pub);
    assert.equal(rk.status, 500);
    const same = await sync(callNew, { pid, d: prog([70]) });                       // 변경 없음: SELECT * 만으로 끝나므로 통과
    assert.equal(same.status, 200);
    assert.equal(same.json.changed, false);
    assert.equal(same.json.me.score, 0);
    const wr = await sync(callNew, { pid, d: prog([70, 66]) });                     // 쓰기: best_score 열이 없어 실패
    assert.equal(wr.status, 500);
    assert.equal(wr.json.error.code, 'server_error');
    const create = await sync(callNew, { pid: uuid(), profile: { nick: '새친구', avatar: 2 }, d: prog([70]) });
    assert.equal(create.status, 500);
  });
  assert.equal(JSON.stringify(rowsOf(DB, 'SELECT * FROM players')), snapshot, '실패한 쓰기는 데이터를 바꾸지 않는다');
  DB.exec(m1a());
  DB.exec(m1b());
  assert.equal((await callNew('GET', '/api/leaderboard?board=all')).status, 200);
  const ok = await sync(callNew, { pid, d: prog([70, 66]), s: 1234 });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.me.score, 1234);
});

test('새 Worker + 새 DB 의 소스에 고정 사본의 흔적(옛 인덱스 이름)이 남아 있지 않다', () => {
  const src = read(path.join(__dirname, '..', 'src', 'worker.js')) + read(path.join(__dirname, '..', 'src', 'core.js')) + read(path.join(__dirname, '..', 'schema.sql'));
  assert.ok(!/idx_rank_(all|easy|normal|hard)/.test(src.replace(/--[^\n]*$/gm, '').replace(/\/\/[^\n]*$/gm, '')), '새 schema·Worker 코드는 옛 인덱스 이름을 쓰지 않는다');
});
