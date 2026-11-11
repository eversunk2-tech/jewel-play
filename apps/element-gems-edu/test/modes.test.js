/* 교육용 문제 양 "보통 / 많이"·선물상자 공급(pity·guard·상한 6)·학습 조건("문제 N개 풀기")·학습 칩·라디오 UI 시험 — spec §27.7·§27.8·§27.9.3·§27.10 (M3-B).
 * 실행: node --test apps/element-gems-edu/test/*.test.js
 *
 * ① pickRefillTypes 순수(상한 6·pity·guard·force·이전 함수와 난수 호출 순서 같음·spec 의사 코드와 같음) ② since(마지막 ? 등장 뒤 지난 행동 수) 증가·초기화
 * ③ 모드 선택(eduMode 4조합)·표(보통 = 일반용 수, 많이 = 구조 + "표 값" 한 곳) ④ 학습 조건(N 표·클리어·자동 해제·판 도중 모드 변경 무영향·취소/맞든 틀리든)
 * ⑤ 학습 칩 HUD ⑥ edu.js(normalizeEdu intensity·저장·복원·라디오 UI·refreshStages 호출) ⑦ 새 문구 점검 ⑧ 정답률이 달라도 중수·고수 클리어 여부가 같다
 * "표 값"을 고정하는 시험은 이 파일에 한 곳뿐이다(이름에 "표 값"). M3-CAL 이 많이 표를 재보정하면 그 시험의 기대값만 바꾼다.
 * 시험은 CONFIG 를 시험용 복사본(샌드박스)에서만 바꾼다. 파일·저장소 상태는 건드리지 않는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const GAME_PATH = path.join(root, 'game.js');
const G = require(GAME_PATH);
const SRC = fs.readFileSync(GAME_PATH, 'utf8');
const LOGIC = require(path.join(root, 'edu.js'));
const EDU_JS = fs.readFileSync(path.join(root, 'edu.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'edu.css'), 'utf8');
const GEN_DIR = path.join(root, '..', 'element-gems');          // 일반용: 읽기 전용으로 비교에만 쓴다(없으면 비교 시험은 건너뜀)
const HAS_GEN = fs.existsSync(path.join(GEN_DIR, 'game.js'));
const GEN = HAS_GEN ? require(path.join(GEN_DIR, 'game.js')) : null;
const GEN_SRC = HAS_GEN ? fs.readFileSync(path.join(GEN_DIR, 'game.js'), 'utf8') : '';
const skipGen = HAS_GEN ? false : '일반용 폴더 없음';
const W = G.WILD;

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** 난수 호출 수를 세는 난수 함수 */
function counting(seed) { const r = mulberry(seed); const f = () => { f.calls++; return r(); }; f.calls = 0; return f; }

/* ===================================================================
 * ① pickRefillTypes 순수 — 상한 6 · pity · guard · force · 이전 함수와 같음
 * =================================================================== */
// M3-B 이전의 pickRefillTypes 본문(git show HEAD:apps/element-gems-edu/game.js 에서 그대로 뽑은 것). 난수 호출 순서 비교용으로만 쓴다.
const OLD_PICK_SRC = `
function oldPick(count, wildOnBoard, rng, opt) {
  const rand = rng || Math.random;
  const o = opt || {};
  const spawn = o.spawn > 0 ? o.spawn : 0;
  const max = o.max > 0 ? o.max : 0;
  const n = o.n > 0 ? o.n : TYPE_COUNT;
  let wilds = wildOnBoard;
  let forceAt = -1;
  if (o.force && count > 0 && wilds < max) forceAt = Math.floor(rand() * count);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i === forceAt) { out.push(WILD); wilds++; continue; }
    const reserve = forceAt > i ? 1 : 0;
    if (spawn > 0 && wilds + reserve < max && rand() < spawn) { out.push(WILD); wilds++; continue; }
    out.push(Math.floor(rand() * n));
  }
  return out;
}
oldPick;`;
const oldPick = vm.runInNewContext('var TYPE_COUNT = 6, WILD = 6;' + OLD_PICK_SRC);

/** spec §27.7.2 의사 코드를 그대로 옮긴 기준 구현(기존 force 경로와 같은 난수 사용) */
function refPick(count, wildOnBoard, rng, opt) {
  const o = opt || {};
  const cap = Math.min(6, o.max > 0 ? o.max : 0);
  const forceNow = !!(o.force || (o.pity && o.pity.every > 0 && o.pity.since >= o.pity.every) || (o.guard && o.guard.need > 0 && o.guard.since >= o.guard.gap));
  let wilds = wildOnBoard;
  let forceAt = -1;
  if (forceNow && count > 0 && wilds < cap) forceAt = Math.floor(rng() * count);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i === forceAt) { out.push(6); wilds++; continue; }
    const reserve = forceAt > i ? 1 : 0;
    if (o.spawn > 0 && wilds + reserve < cap && rng() < o.spawn) { out.push(6); wilds++; continue; }
    out.push(Math.floor(rng() * 6));
  }
  return out;
}
const nWild = (a) => a.filter((t) => t === W).length;
const plain = (x) => JSON.parse(JSON.stringify(x));      // 샌드박스(vm) 안에서 만든 객체·배열은 프로토타입이 달라 deepStrictEqual 이 실패하므로 JSON 으로 옮겨 비교한다

test('① 상한 6: wildCapOf(max) = min(6, CONFIG.edu.wildCap, max) 이고 max 99·wildCap 99 여도 6 (코드로 고정)', () => {
  assert.strictEqual(G.CONFIG.edu.wildCap, 6);
  assert.strictEqual(G.wildCapOf(2), 2);
  assert.strictEqual(G.wildCapOf(4), 4);
  assert.strictEqual(G.wildCapOf(6), 6);
  assert.strictEqual(G.wildCapOf(7), 6);
  assert.strictEqual(G.wildCapOf(99), 6);
  assert.strictEqual(G.wildCapOf(0), 0);
  assert.strictEqual(G.wildCapOf(-3), 0);
  const saved = G.CONFIG.edu.wildCap;
  try {
    G.CONFIG.edu.wildCap = 99;
    assert.strictEqual(G.wildCapOf(99), 6, '설정을 6보다 크게 줘도 6');
    G.CONFIG.edu.wildCap = 3;
    assert.strictEqual(G.wildCapOf(99), 3, '설정이 더 작으면 그 값');
    assert.strictEqual(G.wildCapOf(2), 2);
  } finally { G.CONFIG.edu.wildCap = saved; }
});

test('① 어떤 설정이든 보드 위 ? 는 6개를 넘지 않는다: max 99·spawn 1·pity 1·guard·force 를 모두 켜고 리필 20,000회(가끔 지워짐)', () => {
  const rng = mulberry(66);
  let board = 0;
  let seen = 0;
  for (let k = 0; k < 20000; k++) {
    const n = 1 + Math.floor(rng() * 24);
    const out = G.pickRefillTypes(n, board, rng, { spawn: 1, max: 99, force: rng() < 0.3, pity: { every: 1, since: 99 }, guard: { need: 9, since: 99, gap: 0 }, n: 6 });
    board += nWild(out);
    seen = Math.max(seen, board);
    assert.ok(board <= 6, '보드 위 ? ' + board);
    if (rng() < 0.5) board = Math.max(0, board - 1 - Math.floor(rng() * 4));
  }
  assert.strictEqual(seen, 6, '상한 6 에는 닿는다(시험이 헛돌지 않는지)');
  // 이미 6개 이상이면 force·pity·guard·spawn 어느 쪽으로도 나오지 않는다
  [6, 7, 12].forEach((w) => {
    const out = G.pickRefillTypes(30, w, mulberry(w), { spawn: 1, max: 99, force: true, pity: { every: 1, since: 9 }, guard: { need: 5, since: 9, gap: 0 }, n: 6 });
    assert.strictEqual(nWild(out), 0, '보드에 이미 ' + w + '개');
  });
});

test('① pity: 마지막 ? 등장 뒤 every 번의 행동이 지나면(since ≥ every > 0) 하나가 확정으로 나온다 — 확률 칸이 없어도(spawn 0). 모자라거나 every 0 이면 안 나온다', () => {
  const rng = mulberry(7);
  for (let k = 0; k < 600; k++) {
    const n = 3 + (k % 18);
    const due = G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, force: false, pity: { every: 6, since: 6 + (k % 4) }, n: 6 });
    assert.strictEqual(nWild(due), 1, 'pity 시점에는 정확히 1개');
    const early = G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, force: false, pity: { every: 6, since: 5 }, n: 6 });
    assert.strictEqual(nWild(early), 0, 'since 5 < 6 이면 아직 아님');
    const none = G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, force: false, pity: { every: 0, since: 99 }, n: 6 });
    assert.strictEqual(nWild(none), 0, 'every 0 이면 pity 없음');
  }
  const pos = new Set();
  for (let k = 0; k < 300; k++) pos.add(G.pickRefillTypes(5, 0, rng, { spawn: 0, max: 4, pity: { every: 2, since: 2 }, n: 6 }).indexOf(W));
  assert.strictEqual(pos.size, 5, '확정 칸은 새 칸 어디든 될 수 있다');
  // 보드 위가 cap(=max 4)이면 pity 시점이어도 안 나온다
  assert.strictEqual(nWild(G.pickRefillTypes(20, 4, rng, { spawn: 0.5, max: 4, pity: { every: 1, since: 9 }, n: 6 })), 0);
  assert.strictEqual(nWild(G.pickRefillTypes(20, 3, rng, { spawn: 0, max: 4, pity: { every: 1, since: 9 }, n: 6 })), 1, 'cap 에 하나 모자라면 확정 1개');
});

test('① guard: 학습 조건에 모자라고(need > 0) 마지막 ? 등장 뒤 gap 번이 지났을 때만 확정 ? — need 0·since < gap 이면 안 나오고 gap 0 이면 곧바로', () => {
  const rng = mulberry(8);
  for (let k = 0; k < 600; k++) {
    const n = 3 + (k % 18);
    assert.strictEqual(nWild(G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, guard: { need: 2, since: 3, gap: 3 }, n: 6 })), 1);
    assert.strictEqual(nWild(G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, guard: { need: 2, since: 2, gap: 3 }, n: 6 })), 0, '간격 미달');
    assert.strictEqual(nWild(G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, guard: { need: 0, since: 9, gap: 3 }, n: 6 })), 0, '모자라지 않음');
    assert.strictEqual(nWild(G.pickRefillTypes(n, 0, rng, { spawn: 0, max: 4, guard: { need: 1, since: 0, gap: 0 }, n: 6 })), 1, 'gap 0 이면 곧바로');
  }
  assert.strictEqual(nWild(G.pickRefillTypes(10, 4, mulberry(1), { spawn: 0, max: 4, guard: { need: 5, since: 9, gap: 3 }, n: 6 })), 0, 'cap 이면 안 나옴');
});

test('① force(첫 행동 확정)는 그대로: spawn 0 이어도 새 칸 하나가 ?, cap 이면 안 나옴', () => {
  const rng = mulberry(9);
  for (let k = 0; k < 300; k++) assert.strictEqual(nWild(G.pickRefillTypes(3 + (k % 10), 0, rng, { spawn: 0, max: 2, force: true, n: 6 })), 1);
  assert.strictEqual(nWild(G.pickRefillTypes(8, 2, rng, { spawn: 0, max: 2, force: true, n: 6 })), 0);
});

