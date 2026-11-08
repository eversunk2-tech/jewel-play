/* 교육용 보드 구조 "구조 등급 사다리"(spec §26.4·§26.9) 시험. 실행: node --test apps/element-gems-edu/test/*.test.js
 * 대상: CONFIG.board, boardGrade, boardParams, completes, fillStructured, refillStructured, generateBoardStructured (일반용과 같은 본문)
 *      + 교육용 합성 pickRefillTypesStructured(? 먼저 정하고 나머지를 구조 규칙으로 채움, §26.9 E1~E5).
 * 앞부분(① ~ ⑦)은 일반용 apps/element-gems/test/board.test.js 와 같은 단언을 교육용 game.js 위에서 돌린다 — 교육용 lineAt·squareAt·findMatches 는 ?(WILD)를 어떤 보석 대신으로 보는 판본이다.
 * DOM 이 필요한 호출부(buildBoard·planRefill·dropAndRefill·startStage·resetState)는 소스 연결 검사 + edu-engine.test.js 의 가짜 DOM 하네스(봇 1,000판, spawn=0 일반용 동일성)로 본다.
 * 모든 난수는 시드 고정(mulberry)이라 결과가 매번 같다. CONFIG.board 를 바꾸는 시험은 끝에 원래대로 되돌린다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const G = require(path.join(root, 'game.js'));
const GEN_PATH = path.join(root, '..', 'element-gems', 'game.js');
const HAS_GEN = fs.existsSync(GEN_PATH);
const GEN = HAS_GEN ? require(GEN_PATH) : null;      // 일반용: 읽기 전용으로 불러오기만 한다
const skipGen = HAS_GEN ? false : '일반용(apps/element-gems)이 없음';
const SRC = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const SRC_GEN = HAS_GEN ? fs.readFileSync(GEN_PATH, 'utf8') : '';

const R = 8;
const C = 8;
const NT = 6;
const W = G.WILD;
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
function emptyBoard() { return Array.from({ length: R }, () => new Array(C).fill(null)); }

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

/** 빈 칸 좌표를 소비 순서(열 왼→오른, 각 열 위→아래 = dropAndRefill 이 새 칸을 만드는 순서)로 */
function emptyCells(g) {
  const cells = [];
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (g[r][c] == null) cells.push({ r: r, c: c });
  return cells;
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
      const tg = G.fillStructured(emptyBoard(), row.P, mulberry(500 + i), 0);
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

test('completes(교육용): ?(WILD)는 어떤 보석 대신으로 보고, 완성에는 진짜 보석이 하나 이상 있어야 한다', () => {
  // 위 [W] 1 / 1 이 아니라: (0,0) 에 1 을 놓으면 가로 [1] W 1 -> ? 가 이어 줘 3줄
  assert.strictEqual(G.completes([[null, W, 1]], 0, 0, 1), true);
  assert.strictEqual(G.completes([[null, W, 1]], 0, 0, 2), false);
  // 가로 [1] W W 는 진짜 1 이 하나 있어 완성(? 두 개가 대신)
  assert.strictEqual(G.completes([[null, W, W]], 0, 0, 1), true);
  // 세로 [3] W 3
  assert.strictEqual(G.completes([[null], [W], [3]], 0, 0, 3), true);
  // 2×2: [4] W / 4 W  -> 4 W 4 W 는 진짜 4 가 있고 나머지는 ?
  assert.strictEqual(G.completes([[null, W], [4, W]], 0, 0, 4), true);
  assert.strictEqual(G.completes([[null, W], [4, W]], 0, 0, 5), false);
  const g = [[null, W, 1]];
  G.completes(g, 0, 0, 1);
  assert.strictEqual(g[0][0], null, '보드를 원래대로 돌려놓음');
});

test('I5 색 대칭: 빈 보드를 채울 때 모든 등급에서 여섯 색의 빈도가 16.7±1%p', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(31000 + Math.round(row.s * 10));
    const count = new Array(NT).fill(0);
    let total = 0;
    for (let i = 0; i < 1500; i++) {
      const tg = G.fillStructured(emptyBoard(), row.P, rnd);
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
test('generateBoardStructured: 등급별 1,000판 모두 매치 0·맞출 곳 ∈ [max(1,lo),hi]·폴백 0회·? 없음(E4)', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(77000 + Math.round(row.s * 10));
    for (let i = 0; i < 1000; i++) {
      const rng = countingRng(rnd() * 4294967296);
      const g = G.generateBoardStructured(R, C, row.P, rng);
      assert.strictEqual(G.findMatches(g).length, 0, row.level + ' ' + row.key + ' 판 ' + i + ' 시작 보드에 매치');
      const m = G.listMoves(g).length;
      assert.ok(m >= Math.max(1, row.P.lo) && m <= row.P.hi, row.level + ' ' + row.key + ' 맞출 곳 ' + m);
      assert.ok(g.length === R && g.every((line) => line.length === C && line.every((v) => Number.isInteger(v) && v >= 0 && v < NT)), '값이 0~5 가 아님(? 가 시작 보드에 들어옴)');
      assert.strictEqual(G.countWild(g), 0, '시작 보드에 ? 가 있음(E4)');
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

test('I1·I7·I8 소스 연결(교육용): 호출부가 state.board 로만 분기하고 입력은 (난이도, 레벨)뿐이다', () => {
  const src = SRC.replace(/\s+/g, ' ');
  // buildBoard: 시작 보드 (? 는 시작 보드에 없다 — E4)
  assert.ok(src.includes('const tg = state.board ? generateBoardStructured(ROWS, COLS, state.board) : generateBoard(ROWS, COLS, TYPE_COUNT);'));
  // planRefill: 구조가 있을 때만 합성 함수, 없으면 기존 pickRefillTypes 호출 그대로
  assert.ok(src.includes('if (state.board) return pickRefillTypesStructured(typeGrid(), on ? gridWildCount() : 0, state.board, Math.random, opt);'));
  assert.ok(src.includes('return pickRefillTypes(count, on ? gridWildCount() : 0, Math.random, opt);'));
  assert.ok(src.includes('const opt = { spawn: on ? w.spawn : 0, max: on ? w.max : 0, force: force, n: TYPE_COUNT };'));
  // dropAndRefill: 새 칸 종류는 여전히 planRefill 이 한꺼번에 정하고 열 순서대로 소비한다(교육용 방식 그대로)
  assert.ok(src.includes('const newTypes = planRefill(res.empties.reduce(function (a, b) { return a + b; }, 0));'));
  assert.ok(src.includes('const gem = createGem(newTypes[nk++], i - n, c, 0);'));
  // startStage: state.stage 뒤에 (CONFIG.level 에서 읽은 난이도 lv, 레벨 stage)만으로 정한다
  assert.ok(src.includes('state.stage = stage; state.board = boardParams(lv, stage);'));
  // resetState: 판이 바뀌면 비운다 + state 리터럴에 board: null
  assert.ok(src.includes('state.board = null; state.confirmFrom = null;'));
  assert.ok(src.includes('board: null, // 이번 스테이지의 보드 구조 등급 손잡이'));
  // 구조 함수 본문에 점수·시간·기록을 읽지 않는다
  const start = src.indexOf('function boardGrade(');
  const end = src.indexOf('function shuffleTypes(');
  assert.ok(start > 0 && end > start);
  assert.ok(!/state\.|save\.|timeLeft|score/.test(src.slice(start, end)), '구조 함수가 플레이어 상태를 읽음(I7)');
  // 합성 함수도 마찬가지(입력은 격자·? 수·손잡이·난수·옵션뿐)
  const a = src.indexOf('function pickRefillTypesStructured(');
  const b = src.indexOf('function boltTargets(');
  assert.ok(a > 0 && b > a);
  assert.ok(!/state\.|save\.|timeLeft|score|document|window/.test(src.slice(a, b)), '합성 함수가 플레이어 상태·DOM 을 읽음');
  // reshuffleBoard·shuffleTypes 는 구조 함수를 쓰지 않는다
  const rs = src.indexOf('async function reshuffleBoard()');
  assert.ok(rs > 0 && !src.slice(rs, rs + 600).includes('Structured'));
  assert.ok(!src.slice(src.indexOf('function shuffleTypes('), src.indexOf('function fireCells(')).includes('Structured'));
});

test('난이도 설명 문구: 기존 문장 뒤에 보드 구조 한 줄(spec §26.8), 일반용과 같다', () => {
  const d = G.CONFIG.difficulty;
  assert.strictEqual(d.easy.desc, '시간이 넉넉하고 스킬이 빨리 차요. 막히면 힌트가 자동으로 나와요. 같은 색이 모여 나와서 맞출 곳이 잘 보여요.');
  assert.strictEqual(d.normal.desc, '기본 규칙. 균형 잡힌 2분 승부! 보석이 고르게 나오는 기본 보드예요.');
  assert.strictEqual(d.hard.desc, '시간이 짧고 보너스가 적어요. 대신 점수 ×1.3! 보석이 흩어져 있어서 맞출 곳을 잘 찾아야 해요.');
  if (HAS_GEN) LEVELS.forEach((level) => assert.strictEqual(d[level].desc, GEN.CONFIG.difficulty[level].desc, level + ' 설명이 일반용과 다름'));
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

/* ===================================================================
 * ⑧ 교육용 전용 (spec §26.9 E1~E5): ? 먼저 정하고 나머지를 구조 규칙으로 채운다
 * =================================================================== */
test('⑧ 두 앱의 CONFIG.board 가 값·키 순서까지 같고, 구조 함수·표 소스 블록이 글자 그대로 같다', { skip: skipGen }, () => {
  assert.deepStrictEqual(G.CONFIG.board, GEN.CONFIG.board);
  assert.strictEqual(JSON.stringify(G.CONFIG.board), JSON.stringify(GEN.CONFIG.board), '키 순서까지 같아야 함');
  // 목표 점수(×1.2 파생)·CONFIG.edu 는 이 단계에서 바뀌지 않는다
  assert.deepStrictEqual(G.CONFIG.edu.wild, { spawn: 0.016, max: 2, guaranteeFirst: true });
  assert.strictEqual(G.CONFIG.edu.targetScale, 1.2);
  assert.deepStrictEqual(G.CONFIG.stages.targets, GEN.CONFIG.stages.targets);
  // 소스: CONFIG.board 블록(주석 포함)과 순수 함수 블록이 같다
  const cfgBlock = (s) => s.slice(s.indexOf('// spec §26.4(사용자 승인 2026-11-08'), s.indexOf('multReturn:'));
  assert.ok(cfgBlock(SRC).length > 1200, 'CONFIG.board 블록을 못 찾음');
  assert.strictEqual(cfgBlock(SRC), cfgBlock(SRC_GEN), 'CONFIG.board 소스가 일반용과 다름');
  const fnBlock = (s) => s.slice(s.indexOf('/* ---------- 보드 구조 등급 (spec §26.4)'), s.indexOf('/** 기존 종류 구성은 유지한 채 재배치.'));
  assert.ok(fnBlock(SRC).length > 4000, '순수 함수 블록을 못 찾음');
  assert.strictEqual(fnBlock(SRC), fnBlock(SRC_GEN), '순수 함수 6개(+보조 3개) 본문이 일반용과 다름');
  ['boardGrade', 'boardParams', 'completes', 'fillStructured', 'refillStructured', 'generateBoardStructured'].forEach((name) => {
    assert.strictEqual(typeof G[name], 'function', name);
    assert.strictEqual(typeof GEN[name], 'function', name);
  });
});

/** 합성 시험용 옵션: planRefill 이 pickRefillTypes 에 넘기는 모양 */
function wildOpt(spawn, max, force) { return { spawn: spawn, max: max, force: !!force, n: NT }; }

test('⑧ pickRefillTypesStructured: 새 칸 수·순서·값, 입력 격자 불변, 결정적', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(210000 + Math.round(row.s * 10));
    for (let i = 0; i < 300; i++) {
      const base = randomPartial(rnd);
      const keep = clone(base);
      const cells = emptyCells(base);
      const out = G.pickRefillTypesStructured(base, 0, row.P, mulberry(i + 1), wildOpt(0.3, 4, false));
      assert.deepStrictEqual(base, keep, '입력 격자를 바꿈');
      assert.strictEqual(out.length, cells.length, '새 칸 수');
      out.forEach((t) => assert.ok(Number.isInteger(t) && t >= 0 && t <= W, '값 ' + t));
      assert.deepStrictEqual(G.pickRefillTypesStructured(base, 0, row.P, mulberry(i + 1), wildOpt(0.3, 4, false)), out, '결정적이 아님');
      // 기존 칸은 그대로이고, 합쳐서 null 이 없다
      const full = clone(base);
      cells.forEach((p, k) => { full[p.r][p.c] = out[k]; });
      assert.strictEqual(holesOf(full), 0);
    }
  });
  // 빈 칸이 없으면 빈 배열(난수도 쓰지 않는다)
  const rng = countingRng(3);
  assert.deepStrictEqual(G.pickRefillTypesStructured(G.generateBoard(R, C, NT, mulberry(1)), 0, gradeRows()[0].P, rng, wildOpt(0.3, 4, true)), []);
  assert.strictEqual(rng.calls, 0);
});

test('⑧ E3 spawn=0 이면 ? 없이 구조만 — pickRefillTypes 를 부르지 않아 refillStructured 와 난수 소비·결과가 정확히 같다', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(220000 + Math.round(row.s * 10));
    for (let i = 0; i < 300; i++) {
      const base = randomPartial(rnd);
      const cells = emptyCells(base);
      const r1 = countingRng(i + 5);
      const r2 = countingRng(i + 5);
      // force·max 가 켜져 있어도 spawn=0 이면 ? 가 없다(planRefill 은 spawn=0 이면 force=false 로 넘긴다)
      const out = G.pickRefillTypesStructured(base, 0, row.P, r1, wildOpt(0, 6, true));
      const ref = G.refillStructured(base, row.P, r2);
      assert.deepStrictEqual(out, cells.map((p) => ref[p.r][p.c]), '구조만 쓴 결과와 다름');
      assert.strictEqual(r1.calls, r2.calls, '난수 소비가 다름(일반용과 같아야 함)');
      assert.ok(out.every((t) => t < NT), '? 가 나옴');
    }
  });
});

test('⑧ E1 ?는 기존 규칙으로 먼저 정한다 — ? 칸이 같은 시드의 pickRefillTypes 결과와 정확히 같다', () => {
  const rows = gradeRows();
  let withWild = 0;
  let cellsTotal = 0;
  [[0.016, 2, false], [0.016, 2, true], [0.1, 2, true], [0.3, 4, false], [0.3, 6, true], [1, 3, false]].forEach((cfg, ci) => {
    rows.forEach((row) => {
      const rnd = mulberry(230000 + ci * 17 + Math.round(row.s * 10));
      for (let i = 0; i < 120; i++) {
        const base = randomPartial(rnd);
        const cells = emptyCells(base);
        const w0 = Math.floor(rnd() * (cfg[1] + 1));                       // 보드에 이미 있는 ? 수 0..max
        const opt = wildOpt(cfg[0], cfg[1], cfg[2]);
        const ref = G.pickRefillTypes(cells.length, w0, mulberry(i * 3 + 1), opt);
        const out = G.pickRefillTypesStructured(base, w0, row.P, mulberry(i * 3 + 1), opt);
        assert.strictEqual(out.length, ref.length);
        for (let k = 0; k < ref.length; k++) assert.strictEqual(out[k] === W, ref[k] === W, '? 위치가 기존 규칙과 다름 (설정 ' + ci + ', 칸 ' + k + ')');
        cellsTotal += ref.length;
        if (ref.some((t) => t === W)) withWild++;
      }
    });
  });
  assert.ok(withWild > 200, '? 가 나온 경우가 너무 적어 시험이 헛돎: ' + withWild);
  assert.ok(cellsTotal > 10000);
});

test('⑧ E1 보드 위 ? 개수 ≤ max, 첫 행동 확정 등장(force)은 구조와 무관하게 유지', () => {
  const rows = gradeRows();
  let forcedChecked = 0;
  [[0.016, 2], [0.2, 2], [0.5, 4], [0.9, 6]].forEach((cfg, ci) => {
    rows.forEach((row) => {
      const rnd = mulberry(240000 + ci * 31 + Math.round(row.s * 10));
      for (let i = 0; i < 150; i++) {
        const base = randomPartial(rnd);
        const w0 = Math.floor(rnd() * (cfg[1] + 1));
        const force = rnd() < 0.5;
        const out = G.pickRefillTypesStructured(base, w0, row.P, mulberry(i + 7), wildOpt(cfg[0], cfg[1], force));
        const nNew = out.filter((t) => t === W).length;
        assert.ok(w0 + nNew <= cfg[1], '보드 위 ? ' + (w0 + nNew) + ' > max ' + cfg[1]);
        if (force && w0 < cfg[1] && out.length > 0) { forcedChecked++; assert.ok(nNew >= 1, '확정 등장이 안 나옴'); }
      }
    });
  });
  assert.ok(forcedChecked > 300, '확정 등장 사례가 너무 적음: ' + forcedChecked);
});

test('⑧ E1·E2 ? 를 먼저 놓은 칸은 구조 채움이 바꾸지 않고, 나머지 새 칸은 일반 보석(0~5)이다', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(250000 + Math.round(row.s * 10));
    let wilds = 0;
    for (let i = 0; i < 300; i++) {
      const base = randomPartial(rnd);
      const cells = emptyCells(base);
      const opt = wildOpt(0.25, 6, false);
      const ref = G.pickRefillTypes(cells.length, 0, mulberry(i + 1), opt);
      const out = G.pickRefillTypesStructured(base, 0, row.P, mulberry(i + 1), opt);
      cells.forEach((p, k) => {
        if (ref[k] === W) { assert.strictEqual(out[k], W); wilds++; } else assert.ok(out[k] >= 0 && out[k] < NT, '일반 칸이 ? 가 되었거나 범위 밖');
      });
    }
    assert.ok(wilds > 100, '? 가 거의 안 나와 시험이 헛돎: ' + wilds);
  });
});

