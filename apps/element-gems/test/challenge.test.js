/* 최고점 도전 시험 — spec §46 (일반용 클라이언트: game.js 규칙·저장·화면 흐름, ranking.js 묶어서 제출·ack, 순위표 문구, 두 앱 공용 파일 동기화).
 * 실행: node --test apps/element-gems/test/*.test.js   (서버·네트워크·브라우저 없음: 가짜 DOM + 가상 시계 + 가짜 fetch)
 *
 * ① 순수 함수·CONFIG(applyChallenge·applyChallengeResult·parseSave·글) ② 실제 판 흐름(game.js 를 그대로 실행) ③ ranking.js(제출 본문 s·묶어서 제출·ack·기록 있음·지우기)
 * ④ 정적 점검(index.html·style.css·ranking-ui.js·두 앱 공용 파일). 시험은 CONFIG 를 시험용 복사본(샌드박스)에서만 바꾼다. */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..', '..');
const G = require(path.join(root, 'game.js'));
const R = require(path.join(root, 'ranking.js'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const SRC = read(root, 'game.js');
const HTML = read(root, 'index.html');
const CSS = read(root, 'style.css');
const UI = read(root, 'ranking-ui.js');
const C = G.CONFIG.challenge;

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ===================================================================
 * ① 순수 함수 · CONFIG
 * =================================================================== */
test('CONFIG.challenge: 값(중수 기반·120초·구조 등급 0·상한 280,000·제출 지연 300초)이 한 곳에 있다', () => {
  assert.deepStrictEqual(C, { base: 'normal', seconds: 120, boardGrade: 0, scoreCap: 280000, submitDelaySec: 300 });
  assert.ok(G.CONFIG.difficulty[C.base], '기반 난이도가 실제로 있다');
});

test('applyChallenge: 중수 값을 활성 위치에 복사하고, 시계 120초·시간 보너스 전부 0·빛 스킬 시간 0 만 덮는다', () => {
  const sv = JSON.stringify(G.CONFIG.difficulty);
  G.applyDifficulty('hard');                                   // 다른 난이도가 켜져 있었다고 하자
  const lv = G.applyChallenge();
  const K = G.CONFIG;
  const N = K.difficulty.normal;
  assert.strictEqual(lv, 'normal');
  assert.strictEqual(K.level, 'normal');
  assert.deepStrictEqual(K.types.map((t) => t.max), N.max, '게이지 크기 [13,16,13,14,16,18]');
  assert.strictEqual(K.time.start, 120);
  assert.strictEqual(K.time.max, 120, '시간 보너스가 없으므로 늘어나지 않는다');
  assert.deepStrictEqual([K.timeBonus[3], K.timeBonus[4], K.timeBonus[5], K.timeBonus.chainExtra], [0, 0, 0, 0]);
  assert.strictEqual(G.timeBonusFor(3, 1) + G.timeBonusFor(4, 2) + G.timeBonusFor(5, 5) + G.timeBonusFor(7, 9), 0, '어떤 매치도 시간을 더하지 않는다');
  assert.strictEqual(K.skills.light.time, 0, '빛 스킬의 시간 +초');
  assert.strictEqual(K.skills.light.hint, N.skills.lightHint, '빛 스킬의 힌트는 그대로');
  assert.strictEqual(K.skills.water.freeze, 5, '물 스킬 시간 정지는 원래대로(5초)');
  assert.strictEqual(K.skills.dark.duration, 8);
  assert.strictEqual(K.skills.lightning.count, 8);
  assert.deepStrictEqual(K.hint, { show: 3, cooldown: 8, auto: 0, autoShow: 0 });
  assert.strictEqual(K.scoreMult, 1);
  assert.strictEqual(K.score.comboWindow, 6);
  assert.deepStrictEqual(K.score.skillPts, { fire: 85, grass: 50, lightning: 95, bonus: 375 });
  assert.strictEqual(JSON.stringify(K.difficulty), sv, '난이도 프리셋 자체는 바뀌지 않는다(시험이 값을 직접 읽은 것이 아니라 복사본만 바뀐다)');
  G.applyDifficulty('normal');
});

test('applyChallenge 는 점수 규칙 함수를 새로 만들지 않는다: 소스에 도전 전용 점수 계산이 없고 awardGroup·skillPoints 식이 그대로다', () => {
  const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/baseScore\(g\.size\) \* waveMult\(step, state\.combo\) \* darkMult\(\)/.test(code));
  assert.ok(!/function \w*[cC]hallenge\w*Score|chalScore|challengeMult/.test(code), '도전 전용 점수 함수 없음');
  assert.strictEqual((code.match(/function awardGroup\(/g) || []).length, 1);
});

test('applyChallengeResult: 첫 기록 · 새 기록 · 못 넘음 · 같은 점수 · 점수 0 · 상한(scoreCap) 줄이기', () => {
  const sv = G.defaultSave();
  let r = G.applyChallengeResult(sv, 9860);
  assert.deepStrictEqual(r, { score: 9860, prev: 0, best: 9860, newBest: true, first: true });
  assert.deepStrictEqual(sv.challenge, { best: 9860, last: 9860, plays: 1, rule: 2 });
  r = G.applyChallengeResult(sv, 13075);
  assert.deepStrictEqual(r, { score: 13075, prev: 9860, best: 13075, newBest: true, first: false });
  r = G.applyChallengeResult(sv, 2480);
  assert.deepStrictEqual(r, { score: 2480, prev: 13075, best: 13075, newBest: false, first: false });
  assert.deepStrictEqual(sv.challenge, { best: 13075, last: 2480, plays: 3, rule: 2 }, '직전 점수·횟수만 오르고 최고점은 그대로');
  r = G.applyChallengeResult(sv, 13075);
  assert.strictEqual(r.newBest, false, '같은 점수는 새 기록이 아니다');
  assert.strictEqual(r.best, 13075);
  const z = G.defaultSave();
  r = G.applyChallengeResult(z, 0);
  assert.deepStrictEqual(r, { score: 0, prev: 0, best: 0, newBest: false, first: false }, '점수 0 은 기록이 아니다');
  assert.strictEqual(z.challenge.plays, 1);
  const big = G.defaultSave();
  r = G.applyChallengeResult(big, 300000.9);
  assert.strictEqual(r.score, 280000, 'scoreCap 으로 줄여 저장한다');
  assert.strictEqual(big.challenge.best, 280000);
  const bad = G.defaultSave();
  assert.strictEqual(G.applyChallengeResult(bad, NaN).score, 0);
  assert.strictEqual(G.applyChallengeResult(bad, -5).score, 0);
  assert.strictEqual(G.applyChallengeResult(bad, '77').score, 0, '숫자가 아니면 0');
});

test('applyChallengeResult 는 스테이지 기록(stages·progress·bestByLevel·best·plays·lastScore·bestChain)을 건드리지 않는다', () => {
  const sv = G.defaultSave();
  G.applyStageResult(sv, 'normal', 1, 9000, true, 3, 70);
  sv.plays = 5; sv.lastScore = 777; sv.bestChain = 4; sv.bestByLevel.normal = 9000;
  const before = JSON.stringify(Object.assign({}, sv, { challenge: null }));
  G.applyChallengeResult(sv, 50000);
  assert.strictEqual(JSON.stringify(Object.assign({}, sv, { challenge: null })), before);
});

test('parseSave: 옛 저장(challenge 없음)은 기본값, 손상·범위 밖 값은 0, 정상 값은 그대로', () => {
  const old = G.parseSave(JSON.stringify({ level: 'easy', progress: { easy: 4, normal: 0, hard: 0 }, scoreRule: 2 }));
  assert.deepStrictEqual(old.challenge, { best: 0, last: 0, plays: 0, rule: 2 });
  assert.strictEqual(old.progress.easy, 4, '다른 필드는 그대로 읽는다');
  const ok = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 12340, last: 9860, plays: 7, rule: 2 } }));
  assert.deepStrictEqual(ok.challenge, { best: 12340, last: 9860, plays: 7, rule: 2 });
  [null, 5, 'x', [], [1, 2], { best: 'a' }, { best: -1, last: 1.5, plays: -3, rule: 2 }, { best: 280001, last: 99999999, plays: 1e12, rule: 2 }, { best: Infinity, last: NaN, rule: 2 }].forEach((c) => {
    const p = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: c }));
    assert.deepStrictEqual(p.challenge, { best: 0, last: 0, plays: 0, rule: 2 }, JSON.stringify(c));
  });
  const cap = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 280000, last: 280000, plays: 1e9, rule: 2 } }));
  assert.deepStrictEqual(cap.challenge, { best: 280000, last: 280000, plays: 1e9, rule: 2 }, '상한과 같은 값은 정상');
  assert.deepStrictEqual(G.parseSave('{깨진 JSON').challenge, { best: 0, last: 0, plays: 0, rule: 2 });
});

test('parseSave: 점수 규칙 표식이 다르면 best·last 는 0 으로 시작하고 옛 최고점은 bestOld 로 옮긴다(§28.9 와 같은 방식), 횟수는 남는다', () => {
  const p = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 12340, last: 9000, plays: 4, rule: 1 } }));
  assert.deepStrictEqual(p.challenge, { best: 0, last: 0, plays: 4, rule: 2, bestOld: 12340 });
  const none = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 1000, last: 1, plays: 1 } }));
  assert.strictEqual(none.challenge.best, 0, '표식이 없으면 다른 규칙으로 본다');
  assert.strictEqual(none.challenge.bestOld, 1000);
  const same = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 500, last: 500, plays: 1, rule: 2, bestOld: 9999 } }));
  assert.deepStrictEqual(same.challenge, { best: 500, last: 500, plays: 1, rule: 2, bestOld: 9999 }, '현재 규칙의 저장은 bestOld 를 그대로');
  const badOld = G.parseSave(JSON.stringify({ scoreRule: 2, challenge: { best: 5, last: 5, plays: 1, rule: 2, bestOld: 'x' } }));
  assert.ok(!('bestOld' in badOld.challenge));
  // 되돌려 읽어도 같다(저장 → 읽기)
  const sv = G.defaultSave();
  G.applyChallengeResult(sv, 4321);
  assert.deepStrictEqual(G.parseSave(JSON.stringify(sv)).challenge, sv.challenge);
});

test('defaultSave: challenge 필드가 하나 더 있고 나머지 키는 그대로다', () => {
  const sv = G.defaultSave();
  assert.deepStrictEqual(sv.challenge, { best: 0, last: 0, plays: 0, rule: G.CONFIG.score.rule });
  assert.deepStrictEqual(Object.keys(sv).sort(), ['best', 'bestByLevel', 'bestChain', 'challenge', 'cutin', 'lastScore', 'level', 'muted', 'plays', 'progress', 'scoreRule', 'stages', 'tutorialSeen']);
});

test('challengeStartInfo(spec §46.10): 4번째 칸이 켜졌을 때 설명 줄 글 — 기록 없음("아직 기록이 없어요") · 기록 있음("내 최고 N점", 점수만 bold). 별도 버튼의 "추천" 딱지·부제는 없다', () => {
  const LEAD = '최고점 도전 모드 · 단계 없이 바로 2분! ';
  const sv = G.defaultSave();
  assert.deepStrictEqual(G.challengeStartInfo(sv), { pre: LEAD + '아직 기록이 없어요', bold: '', text: LEAD + '아직 기록이 없어요', state: 'new' });
  sv.progress = { easy: 10, normal: 10, hard: 10 };
  assert.deepStrictEqual(G.challengeStartInfo(sv), { pre: LEAD + '아직 기록이 없어요', bold: '', text: LEAD + '아직 기록이 없어요', state: 'new' }, '세 난이도를 모두 깨도 추천 딱지·다른 문구가 없다(별도 버튼이 없어졌다)');
  G.applyChallengeResult(sv, 0);
  assert.strictEqual(G.challengeStartInfo(sv).state, 'new', '점수 0 은 기록이 아니다');
  G.applyChallengeResult(sv, 12340);
  assert.deepStrictEqual(G.challengeStartInfo(sv), { pre: LEAD + '내 최고 ', bold: '12,340점', text: LEAD + '내 최고 12,340점', state: 'best' });
  assert.strictEqual(G.challengeStartInfo(null).state, 'new', 'null 이어도 안전');
  ['badge', 'sub'].forEach((k) => assert.ok(!(k in G.challengeStartInfo(sv)), k + ' 는 없다'));
});

