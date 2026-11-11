/* 교육용 최고점 도전 시험 — spec §46.9 (B-E: 일반용의 "최고점 도전" 모드를 교육용에 같은 규칙·같은 점수로 이식).
 * 실행: node --test apps/element-gems-edu/test/*.test.js   (서버·네트워크·브라우저 없음: 가짜 DOM + 가상 시계 + 가짜 fetch)
 *
 * 증명하려는 것
 *  ① CONFIG.challenge·순수 함수 7개가 일반용과 같다(값·본문)
 *  ② 교육용의 도전 판은 ? 선물상자·문제 팝업·학습 조건이 모두 꺼져, 같은 시드·같은 행동의 일반용 도전 판과 보드·점수·시간·게이지·통계·결과 문구·저장이 같다
 *     (선물상자가 잘 나오게 CONFIG.edu 공급을 크게 올려 둔 교육용으로 — 분기가 없으면 곧바로 달라진다. 스테이지 판에서는 같은 설정에서 ? 가 실제로 나오는 대조 시험 포함)
 *  ③ 도전 판 동안 ?·문제·학습 칩이 한 번도 나오지 않고, 도전을 나온 뒤 교육용 스테이지의 선물상자·문제·학습 조건·단원 줄은 그대로다
 *  ④ 저장: challenge 필드 왕복·옛 교육용 저장(필드 없음) 호환·edu 필드 보존·eraseDevice 가 challenge 를 지움
 *  ⑤ 시작 화면 버튼·결과 오버레이·프로필 문구 마크업이 일반용과 같고, [최고점 도전]은 edu.js 의 단원 선택 게이트를 건너뛰되 프로필 안내 게이트에는 "challenge" 를 알린다
 *  ⑥ ranking.js 에 challenge: CONFIG.challenge 가 전달되어 최고점이 제출 본문 s 로 나간다
 *  ⑦ 교육용 소스의 도전 구간이 일반용과 글자 그대로 같고, 차이는 `// [EDU]` 줄뿐이다
 * 시험은 CONFIG 를 시험용 복사본(샌드박스)에서만 바꾼다. 파일·저장소 상태는 건드리지 않는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const GEN_DIR = path.join(root, '..', 'element-gems');          // 일반용: 읽기 전용으로 비교에만 쓴다(없으면 비교 시험은 건너뜀)
const HAS_GEN = fs.existsSync(path.join(GEN_DIR, 'game.js'));
const skipGen = HAS_GEN ? false : '일반용 폴더 없음';
const G = require(path.join(root, 'game.js'));
const GEN = HAS_GEN ? require(path.join(GEN_DIR, 'game.js')) : null;
const R = require(path.join(root, 'ranking.js'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const SRC = read(root, 'game.js');
const HTML = read(root, 'index.html');
const EDU_JS = read(root, 'edu.js');
const GEN_SRC = HAS_GEN ? read(GEN_DIR, 'game.js') : '';
const GEN_HTML = HAS_GEN ? read(GEN_DIR, 'index.html') : '';
const C = G.CONFIG.challenge;

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const plain = (o) => JSON.parse(JSON.stringify(o));                    // 샌드박스(vm) 안에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 거절한다 -> 값만 비교
const dropEdu = (s) => s.split('\n').filter((l) => !/\/\/ \[EDU\]/.test(l)).join('\n');
/** 소스에서 a 로 시작해 b 직전까지 */
function cut(src, a, b) {
  const i = src.indexOf(a); const j = src.indexOf(b, i + 1);
  assert.ok(i >= 0 && j > i, '표지를 찾지 못함: ' + a + ' ~ ' + b);
  return src.slice(i, j);
}
/** 소스에서 head 로 시작하는 함수 한 덩어리를 중괄호 짝으로 잘라 낸다 */
function bodyOf(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let depth = 0; let j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(i, j + 1);
}

/* ===================================================================
 * ① CONFIG.challenge · 순수 함수 — 일반용과 같은 값·같은 본문
 * =================================================================== */
test('① CONFIG.challenge: 일반용과 같은 값·같은 키 순서(중수 기반·120초·구조 등급 0·상한 280,000·제출 지연 300초), 위치는 ranking 앞', { skip: skipGen }, () => {
  assert.deepStrictEqual(C, GEN.CONFIG.challenge);
  assert.strictEqual(JSON.stringify(C), JSON.stringify(GEN.CONFIG.challenge), '키 순서까지');
  assert.deepStrictEqual(C, { base: 'normal', seconds: 120, boardGrade: 0, scoreCap: 280000, submitDelaySec: 300 });
  const keys = Object.keys(G.CONFIG);
  assert.ok(keys.indexOf('challenge') > 0 && keys.indexOf('challenge') === keys.indexOf('ranking') - 1, 'CONFIG.challenge 는 ranking 바로 앞(일반용과 같은 자리)');
  assert.ok(Object.keys(G.CONFIG.edu).indexOf('wild') >= 0, '교육용 공급 설정(CONFIG.edu)은 그대로 있다');
});

test('① 순수 함수 7개(defaultChallenge·parseChallenge·applyChallenge·applyChallengeResult·challengeStartInfo·challengeHudInfo·challengeResultInfo)는 본문이 일반용과 글자 그대로 같고 같은 결과를 낸다', { skip: skipGen }, () => {
  const names = ['defaultChallenge', 'parseChallenge', 'applyChallenge', 'applyChallengeResult', 'challengeStartInfo', 'challengeHudInfo', 'challengeResultInfo'];
  names.forEach((n) => {
    assert.strictEqual(typeof G[n], 'function', n);
    assert.strictEqual(G[n].toString(), GEN[n].toString(), n + ' 본문');
  });
  // 같은 입력 -> 같은 출력
  const a = G.defaultSave(); const b = GEN.defaultSave();
  [0, 9860, 13075, 2480, 13075, 300000.9, NaN, -5, '77'].forEach((s) => assert.deepStrictEqual(plain(G.applyChallengeResult(a, s)), plain(GEN.applyChallengeResult(b, s)), String(s)));
  assert.deepStrictEqual(plain(a.challenge), plain(b.challenge));
  [null, 5, 'x', [], { best: 'a' }, { best: 12340, last: 9000, plays: 4, rule: 1 }, { best: 500, last: 500, plays: 1, rule: 2, bestOld: 9999 }, { best: 280001, rule: 2 }].forEach((c) => {
    assert.deepStrictEqual(plain(G.parseChallenge(c)), plain(GEN.parseChallenge(c)), JSON.stringify(c));
  });
  [[0, 5000], [12340, 8435], [12340, 12340], [12340, 20000]].forEach(([x, y]) => assert.deepStrictEqual(G.challengeHudInfo(x, y), GEN.challengeHudInfo(x, y)));
  [{ score: 9860, prev: 0, best: 9860, newBest: true, first: true }, { score: 9860, prev: 12340, best: 12340, newBest: false, first: false }, { score: 0, prev: 0, best: 0, newBest: false, first: false }].forEach((r) => {
    assert.deepStrictEqual(G.challengeResultInfo(r), GEN.challengeResultInfo(r));
  });
  const sv = G.defaultSave(); sv.progress = { easy: 10, normal: 10, hard: 10 };
  assert.deepStrictEqual(G.challengeStartInfo(sv), GEN.challengeStartInfo(Object.assign(GEN.defaultSave(), { progress: { easy: 10, normal: 10, hard: 10 } })));
  assert.strictEqual(G.challengeStartInfo(sv).state, 'new', '세 난이도를 모두 깨도 "추천" 딱지는 없다(별도 버튼이 없어졌다, spec §46.10)');
  assert.deepStrictEqual(G.challengeStartInfo(G.defaultSave()), GEN.challengeStartInfo(GEN.defaultSave()));
  const rec = G.defaultSave(); rec.challenge.best = 12340; const grec = GEN.defaultSave(); grec.challenge.best = 12340;
  assert.deepStrictEqual(G.challengeStartInfo(rec), GEN.challengeStartInfo(grec));
  assert.strictEqual(G.challengeStartInfo(rec).text, '최고점 도전 모드 · 단계 없이 바로 2분! 내 최고 12,340점');
});

test('① applyChallenge: 교육용 applyDifficulty 위에서도 일반용과 같은 활성 값(중수 값·시계 120초·시간 보너스 0·빛 시간 0)을 만든다', { skip: skipGen }, () => {
  const view = (g) => JSON.stringify([g.CONFIG.level, g.CONFIG.types.map((t) => t.max), g.CONFIG.time, g.CONFIG.timeBonus, g.CONFIG.skills, g.CONFIG.hint, g.CONFIG.scoreMult, g.CONFIG.score]);
  G.applyDifficulty('hard'); GEN.applyDifficulty('hard');
  assert.strictEqual(G.applyChallenge(), 'normal');
  GEN.applyChallenge();
  assert.strictEqual(view(G), view(GEN));
  assert.deepStrictEqual([G.CONFIG.time.start, G.CONFIG.time.max, G.CONFIG.timeBonus[3], G.CONFIG.timeBonus[4], G.CONFIG.timeBonus[5], G.CONFIG.timeBonus.chainExtra, G.CONFIG.skills.light.time], [120, 120, 0, 0, 0, 0, 0]);
  G.applyDifficulty('normal'); GEN.applyDifficulty('normal');
  assert.strictEqual(view(G), view(GEN), '난이도를 되돌려도 같다');
});

