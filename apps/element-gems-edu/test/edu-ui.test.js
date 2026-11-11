/* 교육용 문제 UI·학습단원 선택의 순수 로직 시험 (spec §21.4.3·§21.7.6·§21.9·§21.10 E2).
 * 대상: edu.js 의 bag(출제 풀) · 저장 병합 · 소단원 파일 로더 · 카탈로그 조회 · 강조 표기 · 정적 점검.
 * 실행: node --test apps/element-gems-edu/test/edu-ui.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const L = require(path.join(root, 'edu.js'));
const CAT = require(path.join(root, 'edu-data', 'catalog.js'));
const CATALOG = CAT.EDU_CATALOG || CAT;

function lcg(seed) { let s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function mkItems(nFacts, per) {
  const items = [];
  let n = 1;
  for (let f = 1; f <= nFacts; f++) for (let k = 0; k < per; k++) items.push({ n: n++, t: 'ox', q: '문제 ' + n, a: 1, e: '해설', f: 'F' + f, k: 'tf-t' });
  return items;
}
const newBag = () => ({ order: [], pos: 0, recent: [] });

/* ---------- bag(출제 풀) ---------- */
test('bag: 60개를 다 쓰기 전에는 같은 문제가 나오지 않고, 60개가 모두 한 번씩 나온다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const items = mkItems(20, 3);
    const bag = newBag();
    const rng = lcg(seed);
    const got = [];
    for (let i = 0; i < 60; i++) got.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).n);
    assert.strictEqual(new Set(got).size, 60, 'seed ' + seed);
    assert.strictEqual(bag.pos, 60);
  }
});

test('bag: 최근 6문제 안에서는 같은 f 가 나오지 않는다(처음 40문제, 20사실×3문항)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const items = mkItems(20, 3);
    const bag = newBag();
    const rng = lcg(seed);
    const seq = [];
    for (let i = 0; i < 40; i++) seq.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).f);
    for (let i = 0; i < seq.length; i++) {
      for (let j = Math.max(0, i - 5); j < i; j++) assert.notStrictEqual(seq[j], seq[i], 'seed ' + seed + ' 위치 ' + i);
    }
  }
});

test('bag: 한 스테이지 안에서 같은 f 는 두 번 나오지 않는다(stageF 를 스테이지마다 비움)', () => {
  const items = mkItems(20, 3);
  const bag = newBag();
  const rng = lcg(7);
  for (let stage = 0; stage < 6; stage++) {
    const stageF = {};
    const seen = [];
    for (let i = 0; i < 8; i++) seen.push(L.drawFromBag(bag, items, { rng: rng, stageF: stageF }).f);
    assert.strictEqual(new Set(seen).size, seen.length, '스테이지 ' + stage);
  }
});

test('bag: 스테이지가 바뀌어도 이어서 출제한다(저장 → 정규화 → 이어서)', () => {
  const items = mkItems(30, 2);
  const rng = lcg(11);
  let bag = newBag();
  const got = [];
  for (let i = 0; i < 25; i++) got.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).n);
  // 저장 문자열을 거쳐 다시 읽는다(다음 방문)
  const saved = L.normalizeEdu(JSON.parse(JSON.stringify({ unit: 'soc-3-2-1-1', pool: { 'soc-3-2-1-1': bag } })));
  bag = saved.pool['soc-3-2-1-1'];
  assert.strictEqual(bag.pos, 25);
  for (let i = 0; i < 35; i++) got.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).n);
  assert.strictEqual(new Set(got).size, 60, '60개를 이어서 쓰는 동안 반복 없음');
});

test('bag: 다 쓰면 다시 섞고, 직전 6개는 새 바퀴의 앞 6칸에 오지 않는다(f 미룸으로 끌어와도 마찬가지)', () => {
  for (const shape of [[60, 1], [30, 2], [20, 3], [15, 4]]) {
    for (let seed = 1; seed <= 40; seed++) {
      const items = mkItems(shape[0], shape[1]);
      const bag = newBag();
      const rng = lcg(seed);
      const first = [];
      for (let i = 0; i < 60; i++) first.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).n);
      const last6 = first.slice(-6);
      const next = [];
      for (let i = 0; i < 6; i++) next.push(L.drawFromBag(bag, items, { rng: rng, stageF: {} }).n);
      next.forEach(function (n) { assert.ok(last6.indexOf(n) === -1, shape.join('x') + ' seed ' + seed + ': 직전 문제 ' + n + ' 가 바로 다시 나옴'); });
      assert.strictEqual(bag.pos, 6);
    }
  }
});

test('bag: 고정 시드는 같은 순서를 만든다 / 서로 다른 시드는 다른 순서를 만든다', () => {
  const items = mkItems(20, 3);
  function seq(seed) { const b = newBag(); const r = lcg(seed); const o = []; for (let i = 0; i < 12; i++) o.push(L.drawFromBag(b, items, { rng: r, stageF: {} }).n); return o.join(','); }
  assert.strictEqual(seq(5), seq(5));
  assert.notStrictEqual(seq(5), seq(6));
});

test('bag: 문제 파일이 바뀌어 저장된 순서가 현재 문제 번호와 맞지 않으면 새로 섞는다', () => {
  const items = mkItems(20, 3);
  const bag = { order: [1, 2, 3, 3, 4], pos: 2, recent: ['F1'] };
  assert.strictEqual(L.bagValid(bag, items.map((i) => i.n)), false);
  const it = L.drawFromBag(bag, items, { rng: lcg(1), stageF: {} });
  assert.ok(it);
  assert.strictEqual(bag.order.length, 60);
  assert.strictEqual(bag.pos, 1);
  assert.strictEqual(L.bagValid(bag, items.map((i) => i.n)), true);
});

test('bag: 소단원별 bag 은 서로 섞이지 않고 따로 이어진다', () => {
  const a = mkItems(20, 3);
  const b = mkItems(20, 3);
  const edu = { pool: {} };
  const rng = lcg(3);
  edu.pool.A = newBag();
  edu.pool.B = newBag();
  for (let i = 0; i < 10; i++) L.drawFromBag(edu.pool.A, a, { rng: rng, stageF: {} });
  for (let i = 0; i < 4; i++) L.drawFromBag(edu.pool.B, b, { rng: rng, stageF: {} });
  assert.strictEqual(edu.pool.A.pos, 10);
  assert.strictEqual(edu.pool.B.pos, 4);
  L.drawFromBag(edu.pool.A, a, { rng: rng, stageF: {} });
  assert.strictEqual(edu.pool.A.pos, 11);
  assert.strictEqual(edu.pool.B.pos, 4);
});

test('bag: 문제가 하나뿐이어도 오류 없이 계속 낸다 / 비어 있으면 null', () => {
  const one = mkItems(1, 1);
  const bag = newBag();
  for (let i = 0; i < 5; i++) assert.strictEqual(L.drawFromBag(bag, one, { rng: lcg(1), stageF: {} }).n, 1);
  assert.strictEqual(L.drawFromBag(newBag(), [], {}), null);
});

