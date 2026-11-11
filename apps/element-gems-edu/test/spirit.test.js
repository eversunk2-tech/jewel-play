/* 교육용 정령 특별 레벨 시험 — spec §27.6(비폭력 프레임 F1 "잠든 원소 정령 깨우기")·§27.7·§27.8·§27.9.3 ⑥·§27.10(9·10)·§33, M4-B(교육용).
 * 실행: node --test apps/element-gems-edu/test/*.test.js
 *
 * 일반용 test/spirit.test.js(M4-A)와 같은 불변식을 교육용 game.js 로 다시 시험하고, 교육용에만 있는 것을 더한다.
 * ① 표·단계 수·spiritStep(교육용 목표 점수 기준 경계값) ② 일반용과 소스가 글자 그대로 같은 곳(순수 함수·CONFIG.stages.spirit·정령 HUD 함수·style.css)
 * ③ DOM(가짜 DOM + 가상 시계): 문제 못 불러옴/보통 모드 = 일반용과 같은 정령 패널, 많이 모드 = 학습 칩 이름 "정령에게 선물 드리기"(특별 레벨만)
 * ④ [EDU] 목표를 먼저 채웠는데 학습 조건이 모자라면 "거의 깨어났어요"(그림은 컬러, 판은 이어짐) → 학습을 채우는 순간에만 "깨어났어요! 고마워요"·praise-great 한 번
 * ⑤ 결과 줄(클리어·시간 초과 실패, 학습 부족이면 end-target 의 "· 선물상자 문제 n/N" 유지) ⑥ 판 도중 문제 양이 바뀌어도 그 판의 값 유지
 * ⑦ 설명판 학습 줄·카드 aria-label ⑧ 마크업·CSS(edu.css 의 한 규칙, style.css 는 일반용과 바이트 동일) ⑨ 문구 점검 ⑩ 새 에셋 0개
 * ⑪ 규칙 불변: 같은 시드 봇 판을 "M4-B 시작 시점의 교육용 game.js"와 지금 game.js 로 각각 돌려 점수·미션·학습 카운터·state.edu·난수 호출 수·종료 시점이 같음을 증명한다.
 *    기준 소스 = 환경변수 EG_BASELINE_EDU_GAME_JS(파일 경로)가 있으면 그 파일, 없으면 git 의 커밋 d635165 의 apps/element-gems-edu/game.js. 둘 다 못 구하면 그 시험만 건너뛴다.
 * 시험은 CONFIG 를 시험용 복사본(샌드박스)에서만 바꾼다. 파일·저장소 상태는 건드리지 않는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
const GAME_PATH = path.join(root, 'game.js');
const G = require(GAME_PATH);
const SRC = fs.readFileSync(GAME_PATH, 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const EDU_CSS = fs.readFileSync(path.join(root, 'edu.css'), 'utf8');
const GEN_DIR = path.join(root, '..', 'element-gems');          // 일반용: 읽기 전용으로 비교에만 쓴다(없으면 비교 시험은 건너뜀)
const HAS_GEN = fs.existsSync(path.join(GEN_DIR, 'game.js'));
const GEN = HAS_GEN ? require(path.join(GEN_DIR, 'game.js')) : null;
const GEN_SRC = HAS_GEN ? fs.readFileSync(path.join(GEN_DIR, 'game.js'), 'utf8') : '';
const GEN_CSS = HAS_GEN ? fs.readFileSync(path.join(GEN_DIR, 'style.css'), 'utf8') : '';
const skipGen = HAS_GEN ? false : '일반용 폴더 없음';
const BASE_COMMIT = 'd635165';
const REPO = path.join(root, '..', '..');

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
const fmtN = (n) => n.toLocaleString('ko-KR');

/* ===================================================================
 * 1) 표·단계 수·spiritStep (순수 함수) — 교육용 목표 점수(일반용 × 1.2, 많이 표는 따로) 기준
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
    assert.deepStrictEqual(Object.keys(sp).sort(), ['name', 'steps', 'type']);
    assert.strictEqual(sp.type, want[0], d + ' ' + n + ' 색');
    assert.strictEqual(sp.name, want[1], d + ' ' + n + ' 이름');
    assert.strictEqual(sp.name, G.CONFIG.types[sp.type].name + ' 정령');
    colors.push(sp.type);
  }));
  assert.deepStrictEqual(colors.slice().sort(), [0, 1, 2, 3, 4, 5], '여섯 정령은 서로 다르다');
  DIFFS.forEach((d) => [1, 2, 3, 4, 6, 7, 8, 9, 11, 0, -1, 5.5].forEach((n) => assert.strictEqual(G.spiritOf(d, n), null, d + ' ' + n)));
  assert.strictEqual(G.spiritOf('nope', 5), null);
});

test('② 단계 수 n: 초보 = easySteps(3), 중수·고수 = SEQ 미션의 부분 수(보통 표와 많이 표 모두 5·10단계 값과 일치)', () => {
  const S = G.CONFIG.stages;
  assert.strictEqual(G.spiritOf('easy', 5).steps, 3);
  assert.strictEqual(G.spiritOf('easy', 10).steps, 3);
  ['normal', 'hard'].forEach((d) => [5, 10].forEach((n) => {
    const def = S.missions[d][n - 1];
    assert.strictEqual(def.seq, true, d + ' ' + n + ' 은 SEQ');
    assert.strictEqual(G.spiritOf(d, n).steps, def.parts.length, d + ' ' + n);
    assert.ok(def.parts.length === 3 || def.parts.length === 4, '부분 수 3~4');
    // 많이 표(CONFIG.edu.many.missions)의 5·10단계도 SEQ 이고 부분 수가 같아 정령 단계 수가 모드에 따라 달라지지 않는다
    const many = G.CONFIG.edu.many.missions[d][n - 1];
    assert.strictEqual(many.seq, true, d + ' ' + n + ' 많이 표도 SEQ');
    assert.strictEqual(many.parts.length, def.parts.length, d + ' ' + n + ' 많이 표 부분 수');
  }));
});

test('③ spiritStep(초보): 교육용 목표 점수(state.target 과 같은 stageTarget)를 3등분한 지점을 넘은 수 — 직전·정확히·초과, 목표 도달, 감소 없음', () => {
  const info = G.spiritOf('easy', 5);
  const T = G.stageTarget('easy', 5);
  assert.strictEqual(T, Math.round(GEN.stageTarget('easy', 5) * 1.2 / 100) * 100, '교육용 보통 표 = 일반용 × 1.2');
  assert.notStrictEqual(T, GEN.stageTarget('easy', 5), '일반용 숫자를 그대로 쓰지 않는다');
  const k = (score) => G.spiritStep(info, score, T, null);
  const t1 = Math.ceil(T / 3); const t2 = Math.ceil(2 * T / 3);
  assert.strictEqual(k(0), 0);
  assert.strictEqual(k(t1 - 1), 0, '1/3 직전');
  assert.strictEqual(k(t1), 1, '1/3 정확히(올림 정수)');
  assert.strictEqual(k(t2 - 1), 1);
  assert.strictEqual(k(t2), 2, '2/3');
  assert.strictEqual(k(T - 1), 2);
  assert.strictEqual(k(T), 3, '목표 정확히');
  assert.strictEqual(k(T * 9), 3, '목표를 크게 넘어도 n 을 넘지 않는다');
  for (let sc = 0; sc <= T + 500; sc += 11) assert.strictEqual(k(sc) === info.steps, G.isCleared(sc, T), 'score ' + sc);
  // 많이 모드의 초보 목표(CONFIG.edu.many.easyTargets)로도 같은 식이다
  const M = G.CONFIG.edu.many.easyTargets[4];
  assert.strictEqual(G.spiritStep(info, Math.ceil(M / 3) - 1, M, null), 0);
  assert.strictEqual(G.spiritStep(info, Math.ceil(M / 3), M, null), 1);
  assert.strictEqual(G.spiritStep(info, M, M, null), 3);
  // 이상한 입력은 0, 점수가 늘면 k 는 줄지 않는다(단조)
  let last = 0;
  for (let sc = 0; sc <= T + 200; sc += 13) { const v = k(sc); assert.ok(v >= last); last = v; }
  assert.strictEqual(G.spiritStep(info, 5000, 0, null), 0);
  assert.strictEqual(G.spiritStep(info, -5, T, null), 0);
  assert.strictEqual(G.spiritStep(info, NaN, T, null), 0);
  assert.strictEqual(G.spiritStep(null, 5000, T, null), 0);
});

test('③ spiritStep(SEQ): 끝난 단계 수 = missionProgress().doneCount (보통 표·많이 표 미션 모두), 감소 없음', () => {
  ['normal', 'hard'].forEach((d) => [5, 10].forEach((n) => ['normal', 'many'].forEach((mode) => {
    const def = mode === 'many' ? G.CONFIG.edu.many.missions[d][n - 1] : G.CONFIG.stages.missions[d][n - 1];
    const info = G.spiritOf(d, n);
    const m = G.missionInit(def);
    assert.strictEqual(G.spiritStep(info, 0, 0, m), 0);
    let last = 0;
    for (let guard = 0; guard < 400 && !G.missionDone(m); guard++) {
      const cur = m.parts[Math.min(m.cur, m.parts.length - 1)];
      if (cur.k === 'collect') G.missionUpdate(m, { t: 'group', color: cur.color, size: 3 });
      else if (cur.k === 'collectEach') cur.colors.forEach((c) => G.missionUpdate(m, { t: 'group', color: c, size: 3 }));
      else if (cur.k === 'big') G.missionUpdate(m, { t: 'group', color: 1, size: Math.max(4, cur.min) });
      else G.missionUpdate(m, { t: 'action', fromSwap: true, maxStep: cur.min });
      const k = G.spiritStep(info, 0, 0, m);
      assert.strictEqual(k, G.missionProgress(m).doneCount, d + ' ' + n + ' ' + mode);
      assert.ok(k >= last && k - last <= 1);
      last = k;
    }
    assert.strictEqual(last, info.steps, d + ' ' + n + ' ' + mode + ' 모두 끝나면 k = n');
  })));
});

test('③ 카드 aria-label·설명판 한 줄(교육용 목표 숫자 기준): 정령 이름만 더해지고(초보는 "특별 레벨" 말 없이), 6곳 외에는 그대로다', () => {
  assert.strictEqual(G.stageCardLabel('easy', 5, true, 2), '레벨 5, 잠든 번개 정령, 목표 ' + fmtN(G.stageTarget('easy', 5)) + '점, 별 2개');
  assert.ok(G.stageCardLabel('normal', 5, true, 0).startsWith('레벨 5, 특별 레벨, 잠든 풀 정령, 미션 '));
  assert.ok(G.stageCardLabel('hard', 10, false, 0).startsWith('레벨 10, 특별 레벨, 잠든 어둠 정령, 미션 ') && G.stageCardLabel('hard', 10, false, 0).endsWith(', 잠김'));
  [1, 2, 3, 4, 6, 7, 8, 9].forEach((n) => DIFFS.forEach((d) => assert.ok(G.stageCardLabel(d, n, true, 0).indexOf('정령') === -1, d + ' ' + n)));
  DIFFS.forEach((d) => [5, 10].forEach((n) => {
    const info = G.stageDetailInfo(d, n, true);
    assert.ok(info.hint.startsWith('잠든 ' + SPEC_SPIRITS[d][n][1] + ' 친구가 기다려요'), d + ' ' + n + ' ' + info.hint);
    assert.strictEqual(G.stageDetailInfo(d, n, false).hint, '');
    noAvoid(info.hint, '설명판');
  }));
  assert.strictEqual(G.stageDetailInfo('easy', 5, true).hint, '잠든 번개 정령 친구가 기다려요');
  assert.strictEqual(G.stageDetailInfo('easy', 4, true).hint, '');
});

/* ===================================================================
 * 2) 일반용과 소스가 글자 그대로 같은 곳 (이식이 맞는지)
 * =================================================================== */
