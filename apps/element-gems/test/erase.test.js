/* 프로필 지우기(이 기기에서만)·새 프로필 기록 규칙 시험 (spec §23). 가짜 fetch / 가짜 시계 / 메모리 저장소.
 * 실행: node --test apps/element-gems/test/*.test.js   (서버·네트워크 없음, 서버 삭제 API 호출 0회도 확인한다)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'ranking.js'));
const G = require(path.join(__dirname, '..', 'game.js'));

const dir = path.join(__dirname, '..');
const UUID = '123e4567-e89b-42d3-a456-426614174000';
const UUID2 = '223e4567-e89b-42d3-a456-426614174111';
const K = R.RECORD_KEYS;
const GEN = 'element-gems:v1';
const EDU = 'element-gems-edu:v1';
const SYNC_GEN = 'element-gems:sync:v1';
const SYNC_EDU = 'element-gems-edu:sync:v1';
const PROF = 'element-gems:profile:v1';
const HALL = 'element-gems:hall:v1';

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
function jsonRes(status, obj) { return { status, headers: { get: () => null }, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) }; }
const okMe = () => ({ ok: true, v: 1, me: { pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 } }, changed: true, nickChangesLeft: 2, serverTime: 1 });
const errJson = (code) => ({ ok: false, v: 1, error: { code, message: 'x', field: '' } });
function memStore(initial) {
  const m = Object.assign({}, initial);
  return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, remove: (k) => { delete m[k]; }, _m: m };
}

/** 기록이 있는 저장 JSON(별 3 + 2 = 5개, 설정 3개 포함). extra 로 덮어쓴다 */
function saveJson(extra) {
  const sv = G.defaultSave();
  G.applyStageResult(sv, 'normal', 1, 9000, true, 3, 70);
  G.applyStageResult(sv, 'easy', 1, 5000, true, 2, 40);
  sv.muted = true; sv.cutin = false; sv.tutorialSeen = true; sv.plays = 7; sv.bestChain = 4; sv.level = 'hard';
  return JSON.stringify(Object.assign(sv, extra || {}));
}
const eduSaveJson = () => saveJson({ edu: { v: 1, unit: 'u5-2-1', pool: { 'u5-2-1': { order: [1, 2], pos: 1, recent: [], held: [] } }, stats: { 'u5-2-1': { asked: 9, right: 6 } } } });
const profileJson = (extra) => JSON.stringify(Object.assign({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }, extra));

function setup(over) {
  const o = over || {};
  const clock = fakeClock();
  const calls = [];
  const events = [];
  const save = o.save || G.defaultSave();
  if (!o.save && !o.noStars) G.applyStageResult(save, 'normal', 1, 9000, true, 3, 70);
  const store = o.store || memStore();
  const handler = o.handler || (() => jsonRes(200, okMe()));
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/' }, o.config),
    store,
    fetch: async (url, init) => {
      const call = { t: clock.now(), url, init, body: init && init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      return handler(url, init, calls.length, call);
    },
    now: clock.now, timers: clock.timers, getSave: () => save, stageCount: 10,
    caps: { easy: 150, normal: 140, hard: 120 }, emit: (n, d) => events.push([n, d]),
    crypto: { randomUUID: () => (o.uuid || UUID) }, isOffline: () => !!o.offline
  });
  return { clock, calls, events, save, store, client };
}
const deleteCalls = (calls) => calls.filter((c) => /\/api\/delete/.test(c.url));
const syncCalls = (calls) => calls.filter((c) => /\/api\/sync/.test(c.url));
const settingsOnly = (raw) => { const o = JSON.parse(raw); return JSON.stringify(Object.keys(o).sort()); };

/* ---------------------------------------------------------------------
 * 순수 함수
 * ------------------------------------------------------------------- */
test('RECORD_KEYS: 두 앱의 진행·sync·순위표 캐시·프로필·유지 키가 한 곳에 있다', () => {
  assert.deepStrictEqual(K.save, [GEN, EDU]);
  assert.deepStrictEqual(K.sync, [SYNC_GEN, SYNC_EDU]);
  assert.deepStrictEqual(K.drop, [HALL]);
  assert.strictEqual(K.profile, PROF);
  assert.ok(K.keep.indexOf('element-gems:mode') >= 0 && K.keep.indexOf('eg-from-chooser') >= 0);
  assert.strictEqual(K.note, 'eg-erase-note');
  assert.deepStrictEqual(R.SETTING_FIELDS, ['muted', 'cutin', 'tutorialSeen']);
});

