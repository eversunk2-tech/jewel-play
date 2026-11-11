/* 정령 특별 레벨 시험 — spec §27.6(비폭력 프레임 F1 "잠든 원소 정령 깨우기")·§27.8·§27.9.3 ⑥·§27.10(9·10)·§33, M4-A(일반용).
 * 실행: node --test apps/element-gems/test/*.test.js
 *
 * ① 표(6곳의 색·이름, 특별이 아닌 레벨은 null) ② 단계 수 n ③ spiritStep(초보 경계값·감소 없음·SEQ 단계 수)
 * ④ 규칙 불변: 같은 시드 봇 판을 "M4 시작 시점의 game.js"와 지금 game.js 로 각각 돌려 점수·미션 카운터·시간·goalMet·종료 시점·결과 문구·저장이 같음을 증명한다.
 *    기준 소스 = 환경변수 EG_BASELINE_GAME_JS(파일 경로)가 있으면 그 파일, 없으면 git 의 커밋 d635165(M3 푸시 기록, M4 시작 시점)의 apps/element-gems/game.js. 둘 다 못 구하면 그 시험만 건너뛴다.
 * ⑤ DOM(가짜 DOM + 가상 시계): 특별 레벨에서만 #spirit 보임·진행 갱신·낭독·praise-good 한 번(여러 단계 동시 완료도 한 번)·이중 낭독 없음
 * ⑥ 결과 줄 ⑦ 깨운 정령 수와 저장 구조 불변 ⑧ 문구 점검(§27.6.2 피하는 말·"쉬어가기") ⑨ CSS 문자열 검사 ⑩ 새 에셋 파일 0개.
 * 시험은 CONFIG 를 시험용 복사본(샌드박스)에서만 바꾼다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
/* 메뉴 V1 블록(spec §32, U-A)은 style.css 맨 끝에 붙는다. 앞 단계 블록 검사는 "파일 끝까지"가 아니라 이 표식 앞까지를 본다(단언은 그대로, 앵커만 내용으로 옮김) */
const MENU_MARK = '/* 메뉴 V1 (spec §32, U-A) */';
const beforeMenu = (text) => { const i = text.indexOf(MENU_MARK); return i === -1 ? text : text.slice(0, i); };

