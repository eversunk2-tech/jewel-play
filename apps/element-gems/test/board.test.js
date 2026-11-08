/* 보드 구조 "구조 등급 사다리"(spec §26) 순수 함수 시험. 실행: node --test apps/element-gems/test/*.test.js
 * 대상: CONFIG.board, boardGrade, boardParams, completes, fillStructured, refillStructured, generateBoardStructured.
 * DOM 이 필요한 호출부(buildBoard·dropAndRefill·startStage·resetState)는 소스 연결 검사 + 브라우저 확인으로 본다.
 * 모든 난수는 시드 고정(mulberry)이라 결과가 매번 같다. CONFIG.board 를 바꾸는 시험은 끝에 원래대로 되돌린다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const G = require(path.join(__dirname, '..', 'game.js'));

const R = 8;
const C = 8;
const NT = 6;
const LEVELS = ['easy', 'normal', 'hard'];
const B = G.CONFIG.board;

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** 호출 횟수를 세는 난수 */
function countingRng(seed) {
  const f = mulberry(seed);
  const rng = function () { rng.calls++; return f(); };
  rng.calls = 0;
  return rng;
}
function clone(g) { return g.map((row) => row.slice()); }

/** CONFIG.board 의 enabled·strength 를 잠깐 바꿔 fn 을 실행하고 반드시 원래대로 되돌린다 */
function withBoard(patch, fn) {
  const saved = { enabled: B.enabled, strength: B.strength, tries: B.tries };
  Object.assign(B, patch);
  try { return fn(); } finally { Object.assign(B, saved); }
}

/** 등급 표의 모든 행: { level, key, s, P } (P = 리필·시작 보드에 넘기는 손잡이) */
function gradeRows() {
  const rows = [];
  LEVELS.forEach((level) => {
    Object.keys(B.grades[level]).forEach((key) => {
      const g = B.grades[level][key];
      rows.push({ level: level, key: key, s: Number(key), P: { s: Number(key), pair: g.pair, auto: g.auto, lo: g.lo, hi: g.hi, tries: B.tries } });
    });
  });
  return rows;
}

/** 리필 직전 상태(Plan 시뮬레이터와 같은 방법): 안정된 균등 보드에서 3~5개의 가로/세로 줄(3~4칸)을 지우고 중력을 적용한다 */
function randomPartial(rnd) {
  const g = G.generateBoard(R, C, NT, rnd);
  const k = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) {
    const r0 = Math.floor(rnd() * (R - 2));
    const c0 = Math.floor(rnd() * (C - 2));
    const len = 3 + Math.floor(rnd() * 2);
    const horiz = rnd() < 0.5;
    for (let j = 0; j < len; j++) {
      const r = horiz ? r0 : Math.min(R - 1, r0 + j);
      const c = horiz ? Math.min(C - 1, c0 + j) : c0;
      g[r][c] = null;
    }
  }
  G.applyGravity(g);
  return g;
}

/** 안정된 보드의 각 열 위쪽 0~4칸을 비운다(남은 칸은 안정된 보드의 일부라 매치가 없다) */
function topHoles(rnd) {
  const g = G.generateBoard(R, C, NT, rnd);
  for (let c = 0; c < C; c++) {
    const n = Math.floor(rnd() * 5);
    for (let r = 0; r < n; r++) g[r][c] = null;
  }
  return g;
}

function holesOf(g) {
  let n = 0;
  g.forEach((row) => row.forEach((v) => { if (v == null) n++; }));
  return n;
}

/* ===================================================================
 * ① 표(CONFIG.board)와 boardGrade
 * =================================================================== */