test('wipeSaveRaw: 설정 3개(boolean)만 남기고 나머지는 버린다 / 깨진 값도 새 JSON 으로', () => {
  const kept = JSON.parse(R.wipeSaveRaw(eduSaveJson()));
  assert.deepStrictEqual(kept, { muted: true, cutin: false, tutorialSeen: true });
  // 기록 필드·교육용 edu 필드 없음 -> 앱이 열릴 때 parseSave 가 기본값으로 채운다
  const sv = G.parseSave(R.wipeSaveRaw(eduSaveJson()));
  assert.strictEqual(R.starsOfSave(sv), 0);
  assert.deepStrictEqual(sv.progress, { easy: 0, normal: 0, hard: 0 });
  assert.strictEqual(sv.plays, 0); assert.strictEqual(sv.bestChain, 0); assert.strictEqual(sv.lastScore, 0); assert.strictEqual(sv.level, 'normal');
  assert.strictEqual(sv.muted, true); assert.strictEqual(sv.cutin, false); assert.strictEqual(sv.tutorialSeen, true);
  // boolean 이 아닌 설정은 버린다
  assert.deepStrictEqual(JSON.parse(R.wipeSaveRaw(JSON.stringify({ muted: 'yes', cutin: 0, tutorialSeen: true, stages: { easy: [1] } }))), { tutorialSeen: true });
  // 깨진 JSON·배열·null·숫자·빈 값 -> 빈 객체(복구)
  ['{broken', '[1,2]', 'null', '12', '', null, undefined, '"x"'].forEach((raw) => assert.strictEqual(R.wipeSaveRaw(raw), '{}', String(raw)));
});

test('starsOfSave / deviceStars: 두 앱 저장 값의 별 개수(가중 없음)', () => {
  const store = memStore({ [GEN]: saveJson(), [EDU]: JSON.stringify(Object.assign(JSON.parse(saveJson()), { stages: { easy: [], normal: [{ stars: 1 }], hard: [{ stars: 9 }] } })) });
  const d = R.deviceStars(store);
  assert.strictEqual(d.gen, 5);                 // 정상 3 + 초보 2
  assert.strictEqual(d.edu, 1 + 3);             // 모양이 달라도 읽을 수 있는 별만, 한 칸 최대 3
  assert.strictEqual(d.total, d.gen + d.edu);
  assert.deepStrictEqual(R.deviceStars(memStore()), { gen: 0, edu: 0, total: 0 });
  assert.deepStrictEqual(R.deviceStars(memStore({ [GEN]: '{깨짐', [EDU]: 'null' })), { gen: 0, edu: 0, total: 0 });
});

test('eraseDeviceData: 두 앱 기록·sync·순위표 캐시 삭제, 설정·모드 선택 유지, 프로필은 {skipped,hadProfile} 뿐', () => {
  const store = memStore({
    [GEN]: saveJson(), [EDU]: eduSaveJson(), [PROF]: profileJson(),
    [SYNC_GEN]: JSON.stringify({ dirty: true, lastOkAt: 5 }), [SYNC_EDU]: JSON.stringify({ dirty: false, lastOkAt: 9 }),
    [HALL]: JSON.stringify({ all: { rows: [], me: { rank: 3 } } }), 'element-gems:mode': 'edu'
  });
  R.eraseDeviceData(store);
  [GEN, EDU].forEach((k) => {
    assert.deepStrictEqual(JSON.parse(store.get(k)), { muted: true, cutin: false, tutorialSeen: true }, k);
    assert.strictEqual(R.starsOfSave(G.parseSave(store.get(k))), 0);
  });
  assert.deepStrictEqual(JSON.parse(store.get(PROF)), { skipped: true, hadProfile: true });
  assert.strictEqual(store.get(SYNC_GEN), null);
  assert.strictEqual(store.get(SYNC_EDU), null);
  assert.strictEqual(store.get(HALL), null);
  assert.strictEqual(store.get('element-gems:mode'), 'edu');
  // 프로필 정리 뒤에도 이력이 남는다(다음 생성은 행 3)
  const p = R.normalizeProfile(JSON.parse(store.get(PROF)));
  assert.strictEqual(p.hadProfile, true); assert.strictEqual(p.skipped, true); assert.strictEqual(p.pid, '');
});