test('challengeHudInfo: 처음(첫 기록에 도전!) · 쫓는 중(내 최고 · 신기록까지) · 넘음(★ 신기록!)', () => {
  assert.deepStrictEqual(G.challengeHudInfo(0, 5000), { kind: 'first', best: '', gap: '첫 기록에 도전!', frac: 0, label: '첫 기록에 도전하는 중' });
  const a = G.challengeHudInfo(12340, 8435);
  assert.strictEqual(a.kind, 'chase');
  assert.strictEqual(a.best, '내 최고 12,340');
  assert.strictEqual(a.gap, '신기록까지 3,905점');
  assert.ok(Math.abs(a.frac - 8435 / 12340) < 1e-12);
  assert.match(a.label, /내 최고 12,340점, 신기록까지 3,905점/);
  const b = G.challengeHudInfo(12340, 12340);
  assert.deepStrictEqual([b.kind, b.frac, b.gap], ['beat', 1, '★ 신기록!'], '같으면 이미 넘은 것으로 본다(글자와 ★ 로 알림)');
  assert.strictEqual(G.challengeHudInfo(12340, 20000).kind, 'beat');
  assert.strictEqual(G.challengeHudInfo(12340, 0).frac, 0);
});

test('challengeResultInfo: 첫 기록 · 새 기록(+차이) · 못 넘음(남은 점수) · 같은 점수 · 점수 없음, 빨간색·TIME UP·실패 말은 없다', () => {
  const info = (score, prev) => G.challengeResultInfo({ score, prev, best: Math.max(score, prev), newBest: score > prev, first: prev === 0 && score > 0 });
  assert.deepStrictEqual(info(9860, 0), { badge: true, line: '첫 기록이에요! 내 최고 점수로 저장했어요.', cheer: '' });
  assert.deepStrictEqual(info(13075, 12340), { badge: true, line: '지난 최고 12,340 → +735', cheer: '' });
  assert.deepStrictEqual(info(9860, 12340), { badge: false, line: '내 최고 12,340 · 2,480점 남았어요', cheer: '좋은 점수예요! 한 번 더 해 볼까요?' });
  assert.strictEqual(info(12340, 12340).line, '내 최고와 같은 점수예요!');
  assert.strictEqual(info(0, 0).cheer, '한 번 더 해 볼까요?');
  const all = JSON.stringify([info(9860, 0), info(13075, 12340), info(9860, 12340), info(12340, 12340), info(0, 0), G.challengeHudInfo(0, 0), G.challengeHudInfo(10, 5), G.challengeHudInfo(10, 50), G.challengeStartInfo(G.defaultSave())]);
  ['TIME UP', '실패', '졌', '패배', '폭발', '죽', '대결', '공격', '도박', '확률', '뽑기', '보상'].forEach((w) => assert.ok(all.indexOf(w) === -1, '"' + w + '" 가 있음'));
});

/* ===================================================================
 * ② 실제 판 흐름 — 가짜 DOM + 가상 시계로 game.js 를 그대로 실행
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, hud: hud, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, goStages: goStages, typeGrid: typeGrid, setGemType: setGemType, listMoves: listMoves, goalMet: goalMet, pauseGame: pauseGame, resumeGame: resumeGame, finishStage: finishStage, startChallenge: startChallenge, leaveChallenge: leaveChallenge, openChallenge: openChallenge, restartStage: restartStage, renderStart: renderStart, writeSave: writeSave, openConfirm: openConfirm, selectLevel: selectLevel, onStartClick: onStartClick }; }\n";
assert.ok(SRC.indexOf(HOOK_TAIL) !== -1, 'game.js 끝부분을 찾지 못함');
const SCRIPT = new vm.Script(SRC.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: 'general/game.js' });

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.hidden = false; this._text = '';
    this.isFragment = false; this._html = ''; this._attrs = {}; this._cls = new Set(); this._ls = {}; this._q = {}; this._style = {};
    this.dataset = {}; this.disabled = false;
    const self = this;
    this.style = { setProperty(k, v) { self._style[k] = String(v); }, removeProperty(k) { delete self._style[k]; }, getPropertyValue(k) { return self._style[k] || ''; } };
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
  click() { (this._ls.click || []).forEach((fn) => fn({ target: this })); }
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl('span')); }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {} blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

function createEnv(seed, cfgPatch, opts) {
  const o = opts || {};
  const env = { _now: 0, _seq: 0, _q: [], errors: [], rnd: 0, events: [] };
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
  const store = Object.assign({}, o.store);
  const rand = mulberry(seed || 1);
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: !o.motion }),             // 기본: prefers-reduced-motion: reduce → 입자(난수) 없음. opts.motion = true 면 움직임 줄이기가 꺼진 기기(배경 이동 시험용)
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: () => { env.rnd++; return rand(); },
    __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  if (o.chips) {                                              // 시작 화면 난이도 줄의 네 칸(spec §46.10). index.html 의 .level-btn 네 개를 흉내 낸다(init 보다 먼저 있어야 click 이 이어진다)
    const ls = doc.getElementById('level-select');
    env.chips = ['easy', 'normal', 'hard', 'challenge'].map((lv) => { const c = new FakeEl('button'); c.dataset.level = lv; c.tabIndex = -1; c.setAttribute('aria-checked', 'false'); return c; });
    ls.querySelectorAll = () => env.chips;
    ls.querySelector = (sel) => { const m = /data-level="(\w+)"/.exec(sel); return m ? env.chips.find((c) => c.dataset.level === m[1]) || null : null; };
  }
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  SCRIPT.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store;
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.CONFIG.board.enabled = false;
  if (cfgPatch) cfgPatch(env.CONFIG);
  env.host = sandbox.ElementGemsHost;
  ['challengeResult', 'stageResult', 'openHall', 'renderStart'].forEach((n) => env.host.on(n, (d) => env.events.push([n, d])));
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
  env.el = (id) => doc.getElementById(id);
  return env;
}

async function startChal(env) {
  env.host.enterChallenge();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
}
async function startStageAndWait(env, lv, stage) {
  env.I.save.level = lv;
  env.I.save.progress[lv] = 9;
  env.I.startStage(stage);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
}
function applyBoard(env, types) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], types[r][c]);
}
async function finishAction(env) {
  await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000);
  await env.runFor(400);
}
const swapped = (b, m) => { const c = b.map((r) => r.slice()); const t = c[m.a.r][m.a.c]; c[m.a.r][m.a.c] = c[m.b.r][m.b.c]; c[m.b.r][m.b.c] = t; return c; };
function replay(board, rng) {
  const g = board.map((r) => r.slice());
  const forced = [];
  let step = 1, maxStep = 1, groups = 0;
  for (let guard = 0; guard < 60; guard++) {
    const gs = G.findMatches(g);
    if (!gs.length) break;
    maxStep = Math.max(maxStep, step); groups += gs.length;
    gs.forEach((x) => x.cells.forEach((p) => { g[p.r][p.c] = null; }));
    const res = G.applyGravity(g);
    for (let c = 0; c < 8; c++) for (let i = 0; i < res.empties[c]; i++) { const t = Math.floor(rng() * 6); g[i][c] = t; forced.push((t + 0.5) / 6); }
    step++;
  }
  return { forced, maxStep, groups, final: g };
}
function findSwapScenario(pred, from) {
  for (let seed = from || 1; seed <= 600; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    const moves = G.listMoves(board);
    for (let mi = 0; mi < moves.length; mi++) {
      for (let k = 0; k < 4; k++) {
        const sim = replay(swapped(board, moves[mi]), mulberry(seed * 100 + mi * 10 + k));
        if (G.hasValidMove(sim.final) && pred(sim)) return { board, move: moves[mi], sim };
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
  assert.strictEqual(env.sandbox.__forced.length, 0, '시나리오의 새 칸 종류가 모두 순서대로 쓰였다');
}
const plain = (o) => JSON.parse(JSON.stringify(o));                    // 샌드박스(vm) 안에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 거절한다 -> 값만 비교
/** 스테이지 기록 필드만 뽑은 문자열(도전·설정·튜토리얼 표시는 제외) */
const stageJson = (sv) => JSON.stringify({ level: sv.level, progress: sv.progress, stages: sv.stages, bestByLevel: sv.bestByLevel, best: sv.best, bestChain: sv.bestChain, plays: sv.plays, lastScore: sv.lastScore });