/* ===================================================================
 * 가짜 DOM + 가상 시계 하네스 — 교육용('edu')과 일반용('gen') game.js 를 같은 환경에서 그대로 실행한다
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
// 두 소스에 메모리에서만 같은 연결점을 끼운다(파일은 수정하지 않는다). 교육용 game.js 가 이미 만든 __EG_TEST__.internals 는 건드리지 않도록 별도 키(chal)를 쓴다
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.chal = { state: state, save: save, el: el, CONFIG: CONFIG, trySwap: trySwap, onGauge: onGauge, onHint: onHint, handleTap: handleTap, typeGrid: typeGrid, listMoves: listMoves, setGemType: setGemType, pauseGame: pauseGame, resumeGame: resumeGame, finishStage: finishStage, startStage: startStage, startChallenge: startChallenge, leaveChallenge: leaveChallenge, openChallenge: openChallenge, restartStage: restartStage, goHome: goHome, goStages: goStages, renderStart: renderStart, openConfirm: openConfirm, writeSave: writeSave, selectLevel: selectLevel }; }\n";
const scripts = {};
function scriptFor(which) {
  if (!scripts[which]) {
    const src = which === 'edu' ? SRC : GEN_SRC;
    assert.ok(src.indexOf(HOOK_TAIL) !== -1, which + ' game.js 끝부분을 찾지 못함');
    scripts[which] = new vm.Script(src.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: which + '/game.js' });
  }
  return scripts[which];
}

class FakeEl {
  constructor(env, tag) {
    this._env = env;
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.hidden = false; this._text = '';
    this.isFragment = false; this._html = ''; this._attrs = {}; this._cls = new Set(); this._ls = {}; this._q = {}; this._style = {};
    this.disabled = false; this.tabIndex = 0;
    const self = this;
    this.style = { setProperty(k, v) { self._style[k] = String(v); }, removeProperty(k) { delete self._style[k]; }, getPropertyValue(k) { return self._style[k] || ''; } };
    this.dataset = new Proxy({}, { set(t, k, v) { if (k === 'type' && v === 'gift') env.giftSet++; t[k] = v; return true; } });      // ? 선물상자 그림이 한 번이라도 만들어지면 센다
    this.classList = {
      add() { Array.prototype.forEach.call(arguments, (n) => self._cls.add(n)); },
      remove() { Array.prototype.forEach.call(arguments, (n) => self._cls.delete(n)); },
      toggle(n, force) { const on = force === undefined ? !self._cls.has(n) : !!force; if (on) self._cls.add(n); else self._cls.delete(n); return on; },
      contains(n) { return self._cls.has(n); }
    };
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
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
  click() { (this._ls.click || []).slice().forEach((fn) => fn({ target: this, preventDefault() {} })); }
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl(this._env, 'span')); }
  querySelectorAll() { return []; }
  closest() { return null; }
  contains(o) { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  focus() {} blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

const FRAME_MS = 150;
/** which: 'edu' | 'gen'. o.store: 시작 때 들어 있을 localStorage, o.reduce: prefers-reduced-motion(기본 true — 입자가 난수를 쓰지 않는다) */
function createEnv(which, seed, cfgPatch, o) {
  const opt = o || {};
  const env = { errors: [], giftSet: 0, _now: 0, _seq: 0, _q: [], events: [] };
  env.now = () => env._now;
  env.timers = {
    setTimeout(fn, ms) { const id = ++env._seq; env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn }); return id; },
    clearTimeout(id) { const i = env._q.findIndex((x) => x.id === id); if (i >= 0) env._q.splice(i, 1); }
  };
  const ids = {};
  const docLs = {};
  const doc = {
    readyState: 'complete', hidden: false, activeElement: null, documentElement: new FakeEl(env, 'html'),
    getElementById(id) { return ids[id] || (ids[id] = new FakeEl(env, 'div')); },
    createElement(t) { return new FakeEl(env, t); },
    createElementNS(ns, t) { return new FakeEl(env, t); },
    createDocumentFragment() { const f = new FakeEl(env, 'fragment'); f.isFragment = true; return f; },
    addEventListener(t, fn) { (docLs[t] = docLs[t] || []).push(fn); }, removeEventListener() {}
  };
  const store = Object.assign({}, opt.store);
  const reduce = opt.reduce !== false;
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: reduce }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: mulberry(seed || 1), __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), FRAME_MS);
  if (opt.chips) {                                              // 시작 화면 난이도 줄의 네 칸(spec §46.10). index.html 의 .level-btn 네 개를 흉내 낸다(init 보다 먼저 있어야 click 이 이어진다)
    const ls = doc.getElementById('level-select');
    env.chips = ['easy', 'normal', 'hard', 'challenge'].map((lv) => { const c = new FakeEl(env, 'button'); c.dataset.level = lv; c.tabIndex = -1; c.setAttribute('aria-checked', 'false'); return c; });
    ls.querySelectorAll = () => env.chips;
    ls.querySelector = (sel) => { const m = /data-level="(\w+)"/.exec(sel); return m ? env.chips.find((c) => c.dataset.level === m[1]) || null : null; };
  }
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  scriptFor(which).runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store; env.ids = ids;
  env.I = sandbox.__EG_TEST__.chal;
  env.CONFIG = env.I.CONFIG;
  env.host = sandbox.ElementGemsHost;
  if (cfgPatch) cfgPatch(env.CONFIG);
  ['challengeResult', 'stageResult', 'stageStart', 'stageEnd', 'openHall', 'renderStart'].forEach((n) => env.host.on(n, (d) => env.events.push([n, d])));
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
      if (env._now > limit) throw new Error('runUntil: 시간 초과 phase=' + env.I.state.phase + ' locked=' + env.I.state.locked + ' quiz=' + env.I.state.quizActive);
      if (!(await env.step())) throw new Error('runUntil: 남은 타이머 없음');
    }
  };
  env.runFor = async function (ms) {
    const target = env._now + ms;
    while (env._q.length && Math.min.apply(null, env._q.map((x) => x.t)) <= target) await env.step();
    env._now = Math.max(env._now, target);
  };
  env.el = (id) => doc.getElementById(id);
  env.setQuiz = (quiz) => { sandbox.EduQuiz = quiz; return quiz; };
  env.reseed = (s) => { sandbox.__rand = mulberry(s); sandbox.__forced.length = 0; };
  return env;
}

/** EduQuiz 가짜: ready·mode(intensity())를 시험이 정한다. ask() 는 1초 뒤 맞힌 것으로 답한다 */
function makeQuiz(env, o) {
  const opt = o || {};
  const quiz = {
    ready: opt.ready !== false, mode: opt.mode || 'many', asks: 0, cancelled: 0,
    ask() {
      quiz.asks++;
      return new Promise((resolve) => env.timers.setTimeout(() => resolve({ right: true, bonus: G.bonusFor(env.I.state.level) }), 1000));
    },
    unitLabel() { return '시험 단원'; },
    cancel() { quiz.cancelled++; }
  };
  quiz.intensity = function () { return quiz.mode; };
  return quiz;
}

/** 두 앱 공통: 짧은 도전(secs초)·작은 게이지(스킬이 자주 쓰이게). 중수 값이 도전의 기반이라 normal 만 바꾼다 */
const shortChal = (secs) => (cfg) => { cfg.challenge.seconds = secs; cfg.difficulty.normal.max = [4, 4, 4, 4, 4, 4]; };
/** 교육용: ? 선물상자가 아주 잘 나오게(보통·많이 표 모두 칸마다 50%, 보드 위 6개까지, 첫 행동 확정, 6행동마다가 아니라 매 행동 pity·guard) */
const wildHeavy = (cfg) => {
  cfg.edu.wild = { spawn: 0.5, max: 6, guaranteeFirst: true };
  cfg.edu.many.wild = { spawn: 0.5, max: 6, pity: 1, guardGap: 1, guardGapBy: {} };
  cfg.edu.defaultIntensity = 'many';
};
const eduPatch = (secs) => (cfg) => { shortChal(secs)(cfg); wildHeavy(cfg); };

const full = (I) => { const out = []; for (let i = 0; i < 6; i++) if (I.state.gauge[i] >= I.CONFIG.types[i].max) out.push(i); return out; };
const snapOf = (I) => { const st = I.state; return JSON.stringify([I.typeGrid(), st.score, Math.round(st.timeLeft * 1000), st.gauge.slice(), st.stats.maxChain, st.stats.matches, st.stats.skills, st.stats.skillPts, st.stats.maxCombo, st.combo, st.phase]); };

/** 도전 한 판을 봇이 플레이한다(시드 고정, 일반용·교육용에 같은 행동). 행동마다 (보드·점수·시간·게이지·통계·콤보·phase) 문자열을 쌓는다. onStep 은 행동마다 검사 */
async function playChallenge(env, botSeed, maxActions, onStep) {
  const I = env.I; const st = I.state;
  const rng = mulberry(botSeed);
  const trace = [];
  env.host.enterChallenge();
  await env.runUntil(() => st.phase === 'playing', 30000);
  for (let n = 0; n < maxActions && st.phase === 'playing'; n++) {
    await env.runFor(200 + Math.floor(rng() * 700));
    if (st.phase !== 'playing') break;
    if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
    const fl = full(I);
    const roll = rng();
    if (fl.length && roll < 0.6) {
      I.onGauge(fl[Math.floor(rng() * fl.length)]);
      if (st.aim !== null) I.handleTap(Math.floor(rng() * 8), Math.floor(rng() * 8));
    } else if (roll > 0.94) {
      I.onHint();
    } else {
      const moves = I.listMoves(I.typeGrid());
      const m = moves[Math.floor(rng() * moves.length)];
      I.trySwap(m.a, m.b);
    }
    await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000);
    trace.push(snapOf(I));
    if (onStep) onStep(n);
  }
  if (st.phase === 'playing') await env.runUntil(() => st.phase !== 'playing', 400000);     // 남은 시간을 흘려 끝낸다
  await env.runFor(500);
  return trace;
}
/** 끝난 판의 결과 화면·저장·이벤트 요약(두 앱을 비교한다) */
function resultOf(env) {
  const id = (x) => env.el(x).textContent;
  return plain({
    shown: ['chal-end-score', 'chal-end-line', 'chal-end-cheer', 'chal-end-combo', 'chal-end-chain', 'chal-end-skills'].map(id).concat([env.el('chal-end-new').hidden, env.el('overlay-chal-end').hidden, env.el('overlay-end').hidden]),
    saved: env.I.save.challenge, phase: env.I.state.phase, score: env.I.state.score,
    events: env.events.filter((e) => e[0] === 'challengeResult').map((e) => e[1]),
    stageEvents: env.events.filter((e) => /^stage/.test(e[0])).length,
    stageRecords: JSON.stringify([env.I.save.progress, env.I.save.stages, env.I.save.bestByLevel, env.I.save.plays, env.I.save.lastScore, env.I.save.bestChain])
  });
}
/** 교육용 스테이지를 잠깐 해 보고(선물상자·문제·학습 칩이 실제로 나온다) 시작 화면으로 나온다 — 도전이 앞 판의 상태를 물려받지 않는지 보려는 준비 */
async function stagePrelude(env, lv, stage, actions, seed) {
  const I = env.I; const st = I.state;
  I.save.level = lv; I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => st.phase === 'playing', 30000);
  const rng = mulberry(seed);
  for (let n = 0; n < actions && st.phase === 'playing'; n++) {
    await env.runFor(300);
    if (st.phase !== 'playing') break;
    if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
    const moves = I.listMoves(I.typeGrid());
    const m = moves[Math.floor(rng() * moves.length)];
    I.trySwap(m.a, m.b);
    await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000);
  }
}

/* ===================================================================
 * ② 교육용 도전 판 = 일반용 도전 판 (같은 시드·같은 행동)
 * =================================================================== */
