/* 미션(목표) 엔진·HUD 시험 — spec §27.3.1(카운트 규칙)·§27.8(HUD 문구·접근성)·§27.9(M1 변경 범위).
 * 실행: node --test apps/element-gems/test/*.test.js
 *
 * ① 카운트 규칙(순수 함수) ② CONFIG.stages 형식·폴백 ③ 실제 판 흐름(가짜 DOM + 가상 시계로 game.js 를 그대로 실행) ④ HUD·레벨 카드 마크업
 * ⑤ 새 문구의 "피하는 말" 점검 ⑥ 점수형 기본 상태가 이전과 같다는 증거(미션 엔진을 건드리지 않는 폴백 경로도 같은 판을 만든다)
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

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ===================================================================
 * 1) 카운트 규칙 — 순수 함수 (spec §27.3.1 표를 그대로)
 * =================================================================== */
const grp = (color, size) => ({ t: 'group', color, size });
const act = (fromSwap, maxStep) => ({ t: 'action', fromSwap, maxStep });
const mk = (parts, seq) => G.missionInit({ parts, seq: !!seq });
const prog = (m, i) => G.missionProgress(m).parts[i];

test('COLLECT: 그 색 그룹의 크기를 더한다(2×2·L·T 포함), 다른 색은 세지 않고, 연쇄 단계와 무관하다', () => {
  const m = mk([{ k: 'collect', color: 3, need: 20 }]);
  G.missionUpdate(m, grp(3, 3));
  G.missionUpdate(m, grp(0, 5));                  // 다른 색
  G.missionUpdate(m, grp(3, 4));                  // 2×2 정사각형은 크기 4
  G.missionUpdate(m, grp(3, 5));                  // L·T 모양 5칸
  assert.strictEqual(prog(m, 0).now, 12);
  assert.strictEqual(G.missionDone(m), false);
  G.missionUpdate(m, act(true, 4));               // 행동 이벤트는 COLLECT 에 영향 없음
  assert.strictEqual(prog(m, 0).now, 12);
  G.missionUpdate(m, grp(3, 8));
  assert.strictEqual(G.missionDone(m), true);
  assert.strictEqual(prog(m, 0).now, 20, '진행 값은 need 로 자른다');
  assert.strictEqual(prog(m, 0).done, true);
});

test('COLLECT_EACH: 색마다 따로 세고, 가장 작은 값이 N 이상이어야 달성한다', () => {
  const m = mk([{ k: 'collectEach', colors: [0, 1, 2], need: 6 }]);
  G.missionUpdate(m, grp(0, 9));
  G.missionUpdate(m, grp(1, 6));
  G.missionUpdate(m, grp(4, 30));                 // 지정하지 않은 색
  assert.strictEqual(G.missionDone(m), false);
  assert.strictEqual(prog(m, 0).now, 0, '풀(2)이 0이면 최소값 0');
  assert.deepStrictEqual(prog(m, 0).each, [6, 6, 0], '색별 값도 need 로 잘라 보여 준다');
  G.missionUpdate(m, grp(2, 3));
  assert.strictEqual(prog(m, 0).now, 3);
  assert.strictEqual(G.missionDone(m), false);
  G.missionUpdate(m, grp(2, 3));
  assert.strictEqual(G.missionDone(m), true);
});

test('BIG: 크기가 min 이상인 그룹마다 +1(한 행동의 여러 그룹은 각각), 2×2 는 크기 4', () => {
  const m4 = mk([{ k: 'big', min: 4, need: 3 }]);
  const m5 = mk([{ k: 'big', min: 5, need: 1 }]);
  [grp(0, 3), grp(1, 4), grp(2, 4), grp(0, 6)].forEach((e) => { G.missionUpdate(m4, e); G.missionUpdate(m5, e); });
  assert.strictEqual(prog(m4, 0).now, 3, '4(2×2 포함)·4·6 = 3개, 크기 3은 제외');
  assert.strictEqual(G.missionDone(m4), true);
  assert.strictEqual(prog(m5, 0).now, 1, '크기 5 이상은 6 하나');
  assert.strictEqual(G.missionDone(m5), true);
  const only4 = mk([{ k: 'big', min: 5, need: 1 }]);
  G.missionUpdate(only4, grp(0, 4));
  assert.strictEqual(G.missionDone(only4), false, '2×2(크기 4)는 5 이상 미션에 세지 않는다');
});

test('CHAIN: 내가 스왑해서 시작한 행동만, 그 행동의 최대 연쇄가 k 이상이면 +1(행동당 1번). 스킬이 시작한 행동은 세지 않는다', () => {
  const m = mk([{ k: 'chain', min: 3, need: 2 }]);
  G.missionUpdate(m, act(true, 2));               // 연쇄 2 < 3
  G.missionUpdate(m, act(false, 5));              // 스킬이 시작한 행동은 연쇄가 커도 제외
  G.missionUpdate(m, grp(0, 3));                  // 그룹 이벤트는 CHAIN 과 무관
  assert.strictEqual(prog(m, 0).now, 0);
  G.missionUpdate(m, act(true, 3));
  assert.strictEqual(prog(m, 0).now, 1);
  G.missionUpdate(m, act(true, 7));               // 행동당 +1 (연쇄 7이어도 한 번)
  assert.strictEqual(prog(m, 0).now, 2);
  assert.strictEqual(G.missionDone(m), true);
});

test('COMBO(seq 아님): 부분 미션이 순서와 무관하게 동시에 세어지고, 모두 끝나야 달성한다', () => {
  const m = mk([{ k: 'collect', color: 1, need: 5 }, { k: 'chain', min: 2, need: 1 }, { k: 'big', min: 4, need: 1 }], false);
  G.missionUpdate(m, act(true, 2));               // 두 번째 부분이 먼저 끝난다
  assert.deepStrictEqual(G.missionProgress(m).parts.map((p) => p.done), [false, true, false]);
  G.missionUpdate(m, grp(1, 4));                  // collect 4 + big 1 (한 그룹이 두 부분에 동시에 세어진다)
  assert.deepStrictEqual(G.missionProgress(m).parts.map((p) => p.done), [false, true, true]);
  assert.strictEqual(G.missionDone(m), false);
  G.missionUpdate(m, grp(1, 3));
  assert.strictEqual(G.missionDone(m), true);
  assert.strictEqual(G.missionProgress(m).doneCount, 3);
});

test('SEQ(seq:true): 지금 차례의 부분만 센다 — 앞 단계가 끝나기 전의 카운트는 다음 단계에 넘어가지 않고, 끝낸 이벤트도 다음 단계로 세지 않는다', () => {
  const m = mk([{ k: 'collect', color: 0, need: 4 }, { k: 'big', min: 4, need: 1 }, { k: 'collect', color: 0, need: 3 }], true);
  G.missionUpdate(m, grp(2, 6));                  // 1단계(불 4개) 중에 나온 큰 그룹: 2단계(큰 매치)는 아직 세지 않는다
  assert.strictEqual(prog(m, 1).now, 0);
  assert.strictEqual(G.missionProgress(m).cur, 0);
  G.missionUpdate(m, grp(0, 3));
  assert.strictEqual(prog(m, 0).now, 3);
  G.missionUpdate(m, grp(0, 4));                  // 불 7 ≥ 4 로 1단계 끝. 이 크기 4 그룹은 2단계(큰 매치)로 세지 않는다
  assert.strictEqual(prog(m, 0).done, true);
  assert.strictEqual(G.missionProgress(m).cur, 1);
  assert.strictEqual(prog(m, 1).now, 0, '단계를 끝낸 그 이벤트는 다음 단계로 세지 않는다(기준선 = 단계가 시작된 때의 카운터)');
  assert.strictEqual(prog(m, 2).now, 0, '3단계의 불 카운터는 1단계에서 센 7개를 물려받지 않는다');
  G.missionUpdate(m, grp(0, 5));                  // 2단계 중: 큰 매치 +1 → 끝. 불 5개는 3단계로 세지 않는다
  assert.strictEqual(prog(m, 1).done, true);
  assert.strictEqual(prog(m, 2).now, 0);
  assert.strictEqual(G.missionProgress(m).cur, 2);
  G.missionUpdate(m, grp(0, 3));
  assert.strictEqual(G.missionDone(m), true, '3단계 불 3개');
  assert.strictEqual(G.missionProgress(m).cur, 2, '모두 끝나면 마지막 단계에 머문다');
});