test('판 시작: host.enterChallenge 로 들어가면 시계 120초·목표 없음·미션/정령 없음·보드 구조 0 이고 goalMet() 은 거짓이다', async () => {
  const env = createEnv(3);
  assert.strictEqual(typeof env.host.enterChallenge, 'function');
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.phase, 'countdown');
  assert.strictEqual(env.el('count-info').textContent, '최고점 도전 · 2분 동안 점수를 모아요');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  const S = env.I.state;
  assert.deepStrictEqual(plain(S.challenge), { prevBest: 0 });
  assert.strictEqual(S.timeLeft, 120);
  assert.strictEqual(S.target, 0);
  assert.strictEqual(S.mission, null);
  assert.strictEqual(S.spirit, null);
  assert.strictEqual(S.board, null, '구조 등급 0 = 균등 무작위');
  assert.strictEqual(env.I.goalMet(), false);
  assert.strictEqual(S.level, 'normal');
  assert.strictEqual(env.CONFIG.time.start, 120);
  assert.strictEqual(env.CONFIG.skills.light.time, 0);
  assert.strictEqual(env.CONFIG.timeBonus[3], 0);
  assert.strictEqual(env.el('level-chip').textContent, '도전');
  assert.strictEqual(env.el('level-chip').className, 'level-chip lv-challenge');
  assert.strictEqual(env.el('screen-game').hidden, false);
  assert.strictEqual(env.el('screen-start').hidden, true);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('도전 HUD: 미션 칩·정령 패널은 숨고 #goal 이 "내 최고까지" 막대로 쓰인다(글·aria·채움), 처음에는 "첫 기록에 도전!"', async () => {
  const env = createEnv(4, null, { store: { 'element-gems:v1': JSON.stringify({ scoreRule: 2, challenge: { best: 12340, last: 9000, plays: 3, rule: 2 } }) } });
  await startChal(env);
  const g = env.el('goal');
  assert.strictEqual(g.hidden, false, '목표 바 자리의 막대가 보인다');
  assert.strictEqual(env.el('mission').hidden, true);
  assert.strictEqual(env.el('spirit').hidden, true);
  assert.strictEqual(env.el('screen-game').dataset.goal, 'score', '레이아웃은 점수형 목표 바와 같다(보드 크기식 불변)');
  assert.strictEqual(g.dataset.chal, '1');
  assert.strictEqual(g.getAttribute('aria-label'), '내 최고 점수까지 진행');
  assert.strictEqual(env.I.state.challenge.prevBest, 12340);
  await env.runFor(400);
  assert.strictEqual(env.el('goal-text').textContent, '내 최고 12,340 · 신기록까지 12,340점');
  assert.match(g.getAttribute('aria-valuetext'), /내 최고 12,340점, 신기록까지 12,340점/);
  assert.strictEqual(g.getAttribute('aria-valuenow'), '0');
  env.I.state.score = 8435; env.I.state.shown = 8435;
  await env.runFor(400);
  assert.strictEqual(env.el('goal-text').textContent, '내 최고 12,340 · 신기록까지 3,905점');
  assert.strictEqual(g.getAttribute('aria-valuenow'), String(Math.round(8435 / 12340 * 100)));
  env.I.state.score = 12340; env.I.state.shown = 12340;
  await env.runFor(400);
  assert.match(env.el('goal-text').textContent, /★ 신기록!$/, '글자와 ★ 로 알린다(색에만 의존하지 않음)');
  assert.ok(g.classList.contains('beat'));
  assert.strictEqual(g.getAttribute('aria-valuenow'), '100');
  const first = createEnv(5);
  await startChal(first);
  await first.runFor(400);
  assert.strictEqual(first.el('goal-text').textContent, '첫 기록에 도전!');
  assert.deepStrictEqual(env.errors.concat(first.errors), []);
  env.dispose(); first.dispose();
});

test('같은 판을 스테이지 규칙(중수·점수 목표)과 도전 규칙으로 돌려 점수·통계가 같다(시간 보너스만 다르다)', async () => {
  const sc1 = findSwapScenario((s) => s.maxStep >= 3);
  const sc2 = findSwapScenario((s) => s.groups >= 2 && s.maxStep <= 2, 7);
  const stage = createEnv(11, (cfg) => { cfg.stages.goalType.normal = 'score'; cfg.stages.targets.normal[0] = 1e9; });
  await startStageAndWait(stage, 'normal', 1);
  const chal = createEnv(11);
  await startChal(chal);
  for (const sc of [sc1, sc2]) { await runSwap(stage, sc); await runSwap(chal, sc); }
  const a = stage.I.state, b = chal.I.state;
  assert.ok(b.score > 0 && b.score === a.score, '점수 ' + b.score + ' vs ' + a.score);
  assert.strictEqual(b.stats.matches, a.stats.matches);
  assert.strictEqual(b.stats.maxChain, a.stats.maxChain);
  assert.strictEqual(b.stats.maxCombo, a.stats.maxCombo);
  assert.strictEqual(b.stats.skillPts, a.stats.skillPts);
  assert.deepStrictEqual(plain(b.gauge), plain(a.gauge), '게이지 충전도 같다');
  assert.ok(b.score >= 100 && G.baseScore(3) === 50 && G.CONFIG.score.multCap === 16, '점수 규칙(§28: 기본 3매치 50점, 곱 상한 16)이 그대로다');
  assert.ok(a.timeLeft - b.timeLeft >= 0.09, '스테이지는 3·4·5매치 시간 보너스를 더하고 도전은 더하지 않는다: ' + a.timeLeft + ' vs ' + b.timeLeft);
  assert.ok(b.timeLeft <= 120, '도전의 시계는 120초를 넘지 않는다');
  assert.deepStrictEqual(stage.errors.concat(chal.errors), []);
  stage.dispose(); chal.dispose();
});

test('빛 스킬은 시간을 더하지 않고(힌트는 나온다), 물 스킬의 시간 정지·컷인은 원래대로다', async () => {
  const env = createEnv(12);
  await startChal(env);
  const I = env.I;
  I.state.timeLeft = 100;
  I.state.gauge[5] = env.CONFIG.types[5].max;
  I.onGauge(5);
  await finishAction(env);
  assert.ok(I.state.timeLeft <= 100, '빛 스킬 뒤 시간이 늘지 않았다: ' + I.state.timeLeft);
  assert.strictEqual(I.state.stats.skills, 1);
  I.state.gauge[1] = env.CONFIG.types[1].max;
  I.onGauge(1);
  await env.runUntil(() => I.state.freeze > 0, 5000);
  assert.ok(I.state.freeze > 4 && I.state.freeze <= 5, '물 스킬 시간 정지 5초: ' + I.state.freeze);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('시계가 0 이 되면 끝난다: 결과 화면이 뜨고 phase over, 스테이지 기록(stages·progress·bestByLevel·plays·lastScore)과 stageResult 이벤트는 그대로다', async () => {
  const env = createEnv(13);
  const sv = env.I.save;
  sv.progress.normal = 3; sv.plays = 5; sv.lastScore = 777; sv.bestChain = 4;
  const before = stageJson(sv);
  await startChal(env);
  await runSwap(env, findSwapScenario((s) => s.groups >= 1));
  const scored = env.I.state.score;
  assert.ok(scored > 0);
  await env.runUntil(() => env.I.state.phase === 'over', 400000);
  assert.strictEqual(env.I.state.timeUp, true);
  assert.strictEqual(env.I.goalMet(), false, '끝까지 goalMet() 은 거짓');
  assert.strictEqual(env.el('overlay-chal-end').hidden, false);
  assert.strictEqual(env.el('overlay-end').hidden, true, '스테이지 결과 화면은 뜨지 않는다');
  assert.strictEqual(env.el('chal-end-score').textContent, scored.toLocaleString('ko-KR'));
  assert.strictEqual(env.el('chal-end-new').hidden, false);
  assert.strictEqual(env.el('chal-end-line').textContent, '첫 기록이에요! 내 최고 점수로 저장했어요.');
  assert.strictEqual(env.el('chal-end-cheer').hidden, true);
  assert.strictEqual(env.el('chal-end-rank').hidden, true, '서버 제출 줄은 ranking-ui 가 채울 때까지 숨김');
  assert.strictEqual(stageJson(sv), before, '스테이지 기록 불변');
  assert.deepStrictEqual(plain(sv.challenge), { best: scored, last: scored, plays: 1, rule: 2 });
  const stored = JSON.parse(env.store['element-gems:v1']);
  assert.strictEqual(stored.challenge.best, scored, '저장소에도 들어갔다');
  assert.deepStrictEqual(env.events.filter((e) => e[0] === 'stageResult'), []);
  const ev = env.events.filter((e) => e[0] === 'challengeResult');
  assert.deepStrictEqual(plain(ev.map((e) => e[1])), [{ score: scored, prev: 0, best: scored, newBest: true, first: true }]);
  assert.strictEqual(env.CONFIG.time.start, 120, '활성 값은 고른 난이도(중수) 값으로 돌아왔다');
  assert.ok(env._now >= 120000, '가상 시계 120초 이상 흘렀다(컷인·정지가 없는 판은 정확히 120초 + 카운트다운)');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('결과: 못 넘으면 "내 최고 · N점 남았어요" + 격려, 새 기록이면 "지난 최고 → +차이", 이벤트는 newBest 를 알린다. [다시 도전]은 새 도전을 시작한다', async () => {
  const env = createEnv(14, null, { store: { 'element-gems:v1': JSON.stringify({ scoreRule: 2, challenge: { best: 500000 > 280000 ? 200000 : 0, last: 0, plays: 2, rule: 2 } }) } });
  await startChal(env);
  await runSwap(env, findSwapScenario((s) => s.groups >= 1));
  const s1 = env.I.state.score;
  env.I.finishStage();
  assert.strictEqual(env.I.state.phase, 'over');
  assert.strictEqual(env.el('chal-end-new').hidden, true);
  assert.strictEqual(env.el('chal-end-line').textContent, '내 최고 200,000 · ' + (200000 - s1).toLocaleString('ko-KR') + '점 남았어요');
  assert.strictEqual(env.el('chal-end-cheer').textContent, '좋은 점수예요! 한 번 더 해 볼까요?');
  assert.strictEqual(env.I.save.challenge.best, 200000);
  assert.strictEqual(env.I.save.challenge.last, s1);
  assert.strictEqual(env.I.save.challenge.plays, 3);
  env.el('btn-chal-again').click();                           // [다시 도전]
  assert.strictEqual(env.el('overlay-chal-end').hidden, true);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.strictEqual(env.I.state.score, 0);
  assert.strictEqual(env.I.state.timeLeft, 120);
  assert.deepStrictEqual(plain(env.I.state.challenge), { prevBest: 200000 });
  env.I.state.score = 200100;
  env.I.finishStage();
  assert.strictEqual(env.el('chal-end-new').hidden, false);
  assert.strictEqual(env.el('chal-end-line').textContent, '지난 최고 200,000 → +100');
  const ev = env.events.filter((e) => e[0] === 'challengeResult').map((e) => e[1]);
  assert.deepStrictEqual(ev.map((e) => e.newBest), [false, true]);
  assert.strictEqual(ev[1].prev, 200000);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('나가기: 일시정지 [나가기]는 그 판을 기록하지 않고 시작 화면으로 돌아오며, 활성 값을 고른 난이도로 되돌린다', async () => {
  const env = createEnv(15);
  env.I.save.level = 'hard';
  await startChal(env);
  await runSwap(env, findSwapScenario((s) => s.groups >= 1));
  assert.ok(env.I.state.score > 0);
  env.I.pauseGame();
  assert.strictEqual(env.I.state.phase, 'paused');
  assert.strictEqual(env.el('pause-level').textContent, '최고점 도전 · 2분 동안 점수를 모아요');
  env.el('btn-quit').click();
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.el('screen-start').hidden, false);
  assert.strictEqual(env.el('screen-game').hidden, true);
  assert.deepStrictEqual(plain(env.I.save.challenge), { best: 0, last: 0, plays: 0, rule: 2 }, '중간에 나간 판은 기록하지 않는다');
  assert.strictEqual(env.I.state.challenge, null);
  assert.strictEqual(env.CONFIG.time.start, 100, '고수 값(100초)으로 되돌아왔다');
  assert.strictEqual(env.CONFIG.skills.light.time, 3);
  assert.strictEqual(env.CONFIG.timeBonus[3], 0.04);
  assert.deepStrictEqual(env.events.filter((e) => e[0] === 'challengeResult'), []);
  assert.strictEqual(env.el('goal').dataset.chal, undefined, '도전 막대 표식이 지워졌다');
  assert.strictEqual(env.el('goal').getAttribute('aria-label'), '목표 점수 진행');
  env.dispose();
});

test('다시 시작(일시정지·리셋 확인): 도전을 새로 시작한다(스테이지로 가지 않는다)', async () => {
  const env = createEnv(16);
  await startChal(env);
  await runSwap(env, findSwapScenario((s) => s.groups >= 1));
  env.I.pauseGame();
  env.el('btn-restart').click();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.ok(env.I.state.challenge, '다시 도전 판');
  assert.strictEqual(env.I.state.score, 0);
  assert.strictEqual(env.I.state.target, 0);
  env.I.openConfirm();
  env.el('btn-confirm-yes').click();
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  assert.ok(env.I.state.challenge);
  assert.strictEqual(env.I.state.timeLeft, 120);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[돌아가기]·[명예의 전당 보기]: 결과 화면을 닫고 시작 화면으로 간다(후자는 openHall 이벤트를 낸다)', async () => {
  const env = createEnv(17);
  env.I.selectLevel('challenge');                              // 시작 화면 난이도 줄의 4번째 칸(spec §46.10)
  await startChal(env);
  env.I.state.score = 1234;
  env.I.finishStage();
  const renders = env.events.filter((e) => e[0] === 'renderStart').length;
  env.el('btn-chal-home').click();
  assert.strictEqual(env.el('overlay-chal-end').hidden, true);
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.el('screen-start').hidden, false);
  assert.strictEqual(env.events.filter((e) => e[0] === 'renderStart').length, renders + 1, '시작 화면으로 돌아오면 renderStart 이벤트가 나간다(ranking-ui 가 묶어 둔 최고점을 올리는 때)');
  assert.strictEqual(env.I.state.startChoice, 'challenge', '도전을 마치고 돌아와도 4번째 칸이 켜져 있다');
  assert.strictEqual(env.el('level-desc').textContent, '최고점 도전 모드 · 단계 없이 바로 2분! 내 최고 1,234점', '설명 줄에 최고점이 바로 보인다');
  assert.strictEqual(env.el('btn-start').textContent, '도전 시작');
  await startChal(env);
  env.I.finishStage();
  env.el('btn-chal-hall').click();
  assert.strictEqual(env.el('overlay-chal-end').hidden, true);
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.events.filter((e) => e[0] === 'openHall').length, 1);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('도전 뒤 스테이지: 막대·칩·표식이 점수형/미션형 화면으로 완전히 돌아온다', async () => {
  const env = createEnv(18);
  await startChal(env);
  env.I.finishStage();
  env.el('btn-chal-home').click();
  await startStageAndWait(env, 'normal', 1);
  const S = env.I.state;
  assert.strictEqual(S.challenge, null);
  assert.strictEqual(env.el('goal').dataset.chal, undefined);
  assert.strictEqual(env.el('goal').getAttribute('aria-label'), '목표 점수 진행');
  assert.strictEqual(env.el('goal').getAttribute('aria-valuetext'), null);
  assert.strictEqual(env.el('level-chip').textContent, '중수 · Lv1');
  assert.strictEqual(env.el('level-chip').className, 'level-chip lv-normal');
  assert.notStrictEqual(S.mission, null, '중수 1단계는 미션형 그대로');
  assert.strictEqual(env.CONFIG.time.start, 120);
  assert.strictEqual(env.CONFIG.timeBonus[3], 0.05, '시간 보너스가 원래대로');
  assert.strictEqual(env.CONFIG.skills.light.time, 4);
  assert.strictEqual(env.I.save.plays, 0, '도전은 plays 를 올리지 않았다');
  env.dispose();
});

test('반대 방향: 스테이지 판(클리어·실패)을 끝까지 해도 저장의 challenge 필드는 글자 그대로 남는다 (spirit 시험의 저장 비교는 challenge 한 필드를 정규식으로 빼므로 그 필드는 여기서 따로 지킨다)', async () => {
  const env = createEnv(31);
  env.I.save.challenge = { best: 12340, last: 9860, plays: 4, rule: 2, bestOld: 777 };
  const before = JSON.stringify(env.I.save.challenge);
  const persisted = () => JSON.stringify(JSON.parse(env.store['element-gems:v1']).challenge);
  await startStageAndWait(env, 'easy', 1);
  env.I.state.score = 999999;                                  // 초보 1단계는 점수 목표 -> 클리어
  env.I.finishStage();
  assert.strictEqual(env.I.state.phase, 'over');
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageResult').pop()[1].cleared, true, '클리어 경로');
  assert.strictEqual(JSON.stringify(env.I.save.challenge), before, '클리어 뒤 메모리의 challenge');
  assert.strictEqual(persisted(), before, '클리어 뒤 저장된 challenge');
  await startStageAndWait(env, 'normal', 1);
  env.I.finishStage();                                         // 시간 안에 미션을 못 끝낸 판 -> 실패
  assert.strictEqual(env.events.filter((e) => e[0] === 'stageResult').pop()[1].cleared, false, '실패 경로');
  assert.strictEqual(JSON.stringify(env.I.save.challenge), before, '실패 뒤 메모리의 challenge');
  assert.strictEqual(persisted(), before, '실패 뒤 저장된 challenge');
  assert.strictEqual(env.I.save.plays, 2, '스테이지 판 두 번은 plays 를 2 올렸다(도전 횟수는 따로)');
  env.dispose();
});

const LEAD = '최고점 도전 모드 · 단계 없이 바로 2분! ';
const saved = (env) => (env.store['element-gems:v1'] === undefined ? null : JSON.parse(env.store['element-gems:v1']));

test('난이도 줄 4번째 칸(spec §46.10): 고르면 설명 줄·[도전 시작]·aria-checked 가 바뀌고, 저장(save.level·localStorage)은 건드리지 않는다. 세 난이도는 지금처럼 저장한다', () => {
  const env = createEnv(19, null, { chips: true });
  const [easy, normal, hard, chal] = env.chips;
  const on = () => env.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level);
  assert.deepStrictEqual(on(), ['normal'], '처음: 중수');
  assert.deepStrictEqual(env.chips.map((c) => c.getAttribute('aria-checked')), ['false', 'true', 'false', 'false']);
  assert.deepStrictEqual(env.chips.map((c) => c.tabIndex), [-1, 0, -1, -1], 'roving tabindex: 켜진 칸만 0');
  assert.strictEqual(env.el('btn-start').textContent, '시작');
  assert.strictEqual(env.el('btn-start').classList.contains('is-chal'), false);
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
  const d = env.el('level-desc');
  assert.strictEqual(d.textContent, LEAD + '내 최고 12,340점');
  assert.deepStrictEqual(d.children.map((c) => [c.tagName, c.textContent]), [['B', '12,340점']], '점수만 굵게(b)');
  hard.click();                                                // 세 난이도는 저장한다
  assert.strictEqual(env.I.save.level, 'hard');
  assert.strictEqual(saved(env).level, 'hard');
  assert.deepStrictEqual(on(), ['hard']);
  assert.strictEqual(env.el('btn-start').textContent, '시작');
  assert.strictEqual(env.el('btn-start').classList.contains('is-chal'), false);
  assert.strictEqual(env.el('level-desc').textContent, env.CONFIG.difficulty.hard.desc);
  assert.strictEqual(env.el('level-desc').children.length, 0, '난이도 설명에는 굵은 글이 없다');
  chal.click();
  easy.click();
  assert.strictEqual(saved(env).level, 'easy');
  // 새로고침(같은 저장소로 다시 시작): 4번째 칸은 기억하지 않고 마지막 난이도가 켜진다
  chal.click();
  const again = createEnv(19, null, { chips: true, store: env.store });
  assert.deepStrictEqual(again.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level), ['easy'], '새로고침하면 마지막 난이도');
  assert.strictEqual(again.I.state.startChoice, null);
  assert.strictEqual(again.el('btn-start').textContent, '시작');
  env.dispose(); again.dispose();
});

test('난이도 줄 키보드: 방향키가 4칸을 순환하고(초보→중수→고수→최고점 도전 모드→초보), 4번째 칸에서도 aria-checked·tabindex 가 4칸 기준으로 따라온다', () => {
  const env = createEnv(24, null, { chips: true });
  const key = (k) => { let prevented = false; (env.el('level-select')._ls.keydown || []).forEach((fn) => fn({ key: k, preventDefault() { prevented = true; } })); return prevented; };
  const cur = () => env.chips.filter((c) => c.classList.contains('on')).map((c) => c.dataset.level)[0];
  assert.strictEqual(cur(), 'normal');
  assert.strictEqual(key('ArrowRight'), true);
  assert.strictEqual(cur(), 'hard');
  key('ArrowDown');
  assert.strictEqual(cur(), 'challenge');
  assert.strictEqual(env.chips[3].getAttribute('aria-checked'), 'true');
  assert.strictEqual(env.chips[3].tabIndex, 0);
  assert.strictEqual(env.I.save.level, 'hard', '4번째 칸에 닿아도 저장된 난이도는 그대로');
  key('ArrowRight');
  assert.strictEqual(cur(), 'easy', '끝에서 처음으로 돈다');
  key('ArrowLeft');
  assert.strictEqual(cur(), 'challenge', '처음에서 끝으로 돈다');
  key('ArrowUp');
  assert.strictEqual(cur(), 'hard');
  assert.strictEqual(key('Enter'), false, '방향키가 아니면 건드리지 않는다');
  env.dispose();
});

test('[시작]/[도전 시작]: 4번째 칸이 켜져 있으면 도전(게이트에 "challenge")으로, 세 난이도면 지금처럼 레벨 선택으로(게이트에 인자 없음). 게이트가 막으면 시작하지 않는다', async () => {
  const env = createEnv(25, null, { chips: true });
  const asked = [];
  let allow = false;
  env.host.setStartGate((kind) => { asked.push(kind); return allow; });
  env.chips[3].click();
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge']);
  assert.strictEqual(env.I.state.phase, 'start', '게이트가 false 면 멈춘다(프로필 안내 팝업)');
  allow = true;
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge', 'challenge']);
  assert.strictEqual(env.I.state.phase, 'countdown');
  assert.ok(env.I.state.challenge);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.leaveChallenge();
  assert.strictEqual(env.I.state.phase, 'start');
  assert.strictEqual(env.chips[3].classList.contains('on'), true, '돌아와도 4번째 칸이 켜져 있다');
  env.chips[1].click();                                        // 중수로
  env.el('btn-start').click();
  assert.deepStrictEqual(asked, ['challenge', 'challenge', undefined], '[시작]의 게이트는 인자 없이 그대로');
  assert.strictEqual(env.I.state.phase, 'stages', '레벨 선택으로');
  assert.strictEqual(env.I.state.challenge, null);
  env.dispose();
});

test('시작 화면에서 [도전 시작]을 누르면 <html data-chal-intro> 가 잠깐 켜져(CONFIG.anim.camIntroMs 뒤 걷힘) 배경이 아래로 부드럽게 내려간다. [다시 도전]·스테이지 시작·움직임 줄이기에서는 켜지지 않는다', async () => {
  const env = createEnv(26, null, { motion: true });          // 움직임 줄이기가 꺼진 기기
  const html = env.doc.documentElement;
  const ms = env.CONFIG.anim.camIntroMs;
  assert.strictEqual(ms, 1000);
  assert.strictEqual(html.getAttribute('data-chal-intro'), null);
  env.host.enterChallenge();
  await env.runUntil(() => env.el('overlay-count').hidden === false, 30000);       // showScreen('game') 바로 뒤
  assert.strictEqual(env.el('screen-start').hidden, true);
  assert.strictEqual(html.getAttribute('data-chal-intro'), '', '게임 화면으로 바뀌는 순간 켜진다');
  await env.runFor(ms - 50);
  assert.strictEqual(html.getAttribute('data-chal-intro'), '', '전환(.9초) 동안은 유지');
  await env.runFor(100);
  assert.strictEqual(html.getAttribute('data-chal-intro'), null, '약 1초 뒤 걷힌다');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);          // 카운트다운은 그대로(시작이 늦어지지 않는다)
  env.I.state.score = 100;
  env.I.finishStage();
  env.el('btn-chal-again').click();                           // 결과 화면에서 [다시 도전] — 이미 게임 화면이다
  await env.runUntil(() => env.el('overlay-count').hidden === false, 30000);
  assert.strictEqual(html.getAttribute('data-chal-intro'), null, '시작 화면에서 들어온 것이 아니면 켜지 않는다');
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  env.I.leaveChallenge();
  await startStageAndWait(env, 'easy', 1);                     // 스테이지 시작은 배경 동작이 그대로(속성 없음)
  assert.strictEqual(html.getAttribute('data-chal-intro'), null);
  env.dispose();
  const still = createEnv(27);                                 // 기본 시험 환경 = 움직임 줄이기 켜짐
  still.host.enterChallenge();
  await still.runUntil(() => still.el('overlay-count').hidden === false, 30000);
  assert.strictEqual(still.doc.documentElement.getAttribute('data-chal-intro'), null, '움직임 줄이기면 속성을 달지 않는다');
  still.dispose();
});

test('enterChallenge 는 시작 화면에서만 쓸 수 있고(게임 중·레벨 선택 중에는 무시), 게이트를 거치지 않는다. [시작]의 게이트는 인자 없이 그대로 불린다', async () => {
  const env = createEnv(20);
  const asked = [];
  env.host.setStartGate((kind) => { asked.push(kind); return true; });
  env.el('btn-start').click();                                // 레벨 선택으로
  assert.strictEqual(env.I.state.phase, 'stages');
  assert.deepStrictEqual(asked, [undefined]);
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.phase, 'stages', '레벨 선택 중에는 무시');
  env.host.goHome();
  await startChal(env);
  const keep = env.I.state.gameId;
  env.host.enterChallenge();
  assert.strictEqual(env.I.state.gameId, keep, '게임 중에는 무시');
  assert.deepStrictEqual(asked, [undefined], '게이트는 더 불리지 않았다');
  env.dispose();
});

test('구조 등급 0 이 아니면 그 등급의 손잡이를 쓰고(CONFIG.board.grades), 등급 표에 없으면 균등 무작위로 폴백한다', async () => {
  const env = createEnv(21, (cfg) => { cfg.board.enabled = true; cfg.challenge.boardGrade = -0.5; });
  await startChal(env);
  const b = env.I.state.board;
  assert.deepStrictEqual(Object.assign({}, b), { s: -0.5, pair: 0.85, auto: 0.77, lo: 2, hi: 14, tries: env.CONFIG.board.tries });
  env.dispose();
  const none = createEnv(22, (cfg) => { cfg.board.enabled = true; cfg.challenge.boardGrade = 3; });
  await startChal(none);
  assert.strictEqual(none.I.state.board, null);
  none.dispose();
  const def = createEnv(23, (cfg) => { cfg.board.enabled = true; });
  await startChal(def);
  assert.strictEqual(def.I.state.board, null, '기본(0)은 보드 구조 규칙이 켜져 있어도 균등 무작위');
  def.dispose();
});

/* ===================================================================
 * ③ ranking.js — 제출 본문 s · 묶어서 제출 · ack · 기록 있음 · 지우기
 * =================================================================== */
const UUID = '123e4567-e89b-42d3-a456-426614174000';
function fakeClock() {
  let t = 1_700_000_000_000; let seq = 0; const q = [];
  return {
    now: () => t,
    timers: { set(fn, ms) { const id = ++seq; q.push({ id, at: t + ms, fn }); return id; }, clear(id) { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); } },
    pending: () => q.length,
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
function jsonRes(status, obj, headers) { return { status, headers: { get: (k) => (headers && headers[k]) || null }, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) }; }
const okMe = (extra, top) => Object.assign({ ok: true, v: 1, me: Object.assign({ pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3, hidden: 0, stars: { easy: 0, normal: 0, hard: 0, all: 0 }, score: 0 }, extra), changed: true, nickChangesLeft: 2, serverTime: 1 }, top);
const memStore = (initial) => { const m = Object.assign({}, initial); return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, remove: (k) => { delete m[k]; }, _m: m }; };
const registered = (extra) => memStore(Object.assign({ 'element-gems:profile:v1': JSON.stringify({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 }) }, extra));

/** best = 이 기기의 최고점. handler(url, init, n) 가 응답을 정한다(기본: 보낸 s 를 그대로 저장했다고 답하는 새 서버) */
function setup(o0) {
  const o = o0 || {};
  const clock = fakeClock();
  const calls = [];
  const events = [];
  const save = G.defaultSave();
  G.applyStageResult(save, 'normal', 1, 9000, true, 3, 70);
  if (o.best) save.challenge.best = o.best;
  const store = o.store || registered();
  let stored = o.serverScore || 0;
  const handler = o.handler || ((url, init) => {
    const b = init && init.body ? JSON.parse(init.body) : {};
    if (typeof b.s === 'number') stored = Math.max(stored, b.s);
    return jsonRes(200, okMe({ score: stored }));
  });
  const client = R.createClient({
    config: Object.assign({}, G.CONFIG.ranking, { apiBase: 'http://x.test/', timeoutMs: 8000 }, o.config),
    challenge: o.noChallengeConfig ? undefined : G.CONFIG.challenge,
    store,
    fetch: async (url, init) => { calls.push({ t: clock.now(), url, init, body: init && init.body ? JSON.parse(init.body) : null }); return handler(url, init, calls.length); },
    now: clock.now, timers: clock.timers, getSave: () => save, stageCount: 10,
    caps: { easy: 150, normal: 140, hard: 120 }, emit: (n, d) => events.push([n, d]),
    crypto: { randomUUID: () => UUID }, isOffline: () => !!o.offline
  });
  return { clock, calls, events, save, store, client, serverScore: () => stored };
}
const syncCalls = (t) => t.calls.filter((c) => /\/api\/sync$/.test(c.url));

test('buildSyncBody: s 는 0 이상 정수일 때만 싣고(null·undefined·소수·문자열·음수·NaN 은 생략), d 와 함께 직렬화한다', () => {
  const d = { easy: [1] };
  const has = (s) => 's' in JSON.parse(R.buildSyncBody({ pid: UUID, d, s }));
  assert.strictEqual(has(12340), true);
  assert.strictEqual(has(0), true);
  [undefined, null, 1.5, '5', -1, NaN, Infinity, true, [3]].forEach((s) => assert.strictEqual(has(s), false, String(s)));
  assert.strictEqual('s' in JSON.parse(R.buildSyncBody({ pid: UUID, d })), false, 's 를 주지 않으면 키 자체가 없다');
  const b = JSON.parse(R.buildSyncBody({ pid: UUID, d, s: 280000 }));
  assert.deepStrictEqual(Object.keys(b).sort(), ['d', 'pid', 's', 'v']);
  assert.ok(Number.isInteger(b.s));
});

test('normalizeRows: score(최고점)를 정수로 읽고, 없거나 이상하면 0(= 도전 기록 없음)', () => {
  const rows = R.normalizeRows([
    { nick: 'a', tag: 1, avatar: 3, stars: 5, score: 21450 }, { nick: 'b', tag: 2, avatar: 3, stars: 5 }, { nick: 'c', tag: 3, avatar: 3, stars: 5, score: -3 },
    { nick: 'd', tag: 4, avatar: 3, stars: 5, score: 1.5 }, { nick: 'e', tag: 5, avatar: 3, stars: 5, score: '99' }, { nick: 'f', tag: 6, avatar: 3, stars: 5, score: 0 }], 50);
  assert.deepStrictEqual(rows.map((r) => r.score), [21450, 0, 0, 0, 99, 0], '숫자로 읽히는 값만 받는다(소수·음수는 0)');
  assert.strictEqual(R.bestText(21450), '최고점 21,450');
  assert.strictEqual(R.bestText(0), '최고점 —');
  assert.strictEqual(R.bestLabel(21450), '최고점 21,450점');
  assert.strictEqual(R.bestLabel(0), '최고점 기록 없음');
});

test('묶어서 제출: 새 기록은 곧바로 보내지 않고 5분(submitDelaySec) 뒤에 d·s 를 함께 한 번 보낸다. s = min(최고점, scoreCap)', async () => {
  const t = setup({ best: 12340 });
  assert.strictEqual(t.client.markScore(), true);
  await t.clock.advance(299000);
  assert.strictEqual(syncCalls(t).length, 0, '5분이 되기 전에는 보내지 않는다');
  await t.clock.advance(2000);
  const c = syncCalls(t);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].body.s, 12340);
  assert.ok(c[0].body.d && c[0].body.d.normal[0] === 70, 'd 는 항상 함께');
  assert.deepStrictEqual(Object.keys(c[0].body).sort(), ['d', 'pid', 's', 'v']);
  assert.strictEqual(t.client.status().sdirty, false, '서버가 받았다고 답했으니 대기 표시가 꺼진다');
  assert.strictEqual(JSON.parse(t.store._m['element-gems:sync:v1']).sdirty, false);
  assert.deepStrictEqual(t.events.filter((e) => e[0] === 'synced').map((e) => e[1].scoreAcked), [true]);
  await t.clock.advance(3600000);
  assert.strictEqual(syncCalls(t).length, 1, '더 보내지 않는다');
});

