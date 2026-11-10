/* 교육용 문제 카탈로그·검증기 시험 (spec §21.4.3 검증 항목, §21.10 E8). 실행: node --test apps/element-gems-edu/test/edu-data.test.js
 * - 시험용 가짜 데이터는 모두 이 파일 안에서 만들어 메모리/임시 폴더에만 둔다(edu-data/q/ 에는 파일을 만들지 않는다).
 * - 원문 폴더 대조(카탈로그 제목)는 환경 변수 EDU_SOURCE_DIR 가 있을 때만 한다. 예: EDU_SOURCE_DIR=<원문 txt 폴더> node --test ...
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const APP = path.join(__dirname, '..');
const V = require(path.join(APP, 'tools', 'validate-edu-data.js'));
const CATALOG = require(path.join(APP, 'edu-data', 'catalog.js'));
const VALIDATOR = path.join(APP, 'tools', 'validate-edu-data.js');

/* ================================================================
 * 시험 도구: 가짜 정상 데이터 생성기
 * ================================================================ */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }

// 검증기의 금칙·민감어·어려운 말·그림 표현에 걸리지 않도록 그 낱말에 쓰인 글자를 뺀 음절 풀
const AVOID = new Set();
V.SENSITIVE_WORDS.concat(V.HARD_WORDS_LOW).forEach((w) => Array.from(w).forEach((c) => AVOID.add(c)));
Array.from('위아래밑다음이그옆표글자료사진그림지도만화도면삽화모두없음전부해당정답보기둘셋않아니못것을를은는가에서의과와으로도').forEach((c) => AVOID.add(c));
const POOL = Array.from('나라마바카타파하거너더러머버커터퍼허고노로모보코토포호구누두루무부쿠투푸후느드르므브크트프흐기니디리미비키티피히').filter((c) => !AVOID.has(c));

function makeText(rand, n) {                     // 한글 음절을 무작위로 n개, 2~4자마다 띄어 쓴다
  let out = '';
  let run = 0;
  let limit = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    out += POOL[Math.floor(rand() * POOL.length)];
    run++;
    if (run >= limit && i < n - 1) { out += ' '; run = 0; limit = 2 + Math.floor(rand() * 3); }
  }
  return out;
}

const OX_KINDS = ['tf-t', 'tf-f', 'tf-n', 'ce', 'where', 'cmp'];
const MC_KINDS = ['bl-t', 'd2t', 't2d', 'ec', 'not', 'cls', 'seq', 'pair', 'who', 'exa', 'why', 'ce', 'where', 'cmp'];

/* 규칙을 모두 지키는 60문제 파일. opts: { nOx, nO, pos:[①..④ 개수] } 로 비율을 일부러 틀어 볼 수 있다. */
function makeUnit(id, opts) {
  const o = Object.assign({ nOx: 24, nO: 12, pos: [9, 9, 9, 9] }, opts || {});
  const rand = rng(hashStr(id));
  const nMc = 60 - o.nOx;
  const posList = [];
  o.pos.forEach((cnt, p) => { for (let i = 0; i < cnt; i++) posList.push(p); });
  const items = [];
  let oLeft = o.nO;
  let flex = 0;
  for (let j = 0; j < o.nOx; j++) {
    const k = OX_KINDS[j % OX_KINDS.length];
    let a;
    if (k === 'tf-t') a = 1; else if (k === 'tf-f') a = 0; else { a = flex % 2 === 0 ? 1 : 0; flex++; }
    items.push({ t: 'ox', k: k, a: a });
  }
  // nO 개수에 맞게 (정답 O) 조정: 유연한 기법의 a 를 뒤집는다
  let cntO = items.filter((x) => x.a === 1).length;
  for (let j = 0; j < items.length && cntO !== oLeft; j++) {
    if (items[j].k === 'tf-t' || items[j].k === 'tf-f') continue;
    if (cntO > oLeft && items[j].a === 1) { items[j].a = 0; cntO--; } else if (cntO < oLeft && items[j].a === 0) { items[j].a = 1; cntO++; }
  }
  if (cntO !== oLeft) { // 유연한 기법만으로 못 맞추면 tf-n 으로 바꿔 가며 맞춘다
    for (let j = 0; j < items.length && cntO !== oLeft; j++) {
      if (cntO > oLeft && items[j].a === 1) { items[j].k = 'tf-n'; items[j].a = 0; cntO--; } else if (cntO < oLeft && items[j].a === 0) { items[j].k = 'tf-n'; items[j].a = 1; cntO++; }
    }
  }
  for (let j = 0; j < nMc; j++) items.push({ t: 'mc', k: MC_KINDS[j % MC_KINDS.length], a: posList[j] });
  // 사실 배정: 사실 20개, 각 3문항, 같은 사실에 같은 기법 금지
  const facts = [];
  for (let i = 1; i <= 20; i++) facts.push({ id: 'F' + String(i).padStart(2, '0'), s: makeText(rand, 12) });
  const uses = {};
  const kinds = {};
  items.forEach((it) => {
    for (let t = 0; t < 20; t++) {
      const fid = facts[(items.indexOf(it) + t) % 20].id;
      if ((uses[fid] || 0) < 3 && !(kinds[fid] || {})[it.k]) { it.f = fid; uses[fid] = (uses[fid] || 0) + 1; (kinds[fid] = kinds[fid] || {})[it.k] = true; return; }
    }
    for (let t = 0; t < 20; t++) { const fid = facts[t].id; if (!(kinds[fid] || {})[it.k]) { it.f = fid; uses[fid] = (uses[fid] || 0) + 1; (kinds[fid] = kinds[fid] || {})[it.k] = true; return; } }
    throw new Error('사실 배정 실패');
  });
  items.forEach((it, i) => {
    it.n = i + 1;
    it.q = makeText(rand, 16 + Math.floor(rand() * 10)) + (it.t === 'ox' ? '다.' : (it.k === 'not' ? ' 옳지 않은 것은?' : '까요?'));
    if (it.t === 'mc') {
      it.c = [0, 1, 2, 3].map(() => makeText(rand, 4 + Math.floor(rand() * 8)));
    }
    it.e = makeText(rand, 14 + Math.floor(rand() * 8)) + '해요. ' + makeText(rand, 12 + Math.floor(rand() * 8)) + '이에요.';
  });
  const ordered = items.map((it) => {
    const x = { n: it.n, t: it.t, q: it.q };
    if (it.c) x.c = it.c;
    x.a = it.a; x.e = it.e; x.f = it.f; x.k = it.k;
    return x;
  });
  return { v: 1, facts: facts, items: ordered };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function unitInfo(id) {
  const m = /^soc-(\d)-/.exec(id);
  return { id: id, name: '시험', count: 60, grade: parseInt(m[1], 10) };
}
function check(id, data, sourceText) { return V.validateUnit(unitInfo(id), data, sourceText == null ? null : sourceText); }
function keys(list) { return Array.from(new Set(list.map((x) => x.rule + '/' + x.code))).sort(); }
function codes(list) { return Array.from(new Set(list.map((x) => x.code))).sort(); }

/* 오류 목록이 (has) 를 모두 포함하고 (has + allow) 밖의 코드가 없는지 확인 */
function expectErrors(r, has, allow) {
  const got = codes(r.errors);
  has.forEach((c) => assert.ok(got.indexOf(c) >= 0, '기대한 오류 코드 ' + c + ' 가 없음. 실제: ' + JSON.stringify(r.errors.map((e) => e.rule + '/' + e.code + ' ' + e.msg))));
  const okSet = new Set(has.concat(allow || []));
  got.forEach((c) => assert.ok(okSet.has(c), '뜻밖의 오류 코드 ' + c + ': ' + JSON.stringify(r.errors.filter((e) => e.code === c).map((e) => e.msg))));
}
function hasRule(list, rule, code) { return list.some((x) => x.rule === rule && x.code === code); }

/* 임시 폴더 */
const tmpRoots = [];
function mkTmp(label) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-data-test-' + label + '-')); tmpRoots.push(d); return d; }
test.after(() => { tmpRoots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); });
function unitFileText(id, data) { return "(function (w) {\n  var D = w.EDU_Q = w.EDU_Q || {};\n  D['" + id + "'] = " + JSON.stringify(data) + ";\n})(window);\n"; }
function writeUnit(root, id, data) {
  const dir = path.join(root, 'edu-data', 'q');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, id + '.js');
  fs.writeFileSync(f, typeof data === 'string' ? data : unitFileText(id, data), 'utf8');
  return f;
}
function allSubs() { return V.flattenCatalog(CATALOG); }