test('② 교육용 도전 판(? 공급 50%·문제 준비됨·많이 모드)은 같은 시드·같은 행동의 일반용 도전 판과 보드·점수·시간·게이지·통계·콤보가 행동마다 같고, 결과·저장·이벤트도 같다', { skip: skipGen }, async () => {
  let actions = 0; let maxScore = 0; let usedSkills = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const edu = createEnv('edu', 500 + seed, eduPatch(30));
    const quiz = edu.setQuiz(makeQuiz(edu, { mode: seed % 2 ? 'many' : 'normal' }));
    const gen = createEnv('gen', 500 + seed, shortChal(30));
    const t1 = await playChallenge(edu, 77 + seed, 70);
    const t2 = await playChallenge(gen, 77 + seed, 70);
    assert.ok(t1.length > 8, '봇이 실제로 여러 행동을 했다: ' + t1.length);
    assert.deepStrictEqual(t1, t2, '시드 ' + seed + ': 행동별 (보드·점수·시간·게이지·통계)이 일반용과 다르다');
    assert.deepStrictEqual(resultOf(edu), resultOf(gen), '시드 ' + seed + ': 결과 화면·저장·이벤트');
    assert.strictEqual(edu.I.state.phase, 'over');
    assert.strictEqual(quiz.asks, 0, '문제 팝업이 뜨지 않았다');
    assert.strictEqual(edu.giftSet, 0, '? 선물상자 그림이 한 번도 만들어지지 않았다');
    assert.deepStrictEqual(edu.errors.concat(gen.errors), []);
    actions += t1.length; maxScore = Math.max(maxScore, edu.I.state.score); usedSkills += edu.I.state.stats.skills;
    edu.dispose(); gen.dispose();
  }
  assert.ok(actions > 100, '비교한 행동 수 ' + actions);
  assert.ok(maxScore > 500, '점수가 실제로 났다: ' + maxScore);
  assert.ok(usedSkills > 0, '스킬(물·불·풀·번개·어둠·빛)도 사용됐다');
});

test('② 감소 모션이 아닌 환경(입자 난수 사용)에서도 같다 / 문제를 못 불러온 환경(EduQuiz 없음)에서도 같다', { skip: skipGen }, async () => {
  for (const variant of ['particles', 'noQuiz']) {
    for (let seed = 1; seed <= 3; seed++) {
      const edu = createEnv('edu', 900 + seed, eduPatch(25), { reduce: variant !== 'particles' });
      if (variant === 'particles') edu.setQuiz(makeQuiz(edu));
      const gen = createEnv('gen', 900 + seed, shortChal(25), { reduce: variant !== 'particles' });
      const t1 = await playChallenge(edu, 31 + seed, 50);
      const t2 = await playChallenge(gen, 31 + seed, 50);
      assert.deepStrictEqual(t1, t2, variant + ' 시드 ' + seed);
      assert.deepStrictEqual(resultOf(edu), resultOf(gen), variant + ' 시드 ' + seed + ' 결과');
      assert.strictEqual(edu.giftSet, 0);
      assert.deepStrictEqual(edu.errors.concat(gen.errors), []);
      edu.dispose(); gen.dispose();
    }
  }
});

test('② 앞에 교육용 스테이지(많이 모드·선물상자·문제·학습 칩)를 하고 나온 뒤에도 도전 판은 일반용과 같다(앞 판의 상태가 새지 않는다)', { skip: skipGen }, async () => {
  for (let seed = 1; seed <= 4; seed++) {
    const edu = createEnv('edu', 300 + seed, (cfg) => { eduPatch(30)(cfg); cfg.stages.goalType.normal = 'score'; cfg.stages.targets.normal[1] = 1e9; cfg.difficulty.normal.time = { start: 600, max: 700 }; });
    const quiz = edu.setQuiz(makeQuiz(edu));
    await stagePrelude(edu, 'normal', 2, 6, seed);
    assert.ok(edu.giftSet > 0 && quiz.asks > 0, '준비: 스테이지에서는 ? 와 문제가 실제로 나왔다(' + edu.giftSet + '/' + quiz.asks + ')');
    assert.ok(edu.I.state.edu.learn && edu.el('learn-chip').hidden === false, '준비: 학습 칩이 보였다');
    const gifts0 = edu.giftSet; const asks0 = quiz.asks;
    edu.I.goHome();
    assert.strictEqual(edu.I.state.phase, 'start');
    const gen = createEnv('gen', 300 + seed, shortChal(30));
    edu.reseed(4000 + seed); gen.reseed(4000 + seed);
    edu.CONFIG.difficulty.normal.time = { start: 120, max: 130 };
    const t1 = await playChallenge(edu, 55 + seed, 60);
    const t2 = await playChallenge(gen, 55 + seed, 60);
    assert.ok(t1.length > 8);
    assert.deepStrictEqual(t1, t2, '시드 ' + seed);
    const re = resultOf(edu); const rg = resultOf(gen);
    // 교육용은 앞에서 스테이지를 했으므로 스테이지 기록(진행·plays)이 다르다 -> 도전 결과만 비교한다
    assert.deepStrictEqual(re.shown, rg.shown);
    assert.deepStrictEqual(re.saved, rg.saved);
    assert.deepStrictEqual(re.events, rg.events);
    assert.strictEqual(edu.giftSet, gifts0, '도전 중에는 새 ? 가 만들어지지 않았다');
    assert.strictEqual(quiz.asks, asks0, '도전 중에는 새 문제가 나오지 않았다');
    assert.strictEqual(edu.el('learn-chip').hidden, true, '학습 칩은 도전 동안 숨는다');
    assert.deepStrictEqual(edu.errors.concat(gen.errors), []);
    edu.dispose(); gen.dispose();
  }
});

test('② 대조: 같은 설정의 교육용 "스테이지" 판에서는 ? 와 문제가 실제로 나온다(위 시험이 헛돌지 않는다는 증거)', async () => {
  const edu = createEnv('edu', 77, (cfg) => { eduPatch(30)(cfg); cfg.stages.goalType.normal = 'score'; cfg.stages.targets.normal[0] = 1e9; cfg.difficulty.normal.time = { start: 600, max: 700 }; });
  const quiz = edu.setQuiz(makeQuiz(edu));
  await stagePrelude(edu, 'normal', 1, 8, 5);
  assert.ok(edu.giftSet >= 1, '? 가 만들어졌다: ' + edu.giftSet);
  assert.ok(quiz.asks >= 1 || edu.I.state.edu.since >= 0, '문제 흐름이 켜져 있다');
  assert.ok(edu.I.state.edu.mode === 'many' && edu.I.state.edu.learn, '많이 모드·학습 조건');
  assert.deepStrictEqual(edu.errors, []);
  edu.dispose();
});

/* ===================================================================
 * ③ 도전 판 동안 ?·문제·학습 칩 없음 / 도전을 나온 뒤 교육용 기본 동작 불변
 * =================================================================== */
test('③ 도전 판 상태: 문제 양 보통·학습 조건 없음·정령 없음·학습 칩·단원 줄 숨김, 문제는 준비되지 않은 것으로 본다(quizReady)', async () => {
  const env = createEnv('edu', 11, eduPatch(30));
  const quiz = env.setQuiz(makeQuiz(env));
  env.el('pause-unit').textContent = '이전 단원'; env.el('pause-unit').hidden = false;
  env.el('count-unit').textContent = '이전 단원'; env.el('count-unit').hidden = false;
  env.el('learn-chip').hidden = false;                                  // 앞 판에서 남은 칩
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.phase, 'countdown');
  assert.strictEqual(env.el('count-unit').hidden, true, '카운트다운에 학습 단원 줄이 없다');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  const S = env.I.state;
  assert.deepStrictEqual(plain(S.challenge), { prevBest: 0 });
  assert.strictEqual(S.edu.mode, 'normal');
  assert.strictEqual(S.edu.learn, null);
  assert.strictEqual(S.spirit, null);
  assert.strictEqual(S.mission, null);
  assert.strictEqual(S.target, 0);
  assert.strictEqual(env.el('learn-chip').hidden, true);
  assert.strictEqual(env.el('screen-game').dataset.learn, undefined);
  assert.strictEqual(env.el('pause-unit').hidden, true);
  assert.strictEqual(env.el('pause-unit').textContent, '');
  assert.strictEqual(env.el('level-chip').textContent, '도전');
  assert.strictEqual(env.el('pause-level').textContent, '최고점 도전 · 2분 동안 점수를 모아요');
  assert.strictEqual(env.sandbox.ElementGemsEdu.eduMode === undefined, false);
  assert.strictEqual(env.sandbox.ElementGemsEdu.learn(), null);
  assert.strictEqual(quiz.ready, true, 'EduQuiz 자체는 준비된 채다(문제를 못 불러온 것이 아니라 도전 판이 쓰지 않을 뿐)');
  // 보드에 ? 가 없고, 판이 끝날 때까지 새로 생기지 않는다
  const hasWild = () => env.I.typeGrid().some((row) => row.some((t) => t === G.WILD));
  assert.strictEqual(hasWild(), false);
  env.dispose();
});

test('③ 많이 모드(많은 ? 공급·pity·guard)의 여러 시드·행동: 도전 판 동안 ? 가 보드에 한 번도 없고, 문제가 나오지 않으며, 문제 중 표시(quizActive)가 켜지지 않는다', async () => {
  let checked = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const env = createEnv('edu', 200 + seed, (cfg) => { eduPatch(40)(cfg); cfg.difficulty.normal.max = [3, 3, 3, 3, 3, 3]; });
    const quiz = env.setQuiz(makeQuiz(env, { mode: 'many' }));
    await playChallenge(env, 11 + seed, 90, () => {
      checked++;
      const flat = [].concat.apply([], env.I.typeGrid());
      assert.ok(flat.every((t) => t >= 0 && t < G.WILD), '시드 ' + seed + ': ? 가 보드에 있다');
      assert.strictEqual(env.I.state.quizActive, false);
      assert.strictEqual(env.I.state.edu.asked, 0);
    });
    assert.strictEqual(quiz.asks, 0);
    assert.strictEqual(env.giftSet, 0);
    assert.strictEqual(env.I.state.edu.learn, null);
    assert.strictEqual(env.el('overlay-chal-end').hidden, false, '판이 끝났다');
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
  assert.ok(checked > 100, '검사한 행동 수 ' + checked);
});