test('bag: 사실이 아주 적은 소단원(4사실×15문항)도 멈추지 않고 모든 문제를 낸다', () => {
  const items = mkItems(4, 15);
  const bag = newBag();
  const got = [];
  for (let i = 0; i < 60; i++) got.push(L.drawFromBag(bag, items, { rng: lcg(2), stageF: {} }).n);
  assert.strictEqual(new Set(got).size, 60);
});

/* ---------- 한 바퀴 순서 짜기: 같은 사실이 가까이 오지 않게 (spec §48) ---------- */
const SPREAD = () => L.EDU_UI.bag;
const spreadW = (nFacts) => Math.max(1, Math.min(SPREAD().spreadMax, Math.floor(nFacts * SPREAD().spreadRatio)));
const factOf = (items) => { const m = {}; items.forEach((it) => { m[it.n] = it.f; }); return m; };
const sortedNums = (a) => a.slice().sort((x, y) => x - y);
function loadRealUnits() {                                  // 실제 소단원 파일(edu-data/q/*.js)을 vm 으로 읽는다 → { id: { items:[…] } }
  const dir = path.join(root, 'edu-data', 'q');
  const out = {};
  fs.readdirSync(dir).filter((f) => /^soc-[a-z0-9-]+\.js$/.test(f)).sort().forEach((f) => {
    const w = {};
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), { window: w });
    Object.assign(out, w.EDU_Q);
  });
  return out;
}
/* 보통 모드 흉내: 판당 3~4문제, bag 은 판을 넘어 이어지고 stageF 는 판마다 비운다. oldStyle=true 면 예전 방식(shuffleAvoid)으로 순서를 짜 넣어 비교 기준으로 쓴다 */
function simNormal(items, seed, total, oldStyle) {
  const ns = items.map((i) => i.n);
  const rng = lcg(seed);
  const bag = newBag();
  if (oldStyle) bag.order = L.shuffleAvoid(ns, rng, [], 0);
  const seq = [];
  while (seq.length < total) {
    const stageF = {};
    const k = rng() < 0.5 ? 3 : 4;
    for (let i = 0; i < k && seq.length < total; i++) {
      if (oldStyle && bag.pos >= bag.order.length) {         // 바퀴 종료 → 예전처럼 다시 섞기(직전 6개 앞쪽 제외)
        const tail = bag.order.slice(-6);
        bag.order = L.shuffleAvoid(ns, rng, tail, 6);
        bag.pos = 0;
        bag.held = tail;
      }
      const it = L.drawFromBag(bag, items, { rng: rng, stageF: stageF });
      seq.push({ n: it.n, f: it.f });
    }
  }
  return seq;
}
/* 같은 사실이 다시 나온 간격들 중 10문제 이내 비율(%) · 3문제 이내 반복 횟수 · 한 바퀴(lap 개) 안 같은 번호 반복 횟수 */
function spreadStats(seq, lap) {
  const last = {};
  let repeats = 0, le10 = 0, le3 = 0, lapDup = 0;
  seq.forEach((x, i) => {
    if (last[x.f] != null) { const g = i - last[x.f]; repeats++; if (g <= 10) le10++; if (g <= 3) le3++; }
    last[x.f] = i;
  });
  for (let s = 0; s + lap <= seq.length; s += lap) {
    const seen = {};
    for (let i = s; i < s + lap; i++) { if (seen[seq[i].n]) lapDup++; seen[seq[i].n] = true; }
  }
  return { le10: repeats ? 100 * le10 / repeats : 0, le3: le3, lapDup: lapDup };
}

test('spec §48 설정: 순서 짜기 매개변수 4개가 EDU_UI.bag 한 곳에 있고, 기존 안전망 값은 그대로다', () => {
  assert.deepStrictEqual(Object.assign({}, L.EDU_UI.bag), { recentWindow: 6, avoidFirst: 6, stageSameFact: 1, spreadRatio: 0.6, spreadMax: 14, spreadTries: 12, spreadNear: 10 });
});

test('buildSpreadOrder ① 결과는 items 번호의 순열이다(빠지거나 겹치지 않음) — 모양·시드·이전 바퀴 꼬리 유무에 상관없이', () => {
  const shapes = [mkItems(20, 3), mkItems(60, 1), mkItems(30, 2), mkItems(15, 4), mkItems(4, 15), mkItems(1, 60), mkItems(17, 3).concat(mkItems(3, 3).map((it, i) => ({ n: 100 + i, t: 'ox', q: 'q', a: 1, e: 'e', f: 'G' + (i % 2) })))];
  shapes.forEach((items, si) => {
    const want = sortedNums(items.map((i) => i.n));
    for (let seed = 1; seed <= 30; seed++) {
      assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, [], lcg(seed))), want, '모양 ' + si + ' seed ' + seed);
      assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'], lcg(seed), L.EDU_UI.bag)), want, '꼬리 있음 모양 ' + si + ' seed ' + seed);
    }
  });
  // 번호가 1부터 이어지지 않아도(건너뜀·큰 수) 그 번호들의 순열이다. 입력 배열은 바뀌지 않는다
  const odd = [{ n: 7, f: 'A' }, { n: 3, f: 'A' }, { n: 99, f: 'B' }, { n: 12, f: 'C' }, { n: 5, f: 'B' }];
  const snapshot = JSON.stringify(odd);
  const prev = ['A', 'B'];
  assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(odd, prev, lcg(9))), [3, 5, 7, 12, 99]);
  assert.strictEqual(JSON.stringify(odd), snapshot);
  assert.deepStrictEqual(prev, ['A', 'B']);
});

test('buildSpreadOrder ② 같은 시드는 같은 순서를 만들고, 다른 시드는 다른 순서를 만든다', () => {
  const items = mkItems(20, 3);
  const a = L.buildSpreadOrder(items, ['F3'], lcg(5)).join(',');
  assert.strictEqual(a, L.buildSpreadOrder(items, ['F3'], lcg(5)).join(','));
  const variants = new Set();
  for (let seed = 1; seed <= 10; seed++) variants.add(L.buildSpreadOrder(items, ['F3'], lcg(seed)).join(','));
  assert.strictEqual(variants.size, 10, '시드 10개 → 순서 10가지');
  // 번호 순서 그대로(1,2,3,…)나 사실별로 묶인 순서가 아니다
  assert.notStrictEqual(a, items.map((i) => i.n).join(','));
});