/* ================================================================
 * 1. 카탈로그
 * ================================================================ */
// spec §21.3 표를 그대로 옮긴 기대값 (id, 학년-학기, 대단원 번호·이름, 소단원 번호·이름, 쪽수)
const EXPECTED = [
  ['soc-3-2-1-1', 3, 1, '사회 변화와 다양한 문화', 1, '사회 변화로 달라진 생활 모습', '6-33'],
  ['soc-3-2-1-2', 3, 1, '사회 변화와 다양한 문화', 2, '다양한 문화에 대한 이해와 존중', '34-59'],
  ['soc-3-2-2-1', 3, 2, '옛날과 오늘날의 생활 모습', 1, '옛날과 오늘날의 풍습', '66-93'],
  ['soc-3-2-2-2', 3, 2, '옛날과 오늘날의 생활 모습', 2, '교통의 변화로 달라진 생활 모습', '94-119'],
  ['soc-3-2-2-3', 3, 2, '옛날과 오늘날의 생활 모습', 3, '통신수단의 변화로 달라진 생활 모습', '120-145'],
  ['soc-4-2-1-1', 4, 1, '민주주의와 자치', 1, '학교생활 속 민주주의', '6-29'],
  ['soc-4-2-1-2', 4, 1, '민주주의와 자치', 2, '주민 자치와 민주주의', '30-53'],
  ['soc-4-2-2-1', 4, 2, '지역문제를 해결하고 지역을 알리는 노력', 1, '지역문제의 해결', '54-79'],
  ['soc-4-2-2-2', 4, 2, '지역문제를 해결하고 지역을 알리는 노력', 2, '지역을 알리는 노력', '80-101'],
  ['soc-4-2-3-1', 4, 3, '다양한 환경과 삶의 모습', 1, '지역의 환경과 변화', '102-127'],
  ['soc-4-2-3-2', 4, 3, '다양한 환경과 삶의 모습', 2, '도시의 특징과 생활 모습', '128-149'],
  ['soc-5-2-1-1', 5, 1, '유적과 유물로 살펴본 옛 사람들의 생활', 1, '선사 시대와 고조선 사람들의 생활 모습', '6-27'],
  ['soc-5-2-1-2', 5, 1, '유적과 유물로 살펴본 옛 사람들의 생활', 2, '고대 사람들의 생각과 생활 모습', '28-45'],
  ['soc-5-2-1-3', 5, 1, '유적과 유물로 살펴본 옛 사람들의 생활', 3, '고려 사회와 사람들의 생활 모습', '46-69'],
  ['soc-5-2-2-1', 5, 2, '달라지는 시대, 변화하는 생활 모습', 1, '유교 문화의 영향으로 달라진 조선 사회', '70-93'],
  ['soc-5-2-2-2', 5, 2, '달라지는 시대, 변화하는 생활 모습', 2, '조선 후기 사회 변화와 달라진 생활 모습', '94-115'],
  ['soc-5-2-3-1', 5, 3, '식민 통치와 저항, 전쟁이 바꾼 사회와 생활', 1, '식민 통치와 저항으로 달라진 사회와 생활 모습', '116-139'],
  ['soc-5-2-3-2', 5, 3, '식민 통치와 저항, 전쟁이 바꾼 사회와 생활', 2, '8·15 광복과 6·25 전쟁으로 달라진 사회와 생활 모습', '140-159'],
  ['soc-6-2-1-1', 6, 1, '세계의 자연환경', 1, '세계 여러 지역의 지형 경관과 다양한 생활 모습', '6-29'],
  ['soc-6-2-1-2', 6, 1, '세계의 자연환경', 2, '세계의 기후와 다양한 생활 모습', '30-53'],
  ['soc-6-2-2-1', 6, 2, '시장경제와 국가 간 거래', 1, '우리나라 시장경제의 특징', '54-77'],
  ['soc-6-2-2-2', 6, 2, '시장경제와 국가 간 거래', 2, '경제성장과 우리 생활', '78-93'],
  ['soc-6-2-2-3', 6, 2, '시장경제와 국가 간 거래', 3, '세계 속의 무역', '94-117'],
  ['soc-6-2-3-1', 6, 3, '지구촌 사람들', 1, '세계의 인구 분포', '118-139'],
  ['soc-6-2-3-2', 6, 3, '지구촌 사람들', 2, '지구촌의 문제와 지속가능한 미래', '140-161']
];

test('카탈로그: 25개 소단원, id 유일, file 경로 규칙, count 60', () => {
  const subs = allSubs();
  assert.strictEqual(subs.length, 25);
  const ids = subs.map((e) => e.sub.id);
  assert.strictEqual(new Set(ids).size, 25);
  subs.forEach((e) => {
    assert.strictEqual(e.sub.file, 'edu-data/q/' + e.sub.id + '.js');
    assert.strictEqual(e.sub.count, 60);
    assert.strictEqual(e.sub.id, e.subject.id + '-' + e.grade + '-' + e.term + '-' + e.unit.no + '-' + e.sub.no);
  });
});

test('카탈로그: spec §21.3 표와 ID·대단원·소단원 이름·쪽수가 모두 같다', () => {
  const subs = allSubs();
  assert.strictEqual(subs.length, EXPECTED.length);
  EXPECTED.forEach((x, i) => {
    const e = subs[i];
    assert.strictEqual(e.sub.id, x[0]);
    assert.strictEqual(e.grade, x[1]);
    assert.strictEqual(e.term, 2);
    assert.strictEqual(e.unit.no, x[2]);
    assert.strictEqual(e.unit.name, x[3]);
    assert.strictEqual(e.sub.no, x[4]);
    assert.strictEqual(e.sub.name, x[5]);
    assert.strictEqual(e.sub.pages, x[6]);
  });
});