test('eraseDeviceData: 반대 앱 키가 깨진 JSON 이어도 같은 결과 / 없는 키는 새로 만들지 않는다', () => {
  const broken = memStore({ [GEN]: saveJson(), [EDU]: '{깨진 json', [PROF]: profileJson() });
  R.eraseDeviceData(broken);
  assert.strictEqual(broken.get(EDU), '{}');
  assert.deepStrictEqual(JSON.parse(broken.get(GEN)), { muted: true, cutin: false, tutorialSeen: true });
  const onlyGen = memStore({ [GEN]: saveJson() });
  R.eraseDeviceData(onlyGen);
  assert.strictEqual(onlyGen.get(EDU), null);
  assert.strictEqual(onlyGen.get(SYNC_GEN), null);
});

test('eraseDeviceData(recordsOnly, keepSync): 프로필은 그대로, 이 앱 sync 만 남김', () => {
  const store = memStore({ [GEN]: saveJson(), [EDU]: eduSaveJson(), [PROF]: profileJson({ hadProfile: true }), [SYNC_GEN]: '{"lastOkAt":1}', [SYNC_EDU]: '{"lastOkAt":2}', [HALL]: '{}' });
  R.eraseDeviceData(store, { recordsOnly: true, keepSync: SYNC_GEN });
  assert.strictEqual(store.get(PROF), profileJson({ hadProfile: true }));
  assert.strictEqual(store.get(SYNC_GEN), '{"lastOkAt":1}');
  assert.strictEqual(store.get(SYNC_EDU), null);
  assert.strictEqual(store.get(HALL), null);
  assert.strictEqual(R.deviceStars(store).total, 0);
});

test('normalizeProfile.hadProfile 파생: skipped·pid+pub·명시 값, 만들다 만 pid·깨진 값은 이력이 아님', () => {
  const N = R.normalizeProfile;
  assert.strictEqual(N(null).hadProfile, false);
  assert.strictEqual(N(undefined).hadProfile, false);
  assert.strictEqual(N('x').hadProfile, false);
  assert.strictEqual(N([]).hadProfile, false);
  assert.strictEqual(N({}).hadProfile, false);
  assert.strictEqual(N({ nick: '이름만' }).hadProfile, false);
  assert.strictEqual(N({ skipped: true }).hadProfile, true);                      // 옛 모양: 지웠거나 서버 행이 사라진 적 있음
  assert.strictEqual(N({ skipped: 'true' }).hadProfile, false);                   // boolean 이 아니면 아님
  assert.strictEqual(N({ hadProfile: true }).hadProfile, true);
  assert.strictEqual(N({ hadProfile: 'yes' }).hadProfile, false);
  assert.strictEqual(N({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 1, avatar: 3 }).hadProfile, true);   // 옛 모양: 만든 프로필
  assert.strictEqual(N({ pid: UUID }).hadProfile, false);                         // 만들다 만 시도(응답을 못 받음)는 이력이 아니다
  assert.strictEqual(N({ pid: 'not-a-uuid', pub: 'ABCD1234' }).hadProfile, false); // 깨진 pid
  assert.strictEqual(N({ pid: UUID, pub: 'x'.repeat(40) }).hadProfile, false);     // 깨진 pub
  // 항상 boolean
  [null, {}, { skipped: true }, { pid: UUID, pub: 'A' }].forEach((x) => assert.strictEqual(typeof N(x).hadProfile, 'boolean'));
});

