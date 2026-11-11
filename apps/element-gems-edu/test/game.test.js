/* game.js 순수 로직 회귀 + 저장 확장(spec §19.2.4) 시험. 실행: node --test apps/element-gems/test/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const G = require(path.join(__dirname, '..', 'game.js'));

const N = 10;
function stages(entries) {
  const arr = [];
  for (let i = 0; i < N; i++) arr.push(entries[i] || { best: 0, stars: 0 });
  return arr;
}

test('기존 순수 로직 회귀: 3연속·2×2·빈 보드', () => {
  const g = [
    [0, 0, 0, 1],
    [2, 3, 3, 4],
    [5, 3, 3, 4],
    [1, 2, 4, 5]
  ];
  const groups = G.findMatches(g);
  const sizes = groups.map((x) => x.size).sort();
  assert.deepStrictEqual(sizes, [3, 4]);               // 가로 3연속 1개 + 2×2 정사각형 1개
  assert.strictEqual(G.squareAt(g, 1, 1), true);
  assert.strictEqual(G.squareAt(g, 0, 0), false);
  assert.strictEqual(G.lineAt(g, 0, 1), true);
  assert.strictEqual(G.hasValidMove([[0, 1], [1, 0]]), false);
});

test('기존 순수 로직 회귀: 힌트·유효 수·보드 생성', () => {
  const rng = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
  for (let k = 0; k < 20; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    assert.strictEqual(G.findMatches(g).length, 0);
    assert.ok(G.hasValidMove(g));
    const h = G.findHint(g, rng);
    assert.ok(h && G.listMoves(g).length > 0);
  }
});

test('기존 규칙 회귀: 점수·게이지·시간 표기·목표 표', () => {
  assert.strictEqual(G.baseScore(3), 50);
  assert.strictEqual(G.baseScore(4), 100);
  assert.strictEqual(G.baseScore(5), 200);
  assert.strictEqual(G.baseScore(7), 400);
  assert.strictEqual(G.gaugeGain(3), 3);
  assert.strictEqual(G.gaugeGain(5), 7);
  assert.strictEqual(G.fmtTime(120), '2:00');
  assert.strictEqual(G.fmtTime(61), '1:01');
  assert.strictEqual(G.fmtTime(59.2), '1:00');
  assert.strictEqual(G.fmtTime(59), '59');
  assert.strictEqual(G.fmtDur(130), '2분 10초');
  // [EDU] 교육용 목표 점수 = 일반용 목표 × 1.2 (100점 반올림): 일반용 §28.7.5 근사 표 값 14900 -> 17900, 31700 -> 38000 (spec §21.8.4, 옛 §25.6 값 4500 -> 5400, 9900 -> 11900)
  assert.strictEqual(G.stageTarget('normal', 1), 17900);
  assert.strictEqual(G.stageTarget('hard', 10), 38000);
  assert.strictEqual(G.stageTarget('easy', 11), 0);
  assert.deepStrictEqual(G.CONFIG.stages.targets.easy.length, 10);
  assert.strictEqual(G.stageUnlocked(0, 1), true);
  assert.strictEqual(G.stageUnlocked(0, 2), false);
  assert.strictEqual(G.stageUnlocked(9, 10), true);
});

test('starsFor: 임계값(초보 39/65, 중수 36/60, 고수 15/30 — 고수는 spec §44)이 정수 초이고 내림해도 결과가 같다', () => {
  const cases = { easy: [130, 39, 65], normal: [120, 36, 60], hard: [100, 15, 30] };
  Object.keys(cases).forEach((k) => {
    const [start, two, three] = cases[k];
    assert.strictEqual(G.CONFIG.difficulty[k].time.start, start);
    assert.strictEqual(G.starsFor(three, start, k), 3);
    assert.strictEqual(G.starsFor(three - 1, start, k), 2);
    assert.strictEqual(G.starsFor(two, start, k), 2);
    assert.strictEqual(G.starsFor(two - 1, start, k), 1);
    // 0.1초 단위 전수: 내림한 정수 left 로 계산한 별이 소수 시간으로 계산한 별과 같다
    for (let t = 0; t <= start + 20; t += 0.1) {
      assert.strictEqual(G.starsFor(G.leftFromTime(t), start, k), G.starsFor(t, start, k), k + ' t=' + t.toFixed(1));
    }
    assert.strictEqual(G.leftFloorForStars(k, 3), three);
    assert.strictEqual(G.leftFloorForStars(k, 2), two);
    assert.strictEqual(G.leftFloorForStars(k, 1), 0);
  });
});

/* ---- spec §44(2026-11-11): 고수만 별 기준을 낮춘다(★★ 15% · ★★★ 30%). 초보·중수는 그대로(★★ 30% · ★★★ 50%) ---- */
test('§44 starsFor: 고수 정수 임계값 경계 14→★ · 15→★★ · 29→★★ · 30→★★★, 초보(39/65)·중수(36/60)는 그대로', () => {
  const at = (k, left) => G.starsFor(left, G.CONFIG.difficulty[k].time.start, k);
  assert.deepStrictEqual([14, 15, 29, 30, 31].map((l) => at('hard', l)), [1, 2, 2, 3, 3]);
  assert.deepStrictEqual([38, 39, 64, 65].map((l) => at('easy', l)), [1, 2, 2, 3]);
  assert.deepStrictEqual([35, 36, 59, 60].map((l) => at('normal', l)), [1, 2, 2, 3]);
  assert.deepStrictEqual(G.CONFIG.stages.star, [0.3, 0.5], '기본 star 는 그대로');
  assert.deepStrictEqual(G.CONFIG.stages.starBy, { hard: [0.15, 0.3] });
  assert.deepStrictEqual(G.starRatioOf('hard'), [0.15, 0.3]);
  assert.deepStrictEqual(G.starRatioOf('easy'), [0.3, 0.5]);
  assert.deepStrictEqual(G.starRatioOf('normal'), [0.3, 0.5]);
  assert.strictEqual(at('hard', 35), 3, '옛 기준에서 ★★이던 고수 left 35 는 ★★★');
  assert.strictEqual(at('hard', 50), 3, '옛 기준에서 ★★★이던 고수 left 50 은 그대로 ★★★');
});

