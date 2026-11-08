/* 교육용 엔진 시험: ? 선물상자(조커) 규칙 (spec §21.7·§21.8·§21.10·§21.11).
 * 실행: node --test apps/element-gems-edu/test/   (전체 약 1분 이내)
 *
 * 구성
 *  1) 순수 로직(DOM 없음): 매치 규칙 경계 사례, wouldMatch·힌트, 초기 보드·재섞기, 스폰·한도·첫 등장 보장, 번개 대상, 보너스·목표 점수, 저장 edu 필드
 *  2) 일반용과의 동일성: ?가 없는 보드 10,000개에서 새 함수와 일반용(apps/element-gems, 읽기 전용) 결과가 완전히 같다
 *  3) 가짜 DOM + 가상 시계로 실제 game.js 를 실행하는 하네스: 문제 흐름(시계 정지·순서·보너스), 스킬 6종에서 문제 0건,
 *     spawn=0 이면 일반용과 한 판 전체가 똑같이 흘러감, 봇 1,000판(? 보드의 스킬·연쇄·재섞기·힌트가 오류 없이 끝남)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const G = require(path.join(root, 'game.js'));
const GEN_PATH = path.join(root, '..', 'element-gems', 'game.js');
const HAS_GEN = fs.existsSync(GEN_PATH);
const GEN = HAS_GEN ? require(GEN_PATH) : null;      // 일반용: 읽기 전용으로 불러오기만 한다
const W = G.WILD;

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const key = (cells) => cells.map((p) => p.r + ',' + p.c).sort().join(' ');

/* ===================================================================
 * 1) 상수·설정
 * =================================================================== */
test('WILD=6 은 일반 보석 6종 다음 번호이고 TYPE_COUNT 는 그대로 6', () => {
  assert.strictEqual(G.WILD, 6);
  assert.strictEqual(G.CONFIG.types.length, 6);
  assert.strictEqual(G.WILD, G.CONFIG.types.length);
});

test('CONFIG.edu: 스폰·보너스·목표 배율·저장 키가 spec §21.7·§21.8 값', () => {
  const e = G.CONFIG.edu;
  assert.deepStrictEqual(e.wild, { spawn: 0.016, max: 2, guaranteeFirst: true });
  assert.strictEqual(e.bonus.base, 300);
  assert.deepStrictEqual(e.bonus.mult, { easy: 0.8, normal: 1.0, hard: 1.3 });
  assert.strictEqual(e.targetScale, 1.2);
  assert.strictEqual(e.targetRound, 100);
  assert.strictEqual(e.storageKey, 'element-gems-edu:v1');
  assert.strictEqual(e.quiz.maxPerAction, 3);
  assert.strictEqual(e.quiz.gapMs, 400);
  assert.strictEqual(e.text.wildLabel.indexOf('선물상자(물음표)') !== -1, true);
});

test('정답 보너스: 초보 240 / 중수 300 / 고수 390 (10점 단위 반올림)', () => {
  assert.strictEqual(G.bonusFor('easy'), 240);
  assert.strictEqual(G.bonusFor('normal'), 300);
  assert.strictEqual(G.bonusFor('hard'), 390);
  assert.strictEqual(G.bonusFor(), G.bonusFor(G.CONFIG.level));
});

test('교육용 목표 점수 = 일반용 × 1.2 (100점 반올림): spec §22.2.4 표(안 B 파생값)와 30칸 모두 같다', () => {
  const table = {
    easy: [4800, 5400, 5800, 6200, 6700, 7300, 8000, 8800, 9700, 11200],
    normal: [6600, 7600, 8200, 8600, 9400, 10000, 10700, 11400, 12200, 13200],
    hard: [7300, 8300, 9000, 9500, 10300, 10900, 11800, 12600, 13400, 14500]
  };
  ['easy', 'normal', 'hard'].forEach((lv) => {
    for (let s = 1; s <= 10; s++) {
      assert.strictEqual(G.stageTarget(lv, s), table[lv][s - 1], lv + ' ' + s);
      assert.strictEqual(G.stageTarget(lv, s) % 100, 0);
      // 일반용 목표 원본을 쓰는 곳은 CONFIG.stages.targets 뿐이다
      assert.strictEqual(G.stageTarget(lv, s), Math.round(G.CONFIG.stages.targets[lv][s - 1] * 1.2 / 100) * 100);
    }
  });
  assert.strictEqual(G.stageTarget('normal', 0), 0);
  assert.strictEqual(G.stageTarget('normal', 11), 0);
  assert.strictEqual(G.stageTarget('nope', 1), 0);
});

/* ===================================================================
 * 2) 매치 규칙 (§21.7.2) — 경계 사례
 * =================================================================== */
const g1 = (...v) => [v];     // 1행 보드

test('A ? A -> A 그룹(크기 3, ? 1개)', () => {
  const gr = G.findMatches(g1(0, W, 0));
  assert.strictEqual(gr.length, 1);
  assert.deepStrictEqual([gr[0].type, gr[0].size, gr[0].wilds], [0, 3, 1]);
});

test('? ? A -> A 그룹(크기 3, ? 2개)', () => {
  const gr = G.findMatches(g1(W, W, 0));
  assert.strictEqual(gr.length, 1);
  assert.deepStrictEqual([gr[0].type, gr[0].size, gr[0].wilds], [0, 3, 2]);
  const gr2 = G.findMatches(g1(0, W, W));
  assert.deepStrictEqual([gr2[0].type, gr2[0].size, gr2[0].wilds], [0, 3, 2]);
});

test('? ? ? (진짜 보석 없음) -> 매치 아님. 가로·세로·2×2 모두', () => {
  assert.strictEqual(G.findMatches(g1(W, W, W)).length, 0);
  assert.strictEqual(G.findMatches([[W], [W], [W]]).length, 0);
  assert.strictEqual(G.findMatches([[W, W], [W, W]]).length, 0);
  assert.strictEqual(G.findMatches([[W, W, W, W]]).length, 0);
  assert.strictEqual(G.hasValidMove([[W, W, W]]), false);
});

test('A ? B -> 매치 아님(진짜 보석이 서로 다르고 줄이 3칸이 안 됨)', () => {
  assert.strictEqual(G.findMatches(g1(0, W, 1)).length, 0);
});

test('A A ? B B -> A 그룹과 B 그룹이 동시에 성립, ?는 한 번만 지워짐', () => {
  const g = g1(0, 0, W, 1, 1);
  const gr = G.findMatches(g);
  assert.strictEqual(gr.length, 2);
  assert.deepStrictEqual(gr.map((x) => [x.type, x.size, x.wilds]), [[0, 3, 1], [1, 3, 1]]);
  assert.strictEqual(G.uniqueCells(gr).length, 5);              // 칸 5개를 지운다(? 는 한 번)
  assert.strictEqual(G.wildCellsOfGroups(gr, g).length, 1);     // 문제 1개
  // 점수·게이지·시간은 그룹마다(각각 크기 3)
  assert.strictEqual(G.baseScore(gr[0].size) + G.baseScore(gr[1].size), 100);
  assert.strictEqual(G.gaugeGain(gr[0].size) + G.gaugeGain(gr[1].size), 6);
});

test('A A ? A A -> A 하나의 그룹(크기 5)', () => {
  const gr = G.findMatches(g1(0, 0, W, 0, 0));
  assert.strictEqual(gr.length, 1);
  assert.deepStrictEqual([gr[0].type, gr[0].size, gr[0].wilds], [0, 5, 1]);
});

test('A A ? ? B B -> A 그룹(AA??)·B 그룹(??BB) 크기 4, ? 2개는 각각 한 번씩만 지움', () => {
  const g = g1(0, 0, W, W, 1, 1);
  const gr = G.findMatches(g);
  assert.deepStrictEqual(gr.map((x) => [x.type, x.size, x.wilds]), [[0, 4, 2], [1, 4, 2]]);
  assert.strictEqual(G.uniqueCells(gr).length, 6);
  assert.strictEqual(G.wildCellsOfGroups(gr, g).length, 2);
});

test('긴 줄 ? ? ? A -> 한 줄은 끊기지 않은 구간이므로 A 그룹(크기 4, ? 3개)', () => {
  const gr = G.findMatches(g1(W, W, W, 0));
  assert.deepStrictEqual(gr.map((x) => [x.type, x.size, x.wilds]), [[0, 4, 3]]);
});

test('십자: ?를 가운데로 가로(A A ? B B)·세로(C C ? D D)가 걸치면 그룹 4개, ?는 한 번 지움', () => {
  const g = [
    [4, 5, 2, 5, 4],
    [5, 4, 2, 4, 5],
    [0, 0, W, 1, 1],
    [5, 4, 3, 4, 5],
    [4, 5, 3, 5, 4]
  ];
  const gr = G.findMatches(g);
  assert.deepStrictEqual(gr.map((x) => [x.type, x.size, x.wilds]).sort(), [[0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 3, 1]]);
  assert.strictEqual(G.uniqueCells(gr).length, 9);
  assert.strictEqual(G.wildCellsOfGroups(gr, g).length, 1);
});

test('2×2: ? 1개 + A 3개 -> A 그룹 4 / ? 2개 + A 2개 -> A 그룹 4 / ? 4개 -> 없음', () => {
  assert.deepStrictEqual(G.findMatches([[0, 0], [0, W]]).map((x) => [x.type, x.size, x.wilds]), [[0, 4, 1]]);
  assert.deepStrictEqual(G.findMatches([[0, 0], [W, W]]).map((x) => [x.type, x.size, x.wilds]), [[0, 4, 2]]);
  assert.deepStrictEqual(G.findMatches([[W, 0], [0, W]]).map((x) => [x.type, x.size, x.wilds]), [[0, 4, 2]]);
  assert.deepStrictEqual(G.findMatches([[W, W], [W, W]]), []);
  assert.strictEqual(G.squareAt([[0, 0], [0, W]], 1, 1), true);     // ? 칸에서 본 정사각형
  assert.strictEqual(G.squareAt([[W, W], [W, W]], 0, 0), false);
});

test('보드 가장자리·모서리: 왼쪽 가장자리 줄, 오른쪽 아래 모서리 세로 줄, 모서리 2×2', () => {
  const left = [[W, 0, 0], [1, 2, 1], [2, 1, 2]];
  assert.deepStrictEqual(G.findMatches(left).map((x) => [x.type, x.size, x.wilds]), [[0, 3, 1]]);
  const corner = [[1, 2, 0], [2, 1, 0], [1, 2, W]];
  assert.deepStrictEqual(G.findMatches(corner).map((x) => [x.type, x.size, x.wilds]), [[0, 3, 1]]);
  const sq = [[1, 2, 3], [2, 3, 0], [3, 0, 0]];
  assert.strictEqual(G.findMatches(sq).length, 0);
  sq[1][1] = W;
  assert.deepStrictEqual(G.findMatches(sq).map((x) => [x.type, x.size, x.wilds]), [[0, 4, 1]]);
});