test('코드 속 저장 키를 모두 RECORD_KEYS 가 알고 있다(정적 검색, spec §23.8)', () => {
  const known = new Set([].concat(K.save, K.sync, K.drop, [K.profile], K.keep, [K.note]));
  const files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).map((f) => path.join(dir, f))
    .concat([path.join(dir, 'index.html'), path.join(dir, '..', '..', 'index.html')]);
  const found = new Set();
  files.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    const re = /['"`]((?:element-gems|eg-)[a-z0-9:\-.]*)['"`]/g;     // 저장 키 모양의 문자열 상수
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  });
  // 저장 키가 아닌 같은 접두 문자열(파일 이름·클래스 등)은 제외 목록으로 명시한다
  const notKeys = new Set(['element-gems']);
  const unknown = Array.from(found).filter((k) => !known.has(k) && !notKeys.has(k));
  assert.deepStrictEqual(unknown, [], '저장 키가 RECORD_KEYS 에 없다: ' + unknown.join(', '));
  // 반대로 RECORD_KEYS 의 localStorage 키는 실제 코드에 나온다
  [GEN, SYNC_GEN, PROF, HALL, 'element-gems:mode'].forEach((k) => assert.ok(found.has(k), k));
});

/* ---------------------------------------------------------------------
 * 새 프로필 판정(spec §23.4.1)
 * ------------------------------------------------------------------- */
test('createMode 행 1~4', () => {
  // 행 1: 이력 없음 + 기록 있음(이 앱 저장소) -> 이어서 쓰기
  const r1 = setup({ store: memStore({ [GEN]: saveJson() }), noStars: true });
  assert.deepStrictEqual([r1.client.createMode().row, r1.client.createMode().records], [1, 'carry']);
  assert.strictEqual(r1.client.createMode().stars.total, 5);
  // 행 1: 반대 앱에만 기록이 있어도 기록 있음
  const r1b = setup({ store: memStore({ [EDU]: eduSaveJson() }), noStars: true });
  assert.strictEqual(r1b.client.createMode().row, 1);
  // 행 2: 이력 없음 + 기록 없음
  const r2 = setup({ noStars: true });
  assert.deepStrictEqual([r2.client.createMode().row, r2.client.createMode().records], [2, 'none']);
  // 행 3: 이력 있음(지운 뒤) + 기록 없음
  const r3 = setup({ store: memStore({ [PROF]: JSON.stringify({ skipped: true, hadProfile: true }) }), noStars: true });
  assert.deepStrictEqual([r3.client.createMode().row, r3.client.createMode().records], [3, 'none']);
  // 행 4: 이력 있음 + 기록 있음(옛 방식으로 지운 기기: skipped:true + 기록)
  const r4 = setup({ store: memStore({ [PROF]: JSON.stringify({ skipped: true }), [GEN]: saveJson() }), noStars: true });
  assert.deepStrictEqual([r4.client.createMode().row, r4.client.createMode().records], [4, 'wipe']);
  // 별 0개 기록(플레이만 함)은 기록으로 보지 않는다
  const zero = setup({ store: memStore({ [PROF]: JSON.stringify({ skipped: true }), [GEN]: JSON.stringify(Object.assign(JSON.parse(saveJson()), { stages: {} })) }), noStars: true });
  assert.strictEqual(zero.client.createMode().row, 3);
  // 저장소를 못 쓰는 환경: 실행 중 앱의 메모리 저장(getSave)도 기록으로 센다
  const live = setup({});
  assert.strictEqual(live.client.createMode().row, 1);
});

test('행 1 이어서 쓰기: 첫 /api/sync 에 d(이 앱 기록)가 실린다', async () => {
  const t = setup({ store: memStore({ [GEN]: saveJson() }) });
  const res = await t.client.saveProfile({ nick: '별빛냥', avatar: 3, records: t.client.createMode().records });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(t.calls.length, 1);
  assert.deepStrictEqual(t.calls[0].body.d.normal.slice(0, 2), [70, -1]);
  assert.strictEqual(t.client.profile().hadProfile, true);
  assert.strictEqual(JSON.parse(t.store.get(PROF)).hadProfile, true);
  assert.strictEqual(res.wiped, false);
  assert.strictEqual(R.deviceStars(t.store).total, 5);        // 기록은 그대로(이어서 쓴다)
});