test('§44 starsFor: diff 를 생략하면 기본 비율(0.3/0.5)을 쓴다 (기존 호출 호환), 모르는 난이도도 기본', () => {
  assert.deepStrictEqual([29, 30, 49, 50].map((l) => G.starsFor(l, 100)), [1, 2, 2, 3]);
  assert.deepStrictEqual([29, 30, 49, 50].map((l) => G.starsFor(l, 100, undefined)), [1, 2, 2, 3]);
  assert.deepStrictEqual([29, 30, 49, 50].map((l) => G.starsFor(l, 100, 'zzz')), [1, 2, 2, 3]);
  assert.deepStrictEqual([29, 30, 49, 50].map((l) => G.starsFor(l, 100, '__proto__')), [1, 2, 2, 3]);
  assert.deepStrictEqual([14, 15, 29, 30].map((l) => G.starsFor(l, 100, 'hard')), [1, 2, 2, 3]);
});

test('§44 starBy 가 없거나 모양이 틀리면 기본 star 로 폴백한다 (starRatioOf·starsFor·leftFloorForStars)', () => {
  const st = G.CONFIG.stages;
  const saved = st.starBy;
  try {
    const bads = [undefined, null, {}, { hard: null }, { hard: [0.15] }, { hard: [0.15, 0.3, 0.5] }, { hard: '0.15,0.3' }, { hard: [0, 0.3] }, { hard: [0.3, 0.15] },
      { hard: [0.3, 0.3] }, { hard: [0.15, 1.5] }, { hard: ['0.15', '0.3'] }, { hard: [NaN, 0.3] }, { hard: [-0.1, 0.3] }, { hard: { 0: 0.15, 1: 0.3, length: 2 } }];
    for (const bad of bads) {
      st.starBy = bad;
      const tag = JSON.stringify(bad);
      assert.deepStrictEqual(G.starRatioOf('hard'), [0.3, 0.5], tag);
      assert.strictEqual(G.starsFor(30, 100, 'hard'), 2, tag);
      assert.strictEqual(G.starsFor(29, 100, 'hard'), 1, tag);
      assert.strictEqual(G.starsFor(50, 100, 'hard'), 3, tag);
      assert.strictEqual(G.leftFloorForStars('hard', 3), 50, tag);
      assert.strictEqual(G.leftFloorForStars('hard', 2), 30, tag);
    }
    st.starBy = { hard: [0.15, 1] };                 // 0 < [0] < [1] <= 1 이면 유효
    assert.deepStrictEqual(G.starRatioOf('hard'), [0.15, 1]);
    assert.strictEqual(G.starsFor(100, 100, 'hard'), 3);
    assert.strictEqual(G.starsFor(99, 100, 'hard'), 2);
  } finally {
    st.starBy = saved;
  }
  assert.deepStrictEqual(G.starRatioOf('hard'), [0.15, 0.3], '시험 뒤 원래 값으로 돌아왔다');
});