test('③ 도전 중 일시정지 → [나가기]: 그 판은 기록하지 않고 시작 화면으로 돌아오며, 교육용 학습 단원 줄·문제 흐름이 되살아난다', async () => {
  const env = createEnv('edu', 12, (cfg) => { eduPatch(30)(cfg); cfg.stages.goalType.normal = 'score'; cfg.stages.targets.normal[0] = 1e9; cfg.difficulty.normal.time = { start: 600, max: 700 }; });
  const quiz = env.setQuiz(makeQuiz(env));
  env.host.enterChallenge();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  await env.runFor(1500);
  env.I.pauseGame();
  assert.strictEqual(env.I.state.phase, 'paused');
  env.el('btn-quit').click();
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.I.state.challenge, null);
  assert.deepStrictEqual(plain(env.I.save.challenge), { best: 0, last: 0, plays: 0, rule: 2 }, '중간에 나간 판은 기록하지 않는다');
  assert.strictEqual(env.el('screen-start').hidden, false);
  assert.strictEqual(env.events.filter((e) => e[0] === 'challengeResult').length, 0);
  // 곧바로 교육용 스테이지: 선물상자·문제·학습 칩·단원 줄이 그대로다
  await stagePrelude(env, 'normal', 1, 8, 9);
  assert.ok(env.giftSet >= 1, '스테이지에서는 ? 가 나온다');
  assert.strictEqual(env.I.state.edu.mode, 'many');
  assert.deepStrictEqual(plain(env.I.state.edu.learn), { need: G.learnNeed('normal', 1) });
  assert.strictEqual(env.el('learn-chip').hidden, false);
  assert.strictEqual(env.el('pause-unit').textContent, '시험 단원');
  assert.strictEqual(env.el('pause-unit').hidden, false);
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageStart').length, 1, '스테이지 시작 이벤트(edu.js 가 쓴다)는 스테이지에서만');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('③ 도전 후 교육용 스테이지의 문제 흐름이 그대로다: ? 를 지우는 스왑에서 문제가 한 번 나오고 정답 보너스가 점수에 더해진다', async () => {
  const env = createEnv('edu', 13, (cfg) => { eduPatch(30)(cfg); cfg.edu.wild.spawn = 0.0000001; cfg.edu.many.wild.spawn = 0.0000001; cfg.edu.wild.guaranteeFirst = false; cfg.edu.many.wild.pity = 0; cfg.stages.goalType.normal = 'score'; cfg.stages.targets.normal[0] = 1e9; cfg.difficulty.normal.time = { start: 600, max: 700 }; });
  const quiz = env.setQuiz(makeQuiz(env, { mode: 'normal' }));
  env.host.enterChallenge();                                           // 한 번 도전하고
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.finishStage();
  env.el('btn-chal-home').click();
  assert.strictEqual(env.I.state.phase, 'start');
  env.I.save.level = 'normal'; env.I.save.progress.normal = 9;
  env.I.startStage(1);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  const P = []; for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); P.push(row); }
  P[3][3] = G.WILD; P[3][0] = 0; P[3][1] = 0; P[3][2] = 1; P[2][2] = 3; P[4][2] = 4; P[2][3] = 2; P[4][3] = 3;      // (3,2)<->(3,3) 교환이 ? 를 지운다(A A X ?)
  assert.strictEqual(G.findMatches(P).length, 0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], P[r][c]);
  const before = env.I.state.score;
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.runUntil(() => !env.I.state.locked, 120000);
  await env.runFor(400);
  assert.strictEqual(quiz.asks, 1, '문제 한 개');
  assert.strictEqual(env.I.state.edu.asked, 1);
  assert.strictEqual(env.I.state.edu.right, 1);
  assert.strictEqual(env.I.state.edu.bonus, G.bonusFor('normal'));
  assert.ok(env.I.state.score >= before + G.bonusFor('normal'), '정답 보너스가 점수에 들어갔다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('③ 도전 결과 화면의 [다시 도전]·[돌아가기]·[명예의 전당 보기]: 교육용에서도 같은 흐름(새 도전 / 시작 화면 / openHall 이벤트)이고 스테이지 기록은 그대로다', async () => {
  const env = createEnv('edu', 14, eduPatch(30));
  env.setQuiz(makeQuiz(env));
  env.I.save.progress.normal = 3; env.I.save.plays = 5; env.I.save.lastScore = 777;
  const stageBefore = JSON.stringify([env.I.save.progress, env.I.save.stages, env.I.save.bestByLevel, env.I.save.plays, env.I.save.lastScore, env.I.save.bestChain]);
  env.I.selectLevel('challenge');                                       // 시작 화면 난이도 줄의 4번째 칸(spec §46.10)
  env.host.enterChallenge();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.state.score = 4321; env.I.state.shown = 4321;
  env.I.finishStage();
  assert.strictEqual(env.I.state.phase, 'over');
  assert.strictEqual(env.el('overlay-chal-end').hidden, false);
  assert.strictEqual(env.el('overlay-end').hidden, true, '스테이지 결과 화면은 뜨지 않는다');
  assert.strictEqual(env.el('chal-end-line').textContent, '첫 기록이에요! 내 최고 점수로 저장했어요.');
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageResult' || e[0] === 'stageEnd').length, 0, 'stageResult·stageEnd 는 스테이지만');
  env.el('btn-chal-again').click();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.strictEqual(env.I.state.score, 0);
  assert.deepStrictEqual(plain(env.I.state.challenge), { prevBest: 4321 });
  env.I.state.score = 100; env.I.finishStage();
  assert.strictEqual(env.el('chal-end-line').textContent, '내 최고 4,321 · 4,221점 남았어요');
  env.el('btn-chal-hall').click();
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.events.filter((e) => e[0] === 'openHall').length, 1);
  assert.strictEqual(env.I.state.startChoice, 'challenge', '돌아와도 4번째 칸이 켜져 있다');
  assert.strictEqual(env.el('level-desc').textContent, '최고점 도전 모드 · 단계 없이 바로 2분! 내 최고 4,321점');
  assert.strictEqual(env.el('btn-start').textContent, '도전 시작');
  assert.strictEqual(JSON.stringify([env.I.save.progress, env.I.save.stages, env.I.save.bestByLevel, env.I.save.plays, env.I.save.lastScore, env.I.save.bestChain]), stageBefore, '스테이지 기록 불변');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('③ 열려 있는 문제 팝업이 있던 상태에서 도전을 시작해도 문제 상태가 정리된다(eduAbortQuiz)', async () => {
  const env = createEnv('edu', 15, eduPatch(30));
  const quiz = env.setQuiz(makeQuiz(env));
  env.I.state.quizActive = true;                                        // 문제 중이던 상태가 남아 있다고 하자
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.quizActive, false);
  assert.strictEqual(quiz.cancelled, 1, 'EduQuiz.cancel() 이 불렸다');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.dispose();
});

/* ===================================================================
 * ④ 저장
 * =================================================================== */
test('④ 저장: defaultSave 에 challenge 가 있고(edu 필드 앞), 옛 교육용 저장(challenge 없음)은 기본값으로 읽히며 edu 필드·진행은 그대로다', () => {
  const sv = G.defaultSave();
  assert.deepStrictEqual(plain(sv.challenge), { best: 0, last: 0, plays: 0, rule: 2 });
  assert.deepStrictEqual(sv.edu, {});
  const keys = Object.keys(sv);
  assert.ok(keys.indexOf('challenge') > keys.indexOf('scoreRule') && keys.indexOf('challenge') < keys.indexOf('edu'), '키 순서: scoreRule, challenge, edu');
  const old = { level: 'easy', progress: { easy: 4, normal: 0, hard: 0 }, scoreRule: 2, edu: { unit: 'soc-3-2-1-1', intensity: 'normal', stats: { a: 1 } } };
  const p = G.parseSave(JSON.stringify(old));
  assert.deepStrictEqual(plain(p.challenge), { best: 0, last: 0, plays: 0, rule: 2 });
  assert.strictEqual(p.progress.easy, 4);
  assert.deepStrictEqual(plain(p.edu), old.edu, 'edu 필드(학습단원·풀이 기록)는 그대로');
  const ok = G.parseSave(JSON.stringify(Object.assign({}, old, { challenge: { best: 12340, last: 9860, plays: 7, rule: 2 } })));
  assert.deepStrictEqual(plain(ok.challenge), { best: 12340, last: 9860, plays: 7, rule: 2 });
  [null, 5, 'x', [], { best: 'a' }, { best: -1, last: 1.5, plays: -3, rule: 2 }, { best: 280001, last: 99999999, plays: 1e12, rule: 2 }].forEach((c) => {
    assert.deepStrictEqual(plain(G.parseSave(JSON.stringify(Object.assign({}, old, { challenge: c }))).challenge), { best: 0, last: 0, plays: 0, rule: 2 }, JSON.stringify(c));
  });
  assert.deepStrictEqual(plain(G.parseSave(JSON.stringify(Object.assign({}, old, { challenge: { best: 12340, last: 9000, plays: 4, rule: 1 } }))).challenge), { best: 0, last: 0, plays: 4, rule: 2, bestOld: 12340 }, '점수 규칙 표식이 다르면 bestOld 로');
});