/** 소스에서 head 로 시작하는 함수·상수 한 덩어리를 중괄호 짝으로 잘라 낸다 */
function bodyOf(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let depth = 0; let j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(i, j + 1);
}
const dropEdu = (s) => s.split('\n').filter((l) => !/\/\/ \[EDU\]/.test(l)).join('\n');

test('② [EDU] 정령 순수 함수·문구(SPIRIT_TEXT)·CONFIG.stages.spirit·정령 HUD 함수가 일반용과 글자 그대로 같다(교육용 `// [EDU]` 표식 줄만 제외)', { skip: skipGen }, () => {
  // 이유: 정령 규칙(몇 단계가 깨어났나)과 문구는 두 앱이 하나여야 한다. 교육용이 더하는 것은 `// [EDU]` 줄과 [EDU] 구간(SPIRIT_EDU_TEXT·eduSpiritFlow)뿐이다.
  ['spiritOf', 'spiritStep', 'spiritCells', 'awakenedCount'].forEach((name) => {
    assert.strictEqual(typeof G[name], 'function', name);
    assert.strictEqual(G[name].toString(), GEN[name].toString(), name + ' 본문');
  });
  Object.keys(GEN.SPIRIT_TEXT).forEach((k) => {
    assert.strictEqual(typeof G.SPIRIT_TEXT[k], typeof GEN.SPIRIT_TEXT[k], k);
    assert.strictEqual(String(G.SPIRIT_TEXT[k]), String(GEN.SPIRIT_TEXT[k]), 'SPIRIT_TEXT.' + k + ' 문구');
  });
  assert.deepStrictEqual(Object.keys(G.SPIRIT_TEXT), Object.keys(GEN.SPIRIT_TEXT), 'SPIRIT_TEXT 키 순서');
  assert.deepStrictEqual(G.CONFIG.stages.spirit, GEN.CONFIG.stages.spirit);
  assert.strictEqual(JSON.stringify(G.CONFIG.stages.spirit), JSON.stringify(GEN.CONFIG.stages.spirit), 'CONFIG.stages.spirit 키 순서까지');
  assert.deepStrictEqual(Object.keys(G.CONFIG.stages), Object.keys(GEN.CONFIG.stages), 'CONFIG.stages 키 순서(spirit 은 rest 다음, missions 앞)');
  assert.ok(Object.keys(G.CONFIG.stages).indexOf('spirit') === Object.keys(G.CONFIG.stages).indexOf('rest') + 1);
  // 소스 덩어리: SPIRIT_TEXT ~ awakenedCount 블록, 정령 HUD 구간(clearSpiritHud ~ updateSpirit), 깨운 정령 줄, CONFIG.stages.spirit
  const cut = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); assert.ok(i >= 0 && j > i, '표지: ' + a); return src.slice(i, j); };
  const blocks = [
    ['정령 순수 함수 블록', '/* ---------- 정령 특별 레벨 (spec §27.6 F1', '/* ---------- 레벨 카드·선택 레벨 설명판의 글'],
    ['CONFIG.stages.spirit', '// spec §27.6(비폭력 프레임 F1', '// 색 번호: 불 0 · 물 1 · 풀 2 · 번개 3 · 어둠 4 · 빛 5.\n      // 아래 두 표'],
    ['정령 HUD(패널 그리기)', '/* ---------- 정령 패널 (spec §27.6 F1, M4)', '/* ---------- 콤보 칩 (spec §28.5.7'],
    ['깨운 정령 줄', '/** "깨운 정령 n/6" 한 줄', '/* ---------- 선택 레벨 설명판'],
    ['결과 줄', "if (el['end-spirit']) {", "el['end-best'].textContent"]
  ];
  blocks.forEach(([name, a, b]) => {
    const e = dropEdu(cut(SRC, a, b));
    const g = cut(GEN_SRC, a, b);
    assert.ok(g.length > 300, name + ' 블록이 너무 짧다(표지가 어긋남)');
    assert.strictEqual(e, g, name + ' 소스가 일반용과 다르다');
  });
  // 정령 HUD 안의 교육용 분기는 정확히 한 줄(updateSpirit 의 eduSpiritFlow 호출)이다
  const hud = cut(SRC, '/* ---------- 정령 패널 (spec §27.6 F1, M4)', '/* ---------- 콤보 칩 (spec §28.5.7');
  const eduLines = hud.split('\n').filter((l) => /\/\/ \[EDU\]/.test(l)).map((l) => l.trim());
  assert.strictEqual(eduLines.length, 1, '정령 HUD 안의 [EDU] 줄은 하나');
  assert.ok(eduLines[0].startsWith('if (eduSpiritFlow(s, k)) return;'), eduLines[0]);
  // 일반용에는 [EDU] 표식·학습 말이 전혀 없다
  assert.ok(GEN_SRC.indexOf('[EDU]') === -1 && GEN_SRC.indexOf('eduSpiritFlow') === -1 && GEN_SRC.indexOf('SPIRIT_EDU_TEXT') === -1);
});

test('② [EDU] 정령 판 호출 줄: updateSpirit 는 runAction 안 두 곳(보드가 바뀐 행동은 정답 보너스를 더하는 문제 단계 뒤, 보드가 안 바뀐 일시불 스킬 행동은 그 자리)에서만 불린다(일반용은 missionUpdate 바로 뒤 한 곳)', { skip: skipGen }, () => {
  const calls = SRC.split('\n').filter((l) => /\bupdateSpirit\(\)/.test(l) && !/function updateSpirit/.test(l));
  assert.strictEqual(calls.length, 2, 'updateSpirit 호출은 두 줄(서로 겹치지 않는 경우: noPost 아닌 행동 / noPost 행동)');
  assert.ok(calls.every((l) => /\/\/ \[EDU\]/.test(l)), '두 줄 모두 [EDU] 표식');
  assert.ok(calls.some((l) => /ctx\.noPost && state\.spirit/.test(l)), 'noPost 행동 호출');
  const ra = bodyOf(SRC, 'async function runAction(');
  const first = ra.indexOf('updateSpirit()');
  const second = ra.indexOf('updateSpirit()', first + 1);
  assert.ok(first > ra.indexOf('await runQuizzes(') && ra.indexOf('await runQuizzes(') !== -1, '첫 호출은 문제 단계 뒤');
  assert.ok(ra.indexOf('missionUpdate(state.mission') < ra.indexOf('await runQuizzes('), '행동 이벤트는 문제 팝업 전에 센다(기존)');
  assert.ok(first < ra.indexOf('if (!stageDone() && !hasValidMove'), 'NO MOVES 판정·클리어 판정 앞');
  assert.ok(second > ra.indexOf('await reshuffleBoard()') && second < ra.indexOf('state.multHold = CONFIG.multReturn'), 'noPost 호출은 if (!ctx.noPost) 블록 다음');
  // 같은 행동에서 두 번 불리지 않는다: 첫 호출은 noPost 가 아닐 때만 실행되는 블록 안, 둘째는 noPost 일 때만
  assert.ok(ra.slice(0, first).lastIndexOf('if (!ctx.noPost) {') !== -1 && /ctx\.noPost && state\.spirit/.test(ra.slice(second - 80, second + 20)));
  const genRa = bodyOf(GEN_SRC, 'async function runAction(');
  assert.ok(genRa.indexOf('updateSpirit()') > genRa.indexOf('missionUpdate(state.mission') && genRa.indexOf('updateSpirit()') < genRa.indexOf('if (!ctx.noPost)'));
  assert.strictEqual((genRa.match(/updateSpirit\(\)/g) || []).length, 1, '일반용은 한 곳');
});

test('⑧ style.css 는 일반용과 바이트 동일, 정령 블록은 파일 맨 끝에 하나(일반용에서 그대로 복사)', { skip: skipGen }, () => {
  assert.strictEqual(CSS, GEN_CSS, 'style.css 바이트 동일');
  const idx = CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)');
  assert.ok(idx > 0 && CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)', idx + 1) === -1);
});

/* ===================================================================
 * 3) 가짜 DOM + 가상 시계 하네스 — 실제 교육용 game.js 를 그대로 실행한다 (modes.test.js 하네스 + 효과음 기록)
 * =================================================================== */
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
// 교육용 game.js 는 자체 __EG_TEST__.internals 를 이미 만든다 -> 덮어쓰지 않도록 별도 키 spiritInternals 를 쓴다(메모리에서만; 파일은 수정하지 않는다)
const HOOK_NOW = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.spiritInternals = { audio: audio, goalMet: goalMet, hudSp: hudSp }; }\n";
const HOOK_OLD = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.spiritInternals = { audio: audio, goalMet: goalMet }; }\n";
function compile(src, hook, name) {
  assert.ok(src.indexOf(HOOK_TAIL) !== -1, name + ': game.js 끝부분을 찾지 못함');
  return new vm.Script(src.replace(HOOK_TAIL, hook + HOOK_TAIL), { filename: name });
}
const SCRIPT = compile(SRC, HOOK_NOW, 'edu/game.js');

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null; this.hidden = false; this.textContent = '';
    this.isFragment = false; this._html = ''; this._attrs = {}; this._cls = new Set(); this._ls = {}; this._q = {}; this._style = {};
    this.dataset = {}; this.tabIndex = 0; this.disabled = false;
    const self = this;
    this.style = { setProperty(k, v) { self._style[k] = String(v); }, removeProperty(k) { delete self._style[k]; }, getPropertyValue(k) { return self._style[k] || ''; } };
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
  querySelectorAll(sel) { const m = /^\.([\w-]+)$/.exec(sel); if (!m) return []; const out = []; const walk = (e) => e.children.forEach((c) => { if (c._cls.has(m[1])) out.push(c); walk(c); }); walk(this); return out; }
  closest(sel) { const m = /^\.([\w-]+)$/.exec(sel); if (!m) return null; for (let e = this; e; e = e.parentNode) if (e._cls.has(m[1])) return e; return null; }
  contains(o) { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  focus() {} blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {} releasePointerCapture() {}
}