test('s 는 상한(CONFIG.challenge.scoreCap)으로 줄여 보내고 항상 정수다', async () => {
  const t = setup({ best: 999999 });                           // 메모리 저장이 상한을 넘은 이상한 값이라도
  t.client.markScore();
  await t.clock.advance(301000);
  const s = syncCalls(t)[0].body.s;
  assert.strictEqual(s, 280000);
  assert.ok(Number.isInteger(s));
});

test('최고점이 없으면(0·없음) markScore 는 false 이고 어떤 요청 본문에도 s 키가 없다', async () => {
  const t = setup({});
  assert.strictEqual(t.client.markScore(), false);
  t.client.markDirty(0);
  await t.clock.advance(5000);
  const c = syncCalls(t);
  assert.strictEqual(c.length, 1);
  assert.strictEqual('s' in c[0].body, false);
  assert.strictEqual(t.client.status().sdirty, false);
  const noCfg = setup({ best: 5000, noChallengeConfig: true });         // 도전 설정이 없는 빌드(교육용 game.js 이식 전)
  assert.strictEqual(noCfg.client.markScore(), false);
  noCfg.client.markDirty(0);
  await noCfg.clock.advance(5000);
  assert.strictEqual('s' in syncCalls(noCfg)[0].body, false);
});

test('기다리는 동안 새 기록이 또 나오면 한 번만 보낸다(마지막 값). 그 사이 별 기록 제출에는 아직 s 가 없고, 최고점 차례는 사라지지 않는다', async () => {
  const t = setup({ best: 5000 });
  t.client.markScore();
  await t.clock.advance(60000);
  t.save.challenge.best = 7000;
  t.client.markScore();                                        // 1분 뒤 새 기록: 기다리는 시간이 다시 5분
  await t.clock.advance(120000);
  t.client.markDirty(0);                                       // 별 기록 개선이 끼어든다
  await t.clock.advance(5000);
  const mid = syncCalls(t);
  assert.strictEqual(mid.length, 1);
  assert.strictEqual('s' in mid[0].body, false, '아직 때가 안 됐으니 별 제출에는 s 가 없다');
  await t.clock.advance(400000);
  const all = syncCalls(t);
  assert.strictEqual(all.length, 2, '최고점은 5분이 지나면 그대로 한 번 올라간다');
  assert.strictEqual(all[1].body.s, 7000);
  assert.strictEqual(t.serverScore(), 7000);
});