test('⑧ E2 ?는 이웃 같은 색 세기에서 색으로 세지 않는다 — ?로 둘러싸인 칸은 pair 가 극단이어도 여섯 색이 균등', () => {
  // 가운데 칸만 비어 있고 위·아래·왼쪽·오른쪽이 모두 ? : 어떤 색도 이웃 같은 색이 아니므로(k = 0) 가중이 모두 1
  const P = { pair: 1000, auto: 0, lo: 0, hi: 99, tries: 1 };
  const count = new Array(NT).fill(0);
  const rnd = mulberry(8080);
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const g = [[0, W, 1], [W, null, W], [2, W, 3]];
    G.fillStructured(g, P, rnd);
    count[g[1][1]]++;
  }
  count.forEach((n, t) => assert.ok(Math.abs(n - N / NT) <= 120, '색 ' + t + ' 빈도 ' + n + ' (기대 ' + N / NT + ')'));
  // 대조(시험이 헛돌지 않는지): 같은 모양에서 이웃이 서로 다른 일반 보석이면 그 네 색(0·1·3·4)에 pair 가중이 걸린다 — 이웃이 아닌 2·5 보다 훨씬 많이 나온다
  const count2 = new Array(NT).fill(0);
  for (let i = 0; i < 3000; i++) {
    const g = [[0, 1, 2], [4, null, 3], [2, 0, 1]];
    G.fillStructured(g, { pair: 3, auto: 1, lo: 0, hi: 99, tries: 1 }, rnd);
    count2[g[1][1]]++;
  }
  [0, 1, 3, 4].forEach((t) => assert.ok(count2[t] > count2[2] * 2 && count2[t] > count2[5] * 2, '일반 보석 이웃에는 pair 가중이 걸려야 함: ' + count2.join(',')));
});

