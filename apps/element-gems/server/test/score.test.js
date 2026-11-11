/* 최고점 도전 모드 서버 시험 (spec §46.3, 46.5 서버 항목 ② ③ ④ ⑥)
 *  - `s`(최고점) 검증·병합·상한·60초 간격, 응답/순위표/내 순위/관리자 검색의 score, 새 정렬(별 -> 최고점 -> 남은 시간 -> 먼저 달성 -> id)
 *  - 마이그레이션은 migrate.test.js, 옛 Worker·옛 클라이언트 호환은 compat.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const { makeEnv, uuid, prog } = require('./helpers');

const CAP = core.SCORE_CAP;
const sync = (t, body, headers) => t.call('POST', '/api/sync', Object.assign({ v: 1 }, body), headers);
const rows = (t, sql, ...params) => t.DB.db.prepare(sql).all(...params).map((r) => Object.assign({}, r));
const row = (t) => rows(t, 'SELECT * FROM players ORDER BY id')[0];
const board = async (t, b) => (await t.call('GET', '/api/leaderboard?board=' + b)).json;
function spyWrites(t) {
  const log = [];
  const orig = t.env.DB.prepare.bind(t.env.DB);
  t.env.DB.prepare = (sql) => { log.push(sql.trim().split(/\s+/)[0].toUpperCase()); return orig(sql); };
  return log;
}
const hasWrite = (log) => log.some((x) => x !== 'SELECT');

async function register(t, nick, d, s, avatar) {
  const pid = uuid();
  const body = { pid, profile: { nick: nick || '별빛냥', avatar: avatar || 3 } };
  if (d) body.d = d;
  if (s !== undefined) body.s = s;
  const r = await sync(t, body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { pid, me: r.json.me, res: r };
}

/** 시드 고정 난수(mulberry32): rnd(n) = 0..n-1 */
function rng(seed) {
  let a = seed | 0;
  return (n) => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** 직접 INSERT: 순위 정렬 시험용 가짜 선수. 별 열·남은 시간 열·up 열·최고점을 마음대로 정한다 */
let seq = 0;
function insertRaw(t, p) {
  const i = ++seq;
  const st = Object.assign({ easy: 0, normal: 0, hard: 0 }, p.stars);
  const lf = Object.assign({ easy: 0, normal: 0, hard: 0 }, p.left);
  const up = Object.assign({ all: 100, easy: 100, normal: 100, hard: 100 }, p.up);
  const prog0 = core.EMPTY_PROG_STR;
  const r = t.DB.db.prepare(
    'INSERT INTO players (pid_hash, pub, nick, nick_key, tag, avatar, prog_easy, prog_normal, prog_hard,' +
    ' stars_easy, stars_normal, stars_hard, left_easy, left_normal, left_hard, best_easy, best_normal, best_hard,' +
    ' total_stars, total_left, best_score, up_all, up_easy, up_normal, up_hard, hidden, nick_changes, nick_day, created_at, last_write_at)' +
    ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run('h' + i, String(10000000 + i), p.nick || 'n' + i, p.nick || 'n' + i, i % 10000, 1 + (i % 16), prog0, prog0, prog0,
    st.easy, st.normal, st.hard, lf.easy, lf.normal, lf.hard, 0, 0, 0,
    st.easy + 2 * st.normal + 3 * st.hard, lf.easy + lf.normal + lf.hard, p.score || 0, up.all, up.easy, up.normal, up.hard,
    p.hidden || 0, 0, 0, 1700000000, 1700000000);
  return { id: Number(r.lastInsertRowid), pub: String(10000000 + i) };
}

/* ---------------------------------------------------------------- 옛 클라이언트(s 없음) */

test('s 없음(옛 클라이언트 본문): 점수 변화 없음·응답 me.score = 저장값·변경 없는 제출은 쓰기 0', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 12345);
  assert.equal(a.me.score, 12345);
  t.advance(100);
  const log = spyWrites(t);
  const same = await sync(t, { pid: a.pid, d: prog([70]) });                  // 옛 클라이언트 본문: s 없음, 변화 없음
  assert.equal(same.status, 200);
  assert.equal(same.json.changed, false);
  assert.equal(same.json.me.score, 12345, '응답 me.score 는 저장된 값');
  assert.equal(same.json.scoreRejected, undefined);
  assert.equal(hasWrite(log), false, '쓰기 0: ' + log.join(','));
  // 진행만 오른 제출도 점수·점수 시각을 건드리지 않는다
  t.advance(10);
  const before = row(t);
  const up = await sync(t, { pid: a.pid, d: prog([70, 66]) });
  assert.equal(up.json.changed, true);
  assert.equal(up.json.me.score, 12345);
  const after = row(t);
  assert.equal(after.best_score, 12345);
  assert.equal(after.up_normal, before.up_normal, '진행만 오르면 별이 안 늘어난 난이도 up 은 그대로');
  assert.ok(after.up_easy > before.up_easy);
  // 점수가 한 번도 없는 사람은 0
  const z = await register(t, '새싹이', prog([70]));
  assert.equal(z.me.score, 0);
  assert.equal(rows(t, 'SELECT best_score FROM players WHERE pub = ?', z.me.pub)[0].best_score, 0);
});

