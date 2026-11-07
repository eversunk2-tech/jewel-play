/* 교육용 문제 UI·학습단원 선택의 순수 로직 시험 (spec §21.4.3·§21.7.6·§21.9·§21.10 E2).
 * 대상: edu.js 의 bag(출제 풀) · 저장 병합 · 소단원 파일 로더 · 카탈로그 조회 · 강조 표기 · 정적 점검.
 * 실행: node --test apps/element-gems-edu/test/edu-ui.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
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
  assert.deepStrictEqual(L.normalizeEdu(null), { v: 1, unit: null, pool: {}, stats: {} });
  assert.deepStrictEqual(L.normalizeEdu('x'), { v: 1, unit: null, pool: {}, stats: {} });
  assert.deepStrictEqual(L.normalizeEdu([]), { v: 1, unit: null, pool: {}, stats: {} });
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

test('일반용 style.css 는 교육용 복사본에서 바뀌지 않았다(추가 스타일은 edu.css 로)', () => {
  const a = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const b = fs.readFileSync(path.join(root, '..', 'element-gems', 'style.css'), 'utf8');
  assert.strictEqual(a, b);
});