test('① spawn=0·force 없음·pity 0·guard 0 이면 이전 함수와 난수 호출 순서·결과가 정확히 같다 (일반용과 같은 퍼즐). max ≤ 6 이면 spawn·force 가 있어도 같다', () => {
  const rng = mulberry(123);
  let combos = 0;
  for (let k = 0; k < 4000; k++) {
    const n = Math.floor(rng() * 30);
    const wob = Math.floor(rng() * 7);
    const spawn = [0, 0, 0.016, 0.03, 0.3, 1][Math.floor(rng() * 6)];
    const max = [0, 1, 2, 4, 6][Math.floor(rng() * 5)];
    const force = rng() < 0.3;
    const extras = [undefined, { pity: { every: 0, since: 50 } }, { guard: { need: 0, since: 50, gap: 3 } }, { pity: { every: 0, since: 0 }, guard: { need: 0, since: 0, gap: 0 } }];
    const ex = extras[k % extras.length];
    const opt = Object.assign({ spawn: spawn, max: max, force: force, n: 6 }, ex || {});
    const a = counting(k + 1);
    const b = counting(k + 1);
    assert.deepStrictEqual(G.pickRefillTypes(n, wob, a, opt), Array.from(oldPick(n, wob, b, { spawn: spawn, max: max, force: force, n: 6 })), JSON.stringify(opt));
    assert.strictEqual(a.calls, b.calls, '난수 호출 수');
    assert.strictEqual(a(), b(), '난수열 위치');
    combos++;
  }
  assert.ok(combos === 4000);
});

test('① spec §27.7.2 의사 코드(refPick)와 같다: pity·guard·force·spawn·cap 을 섞은 무작위 입력 6,000개에서 결과와 난수 호출 수가 같다', () => {
  const rng = mulberry(2711);
  for (let k = 0; k < 6000; k++) {
    const n = Math.floor(rng() * 26);
    const wob = Math.floor(rng() * 9);
    const opt = {
      spawn: [0, 0.01, 0.03, 0.3][Math.floor(rng() * 4)], max: [0, 2, 4, 6, 9][Math.floor(rng() * 5)], force: rng() < 0.25, n: 6,
      pity: rng() < 0.6 ? { every: Math.floor(rng() * 8), since: Math.floor(rng() * 10) } : undefined,
      guard: rng() < 0.6 ? { need: Math.floor(rng() * 4), since: Math.floor(rng() * 8), gap: Math.floor(rng() * 5) } : undefined
    };
    const a = counting(k + 5);
    const b = counting(k + 5);
    assert.deepStrictEqual(G.pickRefillTypes(n, wob, a, opt), refPick(n, wob, b, opt), JSON.stringify([n, wob, opt]));
    assert.strictEqual(a.calls, b.calls);
  }
});

test('① 구조 등급 합성(pickRefillTypesStructured)도 같은 opt 를 받아 pity·guard·상한을 따른다 (? 는 6개 안에서만, 확정 등장은 새 칸 중 하나)', () => {
  const R = 8, C = 8;
  const P = G.boardParams('normal', 1) || G.boardParams('hard', 10) || G.boardParams('easy', 1);
  assert.ok(P, '구조 등급 손잡이');
  const rng = mulberry(31);
  for (let k = 0; k < 120; k++) {
    const base = G.generateBoard(R, C, 6, mulberry(k + 1));
    const holes = [];
    for (let i = 0; i < 6; i++) { const r = Math.floor(rng() * R); const c = Math.floor(rng() * C); base[r][c] = null; holes.push([r, c]); }
    const cells = []; base[0].forEach(() => {});
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (base[r][c] == null) cells.push([r, c]);
    const w0 = k % 7;
    const out = G.pickRefillTypesStructured(base, w0, P, mulberry(k + 3), { spawn: 0.05, max: 99, force: false, pity: { every: 6, since: 6 }, n: 6 });
    assert.strictEqual(out.length, cells.length);
    assert.ok(nWild(out) <= Math.max(0, 6 - w0), '? ' + nWild(out) + ' + 보드 ' + w0);
    if (w0 < 6) assert.ok(nWild(out) >= 1, 'pity 시점에는 적어도 1개');
  }
  // spawn 0 이면 ? 를 정하는 단계를 건너뛴다(기존 규칙 그대로): pity 가 있어도 ? 없음
  const base = G.generateBoard(R, C, 6, mulberry(4)); base[2][2] = null; base[3][3] = null;
  assert.strictEqual(nWild(G.pickRefillTypesStructured(base, 0, P, mulberry(5), { spawn: 0, max: 4, force: true, pity: { every: 1, since: 9 }, n: 6 })), 0);
});

/* ===================================================================
 * 가짜 DOM + 가상 시계 하네스 — 실제 game.js 를 실행한다 (mission.test.js 하네스를 줄여서 사용)
 * =================================================================== */
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.hidden = false; this.textContent = '';
    this.isFragment = false; this._html = ''; this._attrs = {}; this._cls = new Set(); this._ls = {}; this._q = {}; this._style = {};
    this.dataset = {}; this.tabIndex = 0; this.disabled = false;
    const self = this;
    this.style = { setProperty(k, v) { self._style[k] = String(v); }, removeProperty(k) { delete self._style[k]; }, getPropertyValue(k) { return self._style[k] || ''; } };
    this.classList = {
      add() { Array.prototype.forEach.call(arguments, (n) => self._cls.add(n)); },
      remove() { Array.prototype.forEach.call(arguments, (n) => self._cls.delete(n)); },
      toggle(n, force) { const on = force === undefined ? !self._cls.has(n) : !!force; if (on) self._cls.add(n); else self._cls.delete(n); return on; },
      contains(n) { return self._cls.has(n); }
    };
  }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get clientWidth() { return 640; }
  get offsetWidth() { return 640; }
  appendChild(ch) {
    if (ch.isFragment) { ch.children.forEach((x) => { x.parentNode = this; this.children.push(x); }); ch.children = []; return ch; }
    ch.parentNode = this; this.children.push(ch); return ch;
  }
  remove() { if (!this.parentNode) return; const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
  removeEventListener() {}
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl('span')); }
  querySelectorAll(sel) { const m = /^\.([\w-]+)$/.exec(sel); if (!m) return []; const out = []; const walk = (e) => e.children.forEach((c) => { if (c._cls.has(m[1])) out.push(c); walk(c); }); walk(this); return out; }
  closest(sel) { const m = /^\.([\w-]+)$/.exec(sel); if (!m) return null; for (let e = this; e; e = e.parentNode) if (e._cls.has(m[1])) return e; return null; }
  contains(o) { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  focus() { if (this._env) this._env.activeElement = this; }
  blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

const SCRIPT = new vm.Script(SRC, { filename: 'edu/game.js' });      // 교육용 game.js 는 자체 __EG_TEST__.internals 를 만든다

/** cfgPatch(CONFIG): 시험용 복사본(샌드박스)의 CONFIG 만 바꾼다. 기본: 구조 규칙 끔(새 칸 종류를 시험이 정한다)·미션 레벨은 그대로·defaultIntensity 'many'(실제 기본). EduQuiz 는 opts.quiz 로 만든다 */
function createEnv(seed, cfgPatch, opts) {
  const o = opts || {};
  const env = { _now: 0, _seq: 0, _q: [], errors: [], rnd: 0, asks: 0 };
  env.timers = {
    setTimeout(fn, ms) { const id = ++env._seq; env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn }); return id; },
    clearTimeout(id) { const i = env._q.findIndex((x) => x.id === id); if (i >= 0) env._q.splice(i, 1); }
  };
  const ids = {};
  const doc = {
    readyState: 'complete', hidden: false, activeElement: null, documentElement: new FakeEl('html'),
    getElementById(id) { return ids[id] || (ids[id] = new FakeEl('div')); },
    createElement(t) { return new FakeEl(t); }, createElementNS(ns, t) { return new FakeEl(t); },
    createDocumentFragment() { const f = new FakeEl('fragment'); f.isFragment = true; return f; },
    addEventListener() {}, removeEventListener() {}
  };
  const store = {};
  const rand = mulberry(seed || 1);
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: true }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: () => { env.rnd++; return rand(); }, __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  SCRIPT.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.ids = ids; env.store = store;
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.X = sandbox.module.exports;          // 순수 함수 내보내기(이 샌드박스의 game.js 것)
  env.CONFIG.board.enabled = false;        // 새 칸 종류를 시험이 정한다(§26 구조 규칙은 끈다)
  if (o.quiz !== false) env.quiz = sandbox.EduQuiz = makeQuiz(env, o.quiz || {});
  if (cfgPatch) cfgPatch(env.CONFIG, env);
  env.unhandled = (e) => { env.errors.push(e); };
  process.on('unhandledRejection', env.unhandled);
  env.dispose = () => process.removeListener('unhandledRejection', env.unhandled);
  env.step = async function () {
    const q = env._q; if (!q.length) return false;
    let bi = 0; for (let i = 1; i < q.length; i++) if (q[i].t < q[bi].t || (q[i].t === q[bi].t && q[i].id < q[bi].id)) bi = i;
    const ev = q.splice(bi, 1)[0]; env._now = Math.max(env._now, ev.t); ev.fn();
    await new Promise((r) => setImmediate(r)); return true;
  };
  env.runUntil = async function (pred, maxMs) {
    const limit = env._now + (maxMs == null ? 60000 : maxMs);
    while (!pred()) {
      if (env._now > limit) throw new Error('runUntil: 시간 초과 phase=' + env.I.state.phase + ' locked=' + env.I.state.locked + ' quiz=' + env.I.state.quizActive);
      if (!(await env.step())) throw new Error('runUntil: 남은 타이머 없음');
    }
  };
  env.runFor = async function (ms) {
    const target = env._now + ms;
    while (env._q.length && Math.min.apply(null, env._q.map((x) => x.t)) <= target) await env.step();
    env._now = Math.max(env._now, target);
  };
  return env;
}

/** EduQuiz 가짜: ready·mode(intensity() 가 돌려줌)를 시험이 바꿀 수 있다. ask() 는 thinkMs 뒤 답한다(answer(rec) 로 답을 정함, 기본 정답) */
function makeQuiz(env, o) {
  const opt = o || {};
  const quiz = {
    ready: opt.ready !== false, mode: opt.mode === undefined ? 'many' : opt.mode, asks: 0, cancelled: 0,
    ask() {
      quiz.asks++;
      const rec = { index: quiz.asks };
      return new Promise((resolve) => env.timers.setTimeout(() => resolve(opt.answer ? opt.answer(rec) : { right: true, bonus: G.bonusFor(env.I.state.level) }), opt.thinkMs == null ? 1000 : opt.thinkMs));
    },
    unitLabel() { return '시험 단원'; },
    cancel() { quiz.cancelled++; }
  };
  if (opt.noIntensity !== true) quiz.intensity = function () { return quiz.mode; };
  return quiz;
}

async function startAndWait(env, lv, stage) {
  const I = env.I;
  I.save.level = lv; I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
}
function patternBoard() { const g = []; for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); g.push(row); } return g; }
function applyBoard(env, types) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], types[r][c]); }
/** 매치가 없는 무늬 보드에서 (3,2)↔(3,3) 교환이 ? 를 지우는 시나리오(A A X ?) */
function wildScenario(env) {
  const B = patternBoard();
  B[3][3] = W; B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3;
  assert.strictEqual(G.findMatches(B).length, 0);
  applyBoard(env, B);
}
/** 매치가 없는 무늬 보드(? 없음)에서 (3,2)↔(3,3) 교환이 3매치를 만드는 시나리오(A A X A) */
function plainScenario(env) {
  const B = patternBoard();
  B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[3][3] = 0; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3;
  assert.strictEqual(G.findMatches(B).length, 0);
  applyBoard(env, B);
}
async function finishAction(env) { await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000); }
const wildsOnBoard = (env) => env.I.typeGrid().reduce((a, row) => a + row.filter((t) => t === W).length, 0);

/* ===================================================================
 * ② since — 마지막 ? 등장 뒤 지난 플레이어 행동 수
 * =================================================================== */