function loadedStage(diff, stars, left) {
  const sv = G.defaultSave();
  sv.stages[diff][0] = { best: 1000, stars: stars, left: left };
  const e = G.parseSave(JSON.stringify(sv)).stages[diff][0];
  return { stars: e.stars, left: e.left };
}

test('§44 저장 불러오기 별 올림: 기준이 낮아져도 left 는 그대로이고 별은 올라가기만 한다', () => {
  assert.deepStrictEqual(loadedStage('hard', 2, 35), { stars: 3, left: 35 }, '고수 left 35 ★★ -> ★★★');
  assert.deepStrictEqual(loadedStage('hard', 3, 55), { stars: 3, left: 55 }, '고수 left 55 ★★★ 은 그대로');
  assert.deepStrictEqual(loadedStage('normal', 2, 40), { stars: 2, left: 40 }, '중수 left 40 ★★ 은 그대로(★★★ 은 60초 필요)');
  assert.deepStrictEqual(loadedStage('easy', 2, 50), { stars: 2, left: 50 }, '초보 left 50 ★★ 은 그대로(★★★ 은 65초 필요)');
  assert.deepStrictEqual(loadedStage('hard', 1, 20), { stars: 2, left: 20 }, '고수 left 20 ★ -> ★★(15초 이상)');
  assert.deepStrictEqual(loadedStage('hard', 1, 10), { stars: 1, left: 10 }, '고수 left 10 ★ 은 그대로');
  assert.deepStrictEqual(loadedStage('hard', 3, 0), { stars: 3, left: 30 }, '별만 있고 left 가 없는 옛 저장: left 는 별의 하한(고수 ★★★ = 30초)');
  assert.deepStrictEqual(loadedStage('hard', 2, 0), { stars: 2, left: 15 }, '고수 ★★ 하한 15초');
});

test('§44 별이 내려가지 않는다: 저장된 별 >= 불러온 별, 저장된 left <= 불러온 left (세 난이도 × 별 1~3 × left 0~150)', () => {
  assert.deepStrictEqual(loadedStage('hard', 3, 40), { stars: 3, left: 40 }, '고수 저장 ★★★ left 40 은 ★★★ 유지(새 ★★★ 은 30초 이상)');
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let stars = 1; stars <= 3; stars++) {
      for (let left = 0; left <= 150; left++) {
        const r = loadedStage(diff, stars, left);
        assert.ok(r.stars >= stars, diff + ' ★' + stars + ' left=' + left + ' -> ★' + r.stars);
        assert.ok(r.left >= left, diff + ' ★' + stars + ' left=' + left + ' -> left ' + r.left);
        assert.ok(r.stars >= G.starsFor(r.left, G.CONFIG.difficulty[diff].time.start, diff), diff + ' ★' + stars + ' left=' + left + ': 불러온 별은 불러온 left 로 계산한 별 이상');
      }
    }
  }
});

test('leftFromTime: 정수 초 내림 + 부동소수점 오차 방어', () => {
  assert.strictEqual(G.leftFromTime(65), 65);
  assert.strictEqual(G.leftFromTime(64.9999999), 65);       // 오차는 올려서 본다
  assert.strictEqual(G.leftFromTime(64.9), 64);
  assert.strictEqual(G.leftFromTime(0.4), 0);
  assert.strictEqual(G.leftFromTime(-3), 0);
});

test('defaultSave: 모든 스테이지가 {best:0, stars:0, left:0}', () => {
  const s = G.defaultSave();
  ['easy', 'normal', 'hard'].forEach((k) => {
    assert.strictEqual(s.stages[k].length, N);
    s.stages[k].forEach((e) => assert.deepStrictEqual(e, { best: 0, stars: 0, left: 0 }));
  });
});