test('카탈로그: 과목 사회, 학년 3~6, 1학기는 ready:false(준비 중, units 없음), 2학기 ready:true, 학년별 소단원 5/6/7/7', () => {
  assert.strictEqual(CATALOG.v, 1);
  assert.strictEqual(CATALOG.subjects.length, 1);
  const soc = CATALOG.subjects[0];
  assert.strictEqual(soc.id, 'soc');
  assert.strictEqual(soc.name, '사회');
  assert.deepStrictEqual(soc.grades.map((g) => g.grade), [3, 4, 5, 6]);
  const perGrade = [];
  soc.grades.forEach((g) => {
    assert.deepStrictEqual(g.terms.map((t) => t.term), [1, 2]);
    const t1 = g.terms[0];
    assert.strictEqual(t1.ready, false);
    assert.strictEqual(t1.units, undefined);
    const t2 = g.terms[1];
    assert.strictEqual(t2.ready, true);
    perGrade.push(t2.units.reduce((n, u) => n + u.subs.length, 0));
  });
  assert.deepStrictEqual(perGrade, [5, 6, 7, 7]);
  assert.deepStrictEqual(CATALOG.subjects[0].grades[0].terms[1].units.map((u) => u.no), [1, 2]);
});

test('카탈로그: 브라우저처럼 window 만 있는 환경에서 불러오면 window.EDU_CATALOG 가 생기고 Node 내보내기와 같다', () => {
  const code = fs.readFileSync(path.join(APP, 'edu-data', 'catalog.js'), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.EDU_CATALOG)), JSON.parse(JSON.stringify(CATALOG)));
  assert.ok(!/\bimport\b|\bexport\b/.test(code.replace(/\/\*[\s\S]*?\*\//, '')), 'ES module 문법 금지');
});

test('카탈로그: 검증기의 카탈로그 점검에서 오류·경고가 없다', () => {
  assert.deepStrictEqual(V.checkCatalog(CATALOG), []);
});

test('카탈로그: 항목 추가만으로 과목·학기·소단원을 늘릴 수 있다 (1학기 열기·새 과목)', () => {
  const c = clone(CATALOG);
  c.subjects[0].grades[0].terms[0] = { term: 1, ready: true, units: [{ no: 1, name: '가짜 단원', subs: [{ no: 1, id: 'soc-3-1-1-1', name: '가짜', pages: '6-9', count: 60, file: 'edu-data/q/soc-3-1-1-1.js' }] }] };
  c.subjects.push({ id: 'sci', name: '과학', ready: true, grades: [{ grade: 3, terms: [{ term: 2, ready: true, units: [{ no: 1, name: '가짜', subs: [{ no: 1, id: 'sci-3-2-1-1', name: '가짜', pages: '', count: 60, file: 'edu-data/q/sci-3-2-1-1.js' }] }] }] }] });
  c.subjects.push({ id: 'eng', name: '영어', ready: false, grades: [] });
  assert.deepStrictEqual(V.checkCatalog(c), []);
  assert.strictEqual(V.flattenCatalog(c).length, 27);          // ready:false 과목은 제외
});

test('카탈로그 나쁜 예: id 겹침·id 규칙 위반·file 규칙 위반·count 오류·ready 인데 units 없음', () => {
  const c = clone(CATALOG);
  const subs = c.subjects[0].grades[0].terms[1].units[0].subs;
  subs[1].id = subs[0].id;                                      // 겹침 + 위치 규칙 위반
  subs[0].file = 'edu-data/q/other.js';
  subs[0].count = 59;
  c.subjects[0].grades[1].terms[1].units = [];
  const got = keys(V.checkCatalog(c));
  ['카탈로그/id-dup', '카탈로그/id-rule', '개수/file-rule', '개수/catalog-count', '카탈로그/term-empty'].forEach((k) => assert.ok(got.indexOf(k) >= 0, k + ' 없음: ' + got.join(', ')));
});

// 원문 폴더가 있을 때만: 소단원·대단원 이름과 쪽수가 학습지 제목 줄과 일치하는지
const SRC = process.env.EDU_SOURCE_DIR;
test('카탈로그: 이름·쪽수가 원문 학습지 제목 줄과 일치한다 (EDU_SOURCE_DIR 가 있을 때만)', { skip: !(SRC && fs.existsSync(SRC)) && 'EDU_SOURCE_DIR 없음(원문 폴더가 없어 건너뜀)' }, () => {
  allSubs().forEach((e) => {
    const file = V.sourceFileFor(e, SRC);
    assert.ok(fs.existsSync(file), '원문 파일 없음: ' + path.basename(file));
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
    assert.strictEqual(lines[0], e.subject.name + ' ' + e.grade + '-' + e.term, e.sub.id + ' 학년-학기');
    assert.strictEqual(lines[1], e.unit.no + '. ' + e.unit.name, e.sub.id + ' 대단원');
    const m = /^\((\d+)\) (.+) \(([^:]+): ?(\d+)-(\d+)쪽\)$/.exec(lines[2]);
    assert.ok(m, e.sub.id + ' 제목 줄 형식: ' + lines[2]);
    assert.strictEqual(parseInt(m[1], 10), e.sub.no, e.sub.id + ' 소단원 번호');
    assert.strictEqual(m[2], e.sub.name, e.sub.id + ' 소단원 이름');
    assert.strictEqual(m[4] + '-' + m[5], e.sub.pages, e.sub.id + ' 쪽수');
  });
});

/* ================================================================
 * 2. 정상 데이터는 통과한다
 * ================================================================ */
test('정상: 가짜 60문제 파일이 3·4·5·6학년 모두 오류도 경고도 없이 통과한다', () => {
  ['soc-3-2-1-1', 'soc-4-2-3-1', 'soc-5-2-1-2', 'soc-6-2-3-2'].forEach((id) => {
    const r = check(id, makeUnit(id));
    assert.deepStrictEqual(r.errors, [], id + ' 오류: ' + JSON.stringify(r.errors.map((e) => e.msg)));
    assert.deepStrictEqual(r.warnings, [], id + ' 경고: ' + JSON.stringify(r.warnings.map((e) => e.msg)));
    assert.strictEqual(r.stats.items, 60);
    assert.strictEqual(r.stats.ox, 24);
    assert.strictEqual(r.stats.mc, 36);
    assert.deepStrictEqual(r.stats.pos, [9, 9, 9, 9]);
  });
});

/* ================================================================
 * 2-1. 지엽적 고유명사 문제 금지 규정 (CLAUDE.md, spec §42.5·§42.6)
 *   - 검증기 경고 'proper-noun-choices': 객관식 보기 4개 중 3개 이상이 지명처럼 보이면 [경고](오류 아님)
 *   - 실제 문제 파일 25개: 경고 0, 그리고 사용자가 OX로 바꾸기로 한 33문항이 객관식으로 되돌아오지 않는다(형식 고정)
 * ================================================================ */
function withChoices(id, choices) {
  const d = makeUnit(id);
  const it = d.items.find((x) => x.t === 'mc');
  it.c = choices.slice();
  it.a = 0;
  return check(id, d);
}
const jieop = (r) => r.warnings.filter((w) => w.rule === '지엽' && w.code === 'proper-noun-choices');

test('지엽: 보기가 나라·강·산·사막 이름으로 채워진 객관식은 경고(오류 아님)', () => {
  [
    ['미국', '인도', '캐나다', '리비아'],                    // 나라 4개
    ['아마존강', '나일강', '콩고강', '황허강'],              // 강 4개
    ['알프스산맥', '파미르고원', '히말라야산맥', '추키카마타'],  // 산맥·고원 이름 3개
    ['사하라 사막 – 모래 언덕', '황허강 – 누런 강물', '알프스산맥 – 관광지', '마우나로아 – 화산']  // 짝짓기: ' – ' 앞부분만 본다(3개)
  ].forEach((c) => {
    const r = withChoices('soc-6-2-1-1', c);
    assert.strictEqual(jieop(r).length, 1, JSON.stringify(c));
    assert.deepStrictEqual(r.errors, [], '경고여야 하고 오류는 아니다: ' + JSON.stringify(r.errors.map((e) => e.msg)));
  });
});

test('지엽: 대륙·대양·지형 일반 용어·제도·군대 이름은 지명으로 세지 않는다(오탐 방지)', () => {
  [
    ['아프리카', '아시아', '유럽', '오세아니아'],
    ['화산', '고원', '계곡', '폭포'],
    ['육아 휴직 제도', '단체 가입 제도', '근로 환경 제도', '최저 임금 제도'],
    ['미군', '일본군', '러시아군', '네덜란드군'],
    ['넓은 갯벌이 펼쳐진다', '굽이쳐 흐르는 강물이 있다', '해발 고도가 높고 경사가 급하다', '바다 위에 솟은 바위가 있다']
  ].forEach((c) => assert.strictEqual(jieop(withChoices('soc-6-2-1-1', c)).length, 0, JSON.stringify(c)));
});

test('지엽: OX 문제는 이름이 들어 있어도 경고하지 않는다(이름을 문장에 주는 OX가 규정이 권하는 방식)', () => {
  const d = makeUnit('soc-6-2-1-1');
  const ox = d.items.find((x) => x.t === 'ox');
  ox.q = '황허강은 황토가 섞여 강물이 누렇게 보이는 강이다.';
  assert.strictEqual(jieop(check('soc-6-2-1-1', d)).length, 0);
});

test('지엽: 실제 문제 파일 25개에는 지엽(proper-noun-choices) 경고가 없다', () => {
  const res = V.runValidation({ appRoot: APP });
  const hits = [];
  res.units.forEach((u) => u.warnings.concat(u.errors).forEach((w) => { if (w.rule === '지엽') hits.push(u.id + ' #' + w.n); }));
  assert.deepStrictEqual(hits, [], '이름 고르기 객관식이 다시 생겼어요(OX로 바꾸거나 사용자에게 권장안을 제안하세요): ' + hits.join(', '));
});

test('지엽: 사용자가 OX로 바꾸기로 한 33문항(spec §42, 1차 21 + 2차 12)은 객관식으로 되돌아오지 않는다', () => {
  const OX_NOW = {
    'soc-6-2-1-1': [28, 29, 30, 31, 32, 38, 40, 41, 46, 49, 50, 51],
    'soc-6-2-1-2': [36],
    'soc-6-2-3-1': [20, 25, 31, 32, 36, 45, 46, 51],
    'soc-5-2-1-2': [4, 16, 51],
    'soc-6-2-3-2': [48, 50, 52, 55],
    'soc-6-2-2-2': [37],
    'soc-5-2-2-1': [43],
    'soc-5-2-2-2': [13, 58],
    'soc-5-2-3-2': [56]
  };
  let total = 0;
  Object.keys(OX_NOW).forEach((id) => {
    const data = V.loadUnitFile(path.join(APP, 'edu-data', 'q', id + '.js'), id);
    const unit = data.data || data;
    OX_NOW[id].forEach((n) => {
      const it = unit.items.find((x) => x.n === n);
      assert.ok(it, id + ' #' + n + ' 없음');
      assert.strictEqual(it.t, 'ox', id + ' #' + n + ' 은 OX 여야 해요(지엽적 고유명사 문제 금지 규정)');
      total++;
    });
  });
  assert.strictEqual(total, 33);
});

// spec §21.4.5 샘플 12개 (학년, 문항). 문항 단위 검사(스키마·길이·금칙·민감어·가독성)에서 오류가 없어야 한다.
const SAMPLES = [
  [3, { t: 'mc', k: 'd2t', q: '전체 사람 수에서 노인이 차지하는 비율이 점점 높아지는 현상을 무엇이라고 할까요?', c: ['저출산', '고령화', '세계화', '지능정보화'], a: 1, e: '노인의 비율이 높아지는 것을 고령화라고 해요. 태어나는 아이의 수가 줄어드는 것은 저출산이에요.' }],
  [3, { t: 'ox', k: 'tf-f', q: '단오는 음력 8월 15일에 지내는 명절이다.', a: 0, e: '단오는 음력 5월 5일이에요. 음력 8월 15일은 추석이에요.' }],
  [3, { t: 'mc', k: 'pair', q: '교통로와 교통수단이 알맞게 짝지어진 것은 무엇일까요?', c: ['도로 – 비행기', '철도 – 자동차', '항공로 – 기차', '수로 – 배'], a: 3, e: '수로에는 배가 다녀요. 도로에는 자동차, 철도에는 기차, 항공로에는 비행기가 다녀요.' }],
  [4, { t: 'ox', k: 'tf-t', q: '민주주의를 실천하려면 서로 배려하며 양보하고 타협하는 태도가 필요하다.', a: 1, e: '충분히 대화하고 상대의 의견을 존중하며 타협하는 것이 민주주의를 실천하는 태도예요.' }],
  [4, { t: 'mc', k: 'cls', q: '산이 많은 지역에서 볼 수 **없는** 것은 무엇일까요?', c: ['목장', '풍력 발전기', '댐', '갯벌'], a: 3, e: '갯벌은 바다가 있는 지역에서 볼 수 있어요. 산이 많은 곳에는 목장, 풍력 발전기, 댐이 있어요.' }],
  [4, { t: 'mc', k: 'seq', q: '지역문제의 해결 방안을 찾을 때 **가장 먼저** 하는 일은 무엇일까요?', c: ['문제가 일어난 원인을 알아본다', '알맞은 해결 방안을 정한다', '방안의 장단점을 비교한다', '여러 해결 방안을 제시한다'], a: 0, e: '먼저 원인을 알아보고, 해결 방안을 내고, 장단점을 비교한 뒤, 알맞은 방안을 정해요.' }],
  [5, { t: 'mc', k: 'd2t', q: '신석기 시대 사람들이 실을 뽑을 때 쓴 도구는 무엇일까요?', c: ['가락바퀴', '반달 돌칼', '갈판', '돌그물추'], a: 0, e: '가락바퀴로 실을 뽑고 뼈바늘로 옷을 만들었어요. 반달 돌칼은 청동기 시대에 곡식을 거둘 때 썼어요.' }],
  [5, { t: 'ox', k: 'where', q: '고려는 거란의 세 번째 침입 때 강감찬 장군을 중심으로 귀주에서 거란군을 크게 물리쳤다.', a: 1, e: '이 승리를 귀주 대첩이라고 해요.' }],
  [5, { t: 'mc', k: 'where', q: '조선이 일본과 조약을 맺고 개항한 곳은 어디일까요?', c: ['남한산성', '한양', '강화도', '쓰시마섬'], a: 2, e: '조선은 강화도에서 일본과 조약을 맺고 문을 열었어요(강화도 조약).' }],
  [6, { t: 'ox', k: 'tf-f', q: '다른 나라에서 물자나 서비스를 사 오는 것을 수출이라고 한다.', a: 0, e: '사 오는 것은 수입이고, 다른 나라에 파는 것이 수출이에요.' }],
  [6, { t: 'mc', k: 'd2t', q: '일 년 내내 기온이 높고 비가 많이 내려 열대 우림이 생기기도 하는 기후는 무엇일까요?', c: ['건조 기후', '열대 기후', '냉대 기후', '한대 기후'], a: 1, e: '열대 기후는 적도 주변에서 나타나고 일 년 내내 더워요.' }],
  [6, { t: 'mc', k: 'who', q: '전쟁이나 질병, 자연재해로 고통받는 사람들에게 차별 없이 의료를 제공하는 단체는 어디일까요?', c: ['그린피스', '세계 자연 기금', '국경 없는 의사회', '국제 연합(UN)'], a: 2, e: '국경 없는 의사회는 어려움을 겪는 사람들에게 차별 없이 의료를 제공해요. 그린피스는 바다 생태계를 지키는 활동을 해요.' }]
];

test('정상: spec §21.4.5 샘플 12개가 문항 단위 검사에서 오류·경고 없이 통과한다', () => {
  assert.strictEqual(SAMPLES.length, 12);
  SAMPLES.forEach((s, i) => {
    const ctx = V.makeCtx(s[0]);
    const item = Object.assign({ n: i + 1, f: 'F01' }, s[1]);
    V.checkItem(item, i, ctx, new Set(['F01']));
    assert.deepStrictEqual(ctx.out, [], '샘플 ' + (i + 1) + ': ' + JSON.stringify(ctx.out.map((x) => x.rule + '/' + x.code + ' ' + x.msg)));
  });
});

test('정상: 경계값 - 3학년 문제 45자 통과, 46자 오류 / 5학년은 60자 통과, 61자 오류', () => {
  const lenQ = (id, q) => { const u = makeUnit(id); u.items[0].q = q; return check(id, u).errors.filter((e) => e.code === 'q-too-long'); };
  assert.strictEqual(lenQ('soc-3-2-1-1', '거'.repeat(43) + '다.').length, 0);     // 45자
  assert.strictEqual(lenQ('soc-3-2-1-1', '거'.repeat(44) + '다.').length, 1);     // 46자
  assert.strictEqual(lenQ('soc-5-2-1-1', '거'.repeat(58) + '다.').length, 0);     // 60자
  assert.strictEqual(lenQ('soc-5-2-1-1', '거'.repeat(59) + '다.').length, 1);     // 61자
  assert.strictEqual(lenQ('soc-3-2-1-1', '**' + '거'.repeat(43) + '**다.').length, 0); // ** 강조 기호는 세지 않는다
});

/* ================================================================
 * 3. 나쁜 예 (규칙 이름으로 정확히 잡히는지)
 * ================================================================ */
const BAD = [
  // [이름, 소단원 id, 수정 함수(data) 또는 makeUnit 옵션, 규칙, 필수 코드[], 허용되는 부수 코드[]]
  ['스키마: 해설(e) 누락', 'soc-3-2-1-1', (d) => { delete d.items[10].e; }, '스키마', ['missing-field']],
  ['스키마: 객관식 정답이 범위 밖(a=4)', 'soc-4-2-3-1', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.a = 4; }, '스키마', ['answer-range'], ['mc-position']],
  ['스키마: 보기 중복', 'soc-5-2-1-2', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.c[1] = it.c[0]; }, '스키마', ['choice-dup']],
  ['스키마: 보기가 3개', 'soc-6-2-3-2', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.c.pop(); }, '스키마', ['choices-length']],
  ['스키마: 형식 t 가 ox/mc 가 아님', 'soc-3-2-1-2', (d) => { d.items[2].t = 'tf'; }, '스키마', ['t-invalid']],
  ['스키마: OX 정답이 2', 'soc-4-2-1-2', (d) => { d.items.find((x) => x.t === 'ox' && x.k === 'ce').a = 2; }, '스키마', ['answer-ox'], ['ox-o-count', 'ox-x-count']],
  ['스키마: 번호 n 겹침', 'soc-5-2-2-1', (d) => { d.items[5].n = 3; }, '스키마', ['n-sequence']],
  ['스키마: 기법 코드가 목록에 없음', 'soc-6-2-1-1', (d) => { d.items[7].k = 'zz'; }, '스키마', ['kind-invalid']],
  ['스키마: 근거 사실 f 누락', 'soc-3-2-2-1', (d) => { delete d.items[4].f; }, '스키마', ['missing-fact']],
  ['스키마: 참 진술(tf-t)인데 정답이 X', 'soc-4-2-2-1', (d) => { d.items.find((x) => x.k === 'tf-t').a = 0; }, '스키마', ['kind-answer'], ['ox-o-count', 'ox-x-count']],
  ['스키마: facts 가 없음', 'soc-5-2-3-1', (d) => { delete d.facts; }, '스키마', ['facts-missing']],
  ['개수: 59개 (마지막 문제 하나 빠짐)', 'soc-3-2-2-2', (d) => { d.items.pop(); }, '개수', ['item-count']],
  ['개수: 61개', 'soc-4-2-2-2', (d) => { const x = clone(d.items[0]); x.n = 61; x.q = '거너더 러머버 커터퍼 허고노 로모보 코토포 호구누다.'; d.items.push(x); }, '개수', ['item-count'], ['fact-kind-dup', 'ox-count', 'ox-o-count', 'ox-x-count']],
  ['비율: OX 28개 (객관식 32개)', 'soc-5-2-1-3', { nOx: 28, nO: 14 }, '비율', ['ox-count', 'mc-count'], ['mc-position']],
  ['비율: O 16개 / X 8개', 'soc-6-2-2-1', { nO: 16 }, '비율', ['ox-o-count', 'ox-x-count']],
  ['비율: 객관식 정답 위치 편중 (①15 ②7 ③7 ④7)', 'soc-3-2-1-1', { pos: [15, 7, 7, 7] }, '비율', ['mc-position']],
  ['길이: 3학년 문제 46자', 'soc-3-2-1-2', (d) => { d.items[1].q = '거'.repeat(44) + '다.'; }, '길이', ['q-too-long']],
  ['길이: 4학년 보기 17자', 'soc-4-2-3-2', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.c[2] = '거너더러머버커터퍼허고노로모보코토포'; }, '길이', ['c-too-long']],
  ['길이: 해설 3문장', 'soc-5-2-2-2', (d) => { d.items[3].e = '거너더 러머버 커터퍼 해요. 허고노 로모보 이에요. 코토포 호구누 해요.'; }, '길이', ['e-sentences']],
  ['길이: 6학년 해설 111자', 'soc-6-2-2-3', (d) => { d.items[3].e = '거'.repeat(110) + '다.'; }, '길이', ['e-too-long']],
  ['길이: 문제가 두 문장', 'soc-4-2-1-1', (d) => { d.items[0].q = '거너더 러머버 커터퍼 해요. 허고노 로모보 코토포다.'; }, '길이', ['q-multi-sentence']],
  ['중복: 문제 문장 완전 중복(띄어쓰기·기호만 다름)', 'soc-3-2-2-3', (d) => { d.items[9].q = d.items[2].q.replace(/ /g, '').replace(/[.?]$/, '!'); }, '중복', ['q-dup']],
  ['중복: 같은 사실에 같은 기법', 'soc-4-2-2-1', (d) => { d.items[20].f = d.items[0].f; d.items[20].k = d.items[0].k; }, '중복', ['fact-kind-dup'], ['kind-format', 'kind-answer', 'ox-o-count', 'ox-x-count']],
  ['중복: 한 사실로 6문항 (일반 소단원 상한 5)', 'soc-5-2-1-1', (d) => giveFact(d, 3, 'F01'), '중복', ['fact-over'], ['kind-format']],
  ['중복: 한 기법이 전체의 25% 초과 (16/60)', 'soc-6-2-1-2', (d) => { d.items.filter((x) => x.t === 'mc').slice(0, 16).forEach((x) => { x.k = 'exa'; }); }, '중복', ['kind-share'], ['fact-kind-dup']],
  ['사실연결: f 가 facts 에 없음', 'soc-5-2-3-2', (d) => { d.items[6].f = 'F99'; }, '사실연결', ['fact-not-found']],
  ['사실연결: 쓰이지 않는 사실', 'soc-3-2-1-1', (d) => { d.facts.push({ id: 'F50', s: '쓰이지 않는 사실' }); }, '사실연결', ['fact-unused']],
  ['금칙: 외부 링크 http', 'soc-4-2-2-2', (d) => { d.items[1].q = '거너더 러머버 http://abc.example/ 커터퍼다.'; }, '금칙', ['link']],
  ['금칙: 해설에 @', 'soc-5-2-1-1', (d) => { d.items[1].e = '거너더 러머버 a@b 커터퍼 해요.'; }, '금칙', ['link']],
  ['금칙: 그림 의존 표현 "위 그림을 보고"', 'soc-3-2-2-2', (d) => { d.items[1].q = '위 그림을 보고 알 수 있는 거너더 러머버 것은?'; }, '금칙', ['picture-ref']],
  ['금칙: "다음 표에서"', 'soc-6-2-3-1', (d) => { d.items[2].q = '다음 표에서 거너더 러머버 커터퍼다.'; }, '금칙', ['picture-ref']],
  ['금칙: 보기에 "모두"', 'soc-5-2-2-1', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.c[3] = '위 보기 모두 맞다'; }, '금칙', ['choice-all-none']],
  ['금칙: 보기에 "없음"', 'soc-4-2-3-1', (d) => { const it = d.items.find((x) => x.t === 'mc'); it.c[0] = '정답 없음'; }, '금칙', ['choice-all-none']]
];

