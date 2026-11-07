'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createDb } = require('../mock/d1-adapter');
const { uuid, prog } = require('./helpers');

const DIST = path.join(__dirname, '..', 'dist', 'worker.js');

test('build.js --check: dist/worker.js 가 원본과 같다', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('dist/worker.js: ES 모듈 Worker 로 읽히고, 비밀·로컬 경로가 없고, src 와 같은 응답을 한다', async () => {
  const text = fs.readFileSync(DIST, 'utf8');
  assert.match(text, /^\/\/ element-gems/);
  assert.match(text, /export default __require\('worker'\)\.default;\s*$/);
  assert.ok(!/node:|process\.|__dirname|require\('fs'\)/.test(text.replace(/\/\/ .*$/gm, '')), 'Node 전용 API 사용 금지');
  assert.ok(!/(sk|ghp|AKIA)[A-Za-z0-9_-]{16,}/.test(text) && !/Bearer [A-Za-z0-9]{12,}/.test(text) && !/ADMIN_KEY\s*[:=]\s*['"][^'"]/.test(text));
  assert.ok(!text.includes('/Users/'), '개인 경로가 들어가면 안 됨');

  // .mjs 로 복사해 진짜 ES 모듈로 불러온다 (Workers 가 하는 방식)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-dist-'));
  try {
    const file = path.join(dir, 'worker.mjs');
    fs.copyFileSync(DIST, file);
    const mod = await import('file://' + file);
    assert.equal(typeof mod.default.fetch, 'function');
    const env = { DB: createDb(), ALLOWED_ORIGINS: 'https://eversunk2-tech.github.io', LB_CACHE_SEC: '0' };
    const call = async (method, p, body, headers) => {
      const res = await mod.default.fetch(new Request('https://x.example' + p, { method, body: body ? JSON.stringify(body) : undefined, headers: Object.assign({ 'cf-connecting-ip': '192.0.2.8' }, headers || {}) }), env, {});
      return { status: res.status, json: await res.json() };
    };
    assert.equal((await call('GET', '/api/health')).status, 200);
    const pid = uuid();
    const created = await call('POST', '/api/sync', { v: 1, pid, profile: { nick: '별빛냥', avatar: 16 }, d: prog([70, 40]) });
    assert.equal(created.status, 200);
    assert.equal(created.json.me.stars.all, 5);
    const lb = await call('GET', '/api/leaderboard?board=all');
    assert.equal(lb.json.rows[0].nick, '별빛냥');
    assert.equal((await call('GET', '/api/rank?board=all&pub=' + created.json.me.pub)).json.rank, 1);
    // 닉네임 검증도 같은 결과 (같은 nickname.js / nick-words.js 가 묶여 있음)
    for (const [nick, code] of [['시발', 'nick_blocked'], ['3학년2반', 'nick_pii'], ['관리자', 'nick_reserved'], ['아아아', 'nick_repeat']]) {
      const r = await call('POST', '/api/sync', { v: 1, pid: uuid(), profile: { nick, avatar: 1 } });
      assert.equal(r.json.error.code, code, nick);
    }
    assert.equal((await call('GET', '/api/health', null, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call('POST', '/api/delete', { v: 1, pid })).json.deleted, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