/* ---------------------------------------------------------------- 병합 */

test('s: 첫 제출(profile + d + s)은 저장하고 네 up_* 를 현재 시각으로, 응답·순위표·내 순위에 score', async () => {
  const t = makeEnv();
  const now = Math.floor(t.clock.ms / 1000);
  const a = await register(t, '별빛냥', prog([70]), 54321);
  assert.equal(a.res.json.changed, true);
  assert.equal(a.me.score, 54321);
  assert.equal(a.res.json.scoreRejected, undefined);
  const r = row(t);
  assert.equal(r.best_score, 54321);
  assert.deepEqual([r.up_all, r.up_easy, r.up_normal, r.up_hard], [now, now, now, now], '최고점이 처음 생기면 네 up_* 모두 현재 시각');
  const lb = await board(t, 'all');
  assert.deepEqual(lb.rows.map((x) => [x.nick, x.stars, x.score]), [['별빛냥', 3, 54321]]);
  assert.equal((await board(t, 'easy')).rows[0].score, 54321);
  const rk = (await t.call('GET', '/api/rank?board=all&pub=' + a.me.pub)).json;
  assert.equal(rk.score, 54321);
  assert.equal(rk.rank, 1);
});

test('s: 개선만 저장(max 병합, 감소 불가), 같거나 낮으면 쓰기 0, up_* 는 오를 때만 갱신', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 10000);
  const t0 = Math.floor(t.clock.ms / 1000);
  t.advance(60);
  const up1 = await sync(t, { pid: a.pid, d: prog([70]), s: 20000 });
  assert.equal(up1.status, 200);
  assert.equal(up1.json.changed, true);
  assert.equal(up1.json.me.score, 20000);
  let r = row(t);
  assert.equal(r.best_score, 20000);
  assert.deepEqual([r.up_all, r.up_easy, r.up_normal, r.up_hard], [t0 + 60, t0 + 60, t0 + 60, t0 + 60]);
  assert.equal(r.last_write_at, t0 + 60);
  // 낮은 점수·같은 점수: 변경 없음, 쓰기 0, 저장값을 응답
  for (const s of [0, 1, 19999, 20000]) {
    t.advance(1000);
    const log = spyWrites(t);
    const low = await sync(t, { pid: a.pid, d: prog([70]), s });
    assert.equal(low.status, 200, 's=' + s);
    assert.equal(low.json.changed, false, 's=' + s);
    assert.equal(low.json.me.score, 20000, 's=' + s);
    assert.equal(hasWrite(log), false, 's=' + s + ' 쓰기 ' + log.join(','));
    assert.equal(row(t).best_score, 20000);
    assert.equal(row(t).up_all, t0 + 60, 'up 그대로');
  }
  // 진행이 함께 오르는 요청에 낮은 s 가 실려도 저장된 점수는 내려가지 않는다(쓰기는 일어나지만 best_score 는 max 병합)
  t.advance(10);
  const mixed = await sync(t, { pid: a.pid, d: prog([70, 66]), s: 100 });
  assert.equal(mixed.json.changed, true);
  assert.equal(mixed.json.me.score, 20000);
  assert.equal(row(t).best_score, 20000);
  assert.equal(row(t).up_all, Math.floor(t.clock.ms / 1000), '별이 올랐으므로 up_all 은 지금 시각(점수는 그대로여도)');
  // 오래된 스냅샷(두 기기): 낮은 점수를 늦게 보내도 높은 값이 남는다. 높은 점수는 올라간다
  t.advance(1000);
  const hi = await sync(t, { pid: a.pid, d: prog([70]), s: 99999 });
  assert.equal(hi.json.me.score, 99999);
  assert.equal(row(t).up_all, Math.floor(t.clock.ms / 1000));
  t.advance(1000);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70]), s: 5 })).json.me.score, 99999);
  assert.equal(row(t).best_score, 99999);
});