/** EduQuiz 가짜: ready·mode(intensity())를 시험이 바꿀 수 있다. ask() 는 thinkMs 뒤 답한다 */
function makeQuiz(env, o) {
  const opt = o || {};
  const quiz = {
    ready: opt.ready !== false, mode: opt.mode === undefined ? 'many' : opt.mode, asks: 0,
    ask() {
      quiz.asks++;
      const rec = { index: quiz.asks };
      return new Promise((resolve) => env.timers.setTimeout(() => resolve(opt.answer ? opt.answer(rec) : { right: true, bonus: G.bonusFor(env.I.state.level) }), opt.thinkMs == null ? 1000 : opt.thinkMs));
    },
    unitLabel() { return '시험 단원'; },
    cancel() {}
  };
  quiz.intensity = function () { return quiz.mode; };
  return quiz;
}

/** cfgPatch(CONFIG): 시험용 복사본의 CONFIG 만 바꾼다. o.script: 컴파일된 game.js, o.reduce: prefers-reduced-motion(기본 true — 입자 난수를 쓰지 않는다),
 *  o.quiz: false 이면 EduQuiz 없음(문제를 못 불러옴), 객체이면 makeQuiz 옵션(mode 'many'|'normal', ready, answer, thinkMs) */
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
    createElement(t) { return new FakeEl(t); }, createElementNS(ns, t) { return new FakeEl(t); },
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
    __rand: () => { env.rnd++; return rand(); }, __forced: []
  };
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __forced.length ? __forced.shift() : __rand(); };', sandbox);
  script.runInContext(sandbox);
  env.sandbox = sandbox; env.doc = doc; env.ids = ids; env.store = store;
  env.I = sandbox.__EG_TEST__.internals;
  env.X = sandbox.__EG_TEST__.spiritInternals;
  env.CONFIG = env.I.CONFIG;
  env.CONFIG.board.enabled = false;        // 새 칸 종류를 시험이 정한다(§26 구조 규칙은 끈다)
  if (o.quiz !== false) env.quiz = sandbox.EduQuiz = makeQuiz(env, o.quiz || {});
  if (cfgPatch) cfgPatch(env.CONFIG, env);
  env.unhandled = (e) => { env.errors.push(e); };
  process.on('unhandledRejection', env.unhandled);
  env.dispose = () => process.removeListener('unhandledRejection', env.unhandled);
  env.step = async function () {
    const q = env._q; if (!q.length) return false;
    let bi = 0; for (let i = 1; i < q.length; i++) if (q[i].t < q[bi].t || (q[i].t === q[bi].t && q[i].id < q[bi].id)) bi = i;
    const ev = q.splice(bi, 1)[0]; env._now = Math.max(env._now, ev.t); ev.fn();
    await new Promise((r) => setImmediate(r)); return true;
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
  /** 효과음 기록: audio.play 를 가로채 { name, spirit } 로 쌓는다(spirit = 정령 그림 함수(drawSpirit·eduSpiritFlow) 안에서 불렸는가 — 호출 스택으로 구분) */
  env.sfxLog = [];
  if (env.X && env.X.audio) env.X.audio.play = function (name) { env.sfxLog.push({ name, spirit: /drawSpirit|eduSpiritFlow/.test(new Error().stack) }); };
  env.el = (id) => doc.getElementById(id);
  return env;
}

async function startAndWait(env, lv, stage) {
  const I = env.I;
  I.save.level = lv; I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
}
function applyBoard(env, types) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) env.I.setGemType(env.I.state.grid[r][c], types[r][c]); }
async function finishAction(env) {
  await env.runUntil(() => !env.I.state.locked || env.I.state.phase !== 'playing', 120000);
  await env.runFor(400);
}
const W = G.WILD;
function patternBoard() { const g = []; for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); g.push(row); } return g; }
/** 매치가 없는 무늬 보드에서 (3,2)↔(3,3) 교환이 ? 를 지우는 시나리오(A A X ?) — 문제 한 개가 나온다 */
function wildBoard() {
  const B = patternBoard();
  B[3][3] = W; B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3;
  assert.strictEqual(G.findMatches(B).length, 0);
  return B;
}
/** 매치가 없는 무늬 보드(? 없음)에서 (3,2)↔(3,3) 교환이 색 0 의 3매치를 만드는 시나리오(A A X A) */
function plainBoard() {
  const B = patternBoard();
  B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[3][3] = 0; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3;
  assert.strictEqual(G.findMatches(B).length, 0);
  return B;
}
async function swapOn(env, board) {
  applyBoard(env, board);
  env.I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await finishAction(env);
}
const plainSwap = (env) => swapOn(env, plainBoard());
const wildSwap = (env) => swapOn(env, wildBoard());
const spiritSfx = (env) => env.sfxLog.filter((e) => e.spirit).map((e) => e.name);
const praise = (env) => env.sfxLog.filter((e) => !e.spirit && /^praise-/.test(e.name));
/** 학습 조건 N 을 모든 레벨에서 같은 값으로, ?가 거의 안 나오게(시험이 정한 ?만) 하는 설정 */
const learnCfg = (need, extra) => (c) => {
  c.edu.many.learn = { easy: need, normal: need, hard: need, specialPlus: 0 };
  c.edu.many.wild.spawn = 0.0000001;
  ['easy', 'normal', 'hard'].forEach((l) => { c.difficulty[l].time = { start: 600, max: 700 }; });
  if (extra) extra(c);
};
/** 중수 5단계를 작은 SEQ 미션으로 바꾼다(보통 표와 많이 표 둘 다) */
const seqCfg = (parts, lv) => (c) => {
  [c.stages, c.edu.many].forEach((t) => { t.missions[lv || 'normal'][4] = { parts, seq: true }; });
  c.stages.goalType[lv || 'normal'] = 'mission';
};

/* ===================================================================
 * 4) DOM — 문제를 못 불러옴/보통 모드: 일반용과 같은 정령 패널 (학습 칩 없음)
 * =================================================================== */
test('③ 특별 레벨 6곳(문제 못 불러옴·보통 모드): 시작하면 #spirit 이 보이고 k = 0, 제목·게이지·패널 이름이 일반용과 같고 학습 칩은 없다', async () => {
  for (const [label, quiz] of [['문제 없음', false], ['보통 모드', { mode: 'normal' }], ['ready 아님', { ready: false }]]) {
    for (const lv of DIFFS) {
      for (const stage of [5, 10]) {
        const env = createEnv(200 + stage, null, { quiz });
        await startAndWait(env, lv, stage);
        const I = env.I; const tag = label + ' ' + lv + stage;
        const sp = G.spiritOf(lv, stage);
        assert.strictEqual(JSON.stringify(I.state.spirit), JSON.stringify({ info: sp, k: 0, special: lv !== 'easy' }), tag);
        assert.strictEqual(env.el('spirit').hidden, false, tag);
        assert.strictEqual(env.el('screen-game').dataset.spirit, '1');
        assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), (lv === 'easy' ? '' : '특별 레벨, ') + '잠든 ' + SPEC_SPIRITS[lv][stage][1] + ', 깨어남 0/' + sp.steps, tag);
        assert.strictEqual(env.el('sp-title').textContent, '잠든 ' + SPEC_SPIRITS[lv][stage][1]);
        assert.strictEqual(env.el('sp-count').textContent, '깨어남 0/' + sp.steps);
        assert.strictEqual(env.el('sp-gauge').children.length, sp.steps);
        assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '1.000');
        assert.strictEqual(env.el('sp-zz').hidden, false);
        assert.strictEqual(env.el('learn-chip').hidden, true, tag + ' 학습 칩 없음');
        assert.strictEqual(env.el('screen-game').dataset.learn, undefined, tag);
        assert.strictEqual(I.state.edu.learn, null);
        if (lv === 'easy') {
          assert.strictEqual(env.el('goal').children.length, sp.steps - 1, '눈금 n-1개');
          assert.strictEqual(env.el('sp-note').textContent, '목표 점수의 1/3까지 힘을 모아 줘요');
        } else {
          assert.strictEqual(env.el('mission').hidden, false);
          assert.strictEqual(env.el('screen-game').dataset.chips, '1');
        }
        assert.deepStrictEqual(env.errors, []);
        env.dispose();
      }
    }
  }
});

test('③ 특별 레벨이 아닌 판(문제 있음·많이/보통): #spirit 숨김·정령 상태 없음, 학습 칩 이름은 그대로 "선물상자 문제 풀기"', async () => {
  for (const mode of ['many', 'normal']) {
    for (const lv of DIFFS) {
      for (const stage of [1, 3, 4, 9]) {
        const env = createEnv(100 + stage, null, { quiz: { mode } });
        await startAndWait(env, lv, stage);
        const I = env.I; const tag = mode + ' ' + lv + stage;
        assert.strictEqual(I.state.spirit, null, tag);
        assert.strictEqual(env.el('spirit').hidden, true, tag);
        assert.strictEqual(env.el('screen-game').dataset.spirit, undefined);
        assert.strictEqual(env.el('sp-wrap').className, 'sp-wrap');
        assert.strictEqual(env.el('sp-live').textContent, '');
        assert.strictEqual(env.el('goal').children.length, 0);
        if (mode === 'many') {
          assert.strictEqual(env.el('learn-chip').hidden, false, tag);
          assert.strictEqual(env.el('learn-name').textContent, '선물상자 문제 풀기', tag);
          assert.strictEqual(env.el('learn-chip').getAttribute('aria-label'), '선물상자 문제 풀기 0 / ' + G.learnNeed(lv, stage), tag);
        } else assert.strictEqual(env.el('learn-chip').hidden, true, tag);
        assert.deepStrictEqual(env.errors, []);
        env.dispose();
      }
    }
  }
});

test('③ 일반용과 같은 단계 진행(문제 없음): 단계 하나 praise-good 한 번·정령 낭독·이중 낭독 없음, 마지막 단계 praise-great·"고마워요"·결과 줄', async () => {
  // 문제를 못 불러온 판(= 일반용과 똑같이 동작). 새 칸 종류를 시험이 정할 수 있어 단계 수·연출 횟수를 정확히 센다
  const env = createEnv(301, seqCfg([{ k: 'collect', color: 0, need: 3 }, { k: 'collect', color: 1, need: 99 }, { k: 'big', min: 4, need: 9 }]), { quiz: false });
  await startAndWait(env, 'normal', 5);
  const I = env.I;
  assert.strictEqual(I.state.spirit.info.steps, 3);
  await plainSwap(env);
  assert.strictEqual(I.state.spirit.k, 1);
  assert.deepStrictEqual(spiritSfx(env), ['praise-good']);
  assert.strictEqual(env.el('sp-live').textContent, '풀 정령이 한 걸음 더 깨어났어요 (1/3)');
  assert.strictEqual(env.el('mission-live').textContent, '', '칩의 미션 완료 낭독은 정령 낭독이 대신한다');
  assert.strictEqual(env.el('sp-count').textContent, '깨어남 1/3');
  assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '0.667');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '특별 레벨, 잠든 풀 정령, 깨어남 1/3');
  assert.strictEqual(I.state.spirit.almost, false, '학습 조건이 없으면 "거의 깨어났어요" 상태는 없다');
  env.dispose();
  // 마지막 단계(부분 1개짜리 시험용 미션): 곧바로 판이 끝나고 "깨어났어요! 고마워요"
  const env2 = createEnv(303, seqCfg([{ k: 'collect', color: 0, need: 3 }]), { quiz: false });
  await startAndWait(env2, 'normal', 5);
  await plainSwap(env2);
  assert.strictEqual(env2.I.state.phase, 'over');
  assert.deepStrictEqual(spiritSfx(env2), ['praise-great']);
  assert.strictEqual(env2.el('sp-live').textContent, '풀 정령이 깨어났어요! 고마워요');
  assert.strictEqual(env2.el('sp-title').textContent, '풀 정령이 깨어났어요!');
  assert.strictEqual(env2.el('end-title').textContent, 'STAGE CLEAR!');
  assert.strictEqual(env2.el('end-spirit').hidden, false);
  assert.strictEqual(env2.el('end-spirit').textContent, '풀 정령이 깨어났어요! 고마워요');
  assert.ok(env2.el('sp-art').classList.contains('awake'));
  assert.deepStrictEqual(env2.errors, []);
  env2.dispose();
});