test('② since: 판 시작 0 · 보드가 바뀌는 스왑 +1 · 무효 스왑 +0 · 스킬 +1 · ?가 새로 나오면 0 · 연쇄 단계·문제는 세지 않는다', async () => {
  const env = createEnv(21, (c) => { c.edu.many.wild = { spawn: 0.0000001, max: 4, pity: 6, guardGap: 3 }; });   // 확률로는 사실상 안 나오고 pity 로만 나온다
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  assert.strictEqual(st.edu.mode, 'many');
  assert.strictEqual(st.edu.since, 0, '판 시작 0');
  st.edu.firstDone = true;                                   // 첫 행동 확정 등장은 이미 지났다고 본다(아래는 pity 만 본다)
  plainScenario(env);
  env.rnd = 0;
  // 무효 스왑(매치가 안 생기는 교환): since 그대로
  I.trySwap({ r: 0, c: 0 }, { r: 0, c: 1 });
  await finishAction(env);
  assert.strictEqual(st.edu.since, 0, '무효 스왑은 세지 않는다');
  // 유효 스왑: +1 (리필에 ? 가 안 나왔으니 그대로 1, 연쇄 단계가 여럿이어도 1)
  plainScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(st.edu.since, 1, '유효 스왑 한 번 = +1');
  assert.strictEqual(wildsOnBoard(env), 0);
  // pity 시점: since 5 -> 이번 행동으로 6 이 되어 리필에 ?가 확정으로 나오고, 나오면 0 이 된다
  st.edu.since = 5;
  plainScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(st.edu.since, 0, '?가 나온 리필 뒤 0');
  assert.ok(wildsOnBoard(env) >= 1 || env.quiz.asks >= 1, '확정 등장한 ? (보드에 있거나 연쇄로 지워져 문제가 됨)');
  env.dispose();
});

test('② since: 스킬 한 번도 행동 한 번(+1), 물·어둠·빛처럼 보드가 안 바뀌는 스킬도 마찬가지', async () => {
  const env = createEnv(22);
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true;
  plainScenario(env);
  const water = 1;
  st.gauge[water] = I.CONFIG.types[water].max; st.full[water] = true;
  const before = st.edu.since;
  I.onGauge(water);                                          // 물: 보드가 안 바뀌는 스킬(대상 선택 없음)
  await finishAction(env);
  assert.strictEqual(st.edu.since, before + 1);
  env.dispose();
});

/* ===================================================================
 * ③ 모드 선택·표
 * =================================================================== */
test('③ eduMode: 선택(intensity) × 문제 준비(ready) 4조합 — many 는 선택이 many 이고 ready 일 때만, 나머지는 모두 normal', () => {
  [['many', true, 'many'], ['many', false, 'normal'], ['normal', true, 'normal'], ['normal', false, 'normal']].forEach(([mode, ready, want]) => {
    const env = createEnv(1, null, { quiz: { mode: mode, ready: ready } });
    assert.strictEqual(env.sandbox.ElementGemsEdu.eduMode(), want, mode + '/' + ready);
    assert.strictEqual(G.resolveEduMode(mode, ready), want, '순수 함수 ' + mode + '/' + ready);
    env.dispose();
  });
  assert.strictEqual(G.resolveEduMode('many', 1), 'many');
  assert.strictEqual(G.resolveEduMode('x', true), 'normal');
  assert.strictEqual(G.resolveEduMode(undefined, true), 'normal');
});

test('③ eduMode: intensity() 가 없으면 CONFIG.edu.defaultIntensity, 이상한 값이면 기본값, EduQuiz 가 없으면 normal(문제가 없으니)', () => {
  const noFn = createEnv(1, null, { quiz: { noIntensity: true } });
  assert.strictEqual(noFn.sandbox.ElementGemsEdu.eduMode(), 'many', '기본 many');
  noFn.CONFIG.edu.defaultIntensity = 'normal';
  assert.strictEqual(noFn.sandbox.ElementGemsEdu.eduMode(), 'normal');
  noFn.CONFIG.edu.defaultIntensity = 'many';
  noFn.quiz.intensity = function () { return 'bogus'; };
  assert.strictEqual(noFn.sandbox.ElementGemsEdu.eduMode(), 'many', '잘못된 값은 기본값');
  noFn.quiz.intensity = function () { throw new Error('x'); };
  assert.strictEqual(noFn.sandbox.ElementGemsEdu.eduMode(), 'many', '예외도 기본값');
  const none = createEnv(1, null, { quiz: false });
  assert.strictEqual(none.sandbox.ElementGemsEdu.eduMode(), 'normal', 'EduQuiz 없음');
  noFn.dispose(); none.dispose();
});

test('③ 보통 모드의 표 = 일반용과 같은 수: 초보 점수 = 일반용 × 1.2(100점 반올림), 중수·고수 미션 = 일반용 표(spec §45로 동기화됨: 일반용 §43 표) (순수 함수 기본 모드)', { skip: skipGen }, () => {
  assert.strictEqual(G.getEduTableMode(), 'normal', '순수 함수의 기본 모드');
  for (let s = 1; s <= 10; s++) {
    assert.strictEqual(G.stageTarget('easy', s), Math.round(GEN.CONFIG.stages.targets.easy[s - 1] * 1.2 / 100) * 100, '초보 ' + s);
    assert.deepStrictEqual(G.missionDef('normal', s), GEN.CONFIG.stages.missions.normal[s - 1], '중수 ' + s);
    assert.deepStrictEqual(G.missionDef('hard', s), GEN.CONFIG.stages.missions.hard[s - 1], '고수 ' + s);
  }
  assert.deepStrictEqual(G.CONFIG.edu.wild, { spawn: 0.016, max: 2, guaranteeFirst: true }, '보통의 공급은 M3-A 직후와 같다');
});

test('③ 많이 모드 표 구조: 초보 점수 10칸(양의 정수)·중수/고수 미션 10칸씩(missionValid, 칩 ≤ 2)·특별 5·10은 단계형', () => {
  const m = G.CONFIG.edu.many;
  assert.strictEqual(m.easyTargets.length, 10);
  m.easyTargets.forEach((v, i) => { assert.ok(Number.isInteger(v) && v > 0, '초보 ' + (i + 1)); assert.strictEqual(v % 100, 0, '100점 단위'); });
  for (let i = 1; i < 10; i++) assert.ok(m.easyTargets[i] >= m.easyTargets[i - 1] - 1, '대체로 올라간다(레벨이 갈수록 어렵다)');
  ['normal', 'hard'].forEach((d) => {
    assert.strictEqual(m.missions[d].length, 10, d);
    m.missions[d].forEach((def, i) => {
      assert.strictEqual(G.missionValid(def), true, d + ' ' + (i + 1) + ' missionValid');
      if (!def.seq) assert.ok(def.parts.length <= G.CONFIG.stages.missionMaxChips, '동시 칩 상한');
    });
    G.CONFIG.stages.special.forEach((s) => assert.ok(m.missions[d][s - 1].seq === true && m.missions[d][s - 1].parts.length >= 2, d + ' 특별 ' + s));
  });
  assert.deepStrictEqual(Object.keys(m).sort(), ['easyTargets', 'learn', 'missions', 'wild']);
  assert.deepStrictEqual(Object.keys(m.missions), ['normal', 'hard']);
});

test('③ [표 값] 많이 모드(M3-CAL, spec §38·§39; 중수·고수 미션 개수는 spec §45 2차 재보정 값): 초보 점수 표 새 값, 중수·고수 미션 새 개수(유형·색은 일반용 §36과 같음), 공급 3%·최대 4·pity 6·guard 간격 3(고수만 2), 학습 N 5·6·7 + 특별 2 — 재보정하면 이 시험의 기대값만 바꾼다', () => {
  const m = G.CONFIG.edu.many;
  assert.deepStrictEqual(m.wild, { spawn: 0.03, max: 4, pity: 6, guardGap: 3, guardGapBy: { hard: 2 } });
  assert.deepStrictEqual(m.learn, { easy: 5, normal: 6, hard: 7, specialPlus: 2 });
  assert.deepStrictEqual(m.easyTargets, [10800, 13500, 16200, 18600, 19800, 20700, 21500, 23500, 25000, 28200]);
  const EXPECT_NORMAL = [
    {"seq":false,"parts":[{"k":"collect","color":0,"need":30}]},
    {"seq":false,"parts":[{"k":"collect","color":1,"need":31}]},
    {"seq":false,"parts":[{"k":"chain","min":2,"need":13}]},
    {"seq":false,"parts":[{"k":"collectEach","colors":[0,1,2],"need":28}]},
    {"seq":true,"parts":[{"k":"collect","color":2,"need":13},{"k":"big","min":4,"need":5},{"k":"chain","min":2,"need":5}]},
    {"seq":false,"parts":[{"k":"collect","color":2,"need":34}]},
    {"seq":false,"parts":[{"k":"collect","color":3,"need":37},{"k":"chain","min":2,"need":10}]},
    {"seq":false,"parts":[{"k":"collectEach","colors":[0,1,2,3],"need":30}]},
    {"seq":false,"parts":[{"k":"collect","color":4,"need":36},{"k":"collect","color":5,"need":18}]},
    {"seq":true,"parts":[{"k":"collect","color":0,"need":10},{"k":"big","min":4,"need":4},{"k":"chain","min":2,"need":5},{"k":"collectEach","colors":[1,2,3],"need":8}]}
  ];
  const EXPECT_HARD = [
    {"seq":false,"parts":[{"k":"big","min":4,"need":18}]},
    {"seq":false,"parts":[{"k":"chain","min":2,"need":20}]},
    {"seq":false,"parts":[{"k":"collectEach","colors":[3,4,5],"need":34}]},
    {"seq":false,"parts":[{"k":"chain","min":3,"need":10}]},
    {"seq":true,"parts":[{"k":"collect","color":1,"need":7},{"k":"big","min":4,"need":4},{"k":"chain","min":3,"need":3},{"k":"big","min":5,"need":2}]},
    {"seq":false,"parts":[{"k":"collect","color":0,"need":42},{"k":"collect","color":2,"need":23}]},
    {"seq":false,"parts":[{"k":"big","min":4,"need":12},{"k":"chain","min":3,"need":9}]},
    {"seq":false,"parts":[{"k":"collectEach","colors":[0,1,2,3,4],"need":31}]},
    {"seq":false,"parts":[{"k":"big","min":5,"need":3},{"k":"collect","color":5,"need":30}]},
    {"seq":true,"parts":[{"k":"chain","min":3,"need":1},{"k":"big","min":5,"need":1},{"k":"collectEach","colors":[0,1,2],"need":15},{"k":"chain","min":4,"need":3}]}
  ];
  assert.deepStrictEqual(m.missions.normal, EXPECT_NORMAL, '중수 표');
  assert.deepStrictEqual(m.missions.hard, EXPECT_HARD, '고수 표');
  // 유형·색은 일반용 §36과 같다(레벨 카드·설명문이 그대로 맞는다). 개수·횟수만 다르다
  ['normal', 'hard'].forEach((d) => m.missions[d].forEach((def, i) => {
    const gen = G.CONFIG.stages.missions[d][i];
    assert.strictEqual(def.seq, gen.seq, d + ' ' + (i + 1) + ' seq');
    assert.deepStrictEqual(def.parts.map((p) => [p.k, p.color, p.colors, p.min]), gen.parts.map((p) => [p.k, p.color, p.colors, p.min]), d + ' ' + (i + 1) + ' 유형·색');
  }));
  assert.strictEqual(G.CONFIG.edu.defaultIntensity, 'many', '기본 많이(사용자 승인)');
  assert.strictEqual(G.CONFIG.edu.wildCap, 6);
  if (HAS_GEN) ['normal', 'hard'].forEach((d) => m.missions[d].forEach((def, i) => def.parts.forEach((p, j) => assert.ok(p.need >= GEN.CONFIG.stages.missions[d][i].parts[j].need, '많이 표는 일반용 이상 ' + d + ' ' + (i + 1)))));
});

test('③ guardGapOf: 난이도별 덮어쓰기(guardGapBy)가 있으면 그 값, 없거나 잘못되면 guardGap — 고수 2, 초보·중수 3', () => {
  const w = G.CONFIG.edu.many.wild;
  assert.strictEqual(G.guardGapOf('easy', w), 3);
  assert.strictEqual(G.guardGapOf('normal', w), 3);
  assert.strictEqual(G.guardGapOf('hard', w), 2);
  assert.strictEqual(G.guardGapOf('hard', { guardGap: 3 }), 3, '덮어쓰기 없음');
  assert.strictEqual(G.guardGapOf('hard', { guardGap: 3, guardGapBy: { hard: 'x' } }), 3, '숫자가 아니면 무시');
  assert.strictEqual(G.guardGapOf('hard', { guardGap: 3, guardGapBy: { hard: -1 } }), 3, '음수는 무시');
  assert.strictEqual(G.guardGapOf('hard', { guardGap: 3, guardGapBy: { hard: 0 } }), 0, '0 은 유효(모자라면 매 행동)');
  assert.strictEqual(G.guardGapOf('normal', { guardGap: 3, guardGapBy: { hard: 1 } }), 3, '다른 난이도 키는 영향 없음');
});