test('buildSpreadOrder ③ 실제 25개 단원(보통 모드 흉내, 약 180문제, 단원마다 여러 시드): 같은 사실이 10문제 안에 다시 나오는 비율 3% 미만 · 3문제 안 반복 거의 없음 · 한 바퀴 안 같은 문제 반복 0', () => {
  const units = loadRealUnits();
  const ids = Object.keys(units);
  assert.ok(ids.length >= 25, '단원 파일 25개 이상: ' + ids.length);
  const SEEDS = 40;
  let sumLe10 = 0, sumLe3 = 0, worstLe10 = 0, worstId = '', lapDup = 0, oldSum = 0;
  ids.forEach((id, ui) => {
    const items = L.cleanItems(units[id]);
    assert.ok(items && items.length >= 40, id + ' 문제 수');
    let le10 = 0, le3 = 0, old10 = 0;
    for (let s = 0; s < SEEDS; s++) {
      const st = spreadStats(simNormal(items, 7000 + s * 7919 + ui * 104729, 180, false), items.length);
      le10 += st.le10; le3 += st.le3; lapDup += st.lapDup;
    }
    for (let s = 0; s < 10; s++) old10 += spreadStats(simNormal(items, 7000 + s * 7919 + ui * 104729, 180, true), items.length).le10;
    sumLe10 += le10 / SEEDS; sumLe3 += le3 / SEEDS; oldSum += old10 / 10;
    if (le10 / SEEDS > worstLe10) { worstLe10 = le10 / SEEDS; worstId = id; }
  });
  const meanLe10 = sumLe10 / ids.length;
  const meanLe3 = sumLe3 / ids.length;
  assert.ok(meanLe10 < 3, '10문제 안에 같은 사실이 다시 나온 비율(평균 %): ' + meanLe10.toFixed(2) + ' (기준 3 미만)');
  assert.ok(meanLe3 < 0.05, '3문제 안 반복(180문제당 평균): ' + meanLe3.toFixed(3) + ' (기준 0.05 미만)');
  assert.ok(worstLe10 < 10, '최악 단원 ' + worstId + ': ' + worstLe10.toFixed(2) + '% (기준 10 미만)');
  assert.strictEqual(lapDup, 0, '한 바퀴(60문제) 안에서 같은 문제 번호가 반복되면 안 된다');
  // 같은 지표를 예전 방식(shuffleAvoid)으로 재면 기준을 크게 넘는다 → 이 시험이 개선을 가려낸다
  assert.ok(oldSum / ids.length > 10, '예전 방식은 10% 넘게 반복(평균): ' + (oldSum / ids.length).toFixed(1));
});

test('buildSpreadOrder ④ 바퀴 경계: 이전 바퀴 끝에 나온 사실은 새 순서의 처음 w칸 안에 다시 오지 않는다(w = 사실 수 × 0.6, 최대 14)', () => {
  [mkItems(20, 3), mkItems(60, 1), mkItems(30, 2), mkItems(15, 4)].forEach((items, si) => {
    const byN = factOf(items);
    const keys = Array.from(new Set(items.map((i) => i.f)));
    const w = spreadW(keys.length);
    const prevs = [keys.slice(0, w), ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].concat(keys.slice(2, 2 + w))];   // 꼬리가 w개 / 꼬리가 w보다 긴 경우(끝 w개만 쓰인다)
    prevs.forEach((prev, pi) => {
      for (let seed = 1; seed <= 40; seed++) {
        const fs = L.buildSpreadOrder(items, prev, lcg(seed)).map((n) => byN[n]);
        for (let i = 0; i < w; i++) {
          const block = prev.slice(Math.max(0, prev.length - (w - i)));       // 새 순서 i번째 칸 기준 "최근 w개"에 아직 남아 있는 이전 바퀴의 사실들
          assert.ok(block.indexOf(fs[i]) === -1, '모양 ' + si + ' 꼬리 ' + pi + ' seed ' + seed + ' ' + i + '번째 칸의 사실 ' + fs[i] + ' 가 이전 바퀴 끝과 너무 가깝다');
        }
      }
    });
  });
});

test('buildSpreadOrder ④ 보강: 12번 짠 것 중 고를 때 벌점은 바퀴 경계(이전 바퀴 끝)와의 거리도 센다 — 사실 A·B·C 한 문제씩, 직전 바퀴가 A,B,C로 끝난 경우', () => {
  // w = 1 이라 직전 한 개(C)만 막힌다. 사실이 서로 달라 바퀴 안의 벌점은 0이고, 경계 거리만 순서를 가른다: A,B,C 가 다시 같은 간격(3칸)으로 이어지는 순서가 가장 낫다.
  const items = [{ n: 1, f: 'A' }, { n: 2, f: 'B' }, { n: 3, f: 'C' }];
  let best = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const got = L.buildSpreadOrder(items, ['A', 'B', 'C'], lcg(seed * 104729 + 17)).join(',');
    if (got === '1,2,3') best++;
  }
  assert.ok(best >= 160, '경계 벌점이 가장 작은 순서(A,B,C)를 고른 횟수: ' + best + ' / 200 (한 번만 짜면 약 1/4)');
});

test('buildSpreadOrder ⑤ 경계 입력(사실 1개·문제 1개·f 없음·빈 목록·이상한 인자·rng 경계값)에서 깨지지 않고 순열을 돌려준다', () => {
  assert.deepStrictEqual(L.buildSpreadOrder([], [], lcg(1)), []);
  assert.deepStrictEqual(L.buildSpreadOrder(null, [], lcg(1)), []);
  assert.deepStrictEqual(L.buildSpreadOrder(undefined), []);
  assert.deepStrictEqual(L.buildSpreadOrder([{ n: 5, f: 'A' }], ['A'], lcg(1)), [5]);                    // 문제 1개(직전과 같은 사실이어도 낸다)
  const oneFact = mkItems(1, 8);                                                                          // 사실 1개뿐 → 가까이 오지 않게 할 수 없어도 모두 낸다
  assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(oneFact, ['F1', 'F1'], lcg(2))), [1, 2, 3, 4, 5, 6, 7, 8]);
  const noF = [];                                                                                         // f 가 없는 문제들: 문제마다 따로 센다(깨지지 않음)
  for (let n = 1; n <= 12; n++) noF.push({ n: n, t: 'ox', q: 'q', a: 1, e: 'e' });
  noF.push({ n: 13, f: 'A' }, { n: 14, f: 'A' }, { n: 15, f: '' });
  const wantNoF = sortedNums(noF.map((i) => i.n));
  for (let seed = 1; seed <= 20; seed++) assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(noF, [], lcg(seed))), wantNoF);
  // rng·꼬리·cfg 를 빼거나 이상한 값을 줘도 된다
  const items = mkItems(20, 3);
  const want = sortedNums(items.map((i) => i.n));
  assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items)), want);                                    // rng 없음 → Math.random
  [undefined, null, 'x', 5, {}].forEach((prev) => assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, prev, lcg(3))), want));
  [undefined, null, {}, { spreadRatio: 0 }, { spreadRatio: 100 }, { spreadMax: 0 }, { spreadTries: 0 }, { spreadTries: NaN, spreadNear: 'x' }, { spreadNear: 0 }, { spreadNear: 1000, spreadTries: 3 }].forEach((cfg, ci) => {
    assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, ['F1'], lcg(4), cfg)), want, 'cfg ' + ci);
  });
  [() => 0, () => 0.9999999999, () => 1].forEach((rng, ri) => assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, ['F2'], rng)), want, 'rng ' + ri));
  // 설정을 바꾸면 실제로 달라진다: 한 번만 짜는 것(spreadTries 1)보다 12번 짜서 고르는 편이 가까운 반복이 적다
  function nearPairs(order, byN) { let c = 0; order.forEach((n, i) => { for (let d = 1; d <= 9 && i - d >= 0; d++) if (byN[order[i - d]] === byN[n]) c++; }); return c; }
  const hard = mkItems(17, 3), byNh = factOf(hard);
  let one = 0, many = 0;
  for (let seed = 1; seed <= 60; seed++) {
    one += nearPairs(L.buildSpreadOrder(hard, [], lcg(seed), { spreadRatio: 0.6, spreadMax: 14, spreadTries: 1, spreadNear: 10 }), byNh);
    many += nearPairs(L.buildSpreadOrder(hard, [], lcg(seed), { spreadRatio: 0.6, spreadMax: 14, spreadTries: 12, spreadNear: 10 }), byNh);
  }
  assert.ok(many < one, '12번 짜서 고르면 1번 짠 것보다 가까운 반복이 적다: ' + many + ' < ' + one);
});