test('parseSave: 옛 저장(left 없음) 마이그레이션 — 별에서 하한 추정, 나머지 보존', () => {
  const old = {
    level: 'hard', best: 777, bestChain: 9, plays: 4, muted: true, cutin: false,
    bestByLevel: { easy: 1, normal: 2, hard: 3 }, progress: { easy: 3, normal: 3, hard: 0 },
    stages: {
      easy: stages([{ best: 9000, stars: 3 }, { best: 5000, stars: 2 }, { best: 100, stars: 1 }]),
      normal: stages([{ best: 9000, stars: 3 }, { best: 5000, stars: 2 }, { best: 100, stars: 1 }]),
      hard: stages([])
    }
  };
  const s = G.parseSave(JSON.stringify(old));
  assert.deepStrictEqual(s.stages.easy.slice(0, 4).map((e) => e.left), [65, 39, 0, 0]);
  assert.deepStrictEqual(s.stages.normal.slice(0, 4).map((e) => e.left), [60, 36, 0, 0]);
  assert.deepStrictEqual(s.stages.easy.slice(0, 3).map((e) => e.stars), [3, 2, 1]);
  // spec §28.9: scoreRule 표식이 없는(옛 점수 규칙) 저장은 레벨별 best 를 bestOld 로 옮기고 best 는 0 으로 시작한다(별·left·진행도는 위에서 보존됨을 확인)
  assert.strictEqual(s.stages.easy[0].best, 0);
  assert.strictEqual(s.stages.easy[0].bestOld, 9000);
  assert.strictEqual(s.scoreRule, 2);
  assert.strictEqual(s.level, 'hard');
  assert.strictEqual(s.best, 777);
  assert.strictEqual(s.bestChain, 9);
  assert.strictEqual(s.muted, true);
  assert.strictEqual(s.cutin, false);
  assert.deepStrictEqual(s.bestByLevel, { easy: 1, normal: 2, hard: 3 });
  assert.deepStrictEqual(s.progress, { easy: 3, normal: 3, hard: 0 });
});

test('parseSave: left 검증·보정 (별↔시간 일치, 손상 값)', () => {
  const mk = (e) => JSON.stringify({ stages: { easy: stages([e]), normal: stages([]), hard: stages([]) } });
  // 정상 left 는 그대로(하한보다 크면)
  assert.strictEqual(G.parseSave(mk({ best: 1, stars: 3, left: 90 })).stages.easy[0].left, 90);
  // 하한보다 낮은 left 는 올린다
  assert.strictEqual(G.parseSave(mk({ best: 1, stars: 3, left: 10 })).stages.easy[0].left, 65);
  // 별이 left 에 비해 낮으면 별을 올린다 (left 80 => 3★)
  const a = G.parseSave(mk({ best: 1, stars: 1, left: 80 })).stages.easy[0];
  assert.strictEqual(a.stars, 3); assert.strictEqual(a.left, 80);
  // 별 0 이면 left 0
  assert.strictEqual(G.parseSave(mk({ best: 5, stars: 0, left: 50 })).stages.easy[0].left, 0);
  // 범위·타입 오류
  [-1, 201, 1.5, '40', null, NaN, Infinity, [], {}, true].forEach((bad) => {
    const e = G.parseSave(mk({ best: 1, stars: 2, left: bad })).stages.easy[0];
    assert.strictEqual(e.left, 39, 'left=' + JSON.stringify(bad));
    assert.strictEqual(e.stars, 2);
  });
  [4, -1, 1.5, '3', null].forEach((bad) => {
    const e = G.parseSave(mk({ best: 1, stars: bad, left: 70 })).stages.easy[0];
    assert.strictEqual(e.stars, 0);
    assert.strictEqual(e.left, 0);
  });
  // 진행도는 별이 있는 최고 레벨 이상
  assert.strictEqual(G.parseSave(mk({ best: 1, stars: 1 })).progress.easy, 1);
});

test('parseSave: 손상·타입 오류·깨진 JSON 에도 기본 저장을 돌려준다', () => {
  const def = JSON.stringify(G.defaultSave());
  ['', '{', 'null', '[]', '"x"', '123', 'true'].forEach((raw) => assert.strictEqual(JSON.stringify(G.parseSave(raw)), def, raw));
  [null, undefined, 0, 'abc', [], true].forEach((raw) => assert.strictEqual(JSON.stringify(G.parseSave(raw)), def));
  assert.strictEqual(JSON.stringify(G.parseSave({ stages: 5 })), def);
  assert.strictEqual(JSON.stringify(G.parseSave({ stages: { easy: 'x', normal: [1, 2], hard: [null] } })), def);
  // 길이가 10이 아니면 그 난이도는 기본값
  const s = G.parseSave({ stages: { easy: [{ best: 1, stars: 3 }], normal: [], hard: [] } });
  assert.strictEqual(s.stages.easy.length, N);
  assert.strictEqual(s.stages.easy[0].stars, 0);
  // 항목이 객체가 아니면 그 난이도 전체가 기본값
  const t = G.parseSave({ stages: { easy: stages([1]).map((e, i) => i === 3 ? 'bad' : e), normal: [], hard: [] } });
  assert.strictEqual(t.stages.easy[3].stars, 0);
});