test('? 하나가 같은 종류의 두 줄을 이어 주면 하나의 그룹(연결 요소)', () => {
  // 가로 A ? A, 세로 A ? A 가 같은 ? 칸에서 만나 십자 모양 크기 5
  const g = [
    [1, 2, 3, 1, 2],
    [2, 1, 0, 3, 1],
    [3, 0, W, 0, 3],
    [1, 2, 0, 1, 2],
    [2, 3, 1, 2, 3]
  ];
  const gr = G.findMatches(g);
  const a = gr.filter((x) => x.type === 0);
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].size, 5);       // (1,2)(2,1)(2,2)(2,3)(3,2) 십자
});

test('lineAt·squareAt: ? 칸은 6종 모두 검사, 줄 안에 진짜 보석이 있어야 함', () => {
  const g = [[0, 0, W, 1]];
  assert.strictEqual(G.lineAt(g, 0, 2), true);
  assert.strictEqual(G.lineAt(g, 0, 0), true);
  assert.strictEqual(G.lineAt(g, 0, 3), false);
  assert.strictEqual(G.lineAt([[W, W, W]], 0, 1), false);
  assert.strictEqual(G.lineAt([[W, W, 0, 1]], 0, 0), true);        // ? ? A : A 그룹
  assert.strictEqual(G.lineAt([[W, W, 0, 1]], 0, 3), false);
});

test('lineAt: ? 1 ? 는 진짜 B 가 있으므로 매치(B 그룹)', () => {
  assert.strictEqual(G.lineAt([[W, 1, W]], 0, 1), true);
  assert.strictEqual(G.findMatches([[W, 1, W]])[0].type, 1);
});

/* ===================================================================
 * 3) wouldMatch (유효한 수 검사)
 * =================================================================== */
test('wouldMatch: ?↔일반 교환이 유효한 사례(? 가 줄에 합류)', () => {
  const g = [
    [0, 0, 1],
    [2, 3, W]
  ];
  assert.strictEqual(G.wouldMatch(g, 0, 2, 1, 2), true);          // ? 가 위로 올라가 A A ? 가 됨
  assert.deepStrictEqual(g, [[0, 0, 1], [2, 3, W]]);              // 원본은 변하지 않음
});

test('wouldMatch: 교환 뒤 일반 보석 쪽에서만 매치되는 사례', () => {
  const g = [
    [0, 0, 1],
    [W, 3, 0]
  ];
  assert.strictEqual(G.wouldMatch(g, 0, 2, 1, 2), true);          // A 가 위로 올라가 A A A
  const after = [[0, 0, 0], [W, 3, 1]];
  assert.strictEqual(G.lineAt(after, 0, 2), true);
  assert.strictEqual(G.lineAt(after, 1, 2), false);
});

test('wouldMatch: 교환해도 매치가 안 생기면 무효, ?↔? 교환도 무효', () => {
  assert.strictEqual(G.wouldMatch([[0, 1, 2], [3, 4, 5]], 0, 0, 0, 1), false);
  assert.strictEqual(G.wouldMatch([[W, W, 0], [1, 2, 3]], 0, 0, 0, 1), false);    // ?↔? : 변화 없음
  assert.strictEqual(G.wouldMatch([[W, 0, 0], [1, 2, 3]], 0, 0, 0, 1), true);     // ?↔A : 교환하면 A ? A
});

test('wouldMatch: ? 를 쓰는 2×2 완성 교환', () => {
  const g = [
    [0, 0, 3],
    [0, 1, W],
    [2, 3, 1]
  ];
  assert.strictEqual(G.wouldMatch(g, 1, 1, 1, 2), true);          // ? 가 (1,1)로 들어와 A A / A ? 정사각형
});

test('findMatches 와 wouldMatch/lineAt 은 같은 규칙: ? 있는 무작위 보드 4,000개에서 모든 인접 교환이 일치', () => {
  const rng = mulberry(20260801);
  let withWild = 0;
  let validMoves = 0;
  let wildMoves = 0;
  for (let k = 0; k < 4000; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    const nw = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nw; i++) g[Math.floor(rng() * 8)][Math.floor(rng() * 8)] = W;
    if (G.findMatches(g).length) continue;                      // 시작 보드는 매치 없음이어야 한다
    withWild++;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        [[0, 1], [1, 0]].forEach((d) => {
          const r2 = r + d[0];
          const c2 = c + d[1];
          if (r2 >= 8 || c2 >= 8) return;
          const predicted = G.wouldMatch(g, r, c, r2, c2);
          const h = g.map((row) => row.slice());
          const t = h[r][c]; h[r][c] = h[r2][c2]; h[r2][c2] = t;
          const actual = G.findMatches(h).length > 0;
          assert.strictEqual(predicted, actual, 'board ' + k + ' swap ' + r + ',' + c + ' -> ' + r2 + ',' + c2);
          if (actual) { validMoves++; if (g[r][c] === W || g[r2][c2] === W) wildMoves++; }
        });
      }
    }
  }
  assert.ok(withWild > 800, '시험 보드 수 ' + withWild);
  assert.ok(wildMoves > 500, '? 를 쓰는 유효한 수 ' + wildMoves + ' / ' + validMoves);
});

test('힌트: ? 를 쓰는 수도 제안하고, 그 수를 두면 실제로 매치된다', () => {
  const rng = mulberry(77);
  let sawWildHint = 0;
  for (let k = 0; k < 3000; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    for (let i = 0; i < 2; i++) g[Math.floor(rng() * 8)][Math.floor(rng() * 8)] = W;
    if (G.findMatches(g).length || !G.hasValidMove(g)) continue;
    const h = G.findHint(g, rng);
    assert.ok(h, '유효한 수가 있는데 힌트가 없음');
    const x = g[h.a.r][h.a.c];
    const y = g[h.b.r][h.b.c];
    if (x === W || y === W) sawWildHint++;
    const after = g.map((row) => row.slice());
    after[h.a.r][h.a.c] = y;
    after[h.b.r][h.b.c] = x;
    assert.ok(G.findMatches(after).length > 0, '힌트 수가 매치되지 않음');
    assert.ok(G.listMoves(g).some((m) => m.a.r === h.a.r && m.a.c === h.a.c && m.b.r === h.b.r && m.b.c === h.b.c));
  }
  assert.ok(sawWildHint > 50, '? 를 쓰는 힌트가 거의 안 나옴: ' + sawWildHint);
});

test('?가 있는 보드에서 ?를 쓰는 수만 남은 경우도 유효한 수로 인정', () => {
  // 유일한 유효한 수가 ?↔일반 교환 하나인 보드
  const g = [
    [0, 1, 2],
    [1, 2, 0],
    [2, W, 1]
  ];
  assert.strictEqual(G.findMatches(g).length, 0);
  // ? 를 위로 올리면 가운데 열 1 2 ... 이 되는지 직접 확인
  const moves = G.listMoves(g);
  moves.forEach((m) => {
    const h = g.map((row) => row.slice());
    const t = h[m.a.r][m.a.c]; h[m.a.r][m.a.c] = h[m.b.r][m.b.c]; h[m.b.r][m.b.c] = t;
    assert.ok(G.findMatches(h).length > 0);
  });
  assert.strictEqual(G.hasValidMove(g), moves.length > 0);
});

/* ===================================================================
 * 4) 초기 보드·재섞기
 * =================================================================== */
test('초기 보드 500개: ? 없음, 매치 0, 유효한 수 >= 1', () => {
  const rng = mulberry(500);
  for (let k = 0; k < 500; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    assert.strictEqual(G.countWild(g), 0);
    assert.strictEqual(G.hasWild(g), false);
    assert.strictEqual(G.findMatches(g).length, 0);
    assert.ok(G.hasValidMove(g));
  }
});

test('재섞기 200회(? 2개 포함): 매치 0, 유효한 수 >= 1, ? 개수 보존', () => {
  const rng = mulberry(200);
  for (let k = 0; k < 200; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    let placed = 0;
    while (placed < 2) {
      const r = Math.floor(rng() * 8);
      const c = Math.floor(rng() * 8);
      if (g[r][c] !== W) { g[r][c] = W; placed++; }
    }
    const out = G.shuffleTypes(g, rng);
    assert.strictEqual(G.findMatches(out).length, 0, 'shuffle ' + k);
    assert.ok(G.hasValidMove(out), 'shuffle ' + k);
    assert.strictEqual(G.countWild(out), 2, 'shuffle ' + k);
    // 종류 구성 보존
    const count = (b) => { const m = {}; b.forEach((row) => row.forEach((v) => { m[v] = (m[v] || 0) + 1; })); return JSON.stringify(m); };
    assert.strictEqual(count(out), count(g));
  }
});

/* ===================================================================
 * 5) 스폰·한도·첫 등장 보장 (pickRefillTypes)
 * =================================================================== */
test('스폰: spawn=0 이면 ? 가 한 번도 안 나오고, 난수 소비가 일반 무작위와 완전히 같다', () => {
  const seedA = mulberry(9);
  const seedB = mulberry(9);
  for (let k = 0; k < 2000; k++) {
    const n = 3 + (k % 20);
    const types = G.pickRefillTypes(n, 0, seedA, { spawn: 0, max: 2, force: false, n: 6 });
    const plain = [];
    for (let i = 0; i < n; i++) plain.push(Math.floor(seedB() * 6));
    assert.deepStrictEqual(types, plain);
  }
  assert.strictEqual(seedA(), seedB());       // 난수열 위치도 같다
});

test('스폰: 확률 p = 1.6% 근처(한도 없이), 보드 위 ? 는 max(=2) 를 넘지 않음(리필 10,000회)', () => {
  const rng = mulberry(1600);
  let total = 0;
  let wilds = 0;
  for (let k = 0; k < 20000; k++) {
    const n = 3 + (k % 18);
    const out = G.pickRefillTypes(n, 0, rng, { spawn: 0.016, max: 1e9, force: false, n: 6 });
    total += n;
    wilds += out.filter((t) => t === W).length;
    out.forEach((t) => assert.ok(t >= 0 && t <= W));
  }
  const rate = wilds / total;
  assert.ok(rate > 0.0145 && rate < 0.0175, '스폰 비율 ' + rate);

  let board = 0;
  let maxSeen = 0;
  for (let k = 0; k < 10000; k++) {
    const n = 3 + Math.floor(rng() * 20);
    const out = G.pickRefillTypes(n, board, rng, { spawn: 0.3, max: 2, force: false, n: 6 });
    board += out.filter((t) => t === W).length;
    maxSeen = Math.max(maxSeen, board);
    assert.ok(board <= 2, '보드 위 ? 가 max 초과: ' + board);
    if (rng() < 0.4) board = Math.max(0, board - 1 - Math.floor(rng() * 2));     // 가끔 지워진다
  }
  assert.strictEqual(maxSeen, 2);
});

