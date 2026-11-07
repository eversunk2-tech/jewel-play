'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../mock/server');
const { uuid, prog } = require('./helpers');

async function start(options) {
  const s = createServer(Object.assign({ quiet: true, cacheSec: 0 }, options || {}));
  await new Promise((res) => s.server.listen(0, '127.0.0.1', res));
  s.base = 'http://127.0.0.1:' + s.server.address().port;
  s.stop = () => new Promise((res) => { s.server.close(res); s.server.closeAllConnections && s.server.closeAllConnections(); });
  return s;
}
const post = (base, path, body, headers) => fetch(base + path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: Object.assign({ 'Content-Type': 'text/plain;charset=UTF-8' }, headers || {}) });

test('목 서버: 같은 handle() 로 sync -> leaderboard -> rank -> delete 한 바퀴 (text/plain 요청, 로컬 CORS)', async () => {
  const s = await start();
  try {
    const O = { Origin: 'http://localhost:8765' };
    const pid = uuid();
    const r = await post(s.base, '/api/sync', { v: 1, pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70, 40]) }, O);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:8765');
    const me = (await r.json()).me;
    assert.equal(me.stars.all, 5);
    const lb = await (await fetch(s.base + '/api/leaderboard?board=all', { headers: O })).json();
    assert.deepEqual(lb.rows.map((x) => [x.rank, x.nick, x.stars]), [[1, '별빛냥', 5]]);
    const rk = await (await fetch(s.base + '/api/rank?board=all&pub=' + me.pub, { headers: O })).json();
    assert.equal(rk.rank, 1);
    const del = await (await post(s.base, '/api/delete', { v: 1, pid }, O)).json();
    assert.equal(del.deleted, true);
    assert.equal((await (await fetch(s.base + '/api/leaderboard?board=all')).json()).rows.length, 0);
    // 허용 밖 오리진
    assert.equal((await fetch(s.base + '/api/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
    // 프리플라이트
    const pre = await fetch(s.base + '/api/sync', { method: 'OPTIONS', headers: Object.assign({ 'Access-Control-Request-Method': 'POST' }, O) });
    assert.equal(pre.status, 204);
    // 큰 본문
    assert.equal((await post(s.base, '/api/sync', 'x'.repeat(3000))).status, 413);
    assert.equal((await post(s.base, '/api/sync', 'x'.repeat(100000))).status, 413);
  } finally { await s.stop(); }
});

test('목 서버 제어 주소: 장애 흉내(503/500/html/slow), 시간 이동, 초기화', async () => {
  const s = await start();
  try {
    const ctl = (p, b) => post(s.base, '/__mock/' + p, b || {}).then((r) => r.json());
    await ctl('fail', { mode: '503', count: 2 });
    for (let i = 0; i < 2; i++) {
      const r = await fetch(s.base + '/api/health');
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error.code, 'db_unavailable');
    }
    assert.equal((await fetch(s.base + '/api/health')).status, 200, 'count 만큼만 적용');
    await ctl('fail', { mode: 'html' });
    const h = await fetch(s.base + '/api/health');
    assert.match(h.headers.get('content-type'), /text\/html/);
    await assert.rejects(h.json());
    await ctl('fail', { mode: '500' });
    assert.equal((await fetch(s.base + '/api/health')).status, 500);
    await ctl('fail', { mode: 'slow', ms: 150 });
    const t0 = Date.now();
    assert.equal((await fetch(s.base + '/api/health')).status, 200);
    assert.ok(Date.now() - t0 >= 140);
    await ctl('fail', { mode: 'off' });
    // 시간 이동: 닉네임 하루 2회 한도를 하루 뒤에 푼다
    const pid = uuid();
    const mk = (nick) => post(s.base, '/api/sync', { v: 1, pid, profile: { nick, avatar: 1 } }).then(async (r) => ({ status: r.status, json: await r.json() }));
    assert.equal((await mk('하나둘')).status, 200);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await ctl('time', { addSec: 4 });
    assert.equal((await mk('둘셋넷')).status, 200);
    await ctl('time', { addSec: 4 });
    assert.equal((await mk('셋넷다')).status, 200);
    await ctl('time', { addSec: 4 });
    assert.equal((await mk('넷다여')).json.error.code, 'nick_change_limit');
    await ctl('time', { addSec: 86400 });
    assert.equal((await mk('넷다여')).status, 200);
    assert.ok(wait);
    const st = await ctl('reset');
    assert.equal(st.players, 0);
    assert.equal((await ctl('state')).mode, 'off');
  } finally { await s.stop(); }
});

test('목 서버: 관리자 키는 환경 값을 줬을 때만 동작', async () => {
  const none = await start();
  try { assert.equal((await fetch(none.base + '/api/admin/search?q=a')).status, 404); } finally { await none.stop(); }
  const withKey = await start({ adminKey: 'mock-only-key' });
  try {
    assert.equal((await fetch(withKey.base + '/api/admin/search?q=a')).status, 401);
    assert.equal((await fetch(withKey.base + '/api/admin/search?q=a', { headers: { authorization: 'Bearer ' + 'mock-only-key' } })).status, 200);
  } finally { await withKey.stop(); }
});
