/* 프로필 만들기 순서(메인 화면 먼저, [시작]에서 안내 팝업) 시험. 실행: node --test apps/element-gems/test/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'ranking.js'));
const G = require(path.join(__dirname, '..', 'game.js'));

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const okMe = () => ({ ok: true, v: 1, me: { pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 } }, changed: true, nickChangesLeft: 2, serverTime: 1 });
const jsonRes = (status, obj) => ({ status, headers: { get: () => null }, text: async () => JSON.stringify(obj) });
function memStore(initial) {
  const m = Object.assign({}, initial);
  return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, remove: (k) => { delete m[k]; } };
}
async function settle() { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); }

function make(over) {
  const o = over || {};
  const calls = [];
  const save = G.defaultSave();
  G.applyStageResult(save, 'normal', 1, 9000, true, 3, 70);
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: o.apiBase === undefined ? 'http://x.test/' : o.apiBase, minSubmitGapMs: 0 }),
    store: o.store || memStore(),
    fetch: async (url, init) => { calls.push({ url, init }); return jsonRes(200, okMe()); },
    timers: { set: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clear: clearTimeout },
    getSave: () => save, stageCount: 10, caps: { easy: 150, normal: 140, hard: 120 },
    crypto: { randomUUID: () => UUID }
  });
  return { client, calls };
}
const registeredStore = () => memStore({ 'element-gems:profile:v1': JSON.stringify({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }) });

test('startGate: 랭킹 켜짐 + 프로필 없음 + 선택 없음 -> prompt, 나머지는 모두 go', () => {
  assert.strictEqual(R.startGate({ enabled: true, registered: false, sessionOptOut: false }), 'prompt');
  assert.strictEqual(R.startGate({ enabled: true, registered: true, sessionOptOut: false }), 'go');
  assert.strictEqual(R.startGate({ enabled: false, registered: false, sessionOptOut: false }), 'go');   // apiBase 빔
  assert.strictEqual(R.startGate({ enabled: true, registered: false, sessionOptOut: true }), 'go');     // 이번 접속에서 프로필 없이
  assert.strictEqual(R.startGate(), 'go');
  assert.strictEqual(R.startGate({}), 'go');
});

test('첫 실행(프로필 없음, apiBase 있음): [시작]은 팝업, 프로필이 이미 "나중에"로 저장돼 있어도 팝업', () => {
  const t = make();
  assert.strictEqual(t.client.needsProfilePrompt(), true);
  const skipped = make({ store: memStore({ 'element-gems:profile:v1': JSON.stringify({ skipped: true }) }) });
  assert.strictEqual(skipped.client.needsProfilePrompt(), true);   // 예전 "나중에" 저장값은 더 이상 팝업을 막지 않는다
  assert.strictEqual(t.calls.length, 0);                           // 팝업만으로는 서버 요청 없음
});

test('프로필 있음: 팝업 없음', () => {
  const t = make({ store: registeredStore() });
  assert.strictEqual(t.client.registered(), true);
  assert.strictEqual(t.client.needsProfilePrompt(), false);
});

test('apiBase 빔: 팝업 없음', () => {
  const t = make({ apiBase: '' });
  assert.strictEqual(t.client.enabled(), false);
  assert.strictEqual(t.client.needsProfilePrompt(), false);
});

test('"프로필 없이 시작" 뒤: 팝업 다시 안 뜸, 서버 제출 0회, 새 접속(새 client)에서는 다시 팝업', async () => {
  const t = make();
  t.client.setSessionOptOut(true);
  assert.strictEqual(t.client.sessionOptOut(), true);
  assert.strictEqual(t.client.needsProfilePrompt(), false);
  assert.strictEqual(t.client.markDirty(0), false);                // 프로필 없으니 제출 표시도 안 된다
  await t.client.flush();
  await settle();
  assert.strictEqual(t.calls.length, 0);
  // 같은 localStorage(영구 저장)를 쓰는 새 접속
  const again = make({ store: memStore() });
  assert.strictEqual(again.client.needsProfilePrompt(), true);
});

test('"프로필 없이" 상태에서는 등록된 프로필이 있더라도(방어) markDirty/flush 가 요청을 보내지 않는다', async () => {
  const t = make({ store: registeredStore() });
  t.client.setSessionOptOut(true);
  assert.strictEqual(t.client.markDirty(0), false);
  const r = await t.client.flush();
  await settle();
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(t.calls.length, 0);
});

test('"프로필 없이" 뒤 나중에 프로필을 만들면: 그때까지의 진행 전체가 한 번에 제출되고, 이후엔 팝업이 없다', async () => {
  const t = make();
  t.client.setSessionOptOut(true);
  const res = await t.client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(t.calls.length, 1);
  const body = JSON.parse(t.calls[0].init.body);
  assert.deepStrictEqual(body.d.normal.slice(0, 2), [70, -1]);     // 이미 깬 기록이 함께 간다
  assert.strictEqual(body.profile.nick, '별빛냥');
  assert.strictEqual(t.client.sessionOptOut(), false);
  assert.strictEqual(t.client.needsProfilePrompt(), false);
  assert.strictEqual(t.client.markDirty(0), true);                 // 이제 정상 제출 대상
});

test('프로필 만들기 실패하면 "프로필 없이" 선택은 그대로 유지', async () => {
  const calls = [];
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/' }),
    store: memStore(), fetch: async (u, i) => { calls.push(u); return jsonRes(503, { ok: false, v: 1, error: { code: 'db_unavailable', message: 'x' } }); },
    timers: { set: (fn) => setTimeout(fn, 1), clear: clearTimeout }, getSave: () => G.defaultSave(), stageCount: 10, crypto: { randomUUID: () => UUID }
  });
  client.setSessionOptOut(true);
  const res = await client.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(client.sessionOptOut(), true);
});

test('연결(정적 점검): index.html 팝업 마크업, game.js 게이트, ranking-ui.js 첫 화면 자동 진입 없음', () => {
  const dir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(dir, 'ranking-ui.js'), 'utf8');
  const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  assert.match(html, /id="overlay-profile-ask"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="pa-title"/);
  ['pa-title', 'pa-create', 'pa-without', 'pa-close'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  assert.ok(html.includes('프로필을 만들어 주세요'));
  assert.ok(html.includes('프로필 없이 시작'));
  assert.doesNotMatch(ui, /openProfile\('create'\)\s*;\s*\n\s*else if \(p\.registered/);   // 예전 첫 화면 자동 진입이 없다
  assert.ok(!/!p\.registered && !p\.skipped && host\.getPhase\(\) === 'start'\) openProfile/.test(ui));
  assert.ok(ui.includes('host.setStartGate(startGate)'));
  assert.ok(game.includes('setStartGate') && game.includes('enterStages'));
});

test('연결(정적 점검, spec §23): ranking-ui.js 가 지우기 확인 ①②·새 프로필 판정·다른 탭 감지를 쓰고 옛 삭제 호출은 없다', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'ranking-ui.js'), 'utf8');
  ['client.createMode()', 'client.erasePending()', 'client.eraseDevice()', "'storage'", 'R.RECORD_KEYS.note', 'window.location.reload()'].forEach((s) => assert.ok(ui.includes(s), s));
  assert.doesNotMatch(ui, /deleteProfile\s*\(/);
  assert.match(ui, /input\.records = ui\.createInfo\.records/);
});