/* 사실 F01 이 다른 사실의 문항 n 개를 가져가 총 3+n 문항이 되게 한다 (기법은 F01 이 아직 안 쓴 것으로) */
function giveFact(d, n, fid) {
  const used = new Set(d.items.filter((x) => x.f === fid).map((x) => x.k));
  const spare = ['why', 'exa', 'pair', 'seq', 'who', 'cls', 'ec', 'bl-t', 't2d', 'd2t'].filter((k) => !used.has(k));
  const seenF = new Set([fid]);
  let given = 0;
  d.items.forEach((x) => {
    if (given < n && x.t === 'mc' && !seenF.has(x.f)) { seenF.add(x.f); x.f = fid; x.k = spare[given]; given++; }
  });
  assert.strictEqual(given, n);
}

BAD.forEach((b) => {
  test('나쁜 예 [' + b[3] + '] ' + b[0], () => {
    const id = b[1];
    const data = typeof b[2] === 'function' ? (() => { const d = makeUnit(id); b[2](d); return d; })() : makeUnit(id, b[2]);
    const r = check(id, data);
    expectErrors(r, b[4], b[5]);
    b[4].forEach((c) => assert.ok(hasRule(r.errors, b[3], c), '규칙 이름이 ' + b[3] + ' 이어야 함: ' + JSON.stringify(r.errors.filter((e) => e.code === c).map((e) => e.rule))));
    r.errors.forEach((e) => { assert.ok(e.msg && e.msg.length > 5, '메시지가 비어 있음'); });
  });
});