test('buildSpreadOrder ⑤ 보강(Review R-G): 터무니없이 큰 설정값(spreadNear 1e200 → 벌점 Infinity, spreadMax 2e4·spreadRatio 1e9 → 예전엔 몇 초씩 걸리던 값)에서도 멈추지 않고 곧바로 순열을 돌려준다', () => {
  const items = mkItems(17, 3);
  const want = sortedNums(items.map((i) => i.n));
  const t0 = Date.now();
  [{ spreadNear: 1e200 }, { spreadNear: Number.MAX_VALUE }, { spreadMax: 2e4, spreadRatio: 1e9 }, { spreadMax: 2e4, spreadRatio: 1e9, spreadNear: 1e200 }].forEach((cfg, ci) => {
    for (let seed = 1; seed <= 2; seed++) {
      assert.deepStrictEqual(sortedNums(L.buildSpreadOrder(items, ['F1', 'F2'], lcg(seed), Object.assign({}, L.EDU_UI.bag, cfg))), want, 'cfg ' + ci + ' seed ' + seed);
    }
  });
  assert.ok(Date.now() - t0 < 2000, '큰 설정값에서도 2초 안에 끝난다: ' + (Date.now() - t0) + 'ms');
});

test('buildSpreadOrder ⑥ drawFromBag 연결: 새 bag은 새 방식으로 순서를 만들고(같은 시드 → 같은 순서), 바퀴가 끝나면 이전 바퀴 끝과 가깝지 않게 다시 짠다', () => {
  // 새 bag: 첫 문제를 낸 뒤 bag.order 는 buildSpreadOrder 가 같은 시드로 만든 순서와 같다(첫 문제는 제자리라 순서가 바뀌지 않는다)
  for (let seed = 1; seed <= 20; seed++) {
    const items = mkItems(20, 3);
    const bag = newBag();
    L.drawFromBag(bag, items, { rng: lcg(seed), stageF: {} });
    assert.deepStrictEqual(bag.order, L.buildSpreadOrder(items, [], lcg(seed), L.EDU_UI.bag), 'seed ' + seed);
    assert.strictEqual(bag.pos, 1);
  }
  // 바퀴 종료 뒤: 한 바퀴(60)를 다 쓰고 한 문제 더 → 새 순서(순열), 이전 바퀴와 다른 순서, held = 지난 바퀴 끝 6개, 처음 w칸에 지난 바퀴 끝 사실이 오지 않음
  [[20, 3], [60, 1], [30, 2], [15, 4]].forEach((shape) => {
    for (let seed = 1; seed <= 25; seed++) {
      const items = mkItems(shape[0], shape[1]);
      const byN = factOf(items);
      const w = spreadW(shape[0]);
      const bag = newBag();
      const rng = lcg(seed);
      for (let i = 0; i < 60; i++) L.drawFromBag(bag, items, { rng: rng, stageF: {} });
      const oldOrder = bag.order.slice();
      const oldFs = oldOrder.map((n) => byN[n]);
      L.drawFromBag(bag, items, { rng: rng, stageF: {} });
      const tag = shape.join('x') + ' seed ' + seed;
      assert.strictEqual(bag.pos, 1, tag);
      assert.deepStrictEqual(sortedNums(bag.order), sortedNums(oldOrder), tag + ' 순열');
      assert.notDeepStrictEqual(bag.order, oldOrder, tag + ' 바퀴마다 순서가 다르다');
      assert.deepStrictEqual(bag.held, oldOrder.slice(-6), tag + ' held');
      const fs = bag.order.map((n) => byN[n]);
      for (let i = 0; i < w; i++) {
        const block = oldFs.slice(oldFs.length - (w - i));
        assert.ok(block.indexOf(fs[i]) === -1, tag + ' ' + i + '번째 칸 사실 ' + fs[i] + ' 가 지난 바퀴 끝과 가깝다');
      }
    }
  });
});

test('buildSpreadOrder ⑥ 저장된 유효 bag(바퀴 도중)은 순서가 바뀌지 않고 그 바퀴가 끝날 때까지 rng 도 쓰지 않는다(옛 방식으로 만든 bag 포함)', () => {
  const items = mkItems(20, 3);
  const ns = items.map((i) => i.n);
  // (a) 같은 사실이 20칸씩 떨어진 순서(pull-forward 가 일어나지 않는다) → 순서가 한 칸도 바뀌지 않는다
  const inter = [];
  for (let k = 0; k < 3; k++) for (let f = 0; f < 20; f++) inter.push(f * 3 + k + 1);
  let calls = 0;
  const spy = () => { calls++; return 0.5; };
  const bagA = { order: inter.slice(), pos: 10, recent: [] };
  assert.strictEqual(L.bagValid(bagA, ns), true);
  const gotA = [];
  for (let i = 0; i < 50; i++) gotA.push(L.drawFromBag(bagA, items, { rng: spy, stageF: {} }).n);
  assert.deepStrictEqual(gotA, inter.slice(10), '저장된 순서 그대로 이어서 낸다');
  assert.deepStrictEqual(bagA.order, inter);
  assert.strictEqual(calls, 0, '바퀴 도중에는 rng 를 쓰지 않는다');
  L.drawFromBag(bagA, items, { rng: spy, stageF: {} });                                       // 바퀴가 끝난 다음 첫 문제 → 새 방식으로 다시 짠다
  assert.ok(calls > 0, '바퀴가 끝나면 새로 짠다');
  assert.strictEqual(bagA.pos, 1);
  assert.deepStrictEqual(sortedNums(bagA.order), sortedNums(ns));
  // (b) 옛 방식(shuffleAvoid)으로 만들어 저장된 bag: 이어서 낼 때 같은 문제가 한 바퀴 안에서 반복되지 않고, 끝나는 순간까지 rng 를 쓰지 않는다
  for (let seed = 1; seed <= 20; seed++) {
    const old = { order: L.shuffleAvoid(ns, lcg(seed), [], 0), pos: 0, recent: [] };
    const rng = lcg(100 + seed);
    let used = 0;
    const counted = () => { used++; return rng(); };
    const got = [];
    for (let i = 0; i < 60; i++) got.push(L.drawFromBag(old, items, { rng: counted, stageF: {} }).n);
    assert.strictEqual(new Set(got).size, 60, 'seed ' + seed);
    assert.strictEqual(used, 0, 'seed ' + seed + ' 옛 bag 은 바퀴 끝까지 rng 를 쓰지 않는다');
  }
  // 저장 → 정규화 → 이어서 낸 것도 같다(edu.pool 형식 변경 없음: order·pos·recent·held 만)
  const fresh = newBag();
  const rng2 = lcg(21);
  for (let i = 0; i < 17; i++) L.drawFromBag(fresh, items, { rng: rng2, stageF: {} });
  const restored = L.normalizeEdu(JSON.parse(JSON.stringify({ unit: 'soc-3-2-1-1', pool: { 'soc-3-2-1-1': fresh } }))).pool['soc-3-2-1-1'];
  assert.deepStrictEqual(Object.keys(restored).sort(), ['held', 'order', 'pos', 'recent']);
  assert.deepStrictEqual(restored.order, fresh.order);
  assert.strictEqual(L.bagValid(restored, ns), true);
});

