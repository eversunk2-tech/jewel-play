/* ranking.js 순수 함수·동기화 엔진 시험 (가짜 fetch / 가짜 시계). 실행: node --test apps/element-gems/test/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'ranking.js'));
const G = require(path.join(__dirname, '..', 'game.js'));

const UUID = '123e4567-e89b-42d3-a456-426614174000';

/* ---- 시험 도구 ---- */
function fakeClock() {
  let t = 1_700_000_000_000;
  let seq = 0;
  const q = [];
  return {
    now: () => t,
    timers: {
      set(fn, ms) { const id = ++seq; q.push({ id, at: t + ms, fn }); return id; },
      clear(id) { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); }
    },
    pending: () => q.length,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const e = q.shift();
        t = Math.max(t, e.at);
        e.fn();
        await settle();
      }
      t = end;
      await settle();
    }
  };
}
async function settle() { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); }

function jsonRes(status, obj, headers) {
  return { status, headers: { get: (k) => (headers && headers[k]) || null }, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) };
}
const okMe = (extra) => ({ ok: true, v: 1, me: Object.assign({ pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 } }, extra), changed: true, nickChangesLeft: 2, serverTime: 1 });
const errJson = (code, field) => ({ ok: false, v: 1, error: { code, message: 'x', field: field || '' } });

function memStore(initial) {
  const m = Object.assign({}, initial);
  return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, remove: (k) => { delete m[k]; }, _m: m };
}

function setup(over) {
  const o = over || {};
  const clock = fakeClock();
  const calls = [];
  const events = [];
  const save = G.defaultSave();
  G.applyStageResult(save, 'normal', 1, 9000, true, 3, 70);
  const store = o.store || memStore();
  const handler = o.handler || (() => jsonRes(200, okMe()));
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/', timeoutMs: 8000 }, o.config),
    store,
    fetch: async (url, init) => {
      calls.push({ t: clock.now(), url, init, body: init && init.body ? JSON.parse(init.body) : null });
      return handler(url, init, calls.length);
    },
    now: clock.now, timers: clock.timers, getSave: () => save, stageCount: 10,
    caps: { easy: 150, normal: 140, hard: 120 }, emit: (n, d) => events.push([n, d]),
    crypto: { randomUUID: () => UUID }, isOffline: () => !!o.offline
  });
  return { clock, calls, events, save, store, client };
}
const registeredStore = (extra) => memStore({ 'element-gems:profile:v1': JSON.stringify(Object.assign({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }, extra)) });

/* ---- 순수 함수 ---- */
test('backoffMs: 5초→15초→1분→5분→15분 상한', () => {
  const l = G.CONFIG.ranking.retryMs;
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 50].map((n) => R.backoffMs(n, l)), [5000, 15000, 60000, 300000, 900000, 900000, 900000]);
  assert.strictEqual(R.backoffMs(0, l), 5000);
  assert.strictEqual(R.backoffMs(3, null), 5000);
});

test('buildSnapshot: stars>=1 이면 left, 아니면 -1 / 연쇄가 끊기면 거기서 멈춤 / 상한 적용', () => {
  const sv = G.defaultSave();
  G.applyStageResult(sv, 'easy', 1, 1, true, 3, 80);
  G.applyStageResult(sv, 'easy', 2, 1, true, 1, 0);
  const d = R.buildSnapshot(sv, 10, { easy: 150, normal: 140, hard: 120 });
  assert.deepStrictEqual(d.easy, [80, 0, -1, -1, -1, -1, -1, -1, -1, -1]);
  assert.deepStrictEqual(d.normal, new Array(10).fill(-1));
  assert.strictEqual(Object.keys(d).length, 3);
  // 앞이 비어 있으면(손상) 뒤 값은 보내지 않는다 -> 서버 progress_chain 방지
  const bad = G.defaultSave();
  bad.stages.hard[4] = { best: 1, stars: 3, left: 60 };
  assert.deepStrictEqual(R.buildSnapshot(bad, 10, null).hard, new Array(10).fill(-1));
  // 상한
  const hi = G.defaultSave();
  hi.stages.hard[0] = { best: 1, stars: 3, left: 190 };
  assert.strictEqual(R.buildSnapshot(hi, 10, { hard: 120 }).hard[0], 120);
  // save 가 비어 있어도 안전
  assert.deepStrictEqual(R.buildSnapshot(null, 10).easy, new Array(10).fill(-1));
  assert.strictEqual(R.buildSnapshot({ stages: { easy: 'x' } }, 10).easy.length, 10);
});