test('⑧ E2 auto=0 보장은 일반 보석끼리만 — ? 를 먼저 놓은 뒤 구조로 채워도 ? 가 낀 줄만 남고, 일반 보석만의 줄·2×2 는 없다', () => {
  let bridged = 0;
  let boards = 0;
  gradeRows().forEach((row) => {
    const rnd = mulberry(260000 + Math.round(row.s * 10));
    for (let i = 0; i < 1500; i++) {
      const base = topHoles(rnd);
      const work = clone(base);
      // 빈 칸 중 0~3개를 ? 로 먼저 놓는다
      const cells = emptyCells(work);
      const nW = Math.min(cells.length, Math.floor(rnd() * 4));
      for (let k = 0; k < nW; k++) { const p = cells[Math.floor(rnd() * cells.length)]; work[p.r][p.c] = W; }
      const w = G.countWild(work);
      G.fillStructured(work, row.P, mulberry(i + 3), 0);
      assert.strictEqual(G.countWild(work), w, '구조 채움이 ? 를 바꿈');
      const groups = G.findMatches(work);
      groups.forEach((gr) => assert.ok(gr.wilds >= 1, row.level + ' ' + row.key + ' ? 없이 일반 보석만으로 이뤄진 매치(auto=0 위반)'));
      if (groups.length) bridged++;
      boards++;
    }
  });
  assert.ok(boards > 10000);
  assert.ok(bridged > 0, '? 가 이어 준 줄이 한 번도 안 나와 시험이 헛돎');
});