test('④ 저장 왕복(실제 판): 도전 결과가 교육용 키 element-gems-edu:v1 에만 들어가고, 일반용 키는 건드리지 않으며, edu 필드·스테이지 기록은 그대로다', async () => {
  const eduField = { unit: 'soc-3-2-1-1', intensity: 'many', stats: { x: [1, 2, 3] } };
  const env = createEnv('edu', 16, eduPatch(30), { store: { 'element-gems-edu:v1': JSON.stringify({ scoreRule: 2, level: 'hard', progress: { easy: 2, normal: 0, hard: 0 }, edu: eduField }), 'element-gems:v1': '{"untouched":true}' } });
  env.setQuiz(makeQuiz(env));
  assert.strictEqual(env.I.save.level, 'hard');
  env.host.enterChallenge();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.state.score = 5432; env.I.state.shown = 5432;
  env.I.finishStage();
  const stored = JSON.parse(env.store['element-gems-edu:v1']);
  assert.deepStrictEqual(stored.challenge, { best: 5432, last: 5432, plays: 1, rule: 2 });
  assert.deepStrictEqual(stored.edu, eduField);
  assert.strictEqual(stored.level, 'hard');
  assert.deepStrictEqual(stored.progress, { easy: 2, normal: 0, hard: 0 });
  assert.strictEqual(stored.plays, 0, '도전은 plays 를 올리지 않는다');
  assert.strictEqual(env.store['element-gems:v1'], '{"untouched":true}', '일반용 키는 건드리지 않는다');
  assert.deepStrictEqual(plain(G.parseSave(env.store['element-gems-edu:v1']).challenge), stored.challenge, '다시 읽어도 같다');
  assert.strictEqual(env.CONFIG.time.start, 100, '활성 값이 고른 난이도(고수) 값으로 돌아왔다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 반대 방향: 교육용 스테이지 판(클리어·실패)을 끝까지 해도 저장의 challenge 필드는 글자 그대로 남는다 (spirit 시험의 저장 비교는 challenge 한 필드를 정규식으로 빼므로 그 필드는 여기서 따로 지킨다)', async () => {
  const env = createEnv('edu', 31, eduPatch(30));
  env.setQuiz(makeQuiz(env, { mode: 'normal' }));
  env.I.save.challenge = { best: 12340, last: 9860, plays: 4, rule: 2, bestOld: 777 };
  const before = JSON.stringify(env.I.save.challenge);
  const persisted = () => JSON.stringify(JSON.parse(env.store['element-gems-edu:v1']).challenge);
  env.I.save.level = 'easy'; env.I.save.progress.easy = 9;
  env.I.startStage(1);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.state.score = 999999;                                  // 초보 1단계는 점수 목표 -> 클리어
  env.I.finishStage();
  assert.strictEqual(env.I.state.phase, 'over');
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageResult').pop()[1].cleared, true, '클리어 경로');
  assert.strictEqual(JSON.stringify(env.I.save.challenge), before, '클리어 뒤 메모리의 challenge');
  assert.strictEqual(persisted(), before, '클리어 뒤 저장된 challenge');
  env.I.save.level = 'normal'; env.I.save.progress.normal = 9;
  env.I.startStage(1);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.finishStage();                                         // 시간 안에 미션을 못 끝낸 판 -> 실패
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageResult').pop()[1].cleared, false, '실패 경로');
  assert.strictEqual(JSON.stringify(env.I.save.challenge), before, '실패 뒤 메모리의 challenge');
  assert.strictEqual(persisted(), before, '실패 뒤 저장된 challenge');
  assert.strictEqual(env.I.save.plays, 2, '스테이지 판 두 번은 plays 를 2 올렸다(도전 횟수는 따로)');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 지우기: 교육용 wipeSaveRaw·eraseDevice 가 challenge 를 지우고(설정 3개만 남김), "기록 있음" 판정은 최고점만 있는 교육용 기기도 본다', async () => {
  const raw = JSON.stringify({ muted: true, cutin: false, tutorialSeen: true, challenge: { best: 12340, last: 1, plays: 2, rule: 2 }, edu: { stats: { a: 1 } }, stages: { easy: [{ stars: 3 }] } });
  const wiped = JSON.parse(R.wipeSaveRaw(raw));
  assert.ok(!('challenge' in wiped) && !('edu' in wiped) && !('stages' in wiped));
  assert.deepStrictEqual(wiped, { muted: true, cutin: false, tutorialSeen: true });
  assert.strictEqual(R.bestOfSave(JSON.parse(raw)), 12340);
  assert.strictEqual(R.deviceBest({ get: (k) => (k === 'element-gems-edu:v1' ? raw : null) }), 12340, '교육용 키의 최고점을 본다');
  const UUID = '123e4567-e89b-42d3-a456-426614174000';
  const mem = { 'element-gems-edu:v1': raw, 'element-gems:profile:v1': JSON.stringify({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }) };
  const store = { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } };
  const calls = [];
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/', timeoutMs: 8000 }), challenge: G.CONFIG.challenge, store,
    fetch: async (url, init) => { calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null }); return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ ok: true, v: 1, me: { pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 }, score: 12340 }, changed: true, nickChangesLeft: 2 }) }; },
    getSave: () => G.parseSave(mem['element-gems-edu:v1']), stageCount: 10, caps: { easy: 150, normal: 140, hard: 120 }, emit: () => {}, crypto: { randomUUID: () => UUID }
  });
  assert.strictEqual(client.createMode().best, 12340);
  const r = await client.eraseDevice();
  assert.strictEqual(r.ok, true);
  const after = JSON.parse(mem['element-gems-edu:v1']);
  assert.ok(!('challenge' in after), '도전 기록이 지워졌다');
  assert.ok(!calls.some((c) => /\/api\/delete/.test(c.url)), '서버 삭제 호출 없음(이 기기에서만 지움)');
  assert.strictEqual(R.deviceBest(store), 0);
  assert.strictEqual(G.parseSave(mem['element-gems-edu:v1']).challenge.best, 0, '다시 읽어도 0');
});

/* ===================================================================
 * ⑤-2 난이도 줄 4번째 칸(spec §46.10) · 시작 화면에서 [도전 시작]을 누를 때의 배경 이동 — 일반용 challenge.test.js 와 같은 단언
 * =================================================================== */
test('⑤ 난이도 줄 4번째 칸: 고르면 설명 줄·[도전 시작]·aria-checked 가 바뀌고 저장은 건드리지 않으며(세 난이도는 지금처럼 저장), 새로고침하면 마지막 난이도, 키보드가 4칸을 순환한다', () => {
  const LEAD = '최고점 도전 모드 · 단계 없이 바로 2분! ';
  const env = createEnv('edu', 19, null, { chips: true });
  const [easy, normal, hard, chal] = env.chips;
  const on = () => env.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level);
  assert.deepStrictEqual(on(), ['normal'], '처음: 중수');
  assert.deepStrictEqual(env.chips.map((c) => c.getAttribute('aria-checked')), ['false', 'true', 'false', 'false']);
  assert.deepStrictEqual(env.chips.map((c) => c.tabIndex), [-1, 0, -1, -1], 'roving tabindex: 켜진 칸만 0');
  assert.strictEqual(env.el('btn-start').textContent, '시작');
  assert.strictEqual(env.el('level-desc').textContent, env.CONFIG.difficulty.normal.desc);
  const before = JSON.stringify(env.store);
  chal.click();
  assert.strictEqual(env.I.state.startChoice, 'challenge');
  assert.deepStrictEqual(on(), ['challenge']);
  assert.deepStrictEqual(env.chips.map((c) => c.getAttribute('aria-checked')), ['false', 'false', 'false', 'true']);
  assert.deepStrictEqual(env.chips.map((c) => c.tabIndex), [-1, -1, -1, 0]);
  assert.strictEqual(env.el('level-desc').textContent, LEAD + '아직 기록이 없어요');
  assert.strictEqual(env.el('btn-start').textContent, '도전 시작');
  assert.strictEqual(env.el('btn-start').classList.contains('is-chal'), true);
  assert.strictEqual(env.I.save.level, 'normal', '4번째 칸은 save.level 을 바꾸지 않는다');
  assert.strictEqual(JSON.stringify(env.store), before, '4번째 칸은 저장도 하지 않는다(새로고침하면 마지막 난이도)');
  env.I.save.challenge.best = 12340;
  env.I.renderStart();
  assert.strictEqual(env.el('level-desc').textContent, LEAD + '내 최고 12,340점');
  assert.deepStrictEqual(env.el('level-desc').children.map((c) => [c.tagName, c.textContent]), [['B', '12,340점']], '점수만 굵게(b)');
  hard.click();
  assert.strictEqual(env.I.save.level, 'hard');
  assert.strictEqual(JSON.parse(env.store['element-gems-edu:v1']).level, 'hard', '세 난이도는 교육용 저장 키에 저장한다');
  assert.strictEqual(env.el('btn-start').textContent, '시작');
  assert.strictEqual(env.el('btn-start').classList.contains('is-chal'), false);
  assert.strictEqual(env.el('level-desc').textContent, env.CONFIG.difficulty.hard.desc);
  chal.click();
  const again = createEnv('edu', 19, null, { chips: true, store: env.store });
  assert.deepStrictEqual(again.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level), ['hard'], '새로고침하면 마지막 난이도');
  // 키보드
  const key = (k) => { let prevented = false; (again.el('level-select')._ls.keydown || []).forEach((fn) => fn({ key: k, preventDefault() { prevented = true; } })); return prevented; };
  const cur = () => again.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level)[0];
  assert.strictEqual(key('ArrowRight'), true);
  assert.strictEqual(cur(), 'challenge');
  assert.strictEqual(again.chips[3].tabIndex, 0);
  key('ArrowRight'); assert.strictEqual(cur(), 'easy', '끝에서 처음으로');
  key('ArrowLeft'); assert.strictEqual(cur(), 'challenge', '처음에서 끝으로');
  key('ArrowUp'); assert.strictEqual(cur(), 'hard');
  assert.strictEqual(key('Enter'), false);
  assert.strictEqual(again.I.save.level, 'hard');
  env.dispose(); again.dispose();
});

test('⑤ 4번째 칸이 켜진 [도전 시작]은 단원 선택 게이트를 건너뛰고 도전으로, 돌아오면 4번째 칸이 그대로이며, [시작]은 지금처럼 레벨 선택으로 간다', async () => {
  const env = createEnv('edu', 25, eduPatch(30), { chips: true });
  const asked = []; let allow = false;
  env.host.setStartGate((kind) => { asked.push(kind); return allow; });
  env.chips[3].click();
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge']);
  assert.strictEqual(env.I.state.phase, 'start');
  allow = true;
  env.el('btn-start').click();
  assert.strictEqual(env.I.state.phase, 'countdown');
  assert.ok(env.I.state.challenge);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.leaveChallenge();
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.chips[3].classList.contains('on'), true, '돌아와도 4번째 칸이 켜져 있다');
  env.chips[1].click();
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge', 'challenge', undefined], '[시작]의 게이트는 인자 없이 그대로');
  assert.strictEqual(env.I.state.phase, 'stages');
  assert.strictEqual(env.I.state.challenge, null);
  env.dispose();
});

test('⑤ 시작 화면에서 [도전 시작]을 누르면 <html data-chal-intro> 가 잠깐 켜져 배경이 아래로 부드럽게 내려가고(CONFIG.anim.camIntroMs 뒤 걷힘), [다시 도전]·움직임 줄이기에서는 켜지지 않는다', async () => {
  const env = createEnv('edu', 26, eduPatch(30), { reduce: false });
  const html = env.doc.documentElement;
  const ms = env.CONFIG.anim.camIntroMs;
  assert.strictEqual(ms, 1000);
  env.host.enterChallenge();
  await env.runUntil(() => env.el('overlay-count').hidden === false, 30000);
  assert.strictEqual(env.el('screen-start').hidden, true);
  assert.strictEqual(html.getAttribute('data-chal-intro'), '');
  await env.runFor(ms - 50);
  assert.strictEqual(html.getAttribute('data-chal-intro'), '');
  await env.runFor(100);
  assert.strictEqual(html.getAttribute('data-chal-intro'), null, '약 1초 뒤 걷힌다');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.state.score = 100; env.I.finishStage();
  env.el('btn-chal-again').click();
  await env.runUntil(() => env.el('overlay-count').hidden === false, 30000);
  assert.strictEqual(html.getAttribute('data-chal-intro'), null, '시작 화면에서 들어온 것이 아니면 켜지 않는다');
  env.dispose();
  const still = createEnv('edu', 27, eduPatch(30));
  still.host.enterChallenge();
  await still.runUntil(() => still.el('overlay-count').hidden === false, 30000);
  assert.strictEqual(still.doc.documentElement.getAttribute('data-chal-intro'), null, '움직임 줄이기면 속성을 달지 않는다');
  still.dispose();
});