test('나쁜 예: 한 사실로 6문항은 빡빡 소단원(soc-4-2-1-1)에서는 허용되고 7문항은 오류', () => {
  const id = 'soc-4-2-1-1';
  const six = makeUnit(id); giveFact(six, 3, 'F01');
  assert.strictEqual(check(id, six).errors.filter((e) => e.code === 'fact-over').length, 0);
  const seven = makeUnit(id); giveFact(seven, 4, 'F01');
  assert.ok(hasRule(check(id, seven).errors, '중복', 'fact-over'));
});

test('나쁜 예: 같은 문제라도 5학년 한도(60자)에서는 통과하고 3학년 한도(45자)에서는 오류', () => {
  const text = '거'.repeat(48) + '다.';              // 50자
  const mk = (id) => { const u = makeUnit(id); u.items[0].q = text; return check(id, u).errors.filter((e) => e.code === 'q-too-long').length; };
  assert.strictEqual(mk('soc-5-2-1-1'), 0);
  assert.strictEqual(mk('soc-3-2-1-1'), 1);
});

/* ---- 경고 규칙은 오류가 아니다 ---- */
test('경고 [유사도]: 거의 같은 두 문제는 경고이고 오류가 아니다', () => {
  const id = 'soc-5-2-1-1';
  const d = makeUnit(id);
  d.items[11].q = d.items[10].q.slice(0, -2) + '라.';          // 마지막 글자만 다름
  d.items[11].t = d.items[10].t;
  const r = check(id, d);
  assert.ok(hasRule(r.warnings, '유사도', 'similar'), JSON.stringify(r.warnings));
  assert.ok(!r.errors.some((e) => e.rule === '유사도'));
});