test('CONFIG.board: 켜짐·강도 1·후보 12번, 등급 표 8행과 사다리 30칸이 spec §26.4.5와 같다', () => {
  assert.strictEqual(B.enabled, true);
  assert.strictEqual(B.strength, 1);
  assert.strictEqual(B.tries, 12);
  assert.deepStrictEqual(B.grades, {
    easy: {
      '2': { pair: 2.00, auto: 0.37, lo: 8, hi: 99 },
      '1.5': { pair: 1.75, auto: 0.50, lo: 7, hi: 99 },
      '1': { pair: 1.50, auto: 0.67, lo: 5, hi: 99 }
    },
    normal: {
      '0.5': { pair: 1.25, auto: 0.82, lo: 3, hi: 99 },
      '-0.5': { pair: 0.85, auto: 0.77, lo: 2, hi: 14 }
    },
    hard: {
      '-0.5': { pair: 0.85, auto: 0.89, lo: 2, hi: 14 },
      '-1': { pair: 0.70, auto: 0.55, lo: 2, hi: 10 },
      '-1.5': { pair: 0.62, auto: 0.47, lo: 2, hi: 9 }
    }
  });
  assert.deepStrictEqual(B.ladder, {
    easy: [2, 2, 2, 1.5, 1.5, 1.5, 1.5, 1, 1, 1],
    normal: [0.5, 0.5, 0.5, 0, 0, 0, 0, -0.5, -0.5, -0.5],
    hard: [-0.5, -0.5, -0.5, -1, -1, -1, -1, -1.5, -1.5, -1.5]
  });
  assert.strictEqual(gradeRows().length, 8);
});

test('I10 표 형식: 모든 등급 pair>0·auto≥0·lo≤hi(정수), 사다리 30칸은 등급 키 또는 0', () => {
  gradeRows().forEach((row) => {
    const P = row.P;
    assert.ok(P.pair > 0, row.level + ' ' + row.key + ' pair');
    assert.ok(P.auto >= 0, row.level + ' ' + row.key + ' auto');
    assert.ok(Number.isInteger(P.lo) && Number.isInteger(P.hi) && P.lo >= 0 && P.lo <= P.hi, row.level + ' ' + row.key + ' lo/hi');
    assert.ok(row.s % 0.5 === 0 && row.s >= -2 && row.s <= 2, row.level + ' ' + row.key + ' 등급은 0.5 단위·−2~+2');
  });
  LEVELS.forEach((level) => {
    assert.strictEqual(B.ladder[level].length, G.CONFIG.stages.count, level + ' 사다리 길이');
    B.ladder[level].forEach((s, i) => {
      assert.ok(s === 0 || Object.prototype.hasOwnProperty.call(B.grades[level], String(s)), level + ' 레벨 ' + (i + 1) + ' 등급 ' + s + ' 이 표에 없음');
    });
  });
});

test('boardGrade: 사다리 30칸이 표의 등급 또는 0, 범위 밖 레벨·모르는 난이도는 0', () => {
  LEVELS.forEach((level) => {
    for (let stage = 1; stage <= 10; stage++) {
      const s = G.boardGrade(level, stage);
      assert.strictEqual(s, B.ladder[level][stage - 1], level + ' ' + stage);
      assert.ok(s === 0 || Object.prototype.hasOwnProperty.call(B.grades[level], String(s)));
    }
    [0, -1, 11, 99].forEach((stage) => assert.strictEqual(G.boardGrade(level, stage), 0, level + ' 레벨 ' + stage));
  });
  assert.strictEqual(G.boardGrade('expert', 1), 0);
  assert.strictEqual(G.boardGrade(undefined, 1), 0);
  // 중수 4~7단계는 현재와 같은 균등 무작위(0)
  [4, 5, 6, 7].forEach((stage) => assert.strictEqual(G.boardGrade('normal', stage), 0));
  // 30칸을 이으면 초보 1단계(가장 넉넉) → 고수 10단계(가장 까다로움)로 등급이 줄어든다(단조 비증가)
  const seq = [];
  LEVELS.forEach((level) => { for (let stage = 1; stage <= 10; stage++) seq.push(G.boardGrade(level, stage)); });
  assert.strictEqual(seq[0], 2);
  assert.strictEqual(seq[29], -1.5);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] <= seq[i - 1], '30칸 사다리가 오르는 곳: ' + i);
});