test('③ 많이 모드 표 읽기: stageTarget(초보)은 easyTargets 를, missionDef(중수·고수)는 many.missions 를 읽고, 모양이 틀리면 보통 모드 값으로 돌아간다', () => {
  const env = createEnv(2);
  const X = env.X; const C = env.CONFIG;
  try {
    C.edu.many.easyTargets = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
    C.edu.many.missions.normal[0] = { parts: [{ k: 'collect', color: 2, need: 77 }], seq: false };
    X.setEduTableMode('normal');
    assert.strictEqual(X.stageTarget('easy', 1), 10800, '보통 모드는 ×1.2 파생값');
    assert.strictEqual(X.missionDef('normal', 1).parts[0].need, 25, '보통 모드는 CONFIG.stages.missions');
    X.setEduTableMode('many');
    assert.strictEqual(X.stageTarget('easy', 1), 1100);
    assert.strictEqual(X.stageTarget('easy', 10), 2000);
    assert.strictEqual(X.stageTarget('normal', 1), 17900, '중수 점수 폴백(참고값)은 그대로 ×1.2');
    assert.strictEqual(X.missionDef('normal', 1).parts[0].need, 77);
    assert.strictEqual(X.missionDef('hard', 1), C.edu.many.missions.hard[0]);
    assert.strictEqual(X.missionDef('easy', 1), null, '초보는 항상 점수');
    C.edu.many.easyTargets = [1, 2, 3];
    assert.strictEqual(X.stageTarget('easy', 1), 10800, '길이가 틀리면 보통 모드 파생값');
    C.edu.many.easyTargets = null;
    assert.strictEqual(X.stageTarget('easy', 1), 10800);
    C.edu.many.easyTargets = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 'x'];
    assert.strictEqual(X.stageTarget('easy', 1), 10800, '정수가 아닌 값이 있으면 쓰지 않는다');
    C.edu.many.missions.normal[0] = { parts: [{ k: 'collect', color: 2 }] };
    assert.strictEqual(X.missionDef('normal', 1), null, '틀린 정의는 점수 폴백');
    C.edu.many.missions = null;
    assert.strictEqual(X.missionDef('hard', 1), null, '표가 없어도 오류 없이 점수 목표');
    C.stages.goalType.normal = 'score';
    assert.strictEqual(X.missionDef('normal', 3), null, '롤백 스위치(goalType score)는 많이 모드에서도 듣는다');
  } finally { X.setEduTableMode('normal'); }
  env.dispose();
});

/* ===================================================================
 * ④ 학습 조건
 * =================================================================== */
test('④ 학습 조건 N(푼 개수): 초보 5 · 중수 6 · 고수 7, 특별 레벨(5·10)은 +2 → 7·8·9. 모르는 난이도·레벨은 0, 설정을 바꾸면 따라간다', () => {
  const want = { easy: 5, normal: 6, hard: 7 };
  Object.keys(want).forEach((d) => {
    for (let s = 1; s <= 10; s++) assert.strictEqual(G.learnNeed(d, s), want[d] + (s === 5 || s === 10 ? 2 : 0), d + s);
  });
  assert.strictEqual(G.learnNeed('nope', 1), 0);
  assert.strictEqual(G.learnNeed('easy', 0), 0);
  assert.strictEqual(G.learnNeed('easy', 11), 0);
  const saved = JSON.stringify(G.CONFIG.edu.many.learn);
  try {
    G.CONFIG.edu.many.learn.hard = 10; G.CONFIG.edu.many.learn.specialPlus = 1;
    assert.strictEqual(G.learnNeed('hard', 3), 10);
    assert.strictEqual(G.learnNeed('hard', 5), 11);
    G.CONFIG.edu.many.learn.specialPlus = 0;
    assert.strictEqual(G.learnNeed('hard', 5), 10);
  } finally { G.CONFIG.edu.many.learn = JSON.parse(saved); }
});

test('④ 판 시작: 많이(ready)면 state.edu.mode=many·learn={need N}, 보통이면 learn null. ?가 나올 수 없는 설정(spawn 0)이면 학습 조건도 없다(막히지 않게)', async () => {
  for (const [mode, lv, stage, need] of [['many', 'easy', 1, 5], ['many', 'normal', 3, 6], ['many', 'hard', 5, 9], ['many', 'easy', 10, 7], ['normal', 'easy', 1, 0]]) {
    const env = createEnv(3, null, { quiz: { mode } });
    await startAndWait(env, lv, stage);
    assert.strictEqual(env.I.state.edu.mode, mode === 'many' ? 'many' : 'normal');
    assert.deepStrictEqual(plain(env.I.state.edu.learn), need ? { need } : null, [mode, lv, stage].join());
    assert.strictEqual(env.sandbox.ElementGemsEdu.learnMet(), need === 0, '시작 직후 학습 조건은 미충족(없으면 충족)');
    env.dispose();
  }
  const zero = createEnv(4, (c) => { c.edu.many.wild.spawn = 0; });
  await startAndWait(zero, 'normal', 2);
  assert.strictEqual(zero.I.state.edu.mode, 'many');
  assert.strictEqual(zero.I.state.edu.learn, null, 'spawn 0 이면 학습 조건 없음');
  zero.dispose();
  const nocap = createEnv(4, (c) => { c.edu.many.wild.max = 0; });
  await startAndWait(nocap, 'normal', 2);
  assert.strictEqual(nocap.I.state.edu.learn, null, 'max 0 이면 학습 조건 없음');
  nocap.dispose();
});

test('④ 목표(점수)를 채워도 문제가 모자라면 판이 이어지고(시계는 계속), 푼 개수가 N 이 되면 그 즉시 STAGE CLEAR — 맞든 틀리든 센다', async () => {
  const env = createEnv(31, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 10); c.edu.many.wild.spawn = 0.0000001; });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  assert.strictEqual(st.edu.learn.need, 5);
  st.edu.firstDone = true;
  assert.strictEqual(st.target, 10, '많이 모드 초보 점수 표를 쓴다');
  plainScenario(env);
  const tl0 = st.timeLeft;
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.ok(st.score >= 10, '점수 목표(10점)는 채웠다');
  assert.strictEqual(st.phase, 'playing', '학습 조건 미충족이라 판이 이어진다');
  assert.strictEqual(env.sandbox.ElementGemsEdu.learnMet(), false);
  await env.runFor(3000);
  assert.ok(st.timeLeft < tl0 - 2.5, '시계는 계속 간다');
  assert.strictEqual(st.phase, 'playing');
  // 문제 4개를 풀었다고 기록해 두고(틀린 것 포함) 마지막 하나를 ? 매치로 푼다
  st.edu.asked = 4; st.edu.right = 1;
  wildScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.quiz.asks, 1);
  assert.strictEqual(st.edu.asked, 5);
  assert.strictEqual(st.phase, 'over', '5개를 채우자 클리어');
  assert.strictEqual(env.ids['end-title'].textContent, 'STAGE CLEAR!');
  assert.strictEqual(I.save.progress.easy, 9, '이미 9 라 그대로(레벨 1 클리어 기록은 별로 남는다)');
  assert.ok(I.save.stages.easy[0].stars >= 1);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 오답이어도 푼 개수로 센다(정답률과 무관) · 문제 없음(null)은 세지 않는다', async () => {
  const env = createEnv(32, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 10); c.edu.many.wild.spawn = 0.0000001; }, { quiz: { answer: () => ({ right: false, bonus: 0 }) } });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true; st.edu.asked = 4;
  wildScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(st.edu.asked, 5);
  assert.strictEqual(st.edu.right, 0);
  assert.strictEqual(st.phase, 'over', '5개 모두 오답이어도 클리어');
  env.dispose();
  // 문제 없음(null) 은 센 개수에 들지 않는다
  const e2 = createEnv(33, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 10); c.edu.many.wild.spawn = 0.0000001; }, { quiz: { answer: () => null } });
  await startAndWait(e2, 'easy', 1);
  e2.I.state.edu.firstDone = true; e2.I.state.edu.asked = 4;
  wildScenario(e2);
  e2.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(e2);
  assert.strictEqual(e2.quiz.asks, 1);
  assert.strictEqual(e2.I.state.edu.asked, 4, '낼 문제가 없었으면 세지 않는다');
  assert.strictEqual(e2.I.state.phase, 'playing');
  e2.dispose();
});

test('④ 취소로 건너뛴 문제는 세지 않는다: 문제 중에 판이 바뀌면(레벨 선택으로 나감) 통계 불변·ABORT', async () => {
  const env = createEnv(34, (c) => { c.edu.many.wild.spawn = 0.0000001; }, { quiz: { thinkMs: 5000 } });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true;
  wildScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.runUntil(() => st.quizActive, 60000);
  assert.strictEqual(env.quiz.asks, 1);
  I.goStages();                                              // 문제 도중 나가기: EduQuiz.cancel() 이 불리고 판이 바뀐다
  await env.runFor(8000);
  assert.strictEqual(env.quiz.cancelled, 1);
  assert.strictEqual(st.edu.asked, 0, '건너뛴 문제는 세지 않는다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 문제를 못 불러오면 자동 해제: 판 도중 EduQuiz.ready 가 false 가 되면 목표를 채운 판이 곧바로 클리어된다(막히지 않는다)', async () => {
  const env = createEnv(35, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 10); c.edu.many.wild.spawn = 0.0000001; });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true;
  plainScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.ok(st.score >= 10 && st.phase === 'playing');
  env.quiz.ready = false;
  assert.strictEqual(env.sandbox.ElementGemsEdu.learnMet(), true, '해제');
  await env.runFor(600);                                     // 프레임이 돌면서 판정
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(env.ids['end-title'].textContent, 'STAGE CLEAR!');
  assert.deepStrictEqual(plain(st.edu.learn), { need: 5 }, '판의 학습 조건 값 자체는 그대로(해제만 됨)');
  env.dispose();
});

test('④ 시간이 끝났는데 문제가 모자라면 실패(TIME UP): 결과 줄에 "선물상자 문제 3/5" 가 붙는다. 목표를 못 채웠으면 목표 문구 뒤에', async () => {
  const env = createEnv(36, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 10); c.edu.many.wild.spawn = 0.0000001; ['easy', 'normal', 'hard'].forEach((l) => { c.difficulty[l].time = { start: 12, max: 14 }; }); });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true; st.edu.asked = 3;
  plainScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.ok(st.score >= 10);
  await env.runUntil(() => st.phase === 'over', 60000);
  assert.strictEqual(env.ids['end-title'].textContent, 'TIME UP');
  assert.ok(env.ids['end-target'].textContent.endsWith(' · 선물상자 문제 3/5'), env.ids['end-target'].textContent);
  assert.strictEqual(I.save.stages.easy[0].stars, 0, '실패라 별 없음');
  env.dispose();
  // 보통 모드의 실패 문구에는 붙지 않는다
  const e2 = createEnv(37, (c) => { ['easy', 'normal', 'hard'].forEach((l) => { c.difficulty[l].time = { start: 6, max: 8 }; }); }, { quiz: { mode: 'normal' } });
  await startAndWait(e2, 'easy', 1);
  await e2.runUntil(() => e2.I.state.phase === 'over', 60000);
  assert.ok(e2.ids['end-target'].textContent.indexOf('선물상자') === -1);
  e2.dispose();
});

