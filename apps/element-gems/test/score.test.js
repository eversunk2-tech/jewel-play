/* 점수 규칙 "강 R4" 시험 — spec §28.5(공식·숫자)·§28.8(CONFIG 키·시험 항목 ①~⑨)·§28.9(저장 호환)·§31.3(초보 목표 표).
 * 실행: node --test apps/element-gems/test/*.test.js
 *
 * ① 순수 함수(콤보 배수·연쇄 상한·곱 상한·스킬 점수·콤보 이어짐) ② CONFIG 표·난이도 복사 ③ 목표 점수 표 ④ 칭찬 문턱 ⑤ 저장 호환(scoreRule·bestOld)
 * ⑥ 실제 판 흐름(가짜 DOM + 가상 시계로 game.js 를 그대로 실행): 콤보 이어짐/끊김·시계 정지·스킬 점수·일시불·무효 스왑·미션/연쇄 보호·HUD 칩·결과 줄
 * ⑦ 독립 재계산: 스크립트 플레이의 사건 로그를 spec 식으로 따로 합산해 state.score 와 맞춘다(구현 식을 복사하지 않고 §28.5 표·식에서 다시 썼다)
 * ⑧ 정적 점검(style.css 블록·index.html 마크업).
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
const R = require(path.join(root, 'ranking.js'));
const SRC = fs.readFileSync(GAME_PATH, 'utf8');

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- spec §28.5 의 표·식을 시험 쪽에서 따로 쓴 것 (game.js 의 식을 복사하지 않았다) ---------- */
const SPEC = {
  mult: { easy: 0.8, normal: 1.0, hard: 1.3 },
  win: { easy: 8, normal: 6, hard: 4 },
  pts: {   // §28.5.3 표: 칸당(불·풀·번개) / 일시불(물·어둠·빛)
    easy: { fire: 30, grass: 15, lightning: 30, bonus: 125 },
    normal: { fire: 85, grass: 50, lightning: 95, bonus: 375 },
    hard: { fire: 115, grass: 70, lightning: 130, bonus: 525 }
  },
  combo: [1.0, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0]      // r = 0..6 (6 이상은 3.0)
};
const specBase = (size) => (size >= 6 ? 200 + 100 * (size - 5) : { 3: 50, 4: 100, 5: 200 }[size]);
const specCombo = (r) => SPEC.combo[Math.min(Math.max(r, 0), 6)];
const specGroupPts = (diff, e) => Math.round(specBase(e.size) * Math.min(Math.min(e.step, 8) * specCombo(e.r), 16) * (e.dark ? 2 : 1) * SPEC.mult[diff]);
const specSkillPts = (diff, e) => Math.round(e.cells * SPEC.pts[diff][e.kind] * (e.dark ? 2 : 1) * SPEC.mult[diff]);
const specBonusPts = (diff, e) => Math.round(SPEC.pts[diff].bonus * (e.dark ? 2 : 1) * SPEC.mult[diff]);

/* ===================================================================
 * 1) 순수 함수
 * =================================================================== */
test('① comboMult: 1.0·1.4·1.8·2.2·2.6·3.0, 6번째부터 최대 ×3, r ≤ 0 도 ×1', () => {
  const want = { '-3': 1, 0: 1, 1: 1.0, 2: 1.4, 3: 1.8, 4: 2.2, 5: 2.6, 6: 3.0, 7: 3.0, 40: 3.0, 1000: 3.0 };
  Object.keys(want).forEach((r) => assert.ok(Math.abs(G.comboMult(Number(r)) - want[r]) < 1e-9, 'r=' + r + ' -> ' + G.comboMult(Number(r))));
  // 설정값(step·max)이 식에 쓰인다
  const c0 = JSON.stringify(G.CONFIG.score.combo);
  try {
    G.CONFIG.score.combo = { step: 0.5, max: 2.0 };
    assert.strictEqual(G.comboMult(2), 1.5);
    assert.strictEqual(G.comboMult(9), 2.0);
  } finally { G.CONFIG.score.combo = JSON.parse(c0); }
});

test('② chainMult 상한 8, waveMult 는 연쇄×콤보 곱을 16 으로 자른다(연쇄는 step 만, 콤보는 r 만)', () => {
  assert.strictEqual(G.CONFIG.score.chainMax, 8);
  assert.strictEqual(G.CONFIG.score.multCap, 16);
  [[0, 1], [1, 1], [2, 2], [5, 5], [8, 8], [9, 8], [30, 8]].forEach(([s, m]) => assert.strictEqual(G.chainMult(s), m, 'step ' + s));
  assert.strictEqual(G.waveMult(1, 1), 1);
  assert.strictEqual(G.waveMult(1, 6), 3);
  assert.strictEqual(G.waveMult(8, 1), 8);
  assert.ok(Math.abs(G.waveMult(5, 3) - 9) < 1e-9);               // 5 × 1.8
  assert.ok(Math.abs(G.waveMult(6, 6) - 16) < 1e-9, '6 × 3 = 18 -> 16');
  assert.strictEqual(G.waveMult(8, 6), 16, '8 × 3 = 24 -> 16');
  assert.strictEqual(G.waveMult(50, 99), 16);
  for (let step = 1; step <= 20; step++) for (let r = 0; r <= 40; r++) assert.ok(G.waveMult(step, r) <= 16 && G.waveMult(step, r) >= 1);
  // 곱 상한은 설정값
  const cap0 = G.CONFIG.score.multCap;
  try { G.CONFIG.score.multCap = 12; assert.strictEqual(G.waveMult(8, 6), 12); } finally { G.CONFIG.score.multCap = cap0; }
});

test('③ 난이도별 comboWindow 8/6/4 와 skillPts 6칸 표, applyDifficulty 가 활성 값으로 복사한다', () => {
  const D = G.CONFIG.difficulty;
  ['easy', 'normal', 'hard'].forEach((lv) => {
    assert.strictEqual(D[lv].comboWindow, SPEC.win[lv], lv + ' 창');
    assert.deepStrictEqual(D[lv].skillPts, SPEC.pts[lv], lv + ' skillPts');
  });
  const keep = JSON.stringify([G.CONFIG.score.comboWindow, G.CONFIG.score.skillPts, G.CONFIG.level]);
  try {
    ['easy', 'hard', 'normal'].forEach((lv) => {
      G.applyDifficulty(lv);
      assert.strictEqual(G.CONFIG.score.comboWindow, SPEC.win[lv]);
      assert.deepStrictEqual(G.CONFIG.score.skillPts, SPEC.pts[lv]);
      assert.notStrictEqual(G.CONFIG.score.skillPts, D[lv].skillPts, '프리셋 객체를 그대로 물려받지 않고 값을 복사한다');
      G.CONFIG.score.skillPts.fire += 1;            // 활성 값을 고쳐도 프리셋은 그대로
      assert.strictEqual(D[lv].skillPts.fire, SPEC.pts[lv].fire);
    });
  } finally {
    G.applyDifficulty('normal');
    const [w, p, l] = JSON.parse(keep);
    G.CONFIG.score.comboWindow = w; G.CONFIG.score.skillPts = p; G.CONFIG.level = l;
  }
  // 저장 표식·칭찬 문턱·호환 키
  assert.strictEqual(G.CONFIG.score.rule, 2);
  assert.strictEqual(G.CONFIG.praiseThreshold, 15000);
  assert.deepStrictEqual(G.CONFIG.score.combo, { step: 0.4, max: 3.0 });
  assert.strictEqual(G.CONFIG.score.breakShow, 1);
  // skillPts 값의 근거식(주석의 식): 칸당 = round5(N×50÷효과 칸 수), 일시불 = round5(N×50×0.5)
  const r5 = (x) => Math.round(x / 5) * 5;
  const N = { easy: 5, normal: 15, hard: 21 };
  ['easy', 'normal', 'hard'].forEach((lv) => {
    assert.strictEqual(D[lv].skillPts.fire, r5(N[lv] * 50 / 9));
    assert.strictEqual(D[lv].skillPts.grass, r5(N[lv] * 50 / 15));
    assert.strictEqual(D[lv].skillPts.lightning, r5(N[lv] * 50 / 8));
    assert.strictEqual(D[lv].skillPts.bonus, r5(N[lv] * 50 * 0.5));
  });
});