test('경고 [민감어]: 폭탄·위안부 등은 경고(오류 아님), 사실 목록의 민감어도 잡는다', () => {
  const id = 'soc-5-2-3-1';
  const d = makeUnit(id);
  d.items[4].q = '거너더 러머버 폭탄 커터퍼다.';
  d.items[5].e = '허고노 로모보 위안부 코토포 해요.';
  d.facts[0].s = '학살 사건 요약';
  const r = check(id, d);
  const sens = r.warnings.filter((w) => w.rule === '민감어');
  assert.strictEqual(sens.length, 3);
  assert.deepStrictEqual(r.errors, []);
});

test('경고 [가독성]: 3·4학년에서만 어려운 한자어를 경고하고 한자·한글 비율 낮음도 경고한다', () => {
  const mk = (id) => { const u = makeUnit(id); u.items[3].q = '거너더 러머버 해당 커터퍼다.'; u.items[4].q = '12 345 678 AB 90 가나다라마바다.'; u.items[5].e = '漢字 거너더 러머버 해요.'; return check(id, u); };
  const low = mk('soc-3-2-1-1');
  assert.ok(hasRule(low.warnings, '가독성', 'hard-word'));
  assert.ok(hasRule(low.warnings, '가독성', 'hangul-ratio'));
  assert.ok(hasRule(low.warnings, '가독성', 'hanja'));
  assert.deepStrictEqual(low.errors, []);
  const high = mk('soc-5-2-1-1');
  assert.ok(!hasRule(high.warnings, '가독성', 'hard-word'));
});