test('s 와 진행(d)이 함께 오르는 요청: 둘 다 저장되고 up_* 가 갱신된다', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 1000);
  t.advance(120);
  const r = await sync(t, { pid: a.pid, d: prog([70, 66]), s: 2000 });
  assert.equal(r.status, 200);
  assert.equal(r.json.me.score, 2000);
  assert.equal(r.json.me.stars.easy, 6);
  assert.deepEqual([row(t).best_score, row(t).prog_easy.split(',').slice(0, 2).join(',')], [2000, '70,66']);
});

test('s: 별이 0개인 사람의 점수는 저장되지만 순위(별 > 0)에는 나오지 않고, 별이 생기면 그 점수로 순위가 매겨진다', async () => {
  const t = makeEnv();
  const a = await register(t, '점수만', undefined, 77777);              // profile + s (d 없음) - 첫 제출
  assert.equal(a.me.score, 77777);
  assert.equal(row(t).best_score, 77777);
  assert.equal((await board(t, 'all')).rows.length, 0);
  const rk = (await t.call('GET', '/api/rank?board=all&pub=' + a.me.pub)).json;
  assert.equal(rk.rank, null);
  assert.equal(rk.score, 77777);
  const b = await register(t, '별만', prog([70]));
  t.advance(5);
  await sync(t, { pid: a.pid, d: prog([70]) });                      // 같은 별 3개가 된다
  assert.deepEqual((await board(t, 'all')).rows.map((x) => [x.nick, x.score]), [['점수만', 77777], ['별만', 0]]);
  assert.equal((await t.call('GET', '/api/rank?board=all&pub=' + b.me.pub)).json.rank, 2);
});

/* ---------------------------------------------------------------- 상한 */