test('스폰: 이미 max 개면 더 안 나오고, 확정 등장(force)은 max 안에서만', () => {
  const rng = mulberry(5);
  const full = G.pickRefillTypes(30, 2, rng, { spawn: 1, max: 2, force: true, n: 6 });
  assert.strictEqual(full.filter((t) => t === W).length, 0);
  for (let k = 0; k < 3000; k++) {
    const n = 3 + (k % 18);
    const out = G.pickRefillTypes(n, 0, rng, { spawn: 1, max: 2, force: true, n: 6 });
    assert.strictEqual(out.filter((t) => t === W).length, 2, '확률 100% 인데 max=2 를 지켜야 함');
    const out1 = G.pickRefillTypes(n, 0, rng, { spawn: 0.5, max: 1, force: true, n: 6 });
    assert.strictEqual(out1.filter((t) => t === W).length, 1, '확정 1개 + 확률 칸은 max=1 이라 더 못 나옴');
  }
});

test('스폰: 첫 행동 확정 등장 — force 이면 새 칸 중 정확히 하나는 ? (확률 0 이어도)', () => {
  const rng = mulberry(11);
  for (let k = 0; k < 2000; k++) {
    const n = 3 + (k % 18);
    const out = G.pickRefillTypes(n, 0, rng, { spawn: 0.0001, max: 2, force: true, n: 6 });
    assert.ok(out.filter((t) => t === W).length >= 1);
  }
  // force 위치가 앞/뒤 어디든 나올 수 있음
  const pos = new Set();
  for (let k = 0; k < 400; k++) pos.add(G.pickRefillTypes(5, 0, rng, { spawn: 0, max: 2, force: true, n: 6 }).indexOf(W));
  assert.strictEqual(pos.size, 5);
});

/* ===================================================================
 * 6) 스킬과 ? — 순수 부분
 * =================================================================== */
test('번개: 색은 진짜 6색 중에서만 고르고 ? 는 대상이 아니다', () => {
  const rng = mulberry(33);
  for (let k = 0; k < 2000; k++) {
    const g = G.generateBoard(8, 8, 6, rng);
    const nw = Math.floor(rng() * 6);
    for (let i = 0; i < nw; i++) g[Math.floor(rng() * 8)][Math.floor(rng() * 8)] = W;
    const pick = G.boltTargets(g, 8, rng);
    assert.ok(pick);
    assert.ok(pick.color >= 0 && pick.color <= 5);
    assert.ok(pick.targets.length >= 1 && pick.targets.length <= 8);
    pick.targets.forEach((p) => assert.strictEqual(g[p.r][p.c], pick.color));
    assert.strictEqual(new Set(pick.targets.map((p) => p.r * 8 + p.c)).size, pick.targets.length);
  }
  assert.strictEqual(G.boltTargets([[W, W], [W, W]], 8, Math.random), null);       // 고를 색이 없으면 null
});

test('번개: ? 가 없으면 일반용 skillLightning 과 같은 난수 호출 순서(색 고르기 + 섞기)', () => {
  const rng1 = mulberry(4);
  const rng2 = mulberry(4);
  const g = G.generateBoard(8, 8, 6, mulberry(1));
  const pick = G.boltTargets(g, 8, rng1);
  // 일반용 알고리즘 그대로
  const present = [];
  g.forEach((row) => row.forEach((t) => { if (t != null && present.indexOf(t) === -1) present.push(t); }));
  const color = present[Math.floor(rng2() * present.length)];
  const all = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] === color) all.push({ r, c });
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng2() * (i + 1)); const t = all[i]; all[i] = all[j]; all[j] = t; }
  assert.deepStrictEqual(pick.targets, all.slice(0, 8));
});

/* ===================================================================
 * 7) 저장: edu 필드 보존·병합
 * =================================================================== */
test('저장: 키는 element-gems-edu:v1, edu 필드는 모양만 확인하고 그대로 보존(왕복 불변)', () => {
  const sv = G.defaultSave();
  assert.deepStrictEqual(sv.edu, {});
  sv.edu = { unit: 'soc-5-2-1-1', pool: { 'soc-5-2-1-1': { order: [3, 1, 2], pos: 1 } }, stats: { 'soc-5-2-1-1': { asked: 4, right: 3 } } };
  const again = G.parseSave(JSON.stringify(sv));
  assert.deepStrictEqual(again.edu, sv.edu);
  assert.strictEqual(JSON.stringify(G.parseSave(JSON.stringify(again))), JSON.stringify(again));     // 멱등
  [null, [], 'x', 3, true].forEach((bad) => {
    const o = JSON.parse(JSON.stringify(sv));
    o.edu = bad;
    assert.deepStrictEqual(G.parseSave(JSON.stringify(o)).edu, {});
  });
  const huge = JSON.parse(JSON.stringify(sv));
  huge.edu = { pad: 'x'.repeat(G.CONFIG.edu.saveEduMaxChars + 10) };
  assert.deepStrictEqual(G.parseSave(JSON.stringify(huge)).edu, {});
});

test('저장: resolveEduField — edu.js 가 저장소에 직접 쓴 값 보존, 메모리가 바뀌었으면 메모리 우선', () => {
  const synced = JSON.stringify({ unit: 'a' });
  // (B) 메모리 edu 가 마지막 동기 값과 같고 저장소에 다른 값 -> 저장소 값(edu.js 가 직접 씀)
  let r = G.resolveEduField({ unit: 'a' }, synced, JSON.stringify({ edu: { unit: 'b' } }));
  assert.deepStrictEqual(r.edu, { unit: 'b' });
  assert.strictEqual(r.json, JSON.stringify({ unit: 'b' }));
  // (A) 메모리 edu 를 고쳤으면 메모리 값
  r = G.resolveEduField({ unit: 'c' }, synced, JSON.stringify({ edu: { unit: 'b' } }));
  assert.deepStrictEqual(r.edu, { unit: 'c' });
  // 저장소가 비었거나 깨졌으면 메모리 값
  [null, '', '{', '[]', 'null', '"x"'].forEach((raw) => {
    assert.deepStrictEqual(G.resolveEduField({ unit: 'a' }, synced, raw).edu, { unit: 'a' }, String(raw));
  });
  // 저장소에 edu 필드가 없으면 {}
  assert.deepStrictEqual(G.resolveEduField({ unit: 'a' }, synced, JSON.stringify({ level: 'easy' })).edu, {});
});

/* ===================================================================
 * 8) 일반용과의 동일성 (? 없는 보드)
 * =================================================================== */
const skipGen = HAS_GEN ? false : '일반용(apps/element-gems)이 없음';

function randomBoard(rng, density) {
  const R = 8;
  const C = 8;
  const g = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < C; c++) row.push(Math.floor(rng() * density));
    g.push(row);
  }
  if (rng() < 0.2) {                       // 가끔 빈 칸(null)도 섞는다
    const n = 1 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) g[Math.floor(rng() * R)][Math.floor(rng() * C)] = null;
  }
  return g;
}
const shape = (groups) => groups.map((x) => ({ type: x.type, size: x.size, cells: x.cells }));

test('동일성: ? 없는 같은 시드 보드 10,000개 — findMatches(분기·원본·? 경로 모두) 결과가 일반용과 완전히 같다', { skip: skipGen }, () => {
  const rng = mulberry(424242);
  for (let k = 0; k < 10000; k++) {
    const g = randomBoard(rng, k % 3 === 0 ? 3 : k % 3 === 1 ? 4 : 6);
    const expected = GEN.findMatches(g);
    assert.deepStrictEqual(shape(G.findMatches(g)), shape(expected), 'findMatches ' + k);
    assert.deepStrictEqual(shape(G.findMatchesPlain(g)), shape(expected), 'plain ' + k);
    assert.deepStrictEqual(shape(G.findMatchesWild(g)), shape(expected), 'wild path ' + k);     // ? 경로도 ? 없는 보드에서는 같은 순서·같은 칸
    G.findMatches(g).forEach((x) => assert.strictEqual(x.wilds, 0));
  }
});

test('동일성: ? 없는 보드 3,000개 — lineAt·squareAt·listMoves·hasValidMove 가 일반용과 같다', { skip: skipGen }, () => {
  const rng = mulberry(31337);
  for (let k = 0; k < 3000; k++) {
    const g = randomBoard(rng, 3 + (k % 4));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        assert.strictEqual(G.lineAt(g, r, c), GEN.lineAt(g, r, c), 'lineAt ' + k + ' ' + r + ',' + c);
        assert.strictEqual(G.squareAt(g, r, c), GEN.squareAt(g, r, c), 'squareAt ' + k + ' ' + r + ',' + c);
      }
    }
    const clean = g.map((row) => row.map((v) => v == null ? 0 : v));
    assert.deepStrictEqual(G.listMoves(clean), GEN.listMoves(clean), 'listMoves ' + k);
    assert.strictEqual(G.hasValidMove(clean), GEN.hasValidMove(clean), 'hasValidMove ' + k);
  }
});

test('동일성: generateBoard·shuffleTypes·applyGravity·findHint 는 같은 시드에서 일반용과 같다', { skip: skipGen }, () => {
  for (let s = 1; s <= 200; s++) {
    assert.deepStrictEqual(G.generateBoard(8, 8, 6, mulberry(s)), GEN.generateBoard(8, 8, 6, mulberry(s)));
    const g = GEN.generateBoard(8, 8, 6, mulberry(s));
    assert.deepStrictEqual(G.shuffleTypes(g, mulberry(s + 1)), GEN.shuffleTypes(g, mulberry(s + 1)));
    assert.deepStrictEqual(G.findHint(g, mulberry(s + 2)), GEN.findHint(g, mulberry(s + 2)));
    const h1 = g.map((row) => row.slice());
    const h2 = g.map((row) => row.slice());
    h1[3][3] = h2[3][3] = null; h1[4][3] = h2[4][3] = null;
    assert.deepStrictEqual(G.applyGravity(h1), GEN.applyGravity(h2));
  }
});

/* ===================================================================
 * 9) 가짜 DOM + 가상 시계 하네스 — 실제 game.js 를 실행한다
 * =================================================================== */