test('경고: 이중부정·기법 not 문구·보기 번호·알 수 없는 필드는 경고(오류 아님)', () => {
  const id = 'soc-4-2-3-1';
  const d = makeUnit(id);
  d.items[0].q = '거너더 러머버 않지 않다.';
  const notItem = d.items.find((x) => x.k === 'not');
  notItem.q = '거너더 러머버 커터퍼까요?';
  const mc = d.items.find((x) => x.t === 'mc' && x.k !== 'not');
  mc.c[0] = '① ' + mc.c[0];
  d.items[8].memo = '필드';
  const r = check(id, d);
  ['double-negative', 'not-wording', 'choice-numbered', 'unknown-field'].forEach((c) => assert.ok(r.warnings.some((w) => w.code === c), c + ' 경고 없음: ' + codes(r.warnings)));
  assert.deepStrictEqual(r.errors, []);
});

/* ---- 재서술 (원문 14자 연속 일치) ---- */
function makeSource(rand) {              // 가짜 '학습지 원문' (무작위 한글, 줄바꿈·기호 섞임)
  const lines = [];
  for (let i = 0; i < 12; i++) lines.push('■ ' + makeText(rand, 20) + ' ( ' + makeText(rand, 3) + ' )' + makeText(rand, 14) + '.');
  return lines.join('\n');
}
function sourceFragment(src, from, len) {  // 원문에서 공백·기호를 뺀 글자로 len 자 잘라 낸 조각
  return src.replace(/[^0-9A-Za-z가-힣]/g, '').slice(from, from + len);
}

test('재서술: 원문과 14자 이상 연속으로 같으면 경고, 소단원에 3곳 이상이면 오류, 13자는 통과', () => {
  const id = 'soc-3-2-1-1';
  const src = makeSource(rng(77));
  const frag = (i) => sourceFragment(src, 30 + i * 40, 16);
  const mk = (n) => {
    const d = makeUnit(id);
    for (let i = 0; i < n; i++) d.items[i * 2].q = frag(i).slice(0, 8) + ', ' + frag(i).slice(8) + '다.';        // 기호·띄어쓰기를 바꿔 끼워도 잡힌다
    return check(id, d, src);
  };
  const none = mk(0);
  assert.strictEqual(none.warnings.filter((w) => w.rule === '재서술').length + none.errors.filter((w) => w.rule === '재서술').length, 0);
  const two = mk(2);
  assert.strictEqual(two.warnings.filter((w) => w.rule === '재서술').length, 2);
  assert.strictEqual(two.errors.length, 0);
  const three = mk(3);
  assert.strictEqual(three.errors.filter((w) => w.rule === '재서술').length, 3);
  const d13 = makeUnit(id); d13.items[0].q = sourceFragment(src, 30, 13) + '다.';
  assert.strictEqual(check(id, d13, src).warnings.filter((w) => w.rule === '재서술').length, 0);
  const d14 = makeUnit(id); d14.items[0].q = sourceFragment(src, 30, 14) + '다.';
  assert.strictEqual(check(id, d14, src).warnings.filter((w) => w.rule === '재서술').length, 1);
});

test('재서술: 해설·보기·사실 요약에서도 검사하고, 원문 폴더의 파일 이름 규칙(사회_3-2_1단원(1).txt)을 따른다', () => {
  const id = 'soc-3-2-1-1';
  const src = makeSource(rng(5));
  const d = makeUnit(id);
  d.items[1].e = sourceFragment(src, 10, 18) + '이에요.';
  d.facts[0].s = sourceFragment(src, 100, 15);
  const r = check(id, d, src);
  const hits = r.warnings.filter((w) => w.rule === '재서술');
  assert.strictEqual(hits.length, 2);
  assert.ok(hits.some((h) => h.field === 'e'));
  assert.ok(hits.some((h) => h.field === 'facts'));
  const root = mkTmp('src');
  const srcDir = mkTmp('srcdir');
  fs.writeFileSync(path.join(srcDir, '사회_3-2_1단원(1).txt'), src, 'utf8');
  writeUnit(root, id, d);
  const res = V.runValidation({ appRoot: root, units: [id], sourceDir: srcDir });
  assert.strictEqual(res.units.length, 1);
  assert.strictEqual(res.units[0].warnings.filter((w) => w.rule === '재서술').length, 2);
  // 원문 파일이 없는 소단원은 검사를 건너뛰었다는 경고
  writeUnit(root, 'soc-3-2-1-2', makeUnit('soc-3-2-1-2'));
  const res2 = V.runValidation({ appRoot: root, units: ['soc-3-2-1-2'], sourceDir: srcDir });
  assert.ok(res2.units[0].warnings.some((w) => w.code === 'source-missing'));
});

/* ================================================================
 * 4. 파일 읽기(vm)와 실행기
 * ================================================================ */
test('파일: 문법 오류·실행 오류·미등록·id 불일치·여러 id 등록을 크래시 없이 규칙 이름으로 보고한다', () => {
  const root = mkTmp('files');
  const id = 'soc-3-2-1-1';
  const cases = [
    ['syntax-error', '(function (w) { var D = w.EDU_Q = w.EDU_Q || {}; D["x"] = { v: 1, items: [ { n: 1 }, ] ; })(window);'],
    ['syntax-error', "export const x = 1;"],
    ['runtime-error', "document.createElement('div');"],
    ['no-register', '/* 비어 있음 */'],
    ['id-mismatch', unitFileText('soc-9-9-9-9', { v: 1, facts: [], items: [] })]
  ];
  cases.forEach((c) => {
    const f = writeUnit(root, id, c[1]);
    const res = V.loadUnitFile(f, id);
    assert.strictEqual(res.ok, false, c[0]);
    assert.ok(res.issues.some((x) => x.rule === (c[0] === 'id-mismatch' ? '개수' : '파일') && x.code === c[0]), c[0] + ' 기대, 실제 ' + JSON.stringify(res.issues));
    assert.ok(res.issues.every((x) => x.msg && x.fix));
  });
  const f = writeUnit(root, id, "(function (w) { var D = w.EDU_Q = w.EDU_Q || {}; D['soc-3-2-1-1'] = { v: 1, facts: [], items: [] }; D['soc-3-2-1-2'] = {}; })(window);");
  const res = V.loadUnitFile(f, id);
  assert.strictEqual(res.ok, true);
  assert.ok(res.issues.some((x) => x.rule === '개수' && x.code === 'extra-key'));
});