test('⑧ I5·E1 색 대칭은 ? 가 섞여도 유지된다(일반 칸의 여섯 색 빈도 16.7±1%p)', () => {
  gradeRows().forEach((row) => {
    const rnd = mulberry(270000 + Math.round(row.s * 10));
    const count = new Array(NT).fill(0);
    let total = 0;
    for (let i = 0; i < 1200; i++) {
      const base = randomPartial(rnd);
      const cells = emptyCells(base);
      const out = G.pickRefillTypesStructured(base, 0, row.P, mulberry(i + 11), wildOpt(0.2, 6, false));
      out.forEach((t) => { if (t < NT) { count[t]++; total++; } });
      assert.strictEqual(out.length, cells.length);
    }
    count.forEach((n, t) => {
      const pct = 100 * n / total;
      assert.ok(Math.abs(pct - 100 / 6) <= 1.2, row.level + ' ' + row.key + ' 색 ' + t + ' = ' + pct.toFixed(2) + '%');
    });
  });
});

/** dropAndRefill·planRefill 흐름의 순수 판본: 한 번 교환 -> 지우기 -> 중력 -> 새 칸 종류 정하기(P 가 있으면 합성, 없으면 기존) 를 안정될 때까지 되풀이 */
function settle(g, rng, P, opt, st) {
  let guard = 0;
  for (;;) {
    const groups = G.findMatches(g);
    if (!groups.length) break;
    assert.ok(guard++ < 200, '연쇄가 끝나지 않음');
    G.uniqueCells(groups).forEach((p) => { g[p.r][p.c] = null; });
    G.applyGravity(g);
    const count = holesOf(g);
    const wOn = G.countWild(g);
    const on = opt.spawn > 0;
    const force = on && opt.guaranteeFirst && !st.firstDone && count > 0;
    if (force) st.firstDone = true;
    const o = { spawn: on ? opt.spawn : 0, max: on ? opt.max : 0, force: force, n: NT };
    const types = P ? G.pickRefillTypesStructured(g, on ? wOn : 0, P, rng, o) : G.pickRefillTypes(count, on ? wOn : 0, rng, o);
    assert.strictEqual(types.length, count);
    let k = 0;
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (g[r][c] == null) g[r][c] = types[k++];
    st.chain = Math.max(st.chain, guard);
  }
}