test('행 2·3: 첫 /api/sync 에 d 가 없다(프로필만)', async () => {
  const noRec = setup({ noStars: true });
  assert.strictEqual((await noRec.client.saveProfile({ nick: '별빛냥', avatar: 3, records: 'none' })).ok, true);
  assert.strictEqual('d' in noRec.calls[0].body, false);
  assert.ok(noRec.calls[0].body.profile);
  // 지운 뒤(이력 있음)의 표준 경로: records 를 주지 않아도 판정이 같다
  const after = setup({ store: memStore({ [PROF]: JSON.stringify({ skipped: true, hadProfile: true }) }), noStars: true });
  assert.strictEqual((await after.client.saveProfile({ nick: '별빛냥', avatar: 3 })).ok, true);
  assert.strictEqual('d' in after.calls[0].body, false);
  assert.strictEqual(after.client.status().dirty, false);
});

test('행 4: d 없이 만들고, 성공한 뒤에만 두 앱 기록을 지운다(설정 유지)', async () => {
  const store = memStore({ [PROF]: JSON.stringify({ skipped: true }), [GEN]: saveJson(), [EDU]: eduSaveJson(), [SYNC_EDU]: '{"dirty":true}', [HALL]: '{}' });
  const t = setup({ store, noStars: true });
  const res = await t.client.saveProfile({ nick: '별빛냥', avatar: 3, records: t.client.createMode().records });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.wiped, true);
  assert.strictEqual('d' in t.calls[0].body, false);
  assert.strictEqual(R.deviceStars(store).total, 0);
  assert.deepStrictEqual(JSON.parse(store.get(GEN)), { muted: true, cutin: false, tutorialSeen: true });
  assert.strictEqual(store.get(SYNC_EDU), null);               // 반대 앱의 옛 제출 대기는 따라가지 않는다
  assert.ok(store.get(SYNC_GEN));                              // 방금 저장한 이 앱 sync 는 남는다
  assert.strictEqual(store.get(HALL), null);
  const p = JSON.parse(store.get(PROF));
  assert.strictEqual(p.hadProfile, true); assert.strictEqual(p.nick, '별빛냥'); assert.strictEqual(p.pid, UUID);
});