test('missionProgress·missionDescribe: 진행 요약과 쉬운 말 문구(spec §27.8)', () => {
  const def = { parts: [{ k: 'collect', color: 3, need: 30 }, { k: 'collectEach', colors: [0, 1, 2], need: 21 }, { k: 'big', min: 4, need: 3 }, { k: 'chain', min: 2, need: 4 }], seq: false };
  const d = G.missionDescribe(def);
  assert.deepStrictEqual(d.parts.map((p) => p.name), ['번개 보석 터뜨리기', '불·물·풀 보석 각각', '큰 매치 만들기(한 번에 4개 이상)', '연쇄 만들기(CHAIN 2 이상)']);
  assert.strictEqual(d.parts[3].hint, '한 번 움직여서 이어서 터지게 해요');
  assert.deepStrictEqual(d.parts.map((p) => p.total), ['번개 보석 30개', '불·물·풀 보석 각각 21개', '한 번에 4개 이상 3번', '연쇄(CHAIN 2 이상) 4번']);
  assert.strictEqual(d.summary, '번개 보석 30개, 불·물·풀 보석 각각 21개, 한 번에 4개 이상 3번, 연쇄(CHAIN 2 이상) 4번');
  assert.strictEqual(d.count, 4);
  const sq = G.missionDescribe({ parts: [{ k: 'collect', color: 2, need: 12 }, { k: 'big', min: 5, need: 3 }], seq: true });
  assert.strictEqual(sq.summary, '① 풀 보석 12개 → ② 한 번에 5개 이상 3번');
  const m = G.missionInit(def);
  const p0 = G.missionProgress(m);
  assert.strictEqual(p0.total, 4);
  assert.strictEqual(p0.doneCount, 0);
  assert.strictEqual(p0.cur, -1, 'seq 가 아니면 cur 는 -1');
  assert.ok(p0.parts.every((p) => p.active && !p.done && p.now === 0));
  assert.strictEqual(G.missionInit({ parts: [{ k: 'big', min: 4, need: 1 }], seq: true }).cur, 0);
});

/* ===================================================================
 * 2) CONFIG.stages 형식과 폴백 (spec §27.9, §33)
 * =================================================================== */
test('CONFIG.stages: goalType 세 키가 score|mission 이고 초보는 score 로 고정, M1 기본값은 전 난이도 score·미션 표는 비어 있다', () => {
  const S = G.CONFIG.stages;
  assert.deepStrictEqual(Object.keys(S.goalType).sort(), ['easy', 'hard', 'normal']);
  Object.keys(S.goalType).forEach((k) => assert.ok(S.goalType[k] === 'score' || S.goalType[k] === 'mission', k));
  assert.strictEqual(S.goalType.easy, 'score', '초보는 항상 점수 목표(spec §33)');
  assert.deepStrictEqual(S.goalType, { easy: 'score', normal: 'score', hard: 'score' }, 'M1 기본값은 전 난이도 점수형(미션 표는 M2가 채운다)');
  assert.ok(Array.isArray(S.missions.normal) && Array.isArray(S.missions.hard));
  assert.ok(S.missions.normal.length === 0 && S.missions.hard.length === 0);
  assert.strictEqual(S.missions.easy, undefined, '초보에는 미션 표가 없다');
  assert.strictEqual(S.missionMaxParts, 4);
  assert.strictEqual(S.targets.normal.length, 10, '점수 폴백 표는 그대로 있다');
  // 미션 표에 값이 들어오면(M2 이후) 레벨 10칸·정의 형식을 지켜야 한다 — 지금은 빈 배열이라 통과, 채워지면 이 검사가 형식을 지킨다
  ['normal', 'hard'].forEach((lv) => {
    if (S.missions[lv].length === 0) return;
    assert.strictEqual(S.missions[lv].length, S.count);
    S.missions[lv].forEach((d, i) => assert.ok(G.missionValid(d), lv + ' 레벨 ' + (i + 1)));
  });
});

test('missionValid: 형식이 틀린 정의를 모두 거른다(막히는 판이 생기지 않게 점수 폴백)', () => {
  const ok = { parts: [{ k: 'collect', color: 0, need: 5 }] };
  assert.strictEqual(G.missionValid(ok), true);
  assert.strictEqual(G.missionValid({ parts: [{ k: 'collectEach', colors: [0, 1, 5], need: 9 }, { k: 'big', min: 5, need: 2 }, { k: 'chain', min: 4, need: 1 }], seq: true }), true);
  const bad = [
    null, undefined, 3, 'x', {}, { parts: null }, { parts: [] }, { parts: 'a' },
    { parts: [null] }, { parts: [{ k: 'zzz', need: 1 }] }, { parts: [{ k: 'collect', color: 0 }] },
    { parts: [{ k: 'collect', color: 0, need: 0 }] }, { parts: [{ k: 'collect', color: 0, need: 1.5 }] }, { parts: [{ k: 'collect', color: 0, need: '5' }] },
    { parts: [{ k: 'collect', color: 6, need: 1 }] }, { parts: [{ k: 'collect', color: -1, need: 1 }] }, { parts: [{ k: 'collect', need: 1 }] },
    { parts: [{ k: 'collectEach', colors: [0], need: 3 }] }, { parts: [{ k: 'collectEach', colors: [0, 0, 1], need: 3 }] }, { parts: [{ k: 'collectEach', colors: [0, 9], need: 3 }] },
    { parts: [{ k: 'collectEach', need: 3 }] },
    { parts: [{ k: 'big', min: 3, need: 1 }] }, { parts: [{ k: 'big', need: 1 }] },
    { parts: [{ k: 'chain', min: 1, need: 1 }] }, { parts: [{ k: 'chain', need: 1 }] },
    { parts: [ok.parts[0], ok.parts[0], ok.parts[0], ok.parts[0], ok.parts[0]] },     // 5개 > missionMaxParts
    { seq: 'yes', parts: ok.parts }
  ];
  bad.forEach((d, i) => assert.strictEqual(G.missionValid(d), false, '잘못된 정의 #' + i));
});