test('④ 문제를 못 불러오는 채로 시작하면(ready=false): ? 없음·학습 조건 없음·학습 칩 없음·보통 표(초보 ×1.2 파생값) — 많이를 골라도', async () => {
  const env = createEnv(38, (c) => { c.edu.many.easyTargets[0] = 999900; }, { quiz: { ready: false, mode: 'many' } });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  assert.strictEqual(st.edu.mode, 'normal');
  assert.strictEqual(st.edu.learn, null);
  assert.strictEqual(st.target, 10800, '많이 표(999,900)가 아니라 보통 모드 값');
  assert.strictEqual(I.el['learn-chip'].hidden, true);
  assert.strictEqual(I.el['screen-game'].dataset.learn, undefined);
  for (let i = 0; i < 12 && st.phase === 'playing'; i++) {
    const mv = I.listMoves(I.typeGrid()); if (!mv.length) break;
    I.trySwap(mv[0].a, mv[0].b); await finishAction(env);
    assert.strictEqual(wildsOnBoard(env), 0, '?가 한 번도 안 나온다');
  }
  assert.strictEqual(env.quiz.asks, 0);
  env.dispose();
});

test('④ 판 도중 모드가 바뀌어도(문제 양을 바꾸거나 ready 가 바뀜) 그 판의 목표·미션·학습 조건·공급은 시작 때 값 그대로 — 두 방향 모두', async () => {
  // 많이로 시작 → 도중에 보통·ready false
  const env = createEnv(39, null, { quiz: { mode: 'many' } });
  const I = env.I; const st = I.state; const X = env.X;
  await startAndWait(env, 'normal', 4);
  const snap = () => JSON.stringify([st.edu.mode, st.edu.learn, st.target, st.mission && st.mission.def, X.getEduTableMode()]);
  const s0 = snap();
  assert.strictEqual(st.edu.mode, 'many');
  env.quiz.mode = 'normal';
  assert.strictEqual(env.sandbox.ElementGemsEdu.eduMode(), 'normal', '지금 선택은 보통');
  await env.runFor(1500);
  assert.strictEqual(snap(), s0, '선택이 바뀌어도 판의 값은 그대로');
  env.quiz.ready = false;
  env.sandbox.ElementGemsEdu.refreshStages();                // 레벨 선택 화면이 아니므로 아무 일도 하지 않는다
  await env.runFor(1500);
  assert.strictEqual(snap(), s0, 'ready 가 바뀌어도, refreshStages 를 불러도 그대로');
  env.dispose();
  // 보통(ready false)으로 시작 → 도중에 ready true·많이
  const e2 = createEnv(40, null, { quiz: { mode: 'normal', ready: false } });
  await startAndWait(e2, 'normal', 4);
  const s2 = () => JSON.stringify([e2.I.state.edu.mode, e2.I.state.edu.learn, e2.I.state.target, e2.X.getEduTableMode()]);
  const t0 = s2();
  e2.quiz.ready = true; e2.quiz.mode = 'many';
  e2.sandbox.ElementGemsEdu.refreshStages();
  await e2.runFor(1500);
  assert.strictEqual(s2(), t0);
  assert.strictEqual(e2.I.state.edu.mode, 'normal');
  assert.strictEqual(e2.I.el['learn-chip'].hidden, true);
  e2.dispose();
});

test('④ 학습 조건은 점수형·미션형 어느 판에서나 같다: 미션을 끝내도 문제가 모자라면 이어지고, 채우면 클리어(미션 칩은 그대로)', async () => {
  const env = createEnv(41, (c) => { c.edu.many.missions.normal[0] = { parts: [{ k: 'collect', color: 0, need: 3 }], seq: false }; c.edu.many.wild.spawn = 0.0000001; });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'normal', 1);
  st.edu.firstDone = true;
  assert.strictEqual(st.edu.learn.need, 6);
  assert.strictEqual(st.mission.parts[0].need, 3, '많이 표의 미션');
  plainScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(G.missionDone(st.mission), true, '미션 완료');
  assert.strictEqual(st.phase, 'playing', '학습 조건 미충족');
  st.edu.asked = 5;
  wildScenario(env);
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(st.edu.asked, 6);
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(env.ids['end-title'].textContent, 'STAGE CLEAR!');
  env.dispose();
});

/* ===================================================================
 * 공급 통합: 판에서 pity·guard·상한이 실제로 동작한다
 * =================================================================== */
test('④ 공급 통합(많이): ? 가 계속 쌓여도 보드 위 6개를 넘지 않고(max 99 설정), 학습 조건이 모자라면 간격(guardGap)마다 ?가 나온다', async () => {
  const env = createEnv(50, (c) => { c.edu.many.wild = { spawn: 0.2, max: 99, pity: 1, guardGap: 0 }; });
  const I = env.I; const st = I.state;
  await startAndWait(env, 'easy', 1);
  let maxSeen = 0;
  const origStep = env.step;
  env.step = async function () { const r = await origStep(); maxSeen = Math.max(maxSeen, wildsOnBoard(env)); return r; };
  const rng = mulberry(5);
  for (let i = 0; i < 14 && st.phase === 'playing'; i++) {
    const mv = I.listMoves(I.typeGrid()); if (!mv.length) break;
    const pick = mv[Math.floor(rng() * mv.length)];
    I.trySwap(pick.a, pick.b);
    await finishAction(env);
    maxSeen = Math.max(maxSeen, wildsOnBoard(env));
    assert.ok(wildsOnBoard(env) <= 6);
  }
  assert.ok(maxSeen >= 3 && maxSeen <= 6, '최대 ' + maxSeen);
  env.dispose();
});

test('④ 공급 통합: pity 와 guard 는 각각 설정값(every·guardGap)대로 판의 리필에서 ?를 확정 등장시키고, 모자라면(간격 미달) 나오지 않는다', async () => {
  const run = async (wild, since, learn) => {
    const env = createEnv(55, (c) => { c.edu.many.wild = wild; });
    const I = env.I; const st = I.state;
    await startAndWait(env, 'easy', 1);
    st.edu.firstDone = true; st.edu.since = since;
    if (!learn) st.edu.learn = null;             // guard 를 끄고 pity 만 본다
    plainScenario(env);
    I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
    await finishAction(env);
    const out = { since: st.edu.since, wild: wildsOnBoard(env) + env.quiz.asks };
    env.dispose();
    return out;
  };
  // pity 만: every 3 — since 2 + 이번 행동 1 = 3 이면 나오고(리셋 0), since 1 + 1 = 2 면 안 나온다(그대로 2)
  const pityWild = { spawn: 0.0000001, max: 4, pity: 3, guardGap: 99 };
  let r = await run(pityWild, 2, false);
  assert.ok(r.wild >= 1 && r.since === 0, 'pity 시점: ' + JSON.stringify(r));
  r = await run(pityWild, 1, false);
  assert.deepStrictEqual(r, { since: 2, wild: 0 }, 'pity 아직: ' + JSON.stringify(r));
  // guard 만: 학습 조건이 모자라고(need 5) guardGap 2 — since 1 + 1 = 2 면 나오고, since 0 + 1 = 1 이면 안 나온다
  const guardWild = { spawn: 0.0000001, max: 4, pity: 99, guardGap: 2 };
  r = await run(guardWild, 1, true);
  assert.ok(r.wild >= 1 && r.since === 0, 'guard 시점: ' + JSON.stringify(r));
  r = await run(guardWild, 0, true);
  assert.deepStrictEqual(r, { since: 1, wild: 0 }, 'guard 간격 미달: ' + JSON.stringify(r));
  // 학습 조건이 없으면(보통 모드 같은 설정) guard 는 일하지 않는다
  r = await run(guardWild, 5, false);
  assert.deepStrictEqual(r, { since: 6, wild: 0 }, '조건 없음: ' + JSON.stringify(r));
});

test('④ 공급 통합: guard 간격은 난이도별 덮어쓰기(guardGapBy)를 따른다 — 같은 상황(since 1 + 이번 행동 1 = 2)에서 고수(간격 2)는 ?가 나오고 중수(간격 3)는 안 나온다', async () => {
  const run = async (lv) => {
    const env = createEnv(55, (c) => { c.edu.many.wild = { spawn: 0.0000001, max: 4, pity: 99, guardGap: 3, guardGapBy: { hard: 2 } }; });
    const I = env.I; const st = I.state;
    await startAndWait(env, lv, 1);
    st.edu.firstDone = true; st.edu.since = 1;
    assert.ok(st.edu.learn && st.edu.learn.need > 0, '학습 조건이 있어야 guard 가 일한다');
    plainScenario(env);
    I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
    await finishAction(env);
    const out = { since: st.edu.since, wild: wildsOnBoard(env) + env.quiz.asks };
    env.dispose();
    return out;
  };
  let r = await run('hard');
  assert.ok(r.wild >= 1 && r.since === 0, '고수(간격 2): ' + JSON.stringify(r));
  r = await run('normal');
  assert.deepStrictEqual(r, { since: 2, wild: 0 }, '중수(간격 3, 미달): ' + JSON.stringify(r));
  r = await run('easy');
  assert.deepStrictEqual(r, { since: 2, wild: 0 }, '초보(간격 3, 미달): ' + JSON.stringify(r));
});

/* ===================================================================
 * ⑤ 학습 칩 HUD
 * =================================================================== */
test('⑤ 학습 칩: 많이 판에서만 보이고(점수형·미션형 모두) 이름·진행 "0 / N"·aria(progressbar·valuemin/max/now)·#screen-game[data-learn]. 보통 판에서는 숨김', async () => {
  for (const [lv, stage, mode, show] of [['easy', 2, 'many', true], ['normal', 2, 'many', true], ['hard', 5, 'many', true], ['easy', 2, 'normal', false], ['normal', 2, 'normal', false]]) {
    const env = createEnv(60, null, { quiz: { mode } });
    await startAndWait(env, lv, stage);
    const I = env.I; const chip = I.el['learn-chip'];
    assert.strictEqual(chip.hidden, !show, [lv, stage, mode].join());
    if (show) {
      const need = G.learnNeed(lv, stage);
      assert.strictEqual(I.el['learn-num'].textContent, '0 / ' + need);
      assert.strictEqual(chip.getAttribute('aria-valuemin'), '0');
      assert.strictEqual(chip.getAttribute('aria-valuemax'), String(need));
      assert.strictEqual(chip.getAttribute('aria-valuenow'), '0');
      // M4-B(spec §27.6): 정령 특별 레벨(5·10단계, 여기서는 고수 5)만 칩 이름이 "정령에게 선물 드리기" — 그 밖의 레벨은 "선물상자 문제 풀기" 그대로
      assert.strictEqual(chip.getAttribute('aria-label'), ([5, 10].indexOf(stage) !== -1 ? '정령에게 선물 드리기' : '선물상자 문제 풀기') + ' 0 / ' + need);
      assert.strictEqual(chip.classList.contains('done'), false);
      assert.strictEqual(I.el['screen-game'].dataset.learn, '1');
      assert.strictEqual(I.el['learn-fill'].style.transform, 'scaleX(0.0000)');
      assert.strictEqual(I.el['learn-live'].textContent, '');
      // 점수형은 목표 바가, 미션형은 미션 칩이 그대로 있다
      assert.strictEqual(I.el.goal.hidden, lv !== 'easy');
      assert.strictEqual(I.el.mission.hidden, lv === 'easy');
    } else {
      assert.strictEqual(I.el['screen-game'].dataset.learn, undefined);
    }
    env.dispose();
  }
});