test('③ 초보 5단계는 교육용 목표 점수 기준: state.target(보통 표 / 많이 표)의 1/3·2/3 지점을 넘는 행동 끝에서 한 번씩 (일반용 숫자를 쓰지 않는다)', async () => {
  for (const [mode, want] of [['normal', G.stageTarget('easy', 5)], ['many', G.CONFIG.edu.many.easyTargets[4]]]) {
    const env = createEnv(305, learnCfg(5), { quiz: { mode } });
    await startAndWait(env, 'easy', 5);
    const I = env.I; const T = I.state.target;
    assert.strictEqual(T, want, mode + ' state.target');
    assert.notStrictEqual(T, GEN.stageTarget('easy', 5));
    // 1/3 바로 아래(−5)에서 평범한 행동 → 1/3 을 넘는다(점수가 5점 이상 오른다)
    I.state.score = Math.ceil(T / 3) - 5;
    await plainSwap(env);
    assert.ok(I.state.score >= Math.ceil(T / 3), '점수가 1/3 지점을 넘었다: ' + I.state.score);
    assert.strictEqual(I.state.spirit.k, Math.floor(I.state.score * 3 / T), mode);
    assert.ok(I.state.spirit.k >= 1);
    assert.deepStrictEqual(spiritSfx(env), ['praise-good'], mode + ' 정령 효과음 한 번');
    assert.ok(/^번개 정령이 한 걸음 더 깨어났어요 \(\d\/3\)$/.test(env.el('sp-live').textContent.replace(/\.$/, '')));
    assert.ok(/^목표 점수의 [12]\/3에 왔어요! /.test(env.el('sp-note').textContent), env.el('sp-note').textContent);
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

test('③ 보드가 안 바뀌는 행동(물 스킬의 일시불 점수, ctx.noPost)도 정령 단계를 한 번 올린다 — 보통·많이 모드 모두 (교육용만의 두 번째 updateSpirit 호출)', async () => {
  for (const mode of ['normal', 'many']) {
    const env = createEnv(310, learnCfg(5), { quiz: { mode } });
    await startAndWait(env, 'easy', 5);
    const I = env.I; const st = I.state; const T = st.target;
    st.edu.firstDone = true;
    st.score = Math.ceil(T / 3) - 1;
    st.gauge[1] = env.CONFIG.types[1].max;           // 물 = 번호 1: 조준 없이 점수만 더하는 일시불 스킬
    I.onGauge(1);
    await finishAction(env);
    await env.runFor(3000);
    assert.strictEqual(st.stats.skills, 1, mode + ' 스킬이 실제로 쓰였다');
    assert.ok(st.score >= Math.ceil(T / 3), mode + ' 일시불 점수로 1/3 지점을 넘었다: ' + st.score);
    assert.strictEqual(st.spirit.k, 1, mode);
    assert.deepStrictEqual(spiritSfx(env), ['praise-good'], mode + ' 정령 효과음 한 번');
    assert.strictEqual(env.el('sp-live').textContent, '번개 정령이 한 걸음 더 깨어났어요 (1/3)');
    assert.deepStrictEqual(env.errors, []);
    env.dispose();
  }
});

/* ===================================================================
 * 5) DOM — 많이 모드: 학습 칩 이름 "정령에게 선물 드리기"
 * =================================================================== */
test('① 많이 모드의 특별 레벨 6곳: 학습 칩 이름 "정령에게 선물 드리기"(이름·aria-label·완료 낭독), 작은 글·진행 "0 / N"·progressbar 는 그대로, 특별이 아닌 레벨은 "선물상자 문제 풀기"', async () => {
  for (const lv of DIFFS) {
    for (const stage of [5, 10]) {
      const env = createEnv(210 + stage, null, { quiz: { mode: 'many' } });
      await startAndWait(env, lv, stage);
      const I = env.I; const chip = env.el('learn-chip'); const tag = lv + stage;
      const need = G.learnNeed(lv, stage);
      assert.ok(need >= 7, tag + ' 특별 레벨 N = 기본 + 2');
      assert.strictEqual(chip.hidden, false, tag);
      assert.strictEqual(env.el('learn-name').textContent, '정령에게 선물 드리기', tag);
      assert.strictEqual(chip.getAttribute('aria-label'), '정령에게 선물 드리기 0 / ' + need, tag);
      assert.strictEqual(env.el('learn-num').textContent, '0 / ' + need);
      assert.strictEqual(chip.getAttribute('aria-valuemax'), String(need));
      assert.ok(HTML.indexOf('aria-describedby="learn-sub"') !== -1 && HTML.indexOf('id="learn-sub">맞든 틀리든 푼 개수예요</small>') !== -1, '작은 글은 그대로');
      assert.strictEqual(env.el('screen-game').dataset.learn, '1');
      assert.strictEqual(env.el('screen-game').dataset.spirit, '1');
      assert.ok(I.state.spirit && I.state.edu.learn && I.state.edu.learn.need === need);
      // 진행·완료: 푼 개수를 직접 채우고 HUD 를 한 번 갱신한다
      I.state.edu.asked = 3;
      I.updateHUD(0.016);
      assert.strictEqual(env.el('learn-num').textContent, '3 / ' + need);
      assert.strictEqual(chip.getAttribute('aria-label'), '정령에게 선물 드리기 3 / ' + need);
      assert.strictEqual(chip.getAttribute('aria-valuenow'), '3');
      assert.strictEqual(env.el('learn-live').textContent, '');
      I.state.edu.asked = need + 2;
      I.updateHUD(0.016);
      assert.strictEqual(env.el('learn-num').textContent, need + ' / ' + need);
      assert.strictEqual(chip.getAttribute('aria-label'), '정령에게 선물 드리기 ' + need + ' / ' + need + ', 완료');
      assert.ok(chip.classList.contains('done'));
      assert.strictEqual(env.el('learn-live').textContent, '정령에게 선물 드리기를 끝냈어요', tag);
      noAvoid(env.el('learn-live').textContent, '낭독');
      assert.deepStrictEqual(env.errors, []);
      env.dispose();
    }
  }
  // 특별 레벨 → 일반 레벨 → 특별 레벨: 이름이 매번 그 레벨에 맞게 돌아온다
  const env = createEnv(215, null, { quiz: { mode: 'many' } });
  await startAndWait(env, 'normal', 5);
  assert.strictEqual(env.el('learn-name').textContent, '정령에게 선물 드리기');
  await startAndWait(env, 'normal', 4);
  assert.strictEqual(env.el('learn-name').textContent, '선물상자 문제 풀기');
  assert.strictEqual(env.el('learn-chip').getAttribute('aria-label'), '선물상자 문제 풀기 0 / ' + G.learnNeed('normal', 4));
  env.I.state.edu.asked = 99; env.I.updateHUD(0.016);
  assert.strictEqual(env.el('learn-live').textContent, '선물상자 문제 풀기를 끝냈어요', '특별이 아닌 레벨의 완료 낭독은 그대로');
  await startAndWait(env, 'normal', 10);
  assert.strictEqual(env.el('learn-name').textContent, '정령에게 선물 드리기');
  assert.strictEqual(env.el('learn-live').textContent, '');
  env.dispose();
});

test('④ 많이 모드 + 목표를 먼저 채우고 학습이 모자람(초보 점수 목표): "거의 깨어났어요"(컬러·판 이어짐) → 학습을 채우는 순간에만 "깨어났어요! 고마워요"·praise-great 한 번', async () => {
  const env = createEnv(401, learnCfg(2), { quiz: { mode: 'many' } });
  await startAndWait(env, 'easy', 5);
  const I = env.I; const st = I.state;
  st.edu.firstDone = true;
  assert.strictEqual(st.edu.learn.need, 2);
  st.score = st.target;                       // 목표 점수를 채웠다(학습은 0 / 2)
  await plainSwap(env);
  assert.strictEqual(st.phase, 'playing', '학습 조건이 모자라 판이 이어진다');
  assert.strictEqual(st.spirit.k, 3);
  assert.strictEqual(st.spirit.almost, true);
  assert.strictEqual(env.el('sp-title').textContent, '번개 정령이 거의 깨어났어요');
  assert.strictEqual(env.el('sp-count').textContent, '깨어남 3/3');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '번개 정령이 거의 깨어났어요, 깨어남 3/3');
  assert.strictEqual(env.el('sp-art').style.getPropertyValue('--sp-g'), '0.000', '그림은 컬러로 돌아왔다');
  assert.strictEqual(env.el('sp-zz').hidden, true);
  assert.strictEqual(env.el('sp-art').classList.contains('awake'), false, '아직 깨어난 것이 아니다(제목 초록색 없음)');
  assert.strictEqual(env.el('sp-live').textContent, '거의 다 깨어났어요! 선물상자 문제를 마저 풀어 줘요');
  assert.strictEqual(env.el('sp-note').textContent, '목표 점수에 닿았어요! 선물상자 문제를 마저 풀어 줘요');
  assert.deepStrictEqual(env.el('sp-gauge').children.map((c) => c.textContent), ['✓', '✓', '✓']);
  assert.deepStrictEqual(spiritSfx(env), ['praise-good'], '거의 깨어남에서는 단계 효과음(praise-good)만, praise-great 는 없다');
  assert.ok(env.sfxLog.filter((e) => e.name === 'praise-great' && e.spirit).length === 0);
  assert.strictEqual(env.el('learn-chip').classList.contains('done'), false);
  assert.strictEqual(env.el('end-title').textContent !== 'STAGE CLEAR!', true);
  // 학습이 모자란 채로 평범한 행동을 더 해도 새 연출·낭독은 없다
  const n0 = env.sfxLog.length; const live0 = env.el('sp-live').textContent;
  await plainSwap(env);
  assert.strictEqual(st.phase, 'playing');
  assert.strictEqual(env.sfxLog.slice(n0).filter((e) => e.spirit).length, 0);
  assert.strictEqual(env.el('sp-live').textContent, live0);
  // 문제 1개 → 아직 모자람(1 / 2): 그대로
  await wildSwap(env);
  assert.strictEqual(st.edu.asked, 1);
  assert.strictEqual(st.phase, 'playing');
  assert.strictEqual(st.spirit.almost, true);
  assert.strictEqual(env.el('sp-title').textContent, '번개 정령이 거의 깨어났어요');
  assert.deepStrictEqual(spiritSfx(env), ['praise-good']);
  // 문제 2개째 = 학습 조건 충족 → 이 행동 끝에서 판이 끝나고 마지막 연출 한 번
  await wildSwap(env);
  assert.strictEqual(st.edu.asked, 2);
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(st.spirit.almost, false);
  assert.deepStrictEqual(spiritSfx(env), ['praise-good', 'praise-great'], '마지막 praise-great 는 판이 끝날 때 딱 한 번');
  assert.strictEqual(env.el('sp-live').textContent.replace(/\.$/, ''), '번개 정령이 깨어났어요! 고마워요');
  assert.strictEqual(env.el('sp-title').textContent, '번개 정령이 깨어났어요!');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '번개 정령이 깨어났어요, 깨어남 3/3');
  assert.strictEqual(env.el('sp-note').textContent, '목표 점수에 닿았어요! 고마워요');
  assert.ok(env.el('sp-art').classList.contains('awake'));
  assert.strictEqual(env.el('end-title').textContent, 'STAGE CLEAR!');
  assert.strictEqual(env.el('end-spirit').textContent, '번개 정령이 깨어났어요! 고마워요');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 많이 모드 + 미션 레벨(중수 5단계, 단계 1개짜리 시험용 SEQ): 미션을 먼저 끝내면 "거의 깨어났어요" → 학습을 채우면 "깨어났어요! 고마워요"', async () => {
  const env = createEnv(402, (c) => { learnCfg(2)(c); seqCfg([{ k: 'collect', color: 0, need: 3 }])(c); }, { quiz: { mode: 'many' } });
  await startAndWait(env, 'normal', 5);
  const I = env.I; const st = I.state;
  st.edu.firstDone = true;
  assert.strictEqual(st.spirit.info.steps, 1);
  await plainSwap(env);
  assert.strictEqual(st.mission.parts[0].done, true, '미션(퍼즐 목표)은 끝났다');
  assert.strictEqual(st.phase, 'playing', '학습 조건이 모자라 판이 이어진다');
  assert.strictEqual(st.spirit.k, 1);
  assert.strictEqual(st.spirit.almost, true);
  assert.strictEqual(env.el('sp-title').textContent, '풀 정령이 거의 깨어났어요');
  assert.strictEqual(env.el('sp-wrap').getAttribute('aria-label'), '특별 레벨, 풀 정령이 거의 깨어났어요, 깨어남 1/1');
  assert.strictEqual(env.el('sp-live').textContent, '거의 다 깨어났어요! 선물상자 문제를 마저 풀어 줘요');
  assert.strictEqual(env.el('mission-live').textContent, '', '미션 칩의 낭독은 정령 낭독이 대신한다');
  assert.deepStrictEqual(spiritSfx(env), ['praise-good']);
  await wildSwap(env);
  await wildSwap(env);
  assert.strictEqual(st.edu.asked, 2);
  assert.strictEqual(st.phase, 'over');
  assert.deepStrictEqual(spiritSfx(env), ['praise-good', 'praise-great']);
  assert.strictEqual(env.el('sp-live').textContent.replace(/\.$/, ''), '풀 정령이 깨어났어요! 고마워요');
  assert.strictEqual(env.el('end-spirit').textContent, '풀 정령이 깨어났어요! 고마워요');
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('④ 학습을 먼저 채운 판은 "거의 깨어났어요" 없이 곧바로 "깨어났어요! 고마워요"(praise-great 한 번), 한 행동에서 정답 보너스로 목표를 넘어도 한 번', async () => {
  const env = createEnv(403, learnCfg(1), { quiz: { mode: 'many' } });
  await startAndWait(env, 'easy', 5);
  const I = env.I; const st = I.state;
  st.edu.firstDone = true;
  await wildSwap(env);                               // 문제 1개(= 학습 조건 충족), 점수는 목표에 한참 모자람
  assert.strictEqual(st.edu.asked, 1);
  assert.strictEqual(st.phase, 'playing');
  assert.strictEqual(st.spirit.almost, false);
  st.score = st.target;
  await plainSwap(env);
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(st.spirit.almost, false);
  assert.ok(spiritSfx(env).indexOf('praise-great') !== -1 && spiritSfx(env).filter((n) => n === 'praise-great').length === 1);
  assert.ok(env.el('sp-title').textContent.indexOf('거의') === -1, '"거의 깨어났어요"를 한 번도 거치지 않았다');
  assert.strictEqual(env.el('sp-live').textContent.replace(/\.$/, ''), '번개 정령이 깨어났어요! 고마워요');
  env.dispose();
  // 정답 보너스(문제 단계)가 점수를 목표 위로 올리는 행동: 학습 조건 1 = 그 문제 → 곧바로 끝, 정령 효과음은 마지막 한 번
  const env2 = createEnv(404, learnCfg(1), { quiz: { mode: 'many', answer: () => ({ right: true, bonus: 90000 }) } });
  await startAndWait(env2, 'easy', 5);
  env2.I.state.edu.firstDone = true;
  await wildSwap(env2);
  assert.strictEqual(env2.I.state.phase, 'over', '보너스로 목표를 넘고 학습도 채웠다');
  assert.deepStrictEqual(spiritSfx(env2), ['praise-great'], '0 → 3 단계를 한 번에: 정령 효과음 한 번(마지막)');
  assert.strictEqual(env2.I.state.spirit.k, 3);
  env2.dispose();
});

test('④ 감소 모션이 아니면 "거의 깨어났어요" 단계에서도 빛 번짐 한 번(+타이머), 감소 모션이면 번짐·타이머 없이 상태만 바뀐다', async () => {
  const run = async (reduce) => {
    const env = createEnv(405, learnCfg(2), { quiz: { mode: 'many' }, reduce });
    await startAndWait(env, 'easy', 5);
    env.I.state.edu.firstDone = true;
    env.I.state.score = env.I.state.target;
    const art = env.el('sp-art');
    let pulsed = 0;
    const add = art.classList.add;
    art.classList.add = function (n) { if (n === 'pulse') pulsed++; return add.apply(this, arguments); };
    await plainSwap(env);
    const during = art.classList.contains('pulse');
    await env.runFor(1300);
    const out = { almost: env.I.state.spirit.almost, pulsed, during, leftover: art.classList.contains('pulse') };
    env.dispose();
    return out;
  };
  const motion = await run(false);
  assert.deepStrictEqual(motion, { almost: true, pulsed: 1, during: true, leftover: false });
  const still = await run(true);
  assert.deepStrictEqual(still, { almost: true, pulsed: 0, during: false, leftover: false });
});

/* ===================================================================
 * 6) 결과 줄 — 클리어·시간 초과 실패 (학습 부족이면 end-target 의 문제 줄 유지)
 * =================================================================== */
test('⑤ 시간 초과 실패: 결과 줄 "아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 k/n)", 학습이 모자라면 end-target 의 "· 선물상자 문제 n/N"도 그대로 — 거의 깨어난 판(k = n)·덜 깨어난 판·미션형', async () => {
  const timeout = async (env) => {
    env.I.state.timeLeft = 0.3;
    await env.runUntil(() => env.I.state.phase === 'over', 30000);
  };
  // (a) 목표는 채웠는데 학습이 모자란 채 시간 초과(초보)
  const a = createEnv(501, learnCfg(2), { quiz: { mode: 'many' } });
  await startAndWait(a, 'easy', 5);
  a.I.state.edu.firstDone = true; a.I.state.score = a.I.state.target;
  await plainSwap(a);
  assert.strictEqual(a.I.state.spirit.almost, true);
  await timeout(a);
  assert.strictEqual(a.el('end-title').textContent, 'TIME UP');
  assert.strictEqual(a.el('end-spirit').hidden, false);
  assert.strictEqual(a.el('end-spirit').textContent, '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 3/3)');
  assert.ok(/ · 선물상자 문제 0\/2$/.test(a.el('end-target').textContent), a.el('end-target').textContent);
  assert.ok(!/미션|특별/.test(a.el('end-spirit').textContent + a.el('end-target').textContent));
  noAvoid(a.el('end-spirit').textContent, '결과(실패)');
  a.dispose();
  // (b) 덜 깨어난 판(k = 0)에 학습도 모자람
  const b = createEnv(502, learnCfg(2), { quiz: { mode: 'many' } });
  await startAndWait(b, 'hard', 10);
  await timeout(b);
  assert.strictEqual(b.el('end-spirit').textContent, '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 0/' + G.spiritOf('hard', 10).steps + ')');
  assert.ok(/ · 선물상자 문제 0\/2$/.test(b.el('end-target').textContent), b.el('end-target').textContent);
  b.dispose();
  // (c) 미션 1단계까지 깨우고 학습은 채운 채 시간 초과 → 문제 줄 없음
  const c = createEnv(503, (cfg) => { learnCfg(1)(cfg); seqCfg([{ k: 'collect', color: 0, need: 3 }, { k: 'collect', color: 1, need: 9999 }, { k: 'big', min: 4, need: 9 }])(cfg); }, { quiz: { mode: 'many' } });
  await startAndWait(c, 'normal', 5);
  c.I.state.edu.firstDone = true;
  await wildSwap(c);                                   // 문제 1개 = 학습 충족(A A ? 3매치 = 색 0 한 그룹 → 미션 1단계)
  assert.strictEqual(c.I.state.edu.asked, 1);
  assert.strictEqual(c.I.state.spirit.k, 1);
  await timeout(c);
  assert.strictEqual(c.el('end-spirit').textContent, '아직 잠이 덜 깼어요. 다시 도전해요! (깨어남 1/3)');
  assert.ok(!/선물상자 문제/.test(c.el('end-target').textContent), c.el('end-target').textContent);
  c.dispose();
  // (d) 특별 레벨이 아니면 숨김
  const d = createEnv(504, learnCfg(2), { quiz: { mode: 'many' } });
  await startAndWait(d, 'normal', 4);
  await timeout(d);
  assert.strictEqual(d.el('end-spirit').hidden, true);
  assert.strictEqual(d.el('end-spirit').textContent, '');
  d.dispose();
});

/* ===================================================================
 * 7) 판 도중 문제 양이 바뀌어도 그 판의 정령/학습 값이 유지된다
 * =================================================================== */
test('⑥ 판 도중 문제 양(보통↔많이)·ready 가 바뀌어도 그 판의 정령 단계 수·학습 조건 N·칩 이름·목표가 그대로다', async () => {
  // 많이로 시작 → 도중에 보통·ready 아님
  const env = createEnv(601, learnCfg(5), { quiz: { mode: 'many' } });
  await startAndWait(env, 'easy', 5);
  const I = env.I; const st = I.state;
  const snap = () => JSON.stringify([st.target, st.spirit.info, st.edu.mode, st.edu.learn, env.el('learn-name').textContent, env.el('learn-chip').hidden, env.el('screen-game').dataset.learn]);
  const before = snap();
  env.quiz.mode = 'normal';
  await plainSwap(env);
  assert.strictEqual(snap(), before, '도중에 보통으로 바꿔도 같은 판의 값');
  env.quiz.ready = false;
  await plainSwap(env);
  assert.strictEqual(snap(), before, '도중에 ready 가 false 가 돼도 그 판의 정령·칩은 그대로(학습 조건은 learnMet 이 자동 해제할 뿐)');
  assert.strictEqual(st.spirit.info.steps, 3);
  env.dispose();
  // 보통으로 시작 → 도중에 많이: 학습 칩이 갑자기 나타나지 않고, 정령은 그대로
  const env2 = createEnv(602, learnCfg(5), { quiz: { mode: 'normal' } });
  await startAndWait(env2, 'hard', 5);
  const st2 = env2.I.state;
  const before2 = JSON.stringify([st2.target, st2.spirit.info, st2.edu.mode, st2.edu.learn, env2.el('learn-chip').hidden]);
  env2.quiz.mode = 'many';
  await plainSwap(env2);
  assert.strictEqual(JSON.stringify([st2.target, st2.spirit.info, st2.edu.mode, st2.edu.learn, env2.el('learn-chip').hidden]), before2);
  assert.strictEqual(env2.el('learn-chip').hidden, true);
  assert.strictEqual(st2.edu.learn, null);
  env2.dispose();
});

/* ===================================================================
 * 8) 레벨 선택: 설명판 학습 줄·카드 aria-label·"깨운 정령" 줄
 * =================================================================== */
test('⑦ 설명판 학습 줄: 많이 모드의 특별 레벨만 "정령에게 선물상자 문제 N개를 드려요"(같은 N), 다른 레벨은 "선물상자 문제 N개도 풀어요", 보통 모드·잠긴 레벨은 없음. 한 줄 힌트는 정령 친구', () => {
  const mk = (mode) => createEnv(701, null, { quiz: { mode } });
  const env = mk('many');
  const I = env.I;
  I.save.level = 'normal'; I.save.progress.normal = 9;
  I.goStages();
  const detail = (stage) => { I.save.progress.normal = stage - 1; I.goStages(); return { title: env.el('sd-title').textContent, learn: env.el('sd-learn').textContent, learnHidden: env.el('sd-learn').hidden, hint: env.el('sd-hint').textContent }; };
  const d4 = detail(4); const d5 = detail(5); const d10 = detail(10); const d2 = detail(2);
  assert.deepStrictEqual([d4.title, d4.learn], ['레벨 4', '선물상자 문제 ' + G.learnNeed('normal', 4) + '개도 풀어요']);
  assert.deepStrictEqual([d5.title, d5.learn], ['레벨 5', '정령에게 선물상자 문제 ' + G.learnNeed('normal', 5) + '개를 드려요']);
  assert.deepStrictEqual([d10.title, d10.learn], ['레벨 10', '정령에게 선물상자 문제 ' + G.learnNeed('normal', 10) + '개를 드려요']);
  assert.strictEqual(G.learnNeed('normal', 5), G.learnNeed('normal', 4) + G.CONFIG.edu.many.learn.specialPlus, '특별 레벨 N = 기본 + specialPlus (같은 N)');
  assert.strictEqual(d2.learn, '선물상자 문제 ' + G.learnNeed('normal', 2) + '개도 풀어요');
  assert.ok(d5.hint.startsWith('잠든 풀 정령 친구가 기다려요'), d5.hint);
  assert.ok(d4.hint.indexOf('정령') === -1);
  [d4, d5, d10, d2].forEach((d) => noAvoid(d.learn + ' ' + d.hint, '설명판'));
  // 보통 모드: 학습 줄 없음, 정령 힌트는 그대로
  const envN = mk('normal');
  envN.I.save.level = 'easy'; envN.I.save.progress.easy = 4;
  envN.I.goStages();
  assert.strictEqual(envN.el('sd-learn').hidden, true);
  assert.strictEqual(envN.el('sd-learn').textContent, '');
  assert.strictEqual(envN.el('sd-title').textContent, '레벨 5');
  assert.strictEqual(envN.el('sd-hint').textContent, '잠든 번개 정령 친구가 기다려요');
  // 고수 1단계(열림, 일반 레벨): 일반 줄
  const envL = mk('many');
  envL.I.save.level = 'hard'; envL.I.save.progress.hard = 0;
  envL.I.goStages();
  assert.strictEqual(envL.el('sd-learn').hidden, false);
  assert.strictEqual(envL.el('sd-learn').textContent, '선물상자 문제 ' + G.learnNeed('hard', 1) + '개도 풀어요');
  envL.dispose(); envN.dispose(); env.dispose();
});

test('⑦ 레벨 카드 aria-label(많이 모드의 교육용 숫자 기준)·"깨운 정령 n/6" 줄: 정령 이름만 더해지고, 새 저장 필드는 없다', () => {
  const env = createEnv(702, null, { quiz: { mode: 'many' } });
  const I = env.I; const grid = env.el('stage-grid');
  I.save.level = 'easy'; I.save.progress.easy = 9;
  I.goStages();
  const labels = grid.children.map((b) => b.getAttribute('aria-label'));
  assert.strictEqual(labels[4], '레벨 5, 잠든 번개 정령, 목표 ' + fmtN(G.CONFIG.edu.many.easyTargets[4]) + '점, 별 0개', '많이 표의 초보 5단계 목표');
  assert.strictEqual(labels[9], '레벨 10, 잠든 빛 정령, 목표 ' + fmtN(G.CONFIG.edu.many.easyTargets[9]) + '점, 별 0개');
  [0, 1, 2, 3, 5, 6, 7, 8].forEach((i) => assert.ok(labels[i].indexOf('정령') === -1, labels[i]));
  assert.strictEqual(env.el('sp-roster-text').textContent, '깨운 정령 0/6');
  assert.strictEqual(env.el('sp-roster-sr').textContent, '깨운 정령 0마리 / 6마리');
  I.save.stages.hard[4].stars = 2; I.save.stages.normal[9].stars = 1; I.save.stages.easy[0].stars = 3;
  I.renderStages();
  assert.strictEqual(env.el('sp-roster-text').textContent, '깨운 정령 2/6');
  assert.strictEqual((env.el('sp-roster-art').innerHTML.match(/sp-mini on/g) || []).length, 2);
  assert.ok(!/spirit|awake|정령/.test(JSON.stringify(G.defaultSave())), '저장 구조에 정령 필드가 없다');
  env.dispose();
});

/* ===================================================================
 * 9) 마크업 · CSS · 문구 · 에셋
 * =================================================================== */
test('⑧ index.html: #sp-wrap 안에 #spirit·#goal·#mission·#sp-live, 학습 칩은 #sp-wrap 바깥(그 아래·보드 앞), 이름 자리 #learn-name, div 여닫음이 맞다', () => {
  const at = (s) => HTML.indexOf(s);
  let last = -1;
  ['id="sp-wrap"', 'id="spirit"', 'id="sp-art"', 'id="sp-title"', 'id="sp-gauge"', 'id="sp-count"', 'id="goal"', 'id="sp-note"', 'id="mission"', 'id="sp-live"', 'id="learn-chip"', 'id="learn-name"', 'id="learn-live"', 'id="board-wrap"'].forEach((s) => {
    const i = at(s); assert.ok(i > last, '순서가 맞지 않거나 없음: ' + s); last = i;
  });
  // #sp-wrap 의 닫는 </div> 는 학습 칩보다 앞이다(칩은 패널 높이 93px 에 들어가지 않는다)
  const wrapOpen = at('<div class="sp-wrap" id="sp-wrap">');
  let depth = 0; let end = -1;
  const re = /<div\b|<\/div>/g; re.lastIndex = wrapOpen;
  let m;
  while ((m = re.exec(HTML))) { if (m[0] === '</div>') { depth--; } else depth++; if (depth === 0) { end = m.index; break; } }
  assert.ok(end > at('id="sp-live"') && end < at('id="learn-chip"'), '#sp-wrap 은 sp-live 에서 닫히고 학습 칩은 그 밖');
  assert.ok(/<b class="lc-name" id="learn-name">선물상자 문제 풀기<\/b>/.test(HTML), '기본 이름은 그대로(정령 레벨에서만 game.js 가 바꾼다)');
  assert.ok(/<div class="learn-chip" id="learn-chip" role="progressbar" aria-label="선물상자 문제 풀기" aria-describedby="learn-sub"/.test(HTML));
  assert.ok(/<p class="end-spirit" id="end-spirit" hidden><\/p>/.test(HTML) && /id="sp-roster-sr"/.test(HTML));
  assert.strictEqual((HTML.match(/<div\b/g) || []).length, (HTML.match(/<\/div>/g) || []).length, 'div 여닫음');
  // 일반용 index.html 과의 차이는 [EDU] 표식이 붙은 곳뿐: 정령 마크업 블록은 글자 그대로 같다
  if (HAS_GEN) {
    const GEN_HTML = fs.readFileSync(path.join(GEN_DIR, 'index.html'), 'utf8');
    const cut = (h) => h.slice(h.indexOf('<!-- 정령 패널 (spec §27.6, M4)'), h.indexOf('<div class="board-wrap" id="board-wrap">'));
    const eduPart = cut(HTML).split('\n').filter((l) => l.indexOf('[EDU]') === -1);
    // 교육용은 같은 구간에 학습 칩 블록(주석 + 칩 + live)이 더 있다: 그 줄들을 빼고 비교한다
    const eduNoLearn = [];
    let skip = false;
    eduPart.forEach((l) => { if (/<!-- \[EDU\]|<div class="learn-chip"/.test(l) || skip) { skip = !/<p class="m-live" id="learn-live"/.test(l); return; } eduNoLearn.push(l); });
    assert.strictEqual(eduNoLearn.join('\n').trim(), cut(GEN_HTML).trim(), '정령 마크업이 일반용과 같다');
  }
});

test('⑧ edu.css: 정령 × 학습 칩 블록은 파일 맨 끝에 하나, 새 규칙은 두 개뿐 — 세로 폰 보드 식의 --mis-extra(값은 2칩 레벨(style.css)과 같은 71px)와 휴대폰 가로의 칸 사이 간격 3px', () => {
  const marker = '정령 특별 레벨 × 학습 칩 (spec §27.6·§27.8, M4-B)';
  const idx = EDU_CSS.indexOf(marker);
  assert.ok(idx > 0 && EDU_CSS.indexOf(marker, idx + 1) === -1, '블록 하나');
  const block = EDU_CSS.slice(EDU_CSS.lastIndexOf('/*', idx));
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.strictEqual(code, '@media (orientation: portrait), (orientation: landscape) and (min-height: 501px) and (max-width: 799px) {\n  #screen-game[data-spirit][data-learn="1"] { --mis-extra: 71px; }\n}\n@media (orientation: landscape) and (max-height: 500px) {\n  #screen-game[data-spirit][data-learn="1"] .game { row-gap: 3px; }\n}', '새 규칙은 이 두 개뿐');
  // 휴대폰 가로: 기존 학습 칩 격자의 칸 사이 간격은 5px — 정령 판만 3px(합이 기존 "미션 칩 2개 + 학습 칩"보다 높지 않게). 기존 규칙(5px)은 그대로다
  assert.ok(/#screen-game\[data-learn="1"\] \.game \{\n    grid-template-rows: auto auto auto auto 1fr;[^}]*row-gap: 5px;/.test(EDU_CSS), '기존 학습 칩 격자(5px)는 그대로');
  // 같은 미디어 쿼리의 M3-B 학습 칩 보드 식과 style.css 의 2칩 값
  const two = CSS.match(/\[data-chips="2"\] \{ --mis-extra: (\d+)px; \}/);
  assert.ok(two && two[1] === '71', '2칩 레벨의 --mis-extra 는 71px');
  assert.ok(/\(orientation: portrait\), \(orientation: landscape\) and \(min-height: 501px\) and \(max-width: 799px\) \{\n  #screen-game\[data-learn="1"\]\[data-goal\] \{\n    --learn-extra: 48px;/.test(EDU_CSS), 'M3-B 보드 식과 같은 미디어 쿼리');
  assert.ok(EDU_CSS.indexOf(marker) > EDU_CSS.indexOf('(spec §27.7·§27.8, M3-B)'), 'M3-B 블록 뒤(같은 우선순위에서 나중 규칙이 이긴다)');
  // 감소 모션: 학습 칩 전환·번짐은 기존 규칙, 정령 쪽은 style.css 의 정령 블록이 이미 끈다
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\n  \.learn-chip\.pop \{ animation: none; \}/.test(EDU_CSS));
  assert.ok(/@media screen and \(prefers-reduced-motion: reduce\) \{\n  \.sp-zz \{ animation: none; \}\n  \.sp-art\.pulse::after \{ animation: none; \}\n  \.sp-img \{ transition: none; \}\n\}/.test(CSS));
  // 붉은 점멸·흔들림 없음 (style.css 정령 블록은 일반용 시험이 자세히 검사한다)
  assert.ok(!/#f00\b|#ff0000|red/i.test(code));
});

test('⑨ 문구 점검: SPIRIT_TEXT·SPIRIT_EDU_TEXT 전체(정령 6종 × k × 특별 여부), 교육용 [EDU] 구간의 한글 문자열, 새 마크업에 §27.6.2 피하는 말과 "쉬어가기"가 없고 쉬운 말이다', () => {
  const T = G.SPIRIT_TEXT; const E = SRC.indexOf('const SPIRIT_EDU_TEXT') > 0;
  assert.ok(E, 'SPIRIT_EDU_TEXT 가 소스에 있다');
  // SPIRIT_EDU_TEXT 는 내보내지 않으므로 소스 구간의 한글 문자열 리터럴로 검사한다
  const a = SRC.indexOf('const SPIRIT_EDU_TEXT'); const b = SRC.indexOf('/** updateSpirit 의 교육용 분기');
  const c = b; const d = SRC.indexOf('  /**\n   * 이번 리필의 새 칸 count개 종류.');
  assert.ok(a > 0 && b > a && d > c, '소스 구간');
  const koreanStrings = (code) => {
    const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    return (body.match(/'[^'\n]*[가-힣][^'\n]*'/g) || []).concat(body.match(/"[^"\n]*[가-힣][^"\n]*"/g) || []);
  };
  const strings = koreanStrings(SRC.slice(a, d));
  assert.ok(strings.length >= 9, '문자열 ' + strings.length);
  // 학습 칩·설명판·규칙 줄에서 정령 레벨에 쓰는 문구 전부
  const phrases = ['정령에게 선물 드리기', '정령에게 선물 드리기를 끝냈어요', '이 거의 깨어났어요', '거의 다 깨어났어요! 선물상자 문제를 마저 풀어 줘요', '목표 점수에 닿았어요! 선물상자 문제를 마저 풀어 줘요'];
  phrases.forEach((p) => assert.ok(strings.join('\n').indexOf(p) !== -1, '문구 없음: ' + p));
  strings.forEach((s) => noAvoid(s, 'SPIRIT_EDU_TEXT'));
  // 일반용 문구(SPIRIT_TEXT)도 정령 6종 × k × 특별 여부에서 모두 나오고 금지어가 없다
  const all = [];
  DIFFS.forEach((dd) => [5, 10].forEach((n) => {
    const sp = G.spiritOf(dd, n);
    all.push(T.pending(sp), T.done(sp), T.endClear(sp));
    for (let k = 0; k <= sp.steps; k++) {
      [true, false].forEach((special) => all.push(T.panel(sp, k, special)));
      all.push(T.title(sp, k), T.count(sp, k), T.scoreNote(sp, k), T.endFail(sp, k));
      if (k >= 1) all.push(T.step(sp, k));
    }
    all.push('정령에게 선물상자 문제 7개를 드려요', sp.name + '이 거의 깨어났어요', sp.name + '이 거의 깨어났어요, 깨어남 ' + sp.steps + '/' + sp.steps);
  }));
  all.forEach((s) => noAvoid(s, 'SPIRIT_TEXT'));
  // 소스·마크업·CSS 어디에도 "쉬어가" 가 없다(기존 시험과 같은 규칙)
  assert.ok(SRC.indexOf('쉬어가') === -1 && HTML.indexOf('쉬어가') === -1 && CSS.indexOf('쉬어가') === -1);
  // 초보 레벨의 정령 문구(교육용 새 문구 포함)에는 미션·특별 말이 없다
  const easy = G.spiritOf('easy', 5);
  ['이 거의 깨어났어요', '거의 다 깨어났어요! 선물상자 문제를 마저 풀어 줘요', '목표 점수에 닿았어요! 선물상자 문제를 마저 풀어 줘요'].forEach((p) => assert.ok(!/미션|특별|쉬어가/.test(p)));
  assert.ok(!/미션|특별/.test(T.title(easy, 3) + T.scoreNote(easy, 3) + T.panel(easy, 3, false)));
});

test('⑩ 새 에셋 파일 0개: assets/ 의 파일 목록이 M4-B 시작 시점과 같다(이미지·음원·글꼴 없음), edu-data 도 그대로', { skip: (() => { try { cp.execFileSync('git', ['cat-file', '-e', BASE_COMMIT + ':apps/element-gems-edu/game.js'], { cwd: REPO, stdio: 'ignore' }); return false; } catch (e) { return 'git 커밋 ' + BASE_COMMIT + ' 없음'; } })() }, () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(root, path.join(dir, e.name))]));
  ['assets', 'edu-data'].forEach((d) => {
    const now = walk(path.join(root, d)).sort();
    const before = cp.execFileSync('git', ['ls-tree', '-r', '--name-only', BASE_COMMIT, 'apps/element-gems-edu/' + d], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean).map((p) => p.replace('apps/element-gems-edu/', '')).sort();
    assert.ok(before.length > 0, d);
    assert.deepStrictEqual(now, before, d + ' 파일 목록이 변경 전과 같다');
  });
  assert.ok(!/@font-face|https?:\/\//.test(EDU_CSS.slice(EDU_CSS.indexOf('정령 특별 레벨 × 학습 칩 (spec §27.6·§27.8, M4-B)'))), '새 CSS 에 글꼴·외부 주소 없음');
});

/* ===================================================================
 * 10) 규칙 불변 증명: 같은 시드 봇 판 — M4-B 시작 시점의 교육용 game.js 와 지금 game.js 를 나란히 돌린다
 * =================================================================== */
function baselineSource() {
  try {
    if (process.env.EG_BASELINE_EDU_GAME_JS) return fs.readFileSync(process.env.EG_BASELINE_EDU_GAME_JS, 'utf8');
  } catch (e) { return null; }
  try {
    return cp.execFileSync('git', ['show', BASE_COMMIT + ':apps/element-gems-edu/game.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { return null; }
}
const BASE_SRC = baselineSource();
/* spec §44(2026-11-11): 별 기준이 난이도별로 바뀌었다(고수 ★★ 15%·★★★ 30%). ⑪은 "별 기준 말고는 규칙이 같다"를 증명하므로,
 *  같은 시드 봇 판을 돌릴 기준 소스에도 같은 별 기준 변경(CONFIG.stages.starBy·starRatioOf·starsFor·leftFloorForStars·호출 두 곳)을 입혀 나란히 돌린다(규칙 함수·단언은 그대로).
 *  입히는 본문은 지금 소스에서 가져온다 — 새 별 본문 자체는 아래 소스 수준 시험과 game.test.js 가 따로 고정한다. 바꿀 자리가 기준 소스에 정확히 한 곳씩 없으면 즉시 실패한다. */
function withStar44(src) {
  let out = src;
  const swap = (from, to) => { assert.strictEqual(out.split(from).length, 2, '기준 소스에 정확히 한 곳이어야 한다: ' + from.slice(0, 60)); out = out.replace(from, () => to); };
  const starBy = SRC.split('\n').find((l) => /^\s*starBy:/.test(l));
  const star = out.split('\n').find((l) => /^\s*star: \[0\.3, 0\.5\],/.test(l));
  assert.ok(starBy && star, 'starBy / star 줄');
  swap(star, star + '\n' + starBy);
  swap(bodyOf(out, 'function starsFor('), bodyOf(SRC, 'function starRatioOf(') + '\n\n  ' + bodyOf(SRC, 'function starsFor('));
  swap(bodyOf(out, 'function leftFloorForStars('), bodyOf(SRC, 'function leftFloorForStars('));
  swap('starsFor(left, state.startTime)', 'starsFor(left, state.startTime, lv)');
  swap('starsFor(left, startTimeOf(k))', 'starsFor(left, startTimeOf(k), k)');
  return out;
}
const BASE_SCRIPT = BASE_SRC ? compile(withStar44(BASE_SRC), HOOK_OLD, 'edu/game.js@' + BASE_COMMIT + '+§44') : null;
const skipBase = BASE_SRC ? false : 'M4-B 시작 시점의 교육용 game.js 를 구하지 못해 건너뜀(git 커밋 ' + BASE_COMMIT + ' 또는 EG_BASELINE_EDU_GAME_JS 필요)';

/** 결정적인 봇 한 판. 각 행동 뒤의 (점수·미션 카운터·남은 시간·클리어 판정·phase·콤보·통계·학습 카운터·state.edu)와 끝난 뒤의 결과 문구·저장 기록·난수 사용 횟수를 돌려준다 */
async function playBot(env, lv, stage, seed, maxActions) {
  const I = env.I; const S = I.state;
  I.save.level = lv; I.save.progress[lv] = 9;
  I.startStage(stage);
  await env.runUntil(() => S.phase === 'playing', 30000);
  const brain = mulberry(seed * 977 + 7);
  const trace = [];
  const eduSnap = () => JSON.stringify([S.edu.asked, S.edu.right, S.edu.bonus, S.edu.since, S.edu.firstDone, S.edu.skipped, S.edu.mode, S.edu.learn && S.edu.learn.need]);
  const snap = () => [S.score, S.mission ? S.mission.parts.map((p) => (p.each ? p.each.join('/') : p.n) + (p.done ? '!' : '')).join(',') + '@' + S.mission.cur : '-', Math.round(S.timeLeft * 1e6) / 1e6, I.stageDone(), I.learnMet(), S.phase, S.combo, S.stats.matches, S.stats.maxChain, S.stats.skills, S.target, eduSnap()].join('|');
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
  return {
    trace, phase: S.phase, now: env._now, score: S.score, timeLeft: Math.round(S.timeLeft * 1e6) / 1e6,
    end: S.phase === 'over' ? [env.el('end-title').textContent, env.el('end-score').textContent, env.el('end-target').textContent, env.el('end-stars').textContent, env.el('end-stars').hidden, env.el('end-unlock').textContent, env.el('end-best').textContent, env.el('end-combo').textContent, env.el('end-quiz').textContent, env.el('btn-next').hidden].join('|') : null,
    save: JSON.stringify(I.save), stored: env.store['element-gems-edu:v1'] || null, rnd: env.rnd, asks: env.quiz ? env.quiz.asks : 0, edu: eduSnap()
  };
}
/** 시험 도구: 빨리 끝나는 판(작은 목표·작은 미션)도 함께 돌려 클리어·단계 이동·결과 화면까지 규칙 증명에 넣는다(보통 표와 많이 표 모두) */
function easyCfg(cfg) {
  const shrink = (m, div) => m.map((def) => ({ seq: def.seq, parts: def.parts.map((p) => Object.assign({}, p, { need: p.k === 'chain' || p.k === 'big' ? Math.max(1, Math.ceil(p.need / div)) : Math.max(2, Math.ceil(p.need / 3)) })) }));
  cfg.stages.targets.easy = cfg.stages.targets.easy.map((t) => Math.round(t / 6));
  cfg.edu.many.easyTargets = cfg.edu.many.easyTargets.map((t) => Math.round(t / 6));
  cfg.stages.missions.normal = shrink(cfg.stages.missions.normal, 4);
  cfg.stages.missions.hard = shrink(cfg.stages.missions.hard, 3);
  cfg.edu.many.missions.normal = shrink(cfg.edu.many.missions.normal, 4);
  cfg.edu.many.missions.hard = shrink(cfg.edu.many.missions.hard, 3);
  cfg.edu.many.wild.spawn = 0.06;      // 문제가 자주 나오게(학습 조건이 실제로 판을 끝내는 길이 되게)
}
const SEEDS = 10;
/* spec §43·§45(2026-11-11): 중수·고수 미션 표가 M4-B 시작 시점(§36 표·M3-CAL 많이 표)에서 지금 표(보통 = 일반용 §43 표, 많이 = §45 2차 재보정 표)로 교체됐다.
 *  이 시험은 "같은 표 위에서 규칙이 같다"를 증명하므로, 기준 소스(옛 표)의 CONFIG.stages.missions·CONFIG.edu.many.missions 에도 지금 표를 그대로 덮어씌워 나란히 돌린다(규칙 함수·단언은 그대로, 표만 같게 맞춘다). */
const withCurrentTables = (cfg) => (C, env) => {
  C.stages.missions = JSON.parse(JSON.stringify(G.CONFIG.stages.missions));
  C.edu.many.missions = JSON.parse(JSON.stringify(G.CONFIG.edu.many.missions));
  if (cfg) cfg(C, env);
};
const VARIANTS = [
  { name: '기본 표', cfg: null, stages: [5, 10, 3], reduce: true },
  { name: '쉬운 표(클리어·단계 이동 포함)', cfg: easyCfg, stages: [5, 10, 4], reduce: true },
  { name: '쉬운 표 + 감소 모션 아님(번짐 타이머)', cfg: easyCfg, stages: [5, 10], reduce: false }
];
for (const mode of ['many', 'normal']) {
  for (const variant of VARIANTS) {
    test('⑪ 규칙 불변(' + (mode === 'many' ? '많이' : '보통') + ' 모드 · ' + variant.name + '): 난이도 3 × 레벨 ' + variant.stages.join('·') + ' × 시드 ' + SEEDS + ' — M4-B 시작 시점의 교육용 game.js 와 점수·미션·학습 카운터·state.edu·난수 호출 수·종료 시점·결과 문구·저장이 모두 같다', { skip: skipBase }, async () => {
      let games = 0, actions = 0, cleared = 0, stepsSeen = 0, asked = 0, almostSeen = 0;
      const answer = (rec) => ({ right: rec.index % 3 !== 0, bonus: rec.index % 3 !== 0 ? 900 : 0 });
      for (const lv of DIFFS) {
        for (const stage of variant.stages) {
          for (let seed = 1; seed <= SEEDS; seed++) {
            const a = createEnv(seed * 31 + stage, withCurrentTables(variant.cfg), { script: BASE_SCRIPT, reduce: variant.reduce, quiz: { mode, answer } });
            const b = createEnv(seed * 31 + stage, variant.cfg, { script: SCRIPT, reduce: variant.reduce, quiz: { mode, answer } });
            const ra = await playBot(a, lv, stage, seed, 100);
            const rb = await playBot(b, lv, stage, seed, 100);
            const tag = mode + ' ' + lv + ' 레벨 ' + stage + ' 시드 ' + seed;
            assert.deepStrictEqual(rb.trace, ra.trace, tag + ': 행동별 (점수·카운터·시간·클리어 판정·phase·학습·state.edu)');
            assert.strictEqual(rb.phase, ra.phase, tag + ' 종료 phase');
            assert.strictEqual(rb.now, ra.now, tag + ' 종료 시점(가상 시계)');
            assert.strictEqual(rb.score, ra.score, tag + ' 점수');
            assert.strictEqual(rb.timeLeft, ra.timeLeft, tag + ' 남은 시간');
            assert.strictEqual(rb.end, ra.end, tag + ' 결과 문구');
            // spec §46: 지금 소스의 저장에는 최고점 도전 기록 필드(challenge)가 하나 더 있다(M4-B 시작 시점 소스에는 없다). 스테이지 판은 그 필드를 건드리지 않으므로 그 한 필드만 빼고 나머지가 글자 그대로 같아야 한다(일반용 spirit.test.js 와 같은 방식)
            const noChal = (str) => (str == null ? str : str.replace(/,"challenge":\{[^}]*\}/, ''));
            assert.strictEqual(noChal(rb.save), ra.save, tag + ' 저장 객체');
            assert.strictEqual(noChal(rb.stored), ra.stored, tag + ' localStorage 저장 문자열');
            assert.strictEqual(rb.rnd, ra.rnd, tag + ' 난수 사용 횟수(화면 코드는 난수를 쓰지 않는다)');
            assert.strictEqual(rb.asks, ra.asks, tag + ' 문제 수');
            assert.strictEqual(rb.edu, ra.edu, tag + ' state.edu');
            assert.deepStrictEqual(a.errors, []); assert.deepStrictEqual(b.errors, []);
            // 정령 쪽 부수 확인: 특별 레벨이면 k 는 규칙 결과와 맞고, 아니면 정령 상태가 없다
            const sp = G.spiritOf(lv, stage);
            const S = b.I.state;
            if (sp) {
              assert.strictEqual(S.spirit.k, Math.max(0, Math.min(sp.steps, G.spiritStep(sp, S.score, S.target, S.mission))), tag + ' 마지막 k 가 규칙 결과(점수·미션)와 맞다 ' + JSON.stringify([S.phase, S.score, S.target, S.timeLeft, S.spirit.almost, S.edu.learn, S.edu.asked, S.locked, S.quizActive]));
              if (S.phase === 'over' && b.X.goalMet() && S.edu.learn === null) assert.strictEqual(S.spirit.k, sp.steps);
              if (S.spirit.almost) almostSeen++;
              stepsSeen += S.spirit.k;
            } else assert.strictEqual(S.spirit, null);
            if (rb.end && /STAGE CLEAR/.test(rb.end)) cleared++;
            asked += rb.asks;
            games++; actions += rb.trace.length;
            a.dispose(); b.dispose();
          }
        }
      }
      assert.strictEqual(games, DIFFS.length * variant.stages.length * SEEDS);
      assert.ok(actions > games * 5, '봇이 실제로 여러 행동을 했다: ' + actions);
      if (variant.cfg) assert.ok(cleared > 0 && stepsSeen > 0, '클리어·단계 진행이 한 번도 없었다면 증명이 약하다: cleared=' + cleared + ' steps=' + stepsSeen);
      if (mode === 'many') assert.ok(asked > games, '많이 모드에서 문제가 실제로 나왔다: ' + asked);
    });
  }
}

test('⑪ 규칙 불변(소스 수준): 규칙 함수·점수·판정·별 계산·학습 조건 줄이 M4-B 시작 시점과 글자 그대로 같다', { skip: skipBase }, () => {
  ['function awardGroup(', 'async function cascade(', 'async function removeSkillCells(', 'function awardSkillBonus(', 'function goalMet(', 'function stageTarget(', 'function missionUpdate(', 'function missionCount(', 'function missionDone(',
    'function missionProgress(', 'function isCleared(', 'function applyStageResult(', 'function leftFromTime(', 'function startTimeOf(', 'function addScore(', 'function touchCombo(', 'function baseScore(', 'function comboMult(', 'function waveMult(', 'function skillPoints(', 'function timeBonusFor(',
    'function pickRefillTypes(', 'function planRefill(', 'function planRefillTypes(', 'function learnNeed(', 'function learnMet(', 'function learnShortfall(', 'function stageDone(', 'function startEduMode(', 'function guardGapOf(', 'function missionDef(', 'async function runQuizzes(', 'function wildCapOf(', 'function resolveEduMode('].forEach((h) => {
    const a = SRC.indexOf(h) >= 0 ? bodyOf(SRC, h) : null;
    const b = BASE_SRC.indexOf(h) >= 0 ? bodyOf(BASE_SRC, h) : null;
    assert.strictEqual(a, b, h + ' 본문이 변경 전과 같다');
  });
  ['const cleared = stageDone();', 'if (stageDone() || state.timeUp) finishStage();'].forEach((l) => assert.ok(SRC.indexOf(l) !== -1 && BASE_SRC.indexOf(l) !== -1, l));
  // spec §44(2026-11-11): `function starsFor(` 본문과 판 종료의 별 호출 줄은 고수 별 기준 때문에 의도적으로 바뀌었다. 옛 본문과 비교하지 않고 새 본문·새 줄을 글자 그대로 고정한다.
  assert.strictEqual(bodyOf(SRC, 'function starsFor('), [
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
  // runAction: 정령 줄 하나만 더해졌다
  const ra = bodyOf(SRC, 'async function runAction(').split('\n').filter((l) => !/updateSpirit\(\)/.test(l)).join('\n');
  assert.strictEqual(ra, bodyOf(BASE_SRC, 'async function runAction('), 'runAction 은 정령 줄 하나를 더한 것 외에 같다');
  // 학습 칩 HUD: 이름·낭독 문구만 SPIRIT_EDU_TEXT 로 바뀌었다(진행·판정 줄은 같다)
  const lh = bodyOf(SRC, 'function updateLearnHud(').replace(/SPIRIT_EDU_TEXT\.learnName\(state\.spirit\) \+ ' '/g, "'선물상자 문제 풀기 '").replace(/SPIRIT_EDU_TEXT\.learnDone\(state\.spirit\)/g, 'LEARN_DONE_TEXT');
  assert.strictEqual(lh.replace(/\s*\/\/[^\n]*/g, ''), bodyOf(BASE_SRC, 'function updateLearnHud(').replace(/\s*\/\/[^\n]*/g, ''), 'updateLearnHud 는 이름 두 곳만 바뀌었다');
});