test('도전을 나갈 때(flushScore)·탭이 숨겨질 때(onHidden)는 기다리지 않고 한 번 올린다. 서버 쓰기 간격(3초)은 지킨다', async () => {
  const t = setup({ best: 8000 });
  t.client.markScore();
  await t.clock.advance(1000);
  await t.client.flushScore();
  await settle();
  assert.strictEqual(syncCalls(t).length, 1);
  assert.strictEqual(syncCalls(t)[0].body.s, 8000);
  const h = setup({ best: 9000 });
  h.client.markScore();
  h.client.onHidden();
  await settle();
  assert.strictEqual(syncCalls(h).length, 1);
  assert.strictEqual(syncCalls(h)[0].body.s, 9000);
  await h.clock.advance(400000);
  assert.strictEqual(syncCalls(h).length, 1, '받았다고 답했으니 5분 타이머가 다시 보내지 않는다');
  assert.deepStrictEqual(Object.keys(await h.client.flushScore()), ['skipped'], '대기 중인 최고점이 없으면 아무것도 하지 않는다');
});

test('ack: 서버가 me.score 를 돌려주지 않으면(옛 Worker) 대기 표시가 남고, 즉시 다시 보내지 않으며, 다음 시작·온라인·새 개선 때 다시 보낸다', async () => {
  const handler = () => jsonRes(200, okMe({ score: undefined }));       // me.score 없음 = 옛 서버
  const t = setup({ best: 6000, handler });
  t.client.markScore();
  await t.clock.advance(301000);
  assert.strictEqual(syncCalls(t).length, 1);
  assert.strictEqual(t.client.status().sdirty, true, '받았다는 확인이 없다');
  assert.deepStrictEqual(t.events.filter((e) => e[0] === 'synced').map((e) => e[1].scoreAcked), [false]);
  await t.clock.advance(1800000);
  t.client.onHidden(); await settle();
  assert.strictEqual(syncCalls(t).length, 1, '30분 동안·탭이 숨겨져도 반복해서 보내지 않는다');
  t.client.onOnline();
  await t.clock.advance(2000);
  assert.strictEqual(syncCalls(t).length, 2, '연결이 돌아오면 다시 보낸다');
  assert.strictEqual(syncCalls(t)[1].body.s, 6000);
  // 새 실행(같은 저장소): start() 가 대기 중인 최고점을 바로 보낸다
  const t2 = setup({ best: 6000, handler, store: t.store });
  t2.client.start();
  await t2.clock.advance(2000);
  assert.strictEqual(syncCalls(t2).length, 1);
  assert.strictEqual(syncCalls(t2)[0].body.s, 6000);
  // 새 개선
  t.save.challenge.best = 6500;
  t.client.markScore();
  await t.clock.advance(301000);
  assert.strictEqual(syncCalls(t).slice(-1)[0].body.s, 6500);
});

test('ack: 서버 저장값(me.score)이 보낸 값보다 작거나 scoreRejected 면 올린 것으로 보지 않는다. 같거나 크면 올린 것', async () => {
  const lower = setup({ best: 9000, serverScore: 0, handler: () => jsonRes(200, okMe({ score: 1000 }, { scoreRejected: true })) });
  lower.client.markScore();
  await lower.clock.advance(301000);
  assert.strictEqual(lower.client.status().sdirty, true);
  const bigger = setup({ best: 9000, handler: () => jsonRes(200, okMe({ score: 15000 })) });     // 다른 기기가 더 높은 점수를 올려 둠
  bigger.client.markScore();
  await bigger.clock.advance(301000);
  assert.strictEqual(bigger.client.status().sdirty, false);
});

test('응답을 기다리는 사이에 더 높은 점수가 생기면 대기 표시가 남는다(새 markScore 의 5분 대기 그대로)', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const t = setup({ best: 5000, handler: async (url, init) => { await gate; return jsonRes(200, okMe({ score: JSON.parse(init.body).s })); } });
  t.client.markScore();
  await t.clock.advance(301000);
  t.save.challenge.best = 8000;
  t.client.markScore();
  release();
  await settle();
  assert.strictEqual(t.client.status().sdirty, true);
  await t.clock.advance(301000);
  assert.strictEqual(syncCalls(t).slice(-1)[0].body.s, 8000);
});

test('프로필이 없거나 서버가 꺼졌거나 "프로필 없이 시작"이면 markScore 는 아무것도 하지 않는다(서버로 보내지 않는다)', async () => {
  const noProfile = setup({ best: 5000, store: memStore() });
  assert.strictEqual(noProfile.client.markScore(), false);
  const off = setup({ best: 5000, config: { apiBase: '' } });
  assert.strictEqual(off.client.markScore(), false);
  const opt = setup({ best: 5000 });
  opt.client.setSessionOptOut(true);
  assert.strictEqual(opt.client.markScore(), false);
  await opt.clock.advance(400000);
  [noProfile, off, opt].forEach((t) => assert.strictEqual(t.calls.length, 0));
});

test('서버 실패·429: 점수는 이 기기에 남고 백오프로 다시 보낸다(게임은 영향 없음). 값만 거부하면(400 field s) 그 값은 포기하고 별 기록 제출은 막지 않는다', async () => {
  let n = 0;
  const t = setup({ best: 5000, handler: (u, i) => { n++; if (n === 1) return jsonRes(429, { ok: false, v: 1, error: { code: 'rate_limited', message: 'x' } }, { 'Retry-After': '60' }); return jsonRes(200, okMe({ score: JSON.parse(i.body).s })); } });
  t.client.markScore();
  await t.clock.advance(301000);
  assert.strictEqual(syncCalls(t).length, 1);
  assert.strictEqual(t.client.status().sdirty, true, '아직 못 올렸다');
  await t.clock.advance(61000);
  assert.strictEqual(syncCalls(t).length, 2);
  assert.strictEqual(t.client.status().sdirty, false);
  const bad = setup({ best: 5000, handler: () => jsonRes(400, { ok: false, v: 1, error: { code: 'progress_invalid', message: 'x', field: 's' } }) });
  bad.client.markScore();
  await bad.clock.advance(301000);
  assert.strictEqual(bad.client.status().sdirty, false, '그 값은 포기');
  assert.strictEqual(bad.client.status().blocked, false, '별 기록 제출은 막히지 않는다');
});

test('start(): 한 번도 동기화한 적 없고 최고점이 있으면 별 기록과 함께 올린다. 최고점이 없으면 s 는 없다', async () => {
  const t = setup({ best: 4000 });
  t.client.start();
  await t.clock.advance(2000);
  assert.strictEqual(syncCalls(t)[0].body.s, 4000);
  const z = setup({});
  z.client.start();
  await z.clock.advance(2000);
  assert.strictEqual('s' in syncCalls(z)[0].body, false);
});