/* ---------- 문제 데이터 검증·강조 ---------- */
test('cleanItems: 모양이 어긋난 문제는 건너뛰고 번호가 겹치면 앞의 것만 쓴다', () => {
  const good = { n: 1, t: 'mc', q: '문제', c: ['가', '나', '다', '라'], a: 2, e: '해설', f: 'F1' };
  const ox = { n: 2, t: 'ox', q: '문제', a: 0, e: '해설', f: 'F2' };
  const bad = [
    { n: 3, t: 'mc', q: '문제', c: ['가', '나', '다'], a: 0, e: '해설', f: 'F1' },     // 보기 3개
    { n: 4, t: 'mc', q: '문제', c: ['가', '나', '다', '라'], a: 4, e: '해설', f: 'F1' },  // 정답 범위 밖
    { n: 5, t: 'ox', q: '문제', a: 2, e: '해설', f: 'F1' },
    { n: 6, t: 'zz', q: '문제', a: 0, e: '해설', f: 'F1' },
    { n: 7, t: 'ox', q: '', a: 0, e: '해설', f: 'F1' },
    { n: 8, t: 'ox', q: '문제', a: 0, e: '해설' },                                      // f 없음
    { n: 0, t: 'ox', q: '문제', a: 0, e: '해설', f: 'F1' },
    null, 'x'
  ];
  const dup = { n: 1, t: 'ox', q: '다른 문제', a: 1, e: '해설', f: 'F9' };
  const out = L.cleanItems({ items: [good, ox].concat(bad, [dup]) });
  assert.deepStrictEqual(out.map((i) => i.n), [1, 2]);
  assert.strictEqual(out[0].q, '문제');
  assert.strictEqual(L.cleanItems({ items: bad }), null);
  assert.strictEqual(L.cleanItems(null), null);
  assert.strictEqual(L.cleanItems({ items: 'x' }), null);
});

test('parseEmphasis: **…** 는 강조 조각이 되고 별표는 결과에 남지 않는다(짝이 안 맞아도)', () => {
  const t = (s) => L.parseEmphasis(s).map((p) => (p.strong ? '[' + p.text + ']' : p.text)).join('');
  assert.strictEqual(t('산이 많은 지역에서 볼 **수 없는** 것은?'), '산이 많은 지역에서 볼 [수 없는] 것은?');
  assert.strictEqual(t('**가장 먼저** 하는 일은?'), '[가장 먼저] 하는 일은?');
  assert.strictEqual(t('**옳지 않은** 것은 **무엇**일까요?'), '[옳지 않은] 것은 [무엇]일까요?');
  assert.strictEqual(t('닫히지 않은 **강조'), '닫히지 않은 강조');
  assert.strictEqual(t('강조 없음'), '강조 없음');
  assert.strictEqual(t('****'), '');
  assert.strictEqual(t(''), '');
  assert.strictEqual(t(null), '');
  ['**a**', 'x **y** z', '**'].forEach((s) => assert.ok(L.parseEmphasis(s).every((p) => p.text.indexOf('*') === -1), s));
  // HTML 처럼 보이는 글자도 그대로 글자다(호출한 쪽이 텍스트 노드로만 넣는다)
  assert.strictEqual(t('<b>x</b> **<i>y</i>**'), '<b>x</b> [<i>y</i>]');
  assert.strictEqual(L.stripStars('보**기**'), '보기');
});

/* ---------- 저장 병합·정규화 ---------- */
test('mergeEduIntoSave: edu 만 바꾸고 다른 필드(진행·설정 등)는 그대로 둔다', () => {
  const raw = JSON.stringify({ level: 'hard', progress: { easy: 1, normal: 2, hard: 3 }, muted: true, stages: { easy: [{ best: 5, stars: 1, left: 9 }] }, edu: { unit: 'old' } });
  const out = JSON.parse(L.mergeEduIntoSave(raw, { v: 1, unit: 'soc-3-2-1-1', pool: {}, stats: {} }));
  assert.strictEqual(out.level, 'hard');
  assert.deepStrictEqual(out.progress, { easy: 1, normal: 2, hard: 3 });
  assert.strictEqual(out.muted, true);
  assert.deepStrictEqual(out.stages, { easy: [{ best: 5, stars: 1, left: 9 }] });
  assert.strictEqual(out.edu.unit, 'soc-3-2-1-1');
});

test('mergeEduIntoSave: 저장이 비었거나 깨졌거나 배열이면 { edu } 만 만든다', () => {
  ['', null, undefined, '{깨짐', '[1,2]', '"문자열"', '123'].forEach((raw) => {
    const out = JSON.parse(L.mergeEduIntoSave(raw, { unit: 'a' }));
    assert.deepStrictEqual(Object.keys(out), ['edu'], String(raw));
  });
});

test('readEduFromRaw ↔ mergeEduIntoSave: 왕복해도 같다', () => {
  const edu = L.normalizeEdu({ unit: 'soc-5-2-1-1', pool: { 'soc-5-2-1-1': { order: [3, 1, 2], pos: 1, recent: ['F1'] } }, stats: { 'soc-5-2-1-1': { asked: 4, right: 3 } } });
  const raw = L.mergeEduIntoSave('{"level":"easy"}', edu);
  assert.deepStrictEqual(L.readEduFromRaw(raw), edu);
});