test('④ skillPoints: 칸당 점수 × 칸 수, 물·어둠·빛은 일시불. 난이도 배율 뒤 값은 §28.5.3 표와 같다', () => {
  const keep = JSON.stringify(G.CONFIG.score.skillPts);
  try {
    // 중수 불 9칸 = 765, 풀 15칸 = 750, 번개 8칸 = 760, 일시불 375
    G.applyDifficulty('normal');
    assert.strictEqual(G.skillPoints('fire', 9), 765);
    assert.strictEqual(G.skillPoints('grass', 15), 750);
    assert.strictEqual(G.skillPoints('lightning', 8), 760);
    ['water', 'dark', 'light'].forEach((k) => { assert.strictEqual(G.skillPoints(k, 0), 375); assert.strictEqual(G.skillPoints(k, 9), 375, '칸 수와 무관'); });
    // 고수 풀 15칸 = 1,050 -> ×1.3 = 1,365 / 불 9칸 1,035 -> 1,346 / 번개 7칸 910 -> 1,183 / 일시불 525 -> 683
    G.applyDifficulty('hard');
    const m = G.CONFIG.scoreMult;
    assert.strictEqual(m, 1.3);
    assert.strictEqual(G.skillPoints('grass', 15), 1050);
    assert.strictEqual(Math.round(G.skillPoints('grass', 15) * m), 1365);
    assert.strictEqual(Math.round(G.skillPoints('fire', 9) * m), 1346);
    assert.strictEqual(Math.round(G.skillPoints('lightning', G.CONFIG.skills.lightning.count) * m), 1183);
    assert.strictEqual(Math.round(G.skillPoints('dark', 0) * m), 683);
    // 초보 ×0.8: 216 / 180 / 240 / 100
    G.applyDifficulty('easy');
    const e = G.CONFIG.scoreMult;
    assert.strictEqual(G.CONFIG.skills.lightning.count, 10, '초보 번개는 최대 10칸');
    assert.deepStrictEqual([G.skillPoints('fire', 9), G.skillPoints('grass', 15), G.skillPoints('lightning', 10)].map((v) => Math.round(v * e)), [216, 180, 240]);
    assert.strictEqual(Math.round(G.skillPoints('light', 0) * e), 100);
    // 칸이 적으면 비례해 줄어든다(가장자리)
    G.applyDifficulty('normal');
    assert.strictEqual(G.skillPoints('fire', 4), 340);
    assert.strictEqual(G.skillPoints('fire', 0), 0);
  } finally { G.applyDifficulty('normal'); G.CONFIG.score.skillPts = JSON.parse(keep); }
});

test('⑤ comboNext: 창 안이면 +1, 창 밖이면 1, 경계값(창과 같음)은 이어지고, r = 0 이면 항상 1', () => {
  assert.strictEqual(G.comboNext(3, 2, 6), 4);
  assert.strictEqual(G.comboNext(1, 0, 6), 2);
  assert.strictEqual(G.comboNext(3, 6, 6), 4, '경계값 포함');
  assert.strictEqual(G.comboNext(3, 6.0001, 6), 1);
  assert.strictEqual(G.comboNext(40, 99, 6), 1);
  assert.strictEqual(G.comboNext(0, 0, 6), 1, 'r=0 은 아직 콤보가 없다');
  assert.strictEqual(G.comboNext(0, 2, 6), 1);
  [8, 6, 4].forEach((w) => { assert.strictEqual(G.comboNext(2, w, w), 3); assert.strictEqual(G.comboNext(2, w + 0.01, w), 1); });
});

test('④ praiseLevel: 한 행동 합계 15,000 이상이면 EXCELLENT, 5,000 은 아님. 연쇄 5단계 EXCELLENT 는 그대로', () => {
  assert.strictEqual(G.CONFIG.praiseThreshold, 15000);
  assert.strictEqual(G.praiseLevel(1, 3, 14999), null);
  assert.strictEqual(G.praiseLevel(1, 3, 15000), 'EXCELLENT!');
  assert.strictEqual(G.praiseLevel(1, 3, 99999), 'EXCELLENT!');
  assert.strictEqual(G.praiseLevel(1, 3, 5000), null, '옛 문턱 5,000 은 EXCELLENT 가 아니다');
  assert.strictEqual(G.praiseLevel(1, 3, 6000), null);
  assert.strictEqual(G.praiseLevel(5, 3, 0), 'EXCELLENT!');
  assert.strictEqual(G.praiseLevel(7, 3, 0), 'EXCELLENT!');
  assert.strictEqual(G.praiseLevel(4, 3, 14999), 'AWESOME!');
  assert.strictEqual(G.praiseLevel(3, 3, 0), 'GREAT!');
  assert.strictEqual(G.praiseLevel(1, 5, 0), 'GREAT!');
  assert.strictEqual(G.praiseLevel(2, 3, 0), 'GOOD!');
  assert.strictEqual(G.praiseLevel(1, 4, 0), 'GOOD!');
  assert.strictEqual(G.praiseLevel(1, 3, 100), null);
  const t0 = G.CONFIG.praiseThreshold;
  try { G.CONFIG.praiseThreshold = 700; assert.strictEqual(G.praiseLevel(1, 3, 700), 'EXCELLENT!'); assert.strictEqual(G.praiseLevel(1, 3, 699), null); } finally { G.CONFIG.praiseThreshold = t0; }
});

test('⑧ 목표 점수 표: 초보 = §31.3, 중수·고수 = §28.7.5 근사(폴백·롤백용). 모두 단조 증가, 같은 레벨에서 초보 < 중수 < 고수', () => {
  const T = G.CONFIG.stages.targets;
  assert.deepStrictEqual(T.easy, [9000, 9500, 10100, 10400, 10600, 11100, 11600, 13000, 14200, 15200]);
  assert.deepStrictEqual(T.normal, [14900, 16200, 17500, 17800, 19500, 20800, 22400, 23400, 25100, 27100]);
  assert.deepStrictEqual(T.hard, [17600, 19200, 20200, 21400, 22400, 23700, 25600, 27200, 29100, 31700]);
  ['easy', 'normal', 'hard'].forEach((lv) => {
    assert.strictEqual(T[lv].length, 10);
    for (let i = 1; i < 10; i++) assert.ok(T[lv][i] > T[lv][i - 1], lv + ' 증가 ' + i);
    T[lv].forEach((v, i) => { assert.strictEqual(v % 100, 0, '100점 단위'); assert.strictEqual(G.stageTarget(lv, i + 1), v); });
  });
  for (let i = 0; i < 10; i++) assert.ok(T.easy[i] < T.normal[i] && T.normal[i] < T.hard[i], '레벨 ' + (i + 1));
  // 중수·고수 폴백은 옛 §25.6 표의 약 3.3 / 3.2 배(±1%)
  const old = { normal: [4500, 4900, 5300, 5400, 5900, 6300, 6800, 7100, 7600, 8200], hard: [5500, 6000, 6300, 6700, 7000, 7400, 8000, 8500, 9100, 9900] };
  old.normal.forEach((v, i) => assert.ok(Math.abs(T.normal[i] / (v * 3.3) - 1) < 0.01, '중수 ' + (i + 1)));
  old.hard.forEach((v, i) => assert.ok(Math.abs(T.hard[i] / (v * 3.2) - 1) < 0.01, '고수 ' + (i + 1)));
  assert.deepStrictEqual(G.CONFIG.stages.goalType, { easy: 'score', normal: 'mission', hard: 'mission' }, '§27 M2: 중수·고수는 미션형(위 점수 표는 goalType 을 score 로 되돌릴 때 쓰는 폴백)');
});

/* ===================================================================
 * 2) 저장 호환 (spec §28.9)
 * =================================================================== */
const stagesOf = (entries) => { const a = []; for (let i = 0; i < 10; i++) a.push(entries[i] || { best: 0, stars: 0, left: 0 }); return a; };

test('⑨ parseSave: 표식 없는 옛 저장 — 별·남은 시간·진행도 보존, best -> bestOld 이전, best 는 0, scoreRule 2', () => {
  const old = {
    level: 'hard', best: 777, bestChain: 9, plays: 4, lastScore: 1234, muted: true, cutin: false, tutorialSeen: true,
    bestByLevel: { easy: 1, normal: 2, hard: 3 }, progress: { easy: 3, normal: 2, hard: 0 },
    stages: {
      easy: stagesOf([{ best: 4200, stars: 3, left: 90 }, { best: 3800, stars: 2, left: 50 }, { best: 150, stars: 1, left: 3 }]),
      normal: stagesOf([{ best: 6000, stars: 2, left: 40 }, { best: 5100, stars: 1, left: 1 }]),
      hard: stagesOf([{ best: 90, stars: 0, left: 0 }])
    }
  };
  const s = G.parseSave(JSON.stringify(old));
  assert.strictEqual(s.scoreRule, 2);
  assert.deepStrictEqual(s.stages.easy.slice(0, 4), [
    { best: 0, stars: 3, left: 90, bestOld: 4200 }, { best: 0, stars: 2, left: 50, bestOld: 3800 }, { best: 0, stars: 1, left: 3, bestOld: 150 }, { best: 0, stars: 0, left: 0 }]);
  assert.deepStrictEqual(s.stages.normal.slice(0, 3), [{ best: 0, stars: 2, left: 40, bestOld: 6000 }, { best: 0, stars: 1, left: 1, bestOld: 5100 }, { best: 0, stars: 0, left: 0 }]);
  assert.deepStrictEqual(s.stages.hard[0], { best: 0, stars: 0, left: 0, bestOld: 90 }, '별이 없어도 옛 최고 점수는 옮긴다');
  // 나머지는 그대로
  assert.deepStrictEqual(s.progress, { easy: 3, normal: 2, hard: 0 });
  assert.deepStrictEqual(s.bestByLevel, { easy: 1, normal: 2, hard: 3 });
  assert.strictEqual(s.best, 777); assert.strictEqual(s.bestChain, 9); assert.strictEqual(s.plays, 4); assert.strictEqual(s.lastScore, 1234);
  assert.strictEqual(s.level, 'hard'); assert.strictEqual(s.muted, true); assert.strictEqual(s.cutin, false); assert.strictEqual(s.tutorialSeen, true);
  // 왕복해도 변하지 않는다(멱등) — 두 번째부터는 scoreRule 2 저장
  assert.deepStrictEqual(G.parseSave(JSON.stringify(s)), s);
  // 이전 뒤 첫 판 결과가 새 best 로 쌓인다
  G.applyStageResult(s, 'easy', 1, 9100, true, 2, 60);
  assert.strictEqual(s.stages.easy[0].best, 9100);
  assert.strictEqual(s.stages.easy[0].bestOld, 4200);
  assert.strictEqual(s.stages.easy[0].stars, 3, '별은 최고 기록 유지');
  assert.deepStrictEqual(G.parseSave(JSON.stringify(s)), s);
});

