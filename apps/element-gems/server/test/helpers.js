/* 시험 도우미: 메모리 DB + handle() 호출 */
'use strict';

const { createDb } = require('../mock/d1-adapter');
const worker = require('../src/worker');

let seq = 0;
/** 새 환경. clock = { ms } 를 바꿔 시간을 움직인다 */
function makeEnv(extra) {
  const clock = { ms: Date.UTC(2026, 10, 7, 1, 0, 0) };      // 2026-11-07 10:00 KST
  const env = Object.assign({
    DB: createDb(), ALLOWED_ORIGINS: 'https://eversunk2-tech.github.io', LB_CACHE_SEC: '0', IP_SALT: 'test-salt'
  }, extra || {});
  const opts = { now: () => clock.ms };
  let ipSeq = 0;
  async function call(method, path, body, headers) {
    const h = Object.assign({ 'cf-connecting-ip': '10.0.' + Math.floor(ipSeq / 200) + '.' + (ipSeq++ % 200) }, headers || {});
    const init = { method: method, headers: h };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await worker.handle(new Request('https://hall.example' + path, init), env, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* JSON 아님 */ }
    return { status: res.status, headers: res.headers, json: json, text: text };
  }
  return { env, clock, opts, call, DB: env.DB, advance: (sec) => { clock.ms += sec * 1000; } };
}

function uuid() {
  seq++;
  const hex = (seq * 7919 + 1234567).toString(16).padStart(12, '0');
  return '00000000-0000-4000-8000-' + hex;
}

const EMPTY = () => new Array(10).fill(-1);
function prog(easy, normal, hard) {
  const pad = (a) => (a || []).concat(EMPTY()).slice(0, 10);
  return { easy: pad(easy), normal: pad(normal), hard: pad(hard) };
}

module.exports = { makeEnv, uuid, prog, EMPTY };