test('⑤ 학습 칩 진행: 문제를 풀 때마다 "k / N"·바·aria-valuenow, N 을 넘으면 N / N 에 고정·완료(done)·"완료" aria·#learn-live 알림(한 번), 맞든 틀리든 같다', async () => {
  // 점수 목표(10,800)는 채우지 못하는 판이라 N 개를 풀어도 판이 이어진다 → N 을 넘겨서(6번째) 칩이 N / N 에 고정되는지 본다
  const env = createEnv(61, (c) => { c.edu.many.wild.spawn = 0.0000001; ['easy', 'normal', 'hard'].forEach((l) => { c.difficulty[l].time = { start: 600, max: 700 }; }); }, { quiz: { answer: (rec) => ({ right: rec.index % 2 === 1, bonus: rec.index % 2 === 1 ? 10 : 0 }) } });
  const I = env.I; const st = I.state; const chip = I.el['learn-chip'];
  await startAndWait(env, 'easy', 1);
  st.edu.firstDone = true;
  const need = st.edu.learn.need;
  assert.strictEqual(need, 5);
  const live = [];
  for (let k = 1; k <= need + 1; k++) {
    wildScenario(env);
    I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
    await finishAction(env);
    await env.runFor(300);
    assert.strictEqual(st.phase, 'playing', '목표 점수는 아직 못 채웠다 k=' + k);
    assert.strictEqual(st.edu.asked, k);
    const shown = Math.min(k, need);
    assert.strictEqual(I.el['learn-num'].textContent, shown + ' / ' + need, 'k=' + k);
    assert.strictEqual(chip.getAttribute('aria-valuenow'), String(shown));
    assert.strictEqual(I.el['learn-fill'].style.transform, 'scaleX(' + (shown / need).toFixed(4) + ')');
    assert.strictEqual(chip.classList.contains('done'), k >= need, '완료 표시 k=' + k);
    assert.strictEqual(chip.getAttribute('aria-label'), '선물상자 문제 풀기 ' + shown + ' / ' + need + (k >= need ? ', 완료' : ''));
    live.push(I.el['learn-live'].textContent);
  }
  assert.deepStrictEqual(live, ['', '', '', '', '선물상자 문제 풀기를 끝냈어요', '선물상자 문제 풀기를 끝냈어요'], '끝낼 때 한 번만 알린다(N 을 넘긴 뒤에는 다시 읽지 않는다): ' + JSON.stringify(live));
  assert.strictEqual(st.edu.right, 3, '맞든 틀리든 같은 칸으로 센다(정답 3·오답 3)');
  env.dispose();
});

test('⑤ 학습 칩 마크업(index.html): 숨김으로 시작·role=progressbar·aria-label·aria-valuemin/max/now·이름과 작은 글·✓ 는 aria-hidden·#learn-live(role=status, polite)·미션 칩 뒤 보드 앞', () => {
  assert.match(HTML, /<div class="learn-chip" id="learn-chip" role="progressbar" aria-label="선물상자 문제 풀기" aria-describedby="learn-sub" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" hidden>/);      // R-M3: 작은 글("맞든 틀리든 푼 개수예요")은 progressbar 의 자식이라 낭독되지 않으므로 aria-describedby 로 연결한다(CSS 주석이 이미 그렇게 적혀 있었다)
  assert.ok(HTML.includes('<b class="lc-name" id="learn-name">선물상자 문제 풀기</b><small class="lc-sub" id="learn-sub">맞든 틀리든 푼 개수예요</small>'));      // M4-B: 정령 특별 레벨에서 game.js 가 이름을 바꾸려고 id 만 더했다(기본 문구·구조는 그대로)
  assert.ok(HTML.includes('<span class="lc-ok" aria-hidden="true">✓</span>'));
  assert.ok(HTML.includes('<svg class="lc-ico" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#gem-gift"></use></svg>'));
  assert.match(HTML, /<p class="m-live" id="learn-live" role="status" aria-live="polite"><\/p>/);
  const i1 = HTML.indexOf('id="mission"'); const i2 = HTML.indexOf('id="learn-chip"'); const i3 = HTML.indexOf('id="board-wrap"');
  assert.ok(i1 > 0 && i2 > i1 && i3 > i2, '순서: 목표 바·미션 칩 → 학습 칩 → 보드');
  assert.ok(HTML.indexOf('id="goal"') < i2);
  assert.ok(HTML.includes('id="sd-learn"') && /id="sd-learn" hidden/.test(HTML));
  assert.ok(HTML.includes('<li id="rule-learn"><b>선물상자</b> 문제 양이 \'많이\'일 때는 레벨마다 정해진 개수의 선물상자 문제를 풀어야 클리어돼요.</li>'));
});

/* ===================================================================
 * 레벨 카드·설명판: 문제 양에 따라 숫자와 학습 줄이 바뀐다
 * =================================================================== */
test('레벨 카드·설명판(많이): 초보 카드는 많이 표 점수, 중수·고수 카드는 많이 표 미션 숫자, 설명판에 "선물상자 문제 N개도 풀어요"(특별 +2). 보통·잠긴 레벨엔 없음', () => {
  const env = createEnv(70, (c) => {
    c.edu.many.easyTargets = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
    c.edu.many.missions.normal[0] = { parts: [{ k: 'collect', color: 2, need: 77 }], seq: false };
  });
  const I = env.I; const grid = I.el['stage-grid'];
  I.save.level = 'easy'; I.save.progress.easy = 3;
  I.goStages();
  assert.strictEqual(grid.children[0].innerHTML.indexOf('<span class="sc-target">1,100</span>') !== -1, true, '초보 카드 = 많이 표');
  assert.strictEqual(grid.children[0].getAttribute('aria-label'), '레벨 1, 목표 1,100점, 별 0개');
  assert.strictEqual(I.el['sd-learn'].hidden, false);
  assert.strictEqual(I.el['sd-title'].textContent, '레벨 4');
  assert.strictEqual(I.el['sd-learn'].textContent, '선물상자 문제 5개도 풀어요', '일반 레벨 4: 5개');
  I.save.progress.easy = 4;
  I.goStages();
  assert.strictEqual(I.el['sd-learn'].textContent, '정령에게 선물상자 문제 7개를 드려요', '특별 레벨 5 = 5 + 2 (M4-B: 정령 레벨은 문구가 "정령에게 … 드려요", 같은 N)');
  I.el['sd-learn'].hidden = true;
  I.save.progress.easy = 9;
  I.goStages();
  assert.strictEqual(I.el['sd-title'].textContent, '레벨 10');
  assert.strictEqual(I.el['sd-learn'].textContent, '정령에게 선물상자 문제 7개를 드려요', '특별 레벨 10 = 5 + 2 (M4-B)');
  I.save.level = 'normal'; I.save.progress.normal = 2;
  I.goStages();
  assert.ok(grid.children[0].innerHTML.indexOf('<b>77</b>') !== -1, '중수 1번 카드 = 많이 표 미션 숫자');
  assert.ok(grid.children[0].getAttribute('aria-label').indexOf('풀 보석 77개') !== -1);
  assert.strictEqual(I.el['sd-learn'].textContent, '선물상자 문제 6개도 풀어요');
  // 잠긴 레벨(설명판이 잠김 안내만 보이는 칸)에는 학습 줄이 없고, 열린 레벨에 마우스를 올리면 그 레벨의 값
  I.save.level = 'hard'; I.save.progress.hard = 0;
  I.goStages();
  const over = (n) => (I.el['stage-grid']._ls.pointerover || []).forEach((fn) => fn({ pointerType: 'mouse', target: grid.children[n - 1] }));
  assert.strictEqual(I.el['sd-learn'].textContent, '선물상자 문제 7개도 풀어요', '고수 1단계: 7');
  over(7);
  assert.strictEqual(I.el['sd-title'].textContent, '레벨 7');
  assert.strictEqual(I.el['sd-learn'].hidden, true, '잠긴 레벨');
  assert.ok(I.el['sd-goal'].textContent.indexOf('잠겨') !== -1);
  over(1);
  assert.strictEqual(I.el['sd-learn'].hidden, false);
  env.dispose();
  // 보통: 카드 숫자는 일반용 표, 학습 줄 없음
  const e2 = createEnv(71, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 1100); }, { quiz: { mode: 'normal' } });
  e2.I.save.level = 'easy'; e2.I.save.progress.easy = 4;
  e2.I.goStages();
  assert.ok(e2.I.el['stage-grid'].children[0].innerHTML.indexOf('<span class="sc-target">10,800</span>') !== -1);
  assert.strictEqual(e2.I.el['sd-learn'].hidden, true);
  assert.strictEqual(e2.I.el['sd-learn'].textContent, '');
  e2.dispose();
});

test('refreshStages: 레벨 선택 화면이 보일 때만 문제 양을 다시 맞추고 카드·설명판을 다시 그린다 — ready 가 바뀌면 숫자가 따라 바뀌고, 다른 화면에서는 아무 일도 하지 않는다', () => {
  const env = createEnv(72, (c) => { c.edu.many.easyTargets = c.edu.many.easyTargets.map(() => 1100); }, { quiz: { ready: false } });
  const I = env.I; const grid = I.el['stage-grid']; const X = env.sandbox.ElementGemsEdu;
  I.save.level = 'easy'; I.save.progress.easy = 4;
  I.goStages();
  assert.ok(grid.children[0].innerHTML.indexOf('10,800') !== -1, '불러오기 전: 보통 표');
  assert.strictEqual(I.el['sd-learn'].hidden, true);
  env.quiz.ready = true;
  assert.ok(grid.children[0].innerHTML.indexOf('10,800') !== -1, 'refreshStages 전에는 그대로');
  X.refreshStages();
  assert.ok(grid.children[0].innerHTML.indexOf('<span class="sc-target">1,100</span>') !== -1, '불러오기가 끝나면: 많이 표');
  assert.strictEqual(I.el['sd-learn'].hidden, false);
  env.quiz.mode = 'normal';
  X.refreshStages();
  assert.ok(grid.children[0].innerHTML.indexOf('10,800') !== -1, '문제 양을 보통으로 바꾸면: 보통 표');
  assert.strictEqual(I.el['sd-learn'].hidden, true);
  // 레벨 선택 화면이 아니면(시작 화면) 다시 그리지 않는다
  I.goHome();
  const html0 = grid.children[0].innerHTML;
  env.quiz.mode = 'many';
  X.refreshStages();
  assert.strictEqual(grid.children[0].innerHTML, html0, '시작 화면에서는 안 그린다');
  assert.strictEqual(env.X.getEduTableMode(), 'normal', '표 모드도 그대로');
  env.dispose();
});

/* ===================================================================
 * ⑥ edu.js — 저장·검증·라디오 UI
 * =================================================================== */
test('⑥ normalizeEdu: intensity 는 많이|보통만 받고, 없거나 잘못된 값은 기본값(많이, 둘째 인자로 바꿀 수 있다). 옛 저장(필드 없음)도 그대로 파싱된다', () => {
  assert.strictEqual(LOGIC.normalizeEdu({ intensity: 'normal' }).intensity, 'normal');
  assert.strictEqual(LOGIC.normalizeEdu({ intensity: 'many' }).intensity, 'many');
  [undefined, null, 'x', '', 1, 0, true, {}, [], 'MANY', 'Normal'].forEach((v) => assert.strictEqual(LOGIC.normalizeEdu({ intensity: v }).intensity, 'many', '잘못된 값 ' + JSON.stringify(v)));
  assert.strictEqual(LOGIC.normalizeEdu({}).intensity, 'many', '필드 없음');
  assert.strictEqual(LOGIC.normalizeEdu(null).intensity, 'many');
  assert.strictEqual(LOGIC.normalizeEdu({}, 'normal').intensity, 'normal', '기본값을 바꾸면 따라간다');
  assert.strictEqual(LOGIC.normalizeEdu({ intensity: 'many' }, 'normal').intensity, 'many', '저장된 값이 우선');
  assert.strictEqual(LOGIC.normalizeEdu({ intensity: 'x' }, 'bogus').intensity, 'many', '기본값 자체가 이상하면 많이');
  assert.strictEqual(LOGIC.normalizeIntensity('normal'), 'normal');
  const old = LOGIC.normalizeEdu({ unit: 'soc-3-2-1-1', pool: { 'soc-3-2-1-1': { order: [1, 2], pos: 1 } }, stats: { 'soc-3-2-1-1': { asked: 2, right: 1 } } });
  assert.strictEqual(old.unit, 'soc-3-2-1-1');
  assert.deepStrictEqual(old.stats['soc-3-2-1-1'], { asked: 2, right: 1 });
  assert.strictEqual(old.intensity, 'many');
});

