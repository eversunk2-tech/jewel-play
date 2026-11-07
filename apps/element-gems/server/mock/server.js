#!/usr/bin/env node
/* element-gems server - mock/server.js
 * 계정 없이 쓰는 로컬 목 서버: Node 내장 node:sqlite 에 server/schema.sql 을 적용하고, 실제 Worker 와 **같은** src/worker.js 의 handle() 을 돌린다.
 *   node apps/element-gems/server/mock/server.js [--port 8787] [--host 127.0.0.1] [--db 파일경로] [--cache-sec 3] [--origins http://localhost:9000] [--quiet]
 * 환경 변수: PORT, MOCK_DB, ALLOWED_ORIGINS(추가 허용 오리진, 쉼표), EXTRA_BLOCK, ADMIN_KEY(시험용 값을 직접 넣을 때만 /api/admin/* 동작), IP_SALT
 * 기본: 메모리 DB(끄면 사라짐), 포트 8787, 허용 오리진 http://localhost:* 와 http://127.0.0.1:*, 순위표 캐시 3초(실제 Worker 는 30초).
 *
 * 시험용 제어 주소(/__mock/*, 목 서버에만 있고 실제 Worker 에는 없음) - 클라이언트의 오프라인·오류 동작을 확인할 때 쓴다:
 *   POST /__mock/fail   {"mode":"503"|"500"|"html"|"slow"|"hang"|"off","ms":3000,"count":2}
 *        503 = db_unavailable JSON, 500 = server_error JSON, html = JSON 아닌 본문(Error 1027 흉내), slow = ms 만큼 늦게 응답, hang = 응답 안 함(타임아웃 시험)
 *        count 를 주면 그 횟수만 적용한 뒤 자동으로 off. /api/* 요청에만 적용된다.
 *   POST /__mock/time   {"addSec":86400}   서버 시계를 앞으로 보낸다(닉네임 하루 2회 한도 확인 등) / {"offsetSec":0} 으로 되돌린다
 *   POST /__mock/reset                      players, rate_limits 를 비운다
 *   GET  /__mock/state                      현재 상태
 */
'use strict';

const http = require('node:http');
const path = require('node:path');
const { createDb } = require('./d1-adapter');
const worker = require(path.join(__dirname, '..', 'src', 'worker.js'));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quiet') out.quiet = true;
    else if (a.startsWith('--') && i + 1 < argv.length) { out[a.slice(2)] = argv[++i]; }
  }
  return out;
}