test('boardGrade: enabled=false 이면 전부 0, strength 는 곱한 뒤 0.5 단위로 반올림하고 표에 없으면 0', () => {
  withBoard({ enabled: false }, () => {
    LEVELS.forEach((level) => { for (let stage = 1; stage <= 10; stage++) assert.strictEqual(G.boardGrade(level, stage), 0); });
  });
  withBoard({ strength: 0 }, () => {
    LEVELS.forEach((level) => { for (let stage = 1; stage <= 10; stage++) assert.strictEqual(G.boardGrade(level, stage), 0); });
  });
  withBoard({ strength: 0.5 }, () => {
    assert.strictEqual(G.boardGrade('easy', 1), 1);          // 2 × 0.5
    assert.strictEqual(G.boardGrade('easy', 4), 1);          // 1.5 × 0.5 = 0.75 → 1
    assert.strictEqual(G.boardGrade('easy', 8), 0);          // 1 × 0.5 = 0.5 는 초보 표에 없어 0
    assert.strictEqual(G.boardGrade('normal', 1), 0.5);      // 0.5 × 0.5 = 0.25 → 0.5
    assert.strictEqual(G.boardGrade('normal', 10), 0);       // −0.25 → 0
    assert.strictEqual(G.boardGrade('hard', 1), 0);          // −0.25 → 0
    assert.strictEqual(G.boardGrade('hard', 4), -0.5);       // −1 × 0.5
    assert.strictEqual(G.boardGrade('hard', 10), -0.5);      // −0.75 → −0.5
  });
  // 되돌렸는지
  assert.strictEqual(B.enabled, true);
  assert.strictEqual(B.strength, 1);
  assert.strictEqual(G.boardGrade('easy', 1), 2);
});

/* ===================================================================
 * ② boardParams
 * =================================================================== */
test('boardParams: s=0 이면 null, 아니면 표의 값 + tries, 모든 등급 pair>0·auto≥0·lo≤hi', () => {
  let nulls = 0;
  LEVELS.forEach((level) => {
    for (let stage = 1; stage <= 10; stage++) {
      const s = G.boardGrade(level, stage);
      const p = G.boardParams(level, stage);
      if (s === 0) { assert.strictEqual(p, null, level + ' ' + stage); nulls++; continue; }
      const g = B.grades[level][String(s)];
      assert.deepStrictEqual(p, { s: s, pair: g.pair, auto: g.auto, lo: g.lo, hi: g.hi, tries: B.tries });
      assert.ok(p.pair > 0 && p.auto >= 0 && p.lo <= p.hi);
    }
  });
  assert.strictEqual(nulls, 4);                                // 중수 4~7단계만 균등
  withBoard({ enabled: false }, () => {
    LEVELS.forEach((level) => { for (let stage = 1; stage <= 10; stage++) assert.strictEqual(G.boardParams(level, stage), null); });
  });
  withBoard({ strength: 0 }, () => assert.strictEqual(G.boardParams('hard', 10), null));
  assert.strictEqual(G.boardParams('normal', 11), null);
});

/* ===================================================================
 * ③ fillStructured
 * =================================================================== */
test('fillStructured: 제자리에서 채워 null 이 없고 값은 0~5, 이미 있는 칸은 그대로, 같은 시드면 같은 결과', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(7000 + Math.round(row.s * 10));
    for (let i = 0; i < 400; i++) {
      const base = randomPartial(rnd);
      const tg = clone(base);
      const out = G.fillStructured(tg, row.P, mulberry(i + 1));
      assert.strictEqual(out, tg, '제자리에서 채워 같은 배열을 돌려준다');
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const v = tg[r][c];
          assert.ok(Number.isInteger(v) && v >= 0 && v < NT, row.level + ' ' + row.key + ' 값 ' + v);
          if (base[r][c] != null) assert.strictEqual(v, base[r][c], '이미 있는 보석을 바꿈(I8)');
        }
      }
      const tg2 = clone(base);
      G.fillStructured(tg2, row.P, mulberry(i + 1));
      assert.deepStrictEqual(tg2, tg, '결정적이 아님(I9)');
    }
  });
});