const root = path.join(__dirname, '..');
const GAME_PATH = path.join(root, 'game.js');
const G = require(GAME_PATH);
const R = require(path.join(root, 'ranking.js'));
const SRC = fs.readFileSync(GAME_PATH, 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const BASE_COMMIT = 'd635165';

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const DIFFS = ['easy', 'normal', 'hard'];
const AVOID = ['보스', '몬스터', '전투', '싸움', '대결', '공격', '때리', '쓰러뜨', '처치', '무찌르', '물리치', '체력', 'HP', '데미지', '피해', '죽다', '죽는', '사망', 'KO', '파괴', '부수', '폭발', '패배', '졌다', '졌어', '쉬어가'];
const standalone = /(^|[\s,·(→])적($|[\s,·)→])/;
const noAvoid = (s, where) => {
  AVOID.forEach((w) => assert.ok(s.indexOf(w) === -1, '"' + w + '" 가 문구에 있음(' + where + '): ' + s));
  assert.ok(!standalone.test(s), '"적" 이 낱말로 쓰임(' + where + '): ' + s);
};

/* spec §27.6.1 표(시험 쪽에서 따로 적은 값): 난이도별 {5단계, 10단계} 정령 색 번호와 이름 */
const SPEC_SPIRITS = {
  easy: { 5: [3, '번개 정령'], 10: [5, '빛 정령'] },
  normal: { 5: [2, '풀 정령'], 10: [0, '불 정령'] },
  hard: { 5: [1, '물 정령'], 10: [4, '어둠 정령'] }
};

/* ===================================================================
 * 1) 표·단계 수·spiritStep (순수 함수)
 * =================================================================== */
test('① 표: 6곳(초보 번개·빛 / 중수 풀·불 / 고수 물·어둠)의 색·이름·단계 수가 spec 과 같고, 특별이 아닌 레벨은 null', () => {
  const S = G.CONFIG.stages;
  assert.deepStrictEqual(S.special, [5, 10]);
  assert.deepStrictEqual(Object.keys(S.spirit.types).sort(), ['easy', 'hard', 'normal']);
  assert.strictEqual(S.spirit.easySteps, 3);
  const colors = [];
  DIFFS.forEach((d) => [5, 10].forEach((n) => {
    const sp = G.spiritOf(d, n);
    const want = SPEC_SPIRITS[d][n];
    assert.ok(sp, d + ' ' + n);
    assert.deepStrictEqual(Object.keys(sp).sort(), ['name', 'steps', 'type'], '반환 모양 { type, name, steps }');
    assert.strictEqual(sp.type, want[0], d + ' ' + n + ' 색');
    assert.strictEqual(sp.name, want[1], d + ' ' + n + ' 이름 = CONFIG.types[색].name + " 정령"');
    assert.strictEqual(sp.name, G.CONFIG.types[sp.type].name + ' 정령');
    colors.push(sp.type);
  }));
  assert.deepStrictEqual(colors.slice().sort(), [0, 1, 2, 3, 4, 5], '여섯 정령은 서로 다르다(6원소 = 6정령)');
  DIFFS.forEach((d) => [1, 2, 3, 4, 6, 7, 8, 9, 11, 0, -1, 5.5].forEach((n) => assert.strictEqual(G.spiritOf(d, n), null, d + ' ' + n)));
  assert.strictEqual(G.spiritOf('nope', 5), null);
});

test('② 단계 수 n: 초보 = easySteps(3), 중수·고수 = SEQ 미션의 부분 수(표의 5·10단계 값과 일치). 점수 폴백이면 easySteps', () => {
  const S = G.CONFIG.stages;
  assert.strictEqual(G.spiritOf('easy', 5).steps, 3);
  assert.strictEqual(G.spiritOf('easy', 10).steps, 3);
  ['normal', 'hard'].forEach((d) => [5, 10].forEach((n) => {
    const def = S.missions[d][n - 1];
    assert.strictEqual(def.seq, true, d + ' ' + n + ' 은 SEQ');
    assert.strictEqual(G.spiritOf(d, n).steps, def.parts.length, d + ' ' + n);
    assert.ok(def.parts.length === 3 || def.parts.length === 4, '부분 수 3~4');
  }));
  const saved = JSON.stringify([S.goalType, S.missions, S.spirit]);
  try {
    // 동시 칩(COMBO) 특별 레벨은 패널 높이 예산(93px) 때문에 정령을 쓰지 않는다
    S.missions.normal[4] = { parts: [{ k: 'collect', color: 0, need: 5 }, { k: 'big', min: 4, need: 2 }], seq: false };
    assert.strictEqual(G.spiritOf('normal', 5), null);
    // 롤백(goalType score)이면 점수 n 등분으로 계속 동작한다
    S.missions.normal[4] = JSON.parse(saved)[1].normal[4];
    S.goalType.hard = 'score';
    assert.strictEqual(G.spiritOf('hard', 5).steps, 3);
    // 표를 바꾸면 단계 수도 따라간다(CONFIG 한 곳)
    S.spirit.easySteps = 4;
    assert.strictEqual(G.spiritOf('easy', 5).steps, 4);
    S.spirit.easySteps = 0;
    assert.strictEqual(G.spiritOf('easy', 5), null, '단계 수가 정수 1~8 이 아니면 정령을 쓰지 않는다');
    S.spirit.easySteps = 3;
    S.spirit.types.easy[5] = 9;
    assert.strictEqual(G.spiritOf('easy', 5), null, '색 번호가 0~5 가 아니면 null');
  } finally {
    const [gt, ms, sp] = JSON.parse(saved);
    S.goalType = gt; S.missions = ms; S.spirit = sp;
  }
  assert.strictEqual(G.spiritOf('easy', 5).type, 3, '시험이 끝난 뒤 표가 되돌려졌다');
});

test('③ spiritStep(초보): 목표 점수를 3등분한 지점을 넘은 수 — 1/3 직전·정확히·초과, 2/3, 목표 도달, 감소 없음', () => {
  const info = G.spiritOf('easy', 5);
  const T = 9000;                           // 3으로 나누어 떨어지는 목표(경계값을 정확히 검사)
  const k = (score) => G.spiritStep(info, score, T, null);
  assert.strictEqual(k(0), 0);
  assert.strictEqual(k(2999), 0, '1/3 직전');
  assert.strictEqual(k(3000), 1, '1/3 정확히');
  assert.strictEqual(k(3001), 1, '1/3 초과');
  assert.strictEqual(k(5999), 1);
  assert.strictEqual(k(6000), 2, '2/3 정확히');
  assert.strictEqual(k(8999), 2);
  assert.strictEqual(k(9000), 3, '목표 정확히');
  assert.strictEqual(k(9001), 3);
  assert.strictEqual(k(90000), 3, '목표를 크게 넘어도 n 을 넘지 않는다');
  // 3으로 안 나누어 떨어지는 실제 목표(10,600)
  const T2 = G.stageTarget('easy', 5);
  assert.strictEqual(T2, 10600);
  assert.strictEqual(G.spiritStep(info, 3533, T2, null), 0);
  assert.strictEqual(G.spiritStep(info, 3534, T2, null), 1, '10600/3 = 3533.33… 를 넘는 첫 정수');
  assert.strictEqual(G.spiritStep(info, 7066, T2, null), 1);
  assert.strictEqual(G.spiritStep(info, 7067, T2, null), 2);
  assert.strictEqual(G.spiritStep(info, 10599, T2, null), 2);
  assert.strictEqual(G.spiritStep(info, 10600, T2, null), 3);
  // 목표 달성(isCleared)과 k = n 은 같은 순간이다
  for (let sc = 0; sc <= 12000; sc += 7) assert.strictEqual(G.spiritStep(info, sc, T2, null) === info.steps, G.isCleared(sc, T2), 'score ' + sc);
  // 점수가 늘면 k 는 줄지 않는다(단조), 이상한 입력은 0
  let last = 0;
  for (let sc = 0; sc <= 12000; sc += 13) { const v = G.spiritStep(info, sc, T2, null); assert.ok(v >= last); last = v; }
  assert.strictEqual(G.spiritStep(info, 5000, 0, null), 0);
  assert.strictEqual(G.spiritStep(info, -5, T2, null), 0);
  assert.strictEqual(G.spiritStep(info, NaN, T2, null), 0);
  assert.strictEqual(G.spiritStep(null, 5000, T2, null), 0);
  // 정령 단계 수가 다르면(예: 4등분) 그 수로 나눈다
  assert.strictEqual(G.spiritStep({ type: 3, name: '번개 정령', steps: 4 }, 4500, 9000, null), 2);
});

test('③ spiritStep(SEQ): 끝난 단계 수 = missionProgress().doneCount, 단계를 건너뛰어 한꺼번에 끝나도 그대로, 감소 없음', () => {
  ['normal', 'hard'].forEach((d) => [5, 10].forEach((n) => {
    const def = G.CONFIG.stages.missions[d][n - 1];
    const info = G.spiritOf(d, n);
    const m = G.missionInit(def);
    assert.strictEqual(G.spiritStep(info, 0, 0, m), 0);
    let last = 0;
    for (let guard = 0; guard < 300 && !G.missionDone(m); guard++) {
      const cur = m.parts[Math.min(m.cur, m.parts.length - 1)];
      if (cur.k === 'collect') G.missionUpdate(m, { t: 'group', color: cur.color, size: 3 });
      else if (cur.k === 'collectEach') cur.colors.forEach((c) => G.missionUpdate(m, { t: 'group', color: c, size: 3 }));
      else if (cur.k === 'big') G.missionUpdate(m, { t: 'group', color: 1, size: Math.max(4, cur.min) });
      else G.missionUpdate(m, { t: 'action', fromSwap: true, maxStep: cur.min });
      const k = G.spiritStep(info, 0, 0, m);
      assert.strictEqual(k, G.missionProgress(m).doneCount, d + ' ' + n + ' k = doneCount');
      assert.strictEqual(k, m.parts.filter((p) => p.done).length);
      assert.ok(k >= last && k - last <= 1, '단계는 하나씩 오른다(이벤트 하나는 지금 차례의 단계에만 세어진다)');
      last = k;
    }
    assert.strictEqual(last, info.steps, d + ' ' + n + ' 모두 끝나면 k = n');
    assert.strictEqual(G.spiritStep(info, 0, 0, m), G.missionDone(m) ? info.steps : 0);
    // SEQ 가 아닌 순서(뒤 단계 먼저 채우기)는 k 에 반영되지 않는다: 지금 차례가 아닌 부분은 세지 않는다
    const m2 = G.missionInit(def);
    G.missionUpdate(m2, { t: 'action', fromSwap: true, maxStep: 9 });
    assert.ok(G.spiritStep(info, 0, 0, m2) <= 1);
    // 점수·목표는 미션이 있으면 쓰지 않는다
    assert.strictEqual(G.spiritStep(info, 999999, 1, G.missionInit(def)), 0, '미션이 있으면 점수로 k 를 정하지 않는다');
  }));
});

test('③ 문구: SPIRIT_TEXT 는 정령 6종 × k 0..n × 특별 여부 전부에서 값이 나오고, 피하는 말·"쉬어가기"가 없으며, 초보 문구에는 미션·특별 말이 없다', () => {
  const T = G.SPIRIT_TEXT;
  const strings = [];
  DIFFS.forEach((d) => [5, 10].forEach((n) => {
    const sp = G.spiritOf(d, n);
    strings.push(T.pending(sp), T.done(sp), T.endClear(sp));
    for (let k = 0; k <= sp.steps; k++) {
      [true, false].forEach((special) => strings.push(T.panel(sp, k, special)));
      strings.push(T.title(sp, k), T.count(sp, k), T.scoreNote(sp, k), T.endFail(sp, k));
      if (k >= 1) strings.push(T.step(sp, k));
      if (d === 'easy') [T.title(sp, k), T.count(sp, k), T.scoreNote(sp, k), T.panel(sp, k, false), T.pending(sp), T.endFail(sp, k), T.step(sp, k), T.done(sp)].forEach((s) => assert.ok(!/미션|특별|쉬어가/.test(s), '초보 문구에 미션·특별 말이 없다: ' + s));
    }
  }));
  for (let m = 0; m <= 6; m++) strings.push(T.roster(m, 6), T.rosterSpoken(m, 6));
  assert.ok(strings.length > 150);
  strings.forEach((s) => { assert.ok(typeof s === 'string' && s.length > 3); noAvoid(s, 'SPIRIT_TEXT'); });
  // 지침이 정한 문구
  const sp = G.spiritOf('normal', 5);
  assert.strictEqual(T.pending(sp), '잠든 풀 정령 친구가 기다려요');
  assert.strictEqual(T.panel(sp, 1, true), '특별 레벨, 잠든 풀 정령, 깨어남 1/3');
  assert.strictEqual(T.step(sp, 1), '풀 정령이 한 걸음 더 깨어났어요 (1/3)');
  assert.strictEqual(T.done(sp), '풀 정령이 깨어났어요! 고마워요');
  assert.strictEqual(T.endClear(sp), '풀 정령이 깨어났어요! 고마워요');
  assert.strictEqual(T.endFail(sp, 1), '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 1/3)');
  assert.strictEqual(T.title(sp, 0), '잠든 풀 정령');
  assert.strictEqual(T.title(sp, 3), '풀 정령이 깨어났어요!');
  assert.strictEqual(T.count(sp, 2), '깨어남 2/3');
  assert.strictEqual(T.rosterSpoken(2, 6), '깨운 정령 2마리 / 6마리');
  const e = G.spiritOf('easy', 5);
  assert.strictEqual(T.scoreNote(e, 1), '목표 점수의 1/3에 왔어요! 다음은 2/3');
  assert.strictEqual(T.panel(e, 0, false), '잠든 번개 정령, 깨어남 0/3', '초보 패널 이름에는 "특별 레벨"이 없다');
});

test('③ 카드 aria-label·설명판 한 줄: 정령 이름만 더해지고(초보는 "특별 레벨" 말 없이), 6곳 외에는 그대로다', () => {
  assert.strictEqual(G.stageCardLabel('normal', 5, true, 0).startsWith('레벨 5, 특별 레벨, 잠든 풀 정령, 미션 '), true);
  assert.strictEqual(G.stageCardLabel('easy', 5, true, 2), '레벨 5, 잠든 번개 정령, 목표 10,600점, 별 2개');
  assert.strictEqual(G.stageCardLabel('hard', 10, false, 0).startsWith('레벨 10, 특별 레벨, 잠든 어둠 정령, 미션 '), true);
  assert.ok(G.stageCardLabel('hard', 10, false, 0).endsWith(', 잠김'));
  [1, 2, 3, 4, 6, 7, 8, 9].forEach((n) => DIFFS.forEach((d) => assert.ok(G.stageCardLabel(d, n, true, 0).indexOf('정령') === -1, d + ' ' + n)));
  DIFFS.forEach((d) => [5, 10].forEach((n) => {
    const info = G.stageDetailInfo(d, n, true);
    assert.ok(info.hint.startsWith('잠든 ' + SPEC_SPIRITS[d][n][1] + ' 친구가 기다려요'), d + ' ' + n + ' ' + info.hint);
    assert.strictEqual(G.stageDetailInfo(d, n, false).hint, '', '잠긴 레벨은 잠김 안내만');
    noAvoid(info.hint, '설명판');
  }));
  assert.strictEqual(G.stageDetailInfo('easy', 5, true).hint, '잠든 번개 정령 친구가 기다려요', '초보는 같은 문구, 미션·쉬어가기 말 없음');
  assert.strictEqual(G.stageDetailInfo('easy', 5, true).tag, '');
  assert.strictEqual(G.stageDetailInfo('easy', 4, true).hint, '');
});

/* ===================================================================
 * 2) 가짜 DOM + 가상 시계 하네스 — 실제 game.js 를 그대로 실행한다(mission.test.js 하네스를 줄여서 사용, 소스를 바꿔 끼울 수 있게 했다)
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, hud: hud, CONFIG: CONFIG, audio: audio, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, goStages: goStages, typeGrid: typeGrid, setGemType: setGemType, listMoves: listMoves, renderStages: renderStages, goalMet: goalMet, finishStage: finishStage }; }\n";
function compile(src, name) {
  assert.ok(src.indexOf(HOOK_TAIL) !== -1, name + ': game.js 끝부분을 찾지 못함');
  return new vm.Script(src.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: name });
}
const SCRIPT = compile(SRC, 'general/game.js');

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
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl('span')); }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {} blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

/** script: 컴파일된 game.js, cfgPatch(CONFIG): 시험용 복사본의 CONFIG 만 바꾼다, o.reduce: prefers-reduced-motion(기본 true — 입자 난수를 쓰지 않는다) */
function createEnv(seed, cfgPatch, o) {
  o = o || {};
  const script = o.script || SCRIPT;
  const env = { _now: 0, _seq: 0, _q: [], errors: [], rnd: 0, timersMade: 0 };
  env.timers = {
    setTimeout(fn, ms) { const id = ++env._seq; env.timersMade++; env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn }); return id; },
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
  const reduce = o.reduce !== false;
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: reduce }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: () => { env.rnd++; return rand(); },
    __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  script.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store;
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.CONFIG.board.enabled = false;
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
  /** 효과음 기록: audio.play 를 가로채 { name, spirit } 로 쌓는다(spirit = 정령 그림 함수 drawSpirit 안에서 불렸는가 — 호출 스택으로 구분) */
  env.sfxLog = [];
  env.I.audio.play = function (name) { env.sfxLog.push({ name, spirit: /drawSpirit/.test(new Error().stack) }); };
  env.el = (id) => doc.getElementById(id);
  return env;
}

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
  await env.runFor(400);
}