/* ===================================================================
 * ⑤ 마크업 · edu.js 게이트
 * =================================================================== */
test('⑤ index.html: 시작 화면 버튼·규칙 줄·결과 오버레이·순위표 문구·프로필 문구가 일반용과 글자 그대로 같고, 교육용 마크업(단원 카드·선물상자 규칙 줄)은 그대로 있다', { skip: skipGen }, () => {
  const chip = (h) => cut(h, '<!-- 최고점 도전 모드 (spec §46.10)', '</button>');
  assert.strictEqual(chip(HTML), chip(GEN_HTML), '난이도 줄 4번째 칸 마크업');
  const level = (h) => cut(h, '<div id="level-select"', '<button id="btn-hall"');
  assert.strictEqual(level(HTML), level(GEN_HTML), '난이도 줄·설명·[시작] 묶음');
  const rule = (h) => cut(h, '<li class="rule-chal">', '</li>');
  assert.strictEqual(rule(HTML), rule(GEN_HTML));
  const ov = (h) => cut(h, '<!-- 최고점 도전 결과 (spec §46)', '<!-- 프로필 안내 팝업');
  assert.strictEqual(ov(HTML), ov(GEN_HTML), '결과 오버레이');
  const prof = (h) => cut(h, '<section id="screen-profile"', '<section id="screen-hall"');
  assert.strictEqual(prof(HTML), prof(GEN_HTML), '프로필 화면');
  const hall = (h) => cut(h, '<div class="hf-meta">', '</p>\n    </div>\n  </section>');
  assert.strictEqual(hall(HTML), hall(GEN_HTML), '명예의 전당 규칙·안내 문구');
  // 위치: 난이도 줄의 4번째 radio(고수 다음), 별도 [최고점 도전] 버튼은 없다
  const radios = cut(HTML, '<div id="level-select"', '</div>').match(/data-level="(\w+)"/g).map((x) => /"(\w+)"/.exec(x)[1]);
  assert.deepStrictEqual(radios, ['easy', 'normal', 'hard', 'challenge']);
  ['btn-challenge', 'chal-sub', 'chal-badge', 'chal-btn', '추천'].forEach((w) => assert.ok(HTML.indexOf(w) === -1, '별도 버튼의 흔적이 없다: ' + w));
  assert.ok(/class="sc-cta">\s*<div id="level-select"[\s\S]*?id="btn-start"[^>]*>시작<\/button>\s*<\/div>\s*<button id="btn-hall"/.test(HTML), '난이도·설명·[시작]이 .sc-cta 묶음 안');
  // 교육용 요소는 그대로
  ['eg-unit-card', 'eg-unit-btn', 'rule-learn', 'learn-chip', 'eg-quiz', 'screen-edu-pick', 'pause-unit', 'count-unit', 'end-quiz'].forEach((id) => assert.ok(HTML.includes('id="' + id + '"'), id));
  assert.strictEqual((HTML.match(/<div\b/g) || []).length, (HTML.match(/<\/div>/g) || []).length, 'div 여닫음');
  // 프로필 화면에 최고점 공개 문구가 들어 있다(어린이 대상: 정확히 알린다)
  assert.ok(HTML.includes('명예의 전당에는 <b>닉네임·그림·별 수·최고점·순위</b>만 모두에게 보여요.'));
  assert.ok(HTML.includes('닉네임·그림·별 수·최고점은 순위표를 보여 주려고 서버에 저장돼요.'));
  assert.ok(!HTML.includes('닉네임·그림·별 수·순위</b>만') && !HTML.includes('닉네임·그림·별 수는 순위표'), '옛 문구는 남아 있지 않다');
});

test('⑤ 도전 화면이 쓰는 id 12개가 모두 index.html 에 있고(캐시된 옛 HTML 과의 혼용을 위한 있을 때만 연결은 game.js 가 한다), 일반용과 같은 id 목록이다', { skip: skipGen }, () => {
  const ids = ['overlay-chal-end', 'chal-end-score', 'chal-end-new', 'chal-end-line', 'chal-end-cheer', 'chal-end-combo', 'chal-end-chain', 'chal-end-skills', 'chal-end-rank', 'btn-chal-again', 'btn-chal-hall', 'btn-chal-home'];
  ids.forEach((id) => { assert.ok(HTML.includes('id="' + id + '"'), id); assert.ok(GEN_HTML.includes('id="' + id + '"'), '일반용 ' + id); });
  const line = cut(SRC, "'overlay-chal-end', 'chal-end-score'", "].forEach(function (id) { el[id] = $(id); });");
  const genLine = cut(GEN_SRC, "'overlay-chal-end', 'chal-end-score'", "].forEach(function (id) { el[id] = $(id); });");
  assert.strictEqual(line, genLine, 'cacheDom 의 도전 id 목록');
  ids.forEach((id) => assert.ok(line.indexOf("'" + id + "'") !== -1, 'cacheDom ' + id));
});

test('⑤ ElementGemsHost: CONFIG.challenge 와 enterChallenge 를 내보낸다(ranking-ui.js 가 읽는다) / 4번째 칸을 고른 [도전 시작]이 게이트에 "challenge" 를 알리고, [시작]은 인자 없이 부른다', async () => {
  const env = createEnv('edu', 17, eduPatch(30));
  assert.strictEqual(typeof env.host.enterChallenge, 'function');
  assert.strictEqual(env.host.CONFIG.challenge, env.CONFIG.challenge, 'host.CONFIG 는 게임이 쓰는 CONFIG 그 객체');
  assert.deepStrictEqual(Object.keys(env.host.CONFIG.challenge), Object.keys(C));
  const asked = []; let allow = false;
  env.host.setStartGate((kind) => { asked.push(kind); return allow; });
  env.I.selectLevel('challenge');
  env.el('btn-start').click();                                          // [도전 시작]
  assert.deepStrictEqual(asked, ['challenge']);
  assert.strictEqual(env.I.state.phase, 'start', '게이트가 false 면 멈춘다');
  env.I.selectLevel('normal');
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge', undefined], '[시작]의 게이트 호출은 인자 없이 그대로');
  allow = true;
  env.I.selectLevel('challenge');
  env.el('btn-start').click();
  assert.strictEqual(env.I.state.phase, 'countdown');
  assert.ok(env.I.state.challenge);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  const keep = env.I.state.gameId;
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.gameId, keep, '게임 중 enterChallenge 는 무시');
  env.dispose();
});

/** edu.js 의 브라우저 부분을 가짜 DOM 에서 실행한다 — 시작 게이트 이어 붙이기(installGate)와 단원 선택 게이트를 시험한다 */
function eduJsEnv(o) {
  const opt = o || {};
  const KEY = 'element-gems-edu:v1';
  const store = {};
  if (opt.save) store[KEY] = opt.save;
  const env = { giftSet: 0 };
  const ids = {};
  const mk = (id) => (ids[id] = new FakeEl(env, 'div'));
  const doc = {
    readyState: 'complete', activeElement: null, body: { contains: () => true },
    getElementById(id) { return ids[id] || mk(id); },
    createElement(t) { return new FakeEl(env, t); }, createTextNode(t) { const e = new FakeEl(env, '#text'); e.textContent = t; return e; },
    querySelectorAll() { return []; }, addEventListener() {}, head: new FakeEl(env, 'head')
  };
  const grp = mk('eg-amount');
  ['normal', 'many'].forEach((v) => { const b = mk('eg-amt-' + v); b._cls.add('eg-amt'); b.dataset.v = v; b.setAttribute('role', 'radio'); b.parentNode = grp; grp.children.push(b); });
  const handlers = {}; const inner = []; let installed = null;
  const save = { level: 'normal', edu: {} };
  const sandbox = {
    console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    sessionStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }), scrollTo() {}, location: { protocol: 'http:' },
    setTimeout() { return 1; }, clearTimeout() {}, document: doc, addEventListener() {},
    EDU_CATALOG: { subjects: [{ id: 'soc', name: '사회', grades: [{ grade: 3, terms: [{ term: 2, ready: true, units: [{ no: 1, name: '단원', subs: [{ no: 1, id: 'soc-3-2-1-1', name: '소단원', count: 1, file: 'edu-data/q/soc-3-2-1-1.js' }] }] }] }] }] },
    EDU_Q: { 'soc-3-2-1-1': { items: [{ n: 1, t: 'ox', q: '문제', f: 'F1', e: '해설', a: 1 }] } }
  };
  sandbox.window = sandbox;
  sandbox.ElementGemsHost = {
    CONFIG: { edu: { storageKey: KEY, defaultIntensity: 'many', bonus: { base: 900, mult: { easy: 0.8, normal: 1, hard: 1.3 } } } },
    on(name, fn) { handlers[name] = fn; }, getSave() { return save; }, writeSave() { store[KEY] = JSON.stringify(save); },
    goHome() {}, getPhase() { return 'start'; },
    setStartGate(fn) { installed = fn; }                                  // game.js 의 슬롯 하나: edu.js 가 이어 붙인 함수가 여기로 들어온다
  };
  sandbox.ElementGemsEdu = { refreshStages() {}, state() { return { level: 'normal' }; }, bonusFor() { return 900; } };
  vm.createContext(sandbox);
  new vm.Script(EDU_JS, { filename: 'edu.js' }).runInContext(sandbox);
  assert.strictEqual(typeof installed, 'function', 'edu.js 가 시작 게이트를 설치했다');
  // ranking-ui.js 처럼 edu.js 가 바꿔 둔 host.setStartGate 로 자기 게이트(inner)를 건다
  sandbox.ElementGemsHost.setStartGate(function (kind) { inner.push(kind); return opt.innerResult === undefined ? true : opt.innerResult; });
  handlers.init();
  return { gate: installed, inner, ids, sandbox, store };
}