test('fillStructured: auto=0 이면 새 칸이 줄·2×2를 완성하지 않는다(등급별 3,000회, 시작 보드와 같은 조건)', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(9100 + Math.round(row.s * 10));
    let holes = 0;
    for (let i = 0; i < 3000; i++) {
      const base = topHoles(rnd);
      assert.strictEqual(G.findMatches(base).length, 0, '기준 보드가 안정적이어야 함');
      const tg = clone(base);
      holes += holesOf(tg);
      G.fillStructured(tg, row.P, mulberry(i + 1), 0);
      assert.strictEqual(G.findMatches(tg).length, 0, row.level + ' ' + row.key + ' auto=0 인데 매치가 생김 i=' + i);
    }
    assert.ok(holes > 3000 * 10, '빈 칸을 충분히 채웠는지(시험이 헛돌지 않게): ' + holes);
  });
  // 완전히 빈 보드에서도 (시작 보드 경로) 매치 0
  gradeRows().forEach((row) => {
    for (let i = 0; i < 300; i++) {
      const tg = G.fillStructured(Array.from({ length: R }, () => new Array(C).fill(null)), row.P, mulberry(500 + i), 0);
      assert.strictEqual(G.findMatches(tg).length, 0);
    }
  });
});

test('completes: 이웃 중 정해진 칸만 보고(null 은 없는 칸) 보드를 원래대로 돌려놓는다', () => {
  const g = [
    [0, 0, null, 1],
    [2, 3, null, 1],
    [2, 3, 4, null],
    [5, 5, 4, null]
  ];
  const before = clone(g);
  assert.strictEqual(G.completes(g, 0, 2, 0), true);          // 0 0 [0] 가로 3줄
  assert.strictEqual(G.completes(g, 0, 2, 1), false);         // 오른쪽 1 하나뿐, 아래는 null
  assert.strictEqual(G.completes(g, 1, 2, 3), false);         // 3 [3] 두 칸뿐
  assert.strictEqual(G.completes(g, 1, 2, 1), false);         // 위가 null 이라 2×2 가 아니다
  assert.strictEqual(G.completes(g, 3, 3, 4), false);         // 5 5 4 [4] 가로 두 칸뿐
  assert.deepStrictEqual(g, before, 'completes 가 보드를 바꿈');
  const h = [[null, 1, 1], [2, 3, 4], [2, 5, 6]];
  assert.strictEqual(G.completes(h, 0, 0, 2), true);          // 열 0 에서 [2] 2 2 세로 3줄
  assert.strictEqual(G.completes(h, 0, 0, 1), true);          // 가로 [1] 1 1
  assert.strictEqual(G.completes(h, 0, 0, 3), false);
  assert.strictEqual(h[0][0], null);
  assert.strictEqual(G.completes([[null, 1], [1, 1]], 0, 0, 1), true);      // 2×2 정사각형
  assert.strictEqual(G.completes([[null, 1], [1, 1]], 0, 0, 2), false);
});

test('I5 색 대칭: 빈 보드를 채울 때 모든 등급에서 여섯 색의 빈도가 16.7±1%p', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(31000 + Math.round(row.s * 10));
    const count = new Array(NT).fill(0);
    let total = 0;
    for (let i = 0; i < 1500; i++) {
      const tg = G.fillStructured(Array.from({ length: R }, () => new Array(C).fill(null)), row.P, rnd);
      tg.forEach((line) => line.forEach((v) => { count[v]++; total++; }));
    }
    count.forEach((n, t) => {
      const pct = 100 * n / total;
      assert.ok(Math.abs(pct - 100 / 6) <= 1, row.level + ' ' + row.key + ' 색 ' + t + ' = ' + pct.toFixed(2) + '%');
    });
  });
});

/* ===================================================================
 * ④ refillStructured
 * =================================================================== */
