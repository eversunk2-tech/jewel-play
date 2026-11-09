/* 교육용 미션(목표) 엔진·HUD·레벨 카드·설명판 시험 — spec §27.3.1(카운트 규칙)·§27.8(HUD 문구·접근성)·§27.9 M1·M2·M3-A(일반용 미션 엔진을 교육용에 그대로 이식).
 * 실행: node --test apps/element-gems-edu/test/*.test.js
 * 일반용 apps/element-gems/test/mission.test.js(M1·M2)를 교육용 game.js·하네스(교육용 저장 키·? 선물상자 spawn=0)에 맞게 옮긴 것이다. 교육용 추가 항목은 "[EDU]" 로 표시했다.
 *
 * ① 카운트 규칙(순수 함수) ② CONFIG.stages 형식·폴백 ③ 실제 판 흐름(가짜 DOM + 가상 시계로 교육용 game.js 를 그대로 실행) ④ HUD·레벨 카드·설명판 마크업
 * ⑤ 새 문구의 "피하는 말" 점검 ⑥ goalType 을 점수로 되돌리면 이식 전과 같은 판이 된다는 증거(롤백 스위치)
 * ⑦ [EDU] 일반용과 같은 본문(순수 함수·CONFIG.stages 미션 키·HUD/카드/설명판 블록)·같은 표·같은 시드 판 흐름 / 점수 목표 ×1.2 는 점수형에만 / ? 포함 그룹의 COLLECT·BIG 카운트 / 문제 팝업·정답 보너스와 미션
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
const GEN_DIR = path.join(root, '..', 'element-gems');          // 일반용: 읽기 전용으로 비교에만 쓴다(없으면 비교 시험은 건너뜀)
const HAS_GEN = fs.existsSync(path.join(GEN_DIR, 'game.js'));
const GEN = HAS_GEN ? require(path.join(GEN_DIR, 'game.js')) : null;
const GEN_SRC = HAS_GEN ? fs.readFileSync(path.join(GEN_DIR, 'game.js'), 'utf8') : '';
const skipGen = HAS_GEN ? false : '일반용 폴더 없음';
const SAVE_KEY = { edu: 'element-gems-edu:v1', gen: 'element-gems:v1' };      // 저장 키(교육용 CONFIG.edu.storageKey / 일반용)

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
test('CONFIG.stages: goalType 세 키가 score|mission 이고 초보는 score 로 고정, M2 기본값은 초보 점수제·중수·고수 미션형이며 점수 폴백 표는 그대로 있다', () => {
  const S = G.CONFIG.stages;
  assert.deepStrictEqual(Object.keys(S.goalType).sort(), ['easy', 'hard', 'normal']);
  Object.keys(S.goalType).forEach((k) => assert.ok(S.goalType[k] === 'score' || S.goalType[k] === 'mission', k));
  assert.strictEqual(S.goalType.easy, 'score', '초보는 항상 점수 목표(spec §33)');
  assert.deepStrictEqual(S.goalType, { easy: 'score', normal: 'mission', hard: 'mission' }, 'M2 기본값: 초보는 점수제, 중수·고수는 미션형(점수 목표로 되돌리는 롤백 스위치는 goalType 을 score 로)');
  assert.ok(Array.isArray(S.missions.normal) && Array.isArray(S.missions.hard));
  assert.strictEqual(S.missions.easy, undefined, '초보에는 미션 표가 없다');
  assert.strictEqual(S.missionMaxParts, 4);
  assert.strictEqual(S.missionMaxChips, 2, '동시에 보이는 칩 상한(review.md §24-7)');
  assert.deepStrictEqual(S.special, [5, 10]);
  assert.deepStrictEqual(S.rest, [3, 6, 9]);
  assert.strictEqual(S.targets.normal.length, 10, '점수 폴백 표는 그대로 있다');
  assert.strictEqual(S.targets.hard.length, 10);
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
    S.missions.hard = [];                       // M2 부터 고수 표가 채워져 있으므로 "표 없음"은 비워서 만든다
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
// 교육용 game.js 는 자체 __EG_TEST__.internals 를 이미 만들지만, 이 시험은 아래 목록으로 덮어쓴다(일반용과 같은 목록; 교육용 전용 addBonus 는 있을 때만)
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, hud: hud, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, goStages: goStages, typeGrid: typeGrid, setGemType: setGemType, listMoves: listMoves, renderStages: renderStages, goalMet: goalMet, renderLevelUi: renderLevelUi, pauseGame: pauseGame, resumeGame: resumeGame, reshuffleBoard: reshuffleBoard, addBonus: typeof addBonus === 'function' ? addBonus : null }; }\n";
assert.ok(SRC.indexOf(HOOK_TAIL) !== -1, 'game.js 끝부분을 찾지 못함');
const SCRIPT = new vm.Script(SRC.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: 'edu/game.js' });
const SCRIPT_GEN = HAS_GEN ? new vm.Script(GEN_SRC.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: 'general/game.js' }) : null;

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

/** cfgPatch(CONFIG): 시험용 복사본(샌드박스)의 CONFIG 만 바꾼다. 새 칸 종류는 sandbox.__forced 로 정한다(reduceMotion 이라 입자 난수는 쓰지 않는다).
 *  opts.which: 'edu'(기본) | 'gen'(일반용, 같은 시드 비교용). [EDU] 교육용은 기본으로 ? 선물상자가 나오지 않게(spawn 0) 해서 일반용과 같은 난수 흐름으로 시험한다 — ? 시험은 보드에 직접 놓는다 */