test('buildSyncBody: v:1, pid, profile?, d?', () => {
  const b = JSON.parse(R.buildSyncBody({ pid: UUID, profile: { nick: '별빛냥', avatar: 3 }, d: { easy: [1] } }));
  assert.deepStrictEqual(Object.keys(b).sort(), ['d', 'pid', 'profile', 'v']);
  assert.strictEqual(b.v, 1);
  const c = JSON.parse(R.buildSyncBody({ pid: UUID, d: { easy: [] } }));
  assert.strictEqual('profile' in c, false);
  // 가장 큰 본문도 2,048 바이트 이하
  const big = R.buildSyncBody({ pid: UUID, profile: { nick: '가나다라마바사아', avatar: 16 }, d: R.buildSnapshot(G.defaultSave(), 10) });
  assert.ok(Buffer.byteLength(big) < 2048);
});

test('classify: 응답 분류 (JSON 아님/ok 없음 = 일시 장애)', () => {
  assert.strictEqual(R.classify(200, { ok: true }).kind, 'ok');
  assert.strictEqual(R.classify(200, null).kind, 'retry');
  assert.strictEqual(R.classify(200, { hello: 1 }).kind, 'retry');
  assert.strictEqual(R.classify(1027, null).kind, 'retry');
  assert.strictEqual(R.classify(503, errJson('db_unavailable')).kind, 'retry');
  assert.strictEqual(R.classify(500, errJson('server_error')).kind, 'retry');
  assert.strictEqual(R.classify(400, errJson('progress_invalid')).kind, 'block');
  assert.strictEqual(R.classify(400, errJson('progress_chain')).kind, 'block');
  assert.strictEqual(R.classify(400, errJson('bad_request')).kind, 'block');
  assert.strictEqual(R.classify(413, errJson('too_large')).kind, 'block');
  assert.strictEqual(R.classify(404, errJson('player_not_found')).kind, 'gone');
  assert.strictEqual(R.classify(400, errJson('profile_required')).kind, 'gone');
  assert.strictEqual(R.classify(400, errJson('unsupported_version')).kind, 'disable');
  assert.strictEqual(R.classify(403, errJson('forbidden_origin')).kind, 'disable');
  assert.strictEqual(R.classify(400, errJson('nick_blocked', 'nick')).kind, 'field');
  assert.strictEqual(R.classify(429, errJson('nick_change_limit')).kind, 'field');
  assert.strictEqual(R.classify(429, errJson('rate_limited'), '7').retryAfterMs, 7000);
  assert.strictEqual(R.classify(418, errJson('something_new')).kind, 'retry');
});

test('toMs/formatClock/pad4/kstDay/codepointCount', () => {
  assert.strictEqual(R.toMs(1700000000), 1700000000000);
  assert.strictEqual(R.toMs(1700000000000), 1700000000000);
  assert.strictEqual(R.toMs('2023-11-14T22:13:20Z'), 1700000000000);
  assert.strictEqual(R.toMs(null), 0);
  assert.strictEqual(R.pad4(7), '0007');
  assert.strictEqual(R.pad4('0427'), '0427');
  assert.strictEqual(R.pad4(99999), '0000');
  assert.match(R.formatClock(1700000000000), /^\d\d:\d\d$/);
  assert.strictEqual(R.formatClock(0), '');
  assert.strictEqual(R.kstDay(Date.UTC(2023, 10, 14, 14, 59)), R.kstDay(Date.UTC(2023, 10, 14, 0, 0)));
  assert.strictEqual(R.kstDay(Date.UTC(2023, 10, 14, 15, 0)), R.kstDay(Date.UTC(2023, 10, 14, 0, 0)) + 1);   // 한국 시간 자정 경계
  assert.strictEqual(R.codepointCount('별빛냥abc'), 6);
  assert.strictEqual(R.codepointCount('\u{1F600}'), 1);
});

test('newPlayerId: randomUUID/getRandomValues/폴백 모두 UUID 모양', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(R.newPlayerId({ randomUUID: () => UUID }), re);
  assert.match(R.newPlayerId({ getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37) & 255; return b; } }), re);
  assert.match(R.newPlayerId(null), re);
  assert.notStrictEqual(R.newPlayerId(null), R.newPlayerId(null));
});

test('createStore: localStorage 가 막혀도 메모리로 동작', () => {
  const win = { get localStorage() { throw new Error('blocked'); } };
  const s = R.createStore(win);
  s.set('a', '1');
  assert.strictEqual(s.get('a'), '1');
  s.remove('a');
  assert.strictEqual(s.get('a'), null);
  const win2 = { localStorage: { getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {} } };
  const s2 = R.createStore(win2);
  s2.set('k', 'v');
  assert.strictEqual(s2.get('k'), 'v');
});