const SRC_EDU = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const SRC_GEN = HAS_GEN ? fs.readFileSync(GEN_PATH, 'utf8') : '';
const FRAME_MS = 150;
const GEM_IDS = ['fire', 'water', 'grass', 'lightning', 'dark', 'light', 'gift'];

// 일반용 소스에는 시험 연결점이 없으므로 메모리에서만 같은 줄을 끼워 넣는다(파일은 수정하지 않는다)
function withHook(src) {
  if (src.indexOf('__EG_TEST__') !== -1) return src;
  const tail = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
  assert.ok(src.indexOf(tail) !== -1, '일반용 game.js 끝부분을 찾지 못함');
  const hook = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.internals = { state: state, save: save, el: el, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge, onHint: onHint, pauseGame: pauseGame, resumeGame: resumeGame, goStages: goStages, goHome: goHome, typeGrid: typeGrid, setGemType: setGemType, writeSave: writeSave, loadSave: loadSave, frame: frame, onKey: onKey, listMoves: listMoves, reshuffleBoard: reshuffleBoard }; }\n";
  return src.replace(tail, hook + tail);
}
const scripts = {};
function scriptFor(name, src) {
  if (!scripts[name]) scripts[name] = new vm.Script(withHook(src), { filename: name + '/game.js' });
  return scripts[name];
}

class FakeEl {
  constructor(env, tag) {
    this._env = env;
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.textContent = '';
    this.isFragment = false;
    this._html = '';
    this._attrs = {};
    this._cls = new Set();
    this._ls = {};
    this._q = {};
    this._style = {};
    const self = this;
    this.style = {
      setProperty(k, v) { self._style[k] = String(v); },
      removeProperty(k) { delete self._style[k]; },
      getPropertyValue(k) { return self._style[k] || ''; }
    };
    this.dataset = new Proxy({}, {
      set(t, k, v) { if (k === 'type' && v === 'gift') env.giftSet++; t[k] = v; return true; }
    });
    this.classList = {
      add() { Array.prototype.forEach.call(arguments, (n) => { self._cls.add(n); env.onClass(self, n); }); },
      remove() { Array.prototype.forEach.call(arguments, (n) => { self._cls.delete(n); }); },
      toggle(n, force) { const on = force === undefined ? !self._cls.has(n) : !!force; if (on) { self._cls.add(n); env.onClass(self, n); } else self._cls.delete(n); return on; },
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
    ch.parentNode = this;
    this.children.push(ch);
    return ch;
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
  removeEventListener() {}
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl(this._env, 'span')); }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

/** 가짜 브라우저 + 가상 시계 위에서 game.js 를 실행하는 환경. src: 'edu' | 'gen' */
function createEnv(which, seed, cfgPatch, envOpt) {
  const env = {
    asks: [], giftSet: 0, removedGifts: new Set(), zappedGifts: new Set(), reshuffled: false, errors: [],
    _now: 0, _seq: 0, _q: []
  };
  env.now = () => env._now;
  env.timers = {
    setTimeout(fn, ms) { const id = ++env._seq; env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn }); return id; },
    clearTimeout(id) { const i = env._q.findIndex((x) => x.id === id); if (i >= 0) env._q.splice(i, 1); }
  };
  env.onClass = function (el, name) {
    if (name === 'removing' && el.dataset.type === 'gift') env.removedGifts.add(el);
    if (name === 'zapped' && el.dataset.type === 'gift') env.zappedGifts.add(el);
    if (name === 'reshuffle') env.reshuffled = true;
  };
  const ids = {};
  const docLs = {};
  const doc = {
    readyState: 'complete', hidden: false, activeElement: null, _ids: ids,
    documentElement: new FakeEl(env, 'html'),
    getElementById(id) { return ids[id] || (ids[id] = new FakeEl(env, 'div')); },
    createElement(t) { return new FakeEl(env, t); },
    createElementNS(ns, t) { return new FakeEl(env, t); },
    createDocumentFragment() { const f = new FakeEl(env, 'fragment'); f.isFragment = true; return f; },
    addEventListener(t, fn) { (docLs[t] = docLs[t] || []).push(fn); }
  };
  const store = {};
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: !!(envOpt && envOpt.reduceMotion) }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: mulberry(seed),
    __forced: []              // 시험이 다음 Math.random 값을 미리 정해 둘 수 있다(리필 종류 지정용)
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), FRAME_MS);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  scriptFor(which, which === 'edu' ? SRC_EDU : SRC_GEN).runInContext(sandbox);
  env.sandbox = sandbox;
  env.doc = doc;
  env.store = store;
  env.CONFIG = sandbox.module.exports.CONFIG;
  env.I = sandbox.__EG_TEST__.internals;
  env.dispatchDoc = (type, evt) => (docLs[type] || []).slice().forEach((fn) => fn(Object.assign({ preventDefault() {}, target: { tagName: 'DIV', closest: () => null } }, evt || {})));
  env.fire = (el, type, evt) => (el._ls[type] || []).slice().forEach((fn) => fn(Object.assign({ preventDefault() {}, target: el }, evt || {})));
  if (cfgPatch) cfgPatch(env.CONFIG);
  process.on('unhandledRejection', env.unhandled = (e) => { env.errors.push(e); });
  env.dispose = () => process.removeListener('unhandledRejection', env.unhandled);

  env.step = async function () {
    const q = env._q;
    if (!q.length) return false;
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (q[i].t < q[bi].t || (q[i].t === q[bi].t && q[i].id < q[bi].id)) bi = i;
    const ev = q.splice(bi, 1)[0];
    env._now = Math.max(env._now, ev.t);
    ev.fn();
    await new Promise((r) => setImmediate(r));       // 이 단계에서 풀린 약속 연쇄를 모두 처리
    return true;
  };
  env.runUntil = async function (pred, maxMs) {
    const limit = env._now + (maxMs == null ? 60000 : maxMs);
    while (!pred()) {
      if (env._now > limit) throw new Error('runUntil: 시간 초과(가상 ' + maxMs + 'ms) phase=' + env.I.state.phase + ' locked=' + env.I.state.locked + ' quiz=' + env.I.state.quizActive);
      if (!(await env.step())) throw new Error('runUntil: 남은 타이머 없음');
    }
  };
  env.runFor = async function (ms) {
    const target = env._now + ms;
    while (env._q.length && Math.min.apply(null, env._q.map((x) => x.t)) <= target) await env.step();
    env._now = Math.max(env._now, target);
  };
  env.setQuiz = function (quiz) { sandbox.EduQuiz = quiz; };
  // 게임 안의 async 함수가 끝날 때까지 가상 시계를 돌린다
  env.await = async function (p) {
    let done = false;
    let err = null;
    p.then(() => { done = true; }, (e) => { done = true; err = e; });
    await env.runUntil(() => done, 60000);
    if (err) throw err;
  };
  env.resetAction = function () { env.removedGifts.clear(); env.zappedGifts.clear(); env.reshuffled = false; };
  return env;
}

/** EduQuiz 가짜: ask() 는 thinkMs 뒤에 답을 돌려준다. 호출 시점의 시계·점수·상태를 기록한다 */
function makeQuiz(env, o) {
  const opt = o || {};
  const quiz = {
    ready: opt.ready !== false, cancelled: 0,
    ask() {
      const st = env.I.state;
      const rec = { t0: env.now(), snap: snap(st), index: env.asks.length };
      env.asks.push(rec);
      if (opt.onAsk) opt.onAsk(rec, st);
      return new Promise((resolve) => env.timers.setTimeout(() => {
        rec.t1 = env.now();
        rec.after = snap(st);
        if (opt.beforeAnswer) opt.beforeAnswer(rec, st);
        resolve(opt.answer ? opt.answer(rec, st) : { right: true, bonus: G.bonusFor(st.level) });
      }, opt.thinkMs == null ? 1500 : opt.thinkMs));
    },
    unitLabel() { return '5학년 2학기 · 1-(1) 시험 단원'; },
    cancel() { quiz.cancelled++; }
  };
  return quiz;
}
function snap(st) {
  return { score: st.score, timeLeft: st.timeLeft, freeze: st.freeze, dark: st.dark, hintCd: st.hintCd, hintLeft: st.hintLeft, multHold: st.multHold, phase: st.phase, active: st.quizActive, locked: st.locked, timeUp: st.timeUp };
}

function shortGame(cfg, secs, extra) {
  ['easy', 'normal', 'hard'].forEach((lv) => {
    cfg.difficulty[lv].time = { start: secs, max: secs + 5 };
  });
  if (extra) extra(cfg);
}

async function startAndWait(env, lv, stage) {
  const I = env.I;
  I.save.level = lv || 'normal';
  I.startStage(stage || 1);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
}

/** 규칙 시험용 무늬 보드: 같은 종류가 이웃하지 않아 매치가 전혀 없다(0~4 종류) */
function patternBoard() {
  const g = [];
  for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); g.push(row); }
  return g;
}
/** 화면 보드의 종류를 types(2차원)로 맞춘다(실제 game.js 의 setGemType 사용) */
function applyBoard(env, types) {
  const I = env.I;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) I.setGemType(I.state.grid[r][c], types[r][c]);
}

function checkBoard(env, label) {
  const I = env.I;
  const st = I.state;
  const tg = I.typeGrid();
  const flat = [].concat.apply([], tg);
  assert.ok(flat.every((v) => v != null && v >= 0 && v <= W), label + ': 빈 칸/범위 밖 종류');
  assert.strictEqual(G.findMatches(tg).length, 0, label + ': 정산이 끝났는데 매치가 남음');
  if (st.phase === 'playing') assert.ok(G.hasValidMove(tg), label + ': 유효한 수가 없음(재섞기 누락)');
  const el = I.el.board;
  assert.strictEqual(el.children.length, 64, label + ': 화면 보석 수');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gem = st.grid[r][c];
      assert.ok(gem.r === r && gem.c === c, label + ': gem.r/c');
      assert.ok(el.children.indexOf(gem.el) >= 0, label + ': 화면에 없는 보석');
      assert.strictEqual(gem.el.dataset.type, GEM_IDS[gem.type], label + ': data-type');
      assert.strictEqual(gem.el._style['--r'], String(r), label + ': --r');
      assert.strictEqual(gem.el._style['--c'], String(c), label + ': --c');
      if (gem.type === W) {
        assert.strictEqual(gem.el.getAttribute('role'), 'img');
        assert.ok(gem.el.getAttribute('aria-label').indexOf('선물상자(물음표)') !== -1);
        assert.ok(gem.el.innerHTML.indexOf('#gem-gift') !== -1, label + ': ? 는 SVG 심볼 #gem-gift 를 참조');
      } else {
        assert.strictEqual(gem.el.getAttribute('aria-label'), null, label + ': 일반 보석에는 aria-label 없음');
      }
    }
  }
  return G.countWild(tg);
}