test('missionDef: goalType 이 score 이거나 초보이거나 정의가 없으면 null(점수 목표), mission 이고 올바른 정의가 있을 때만 정의를 돌려준다', () => {
  const S = G.CONFIG.stages;
  const saved = JSON.stringify([S.goalType, S.missions]);
  try {
    const def = { parts: [{ k: 'collect', color: 1, need: 8 }] };
    S.missions.normal = [def, null, { parts: [] }];
    S.missions.easy = [def];
    S.goalType.normal = 'score'; S.goalType.easy = 'mission';
    assert.strictEqual(G.missionDef('normal', 1), null, 'score 면 정의가 있어도 점수 목표');
    assert.strictEqual(G.missionDef('easy', 1), null, '초보는 goalType 이 mission 이어도 무시한다');
    S.goalType.normal = 'mission';
    assert.strictEqual(G.missionDef('normal', 1), S.missions.normal[0]);
    assert.strictEqual(G.missionDef('normal', 2), null, '정의 없음');
    assert.strictEqual(G.missionDef('normal', 3), null, '형식 오류');
    assert.strictEqual(G.missionDef('normal', 4), null, '표 길이 밖');
    assert.strictEqual(G.missionDef('normal', 0), null);
    assert.strictEqual(G.missionDef('normal', 11), null);
    assert.strictEqual(G.missionDef('hard', 1), null, '고수 미션 표 없음');
    S.missions.normal = null;
    assert.strictEqual(G.missionDef('normal', 1), null, '표가 배열이 아니어도 오류 없이 점수 목표');
  } finally {
    const [gt, ms] = JSON.parse(saved);
    S.goalType = gt; S.missions = ms;      // 다른 시험이 같은 모듈을 쓰므로 되돌린다
  }
});

/* ===================================================================
 * 3) 가짜 DOM + 가상 시계 하네스 — 실제 game.js 를 실행한다 (audio.test.js·edu-engine.test.js 하네스를 줄여서 사용)
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, hud: hud, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, goStages: goStages, typeGrid: typeGrid, setGemType: setGemType, listMoves: listMoves, renderStages: renderStages, goalMet: goalMet }; }\n";
assert.ok(SRC.indexOf(HOOK_TAIL) !== -1, 'game.js 끝부분을 찾지 못함');
const SCRIPT = new vm.Script(SRC.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: 'general/game.js' });

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.hidden = false; this.textContent = '';
    this.isFragment = false; this._html = ''; this._attrs = {}; this._cls = new Set(); this._ls = {}; this._q = {}; this._style = {};
    this.dataset = {};
    const self = this;
    this.style = {
      setProperty(k, v) { self._style[k] = String(v); },
      removeProperty(k) { delete self._style[k]; },
      getPropertyValue(k) { return self._style[k] || ''; }
    };
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
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl('span')); }   // 어떤 선택자든 같은 가짜 요소를 돌려준다(칩 안 요소 접근용)
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {} blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

/** cfgPatch(CONFIG): 시험용 복사본(샌드박스)의 CONFIG 만 바꾼다. 새 칸 종류는 sandbox.__forced 로 정한다(reduceMotion 이라 입자 난수는 쓰지 않는다) */
function createEnv(seed, cfgPatch) {
  const env = { _now: 0, _seq: 0, _q: [], errors: [], rnd: 0 };
  env.timers = {
    setTimeout(fn, ms) { const id = ++env._seq; env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn }); return id; },
    clearTimeout(id) { const i = env._q.findIndex((x) => x.id === id); if (i >= 0) env._q.splice(i, 1); }
  };
  const ids = {};
  const doc = {
    readyState: 'complete', hidden: false, activeElement: null, documentElement: new FakeEl('html'),
    getElementById(id) { return ids[id] || (ids[id] = new FakeEl('div')); },
    createElement(t) { return new FakeEl(t); },
    createElementNS(ns, t) { return new FakeEl(t); },
    createDocumentFragment() { const f = new FakeEl('fragment'); f.isFragment = true; return f; },
    addEventListener() {}, removeEventListener() {}
  };
  const store = {};
  const rand = mulberry(seed || 1);
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: true }),                  // prefers-reduced-motion: reduce → 입자(난수) 없음
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: () => { env.rnd++; return rand(); },
    __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  SCRIPT.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store;
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.CONFIG.board.enabled = false;                          // 새 칸 종류를 시험이 정한다(§26 구조 규칙은 끈다)
  if (cfgPatch) cfgPatch(env.CONFIG);
  env.unhandled = (e) => { env.errors.push(e); };
  process.on('unhandledRejection', env.unhandled);
  env.dispose = () => process.removeListener('unhandledRejection', env.unhandled);
  env.step = async function () {
    const q = env._q;
    if (!q.length) return false;
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (q[i].t < q[bi].t || (q[i].t === q[bi].t && q[i].id < q[bi].id)) bi = i;
    const ev = q.splice(bi, 1)[0];
    env._now = Math.max(env._now, ev.t);
    ev.fn();
    await new Promise((r) => setImmediate(r));
    return true;
  };
  env.runUntil = async function (pred, maxMs) {
    const limit = env._now + (maxMs == null ? 60000 : maxMs);
    while (!pred()) {
      if (env._now > limit) throw new Error('runUntil: 시간 초과 phase=' + env.I.state.phase + ' locked=' + env.I.state.locked);
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

/** 난이도 lv 레벨 stage 를 시작해 GO 까지 진행한다. missions 가 있으면 그 난이도를 미션형으로 바꾼다 */
async function startAndWait(env, lv, stage) {
  const I = env.I;
  I.save.level = lv;
  I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
}
function applyBoard(env, types) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], types[r][c]);
}
async function finishAction(env) {
  await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000);
  await env.runFor(400);          // 몇 프레임 더 흘려 HUD(updateHUD)가 그려지게 한다
}
function missionCfg(lv, def, extra) {
  return (cfg) => {
    cfg.stages.goalType[lv] = 'mission';
    cfg.stages.missions[lv] = [def];
    if (extra) extra(cfg);
  };
}

/* ---------- 한 행동의 정산을 순수 함수로 되풀이한다(기대값을 game.js 와 따로 계산하는 용도) ---------- */
const swapped = (b, m) => { const c = b.map((r) => r.slice()); const t = c[m.a.r][m.a.c]; c[m.a.r][m.a.c] = c[m.b.r][m.b.c]; c[m.b.r][m.b.c] = t; return c; };
/** board: 정산을 시작할 보드(스왑이 끝난 상태). o.removeCells: 스킬로 먼저 지울 칸(그룹으로 세지 않음), o.startStep: 스왑 1 / 스킬 이후 2, o.rng: 새 칸 종류를 뽑는 난수.
 *  반환 forced = game.js 가 새 칸마다 Math.random() 으로 읽는 값(열 순서, 위에서 아래로) */