test('행 4: 닉네임 거절·서버 오류·오프라인이면 기록을 지우지 않는다', async () => {
  const mk = () => memStore({ [PROF]: JSON.stringify({ skipped: true }), [GEN]: saveJson(), [EDU]: eduSaveJson() });
  for (const handler of [() => jsonRes(400, errJson('nick_blocked')), () => jsonRes(503, errJson('db_unavailable')), () => jsonRes(200, 'not json')]) {
    const store = mk();
    const t = setup({ store, noStars: true, handler });
    const res = await t.client.saveProfile({ nick: '별빛냥', avatar: 3, records: 'wipe' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(store.get(GEN), saveJson(), '기록이 그대로여야 한다');
    assert.strictEqual(store.get(EDU), eduSaveJson());
    assert.strictEqual(R.deviceStars(store).total, 10);
  }
  const store = mk();
  const t = setup({ store, noStars: true, offline: true, handler: () => { throw new Error('offline'); } });
  assert.strictEqual((await t.client.saveProfile({ nick: '별빛냥', avatar: 3, records: 'wipe' })).ok, false);
  assert.strictEqual(R.deviceStars(store).total, 10);
});

test('만들다 만 시도(pid 만 저장됨)는 이력이 아니다: 다시 열어도 행 1(이어서 쓰기)이다', async () => {
  const store = memStore({ [GEN]: saveJson() });
  const first = setup({ store, noStars: true, handler: () => jsonRes(503, errJson('db_unavailable')) });
  assert.strictEqual((await first.client.saveProfile({ nick: '별빛냥', avatar: 3 })).ok, false);
  assert.ok(JSON.parse(store.get(PROF)).pid);                  // 같은 pid 로 다시 시도하려고 저장돼 있다
  const again = setup({ store, noStars: true });
  assert.strictEqual(again.client.profile().hadProfile, false);
  assert.strictEqual(again.client.createMode().row, 1);
});

test('프로필 수정(이미 만든 프로필)은 지금처럼 기록(d)을 함께 올리고 기록을 지우지 않는다(회귀)', async () => {
  const store = memStore({ [PROF]: profileJson({ hadProfile: true }), [GEN]: saveJson(), [EDU]: eduSaveJson() });
  const t = setup({ store, noStars: true });
  assert.strictEqual(t.client.registered(), true);
  const res = await t.client.saveProfile({ nick: '달빛냥', avatar: 5 });
  assert.strictEqual(res.ok, true);
  assert.ok(t.calls[0].body.d);
  assert.strictEqual(res.wiped, false);
  assert.strictEqual(store.get(GEN), saveJson());
  assert.strictEqual(store.get(EDU), eduSaveJson());
  assert.strictEqual(deleteCalls(t.calls).length, 0);
});

/* ---------------------------------------------------------------------
 * 프로필 지우기: 마지막 전송 → 정리 (spec §23.3.5)
 * ------------------------------------------------------------------- */
function registeredSetup(over) {
  const o = Object.assign({}, over);
  o.store = o.store || memStore({ [PROF]: profileJson({ hadProfile: true }), [GEN]: saveJson(), [EDU]: eduSaveJson(), [HALL]: '{}' });
  o.noStars = true;
  return setup(o);
}
const dirtyIt = (t) => { t.store.set(SYNC_GEN, JSON.stringify({ dirty: true, lastOkAt: 1, fails: 0, nextTryAt: 0, blocked: false })); };

test('지우기: 올릴 것이 없으면(dirty 아님) 전송 없이 바로 지운다, /api/delete 0회', async () => {
  const t = registeredSetup();
  assert.strictEqual(t.client.erasePending(), false);
  const res = await t.client.eraseDevice();
  assert.strictEqual(res.ok, true); assert.strictEqual(res.lastFailed, false); assert.strictEqual(res.pending, false);
  assert.strictEqual(t.calls.length, 0);
  assert.strictEqual(R.deviceStars(t.store).total, 0);
  assert.deepStrictEqual(JSON.parse(t.store.get(PROF)), { skipped: true, hadProfile: true });
  assert.strictEqual(t.client.registered(), false);
});

test('지우기: dirty + 온라인이면 /api/sync 1회(d 포함) 뒤에 지운다, /api/delete 0회', async () => {
  const t = registeredSetup();
  dirtyIt(t);
  const t2 = setup({ store: t.store, noStars: true });
  assert.strictEqual(t2.client.erasePending(), true);
  const res = await t2.client.eraseDevice();
  assert.strictEqual(syncCalls(t2.calls).length, 1);
  assert.ok(t2.calls[0].body.d && t2.calls[0].body.d.normal);
  assert.strictEqual(t2.calls[0].body.profile, undefined);
  assert.strictEqual(deleteCalls(t2.calls).length, 0);
  assert.strictEqual(res.lastFailed, false); assert.strictEqual(res.uploaded, true);
  assert.strictEqual(R.deviceStars(t2.store).total, 0);
  assert.strictEqual(t2.store.get(SYNC_GEN), null);
  assert.strictEqual(t2.store.get(HALL), null);
});

test('지우기: 오프라인이면 보내지 않고 바로 지우며, 마지막 기록을 못 올렸다고 알린다', async () => {
  const base = registeredSetup();
  dirtyIt(base);
  const t = setup({ store: base.store, noStars: true, offline: true });
  const res = await t.client.eraseDevice();
  assert.strictEqual(t.calls.length, 0);
  assert.strictEqual(res.pending, true); assert.strictEqual(res.lastFailed, true);
  assert.strictEqual(R.deviceStars(t.store).total, 0);
});

test('지우기: 서버 503·비 JSON·네트워크 오류여도 지우기는 성공하고 안내만 붙는다', async () => {
  for (const handler of [() => jsonRes(503, errJson('db_unavailable')), () => jsonRes(200, '<html>'), () => { throw new Error('boom'); }]) {
    const base = registeredSetup();
    dirtyIt(base);
    const t = setup({ store: base.store, noStars: true, handler });
    const res = await t.client.eraseDevice();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.lastFailed, true);
    assert.strictEqual(syncCalls(t.calls).length, 1);
    assert.strictEqual(deleteCalls(t.calls).length, 0);
    assert.strictEqual(R.deviceStars(t.store).total, 0);
    assert.deepStrictEqual(JSON.parse(t.store.get(PROF)), { skipped: true, hadProfile: true });
  }
});

test('지우기: 서버가 응답하지 않아도(멈춤) 가짜 시계로 약 7초 안에 끝난다', async () => {
  const base = registeredSetup();
  dirtyIt(base);
  const t = setup({ store: base.store, noStars: true, handler: () => new Promise(() => {}) });
  let done = false;
  const p = t.client.eraseDevice().then((r) => { done = true; return r; });
  await settle();
  assert.strictEqual(done, false);
  await t.clock.advance(G.CONFIG.ranking.eraseFlushTimeoutMs - 1);
  assert.strictEqual(done, false);
  await t.clock.advance(2);                                        // 요청 제한 시간(4초) 지남
  const res = await p;
  assert.strictEqual(done, true);
  assert.strictEqual(res.lastFailed, true);
  assert.strictEqual(R.deviceStars(t.store).total, 0);
  assert.strictEqual(deleteCalls(t.calls).length, 0);
  assert.ok(G.CONFIG.ranking.eraseFlushTimeoutMs === 4000);
});

test('지우기: 직전 전송이 3초 안이면 남은 시간을 기다렸다가 정확히 1회만 보낸다', async () => {
  const base = registeredSetup();
  dirtyIt(base);
  const t = setup({ store: base.store, noStars: true });
  t.client.start();                                                // dirty -> 1.5초 뒤 제출 예약
  await t.clock.advance(1500);
  assert.strictEqual(syncCalls(t.calls).length, 1);                // 첫 제출(성공)
  assert.strictEqual(t.client.status().dirty, false);
  t.client.markDirty(60000);                                       // 기록이 또 올랐다(제출은 한참 뒤로 예약) — 직전 전송은 방금
  assert.strictEqual(t.client.erasePending(), true);
  let done = false;
  const p = t.client.eraseDevice().then((r) => { done = true; return r; });
  await settle();
  assert.strictEqual(syncCalls(t.calls).length, 1);                // 아직 기다리는 중(서버의 3초 간격)
  assert.strictEqual(done, false);
  await t.clock.advance(3000);
  const res = await p;
  assert.strictEqual(syncCalls(t.calls).length, 2);                // 기다린 뒤 정확히 1회
  assert.ok(t.calls[1].t - t.calls[0].t >= 3000);
  assert.strictEqual(res.lastFailed, false);
  assert.strictEqual(deleteCalls(t.calls).length, 0);
  assert.strictEqual(t.clock.pending(), 0);                        // 예약돼 있던 제출 타이머도 정리됐다
});

test('지우기 뒤 늦게 도는 타이머·응답이 키를 되살리지 않는다', async () => {
  const base = registeredSetup();
  dirtyIt(base);
  // 일반 제출이 이미 진행 중인데 서버가 한참 응답하지 않는다(요청 제한 8초가 지우기 끝난 뒤에 돌아온다)
  const t = setup({ store: base.store, noStars: true, handler: () => new Promise(() => {}) });
  t.client.start();                                                    // dirty -> 1.5초 뒤 일반 제출
  await t.clock.advance(1500);
  assert.strictEqual(syncCalls(t.calls).length, 1);
  assert.strictEqual(t.client.status().inflight, true);
  const p = t.client.eraseDevice();                                    // 진행 중인 제출이 끝나기를 기다리지만 약 7.3초에 끊고 지운다
  await settle();
  await t.clock.advance(G.CONFIG.ranking.eraseFlushTimeoutMs + 3500);
  const res = await p;
  assert.strictEqual(res.lastFailed, true);
  const snapshot = JSON.stringify(base.store._m);
  assert.strictEqual(base.store.get(SYNC_GEN), null);
  await t.clock.advance(30000);                                        // 일반 제출의 8초 제한이 이제 돌아와 '실패 기록·재시도 예약'을 하려 한다
  assert.strictEqual(JSON.stringify(base.store._m), snapshot, '지운 뒤 저장소가 바뀌었다');
  assert.strictEqual(base.store.get(SYNC_GEN), null);
  assert.deepStrictEqual(JSON.parse(base.store.get(PROF)), { skipped: true, hadProfile: true });
  assert.strictEqual(syncCalls(t.calls).length, 1, '지운 뒤 다시 보내지 않는다');
  // 지운 클라이언트는 더 이상 제출을 예약하지 않는다
  assert.strictEqual(t.client.markDirty(0), false);
  t.client.onOnline(); t.client.onVisible();
  await t.clock.advance(60000);
  assert.strictEqual(base.store.get(SYNC_GEN), null);
  assert.strictEqual(t.clock.pending(), 0);
  assert.strictEqual(deleteCalls(t.calls).length, 0);
});

test('지운 뒤 새 프로필(행 3)은 서버에서도 0부터: 요청 본문에 d 가 없다', async () => {
  const base = registeredSetup();
  const first = setup({ store: base.store, noStars: true });
  await first.client.eraseDevice();
  const second = setup({ store: base.store, noStars: true, uuid: UUID2 });   // 새로고침한 새 접속
  assert.strictEqual(second.client.registered(), false);
  assert.strictEqual(second.client.createMode().row, 3);
  const res = await second.client.saveProfile({ nick: '새이름', avatar: 4, records: second.client.createMode().records });
  assert.strictEqual(res.ok, true);
  assert.strictEqual('d' in second.calls[0].body, false);
  assert.strictEqual(second.calls[0].body.pid, UUID2);               // 새 pid(새 서버 행)
  assert.strictEqual(R.deviceStars(second.store).total, 0);
});

test('옛 deleteProfile 은 코드에 남아 있지만 지우기 흐름은 부르지 않는다(서버 삭제 API 0회)', async () => {
  const t = registeredSetup();
  dirtyIt(t);
  const c = setup({ store: t.store, noStars: true });
  await c.client.eraseDevice();
  assert.strictEqual(typeof c.client.deleteProfile, 'function');
  assert.strictEqual(deleteCalls(c.calls).length, 0);
  const ui = fs.readFileSync(path.join(dir, 'ranking-ui.js'), 'utf8');
  assert.doesNotMatch(ui, /deleteProfile\s*\(/);
  assert.doesNotMatch(ui, /\/api\/delete/);
});

/* ---------------------------------------------------------------------
 * 연결(정적 점검)
 * ------------------------------------------------------------------- */
test('연결(정적 점검): 마크업 id·확인창 역할·.pf-small 문구·CONFIG 수치·CSS', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  ['pf-actions', 'pf-confirm', 'pf-confirm-yes', 'pf-confirm-no', 'pf-confirm2', 'pf-confirm2-yes', 'pf-confirm2-no', 'pf-pend', 'pf-carry', 'pf-wipe', 'pf-del-rec', 'pf-del-hall'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  assert.match(html, /id="pf-confirm"[^>]*role="alertdialog"/);
  assert.match(html, /id="pf-confirm2"[^>]*role="alertdialog"/);
  assert.ok(html.includes('그만둘래요') && html.includes('이 기기에서만 지우기') && html.includes('아니요, 그대로 둘래요') && html.includes('네, 지울게요'));
  assert.ok(html.includes('순위표에 올라간 이름은 내가 직접 지울 수 없으니 신중하게 정해요'));
  assert.ok(!html.includes('언제든 [프로필 지우기]로 지울 수 있어요'));        // 고칠 수 없는 약속 삭제(§23.5.4)
  assert.match(game, /eraseFlushTimeoutMs:\s*4000/);
  ['.btn.danger', '.pf-ask', '.pf-pend', '.pf-carry'].forEach((sel) => assert.ok(css.includes(sel), sel));
  // 안전한 쪽(그만둘래요)이 DOM 에서 먼저 — 키보드 순서와 화면 순서를 맞춘다
  assert.ok(html.indexOf('id="pf-confirm-no"') < html.indexOf('id="pf-confirm-yes"'));
  assert.ok(html.indexOf('id="pf-confirm2-no"') < html.indexOf('id="pf-confirm2-yes"'));
});