test('⑨ parseSave: scoreRule 2 저장은 best·bestOld 를 그대로 보존(bestOld 는 유효한 점수일 때만). 표식이 2가 아니면 옛 저장으로 본다', () => {
  const mk = (entry, rule) => JSON.stringify({ scoreRule: rule, stages: { easy: stagesOf([entry]), normal: stagesOf([]), hard: stagesOf([]) } });
  const e0 = (rule, e) => G.parseSave(mk(e, rule)).stages.easy[0];
  assert.deepStrictEqual(e0(2, { best: 9100, stars: 2, left: 45, bestOld: 4200 }), { best: 9100, stars: 2, left: 45, bestOld: 4200 });
  assert.deepStrictEqual(e0(2, { best: 9100, stars: 2, left: 45 }), { best: 9100, stars: 2, left: 45 }, 'bestOld 없음 -> 키를 만들지 않는다');
  assert.deepStrictEqual(e0(2, { best: 0, stars: 0, left: 0, bestOld: 0 }), { best: 0, stars: 0, left: 0 });
  [-5, NaN, Infinity, '4200', null, [], {}, true, undefined].forEach((bad) => {
    const e = e0(2, { best: 100, stars: 1, left: 2, bestOld: bad });
    assert.deepStrictEqual(e, { best: 100, stars: 1, left: 2 }, '잘못된 bestOld ' + JSON.stringify(bad) + ' 는 버린다');
  });
  assert.strictEqual(e0(2, { best: 'x', stars: 1, left: 2, bestOld: 55 }).best, 0);
  // 표식이 없거나 2가 아니면 옛 저장 — best 를 bestOld 로 옮긴다(저장에 있던 bestOld 는 무시하고 best 를 옮긴다)
  [undefined, 1, 3, '2', null, 0, true].forEach((rule) => {
    const e = e0(rule, { best: 4200, stars: 1, left: 5, bestOld: 99999 });
    assert.deepStrictEqual(e, { best: 0, stars: 1, left: 5, bestOld: 4200 }, 'scoreRule=' + JSON.stringify(rule));
  });
  // 기본 저장·손상 입력은 현재 규칙의 기본 저장
  const def = G.defaultSave();
  assert.strictEqual(def.scoreRule, 2);
  def.stages.easy.concat(def.stages.normal, def.stages.hard).forEach((e) => assert.deepStrictEqual(e, { best: 0, stars: 0, left: 0 }));
  assert.deepStrictEqual(G.parseSave('{'), def);
  assert.deepStrictEqual(G.parseSave({}), def, '빈 객체(표식 없음, 옮길 점수 없음)도 기본 저장과 같다');
});

test('⑨ buildSnapshot(서버로 가는 값)은 마이그레이션 전후로 같다 — 별·left 만 읽는다', () => {
  const old = {
    stages: {
      easy: stagesOf([{ best: 4200, stars: 3, left: 90 }, { best: 3800, stars: 2, left: 50 }, { best: 150, stars: 1, left: 3 }]),
      normal: stagesOf([{ best: 6000, stars: 2, left: 40 }]),
      hard: stagesOf([])
    },
    progress: { easy: 3, normal: 1, hard: 0 }
  };
  const migrated = G.parseSave(JSON.stringify(old));
  const same = G.parseSave(JSON.stringify(Object.assign({ scoreRule: 2 }, old)));      // 마이그레이션 없이 읽은 것(best 는 그대로)
  const caps = { easy: 150, normal: 140, hard: 120 };
  assert.deepStrictEqual(R.buildSnapshot(migrated, 10, caps), R.buildSnapshot(same, 10, caps));
  assert.deepStrictEqual(R.buildSnapshot(migrated, 10, caps), R.buildSnapshot(old, 10, caps), '옛 저장 객체에서 바로 만든 것과도 같다');
  assert.deepStrictEqual(R.buildSnapshot(migrated, 10, caps).easy, [90, 50, 3, -1, -1, -1, -1, -1, -1, -1]);
  assert.notStrictEqual(migrated.stages.easy[0].best, same.stages.easy[0].best, '(best 는 서로 다르다 — 그래도 스냅샷은 같다)');
});

/* ===================================================================
 * 3) 가짜 DOM + 가상 시계 하네스 — 실제 game.js 를 실행한다 (mission.test.js 하네스를 줄여서 사용)
 *    사건 로그: awardGroup / removeSkillCells / awardSkillBonus 를 바깥에서 감싸 호출 뒤 점수 차이·콤보 r·어둠 여부를 기록한다(게임 식은 건드리지 않는다).
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
const WRAP = [
  'function awardGroup(ctx, g, step) {',
  '  const before = state.score, dark = state.dark > 0;',
  '  __awardGroup(ctx, g, step);',
  "  globalThis.__EG_LOG.push({ t: 'g', size: g.size, step: step, r: state.combo, dark: dark, pts: state.score - before, act: ctx.__id || (ctx.__id = ++globalThis.__EG_ACT) });",
  '}',
  'async function removeSkillCells(ctx, cells, kind) {',
  '  const before = state.score, dark = state.dark > 0;',
  '  const n = cells.filter(function (p) { return state.grid[p.r][p.c]; }).length;',
  '  await __removeSkillCells(ctx, cells, kind);',
  "  if (n) globalThis.__EG_LOG.push({ t: 's', kind: kind, cells: n, r: state.combo, dark: dark, pts: state.score - before, act: ctx.__id || (ctx.__id = ++globalThis.__EG_ACT) });",
  '}',
  'function awardSkillBonus(kind) {',
  '  const before = state.score, dark = state.dark > 0;',
  '  __awardSkillBonus(kind);',
  "  globalThis.__EG_LOG.push({ t: 'b', kind: kind, r: state.combo, dark: dark, pts: state.score - before });",
  '}',
  ''
].join('\n');
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, hud: hud, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, goStages: goStages, typeGrid: typeGrid, setGemType: setGemType, listMoves: listMoves, goalMet: goalMet, pauseGame: pauseGame, resumeGame: resumeGame, cancelAim: cancelAim, finishStage: finishStage, updateHUD: updateHUD }; }\n";
assert.ok(SRC.indexOf(HOOK_TAIL) !== -1, 'game.js 끝부분을 찾지 못함');
['function awardGroup(ctx, g, step) {', 'async function removeSkillCells(ctx, cells, kind) {', 'function awardSkillBonus(kind) {'].forEach((h) => assert.ok(SRC.indexOf(h) !== -1, '감쌀 함수를 찾지 못함: ' + h));
const SCRIPT = new vm.Script(SRC
  .replace('function awardGroup(ctx, g, step) {', 'function __awardGroup(ctx, g, step) {')
  .replace('async function removeSkillCells(ctx, cells, kind) {', 'async function __removeSkillCells(ctx, cells, kind) {')
  .replace('function awardSkillBonus(kind) {', 'function __awardSkillBonus(kind) {')
  .replace(HOOK_TAIL, WRAP + HOOK + HOOK_TAIL), { filename: 'general/game.js' });

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

/** opts.reduce: prefers-reduced-motion 값(기본 true — 입자(난수)가 없어 새 칸 종류를 시험이 정한다). cfgPatch(CONFIG): 샌드박스의 CONFIG 만 바꾼다 */
function createEnv(seed, cfgPatch, opts) {
  const o = opts || {};
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
    console, __EG_TEST__: {}, __EG_LOG: [], __EG_ACT: 0, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: o.reduce === undefined ? true : o.reduce }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: () => { env.rnd++; return rand(); },
    __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  SCRIPT.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.store = store; env.log = sandbox.__EG_LOG;
  env.I = sandbox.__EG_TEST__.internals;
  env.CONFIG = env.I.CONFIG;
  env.CONFIG.board.enabled = false;                          // 새 칸 종류를 시험이 정한다(§26 구조 규칙은 끈다)
  env.CONFIG.stages.goalType.normal = 'score'; env.CONFIG.stages.goalType.hard = 'score';   // 시험 도구(spec §27.9.3): 점수 규칙 시험은 미션 표 값과 무관하게 점수 목표 판에서 돈다(미션이 필요한 시험은 cfgPatch 에서 켠다)
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

async function startAndWait(env, lv, stage) {
  const I = env.I;
  I.save.level = lv;
  I.save.progress[lv] = 9;
  I.startStage(stage || 1);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
}
function applyBoard(env, types) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], types[r][c]);
}
async function finishAction(env, settleMs) {
  await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000);
  await env.runFor(settleMs == null ? 400 : settleMs);          // 몇 프레임 더 흘려 HUD(updateHUD)가 그려지게 한다
}