test('s 상한: SCORE_CAP 은 저장, 상한+1 은 그 값만 무시(scoreRejected)하고 나머지는 정상 처리', async () => {
  const t = makeEnv();
  assert.equal(CAP, 280000);
  const a = await register(t, '별빛냥', prog([70]), CAP);
  assert.equal(a.me.score, CAP);
  assert.equal(a.res.json.scoreRejected, undefined);
  assert.equal(row(t).best_score, CAP);
  // 이미 저장된 사람이 상한+1 을 보내도 값은 그대로, d 는 정상 처리
  t.advance(1000);
  const r = await sync(t, { pid: a.pid, d: prog([70, 66]), s: CAP + 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.scoreRejected, true);
  assert.equal(r.json.changed, true, 'd 가 올랐으므로 changed');
  assert.equal(r.json.me.score, CAP);
  assert.equal(r.json.me.stars.easy, 6);
  assert.equal(row(t).best_score, CAP);
  // 변경이 전혀 없는 제출 + 상한 초과: 쓰기 0, scoreRejected 만 알려 준다
  t.advance(1000);
  const log = spyWrites(t);
  const same = await sync(t, { pid: a.pid, d: prog([70, 66]), s: 99999999 });
  assert.equal(same.json.changed, false);
  assert.equal(same.json.scoreRejected, true);
  assert.equal(hasWrite(log), false);
});

test('s 상한: 새 플레이어의 첫 제출이 상한 초과여도 등록은 정상(점수 0), 상한 이하일 때는 scoreRejected 가 없다', async () => {
  const t = makeEnv();
  const pid = uuid();
  const r = await sync(t, { pid, profile: { nick: '큰숫자', avatar: 2 }, d: prog([70]), s: CAP + 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.scoreRejected, true);
  assert.equal(r.json.me.score, 0);
  assert.equal(r.json.me.stars.easy, 3);
  assert.equal(row(t).best_score, 0);
  assert.deepEqual([row(t).up_all, row(t).up_normal], [Math.floor(t.clock.ms / 1000), 0], '점수를 무시했으면 up 도 별 기준 그대로');
  // 정수로 보이는 거대한 값도 무시일 뿐 오류가 아니다
  t.advance(1000);
  const big = await sync(t, { pid, d: prog([70]), s: Number.MAX_SAFE_INTEGER });
  assert.equal(big.status, 200);
  assert.equal(big.json.scoreRejected, true);
  const ok = await sync(t, { pid, d: prog([70]), s: CAP });
  assert.equal(ok.json.scoreRejected, undefined);
  assert.equal(ok.json.me.score, CAP);
});

/* ---------------------------------------------------------------- 검증 */

test('s 검증: 음수·소수·문자열·null·true·배열·객체는 400 progress_invalid(field s)이고 아무것도 저장하지 않는다', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 500);
  t.advance(1000);
  const before = row(t);
  for (const s of [-1, 1.5, 0.1, '100', '', 'abc', null, true, false, [], [100], {}, { v: 1 }]) {
    const r = await sync(t, { pid: a.pid, d: prog([70, 66, 66]), s });
    assert.equal(r.status, 400, JSON.stringify(s));
    assert.equal(r.json.error.code, 'progress_invalid', JSON.stringify(s));
    assert.equal(r.json.error.field, 's', JSON.stringify(s));
    assert.deepEqual(row(t), before, '검증 실패는 DB 를 바꾸지 않는다: ' + JSON.stringify(s));
  }
  // 새 플레이어 등록도 s 가 틀리면 만들어지지 않는다
  const bad = await sync(t, { pid: uuid(), profile: { nick: '새로운', avatar: 1 }, d: prog([70]), s: -5 });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.field, 's');
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 1);
  // 0 과 상한은 정상
  assert.equal((await sync(t, { pid: a.pid, d: prog([70]), s: 0 })).status, 200);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70]), s: CAP })).status, 200);
  assert.equal(row(t).best_score, CAP);
  // d 가 틀리면 s 가 맞아도 d 오류(기존 규칙 그대로)
  const dBad = await sync(t, { pid: a.pid, d: { easy: [1] }, s: 5 });
  assert.equal(dBad.json.error.field, 'd.easy');
});

test('s 만 있고 profile·d 가 없으면 400 bad_request(옛 Worker 와 같게), profile + s 는 가능', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  const only = await sync(t, { pid: a.pid, s: 5000 });
  assert.equal(only.status, 400);
  assert.equal(only.json.error.code, 'bad_request');
  t.advance(100);
  const withProfile = await sync(t, { pid: a.pid, profile: { nick: '별빛냥', avatar: 3 }, s: 5000 });
  assert.equal(withProfile.status, 200);
  assert.equal(withProfile.json.me.score, 5000);
  assert.equal(row(t).best_score, 5000);
});

/* ---------------------------------------------------------------- 쓰기 간격 */