function createEnv(seed, cfgPatch, opts) {
  const o = opts || {};
  const env = { _now: 0, _seq: 0, _q: [], errors: [], rnd: 0, which: o.which === 'gen' ? 'gen' : 'edu' };
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
  (env.which === 'gen' ? SCRIPT_GEN : SCRIPT).runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store;
  env.saveKey = SAVE_KEY[env.which];
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.setQuiz = (quiz) => { sandbox.EduQuiz = quiz; };
  env.CONFIG.board.enabled = false;                          // 새 칸 종류를 시험이 정한다(§26 구조 규칙은 끈다)
  if (env.CONFIG.edu) env.CONFIG.edu.wild.spawn = 0;         // [EDU] ? 선물상자가 나오지 않게(기본)
  if (env.CONFIG.edu) env.CONFIG.edu.defaultIntensity = 'normal';   // [EDU] 시험 도구(spec §27.7 M3-B): 이 파일의 시험은 문제 양 "보통"(= M3-A 직후의 공급·목표)을 전제로 한다
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
/** 시험 도구(spec §27.9.3): 중수·고수 판이 "점수 목표"라는 전제로 쓴 시험은 goalType 을 명시적으로 'score' 로 둔다(M2 부터 기본이 미션형이라) */
function scoreCfg(cfg) {
  cfg.stages.goalType.normal = 'score';
  cfg.stages.goalType.hard = 'score';
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
test('HUD(점수형 — 초보 기본, 중수는 goalType 을 score 로 되돌린 경우): 목표 바만 보이고 #mission 은 숨겨져 있으며 칩이 없다', async () => {
  const env = createEnv(20, scoreCfg);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.strictEqual(I.state.mission, null);
  assert.strictEqual(I.el.goal.hidden, false);
  assert.strictEqual(I.el.mission.hidden, true);
  assert.strictEqual(I.el['mission-list'].children.length, 0);
  assert.strictEqual(I.el['screen-game'].dataset.goal, 'score');
  assert.strictEqual(I.el['screen-game'].dataset.chips, undefined);
  assert.match(I.el['goal-text'].textContent, /^0 \/ 17,900$/);      // [EDU] spec §28.7.5 중수 1단계 점수 폴백 표 값 14,900 × 1.2 (100점 단위 반올림)
  assert.strictEqual(I.el['count-info'].textContent, '레벨 1 · 목표 17,900점');
  assert.strictEqual(I.el['pause-level'].textContent, '중수 · 레벨 1 · 목표 17,900');
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

test('레벨 카드(점수형 — 중수를 goalType score 로 되돌린 경우): 마크업이 M1 이전과 완전히 같다(.sc-target, .sc-mis, .sc-tag 없음)', () => {
  const env = createEnv(30, scoreCfg);
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
    // M4(spec §27.6): 5·10단계 카드의 aria-label 에만 정령 이름이 더해진다(보이는 마크업 innerHTML 은 그대로). 정령 이름은 spec §27.6.1 표(중수 5 풀 · 10 불)에서 따로 적었다
    const who = i === 5 ? '잠든 풀 정령, ' : (i === 10 ? '잠든 불 정령, ' : '');
    assert.strictEqual(b.getAttribute('aria-label'), '레벨 ' + i + ', ' + who + '목표 ' + t + '점, ' + (open ? '별 ' + rec.stars + '개' : '잠김'));
    assert.ok(b.innerHTML.indexOf('sc-mis') === -1);
  });
  env.dispose();
});

test('레벨 카드(미션형): .sc-mis 요약 — 보석 그림+개수 / 연쇄·큰 매치 횟수 / "N가지 미션". 초보 카드에는 만들지 않는다', () => {
  const env = createEnv(31, (cfg) => {
    cfg.stages.goalType.normal = 'mission';
    cfg.stages.missionMaxChips = 3;                 // 시험 도구: 동시 칩 3개짜리 정의(레벨 5)도 카드 요약("3가지 미션")을 보이려고 상한을 풀어 둔다(상한 자체는 아래 P1 시험)
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
  assert.strictEqual(c[0].dataset.kind, undefined, '레벨 1 은 특별도 쉬어가는 구간도 아니라 data-kind 가 없다');
  assert.strictEqual(c[4].dataset.kind, 'special', '레벨 5 는 특별 레벨 — M2 가 data-kind 와 "특별" 태그를 만든다');
  assert.ok(c.every((b, k) => (b.innerHTML.indexOf('sc-tag') !== -1) === (k === 4)), '"특별" 태그는 특별 레벨(5·10) 카드에만');
  assert.ok(c.every((b) => b.innerHTML.indexOf('sc-sp') === -1), '정령은 M4 의 몫이라 만들지 않는다');
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

test('style.css: 미션 HUD 블록이 하나 있고, 점수형 레이아웃 규칙은 data-goal="mission" 으로만 걸린다', () => {
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
  // 일반용 style.css 에도 똑같이 들어 있다(두 앱 style.css 일치)
  if (HAS_GEN) {
    const gen = fs.readFileSync(path.join(GEN_DIR, 'style.css'), 'utf8');
    assert.strictEqual(gen.slice(gen.indexOf(marker)), block);
  }
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
  const out = { trace, rnd: env.rnd, end: env.doc.getElementById('end-title').textContent, endTarget: env.doc.getElementById('end-target').textContent, save: env.store[env.saveKey], goalHidden: I.el.goal.hidden, missionHidden: I.el.mission.hidden, errors: env.errors.length };
  env.dispose();
  return out;
}

test('무변화: goalType 을 mission 으로 켜도 미션 정의가 없거나 틀리면 점수형과 같은 판이 나온다(보드·점수·시간·난수 호출 수·저장 모두 같다)', async () => {
  for (const seed of [3, 4, 5]) {
    const base = await scriptedGame(scoreCfg, seed);                       // 점수형 = 롤백 스위치(M2 부터 기본이 미션형이라 명시한다)
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
  const env = createEnv(40, scoreCfg);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.strictEqual(I.state.target, 17900, '[EDU] 교육용 점수 목표 = 14,900 × 1.2');
  [0, 17899, 17900, 17901, 99999].forEach((s) => { I.state.score = s; assert.strictEqual(I.goalMet(), G.isCleared(s, I.state.target), String(s)); });
  I.state.target = 0;
  I.state.score = 10;
  assert.strictEqual(I.goalMet(), false, '목표 0 은 달성이 아니다(isCleared 와 같다)');
  env.dispose();
});

/* ===================================================================
 * 9) M2 — 중수·고수 미션 켜기, 레벨 카드 마크업 계약, 선택 레벨 설명판 (spec §27.9 M2, §32.5.2~§32.5.4, §33, §34)
 * 미션 표 값은 §36(M2-CAL)에서 다시 보정한 값이다. 표 값을 단언하는 시험은 "표 값 고정" 한 곳뿐이고, 나머지는 표 모양(형식)과 CONFIG 에서 읽은 값으로 검사한다.
 * =================================================================== */
const DIFFS = ['easy', 'normal', 'hard'];
const TABLE_LV = ['normal', 'hard'];
const AVOID_ALL = ['보스', '몬스터', '전투', '싸움', '대결', '공격', '때리', '쓰러뜨', '처치', '무찌르', '물리치', '체력', 'HP', '데미지', '피해', '죽다', '죽는', '사망', 'KO', '파괴', '부수', '패배', '졌다', '졌어', '쉬어가'];
const STANDALONE_JEOK = /(^|[\s,·(→])적($|[\s,·)→])/;
const stripTags = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const fire = (elm, type, evt) => (elm._ls[type] || []).forEach((fn) => fn(evt));
const cardOf = (env, n) => env.I.el['stage-grid'].children[n - 1];
const onCard = (c, extra) => Object.assign({ target: { closest: (sel) => (sel === '.stage-card' ? c : null) } }, extra);
/** CONFIG.stages 의 일부를 임시로 바꿔 순수 함수(공유 모듈 G)를 시험한다. 끝나면 되돌린다 */
function withStages(patch, fn) {
  const S = G.CONFIG.stages;
  const saved = JSON.stringify([S.goalType, S.missions, S.missionMaxChips]);
  try { patch(S); return fn(); } finally {
    const [a, b, c] = JSON.parse(saved);
    S.goalType = a; S.missions = b; S.missionMaxChips = c;
  }
}
const C = (color, need) => ({ k: 'collect', color, need });
const E = (colors, need) => ({ k: 'collectEach', colors, need });
const B = (min, need) => ({ k: 'big', min, need });
const K = (min, need) => ({ k: 'chain', min, need });

test('M2 표 모양: 중수·고수 10칸씩 모두 올바른 정의, 특별(5·10)만 차례대로(seq), 동시 칩 ≤ 2·차례 단계 ≤ 4, 색 번호 0~5, 초보에는 표가 없다', () => {
  const S = G.CONFIG.stages;
  assert.strictEqual(S.missions.easy, undefined, '초보는 항상 점수제(spec §33)');
  TABLE_LV.forEach((lv) => {
    assert.strictEqual(S.missions[lv].length, S.count, lv + ' 표 10칸');
    S.missions[lv].forEach((d, i) => {
      const n = i + 1;
      const tag = lv + ' 레벨 ' + n;
      assert.ok(G.missionValid(d), tag + ' 올바른 정의');
      const special = S.special.indexOf(n) !== -1;
      assert.strictEqual(d.seq === true, special, tag + ': 차례대로(seq)는 특별 레벨(5·10)뿐');
      if (d.seq) assert.ok(d.parts.length >= 2 && d.parts.length <= S.missionMaxParts, tag + ' 단계 수');
      else assert.ok(d.parts.length >= 1 && d.parts.length <= S.missionMaxChips, tag + ' 동시 칩 수');
      d.parts.forEach((p) => {
        assert.ok(Number.isInteger(p.need) && p.need >= 1, tag + ' need');
        if (p.k === 'collect') assert.ok(Number.isInteger(p.color) && p.color >= 0 && p.color <= 5, tag + ' 색 번호');
        if (p.k === 'collectEach') p.colors.forEach((c) => assert.ok(Number.isInteger(c) && c >= 0 && c <= 5, tag + ' 색 번호'));
      });
    });
    S.rest.forEach((n) => assert.ok(!S.missions[lv][n - 1].seq, lv + ' 레벨 ' + n + ': 3·6·9단계는 차례대로 미션이 아니다'));
  });
});

test('M2 표 값 고정(spec §36 M2-CAL 재보정값 — 표 값을 단언하는 시험은 이것 하나뿐)', () => {
  const P = (seq, ...parts) => ({ parts, seq });
  assert.deepStrictEqual(G.CONFIG.stages.missions.normal, [
    P(false, C(0, 21)), P(false, C(1, 23)), P(false, K(2, 10)), P(false, E([0, 1, 2], 21)),
    P(true, C(2, 12), B(4, 3), K(2, 4)),
    P(false, C(2, 25)), P(false, C(3, 29), K(2, 9)), P(false, E([0, 1, 2, 3], 23)), P(false, C(4, 28), C(5, 16)),
    P(true, C(0, 8), B(4, 3), K(2, 4), E([1, 2, 3], 6))
  ]);
  assert.deepStrictEqual(G.CONFIG.stages.missions.hard, [
    P(false, B(4, 7)), P(false, K(2, 12)), P(false, E([3, 4, 5], 16)), P(false, K(3, 4)),
    P(true, C(1, 4), B(4, 2), K(3, 1), B(5, 1)),
    P(false, C(0, 23), C(2, 15)), P(false, B(4, 7), K(3, 4)), P(false, E([0, 1, 2, 3, 4], 19)), P(false, B(5, 1), C(5, 22)),
    P(true, K(3, 1), B(5, 1), E([0, 1, 2], 5), K(4, 1))
  ]);
});

test('P1 동시 칩 상한: seq 가 아닌 정의는 부분이 missionMaxChips(2)개를 넘으면 무효(점수 폴백), seq(차례대로)는 missionMaxParts(4)까지 유효', () => {
  const parts = (n) => Array.from({ length: n }, () => C(0, 5));
  assert.strictEqual(G.missionValid({ parts: parts(2) }), true);
  assert.strictEqual(G.missionValid({ parts: parts(3) }), false, '3개짜리 비-SEQ 는 무효');
  assert.strictEqual(G.missionValid({ parts: parts(3), seq: false }), false);
  assert.strictEqual(G.missionValid({ parts: parts(4), seq: false }), false);
  assert.strictEqual(G.missionValid({ parts: parts(3), seq: true }), true);
  assert.strictEqual(G.missionValid({ parts: parts(4), seq: true }), true, '4개짜리 SEQ 는 유효');
  assert.strictEqual(G.missionValid({ parts: parts(5), seq: true }), false, 'SEQ 도 missionMaxParts(4) 위는 무효');
  withStages((S) => { S.missionMaxChips = 3; }, () => {
    assert.strictEqual(G.missionValid({ parts: parts(3) }), true, '상한은 CONFIG 한 곳(missionMaxChips)에서 읽는다');
    assert.strictEqual(G.missionValid({ parts: parts(4) }), false);
  });
  // 무효 정의가 표에 들어 있으면 그 레벨은 점수 목표로 폴백한다(막히는 판이 없다)
  withStages((S) => { S.goalType.normal = 'mission'; S.missions.normal = [{ parts: parts(3), seq: false }, { parts: parts(3), seq: true }]; }, () => {
    assert.strictEqual(G.missionDef('normal', 1), null);
    assert.notStrictEqual(G.missionDef('normal', 2), null);
  });
});

test('P5 SEQ 해석 고정: 한 이벤트로 끝난 단계의 초과분은 다음 단계로 넘기지 않고, 다음 단계는 그 이벤트 뒤의 이벤트부터 센다(같은 행동 안이라도)', () => {
  const m = mk([C(0, 4), C(0, 3), B(4, 1)], true);
  G.missionUpdate(m, grp(0, 6));                  // 1단계(불 4개)에 6 → 초과분 2 는 2단계로 넘기지 않는다
  assert.strictEqual(prog(m, 0).done, true);
  assert.strictEqual(prog(m, 1).now, 0, '초과분은 다음 단계로 넘어가지 않는다');
  assert.strictEqual(G.missionProgress(m).cur, 1);
  G.missionUpdate(m, grp(0, 2));                  // 같은 행동의 다음 그룹: 2단계부터 센다
  assert.strictEqual(prog(m, 1).now, 2, '그 이벤트 뒤의 이벤트부터 다음 단계가 센다');
  G.missionUpdate(m, grp(0, 5));                  // 2단계는 3 필요에 +5 → 끝. 이 크기 5 그룹은 3단계(큰 매치)로도 세지 않는다
  assert.strictEqual(prog(m, 1).done, true);
  assert.strictEqual(prog(m, 1).now, 3, '진행 값은 need 로 자른다');
  assert.strictEqual(prog(m, 2).now, 0);
  G.missionUpdate(m, grp(1, 4));
  assert.strictEqual(G.missionDone(m), true);
  // 행동 이벤트(CHAIN)도 같은 규칙: 이전 단계를 끝낸 이벤트는 다음 단계로 세지 않는다
  const c = mk([K(2, 1), K(2, 1)], true);
  G.missionUpdate(c, act(true, 3));
  assert.deepStrictEqual(G.missionProgress(c).parts.map((p) => p.now), [1, 0]);
  G.missionUpdate(c, act(true, 3));
  assert.strictEqual(G.missionDone(c), true);
});

/* ---------- P3: 카드 aria-label 과 낭독용 spoken ---------- */
const LABEL_TABLE = [
  { parts: [C(3, 30)], seq: false },                                   // 1: 한 부분
  { parts: [C(3, 30), K(2, 9)], seq: false },                          // 2: 두 부분(그리고)
  null,                                                                // 3: 미션 없음 → 점수 카드
  { parts: [E([0, 1, 2], 21)], seq: false },                           // 4
  { parts: [C(2, 12), B(4, 3), K(2, 4)], seq: true },                  // 5: 특별(차례대로)
  null, null, null, null,
  { parts: [C(0, 10), B(4, 3), K(2, 4), E([1, 2, 3], 8)], seq: true }  // 10: 특별 4단계
];

test('P3 카드 aria-label: 부분은 "그리고"로 이은 한 문장, 별 정보는 뒤에 따로, 특별은 "특별 레벨", 차례대로는 "먼저 …, 그다음 …", 잠김은 맨 끝. "쉬어가기"는 없다', () => {
  const d = G.missionDescribe(LABEL_TABLE[1]);
  assert.strictEqual(d.spoken, '번개 보석 30개 그리고 연쇄(CHAIN 2 이상) 9번');
  assert.strictEqual(d.summary, '번개 보석 30개, 연쇄(CHAIN 2 이상) 9번', '화면용 summary 는 바뀌지 않았다');
  assert.strictEqual(G.missionDescribe(LABEL_TABLE[0]).spoken, '번개 보석 30개');
  assert.strictEqual(G.missionDescribe(LABEL_TABLE[4]).spoken, '먼저 풀 보석 12개, 그다음 한 번에 4개 이상 3번, 그다음 연쇄(CHAIN 2 이상) 4번');
  withStages((S) => { S.goalType.normal = 'mission'; S.goalType.hard = 'score'; S.missions.normal = LABEL_TABLE; }, () => {
    assert.strictEqual(G.stageCardLabel('normal', 1, true, 0), '레벨 1, 미션 번개 보석 30개, 별 0개');
    assert.strictEqual(G.stageCardLabel('normal', 2, true, 2), '레벨 2, 미션 번개 보석 30개 그리고 연쇄(CHAIN 2 이상) 9번, 별 2개');
    assert.strictEqual(G.stageCardLabel('normal', 3, true, 1), '레벨 3, 목표 ' + G.stageTarget('normal', 3).toLocaleString('ko-KR') + '점, 별 1개', '미션 정의가 없는 레벨은 점수 카드');
    assert.strictEqual(G.stageCardLabel('normal', 4, true, 0), '레벨 4, 미션 불·물·풀 보석 각각 21개, 별 0개');
    assert.strictEqual(G.stageCardLabel('normal', 5, true, 0), '레벨 5, 특별 레벨, 잠든 풀 정령, 미션 먼저 풀 보석 12개, 그다음 한 번에 4개 이상 3번, 그다음 연쇄(CHAIN 2 이상) 4번, 별 0개');
    assert.strictEqual(G.stageCardLabel('normal', 10, false, 0), '레벨 10, 특별 레벨, 잠든 불 정령, 미션 먼저 불 보석 10개, 그다음 한 번에 4개 이상 3번, 그다음 연쇄(CHAIN 2 이상) 4번, 그다음 불·물·풀·번개 보석 각각 8개'.replace('불·물·풀·번개 보석 각각 8개', '물·풀·번개 보석 각각 8개') + ', 잠김');
    assert.strictEqual(G.stageCardLabel('normal', 2, false, 0).slice(-4), ', 잠김');
    // 초보·점수형(goalType score)은 지금 그대로: 특별 번호여도 "특별 레벨"을 말하지 않는다(spec §33)
    // M4(spec §27.6): 정령이 있는 레벨(5·10)은 정령 이름만 더한다("특별 레벨"이라는 말은 여전히 없다)
    assert.strictEqual(G.stageCardLabel('easy', 5, true, 1), '레벨 5, 잠든 번개 정령, 목표 ' + G.stageTarget('easy', 5).toLocaleString('ko-KR') + '점, 별 1개');
    assert.strictEqual(G.stageCardLabel('hard', 5, false, 0), '레벨 5, 잠든 물 정령, 목표 ' + G.stageTarget('hard', 5).toLocaleString('ko-KR') + '점, 잠김');
    for (let n = 1; n <= 10; n++) DIFFS.forEach((lv) => [true, false].forEach((open) => {
      const t = G.stageCardLabel(lv, n, open, 3);
      assert.ok(t.indexOf('쉬어가') === -1, t);
      if (open) assert.ok(/, 별 3개$/.test(t), '별 정보는 맨 뒤에 따로: ' + t);
    }));
  });
});

/* ---------- 레벨 카드 마크업 계약 (§32.5.4) ---------- */
test('M2 레벨 카드 마크업 계약: data-kind(5·10 모든 난이도 special / 3·6·9 중수·고수 rest)·.sc-tag(중수·고수 특별 미션 카드만, aria-hidden)·.sc-mis 구조. 초보 카드는 이전 마크업과 완전히 같다', () => {
  const S = G.CONFIG.stages;
  const env = createEnv(50);
  const I = env.I;
  const fmtN = (n) => n.toLocaleString('ko-KR');
  DIFFS.forEach((lv) => {
    I.save.level = lv;
    I.save.progress[lv] = 4;                       // 1~5 열림, 6~10 잠김
    I.save.stages[lv][0].stars = 3;
    I.renderStages();
    const cards = I.el['stage-grid'].children;
    assert.strictEqual(cards.length, 10);
    cards.forEach((b, k) => {
      const n = k + 1;
      const open = n <= 5;
      const tag = lv + ' 레벨 ' + n;
      const special = S.special.indexOf(n) !== -1;
      const rest = S.rest.indexOf(n) !== -1;
      // data-kind: 특별은 모든 난이도, 쉬운 구간 번호는 중수·고수만. 글자로는 나오지 않는다(속성뿐)
      const kind = special ? 'special' : (rest && lv !== 'easy' ? 'rest' : undefined);
      assert.strictEqual(b.dataset.kind, kind, tag + ' data-kind');
      assert.deepStrictEqual(Object.keys(b.dataset).sort(), kind ? ['kind', 'stage'] : ['stage'], tag + ' 데이터 속성');
      assert.ok(b.className.split(' ').indexOf('stage-card') !== -1);
      assert.ok(b.innerHTML.indexOf('쉬어가') === -1 && b.getAttribute('aria-label').indexOf('쉬어가') === -1);
      const def = lv === 'easy' ? null : S.missions[lv][k];
      const num = '<span class="sc-num">' + n + '</span>';
      if (lv === 'easy') {
        // 초보: 미션·태그·정령 없이 M1 이전 renderStages 가 만들던 문자열과 완전히 같다
        const rec = I.save.stages.easy[k];
        let stars = '';
        for (let q = 1; q <= 3; q++) stars += q <= rec.stars ? '★' : '☆';
        const t = fmtN(G.stageTarget('easy', n));     // [EDU] 교육용 초보 카드의 점수는 일반용 표 × 1.2
        const html = num + '<span class="sc-target">' + t + '</span>' + (open ? '<span class="sc-stars" aria-hidden="true">' + stars + '</span>' : '<span class="sc-lock">잠김</span>');
        assert.strictEqual(b.innerHTML, html, tag);
        const whoEasy = n === 5 ? '잠든 번개 정령, ' : (n === 10 ? '잠든 빛 정령, ' : '');      // M4: 5·10단계 aria-label 에만 정령 이름(spec §27.6.1 표). "특별 레벨"이라는 말은 없다
        assert.strictEqual(b.getAttribute('aria-label'), '레벨 ' + n + ', ' + whoEasy + '목표 ' + t + '점, ' + (open ? '별 ' + rec.stars + '개' : '잠김'), tag);
        assert.ok(!/sc-mis|sc-tag|sc-sp|sc-steps/.test(b.innerHTML), tag + ' 초보 카드에는 미션·태그가 없다');
        return;
      }
      // 중수·고수: 미션 요약 .sc-mis 하나(.sc-target 없음), 특별 레벨(5·10)에만 .sc-tag(aria-hidden), 정령(.sc-sp)은 M4
      assert.strictEqual((b.innerHTML.match(/class="sc-mis"/g) || []).length, 1, tag);
      assert.ok(b.innerHTML.indexOf('sc-target') === -1, tag);
      assert.ok(b.innerHTML.indexOf('sc-sp') === -1 && b.innerHTML.indexOf('sc-steps') === -1, tag + ' 정령·점수 3등분은 M4');
      assert.ok(b.innerHTML.startsWith(num + '<span class="sc-mis">'), tag + ' 번호 다음에 미션 요약');
      const m = b.innerHTML.match(/<span class="sc-mis">([\s\S]*?)<\/span>(?=<span class="sc-(stars|lock)")/);
      const mis = m ? m[1] : '';
      if (def.parts.length > 1) {
        assert.ok(mis.indexOf('<i class="mc n">' + def.parts.length + '가지 미션</i>') !== -1, tag + ' N가지 미션');
      } else {
        const p0 = def.parts[0];
        if (p0.k === 'collect') assert.ok(/^<i class="mc g"><span class="m-gem">[\s\S]*<\/span><b>\d+<\/b><\/i>$/.test(mis) && (mis.match(/m-gem/g) || []).length === 1, tag + ' 보석+개수');
        else if (p0.k === 'collectEach') assert.ok(mis.indexOf('<i class="mc g each">') === 0 && (mis.match(/class="m-gem"/g) || []).length === p0.colors.length && mis.indexOf('<b>' + p0.need + '</b>') !== -1, tag + ' 각각(.each)');
        else assert.strictEqual(mis, '<i class="mc k"><u>' + (p0.k === 'chain' ? '연쇄' : '큰 매치') + '</u><b>' + p0.need + '</b></i>', tag);
      }
      const tagCount = (b.innerHTML.match(/class="sc-tag"/g) || []).length;
      assert.strictEqual(tagCount, special ? 1 : 0, tag + ' 태그는 특별 레벨 카드에만');
      if (special) {
        assert.ok(b.innerHTML.indexOf('<span class="sc-tag" aria-hidden="true">특별</span>') !== -1, tag + ' 태그는 aria-hidden(aria-label 이 이미 "특별 레벨"을 읽음)');
        assert.ok(b.getAttribute('aria-label').indexOf('특별 레벨') !== -1, tag + ' aria-label 에 특별 레벨');
      } else assert.ok(b.getAttribute('aria-label').indexOf('특별') === -1, tag);
      assert.ok(open ? b.innerHTML.indexOf('sc-stars') !== -1 : b.innerHTML.indexOf('sc-lock') !== -1, tag);
      const whoMis = special ? '잠든 ' + { normal: { 5: '풀', 10: '불' }, hard: { 5: '물', 10: '어둠' } }[lv][n] + ' 정령, ' : '';      // M4: spec §27.6.1 표(중수 풀·불 / 고수 물·어둠)
      assert.ok(b.getAttribute('aria-label').startsWith('레벨 ' + n + ', ' + (special ? '특별 레벨, ' : '') + whoMis + '미션 '), tag);
    });
  });
  env.dispose();
});

test('M2 goalType 을 score 로 되돌리면(롤백) 중수·고수 카드도 점수 카드이고 "특별" 태그·특별 낭독이 없다(data-kind 속성만 남는다)', () => {
  const env = createEnv(51, scoreCfg);
  const I = env.I;
  I.save.level = 'hard';
  I.save.progress.hard = 9;
  I.renderStages();
  const cards = I.el['stage-grid'].children;
  cards.forEach((b, k) => {
    assert.ok(b.innerHTML.indexOf('sc-target') !== -1 && !/sc-mis|sc-tag/.test(b.innerHTML), '레벨 ' + (k + 1));
    // M4(spec §27.6): 롤백해도 정령은 동작한다 — 5·10단계 카드는 정령 이름만 더해지고 "특별"·"미션" 말은 없다
    const re = (k === 4 || k === 9) ? /^레벨 \d+, 잠든 (물|어둠) 정령, 목표 [\d,]+점, 별 0개$/ : /^레벨 \d+, 목표 [\d,]+점, 별 0개$/;
    assert.ok(re.test(b.getAttribute('aria-label')), b.getAttribute('aria-label'));
  });
  assert.strictEqual(cards[4].dataset.kind, 'special');
  assert.strictEqual(cards[2].dataset.kind, 'rest');
  env.dispose();
});

/* ---------- 선택 레벨 설명판 .stage-detail ---------- */
function detailText(env) {
  const g = (id) => env.doc.getElementById(id);
  return { title: g('sd-title').textContent, tag: g('sd-tag').hidden ? '' : g('sd-tag').textContent, goal: g('sd-goal').textContent, hint: g('sd-hint').hidden ? '' : g('sd-hint').textContent, time: g('sd-time').hidden ? '' : g('sd-time').textContent, go: !g('btn-stage-go').disabled };
}

test('M2 설명판: 기본은 현재 레벨, 포커스·마우스 올림이면 그 카드의 레벨, 잠긴 레벨은 잠김 안내([도전!] 비활성), 터치는 건너뜀, 미션형은 전문·특별 레벨·연쇄 안내', async () => {
  const env = createEnv(60, (cfg) => { cfg.stages.goalType.normal = 'mission'; cfg.stages.missions.normal = LABEL_TABLE; });
  const I = env.I;
  const tgt = (lv, n) => G.stageTarget(lv, n).toLocaleString('ko-KR');
  I.save.level = 'normal';
  I.save.progress.normal = 2;                      // 1·2 클리어 → 현재 레벨 3, 1~3 열림
  I.goStages();
  assert.strictEqual(I.state.phase, 'stages');
  const grid = env.doc.getElementById('stage-grid');
  assert.deepStrictEqual(detailText(env), { title: '레벨 3', tag: '', goal: '목표 점수 ' + tgt('normal', 3) + '점', hint: '', time: '제한 시간 2:00', go: true }, '현재 레벨 3(미션 정의 없음 → 점수)');
  fire(grid, 'focusin', onCard(cardOf(env, 2)));
  assert.deepStrictEqual(detailText(env), { title: '레벨 2', tag: '', goal: '번개 보석 30개, 연쇄(CHAIN 2 이상) 9번', hint: '한 번 움직여서 이어서 터지게 해요', time: '제한 시간 2:00', go: true }, '포커스 → 그 카드의 레벨(미션 전문 + 연쇄 안내)');
  fire(grid, 'pointerover', onCard(cardOf(env, 5), { pointerType: 'touch' }));
  assert.strictEqual(detailText(env).title, '레벨 2', '터치는 건너뛴다(누르면 바로 시작하는 흐름 그대로)');
  fire(grid, 'pointerover', onCard(cardOf(env, 5), { pointerType: 'mouse' }));
  assert.deepStrictEqual(detailText(env), { title: '레벨 5', tag: '', goal: '아직 잠겨 있어요 — 앞 레벨을 먼저 클리어하세요', hint: '', time: '', go: false }, '잠긴 레벨(마우스 올림)');
  assert.strictEqual(env.doc.getElementById('btn-stage-go').getAttribute('aria-disabled'), 'true', '잠긴 레벨: [도전!]의 aria-disabled 도 true (Review R-M2 X22)');
  fire(grid, 'focusin', onCard(cardOf(env, 1)));
  assert.deepStrictEqual(detailText(env), { title: '레벨 1', tag: '', goal: '번개 보석 30개', hint: '', time: '제한 시간 2:00', go: true });
  assert.strictEqual(env.doc.getElementById('btn-stage-go').getAttribute('aria-disabled'), 'false', '열린 레벨: aria-disabled false');
  // 현재 레벨이 특별 레벨(5): 태그 "특별 레벨"과 차례대로 전문
  I.save.progress.normal = 4;
  I.goStages();
  assert.deepStrictEqual(detailText(env), { title: '레벨 5', tag: '특별 레벨', goal: '① 풀 보석 12개 → ② 한 번에 4개 이상 3번 → ③ 연쇄(CHAIN 2 이상) 4번', hint: '잠든 풀 정령 친구가 기다려요 · 한 번 움직여서 이어서 터지게 해요', time: '제한 시간 2:00', go: true });
  // [도전!]은 설명판이 보이는 레벨을 시작한다(카드와 같은 startStage)
  fire(grid, 'focusin', onCard(cardOf(env, 4)));
  assert.strictEqual(detailText(env).title, '레벨 4');
  fire(env.doc.getElementById('btn-stage-go'), 'click', {});
  assert.strictEqual(I.state.stage, 4, '[도전!] → 보이는 레벨 4 시작');
  await env.runUntil(() => I.state.phase === 'playing', 30000);
  assert.deepStrictEqual(I.state.mission.def.parts.map((p) => p.k), ['collectEach']);
  // 잠긴 레벨이 보일 때 [도전!]을 눌러도 시작하지 않는다
  I.goStages();
  fire(grid, 'pointerover', onCard(cardOf(env, 7), { pointerType: 'mouse' }));
  assert.strictEqual(detailText(env).go, false);
  const before = I.state.stage;
  fire(env.doc.getElementById('btn-stage-go'), 'click', {});
  assert.strictEqual(I.state.phase, 'stages');
  assert.strictEqual(I.state.stage, before);
  // 모두 클리어 → 현재 레벨은 10단계
  I.save.progress.normal = 10;
  I.goStages();
  assert.strictEqual(detailText(env).title, '레벨 10');
  assert.strictEqual(detailText(env).tag, '특별 레벨');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('M2 설명판: 보이는 레벨이 바뀔 때만 DOM 을 쓰고, aria-live 를 쓰지 않으며, 초보에는 미션·특별 말이 없다(점수만)', () => {
  const env = createEnv(61);
  const I = env.I;
  const goal = env.doc.getElementById('sd-goal');
  let writes = 0;
  let val = goal.textContent;
  Object.defineProperty(goal, 'textContent', { get() { return val; }, set(v) { writes++; val = v; } });
  I.save.level = 'easy';
  I.save.progress.easy = 6;
  I.goStages();                                    // 현재 레벨 7
  const w0 = writes;
  assert.strictEqual(goal.textContent, '목표 점수 ' + G.stageTarget('easy', 7).toLocaleString('ko-KR') + '점');
  const grid = env.doc.getElementById('stage-grid');
  fire(grid, 'focusin', onCard(cardOf(env, 7)));
  fire(grid, 'pointerover', onCard(cardOf(env, 7), { pointerType: 'mouse' }));
  assert.strictEqual(writes, w0, '같은 레벨이면 DOM 을 다시 쓰지 않는다');
  fire(grid, 'focusin', onCard(cardOf(env, 5)));
  assert.strictEqual(writes, w0 + 1);
  assert.deepStrictEqual(detailText(env), { title: '레벨 5', tag: '', goal: '목표 점수 ' + G.stageTarget('easy', 5).toLocaleString('ko-KR') + '점', hint: '잠든 번개 정령 친구가 기다려요', time: '제한 시간 2:10', go: true }, '초보 5단계도 점수만(M4: 정령 친구 한 줄만 더해진다 — 미션·특별 말 없음)');
  // 초보 설명판 어디에도 미션·특별·쉬어가기 말이 없다
  for (let n = 1; n <= 10; n++) {
    const t = G.stageDetailInfo('easy', n, true);
    const all = [t.title, t.tag, t.goal, t.hint, t.time].join(' ');
    assert.ok(!/미션|특별|쉬어가|연쇄|큰 매치/.test(all), all);
  }
  // 점수 폴백(goalType score)인 중수·고수도 점수 문구
  const sc = G.stageDetailInfo('normal', 1, true);
  assert.ok(sc.goal.startsWith(G.CONFIG.stages.goalType.normal === 'mission' ? '' : '목표 점수'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const det = html.slice(html.indexOf('id="stage-detail"'), html.indexOf('class="stages-hint"'));
  assert.ok(det.indexOf('aria-live') === -1 && det.indexOf('role="status"') === -1, '설명판은 aria-live 를 쓰지 않는다');
  // 난이도만 바뀌고 레벨 번호·열림·미션 유무가 같아도 옛 난이도의 글이 남지 않는다(Review R-M2 X24 — 설명판 key 의 난이도 토큰)
  I.save.level = 'normal';
  I.save.progress.normal = 2;
  I.goStages();                                    // 현재 레벨 3
  const goalNormal = detailText(env).goal;
  I.save.level = 'hard';
  I.save.progress.hard = 2;
  I.goStages();                                    // 현재 레벨 3 (같은 번호·열림·미션형)
  const goalHard = detailText(env).goal;
  assert.strictEqual(goalNormal, G.stageDetailInfo('normal', 3, true).goal);
  assert.strictEqual(goalHard, G.stageDetailInfo('hard', 3, true).goal, '난이도를 바꾸면 같은 번호라도 설명판 글이 바뀐다');
  assert.notStrictEqual(goalNormal, goalHard);
  env.dispose();
});

/* ---------- 모든 UI 문자열: 피하는 말·"쉬어가기" ---------- */
test('M2 문구 점검: 20개 레벨의 미션 전문·낭독문·카드·설명판·규칙 문구·새 마크업에 §27.6.2 피하는 말과 "쉬어가기"가 없다', () => {
  const strings = [];
  const add = (x) => { if (x) strings.push(String(x)); };
  DIFFS.forEach((lv) => {
    for (let n = 1; n <= 10; n++) {
      [true, false].forEach((open) => {
        add(G.stageCardLabel(lv, n, open, 2));
        const d = G.stageDetailInfo(lv, n, open);
        [d.title, d.tag, d.goal, d.hint, d.time].forEach(add);
      });
      const def = G.missionDef(lv, n);
      if (def) { const d = G.missionDescribe(def); add(d.summary); add(d.spoken); d.parts.forEach((p) => { add(p.name); add(p.hint); add(p.total); }); }
    }
  });
  const env = createEnv(62);
  DIFFS.forEach((lv) => {
    env.I.save.level = lv; env.I.save.progress[lv] = 4;
    env.I.renderStages();
    env.I.el['stage-grid'].children.forEach((b) => { add(stripTags(b.innerHTML)); add(b.getAttribute('aria-label')); });
  });
  add(env.doc.getElementById('rule-stage').innerHTML.replace(/<[^>]*>/g, ''));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  add(stripTags(html.slice(html.indexOf('id="stage-detail"'), html.indexOf('class="stages-hint"'))));
  add(stripTags(html.slice(html.indexOf('id="rule-stage"'), html.indexOf('</li>', html.indexOf('id="rule-stage"')))));
  // 소스의 새 한글 문자열(순수 문구 도우미 + 레벨 카드·설명판 코드 + 규칙 문구)
  const regions = [
    [SRC.indexOf('/** 레벨 카드 data-kind'), SRC.indexOf('/** 레벨 N 선택 가능')],
    [SRC.indexOf('/** 레벨 카드의 미션 요약'), SRC.indexOf('function goStages()')],
    [SRC.indexOf('const missionRule ='), SRC.indexOf('function selectLevel(')]
  ];
  regions.forEach(([a, b]) => assert.ok(a > 0 && b > a, '소스 구간'));
  regions.forEach(([a, b]) => {
    const body = SRC.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    (body.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach(add);
  });
  assert.ok(strings.length > 300, '점검한 문자열 수 ' + strings.length);
  strings.forEach((s) => {
    AVOID_ALL.forEach((w) => assert.ok(s.indexOf(w) === -1, '"' + w + '" 가 문구에 있음: ' + s));
    assert.ok(!STANDALONE_JEOK.test(s), '"적" 이 낱말로 쓰임: ' + s);
    assert.ok(!/쉬어가/.test(s));
  });
  // 코드·마크업·스타일에는 주석까지 포함해 "쉬어가기"라는 말이 아예 없다(spec §34)
  [SRC, html, fs.readFileSync(path.join(root, 'style.css'), 'utf8')].forEach((t) => assert.ok(t.indexOf('쉬어가') === -1));
  env.dispose();
});

test('M2 규칙 문구(#rule-stage): 정적 자리표시자(index.html)와 game.js 가 채우는 문구가 같고, 옛 "목표 점수를 넘기면" 문장은 남아 있지 않다. 점수형으로 되돌리면 옛 문장이 된다', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const stat = html.match(/<li id="rule-stage">([\s\S]*?)<\/li>/)[1];
  const env = createEnv(63);
  const dyn = env.doc.getElementById('rule-stage').innerHTML;
  assert.strictEqual(dyn, stat, '자리표시자 = 동적 문구');
  assert.ok(stat.indexOf('목표를 이루면 클리어') !== -1 && stat.indexOf('초보는 목표 점수, 중수·고수는 레벨마다 다른 미션이에요.') !== -1);
  assert.ok(stat.endsWith('레벨 1~10에 도전하세요.'));
  assert.ok(html.indexOf('목표 점수를 넘기면') === -1, '옛 문장이 index.html 에 남지 않는다');
  env.dispose();
  const old = createEnv(64, scoreCfg);
  old.I.renderLevelUi();
  assert.strictEqual(old.doc.getElementById('rule-stage').innerHTML, '<b>스테이지</b> 제한 시간(초보 2분 10초 / 중수 2분 / 고수 1분 40초) 안에 목표 점수를 넘기면 클리어! 레벨 1~10에 도전하세요.');
  old.dispose();
  assert.ok(SRC.indexOf('index.html 의 자리표시자와 같은 문장') !== -1);
});

test('M2 index.html: #stage-detail 은 레벨 격자 아래·안내 문구 위에 있고 [도전!] 단추가 있으며 자리표시자 값이 없다. div 여닫음이 맞는다', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const g = html.indexOf('id="stage-grid"'), d = html.indexOf('id="stage-detail"'), h = html.indexOf('class="stages-hint"');
  assert.ok(g > 0 && g < d && d < h, '격자 → 설명판 → 안내 문구');
  assert.match(html, /<div class="stage-detail" id="stage-detail">/);
  assert.match(html, /<button class="btn primary sd-go" id="btn-stage-go" type="button">도전!<\/button>/);
  ['sd-title', 'sd-tag', 'sd-goal', 'sd-hint', 'sd-time'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  const det = html.slice(d, h);
  assert.ok(!/\d{3}/.test(stripTags(det)), '설명판 자리표시자에 점수·개수 값이 없다');
  assert.ok(det.includes('<p class="sd-hint" id="sd-hint" hidden>') && det.includes('<i class="sd-tag" id="sd-tag" hidden>'), '태그·연쇄 안내·제한 시간 줄은 기본 hidden');
  assert.strictEqual((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length, 'div 여닫음');
  assert.strictEqual((html.match(/<p\b/g) || []).length, (html.match(/<\/p>/g) || []).length, 'p 여닫음');
});

/* ---------- CSS: 블록 하나, 두 앱 같게, 글자 크기·터치 타깃·대비 ---------- */
function relLum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('M2 style.css: 미션 레벨 카드·설명판 블록이 하나, 일반용 style.css 와 같고, 글자 11px 이상·[도전!] 터치 타깃 44px 이상·글자 대비 4.5:1 이상', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const marker = '미션 레벨 카드·설명판 (spec §27 M2';
  const idx = css.indexOf(marker);
  assert.ok(idx > 0 && css.indexOf(marker, idx + 1) === -1, '블록 하나');
  const block = css.slice(css.lastIndexOf('/*', idx));
  assert.ok(block.indexOf('미션 HUD (spec §27)') === -1 && block.indexOf('콤보 칩 (spec §28)') === -1, '미션 HUD·콤보 블록과 따로 이어지는 새 블록');
  assert.ok(!/^\s*:root/m.test(block) && !/--board\s*:|--ui-h\s*:|--cell\s*:/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), ':root·보드 크기식을 건드리지 않는다');
  ['.sc-tag', '.stage-detail', '.sd-title', '.sd-goal', '.sd-hint', '.sd-time', '.sd-go'].forEach((sel) => assert.ok(block.includes(sel), sel));
  assert.ok(/prefers-reduced-motion: reduce/.test(block), '감소 모션을 존중한다');
  if (HAS_GEN) assert.strictEqual(fs.readFileSync(path.join(GEN_DIR, 'style.css'), 'utf8'), css, '두 앱 style.css 일치');
  // 글자는 11px 이상: font-size 선언이 모두 max(11px, …) 이거나 .7rem(11.2px) 이상
  const sizes = (block.replace(/\/\*[\s\S]*?\*\//g, '').match(/font-size:\s*[^;]+;/g) || []);
  assert.ok(sizes.length >= 8);
  sizes.forEach((d) => {
    const m = d.match(/(\d*\.?\d+)rem/);
    assert.ok(/max\(11px/.test(d) || (m && parseFloat(m[1]) * 16 >= 11), d);
  });
  // [도전!] 터치 타깃 ≥ 44px
  const go = block.match(/\.sd-go \{[^}]*min-height:\s*(\d+)px/);
  assert.ok(go && +go[1] >= 44, '[도전!] min-height ≥ 44px');
  // 글자 대비(값 계산): 태그 흰/#5b3df5, 설명판 잉크(--ink)·ink-2(--ink-2) 대 바탕 끝 색(#fff·#ece6ff)
  const ink = css.match(/--ink:\s*(#[0-9a-f]{6})/g).pop().slice(-7), ink2 = css.match(/--ink-2:\s*(#[0-9a-f]{6})/)[1];
  assert.ok(contrast('#ffffff', '#5b3df5') >= 4.5, '태그 ' + contrast('#ffffff', '#5b3df5'));
  [ink, ink2].forEach((c) => ['#ffffff', '#ece6ff'].forEach((bg) => assert.ok(contrast(c, bg) >= 4.5, c + ' on ' + bg + ' = ' + contrast(c, bg))));
  assert.ok(block.includes('background: #5b3df5; color: #fff'), '태그 색 값이 계산한 값과 같다');
  assert.ok(block.includes('linear-gradient(180deg, #fff 0%, #ece6ff 100%)'), '설명판 바탕 값이 계산한 값과 같다');
  // Review R-M2 수정(review.md §26): 폭 ≤ 420px 세로 폰에서 게이지 줄 폭의 하한 — 칩 2개 레벨에서 보드가 195~267px 로 줄어도 6번째 게이지가 화면 밖으로 잘리지 않게(44px×6 + 간격 5×6 = 294px)
  assert.ok(/@media \(max-width: 420px\) and \(orientation: portrait\) \{\s*\.gauges \{ min-width: min\(294px, calc\(100vw - 24px\)\); \}\s*\}/.test(block), '게이지 줄 폭 하한(320×568 에서 6번째 게이지가 잘리던 결함)');
});

/* ---------- 실제 판 흐름 (가짜 DOM 하네스) — 기본(shipped) 표를 그대로 쓰되 표 값은 단언하지 않는다 ---------- */
/** 미션 m 을 이벤트로 모두 달성시킨다(표 값과 무관하게 부분 순서대로 필요한 만큼) */
function completeMission(m) {
  m.parts.forEach((p, i) => {
    for (let guard = 0; guard < 200 && !G.missionProgress(m).parts[i].done; guard++) {
      if (p.k === 'collect') G.missionUpdate(m, grp(p.color, 3));
      else if (p.k === 'collectEach') p.colors.forEach((c) => G.missionUpdate(m, grp(c, 3)));
      else if (p.k === 'big') G.missionUpdate(m, grp(1, Math.max(4, p.min)));
      else G.missionUpdate(m, act(true, p.min));
    }
  });
  assert.strictEqual(G.missionDone(m), true);
}

test('M2 중수·고수 한 판(기본 표 레벨 1): 미션 칩이 켜지고, 미션을 달성한 행동 끝에서 STAGE CLEAR, 별·남은 시간은 점수형과 같은 식, 저장 best 는 도달 점수', async () => {
  for (const lv of TABLE_LV) {
    const sc = findSwapScenario((sim) => sim.events.length >= 1 && sim.maxStep === 1);
    const env = createEnv(70);
    const results = [];
    env.sandbox.ElementGemsHost.on('stageResult', (d) => results.push(d));
    await startAndWait(env, lv, 1);
    const I = env.I;
    assert.notStrictEqual(I.state.mission, null, lv + ' 레벨 1 은 미션형');
    assert.strictEqual(I.el.mission.hidden, false);
    assert.strictEqual(I.el.goal.hidden, true);
    assert.strictEqual(I.el['screen-game'].dataset.goal, 'mission');
    completeMission(I.state.mission);              // 이벤트로 미션 달성(판은 아직 끝나지 않았다: 판정은 행동이 끝난 시점)
    assert.strictEqual(I.state.phase, 'playing', '달성 판정은 행동이 끝난 시점에만');
    await runSwap(env, sc);
    assert.strictEqual(I.state.phase, 'over');
    assert.strictEqual(env.doc.getElementById('end-title').textContent, 'STAGE CLEAR!');
    assert.match(env.doc.getElementById('end-target').textContent, /^미션 모두 달성 · 남은 시간 /);
    const left = G.leftFromTime(I.state.timeLeft);
    const stars = G.starsFor(left, I.state.startTime);
    const rec = I.save.stages[lv][0];
    assert.deepStrictEqual({ stars: rec.stars, left: rec.left, best: rec.best }, { stars, left, best: I.state.score }, lv + ': 별·남은 시간은 점수형과 같은 식, best 는 도달 점수');
    assert.ok(I.state.score < I.state.target, '점수 목표에는 못 미친 채로 클리어(미션형은 점수를 보지 않는다)');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].cleared, true);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('M2 중수·고수 한 판(기본 표 레벨 1): 미션을 못 끝내고 시간이 다 되면 TIME UP(미션 0/n 완료), 기록의 별·진행은 늘지 않는다', async () => {
  for (const lv of TABLE_LV) {
    const env = createEnv(71, (cfg) => { cfg.difficulty[lv].time = { start: 4, max: 6 }; });
    await startAndWait(env, lv, 1);
    const n = env.I.state.mission.parts.length;
    const before = JSON.stringify(env.I.save.stages[lv][0]);
    await env.runUntil(() => env.I.state.phase === 'over', 60000);
    assert.strictEqual(env.doc.getElementById('end-title').textContent, 'TIME UP');
    assert.strictEqual(env.doc.getElementById('end-target').textContent, '미션 0/' + n + ' 완료 · 내 점수 0');
    assert.strictEqual(JSON.stringify(env.I.save.stages[lv][0]), before);
    env.dispose();
  }
});

test('M2 기본 표 20개 레벨 모두 미션 칩/차례 칩으로 HUD 가 만들어지고 #mission 이 보이며 data-goal="mission"', async () => {
  for (const lv of TABLE_LV) {
    const env = createEnv(80);
    for (let n = 1; n <= 10; n++) {
      await startAndWait(env, lv, n);
      const I = env.I;
      const def = G.CONFIG.stages.missions[lv][n - 1];
      const tag = lv + ' 레벨 ' + n;
      const chips = I.el['mission-list'].children;
      const want = def.seq ? 1 : def.parts.length;
      assert.strictEqual(I.el.mission.hidden, false, tag);
      assert.strictEqual(I.el.goal.hidden, true, tag);
      assert.strictEqual(I.el['screen-game'].dataset.goal, 'mission', tag);
      assert.strictEqual(I.el['screen-game'].dataset.chips, String(want), tag);
      assert.strictEqual(chips.length, want, tag);
      const desc = G.missionDescribe(def);
      chips.forEach((c, i) => {
        assert.strictEqual(c.getAttribute('role'), 'progressbar', tag);
        assert.strictEqual(c.getAttribute('aria-valuemax'), String(def.parts[i].need), tag);
        assert.strictEqual(c.getAttribute('aria-valuenow'), '0', tag);
        assert.ok(c.getAttribute('aria-label').indexOf(desc.parts[i].name) !== -1, tag + ' 칩 이름');
        if (def.parts[i].k === 'collectEach') assert.strictEqual((c.querySelector('.m-sub').innerHTML.match(/m-eg/g) || []).length, def.parts[i].colors.length, tag);
      });
      assert.ok(I.state.mission.seq === !!def.seq, tag);
      assert.deepStrictEqual(env.errors, [], tag);
    }
    env.dispose();
  }
});

test('M2 초보 판은 그대로: 초보 기본 판은 점수 목표(목표 바만 보이고 미션 상태 null), 중수·고수만 미션형이다', async () => {
  const env = createEnv(81);
  await startAndWait(env, 'easy', 1);
  assert.strictEqual(env.I.state.mission, null);
  assert.strictEqual(env.I.el.goal.hidden, false);
  assert.strictEqual(env.I.el.mission.hidden, true);
  assert.strictEqual(env.I.el['screen-game'].dataset.goal, 'score');
  assert.match(env.I.el['goal-text'].textContent, /^0 \/ 10,800$/);       // [EDU] 9,000 × 1.2
  assert.strictEqual(env.I.el['count-info'].textContent, '레벨 1 · 목표 10,800점');
  env.dispose();
});

/* ===================================================================
 * 10) [EDU] 교육용 전용 항목 (spec §27.9 M3-A: 일반용 M1·M2 를 그대로 이식한 것이 맞는지, 교육용 특수 점검)
 * =================================================================== */
const W = G.WILD;

/** 소스 블록 [a, b) 를 잘라 낸다(시작 표지 a 는 포함, 끝 표지 b 는 제외). 못 찾으면 시험이 실패한다 */
function blockOf(src, a, b) {
  const i = src.indexOf(a);
  assert.ok(i >= 0, '시작 표지를 못 찾음: ' + a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, '끝 표지를 못 찾음: ' + b);
  return src.slice(i, j);
}

test('[EDU] 미션 순수 함수(missionValid~stageDetailInfo)·CONFIG.stages 미션 키·HUD·카드·설명판 소스가 일반용과 글자 그대로 같다(주석 포함)', { skip: skipGen }, () => {
  const blocks = [
    ['순수 함수 블록(미션 엔진·카드/설명판 글 도우미)', '/* ---------- 미션(목표) 엔진 (spec §27.3.1, M1)', '/** 레벨 N 선택 가능', 6000],
    ['CONFIG.stages 미션 키(goalType·missionMaxParts·missionMaxChips·special·rest·missions)', '// spec §27.3·§27.9 M1·M2(사용자 승인', '    // spec §26.4(사용자 승인', 3000],
    ['미션 HUD(buildMissionHud·drawMissionChip·updateMissionHud)', '/* ---------- 미션 HUD (spec §27.8)', 'function updateHUD(dt)', 3000],
    ['레벨 카드 요약·선택 레벨 설명판(missionCardHtml·renderStages·showStageDetail)', '/** 레벨 카드의 미션 요약', 'function goStages()', 3000]
  ];
  // [EDU] spec §27.7 M3-B(문제 양 "보통/많이"): 두 앱이 갈라지는 곳은 정확히 두 군데다 — ① missionDef 한 함수(많이 모드의 미션 표를 읽는다. [EDU] 표식 블록) ② renderStages·showStageDetail 안의
  //   `// [EDU]` 표식이 붙은 줄(문제 양을 맞추고 설명판 학습 줄을 그린다). 이 둘을 빼면 소스가 일반용과 글자 그대로 같아야 한다(다른 함수의 동일성 단언은 그대로).
  const MD_GEN = ['  /** 난이도 diff 의 레벨 stage(1~10)에 쓸 미션 정의', '  function missionInit('];
  const MD_EDU = ['  // [EDU] spec §27.7(M3-B): 이 함수만 일반용과 다르다', '  function missionInit('];
  const cut = (src, [a, b]) => { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); assert.ok(i >= 0 && j > i, 'missionDef 구간 표지: ' + a); return src.slice(0, i) + src.slice(j); };
  const dropEduLines = (src) => src.split('\n').filter((l) => !/\/\/ \[EDU\]/.test(l)).join('\n');
  blocks.forEach(([name, a, b, minLen]) => {
    let edu = blockOf(SRC, a, b);
    let gen = blockOf(GEN_SRC, a, b);
    assert.ok(edu.length > minLen, name + ' 블록이 너무 짧다(표지가 어긋남): ' + edu.length);
    if (name.indexOf('순수 함수 블록') === 0) { edu = cut(edu, MD_EDU); gen = cut(gen, MD_GEN); }      // missionDef 는 아래에서 따로 확인
    edu = dropEduLines(edu);
    assert.strictEqual(edu, gen, name + ' 소스가 일반용과 다르다([EDU] 표식 줄·missionDef 제외)');
  });
  // 순수 함수는 이름으로도 확인한다(내보내기 목록이 두 앱에서 같다). missionDef 만 [EDU] 블록이라 본문이 다르다 — 교육용 쪽은 [EDU] 표식과 많이 모드 표 읽기가 있는지 확인한다
  // M4-B(spec §27.6): 정령 특별 레벨의 순수 함수 4개도 같은 목록에 넣는다 — 정령 규칙(몇 단계가 깨어났나·깨운 정령 수)은 두 앱이 하나여야 해서 본문이 글자 그대로 같아야 한다(블록 단위 동일성은 위 첫 블록이 이미 포함하고, 이 목록은 함수별 확인이다)
  ['missionValid', 'missionInit', 'missionUpdate', 'missionDone', 'missionProgress', 'missionDescribe', 'stageKind', 'isSpecialMission', 'stageCardLabel', 'stageDetailInfo', 'spiritOf', 'spiritStep', 'spiritCells', 'awakenedCount'].forEach((name) => {
    assert.strictEqual(typeof G[name], 'function', name);
    assert.strictEqual(G[name].toString(), GEN[name].toString(), name + ' 본문');
  });
  assert.strictEqual(typeof G.missionDef, 'function');
  assert.ok(SRC.indexOf('// [EDU] spec §27.7(M3-B): 이 함수만 일반용과 다르다') !== -1 && SRC.indexOf('function missionDef(diff, stage)') > SRC.indexOf('// [EDU] spec §27.7(M3-B): 이 함수만 일반용과 다르다'), '교육용 missionDef 는 [EDU] 표식 블록이다');
  assert.ok(SRC.slice(SRC.indexOf('function missionDef(diff, stage)'), SRC.indexOf('// [/EDU]', SRC.indexOf('function missionDef(diff, stage)'))).indexOf('CONFIG.edu.many.missions') !== -1, '많이 모드에서는 CONFIG.edu.many.missions 를 읽는다');
  assert.ok(GEN.missionDef.toString().indexOf('eduTableMode') === -1 && GEN_SRC.indexOf('[EDU]') === -1, '일반용에는 [EDU] 표식·문제 양 표가 전혀 없다');
  // 연결 줄(awardGroup 의 그룹 이벤트·runAction 의 행동 이벤트·goalMet)도 두 앱에 같은 줄이 있다
  [
    "if (state.mission) missionUpdate(state.mission, { t: 'group', color: g.type, size: g.size });",
    "if (state.mission && id === state.gameId) missionUpdate(state.mission, { t: 'action', fromSwap: ctx.fromSwap, maxStep: ctx.maxStep });",
    'function goalMet() { return state.mission ? missionDone(state.mission) : isCleared(state.score, state.target); }',
    'ctx.fromSwap = true;',
    'buildMissionHud();',
    'state.mission = mdef ? missionInit(mdef) : null;',
    'state.mission = null;'
  ].forEach((line) => {
    assert.ok(GEN_SRC.indexOf(line) !== -1, '일반용에 없음: ' + line);
    assert.ok(SRC.indexOf(line) !== -1, '교육용에 없음: ' + line);
  });
  // [EDU] 클리어 판정 네 곳은 학습 조건까지 본다(spec §27.7 M3-B): 일반용의 goalMet() 자리를 stageDone() = goalMet() && learnMet() 로 바꿨다(학습 조건이 없으면 같은 값)
  [
    ['const cleared = goalMet();', 'const cleared = stageDone();'],
    ['if (goalMet() || state.timeUp) finishStage();', 'if (stageDone() || state.timeUp) finishStage();'],
    ['if (!state.locked && (state.timeUp || goalMet())) { finishStage(); return; }', 'if (!state.locked && (state.timeUp || stageDone())) { finishStage(); return; }'],
    ['if (!goalMet() && !hasValidMove(typeGrid())) {', 'if (!stageDone() && !hasValidMove(typeGrid())) {']
  ].forEach(([gen, edu]) => {
    assert.ok(GEN_SRC.indexOf(gen) !== -1, '일반용에 없음: ' + gen);
    assert.ok(SRC.indexOf(edu) !== -1, '교육용에 없음: ' + edu);
    assert.ok(SRC.indexOf(gen) === -1, '교육용에 일반용의 목표만 보는 판정이 남아 있음: ' + gen);
  });
  assert.ok(SRC.indexOf('function stageDone() { return goalMet() && learnMet(); }') !== -1);
  // runAction 의 ctx 에 fromSwap 이 있고(교육용은 fromSkill·quizzes 도), 행동 이벤트는 문제 단계(runQuizzes)보다 앞이다
  assert.ok(/const ctx = \{[^}]*fromSwap: false[^}]*\};/.test(SRC.slice(SRC.indexOf('async function runAction'))));
  const ra = SRC.slice(SRC.indexOf('async function runAction'), SRC.indexOf('/* ====', SRC.indexOf('async function runAction')));
  assert.ok(ra.indexOf("missionUpdate(state.mission, { t: 'action'") < ra.indexOf('await runQuizzes('), '행동 이벤트는 문제 팝업 전에 센다');
});

test('[EDU] 미션 표·특별/쉬운 구간 번호·상한이 일반용과 값·키 순서까지 같다(교육용 전용 표는 아직 없다 — M3-B 이후)', { skip: skipGen }, () => {
  const a = G.CONFIG.stages;
  const b = GEN.CONFIG.stages;
  ['goalType', 'missions', 'missionMaxParts', 'missionMaxChips', 'special', 'rest', 'count', 'star'].forEach((k) => {
    assert.deepStrictEqual(a[k], b[k], k);
    assert.strictEqual(JSON.stringify(a[k]), JSON.stringify(b[k]), k + ' 키 순서까지');
  });
  assert.deepStrictEqual(a.targets, b.targets, '점수 폴백 원본 표도 같다(교육용 ×1.2 는 stageTarget 에서 파생)');
  assert.deepStrictEqual(Object.keys(a), Object.keys(b), 'CONFIG.stages 키 순서');
});

test('[EDU] 점수 목표 ×1.2 는 점수형(초보·goalType score)에만 곱해지고, 미션 수치(개수·횟수)는 일반용 표 그대로이며 targetScale 을 바꿔도 변하지 않는다', async () => {
  // 점수형: 일반용 표 × 1.2 (100점 반올림)
  assert.strictEqual(G.stageTarget('easy', 1), 10800);
  assert.strictEqual(G.stageTarget('easy', 10), 18200);
  assert.strictEqual(G.stageTarget('normal', 1), 17900, '점수 폴백(참고값)도 ×1.2');
  G.CONFIG.stages.targets.easy.forEach((v, i) => assert.strictEqual(G.stageTarget('easy', i + 1), Math.round(v * 1.2 / 100) * 100));
  // 미션 수치: 표 그대로(×1.2 를 곱한 값이 아니다)
  assert.strictEqual(G.CONFIG.stages.missions.normal[0].parts[0].need, 21);
  assert.strictEqual(G.missionDescribe(G.missionDef('normal', 1)).summary, '불 보석 21개');
  assert.strictEqual(G.missionDescribe(G.missionDef('hard', 1)).summary, '한 번에 4개 이상 7번');
  // 실제 판: 칩의 need·aria 값은 21, 점수 폴백 참고값 state.target 은 17,900, 안내 문구는 미션
  const env = createEnv(100, (cfg) => { cfg.edu.targetScale = 2; });
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.strictEqual(I.state.mission.parts[0].need, 21);
  assert.strictEqual(I.el['mission-list'].children[0].getAttribute('aria-valuemax'), '21');
  assert.strictEqual(I.el['mission-list'].children[0].querySelector('.m-num').textContent, '0 / 21');
  assert.strictEqual(I.state.target, 29800, '점수 폴백 참고값(미션 레벨에서는 화면에 쓰지 않는다)은 targetScale 을 따른다: 시험 값 14,900 × 2');
  assert.strictEqual(I.el['count-info'].textContent, '레벨 1 · 미션: 불 보석 21개', '미션 레벨의 안내에는 점수 목표를 쓰지 않는다');
  assert.strictEqual(I.el['pause-level'].textContent, '중수 · 레벨 1 · 미션: 불 보석 21개');
  env.dispose();
  // 카드·설명판: 미션 레벨은 개수(21), 초보 점수 카드는 ×1.2 값, 설명판의 "목표 점수 N점"도 ×1.2
  const e2 = createEnv(101);
  const J = e2.I;
  J.save.level = 'normal';
  J.save.progress.normal = 2;
  J.renderStages();
  assert.ok(J.el['stage-grid'].children[0].innerHTML.indexOf('<b>21</b>') !== -1);
  assert.ok(J.el['stage-grid'].children[0].innerHTML.indexOf('17,900') === -1 && J.el['stage-grid'].children[0].innerHTML.indexOf('sc-target') === -1);
  J.save.level = 'easy';
  J.save.progress.easy = 2;
  J.renderStages();
  assert.ok(J.el['stage-grid'].children[0].innerHTML.indexOf('<span class="sc-target">10,800</span>') !== -1, '초보 카드의 점수는 ×1.2');
  assert.strictEqual(J.el['stage-grid'].children[0].getAttribute('aria-label'), '레벨 1, 목표 10,800점, 별 0개');
  assert.strictEqual(G.stageDetailInfo('easy', 1, true).goal, '목표 점수 10,800점');
  assert.strictEqual(G.stageDetailInfo('normal', 1, true).goal, '불 보석 21개');
  assert.strictEqual(G.stageCardLabel('easy', 3, true, 1), '레벨 3, 목표 ' + G.stageTarget('easy', 3).toLocaleString('ko-KR') + '점, 별 1개');
  // goalType 을 score 로 되돌리면 중수·고수 카드·설명판은 ×1.2 점수 목표를 보인다
  const e3 = createEnv(102, scoreCfg);
  e3.I.save.level = 'hard';
  e3.I.save.progress.hard = 1;
  e3.I.renderStages();
  assert.ok(e3.I.el['stage-grid'].children[0].innerHTML.indexOf('<span class="sc-target">' + G.stageTarget('hard', 1).toLocaleString('ko-KR') + '</span>') !== -1);
  assert.strictEqual(G.stageTarget('hard', 1), 21100, '고수 1단계 17,600 × 1.2');
  e2.dispose();
  e3.dispose();
});

/* ---------- [EDU] 같은 시드·같은 행동의 판 흐름: 교육용(spawn 0) = 일반용 ---------- */
/** 한 판을 정해진 행동 스크립트로 진행하고 행동마다 상태를 기록한다. 끝나면 남은 시간을 흘려 결과까지 본다 */
async function playTrace(env, lv, stage, seed, nActions) {
  const I = env.I;
  const st = I.state;
  const rng = mulberry(seed * 977 + stage * 31 + (lv === 'hard' ? 7 : lv === 'normal' ? 3 : 1));
  await startAndWait(env, lv, stage);
  const mis = () => st.mission ? st.mission.parts.map((p) => [p.n, p.each ? p.each.slice() : 0, p.done]).concat([st.mission.cur, st.mission.rev]) : null;
  const chips = () => I.el['mission-list'].children.map((c) => c.getAttribute('aria-label'));
  const trace = [];
  for (let n = 0; n < nActions && st.phase === 'playing'; n++) {
    await env.runFor(100 + Math.floor(rng() * 500));
    if (st.phase !== 'playing') break;
    if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
    const full = [];
    for (let i = 0; i < 6; i++) if (st.gauge[i] >= I.CONFIG.types[i].max) full.push(i);
    const roll = rng();
    if (full.length && roll < 0.55) {
      I.onGauge(full[Math.floor(rng() * full.length)]);
      if (st.aim !== null) I.handleTap(Math.floor(rng() * 8), Math.floor(rng() * 8));
    } else if (roll > 0.9) {
      const a = { r: Math.floor(rng() * 8), c: Math.floor(rng() * 7) };
      I.trySwap(a, { r: a.r, c: a.c + 1 });                       // 아무 곳이나 교환(무효일 수도 있다)
    } else {
      const moves = I.listMoves(I.typeGrid());
      const m = moves[Math.floor(rng() * moves.length)];
      I.trySwap(m.a, m.b);
    }
    await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000);
    await env.runFor(200);
    trace.push(JSON.stringify([I.typeGrid(), st.score, Math.round(st.timeLeft * 1000), st.gauge.slice(), st.stats.matches, st.stats.maxChain, st.stats.skills, st.phase, env.rnd, mis(), chips(), I.el['goal-text'].textContent, I.el.mission.hidden, I.el.goal.hidden]));
  }
  if (st.phase === 'playing') await env.runUntil(() => st.phase !== 'playing', 400000);
  await env.runFor(300);
  const g = (id) => env.doc.getElementById(id);
  const saved = JSON.parse(env.store[env.saveKey]);
  const out = { trace, rnd: env.rnd, end: [g('end-title').textContent, g('end-target').textContent, g('end-score').textContent, g('btn-next').hidden], stages: saved.stages[lv].slice(0, 3), progress: saved.progress, cleared: st.mission ? G.missionDone(st.mission) : null, errors: env.errors.length };
  return out;
}

test('[EDU] spawn=0 이면 교육용 중수·고수 미션 판(레벨 1~10)이 같은 시드·같은 행동의 일반용과 똑같이 흐른다(보드·점수·시간·게이지·미션 카운터·칩 글자·난수 호출 수·클리어 시점·결과·저장 기록)', { skip: skipGen }, async () => {
  let actions = 0;
  let games = 0;
  let cleared = 0;
  for (const lv of ['normal', 'hard']) {
    for (let stage = 1; stage <= 10; stage++) {
      for (let k = 0; k < 3; k++) {
        const seed = (lv === 'normal' ? 11 : 41) + stage + 100 * k;
        const edu = createEnv(seed * 13, null, { which: 'edu' });
        const gen = createEnv(seed * 13, null, { which: 'gen' });
        const t1 = await playTrace(edu, lv, stage, seed, 30);
        const t2 = await playTrace(gen, lv, stage, seed, 30);
        assert.ok(t1.trace.length >= 6, lv + ' ' + stage + ': 행동 수 ' + t1.trace.length);
        assert.deepStrictEqual(t1, t2, lv + ' 레벨 ' + stage + ' 시드 ' + seed + ': 일반용과 달라짐');
        assert.strictEqual(t1.errors, 0);
        assert.ok(t1.trace.some((t) => JSON.parse(t)[9] !== null), '미션형 판이었다');
        actions += t1.trace.length;
        games++;
        if (t1.cleared) cleared++;
        edu.dispose();
        gen.dispose();
      }
    }
  }
  assert.ok(actions > 1000, '비교한 행동 수 ' + actions);
  assert.strictEqual(games, 60);
  assert.ok(cleared >= 1, '클리어로 끝난 판이 최소 하나는 있어야 클리어 경로도 비교된다(' + cleared + ')');
});

test('[EDU] 롤백 스위치: goalType 을 전부 score 로 두면 교육용 중수·고수 판(레벨 1~10)이 일반용(같은 설정)과 똑같이 흐르고 미션 UI 가 없다', { skip: skipGen }, async () => {
  let actions = 0;
  for (const lv of ['normal', 'hard']) {
    for (const stage of [1, 3, 5, 8, 10]) {
      const seed = 70 + stage;
      const patch = (cfg) => { scoreCfg(cfg); if (stage % 2 === 1) cfg.stages.targets[lv][stage - 1] = 2500; };      // 홀수 레벨은 점수 목표를 낮춰 클리어하는 판도 비교한다
      const edu = createEnv(seed * 17, (cfg) => { patch(cfg); cfg.edu.targetScale = 1; }, { which: 'edu' });
      const gen = createEnv(seed * 17, patch, { which: 'gen' });
      const t1 = await playTrace(edu, lv, stage, seed, 20);
      const t2 = await playTrace(gen, lv, stage, seed, 20);
      assert.deepStrictEqual(t1, t2, lv + ' ' + stage + ' 점수형: 일반용과 달라짐');
      assert.ok(t1.trace.every((t) => JSON.parse(t)[9] === null && JSON.parse(t)[12] === true && JSON.parse(t)[13] === false), '점수형 판에는 미션 칩이 없고 목표 바가 보인다');
      actions += t1.trace.length;
      edu.dispose();
      gen.dispose();
    }
  }
  assert.ok(actions > 80, '비교한 행동 수 ' + actions);
});

/* ---------- [EDU] ? 선물상자가 섞인 그룹의 COLLECT·BIG 카운트 (spec §27.3: 그룹 크기에 ? 포함, 그 그룹의 진짜 보석 색으로 센다) ---------- */
/** 매치 없는 보드의 한 칸을 ? 로 바꾸고, 스왑 하나로 ? 가 지워지는 시나리오를 찾는다. pred(sim, firstGroups, board, move) */
function findWildScenario(pred) {
  for (let seed = 1; seed <= 4000; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    const rnd = mulberry(seed * 7 + 1);
    board[Math.floor(rnd() * 8)][Math.floor(rnd() * 8)] = W;
    if (G.findMatches(board).length) continue;
    const moves = G.listMoves(board);
    for (let mi = 0; mi < moves.length; mi++) {
      const after = swapped(board, moves[mi]);
      const first = G.findMatches(after);
      if (!first.some((x) => x.wilds > 0)) continue;
      for (let k = 0; k < 4; k++) {
        const sim = replay(after, { startStep: 1, rng: mulberry(seed * 100 + mi * 10 + k) });
        if (G.hasValidMove(sim.final) && G.countWild(sim.final) === 0 && pred(sim, first, board, moves[mi])) return { board, move: moves[mi], sim, first };
      }
    }
  }
  throw new Error('? 시나리오를 찾지 못함');
}
/** 문제 가짜(EduQuiz): 낸 문제를 env.asks 에 기록하고 thinkMs 뒤에 답한다 */
function stubQuiz(env, o) {
  const opt = o || {};
  env.asks = [];
  const snapOf = (st) => ({ score: st.score, timeLeft: st.timeLeft, active: st.quizActive, phase: st.phase, rev: st.mission ? st.mission.rev : -1, n: st.mission ? st.mission.parts.map((p) => p.n) : null });
  const quiz = {
    ready: true,
    ask() {
      const st = env.I.state;
      const rec = { index: env.asks.length, snap: snapOf(st) };
      env.asks.push(rec);
      return new Promise((resolve) => env.timers.setTimeout(() => {
        rec.after = snapOf(st);
        resolve(opt.answer ? opt.answer(rec, st) : { right: true, bonus: G.bonusFor(st.level) });
      }, opt.thinkMs == null ? 1500 : opt.thinkMs));
    },
    unitLabel() { return ''; },
    cancel() {}
  };
  env.setQuiz(quiz);
  return quiz;
}

test('[EDU] ? 가 낀 그룹: COLLECT 는 ? 를 포함한 그룹 크기를 그 그룹의 진짜 보석 색으로 센다(다른 색에는 세지 않는다), 연쇄 단계의 그룹도 같다', async () => {
  const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0 && x.size >= 3) && sim.maxStep >= 2);
  const wg = sc.first.filter((x) => x.wilds > 0)[0];
  const color = wg.type;
  const other = [0, 1, 2, 3, 4, 5].filter((c) => c !== color && !sc.first.some((x) => x.type === c))[0];
  assert.ok(wg.size >= 3 && wg.wilds >= 1);
  const env = createEnv(110, missionCfg('normal', { parts: [{ k: 'collect', color, need: 9999 }, { k: 'collect', color: other, need: 9999 }] }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, sc);
  const m = env.I.state.mission;
  const expectedMain = sumColor(sc.sim.events, color);
  assert.strictEqual(m.parts[0].n, expectedMain, '? 포함 크기로 센 값이 리플레이(? 를 칸으로 센 그룹 크기)와 같다');
  assert.ok(expectedMain >= wg.size, '첫 그룹(? 포함) 크기 ' + wg.size + ' 이상');
  assert.strictEqual(m.parts[1].n, sumColor(sc.sim.events, other), '다른 색 미션은 자기 색 그룹만 센다(? 가 낀 그룹은 세지 않는다)');
  assert.strictEqual(G.countWild(env.I.typeGrid()), 0, '? 는 지워졌다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] ? 가 낀 그룹: BIG 은 ? 를 포함한 크기로 판정한다(진짜 보석 3개 + ? = 4 → 큰 매치 1번)', async () => {
  const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0 && x.size === 4 && x.size - x.wilds === 3));
  const bigSim = sc.sim.events.filter((e) => e.size >= 4).length;
  const wg = sc.first.filter((x) => x.wilds > 0 && x.size === 4)[0];
  assert.ok(bigSim >= 1 && wg.size - wg.wilds === 3);
  const env = createEnv(111, missionCfg('normal', { parts: [{ k: 'big', min: 4, need: 99 }, { k: 'big', min: 5, need: 99 }] }));
  await startAndWait(env, 'normal', 1);
  await runSwap(env, sc);
  const m = env.I.state.mission;
  assert.strictEqual(m.parts[0].n, bigSim, '? 를 센 크기 4 그룹이 큰 매치로 세어진다(진짜 보석만 세면 3 이라 세지 않을 그룹)');
  assert.strictEqual(m.parts[1].n, sc.sim.events.filter((e) => e.size >= 5).length);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] ? 매치 뒤 문제 팝업: 팝업 중에는 판 시계·미션 카운터가 멈추고, 정답 보너스는 점수에만 더해지며 미션 진행(카운터·rev·칩)은 그대로다', async () => {
  const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0 && x.size >= 3) && sim.maxStep === 1);
  const color = sc.first.filter((x) => x.wilds > 0)[0].type;
  const env = createEnv(112, missionCfg('normal', { parts: [{ k: 'collect', color, need: 9999 }, { k: 'chain', min: 2, need: 99 }] }));
  stubQuiz(env, { thinkMs: 5000 });
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  const st = I.state;
  applyBoard(env, sc.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
  I.trySwap(sc.move.a, sc.move.b);
  await env.runUntil(() => env.asks.length === 1, 120000);
  assert.strictEqual(st.quizActive, true);
  assert.strictEqual(env.asks.length, 1, '? 하나 -> 문제 1개');
  const during = { score: st.score, timeLeft: st.timeLeft, rev: st.mission.rev, n: st.mission.parts.map((p) => p.n), label: I.el['mission-list'].children.map((c) => c.getAttribute('aria-label')) };
  assert.strictEqual(during.n[0], sumColor(sc.sim.events, color), '문제가 뜨기 전에 이미 이 행동의 그룹이 세어졌다');
  await env.runFor(3000);                                             // 생각하는 중: 게임 시계도 미션 카운터도 그대로
  assert.strictEqual(st.quizActive, true);
  assert.strictEqual(st.timeLeft, during.timeLeft, '문제 중 게임 시계 정지');
  assert.strictEqual(st.score, during.score);
  assert.strictEqual(st.mission.rev, during.rev, '문제 중 미션 카운터 불변');
  assert.deepStrictEqual(I.el['mission-list'].children.map((c) => c.getAttribute('aria-label')), during.label, '문제 중 칩 불변');
  await finishAction(env);                                            // 정답 -> 보너스 -> 행동 종료
  assert.strictEqual(st.phase, 'playing');
  const bonus = G.bonusFor('normal');
  assert.strictEqual(bonus, 900);
  assert.strictEqual(st.score, during.score + bonus, '정답 보너스(일시불 900)는 점수에만');
  assert.strictEqual(st.edu.bonus, bonus);
  assert.strictEqual(st.mission.rev, during.rev, '보너스는 미션 진행(rev)을 바꾸지 않는다');
  assert.deepStrictEqual(st.mission.parts.map((p) => p.n), during.n, '보너스는 미션 카운터를 바꾸지 않는다');
  assert.strictEqual(st.mission.parts[1].n, 0, '? 매치 뒤 문제는 CHAIN 을 올리지 않는다(연쇄 1)');
  assert.strictEqual(st.quizActive, false);
  assert.strictEqual(I.goalMet(), false);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 미션을 끝낸 바로 그 행동에 ? 문제가 따라오면: 문제를 끝까지 풀고(오답이어도) 그 뒤 STAGE CLEAR 가 된다 — 점수와 무관, 별·남은 시간은 점수형과 같은 식', async () => {
  for (const right of [true, false]) {
    const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0 && x.size >= 3) && sim.maxStep === 1);
    const color = sc.first.filter((x) => x.wilds > 0)[0].type;
    const need = sc.first.filter((x) => x.wilds > 0)[0].size;
    const env = createEnv(113, missionCfg('normal', { parts: [{ k: 'collect', color, need }] }));
    stubQuiz(env, { thinkMs: 1500, answer: (rec, st) => (right ? { right: true, bonus: G.bonusFor(st.level) } : { right: false, bonus: 0 }) });
    const ended = [];
    env.sandbox.ElementGemsHost.on('stageEnd', (d) => ended.push(d));
    await startAndWait(env, 'normal', 1);
    const I = env.I;
    const st = I.state;
    applyBoard(env, sc.board);
    env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
    I.trySwap(sc.move.a, sc.move.b);
    await env.runUntil(() => env.asks.length === 1, 120000);
    assert.strictEqual(st.quizActive, true);
    assert.strictEqual(st.phase, 'playing', '문제가 뜬 동안에는 아직 끝나지 않았다(미션은 이미 달성)');
    assert.strictEqual(I.goalMet(), true);
    await env.runUntil(() => st.phase !== 'playing', 120000);
    await env.runFor(300);
    assert.strictEqual(env.doc.getElementById('end-title').textContent, 'STAGE CLEAR!');
    assert.match(env.doc.getElementById('end-target').textContent, /^미션 모두 달성 · 남은 시간 /);
    assert.strictEqual(env.asks.length, 1);
    assert.strictEqual(st.edu.asked, 1);
    assert.strictEqual(st.edu.right, right ? 1 : 0);
    assert.strictEqual(ended.length, 1);
    assert.strictEqual(ended[0].cleared, true);
    const left = G.leftFromTime(st.timeLeft);
    const rec = I.save.stages.normal[0];
    assert.deepStrictEqual({ stars: rec.stars, left: rec.left }, { stars: G.starsFor(left, st.startTime), left });
    assert.strictEqual(rec.best, st.score, 'best 는 도달 점수(정답 보너스 포함)');
    assert.ok(env.store[SAVE_KEY.edu], '교육용 저장 키에 기록');
    assert.strictEqual(env.store[SAVE_KEY.gen], undefined, '일반용 저장 키는 건드리지 않는다');
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('[EDU] 스킬이 시작한 행동은 ? 가 지워져도(문제 없음) CHAIN 으로 세지 않고, 스킬로 직접 지운 칸(? 포함)은 COLLECT 로 세지 않는다. 스왑이 시작한 ? 매치 행동의 연쇄는 CHAIN 으로 센다', async () => {
  // 불 스킬: 가운데 칸이 ? 인 3×3 을 지운다. 뒤따른 연쇄 그룹만 COLLECT 로 센다
  let found = null;
  for (let seed = 1; seed <= 800 && !found; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    for (let r = 1; r <= 6 && !found; r++) {
      for (let c = 1; c <= 6 && !found; c++) {
        const b2 = board.map((row) => row.slice());
        b2[r][c] = W;
        if (G.findMatches(b2).length) continue;
        const cells = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.push({ r: r + dr, c: c + dc });
        for (let k = 0; k < 6 && !found; k++) {
          const sim = replay(b2, { startStep: 2, removeCells: cells, rng: mulberry(seed * 1000 + r * 100 + c * 10 + k) });
          const cas = sim.events.filter((e) => e.step >= 2);
          if (!G.hasValidMove(sim.final) || sim.maxStep < 2 || cas.length < 1) continue;
          found = { board: b2, r, c, sim, col: cas[0].color };
        }
      }
    }
  }
  assert.ok(found, '스킬 시나리오를 찾지 못함');
  const env = createEnv(114, missionCfg('normal', { parts: [{ k: 'collect', color: found.col, need: 9999 }, { k: 'chain', min: 2, need: 99 }] }));
  stubQuiz(env, {});
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  applyBoard(env, found.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, found.sim.forced);
  I.state.gauge[0] = I.CONFIG.types[0].max;
  I.onGauge(0);
  assert.strictEqual(I.state.aim, 0);
  I.handleTap(found.r, found.c);
  await finishAction(env);
  assert.strictEqual(env.sandbox.__forced.length, 0);
  assert.strictEqual(env.asks.length, 0, '스킬이 시작한 행동은 ? 가 지워져도 문제를 내지 않는다');
  assert.strictEqual(I.state.mission.parts[0].n, sumColor(found.sim.events, found.col), '뒤따른 연쇄 그룹만 센다(스킬로 지운 칸은 세지 않는다)');
  assert.strictEqual(I.state.mission.parts[1].n, 0, '스킬이 시작한 행동은 CHAIN 으로 세지 않는다');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
  // 스왑으로 시작한 행동: ? 가 지워지고 연쇄 2 이상이면 CHAIN +1(행동당 1번), 문제는 그 뒤에 나오고 CHAIN 을 더 올리지 않는다
  const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0) && sim.maxStep >= 2);
  const e2 = createEnv(115, missionCfg('normal', { parts: [{ k: 'chain', min: 2, need: 99 }, { k: 'chain', min: 3, need: 99 }] }));
  stubQuiz(e2, {});
  await startAndWait(e2, 'normal', 1);
  await runSwap(e2, sc);
  assert.strictEqual(e2.asks.length, 1);
  assert.strictEqual(e2.I.state.mission.parts[0].n, 1, 'CHAIN 2 이상: 행동당 1번');
  assert.strictEqual(e2.I.state.mission.parts[1].n, sc.sim.maxStep >= 3 ? 1 : 0, 'CHAIN 3 이상은 최대 연쇄가 3 이상일 때만');
  assert.deepStrictEqual(e2.errors, []);
  e2.dispose();
});

test('[EDU] 칭찬 팝업 대기(praiseHoldMs)·문제 팝업 중 일시정지/탭 숨김이 미션 카운터·진행도를 바꾸지 않는다(게임 시계와 같이 멈춘다)', async () => {
  const sc = findWildScenario((sim, first) => first.some((x) => x.wilds > 0 && x.size >= 4) && sim.maxStep >= 2);
  const color = sc.first.filter((x) => x.wilds > 0)[0].type;
  const env = createEnv(116, missionCfg('normal', { parts: [{ k: 'collect', color, need: 9999 }] }));
  stubQuiz(env, { thinkMs: 4000 });
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  const st = I.state;
  applyBoard(env, sc.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
  I.trySwap(sc.move.a, sc.move.b);
  await env.runUntil(() => env.asks.length === 1, 120000);
  assert.strictEqual(st.quizActive, true);
  const n0 = st.mission.parts[0].n;
  const t0 = st.timeLeft;
  I.pauseGame();                                                      // 문제 중 일시정지는 무시된다([EDU] quizActive 가드)
  assert.strictEqual(st.phase, 'playing');
  await env.runFor(2000);
  assert.strictEqual(st.timeLeft, t0);
  assert.strictEqual(st.mission.parts[0].n, n0);
  await finishAction(env);
  assert.strictEqual(st.mission.parts[0].n, n0, '문제가 끝난 뒤에도 같다(정답 보너스는 카운트하지 않는다)');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

/* ---------- [EDU] 새 문자열/마크업 ---------- */
test('[EDU] 교육용 index.html·game.js 의 미션 관련 새 문구에도 §27.6.2 의 피하는 말과 "쉬어가기"가 없다(교육용 전용 화면 문구는 대상이 아니다)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const seg = [
    html.slice(html.indexOf('<!-- 미션 칩'), html.indexOf('id="board-wrap"')),
    html.slice(html.indexOf('<!-- 선택 레벨 설명판'), html.indexOf('class="stages-hint"')),
    html.slice(html.indexOf('id="rule-stage"'), html.indexOf('</li>', html.indexOf('id="rule-stage"')))
  ];
  seg.forEach((s) => assert.ok(s.length > 80, '구간을 찾았다'));
  seg.forEach((s) => AVOID_ALL.forEach((w) => assert.ok(s.indexOf(w) === -1, '"' + w + '" 가 마크업에 있음')));
  const ids = ['mission', 'mission-list', 'mission-live', 'stage-detail', 'sd-title', 'sd-tag', 'sd-goal', 'sd-hint', 'sd-time', 'btn-stage-go'];
  ids.forEach((id) => assert.strictEqual((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' 는 한 번'));
  // 교육용 전용 요소는 그대로 있다(이식이 지우지 않았다)
  ['end-quiz', 'eg-quiz', 'screen-edu-pick', 'eg-unit-card'].forEach((id) => assert.ok(html.indexOf('id="' + id + '"') !== -1, id));
  // game.js cacheDom 의 id 목록에 새 id 가 모두 있고, index.html 에 없는 id 를 읽지 않는다
  ids.forEach((id) => assert.ok(SRC.indexOf("'" + id + "'") !== -1, 'cacheDom: ' + id));
});