test('"기록 있음" 판정: 최고점만 있는 기기도 새 프로필 판정표의 "기록 있음"이다(행 1 이어서 쓰기 / 행 4 지우고 만들기)', () => {
  const only = (best, extra) => registered(Object.assign({ 'element-gems:v1': JSON.stringify({ challenge: { best, last: best, plays: 1, rule: 2 } }) }, extra));
  const mk = (store, getSave) => R.createClient({ config: { apiBase: 'http://x.test/' }, store, fetch: async () => jsonRes(200, okMe()), getSave: getSave || (() => G.defaultSave()), challenge: C, crypto: { randomUUID: () => UUID } });
  const noHist = memStore({ 'element-gems:v1': JSON.stringify({ challenge: { best: 12340, last: 1, plays: 1, rule: 2 } }) });
  const a = mk(noHist).createMode();
  assert.deepStrictEqual([a.row, a.records, a.hasRecords, a.best, a.stars.total], [1, 'carry', true, 12340, 0]);
  const hist = only(12340, { 'element-gems:profile:v1': JSON.stringify({ skipped: true, hadProfile: true }) });
  const b = mk(hist).createMode();
  assert.deepStrictEqual([b.row, b.records], [4, 'wipe']);
  const none = memStore({ 'element-gems:profile:v1': JSON.stringify({ skipped: true, hadProfile: true }) });
  assert.deepStrictEqual([mk(none).createMode().row, mk(none).createMode().best], [3, 0], '기록이 정말 없으면 그대로 행 3');
  const mem = G.defaultSave(); mem.challenge.best = 777;
  assert.strictEqual(mk(memStore(), () => mem).createMode().row, 1, '저장소를 못 써도 메모리 저장의 최고점을 본다');
  assert.strictEqual(R.deviceBest(memStore({ 'element-gems:v1': '{깨짐', 'element-gems-edu:v1': JSON.stringify({ challenge: { best: 900 } }) })), 900, '두 앱 중 큰 값');
  assert.deepStrictEqual(R.deviceStars(memStore()), { gen: 0, edu: 0, total: 0 }, 'deviceStars 의 모양은 그대로');
  assert.strictEqual(R.bestOfSave({ challenge: { best: 1.5 } }), 0);
  assert.strictEqual(R.bestOfSave(null), 0);
});