test('normalizeProfile/normalizeSync: 손상된 저장을 안전하게 정리', () => {
  assert.strictEqual(R.normalizeProfile(null).pid, '');
  assert.strictEqual(R.normalizeProfile({ pid: 'nope', avatar: 99, tag: -1, hidden: 7 }).avatar, 0);
  const p = R.normalizeProfile({ pid: UUID, pub: 'A', nick: 'n', tag: 5, avatar: 16, hidden: 2, nickLeft: { day: 3, n: 1 } });
  assert.strictEqual(p.avatar, 16); assert.strictEqual(p.hidden, 2); assert.strictEqual(p.nickLeft.n, 1);
  const s = R.normalizeSync({ dirty: 'yes', fails: -4, lastOkAt: 'x', blocked: 1 });
  assert.deepStrictEqual(s, { dirty: false, lastOkAt: 0, fails: 0, nextTryAt: 0, blocked: false, blockedCode: '', sdirty: false, sat: 0 });      // spec §46: 최고점 대기 표식(sdirty·sat) 두 칸이 늘었다(공용 ranking.js 와 같게)
  assert.deepStrictEqual(R.normalizeRows([{ nick: 'a', tag: 1, avatar: 3, stars: 5 }, { nick: 5 }, null, { nick: 'b', stars: 'x' }], 50).length, 1);
});

test('checkNick: 모듈이 없으면 최소 규칙, 있으면 모듈 결과를 통일된 모양으로', () => {
  const bad = [['', 'nick_length'], ['가', 'nick_length'], ['가나다라마바사아자', 'nick_length'], ['ㅋㅋㅋ', 'nick_jamo'], ['별 빛', 'nick_charset'], ['abc_d', 'nick_charset'],
    ['1234', 'nick_digits'], ['123', 'nick_digits'], ['아아아', 'nick_repeat'], ['AaA', 'nick_repeat']];
  bad.forEach(([n, code]) => { const r = R.checkNick(n, {}); assert.strictEqual(r.ok, false, n); assert.strictEqual(r.code, code, n); assert.ok(r.message.length > 5); });
  ['별빛냥', 'cat12', '하하', 'AB'].forEach((n) => assert.strictEqual(R.checkNick(n, {}).ok, true, n));
  // 모듈 어댑터
  const root = { ElementGemsNickname: { validateNick: (n) => (n === 'bad' ? { ok: false, code: 'nick_blocked' } : { ok: true, nick: n }) } };
  assert.deepStrictEqual(R.checkNick('bad', root).code, 'nick_blocked');
  assert.strictEqual(R.checkNick('good', root).ok, true);
  assert.strictEqual(R.checkNick('good', { validateNick: () => { throw new Error('x'); } }).ok, true);   // 모듈 오류는 최소 규칙으로
});

/* ---- 동기화 엔진 ---- */
test('프로필 저장: /api/sync 로 profile+d 를 text/plain 으로 보내고, 성공하면 pid/pub/tag 저장', async () => {
  const t = setup();
  const r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(t.calls.length, 1);
  const c = t.calls[0];
  assert.strictEqual(c.url, 'http://x.test/api/sync');
  assert.strictEqual(c.init.method, 'POST');
  assert.strictEqual(c.init.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.strictEqual(c.init.credentials, 'omit');
  assert.strictEqual(c.body.v, 1);
  assert.strictEqual(c.body.pid, UUID);
  assert.deepStrictEqual(c.body.profile, { nick: '별빛냥', avatar: 3 });
  assert.strictEqual(c.body.d.normal[0], 70);                   // 건너뛰었던 로컬 진행 전체를 한 번에
  const p = t.client.profile();
  assert.strictEqual(p.registered, true);
  assert.strictEqual(p.pub, 'ABCD1234');
  assert.strictEqual(p.tag, 427);
  assert.strictEqual(p.nickLeft, 2);
  assert.strictEqual(JSON.parse(t.store.get('element-gems:profile:v1')).pid, UUID);
  assert.strictEqual(t.client.status().dirty, false);
});

test('프로필 저장 오류: 닉네임 코드는 안내 문구, 오프라인/5xx 는 쉬운 말', async () => {
  let t = setup({ handler: () => jsonRes(400, errJson('nick_pii', 'nick')) });
  let r = await t.client.saveProfile({ nick: '3학년2반', avatar: 3 });
  assert.deepStrictEqual([r.ok, r.code, r.field, r.kind], [false, 'nick_pii', 'nick', 'field']);
  assert.match(r.message, /학교/);
  assert.strictEqual(t.client.profile().registered, false);
  t = setup({ handler: () => jsonRes(429, errJson('nick_change_limit', 'nick')) });
  r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.code, 'nick_change_limit');
  assert.match(r.message, /하루에 2번/);
  t = setup({ handler: () => { throw new TypeError('Failed to fetch'); }, offline: true });
  r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.deepStrictEqual([r.ok, r.kind, r.message], [false, 'retry', R.MESSAGES.offline]);
  t = setup({ handler: () => jsonRes(503, errJson('db_unavailable')) });
  r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.message, R.MESSAGES.busy);
  t = setup({ handler: () => jsonRes(200, '<html>Error 1027</html>') });
  r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.kind, 'retry');
  assert.strictEqual(t.client.profile().registered, false);
});