function createServer(options) {
  const o = options || {};
  const DB = createDb(o.db || null);
  const state = { mode: 'off', ms: 0, count: 0, offsetSec: 0 };
  const origins = ['http://localhost:*', 'http://127.0.0.1:*'].concat(o.origins ? String(o.origins).split(',') : []).join(',');
  const env = {
    DB: DB,
    ALLOWED_ORIGINS: origins,
    EXTRA_BLOCK: o.extraBlock || '',
    IP_SALT: o.ipSalt || '',
    LB_CACHE_SEC: String(o.cacheSec === undefined ? 3 : o.cacheSec)
  };
  if (o.adminKey) env.ADMIN_KEY = o.adminKey;
  const opts = { now: () => Date.now() + state.offsetSec * 1000 };

  function corsFor(req) {
    const origin = req.headers.origin;
    if (!origin) return {};
    const { originAllowed } = require('../src/core.js');
    return originAllowed(origin, origins) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size <= limit) chunks.push(c);          // 한도를 넘으면 버리면서 끝까지 읽는다(연결을 끊지 않고 413 으로 답하려고)
      });
      req.on('end', () => (size > limit ? reject(new Error('too_large')) : resolve(Buffer.concat(chunks))));
      req.on('error', reject);
    });
  }

  function sendJson(res, status, obj, extra) {
    const body = JSON.stringify(obj);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
    res.end(body);
  }

  async function control(req, res, pathname) {
    const cors = corsFor(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, Object.assign({ 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, cors));
      return res.end();
    }
    let body = {};
    if (req.method === 'POST') {
      try { const b = await readBody(req, 4096); body = b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { return sendJson(res, 400, { ok: false }, cors); }
    }
    if (pathname === '/__mock/fail') {
      state.mode = ['503', '500', 'html', 'slow', 'hang', 'off'].includes(body.mode) ? body.mode : 'off';
      state.ms = Number(body.ms) || 3000;
      state.count = Number(body.count) || 0;
    } else if (pathname === '/__mock/time') {
      if (typeof body.offsetSec === 'number') state.offsetSec = body.offsetSec;
      if (typeof body.addSec === 'number') state.offsetSec += body.addSec;
    } else if (pathname === '/__mock/reset') {
      DB.exec('DELETE FROM players; DELETE FROM rate_limits; DELETE FROM sqlite_sequence;');
    } else if (pathname !== '/__mock/state') {
      return sendJson(res, 404, { ok: false }, cors);
    }
    const n = await DB.prepare('SELECT COUNT(*) AS n FROM players').first();
    return sendJson(res, 200, { ok: true, mock: true, mode: state.mode, ms: state.ms, count: state.count, offsetSec: state.offsetSec, players: n.n }, cors);
  }

  /** 장애 흉내. 처리했으면 true */
  async function chaos(req, res) {
    if (state.mode === 'off') return false;
    const mode = state.mode;
    if (state.count > 0) { state.count--; if (state.count === 0) state.mode = 'off'; }
    const cors = corsFor(req);
    if (mode === '503') { sendJson(res, 503, { ok: false, v: 1, error: { code: 'db_unavailable', message: '지금은 순위표를 쓸 수 없어요. 조금 뒤에 다시 해 주세요.' } }, cors); return true; }
    if (mode === '500') { sendJson(res, 500, { ok: false, v: 1, error: { code: 'server_error', message: '서버에 문제가 생겼어요. 조금 뒤에 다시 해 주세요.' } }, cors); return true; }
    if (mode === 'html') {
      res.writeHead(429, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, cors));
      res.end('<!doctype html><title>Error 1027</title><p>error code: 1027</p>');
      return true;
    }
    if (mode === 'hang') { setTimeout(() => { try { res.destroy(); } catch (e) { /* 이미 닫힘 */ } }, 60000); return true; }
    if (mode === 'slow') { await new Promise((r) => setTimeout(r, state.ms)); return false; }
    return false;
  }

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    let status = 0;
    try {
      const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
      if (url.pathname.startsWith('/__mock/')) { await control(req, res, url.pathname); status = res.statusCode; return; }
      if (await chaos(req, res)) { status = res.statusCode; return; }

      const headers = new Headers();
      for (const k of Object.keys(req.headers)) headers.set(k, Array.isArray(req.headers[k]) ? req.headers[k].join(', ') : req.headers[k]);
      headers.delete('cf-connecting-ip');
      headers.set('cf-connecting-ip', req.socket.remoteAddress || 'unknown');
      let body;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try { body = await readBody(req, 65536); } catch (e) {
          sendJson(res, 413, { ok: false, v: 1, error: { code: 'too_large', message: '요청이 너무 커요.' } }, corsFor(req));
          status = 413;
          return;
        }
      }
      const request = new Request(url.toString(), { method: req.method, headers: headers, body: body && body.length ? body : undefined });
      const response = await worker.handle(request, env, opts);
      const outHeaders = {};
      response.headers.forEach((v, k) => { outHeaders[k] = v; });
      const buf = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, outHeaders);
      res.end(buf);
      status = response.status;
    } catch (e) {
      console.error('mock server error:', e && e.message);
      if (!res.headersSent) sendJson(res, 500, { ok: false, v: 1, error: { code: 'server_error', message: '서버에 문제가 생겼어요.' } });
      status = 500;
    } finally {
      if (!o.quiet) console.log(req.method + ' ' + String(req.url).split('?')[0] + ' ' + status + ' ' + (Date.now() - t0) + 'ms');
    }
  });

  return { server: server, env: env, state: state, DB: DB };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port || process.env.PORT || 8787);
  const s = createServer({
    db: args.db || process.env.MOCK_DB || null,
    cacheSec: args['cache-sec'] === undefined ? undefined : Number(args['cache-sec']),
    origins: args.origins || process.env.ALLOWED_ORIGINS || '',
    extraBlock: process.env.EXTRA_BLOCK || '',
    ipSalt: process.env.IP_SALT || '',
    adminKey: process.env.ADMIN_KEY || '',
    quiet: !!args.quiet
  });
  const host = args.host || '127.0.0.1';
  s.server.listen(port, host, () => {
    console.log('element-gems 목 서버: http://' + (host === '127.0.0.1' ? 'localhost' : host) + ':' + port + '  (DB: ' + (args.db || process.env.MOCK_DB || '메모리') + ', 끄려면 Ctrl+C)');
    console.log('허용 오리진: ' + s.env.ALLOWED_ORIGINS + ' / 순위표 캐시 ' + s.env.LB_CACHE_SEC + '초');
    console.log('클라이언트 설정: CONFIG.ranking.api = \'http://localhost:' + port + '\' (커밋 금지)');
  });
}

module.exports = { createServer, parseArgs };