test('normalizeEdu: 잘못된 값은 기본값, 값 범위는 안전하게 줄인다', () => {
  assert.deepStrictEqual(L.normalizeEdu(null), { v: 1, unit: null, intensity: 'normal', pool: {}, stats: {} });     // spec §27.7 M3-B: 문제 양 선택(intensity)이 추가되어 기본값('normal', spec §47)이 함께 나온다
  assert.deepStrictEqual(L.normalizeEdu('x'), { v: 1, unit: null, intensity: 'normal', pool: {}, stats: {} });     // spec §27.7 M3-B: 문제 양 선택(intensity)이 추가되어 기본값('normal', spec §47)이 함께 나온다
  assert.deepStrictEqual(L.normalizeEdu([]), { v: 1, unit: null, intensity: 'normal', pool: {}, stats: {} });     // spec §27.7 M3-B: 문제 양 선택(intensity)이 추가되어 기본값('normal', spec §47)이 함께 나온다
  const e = L.normalizeEdu({
    unit: '../evil', pool: { 'soc-3-2-1-1': { order: [1, 2, 'x'], pos: 1 }, 'soc-3-2-1-2': { order: [1, 2, 3], pos: 99, recent: ['F1', 7, 'F2'] }, 'BAD ID': { order: [1], pos: 0 } },
    stats: { 'soc-3-2-1-1': { asked: 3, right: 9 }, 'soc-3-2-1-2': { asked: -1, right: 2 }, 'bad id': { asked: 1, right: 1 } }
  });
  assert.strictEqual(e.unit, null);
  assert.deepStrictEqual(Object.keys(e.pool), ['soc-3-2-1-2']);
  assert.strictEqual(e.pool['soc-3-2-1-2'].pos, 3);
  assert.deepStrictEqual(e.pool['soc-3-2-1-2'].recent, ['F1', 'F2']);
  assert.deepStrictEqual(e.stats['soc-3-2-1-1'], { asked: 3, right: 3 });
  assert.deepStrictEqual(e.stats['soc-3-2-1-2'], { asked: 0, right: 0 });
  assert.strictEqual(e.stats['bad id'], undefined);
  assert.strictEqual(L.normalizeEdu({ unit: 'soc-4-2-1-1' }).unit, 'soc-4-2-1-1');
});

/* ---------- 보너스·글귀 ---------- */
test('bonusFor: 초보 240 / 중수 300 / 고수 390 (난이도 배율), 모르는 난이도는 300', () => {
  assert.strictEqual(L.bonusFor('easy'), 240);
  assert.strictEqual(L.bonusFor('normal'), 300);
  assert.strictEqual(L.bonusFor('hard'), 390);
  assert.strictEqual(L.bonusFor('???'), 300);
  assert.strictEqual(L.bonusFor('hard', { base: 100, mult: { hard: 2 } }), 200);
});

test('글귀: 문항 id · 통계 줄 · 결과 요약 · 정답 말', () => {
  assert.strictEqual(L.questionId('soc-5-2-1-1', 23), 'soc-5-2-1-1-023');
  assert.strictEqual(L.questionId('soc-5-2-1-1', 7), 'soc-5-2-1-1-007');
  assert.strictEqual(L.statLine({ asked: 12, right: 9 }), '지금까지 12문제 중 9개 맞혔어요');
  assert.strictEqual(L.statLine({ asked: 0, right: 0 }), '');
  assert.strictEqual(L.statLine(undefined), '');
  assert.strictEqual(L.summaryLine({ asked: 3, right: 2, bonus: 600 }), '선물상자 문제 3개 중 2개 맞혔어요 · 보너스 +600점');
  assert.strictEqual(L.summaryLine({ asked: 2, right: 0, bonus: 0 }), '선물상자 문제 2개 중 0개 맞혔어요');
  assert.strictEqual(L.summaryLine({ asked: 0, right: 0, bonus: 0 }), '');
  assert.strictEqual(L.answerText({ t: 'mc', a: 2 }), '3번');
  assert.strictEqual(L.answerText({ t: 'ox', a: 1 }), '‘맞아요(O)’');
  assert.strictEqual(L.answerText({ t: 'ox', a: 0 }), '‘틀려요(X)’');
});