test('parseSave: 새 형식 저장은 왕복해도 변하지 않는다(멱등)', () => {
  const sv = G.defaultSave();
  G.applyStageResult(sv, 'normal', 1, 9000, true, 3, 77);
  G.applyStageResult(sv, 'normal', 2, 9000, true, 2, 40);
  const again = G.parseSave(JSON.stringify(sv));
  assert.deepStrictEqual(again, sv);
});

test('applyStageResult: 기존 6인자 호출 호환 + improved 반환', () => {
  const sv = G.defaultSave();
  // 6인자(left 생략) — 기존 시험과 호환
  let r = G.applyStageResult(sv, 'easy', 1, 7000, true, 2);
  assert.deepStrictEqual(r, { firstClear: true, unlocked: 2, improved: true });
  assert.strictEqual(sv.stages.easy[0].stars, 2);
  assert.strictEqual(sv.stages.easy[0].left, 0);
  assert.strictEqual(sv.progress.easy, 1);
  // 같은 기록 -> 개선 아님
  r = G.applyStageResult(sv, 'easy', 1, 7000, true, 2, 0);
  assert.strictEqual(r.improved, false);
  assert.strictEqual(r.firstClear, false);
  // 별은 같지만 left 가 커짐 -> 개선
  r = G.applyStageResult(sv, 'easy', 1, 7000, true, 2, 45);
  assert.strictEqual(r.improved, true);
  assert.strictEqual(sv.stages.easy[0].left, 45);
  // left 가 줄어드는 갱신은 없다
  r = G.applyStageResult(sv, 'easy', 1, 7000, true, 2, 41);
  assert.strictEqual(r.improved, false);
  assert.strictEqual(sv.stages.easy[0].left, 45);
  // 별이 더 낮으면 별은 그대로(최대값)
  r = G.applyStageResult(sv, 'easy', 1, 100, true, 1, 3);
  assert.strictEqual(sv.stages.easy[0].stars, 2);
  assert.strictEqual(r.improved, false);
  // 별이 오름
  r = G.applyStageResult(sv, 'easy', 1, 7000, true, 3, 70);
  assert.strictEqual(r.improved, true);
  assert.strictEqual(sv.stages.easy[0].stars, 3);
  assert.strictEqual(sv.stages.easy[0].left, 70);
  // 실패 판: 점수만 갱신, improved=false, 별·left 불변
  r = G.applyStageResult(sv, 'easy', 2, 3000, false, 0, 0);
  assert.deepStrictEqual(r, { firstClear: false, unlocked: 0, improved: false });
  assert.strictEqual(sv.stages.easy[1].best, 3000);
  assert.strictEqual(sv.stages.easy[1].stars, 0);
  // 소수 left 는 내림, 음수·NaN 은 0
  r = G.applyStageResult(sv, 'easy', 2, 9999, true, 1, 12.9);
  assert.strictEqual(sv.stages.easy[1].left, 12);
  G.applyStageResult(sv, 'easy', 3, 9999, true, 1, NaN);
  assert.strictEqual(sv.stages.easy[2].left, 0);
  // 마지막 스테이지는 unlocked 없음
  const sv2 = G.defaultSave();
  r = G.applyStageResult(sv2, 'hard', 10, 99999, true, 1, 0);
  assert.strictEqual(r.unlocked, 0);
  assert.strictEqual(r.firstClear, true);
  // 옛 객체(left 필드 없음)에 적용해도 오류 없음
  const legacy = { stages: { easy: [{ best: 0, stars: 0 }], normal: [], hard: [] }, progress: { easy: 0, normal: 0, hard: 0 } };
  assert.doesNotThrow(() => G.applyStageResult(legacy, 'easy', 1, 10, true, 1, 5));
  assert.strictEqual(legacy.stages.easy[0].left, 5);
});

test('CONFIG.ranking 기본값: apiBase는 비어 있거나(기능 꺼짐) 끝 슬래시 없는 https 주소', () => {
  const base = G.CONFIG.ranking.apiBase;
  assert.ok(base === '' || /^https:\/\/[^\/\s]+$/.test(base), 'apiBase: ' + base);
  assert.strictEqual(G.CONFIG.ranking.pageSize, 50);
  assert.deepStrictEqual(G.CONFIG.ranking.retryMs, [5000, 15000, 60000, 300000, 900000]);
});