function replay(board, o) {
  const g = board.map((r) => r.slice());
  const events = [];
  const forced = [];
  let maxStep = 1;
  function dropFill() {
    const res = G.applyGravity(g);
    for (let c = 0; c < 8; c++) {
      for (let i = 0; i < res.empties[c]; i++) { const t = Math.floor(o.rng() * 6); g[i][c] = t; forced.push((t + 0.5) / 6); }
    }
  }
  if (o.removeCells) { o.removeCells.forEach((p) => { g[p.r][p.c] = null; }); dropFill(); }
  let step = o.startStep;
  for (let guard = 0; guard < 60; guard++) {
    const groups = G.findMatches(g);
    if (!groups.length) break;
    maxStep = Math.max(maxStep, step);
    groups.forEach((grp2) => { events.push({ step, color: grp2.type, size: grp2.size }); grp2.cells.forEach((p) => { g[p.r][p.c] = null; }); });
    dropFill();
    step++;
  }
  return { events, forced, maxStep, final: g };
}
const sumColor = (events, color) => events.filter((e) => e.color === color).reduce((a, e) => a + e.size, 0);
/** 시드 보드에서 스왑 하나와 새 칸 종류를 찾는다. pred(sim, board, move) 가 참이고 정산 뒤에도 유효한 수가 남는 것(NO MOVES 재섞기가 없게) */
function findSwapScenario(pred) {
  for (let seed = 1; seed <= 600; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    const moves = G.listMoves(board);
    for (let mi = 0; mi < moves.length; mi++) {
      for (let k = 0; k < 6; k++) {
        const sim = replay(swapped(board, moves[mi]), { startStep: 1, rng: mulberry(seed * 100 + mi * 10 + k) });
        if (G.hasValidMove(sim.final) && pred(sim, board, moves[mi])) return { board, move: moves[mi], sim };
      }
    }
  }
  throw new Error('조건에 맞는 시나리오를 찾지 못함');
}
async function runSwap(env, sc) {
  applyBoard(env, sc.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
  env.I.trySwap(sc.move.a, sc.move.b);
  await finishAction(env);
  assert.strictEqual(env.sandbox.__forced.length, 0, '시나리오의 새 칸 종류가 모두 순서대로 쓰였다(재섞기·다른 난수 호출 없음)');
}

/* ===================================================================
 * 4) 실제 판 흐름: 카운트 규칙이 awardGroup·runAction 에 맞게 연결됐는지
 * =================================================================== */
test('실제 판: COLLECT 는 연쇄 단계와 무관하게 그룹마다 센다(리플레이 기대값과 같다), 다른 미션 부분과 점수·시간 규칙은 영향 없음', async () => {
  const sc = findSwapScenario((sim) => sim.maxStep >= 3 && sim.events.filter((e) => e.step >= 2).length >= 2);
  const color = sc.sim.events[sc.sim.events.length - 1].color;                    // 마지막 연쇄에서 나온 색
  const expected = sumColor(sc.sim.events, color);
  assert.ok(expected > 0 && sc.sim.events.some((e) => e.step >= 2 && e.color === color));
  const env = createEnv(7, missionCfg('normal', { parts: [{ k: 'collect', color, need: 9999 }] }));
  await startAndWait(env, 'normal', 1);
  assert.notStrictEqual(env.I.state.mission, null);
  const scoreBefore = env.I.state.score;
  await runSwap(env, sc);
  assert.strictEqual(env.I.state.mission.parts[0].n, expected, '연쇄 2·3단계 그룹도 센다');
  assert.ok(env.I.state.score > scoreBefore, '점수 규칙은 그대로 적용된다');
  assert.strictEqual(env.I.state.stats.matches, sc.sim.events.length);
  assert.strictEqual(env.I.state.phase, 'playing', '미션이 끝나지 않았으므로 판은 계속된다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('실제 판: BIG 는 크기가 min 이상인 그룹만 센다(스왑 4개 줄)', async () => {
  const sc = findSwapScenario((sim) => sim.events.some((e) => e.size >= 4) && sim.events.some((e) => e.size === 3));
  const big = sc.sim.events.filter((e) => e.size >= 4).length;
  const env = createEnv(8, missionCfg('normal', { parts: [{ k: 'big', min: 4, need: 99 }] }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, sc);
  assert.strictEqual(env.I.state.mission.parts[0].n, big);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('실제 판: CHAIN 은 스왑으로 시작한 행동의 최대 연쇄가 k 이상일 때만, 행동당 1번 센다(연쇄 없는 스왑은 0)', async () => {
  const chained = findSwapScenario((sim) => sim.maxStep >= 3);
  const plain = findSwapScenario((sim) => sim.maxStep === 1);
  const env = createEnv(9, missionCfg('normal', { parts: [{ k: 'chain', min: 2, need: 99 }] }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, plain);
  assert.strictEqual(env.I.state.mission.parts[0].n, 0, '연쇄가 없는 스왑');
  await runSwap(env, chained);
  assert.strictEqual(env.I.state.mission.parts[0].n, 1, '연쇄 3 이상이어도 행동당 1번');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('실제 판: 연쇄 min 이 최대 연쇄보다 크면 세지 않는다', async () => {
  const sc = findSwapScenario((sim) => sim.maxStep === 2);
  const env = createEnv(10, missionCfg('normal', { parts: [{ k: 'chain', min: 3, need: 99 }] }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, sc);
  assert.strictEqual(env.I.state.mission.parts[0].n, 0);
  env.dispose();
});

test('실제 판: 스킬(불)로 직접 지운 칸은 세지 않고, 스킬이 일으킨 뒤의 연쇄 매치는 COLLECT 로 센다. 스킬이 시작한 행동은 CHAIN 으로 세지 않는다', async () => {
  // 불 스킬을 (r,c)에 쓰면 3×3 이 지워진다(그룹 아님). 그 뒤 연쇄 단계 2부터 나오는 그룹만 센다.
  let found = null;
  for (let seed = 1; seed <= 600 && !found; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    for (let r = 1; r <= 6 && !found; r++) {
      for (let c = 1; c <= 6 && !found; c++) {
        const cells = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.push({ r: r + dr, c: c + dc });
        for (let k = 0; k < 6 && !found; k++) {
          const sim = replay(board, { startStep: 2, removeCells: cells, rng: mulberry(seed * 1000 + r * 100 + c * 10 + k) });
          const removedOfColor = (col) => cells.filter((p) => board[p.r][p.c] === col).length;
          const cas = sim.events.filter((e) => e.step >= 2);
          if (!G.hasValidMove(sim.final) || sim.maxStep < 2 || cas.length < 1) continue;
          const col = cas[0].color;
          if (removedOfColor(col) < 1) continue;                               // 스킬로 지운 칸에 그 색이 있어야 "제외" 가 의미 있다
          found = { board, r, c, cells, sim, col, removed: removedOfColor(col) };
        }
      }
    }
  }
  assert.ok(found, '스킬 시나리오를 찾지 못함');
  const env = createEnv(11, missionCfg('normal', { parts: [{ k: 'collect', color: found.col, need: 9999 }, { k: 'chain', min: 2, need: 99 }] }));
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  applyBoard(env, found.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, found.sim.forced);
  I.state.gauge[0] = I.CONFIG.types[0].max;
  I.onGauge(0);                                     // 불은 조준형이라 대상 칸을 고른다
  assert.strictEqual(I.state.aim, 0);
  I.handleTap(found.r, found.c);
  await finishAction(env);
  assert.strictEqual(env.sandbox.__forced.length, 0);
  const m = I.state.mission;
  const expected = sumColor(found.sim.events, found.col);
  assert.strictEqual(m.parts[0].n, expected, '뒤따른 연쇄 그룹만 센다');
  assert.ok(found.removed >= 1, '스킬로 지운 칸에 그 색이 있었다');
  assert.notStrictEqual(m.parts[0].n, expected + found.removed, '스킬로 직접 지운 칸은 더하지 않는다');
  assert.strictEqual(m.parts[1].n, 0, '스킬이 시작한 행동은 연쇄가 2 이상이어도 CHAIN 으로 세지 않는다');
  assert.strictEqual(I.state.stats.skills, 1);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

/* ===================================================================
 * 5) 판의 끝: 행동이 끝난 시점의 판정, 클리어·실패, 별·기록 (점수형과 같은 식)
 * =================================================================== */
test('미션 달성이 클리어를 정한다: 점수가 목표에 한참 못 미쳐도 STAGE CLEAR, 별·남은 시간·저장 기록은 점수형과 같은 식', async () => {
  const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.events[0].size === 3 && sim.maxStep === 1);
  const color = sc.sim.events[0].color;
  const env = createEnv(12, missionCfg('normal', { parts: [{ k: 'collect', color, need: 3 }] }));
  const results = [];
  env.sandbox.ElementGemsHost.on('stageResult', (d) => results.push(d));
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.ok(I.state.target > 0, '점수 목표 값은 폴백·참고값으로 남아 있다');
  await runSwap(env, sc);
  assert.strictEqual(I.state.phase, 'over');
  assert.ok(I.state.score < I.state.target, '점수 목표에는 못 미친다');
  assert.strictEqual(env.doc.getElementById('end-title').textContent, 'STAGE CLEAR!');
  assert.match(env.doc.getElementById('end-target').textContent, /^미션 모두 달성 · 남은 시간 /);
  const left = G.leftFromTime(I.state.timeLeft);
  const stars = G.starsFor(left, I.state.startTime);
  const rec = I.save.stages.normal[0];
  assert.deepStrictEqual({ stars: rec.stars, left: rec.left, best: rec.best }, { stars, left, best: I.state.score }, '별·남은 시간은 점수형과 같은 식, best 는 도달 점수 그대로');
  assert.strictEqual(I.save.progress.normal, 9, '이미 열려 있던 진행도는 줄지 않는다');
  assert.strictEqual(results.length, 1);
  assert.deepStrictEqual({ diff: results[0].diff, stage: results[0].stage, cleared: results[0].cleared, stars: results[0].stars, left: results[0].left }, { diff: 'normal', stage: 1, cleared: true, stars, left });
  assert.strictEqual(env.doc.getElementById('btn-next').hidden, false);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('점수가 목표를 넘어도 미션이 안 끝났으면 클리어가 아니다(미션형은 점수 목표를 보지 않는다)', async () => {
  const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.maxStep === 1);
  const env = createEnv(13, missionCfg('normal', { parts: [{ k: 'collect', color: 0, need: 9999 }] }, (cfg) => { cfg.stages.targets.normal[0] = 1; }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, sc);
  assert.ok(env.I.state.score >= env.I.state.target, '점수는 폴백 목표(1)를 넘었다');
  assert.strictEqual(env.I.state.phase, 'playing');
  assert.strictEqual(env.I.goalMet(), false);
  env.dispose();
});

test('시간 종료: 미션을 못 끝내면 TIME UP(미션 n/m 완료), 기록의 별·진행은 늘지 않는다', async () => {
  const env = createEnv(14, (cfg) => {
    missionCfg('normal', { parts: [{ k: 'collect', color: 0, need: 99 }, { k: 'chain', min: 2, need: 3 }] })(cfg);
    cfg.difficulty.normal.time = { start: 4, max: 6 };
  });
  await startAndWait(env, 'normal', 1);
  const before = JSON.stringify(env.I.save.stages.normal[0]);
  const progBefore = env.I.save.progress.normal;
  await env.runUntil(() => env.I.state.phase === 'over', 60000);
  assert.strictEqual(env.doc.getElementById('end-title').textContent, 'TIME UP');
  assert.strictEqual(env.doc.getElementById('end-target').textContent, '미션 0/2 완료 · 내 점수 0');
  assert.strictEqual(env.doc.getElementById('btn-next').hidden, true);
  assert.strictEqual(JSON.stringify(env.I.save.stages.normal[0]), before);
  assert.strictEqual(env.I.save.progress.normal, progBefore);
  env.dispose();
});

test('시간이 0이 돼도 그 행동의 정산 안에서 미션을 끝내면 클리어(점수형과 같은 규칙)', async () => {
  const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.events[0].size === 3 && sim.maxStep === 1);
  const color = sc.sim.events[0].color;
  const env = createEnv(15, missionCfg('normal', { parts: [{ k: 'collect', color, need: 3 }] }));
  await startAndWait(env, 'normal', 1);
  env.I.state.timeLeft = 0.1;                       // 스왑 애니메이션(0.15초) 중에 시간이 다 된다
  applyBoard(env, sc.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
  env.I.trySwap(sc.move.a, sc.move.b);
  await env.runUntil(() => env.I.state.phase !== 'playing', 60000);
  assert.strictEqual(env.I.state.timeUp, true, '행동 도중 시간이 0이 되었다');
  assert.strictEqual(env.doc.getElementById('end-title').textContent, 'STAGE CLEAR!');
  env.dispose();
});

/** 맨 윗줄에서 풀(2) 3개를 맞추는 시나리오: 정산 뒤 새 칸 3개 [0,1,1] 이 "맞출 곳 없는 보드"를 만든다(edu-engine 시험의 NO MOVES 시나리오와 같은 구성) */
function deadEndScenario() {
  const B = [];
  for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); B.push(row); }
  B[0][7] = 2; B[0][6] = 2; B[0][4] = 2; B[0][5] = 3;
  assert.strictEqual(G.findMatches(B).length, 0);
  const move = { a: { r: 0, c: 5 }, b: { r: 0, c: 4 } };
  const after = swapped(B, move);
  const groups = G.findMatches(after);
  assert.strictEqual(groups.length, 1);
  const refill = [0, 1, 1];
  const fin = after.map((row) => row.slice());
  groups[0].cells.forEach((p) => { fin[p.r][p.c] = null; });
  [5, 6, 7].forEach((c, i) => { fin[0][c] = refill[i]; });
  assert.strictEqual(G.findMatches(fin).length, 0);
  assert.strictEqual(G.hasValidMove(fin), false, '정산 뒤 맞출 곳이 없다');
  return { board: B, move, sim: { forced: refill.map((v) => (v + 0.5) / 6) } };
}

test('NO MOVES: 미션을 끝낸 행동이면 재섞기 없이 곧바로 클리어, 미션이 남았으면 평소처럼 재섞는다(점수형의 "목표 달성 시 재섞기 생략"과 같은 규칙)', async () => {
  const sc = deadEndScenario();
  const done = createEnv(17, missionCfg('normal', { parts: [{ k: 'collect', color: 2, need: 3 }] }));
  await startAndWait(done, 'normal', 1);
  await runSwap(done, sc);
  assert.strictEqual(done.I.state.phase, 'over');
  assert.strictEqual(done.doc.getElementById('end-title').textContent, 'STAGE CLEAR!');
  assert.notStrictEqual(done.doc.getElementById('popup').textContent, 'NO MOVES');
  assert.strictEqual(G.hasValidMove(done.I.typeGrid()), false, '재섞지 않았다');
  done.dispose();
  const open = createEnv(18, missionCfg('normal', { parts: [{ k: 'collect', color: 2, need: 99 }] }));
  await startAndWait(open, 'normal', 1);
  applyBoard(open, sc.board);
  open.sandbox.__forced.push.apply(open.sandbox.__forced, sc.sim.forced);
  open.I.trySwap(sc.move.a, sc.move.b);
  await finishAction(open);
  assert.strictEqual(open.I.state.phase, 'playing');
  assert.strictEqual(open.doc.getElementById('popup').textContent, 'NO MOVES');
  assert.strictEqual(G.hasValidMove(open.I.typeGrid()), true, '재섞은 뒤에는 맞출 곳이 있다');
  open.dispose();
});

test('초보는 goalType 이 mission 이어도 점수 목표다(state.mission = null), 다음 판은 새 미션 상태로 시작한다', async () => {
  const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.maxStep === 1);
  const color = sc.sim.events[0].color;
  const env = createEnv(16, (cfg) => {
    cfg.stages.goalType.easy = 'mission';
    cfg.stages.missions.easy = [{ parts: [{ k: 'collect', color: 0, need: 1 }] }];
    cfg.stages.goalType.normal = 'mission';
    cfg.stages.missions.normal = [{ parts: [{ k: 'collect', color, need: 9999 }] }, { parts: [{ k: 'big', min: 4, need: 9 }] }];
  });
  await startAndWait(env, 'easy', 1);
  assert.strictEqual(env.I.state.mission, null);
  assert.strictEqual(env.I.el.mission.hidden, true);
  assert.strictEqual(env.I.el.goal.hidden, false);
  await startAndWait(env, 'normal', 1);
  assert.notStrictEqual(env.I.state.mission, null, '중수 레벨 1 은 미션형');
  assert.strictEqual(env.I.el.mission.hidden, false);
  await runSwap(env, sc);
  const firstMission = env.I.state.mission;
  assert.ok(firstMission.parts[0].n > 0, '첫 판에서 센 값');
  env.I.startStage(2);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.notStrictEqual(env.I.state.mission, firstMission, '새 판은 새 미션 상태');
  assert.strictEqual(env.I.state.mission.parts[0].k, 'big');
  assert.strictEqual(env.I.state.mission.parts[0].n, 0);
  assert.strictEqual(env.I.el['mission-list'].children.length, 1);
  env.I.startStage(3);                                  // 미션 정의가 없는 레벨 → 점수 목표로 돌아간다(칩이 사라지고 목표 바가 보인다)
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.strictEqual(env.I.state.mission, null);
  assert.strictEqual(env.I.el['mission-list'].children.length, 0);
  assert.strictEqual(env.I.el.goal.hidden, false);
  assert.strictEqual(env.I.el.mission.hidden, true);
  assert.strictEqual(env.I.el['screen-game'].dataset.goal, 'score');
  env.dispose();
});

/* ===================================================================
 * 6) HUD 와 레벨 카드 마크업 (spec §27.8, §32.5.4)
 * =================================================================== */
test('HUD(점수형 기본): 목표 바만 보이고 #mission 은 숨겨져 있으며 칩이 없다', async () => {
  const env = createEnv(20);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.strictEqual(I.state.mission, null);
  assert.strictEqual(I.el.goal.hidden, false);
  assert.strictEqual(I.el.mission.hidden, true);
  assert.strictEqual(I.el['mission-list'].children.length, 0);
  assert.strictEqual(I.el['screen-game'].dataset.goal, 'score');
  assert.strictEqual(I.el['screen-game'].dataset.chips, undefined);
  assert.match(I.el['goal-text'].textContent, /^0 \/ 4,500$/);
  assert.strictEqual(I.el['count-info'].textContent, '레벨 1 · 목표 4,500점');
  assert.strictEqual(I.el['pause-level'].textContent, '중수 · 레벨 1 · 목표 4,500');
  env.dispose();
});

test('HUD(미션형): 목표 바 대신 칩 — 이름·진행 "n / need"·role=progressbar·aria 값·완료 ✓·알림(role=status)', async () => {
  const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.events[0].size === 3 && sim.maxStep === 1 && sim.events.length === 1);
  const color = sc.sim.events[0].color;
  const def = { parts: [{ k: 'collect', color, need: 3 }, { k: 'big', min: 4, need: 2 }] };
  const env = createEnv(21, missionCfg('normal', def));
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  const T = G.CONFIG.types;
  assert.strictEqual(I.el.goal.hidden, true);
  assert.strictEqual(I.el.mission.hidden, false);
  assert.strictEqual(I.el['screen-game'].dataset.goal, 'mission');
  assert.strictEqual(I.el['screen-game'].dataset.chips, '2');
  assert.strictEqual(I.el['mission-list'].children.length, 2);
  const chips = I.el['mission-list'].children;
  chips.forEach((c) => { assert.strictEqual(c.getAttribute('role'), 'progressbar'); assert.strictEqual(c.getAttribute('aria-valuemin'), '0'); });
  await env.runFor(400);
  assert.strictEqual(chips[0].getAttribute('aria-label'), T[color].name + ' 보석 터뜨리기 0 / 3');
  assert.strictEqual(chips[0].getAttribute('aria-valuenow'), '0');
  assert.strictEqual(chips[0].getAttribute('aria-valuemax'), '3');
  assert.strictEqual(chips[0].querySelector('.m-name').textContent, T[color].name + ' 보석 터뜨리기');
  assert.strictEqual(chips[0].querySelector('.m-num').textContent, '0 / 3');
  assert.strictEqual(chips[1].querySelector('.m-name').textContent, '큰 매치 만들기(한 번에 4개 이상)');
  assert.ok(chips[0].querySelector('.m-ico').innerHTML.indexOf('m-gem') !== -1, '보석 아이콘');
  assert.ok(chips[1].querySelector('.m-ico').innerHTML.indexOf('4+') !== -1, '글자 배지(색에만 의존하지 않음)');
  assert.strictEqual(chips[0].classList.contains('done'), false);
  assert.strictEqual(I.el['mission-live'].textContent, '');
  assert.strictEqual(I.el['count-info'].textContent, '레벨 1 · 미션: ' + T[color].name + ' 보석 3개, 한 번에 4개 이상 2번');
  await runSwap(env, sc);
  assert.strictEqual(I.state.phase, 'playing', '두 번째 부분이 남았으므로 계속');
  assert.strictEqual(chips[0].classList.contains('done'), true);
  assert.strictEqual(chips[0].getAttribute('aria-valuenow'), '3');
  assert.strictEqual(chips[0].getAttribute('aria-label'), T[color].name + ' 보석 터뜨리기 3 / 3, 완료');
  assert.strictEqual(chips[0].querySelector('.m-num').textContent, '3 / 3');
  assert.strictEqual(chips[0].querySelector('.m-fill').style.transform, 'scaleX(1.0000)');
  assert.strictEqual(chips[1].classList.contains('done'), false);
  assert.match(I.el['mission-live'].textContent, /^미션 하나를 끝냈어요\.?$/);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('HUD(미션형): collectEach 칩은 색별 작은 카운터를 보이고, chain 칩은 설명 글을 보인다. seq 는 지금 차례의 부분 하나만 칩으로 보인다', async () => {
  const env = createEnv(22, missionCfg('normal', { parts: [{ k: 'collectEach', colors: [0, 1, 2], need: 21 }, { k: 'chain', min: 2, need: 4 }], seq: false }));
  await startAndWait(env, 'normal', 1);
  const chips = env.I.el['mission-list'].children;
  assert.strictEqual(chips.length, 2);
  assert.strictEqual(chips[0].querySelector('.m-name').textContent, '불·물·풀 보석 각각');
  assert.strictEqual((chips[0].querySelector('.m-sub').innerHTML.match(/m-eg/g) || []).length, 3, '색마다 작은 카운터');
  assert.strictEqual(chips[0].getAttribute('aria-label'), '불·물·풀 보석 각각 0 / 21 (불 0, 물 0, 풀 0)');
  assert.strictEqual(chips[1].querySelector('.m-sub').textContent, '한 번 움직여서 이어서 터지게 해요');
  env.dispose();
  const env2 = createEnv(23, missionCfg('normal', { parts: [{ k: 'collect', color: 2, need: 5 }, { k: 'big', min: 4, need: 1 }, { k: 'chain', min: 2, need: 1 }], seq: true }));
  await startAndWait(env2, 'normal', 1);
  const c2 = env2.I.el['mission-list'].children;
  assert.strictEqual(c2.length, 1);
  assert.strictEqual(env2.I.el['screen-game'].dataset.chips, '1');
  assert.strictEqual(c2[0].getAttribute('aria-label'), '단계 1/3, 풀 보석 터뜨리기 0 / 5');
  assert.strictEqual(c2[0].querySelector('.m-name').textContent, '① 풀 보석 터뜨리기');
  // 1단계를 끝내면 칩이 2단계로 바뀐다
  env2.I.state.mission.parts[0].n = 4;
  G.missionUpdate(env2.I.state.mission, { t: 'group', color: 2, size: 3 });
  await env2.runFor(400);
  assert.strictEqual(c2[0].getAttribute('aria-label'), '단계 2/3, 큰 매치 만들기(한 번에 4개 이상) 0 / 1');
  assert.strictEqual(c2[0].querySelector('.m-name').textContent, '② 큰 매치 만들기(한 번에 4개 이상)');
  assert.match(env2.I.el['mission-live'].textContent, /^미션 하나를 끝냈어요\.?$/);
  env2.dispose();
});

test('레벨 카드(점수형 기본): 마크업이 M1 이전과 완전히 같다(.sc-target, .sc-mis 없음)', () => {
  const env = createEnv(30);
  const I = env.I;
  I.save.level = 'normal';
  I.save.progress.normal = 2;
  I.save.stages.normal[0].stars = 3;
  I.renderStages();
  const cards = I.el['stage-grid'].children;
  assert.strictEqual(cards.length, 10);
  // M1 이전 renderStages 가 만들던 문자열을 그대로 다시 만들어 비교한다
  cards.forEach((b, k) => {
    const i = k + 1;
    const open = i <= 3;
    const rec = I.save.stages.normal[k];
    let stars = '';
    for (let q = 1; q <= 3; q++) stars += q <= rec.stars ? '★' : '☆';
    const t = G.stageTarget('normal', i).toLocaleString('ko-KR');
    const html = '<span class="sc-num">' + i + '</span>' + (open ? '<span class="sc-target">' + t + '</span><span class="sc-stars" aria-hidden="true">' + stars + '</span>' : '<span class="sc-target">' + t + '</span><span class="sc-lock">잠김</span>');
    assert.strictEqual(b.innerHTML, html, '레벨 ' + i);
    assert.strictEqual(b.getAttribute('aria-label'), '레벨 ' + i + ', 목표 ' + t + '점, ' + (open ? '별 ' + rec.stars + '개' : '잠김'));
    assert.ok(b.innerHTML.indexOf('sc-mis') === -1);
  });
  env.dispose();
});

test('레벨 카드(미션형): .sc-mis 요약 — 보석 그림+개수 / 연쇄·큰 매치 횟수 / "N가지 미션". 초보 카드에는 만들지 않는다', () => {
  const env = createEnv(31, (cfg) => {
    cfg.stages.goalType.normal = 'mission';
    cfg.stages.missions.normal = [
      { parts: [{ k: 'collect', color: 3, need: 20 }] },
      { parts: [{ k: 'collectEach', colors: [0, 1, 2], need: 21 }] },
      { parts: [{ k: 'chain', min: 2, need: 10 }] },
      { parts: [{ k: 'big', min: 4, need: 9 }] },
      { parts: [{ k: 'collect', color: 0, need: 5 }, { k: 'chain', min: 2, need: 2 }, { k: 'big', min: 4, need: 1 }] }
    ];
    cfg.stages.goalType.easy = 'mission';
    cfg.stages.missions.easy = [{ parts: [{ k: 'collect', color: 0, need: 5 }] }];
  });
  const I = env.I;
  I.save.level = 'normal';
  I.save.progress.normal = 4;
  I.renderStages();
  const c = I.el['stage-grid'].children;
  assert.match(c[0].innerHTML, /<span class="sc-mis"><i class="mc g"><span class="m-gem">.*<\/span><b>20<\/b><\/i><\/span>/);
  assert.ok(c[0].innerHTML.indexOf('sc-target') === -1 && c[0].innerHTML.indexOf('sc-stars') !== -1);
  assert.strictEqual(c[0].getAttribute('aria-label'), '레벨 1, 미션 번개 보석 20개, 별 0개');
  assert.strictEqual((c[1].innerHTML.match(/class="m-gem"/g) || []).length, 3);
  assert.ok(c[1].innerHTML.indexOf('<i class="mc g each">') !== -1 && c[1].innerHTML.indexOf('<b>21</b>') !== -1);
  assert.ok(c[2].innerHTML.indexOf('<i class="mc k"><u>연쇄</u><b>10</b></i>') !== -1);
  assert.ok(c[3].innerHTML.indexOf('<i class="mc k"><u>큰 매치</u><b>9</b></i>') !== -1);
  assert.ok(c[4].innerHTML.indexOf('<i class="mc n">3가지 미션</i>') !== -1);
  assert.strictEqual(c[5].innerHTML.indexOf('sc-mis'), -1, '미션 정의가 없는 레벨은 점수 목표 카드 그대로');
  assert.ok(c[5].innerHTML.indexOf('sc-target') !== -1 || c[5].innerHTML.indexOf('잠김') !== -1);
  assert.strictEqual(c[0].dataset.kind, undefined, 'data-kind·태그·정령은 M2 이후의 몫이라 만들지 않는다');
  assert.ok(c.every((b) => b.innerHTML.indexOf('sc-tag') === -1 && b.innerHTML.indexOf('sc-sp') === -1));
  I.save.level = 'easy';
  I.save.progress.easy = 4;
  I.renderStages();
  assert.ok(I.el['stage-grid'].children.every((b) => b.innerHTML.indexOf('sc-mis') === -1), '초보 카드에는 미션 요약이 없다');
  env.dispose();
});

/* ===================================================================
 * 7) 정적 마크업·CSS·문구
 * =================================================================== */
test('index.html: #mission 은 기본 hidden 이고 목표 바(#goal) 곁에 있다. 칩은 코드가 만들고 완료 알림은 role=status', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<div class="mission" id="mission" role="group" aria-label="미션" hidden>/);
  assert.match(html, /<p class="m-live" id="mission-live" role="status" aria-live="polite"><\/p>/);
  assert.ok(html.indexOf('id="goal"') < html.indexOf('id="mission"') && html.indexOf('id="mission"') < html.indexOf('id="board-wrap"'));
  assert.ok(html.includes('<div class="m-list" id="mission-list"></div>'), '칩 자리는 비어 있다(자리표시자 값이 없다)');
  const opens = (html.match(/<div\b/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  assert.strictEqual(opens, closes, 'div 여닫음');
});

test('style.css: 미션 HUD 블록이 파일 맨 끝에 하나 있고, 점수형 레이아웃 규칙은 data-goal="mission" 으로만 걸린다', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const marker = '미션 HUD (spec §27)';
  const idx = css.indexOf(marker);
  assert.ok(idx > 0 && css.indexOf(marker, idx + 1) === -1, '블록 하나');
  const block = css.slice(idx);
  assert.ok(block.includes('#screen-game[data-goal="mission"]'));
  // 미션형이 아닐 때 보드 크기 식을 건드리는 규칙은 없다(--board 선언은 모두 data-goal="mission" 안)
  const boardDecls = block.split('\n').filter((l) => /--board:|--ui-h:/.test(l));
  assert.ok(boardDecls.length >= 1);
  assert.ok(!/^\s*:root/m.test(block), ':root 를 건드리지 않는다');
  assert.ok(/prefers-reduced-motion: reduce/.test(block), '감소 모션을 존중한다');
  // Review R-M1: 완료된 색별 카운터(.m-eg.ok)의 숫자·✓ 는 분홍·노랑 채움 위에서도 AA(4.5:1)가 되도록 --ok(#0f7a43, 3.6~4.1:1) 대신 짙은 초록을 쓴다
  const okRules = block.split('\n').filter((l) => /^\.m-eg\.ok/.test(l));
  assert.strictEqual(okRules.length, 2, '.m-eg.ok b / ::after 규칙');
  okRules.forEach((l) => assert.ok(!/var\(--ok\)/.test(l.replace(/\/\*[\s\S]*?\*\//g, '')), '.m-eg.ok 는 var(--ok) 글자색을 쓰지 않는다'));
  // 교육용 style.css 에도 똑같이 들어 있다(두 앱 style.css 일치)
  const edu = fs.readFileSync(path.join(root, '..', 'element-gems-edu', 'style.css'), 'utf8');
  assert.strictEqual(edu.slice(edu.indexOf(marker)), block);
});

test('새 UI 문자열에 spec §27.6.2 의 "피하는 말"(보스·전투·공격·처치·체력·피해·파괴 등)이 없다', () => {
  const AVOID = ['보스', '몬스터', '전투', '싸움', '대결', '공격', '때리', '쓰러뜨', '처치', '무찌르', '물리치', '체력', 'HP', '데미지', '피해', '죽다', '죽는', '사망', 'KO', '파괴', '부수', '패배', '졌다', '졌어'];
  const standalone = /(^|[\s,·(→])적($|[\s,·)→])/;      // 낱말 "적"(상대). "목적" 같은 말의 글자는 검사하지 않는다
  const strings = [];
  // (a) 엔진이 만드는 문구: 모든 종류·색·크기 조합
  for (let col = 0; col < 6; col++) {
    const d = G.missionDescribe({ parts: [{ k: 'collect', color: col, need: 7 }] });
    strings.push(d.summary, d.parts[0].name, d.parts[0].hint, d.parts[0].total);
  }
  [4, 5].forEach((min) => { const d = G.missionDescribe({ parts: [{ k: 'big', min, need: 2 }] }); strings.push(d.summary, d.parts[0].name, d.parts[0].total); });
  [2, 3, 4].forEach((min) => { const d = G.missionDescribe({ parts: [{ k: 'chain', min, need: 2 }] }); strings.push(d.summary, d.parts[0].name, d.parts[0].hint, d.parts[0].total); });
  const e = G.missionDescribe({ parts: [{ k: 'collectEach', colors: [0, 1, 2, 3, 4], need: 21 }, { k: 'chain', min: 2, need: 4 }, { k: 'big', min: 4, need: 3 }], seq: true });
  strings.push(e.summary, ...e.parts.map((p) => p.name + p.hint + p.total));
  // (b) 소스에 있는 새 한글 문자열 리터럴: 미션 엔진·HUD·카드·시작/종료 문구가 들어 있는 구간
  const regions = [
    [SRC.indexOf('const MISSION_KINDS'), SRC.indexOf('/** 레벨 N 선택 가능')],                  // 엔진(missionDescribe 문구)
    [SRC.indexOf('const MIS_DONE_TEXT'), SRC.indexOf('function updateHUD(dt)')],                // HUD 칩·완료 알림
    [SRC.indexOf('/** 레벨 카드의 미션 요약'), SRC.indexOf('function goStages()')]                // 레벨 카드 요약·aria-label
  ];
  regions.forEach(([a, b]) => assert.ok(a > 0 && b > a, '소스 구간'));
  regions.forEach(([a, b]) => {
    const body = SRC.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    (body.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach((s) => strings.push(s));
  });
  const m = SRC.slice(SRC.indexOf("if (state.mission) {\n      const mp = missionProgress"), SRC.indexOf("el['end-stars'].hidden"));
  (m.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach((s) => strings.push(s));
  const st = SRC.slice(SRC.indexOf('const mdef = missionDef(lv, stage)'), SRC.indexOf('await Promise.race([assetsReady'));
  (st.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach((s) => strings.push(s));
  strings.push('미션 하나를 끝냈어요');
  assert.ok(strings.length > 40);
  strings.forEach((s) => {
    AVOID.forEach((w) => assert.ok(s.indexOf(w) === -1, '"' + w + '" 가 문구에 있음: ' + s));
    assert.ok(!standalone.test(s), '"적" 이 낱말로 쓰임: ' + s);
  });
  // index.html 의 새 마크업 문구
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mh = html.slice(html.indexOf('<!-- 미션 칩'), html.indexOf('id="board-wrap"'));
  AVOID.forEach((w) => assert.ok(mh.indexOf(w) === -1, w));
});

/* ===================================================================
 * 8) 점수형 기본 상태가 이전과 같다는 증거
 * =================================================================== */
async function scriptedGame(cfgPatch, seed) {
  const env = createEnv(seed, (cfg) => { cfg.board.enabled = true; if (cfgPatch) cfgPatch(cfg); });
  const I = env.I;
  const st = I.state;
  const rng = mulberry(seed * 5 + 1);
  I.save.level = 'normal';
  I.save.progress.normal = 9;
  I.startStage(3);
  await env.runUntil(() => st.phase === 'playing', 30000);
  const trace = [];
  for (let n = 0; n < 40 && st.phase === 'playing'; n++) {
    await env.runFor(200 + Math.floor(rng() * 500));
    if (st.phase !== 'playing') break;
    if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
    const full = [];
    for (let i = 0; i < 6; i++) if (st.gauge[i] >= I.CONFIG.types[i].max) full.push(i);
    if (full.length && rng() < 0.6) {
      I.onGauge(full[Math.floor(rng() * full.length)]);
      if (st.aim !== null) I.handleTap(Math.floor(rng() * 8), Math.floor(rng() * 8));
    } else {
      const moves = I.listMoves(I.typeGrid());
      const m = moves[Math.floor(rng() * moves.length)];
      I.trySwap(m.a, m.b);
    }
    await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000);
    trace.push(JSON.stringify([I.typeGrid(), st.score, Math.round(st.timeLeft * 1000), st.gauge.slice(), st.stats.matches, st.phase, env.rnd, st.mission]));
  }
  if (st.phase === 'playing') await env.runUntil(() => st.phase !== 'playing', 400000);
  await env.runFor(300);
  const out = { trace, rnd: env.rnd, end: env.doc.getElementById('end-title').textContent, endTarget: env.doc.getElementById('end-target').textContent, save: env.store['element-gems:v1'], goalHidden: I.el.goal.hidden, missionHidden: I.el.mission.hidden, errors: env.errors.length };
  env.dispose();
  return out;
}

test('무변화: goalType 을 mission 으로 켜도 미션 정의가 없거나 틀리면 점수형과 같은 판이 나온다(보드·점수·시간·난수 호출 수·저장 모두 같다)', async () => {
  for (const seed of [3, 4, 5]) {
    const base = await scriptedGame(null, seed);
    const fallback = await scriptedGame((cfg) => {
      cfg.stages.goalType.normal = 'mission';
      cfg.stages.goalType.easy = 'mission';
      cfg.stages.missions.normal = [null, {}, { parts: [{ k: 'collect', color: 99, need: 5 }] }];
    }, seed);
    assert.ok(base.trace.length >= 3, '시험 판이 몇 수는 진행됐다');
    assert.deepStrictEqual(fallback, base, '시드 ' + seed);
    assert.strictEqual(base.goalHidden, false);
    assert.strictEqual(base.missionHidden, true);
    assert.strictEqual(base.errors, 0);
    assert.ok(base.trace.every((t) => t.endsWith(',null]')), '점수형에서는 미션 상태가 계속 null');
  }
});

test('goalMet: 점수형이면 isCleared(점수, 목표) 와 같다', async () => {
  const env = createEnv(40);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  [0, 4499, 4500, 4501, 99999].forEach((s) => { I.state.score = s; assert.strictEqual(I.goalMet(), G.isCleared(s, I.state.target), String(s)); });
  I.state.target = 0;
  I.state.score = 10;
  assert.strictEqual(I.goalMet(), false, '목표 0 은 달성이 아니다(isCleared 와 같다)');
  env.dispose();
});