/* ---------- 한 행동의 정산을 순수 함수로 되풀이한다(기대값 계산용, mission.test.js 와 같은 방식) ---------- */
const swapped = (b, m) => { const c = b.map((r) => r.slice()); const t = c[m.a.r][m.a.c]; c[m.a.r][m.a.c] = c[m.b.r][m.b.c]; c[m.b.r][m.b.c] = t; return c; };
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
function findSwapScenario(pred) {
  for (let seed = 1; seed <= 900; seed++) {
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
  assert.strictEqual(env.sandbox.__forced.length, 0, '시나리오의 새 칸 종류가 모두 순서대로 쓰였다');
}
/** 연쇄 없이 한 번에 3개 그룹 하나만 나오는 평범한 스왑(칭찬 팝업·정령 외 효과음이 없다) */
const plainScenarios = {};
function plainScenario(i) {
  if (!plainScenarios[i]) {
    const used = Object.keys(plainScenarios).map((k) => plainScenarios[k].move.a.r + ',' + plainScenarios[k].move.a.c + ',' + plainScenarios[k].move.b.r + ',' + plainScenarios[k].move.b.c + ':' + JSON.stringify(plainScenarios[k].board));
    plainScenarios[i] = findSwapScenario((sim, board, mv) => sim.events.length === 1 && sim.events[0].size === 3 && sim.maxStep === 1 && used.indexOf(mv.a.r + ',' + mv.a.c + ',' + mv.b.r + ',' + mv.b.c + ':' + JSON.stringify(board)) === -1);
  }
  return plainScenarios[i];
}
const sfxNames = (env) => env.sfxLog.map((e) => e.name + (e.spirit ? '*' : ''));
const spiritSfx = (env) => env.sfxLog.filter((e) => e.spirit).map((e) => e.name);
const praise = (env) => env.sfxLog.filter((e) => !e.spirit && /^praise-/.test(e.name));

/** 시험 도구: 중수 5단계를 "플레이어 한 걸음 = 한 단계"가 되도록 작은 SEQ 미션으로 바꾼다(개수는 시험이 정한다) */
function seqCfg(parts, lv) {
  return (cfg) => {
    cfg.stages.goalType[lv || 'normal'] = 'mission';
    cfg.stages.missions[lv || 'normal'][4] = { parts, seq: true };
  };
}

/* ===================================================================
 * 3) DOM: 특별 레벨에서만 패널, 진행·낭독·효과음·이중 낭독 없음
 * =================================================================== */
test('⑤ 특별 레벨이 아닌 판: #spirit 숨김, 정령 상태·표식·눈금·낭독 없음, 기존 목표 바·미션 칩 그대로(6곳 외 4개 레벨 × 3난이도)', async () => {
  for (const lv of DIFFS) {
    for (const stage of [1, 3, 4, 9]) {
      const env = createEnv(100 + stage);
      await startAndWait(env, lv, stage);
      const I = env.I;
      assert.strictEqual(I.state.spirit, null, lv + stage + ' state.spirit');
      assert.strictEqual(env.el('spirit').hidden, true, lv + stage + ' #spirit 숨김');
      assert.strictEqual(env.el('screen-game').dataset.spirit, undefined, 'data-spirit 없음');
      assert.strictEqual(env.el('sp-wrap').className, 'sp-wrap', '패널 모양(.on) 없음');
      assert.strictEqual(env.el('sp-wrap').getAttribute('role'), null);
      assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), null);
      assert.strictEqual(env.el('sp-gauge').innerHTML, '');
      assert.strictEqual(env.el('sp-live').textContent, '');
      assert.strictEqual(env.el('sp-note').hidden, true);
      assert.strictEqual(env.el('goal').children.length, 0, '점수형이어도 목표 바 안에 눈금이 없다');
      const isMission = !!I.state.mission;
      assert.strictEqual(env.el('goal').hidden, isMission);
      assert.strictEqual(env.el('mission').hidden, !isMission);
      assert.deepStrictEqual(env.errors, []);
      env.dispose();
    }
  }
});

test('⑤ 특별 레벨 6곳: 시작하면 #spirit 이 보이고 k = 0, 제목 "잠든 ○ 정령", 깨어남 게이지 n칸, "깨어남 0/n", 패널 이름, data-spirit, 흑백(--sp-g = 1), zZ', async () => {
  for (const lv of DIFFS) {
    for (const stage of [5, 10]) {
      const env = createEnv(200 + stage);
      await startAndWait(env, lv, stage);
      const I = env.I;
      const sp = G.spiritOf(lv, stage);
      assert.strictEqual(JSON.stringify(I.state.spirit), JSON.stringify({ info: sp, k: 0, special: lv !== 'easy' }), lv + stage);     // (샌드박스 객체라 모양을 JSON 으로 비교)
      assert.strictEqual(env.el('spirit').hidden, false);
      assert.strictEqual(env.el('screen-game').dataset.spirit, '1');
      assert.ok(/^sp-wrap on /.test(env.el('sp-wrap').className) && env.el('sp-wrap').className.indexOf(lv === 'easy' ? 'by-score' : 'by-mission') !== -1);
      assert.strictEqual(env.el('sp-wrap').getAttribute('role'), 'group');
      assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), (lv === 'easy' ? '' : '특별 레벨, ') + '잠든 ' + SPEC_SPIRITS[lv][stage][1] + ', 깨어남 0/' + sp.steps);
      assert.strictEqual(env.el('sp-title').textContent, '잠든 ' + SPEC_SPIRITS[lv][stage][1]);
      assert.strictEqual(env.el('sp-count').textContent, '깨어남 0/' + sp.steps);
      assert.strictEqual(env.el('sp-gauge').children.length, sp.steps, '게이지 칸 수 = 단계 수');
      assert.ok(env.el('sp-gauge').children.every((c) => c.className === 'sp-cell' && c.textContent === ''), '모두 빈 칸');
      assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '1.000');
      assert.strictEqual(env.el('sp-art').classList.contains('awake'), false);
      assert.strictEqual(env.el('sp-zz').hidden, false);
      assert.ok(env.el('sp-img').innerHTML.indexOf('assets/gems/' + G.CONFIG.types[sp.type].id + '.webp') !== -1 || env.el('sp-img').innerHTML.indexOf('gem-' + G.CONFIG.types[sp.type].id) !== -1, '기존 보석 그림 재사용(gemMarkup)');
      // 초보: 목표 바 + 눈금(n-1개) + 작은 글, 중수·고수: SEQ 칩 1개(데이터 칩 수 1)
      if (lv === 'easy') {
        assert.strictEqual(env.el('goal').hidden, false);
        assert.strictEqual(env.el('mission').hidden, true);
        assert.strictEqual(env.el('goal').children.length, sp.steps - 1, '눈금 n-1개');
        assert.deepStrictEqual(env.el('goal').children.map((t) => t.style.left), ['33.333%', '66.667%']);
        assert.strictEqual(env.el('sp-note').hidden, false);
        assert.strictEqual(env.el('sp-note').textContent, '목표 점수의 1/3까지 힘을 모아 줘요');
      } else {
        assert.strictEqual(env.el('mission').hidden, false);
        assert.strictEqual(env.el('goal').hidden, true);
        assert.strictEqual(env.el('screen-game').dataset.chips, '1');
        assert.strictEqual(env.el('sp-note').hidden, true);
        assert.ok(I.hud.mis && I.hud.mis.chips.length === 1);
      }
      assert.deepStrictEqual(env.errors, []);
      env.dispose();
    }
  }
});

test('⑤ 단계 하나 완료(중수 5단계, SEQ): 한 번만 praise-good, 정령 낭독(role=status), 진행 갱신(k·칸 ✓·"깨어남 1/3"·흑백 0.667), 칩의 "미션 하나를 끝냈어요" 낭독은 없다(이중 낭독 금지)', async () => {
  const p = plainScenario(0);
  const color = p.sim.events[0].color;
  const env = createEnv(301, seqCfg([{ k: 'collect', color, need: 3 }, { k: 'collect', color: (color + 1) % 6, need: 99 }, { k: 'big', min: 4, need: 9 }]));
  await startAndWait(env, 'normal', 5);
  const I = env.I;
  assert.strictEqual(G.spiritOf('normal', 5).steps, 3);
  assert.strictEqual(env.sfxLog.filter((e) => e.spirit).length, 0);
  await runSwap(env, p);
  assert.strictEqual(I.state.spirit.k, 1);
  assert.deepStrictEqual(spiritSfx(env), ['praise-good'], '정령 효과음은 한 번, praise-good');
  assert.deepStrictEqual(praise(env), [], '이 행동에는 칭찬 팝업(다른 praise 효과음)이 없다');
  assert.strictEqual(env.el('sp-live').textContent, '풀 정령이 한 걸음 더 깨어났어요 (1/3)');
  assert.strictEqual(env.el('mission-live').textContent, '', '칩의 미션 완료 낭독은 정령 낭독이 대신한다(이중 낭독 금지)');
  assert.strictEqual(env.el('sp-count').textContent, '깨어남 1/3');
  assert.strictEqual(env.el('sp-title').textContent, '잠든 풀 정령');
  assert.deepStrictEqual(env.el('sp-gauge').children.map((c) => c.classList.contains('on') + ':' + c.textContent), ['true:✓', 'false:', 'false:']);
  assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '0.667');
  assert.strictEqual(env.el('sp-zz').hidden, false, '아직 잠이 덜 깼다');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '특별 레벨, 잠든 풀 정령, 깨어남 1/3');
  assert.strictEqual(I.state.phase, 'playing');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('⑤ 한 행동에서 여러 단계가 한꺼번에 끝나도 연출·낭독·효과음은 한 번(k 는 2 로 뛴다), 마지막 단계는 praise-great 와 "고마워요" 낭독', async () => {
  const two = findSwapScenario((sim) => sim.events.length === 2 && sim.events[0].size === 3 && sim.events[1].size === 3 && sim.maxStep === 1 && sim.events[0].color !== sim.events[1].color);
  const [c0, c1] = [two.sim.events[0].color, two.sim.events[1].color];
  const env = createEnv(302, seqCfg([{ k: 'collect', color: c0, need: 3 }, { k: 'collect', color: c1, need: 3 }, { k: 'collect', color: c0, need: 99 }]));
  await startAndWait(env, 'normal', 5);
  const I = env.I;
  await runSwap(env, two);
  assert.strictEqual(I.state.mission.parts.filter((x) => x.done).length, 2, '한 행동에서 두 단계가 끝났다');
  assert.strictEqual(I.state.spirit.k, 2);
  assert.deepStrictEqual(spiritSfx(env), ['praise-good'], '두 단계가 동시에 끝나도 정령 효과음은 한 번');
  assert.strictEqual(env.el('sp-live').textContent, '풀 정령이 한 걸음 더 깨어났어요 (2/3)', '낭독도 한 번(2/3)');
  assert.strictEqual(env.el('mission-live').textContent, '');
  assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '0.333');
  assert.deepStrictEqual(env.errors, []);
  // 마지막 단계
  const p = plainScenario(1);
  const env2 = createEnv(303, seqCfg([{ k: 'collect', color: p.sim.events[0].color, need: 3 }]));
  await startAndWait(env2, 'normal', 5);
  assert.strictEqual(G.spiritOf('normal', 5).steps, 3, '(시험 도구가 바꾼 미션은 부분 1개 — 정령 단계는 부분 수 1)');
  await runSwap(env2, p);
  assert.strictEqual(env2.I.state.phase, 'over', '모든 단계가 끝나면 클리어');
  assert.deepStrictEqual(spiritSfx(env2), ['praise-great'], '마지막 단계는 praise-great');
  assert.strictEqual(env2.el('sp-live').textContent, '풀 정령이 깨어났어요! 고마워요');
  assert.strictEqual(env2.el('sp-title').textContent, '풀 정령이 깨어났어요!');
  assert.strictEqual(env2.el('sp-count').textContent, '깨어남 1/1');
  assert.strictEqual(env2.el('sp-zz').hidden, true, '깨어나면 zZ 가 사라진다');
  assert.strictEqual(env2.el('sp-art').style.getPropertyValue('--sp-g'), '0.000', '컬러로 돌아왔다');
  assert.ok(env2.el('sp-art').classList.contains('awake'));
  assert.deepStrictEqual(env2.errors, []);
  env.dispose(); env2.dispose();
});