test('쓰기 간격: 최고점이 오르는 요청은 마지막 쓰기 후 60초(59초는 429 + Retry-After, 60초는 통과), 진행·프로필은 3초 그대로', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 1000);              // last_write_at = T0
  t.advance(10);
  const early = await sync(t, { pid: a.pid, d: prog([70]), s: 2000 });
  assert.equal(early.status, 429);
  assert.equal(early.json.error.code, 'rate_limited');
  assert.equal(early.headers.get('retry-after'), '50', '남은 초');
  assert.equal(row(t).best_score, 1000, '거절되면 저장 안 됨');
  t.advance(49);
  const r59 = await sync(t, { pid: a.pid, d: prog([70]), s: 2000 });
  assert.equal(r59.status, 429);
  assert.equal(r59.headers.get('retry-after'), '1');
  t.advance(1);
  const r60 = await sync(t, { pid: a.pid, d: prog([70]), s: 2000 });
  assert.equal(r60.status, 200);
  assert.equal(r60.json.me.score, 2000);
  // 진행(d)만 오르는 요청은 3초 규칙: 방금 점수를 쓴 직후 3초가 지나면 통과(점수 간격과 무관)
  t.advance(3);
  const dOnly = await sync(t, { pid: a.pid, d: prog([70, 66]) });
  assert.equal(dOnly.status, 200);
  assert.equal(dOnly.json.changed, true);
  // 진행 쓰기 직후 60초 안의 점수 개선은 마지막 쓰기(진행 쓰기) 기준으로 막힌다
  t.advance(30);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70, 66]), s: 3000 })).status, 429);
  t.advance(30);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70, 66]), s: 3000 })).status, 200);
});

test('쓰기 간격: 같은 요청에 d 와 s 가 함께 오르는데 60초 전이면 429 이고 d 도 저장되지 않는다(클라이언트는 나중에 그대로 다시 보낸다)', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 1000);
  t.advance(20);
  const r = await sync(t, { pid: a.pid, d: prog([70, 66]), s: 5000 });
  assert.equal(r.status, 429);
  assert.equal(row(t).prog_easy, '70,-1,-1,-1,-1,-1,-1,-1,-1,-1');
  assert.equal(row(t).best_score, 1000);
  t.advance(40);
  const again = await sync(t, { pid: a.pid, d: prog([70, 66]), s: 5000 });
  assert.equal(again.status, 200);
  assert.equal(again.json.me.score, 5000);
  assert.equal(again.json.me.stars.easy, 6);
});

test('쓰기 간격: 점수가 오르지 않는 s(같거나 낮음)는 60초 규칙을 받지 않는다 · 닉네임 하루 한도와도 독립', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]), 1000);
  const log = spyWrites(t);
  const lowSoon = await sync(t, { pid: a.pid, d: prog([70]), s: 1000 });       // 같은 초, 같은 값
  assert.equal(lowSoon.status, 200);
  assert.equal(lowSoon.json.changed, false);
  assert.equal(hasWrite(log), false);
  t.advance(5);
  const rename = await sync(t, { pid: a.pid, profile: { nick: '달토끼', avatar: 7 }, s: 900 });   // 프로필 변경은 3초 규칙, s 는 낮아서 무관
  assert.equal(rename.status, 200);
  assert.equal(rename.json.changed, true);
  assert.equal(rename.json.me.score, 1000);
});

/* ---------------------------------------------------------------- 정렬·순위 */

test('순위표 네 탭: 별이 같으면 최고점이 높은 순, 최고점이 같으면 남은 시간, 그다음 먼저 달성 -> id (score 키 포함)', async () => {
  const t = makeEnv();
  // 모두 초보 3★ 한 개(전체 3점·초보 3개). 이름: 남은 시간·최고점이 서로 다르게
  const mk = async (nick, left, s) => { const r = await register(t, nick, prog([left]), s); t.advance(0); return r; };
  await mk('최고점일등', 66, 90000);       // 점수 최고, 남은 시간은 가장 적은 편 -> 맨 위
  await mk('시간적음', 100, 80000);        // 점수 같음: 남은 시간 100
  t.advance(10);
  await mk('시간많음', 140, 80000);        // 점수 같고 남은 시간이 더 많음(더 늦게 등록했어도) -> 시간적음보다 앞
  await mk('점수없음', 150, undefined);    // 0점: 남은 시간이 가장 많아도 점수 있는 사람 뒤
  const lb = await board(t, 'all');
  assert.deepEqual(lb.rows.map((x) => [x.nick, x.score]), [['최고점일등', 90000], ['시간많음', 80000], ['시간적음', 80000], ['점수없음', 0]]);
  for (const b of ['easy']) assert.deepEqual((await board(t, b)).rows.map((x) => x.nick), ['최고점일등', '시간많음', '시간적음', '점수없음']);
  assert.deepEqual(lb.rows.map((x) => x.rank), [1, 2, 3, 4]);
});