test('교과서 쪽수는 화면에 표시하지 않는다(사용자 결정 2026-11-08): showPages=false, 요약 글에 쪽수 없음', () => {
  assert.strictEqual(L.EDU_UI.showPages, false);
  const f = L.findSub(CATALOG, 'soc-5-2-1-1');
  assert.ok(!/쪽/.test(L.unitLabelOf(f, true)) && !/[0-9]+~[0-9]+/.test(L.unitLabelOf(f, false)));
  // 켜고 싶을 때를 위한 도우미는 남아 있다
  assert.strictEqual(L.pagesText('6-33'), '교과서 6~33쪽');
  assert.strictEqual(L.pagesText(''), '');
  assert.strictEqual(L.pagesText(undefined), '');
  // 렌더링 코드에서 pagesText 를 쓰는 곳은 showPages 조건 한 곳뿐이다
  const code = fs.readFileSync(path.join(root, 'edu.js'), 'utf8');
  const uses = code.split('\n').filter((l) => /pagesText\(/.test(l) && !/function pagesText/.test(l));
  assert.strictEqual(uses.length, 1);
  assert.ok(/EDU_UI\.showPages \? pagesText\(/.test(uses[0]));
});

/* ---------- 카탈로그(실제 파일) ---------- */
test('카탈로그: 실제 catalog.js 로 소단원을 찾고 요약 글을 만든다', () => {
  const f = L.findSub(CATALOG, 'soc-5-2-1-1');
  assert.ok(f);
  assert.strictEqual(f.grade, 5);
  assert.strictEqual(f.term, 2);
  assert.strictEqual(f.unit.no, 1);
  assert.strictEqual(f.sub.no, 1);
  assert.strictEqual(L.unitLabelOf(f, true), '5학년 2학기 · 1-(1)');
  assert.strictEqual(L.unitLabelOf(f, false), '5학년 2학기 · 1-(1) ' + f.sub.name);
  assert.strictEqual(L.findSub(CATALOG, 'soc-9-9-9-9'), null);
  assert.strictEqual(L.findSub(CATALOG, '../x'), null);
  assert.strictEqual(L.findSub(null, 'soc-5-2-1-1'), null);
  assert.strictEqual(L.hasAnySub(CATALOG), true);
  assert.deepStrictEqual(L.defaultChips(CATALOG), { subject: 'soc', grade: 3, term: 2 });
  // 1학기는 준비 중(ready:false)이라 목록이 비고, 2학기는 단원이 있다
  const soc = L.readySubjects(CATALOG)[0];
  assert.strictEqual(L.unitsOf(soc, 3, 1).length, 0);
  assert.ok(L.unitsOf(soc, 3, 2).length >= 2);
  assert.deepStrictEqual(L.gradesOf(soc).map((g) => g.grade), [3, 4, 5, 6]);
  assert.strictEqual(L.termsOf(soc, 3).filter(L.termReady).length, 1);
  assert.strictEqual(L.termsOf(soc, 3).length, 2);
});

test('카탈로그: 항목만 추가해도(코드 수정 없이) 새 과목·1학기가 나타나고, ready:false 는 숨는다/비활성', () => {
  const cat = JSON.parse(JSON.stringify(CATALOG));
  const extra = {
    id: 'sci', name: '과학', ready: true,
    grades: [{ grade: 5, terms: [{ term: 1, ready: true, units: [{ no: 1, name: '시험 단원', subs: [{ no: 1, id: 'sci-5-1-1-1', name: '시험 소단원', pages: '', count: 60, file: 'edu-data/q/sci-5-1-1-1.js' }] }] }, { term: 2, ready: false }] }]
  };
  cat.subjects.push(extra);
  cat.subjects.push({ id: 'kor', name: '국어', ready: false, grades: [{ grade: 3, terms: [{ term: 1, ready: true, units: [{ no: 1, name: '숨김', subs: [{ no: 1, id: 'kor-3-1-1-1', name: '숨김', pages: '', count: 60, file: 'edu-data/q/kor-3-1-1-1.js' }] }] }] }] });
  assert.deepStrictEqual(L.readySubjects(cat).map((s) => s.id), ['soc', 'sci']);          // 준비 안 된 과목은 칩이 없다
  assert.ok(L.findSub(cat, 'sci-5-1-1-1'));
  assert.strictEqual(L.findSub(cat, 'kor-3-1-1-1'), null);
  assert.strictEqual(L.unitLabelOf(L.findSub(cat, 'sci-5-1-1-1'), false), '5학년 1학기 · 1-(1) 시험 소단원');
  // 사회 3학년 1학기를 열면 기본 칩이 1학기로 바뀐다
  const soc = cat.subjects[0];
  soc.grades[0].terms[0] = { term: 1, ready: true, units: [{ no: 1, name: '새 단원', subs: [{ no: 1, id: 'soc-3-1-1-1', name: '새 소단원', pages: '1-2', count: 60, file: 'edu-data/q/soc-3-1-1-1.js' }] }] };
  assert.deepStrictEqual(L.defaultChips(cat), { subject: 'soc', grade: 3, term: 1 });
  assert.ok(L.findSub(cat, 'soc-3-1-1-1'));
  // 모든 과목이 준비 안 됨 / 학기에 소단원이 없음 → 고를 것이 없다
  assert.strictEqual(L.hasAnySub({ subjects: [{ id: 'a', name: 'a', ready: false, grades: [] }] }), false);
  assert.strictEqual(L.hasAnySub({ subjects: [{ id: 'a', name: 'a', ready: true, grades: [{ grade: 3, terms: [{ term: 1, ready: true, units: [] }] }] }] }), false);
  assert.strictEqual(L.hasAnySub(undefined), false);
});

test('카탈로그: 모든 소단원의 파일 경로가 허용 규칙(edu-data/q/*.js)을 통과한다', () => {
  let n = 0;
  L.readySubjects(CATALOG).forEach((s) => L.gradesOf(s).forEach((g) => L.termsOf(s, g.grade).filter(L.termReady).forEach((t) => t.units.forEach((u) => u.subs.forEach((sb) => {
    n++;
    assert.ok(L.safeFile(sb.file), sb.id + ' ' + sb.file);
    assert.ok(L.findSub(CATALOG, sb.id), sb.id);
  })))));
  assert.strictEqual(n, 25);
});

/* ---------- 지연 로더 ---------- */
function fakeEnv(script) {
  const reg = {};
  const calls = [];
  const timers = [];
  const env = {
    registry: () => reg,
    inject: (src, ok, fail) => { calls.push(src); script(src, ok, fail, reg); return function () { calls.push('cancel:' + src); }; },
    setTimer: (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; },
    clearTimer: () => {},
    timeoutMs: 1000
  };
  return { env: env, reg: reg, calls: calls, timers: timers };
}
const GOOD = { v: 1, facts: [{ id: 'F1', s: 'x' }], items: [{ n: 1, t: 'ox', q: '문제', a: 1, e: '해설', f: 'F1', k: 'tf-t' }] };

test('로더: 성공하면 ready 가 되고 문제 목록을 주며, 두 번째부터는 다시 부르지 않는다(캐시)', async () => {
  const fx = fakeEnv((src, ok, fail, reg) => { reg['soc-3-2-1-1'] = GOOD; ok(); });
  const ld = L.createLoader(fx.env);
  assert.strictEqual(ld.status('soc-3-2-1-1'), 'idle');
  assert.strictEqual(await ld.load('soc-3-2-1-1', 'edu-data/q/soc-3-2-1-1.js'), 'ready');
  assert.strictEqual(ld.status('soc-3-2-1-1'), 'ready');
  assert.strictEqual(ld.items('soc-3-2-1-1').length, 1);
  assert.strictEqual(await ld.load('soc-3-2-1-1', 'edu-data/q/soc-3-2-1-1.js'), 'ready');
  assert.strictEqual(fx.calls.length, 1);
});

test('로더: 파일이 없으면(onerror) failed 이고 문제 목록이 없다 → 다시 부르면 재시도(주소에 ?r=1)', async () => {
  let fail = true;
  const fx = fakeEnv((src, ok, bad, reg) => { if (fail) bad(); else { reg['soc-4-2-1-1'] = GOOD; ok(); } });
  const ld = L.createLoader(fx.env);
  assert.strictEqual(await ld.load('soc-4-2-1-1', 'edu-data/q/soc-4-2-1-1.js'), 'failed');
  assert.strictEqual(ld.status('soc-4-2-1-1'), 'failed');
  assert.strictEqual(ld.items('soc-4-2-1-1'), null);
  fail = false;
  assert.strictEqual(await ld.load('soc-4-2-1-1', 'edu-data/q/soc-4-2-1-1.js'), 'ready');
  assert.deepStrictEqual(fx.calls.filter((c) => c.indexOf('cancel') === -1), ['edu-data/q/soc-4-2-1-1.js', 'edu-data/q/soc-4-2-1-1.js?r=1']);
});

test('로더: 불러오는 중에 또 부르면 같은 약속을 돌려준다(중복 삽입 없음)', async () => {
  let okFn = null;
  const fx = fakeEnv((src, ok) => { okFn = ok; });
  const ld = L.createLoader(fx.env);
  const p1 = ld.load('soc-5-2-1-1', 'edu-data/q/soc-5-2-1-1.js');
  const p2 = ld.load('soc-5-2-1-1', 'edu-data/q/soc-5-2-1-1.js');
  assert.strictEqual(ld.status('soc-5-2-1-1'), 'loading');
  fx.reg['soc-5-2-1-1'] = GOOD;
  okFn();
  assert.deepStrictEqual(await Promise.all([p1, p2]), ['ready', 'ready']);
  assert.strictEqual(fx.calls.length, 1);
});

test('로더: 제한 시간이 지나면 failed(timeout)', async () => {
  const fx = fakeEnv(() => { /* 아무 응답 없음 */ });
  const ld = L.createLoader(fx.env);
  const p = ld.load('soc-5-2-1-2', 'edu-data/q/soc-5-2-1-2.js');
  assert.strictEqual(fx.timers.length, 1);
  assert.strictEqual(fx.timers[0].ms, 1000);
  fx.timers[0].fn();
  assert.strictEqual(await p, 'failed');
  assert.strictEqual(ld.why('soc-5-2-1-2'), 'timeout');
});

test('로더: 파일은 불러와졌지만 문제가 없거나 모양이 깨졌으면 failed(bad-data)', async () => {
  const fx = fakeEnv((src, ok, fail, reg) => { reg['soc-6-2-1-1'] = { items: [{ n: 1, t: 'mc', q: 'x', c: ['a'], a: 0, e: '', f: 'F' }] }; ok(); });
  const ld = L.createLoader(fx.env);
  assert.strictEqual(await ld.load('soc-6-2-1-1', 'edu-data/q/soc-6-2-1-1.js'), 'failed');
  assert.strictEqual(ld.why('soc-6-2-1-1'), 'bad-data');
});

test('로더: 허용 폴더 밖·외부 주소·상위 폴더 경로는 아예 부르지 않는다(failed)', async () => {
  const fx = fakeEnv(() => { throw new Error('불러오면 안 됨'); });
  const ld = L.createLoader(fx.env);
  for (const file of ['http://example.com/x.js', '//example.com/x.js', 'edu-data/q/../../game.js', 'edu-data/catalog.js', 'edu-data/q/a.txt', 'assets/x.js', '', undefined, 'edu-data/q/A B.js', 'edu-data/q/a/b.js', 'edu-data/q/.js']) {
    assert.strictEqual(await ld.load('soc-3-2-1-1', file), 'failed', String(file));
  }
  assert.strictEqual(fx.calls.length, 0);
  assert.strictEqual(L.safeFile('edu-data/q/soc-3-2-1-1.js'), true);
});

test('로더: 이미 등록된 소단원(다른 곳에서 먼저 불러옴)은 주입 없이 바로 ready', async () => {
  const fx = fakeEnv(() => { throw new Error('불러오면 안 됨'); });
  fx.reg['soc-3-2-2-1'] = GOOD;
  const ld = L.createLoader(fx.env);
  assert.strictEqual(await ld.load('soc-3-2-2-1', 'edu-data/q/soc-3-2-2-1.js'), 'ready');
});

test('로더: 주입 자체가 예외를 던져도 failed 로 끝난다(게임은 계속)', async () => {
  const fx = fakeEnv(() => { throw new Error('boom'); });
  const ld = L.createLoader(fx.env);
  assert.strictEqual(await ld.load('soc-3-2-1-2', 'edu-data/q/soc-3-2-1-2.js'), 'failed');
});

/* ---------- 정적 점검(마크업·CSS·안전) ---------- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'edu.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'edu.js'), 'utf8');

test('index.html: 교육용 제목 · 선물상자 심볼 · 선택 화면 · 문제 대화상자 · 스크립트 순서', () => {
  assert.match(html, /<title>[^<]*교육용[^<]*<\/title>/);
  assert.ok(html.includes('<symbol id="gem-gift"'));
  assert.ok(html.includes('id="screen-edu-pick"') && html.includes('id="eg-pick-ok"') && html.includes('id="eg-unit-card"') && html.includes('id="eg-unit-btn"'));
  assert.match(html, /id="eg-quiz"[^>]*hidden/);
  assert.match(html, /class="eg-quiz" role="dialog" aria-modal="true" aria-labelledby="eg-q-text"/);
  assert.match(html, /id="eg-q-result"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.ok(html.includes('id="eg-q-id"'));
  const order = ['nick-words.js', 'nickname.js', 'edu-data/catalog.js', 'game.js', 'ranking.js', 'ranking-ui.js', 'edu.js'].map((f) => html.indexOf('<script src="' + f + '"'));
  order.forEach((i, k) => assert.ok(i > 0, '스크립트 줄 없음 #' + k));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], '스크립트 순서가 어긋남 #' + i);
  assert.ok(html.indexOf('href="edu.css"') > html.indexOf('href="style.css"'));
  // 문제 대화상자는 #app 밖(배경을 inert 로 만들 수 있게)
  assert.ok(html.indexOf('id="eg-quiz"') > html.indexOf('</main>'));
});

test('index.html: 모드 선택 링크는 숨김으로 시작하고 상대경로(../../)이다 / 외부 주소가 없다', () => {
  assert.match(html, /id="eg-home-wrap"[^>]*hidden/);
  assert.match(html, /id="eg-home-link" href="\.\.\/\.\.\/"/);
  assert.ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'index.html 에 외부 주소가 있다');
  assert.ok(!/https?:\/\//.test(css), 'edu.css 에 외부 주소가 있다');
});

test('edu.js: 네트워크로 풀이 기록을 보내지 않고, 외부 주소·ES module·innerHTML 을 쓰지 않는다 (§21.5.2)', () => {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'import(', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'].forEach((w) => assert.ok(code.indexOf(w) === -1, 'edu.js 에 ' + w));
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'ES module 문법');
  assert.ok(!/https?:\/\//.test(code), '외부 주소');
});

test('화면 글귀: "뽑기"·"확률" 같은 낱말을 쓰지 않는다 (§21.5.2)', () => {
  const visible = (html + js + css).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['뽑기', '확률', '랜덤 보상', '결제', '광고'].forEach((w) => assert.ok(visible.indexOf(w) === -1, w));
});

test('edu.css: 움직임 줄이기 설정을 존중하고 터치 타깃 규칙(44px 이상)이 있다', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const rm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(rm.includes('animation: none'));
  assert.match(css, /\.eg-chip \{[^}]*min-height: 44px/);
  assert.match(css, /\.eg-opt \{[^}]*min-height: 52px/);
  assert.match(css, /\.eg-sub \{[^}]*min-height: 56px/);
  assert.ok(css.includes('.eg-quiz-q .eg-em') && css.includes('text-decoration: underline'), '강조는 색에만 의존하지 않는다');
});

test('edu.css: 휴대폰 가로(낮은 화면) — 단원 칩 한 줄 · 폭 640px 이상 2열 시작 화면 · 일시정지 창 2열 버튼 (R1 중요 1번)', () => {
  const phone = '@media (orientation: landscape) and (max-height: 500px)';
  assert.ok(css.includes(phone + ' {\n  .eg-unit { display: grid;'), '낮은 가로 화면의 단원 칩 규칙');
  assert.match(css, /\.eg-unit \{[^}]*grid-template-areas: "top label btn" "top stat btn" "warn warn warn"/);
  assert.match(css, /\.eg-unit \.btn \{[^}]*grid-area: btn[^}]*min-height: 44px/, '줄인 칩에서도 버튼은 44px 이상');
  assert.ok(css.includes(phone + ' and (min-width: 640px) {'), '2열 시작 화면은 폭 640px 이상에서만');
  assert.match(css, /\.start-card \{[^}]*display: grid[^}]*grid-template-areas: "brand menu" "info menu"/);
  assert.match(css, /#overlay-pause \.panel \{[^}]*grid-template-columns: 1fr 1fr/);
  // 와이드·세로 화면의 칩 규칙(맨 위 기본 규칙)은 그대로다
  assert.match(css, /\n\.eg-unit \{ margin: 2px 0 10px; padding: 10px 12px;/);
  assert.match(css, /\n\.eg-unit \.btn \{ width: 100%; min-height: 44px; \}/);
});

test('일반용 style.css 는 교육용 복사본에서 바뀌지 않았다(추가 스타일은 edu.css 로)', () => {
  const a = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const b = fs.readFileSync(path.join(root, '..', 'element-gems', 'style.css'), 'utf8');
  assert.strictEqual(a, b);
});