test('⑧ 한 판 흐름(교환 -> 연쇄 -> 재섞기)을 순수 함수로 되풀이해도 null·범위 밖·매치 잔류·유효한 수 없음 0건, ? 개수 ≤ max, 재섞기가 폭증하지 않는다', () => {
  const opt = { spawn: G.CONFIG.edu.wild.spawn, max: G.CONFIG.edu.wild.max, guaranteeFirst: true };
  const spots = [['easy', 1], ['easy', 5], ['easy', 10], ['normal', 1], ['normal', 5], ['normal', 10], ['hard', 1], ['hard', 5], ['hard', 10]];
  let actions = 0;
  let reshuffles = 0;
  let maxWild = 0;
  let wildSeen = 0;
  let games = 0;
  spots.forEach((sp, si) => {
    const P = G.boardParams(sp[0], sp[1]);
    for (let gi = 0; gi < 14; gi++) {
      const rng = mulberry(900000 + si * 100 + gi);
      const pick = mulberry(500000 + si * 100 + gi);
      const g = P ? G.generateBoardStructured(R, C, P, rng) : G.generateBoard(R, C, NT, rng);
      assert.strictEqual(G.countWild(g), 0, '시작 보드에 ?');
      const st = { firstDone: false, chain: 0 };
      games++;
      for (let a = 0; a < 40; a++) {
        const moves = G.listMoves(g);
        assert.ok(moves.length > 0, '유효한 수가 없는데 재섞지 않음');
        const m = moves[Math.floor(pick() * moves.length)];
        const t = g[m.a.r][m.a.c]; g[m.a.r][m.a.c] = g[m.b.r][m.b.c]; g[m.b.r][m.b.c] = t;
        settle(g, rng, P, opt, st);
        actions++;
        const flat = [].concat.apply([], g);
        assert.ok(flat.every((v) => Number.isInteger(v) && v >= 0 && v <= W), '빈 칸/범위 밖');
        assert.strictEqual(G.findMatches(g).length, 0, '정산 뒤 매치가 남음');
        const nw = G.countWild(g);
        maxWild = Math.max(maxWild, nw);
        if (nw > 0) wildSeen++;
        assert.ok(nw <= opt.max, '보드 위 ? ' + nw + ' > max');
        if (!G.hasValidMove(g)) {                                    // 행동이 끝났을 때 맞출 곳이 없으면 재섞기(shuffleTypes 는 구조를 쓰지 않는다)
          const s = G.shuffleTypes(g, rng);
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) g[r][c] = s[r][c];
          reshuffles++;
          assert.ok(G.hasValidMove(g) && G.findMatches(g).length === 0, '재섞기 뒤 보드가 올바르지 않음');
          assert.strictEqual(G.countWild(g), G.countWild(s));
        }
      }
    }
  });
  assert.ok(games >= 120, '판 수 ' + games);
  assert.ok(actions >= 5000, '행동 수 ' + actions);
  assert.ok(wildSeen > 20, '? 가 나온 행동이 너무 적음: ' + wildSeen);
  assert.ok(maxWild >= 1 && maxWild <= opt.max);
  assert.ok(reshuffles <= actions * 0.04, '재섞기 ' + reshuffles + '/' + actions + ' 가 4% 를 넘음');
});