test('⑤ edu.js 시작 게이트: [시작]은 단원을 안 골랐으면 선택 화면을 먼저 열고(멈춤), [최고점 도전]은 단원 선택을 건너뛰고 프로필 안내 게이트에 "challenge" 를 넘긴다', () => {
  const t = eduJsEnv({});
  assert.strictEqual(t.gate(), false, '[시작]: 단원을 안 골랐으니 선택 화면이 열리고 멈춘다');
  assert.deepStrictEqual(t.inner, [], '[시작]은 프로필 게이트까지 가지 않았다');
  assert.strictEqual(t.ids['screen-edu-pick'].hidden, false, '단원 선택 화면이 열렸다');
  t.ids['screen-edu-pick'].hidden = true;
  assert.strictEqual(t.gate('challenge'), true, '[최고점 도전]: 단원 선택 게이트를 건너뛴다');
  assert.deepStrictEqual(t.inner, ['challenge'], '프로필 안내 게이트에 challenge 를 넘겼다');
  assert.strictEqual(t.ids['screen-edu-pick'].hidden, true, '단원 선택 화면이 열리지 않았다');
  // 프로필 안내 게이트가 막으면(false) 그대로 false
  const blocked = eduJsEnv({ innerResult: false });
  assert.strictEqual(blocked.gate('challenge'), false);
  assert.deepStrictEqual(blocked.inner, ['challenge']);
  // 단원을 이미 골랐고 문제가 준비된 상태: [시작]도 인자 없이(undefined) 프로필 게이트에 간다
  const picked = eduJsEnv({ save: JSON.stringify({ level: 'normal', edu: { unit: 'soc-3-2-1-1', intensity: 'many' } }) });
  assert.strictEqual(picked.gate(), true);
  assert.deepStrictEqual(picked.inner, [undefined]);
  assert.strictEqual(picked.gate('challenge'), true);
  assert.deepStrictEqual(picked.inner, [undefined, 'challenge']);
});

test('⑤ edu.js: 게이트 이어 붙이기의 [EDU] 변경은 이 구간뿐이고, 도전 분기는 단원 선택 호출(startGate)보다 앞에 있다', () => {
  const gate = cut(EDU_JS, '/* 한 화면 슬롯뿐인 game.js 의 시작 게이트에', '/** 결과 화면 한 줄(#end-quiz)');
  assert.ok(gate.indexOf("if (kind === 'challenge') return inner ? inner(kind) : true;") !== -1);
  assert.ok(gate.indexOf("kind === 'challenge'") < gate.indexOf('go = startGate() !== false'), '도전 분기가 단원 선택 게이트보다 먼저');
  assert.ok(gate.indexOf('return inner ? inner(kind) : true;') !== -1, '[시작]도 kind(=undefined)를 그대로 넘긴다');
  assert.strictEqual((EDU_JS.match(/kind === 'challenge'/g) || []).length, 1, 'edu.js 의 도전 관련 변경은 한 곳');
});

/* ===================================================================
 * ⑥ ranking.js — 교육용 도전 점수가 s 로 나간다
 * =================================================================== */
const UUID = '123e4567-e89b-42d3-a456-426614174000';
function fakeClock() {
  let t = 1_700_000_000_000; let seq = 0; const q = [];
  return {
    now: () => t,
    timers: { set(fn, ms) { const id = ++seq; q.push({ id, at: t + ms, fn }); return id; }, clear(id) { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); } },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const e = q.shift(); t = Math.max(t, e.at); e.fn(); await settle();
      }
      t = end; await settle();
    }
  };
}
async function settle() { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); }
const jsonRes = (status, obj) => ({ status, headers: { get: () => null }, text: async () => JSON.stringify(obj) });
function rankClient(save, challengeCfg) {
  const clock = fakeClock(); const calls = []; const mem = { 'element-gems:profile:v1': JSON.stringify({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }) };
  let stored = 0;
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/', timeoutMs: 8000 }), challenge: challengeCfg,
    store: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } },
    fetch: async (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null; calls.push({ url, body });
      if (body && typeof body.s === 'number') stored = Math.max(stored, body.s);
      return jsonRes(200, { ok: true, v: 1, me: { pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 }, score: stored }, changed: true, nickChangesLeft: 2 });
    },
    now: clock.now, timers: clock.timers, getSave: () => save, stageCount: 10, caps: { easy: 150, normal: 140, hard: 120 }, emit: () => {}, crypto: { randomUUID: () => UUID }
  });
  return { client, clock, calls, stored: () => stored };
}

test('⑥ ranking.js: 교육용 game.js 의 CONFIG.challenge 를 넘기면 도전 최고점이 5분 뒤(또는 나갈 때) 제출 본문 s 로 나가고, 넘기지 않으면 s 는 없다', async () => {
  const sv = G.defaultSave(); G.applyChallengeResult(sv, 12340);
  const t = rankClient(sv, G.CONFIG.challenge);
  assert.strictEqual(t.client.markScore(), true);
  await t.clock.advance(299000);
  assert.strictEqual(t.calls.filter((c) => /\/api\/sync$/.test(c.url)).length, 0, '5분 전에는 보내지 않는다');
  await t.clock.advance(2000);
  const sync = t.calls.filter((c) => /\/api\/sync$/.test(c.url));
  assert.strictEqual(sync.length, 1);
  assert.strictEqual(sync[0].body.s, 12340);
  assert.ok(sync[0].body.d, 'd 는 항상 함께');
  assert.strictEqual(t.client.status().sdirty, false, '서버가 받았다고 답했다');
  // 나갈 때(flushScore)는 기다리지 않고 올린다
  const sv2 = G.defaultSave(); G.applyChallengeResult(sv2, 5000);
  const t2 = rankClient(sv2, G.CONFIG.challenge);
  t2.client.markScore();
  await t2.client.flushScore(); await t2.clock.advance(100);
  assert.strictEqual(t2.calls.filter((c) => /\/api\/sync$/.test(c.url))[0].body.s, 5000);
  // 점수 상한: 저장이 상한을 넘은 이상한 값이라도 scoreCap 으로 줄여 보낸다
  const sv3 = G.defaultSave(); sv3.challenge.best = 999999;
  const t3 = rankClient(sv3, G.CONFIG.challenge);
  t3.client.markScore(); await t3.clock.advance(301000);
  assert.strictEqual(t3.calls.filter((c) => /\/api\/sync$/.test(c.url))[0].body.s, 280000);
  // 도전 설정을 못 받으면(옛 빌드) 최고점은 보내지 않는다
  const t4 = rankClient(sv, undefined);
  assert.strictEqual(t4.client.markScore(), false);
  t4.client.markDirty(0); await t4.clock.advance(5000);
  assert.strictEqual('s' in t4.calls.filter((c) => /\/api\/sync$/.test(c.url))[0].body, false);
  // 도전 기록이 없는 교육용 저장(별 기록만)은 s 를 보내지 않는다
  const t5 = rankClient(G.defaultSave(), G.CONFIG.challenge);
  assert.strictEqual(t5.client.markScore(), false);
  t5.client.markDirty(0); await t5.clock.advance(5000);
  assert.strictEqual('s' in t5.calls.filter((c) => /\/api\/sync$/.test(c.url))[0].body, false);
});

/** ranking.js + ranking-ui.js 를 같은 가짜 창에서 그대로 실행한다. setTimeout 은 쌓아 두기만 하고(5분 뒤 제출 예약이 저절로 실행되지 않게), 프로필은 이미 있고 한 번 동기화한 상태 */
function loadRankingUi(save, fetchFn) {
  const UUID2 = '123e4567-e89b-42d3-a456-426614174000';
  const ids = {};
  const mkEl = () => {
    const e = new FakeEl({ giftSet: 0 }, 'div');
    e.replaceChildren = function (frag) { this.children = []; if (frag) { (frag.isFragment ? frag.children : [frag]).forEach((c) => { c.parentNode = this; this.children.push(c); }); frag.children = []; } };
    e.insertBefore = e.appendChild; e.scrollIntoView = () => {};
    return e;
  };
  const doc = {
    readyState: 'complete', hidden: false, documentElement: mkEl(),
    getElementById(id) { return ids[id] || (ids[id] = mkEl()); }, createElement(t) { const e = mkEl(); e.tagName = String(t).toUpperCase(); return e; },
    createDocumentFragment() { const f = mkEl(); f.isFragment = true; return f; }, createTextNode(t) { const e = mkEl(); e._text = String(t); return e; },
    addEventListener() {}, removeEventListener() {}
  };
  const ls = {
    'element-gems:profile:v1': JSON.stringify({ pid: UUID2, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }),
    'element-gems-edu:sync:v1': JSON.stringify({ dirty: false, lastOkAt: 1700000000000, fails: 0, nextTryAt: 0, blocked: false, blockedCode: '', sdirty: false, sat: 0 })
  };
  const timers = [];
  const host = { CONFIG: JSON.parse(JSON.stringify(G.CONFIG)), _l: {}, on(n, fn) { (host._l[n] = host._l[n] || []).push(fn); }, getSave: () => save, showScreen() {}, goHome() {}, setStartGate() {}, enterStages() {}, enterChallenge() {}, getPhase: () => 'start', writeSave() {} };
  host.CONFIG.ranking.apiBase = 'http://x.test';
  const win = {
    document: doc, ElementGemsHost: host, navigator: { onLine: true }, crypto: {}, location: { reload() {} },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, scrollTo() {}, fetch: fetchFn, console
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read(root, 'ranking.js'), win, { filename: 'ranking.js' });
  vm.runInContext(read(root, 'ranking-ui.js'), win, { filename: 'ranking-ui.js' });
  (host._l.init || []).forEach((fn) => fn());
  return { host, timers, ls };
}

test('⑥ 실행(ranking-ui + ranking): 새 기록은 5분 타이머로 예약만 되고, 시작 화면으로 돌아오면(renderStart 이벤트) flushScore() 가 바로 불려 제출 본문에 s 가 실린다. 새 기록이 없으면 아무것도 보내지 않는다', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { const body = init && init.body ? JSON.parse(init.body) : null; calls.push({ url, body }); return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ ok: true, v: 1, me: { pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 }, score: body && body.s || 0 }, changed: true, nickChangesLeft: 2 }) }; };
  const sv = G.defaultSave();
  const u = loadRankingUi(sv, fetchFn);
  assert.ok(u.host._l.renderStart && u.host._l.challengeResult);
  assert.strictEqual(u.timers.length, 0, '시작 직후 예약된 것이 없다');
  sv.challenge.best = 7777;
  u.host._l.challengeResult.forEach((fn) => fn({ score: 7777, prev: 0, best: 7777, newBest: true, first: true }));
  await settle();
  assert.strictEqual(calls.length, 0, '새 기록은 곧바로 보내지 않는다');
  assert.ok(u.timers.some((x) => x.ms >= 300000), '5분(submitDelaySec) 뒤로 예약만 됐다');
  u.host._l.renderStart.forEach((fn) => fn());
  await settle();
  assert.strictEqual(calls.length, 1, 'flushScore() 가 불려 지금 한 번 올렸다');
  assert.match(calls[0].url, /\/api\/sync$/);
  assert.strictEqual(calls[0].body.s, 7777, '제출 본문에 최고점 s');
  assert.strictEqual(JSON.parse(u.ls['element-gems-edu:sync:v1']).sdirty, false, '올렸으니 대기 표시가 꺼졌다');
  u.host._l.renderStart.forEach((fn) => fn());
  await settle();
  assert.strictEqual(calls.length, 1, '또 돌아와도 더 보내지 않는다');
  const none = [];
  const idle = loadRankingUi(G.defaultSave(), async (url) => { none.push(url); return { status: 200, headers: { get: () => null }, text: async () => '{}' }; });
  idle.host._l.challengeResult.forEach((fn) => fn({ score: 100, prev: 500, best: 500, newBest: false, first: false }));
  idle.host._l.renderStart.forEach((fn) => fn());
  await settle();
  assert.strictEqual(none.length, 0, '새 기록이 없으면 아무것도 보내지 않는다');
});