test('refillStructured: 새 격자를 돌려주고(원본 불변), null 없음·값 0~5·기존 칸 불변·결정적', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(12000 + Math.round(row.s * 10));
    for (let i = 0; i < 400; i++) {
      const base = randomPartial(rnd);
      const keep = clone(base);
      const out = G.refillStructured(base, row.P, mulberry(i + 1));
      assert.deepStrictEqual(base, keep, '입력 격자를 바꿈');
      assert.notStrictEqual(out, base);
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const v = out[r][c];
          assert.ok(Number.isInteger(v) && v >= 0 && v < NT, row.level + ' ' + row.key + ' 값 ' + v);
          if (base[r][c] != null) assert.strictEqual(v, base[r][c], '이미 있는 보석을 바꿈(I8)');
        }
      }
      assert.deepStrictEqual(G.refillStructured(base, row.P, mulberry(i + 1)), out, '결정적이 아님(I9)');
    }
  });
});

test('refillStructured: 안정된 후보는 맞출 곳이 [lo,hi] 안인 비율이 등급별 하한 이상(측정 100/99.5/93/87%에서 3%p 여유)', () => {
  // spec §26.4 측정: s≥+0.5 → 100%, −0.5 → 99.5%, −1 → 93%, −1.5 → 87% (4,000개 리필 직전 상태, 안정된 결과만 센다)
  const floor = { '2': 97, '1.5': 97, '1': 97, '0.5': 97, '-0.5': 96.5, '-1': 90, '-1.5': 84 };
  gradeRows().forEach((row) => {
    const rnd = mulberry(4242);
    let settled = 0;
    let inBand = 0;
    for (let i = 0; i < 4000; i++) {
      const out = G.refillStructured(randomPartial(rnd), row.P, mulberry(1000 + i));
      if (G.findMatches(out).length === 0) {
        settled++;
        const m = G.listMoves(out).length;
        if (m >= row.P.lo && m <= row.P.hi) inBand++;
      }
    }
    assert.ok(settled >= 300, row.level + ' ' + row.key + ' 안정된 결과가 너무 적음: ' + settled);
    const pct = 100 * inBand / settled;
    assert.ok(pct >= floor[String(row.s)], row.level + ' ' + row.key + ' 구간 만족률 ' + pct.toFixed(1) + '% < ' + floor[String(row.s)] + '%');
  });
});

test('refillStructured: 연쇄가 이어지는 후보는 거르지 않는다(첫 후보에 매치가 있으면 그대로 돌려줌)', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(55000 + Math.round(row.s * 10));
    let chained = 0;
    for (let i = 0; i < 600; i++) {
      const base = randomPartial(rnd);
      const first = G.fillStructured(clone(base), row.P, mulberry(i + 9));
      const out = G.refillStructured(base, row.P, mulberry(i + 9));
      if (G.findMatches(first).length > 0) {
        chained++;
        assert.deepStrictEqual(out, first, '연쇄 후보를 거르고 다시 뽑음');
      }
    }
    assert.ok(chained >= 50, row.level + ' ' + row.key + ' 연쇄 후보가 거의 없어 시험이 헛돎: ' + chained);
  });
});

test('refillStructured: tries 가 0이어도 최소 한 번은 채워 null 을 남기지 않는다', () => {
  const row = gradeRows()[0];
  const out = G.refillStructured(randomPartial(mulberry(5)), Object.assign({}, row.P, { tries: 0 }), mulberry(6));
  assert.ok(out.every((line) => line.every((v) => v != null)));
});

/* ===================================================================
 * ⑤ generateBoardStructured
 * =================================================================== */