test('새 프로필 만들기: 행 1(이어서 쓰기)은 d 와 s 를 함께 싣고, 행 2·3(싣지 않음)은 둘 다 없다', async () => {
  const sv = G.defaultSave(); sv.challenge.best = 12340;
  const calls = [];
  const mk = (store, save) => R.createClient({ config: { apiBase: 'http://x.test/', timeoutMs: 8000 }, store, challenge: C, crypto: { randomUUID: () => UUID }, getSave: () => save, fetch: async (u, i) => { calls.push(JSON.parse(i.body)); return jsonRes(200, okMe({ score: 12340 })); }, timers: { set: () => 1, clear: () => {} } });
  const carry = mk(memStore({ 'element-gems:v1': JSON.stringify(sv) }), sv);
  const res = await carry.saveProfile({ nick: '별빛냥', avatar: 3 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(calls[0].s, 12340);
  assert.ok(calls[0].d);
  assert.strictEqual(carry.status().sdirty, false, '확인(me.score)을 받았다');
  calls.length = 0;
  const fresh = mk(memStore(), G.defaultSave());
  await fresh.saveProfile({ nick: '새이름', avatar: 4 });
  assert.strictEqual('s' in calls[0], false);
  assert.strictEqual('d' in calls[0], false);
  calls.length = 0;
  const hist = mk(memStore({ 'element-gems:v1': JSON.stringify(sv), 'element-gems:profile:v1': JSON.stringify({ skipped: true, hadProfile: true }) }), sv);
  const w = await hist.saveProfile({ nick: '다시만듦', avatar: 5 });
  assert.strictEqual(w.wiped, true, '행 4: 지난 기록(최고점 포함)은 만들기에 성공한 뒤 지워진다');
  assert.strictEqual('s' in calls[0], false, '행 4 는 기록을 싣지 않는다');
});

test('지우기: 이 기기의 도전 기록도 함께 지워지고(서버 행은 남음), 못 올린 최고점은 지우기 직전 마지막 전송에 실린다', async () => {
  const sv = G.defaultSave(); sv.challenge = { best: 12340, last: 100, plays: 3, rule: 2 };
  const store = registered({ 'element-gems:v1': JSON.stringify(sv), 'element-gems:sync:v1': JSON.stringify({ sdirty: true, sat: 0, lastOkAt: 1 }) });
  const t = setup({ store, best: 12340 });
  assert.strictEqual(t.client.erasePending(), true, '최고점만 대기 중이어도 올릴 기록이 있다');
  const r = await t.client.eraseDevice();
  assert.strictEqual(r.ok, true);
  const body = syncCalls(t)[0].body;
  assert.strictEqual(body.s, 12340);
  assert.ok(!t.calls.some((c) => /\/api\/delete/.test(c.url)), '서버 삭제 호출 없음');
  const after = JSON.parse(store._m['element-gems:v1']);
  assert.ok(!('challenge' in after), '도전 기록이 지워졌다(설정 3개만 남는다)');
  assert.deepStrictEqual(Object.keys(after).sort(), ['cutin', 'muted', 'tutorialSeen'].filter((k) => k in after).sort());
  assert.strictEqual(R.deviceBest(store), 0);
  assert.strictEqual(G.parseSave(store._m['element-gems:v1']).challenge.best, 0, '다시 읽어도 0');
});

test('순위표: 행의 score(최고점)와 내 순위의 score 를 읽는다(목록 안/밖), 옛 서버 응답(score 없음)은 0', async () => {
  const rows = [{ rank: 1, nick: '별빛냥', tag: 427, avatar: 3, stars: 12, score: 21450 }, { rank: 2, nick: '다른이', tag: 1, avatar: 4, stars: 9 }];
  const t = setup({ handler: (url) => (/leaderboard/.test(url) ? jsonRes(200, { ok: true, v: 1, rows, of: 2, asOf: 1700000000 }) : jsonRes(404, {})) });
  const res = await t.client.fetchBoard('all');
  assert.deepStrictEqual(res.rows.map((r) => r.score), [21450, 0]);
  assert.strictEqual(res.me.score, 21450);
  const out = setup({ handler: (url) => (/leaderboard/.test(url) ? jsonRes(200, { ok: true, v: 1, rows: [rows[1]], of: 9, asOf: 1700000000 }) : jsonRes(200, { ok: true, v: 1, rank: 7, stars: 4, nick: '별빛냥', tag: 427, avatar: 3, of: 9, score: 8800 })) });
  const r2 = await out.client.fetchBoard('normal');
  assert.strictEqual(r2.me.rank, 7);
  assert.strictEqual(r2.me.score, 8800);
  assert.strictEqual(r2.me.inList, false);
  const old = setup({ handler: (url) => (/leaderboard/.test(url) ? jsonRes(200, { ok: true, v: 1, rows: [rows[1]], of: 9, asOf: 1700000000 }) : jsonRes(200, { ok: true, v: 1, rank: 7, stars: 4, nick: '별빛냥', tag: 427, avatar: 3, of: 9 })) });
  assert.strictEqual((await old.client.fetchBoard('normal')).me.score, 0);
});

/* ===================================================================
 * ④ 정적 점검 — index.html · style.css · ranking-ui.js · 두 앱 공용 파일
 * =================================================================== */
const START = HTML.slice(HTML.indexOf('<section id="screen-start"'), HTML.indexOf('<section id="screen-stages"'));
const OVERLAY = HTML.slice(HTML.indexOf('<div id="overlay-chal-end"'), HTML.indexOf('<!-- 프로필 안내 팝업'));

test('index.html 시작 화면(spec §46.10): 난이도 줄의 4번째 칸 "최고점 도전 모드"(radiogroup 의 네 번째 radio, 두 줄 라벨), 별도 [최고점 도전] 버튼·추천 딱지·부제는 없고, [시작]은 그대로, 규칙 줄 하나가 더 있다', () => {
  const group = /<div id="level-select" class="level-select" role="radiogroup" aria-label="난이도">([\s\S]*?)<\/div>/.exec(START)[1];
  const radios = group.match(/<button [^>]*role="radio"[^>]*>[\s\S]*?<\/button>/g);
  assert.strictEqual(radios.length, 4, '난이도 세 칸 + 4번째 칸');
  assert.deepStrictEqual(radios.map((r) => /data-level="(\w+)"/.exec(r)[1]), ['easy', 'normal', 'hard', 'challenge']);
  assert.strictEqual(radios[3], '<button class="level-btn lv-challenge" type="button" role="radio" aria-checked="false" data-level="challenge" tabindex="-1" aria-label="최고점 도전 모드">최고점<br>도전 모드</button>');
  assert.strictEqual(radios.filter((r) => /aria-checked="true"/.test(r)).length, 1, '처음에는 한 칸(중수)만 켜져 있다');
  ['btn-challenge', 'chal-sub', 'chal-badge', 'chal-btn', 'chal-ic', '추천'].forEach((w) => assert.ok(START.indexOf(w) === -1, '별도 버튼의 흔적이 없다: ' + w));
  const i = START.indexOf('id="level-select"'), d = START.indexOf('id="level-desc"'), j = START.indexOf('id="btn-start"'), k = START.indexOf('id="btn-hall"');
  assert.ok(i > 0 && d > i && j > d && k > j, '난이도 → 설명 → [시작] → [명예의 전당] 순서');
  assert.ok(/class="sc-cta">\s*<div id="level-select"[\s\S]*?id="btn-start"[^>]*>시작<\/button>\s*<\/div>\s*<button id="btn-hall"/.test(START), '난이도·설명·[시작]이 .sc-cta 묶음 안, 그 밖의 버튼은 없다');
  assert.ok(START.includes('<li class="rule-chal"><b>최고점 도전 모드</b> 2분 동안 점수를 최대한 모아요. 별이 같을 때 최고점이 높은 사람이 위에 올라요.</li>'));
  assert.ok(START.includes('<li><b>콤보</b> 쉬지 않고 계속 맞추면 콤보! 점수 배수가 올라가요(최대 ×3).</li>'), '기존 규칙 줄은 그대로');
  assert.strictEqual((HTML.match(/menu-screen/g) || []).length, 4, 'menu-screen 은 네 화면에만');
  assert.strictEqual((HTML.match(/<div\b/g) || []).length, (HTML.match(/<\/div>/g) || []).length, 'div 여닫음');
});

test('index.html 결과 오버레이: 대화상자 접근성(role·aria-modal·aria-labelledby), 제출 줄·결과 줄은 role=status, 버튼 3개, [명예의 전당 보기]는 기본 숨김', () => {
  assert.match(OVERLAY, /^<div id="overlay-chal-end" class="overlay" hidden role="dialog" aria-modal="true" aria-labelledby="chal-end-title">/);
  ['chal-end-title', 'chal-end-score', 'chal-end-new', 'chal-end-line', 'chal-end-cheer', 'chal-end-combo', 'chal-end-chain', 'chal-end-skills', 'chal-end-rank', 'btn-chal-again', 'btn-chal-hall', 'btn-chal-home'].forEach((id) => assert.ok(OVERLAY.includes('id="' + id + '"'), id));
  assert.ok(/id="chal-end-line" role="status"/.test(OVERLAY) && /id="chal-end-rank" role="status" hidden/.test(OVERLAY));
  assert.ok(/id="btn-chal-hall" class="btn" type="button" hidden>명예의 전당 보기</.test(OVERLAY), '명예의 전당이 꺼진 빌드에서는 보이지 않는다(ranking-ui 가 켠다)');
  assert.ok(OVERLAY.includes('>도전 끝!</h2>') && OVERLAY.includes('다시 도전') && OVERLAY.includes('돌아가기'));
  assert.ok(/<span aria-hidden="true">&#9733;<\/span> 새 기록!/.test(OVERLAY), '★ 는 장식(낭독은 "새 기록!")');
  assert.ok(!/TIME UP|실패/.test(OVERLAY), 'TIME UP·실패 표현 없음');
  assert.ok(/id="hall-rule" class="rule">점수가 같으면 최고점이 높은 순 \(그다음 남은 시간\)</.test(HTML));
  assert.ok(HTML.includes('보이는 정보는 닉네임·그림·별 수·최고점·순위뿐이에요.'));
});

test('새 마크업·글에 피하는 말(폭력·도박·보상·외부 링크)이 없다', () => {
  const added = START.slice(START.indexOf('<button class="level-btn lv-challenge"'), START.indexOf('</button>', START.indexOf('<button class="level-btn lv-challenge"'))) + START.slice(START.indexOf('<li class="rule-chal">'), START.indexOf('</li>', START.indexOf('<li class="rule-chal">'))) + OVERLAY;
  ['폭발', '대결', '공격', '싸움', '전투', '처치', '패배', '졌', '도박', '뽑기', '확률', '결제', '구매', '코인', 'http://', 'https://', '<a '].forEach((w) => assert.ok(added.indexOf(w) === -1, w));
});

test('style.css: 도전 블록이 정령 블록 앞에 하나 있고(:root·보드 크기식 없음), 4번째 칸은 칸 높이를 키우지 않고(높이는 .level-btn 의 44px 이상 그대로)·결과 버튼은 44px 이상, 글자 11px 이상, 감소 모션 "screen and" 형식', () => {
  const m = CSS.indexOf('최고점 도전 (spec §46)');
  const sp = CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)');
  assert.ok(m > 0 && CSS.indexOf('최고점 도전 (spec §46)', m + 1) === -1, '블록 하나');
  assert.ok(CSS.indexOf('미션 레벨 카드·설명판 (spec §27 M2') < m && m < sp && sp < CSS.indexOf('/* 메뉴 V1 (spec §32, U-A) */'), 'M2 블록 뒤, 정령 블록 앞');
  const block = CSS.slice(CSS.lastIndexOf('/*', m), CSS.lastIndexOf('/*', sp));
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/^\s*:root/m.test(code) && !/--board\s*:|--ui-h\s*:|--cell\s*:/.test(code));
  assert.ok(!/https?:\/\/|url\(|@font-face|backdrop-filter|blur\(|infinite/.test(code), '외부 주소·새 파일·글꼴·무한 반복 없음');
  const minH = (sel) => { const r = new RegExp('(?:^|\\n)' + sel.replace(/[.#[\]]/g, '\\$&') + ' \\{[^}]*?min-height:\\s*(\\d+)px').exec(code); return r && +r[1]; };
  assert.ok(minH('.panel .chal-buttons .btn') >= 44);
  assert.ok(!/btn-challenge|chal-btn|chal-ic|chal-txt|chal-badge/.test(code), '별도 [최고점 도전] 버튼의 규칙은 없다(spec §46.10)');
  const chipRules = (code.match(/\.level-select \.level-btn\.lv-challenge[^{]*\{[^}]*\}/g) || []).filter((r) => !/::before/.test(r.split('{')[0]));
  assert.ok(chipRules.length >= 3, '4번째 칸 규칙(기본·켜짐·좁은 화면 글자 크기)');
  chipRules.forEach((r) => assert.ok(!/(^|[^-])height\s*:|min-height|max-height/.test(r), '칸 높이를 건드리지 않는다(두 줄 라벨은 줄 높이·안쪽 여백으로 맞춘다): ' + r));
  assert.ok(/\.level-select \.level-btn\.lv-challenge \{[^}]*padding: 0 2px;[^}]*line-height: 1\.08;/.test(code), '두 줄 라벨: 안쪽 위아래 여백 0, 줄 높이 1.08');
  assert.ok(/\.level-select \.level-btn\.lv-challenge\.on \{[^}]*linear-gradient\(180deg, #d9f9ff 0%, #5fd3e8 46%, #2aa4c6 54%, #5fd3e8 100%\)/.test(code), '켜지면 하늘색 3단 그라데이션(위 하이라이트·가운데 띠)');
  assert.ok(/\.level-select \.level-btn\.lv-challenge::before \{[^}]*position: absolute;[^}]*width: 2px;/.test(code), '고수와의 사이에 가는 구분선');
  (code.match(/font-size:\s*[^;]+;/g) || []).forEach((d) => { const r = d.match(/(\d*\.?\d+)rem/); assert.ok(/max\(11px/.test(d) || (r && parseFloat(r[1]) * 16 >= 11), d); });
  assert.ok(/@media screen and \(prefers-reduced-motion: reduce\)/.test(block) && !/@media \(prefers-reduced-motion: reduce\)/.test(block));
  const red = code.match(/#[0-9a-f]{6}/gi) || [];
  red.forEach((h) => { const [r, g, b] = [1, 3, 5].map((x) => parseInt(h.slice(x, x + 2), 16)); assert.ok(!(r > 200 && g < 90 && b < 100), '빨간색 계열 없음: ' + h); });
});

test('style.css: 도전 화면의 글자색·바탕색 짝이 WCAG AA(4.5:1) 이상이다', () => {
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pairs = [
    ['#04323f', '#d9f9ff'], ['#04323f', '#5fd3e8'], ['#04323f', '#2aa4c6'],      // 4번째 칸(켜짐) 글자: 그라디언트 세 지점(가장 진한 띠 #2aa4c6 에서 4.71)
    ['#ffffff', '#0a4f6b'],                                                      // [도전 시작] 흰 글자와 그 가장자리(진한 청록)
    ['#04323f', '#a6eef8'], ['#04323f', '#5ad0e6'], ['#04323f', '#38bad6'],      // 결과 화면 [다시 도전] 버튼 글자
    ['#04323f', '#cdf1f8'], ['#05404f', '#c9f0f8'],                              // 규칙 줄 머리글자·도전 칩
    ['#ffffff', '#5b3df5'], ['#ffffff', '#6f57f7'],                              // 결과 리본
    ['#2a2160', '#ece6ff'],                                                      // 결과 한 줄
    ['#075468', '#ffffff'], ['#075468', '#f4efff'], ['#075468', '#ffe27a'], ['#075468', '#e7ecfb'], ['#075468', '#ffdcc2'],       // 순위표 최고점(일반 줄·시상대 1·2·3등)
    ['#4a2600', '#fff1a3'], ['#4a2600', '#ffc531'], ['#4a2600', '#ffd23f']       // 내 줄·내 순위 바
  ];
  pairs.forEach(([f, b]) => assert.ok(cr(f, b) >= 4.5, f + ' on ' + b + ' = ' + cr(f, b).toFixed(2)));
  ['#04323f', '#05404f', '#075468', '#cdf1f8', '#c9f0f8', '#a6eef8', '#5ad0e6', '#38bad6', '#d9f9ff', '#5fd3e8', '#2aa4c6', '#0a4f6b'].forEach((h) => assert.ok(CSS.includes(h), h + ' 가 style.css 에 쓰였다'));
});

test('ranking-ui.js: 순위표 규칙 문구·하단 안내·행 최고점·도전 이벤트 연결, 도전 모드가 없는 빌드(host.enterChallenge 없음)에서는 기존 동작 그대로', () => {
  assert.ok(UI.includes("'점수가 같으면 최고점이 높은 순 (그다음 남은 시간)' : '별이 같으면 최고점이 높은 순 (그다음 남은 시간)'"));
  assert.ok(UI.includes('보이는 정보는 닉네임·그림·별 수·최고점·순위뿐이에요.'));
  assert.ok(!UI.includes('남은 시간이 많은 순'));
  assert.ok(UI.includes('sc.appendChild(bestEl(best))') && UI.includes('R.bestText(best)') && UI.includes('R.bestLabel(r.score)') && UI.includes('R.bestLabel(me.score)'));
  assert.ok(UI.includes("host.on('challengeResult', onChallengeResult)") && UI.includes("host.on('openHall'"));
  assert.ok(UI.includes('client.flushScore()') && UI.includes('client.onHidden()') && UI.includes('client.markScore()'));
  assert.ok(UI.includes("typeof host.enterChallenge === 'function'"), '도전 이동은 host.enterChallenge 가 있을 때만');
  assert.ok(/function goNext\(kind\) \{\s*if \(kind === 'challenge' && typeof host\.enterChallenge === 'function'\) host\.enterChallenge\(\);\s*else host\.enterStages\(\);/.test(UI));
  assert.ok(UI.includes('host.setStartGate(startGate)') && /input\.records = ui\.createInfo\.records/.test(UI), '기존 연결은 그대로');
  assert.ok(UI.includes('challenge: host.CONFIG.challenge'));
});

/** 가짜 DOM 으로 ranking-ui.js 를 실제로 돌린다: 게이트(kind)·이어가기·순위표 글 */
function loadUi(withChallenge, fetchFn, o) {
  const opt = o || {};
  const ids = {};
  const mkEl = () => {
    const e = new FakeEl('div');
    e.replaceChildren = function (frag) { this.children = []; if (frag) { (frag.isFragment ? frag.children : [frag]).forEach((c) => { c.parentNode = this; this.children.push(c); }); frag.children = []; } };
    e.insertBefore = e.appendChild;
    e.scrollIntoView = () => {};
    e.querySelectorAll = () => [];
    return e;
  };
  const doc = {
    readyState: 'complete', hidden: false, documentElement: mkEl(),
    getElementById(id) { return ids[id] || (ids[id] = mkEl()); },
    createElement(t) { const e = mkEl(); e.tagName = String(t).toUpperCase(); return e; },
    createDocumentFragment() { const f = mkEl(); f.isFragment = true; return f; },
    createTextNode(t) { const e = mkEl(); e._text = String(t); return e; },
    addEventListener() {}, removeEventListener() {}
  };
  const calls = [];
  const lsData = {};
  const host = {
    CONFIG: JSON.parse(JSON.stringify(G.CONFIG)), calls,
    on(n, fn) { (host._l[n] = host._l[n] || []).push(fn); }, _l: {},
    getSave: () => opt.save || G.defaultSave(), showScreen: (n) => calls.push(['showScreen', n]), goHome: () => calls.push(['goHome']),
    setStartGate: (fn) => { host.gate = fn; }, enterStages: () => calls.push(['enterStages']), getPhase: () => 'start', writeSave() {}
  };
  host.CONFIG.ranking.apiBase = 'http://x.test';
  if (withChallenge) host.enterChallenge = () => calls.push(['enterChallenge']);
  else delete host.CONFIG.challenge;
  const timers = [];                                          // opt.manualTimers: setTimeout 은 쌓아 두기만 한다(눌러 줄 때만 실행) — 5분 뒤 제출 예약이 저절로 실행되지 않게
  if (opt.profile) {
    lsData['element-gems:profile:v1'] = JSON.stringify({ pid: UUID, pub: 'ABCD1234', nick: '별빛냥', tag: 427, avatar: 3 });
    lsData['element-gems:sync:v1'] = JSON.stringify({ dirty: false, lastOkAt: 1700000000000, fails: 0, nextTryAt: 0, blocked: false, blockedCode: '', sdirty: false, sat: 0 });   // 이미 한 번 동기화한 상태: start() 가 아무것도 예약하지 않는다
  }
  const win = {
    document: doc, ElementGemsHost: host, ElementGemsRanking: R, navigator: { onLine: true }, crypto: {}, location: { reload() {} },
    localStorage: { getItem: (k) => (k in lsData ? lsData[k] : null), setItem: (k, v) => { lsData[k] = String(v); }, removeItem: (k) => { delete lsData[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, setTimeout: opt.manualTimers ? (fn, ms) => { timers.push({ fn, ms }); return timers.length; } : (fn) => { fn(); return 1; }, clearTimeout() {}, scrollTo() {}, fetch: fetchFn || (async () => jsonRes(200, { ok: true, v: 1, rows: [], of: 0, asOf: 1 })),
    console
  };
  win.window = win;
  vm.createContext(win);
  if (opt.realRanking) vm.runInContext(read(root, 'ranking.js'), win, { filename: 'ranking.js' });     // ranking.js 도 같은 가짜 창 안에서 실행(타이머·저장소가 이 창의 것)
  vm.runInContext(UI, win, { filename: 'ranking-ui.js' });
  (host._l.init || []).forEach((fn) => fn());
  return { host, doc, win, ids, timers, lsData };
}

test('ranking-ui 실행: 프로필이 없을 때 [최고점 도전]의 안내 팝업은 "도전"을 기억하고, [프로필 없이 시작]이면 도전으로 이어간다(도전 없는 빌드는 레벨 선택)', () => {
  const a = loadUi(true);
  assert.strictEqual(a.host.gate('challenge'), false, '프로필이 없으니 팝업을 띄우고 멈춘다');
  assert.strictEqual(a.doc.getElementById('overlay-profile-ask').hidden, false);
  a.doc.getElementById('pa-without').click();
  assert.deepStrictEqual(a.host.calls.filter((c) => /enter/.test(c[0])), [['enterChallenge']]);
  const b = loadUi(true);
  assert.strictEqual(b.host.gate(), false);
  b.doc.getElementById('pa-without').click();
  assert.deepStrictEqual(b.host.calls.filter((c) => /enter/.test(c[0])), [['enterStages']], '[시작]은 레벨 선택으로');
  const c = loadUi(false);                                      // 도전 모드가 없는 앱(교육용 game.js 이식 전)
  c.host.gate('challenge');
  c.doc.getElementById('pa-without').click();
  assert.deepStrictEqual(c.host.calls.filter((x) => /enter/.test(x[0])), [['enterStages']]);
  assert.strictEqual(typeof c.host._l.challengeResult[0], 'function', '리스너는 걸려 있어도 이벤트가 없으면 아무 일도 없다');
});

test('ranking-ui 실행: [프로필 만들기]로 가면 저장 뒤 원래 가려던 곳(도전)으로 이어가고, 순위표 각 줄에 "최고점"(없으면 "—")과 새 규칙 문구가 보인다', async () => {
  const rows = [{ rank: 1, nick: '별빛마법사', tag: 1203, avatar: 1, stars: 180, score: 21450 }, { rank: 2, nick: '숲속요정', tag: 5521, avatar: 2, stars: 180 }];
  const u = loadUi(true, async (url) => jsonRes(200, /leaderboard/.test(url) ? { ok: true, v: 1, rows, of: 2, asOf: 1700000000 } : { ok: true, v: 1 }));
  u.host.gate('challenge');
  u.doc.getElementById('pa-create').click();
  assert.deepStrictEqual(u.host.calls.filter((c) => c[0] === 'showScreen').slice(-1)[0], ['showScreen', 'profile']);
  u.doc.getElementById('btn-hall').click();
  await settle();
  const list = u.doc.getElementById('hall-list');
  assert.strictEqual(list.children.length, 2);
  const txt = (li) => li.children.map((c) => c.textContent).join('|');
  assert.match(list.children[0].textContent, /최고점 21,450/);
  assert.match(list.children[1].textContent, /최고점 —/);
  assert.match(list.children[0].getAttribute('aria-label'), /1위, 별빛마법사 번호 1203, 별 점수 180점, 최고점 21,450점$/);
  assert.match(list.children[1].getAttribute('aria-label'), /최고점 기록 없음$/);
  assert.strictEqual(u.doc.getElementById('hall-rule').textContent, '점수가 같으면 최고점이 높은 순 (그다음 남은 시간)');
  assert.match(u.doc.getElementById('hall-foot').textContent, /닉네임·그림·별 수·최고점·순위뿐이에요\./);
  assert.ok(txt(list.children[0]).length > 0);
});

/* ---- Review R-C 후속 3건(spec §46.10): 429 대기 · 320px 순위표 줄 · 시작 화면 복귀 시 flushScore ---- */
test('429(rate_limited): 대기는 Retry-After 값만 쓴다 — 연달아 429 를 받아도 실패 횟수 백오프(5초→…→15분)로 늘어나지 않는다. 헤더가 없으면 쓰기 간격. 네트워크·5xx 실패의 백오프는 그대로', async () => {
  const body429 = { ok: false, v: 1, error: { code: 'rate_limited', message: 'x' } };
  const t = setup({ best: 5000, handler: () => jsonRes(429, body429, { 'Retry-After': '20' }) });
  t.client.markScore();
  await t.clock.advance(301000);                               // 5분 뒤 첫 제출
  assert.strictEqual(syncCalls(t).length, 1);
  const lastAt = (x) => syncCalls(x).slice(-1)[0].t;          // 마지막 제출을 보낸 가상 시각
  for (let i = 1; i <= 7; i++) {                               // 옛 코드는 6번째부터 max(20초, 백오프 5분·15분)을 기다렸다
    const n = syncCalls(t).length, at = lastAt(t);
    await t.clock.advance(at + 19500 - t.clock.now());
    assert.strictEqual(syncCalls(t).length, n, i + '번째 연속 429 뒤 20초 전에는 다시 보내지 않는다');
    await t.clock.advance(1000);
    assert.strictEqual(syncCalls(t).length, n + 1, i + '번째 연속 429 뒤 20초가 지나면 다시 보낸다(Retry-After 값만)');
  }
  assert.strictEqual(t.client.status().fails, 0, '429 는 실패 횟수를 올리지 않는다');
  assert.strictEqual(t.client.status().sdirty, true, '점수는 이 기기에 남아 있고 대기 표시도 그대로');
  const gap = G.CONFIG.ranking.minSubmitGapMs;                 // 헤더가 없는 429 는 서버 쓰기 간격만 기다린다
  const noHeader = setup({ best: 5000, handler: () => jsonRes(429, body429) });
  noHeader.client.markScore();
  await noHeader.clock.advance(301000);
  for (let i = 1; i <= 6; i++) {
    const n = syncCalls(noHeader).length, at = lastAt(noHeader);
    await noHeader.clock.advance(at + gap - 500 - noHeader.clock.now());
    assert.strictEqual(syncCalls(noHeader).length, n);
    await noHeader.clock.advance(1000);
    assert.strictEqual(syncCalls(noHeader).length, n + 1, '헤더 없는 429 ' + i + '번째: 쓰기 간격(' + gap + 'ms) 뒤');
  }
  // 5xx 는 백오프(5초 → 15초 → 60초)가 그대로다
  const srv = setup({ best: 5000, handler: () => jsonRes(500, { ok: false, v: 1, error: { code: 'server_error', message: 'x' } }) });
  srv.client.markScore();
  await srv.clock.advance(301000);
  assert.strictEqual(syncCalls(srv).length, 1);
  for (const [i, wait] of [[2, 5000], [3, 15000], [4, 60000]]) {
    await srv.clock.advance(lastAt(srv) + wait - 500 - srv.clock.now());
    assert.strictEqual(syncCalls(srv).length, i - 1, '실패 ' + (i - 1) + '번째 뒤 ' + wait + 'ms 전');
    await srv.clock.advance(1000);
    assert.strictEqual(syncCalls(srv).length, i, '실패 ' + (i - 1) + '번째 뒤 ' + wait + 'ms 뒤');
  }
  assert.strictEqual(srv.client.status().fails, 4, '5xx 는 실패 횟수를 올린다(네 번 실패)');
  // 429 와 5xx 가 섞여도 429 는 횟수를 올리지 않는다
  let k = 0;
  const mix = setup({ best: 5000, handler: () => (++k === 2 ? jsonRes(429, body429, { 'Retry-After': '30' }) : jsonRes(500, { ok: false, v: 1, error: { code: 'server_error', message: 'x' } })) });
  mix.client.markScore();
  await mix.clock.advance(301000);                             // 500 (fails 1)
  await mix.clock.advance(lastAt(mix) + 5500 - mix.clock.now());   // 5초 뒤 429
  assert.strictEqual(syncCalls(mix).length, 2);
  assert.strictEqual(mix.client.status().fails, 1, '429 는 횟수를 올리지 않는다');
  await mix.clock.advance(lastAt(mix) + 29500 - mix.clock.now());
  assert.strictEqual(syncCalls(mix).length, 2);
  await mix.clock.advance(1000);
  assert.strictEqual(syncCalls(mix).length, 3, '429 뒤에는 Retry-After(30초)');
});

test('순위표 줄의 "최고점 N"은 최고·점·숫자 세 조각이고(글은 R.bestText 와 같다), 폭 340px 이하에서만 "점"을 감춘다(style.css). 넓은 화면의 순위표 규칙은 그대로다', async () => {
  const rows = [{ rank: 4, nick: '반짝반짝별빛곰돌', tag: 90, avatar: 4, stars: 174, score: 21450 }, { rank: 5, nick: '숲속요정', tag: 5521, avatar: 2, stars: 170 }];
  const u = loadUi(true, async (url) => jsonRes(200, /leaderboard/.test(url) ? { ok: true, v: 1, rows, of: 2, asOf: 1700000000 } : { ok: true, v: 1 }));
  u.host.gate('challenge');
  u.doc.getElementById('pa-create').click();
  u.doc.getElementById('btn-hall').click();
  await settle();
  const list = u.doc.getElementById('hall-list');
  const bsOf = (li) => li.children[li.children.length - 1].children.find((c) => c.className === 'bs');
  const a = bsOf(list.children[0]);
  assert.deepStrictEqual(a.children.map((c) => [c.tagName, c.className, c.textContent]), [['DIV', '', '최고'], ['I', 'bj', '점'], ['DIV', '', ' 21,450']].map(([tag, cls, txt]) => (tag === 'DIV' ? ['DIV', cls, txt] : [tag, cls, txt])));
  assert.strictEqual(a.textContent, R.bestText(21450), '조각을 이어 붙이면 예전과 같은 글이다(낭독은 줄의 aria-label)');
  assert.strictEqual(bsOf(list.children[1]).textContent, R.bestText(0));
  assert.deepStrictEqual(bsOf(list.children[1]).children.map((c) => c.textContent), ['최고', '점', ' —']);
  // CSS: 340px 이하에서만 .bj 를 감춘다. 다른 폭의 .bs 규칙은 그대로(글자 크기 .7rem·줄 바꿈 없음)
  assert.ok(/@media \(max-width: 340px\) \{\s*\.hr \.sc \.bs \.bj, \.myrank \.sc \.bs \.bj \{ display: none; \}\s*\}/.test(CSS));
  assert.strictEqual((CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.bj\b/g) || []).length, 2, '.bj 규칙은 그 한 곳뿐');
  assert.ok(/\.hr \.sc \.bs, \.myrank \.sc \.bs \{ margin: 0; font-size: \.7rem; font-weight: 800; line-height: 1\.2; white-space: nowrap;/.test(CSS), '.bs 기본 규칙은 그대로');
});

test('실행(ranking-ui + ranking): 새 기록은 5분 타이머로 예약만 되고, 시작 화면으로 돌아오면(renderStart 이벤트) flushScore() 가 바로 불려 제출 본문에 s 가 실린다. 새 기록이 없으면 아무것도 보내지 않는다', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null }); return jsonRes(200, okMe({ score: init && init.body ? JSON.parse(init.body).s || 0 : 0 })); };
  const sv = G.defaultSave();
  const u = loadUi(true, fetchFn, { realRanking: true, manualTimers: true, profile: true, save: sv });
  assert.ok(u.host._l.renderStart && u.host._l.challengeResult, 'ranking-ui 가 두 이벤트에 연결됐다');
  assert.strictEqual(u.timers.length, 0, '시작 직후 예약된 것이 없다');
  sv.challenge.best = 7777;                                    // game.js 가 applyChallengeResult 로 저장하는 값
  u.host._l.challengeResult.forEach((fn) => fn({ score: 7777, prev: 0, best: 7777, newBest: true, first: true }));
  await settle();
  assert.strictEqual(calls.length, 0, '새 기록은 곧바로 보내지 않는다');
  assert.ok(u.timers.some((x) => x.ms >= 300000), '5분(submitDelaySec) 뒤로 예약만 됐다');
  u.host._l.renderStart.forEach((fn) => fn());                 // 도전을 나가 시작 화면으로 돌아왔다(game.js 의 goHome 이 내는 이벤트)
  await settle();
  assert.strictEqual(calls.length, 1, 'flushScore() 가 불려 지금 한 번 올렸다');
  assert.match(calls[0].url, /\/api\/sync$/);
  assert.strictEqual(calls[0].body.s, 7777, '제출 본문에 최고점 s');
  assert.strictEqual(calls[0].body.pid, UUID);
  assert.strictEqual(JSON.parse(u.lsData['element-gems:sync:v1']).sdirty, false, '올렸으니 대기 표시가 꺼졌다');
  u.host._l.renderStart.forEach((fn) => fn());
  await settle();
  assert.strictEqual(calls.length, 1, '또 돌아와도 더 보내지 않는다(대기 중인 것이 없다)');
  const none = [];
  const idle = loadUi(true, async (url, init) => { none.push(url); return jsonRes(200, okMe()); }, { realRanking: true, manualTimers: true, profile: true, save: G.defaultSave() });
  idle.host._l.challengeResult.forEach((fn) => fn({ score: 100, prev: 500, best: 500, newBest: false, first: false }));   // 못 넘은 판
  idle.host._l.renderStart.forEach((fn) => fn());
  await settle();
  assert.strictEqual(none.length, 0, '새 기록이 없으면 시작 화면으로 돌아와도 아무것도 보내지 않는다');
});

test('두 앱 동기화: ranking-ui.js·style.css 는 교육용과 바이트가 같고, ranking.js 는 동기화 키 한 줄([EDU] 주석 포함)만 다르다', () => {
  const edu = path.join(repo, 'apps', 'element-gems-edu');
  assert.strictEqual(fs.readFileSync(path.join(edu, 'ranking-ui.js')).compare(fs.readFileSync(path.join(root, 'ranking-ui.js'))), 0);
  assert.strictEqual(fs.readFileSync(path.join(edu, 'style.css')).compare(fs.readFileSync(path.join(root, 'style.css'))), 0);
  const g = read(root, 'ranking.js');
  const e = read(edu, 'ranking.js');
  const normalized = e.split('\n').filter((l) => l.indexOf('// [EDU]') === -1).join('\n').replace("sync: 'element-gems-edu:sync:v1'", "sync: 'element-gems:sync:v1'");
  assert.strictEqual(normalized, g);
  assert.ok(g.indexOf('[EDU]') === -1, '일반용에는 [EDU] 표식이 없다');
});