test('⑤ 일반 미션 레벨(특별이 아님)은 기존 낭독 그대로("미션 하나를 끝냈어요"), 정령 낭독은 없다', async () => {
  const p = plainScenario(2);
  const color = p.sim.events[0].color;
  const env = createEnv(304, (cfg) => { cfg.stages.goalType.normal = 'mission'; cfg.stages.missions.normal[3] = { parts: [{ k: 'collect', color, need: 3 }, { k: 'collect', color, need: 99 }], seq: false }; });
  await startAndWait(env, 'normal', 4);
  await runSwap(env, p);
  assert.ok(env.I.state.mission.parts[0].done);
  assert.strictEqual(env.I.state.spirit, null);
  assert.ok(/^미션 하나를 끝냈어요/.test(env.el('mission-live').textContent), env.el('mission-live').textContent);
  assert.strictEqual(env.el('sp-live').textContent, '');
  assert.strictEqual(env.sfxLog.filter((e) => e.spirit).length, 0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('⑤ 초보 5단계(점수 3등분): 1/3·2/3 지점을 넘는 행동 끝에서 한 번씩, 한 행동에 둘을 넘어도 한 번, 눈금 글 갱신, 목표 바 역할(progressbar) 그대로', async () => {
  const T = G.stageTarget('easy', 5);
  const p0 = plainScenario(3);
  const env = createEnv(305);
  await startAndWait(env, 'easy', 5);
  const I = env.I;
  assert.strictEqual(I.state.target, T);
  // 1/3 바로 아래에서 평범한 행동 하나 → 1/3 을 넘는다
  I.state.score = Math.ceil(T / 3) - 5;
  await runSwap(env, p0);
  assert.strictEqual(I.state.spirit.k, 1, '1/3 지점을 넘은 행동 끝에서 한 단계');
  assert.deepStrictEqual(spiritSfx(env), ['praise-good']);
  assert.strictEqual(env.el('sp-live').textContent, '번개 정령이 한 걸음 더 깨어났어요 (1/3)');
  assert.strictEqual(env.el('sp-note').textContent, '목표 점수의 1/3에 왔어요! 다음은 2/3');
  assert.strictEqual(env.el('mission-live').textContent, '');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '잠든 번개 정령, 깨어남 1/3', '초보 패널 이름에는 "특별 레벨"이 없다');
  assert.notStrictEqual(env.el('goal').getAttribute('aria-valuenow'), null, '기존 목표 바의 진행값(aria-valuenow)은 계속 갱신된다');
  // 한 행동에서 2/3 도 넘어서 k 가 0→… 가 아니라 1→2 로 한 번 오른다
  const before = env.sfxLog.length;
  I.state.score = Math.ceil(2 * T / 3) - 5;
  I.state.shown = I.state.score;
  await runSwap(env, plainScenario(4));
  assert.strictEqual(I.state.spirit.k, 2);
  assert.strictEqual(env.sfxLog.slice(before).filter((e) => e.spirit).length, 1);
  assert.strictEqual(env.el('sp-live').textContent.replace(/\.$/, ''), '번개 정령이 한 걸음 더 깨어났어요 (2/3)');
  assert.strictEqual(env.el('sp-note').textContent, '목표 점수의 2/3에 왔어요! 거의 다 깨어났어요');
  // 한 행동에서 목표를 크게 넘으면 마지막 단계 한 번만(정령 효과음 한 번, praise-great)
  const before2 = env.sfxLog.length;
  I.state.score = T + 100;
  await runSwap(env, plainScenario(5));
  assert.strictEqual(I.state.spirit.k, 3);
  assert.deepStrictEqual(env.sfxLog.slice(before2).filter((e) => e.spirit).map((e) => e.name), ['praise-great']);
  assert.strictEqual(I.state.phase, 'over');
  assert.deepStrictEqual(env.errors, []);
  // 한 행동에서 0 → 2 로 뛰는 경우도 한 번
  const env2 = createEnv(306);
  await startAndWait(env2, 'easy', 5);
  env2.I.state.score = Math.ceil(2 * T / 3) + 5;
  await runSwap(env2, plainScenario(6));
  assert.strictEqual(env2.I.state.spirit.k, 2);
  assert.deepStrictEqual(spiritSfx(env2), ['praise-good'], '0→2 도 정령 효과음은 한 번');
  assert.strictEqual(env2.el('sp-live').textContent, '번개 정령이 한 걸음 더 깨어났어요 (2/3)');
  env.dispose(); env2.dispose();
});

test('⑤ 깨어남 단계는 한 판 안에서 줄지 않는다(점수·미션이 같거나 커지는 동안 k 는 max 로 지켜진다), 무효 스왑·점수 없는 행동은 아무 연출도 없다', async () => {
  const env = createEnv(307);
  await startAndWait(env, 'easy', 5);
  const I = env.I;
  const T = I.state.target;
  I.state.score = Math.ceil(T / 3) + 1;
  await runSwap(env, plainScenario(7));
  assert.strictEqual(I.state.spirit.k, 1);
  // 일부러 점수를 낮춰도(게임에서는 일어나지 않는 일) k 는 내려가지 않는다
  I.state.score = 0;
  const n = env.sfxLog.length;
  await runSwap(env, plainScenario(8));
  assert.strictEqual(I.state.spirit.k, 1, 'k 는 줄지 않는다');
  assert.strictEqual(env.sfxLog.slice(n).filter((e) => e.spirit).length, 0, '줄었어도 연출은 없다');
  assert.strictEqual(env.el('sp-count').textContent, '깨어남 1/3');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('⑤ 판을 다시 시작하거나 다른 레벨로 옮기면 정령 화면이 깨끗이 정리된다(눈금·칸·낭독·표식), 특별 → 일반 → 특별', async () => {
  const env = createEnv(308);
  await startAndWait(env, 'easy', 5);
  const I = env.I;
  I.state.score = Math.ceil(I.state.target / 3) + 1;
  await runSwap(env, plainScenario(9));
  assert.strictEqual(env.el('goal').children.length, 2);
  assert.ok(env.el('sp-live').textContent.length > 0);
  await startAndWait(env, 'easy', 4);          // 일반 레벨
  assert.strictEqual(I.state.spirit, null);
  assert.strictEqual(env.el('spirit').hidden, true);
  assert.strictEqual(env.el('goal').children.length, 0, '눈금이 지워졌다');
  assert.strictEqual(env.el('sp-gauge').children.length, 0);
  assert.strictEqual(env.el('sp-live').textContent, '');
  assert.strictEqual(env.el('screen-game').dataset.spirit, undefined);
  assert.strictEqual(env.el('sp-wrap').className, 'sp-wrap');
  await startAndWait(env, 'easy', 10);         // 다시 특별 레벨: 다시 0 부터
  assert.strictEqual(I.state.spirit.k, 0);
  assert.strictEqual(env.el('spirit').hidden, false);
  assert.strictEqual(env.el('goal').children.length, 2, '눈금은 새로 2개');
  assert.strictEqual(env.el('sp-title').textContent, '잠든 빛 정령');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('⑤ 감소 모션이 아니면 단계 완료 때 빛 번짐(.pulse) 한 번 + 제거 타이머 하나, 감소 모션이면 번짐·타이머 없이 상태만 바뀐다', async () => {
  const run = async (reduce) => {
    const env = createEnv(309, null, { reduce });
    await startAndWait(env, 'easy', 5);
    env.I.state.score = Math.ceil(env.I.state.target / 3) + 1;
    applyBoard(env, plainScenario(10).board);
    const art = env.el('sp-art');
    let pulsed = false;
    const add = art.classList.add;
    art.classList.add = function (n) { if (n === 'pulse') pulsed = true; return add.apply(this, arguments); };
    await runSwap(env, plainScenario(10));
    const during = art.classList.contains('pulse');
    await env.runFor(1300);
    const out = { k: env.I.state.spirit.k, pulsed, during, leftover: art.classList.contains('pulse') };
    env.dispose();
    return out;
  };
  const motion = await run(false);
  assert.strictEqual(motion.k, 1);
  assert.strictEqual(motion.pulsed, true, '번짐이 한 번 시작됐다');
  assert.strictEqual(motion.during, true, '행동 직후에는 번짐 중');
  assert.strictEqual(motion.leftover, false, '1.1초 뒤 번짐 표식이 제거됐다(타이머)');
  const still = await run(true);
  assert.strictEqual(still.k, 1);
  assert.strictEqual(still.pulsed, false, '감소 모션: 번짐 없음');
});

/* ===================================================================
 * 4) 결과 화면 줄
 * =================================================================== */
test('⑥ 결과 줄(#end-spirit): 클리어 "○ 정령이 깨어났어요! 고마워요", 실패 "아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 k/n)", 특별이 아니면 숨김. 기존 end-target 줄은 그대로', async () => {
  // 클리어(중수 5단계, 미션 시험용으로 줄인 정의)
  const p = plainScenario(11);
  const color = p.sim.events[0].color;
  const env = createEnv(401, seqCfg([{ k: 'collect', color, need: 3 }]));
  await startAndWait(env, 'normal', 5);
  await runSwap(env, p);
  assert.strictEqual(env.I.state.phase, 'over');
  assert.strictEqual(env.el('end-title').textContent, 'STAGE CLEAR!');
  assert.strictEqual(env.el('end-spirit').hidden, false);
  assert.strictEqual(env.el('end-spirit').textContent, '풀 정령이 깨어났어요! 고마워요');
  assert.ok(/^미션 모두 달성 · 남은 시간 /.test(env.el('end-target').textContent), '기존 줄은 그대로: ' + env.el('end-target').textContent);
  noAvoid(env.el('end-spirit').textContent, '결과(클리어)');
  env.dispose();
  // 실패(시간 종료): 1단계까지 깨우고 시간이 다 됐다
  const p2 = plainScenario(12);
  const c2 = p2.sim.events[0].color;
  const env2 = createEnv(402, seqCfg([{ k: 'collect', color: c2, need: 3 }, { k: 'collect', color: c2, need: 9999 }, { k: 'big', min: 4, need: 9 }]));
  await startAndWait(env2, 'normal', 5);
  await runSwap(env2, p2);
  assert.strictEqual(env2.I.state.spirit.k, 1);
  env2.I.state.timeLeft = 0.3;
  await env2.runUntil(() => env2.I.state.phase === 'over', 20000);
  assert.strictEqual(env2.el('end-title').textContent, 'TIME UP');
  assert.strictEqual(env2.el('end-spirit').hidden, false);
  assert.strictEqual(env2.el('end-spirit').textContent, '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 1/3)');
  assert.ok(/^미션 1\/3 완료 · 내 점수 /.test(env2.el('end-target').textContent), env2.el('end-target').textContent);
  noAvoid(env2.el('end-spirit').textContent, '결과(실패)');
  env2.dispose();
  // 초보 5단계 실패: 점수만 말한다
  const env3 = createEnv(403);
  await startAndWait(env3, 'easy', 5);
  env3.I.state.timeLeft = 0.3;
  await env3.runUntil(() => env3.I.state.phase === 'over', 20000);
  assert.strictEqual(env3.el('end-spirit').textContent, '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 0/3)');
  assert.ok(/^목표 [\d,]+ \/ 내 점수 /.test(env3.el('end-target').textContent));
  assert.ok(!/미션|특별/.test(env3.el('end-spirit').textContent + env3.el('end-target').textContent));
  env3.dispose();
  // 특별 레벨이 아니면 숨김
  const env4 = createEnv(404);
  await startAndWait(env4, 'normal', 4);
  env4.I.state.timeLeft = 0.3;
  await env4.runUntil(() => env4.I.state.phase === 'over', 20000);
  assert.strictEqual(env4.el('end-spirit').hidden, true);
  assert.strictEqual(env4.el('end-spirit').textContent, '');
  env4.dispose();
});

/* ===================================================================
 * 5) 깨운 정령 수와 저장 구조 불변
 * =================================================================== */
test('⑦ awakenedCount: 6곳 중 별 1개 이상인 칸의 수(난이도 무관, 다른 칸은 세지 않음), 여러 저장 조합', () => {
  const mk = (marks) => {
    const sv = G.defaultSave();
    marks.forEach(([d, stage, stars]) => { sv.stages[d][stage - 1].stars = stars; });
    return sv;
  };
  assert.strictEqual(G.awakenedCount(G.defaultSave()), 0);
  assert.strictEqual(G.awakenedCount(mk([['easy', 5, 1]])), 1);
  assert.strictEqual(G.awakenedCount(mk([['easy', 5, 3], ['easy', 10, 1], ['normal', 5, 2], ['normal', 10, 1], ['hard', 5, 1], ['hard', 10, 3]])), 6);
  assert.strictEqual(G.awakenedCount(mk([['hard', 10, 1], ['normal', 5, 1]])), 2, '세 난이도 합');
  assert.strictEqual(G.awakenedCount(mk([['easy', 4, 3], ['normal', 6, 3], ['hard', 9, 3], ['easy', 1, 3]])), 0, '정령이 없는 레벨은 세지 않는다');
  assert.strictEqual(G.awakenedCount(mk([['easy', 5, 0], ['normal', 10, 0]])), 0, '별 0개는 세지 않는다');
  assert.strictEqual(G.awakenedCount(null), 0);
  assert.strictEqual(G.awakenedCount({}), 0);
  assert.strictEqual(G.awakenedCount({ stages: { easy: 'x' } }), 0);
  assert.deepStrictEqual(G.spiritCells().map((c) => c.diff + c.stage + ':' + c.type), ['easy5:3', 'easy10:5', 'normal5:2', 'normal10:0', 'hard5:1', 'hard10:4']);
  // 저장은 읽기만 한다(값이 바뀌지 않는다)
  const sv = mk([['easy', 5, 2]]);
  const copy = JSON.stringify(sv);
  G.awakenedCount(sv);
  assert.strictEqual(JSON.stringify(sv), copy);
});

test('⑦ 레벨 선택 화면의 "깨운 정령 n/6" 줄: 보이는 글·낭독용 글·작은 정령 6개(깨운 것만 on), 난이도 선택과 무관, 새 저장 필드 없음', () => {
  const env = createEnv(501);
  const I = env.I;
  I.save.level = 'easy';
  I.goStages();
  assert.strictEqual(env.el('sp-roster').hidden, false);
  assert.strictEqual(env.el('sp-roster-text').textContent, '깨운 정령 0/6');
  assert.strictEqual(env.el('sp-roster-sr').textContent, '깨운 정령 0마리 / 6마리');
  assert.strictEqual((env.el('sp-roster-art').innerHTML.match(/class="sp-mini"/g) || []).length, 6);
  assert.strictEqual((env.el('sp-roster-art').innerHTML.match(/sp-mini on/g) || []).length, 0);
  I.save.stages.hard[4].stars = 2;           // 고수 5단계(물 정령)를 깨웠다 — 지금 고른 난이도(초보)와 무관하다
  I.save.stages.normal[9].stars = 1;
  I.save.stages.easy[0].stars = 3;           // 정령이 없는 레벨
  I.save.level = 'normal';
  I.renderStages();
  assert.strictEqual(env.el('sp-roster-text').textContent, '깨운 정령 2/6');
  assert.strictEqual(env.el('sp-roster-sr').textContent, '깨운 정령 2마리 / 6마리');
  const spans = env.el('sp-roster-art').innerHTML.match(/<span class="sp-mini[^"]*">/g);
  assert.deepStrictEqual(spans, ['<span class="sp-mini">', '<span class="sp-mini">', '<span class="sp-mini">', '<span class="sp-mini on">', '<span class="sp-mini on">', '<span class="sp-mini">'].map((x, i) => x), '순서 = 초보5·초보10·중수5·중수10·고수5·고수10');
  env.dispose();
});

const SAVE_KEYS = ['level', 'progress', 'stages', 'bestByLevel', 'best', 'plays', 'lastScore', 'bestChain', 'muted', 'tutorialSeen', 'cutin', 'scoreRule', 'bestOld'];
test('⑦ 저장 구조 불변: defaultSave 의 키 목록이 변경 전과 같고, 정령 관련 키가 없으며, parseSave 가 읽은 옛 저장에도 새 키가 생기지 않는다', () => {
  const keys = Object.keys(G.defaultSave()).sort();
  assert.deepStrictEqual(keys, SAVE_KEYS.slice().sort().filter((k) => keys.indexOf(k) !== -1), '변경 전 키 목록의 부분집합이 아니면 새 키가 생긴 것이다');
  assert.ok(keys.length >= 10);
  assert.ok(!/spirit|awake|정령|깨/.test(JSON.stringify(G.defaultSave())));
  const parsed = G.parseSave(JSON.stringify({ level: 'hard', progress: { easy: 3, normal: 0, hard: 9 } }));
  assert.deepStrictEqual(Object.keys(parsed).sort(), keys);
  assert.ok(!/spirit|awake/.test(JSON.stringify(parsed)));
  // 서버로 가는 스냅샷은 별·남은 시간만 읽는다(스냅샷 모양 그대로)
  const sv = G.defaultSave();
  sv.stages.easy[4].stars = 3; sv.stages.easy[4].left = 70; sv.stages.hard[9].stars = 1;
  const snap = R.buildSnapshot(sv, 10, { easy: 150, normal: 140, hard: 120 });
  assert.deepStrictEqual(Object.keys(snap).sort(), ['easy', 'hard', 'normal']);
  assert.ok(!/spirit|awake/.test(JSON.stringify(snap)));
});

/* ===================================================================
 * 6) 규칙 불변 증명: 같은 시드 봇 판 — M4 시작 시점의 game.js 와 지금 game.js 를 나란히 돌린다
 * =================================================================== */
function baselineSource() {
  try {
    if (process.env.EG_BASELINE_GAME_JS) return fs.readFileSync(process.env.EG_BASELINE_GAME_JS, 'utf8');
  } catch (e) { return null; }
  try {
    return cp.execFileSync('git', ['show', BASE_COMMIT + ':apps/element-gems/game.js'], { cwd: path.join(root, '..', '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { return null; }
}
const BASE_SRC = baselineSource();
/* spec §44(2026-11-11): 별 기준이 난이도별로 바뀌었다(고수 ★★ 15%·★★★ 30%). ④는 "별 기준 말고는 규칙이 같다"를 증명하므로,
 *  같은 시드 봇 판을 돌릴 기준 소스에도 같은 별 기준 변경(CONFIG.stages.starBy·starRatioOf·starsFor·leftFloorForStars·호출 두 곳)을 입혀 나란히 돌린다(규칙 함수·단언은 그대로).
 *  입히는 본문은 지금 소스에서 가져온다 — 새 별 본문 자체는 아래 소스 수준 시험과 game.test.js 가 따로 고정한다. 바꿀 자리가 기준 소스에 정확히 한 곳씩 없으면 즉시 실패한다. */
function fnBodyOf(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let depth = 0; let j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(i, j + 1);
}
function withStar44(src) {
  let out = src;
  const swap = (from, to) => { assert.strictEqual(out.split(from).length, 2, '기준 소스에 정확히 한 곳이어야 한다: ' + from.slice(0, 60)); out = out.replace(from, () => to); };
  const starBy = SRC.split('\n').find((l) => /^\s*starBy:/.test(l));
  const star = out.split('\n').find((l) => /^\s*star: \[0\.3, 0\.5\],/.test(l));
  assert.ok(starBy && star, 'starBy / star 줄');
  swap(star, star + '\n' + starBy);
  swap(fnBodyOf(out, 'function starsFor('), fnBodyOf(SRC, 'function starRatioOf(') + '\n\n  ' + fnBodyOf(SRC, 'function starsFor('));
  swap(fnBodyOf(out, 'function leftFloorForStars('), fnBodyOf(SRC, 'function leftFloorForStars('));
  swap('starsFor(left, state.startTime)', 'starsFor(left, state.startTime, lv)');
  swap('starsFor(left, startTimeOf(k))', 'starsFor(left, startTimeOf(k), k)');
  return out;
}
const BASE_SCRIPT = BASE_SRC ? compile(withStar44(BASE_SRC), 'general/game.js@' + BASE_COMMIT + '+§44') : null;
const skipBase = BASE_SRC ? false : 'M4 시작 시점의 game.js 를 구하지 못해 건너뜀(git 커밋 ' + BASE_COMMIT + ' 또는 EG_BASELINE_GAME_JS 필요)';

/** 결정적인 봇 한 판: 시드 seed 로 보석이 나오고, 봇은 자기 난수(시드 seed+7)로 유효한 수를 고르고(70%) 아니면 첫 유효한 수, 게이지가 찬 비조준 스킬(물·번개·어둠·빛)을 가끔 쓴다.
 *  각 행동 뒤의 (점수·미션 카운터·남은 시간·goalMet·phase)와 끝난 뒤의 결과 문구·저장 기록을 trace 로 돌려준다 */
async function playBot(env, lv, stage, seed, maxActions) {
  const I = env.I; const S = I.state;
  I.save.level = lv; I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => S.phase === 'playing', 30000);
  const brain = mulberry(seed * 977 + 7);
  const trace = [];
  const snap = () => [S.score, S.mission ? S.mission.parts.map((p) => (p.each ? p.each.join('/') : p.n) + (p.done ? '!' : '')).join(',') + '@' + S.mission.cur : '-', Math.round(S.timeLeft * 1e6) / 1e6, I.goalMet(), S.phase, S.combo, S.stats.matches, S.stats.maxChain, S.stats.skills].join('|');
  for (let a = 0; a < maxActions && S.phase === 'playing'; a++) {
    const moves = I.listMoves(I.typeGrid());
    let usedSkill = false;
    for (const t of [1, 3, 4, 5]) {
      if (S.full[t] && brain() < 0.5) { I.onGauge(t); usedSkill = true; break; }
    }
    if (!usedSkill) {
      const m = moves.length ? moves[brain() < 0.7 ? Math.floor(brain() * moves.length) : 0] : null;
      if (!m) break;
      I.trySwap(m.a, m.b);
    }
    await finishAction(env);
    trace.push(snap());
    if (S.phase === 'paused') break;
  }
  if (S.phase === 'playing') await env.runFor(200);
  const out = {
    trace, phase: S.phase, now: env._now, score: S.score, timeLeft: Math.round(S.timeLeft * 1e6) / 1e6,
    end: S.phase === 'over' ? [env.el('end-title').textContent, env.el('end-score').textContent, env.el('end-target').textContent, env.el('end-stars').textContent, env.el('end-stars').hidden, env.el('end-unlock').textContent, env.el('end-best').textContent, env.el('end-combo').textContent, env.el('btn-next').hidden].join('|') : null,
    save: JSON.stringify(I.save), stored: env.store['element-gems:v1'] || null, rnd: env.rnd
  };
  return out;
}
/** 시험 도구: 빨리 끝나는 판(작은 목표·작은 미션)도 함께 돌려 클리어·단계 이동·결과 화면까지 규칙 증명에 넣는다 */
function easyCfg(cfg) {
  cfg.stages.targets.easy = cfg.stages.targets.easy.map((t) => Math.round(t / 6));
  cfg.stages.missions.normal = cfg.stages.missions.normal.map((def) => ({ seq: def.seq, parts: def.parts.map((p) => Object.assign({}, p, { need: p.k === 'chain' || p.k === 'big' ? Math.max(1, Math.ceil(p.need / 4)) : Math.max(2, Math.ceil(p.need / 3)) })) }));
  cfg.stages.missions.hard = cfg.stages.missions.hard.map((def) => ({ seq: def.seq, parts: def.parts.map((p) => Object.assign({}, p, { need: p.k === 'chain' || p.k === 'big' ? Math.max(1, Math.ceil(p.need / 3)) : Math.max(2, Math.ceil(p.need / 3)) })) }));
}
const SEEDS = 10;
/* spec §43(2026-11-11): 중수·고수 미션 표가 M4 시작 시점(§36 표)에서 §43 표로 교체됐다. 이 시험은 "같은 표 위에서 규칙이 같다"를 증명하므로,
 *  기준 소스(옛 표)의 CONFIG.stages.missions 에도 지금 일반용 표를 그대로 덮어씌워 나란히 돌린다(규칙 함수·단언은 그대로, 표만 같게 맞춘다) */
const withCurrentTables = (cfg) => (C) => { C.stages.missions = JSON.parse(JSON.stringify(G.CONFIG.stages.missions)); if (cfg) cfg(C); };
for (const variant of [{ name: '기본 표', cfg: null, stages: [5, 10, 3], reduce: true }, { name: '쉬운 표(클리어·단계 이동 포함)', cfg: easyCfg, stages: [5, 10, 4], reduce: true }, { name: '쉬운 표 + 감소 모션 아님(번짐 타이머)', cfg: easyCfg, stages: [5, 10], reduce: false }]) {
  test('④ 규칙 불변(' + variant.name + '): 난이도 3 × 레벨 ' + variant.stages.join('·') + ' × 시드 ' + SEEDS + ' — M4 시작 시점의 game.js 와 점수·미션 카운터·시간·goalMet·종료 시점·결과 문구·저장이 모두 같다', { skip: skipBase }, async () => {
    let games = 0, actions = 0, cleared = 0, stepsSeen = 0;
    for (const lv of DIFFS) {
      for (const stage of variant.stages) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const a = createEnv(seed * 31 + stage, withCurrentTables(variant.cfg), { script: BASE_SCRIPT, reduce: variant.reduce });
          const b = createEnv(seed * 31 + stage, variant.cfg, { script: SCRIPT, reduce: variant.reduce });
          const ra = await playBot(a, lv, stage, seed, 140);
          const rb = await playBot(b, lv, stage, seed, 140);
          const tag = lv + ' 레벨 ' + stage + ' 시드 ' + seed;
          assert.deepStrictEqual(rb.trace, ra.trace, tag + ': 행동별 (점수·카운터·시간·goalMet·phase)');
          assert.strictEqual(rb.phase, ra.phase, tag + ' 종료 phase');
          assert.strictEqual(rb.now, ra.now, tag + ' 종료 시점(가상 시계)');
          assert.strictEqual(rb.score, ra.score, tag + ' 점수');
          assert.strictEqual(rb.timeLeft, ra.timeLeft, tag + ' 남은 시간');
          assert.strictEqual(rb.end, ra.end, tag + ' 결과 문구');
          assert.strictEqual(rb.save, ra.save, tag + ' 저장 객체');
          assert.strictEqual(rb.stored, ra.stored, tag + ' localStorage 저장 문자열');
          assert.strictEqual(rb.rnd, ra.rnd, tag + ' 난수 사용 횟수(화면 코드는 난수를 쓰지 않는다)');
          assert.deepStrictEqual(a.errors, []); assert.deepStrictEqual(b.errors, []);
          // 정령 쪽 부수 확인: 특별 레벨이면 k 는 규칙 결과와 맞고, 아니면 정령 상태가 없다
          const sp = G.spiritOf(lv, stage);
          if (sp) {
            const S = b.I.state;
            assert.strictEqual(S.spirit.k, Math.max(0, Math.min(sp.steps, G.spiritStep(sp, S.score, S.target, S.mission))), tag + ' 마지막 k 가 규칙 결과(점수·미션)와 맞다');
            if (S.phase === 'over' && b.I.goalMet()) assert.strictEqual(S.spirit.k, sp.steps, tag + ' 클리어하면 k = n');
            stepsSeen += S.spirit.k;
          } else assert.strictEqual(b.I.state.spirit, null);
          if (rb.end && /STAGE CLEAR/.test(rb.end)) cleared++;
          games++; actions += rb.trace.length;
          a.dispose(); b.dispose();
        }
      }
    }
    assert.ok(games === DIFFS.length * variant.stages.length * SEEDS);
    assert.ok(actions > games * 5, '봇이 실제로 여러 행동을 했다: ' + actions);
    if (variant.cfg) assert.ok(cleared > 0 && stepsSeen > 0, '클리어·단계 진행이 한 번도 없었다면 증명이 약하다: cleared=' + cleared + ' steps=' + stepsSeen);
  });
}

test('④ 규칙 불변(소스 수준): 규칙 함수·점수·판정·별 계산 줄이 M4 시작 시점과 글자 그대로 같다(awardGroup·cascade·goalMet·stageTarget·missionUpdate·starsFor·isCleared·applyStageResult)', { skip: skipBase }, () => {
  const body = (src, head) => {
    const i = src.indexOf(head);
    assert.ok(i >= 0, head);
    let depth = 0; let j = src.indexOf('{', i);
    const start = i;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
    return src.slice(start, j + 1);
  };
  ['function awardGroup(', 'async function cascade(', 'async function removeSkillCells(', 'function awardSkillBonus(', 'function goalMet(', 'function stageTarget(', 'function missionUpdate(', 'function missionCount(', 'function missionDone(',
    'function missionProgress(', 'function isCleared(', 'function applyStageResult(', 'function leftFromTime(', 'function startTimeOf(', 'function addScore(', 'function touchCombo(', 'function baseScore(', 'function comboMult(', 'function waveMult(', 'function skillPoints(', 'function timeBonusFor(', 'function pickRefillTypes(', 'function planRefill('].forEach((h) => {
    const a = SRC.indexOf(h) >= 0 ? body(SRC, h) : null;
    const b = BASE_SRC.indexOf(h) >= 0 ? body(BASE_SRC, h) : null;
    assert.strictEqual(a, b, h + ' 본문이 변경 전과 같다');
  });
  // 별·서버로 가는 값 계산 두 줄과 판정 줄 (별 줄은 spec §44 로 의도적으로 바뀌어 아래에서 따로 고정한다)
  ['const left = cleared ? leftFromTime(state.timeLeft) : 0;', 'const cleared = goalMet();'].forEach((l) => assert.ok(SRC.indexOf(l) !== -1 && BASE_SRC.indexOf(l) !== -1, l));
  // spec §44(2026-11-11): `function starsFor(` 본문과 판 종료의 별 호출 줄은 고수 별 기준 때문에 의도적으로 바뀌었다. 옛 본문과 비교하지 않고 새 본문·새 줄을 글자 그대로 고정한다.
  assert.strictEqual(body(SRC, 'function starsFor('), [
    'function starsFor(timeLeft, startTime, diff) {',
    '    const ratio = timeLeft / startTime;',
    '    const r = starRatioOf(diff);',
    '    if (ratio >= r[1] - 1e-9) return 3;',
    '    if (ratio >= r[0] - 1e-9) return 2;',
    '    return 1;',
    '  }'].join('\n'), '새 starsFor 본문(spec §44)');
  assert.ok(SRC.indexOf('const stars = cleared ? starsFor(left, state.startTime, lv) : 0;') !== -1, '판 종료의 새 별 계산 줄(현재 난이도 lv 를 넘긴다)');
  assert.ok(SRC.indexOf('const stars = cleared ? starsFor(left, state.startTime) : 0;') === -1, '난이도 없는 옛 호출 줄은 없다');
  assert.ok(BASE_SRC.indexOf('const stars = cleared ? starsFor(left, state.startTime) : 0;') !== -1, '기준 소스에는 옛 줄이 있었다');
  assert.strictEqual(SRC.split('starsFor(').length - 1, 3, 'starsFor( 는 정의 1 + 호출 2(판 종료·저장 불러오기)뿐이다');
  assert.ok(SRC.indexOf('stars = Math.max(stars, starsFor(left, startTimeOf(k), k));') !== -1, '저장 불러오기의 새 별 올림 줄(난이도 k 를 넘긴다)');
  // 지금 소스에서 정령 줄을 지우면 규칙은 같다: runAction 의 새 줄은 updateSpirit 호출 하나뿐
  const diffLines = SRC.split('\n').filter((l) => /updateSpirit\(\)/.test(l) && !/function updateSpirit/.test(l));
  assert.strictEqual(diffLines.length, 1, 'updateSpirit 호출은 runAction 한 곳');
  // runAction 본문에서 정령 줄을 빼면 변경 전 본문과 같다
  const ra = body(SRC, 'async function runAction(').split('\n').filter((l) => !/updateSpirit\(\)/.test(l)).join('\n');
  assert.strictEqual(ra, body(BASE_SRC, 'async function runAction('), 'runAction 은 정령 줄 하나를 더한 것 외에 같다');
});

/* ===================================================================
 * 7) 문구 점검 · 마크업 · CSS · 에셋
 * =================================================================== */
test('⑧ 문구 점검: SPIRIT_TEXT 전체, 소스의 정령 구간 한글 문자열 리터럴, index.html 의 새 마크업에 §27.6.2 의 피하는 말과 "쉬어가기"가 없다', () => {
  const strings = [];
  const regions = [
    [SRC.indexOf('const SPIRIT_TEXT'), SRC.indexOf('/** 난이도 diff 의 레벨 stage 에 잠든 정령이 있으면')],     // 문구 상수
    [SRC.indexOf('/** 정령 화면을 끈다'), SRC.indexOf('/* ---------- 콤보 칩 (spec §28.5.7')],                    // 정령 패널 HUD
    [SRC.indexOf('/** "깨운 정령 n/6" 한 줄'), SRC.indexOf('/* ---------- 선택 레벨 설명판')]                       // 깨운 정령 줄
  ];
  regions.forEach(([a, b]) => assert.ok(a > 0 && b > a, '소스 구간'));
  regions.forEach(([a, b]) => {
    const body = SRC.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    (body.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach((s) => strings.push(s));
  });
  const fin = SRC.slice(SRC.indexOf("if (el['end-spirit']) {"), SRC.indexOf("el['end-best'].textContent"));
  (fin.replace(/\/\/[^\n]*/g, '').match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).forEach((s) => strings.push(s));
  const mh = HTML.slice(HTML.indexOf('<!-- 정령 패널'), HTML.indexOf('id="board-wrap"'));
  const tag = (t) => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  strings.push(tag(mh));
  const rosterHtml = HTML.slice(HTML.indexOf('id="sp-roster"'), HTML.indexOf('id="stage-grid"'));
  strings.push(tag(rosterHtml));
  strings.push(tag(HTML.slice(HTML.indexOf('id="end-spirit"') - 40, HTML.indexOf('id="end-unlock"'))));
  assert.ok(strings.length >= 5);
  strings.forEach((s) => noAvoid(s, '소스·마크업'));
  // 정적 마크업의 문구는 zZ·자리표시자뿐
  assert.ok(/zZ/.test(mh));
  // 기존 시험이 쓰는 금지어 규칙(소스·html·css 어디에도 "쉬어가"가 없다)과 같이: 새 CSS 블록에도 없다
  assert.ok(CSS.indexOf('쉬어가') === -1);
  assert.ok(SRC.indexOf('쉬어가') === -1 && HTML.indexOf('쉬어가') === -1);
});

test('⑤ index.html: #sp-wrap 안에 #spirit(기본 숨김)·#goal·#mission·#sp-live(role=status) 순서로 있고, 그림·장식은 aria-hidden, 레벨 선택 줄·결과 줄이 있으며 div 여닫음이 맞는다. 일반용에 문제(?) 요소는 없다', () => {
  const at = (s) => HTML.indexOf(s);
  const ids = ['id="sp-wrap"', 'id="spirit"', 'id="sp-art"', 'id="sp-img"', 'id="sp-zz"', 'id="sp-title"', 'id="sp-gauge"', 'id="sp-count"', 'id="goal"', 'id="sp-note"', 'id="mission"', 'id="sp-live"', 'id="board-wrap"'];
  let last = -1;
  ids.forEach((s) => { const i = at(s); assert.ok(i > last, '순서가 맞지 않거나 없음: ' + s); last = i; });
  assert.ok(/<div class="spirit" id="spirit" hidden>/.test(HTML), '#spirit 은 기본 숨김');
  assert.ok(/<div class="sp-art" id="sp-art" aria-hidden="true">/.test(HTML), '정령 그림은 장식(aria-hidden)');
  assert.ok(/<div class="sp-info" aria-hidden="true">/.test(HTML));
  assert.ok(/<p class="sp-live" id="sp-live" role="status" aria-live="polite"><\/p>/.test(HTML));
  assert.ok(/<small class="sp-note" id="sp-note" hidden><\/small>/.test(HTML));
  assert.ok(/<p class="end-spirit" id="end-spirit" hidden><\/p>/.test(HTML));
  assert.ok(/id="sp-roster-art" aria-hidden="true"/.test(HTML) && /id="sp-roster-sr"/.test(HTML), '깨운 정령: 그림 aria-hidden + 낭독용 글');
  assert.ok(at('id="sp-roster"') > at('id="stages-summary"') && at('id="sp-roster"') < at('id="stage-grid"'), '레벨 선택 요약 곁');
  assert.ok(at('id="end-spirit"') > at('id="end-target"') && at('id="end-spirit"') < at('id="end-unlock"'));
  // 기존 목표 바 역할은 그대로
  assert.ok(/<div class="goal" id="goal" role="progressbar" aria-label="목표 점수 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">/.test(HTML));
  const opens = (HTML.match(/<div\b/g) || []).length;
  const closes = (HTML.match(/<\/div>/g) || []).length;
  assert.strictEqual(opens, closes, 'div 여닫음');
  assert.ok(!/id="quiz|class="wild|물음표|선물상자/.test(HTML), '일반용 마크업에 문제·선물상자 요소가 없다');
  assert.ok(!/EduQuiz|선물상자|quiz/i.test(SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), '일반용 game.js 코드에 문제 요소가 없다');
});

/** CSS 한 블록(주석 제외)의 규칙 목록: { at: 감싸는 @규칙 또는 '', sel: 선택자, body: 선언 } */
function rulesOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  const walk = (s, at) => {
    let p = 0;
    while (p < s.length) {
      const open = s.indexOf('{', p);
      if (open < 0) break;
      const head = s.slice(p, open).trim();
      let depth = 1; let q = open + 1;
      while (q < s.length && depth) { if (s[q] === '{') depth++; else if (s[q] === '}') depth--; q++; }
      const inner = s.slice(open + 1, q - 1);
      if (/^@media/.test(head)) walk(inner, head);
      else if (/^@keyframes/.test(head)) out.push({ at: '', sel: head, body: inner, keyframes: true });
      else out.push({ at: at, sel: head, body: inner.trim() });
      p = q;
    }
  };
  walk(text, '');
  return out;
}

test('⑨ style.css: 정령 블록이 파일 맨 끝에 하나, 모든 규칙이 .sp-*/.spirit/.end-spirit 접두어로 격리되고 :root·보드 크기식을 건드리지 않는다', () => {
  const marker = '정령 특별 레벨 (spec §27.6, M4)';
  const idx = CSS.indexOf(marker);
  assert.ok(idx > 0 && CSS.indexOf(marker, idx + 1) === -1, '블록 하나');
  const block = beforeMenu(CSS).slice(CSS.lastIndexOf('/*', idx));
  assert.ok(block.length > 3000 && block.indexOf('콤보 칩 (spec §28)') === -1 && block.indexOf('미션 레벨 카드·설명판 (spec §27 M2') === -1, '파일 맨 끝의 새 블록');
  assert.ok(!/^\s*:root/m.test(block) && !/--board\s*:|--ui-h\s*:|--cell\s*:/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), ':root·보드 크기식을 건드리지 않는다');
  const rules = rulesOf(block);
  assert.ok(rules.length > 30, '규칙 수 ' + rules.length);
  const allowed = /^(\.sp-[a-z-]+|\.spirit|\.end-spirit)(?![a-z-])/;
  rules.filter((r) => !r.keyframes).forEach((r) => r.sel.split(',').map((x) => x.trim()).forEach((s) => assert.ok(allowed.test(s), '격리되지 않은 선택자: ' + s)));
  rules.filter((r) => r.keyframes).forEach((r) => assert.ok(/^@keyframes sp[A-Z]/.test(r.sel), '키프레임 이름 격리: ' + r.sel));
  // 보드 크기식 한 줄: 기존 미션 HUD 블록 안의 #screen-game[data-spirit] 규칙(2칩과 같은 71px)
  const hudBlock = CSS.slice(CSS.indexOf('미션 HUD (spec §27) — M1'), CSS.indexOf('콤보 칩 (spec §28) — B1'));
  assert.ok(/#screen-game\[data-spirit\] \{\s*--board: min\(calc\(100vw - 24px\), calc\(var\(--vh100\) - var\(--ui-h\) - 71px\), var\(--board-cap, 520px\)\);/.test(hudBlock), '높이 규칙: 2칩 레벨과 같은 71px');
  assert.ok(/#screen-game\[data-goal="mission"\]\[data-chips="2"\] \{ --mis-extra: 71px; \}/.test(hudBlock), '2칩 기준 71px (패널 높이 93px = 2칩과 같다)');
  assert.ok(/grid-template-rows: 38px 52px; gap: 3px 8px;/.test(block) && /\.sp-wrap\.on \{\s*display: grid;/.test(block), '패널 93px = 38 + 3 + 52');
});

test('⑨ style.css: 감소 모션이면 zZ 떠오름·빛 번짐·필터 전환이 없고, 무한 반복 애니메이션은 zZ 하나뿐이며, 붉은 점멸·흔들림이 없고, 글자는 11px 이상이다', () => {
  const marker = '정령 특별 레벨 (spec §27.6, M4)';
  const block = beforeMenu(CSS).slice(CSS.lastIndexOf('/*', CSS.indexOf(marker)));
  const rules = rulesOf(block);
  const rm = rules.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.at));
  assert.ok(/^@media screen and \(prefers-reduced-motion: reduce\)$/.test(rm[0].at), '"screen and" 형식(기존 시험이 파일 끝쪽 감소 모션 쿼리를 형식으로 읽는다)');
  const rmText = rm.map((r) => r.sel + '{' + r.body + '}').join('\n');
  assert.ok(/\.sp-zz \{ animation: none; \}|\.sp-zz\{\s*animation:\s*none;\s*\}/.test(rmText), 'zZ 떠오름 없음');
  assert.ok(/\.sp-art\.pulse::after[^{]*\{\s*animation:\s*none;/.test(rmText), '빛 번짐 없음');
  assert.ok(/\.sp-img\s*\{\s*transition:\s*none;/.test(rmText), '필터 전환(컬러 복귀 0.6초) 없이 즉시');
  // 애니메이션·전환은 정령 규칙에서만 쓰고, 무한 반복은 하나(zZ)
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.strictEqual((code.match(/infinite/g) || []).length, 1, '무한 반복 애니메이션 1개(zZ)');
  assert.ok(/\.sp-zz \{[^}]*animation: spZz [^;]*infinite/.test(code));
  const anim = code.match(/animation:[^;}]*/g) || [];
  assert.ok(anim.length >= 4 && anim.every((a) => /spZz|spGlow|none/.test(a)), '애니메이션은 spZz·spGlow 뿐: ' + anim.join(' / '));
  // 키프레임에 붉은 색·흔들림(좌우 이동·회전)이 없다: 색 지정이 없고, transform 은 위아래 이동·크기뿐
  rules.filter((r) => r.keyframes).forEach((r) => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|\bred\b|hsl|filter|brightness|translateX|rotate|skew/.test(r.body), '키프레임에 색·흔들림 없음: ' + r.sel + ' ' + r.body);
    assert.ok(/translateY|scale|opacity/.test(r.body));
  });
  const everyColor = (code.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []);
  const redish = everyColor.filter((c) => /^#(f00|ff0000|f33|ff3333|e5484d|ff5a64|ff5a5f)$/i.test(c) || /^rgba?\(\s*255\s*,\s*0\s*,\s*0/.test(c));
  assert.deepStrictEqual(redish, [], '붉은 색을 쓰지 않는다');
  // 글자 크기 11px 이상(max(11px, …) 또는 .7rem 이상, clamp 는 하한이 .72rem 이상)
  (code.match(/font-size:\s*[^;]+;/g) || []).forEach((d) => {
    const low = d.match(/(?:clamp\(|max\()\s*(\d*\.?\d+)(rem|px)/);
    const plain = d.match(/font-size:\s*(\d*\.?\d+)(rem|px)\s*;/);
    const m = low || plain;
    assert.ok(m, d);
    const px = m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
    assert.ok(px >= 11, '글자 11px 이상: ' + d);
  });
});

test('⑨ style.css: 글자 대비 4.5:1 이상(머리 카드·요청 칸·결과 줄·구간별 바탕 위의 잉크/짙은 갈색/짙은 초록)', () => {
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const marker = '정령 특별 레벨 (spec §27.6, M4)';
  const block = beforeMenu(CSS).slice(CSS.lastIndexOf('/*', CSS.indexOf(marker))).replace(/\/\*[\s\S]*?\*\//g, '');
  const ink = CSS.match(/--ink:\s*(#[0-9a-f]{6})/g).pop().slice(-7);
  // [글자색, 바탕색] — 블록의 실제 값과 같은 것만 검사한다(아래 includes 로 값이 그대로 있는지 확인)
  const pairs = [
    [ink, '#ffffff', 'linear-gradient(180deg, #ffffff 0%, #ece6ff 100%)'],      // 머리 카드 제목·깨어남 글자
    [ink, '#ece6ff', 'linear-gradient(180deg, #ffffff 0%, #ece6ff 100%)'],
    [ink, '#e4dcff', 'linear-gradient(180deg, #ffffff 0%, #e4dcff 100%)'],      // 정령 그림 카드의 zZ
    ['#0d3b24', '#ffffff', '.sp-art.awake + .sp-info .sp-title { color: #0d3b24; }'],   // 깨어난 제목
    ['#0d3b24', '#ece6ff', '.sp-art.awake + .sp-info .sp-title { color: #0d3b24; }'],
    ['#4a2600', '#ffffff', 'color: #4a2600; font-size: max(11px, .7rem)'],      // 빈 칸(바탕 흰색)
    ['#4a2600', '#ffd24a', '.sp-cell.on { border-style: solid; border-color: #b45309; background: #ffd24a; }'],   // 채워진 칸의 ✓
    ['#4a2600', '#fff6cf', 'background: #fff6cf; color: #4a2600'],              // 결과 줄
    [ink, '#ffffff', 'color: var(--ink); animation: spZz']
  ];
  pairs.forEach(([fg, bg, needle]) => {
    assert.ok(block.indexOf(needle) !== -1, '검사한 값이 블록에 그대로 있다: ' + needle);
    assert.ok(cr(fg, bg) >= 4.5, fg + ' on ' + bg + ' = ' + cr(fg, bg).toFixed(2));
  });
  // 채워진 칸 ✓ 는 색뿐 아니라 글자(✓)와 실선·빈 칸은 점선(모양)으로 구분된다
  assert.ok(/\.sp-cell \{[^}]*border: 2px dashed/.test(block) && /\.sp-cell\.on \{ border-style: solid;/.test(block));
});

test('⑩ 새 에셋 파일 0개: assets/ 의 파일 목록이 M4 시작 시점과 같고, 이 단계가 만든 새 파일은 없다(이미지·음원·글꼴 없음)', { skip: BASE_SRC ? false : 'git 없음' }, () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(root, path.join(d, e.name))]));
  const now = walk(path.join(root, 'assets')).sort();
  let before;
  try {
    before = cp.execFileSync('git', ['ls-tree', '-r', '--name-only', BASE_COMMIT, 'apps/element-gems/assets'], { cwd: path.join(root, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean).map((p) => p.replace('apps/element-gems/', '')).sort();
  } catch (e) { return; }
  if (!before.length) return;
  assert.deepStrictEqual(now, before, 'assets 파일 목록이 변경 전과 같다');
  // 소스·마크업·CSS 에 새 외부 주소·글꼴 파일이 없다
  assert.ok(!/@font-face|https?:\/\//.test(beforeMenu(CSS).slice(CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)'))), '새 CSS 에 글꼴·외부 주소 없음');
  assert.ok(!/\.(png|jpe?g|webp|svg|mp3|wav|woff2?)/i.test(beforeMenu(CSS).slice(CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)'))), '새 CSS 가 새 파일을 가리키지 않는다');
});