test('generateBoardStructured: 등급별 1,000판 모두 매치 0·맞출 곳 ∈ [max(1,lo),hi]·폴백 0회', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(77000 + Math.round(row.s * 10));
    for (let i = 0; i < 1000; i++) {
      const rng = countingRng(rnd() * 4294967296);
      const g = G.generateBoardStructured(R, C, row.P, rng);
      assert.strictEqual(G.findMatches(g).length, 0, row.level + ' ' + row.key + ' 판 ' + i + ' 시작 보드에 매치');
      const m = G.listMoves(g).length;
      assert.ok(m >= Math.max(1, row.P.lo) && m <= row.P.hi, row.level + ' ' + row.key + ' 맞출 곳 ' + m);
      assert.ok(g.length === R && g.every((line) => line.length === C && line.every((v) => Number.isInteger(v) && v >= 0 && v < NT)));
      // 한 번 시도 = 난수 64번. 1000번 시도 안에 성공했으면 64,000번을 넘지 않는다(넘으면 generateBoard 폴백)
      assert.ok(rng.calls <= R * C * 1000, row.level + ' ' + row.key + ' 폴백 의심: 난수 ' + rng.calls + '번');
    }
  });
});

test('generateBoardStructured: 같은 시드면 같은 보드(결정적), 색 대칭', () => {
  const row = gradeRows()[1];
  const a = G.generateBoardStructured(R, C, row.P, mulberry(42));
  const b = G.generateBoardStructured(R, C, row.P, mulberry(42));
  assert.deepStrictEqual(a, b);
  gradeRows().forEach((r) => {
    const rnd = mulberry(123 + Math.round(r.s * 10));
    const count = new Array(NT).fill(0);
    let total = 0;
    for (let i = 0; i < 400; i++) G.generateBoardStructured(R, C, r.P, rnd).forEach((line) => line.forEach((v) => { count[v]++; total++; }));
    count.forEach((n, t) => assert.ok(Math.abs(100 * n / total - 100 / 6) <= 1.5, r.level + ' ' + r.key + ' 색 ' + t));
  });
});

/* ===================================================================
 * ⑥ I1: 끄거나 s=0 이면 현재(균등 무작위) 경로와 완전히 같다
 * =================================================================== */
/** buildBoard 의 시작 보드 분기를 그대로 옮긴 것: 구조 등급이 있으면 구조 보드, 없으면 기존 generateBoard */
function startBoard(level, stage, rng) {
  const P = G.boardParams(level, stage);
  return P ? G.generateBoardStructured(R, C, P, rng) : G.generateBoard(R, C, NT, rng);
}

test('I1: enabled=false · strength=0 · 중수 4~7단계(s=0)의 시작 보드는 generateBoard 와 같은 보드·같은 난수 호출 수', () => {
  const cases = [];
  withBoard({ enabled: false }, () => {
    LEVELS.forEach((level) => { for (let stage = 1; stage <= 10; stage++) cases.push([level, stage, 'enabled=false']); });
  });
  cases.forEach((cs) => {
    withBoard({ enabled: false }, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const r1 = countingRng(seed);
        const r2 = countingRng(seed);
        assert.deepStrictEqual(startBoard(cs[0], cs[1], r1), G.generateBoard(R, C, NT, r2), cs.join(' ') + ' 시드 ' + seed);
        assert.strictEqual(r1.calls, r2.calls, cs.join(' ') + ' 난수 호출 수');
      }
    });
  });
  withBoard({ strength: 0 }, () => {
    LEVELS.forEach((level) => {
      for (let stage = 1; stage <= 10; stage++) {
        const r1 = countingRng(stage * 31);
        const r2 = countingRng(stage * 31);
        assert.deepStrictEqual(startBoard(level, stage, r1), G.generateBoard(R, C, NT, r2));
        assert.strictEqual(r1.calls, r2.calls);
      }
    });
  });
  [4, 5, 6, 7].forEach((stage) => {
    for (let seed = 1; seed <= 20; seed++) {
      const r1 = countingRng(seed * 7);
      const r2 = countingRng(seed * 7);
      assert.deepStrictEqual(startBoard('normal', stage, r1), G.generateBoard(R, C, NT, r2));
      assert.strictEqual(r1.calls, r2.calls);
    }
  });
  // 구조 등급이 있는 칸은 균등 무작위와 다르다(시험이 헛돌지 않는지)
  let differ = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (JSON.stringify(startBoard('easy', 1, mulberry(seed))) !== JSON.stringify(G.generateBoard(R, C, NT, mulberry(seed)))) differ++;
  }
  assert.ok(differ >= 18, '초보 1단계 보드가 균등 무작위와 거의 같음: ' + differ);
});