test('실행기: 문제 파일이 25개 모두 없어도 소단원별로 "문제 파일 없음"을 보고하고 크래시하지 않는다', () => {
  const root = mkTmp('empty');
  const res = V.runValidation({ appRoot: root });
  assert.strictEqual(res.units.length, 25);
  res.units.forEach((u) => {
    assert.strictEqual(u.status, 'missing');
    assert.ok(u.errors.some((e) => e.rule === '파일' && e.code === 'missing-file' && e.msg.indexOf('edu-data/q/' + u.id + '.js') >= 0), u.id);
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.totals.missing, 25);
  const text = V.formatReport(res);
  assert.ok(text.indexOf('문제 파일 없음') >= 0);
  assert.strictEqual((text.match(/문제 파일이 아직 없어요/g) || []).length, 25);
  // --allow-missing 이면 오류가 아니다
  const ok = V.runValidation({ appRoot: root, allowMissing: true });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.totals.missing, 25);
  // --unit 앞부분 선택
  assert.strictEqual(V.runValidation({ appRoot: root, units: ['soc-4-2'] }).units.length, 6);
  assert.strictEqual(V.runValidation({ appRoot: root, units: ['soc-5-2-1-1'] }).units.length, 1);
  assert.strictEqual(V.runValidation({ appRoot: root, units: ['soc-5-2-1'] }).units.length, 3);
});

test('실행기: 25개 정상 파일 전체 검사가 1초 안팎이고 모두 통과한다', (t) => {
  const root = mkTmp('all25');
  allSubs().forEach((e) => writeUnit(root, e.sub.id, makeUnit(e.sub.id)));
  const t0 = process.hrtime.bigint();
  const res = V.runValidation({ appRoot: root });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(res.totals.ok, 25, JSON.stringify(res.units.filter((u) => u.status !== 'ok').map((u) => [u.id, u.errors.concat(u.warnings).map((x) => x.msg)])));
  assert.strictEqual(res.ok, true);
  assert.ok(ms < 3000, '전체 검사 ' + ms + 'ms');
  t.diagnostic('25개 전체 검사 ' + Math.round(ms) + 'ms');
});

test('실행기: --file 로 카탈로그에 없는 id 의 파일은 unknown-id 오류, 학년이 id 로 판별된다', () => {
  const root = mkTmp('unknown');
  const f = writeUnit(root, 'soc-9-9-9-9', makeUnit('soc-3-2-1-1'));
  const res = V.runValidation({ files: [f] });
  assert.strictEqual(res.units[0].status, 'error');
  assert.ok(res.units[0].errors.some((e) => e.rule === '개수' && e.code === 'unknown-id'));
  const g = writeUnit(root, 'soc-3-2-1-1', makeUnit('soc-3-2-1-1'));
  const ok = V.runValidation({ files: [g] });
  assert.strictEqual(ok.units[0].status, 'ok');
  assert.strictEqual(ok.units[0].grade, 3);
});

test('실행기: 파일 안의 등록 id 가 파일 이름·카탈로그 id 와 다르면 id-mismatch', () => {
  const root = mkTmp('mismatch');
  const f = writeUnit(root, 'soc-3-2-1-1', unitFileText('soc-3-2-1-2', makeUnit('soc-3-2-1-2')));
  const res = V.runValidation({ files: [f] });
  assert.strictEqual(res.units[0].status, 'error');
  assert.ok(res.units[0].errors.some((e) => e.code === 'id-mismatch'));
});

/* ================================================================
 * 5. 명령줄 (종료 코드·JSON·한국어 출력)
 * ================================================================ */
function runCli(args) {
  const r = cp.spawnSync(process.execPath, [VALIDATOR].concat(args), { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: 정상 파일은 종료 코드 0, 나쁜 파일은 1, 사용법 오류는 2', () => {
  const root = mkTmp('cli');
  const good = writeUnit(root, 'soc-4-2-2-1', makeUnit('soc-4-2-2-1'));
  const g = runCli(['--file', good]);
  assert.strictEqual(g.code, 0, g.out + g.err);
  assert.ok(g.out.indexOf('통과') >= 0);
  const bad = makeUnit('soc-3-2-1-1');
  bad.items[0].q = '위 그림을 보고 거너더 러머버 커터퍼까요?';
  bad.items.pop();
  const badFile = writeUnit(root, 'soc-3-2-1-1', bad);
  const b = runCli(['--file', badFile, good]);
  assert.strictEqual(b.code, 1, b.out);
  assert.ok(/\[오류\]\[금칙\]/.test(b.out));
  assert.ok(/\[오류\]\[개수\]/.test(b.out));
  assert.ok(b.out.indexOf('→') < 0 && b.out.indexOf('->') >= 0);   // 고치는 방법 줄
  assert.strictEqual(runCli(['--bogus']).code, 2);
  assert.strictEqual(runCli(['--source-dir', path.join(root, '없는폴더')]).code, 2);
  assert.strictEqual(runCli(['--unit', 'zzz']).code, 2);
});

test('CLI: --json 은 JSON 으로 파싱되고 규칙·코드·문항 번호·고치는 방법이 들어 있다', () => {
  const root = mkTmp('cli-json');
  const d = makeUnit('soc-5-2-1-1');
  d.items[6].q = d.items[6].q.replace(/다\.$|까요\?$/, '') + ' http://x.y';
  const f = writeUnit(root, 'soc-5-2-1-1', d);
  const r = runCli(['--file', f, '--json']);
  assert.strictEqual(r.code, 1);
  const j = JSON.parse(r.out);
  assert.strictEqual(j.ok, false);
  const u = j.units[0];
  assert.strictEqual(u.id, 'soc-5-2-1-1');
  const e = u.errors.find((x) => x.rule === '금칙' && x.code === 'link');
  assert.ok(e);
  assert.strictEqual(e.n, 7);
  assert.strictEqual(e.field, 'q');
  assert.ok(e.fix.length > 3);
});

test('CLI: 경고만 있으면 종료 코드 0', () => {
  const root = mkTmp('cli-warn');
  const d = makeUnit('soc-5-2-3-1');
  d.items[3].q = '거너더 러머버 폭탄 커터퍼다.';
  const f = writeUnit(root, 'soc-5-2-3-1', d);
  const r = runCli(['--file', f]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/\[경고\]\[민감어\]/.test(r.out));
  assert.ok(r.out.indexOf('경고만') >= 0);
});

test('CLI: 파일 없이 실행하면 카탈로그 25개를 검사해 "문제 파일 없음"을 보고하거나(없을 때) 검사한다', () => {
  const r = runCli(['--allow-missing', '--json']);
  const j = JSON.parse(r.out);
  assert.strictEqual(j.units.length, 25);
  assert.deepStrictEqual(j.catalogIssues, []);
});