test('⑥ ranking-ui.js 가 host.CONFIG.challenge 를 createClient 에 넘기고(교육용 host 가 내보낸다), ranking.js 는 동기화 키 한 줄·[EDU] 주석 말고는 일반용과 같다', { skip: skipGen }, () => {
  const ui = read(root, 'ranking-ui.js');
  assert.ok(ui.includes('challenge: host.CONFIG.challenge'));
  assert.ok(ui.includes("host.on('challengeResult', onChallengeResult);") && ui.includes("host.on('openHall'"));
  assert.ok(SRC.includes('window.ElementGemsHost = {\n    CONFIG: CONFIG,') && SRC.includes('enterChallenge: enterChallenge'));
  assert.strictEqual(fs.readFileSync(path.join(root, 'ranking-ui.js')).compare(fs.readFileSync(path.join(GEN_DIR, 'ranking-ui.js'))), 0, 'ranking-ui.js 바이트 동일');
  assert.strictEqual(fs.readFileSync(path.join(root, 'style.css')).compare(fs.readFileSync(path.join(GEN_DIR, 'style.css'))), 0, 'style.css 바이트 동일');
  const g = read(GEN_DIR, 'ranking.js');
  const e = read(root, 'ranking.js');
  const normalized = e.split('\n').filter((l) => l.indexOf('// [EDU]') === -1).join('\n').replace("sync: 'element-gems-edu:sync:v1'", "sync: 'element-gems:sync:v1'");
  assert.strictEqual(normalized, g);
});

/* ===================================================================
 * ⑦ 소스: 도전 구간이 일반용과 글자 그대로 같고 차이는 `// [EDU]` 줄뿐
 * =================================================================== */
test('⑦ 소스: CONFIG.challenge 블록·순수 함수 구간·"최고점 도전" 화면 구간이 일반용과 글자 그대로 같고, 교육용 차이는 `// [EDU]` 줄뿐이다', { skip: skipGen }, () => {
  const blocks = [
    ['CONFIG.challenge', '// spec §46(최고점 도전', '// spec §19: 별 챔피언 명예의 전당'],
    ['순수 함수 구간', '/* ---------- 최고점 도전 (spec §46) 순수 함수', 'function praiseLevel('],
    ['화면 구간', '최고점 도전 (spec §46) — 시작 화면 4번째 칸', 'function restartStage() {']
  ];
  blocks.forEach(([name, a, b]) => {
    const eduBlock = cut(SRC, a, b);
    const genBlock = cut(GEN_SRC, a, b);
    assert.ok(genBlock.length > 300, name + ' 블록이 너무 짧다(표지가 어긋남)');
    assert.strictEqual(dropEdu(eduBlock), genBlock, name + ': 교육용(`// [EDU]` 줄 제외)이 일반용과 다르다');
  });
  // 화면 구간 안의 [EDU] 줄은 정확히 이 세 줄이다(이름·위치·이유는 SYNC.md 기록)
  const screen = cut(SRC, '최고점 도전 (spec §46) — 시작 화면 4번째 칸', 'function restartStage() {');
  const eduLines = screen.split('\n').filter((l) => /\/\/ \[EDU\]/.test(l)).map((l) => l.trim());
  assert.strictEqual(eduLines.length, 3, JSON.stringify(eduLines));
  assert.ok(eduLines[0].startsWith('eduAbortQuiz();'), eduLines[0]);
  assert.ok(eduLines[1].startsWith("['pause-unit', 'count-unit'].forEach("), eduLines[1]);
  assert.ok(eduLines[2].startsWith('buildLearnHud();'), eduLines[2]);
  assert.ok(cut(SRC, 'async function startChallenge()', 'function finishChallenge()').indexOf(eduLines[0]) !== -1, '세 줄 모두 startChallenge 안');
  assert.ok(GEN_SRC.indexOf('[EDU]') === -1, '일반용에는 [EDU] 표식이 없다');
  // 순수 함수·CONFIG 구간에는 [EDU] 줄이 없다(일반용과 완전히 같다)
  assert.ok(cut(SRC, '// spec §46(최고점 도전', '// spec §19: 별 챔피언 명예의 전당').indexOf('[EDU]') === -1);
  assert.ok(cut(SRC, '/* ---------- 최고점 도전 (spec §46) 순수 함수', 'function praiseLevel(').indexOf('[EDU]') === -1);
});

test('⑦ 소스: 기존 함수에 넣은 짧은 분기(state·cacheDom·defaultSave·parseSave·resetState·renderStart·restartStage·finishStage·frame·bindUi·내보내기·ElementGemsHost)가 일반용과 같은 줄이며, 교육용에만 있는 도전 관련 줄은 `// [EDU]` 표식이 붙은 것뿐이다', { skip: skipGen }, () => {
  const norm = (l) => l.replace(/\s+/g, ' ').replace(/,(\s*\/\/)/, '$1').replace(/,\s*$/, '').trim();
  const isChal = (l) => /[cC]hallenge|chal-|§46/.test(l);
  const genLines = GEN_SRC.split('\n').filter(isChal).map(norm).filter(Boolean);
  const eduAll = new Set(SRC.split('\n').map(norm));
  const missing = genLines.filter((l) => !eduAll.has(l));
  assert.deepStrictEqual(missing, [], '일반용의 도전 관련 줄이 교육용에 없다');
  assert.ok(genLines.length > 80, '비교한 줄 수 ' + genLines.length);
  const genSet = new Set(GEN_SRC.split('\n').map(norm));
  const extra = SRC.split('\n').filter(isChal).filter((l) => !genSet.has(norm(l)));
  extra.forEach((l) => assert.ok(/\/\/ \[EDU\]/.test(l), '[EDU] 표식 없는 교육용 전용 도전 줄: ' + l.trim()));
  assert.strictEqual(extra.length, 1, '"challenge" 가 들어간 교육용 전용 줄은 quizReady 의 한 줄뿐이다(startChallenge 안의 [EDU] 세 줄은 위 시험이 센다): ' + extra.map((l) => l.trim().slice(0, 50)).join(' | '));
  assert.ok(/^if \(state\.challenge\) return false;/.test(extra[0].trim()));
  // 함수 본문 수준: 분기가 들어간 함수는 [EDU] 줄을 뺀 교육용 본문이 일반용과 같거나(restartStage·renderStart·frame), 해당 줄을 포함한다
  ['function restartStage(', 'function renderStart(', 'function frame('].forEach((h) => assert.strictEqual(dropEdu(bodyOf(SRC, h)), bodyOf(GEN_SRC, h), h));
  const fin = bodyOf(SRC, 'function finishStage(');
  assert.ok(fin.indexOf('if (state.phase !== \'playing\') return;\n    if (state.challenge) { finishChallenge(); return; }') !== -1, 'finishStage: 맨 앞 분기');
  assert.ok(fin.indexOf('if (state.challenge)') < fin.indexOf('state.phase = \'over\''), '분기는 스테이지 정산(applyStageResult·save.plays)보다 앞');
  assert.ok(fin.indexOf('[EDU]') > fin.indexOf('finishChallenge'), '교육용 문제 요약·stageEnd 는 분기 뒤라 도전 판에서는 실행되지 않는다');
  const rs = bodyOf(SRC, 'function resetState(');
  assert.ok(rs.indexOf('state.challenge = null;') !== -1 && rs.indexOf('resetChallengeHud();') !== -1);
  assert.ok(bodyOf(SRC, 'function bindUi(').indexOf("el['btn-quit'].addEventListener('click', onQuit);") !== -1);
});

test('⑦ quizReady: 도전 판에서만 거짓이고(state.challenge), 스테이지 판·시작 화면에서는 EduQuiz 상태를 그대로 따른다', () => {
  const q = bodyOf(SRC, 'function quizReady(');
  const lines = q.split('\n').map((l) => l.trim());
  assert.ok(/^if \(state\.challenge\) return false;\s*\/\/ \[EDU\]/.test(lines[1]), lines[1]);
  assert.strictEqual(lines[2], 'const q = window.EduQuiz;');
  assert.strictEqual(lines[3], 'return !!(q && q.ready && typeof q.ask === \'function\');');
  // 규칙 불변 시험(spirit ⑪)이 고정한 함수들은 이 변경으로 바뀌지 않았다 — 같은 파일의 시험이 본문 일치를 따로 본다
  ['function planRefillTypes(', 'function planRefill(', 'function learnMet(', 'function stageDone(', 'function startEduMode('].forEach((h) => assert.ok(SRC.indexOf(h) !== -1, h));
});

test('⑦ 두 소스에 새 에셋·외부 주소·글꼴이 없고, 도전 화면 문구에 피하는 말(폭력·도박·보상·외부 링크)이 없다', () => {
  const added = cut(HTML, '<button class="level-btn lv-challenge"', '</button>') + cut(HTML, '<li class="rule-chal">', '</li>') + cut(HTML, '<!-- 최고점 도전 결과 (spec §46)', '<!-- 프로필 안내 팝업');
  ['폭발', '대결', '공격', '싸움', '전투', '처치', '패배', '졌', '도박', '뽑기', '확률', '결제', '구매', '코인', 'http://', 'https://', '<a ', 'TIME UP', '실패'].forEach((w) => assert.ok(added.indexOf(w) === -1, w));
  const code = cut(SRC, '최고점 도전 (spec §46) — 시작 화면 4번째 칸', 'function restartStage() {');
  assert.ok(!/https?:\/\//.test(code) && !/fetch\(|XMLHttpRequest|sendBeacon/.test(code), '도전 구간은 네트워크를 쓰지 않는다(서버 제출은 ranking-ui.js 가 이벤트로 맡는다)');
});