/* ---------- 문제 흐름 시나리오 ---------- */
async function prepScenario(over) {
  const o = over || {};
  const env = createEnv('edu', o.seed || 1, (cfg) => {
    shortGame(cfg, 60);
    cfg.edu.wild.spawn = 0;                    // 시나리오는 직접 ? 를 놓는다(새 ? 는 안 나옴)
    cfg.stages.targets.normal[0] = o.target || 50000;
    if (o.cfg) o.cfg(cfg);
  }, { reduceMotion: !!o.reduceMotion });
  env.setQuiz(makeQuiz(env, o.quiz));
  await startAndWait(env, 'normal', 1);
  // 시작 직후의 보드를 무늬 보드로 교체하고 ? 를 놓는다
  const B = patternBoard();
  (o.wilds || []).forEach((p) => { B[p[0]][p[1]] = W; });
  if (o.edit) o.edit(B);
  assert.strictEqual(G.findMatches(B).length, 0, '시나리오 시작 보드에 매치가 있음');
  assert.ok(G.hasValidMove(B));
  applyBoard(env, B);
  return env;
}
async function finishAction(env) {
  await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000);
}

test('문제: 스왑 매치에서 ? 가 지워지면 문제 1개, 연쇄 정산 뒤에 묻고, 정답이면 보너스 300(중수)', async () => {
  // 3행: A A X ?  -> (3,2)<->(3,3) 교환하면 A A ? 로 매치. 패턴 위에 값을 직접 놓는다.
  const env = await prepScenario({
    wilds: [[3, 3]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; },
    quiz: { thinkMs: 2000 }
  });
  const I = env.I;
  const st = I.state;
  const before = st.score;
  env.resetAction();
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.asks.length, 1, '? 하나 -> 문제 1개');
  assert.ok(env.removedGifts.size >= 1);
  const a = env.asks[0];
  // 문제는 연쇄 정산이 끝난 뒤(입력 잠금 중, 이미 점수가 들어간 상태)에 묻는다
  assert.strictEqual(a.snap.locked, true);
  assert.strictEqual(a.snap.active, true, '문제 중 quizActive');
  assert.ok(a.snap.score > before, '매치 점수가 먼저 정산된다');
  // 문제 중 점수는 그대로, 닫힌 뒤 +300
  assert.strictEqual(a.after.score, a.snap.score, '문제 팝업이 열려 있는 동안 점수 변화 없음');
  assert.strictEqual(st.score - a.snap.score, 300, '정답 보너스 300(중수) — 연쇄·어둠 배율 미적용');
  assert.strictEqual(st.quizActive, false);
  assert.deepStrictEqual(env.I.state.edu.asked + '/' + env.I.state.edu.right + '/' + env.I.state.edu.bonus, '1/1/300');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('문제: 오답이면 점수 불변, 문제 없음(null)이면 통계도 없음, bonus 값이 없으면 같은 규칙으로 계산', async () => {
  const scen = {
    wilds: [[3, 3]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; }
  };
  // 오답
  let env = await prepScenario(Object.assign({}, scen, { quiz: { answer: () => ({ right: false, bonus: 0 }) } }));
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.asks.length, 1);
  assert.strictEqual(env.I.state.score, env.asks[0].snap.score);
  assert.strictEqual(env.I.state.edu.asked, 1);
  assert.strictEqual(env.I.state.edu.right, 0);
  env.dispose();
  // ask() 가 null (낼 문제 없음)
  env = await prepScenario(Object.assign({}, scen, { quiz: { answer: () => null } }));
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.I.state.score, env.asks[0].snap.score);
  assert.strictEqual(env.I.state.edu.asked, 0);
  env.dispose();
  // bonus 가 없는 정답 -> bonusFor(난이도)
  env = await prepScenario(Object.assign({}, scen, { quiz: { answer: () => ({ right: true }) } }));
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.I.state.score - env.asks[0].snap.score, 300);
  env.dispose();
  // 고수: 390 (EduQuiz 가 난이도 배율을 계산해 넘긴 값을 그대로 더한다)
  env = await prepScenario(Object.assign({}, scen, { quiz: { answer: () => ({ right: true, bonus: G.bonusFor('hard') }) } }));
  env.I.state.level = 'hard';
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  assert.strictEqual(env.I.state.score - env.asks[0].snap.score, 390);
  env.dispose();
});

test('문제: 한 행동에서 ? 2개가 지워지면 문제 2개가 순서대로(사이 0.4초), 상한(maxPerAction)을 넘으면 문제 없이 지운다', async () => {
  // 3행: A A B ? , 위(2,2)에 ? : (3,2)<->(2,2) 교환 -> A A ? ?  (? 2개가 한 줄)
  const scen = {
    wilds: [[3, 3], [2, 2]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[4][2] = 2; },
    quiz: { thinkMs: 1000 }
  };
  let env = await prepScenario(scen);
  env.resetAction();
  env.I.trySwap({ r: 3, c: 2 }, { r: 2, c: 2 });
  await finishAction(env);
  assert.strictEqual(env.asks.length, 2);
  assert.ok(env.asks[1].t0 - env.asks[0].t1 >= 400, '문제 사이 간격 ' + (env.asks[1].t0 - env.asks[0].t1));
  assert.strictEqual(env.I.state.edu.asked, 2);
  assert.strictEqual(env.I.state.score - env.asks[0].snap.score, 600);       // 문제마다 별도 보너스 300
  env.dispose();
  // 상한 1
  env = await prepScenario(Object.assign({}, scen, { cfg: (cfg) => { cfg.edu.quiz.maxPerAction = 1; } }));
  env.I.trySwap({ r: 3, c: 2 }, { r: 2, c: 2 });
  await finishAction(env);
  assert.strictEqual(env.asks.length, 1);
  assert.ok(env.removedGifts.size >= 2, '? 는 둘 다 지워짐');
  env.dispose();
});