test('프로필 저장: 응답을 못 받아도 같은 pid 로 재시도(중복 가입 방지), 기록 거부 시 프로필만 다시 전송', async () => {
  let n = 0;
  const t = setup({ handler: () => { n++; if (n === 1) throw new TypeError('network'); return jsonRes(200, okMe()); } });
  await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(t.calls[0].body.pid, t.calls[1].body.pid);
  // progress_invalid -> d 없이 다시 보냄, 제출은 중단 표시
  let k = 0;
  const u = setup({ handler: () => (++k === 1 ? jsonRes(400, errJson('progress_invalid', 'd')) : jsonRes(200, okMe())) });
  const r = await u.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(u.calls.length, 2);
  assert.strictEqual('d' in u.calls[1].body, false);
  assert.strictEqual(u.client.status().blocked, true);
});

test('markDirty -> 지연 뒤 한 번 제출(스냅샷), 성공하면 dirty=false', async () => {
  const t = setup({ store: registeredStore() });
  assert.strictEqual(t.client.markDirty(1200), true);
  await t.clock.advance(1000);
  assert.strictEqual(t.calls.length, 0);                          // 결과 연출과 겹치지 않게 1.2초 뒤
  await t.clock.advance(300);
  assert.strictEqual(t.calls.length, 1);
  assert.strictEqual('profile' in t.calls[0].body, false);
  assert.strictEqual(t.calls[0].body.d.normal[0], 70);
  assert.strictEqual(t.client.status().dirty, false);
  assert.ok(t.events.some((e) => e[0] === 'synced'));
});

test('프로필이 없거나 건너뛴 상태에서는 제출하지 않는다', async () => {
  const t = setup();
  assert.strictEqual(t.client.markDirty(0), false);
  await t.clock.advance(5000);
  assert.strictEqual(t.calls.length, 0);
  const u = setup({ store: memStore({ 'element-gems:profile:v1': JSON.stringify({ skipped: true }) }) });
  assert.strictEqual(u.client.markDirty(0), false);
  u.client.start();
  await u.clock.advance(5000);
  assert.strictEqual(u.calls.length, 0);
});

test('apiBase 가 비어 있으면 아무것도 하지 않는다(네트워크 0회)', async () => {
  const t = setup({ store: registeredStore(), config: { apiBase: '' } });
  assert.strictEqual(t.client.enabled(), false);
  assert.strictEqual(t.client.markDirty(0), false);
  t.client.start();
  const r = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(r.ok, false);
  const b = await t.client.fetchBoard('all');
  assert.strictEqual(b.ok, false);
  await t.clock.advance(60000);
  assert.strictEqual(t.calls.length, 0);
});

test('single-flight: 전송 중 연타해도 동시에 1개만, 끝난 뒤 스냅샷이 달라졌으면 한 번 더', async () => {
  let release;
  let inFlight = 0; let maxInFlight = 0;
  const t = setup({
    store: registeredStore(),
    handler: () => new Promise((res) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); release = () => { inFlight--; res(jsonRes(200, okMe())); }; })
  });
  t.client.markDirty(0);
  await t.clock.advance(1);
  for (let i = 0; i < 5; i++) { t.client.markDirty(0); t.client.flush(); }
  await settle();
  assert.strictEqual(t.calls.length, 1);
  // 전송 중에 새 기록이 올랐다
  G.applyStageResult(t.save, 'normal', 2, 9000, true, 2, 40);
  t.client.markDirty(0);
  release();
  await settle();
  assert.strictEqual(t.client.status().dirty, true);              // 보낸 스냅샷과 다르므로 아직 대기
  await t.clock.advance(3100);                                    // 최소 제출 간격(3초) 뒤
  assert.strictEqual(t.calls.length, 2);
  assert.strictEqual(t.calls[1].body.d.normal[1], 40);
  release();
  await settle();
  assert.strictEqual(t.client.status().dirty, false);
  assert.strictEqual(maxInFlight, 1);
});

test('오프라인에서 여러 번 깨도 마지막 스냅샷 한 번으로 충분(복구 후 1회 전송)', async () => {
  let down = true;
  const t = setup({ store: registeredStore(), handler: () => { if (down) throw new TypeError('offline'); return jsonRes(200, okMe()); } });
  t.client.markDirty(0);
  await t.clock.advance(10);
  assert.strictEqual(t.calls.length, 1);
  G.applyStageResult(t.save, 'normal', 2, 9000, true, 3, 70);
  t.client.markDirty(0);
  G.applyStageResult(t.save, 'normal', 3, 9000, true, 3, 72);
  t.client.markDirty(0);
  await t.clock.advance(4000);                                    // 첫 백오프(5초) 전에는 재시도 없음
  assert.strictEqual(t.calls.length, 1);
  down = false;
  t.client.onOnline();
  await t.clock.advance(600);
  assert.strictEqual(t.calls.length, 2);
  assert.deepStrictEqual(t.calls[1].body.d.normal.slice(0, 4), [70, 70, 72, -1]);
  assert.strictEqual(t.client.status().dirty, false);
  await t.clock.advance(120000);
  assert.strictEqual(t.calls.length, 2);                          // 더 보내지 않는다
});