test('⑥ 저장·복원: intensity 가 저장 문자열을 왕복해도 보존되고(mergeEduIntoSave·readEduFromRaw), 다른 필드(진행·설정)는 건드리지 않는다', () => {
  const edu = LOGIC.normalizeEdu({ unit: 'soc-5-2-1-1', intensity: 'normal' });
  const raw = LOGIC.mergeEduIntoSave('{"level":"hard","muted":true,"progress":{"easy":3}}', edu);
  const back = JSON.parse(raw);
  assert.strictEqual(back.level, 'hard');
  assert.strictEqual(back.muted, true);
  assert.deepStrictEqual(back.progress, { easy: 3 });
  assert.strictEqual(back.edu.intensity, 'normal');
  assert.deepStrictEqual(LOGIC.readEduFromRaw(raw), edu);
  assert.strictEqual(LOGIC.readEduFromRaw('{"edu":{"intensity":"zzz"}}').intensity, 'many');
  assert.strictEqual(LOGIC.readEduFromRaw('깨진 저장').intensity, 'many');
  assert.strictEqual(LOGIC.readEduFromRaw('', 'normal').intensity, 'normal');
  // game.js 쪽: edu 필드는 그대로 보존(왕복 불변)
  assert.deepStrictEqual(G.cleanEduField(edu), edu);
});

test('⑥ intensityNote: 효과가 있을 때는 빈 문자열, 퍼즐만·단원 없음·불러오는 중·실패는 짧은 쉬운 말 안내', () => {
  assert.strictEqual(LOGIC.intensityNote({ skip: false, unit: true, load: 'ready' }), '');
  assert.strictEqual(LOGIC.intensityNote(null), '');
  const notes = [
    LOGIC.intensityNote({ skip: true, unit: true, load: 'ready' }),
    LOGIC.intensityNote({ skip: false, unit: false, load: 'idle' }),
    LOGIC.intensityNote({ skip: false, unit: true, load: 'loading' }),
    LOGIC.intensityNote({ skip: false, unit: true, load: 'failed' })
  ];
  assert.strictEqual(new Set(notes).size, 4);
  notes.forEach((n) => { assert.ok(n.length > 8 && n.length < 60, n); assert.ok(/[요]\.?$/.test(n), '쉬운 말(~요): ' + n); });
});

/** edu.js 의 브라우저 부분을 가짜 DOM 에서 실행한다(라디오·시작 화면 단원 칩·불러오기 완료 때 refreshStages) */
function browserEnv(rawSave, opt) {
  const o = opt || {};
  const KEY = 'element-gems-edu:v1';
  const store = {};
  if (rawSave) store[KEY] = rawSave;
  const calls = { refresh: 0, writes: 0 };
  const ids = {};
  const mkEl = (id, cls) => { const e = new FakeEl('div'); e._cls = new Set(cls ? cls.split(' ') : []); ids[id] = e; return e; };
  const doc = {
    readyState: 'complete', activeElement: null, body: { contains: () => true },
    getElementById(id) { return ids[id] || mkEl(id); },
    createElement(t) { return new FakeEl(t); }, createTextNode(t) { const e = new FakeEl('#text'); e.textContent = t; return e; },
    querySelectorAll() { return []; }, addEventListener() {}, head: new FakeEl('head')
  };
  const grp = mkEl('eg-amount');
  ['normal', 'many'].forEach((v) => { const b = mkEl('eg-amt-' + v, 'eg-amt'); b.dataset.v = v; b.setAttribute('role', 'radio'); b.parentNode = grp; grp.children.push(b); });
  mkEl('eg-unit-card'); mkEl('eg-unit-amount').hidden = true;
  mkEl('eg-amount-note');
  const handlers = {};
  const save = { level: 'normal', edu: {} };
  const sandbox = {
    console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    sessionStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }), scrollTo() {}, location: { protocol: 'http:' },
    setTimeout() { return 1; }, clearTimeout() {}, document: doc, addEventListener() {},     // 시간 제한(불러오기 15초 등)은 걸지 않는다 — 진짜 타이머가 시험 프로세스를 붙잡지 않게
    EDU_CATALOG: o.catalog === false ? undefined : { subjects: [{ id: 'soc', name: '사회', grades: [{ grade: 3, terms: [{ term: 2, ready: true, units: [{ no: 1, name: '단원', subs: [{ no: 1, id: 'soc-3-2-1-1', name: '소단원', count: 1, file: 'edu-data/q/soc-3-2-1-1.js' }] }] }] }] }] },
    EDU_Q: o.noQ ? {} : { 'soc-3-2-1-1': { items: [{ n: 1, t: 'ox', q: '문제', f: 'F1', e: '해설', a: 1 }] } }
  };
  sandbox.window = sandbox;
  sandbox.ElementGemsHost = {
    CONFIG: { edu: Object.assign({ storageKey: KEY, defaultIntensity: 'many', bonus: { base: 900, mult: { easy: 0.8, normal: 1, hard: 1.3 } } }, o.eduCfg || {}) },
    on(name, fn) { handlers[name] = fn; }, getSave() { return save; }, writeSave() { calls.writes++; store[KEY] = JSON.stringify(save); },
    goHome() {}, setStartGate() {}, getPhase() { return 'start'; }
  };
  sandbox.ElementGemsEdu = { refreshStages() { calls.refresh++; }, state() { return { level: 'normal' }; }, bonusFor() { return 900; } };
  vm.createContext(sandbox);
  new vm.Script(EDU_JS, { filename: 'edu.js' }).runInContext(sandbox);
  assert.strictEqual(typeof handlers.init, 'function', 'edu.js 가 init 을 기다린다');
  handlers.init();
  const fire = (el, type, evt) => (el._ls[type] || []).slice().forEach((fn) => fn(Object.assign({ preventDefault() { this.prevented = true; }, target: el }, evt || {})));
  return { store, calls, ids, grp, sandbox, save, fire, KEY, radios: () => grp.children.map((b) => b.getAttribute('aria-checked') + '/' + b.tabIndex) };
}
const savedEdu = (be) => JSON.parse(be.store[be.KEY]).edu;

test('⑥ 라디오 UI(edu.js): 처음엔 많이가 선택·tabindex 로빙, 클릭하면 즉시 저장·aria-checked·시작 화면 한 줄·refreshStages 호출, 같은 값을 다시 눌러도 저장·갱신 안 함', () => {
  const be = browserEnv(null);
  assert.deepStrictEqual(be.radios(), ['false/-1', 'true/0'], '기본 많이');
  assert.strictEqual(be.ids['eg-unit-amount'].textContent, '선물상자 문제: 많이');
  assert.strictEqual(be.ids['eg-unit-amount'].hidden, false);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'many');
  const w0 = be.calls.writes; const r0 = be.calls.refresh;
  be.fire(be.grp, 'click', { target: be.grp.children[0] });          // 보통
  assert.deepStrictEqual(be.radios(), ['true/0', 'false/-1']);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'normal');
  assert.strictEqual(be.ids['eg-unit-amount'].textContent, '선물상자 문제: 보통');
  assert.strictEqual(savedEdu(be).intensity, 'normal', '누르는 즉시 저장');
  assert.ok(be.calls.writes > w0);
  assert.strictEqual(be.calls.refresh, r0 + 1, '레벨 선택 화면 갱신 요청');
  assert.ok(be.grp.children[0]._cls.has('on') && !be.grp.children[1]._cls.has('on'));
  const w1 = be.calls.writes; const r1 = be.calls.refresh;
  be.fire(be.grp, 'click', { target: be.grp.children[0] });          // 같은 값
  assert.strictEqual(be.calls.writes, w1, '같은 값은 저장하지 않는다');
  assert.strictEqual(be.calls.refresh, r1);
  be.fire(be.grp, 'click', { target: be.grp.children[1] });          // 많이
  assert.strictEqual(savedEdu(be).intensity, 'many');
  assert.strictEqual(be.ids['eg-unit-amount'].textContent, '선물상자 문제: 많이');
  // 다른 요소를 누르면 무시
  const other = new FakeEl('p');
  be.fire(be.grp, 'click', { target: other });
  assert.deepStrictEqual(be.radios(), ['false/-1', 'true/0']);
});

test('⑥ 라디오 키보드: ←↑ 앞·→↓ 뒤(끝에서 돌아옴)·Home/End — 옮기면서 선택하고 포커스도 따라간다. 다른 키는 무시(기본 동작 유지)', () => {
  const be = browserEnv(null);
  const key = (k, from) => { const e = { key: k, target: from, prevented: false, preventDefault() { this.prevented = true; } }; (be.grp._ls.keydown || []).forEach((fn) => fn(e)); return e; };
  let e = key('ArrowLeft', be.grp.children[1]);
  assert.strictEqual(e.prevented, true);
  assert.deepStrictEqual(be.radios(), ['true/0', 'false/-1'], '← 많이 → 보통');
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'normal');
  key('ArrowLeft', be.grp.children[0]);
  assert.deepStrictEqual(be.radios(), ['false/-1', 'true/0'], '← 보통 → (끝에서 돌아와) 많이');
  key('ArrowUp', be.grp.children[1]);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'normal');
  key('ArrowDown', be.grp.children[0]);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'many');
  key('ArrowRight', be.grp.children[1]);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'normal', '→ 도 끝에서 돌아온다');
  key('End', be.grp.children[0]);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'many');
  key('Home', be.grp.children[1]);
  assert.strictEqual(be.sandbox.EduQuiz.intensity(), 'normal');
  assert.strictEqual(be.sandbox.document.activeElement, null, '(가짜 DOM 은 activeElement 를 쓰지 않는다)');
  e = key('Tab', be.grp.children[0]);
  assert.strictEqual(e.prevented, false, 'Tab 은 건드리지 않는다');
  e = key(' ', be.grp.children[0]);
  assert.strictEqual(e.prevented, false, 'Space·Enter 는 단추 기본 동작(클릭)이 선택한다');
  assert.strictEqual(savedEdu(be).intensity, 'normal');
});

test('⑥ 저장 복원: 저장된 보통이 새로 열어도 유지되고(라디오·EduQuiz.intensity()·시작 화면 한 줄), 옛 저장(intensity 없음)은 기본 많이, 잘못된 값도 많이', () => {
  const be1 = browserEnv(JSON.stringify({ level: 'easy', edu: { unit: 'soc-3-2-1-1', intensity: 'normal' } }));
  assert.strictEqual(be1.sandbox.EduQuiz.intensity(), 'normal');
  assert.deepStrictEqual(be1.radios(), ['true/0', 'false/-1']);
  assert.strictEqual(be1.ids['eg-unit-amount'].textContent, '선물상자 문제: 보통');
  const be2 = browserEnv(JSON.stringify({ level: 'easy', edu: { unit: 'soc-3-2-1-1' } }));
  assert.strictEqual(be2.sandbox.EduQuiz.intensity(), 'many', '옛 저장');
  assert.deepStrictEqual(be2.radios(), ['false/-1', 'true/0']);
  const be3 = browserEnv(JSON.stringify({ edu: { intensity: 'zzz' } }));
  assert.strictEqual(be3.sandbox.EduQuiz.intensity(), 'many');
  const be4 = browserEnv(null, { eduCfg: { defaultIntensity: 'normal' } });
  assert.strictEqual(be4.sandbox.EduQuiz.intensity(), 'normal', 'game.js 의 기본값(defaultIntensity)을 따른다');
});

test('⑥ 단원 불러오기가 끝나면 refreshStages 가 불린다(저장된 단원이 있을 때 시작하자마자 · 문제 양을 바꿨을 때도), 불러오기가 안 되면 안내 줄', async () => {
  const be = browserEnv(JSON.stringify({ edu: { unit: 'soc-3-2-1-1', intensity: 'many' } }));
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(be.calls.refresh >= 1, '불러오기 완료 뒤 refreshStages: ' + be.calls.refresh);
  assert.strictEqual(be.sandbox.EduQuiz.ready, true);
  assert.strictEqual(be.ids['eg-amount-note'].hidden, true, '효과가 있는 상태라 안내 없음');
  const r0 = be.calls.refresh;
  be.fire(be.grp, 'click', { target: be.grp.children[0] });
  assert.strictEqual(be.calls.refresh, r0 + 1);
  // 문제를 못 불러오면(EDU_Q 에 없음·스크립트 주입 실패) ready 가 아니고 안내 줄이 보인다
  const bad = browserEnv(JSON.stringify({ edu: { unit: 'soc-3-2-1-1' } }), { noQ: true });
  assert.strictEqual(bad.sandbox.EduQuiz.ready, false);
  assert.strictEqual(bad.ids['eg-amount-note'].hidden, false);
  assert.ok(bad.ids['eg-amount-note'].textContent.length > 8);
  // 단원을 고르지 않았으면: 단원을 고르면 적용된다는 안내
  const none = browserEnv(null);
  assert.strictEqual(none.ids['eg-amount-note'].hidden, false);
  assert.strictEqual(none.ids['eg-amount-note'].textContent, '단원을 고르면 이 선택이 적용돼요.');
});