test('순위표: 4개 보드가 JS 참조 정렬(core.compareRank)과 같고, 모든 선수의 /api/rank 가 정렬 위치와 같다 (별·점수·시간·시각을 일부러 겹침)', async () => {
  const t = makeEnv();
  const rnd = rng(424242);
  const N = 420;
  for (let i = 0; i < N; i++) {
    const st = { easy: rnd(4) === 0 ? 0 : 1 + rnd(3), normal: rnd(3) === 0 ? 0 : 1 + rnd(2), hard: rnd(3) === 0 ? 0 : 1 + rnd(2) };
    const lf = { easy: st.easy ? rnd(3) * 20 + 10 : 0, normal: st.normal ? rnd(3) * 20 + 10 : 0, hard: st.hard ? rnd(3) * 20 + 10 : 0 };
    const stamp = 1700000000 + rnd(4);
    insertRaw(t, {
      stars: st, left: lf, score: rnd(10) < 4 ? 0 : (1 + rnd(4)) * 1000, hidden: rnd(30) === 0 ? 1 + rnd(2) : 0,
      up: { all: stamp, easy: stamp + rnd(2), normal: stamp + rnd(2), hard: stamp + rnd(2) }
    });
  }
  let seenTieWithScore = 0;
  for (const b of core.BOARDS) {
    const c = core.boardCols(b);
    const all = rows(t, `SELECT id, pub, ${c.stars} AS stars, ${c.score} AS score, ${c.left} AS left, ${c.up} AS up FROM players WHERE hidden = 0 AND ${c.stars} > 0`);
    const sorted = all.slice().sort(core.compareRank);
    const lb = await board(t, b);
    assert.equal(lb.of, sorted.length, b + ' of');
    assert.equal(lb.rows.length, 50);
    assert.deepEqual(lb.rows.map((x) => x.score), sorted.slice(0, 50).map((x) => x.score), b + ' 상위 50 점수 순서');
    const names = rows(t, 'SELECT id, nick FROM players');
    const nickOf = new Map(names.map((x) => [x.id, x.nick]));
    assert.deepEqual(lb.rows.map((x) => x.nick), sorted.slice(0, 50).map((x) => nickOf.get(x.id)), b + ' 상위 50 순서');
    assert.ok(lb.rows.some((x) => x.score > 0), b + ' 상위 50 에 점수 있는 사람이 있어야 시험이 의미 있음');
    for (let i = 0; i < sorted.length; i++) {
      const r = (await t.call('GET', `/api/rank?board=${b}&pub=${sorted[i].pub}`)).json;
      assert.equal(r.rank, i + 1, b + ' #' + i);
      assert.equal(r.score, sorted[i].score);
    }
    // 시험이 정말 새 규칙을 쓰는지: 별이 같은 이웃끼리 점수가 내림차순이어야 한다
    for (let i = 1; i < sorted.length; i++) if (sorted[i].stars === sorted[i - 1].stars) { assert.ok(sorted[i].score <= sorted[i - 1].score); if (sorted[i].score === sorted[i - 1].score) seenTieWithScore++; }
  }
  assert.ok(seenTieWithScore > 20, '(별, 최고점)이 같아 남은 시간 이하로 갈리는 쌍이 충분해야 함: ' + seenTieWithScore);
});