test('백오프: 5xx / 비 JSON / 타임아웃은 5s→15s→60s→5m→15m(상한), 성공하면 초기화', async () => {
  let mode = 'fail';
  const t = setup({ store: registeredStore(), handler: () => (mode === 'fail' ? jsonRes(503, errJson('db_unavailable')) : jsonRes(200, okMe())) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  const expected = [5000, 15000, 60000, 300000, 900000, 900000];
  for (const ms of expected) {
    const before = t.calls.length;
    let waited = 0;
    while (t.calls.length === before && waited < 1000000) { await t.clock.advance(100); waited += 100; }
    const gap = t.calls[t.calls.length - 1].t - t.calls[t.calls.length - 2].t;
    assert.ok(Math.abs(gap - ms) <= 1, 'gap ' + gap + ' expected ' + ms);
  }
  assert.strictEqual(t.client.status().fails, 7);
  mode = 'ok';
  await t.clock.advance(900001);
  assert.strictEqual(t.client.status().fails, 0);
  assert.strictEqual(t.client.status().dirty, false);
});

test('타임아웃(8초)·비 JSON 응답도 일시 장애로 재시도', async () => {
  let first = true;
  const t = setup({ store: registeredStore(), handler: () => { if (first) { first = false; return new Promise(() => {}); } return jsonRes(200, okMe()); } });
  t.client.markDirty(0);
  await t.clock.advance(1);
  assert.strictEqual(t.client.status().inflight, true);
  await t.clock.advance(8100);
  assert.strictEqual(t.client.status().fails, 1);
  await t.clock.advance(5100);
  assert.strictEqual(t.calls.length, 2);
  assert.strictEqual(t.client.status().dirty, false);
  const u = setup({ store: registeredStore(), handler: () => jsonRes(200, 'Error code: 1027') });
  u.client.markDirty(0);
  await u.clock.advance(1);
  assert.strictEqual(u.client.status().fails, 1);
  assert.strictEqual(u.client.status().dirty, true);
});

test('progress_* 오류는 재시도하지 않고 중단(blocked) — 다음 실행에서 한 번 더 시도', async () => {
  const t = setup({ store: registeredStore(), handler: () => jsonRes(400, errJson('progress_chain', 'd')) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  assert.strictEqual(t.client.status().blocked, true);
  await t.clock.advance(3600000);
  assert.strictEqual(t.calls.length, 1);
  assert.ok(t.events.some((e) => e[0] === 'blocked'));
  // 새 실행(같은 저장소): 한 번 다시 시도
  const store = t.store;
  const u = setup({ store, handler: () => jsonRes(200, okMe()) });
  u.client.start();
  await u.clock.advance(2000);
  assert.strictEqual(u.calls.length, 1);
  assert.strictEqual(u.client.status().blocked, false);
});

test('player_not_found: 로컬 프로필 초기화(진행 기록은 그대로), 안내 notice=gone', async () => {
  const t = setup({ store: registeredStore(), handler: () => jsonRes(404, errJson('player_not_found')) });
  const before = JSON.stringify(t.save);
  t.client.markDirty(0);
  await t.clock.advance(1);
  const p = t.client.profile();
  assert.strictEqual(p.registered, false);
  assert.strictEqual(p.notice, 'gone');
  assert.strictEqual(JSON.stringify(t.save), before);
  t.client.dismissNotice();
  assert.strictEqual(t.client.profile().notice, '');
});

test('unsupported_version / forbidden_origin: 랭킹 기능을 끈다(재시도 없음)', async () => {
  const t = setup({ store: registeredStore(), handler: () => jsonRes(400, errJson('unsupported_version')) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  assert.strictEqual(t.client.enabled(), false);
  assert.ok(t.events.some((e) => e[0] === 'disabled'));
  await t.clock.advance(100000);
  assert.strictEqual(t.calls.length, 1);
});

test('rate_limited 는 Retry-After 를 지켜 재시도', async () => {
  let n = 0;
  const t = setup({ store: registeredStore(), handler: () => (++n === 1 ? jsonRes(429, errJson('rate_limited'), { 'Retry-After': '20' }) : jsonRes(200, okMe())) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  await t.clock.advance(19000);
  assert.strictEqual(t.calls.length, 1);
  await t.clock.advance(1500);
  assert.strictEqual(t.calls.length, 2);
});

test('rate_limited(429): 연달아 받아도 대기는 Retry-After 값만이다(실패 횟수 백오프 5초→…→15분을 섞지 않고 횟수도 올리지 않는다). 헤더가 없으면 쓰기 간격. 5xx 백오프는 그대로', async () => {
  const lastAt = (x) => x.calls[x.calls.length - 1].t;
  const t = setup({ store: registeredStore(), handler: () => jsonRes(429, errJson('rate_limited'), { 'Retry-After': '20' }) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  assert.strictEqual(t.calls.length, 1);
  for (let i = 1; i <= 7; i++) {                              // 옛 코드는 6번째 연속 429 부터 max(20초, 백오프 5분·15분)을 기다렸다
    const n = t.calls.length;
    await t.clock.advance(lastAt(t) + 19500 - t.clock.now());
    assert.strictEqual(t.calls.length, n, i + '번째 연속 429 뒤 20초 전에는 다시 보내지 않는다');
    await t.clock.advance(1000);
    assert.strictEqual(t.calls.length, n + 1, i + '번째 연속 429 뒤 20초가 지나면 다시 보낸다');
  }
  assert.strictEqual(t.client.status().fails, 0, '429 는 실패 횟수를 올리지 않는다');
  const gap = G.CONFIG.ranking.minSubmitGapMs;
  const nh = setup({ store: registeredStore(), handler: () => jsonRes(429, errJson('rate_limited')) });
  nh.client.markDirty(0);
  await nh.clock.advance(1);
  for (let i = 1; i <= 6; i++) {
    const n = nh.calls.length;
    await nh.clock.advance(lastAt(nh) + gap - 500 - nh.clock.now());
    assert.strictEqual(nh.calls.length, n);
    await nh.clock.advance(1000);
    assert.strictEqual(nh.calls.length, n + 1, '헤더 없는 429 ' + i + '번째: 쓰기 간격(' + gap + 'ms) 뒤');
  }
  const srv = setup({ store: registeredStore(), handler: () => jsonRes(500, errJson('server_error')) });
  srv.client.markDirty(0);
  await srv.clock.advance(1);
  for (const [i, wait] of [[2, 5000], [3, 15000], [4, 60000]]) {
    await srv.clock.advance(lastAt(srv) + wait - 500 - srv.clock.now());
    assert.strictEqual(srv.calls.length, i - 1, '실패 ' + (i - 1) + '번째 뒤 ' + wait + 'ms 전');
    await srv.clock.advance(1000);
    assert.strictEqual(srv.calls.length, i, '실패 ' + (i - 1) + '번째 뒤 ' + wait + 'ms 뒤');
  }
  assert.strictEqual(srv.client.status().fails, 4, '5xx 는 실패 횟수를 올린다');
});

test('start(): 대기 중이거나 처음 동기화 전이면 시작 직후 제출, visibilitychange 는 백오프 전엔 무시', async () => {
  const t = setup({ store: registeredStore() });
  t.client.start();
  await t.clock.advance(1400);
  assert.strictEqual(t.calls.length, 0);
  await t.clock.advance(200);
  assert.strictEqual(t.calls.length, 1);
  // 깨끗한 상태에서 보이게 되어도 보내지 않는다
  t.client.onVisible();
  await t.clock.advance(5000);
  assert.strictEqual(t.calls.length, 1);
});

test('최소 제출 간격(3초): 연달아 두 번 개선해도 서버 간격을 지킨다', async () => {
  const t = setup({ store: registeredStore() });
  t.client.markDirty(0);
  await t.clock.advance(1);
  assert.strictEqual(t.calls.length, 1);
  G.applyStageResult(t.save, 'normal', 2, 9000, true, 3, 70);
  t.client.markDirty(0);
  await t.clock.advance(1000);
  assert.strictEqual(t.calls.length, 1);
  await t.clock.advance(2100);
  assert.strictEqual(t.calls.length, 2);
});

test('me.hidden=2(이름 변경 요청)가 오면 프로필에 반영 + notice=rename', async () => {
  const t = setup({ store: registeredStore(), handler: () => jsonRes(200, okMe({ hidden: 2 })) });
  t.client.markDirty(0);
  await t.clock.advance(1);
  const p = t.client.profile();
  assert.strictEqual(p.hidden, 2);
  assert.strictEqual(p.notice, 'rename');
});

test('프로필 지우기: /api/delete 후 로컬 프로필 초기화(다시 묻지 않음, 게임 기록 유지)', async () => {
  const t = setup({ store: registeredStore(), handler: () => jsonRes(200, { ok: true, v: 1, deleted: true }) });
  const before = JSON.stringify(t.save);
  const r = await t.client.deleteProfile();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(t.calls[0].url, 'http://x.test/api/delete');
  assert.deepStrictEqual(t.calls[0].body, { v: 1, pid: UUID });
  const p = t.client.profile();
  assert.strictEqual(p.registered, false);
  assert.strictEqual(p.skipped, true);
  assert.strictEqual(JSON.stringify(t.save), before);
  // 서버에 이미 없어도 성공으로 처리
  const u = setup({ store: registeredStore(), handler: () => jsonRes(404, errJson('player_not_found')) });
  assert.strictEqual((await u.client.deleteProfile()).ok, true);
  // 네트워크 실패는 로컬 프로필 유지
  const v = setup({ store: registeredStore(), handler: () => { throw new TypeError('x'); } });
  const rv = await v.client.deleteProfile();
  assert.strictEqual(rv.ok, false);
  assert.strictEqual(v.client.profile().registered, true);
});

/* ---- 순위표 ---- */
const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, nick: 'n' + i, tag: i, avatar: (i % 16) + 1, stars: 90 - i }));

test('순위표: 상위 50 + 내 순위(목록에 있으면 /api/rank 생략), 캐시 저장', async () => {
  const rows = rowsOf(50); rows[4] = { rank: 5, nick: '별빛냥', tag: 427, avatar: 3, stars: 70 };
  const t = setup({ store: registeredStore(), handler: (url) => jsonRes(200, { ok: true, v: 1, board: 'all', asOf: 1700000000, of: 120, rows }) });
  const b = await t.client.fetchBoard('all');
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.rows.length, 50);
  assert.strictEqual(b.me.rank, 5);
  assert.strictEqual(b.me.inList, true);
  assert.strictEqual(b.rows[4].tag, '0427');
  assert.strictEqual(b.asOf, 1700000000000);
  assert.strictEqual(t.calls.length, 1);
  assert.match(t.calls[0].url, /\/api\/leaderboard\?board=all&limit=50$/);
  assert.strictEqual(t.calls[0].init.body, undefined);            // GET: 본문·헤더 없음(CORS preflight 없음)
  assert.strictEqual(t.calls[0].init.headers, undefined);
  const c = t.client.loadCache('all');
  assert.strictEqual(c.rows.length, 50);
  assert.strictEqual(c.fromCache, true);
  assert.strictEqual(t.client.loadCache('easy'), null);
});

test('순위표: 내가 50위 밖이면 pub 로 /api/rank 조회, 숨김(hidden)·실패는 안전하게', async () => {
  const handler = (url) => {
    if (url.includes('/api/leaderboard')) return jsonRes(200, { ok: true, v: 1, board: 'normal', asOf: 1700000000, of: 200, rows: rowsOf(50) });
    return jsonRes(200, { ok: true, v: 1, board: 'normal', asOf: 1700000000, rank: 83, of: 200, stars: 41, nick: '별빛냥', tag: 427, avatar: 3 });
  };
  const t = setup({ store: registeredStore(), handler });
  const b = await t.client.fetchBoard('normal');
  assert.strictEqual(t.calls.length, 2);
  assert.match(t.calls[1].url, /\/api\/rank\?board=normal&pub=ABCD1234$/);
  assert.deepStrictEqual([b.me.rank, b.me.stars, b.me.inList], [83, 41, false]);
  const u = setup({ store: registeredStore(), handler: (url) => (url.includes('/api/leaderboard') ? jsonRes(200, { ok: true, v: 1, rows: rowsOf(3), of: 3, asOf: 1700000000 }) : jsonRes(200, { ok: true, v: 1, hidden: 1 })) });
  assert.deepStrictEqual((await u.client.fetchBoard('all')).me, { hidden: 1 });
  const w = setup({ store: registeredStore(), handler: (url) => (url.includes('/api/leaderboard') ? jsonRes(200, { ok: true, v: 1, rows: rowsOf(3), of: 3, asOf: 1700000000 }) : jsonRes(404, errJson('player_not_found'))) });
  const bw = await w.client.fetchBoard('all');
  assert.strictEqual(bw.ok, true); assert.strictEqual(bw.me, null);
  // 이 기기에서 해당 보드 별이 0개면 /api/rank 를 부르지 않는다(불필요한 404 방지)
  const y = setup({ store: registeredStore(), handler: () => jsonRes(200, { ok: true, v: 1, rows: rowsOf(3), of: 3, asOf: 1700000000 }) });
  await y.client.fetchBoard('easy');                               // setup 저장은 중수만 클리어
  assert.strictEqual(y.calls.length, 1);
  await y.client.fetchBoard('normal');
  assert.strictEqual(y.calls.length, 3);
  // 프로필이 없으면 /api/rank 를 부르지 않는다
  const x = setup({ handler: () => jsonRes(200, { ok: true, v: 1, rows: rowsOf(3), of: 3, asOf: 1700000000 }) });
  await x.client.fetchBoard('all');
  assert.strictEqual(x.calls.length, 1);
});

test('순위표 실패: 오류 종류와 마지막 캐시를 돌려준다(오프라인 배너용)', async () => {
  let ok = true;
  const t = setup({ handler: () => (ok ? jsonRes(200, { ok: true, v: 1, rows: rowsOf(5), of: 5, asOf: 1700000000 }) : jsonRes(200, '<html>1027</html>')) });
  await t.client.fetchBoard('all');
  ok = false;
  const b = await t.client.fetchBoard('all');
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.kind, 'retry');
  assert.strictEqual(b.cache.rows.length, 5);
  assert.strictEqual(b.cache.asOf, 1700000000000);
  const n = setup({ handler: () => { throw new TypeError('x'); } });
  const nb = await n.client.fetchBoard('hard');
  assert.strictEqual(nb.ok, false); assert.strictEqual(nb.cache, null);
  // 3일 지난 캐시는 쓰지 않는다
  ok = true;
  const o = setup({ handler: () => jsonRes(200, { ok: true, v: 1, rows: rowsOf(2), of: 2, asOf: 1700000000 }) });
  await o.client.fetchBoard('all');
  await o.clock.advance(4 * 86400000);
  assert.strictEqual(o.client.loadCache('all'), null);
});

test('순위표 single-flight: 같은 보드 동시 요청은 1회', async () => {
  const t = setup({ handler: () => jsonRes(200, { ok: true, v: 1, rows: rowsOf(2), of: 2, asOf: 1700000000 }) });
  const [a, b] = await Promise.all([t.client.fetchBoard('all'), t.client.fetchBoard('all')]);
  assert.strictEqual(t.calls.length, 1);
  assert.strictEqual(a, b);
});

test('닉네임이 HTML 문자를 포함해도 데이터는 문자열 그대로(렌더는 textContent 사용)', () => {
  const rows = R.normalizeRows([{ nick: '<b>x</b>', tag: 1, avatar: 1, stars: 3 }], 50);
  assert.strictEqual(rows[0].nick, '<b>x</b>');
});

test('nickname.js(공용 모듈) 연동: 어댑터가 오류 코드·안내 문구를 그대로 쓴다', (t) => {
  let N;
  try { N = require(path.join(__dirname, '..', 'nickname.js')); } catch (e) { t.skip('nickname.js 없음'); return; }
  const root = { ElementGemsNick: N };
  assert.strictEqual(R.findNickFn(root) !== null, true);
  const cases = [['별빛냥', true, ''], ['반달곰', true, ''], ['초코우유', true, ''], ['3학년2반', false, 'nick_pii'], ['관리자', false, 'nick_reserved'],
    ['ㅋㅋㅋ', false, 'nick_charset'], ['가', false, 'nick_length'], ['아아아', false, 'nick_repeat'], ['1234', false, 'nick_digits'], ['a b', false, 'nick_charset']];
  cases.forEach(([n, ok, code]) => {
    const r = R.checkNick(n, root);
    assert.strictEqual(r.ok, ok, n);
    assert.strictEqual(r.code, code, n);
    assert.ok(r.message.length > 5);
  });
  assert.match(R.checkNick('ㅋㅋㅋ', root).message, /낱글자/);
  // 서버와 같은 모듈 결과(같은 파일) — 정규화된 닉네임을 돌려준다
  assert.strictEqual(R.checkNick('별빛냥', root).nick, '별빛냥');
});

test('별 점수(전체 탭, 난이도 가중 1·2·3)와 라벨 포맷', () => {
  assert.deepStrictEqual(R.STAR_WEIGHT, { easy: 1, normal: 2, hard: 3 });
  assert.strictEqual(R.scoreLabel('all', 180), '별 점수 180점');
  assert.strictEqual(R.scoreLabel('easy', 30), '별 30개');
  assert.strictEqual(R.scoreLabel('hard', 0), '별 0개');
  const sv = G.defaultSave();
  for (let i = 1; i <= 10; i++) { G.applyStageResult(sv, 'easy', i, 1, true, 3, 70); G.applyStageResult(sv, 'normal', i, 1, true, 3, 70); G.applyStageResult(sv, 'hard', i, 1, true, 3, 70); }
  assert.strictEqual(R.weightedStarsOf(sv), 180);                       // 최대 30 + 60 + 90
  const s2 = G.defaultSave();
  G.applyStageResult(s2, 'easy', 1, 1, true, 3, 70); G.applyStageResult(s2, 'normal', 1, 1, true, 2, 40); G.applyStageResult(s2, 'hard', 1, 1, true, 1, 0);
  assert.strictEqual(R.weightedStarsOf(s2), 3 + 4 + 3);                 // 초보 3★, 중수 2★, 고수 1★ = 10
  assert.strictEqual(R.weightedStarsOf(null), 0);
});

/* ---- spec §23 보강: 프로필 이력(hadProfile) ---- */
test('hadProfile: 프로필 만들기 성공 뒤 저장·공개 프로필에 true, 옛 저장(pid+pub)은 읽자마자 true, 만들다 만 pid 는 false', async () => {
  const t = setup({});
  assert.strictEqual(t.client.profile().hadProfile, false);
  const res = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(t.client.profile().hadProfile, true);
  assert.strictEqual(JSON.parse(t.store.get('element-gems:profile:v1')).hadProfile, true);
  assert.strictEqual(setup({ store: registeredStore() }).client.profile().hadProfile, true);            // 옛 모양 저장
  assert.strictEqual(setup({ store: memStore({ 'element-gems:profile:v1': JSON.stringify({ pid: UUID }) }) }).client.profile().hadProfile, false);
});