test('⑥ 라디오 마크업(index.html·edu.css): radiogroup + 라디오 둘(aria-checked·tabindex)·설명·안내 줄·확정 줄 아래, 터치 타깃 44px 이상, CSS 는 edu.css 끝 M3-B 블록 하나', () => {
  assert.match(HTML, /<div id="eg-amount" class="eg-amount" role="radiogroup" aria-labelledby="eg-amount-label" aria-describedby="eg-amount-desc">/);
  assert.match(HTML, /<button id="eg-amt-normal" class="eg-amt" type="button" role="radio" aria-checked="false" tabindex="-1" data-v="normal">보통<\/button>/);
  assert.match(HTML, /<button id="eg-amt-many" class="eg-amt" type="button" role="radio" aria-checked="true" data-v="many">많이<\/button>/);
  assert.ok(HTML.includes('<p id="eg-amount-desc" class="eg-amount-desc">많이: 한 판에 선물상자 문제를 6~12개쯤 풀어요 · 보통: 3~4개쯤</p>'));
  assert.ok(HTML.includes('<span id="eg-amount-label" class="eg-amount-label">선물상자 문제 양</span>'));
  assert.match(HTML, /<p id="eg-amount-note" class="eg-amount-note" hidden><\/p>/);
  assert.ok(HTML.indexOf('id="eg-pick-ok"') < HTML.indexOf('id="eg-amount"') && HTML.indexOf('id="eg-amount"') < HTML.indexOf('<!-- 게임 화면 -->'), '확정 줄 아래, 선택 화면 안');
  assert.match(HTML, /<p class="eg-unit-top"><span class="eg-ribbon">교육용<\/span><span class="eg-unit-cap">학습 단원<\/span><span id="eg-unit-amount" class="eg-unit-amount" hidden>선물상자 문제: 많이<\/span><\/p>/);
  // 44px 이상(기본 규칙과 휴대폰 가로 규칙 모두)
  const min = (re) => { const m = re.exec(CSS); assert.ok(m, String(re)); return parseInt(m[1], 10); };
  assert.ok(min(/\.eg-amt \{[^}]*min-height: (\d+)px/) >= 44, '.eg-amt 기본 규칙 44px 이상');
  const phone = CSS.slice(CSS.lastIndexOf('@media (orientation: landscape) and (max-height: 500px) {\n  #screen-game[data-learn="1"]'));
  assert.ok(/\.eg-amt \{[^}]*min-height: 44px/.test(phone), '휴대폰 가로에서도 44px');
  // 새 CSS 는 edu.css 끝의 "(spec §27.7·§27.8, M3-B)" 블록 하나
  const head = CSS.indexOf('선물상자 문제 양 "보통 / 많이"와 학습 칩 (spec §27.7·§27.8, M3-B)');
  assert.ok(head > 0 && CSS.indexOf('선물상자 문제 양 "보통 / 많이"와 학습 칩', head + 10) === -1, 'M3-B 블록은 하나');
  ['.eg-amt', '.eg-amount', '.learn-chip', '.lc-fill', '.sd-learn', '.eg-unit-amount'].forEach((sel) => {
    assert.ok(CSS.indexOf(sel + ' {') > head || CSS.indexOf(sel + ' {') === -1 || CSS.indexOf(sel + '[hidden]') > head, sel + ' 규칙은 M3-B 블록에');
    assert.strictEqual(CSS.slice(0, head).indexOf(sel), -1, sel + ' 가 M3-B 블록 앞에 없다');
  });
  // 학습 칩: 글자 11px 이상, 낮은 화면에서도 칩 높이 28px 이상, 감소 모션은 애니메이션 없음, 학습 칩이 있는 세로 화면에서 보드 크기식에 높이를 뺀다
  assert.match(CSS, /\.lc-sub \{ font-size: max\(11px, \.66rem\)/);
  assert.match(CSS, /#screen-game\[data-learn="1"\]\[data-goal\] \{\n    --learn-extra: 48px;/);
  assert.match(CSS, /var\(--ui-h\) - var\(--mis-extra, 0px\) - var\(--learn-extra\)/);
  assert.match(CSS, /@media \(max-width: 340px\) and \(orientation: portrait\) \{\n  #screen-game\[data-learn="1"\] \.buttons \.btn \{ padding-left: 2px; padding-right: 2px; white-space: nowrap; \}/, 'R-M3: 320px 세로 폰 + 학습 칩 — 하단 단추 글자가 쪼개지지 않게');
  const rm = CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(rm.includes('.learn-chip.pop { animation: none; }') && rm.includes('animation: none'));
  assert.ok(/#screen-game\[data-learn="1"\] \.game \{\n    grid-template-rows: auto auto auto auto minmax\(0, 1fr\) auto;\n    grid-template-areas: "board timer" "board score" "board goal" "board learn" "board gauges" "board buttons";/.test(CSS), '와이드: 학습 칩 자리(learn)');
  // 일반용 style.css 는 바이트 그대로
  assert.strictEqual(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), fs.readFileSync(path.join(GEN_DIR, 'style.css'), 'utf8'));
});

/* ===================================================================
 * ⑦ 새 문구 점검 — 피하는 말(spec §27.6.2)과 "쉬어가기"
 * =================================================================== */
const AVOID_ALL = ['보스', '몬스터', '전투', '싸움', '대결', '공격', '때리', '쓰러뜨', '처치', '무찌르', '물리치', '체력', 'HP', '데미지', '피해', '죽다', '죽는', '사망', 'KO', '파괴', '부수', '패배', '졌다', '졌어', '쉬어가'];
const STANDALONE_JEOK = /(^|[\s,·(→])적($|[\s,·)→])/;
function koreanStrings(code) {
  const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  return (body.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).concat(body.match(/"[^"\n]*[가-힣][^"\n]*"/g) || []);
}
test('⑦ 새 UI 문자열(학습 칩·설명판 줄·결과 줄·라디오·안내·규칙 문구·시작 화면 한 줄)에 피하는 말과 "쉬어가기"가 없고, 쉬운 말이다', () => {
  const eduBlock = SRC.slice(SRC.indexOf('/* ---------- 문제 양 "보통 / 많이"·학습 조건'), SRC.indexOf('/** 첫 ? 등장 안내'));
  assert.ok(eduBlock.length > 3000, '[EDU] 문제 양 구간');
  const strings = koreanStrings(eduBlock);
  strings.push(...koreanStrings(SRC.slice(SRC.indexOf('// [EDU] 시간이 끝났는데 선물상자 문제가 모자란 판'), SRC.indexOf("el['end-stars'].hidden"))));
  const edu = EDU_JS.slice(EDU_JS.indexOf('선물상자 문제 양 "보통 / 많이" (spec §27.7.6)'), EDU_JS.indexOf('시작 화면 단원 칩 · 학습단원 선택 화면'));
  strings.push(...koreanStrings(edu));
  strings.push(...koreanStrings(EDU_JS.slice(EDU_JS.indexOf('function intensityNote'), EDU_JS.indexOf('/* ---------- 카탈로그'))));
  assert.ok(strings.length >= 12, '문자열 ' + strings.length);
  // 마크업
  const markup = [HTML.slice(HTML.indexOf('<li id="rule-learn">'), HTML.indexOf('</li>', HTML.indexOf('<li id="rule-learn">'))),
    HTML.slice(HTML.indexOf('<div class="learn-chip"'), HTML.indexOf('id="learn-live"') + 60),
    HTML.slice(HTML.indexOf('<div id="eg-amount"'), HTML.indexOf('<!-- 게임 화면 -->')),
    HTML.slice(HTML.indexOf('id="eg-unit-amount"'), HTML.indexOf('id="eg-unit-amount"') + 80)].join(' ').replace(/<[^>]*>/g, ' ');
  strings.push(markup);
  strings.forEach((s) => {
    AVOID_ALL.forEach((w) => assert.ok(s.indexOf(w) === -1, '"' + w + '" 가 문구에 있음: ' + s));
    assert.ok(!STANDALONE_JEOK.test(s), '"적" 이 낱말로 쓰임: ' + s);
  });
  // 화면에 나오는 새 문구는 실제로 이 말들이다
  ['선물상자 문제 풀기', '맞든 틀리든 푼 개수예요', '선물상자 문제 풀기를 끝냈어요', '개도 풀어요', '선물상자 문제 양', '선물상자 문제: '].forEach((w) => assert.ok(strings.join('\n').indexOf(w) !== -1, '문구 없음: ' + w));
});

/* ===================================================================
 * ⑧ 정답률이 달라도 중수·고수(미션형)의 클리어 여부·시계·푼 문제 수는 같다(학습 조건은 푼 개수라서)
 * =================================================================== */
async function botGame(acc, lv, stage, seed) {
  const qr = mulberry(seed * 101 + 5);
  const env = createEnv(seed, (c) => { c.edu.many.wild = { spawn: 0.06, max: 4, pity: 4, guardGap: 2 }; ['easy', 'normal', 'hard'].forEach((l) => { c.difficulty[l].time = { start: 70, max: 80 }; }); }, { quiz: { answer: () => { const right = qr() < acc; return { right, bonus: right ? 900 : 0 }; } } });
  const I = env.I; const st = I.state;
  await startAndWait(env, lv, stage);
  const rng = mulberry(seed * 13 + stage);
  for (let n = 0; n < 60 && st.phase === 'playing'; n++) {
    await env.runFor(200 + Math.floor(rng() * 700));
    if (st.phase !== 'playing') break;
    if (st.locked) { await finishAction(env); continue; }
    const mv = I.listMoves(I.typeGrid()); if (!mv.length) continue;
    const m = mv[Math.floor(rng() * mv.length)];
    I.trySwap(m.a, m.b);
    await finishAction(env);
  }
  if (st.phase === 'playing') await env.runUntil(() => st.phase !== 'playing', 400000);
  const out = { cleared: env.ids['end-title'].textContent === 'STAGE CLEAR!', asked: st.edu.asked, left: Math.round(st.timeLeft * 1000), board: I.typeGrid().map((r) => r.join('')).join('/'), score: st.score, right: st.edu.right };
  env.dispose();
  return out;
}
test('⑧ 중수·고수: 정답률 40%·95%에서 같은 시드의 클리어 여부·남은 시간·푼 문제 수·보드가 같다(점수만 다르다) — 학습 조건은 푼 개수', async () => {
  let compared = 0; let scoreDiffers = 0;
  for (const lv of ['normal', 'hard']) {
    for (const stage of [1, 2, 3]) {
      for (const seed of [1, 2]) {
        const a = await botGame(0.4, lv, stage, seed);
        const b = await botGame(0.95, lv, stage, seed);
        assert.strictEqual(a.cleared, b.cleared, [lv, stage, seed, '클리어 여부'].join());
        assert.strictEqual(a.asked, b.asked, [lv, stage, seed, '푼 문제 수'].join());
        assert.strictEqual(a.left, b.left, [lv, stage, seed, '남은 시간'].join());
        assert.strictEqual(a.board, b.board, [lv, stage, seed, '보드'].join());
        if (a.asked > 0 && a.right !== b.right) scoreDiffers++;
        compared++;
      }
    }
  }
  assert.strictEqual(compared, 12);
  assert.ok(scoreDiffers >= 3, '정답률이 실제로 다르게 적용됐는지(점수만 다름): ' + scoreDiffers);
});
