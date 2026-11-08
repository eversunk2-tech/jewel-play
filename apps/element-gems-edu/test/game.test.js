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
  // [EDU] 교육용 목표 점수 = 일반용 목표 × 1.2 (100점 반올림): 일반용 §25.6 값 4500 -> 5400, 9900 -> 11900 (spec §21.8.4)
  assert.strictEqual(G.stageTarget('normal', 1), 5400);
  assert.strictEqual(G.stageTarget('hard', 10), 11900);
  assert.strictEqual(G.stageTarget('easy', 11), 0);
  assert.deepStrictEqual(G.CONFIG.stages.targets.easy.length, 10);
  assert.strictEqual(G.stageUnlocked(0, 1), true);
  assert.strictEqual(G.stageUnlocked(0, 2), false);
  assert.strictEqual(G.stageUnlocked(9, 10), true);
});

test('starsFor: 임계값(초보 39/65, 중수 36/60, 고수 30/50)이 정수 초이고 내림해도 결과가 같다', () => {
  const cases = { easy: [130, 39, 65], normal: [120, 36, 60], hard: [100, 30, 50] };
  Object.keys(cases).forEach((k) => {
    const [start, two, three] = cases[k];
    assert.strictEqual(G.CONFIG.difficulty[k].time.start, start);
    assert.strictEqual(G.starsFor(three, start), 3);
    assert.strictEqual(G.starsFor(three - 1, start), 2);
    assert.strictEqual(G.starsFor(two, start), 2);
    assert.strictEqual(G.starsFor(two - 1, start), 1);
    // 0.1초 단위 전수: 내림한 정수 left 로 계산한 별이 소수 시간으로 계산한 별과 같다
    for (let t = 0; t <= start + 20; t += 0.1) {
      assert.strictEqual(G.starsFor(G.leftFromTime(t), start), G.starsFor(t, start), k + ' t=' + t.toFixed(1));
    }
    assert.strictEqual(G.leftFloorForStars(k, 3), three);
    assert.strictEqual(G.leftFloorForStars(k, 2), two);
    assert.strictEqual(G.leftFloorForStars(k, 1), 0);
  });
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
  assert.strictEqual(s.stages.easy[0].best, 9000);
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