test('숨김(hidden 1·2)과 별 0개는 최고점이 높아도 순위표·개수에서 빠진다', async () => {
  const t = makeEnv();
  insertRaw(t, { nick: '보임', stars: { easy: 1 }, left: { easy: 10 }, score: 100 });
  insertRaw(t, { nick: '관리자숨김', stars: { easy: 1 }, left: { easy: 10 }, score: 280000, hidden: 1 });
  insertRaw(t, { nick: '이름요청', stars: { easy: 1 }, left: { easy: 10 }, score: 280000, hidden: 2 });
  insertRaw(t, { nick: '별없음', stars: {}, score: 280000 });
  const lb = await board(t, 'all');
  assert.deepEqual(lb.rows.map((x) => x.nick), ['보임']);
  assert.equal(lb.of, 1);
  assert.equal((await board(t, 'easy')).of, 1);
});

test('동점 선착순(up_*): 별·최고점이 같고 남은 시간도 같으면 먼저 그 점수에 도달한 사람이 앞이다', async () => {
  const t = makeEnv();
  const a = await register(t, '먼저', prog([70]), 40000);
  t.advance(30);
  const b = await register(t, '나중', prog([70]), 40000);
  assert.deepEqual((await board(t, 'all')).rows.map((x) => x.nick), ['먼저', '나중']);
  // 나중 사람이 점수를 한 번 더 올려 다른 사람과 같은 점수에 다시 닿으면 그때가 달성 시각
  t.advance(100);
  await sync(t, { pid: b.pid, d: prog([70]), s: 41000 });
  assert.deepEqual((await board(t, 'all')).rows.map((x) => x.nick), ['나중', '먼저'], '최고점이 높은 쪽이 앞');
  t.advance(100);
  await sync(t, { pid: a.pid, d: prog([70]), s: 41000 });                           // 먼저 가 따라잡음 -> 달성 시각은 나중이 더 빠름
  assert.deepEqual((await board(t, 'all')).rows.map((x) => x.nick), ['나중', '먼저']);
  assert.equal((await t.call('GET', '/api/rank?board=all&pub=' + a.me.pub)).json.rank, 2);
});

test('관리자 검색 행에도 score 가 있다(점검용)', async () => {
  const t = makeEnv({ ADMIN_KEY: 'test-admin-key-not-real' });
  await register(t, '별빛냥', prog([70]), 33333);
  await register(t, '별똥별', prog([70]));
  const r = await t.call('GET', '/api/admin/search?q=' + encodeURIComponent('별'), undefined, { authorization: 'Bearer test-admin-key-not-real' });
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.json.rows.map((x) => [x.nick, x]));
  assert.equal(by['별빛냥'].score, 33333);
  assert.equal(by['별똥별'].score, 0);
  assert.deepEqual(Object.keys(by['별빛냥']).sort(), ['hidden', 'id', 'nick', 'pub', 'score', 'stars', 'tag']);
});

/* ---------------------------------------------------------------- 보안·로그 */

test('s 오류·상한·간격 경로에서도 pid·IP·닉네임이 로그에 남지 않고, 응답에 pid 가 없다', async () => {
  const t = makeEnv();
  const logs = [];
  const orig = { e: console.error, w: console.warn, l: console.log };
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  const pid = uuid();
  const texts = [];
  try {
    texts.push((await sync(t, { pid, profile: { nick: '비밀닉', avatar: 1 }, d: prog([70]), s: 100 }, { 'cf-connecting-ip': '203.0.113.5' })).text);
    texts.push((await sync(t, { pid, d: prog([70]), s: 'x' })).text);
    texts.push((await sync(t, { pid, d: prog([70]), s: CAP + 5 })).text);
    t.advance(10);
    texts.push((await sync(t, { pid, d: prog([70]), s: 200 })).text);                // 429
    t.env.DB.prepare = () => { throw new Error('boom'); };
    texts.push((await sync(t, { pid, d: prog([70]), s: 300 })).text);                // DB 오류
  } finally { console.error = orig.e; console.warn = orig.w; console.log = orig.l; }
  const all = logs.join('\n');
  assert.ok(!all.includes(pid) && !all.includes('203.0.113.5') && !all.includes('비밀닉'), all);
  for (const x of texts) assert.ok(!x.includes(pid), '응답에 pid');
});