/* ---------- 한 행동의 정산을 순수 함수로 되풀이한다(새 칸 종류를 시험이 정하는 용도) ---------- */
const swapped = (b, m) => { const c = b.map((r) => r.slice()); const t = c[m.a.r][m.a.c]; c[m.a.r][m.a.c] = c[m.b.r][m.b.c]; c[m.b.r][m.b.c] = t; return c; };
function replay(board, o) {
  const g = board.map((r) => r.slice());
  const events = [];
  const forced = [];
  let maxStep = 1;
  function dropFill() {
    const res = G.applyGravity(g);
    for (let c = 0; c < 8; c++) for (let i = 0; i < res.empties[c]; i++) { const t = Math.floor(o.rng() * 6); g[i][c] = t; forced.push((t + 0.5) / 6); }
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
const sim1 = (events, r, diff, dark) => events.reduce((a, e) => a + specGroupPts(diff, { size: e.size, step: e.step, r, dark: !!dark }), 0);

/** 지금 보드에서 유효한 수 하나를 골라(조건 pred(sim, move)) 정산 결과를 미리 계산하고 새 칸 종류를 정해 둔다. 정산 뒤에도 유효한 수가 남아 재섞기가 없게 */
function planSwap(env, seed, pred) {
  const board = env.I.typeGrid();
  const moves = G.listMoves(board);
  for (let mi = 0; mi < moves.length; mi++) {
    for (let k = 0; k < 8; k++) {
      const sim = replay(swapped(board, moves[mi]), { startStep: 1, rng: mulberry(seed * 977 + mi * 13 + k) });
      if (G.hasValidMove(sim.final) && (!pred || pred(sim, moves[mi], board))) return { board, move: moves[mi], sim };
    }
  }
  throw new Error('조건에 맞는 수를 찾지 못함');
}
async function doSwap(env, seed, pred, settleMs) {
  const sc = planSwap(env, seed, pred);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
  env.I.trySwap(sc.move.a, sc.move.b);
  await finishAction(env, settleMs);
  assert.strictEqual(env.sandbox.__forced.length, 0, '새 칸 종류가 모두 순서대로 쓰였다(재섞기·다른 난수 호출 없음)');
  return sc;
}
/** 매치가 안 생기는 인접 교환(무효 스왑) */
function invalidMove(board) {
  const valid = G.listMoves(board).map((m) => m.a.r + ',' + m.a.c + '-' + m.b.r + ',' + m.b.c);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
    if (valid.indexOf(r + ',' + c + '-' + r + ',' + (c + 1)) === -1) return { a: { r, c }, b: { r, c: c + 1 } };
  }
  throw new Error('무효 스왑 후보 없음');
}
const fillGauge = (env, i) => { env.I.state.gauge[i] = env.CONFIG.types[i].max; env.I.state.full[i] = true; };
/** 떠오르는 점수 글자(.float)를 만들 때마다 기록한다(몇 초 뒤 지워지므로 행동이 끝난 뒤에는 DOM 에 없을 수 있다) */
function recordFloats(env) {
  const out = [];
  const fx = env.I.el.fx;
  const orig = fx.appendChild.bind(fx);
  fx.appendChild = function (ch) { if (/\bfloat\b/.test(ch.className)) out.push({ cls: ch.className, text: ch.textContent, left: ch.style.left, top: ch.style.top }); return orig(ch); };
  return out;
}
/** 고정 보드에서 스왑 하나와 새 칸 종류를 찾는다(pred(sim, board, move)). 정산 뒤에도 유효한 수가 남는 것 */
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

/* ===================================================================
 * 4) 실제 판: 콤보 이어짐·끊김
 * =================================================================== */
test('실제 판: 스왑을 창 안에서 이어 두면 r=1,2,3 으로 배수가 오르고(점수는 §28.5 식과 같다), 연쇄 단계(step)는 콤보와 따로다', async () => {
  const env = createEnv(31);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  assert.strictEqual(I.state.combo, 0);
  assert.strictEqual(I.el['combo-chip'].hidden, true, '콤보 0 이면 칩이 없다');
  let total = 0;
  for (let k = 1; k <= 4; k++) {
    const before = I.state.score;
    const sc = await doSwap(env, 100 + k, (sim) => sim.events.length >= 1);
    assert.strictEqual(I.state.combo, k, 'r=' + k);
    const want = sim1(sc.sim.events, k, 'normal', false);
    assert.strictEqual(I.state.score - before, want, 'r=' + k + ' 점수');
    total += want;
    // 로그의 r 은 모든 그룹이 같고, step 은 1,2,3… 연쇄 그대로
    const lg = env.log.filter((e) => e.t === 'g' && e.act === env.log[env.log.length - 1].act);
    assert.deepStrictEqual(lg.map((e) => e.step), sc.sim.events.map((e) => e.step));
    lg.forEach((e) => assert.strictEqual(e.r, k, '한 행동의 모든 그룹은 같은 r'));
    assert.strictEqual(I.el['combo-chip'].hidden, k < 2, 'r=' + k + ' 칩 표시');
  }
  assert.strictEqual(I.state.score, total);
  assert.strictEqual(I.state.stats.maxCombo, 4);
  assert.strictEqual(I.el['combo-run'].textContent, '콤보 4');
  assert.strictEqual(I.el['combo-mult'].textContent, ' · ×2.2');
  assert.strictEqual(I.el['combo-max'].hidden, true);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

[['easy', 8], ['normal', 6], ['hard', 4]].forEach(([lv, win]) => {
  test('실제 판(' + lv + '): 창 ' + win + '초 — 창 안에서 두면 이어지고(창-1초), 넘기면 끊겨 다음 행동은 r=1 (칩 "콤보가 끊겼어요" 1초, 낭독)', async () => {
    const env = createEnv(40 + win);
    await startAndWait(env, lv, 1);
    const I = env.I;
    assert.strictEqual(I.CONFIG.score.comboWindow, win);
    await doSwap(env, 1, null);
    await doSwap(env, 2, null);
    assert.strictEqual(I.state.combo, 2);
    // 창 안(마지막 행동 뒤 약 0.4초 + (win - 1.4)초 = win - 1초 정도)에서 이어 둔다
    await env.runFor((win - 1.4) * 1000);
    assert.ok(I.state.comboIdle < win - 0.5 && I.state.comboIdle > win - 1.6, 'idle=' + I.state.comboIdle);
    assert.strictEqual(I.state.combo, 2, '아직 끊기지 않았다');
    await doSwap(env, 3, null);
    assert.strictEqual(I.state.combo, 3, '창 안이라 이어진다');
    // 창을 넘긴다: 끊김
    await env.runFor((win + 0.8) * 1000);
    assert.strictEqual(I.state.combo, 0, '창을 넘기면 콤보가 끊긴다');
    assert.strictEqual(I.el['combo-live'].textContent, '콤보가 끊겼어요', '낭독 영역에 한 번 알린다');
    assert.strictEqual(I.state.stats.maxCombo, 3);
    await doSwap(env, 4, null);
    assert.strictEqual(I.state.combo, 1, '끊긴 뒤 첫 행동은 r=1');
    assert.strictEqual(env.log.filter((e) => e.t === 'g').pop().r, 1);
    assert.strictEqual(I.state.stats.maxCombo, 3, '최고 콤보는 줄지 않는다');
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  });
});

test('실제 판: 콤보 시계는 일시정지·조준 중에 멈추고, 컷인 중(잠금)에도 안 흐르며, 물 스킬의 시간 정지 중에는 흐른다', async () => {
  const env = createEnv(50);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  const S = I.state;
  await doSwap(env, 1, null);
  await doSwap(env, 2, null);
  assert.strictEqual(S.combo, 2);
  // 일시정지: 10초가 지나도 시계가 멈춘다
  const idle0 = S.comboIdle;
  I.pauseGame();
  await env.runFor(10000);
  assert.strictEqual(S.comboIdle, idle0, '일시정지 중에는 흐르지 않는다');
  assert.strictEqual(S.combo, 2);
  I.resumeGame();
  // 조준 중: 불 스킬 조준을 켜 둔 채로 10초
  fillGauge(env, 0);
  I.onGauge(0);
  assert.strictEqual(S.aim, 0);
  const idle1 = S.comboIdle;
  await env.runFor(10000);
  assert.strictEqual(S.comboIdle, idle1, '조준 중에는 흐르지 않는다');
  assert.strictEqual(S.combo, 2, '조준이 길어도 콤보가 끊기지 않는다');
  I.cancelAim();
  await env.runFor(1000);
  assert.ok(S.comboIdle > idle1 + 0.5, '조준을 풀면 다시 흐른다');
  // 컷인 중: 물 스킬 컷인(잠금) 동안 comboIdle 이 늘지 않는다 — 점수가 안 나는 행동이라 r 도 그대로
  const before = S.comboIdle;
  fillGauge(env, 1);
  I.onGauge(1);
  assert.strictEqual(S.locked, true);
  await env.runFor(300);
  assert.strictEqual(S.cutinActive, true, '컷인 중');
  assert.strictEqual(S.comboIdle, before, '컷인 중에는 흐르지 않는다');
  await finishAction(env, 0);
  assert.strictEqual(S.combo, 2, '물 스킬은 콤보를 올리지도 끊지도 않는다');
  assert.strictEqual(S.comboIdle, before, '잠금(행동 중)에는 흐르지 않았다');
  assert.ok(S.freeze > 0, '시간 정지가 걸렸다');
  // 시간 정지(freeze) 중에도 손 사이의 간격은 흐른다
  await env.runFor(2000);
  assert.ok(S.freeze > 0 && S.freeze < env.CONFIG.skills.water.freeze, '아직 정지 중');
  assert.ok(S.comboIdle > before + 1.5, '시간 정지 중에도 흐른다: ' + S.comboIdle);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('실제 판: 무효 스왑은 콤보를 올리지도 끊지도 않고, 칸 변화 없는 물·어둠·빛도 마찬가지(시계는 계속 흐른다)', async () => {
  const env = createEnv(60);
  await startAndWait(env, 'normal', 1);
  const I = env.I;
  const S = I.state;
  await doSwap(env, 1, null);
  await doSwap(env, 2, null);
  assert.strictEqual(S.combo, 2);
  const score0 = S.score;
  const idle0 = S.comboIdle;
  I.trySwap(invalidMove(I.typeGrid()).a, invalidMove(I.typeGrid()).b);
  await finishAction(env, 0);
  assert.strictEqual(S.score, score0, '점수 없음');
  assert.strictEqual(S.combo, 2, '무효 스왑은 콤보를 올리지 않는다');
  assert.strictEqual(S.stats.maxCombo, 2);
  assert.ok(S.comboIdle >= idle0 && S.comboIdle <= idle0 + 0.4, '무효 스왑은 시계를 되돌리지 않는다(잠금 동안은 안 흐름): ' + idle0 + ' -> ' + S.comboIdle);
  await doSwap(env, 3, null);
  assert.strictEqual(S.combo, 3, '무효 스왑 뒤에도 이어진다');
  // 무효 스왑 뒤 창을 넘기면 끊긴 채로 있다(무효 스왑이 콤보를 되살리지 않는다)
  await env.runFor(7000);
  assert.strictEqual(S.combo, 0);
  I.trySwap(invalidMove(I.typeGrid()).a, invalidMove(I.typeGrid()).b);
  await finishAction(env, 0);
  assert.strictEqual(S.combo, 0, '끊긴 뒤 무효 스왑은 그대로 0');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

/* ===================================================================
 * 5) 실제 판: 스킬 점수 (연쇄·콤보 배수 없음)
 * =================================================================== */
/** removeCells 를 지운 뒤 연쇄가 이어지는(cascade=true) 또는 없는 시나리오. 정산 뒤에도 유효한 수가 남게 */
function planSkill(env, seed, cells, wantCascade) {
  for (let k = 0; k < 400; k++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed * 31 + k));
    const sim = replay(board, { startStep: 2, removeCells: cells, rng: mulberry(seed * 977 + k) });
    if (!G.hasValidMove(sim.final)) continue;
    if (wantCascade === true && sim.events.length < 1) continue;
    if (wantCascade === false && sim.events.length > 0) continue;
    return { board, sim };
  }
  throw new Error('스킬 시나리오를 찾지 못함');
}
const fireAround = (r, c) => { const out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (r + dr >= 0 && r + dr < 8 && c + dc >= 0 && c + dc < 8) out.push({ r: r + dr, c: c + dc }); return out; };
const crossAt = (r, c) => { const out = []; for (let k = 0; k < 8; k++) out.push({ r, c: k }); for (let k = 0; k < 8; k++) if (k !== r) out.push({ r: k, c }); return out; };

for (const [lv, comboPrime] of [['easy', 3], ['normal', 4], ['hard', 2]]) {
  test('스킬 점수(' + lv + '): 불은 칸당 점수 × 칸 수(연쇄·콤보 배수 없음, 난이도 배율만), 지운 뒤 연쇄는 콤보 r 을 이어 쓴다. 콤보 r=' + (comboPrime + 1), async () => {
    const env = createEnv(70 + comboPrime);
    await startAndWait(env, lv, 1);
    const I = env.I; const S = I.state;
    for (let k = 1; k <= comboPrime; k++) await doSwap(env, 10 + k, null);
    assert.strictEqual(S.combo, comboPrime);
    const cells = fireAround(3, 3);
    const sc = planSkill(env, 5, cells, true);
    const floats = recordFloats(env);
    applyBoard(env, sc.board);
    env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
    const score0 = S.score;
    const logN = env.log.length;
    fillGauge(env, 0);
    I.onGauge(0);
    I.handleTap(3, 3);
    await finishAction(env);
    assert.strictEqual(env.sandbox.__forced.length, 0);
    const skillPts = Math.round(9 * SPEC.pts[lv].fire * SPEC.mult[lv]);
    assert.strictEqual(S.stats.skillPts, skillPts, '스킬 점수는 배수 없이 9칸 × 칸당 점수');
    assert.strictEqual(S.combo, comboPrime + 1, '칸을 지우는 스킬은 행동이라 콤보를 올린다');
    const cascade = sim1(sc.sim.events, comboPrime + 1, lv, false);
    assert.strictEqual(S.score - score0, skillPts + cascade, '스킬 점수 + (콤보 r 을 이어 쓴) 뒤따른 연쇄');
    const sk = env.log.slice(logN).find((e) => e.t === 's');
    assert.deepStrictEqual({ kind: sk.kind, cells: sk.cells, r: sk.r, pts: sk.pts }, { kind: 'fire', cells: 9, r: comboPrime + 1, pts: skillPts });
    env.log.slice(logN).filter((e) => e.t === 'g').forEach((e) => assert.strictEqual(e.r, comboPrime + 1));
    // 큰 글자: 스킬 점수는 .float.big 으로 뜬다
    assert.ok(floats.some((f) => f.cls === 'float big' && f.text === '+' + skillPts.toLocaleString('ko-KR')), '큰 스킬 점수 글자');
    assert.ok(floats.filter((f) => f.cls === 'float').length === sc.sim.events.length, '일반 매치 점수 글자는 크게 만들지 않는다');
    assert.strictEqual(I.state.stats.skills, 1);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  });
}

test('스킬 점수: 풀(십자 15칸)·가장자리 불(4칸)·어둠 중 ×2 — 모두 칸당 점수 × 칸 수 × (어둠 2) × 난이도 배율', async () => {
  // 고수(×1.3): 풀 15칸 = 1,050 -> 1,365, 모서리 불 (0,0) 은 4칸 = 460 -> 598
  const env = createEnv(80);
  await startAndWait(env, 'hard', 1);
  const I = env.I; const S = I.state;
  await doSwap(env, 1, null);
  const grass = planSkill(env, 6, crossAt(3, 3), false);
  applyBoard(env, grass.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, grass.sim.forced);
  const s0 = S.score;
  fillGauge(env, 2);
  I.onGauge(2); I.handleTap(3, 3);
  await finishAction(env);
  assert.strictEqual(S.score - s0, 1365, '풀 십자 15칸 × 70 = 1,050 -> ×1.3');
  assert.strictEqual(S.stats.skillPts, 1365);
  assert.strictEqual(S.combo, 2);
  const corner = planSkill(env, 7, fireAround(0, 0), false);
  applyBoard(env, corner.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, corner.sim.forced);
  const s1 = S.score;
  fillGauge(env, 0);
  I.onGauge(0); I.handleTap(0, 0);
  await finishAction(env);
  assert.strictEqual(S.score - s1, Math.round(4 * 115 * 1.3), '모서리 불 4칸');
  assert.strictEqual(S.score - s1, 598);
  // 어둠 중 큰 스킬은 ×2(의도된 고수 전략)
  const dk = planSkill(env, 8, fireAround(4, 4), false);
  applyBoard(env, dk.board);
  env.sandbox.__forced.push.apply(env.sandbox.__forced, dk.sim.forced);
  S.dark = 5;
  const s2 = S.score;
  fillGauge(env, 0);
  I.onGauge(0); I.handleTap(4, 4);
  await finishAction(env);
  assert.strictEqual(S.score - s2, Math.round(9 * 115 * 2 * 1.3), '어둠 ×2 와 난이도 배율은 곱한다');
  assert.strictEqual(env.log.filter((e) => e.t === 's').pop().dark, true);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('스킬 점수: 번개는 같은 색 보석 최대 N개 × 칸당 점수(배수 없음)', async () => {
  const env = createEnv(81);
  await startAndWait(env, 'normal', 1);
  const I = env.I; const S = I.state;
  await doSwap(env, 1, null);
  await doSwap(env, 2, null);
  // 번개가 고를 색을 시험이 정한다: 첫 난수 0 -> present[0](보드를 위에서부터 훑어 처음 나온 색). 섞기에 0.999 를 주면 j = i 라 순서가 그대로다
  let pick = null;
  for (let seed = 4242; seed < 4400 && !pick; seed++) {
    const board = G.generateBoard(8, 8, 6, mulberry(seed));
    const color = board[0][0];
    const all = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === color) all.push({ r, c });
    const n = Math.min(all.length, I.CONFIG.skills.lightning.count);
    const targets = all.slice(0, n);
    const sim = replay(board, { startStep: 2, removeCells: targets, rng: mulberry(seed) });
    if (n >= 6 && G.hasValidMove(sim.final) && sim.events.length >= 1) pick = { board, all, n, sim };
  }
  assert.ok(pick, '시나리오');
  applyBoard(env, pick.board);
  const f = env.sandbox.__forced;
  f.push(0.0);
  for (let i = pick.all.length - 1; i > 0; i--) f.push(0.999);
  for (let t = 0; t < pick.n; t++) for (let k = 0; k < 7; k++) f.push(0.5);      // 선 그리기(boltSvg): 칸마다 난수 7개(시작 위치 1 + 꺾임 6)
  Array.prototype.push.apply(f, pick.sim.forced);
  const s0 = S.score;
  fillGauge(env, 3);
  I.onGauge(3);
  await finishAction(env);
  assert.strictEqual(f.length, 0, '난수가 모두 순서대로 쓰였다(재섞기 없음)');
  const sk = env.log.find((e) => e.t === 's' && e.kind === 'lightning');
  assert.strictEqual(sk.cells, pick.n);
  assert.strictEqual(sk.pts, pick.n * 95, '번개 = 칸당 95 × 칸 수(콤보 r=3 의 배수 없음)');
  assert.strictEqual(sk.r, 3);
  assert.strictEqual(S.score - s0, pick.n * 95 + sim1(pick.sim.events, 3, 'normal', false), '번개 점수 + 뒤따른 연쇄(콤보 r=3 을 이어 씀)');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('일시불(물·어둠·빛): 일시불 점수만 더하고(ctx.total 에 안 더함), 콤보·칭찬은 건드리지 않으며, 어둠 중이면 ×2. 어둠 자신의 일시불은 켜기 전 배수로 계산한다', async () => {
  for (const lv of ['easy', 'normal', 'hard']) {
    const env = createEnv(90);
    await startAndWait(env, lv, 1);
    const I = env.I; const S = I.state;
    await doSwap(env, 1, null);
    await doSwap(env, 2, null);
    const bonus = Math.round(SPEC.pts[lv].bonus * SPEC.mult[lv]);
    const floats = recordFloats(env);
    const popup0 = I.el.popup.textContent + '|' + I.el.popup.className;
    // 물
    let s0 = S.score, c0 = S.combo, idle0 = S.comboIdle;
    fillGauge(env, 1); I.onGauge(1);
    await finishAction(env, 0);
    assert.strictEqual(S.score - s0, bonus, lv + ' 물 일시불');
    assert.strictEqual(S.combo, c0);
    assert.strictEqual(S.comboIdle, idle0, '일시불은 콤보 시계를 되돌리지 않는다');
    assert.strictEqual(S.stats.skillPts, bonus);
    assert.strictEqual(I.el.popup.textContent + '|' + I.el.popup.className, popup0, '칭찬이 뜨지 않는다(팝업 그대로)');
    // 빛
    s0 = S.score;
    fillGauge(env, 5); I.onGauge(5);
    await finishAction(env, 0);
    assert.strictEqual(S.score - s0, bonus, lv + ' 빛 일시불');
    // 어둠: 켜기 전에는 ×1, 이미 켜진 어둠 안에서 다시 쓰면 ×2
    assert.strictEqual(S.dark, 0);
    s0 = S.score;
    fillGauge(env, 4); I.onGauge(4);
    await finishAction(env, 0);
    assert.strictEqual(S.score - s0, bonus, lv + ' 어둠 자신의 일시불은 새 어둠을 켜기 전의 배수(×1)');
    assert.ok(S.dark > 0, '어둠이 켜졌다');
    s0 = S.score;
    fillGauge(env, 1); I.onGauge(1);               // 어둠 중 물 -> ×2
    await finishAction(env, 0);
    assert.strictEqual(S.score - s0, Math.round(SPEC.pts[lv].bonus * 2 * SPEC.mult[lv]), lv + ' 어둠 중 일시불 ×2');
    s0 = S.score;
    fillGauge(env, 4); I.onGauge(4);               // 이미 켜진 어둠에서 어둠 재발동 -> ×2
    await finishAction(env, 0);
    assert.strictEqual(S.score - s0, Math.round(SPEC.pts[lv].bonus * 2 * SPEC.mult[lv]), lv + ' 어둠 재발동은 켜진 어둠 배수 ×2');
    // 큰 글자는 보드 가운데
    const big = floats.filter((f) => f.cls === 'float big');
    assert.strictEqual(big.length, 5, '일시불마다 큰 글자 하나');
    big.forEach((f) => { assert.strictEqual(f.left, '50%'); assert.strictEqual(f.top, '50%'); });
    assert.strictEqual(big[0].text, '+' + bonus.toLocaleString('ko-KR'));
    assert.strictEqual(S.combo, 2, '일시불 스킬은 콤보를 올리지도 끊지도 않는다');
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('⑥ 콤보는 step·ctx.maxStep·미션 카운트를 바꾸지 않는다(미션·칭찬 보호): 콤보 r 이 달라도 같은 행동의 연쇄 표시·칭찬·미션 증가분이 같다', async () => {
  const sc = findSwapScenario((sim) => sim.maxStep === 3);
  async function runWith(prime) {
    const env = createEnv(100, (cfg) => {
      cfg.stages.goalType.normal = 'mission';
      cfg.stages.missionMaxChips = 3;          // 시험 도구: 동시 칩 3개짜리 정의를 쓰려고 상한을 푼다(M2 의 P1 상한은 기본 2)
      cfg.stages.missions.normal = [{ parts: [{ k: 'collect', color: 2, need: 9999 }, { k: 'big', min: 4, need: 99 }, { k: 'chain', min: 2, need: 99 }] }];
    });
    await startAndWait(env, 'normal', 1);
    for (let k = 0; k < prime; k++) await doSwap(env, 20 + k, null);
    const m = env.I.state.mission;
    const base = Array.from(m.parts, (p) => p.n);
    applyBoard(env, sc.board);                         // 같은 보드·같은 수·같은 새 칸 종류
    env.sandbox.__forced.push.apply(env.sandbox.__forced, sc.sim.forced);
    const s0 = env.I.state.score;
    const logN = env.log.length;
    env.I.trySwap(sc.move.a, sc.move.b);
    await finishAction(env);
    assert.strictEqual(env.sandbox.__forced.length, 0);
    const res = { delta: Array.from(m.parts, (p, i) => p.n - base[i]), chainText: env.I.el.chain.textContent, multText: env.I.el.mult.textContent, popup: env.I.el.popup.textContent, r: env.I.state.combo, score: env.I.state.score - s0,
      steps: env.log.slice(logN).filter((e) => e.t === 'g').map((e) => e.step), sizes: env.log.slice(logN).filter((e) => e.t === 'g').map((e) => e.size), errors: env.errors.length };
    env.dispose();
    return res;
  }
  const a = await runWith(0);
  const b = await runWith(4);
  assert.strictEqual(a.r, 1); assert.strictEqual(b.r, 5);
  assert.deepStrictEqual(a.delta, b.delta, '미션 카운트 증가분은 콤보와 무관');
  assert.strictEqual(a.delta[2], 1, 'CHAIN 미션은 행동당 1번');
  assert.strictEqual(a.chainText, 'CHAIN 3'); assert.strictEqual(b.chainText, 'CHAIN 3', '연쇄 표시(step)는 콤보가 바꾸지 않는다');
  assert.strictEqual(a.multText, 'x3'); assert.strictEqual(b.multText, 'x3', '배율 표시도 연쇄 배수 그대로');
  assert.strictEqual(a.popup, 'GREAT!'); assert.strictEqual(b.popup, 'GREAT!', '칭찬은 step 으로만 정해진다(maxStep 3)');
  assert.deepStrictEqual(a.steps, b.steps);
  assert.deepStrictEqual(a.steps, sc.sim.events.map((e) => e.step));
  assert.deepStrictEqual(a.sizes, b.sizes);
  assert.strictEqual(a.score, sim1(sc.sim.events, 1, 'normal', false));
  assert.strictEqual(b.score, sim1(sc.sim.events, 5, 'normal', false));
  assert.ok(b.score > a.score, '점수는 콤보 때문에 커진다');
  assert.strictEqual(a.errors + b.errors, 0);
});

/* ===================================================================
 * 6) 독립 재계산: 스크립트 플레이의 사건 로그를 spec 식으로 따로 합산한다
 * =================================================================== */
test('⑦ 독립 재계산: 난이도 3종 × 시드 6 스크립트 플레이 — 사건별 점수·합계·skillPts·최고 콤보·콤보 r 이 spec 식과 같다. 한 그룹은 이론 상한(기본 × 16 × 2 × 배율) 이하', async () => {
  const summary = { games: 0, actions: 0, events: 0, skill: 0, bonus: 0, broke: 0, maxR: 0, maxGroup: 0 };
  for (const lv of ['easy', 'normal', 'hard']) {
    const win = SPEC.win[lv];
    for (let seed = 1; seed <= 6; seed++) {
      const env = createEnv(500 + seed * 17 + win, (cfg) => { cfg.stages.targets[lv] = cfg.stages.targets[lv].map((v) => v * 1000); });   // 판이 중간에 끝나지 않게
      await startAndWait(env, lv, 1 + (seed % 10));
      const I = env.I; const S = I.state;
      const drng = mulberry(seed * 4099 + win);
      // 시험 쪽 모델: 마지막으로 점수가 난 행동 뒤 입력 없이 흐른 시간(잠금 시간은 제외)과 기대 r
      let modelR = 0, idle = 0, expectMaxR = 0;
      for (let k = 0; k < 34 && S.phase === 'playing'; k++) {
        // 창 가까이(±0.6초)에서는 시계 눈금(0.15초) 때문에 경계가 흐려지므로 확실히 넘기거나 일찍 둔다
        if (idle >= win - 0.6 && idle <= win + 0.6) { const w = win + 1.2 - idle; await env.runFor(w * 1000); idle += w; }
        if (k % 8 === 5 && drng() < 0.7) { const w = win + 1.5; await env.runFor(w * 1000); idle += w; }   // 가끔 일부러 끊는다
        if (k % 7 === 3) { const gi = Math.floor(drng() * 6); fillGauge(env, gi); }
        const full = S.gauge.map((v, i) => (v >= I.CONFIG.types[i].max ? i : -1)).filter((i) => i >= 0);
        const logBefore = env.log.length;
        let scored = false;
        const x = drng();
        if (full.length && x < 0.5) {
          const gi = full[Math.floor(drng() * full.length)];
          I.onGauge(gi);
          if (S.aim !== null) I.handleTap(Math.floor(drng() * 8), Math.floor(drng() * 8));
        } else if (x < 0.58) {
          const m = invalidMove(I.typeGrid());
          I.trySwap(m.a, m.b);
        } else {
          const mv = G.listMoves(I.typeGrid());
          const mm = mv[Math.floor(drng() * mv.length)];
          I.trySwap(mm.a, mm.b);
        }
        await env.runUntil(() => !S.locked || S.phase !== 'playing', 200000);
        const evs = env.log.slice(logBefore);
        scored = evs.some((e) => e.t === 'g' || e.t === 's');
        if (scored) {
          modelR = (modelR > 0 && idle <= win) ? modelR + 1 : 1;
          idle = 0;
          expectMaxR = Math.max(expectMaxR, modelR);
          evs.filter((e) => e.t === 'g' || e.t === 's').forEach((e) => assert.strictEqual(e.r, modelR, lv + ' seed ' + seed + ' 행동 ' + k + ' r (idle 모델)'));
        } else if (idle > win) { modelR = 0; }
        await env.runFor(400);
        idle += 0.4;
        summary.actions++;
      }
      // 사건별 점수 = spec 식, 합계 = state.score
      let sum = 0, skillSum = 0, maxR = 0;
      env.log.forEach((e) => {
        let want;
        if (e.t === 'g') {
          want = specGroupPts(lv, e);
          assert.ok(e.pts <= Math.round(specBase(e.size) * 16 * 2 * SPEC.mult[lv]) + 1, '한 그룹은 이론 상한 이하');
          summary.events++; summary.maxGroup = Math.max(summary.maxGroup, e.size);
          maxR = Math.max(maxR, e.r);
        } else if (e.t === 's') { want = specSkillPts(lv, e); skillSum += e.pts; summary.skill++; maxR = Math.max(maxR, e.r); }
        else { want = specBonusPts(lv, e); skillSum += e.pts; summary.bonus++; }
        assert.strictEqual(e.pts, want, lv + ' seed ' + seed + ' 사건 ' + JSON.stringify(e));
        sum += want;
      });
      assert.strictEqual(S.score, sum, lv + ' seed ' + seed + ' 합계');
      assert.strictEqual(S.stats.skillPts, skillSum, 'skillPts 통계');
      assert.strictEqual(S.stats.maxCombo, maxR, '최고 콤보');
      assert.strictEqual(maxR, expectMaxR, '독립 모델의 최고 콤보');
      summary.maxR = Math.max(summary.maxR, maxR);
      summary.games++;
      assert.deepStrictEqual(env.errors, []);
      env.dispose();
    }
  }
  assert.ok(summary.games === 18 && summary.actions > 300 && summary.events > 300 && summary.skill >= 15 && summary.bonus >= 8, JSON.stringify(summary));
  assert.ok(summary.maxR >= 6, '최대 배수(r ≥ 6)까지 올라가는 판이 있다: ' + JSON.stringify(summary));
});

test('안전선: 한 그룹 점수 ≤ 기본 × 16 × 2 × 난이도 배율 — 연쇄 상한 8 × 콤보 최대 3 = 24 도 16 으로 잘린다', () => {
  const lv = 'hard';
  let worst = 0;
  for (let size = 3; size <= 12; size++) {
    for (let step = 1; step <= 14; step++) for (let r = 0; r <= 60; r++) {
      const pts = Math.round(G.baseScore(size) * G.waveMult(step, r) * 2 * SPEC.mult[lv]);
      assert.ok(pts <= Math.round(G.baseScore(size) * 16 * 2 * SPEC.mult[lv]), 'size ' + size + ' step ' + step + ' r ' + r);
      worst = Math.max(worst, pts);
    }
  }
  assert.strictEqual(worst, Math.round(G.baseScore(12) * 16 * 2 * 1.3));       // 12개(900점) × 16 × 2 × 1.3 = 37,440
  assert.strictEqual(worst, 37440);
});

/* ===================================================================
 * 7) HUD 콤보 칩·결과 줄
 * =================================================================== */
test('HUD 콤보 칩: r ≥ 2 에서만 보이고 "콤보 N · ×M" (최대 배수면 "(최대!)" 병기), 바뀔 때마다 낭독하지 않고 5의 배수에만 알린다', async () => {
  const env = createEnv(110);
  await startAndWait(env, 'normal', 1);
  const I = env.I; const S = I.state;
  const MAX_TEXT = ' (최대!)';                     // #combo-max 의 글자는 index.html 에 있다(하네스의 가짜 요소에는 없으므로 보이는지(hidden)만 본다)
  const chipText = () => I.el['combo-run'].textContent + I.el['combo-mult'].textContent + (I.el['combo-max'].hidden ? '' : MAX_TEXT);
  assert.strictEqual(I.el['combo-chip'].hidden, true);
  assert.strictEqual(I.el['combo-chip'].getAttribute('aria-hidden'), null, '(마크업의 aria-hidden 은 index.html 이 가진다)');
  assert.strictEqual(I.el['combo-live'].textContent, '');
  const seen = {};
  for (let k = 1; k <= 11; k++) {
    await doSwap(env, 200 + k, null, 150);
    if (k >= 2) { assert.strictEqual(I.el['combo-chip'].hidden, false, 'r=' + k); seen[k] = chipText(); }
    else assert.strictEqual(I.el['combo-chip'].hidden, true, 'r=1 은 숨김');
    const live = I.el['combo-live'].textContent;
    if (k < 5) assert.strictEqual(live, '', 'r=' + k + ' 은 낭독 영역을 쓰지 않는다');
    else if (k < 10) assert.strictEqual(live, '콤보 5', 'r=' + k + ' 은 5의 배수가 아니라 그대로');
    else assert.ok(/^콤보 10\.?$/.test(live), 'r=10');
    S.comboIdle = 0;
  }
  assert.deepStrictEqual([seen[2], seen[3], seen[4], seen[5], seen[6], seen[7], seen[11]],
    ['콤보 2 · ×1.4', '콤보 3 · ×1.8', '콤보 4 · ×2.2', '콤보 5 · ×2.6', '콤보 6 · ×3.0 (최대!)', '콤보 7 · ×3.0 (최대!)', '콤보 11 · ×3.0 (최대!)']);
  assert.ok(/\bmax\b/.test(I.el['combo-chip'].className), '최대 배수 표시 클래스');
  assert.strictEqual(S.stats.maxCombo, 11);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('HUD 콤보 칩: 끊기면 "콤보가 끊겼어요" 1초 뒤 사라지고, r=1 에서 끊기면 알림이 없다. 판이 끝나면 칩은 숨는다', async () => {
  const env = createEnv(111);
  await startAndWait(env, 'normal', 1);
  const I = env.I; const S = I.state;
  S.combo = 4; S.comboIdle = 5.8;
  await env.runFor(600);
  assert.strictEqual(S.combo, 0);
  assert.strictEqual(I.el['combo-chip'].hidden, false);
  assert.strictEqual(I.el['combo-run'].textContent, '콤보가 끊겼어요');
  assert.strictEqual(I.el['combo-mult'].hidden, true); assert.strictEqual(I.el['combo-max'].hidden, true);
  assert.ok(/\bbrk\b/.test(I.el['combo-chip'].className));
  assert.strictEqual(I.el['combo-live'].textContent, '콤보가 끊겼어요');
  await env.runFor(1200);
  assert.strictEqual(I.el['combo-chip'].hidden, true, '1초 뒤 사라진다');
  // r=1 에서 끊기는 것은 알리지 않는다
  I.el['combo-live'].textContent = '';
  S.combo = 1; S.comboIdle = 5.9;
  await env.runFor(600);
  assert.strictEqual(S.combo, 0);
  assert.strictEqual(I.el['combo-chip'].hidden, true);
  assert.strictEqual(I.el['combo-live'].textContent, '');
  // 판이 끝나면 칩은 숨는다(결과 화면 뒤에 남지 않는다)
  S.combo = 8; S.comboIdle = 0;
  await env.runFor(300);
  assert.strictEqual(I.el['combo-chip'].hidden, false);
  I.finishStage();
  I.updateHUD(0.1);
  assert.strictEqual(I.el['combo-chip'].hidden, true);
  // 다시 시작하면 콤보·칩·낭독이 초기화된다
  await startAndWait(env, 'normal', 1);
  assert.strictEqual(S.combo, 0); assert.strictEqual(S.comboIdle, 0); assert.strictEqual(S.comboBreak, 0);
  assert.strictEqual(S.stats.maxCombo, 0); assert.strictEqual(S.stats.skillPts, 0);
  assert.strictEqual(I.el['combo-chip'].hidden, true); assert.strictEqual(I.el['combo-live'].textContent, '');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('HUD 콤보 칩: 남은 이어짐 시간 막대는 2% 단위로만 바뀌고, 값이 그대로면 DOM 을 쓰지 않으며, prefers-reduced-motion 이면 그리지 않는다', async () => {
  const env = createEnv(112, null, { reduce: false });
  await startAndWait(env, 'easy', 1);
  const I = env.I; const S = I.state;
  const writes = { bar: 0, run: 0, mult: 0 };
  const watch = (el, key, name) => { let v = el[key]; Object.defineProperty(el, key, { get() { return v; }, set(x) { writes[name]++; v = x; } }); };
  S.combo = 3; S.comboIdle = 0;
  await env.runFor(300);
  watch(I.el['combo-bar'].style, 'transform', 'bar'); watch(I.el['combo-run'], 'textContent', 'run'); watch(I.el['combo-mult'], 'textContent', 'mult');
  const vals = [];
  for (let i = 0; i < 30; i++) {
    await env.runFor(150);
    const m = /^scaleX\(([0-9.]+)\)$/.exec(I.el['combo-bar'].style.transform || '');
    assert.ok(m, '막대 값: ' + I.el['combo-bar'].style.transform);
    const q = Number(m[1]);
    assert.ok(Math.abs(q * 50 - Math.round(q * 50)) < 1e-6, '2% 단위: ' + q);
    vals.push(q);
  }
  assert.ok(vals[vals.length - 1] < vals[0] && vals[0] <= 1, '창에서 줄어든다');
  assert.ok(Math.abs(vals[vals.length - 1] - (1 - S.comboIdle / 8)) <= 0.011, '남은 비율(1 − idle ÷ 창)');
  assert.ok(writes.bar <= vals.length && writes.run === 0 && writes.mult === 0, '콤보 숫자는 바뀌지 않았으니 쓰지 않는다: ' + JSON.stringify(writes));
  // 조준 중에는 시계가 멈춘다 -> 막대·글자 모두 DOM 쓰기 0
  fillGauge(env, 0);
  I.onGauge(0);
  const w0 = writes.bar;
  for (let i = 0; i < 20; i++) await env.runFor(150);
  assert.strictEqual(writes.bar, w0, '값이 그대로면 막대를 다시 쓰지 않는다');
  assert.strictEqual(writes.run + writes.mult, 0);
  env.dispose();
  const red = createEnv(113);                       // 기본 = 감소 모션
  await startAndWait(red, 'easy', 1);
  red.I.state.combo = 3; red.I.state.comboIdle = 0;
  await red.runFor(1500);
  assert.strictEqual(red.I.el['combo-chip'].hidden, false, '숫자는 보인다');
  assert.strictEqual(red.I.el['combo-bar'].style.transform, undefined, '막대(애니메이션)는 쓰지 않는다');
  assert.ok(!/\bpop\b/.test(red.I.el['combo-chip'].className));
  red.dispose();
});

test('결과 줄: 판이 끝나면 "최고 콤보 N · 스킬 점수 +X"(천 단위 쉼표)를 end-best 줄 아래에 채운다. 저장 구조에는 새 통계 키가 없다', async () => {
  const env = createEnv(120);
  await startAndWait(env, 'normal', 1);
  const I = env.I; const S = I.state;
  S.stats.maxCombo = 12; S.stats.skillPts = 12345;
  S.score = 100;
  I.finishStage();
  assert.strictEqual(I.el['end-combo'].textContent, '최고 콤보 12 · 스킬 점수 +12,345');
  assert.deepStrictEqual(Object.keys(I.save).sort(), Object.keys(G.defaultSave()).sort(), '저장 객체의 키는 defaultSave 와 같다(통계 키 없음)');
  assert.strictEqual(I.save.scoreRule, 2);
  assert.ok(!/maxCombo|skillPts/.test(env.store['element-gems:v1']), '저장 문자열에도 없다');
  env.dispose();
});

/* ===================================================================
 * 8) 정적 점검: index.html 마크업·style.css 블록·소스 규칙
 * =================================================================== */
test('index.html: 콤보 칩(aria-hidden, 기본 hidden)·보이지 않는 낭독 영역(role=status, polite)·도움말 한 줄·결과 줄이 있고 div 여닫음이 맞는다', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<div class="hud-mid">\s*<div class="chain-box" id="chain">CHAIN<\/div>/);
  assert.match(html, /<div class="combo-chip" id="combo-chip" aria-hidden="true" hidden>/);
  assert.match(html, /<p class="c-live" id="combo-live" role="status" aria-live="polite"><\/p>/);
  ['combo-run', 'combo-mult', 'combo-max', 'combo-bar'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  assert.ok(html.includes('<span id="combo-max" hidden> (최대!)</span>'), '최대 배수 병기 글자');
  assert.ok(html.includes('<li><b>콤보</b> 쉬지 않고 계속 맞추면 콤보! 점수 배수가 올라가요(최대 ×3).</li>'));
  assert.ok(/<p class="muted" id="end-combo">최고 콤보 0 · 스킬 점수 \+0<\/p>/.test(html));
  assert.ok(html.indexOf('id="end-best"') < html.indexOf('id="end-combo"') && html.indexOf('id="end-combo"') < html.indexOf('id="end-chain"'));
  // 쉬운 말: 연상 표현 없음
  const added = html.match(/콤보[^<]*/g).join(' ');
  assert.ok(!/팡|피버|폭탄/.test(added), added);
  const opens = (html.match(/<div\b/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  assert.strictEqual(opens, closes, 'div 여닫음');
});

test('style.css: 콤보 칩 블록이 미션 HUD 블록 뒤에 하나 있고(:root·--board 를 건드리지 않음), 감소 모션을 존중하며, 두 앱 style.css 가 같다', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const marker = ' * 콤보 칩 (spec §28)';
  const idx = css.lastIndexOf('/*', css.indexOf(marker));
  assert.ok(css.indexOf(marker) > 0 && css.indexOf(marker, css.indexOf(marker) + 1) === -1, '블록 하나');
  const block = css.slice(idx);
  assert.ok(block.length > 1500 && block.indexOf('미션 HUD (spec §27)') === -1, '콤보 블록이 미션 HUD 블록 뒤에 있다');
  assert.ok(!/^\s*:root/m.test(block), ':root 를 건드리지 않는다');
  assert.ok(!/--board\s*:|--ui-h\s*:|--cell\s*:/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), '보드 크기식을 건드리지 않는다');
  assert.ok(/@media screen and \(prefers-reduced-motion: reduce\)/.test(block), '감소 모션(기존 와이드 시험이 마지막 감소 모션 쿼리를 읽으므로 "screen and" 형식)');
  assert.ok(!/@media \(prefers-reduced-motion: reduce\)/.test(block));
  ['.hud-mid', '.combo-chip', '.cc-bar', '.c-live', '.float.big'].forEach((sel) => assert.ok(block.includes(sel), sel));
  assert.ok(/font-size: max\(11px, \.7rem\)/.test(block), '칩 글자 11px 이상');
  const edu = fs.readFileSync(path.join(root, '..', 'element-gems-edu', 'style.css'), 'utf8');
  assert.strictEqual(edu, css, '두 앱 style.css 일치');
});

test('game.js 소스: 점수 식이 CONFIG 한 곳에서 오고(옛 skillCell 은 안 쓴다), 콤보는 step 인자·ctx.maxStep 을 건드리지 않는다', () => {
  const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/CONFIG\.score\.skillCell/.test(code), 'skillCell 은 호환 키로만 남는다');
  assert.ok(/baseScore\(g\.size\) \* waveMult\(step, state\.combo\) \* darkMult\(\)/.test(code));
  assert.ok(/skillPoints\(kind, live\.length\) \* darkMult\(\)/.test(code));
  assert.ok(/skillPoints\(kind, 0\) \* darkMult\(\)/.test(code));
  assert.ok(/ctx\.maxStep = Math\.max\(ctx\.maxStep, step\)/.test(code), 'maxStep 은 step 에서만');
  code.split('\n').filter((l) => /maxStep\s*=|setChain\(/.test(l)).forEach((l) => assert.ok(!/combo/i.test(l), 'maxStep·setChain 계산에 콤보가 끼지 않는다: ' + l.trim()));
  assert.ok(code.split('\n').filter((l) => /maxStep\s*=|setChain\(/.test(l)).length >= 3);
  // 서버·랭킹으로 가는 별 계산은 그대로
  assert.ok(/const stars = cleared \? starsFor\(left, state\.startTime\) : 0;/.test(code));
  assert.ok(/const left = cleared \? leftFromTime\(state\.timeLeft\) : 0;/.test(code));
});