test('I1·I7·I8 소스 연결: 호출부 4곳이 state.board 로만 분기하고 입력은 (난이도, 레벨)뿐이다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8').replace(/\s+/g, ' ');
  // buildBoard: 시작 보드
  assert.ok(src.includes('const tg = state.board ? generateBoardStructured(ROWS, COLS, state.board) : generateBoard(ROWS, COLS, TYPE_COUNT);'));
  // dropAndRefill: 중력 뒤 새 칸 종류, 없으면 기존 randInt(TYPE_COUNT) 그대로
  assert.ok(src.includes('const refillTypes = state.board ? refillStructured(typeGrid(), state.board) : null;'));
  assert.ok(src.includes('createGem(refillTypes ? refillTypes[i][c] : randInt(TYPE_COUNT), i - n, c, 0)'));
  // startStage: state.stage 뒤에 (CONFIG.level 에서 읽은 난이도 lv, 레벨 stage)만으로 정한다
  assert.ok(src.includes('state.stage = stage; state.board = boardParams(lv, stage);'));
  // resetState: 판이 바뀌면 비운다
  assert.ok(src.includes('state.board = null; state.confirmFrom = null;'));
  // 구조 함수 본문에 점수·시간·기록을 읽지 않는다
  const start = src.indexOf('function boardGrade(');
  const end = src.indexOf('function shuffleTypes(');
  assert.ok(start > 0 && end > start);
  const body = src.slice(start, end);
  assert.ok(!/state\.|save\.|timeLeft|score/.test(body), '구조 함수가 플레이어 상태를 읽음(I7)');
  // reshuffleBoard·shuffleTypes 는 구조 함수를 쓰지 않는다
  const rs = src.indexOf('async function reshuffleBoard()');
  assert.ok(rs > 0 && !src.slice(rs, rs + 600).includes('Structured'));
  assert.ok(!src.slice(src.indexOf('function shuffleTypes('), src.indexOf('function fireCells(')).includes('Structured'));
});

test('난이도 설명 문구: 기존 문장 뒤에 보드 구조 한 줄(spec §26.8)', () => {
  const d = G.CONFIG.difficulty;
  assert.strictEqual(d.easy.desc, '시간이 넉넉하고 스킬이 빨리 차요. 막히면 힌트가 자동으로 나와요. 같은 색이 모여 나와서 맞출 곳이 잘 보여요.');
  assert.strictEqual(d.normal.desc, '기본 규칙. 균형 잡힌 2분 승부! 보석이 고르게 나오는 기본 보드예요.');
  assert.strictEqual(d.hard.desc, '시간이 짧고 보너스가 적어요. 대신 점수 ×1.3! 보석이 흩어져 있어서 맞출 곳을 잘 찾아야 해요.');
});

/* ===================================================================
 * ⑦ 성능
 * =================================================================== */
test('성능: 리필 1회 평균 5 ms 이하(가장 무거운 등급, 느슨하게), 시작 보드도 5 ms 이하', () => {
  const heavy = gradeRows().filter((r) => r.level === 'hard' && r.key === '-1.5')[0];
  const rnd = mulberry(99);
  const bases = [];
  for (let i = 0; i < 300; i++) bases.push(randomPartial(rnd));
  const t0 = process.hrtime.bigint();
  bases.forEach((b, i) => G.refillStructured(b, heavy.P, mulberry(i + 1)));
  const perRefill = Number(process.hrtime.bigint() - t0) / 1e6 / bases.length;
  assert.ok(perRefill <= 5, '리필 1회 평균 ' + perRefill.toFixed(3) + ' ms');
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) G.generateBoardStructured(R, C, heavy.P, mulberry(i + 1));
  const perBoard = Number(process.hrtime.bigint() - t1) / 1e6 / 100;
  assert.ok(perBoard <= 5, '시작 보드 1개 평균 ' + perBoard.toFixed(3) + ' ms');
});