test('문제 중 시계 정지: 게임 타이머·물·어둠·힌트 쿨다운·배율 유지가 팝업 전후로 같고, 닫힌 뒤 정상 재개', async () => {
  const env = await prepScenario({
    wilds: [[3, 3]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; },
    quiz: { thinkMs: 6000 }
  });
  const I = env.I;
  const st = I.state;
  st.freeze = 40;          // 물 정지 중(타이머는 원래 안 줆, freeze 가 줄어든다)
  st.dark = 40;            // 어둠 배율 중
  st.hintCd = 40;          // 힌트 쿨다운
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
  const a = env.asks[0];
  ['timeLeft', 'freeze', 'dark', 'hintCd', 'hintLeft', 'multHold'].forEach((k) => {
    assert.strictEqual(a.after[k], a.snap[k], k + ' 가 문제 중에 변함');
  });
  assert.ok(a.t1 - a.t0 >= 6000, '문제는 가상 6초 동안 열려 있었다');
  // 닫힌 뒤에는 시계가 다시 간다(물 정지가 풀릴 때까지 freeze 가 줄어든다)
  const f0 = st.freeze;
  await env.runFor(2000);
  assert.ok(st.freeze < f0, '문제가 끝나도 시계가 안 감: ' + f0 + ' -> ' + st.freeze);
  assert.ok(st.dark < a.snap.dark);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('문제 중에는 일시정지·탭 전환·Esc·메뉴·리셋 입력이 게임을 멈추거나 바꾸지 않는다', async () => {
  let mid = null;
  const env = await prepScenario({
    wilds: [[3, 3]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; },
    quiz: {
      thinkMs: 3000,
      onAsk: (rec, st) => {
        // 팝업이 열린 순간 여러 입력을 시도한다
        const E = env;
        E.dispatchDoc('keydown', { key: 'Escape' });
        E.dispatchDoc('keydown', { key: 'p' });
        E.dispatchDoc('keydown', { key: 'ArrowRight' });
        E.dispatchDoc('keydown', { key: '1' });
        E.doc.hidden = true;
        E.dispatchDoc('visibilitychange');
        E.doc.hidden = false;
        E.fire(E.I.el['btn-menu'], 'click');
        E.fire(E.I.el['btn-reset'], 'click');
        E.fire(E.I.el['btn-hint'], 'click');
        E.I.pauseGame();
        mid = { phase: st.phase, pauseHidden: E.I.el['overlay-pause'].hidden, confirmHidden: E.I.el['overlay-confirm'].hidden, hint: st.hint, kbd: st.kbd };
      }
    }
  });
  const env2 = env;
  env2.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env2);
  assert.strictEqual(mid.phase, 'playing');
  assert.strictEqual(mid.pauseHidden, true, '일시정지 화면이 열리면 안 됨');
  assert.strictEqual(mid.confirmHidden, true);
  assert.strictEqual(mid.hint, null, '문제 중 힌트 버튼 무시');
  assert.strictEqual(mid.kbd, false, '문제 중 게임 단축키·커서 이동 무시');
  assert.strictEqual(env2.I.state.score - env2.asks[0].snap.score, 300);
  assert.deepStrictEqual(env2.errors, []);
  env2.dispose();
});

test('문제가 끝난 뒤에 클리어 판정: 문제 보너스로 목표 점수를 넘기면 그때 클리어, 오답이면 계속', async () => {
  for (const right of [true, false]) {
    const env = await prepScenario({
      wilds: [[3, 3]],
      edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; },
      quiz: {
        onAsk: (rec, st) => { st.target = st.score + 100; },       // 매치 점수만으로는 아직 목표 미달
        answer: () => ({ right, bonus: 300 })
      }
    });
    env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
    await finishAction(env);
    if (right) {
      assert.strictEqual(env.I.state.phase, 'over', '보너스로 목표 달성 -> 클리어');
      assert.strictEqual(env.I.save.progress.normal, 1);
      assert.strictEqual(env.doc._ids['end-title'].textContent, 'STAGE CLEAR!');
      assert.ok(env.doc._ids['end-quiz'].textContent.indexOf('1개 중 1개 맞혔어요') !== -1, env.doc._ids['end-quiz'].textContent);
      assert.ok(env.doc._ids['end-quiz'].textContent.indexOf('+300점') !== -1);
    } else {
      assert.strictEqual(env.I.state.phase, 'playing', '오답이면 목표 미달 -> 계속');
    }
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('stageStart·stageEnd 이벤트, 소단원 문구 요소, window.ElementGemsEdu 인터페이스', async () => {
  const env = createEnv('edu', 3, (cfg) => { shortGame(cfg, 60); cfg.edu.wild.spawn = 0; cfg.stages.targets.normal[0] = 100; });
  env.setQuiz(makeQuiz(env));
  const events = [];
  env.sandbox.ElementGemsHost.on('stageStart', (d) => events.push(['start', d]));
  env.sandbox.ElementGemsHost.on('stageEnd', (d) => events.push(['end', d]));
  const api = env.sandbox.ElementGemsEdu;
  assert.strictEqual(typeof api.addBonus, 'function');
  assert.deepStrictEqual(Object.assign({}, api.state()), { quizActive: false, level: 'normal', asked: 0, right: 0, bonus: 0 });
  assert.strictEqual(api.bonusFor('hard'), 390);
  assert.strictEqual(api.addBonus(300), 0, '게임 중이 아니면 무시');
  await startAndWait(env, 'normal', 1);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0][1].stage, 1);
  assert.strictEqual(events[0][1].target, 100, '목표 100 × 1.2 = 120 -> 100점 단위 반올림 100');
  assert.strictEqual(events[0][1].unit, '5학년 2학기 · 1-(1) 시험 단원');
  assert.strictEqual(env.doc._ids['pause-unit'].textContent, '5학년 2학기 · 1-(1) 시험 단원');
  // addBonus: 점수 가산·잘못된 값 무시
  const s0 = env.I.state.score;
  assert.strictEqual(api.addBonus(300), 300);
  assert.strictEqual(env.I.state.score, s0 + 300);
  [0, -5, NaN, Infinity, 'x', null, undefined, 1e9].forEach((bad) => assert.strictEqual(api.addBonus(bad), 0));
  assert.strictEqual(env.I.state.score, s0 + 300);
  assert.strictEqual(api.state().bonus, 300);
  // 목표(100)를 이미 넘겼으니 곧 클리어 -> stageEnd
  await env.runUntil(() => env.I.state.phase === 'over', 20000);
  const end = events.filter((e) => e[0] === 'end');
  assert.strictEqual(end.length, 1);
  assert.strictEqual(end[0][1].cleared, true);
  assert.strictEqual(end[0][1].bonus, 300);
  env.dispose();
});

test('게임이 바뀌면(재시작) 진행 중인 문제 상태를 정리하고 EduQuiz.cancel 을 부른다', async () => {
  let reached = false;
  const env = await prepScenario({
    wilds: [[3, 3]],
    edit: (B) => { B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3; },
    quiz: { thinkMs: 5000, onAsk: () => { reached = true; } }
  });
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.runUntil(() => reached, 30000);
  assert.strictEqual(env.I.state.quizActive, true);
  env.I.startStage(1);                                   // 문제 도중 재시작
  assert.strictEqual(env.I.state.quizActive, false);
  assert.strictEqual(env.sandbox.EduQuiz.cancelled, 1);
  await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  await env.runFor(10000);                               // 예전 행동이 늦게 끝나도 새 게임을 건드리지 않는다
  assert.strictEqual(env.I.state.quizActive, false);
  assert.strictEqual(env.I.state.score, 0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('저장 통합: 키 element-gems-edu:v1, edu 필드 — edu.js 가 같은 객체를 고쳐 writeSave 하거나 저장소에 직접 써도 서로 덮어쓰지 않는다', async () => {
  const env = createEnv('edu', 2, (cfg) => { shortGame(cfg, 30); });
  const I = env.I;
  const KEY = 'element-gems-edu:v1';
  assert.strictEqual(env.store['element-gems:v1'], undefined);
  // (A) save.edu 객체를 고치고 writeSave (edu.js 의 persist 방식): 메모리 값이 저장되고, 객체는 그대로 유지
  const mine = { unit: 'u1', pool: {}, stats: { u1: { asked: 1, right: 1 } } };
  I.save.edu = mine;
  I.writeSave();
  assert.deepStrictEqual(JSON.parse(env.store[KEY]).edu, mine);
  assert.strictEqual(I.save.edu, mine, '바뀌지 않았으면 같은 객체를 유지');
  mine.stats.u1.asked = 5;                 // 같은 객체를 직접 수정 -> 메모리 우선
  I.writeSave();
  assert.strictEqual(JSON.parse(env.store[KEY]).edu.stats.u1.asked, 5);
  assert.strictEqual(I.save.edu, mine);
  // (B) 저장소의 edu 를 다른 코드가 직접 바꾼 뒤 game.js 가 다른 이유로 writeSave -> 저장소 값을 지우지 않는다
  const raw = JSON.parse(env.store[KEY]);
  raw.edu = { unit: 'u2', pool: {}, stats: {} };
  env.store[KEY] = JSON.stringify(raw);
  I.save.cutin = !I.save.cutin;
  I.writeSave();
  assert.strictEqual(JSON.parse(env.store[KEY]).edu.unit, 'u2', '저장소에 직접 쓴 edu 가 보존돼야 함');
  assert.strictEqual(JSON.parse(env.store[KEY]).cutin, I.save.cutin);
  assert.strictEqual(I.save.edu.unit, 'u2');
  // 다시 불러오면 edu 와 진행 키가 그대로
  I.save.edu = { unit: 'u3' };
  I.writeSave();
  const again = G.parseSave(env.store[KEY]);
  assert.strictEqual(again.edu.unit, 'u3');
  env.dispose();
});

/* ---------- 스킬 6종: ? 가 지워져도 문제 0건 ---------- */
const wildScenario = {
  wilds: [[3, 3]],
  edit: (B) => { B[0][0] = 0; }
};
async function castOn(env, gaugeIndex, r, c) {
  const I = env.I;
  I.state.gauge[gaugeIndex] = I.CONFIG.types[gaugeIndex].max;
  I.onGauge(gaugeIndex);
  if (I.state.aim !== null) I.handleTap(r, c);
  await finishAction(env);
}

test('스킬: 불(3×3)이 ? 를 지워도 문제·보너스 없음', async () => {
  const env = await prepScenario(wildScenario);
  env.resetAction();
  const s0 = env.I.state.score;
  await castOn(env, 0, 3, 4);
  assert.ok(env.removedGifts.size >= 1, '? 가 불 범위에서 지워짐');
  assert.strictEqual(env.asks.length, 0);
  assert.strictEqual(env.I.state.edu.asked, 0);
  assert.ok(env.I.state.score > s0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('스킬: 풀(십자)이 ? 를 지워도 문제 없음 (가로·세로 양쪽)', async () => {
  for (const target of [[3, 7], [7, 3]]) {
    const env = await prepScenario(wildScenario);
    env.resetAction();
    await castOn(env, 2, target[0], target[1]);
    assert.ok(env.removedGifts.size >= 1);
    assert.strictEqual(env.asks.length, 0);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('스킬: 번개는 ? 를 고르지도 지우지도 않는다(그 색 보석만), 문제 없음', async () => {
  for (let seed = 1; seed <= 12; seed++) {
    const env = await prepScenario(Object.assign({}, wildScenario, { seed }));
    env.resetAction();
    const before = G.countWild(env.I.typeGrid());
    await castOn(env, 3, 0, 0);
    assert.strictEqual(env.zappedGifts.size, 0, '번개가 ? 를 맞춤');
    assert.strictEqual(env.asks.length, 0);
    // 번개 직접 제거 단계에서는 ? 가 지워지지 않는다(이후 자동 연쇄로 지워질 수는 있으나 그때도 문제는 없다)
    assert.ok(before === 1);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('스킬: 물·어둠·빛은 보드가 안 변하고 문제 없음, 빛의 힌트는 ? 를 쓰는 수도 가리킬 수 있다', async () => {
  for (const gi of [1, 4, 5]) {
    const env = await prepScenario(wildScenario);
    const before = JSON.stringify(env.I.typeGrid());
    await castOn(env, gi, 0, 0);
    assert.strictEqual(JSON.stringify(env.I.typeGrid()), before);
    assert.strictEqual(env.asks.length, 0);
    if (gi === 5) {
      const h = env.I.state.hint;
      assert.ok(h, '빛이 힌트를 보여 줌');
      assert.ok(G.wouldMatch(env.I.typeGrid(), h.a.r, h.a.c, h.b.r, h.b.c));
    }
    env.dispose();
  }
});

test('스킬이 일으킨 자동 연쇄에서 ? 가 지워져도 문제 없음 (스킬 행동은 fromSkill 일괄 처리)', async () => {
  // 연쇄가 ? 를 지우는 일이 실제로 일어나는 게임을 봇으로 돌려, 스킬 행동의 문제 요청이 0건인지 확인(아래 봇 시험에서 skipped>0 도 확인)
  const stats = await runBots({ games: 24, seed: 5150, secs: 25, quick: true });
  assert.ok(stats.skillActions > 20, '스킬 행동 수 ' + stats.skillActions);
  assert.strictEqual(stats.skillAsks, 0);
  assert.ok(stats.skippedBySkillChain > 0, '스킬 뒤 연쇄에서 ? 가 지워진 사례가 한 번도 없음');
});

/* ---------- 첫 등장 보장·EduQuiz 없음/미준비 ---------- */
test('스폰 통합: 첫 행동의 리필에서 ? 1개가 확정 등장하고 안내가 한 번 나온다(spawn>0 일 때만)', async () => {
  for (let seed = 1; seed <= 15; seed++) {
    const env = createEnv('edu', seed, (cfg) => { shortGame(cfg, 60); cfg.stages.targets.normal[0] = 50000; cfg.edu.wild.spawn = 0.0001; });
    env.setQuiz(makeQuiz(env));
    await startAndWait(env, 'normal', 1);
    assert.strictEqual(env.giftSet, 0, '시작 보드에는 ? 없음');
    const I = env.I;
    const mv = I.listMoves(I.typeGrid())[0];
    I.trySwap(mv.a, mv.b);
    await finishAction(env);
    assert.ok(env.giftSet >= 1, '첫 행동 뒤 ? 가 한 번도 안 나옴 seed ' + seed);
    assert.strictEqual(I.state.edu.firstDone, true);
    if (seed === 1) assert.strictEqual(env.doc._ids['aim-msg'].textContent, G.CONFIG.edu.text.giftHint);
    env.dispose();
  }
});

test('spawn=0 이면 첫 등장 보장 설정이 켜져 있어도 ? 가 전혀 안 나온다', async () => {
  const env = createEnv('edu', 8, (cfg) => { shortGame(cfg, 40); cfg.stages.targets.normal[0] = 50000; cfg.edu.wild.spawn = 0; cfg.edu.wild.guaranteeFirst = true; });
  env.setQuiz(makeQuiz(env));
  await startAndWait(env, 'normal', 1);
  for (let i = 0; i < 12 && env.I.state.phase === 'playing'; i++) {
    const mv = env.I.listMoves(env.I.typeGrid())[0];
    env.I.trySwap(mv.a, mv.b);
    await finishAction(env);
    assert.strictEqual(checkBoard(env, 'a' + i), 0);
  }
  assert.strictEqual(env.giftSet, 0);
  assert.strictEqual(env.asks.length, 0);
  env.dispose();
});

test('EduQuiz 가 없거나 ready=false 이거나 ask 가 없으면 ? 스폰 0 — 일반 퍼즐과 동일하게 진행', async () => {
  for (const mode of ['none', 'notReady', 'noAsk']) {
    const env = createEnv('edu', 21, (cfg) => { shortGame(cfg, 40); cfg.stages.targets.normal[0] = 50000; cfg.edu.wild.spawn = 1; cfg.edu.wild.max = 6; });
    if (mode === 'notReady') env.setQuiz(Object.assign(makeQuiz(env), { ready: false }));
    if (mode === 'noAsk') env.setQuiz({ ready: true });
    await startAndWait(env, 'normal', 1);
    for (let i = 0; i < 10 && env.I.state.phase === 'playing'; i++) {
      const mv = env.I.listMoves(env.I.typeGrid())[0];
      env.I.trySwap(mv.a, mv.b);
      await finishAction(env);
      assert.strictEqual(checkBoard(env, mode + i), 0);
    }
    assert.strictEqual(env.giftSet, 0, mode);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('문제 뒤 NO MOVES: ? 가 지워지고 정산 뒤 유효한 수가 없으면 문제를 먼저 묻고 그다음 재섞기', async () => {
  // 맨 윗줄 오른쪽에서 A A 와 ? 를 맞추면 지워지는 칸은 윗줄 3칸뿐이라, 새 칸 3개의 종류를 정해 "유효한 수 없음" 보드를 만들 수 있다
  const make = () => { const B = patternBoard(); B[0][7] = 2; B[0][6] = 2; B[0][4] = W; return B; };
  const S = make();
  const t = S[0][5]; S[0][5] = S[0][4]; S[0][4] = t;            // (0,5)<->(0,4) 교환 뒤
  const groups = G.findMatches(S);
  assert.strictEqual(groups.length, 1);
  const rest = S.map((row) => row.slice());
  G.uniqueCells(groups).forEach((p) => { rest[p.r][p.c] = null; });
  assert.deepStrictEqual(G.uniqueCells(groups).map((p) => p.r + ',' + p.c).sort(), ['0,5', '0,6', '0,7']);
  const slots = [[0, 5], [0, 6], [0, 7]];                         // 리필 순서: 열 순서대로
  let picked = null;
  for (let code = 0; code < 216 && !picked; code++) {
    const C = rest.map((row) => row.slice());
    let x = code;
    const types = slots.map(([r, c]) => { const v = x % 6; x = Math.floor(x / 6); C[r][c] = v; return v; });
    if (G.findMatches(C).length === 0 && !G.hasValidMove(C)) picked = types;
  }
  assert.ok(picked, '유효한 수가 없는 보드를 만들 새 칸 조합이 없음');
  let popupAtAsk = null;
  const env = await prepScenario({
    reduceMotion: true, wilds: [[0, 4]],
    edit: (B) => { B[0][7] = 2; B[0][6] = 2; },
    quiz: { thinkMs: 800, onAsk: () => { popupAtAsk = env.doc._ids.popup.textContent; } }
  });
  env.sandbox.__forced.push.apply(env.sandbox.__forced, picked.map((v) => (v + 0.5) / 6));
  env.resetAction();
  env.I.trySwap({ r: 0, c: 5 }, { r: 0, c: 4 });
  await finishAction(env);
  assert.strictEqual(env.asks.length, 1);
  assert.notStrictEqual(popupAtAsk, 'NO MOVES', 'NO MOVES 는 문제 뒤에 나와야 함');
  assert.strictEqual(env.reshuffled, true, '재섞기가 일어나야 함');
  assert.strictEqual(env.doc._ids.popup.textContent, 'NO MOVES');
  assert.strictEqual(env.I.state.phase, 'playing');
  assert.strictEqual(checkBoard(env, 'no moves'), 0);
  assert.strictEqual(env.I.state.score - env.asks[0].snap.score, 300);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('문제: 연쇄 2단계에서 ? 가 지워져도(스왑으로 시작한 행동) 문제 1개 — 리필 종류를 정해 연쇄를 만든다', async () => {
  // 윗줄: [0,2,4,W,3,0,2,2]. (0,5)<->(1,5) 교환으로 오른쪽 끝 2 2 2 가 지워지고(? 는 안 끼임),
  // 새로 채운 (0,5)=3 이 W 3 3 을 만들어 2단계에서 ? 가 지워진다
  const env = await prepScenario({
    reduceMotion: true, wilds: [[0, 3]],
    edit: (B) => { B[0][7] = 2; B[1][5] = 2; },
    quiz: { thinkMs: 500 }
  });
  env.sandbox.__forced.push.apply(env.sandbox.__forced, [3, 4, 0].map((v) => (v + 0.5) / 6));
  env.resetAction();
  env.I.trySwap({ r: 0, c: 5 }, { r: 1, c: 5 });
  await finishAction(env);
  assert.ok(env.I.state.stats.maxChain >= 2, '연쇄가 2단계 이상이어야 함: ' + env.I.state.stats.maxChain);
  assert.strictEqual(env.removedGifts.size, 1);
  assert.strictEqual(env.asks.length, 1, '연쇄 속에서 지워진 ? 도 문제 대상');
  assert.strictEqual(env.I.state.edu.skipped, 0);
  assert.strictEqual(env.I.state.score - env.asks[0].snap.score, 300);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('스킬 행동의 연쇄(2단계)에서 ? 가 지워져도 문제 없음 — 같은 보드를 불 스킬로 시작', async () => {
  const env = await prepScenario({ reduceMotion: true, wilds: [[0, 3]], quiz: { thinkMs: 500 } });
  // 불(0,6) 3×3 이 (0,5)(0,6)(0,7)(1,5)(1,6)(1,7) 을 지우고, 새 (0,5)=3 이 W 3 3 을 만든다. 새 칸 순서: 5열 위·아래, 6열 위·아래, 7열 위·아래
  env.sandbox.__forced.push.apply(env.sandbox.__forced, [3, 1, 4, 2, 0, 3].map((v) => (v + 0.5) / 6));
  env.resetAction();
  await castOn(env, 0, 0, 6);
  assert.ok(env.I.state.stats.maxChain >= 2, '스킬 뒤 자동 연쇄가 일어나야 함');
  assert.strictEqual(env.removedGifts.size, 1, '? 가 연쇄에서 지워짐');
  assert.strictEqual(env.I.state.edu.skipped, 1, '스킬 행동 안에서 지워진 ? 로 센다');
  assert.strictEqual(env.asks.length, 0, '문제 없음');
  assert.strictEqual(env.I.state.edu.asked, 0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

/* ---------- spawn=0 이면 일반용과 한 판 전체가 똑같다 ---------- */
async function playScripted(env, botSeed, maxActions) {
  const I = env.I;
  const st = I.state;
  const rng = mulberry(botSeed);
  const trace = [];
  await startAndWait(env, I.save.level, 1);
  for (let n = 0; n < maxActions && st.phase === 'playing'; n++) {
    await env.runFor(200 + Math.floor(rng() * 700));
    if (st.phase !== 'playing') break;
    if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
    const full = [];
    for (let i = 0; i < 6; i++) if (st.gauge[i] >= I.CONFIG.types[i].max) full.push(i);
    const roll = rng();
    const tg = I.typeGrid();
    if (full.length && roll < 0.6) {
      const gi = full[Math.floor(rng() * full.length)];
      I.onGauge(gi);
      if (st.aim !== null) I.handleTap(Math.floor(rng() * 8), Math.floor(rng() * 8));
    } else if (roll > 0.94) {
      I.onHint();
    } else {
      const moves = I.listMoves(tg);
      const m = moves[Math.floor(rng() * moves.length)];
      I.trySwap(m.a, m.b);
    }
    await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000);
    trace.push(JSON.stringify([I.typeGrid(), st.score, Math.round(st.timeLeft * 1000), st.gauge.slice(), st.stats.maxChain, st.stats.matches, st.phase]));
  }
  return trace;
}

test('spawn=0 이면 한 판 전체(보드·점수·시간·게이지)가 같은 시드의 일반용과 똑같이 흘러간다', { skip: skipGen }, async () => {
  let totalActions = 0;
  for (let seed = 1; seed <= 9; seed++) {
    const lv = ['easy', 'normal', 'hard'][seed % 3];
    const patch = (cfg) => {
      shortGame(cfg, 30, (c) => { ['easy', 'normal', 'hard'].forEach((k) => { c.difficulty[k].max = [4, 4, 4, 4, 4, 4]; }); });
      cfg.stages.targets[lv][0] = 3000;
      if (cfg.edu) { cfg.edu.wild.spawn = 0; cfg.edu.targetScale = 1; }
    };
    const edu = createEnv('edu', 1000 + seed, patch);
    edu.setQuiz(makeQuiz(edu));                  // ready=true 라도 spawn=0 이면 ? 없음
    edu.I.save.level = lv;
    const t1 = await playScripted(edu, 77 + seed, 60);
    const gen = createEnv('gen', 1000 + seed, patch);
    gen.I.save.level = lv;
    const t2 = await playScripted(gen, 77 + seed, 60);
    assert.ok(t1.length > 5, '행동 수가 너무 적음');
    assert.deepStrictEqual(t1, t2, '시드 ' + seed + ' (' + lv + ') 에서 일반용과 달라짐');
    assert.strictEqual(edu.asks.length, 0);
    assert.strictEqual(edu.giftSet, 0);
    totalActions += t1.length;
    edu.dispose();
    gen.dispose();
  }
  assert.ok(totalActions > 100, '비교한 행동 수 ' + totalActions);
});

/* ---------- 봇: ? 가 있는 판에서 스킬·연쇄·재섞기·힌트 ---------- */
async function runBots(o) {
  const stats = {
    naturalReshuffles: 0, games: 0, actions: 0, swapActions: 0, invalidSwaps: 0, skillActions: 0, skillAsks: 0, asks: 0, swapAsks: 0, giftsCreated: 0, giftsRemoved: 0,
    skippedBySkillChain: 0, reshuffles: 0, reshufflesWithWild: 0, hints: 0, wildHints: 0, pauses: 0, cleared: 0, skillKinds: {}, maxWildOnBoard: 0,
    timeFrozenChecks: 0
  };
  const perCtx = 40;
  let env = null;
  for (let gi = 0; gi < o.games; gi++) {
    if (!env || gi % perCtx === 0) {
      if (env) { assert.deepStrictEqual(env.errors, []); stats.giftsCreated += env.giftSet; env.dispose(); }
      const variant = Math.floor(gi / perCtx) % 3;
      env = createEnv('edu', o.seed + gi * 7919, (cfg) => {
        shortGame(cfg, o.secs || 25);
        ['easy', 'normal', 'hard'].forEach((k) => { cfg.difficulty[k].max = [3, 3, 4, 3, 4, 4]; });
        cfg.edu.wild.spawn = [0.05, 0.12, 0.2][variant];
        cfg.edu.wild.max = [2, 2, 4][variant];
        cfg.edu.wild.guaranteeFirst = variant !== 1;
      });
      env.maxWild = env.CONFIG.edu.wild.max;
      env.setQuiz(makeQuiz(env, {
        thinkMs: 1200,
        onAsk: (rec, st) => {
          // 문제 중에 일시정지·Esc·탭 전환을 가끔 시도해도 게임은 그대로여야 한다
          if ((rec.index % 3) === 0) {
            env.dispatchDoc('keydown', { key: 'Escape' });
            env.doc.hidden = true; env.dispatchDoc('visibilitychange'); env.doc.hidden = false;
            env.I.pauseGame();
            if (st.phase !== 'playing') env.errors.push(new Error('문제 중 일시정지됨: ' + st.phase));
          }
        },
        answer: (rec, st) => (rec.index % 4 === 1 ? { right: false, bonus: 0 } : (rec.index % 7 === 3 ? null : { right: true, bonus: G.bonusFor(st.level) }))
      }));
    }
    const I = env.I;
    const st = I.state;
    const rng = mulberry(o.seed * 31 + gi);
    const lv = ['easy', 'normal', 'hard'][gi % 3];
    I.save.level = lv;
    env.CONFIG.stages.targets[lv][0] = gi % 5 === 0 ? 2500 : 90000;      // 일부 판은 중간에 클리어
    const asks0 = env.asks.length;
    await startAndWait(env, lv, 1);
    stats.games++;
    let guard = 0;
    while (st.phase === 'playing' && guard++ < 400) {
      await env.runFor(150 + Math.floor(rng() * 800));
      if (st.phase !== 'playing') break;
      if (st.locked) { await env.runUntil(() => !st.locked || st.phase !== 'playing', 120000); continue; }
      const tg = I.typeGrid();
      if (G.countWild(tg) > 0 && rng() < 0.04) {      // 재섞기 강제: ? 가 있는 보드에서도 매치 0·유효한 수·? 수 보존·화면 동기
        const nBefore = G.countWild(tg);
        await env.await(I.reshuffleBoard());
        stats.reshuffles++;
        stats.reshufflesWithWild++;
        const nAfter = checkBoard(env, '강제 재섞기 game ' + gi);
        if (nBefore <= 2) assert.strictEqual(nAfter, nBefore, '재섞기 뒤 ? 수가 달라짐(실제 max=2 이하)');
        else assert.ok(nAfter <= nBefore && nAfter >= 1, '재섞기 뒤 ? 수(스트레스 설정 max=4): ' + nBefore + ' -> ' + nAfter);
        continue;
      }
      const full = [];
      for (let i = 0; i < 6; i++) if (st.gauge[i] >= I.CONFIG.types[i].max) full.push(i);
      const roll = rng();
      const askBefore = env.asks.length;
      const skippedBefore = st.edu.skipped;
      env.resetAction();
      let kind = 'swap';
      if (full.length && roll < 0.55) {
        const gi2 = full[Math.floor(rng() * full.length)];
        kind = 'skill-' + I.CONFIG.types[gi2].id;
        I.onGauge(gi2);
        if (st.aim !== null) {
          const wc = [];
          tg.forEach((row, r) => row.forEach((v, c) => { if (v === W) wc.push({ r, c }); }));
          const p = wc.length && rng() < 0.7 ? wc[Math.floor(rng() * wc.length)] : { r: Math.floor(rng() * 8), c: Math.floor(rng() * 8) };
          I.handleTap(p.r, p.c);
        }
      } else if (roll > 0.96) {
        kind = 'hint';
        const hintBefore = st.hint;       // (강제 재섞기는 행동 밖에서 호출하므로 이전 힌트가 남을 수 있다: 새로 생긴 힌트만 검사)
        I.onHint();
        if (st.hint && st.hint !== hintBefore) {
          stats.hints++;
          assert.ok(G.wouldMatch(tg, st.hint.a.r, st.hint.a.c, st.hint.b.r, st.hint.b.c), '힌트 수가 매치가 안 됨');
          if (tg[st.hint.a.r][st.hint.a.c] === W || tg[st.hint.b.r][st.hint.b.c] === W) stats.wildHints++;
        }
        continue;
      } else if (roll > 0.93) {
        kind = 'pause';
        I.pauseGame();
        await env.runFor(300);
        I.resumeGame();
        stats.pauses++;
        continue;
      } else {
        const moves = I.listMoves(tg);
        assert.ok(moves.length > 0);
        const wm = moves.filter((m) => tg[m.a.r][m.a.c] === W || tg[m.b.r][m.b.c] === W);
        let m = wm.length && rng() < 0.5 ? wm[Math.floor(rng() * wm.length)] : moves[Math.floor(rng() * moves.length)];
        if (rng() < 0.06) {                       // 가끔 무효한 스왑(되돌림): 문제 없음
          const r = Math.floor(rng() * 8); const c = Math.floor(rng() * 7);
          if (!moves.some((x) => x.a.r === r && x.a.c === c && x.b.r === r && x.b.c === c + 1)) { m = { a: { r, c }, b: { r, c: c + 1 } }; kind = 'invalid'; }
        }
        I.trySwap(m.a, m.b);
      }
      assert.strictEqual(st.locked, true, kind + ': 입력이 잠기지 않음');
      await env.runUntil(() => !st.locked || st.phase !== 'playing', 180000);
      stats.actions++;
      const asked = env.asks.length - askBefore;
      stats.asks += asked;
      stats.giftsRemoved += env.removedGifts.size;
      if (kind.indexOf('skill') === 0) {
        stats.skillActions++;
        stats.skillAsks += asked;
        stats.skillKinds[kind] = (stats.skillKinds[kind] || 0) + 1;
        assert.strictEqual(asked, 0, kind + ': 스킬 행동에서 문제 요청');
        if (kind === 'skill-lightning') assert.strictEqual(env.zappedGifts.size, 0, '번개가 ? 를 맞춤');
        stats.skippedBySkillChain += st.edu.skipped - skippedBefore;
      } else {
        if (kind === 'invalid') { stats.invalidSwaps++; assert.strictEqual(asked, 0, '무효 스왑에서 문제 요청'); } else stats.swapActions++;
        stats.swapAsks += asked;
        // 스왑으로 시작한 행동: 지워진 ? 하나당 문제 1개(한 행동 최대 3)
        assert.strictEqual(asked, Math.min(env.CONFIG.edu.quiz.maxPerAction, env.removedGifts.size), kind + ': 문제 수 != 지워진 ? 수');
      }
      if (env.reshuffled) { stats.reshuffles++; stats.naturalReshuffles++; if (G.countWild(I.typeGrid()) > 0) stats.reshufflesWithWild++; }
      const wilds = checkBoard(env, 'game ' + gi + ' action ' + stats.actions);
      stats.maxWildOnBoard = Math.max(stats.maxWildOnBoard, wilds);
      assert.ok(wilds <= env.maxWild, '보드 위 ? 가 max 초과: ' + wilds);
      assert.strictEqual(st.quizActive, false);
    }
    // 문제 중 시계 정지(모든 문제에서): 열린 동안 시계·점수 값이 그대로
    for (let k = asks0; k < env.asks.length; k++) {
      const a = env.asks[k];
      if (!a.after) continue;
      stats.timeFrozenChecks++;
      ['timeLeft', 'freeze', 'dark', 'hintCd', 'hintLeft', 'multHold', 'score'].forEach((f) => assert.strictEqual(a.after[f], a.snap[f], '문제 중 ' + f + ' 변화'));
      assert.strictEqual(a.snap.active, true);
      assert.strictEqual(a.snap.phase, 'playing');
    }
    assert.ok(st.phase === 'over' || guard >= 400, '판이 끝나지 않음: ' + st.phase);
    assert.strictEqual(st.quizActive, false);
    if (st.phase === 'over' && G.stageTarget(lv, 1) > 0 && st.score >= st.target) stats.cleared++;
  }
  if (env) { assert.deepStrictEqual(env.errors, []); stats.giftsCreated += env.giftSet; env.dispose(); }
  return stats;
}

test('봇 1,000판: ? 가 있는 보드의 스킬·연쇄·재섞기·힌트·일시정지가 오류 없이 끝나고, 문제는 스왑 행동에서 지워진 ? 수만큼만 나온다', async () => {
  const games = Number(process.env.EG_BOT_GAMES || 1000);
  const t0 = Date.now();
  const stats = await runBots({ games, seed: 20261108, secs: 25 });
  // eslint-disable-next-line no-console
  console.log('봇 결과', JSON.stringify(stats), ((Date.now() - t0) / 1000).toFixed(1) + 's');
  assert.strictEqual(stats.games, games);
  assert.ok(stats.actions > games * 4, '행동 수 ' + stats.actions);
  assert.ok(stats.asks > games / 4, '문제 요청 수 ' + stats.asks);
  assert.ok(stats.giftsRemoved > games / 4);
  assert.strictEqual(stats.skillAsks, 0);
  assert.ok(stats.skippedBySkillChain > 0);
  ['fire', 'water', 'grass', 'lightning', 'dark', 'light'].forEach((k) => assert.ok(stats.skillKinds['skill-' + k] > 0, k + ' 스킬이 한 번도 안 쓰임'));
  assert.ok(stats.reshufflesWithWild > 0, '? 가 있는 보드의 재섞기가 한 번도 없음');
  assert.ok(stats.wildHints > 0, '? 를 쓰는 힌트가 한 번도 없음');
  assert.ok(stats.cleared > 0, '문제와 클리어가 함께 일어난 판이 없음');
  assert.ok(stats.invalidSwaps > 0 && stats.pauses > 0 && stats.hints > 0);
  assert.ok(stats.timeFrozenChecks > 100);
  assert.strictEqual(stats.maxWildOnBoard <= 4, true);
});
