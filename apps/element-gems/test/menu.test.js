/* 메뉴 V1 "풍경 속 타이틀" 시험 — spec §32.4.1·§32.8·§32.9 U-A(시작·루트 선택·프로필·명예의 전당), 승인 기록 §34.
 * 실행: node --test apps/element-gems/test/*.test.js
 *
 * ① 격리(새 CSS 의 모든 선택자가 .menu-screen · #overlay-profile-ask · :has(.menu-screen…) 접두어, 게임 선택자 없음, 키프레임 이름 mn*)
 * ② border-radius 토큰 스케일 ③ 외부 주소·backdrop-filter·blur·@font-face 0 ④ 두 앱 style.css 바이트 동일 ⑤ 감소 모션·무한 애니메이션 ≤ 3
 * ⑥ 시작 화면 마크업(기존 id·탭 순서 보존, ? 게임 방법 칩의 aria-expanded·접힘 동작(가짜 DOM), 보석 친구 aria-hidden)
 * ⑦ 루트 index.html(새 블록, 선생님 안내·직접 주소 없음) ⑧ 새 에셋 파일 0개·읽기 전용 파일 불변 ⑨ 게임 화면 가드
 * ⑩ 문구에 피하는 말·"쉬어가기" 없음. 터치 대상 44px·시상대 선택자·화면 구역 표식도 정적으로 확인한다.
 * U-B(레벨 선택 카드 스킨 · 폰 세로·낮은 화면 마무리, spec §32.5·§32.9) 시험은 파일 아래쪽 "U-B" 구간: 블록 격리·금지 항목 0·상태 4종 모양·감소 모션·쉬어가기 없음·마크업 계약·크기·대비·폰 규칙·설명판 출렁임 없음.
 * 파일·저장소 상태는 건드리지 않는다(가짜 DOM 은 vm 샌드박스). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const CSS = read(path.join(root, 'style.css'));
const HTML = read(path.join(root, 'index.html'));
const ROOT_HTML = read(path.join(repo, 'index.html'));
const MARK = '/* 메뉴 V1 (spec §32, U-A) */';
const idx = CSS.indexOf(MARK);
const BLOCK = idx >= 0 ? CSS.slice(idx) : '';
const BASE_COMMIT = '41a5b53';          // U-A 시작 시점(M4 푸시 직후)의 git 커밋
const MENU_COMMIT = 'd6f798c';          // 메뉴 V1 구현 커밋. "U-A 시작 시점과 같다"는 시험은 이 커밋까지만 비교한다(그 뒤의 규칙·문제·에셋 변경은 다른 작업이라 작업 트리를 묶어 두지 않는다)

/** CSS 한 블록(주석 제외)의 규칙 목록: { at: 감싸는 @규칙 또는 '', sel: 선택자, body: 선언, keyframes } */
function rulesOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const walk = (s, at) => {
    let p = 0;
    while (p < s.length) {
      const open = s.indexOf('{', p);
      if (open < 0) break;
      const head = s.slice(p, open).trim();
      let depth = 1; let q = open + 1;
      while (q < s.length && depth) { if (s[q] === '{') depth++; else if (s[q] === '}') depth--; q++; }
      const inner = s.slice(open + 1, q - 1);
      if (/^@media/.test(head)) walk(inner, head);
      else if (/^@keyframes/.test(head)) out.push({ at: '', sel: head, body: inner, keyframes: true });
      else out.push({ at: at, sel: head, body: inner.trim() });
      p = q;
    }
  };
  walk(text, '');
  return out;
}
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES = rulesOf(BLOCK);
const plain = RULES.filter((r) => !r.keyframes);

/* 게임 화면 가드: 이 두 줄만 선택자 안에 #screen-game 이 있다(게임 화면이 보일 때 배경 카메라·햇살·잎을 원래대로 돌리는 규칙) */
const GUARD_SELECTORS = ['html:has(#screen-game:not([hidden]))::before', '#app:has(#screen-game:not([hidden]))::before, #app:has(#screen-game:not([hidden]))::after'];
const ALLOWED = /^(\.menu-screen(?![a-z-])|#overlay-profile-ask(?![a-z-])|html:has\(\.menu-screen|body:has\(\.menu-screen|#app:has\(\.menu-screen)/;
const GAME_SEL = /#screen-game|\.gem(?![a-z-])|\.timer(?![a-z-])|\.gauges?(?![a-z-])|\.board(?![a-z-])/;

test('style.css: 메뉴 V1 블록이 파일 맨 끝에 하나 있고, 앞 단계 블록 뒤에 이어 붙는다(기존 규칙은 고치지 않는다)', () => {
  assert.ok(idx > 0 && CSS.indexOf(MARK, idx + 1) === -1, '블록 하나');
  assert.ok(BLOCK.length > 8000, '블록 길이 ' + BLOCK.length);
  assert.ok(CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)') > 0 && CSS.indexOf('정령 특별 레벨 (spec §27.6, M4)') < idx, 'M4 블록 뒤');
  assert.ok(RULES.length > 80, '규칙 수 ' + RULES.length);
  // 앞쪽의 배경 규칙은 그대로(카메라는 새 규칙이 위치만 덮는다)
  assert.ok(CSS.slice(0, idx).includes('url("assets/bg-jungle.webp") center / cover no-repeat'), '기존 html::before 배경 선언 그대로');
});

test('① 격리: 새 규칙의 모든 선택자는 허용 접두어로 시작하고 #screen-game · .gem · .timer · .gauge · .board 를 쓰지 않는다(가드 두 줄만 예외), :root 를 건드리지 않는다', () => {
  assert.ok(!/(^|\n)\s*:root/.test(noComments(BLOCK)), ':root 를 건드리지 않는다');
  assert.ok(!/--board\s*:|--ui-h\s*:|--cell\s*:/.test(noComments(BLOCK)), '보드 크기식을 건드리지 않는다');
  let guards = 0;
  plain.forEach((r) => {
    if (GUARD_SELECTORS.includes(r.sel.replace(/\s+/g, ' '))) { guards++; return; }
    r.sel.split(',').map((x) => x.trim()).forEach((s) => {
      assert.ok(ALLOWED.test(s), '허용되지 않은 접두어: ' + s);
      assert.ok(!GAME_SEL.test(s), '게임 화면 선택자: ' + s);
    });
  });
  assert.strictEqual(guards, 2, '가드 규칙 두 줄');
  RULES.filter((r) => r.keyframes).forEach((r) => assert.ok(/^@keyframes mn[A-Z]/.test(r.sel), '키프레임 이름 격리: ' + r.sel));
});

test('② border-radius 는 토큰 스케일(0 · 12px · 20px · 32px · 999px · 50%)만 쓴다', () => {
  const OK = new Set(['0', '12px', '20px', '32px', '999px', '50%', 'inherit']);
  const decls = [];
  RULES.forEach((r) => { const m = r.body.match(/border-radius:\s*[^;]+;?/g) || []; m.forEach((d) => decls.push(d)); });
  assert.ok(decls.length >= 15, '선언 수 ' + decls.length);
  decls.forEach((d) => d.replace(/border-radius:\s*/, '').replace(/;$/, '').trim().split(/\s+/).forEach((v) => assert.ok(OK.has(v), '스케일 밖: ' + d)));
  // clip-path 모서리(리본 날개)는 border-radius 가 아니다 — 위 검사에 걸리지 않는다
  assert.ok(!/border-radius:\s*\d+px\s*\d+px\s*\d+px/.test(noComments(BLOCK).replace(/border-radius:\s*(0|12px|20px|32px|999px|50%)[^;]*;/g, '')), '대각 모서리 값 없음');
});

test('③ 외부 주소 0 · backdrop-filter 0 · blur( 0 · @font-face 0 · 새 파일을 가리키지 않는다(기존 bg-jungle.webp 한 장만 다시 쓴다)', () => {
  const code = noComments(BLOCK);
  assert.ok(!/https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(code), '외부 주소');
  assert.ok(!/backdrop-filter/.test(code), 'backdrop-filter');
  assert.ok(!/blur\(/.test(code), 'blur(');
  assert.ok(!/@font-face|@import/.test(code), '@font-face · @import');
  const urls = code.match(/url\([^)]*\)/g) || [];
  assert.ok(urls.length >= 1 && urls.every((u) => u === 'url("assets/bg-jungle.webp")'), 'url() 은 기존 배경 그림뿐: ' + urls.join(' '));
  assert.ok(!/\.(png|jpe?g|svg|mp3|wav|woff2?|ttf|otf)\b/i.test(code), '새 파일 종류 없음');
  // filter 는 로고의 부드러운 그림자 한 곳뿐(배경의 큰 filter 는 기존 html::before 한 레이어, 새 레이어에는 쓰지 않는다)
  const filters = code.match(/(^|[;{\s])filter:\s*[^;}]+/g) || [];
  assert.strictEqual(filters.length, 1, 'filter 선언: ' + filters.join(' / '));
  assert.ok(/drop-shadow\(0 8px 10px rgba\(50, 30, 140, \.38\)\)/.test(filters[0]) && /\.menu-screen \.logo \{[^}]*filter: drop-shadow/.test(code), 'drop-shadow 는 로고 한 곳');
  assert.strictEqual((code.match(/drop-shadow/g) || []).length, 1);
});

test('④ 두 앱의 style.css 는 바이트 동일하다', () => {
  const edu = path.join(repo, 'apps', 'element-gems-edu', 'style.css');
  if (!fs.existsSync(edu)) return;
  assert.strictEqual(fs.readFileSync(edu).compare(fs.readFileSync(path.join(root, 'style.css'))), 0);
});

test('⑤ 감소 모션: 새 애니메이션·전환이 모두 none 이 되고, 무한 반복은 새 블록에서 2개(맥박·친구 무리)라 화면당 3개(구름 포함) 이하', () => {
  const rm = RULES.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.at));
  assert.ok(rm.length >= 3 && rm.every((r) => /^@media screen and \(prefers-reduced-motion: reduce\)$/.test(r.at)), '"screen and" 형식(기존 시험이 파일 끝쪽 감소 모션 쿼리를 형식으로 읽는다)');
  const rmText = rm.map((r) => r.sel + '{' + r.body + '}').join('\n');
  const code = noComments(BLOCK);
  const anim = (code.match(/animation:\s*[^;}]+/g) || []);
  assert.ok(anim.length >= 3, '애니메이션 선언 ' + anim.length);
  const names = new Set(anim.filter((a) => !/none/.test(a)).map((a) => a.replace(/animation:\s*/, '').split(/\s+/)[0]));
  assert.deepStrictEqual(Array.from(names).sort(), ['mnFloat', 'mnPulse']);
  assert.ok(/\.menu-screen \.ms-friends\s*\{\s*animation:\s*none;\s*\}/.test(rmText), '친구 무리 애니메이션 끔');
  assert.ok(/\.menu-screen #btn-start\s*\{\s*animation:\s*none;\s*\}/.test(rmText), '[시작] 맥박 끔');
  assert.ok(/html:has\(\.menu-screen:not\(\[hidden\]\)\)::before\s*\{\s*transition:\s*none;\s*\}/.test(rmText), '배경 카메라 전환(.9초) 끔');
  assert.ok(/\.menu-screen \.av-btn\s*\{\s*transition:\s*none;\s*\}/.test(rmText), '그림 고르기 전환 끔');
  // 새 블록의 transition 은 카메라 · 그림 고르기 둘뿐이고 둘 다 위에서 꺼진다
  const trans = (code.match(/transition:\s*[^;}]+/g) || []).filter((t) => !/none/.test(t));
  assert.strictEqual(trans.length, 2, 'transition ' + trans.join(' / '));
  assert.strictEqual((code.match(/infinite/g) || []).length, 2, '무한 반복 2개');
  // 구름(body::after cloudDrift infinite)은 기존 규칙 하나: 시작 화면 무한 애니메이션 = 새 2 + 기존 1 = 3
  assert.strictEqual((CSS.slice(0, idx).match(/cloudDrift [^;]*infinite/g) || []).length, 1);
  // 눌림 때는 [시작] 맥박이 멈춘다(기존 규칙과 같은 동작)
  assert.ok(/\.menu-screen #btn-start:active \{[^}]*animation: none/.test(code));
});

test('⑨ 게임 화면 가드: 배경 카메라·햇살·잎은 메뉴 화면이 보일 때만 켜지고, 게임 화면 규칙은 변경 전 계산값(50% 50%, 0% 0% · content: none)과 같다', () => {
  const code = noComments(BLOCK);
  // 카메라: 화면 종류별 위치 + 전환은 메뉴 화면이 보일 때만
  assert.ok(/html:has\(\.menu-screen\[data-cam="top"\]:not\(\[hidden\]\)\)::before \{ background-position: 50% 12%, 0 0; \}/.test(code), '시작 50% 12%');
  assert.ok(/html:has\(\.menu-screen\[data-cam="mid"\]:not\(\[hidden\]\)\)::before \{ background-position: 50% 52%, 0 0; \}/.test(code), '프로필·순위·단원 50% 52%');
  assert.ok(/html:has\(\.menu-screen\[data-cam="low"\]:not\(\[hidden\]\)\)::before \{ background-position: 50% 78%, 0 0; \}/.test(code), '레벨 선택 50% 78%');
  assert.ok(/html:has\(\.menu-screen:not\(\[hidden\]\)\)::before \{ transition: background-position \.9s ease; \}/.test(code), '.9초 카메라 이동');
  assert.ok(/html:has\(#screen-game:not\(\[hidden\]\)\)::before \{ background-position: 50% 50%, 0% 0%; \}/.test(code), '게임 화면: 원래 위치');
  assert.ok(/#app:has\(#screen-game:not\(\[hidden\]\)\)::before, #app:has\(#screen-game:not\(\[hidden\]\)\)::after \{ content: none; \}/.test(code), '게임 화면: 햇살·잎 상자 없음');
  // 틴트 알파 .38 → .12
  assert.ok(/body:has\(\.menu-screen:not\(\[hidden\]\)\)::before \{[^}]*rgba\(111, 207, 255, \.38\)[^}]*rgba\(255, 200, 230, \.12\)/.test(code), '틴트 알파 .38 → .12');
  // 햇살(정적 원뿔 그라디언트)·잎(같은 그림 120vw): 메뉴 화면이 보일 때만, 눌림을 가로채지 않는다
  const sun = /#app:has\(\.menu-screen:not\(\[hidden\]\)\)::before \{([^}]*)\}/.exec(code);
  const leaf = /#app:has\(\.menu-screen:not\(\[hidden\]\)\)::after \{([^}]*)\}/.exec(code);
  assert.ok(sun && /conic-gradient/.test(sun[1]) && /pointer-events: none/.test(sun[1]) && !/animation/.test(sun[1]), '햇살');
  assert.ok(leaf && /url\("assets\/bg-jungle\.webp"\) 50% 80% \/ 120vw auto no-repeat/.test(leaf[1]) && /pointer-events: none/.test(leaf[1]), '앞쪽 잎');
  // 화면 구역 표식: 시작 · 프로필 · 명예의 전당 · 레벨 선택
  [['screen-start', 'top'], ['screen-stages', 'low'], ['screen-profile', 'mid'], ['screen-hall', 'mid']].forEach(([id, cam]) => {
    const m = new RegExp('<section id="' + id + '" class="([^"]*)" data-cam="' + cam + '"').exec(HTML);
    assert.ok(m && /\bmenu-screen\b/.test(m[1]), id + ' 은 menu-screen · data-cam=' + cam);
  });
  assert.ok(!/<section id="screen-game"[^>]*menu-screen/.test(HTML), '게임 화면에는 menu-screen 이 없다');
  assert.strictEqual((HTML.match(/menu-screen/g) || []).length, 4, 'menu-screen 은 네 화면에만');
});

/* ---------------------------------------------------------------------
 * ⑥ 시작 화면 마크업 · ? 게임 방법 칩
 * ------------------------------------------------------------------- */
const START = HTML.slice(HTML.indexOf('<section id="screen-start"'), HTML.indexOf('<section id="screen-stages"'));
test('⑥ 시작 화면: 기존 id 와 DOM(탭) 순서가 그대로이고, 새 마크업은 ? 게임 방법 칩과 보석 친구뿐이다', () => {
  const ids = ['logo-img', 'title-fallback', 'btn-profile-chip', 'me-note', 'start-clear', 'level-select', 'level-desc', 'btn-start', 'btn-hall', 'btn-howto', 'rule-stage', 'tutorial', 'btn-sound-start', 'btn-cutin-start'];
  let last = -1;
  ids.forEach((id) => {
    const i = START.indexOf('id="' + id + '"');
    assert.ok(i > last, '순서가 바뀜: ' + id);
    last = i;
  });
  // 버튼 id·역할 그대로
  assert.ok(/<button id="btn-start" class="btn primary big" type="button">시작<\/button>/.test(START));
  assert.ok(/role="radiogroup" aria-label="난이도"/.test(START) && (START.match(/role="radio"/g) || []).length === 4, '난이도 세 칸 + 4번째 칸 "최고점 도전 모드"(spec §46.10)');
  assert.deepStrictEqual(Array.from(START.matchAll(/role="radio"[^>]*data-level="(\w+)"/g)).map((m) => m[1]), ['easy', 'normal', 'hard', 'challenge']);
  assert.ok(/<button id="btn-hall" class="btn hall" type="button" hidden>/.test(START) && /<button id="btn-profile-chip" class="me-chip" type="button" hidden>/.test(START));
  // 새 래퍼: 위쪽 칩 묶음 · 난이도+[시작] 묶음 · 게임 방법
  ['sc-top', 'sc-cta', 'howto'].forEach((c) => assert.strictEqual((START.match(new RegExp('class="' + c + '"', 'g')) || []).length, 1, c));
  assert.ok(/class="sc-cta">\s*<div id="level-select"[\s\S]*?id="level-desc"[\s\S]*?id="btn-start"/.test(START), '난이도 · 설명 · [시작] 순서가 한 묶음 안');
  // div 여닫음
  assert.strictEqual((HTML.match(/<div\b/g) || []).length, (HTML.match(/<\/div>/g) || []).length, 'div 여닫음');
});

test('⑥ 보석 친구 6마리: 기존 gems 그림, aria-hidden 컨테이너, alt="" , 탭 대상이 아니다, 새 이미지 파일 없음', () => {
  const fr = /<div class="ms-friends" aria-hidden="true">([\s\S]*?)<\/div>/.exec(START);
  assert.ok(fr, '컨테이너가 aria-hidden');
  const imgs = fr[1].match(/<img [^>]*>/g) || [];
  assert.strictEqual(imgs.length, 6);
  const srcs = imgs.map((t) => /src="([^"]+)"/.exec(t)[1]).sort();
  assert.deepStrictEqual(srcs, ['dark', 'fire', 'grass', 'light', 'lightning', 'water'].map((n) => 'assets/gems/' + n + '.webp'));
  imgs.forEach((t) => { assert.ok(/ alt=""/.test(t) && /draggable="false"/.test(t), t); assert.ok(!/tabindex|<a |<button/.test(t)); });
  srcs.forEach((s) => assert.ok(fs.existsSync(path.join(root, s)), s + ' 파일이 이미 있다'));
});

test('⑥ ? 게임 방법 칩: 버튼 + aria-expanded + aria-controls, 패널은 기본으로 펼쳐져 있고(못 쓰면 펼친 채로), 규칙 문구는 그대로다', () => {
  const m = /<button id="btn-howto" class="howto-btn" type="button" aria-expanded="true" aria-controls="howto-panel">(<i aria-hidden="true">\?<\/i>)게임 방법<\/button>/.exec(START);
  assert.ok(m, '버튼 마크업');
  assert.ok(/<div id="howto-panel" class="howto-panel">/.test(START) && !/<div id="howto-panel"[^>]*hidden/.test(START), '패널은 기본으로 보인다');
  // 규칙 4항목(+ 스테이지 줄)과 처음 안내가 패널 안에 있다
  const panel = START.slice(START.indexOf('id="howto-panel"'), START.indexOf('class="toggles"'));
  ['id="rule-stage"', '<b>스왑</b>', '<b>게이지</b>', '<b>스킬</b>', '<b>콤보</b>', 'id="tutorial"'].forEach((t) => assert.ok(panel.includes(t), t));
  // 첫 방문 표식 키 하나(저장 구조 save 와 무관) · try/catch
  const script = (HTML.match(/<script>([\s\S]*?)<\/script>/g) || []).map((s) => s.replace(/<\/?script>/g, '')).find((s) => s.includes('eg-howto-seen'));
  assert.ok(script, '작은 스크립트');
  assert.strictEqual((script.match(/eg-howto-seen/g) || []).length, 1, '키는 한 곳에서만 정의');
  assert.ok(/try \{[^}]*getItem/.test(script) && /try \{[^}]*setItem/.test(script), '읽기·쓰기 모두 try/catch');
  assert.ok(!/element-gems:v1|save\b/.test(script), '저장 구조(save)와 무관');
  assert.ok(!/https?:\/\//.test(script), '외부 주소 없음');
});

/** index.html 의 ? 게임 방법 스크립트를 가짜 DOM 에서 돌린다 */
function runHowto(opts) {
  const o = opts || {};
  const script = (HTML.match(/<script>([\s\S]*?)<\/script>/g) || []).map((s) => s.replace(/<\/?script>/g, '')).find((s) => s.includes('eg-howto-seen'));
  const data = {};
  if (o.stored !== undefined) data['eg-howto-seen'] = o.stored;
  const calls = { get: 0, set: 0 };
  const ls = {
    getItem(k) { calls.get++; if (o.throwGet) throw new Error('blocked'); return k in data ? data[k] : null; },
    setItem(k, v) { calls.set++; if (o.throwSet) throw new Error('blocked'); data[k] = String(v); }
  };
  const panel = { hidden: false };
  const attrs = { 'aria-expanded': 'true' };
  const listeners = {};
  const btn = { setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; }, addEventListener(t, f) { listeners[t] = f; } };
  const doc = { getElementById(id) { return id === 'btn-howto' ? btn : id === 'howto-panel' ? panel : null; } };
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { if (o.throwAccess) throw new Error('SecurityError'); return ls; } });
  vm.runInNewContext(script, { document: doc, window: win });
  return { data, calls, panel, attrs, click() { listeners.click(); } };
}

test('⑥ 가짜 DOM: 첫 방문은 펼친 채로 두고 표식을 남기며, 다음 방문은 접히고, 단추로 열고 닫으면 aria-expanded 가 따라간다', () => {
  const first = runHowto({});
  assert.strictEqual(first.panel.hidden, false);
  assert.strictEqual(first.attrs['aria-expanded'], 'true');
  assert.strictEqual(first.data['eg-howto-seen'], '1', '첫 방문 표식');
  first.click(); assert.strictEqual(first.panel.hidden, true); assert.strictEqual(first.attrs['aria-expanded'], 'false');
  first.click(); assert.strictEqual(first.panel.hidden, false); assert.strictEqual(first.attrs['aria-expanded'], 'true');
  const again = runHowto({ stored: '1' });
  assert.strictEqual(again.panel.hidden, true, '다음 방문은 접힘');
  assert.strictEqual(again.attrs['aria-expanded'], 'false');
  assert.strictEqual(again.calls.set, 0, '이미 본 사람에게 다시 쓰지 않는다');
  again.click(); assert.strictEqual(again.panel.hidden, false); assert.strictEqual(again.attrs['aria-expanded'], 'true');
  again.click(); assert.strictEqual(again.panel.hidden, true); assert.strictEqual(again.attrs['aria-expanded'], 'false');
  // 이상한 저장값은 첫 방문으로 본다
  assert.strictEqual(runHowto({ stored: 'x' }).panel.hidden, false);
});

test('⑥ 가짜 DOM: 저장소를 못 써도(읽기·쓰기·접근 모두) 오류 없이 펼친 채로 두고 단추는 동작한다', () => {
  [{ throwGet: true }, { throwSet: true }, { throwGet: true, throwSet: true }, { throwAccess: true }].forEach((o) => {
    const r = runHowto(o);
    assert.strictEqual(r.panel.hidden, false, JSON.stringify(o));
    assert.strictEqual(r.attrs['aria-expanded'], 'true');
    r.click(); assert.strictEqual(r.panel.hidden, true); assert.strictEqual(r.attrs['aria-expanded'], 'false');
  });
  // 요소가 없으면(다른 화면 구성) 조용히 끝난다
  const script = (HTML.match(/<script>([\s\S]*?)<\/script>/g) || []).map((s) => s.replace(/<\/?script>/g, '')).find((s) => s.includes('eg-howto-seen'));
  vm.runInNewContext(script, { document: { getElementById() { return null; } }, window: {} });
});

/* ---------------------------------------------------------------------
 * 프로필 · 명예의 전당 · 터치 대상
 * ------------------------------------------------------------------- */
test('프로필·명예의 전당: 리본 제목 클래스만 더해졌고 순위표 마크업·ranking-ui.js 는 그대로다(시상대는 CSS 로만)', () => {
  assert.ok(/<h2 id="pf-title" class="hf-title mn-ribbon" tabindex="-1">/.test(HTML) && /<h2 id="hall-title" class="hf-title mn-ribbon" tabindex="-1">/.test(HTML));
  assert.ok(/<ol id="hall-list" class="hf-list" aria-label="별 챔피언 순위 상위 50명" tabindex="0" hidden><\/ol>/.test(HTML), '순위 목록 마크업 그대로');
  // 시상대: 위 3칸이 2 · 1 · 3 순서의 세 카드, 4위 이하는 2열
  assert.ok(/\.hf-list > \.hr:nth-child\(1\) \{ grid-column: 3 \/ span 2;/.test(BLOCK), '1등은 가운데');
  assert.ok(/\.hf-list > \.hr:nth-child\(2\) \{ grid-column: 1 \/ span 2;/.test(BLOCK), '2등은 왼쪽');
  assert.ok(/\.hf-list > \.hr:nth-child\(3\) \{ grid-column: 5 \/ span 2;/.test(BLOCK), '3등은 오른쪽');
  assert.ok(/\.hf-list > \.hr \{ grid-column: span 3;/.test(BLOCK), '4위 이하 2열');
  assert.ok(/content-visibility: visible/.test(BLOCK), '시상대 카드는 content-visibility 를 visible 로');
  assert.ok(/nth-child\(1\) img, [^{]*nth-child\(1\) \.av-fb \{ width: 100px; height: 100px;/.test(BLOCK), '1등 그림 100px');
  assert.ok(/nth-child\(1\) \.sc \{ font-size: 1\.9rem; \}/.test(BLOCK), '1등 점수 1.9rem');
  // 그림 고르기: 동그란 스티커 + 고른 그림은 금빛 링 + 1.14배
  assert.ok(/\.menu-screen \.av-btn \{[^}]*border-radius: 50%/.test(BLOCK) && /\[aria-checked="true"\] \{[^}]*transform: scale\(1\.14\)/.test(BLOCK));
  assert.ok(/\[aria-checked="true"\]::after \{[^}]*background: var\(--mn-gold\)/.test(BLOCK), '✓ 표시는 그대로(색 외 단서)');
});

test('터치 대상: 새로 만든 칩·단추는 44px 이상(주요 단추 [시작]은 99px)이고, 글자는 11px 이상이다', () => {
  const code = noComments(BLOCK);
  const minH = (sel) => { const m = new RegExp(sel.replace(/[.#[\]()]/g, '\\$&') + ' \\{[^}]*min-height:\\s*(\\d+)px').exec(code); assert.ok(m, sel); return +m[1]; };
  assert.ok(minH('.menu-screen .howto-btn') >= 44);
  assert.ok(minH('.menu-screen .me-chip') >= 44);
  assert.ok(minH('.menu-screen .toggles .btn') >= 44);
  assert.ok(minH('.menu-screen .level-btn') >= 44);
  assert.ok(minH('.menu-screen #btn-start') >= 99, '[시작] 495×99');
  assert.ok(/\.menu-screen #btn-start \{[^}]*font-size: 43px;[^}]*-webkit-text-stroke: 7px var\(--mn-cta-edge\)/.test(code), '글자 43px · 외곽선 7px');
  assert.ok(/--mn-cta-edge: #8a3d00/.test(code) && /--mn-ribbon-a: #6f57f7; --mn-ribbon-b: #5b3df5/.test(code), '토큰 값');
  assert.ok(/width: min\(495px, 100%\)/.test(code), '[시작] 폭 495px 기준');
  assert.ok(/width: min\(58vw, 700px, calc\(var\(--vh100\) \* \.56 \* 1\.4876\)\)/.test(code), '로고 폭: 화면 폭의 58%(684px 기준) · 높이로 상한');
  (code.match(/font-size:\s*[^;]+;/g) || []).forEach((d) => {
    const m = d.match(/(\d*\.?\d+)(rem|px)/);
    const px = m ? (m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1])) : 99;
    assert.ok(px >= 11, '글자 11px 이상: ' + d);
  });
});

/* ---------------------------------------------------------------------
 * ⑦ 루트 index.html
 * ------------------------------------------------------------------- */
test('⑦ 루트 index.html: 새 블록이 하나, 규칙은 이 화면의 .mode 접두어(또는 html:has(.mode)), 선생님 안내·직접 주소 글이 없다', () => {
  const mk = '/* 메뉴 V1 (spec §32, U-A): 루트 선택 화면';
  const i = ROOT_HTML.indexOf(mk);
  assert.ok(i > 0 && ROOT_HTML.indexOf(mk, i + 1) === -1, '블록 하나');
  const block = ROOT_HTML.slice(i, ROOT_HTML.indexOf('</style>'));
  const rules = rulesOf(block);
  assert.ok(rules.length > 20);
  rules.forEach((r) => { if (r.keyframes) return; r.sel.split(',').map((x) => x.trim()).forEach((s) => assert.ok(/^(\.mode(?![a-z-])|html:has\(\.mode\))/.test(s), '허용되지 않은 접두어: ' + s)); });
  // 토큰 스케일 · 외부 주소 · 금지 요소
  const code = noComments(block);
  const OK = new Set(['0', '12px', '20px', '32px', '999px', '50%']);
  (code.match(/border-radius:\s*[^;]+;/g) || []).forEach((d) => d.replace(/border-radius:\s*/, '').replace(/;$/, '').trim().split(/\s+/).forEach((v) => assert.ok(OK.has(v), d)));
  assert.ok(!/https?:\/\/|backdrop-filter|blur\(|@font-face/.test(code));
  assert.ok((code.match(/url\([^)]*\)/g) || []).every((u) => u === 'url("apps/element-gems/assets/bg-jungle.webp")'), '기존 배경 그림만');
  assert.ok(/html:has\(\.mode\)::before \{ background-position: 50% 12%, 0 0; \}/.test(code), '카메라 50% 12%');
  assert.ok(/min-height: 276px/.test(code), '입구 카드 높이 276px');
  assert.ok(/\.mode \.mode-btn\.edu \{ transform: rotate\(-1\.2deg\); \}/.test(code) && /\.mode \.mode-btn\.gen \{ transform: rotate\(1\.2deg\); \}/.test(code), '입구 카드 ±1.2° 기울임');
  assert.ok(/@media screen and \(prefers-reduced-motion: reduce\)/.test(code) && !/animation|infinite/.test(code), '새 움직임 없음(정적)');
  // 보이는 글에 선생님 안내·직접 주소가 없다(CLAUDE.md)
  const visible = ROOT_HTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/선생님|교사|github\.io|https?:\/\//.test(visible), '보이는 글에 선생님 안내·직접 주소 없음');
  assert.ok(!/https?:\/\/[^"' )]*github\.io/.test(ROOT_HTML), '주소 문자열 없음');
  // 입구 카드는 그대로 두 장(링크 · 기억 스크립트 그대로)
  assert.strictEqual((ROOT_HTML.match(/class="mode-btn (edu|gen)"/g) || []).length, 2);
  assert.ok(ROOT_HTML.includes('href="apps/element-gems-edu/"') && ROOT_HTML.includes('href="apps/element-gems/"'));
});

/* ---------------------------------------------------------------------
 * ⑧ 새 에셋 파일 0개 · 읽기 전용 파일 불변
 * ------------------------------------------------------------------- */
function gitOut(args) {
  try { return cp.execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; }
}
const HAS_BASE = gitOut(['cat-file', '-t', BASE_COMMIT]) !== null && gitOut(['cat-file', '-t', MENU_COMMIT]) !== null;

test('⑧ 새 에셋 0개: 두 앱 assets/ 의 파일 목록이 U-A 시작 시점과 메뉴 구현 커밋에서 같다(이미지·음원·글꼴 없음)', { skip: HAS_BASE ? false : 'git 기준 커밋 없음' }, () => {
  ['element-gems', 'element-gems-edu'].forEach((app) => {
    const now = gitOut(['ls-tree', '-r', '--name-only', MENU_COMMIT, 'apps/' + app + '/assets']).split('\n').filter(Boolean).map((p) => p.replace('apps/' + app + '/', '')).sort();
    const before = gitOut(['ls-tree', '-r', '--name-only', BASE_COMMIT, 'apps/' + app + '/assets']).split('\n').filter(Boolean).map((p) => p.replace('apps/' + app + '/', '')).sort();
    assert.ok(before.length > 50);
    assert.deepStrictEqual(now, before, app + ' assets 목록');
  });
  // 글꼴 파일은 어디에도 없다
  const fonts = (gitOut(['ls-files', 'apps', 'index.html']) || '').split('\n').filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  assert.deepStrictEqual(fonts, []);
});

test('⑧ 게임 규칙·서버·저장 파일은 U-A 시작 시점과 메뉴 구현 커밋에서 바이트 동일하다(game.js · ranking*.js · nickname.js · nick-words.js · server/**)', { skip: HAS_BASE ? false : 'git 기준 커밋 없음' }, () => {
  const files = ['game.js', 'ranking.js', 'ranking-ui.js', 'nickname.js', 'nick-words.js'];
  files.forEach((f) => {
    const base = gitOut(['show', BASE_COMMIT + ':apps/element-gems/' + f]);
    assert.strictEqual(gitOut(['show', MENU_COMMIT + ':apps/element-gems/' + f]), base, f);
  });
  const changed = gitOut(['diff', '--name-only', BASE_COMMIT, MENU_COMMIT, '--', 'apps/element-gems/server']) || '';
  assert.strictEqual(changed.trim(), '', 'server/** 변경 없음');
});

/* ---------------------------------------------------------------------
 * ⑩ 문구 점검
 * ------------------------------------------------------------------- */
test('⑩ 문구: 새 블록·새 마크업의 글에 피하는 말과 "쉬어가기"가 없다(레벨 선택의 쉬어가기 표시 안 함 — §34)', () => {
  const AVOID = ['보스', '몬스터', '전투', '싸움', '대결', '공격', '때리', '쓰러뜨', '처치', '무찌르', '물리치', '체력', 'HP', '데미지', '피해', '죽다', '죽는', '사망', 'KO', '파괴', '부수', '폭발', '패배', '졌다', '졌어', '쉬어가'];
  const text = [BLOCK, START, ROOT_HTML.slice(ROOT_HTML.indexOf('<body>'))].join('\n');
  AVOID.forEach((w) => assert.ok(text.indexOf(w) === -1, '"' + w + '" 가 있음'));
  assert.ok(CSS.indexOf('쉬어가') === -1 && HTML.indexOf('쉬어가') === -1, 'style.css · index.html 어디에도 쉬어가기 없음');
  // 새 문구는 "게임 방법" 한 줄뿐이고 쉬운 말이다
  assert.ok(START.includes('게임 방법</button>'));
});

/* =====================================================================
 * U-B — 레벨 선택 카드 스킨(U-3) · 폰 세로·낮은 화면·가로 폰 마무리(U-5)  (spec §32.5·§32.9, 승인 기록 §34)
 * 새 CSS 는 style.css 맨 끝, U-A 블록 뒤의 "메뉴 V1 (spec §32, U-B)" 주석으로 시작하는 블록이다. 두 앱 style.css 는 바이트 동일(위 ④ 가 이미 검사).
 * ===================================================================== */
const UB_MARK = '/* 메뉴 V1 (spec §32, U-B) */';
const ubIdx = CSS.indexOf(UB_MARK);
const UB = ubIdx >= 0 ? CSS.slice(ubIdx) : '';
const UB_RULES = rulesOf(UB);
const UB_PLAIN = UB_RULES.filter((r) => !r.keyframes);
const UB_CODE = noComments(UB);
const ubNorm = (s) => s.replace(/\s+/g, ' ').trim();
/** 선택자가 정확히 sel 인 규칙들의 선언을 모은다(at: 감싸는 @규칙을 거르는 정규식, 생략하면 전부) */
const ubBody = (sel, atRe) => UB_PLAIN.filter((r) => r.sel.split(',').map(ubNorm).includes(sel) && (!atRe || atRe.test(r.at))).map((r) => r.body).join(' ');
const ubLum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ubCr = (a, b) => { const x = ubLum(a), y = ubLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const ubHex = (s) => (s.match(/#[0-9a-f]{6}/gi) || []).map((h) => h.toLowerCase());
/** 흰색 알파 a 를 hex 위에 덮은 색 */
const ubOver = (hex, a) => '#' + [1, 3, 5].map((i) => Math.round(255 * a + parseInt(hex.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
const PHONE_AT = /orientation: portrait|max-height: 500px|max-height: 340px|min-height: 501px\) and \(max-width: 799px/;      // 세로 화면 · 가로 폰

test('U-B 블록: U-A 블록 뒤 파일 맨 끝에 하나, 모든 선택자가 .menu-screen 접두어이고 게임 선택자·:root·보드 크기식이 없으며 변수는 레벨 선택 화면 안에서만 선언한다', () => {
  assert.ok(ubIdx > idx && CSS.indexOf(UB_MARK, ubIdx + 1) === -1, 'U-A 블록 뒤에 하나');
  assert.ok(UB.length > 15000 && UB_PLAIN.length > 100, '블록 크기 ' + UB.length + ' / 규칙 ' + UB_PLAIN.length);
  UB_PLAIN.forEach((r) => r.sel.split(',').map((x) => x.trim()).forEach((s) => {
    assert.ok(/^\.menu-screen(?![a-z-])/.test(s), '허용되지 않은 접두어: ' + s);
    assert.ok(!GAME_SEL.test(s), '게임 화면 선택자: ' + s);
  }));
  assert.ok(!/(^|\n)\s*:root/.test(UB_CODE) && !/--board\s*:|--ui-h\s*:|--cell\s*:/.test(UB_CODE), ':root·보드 크기식을 건드리지 않는다');
  UB_PLAIN.forEach((r) => { if (/(^|[;\s])--(st|c)-[a-z]+\s*:/.test(r.body)) r.sel.split(',').forEach((s) => assert.ok(/^\.menu-screen\.stages(?![a-z-])/.test(s.trim()), '변수는 레벨 선택 화면 안에서만: ' + s)); });
});

test('U-B 블록: 외부 주소 · backdrop-filter · blur( · filter · @font-face · url() · 키프레임 · transition · infinite 0, animation 은 none 뿐, border-radius 는 토큰 스케일, content 는 "" 와 "도전!" 뿐, 글자 12px 이상', () => {
  assert.ok(!/https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(UB_CODE), '외부 주소');
  assert.ok(!/backdrop-filter|blur\(|@font-face|@import|url\(|@keyframes/.test(UB_CODE), 'backdrop-filter · blur · 글꼴 · url · 키프레임');
  assert.ok(!/(^|[;{\s])filter\s*:/.test(UB_CODE), 'filter 없음');
  assert.ok(!/(^|[;{\s])transition\s*:/.test(UB_CODE) && !/infinite/.test(UB_CODE), '전환 · 무한 반복 없음');
  (UB_CODE.match(/animation\s*:\s*[^;}]+/g) || []).forEach((a) => assert.ok(/:\s*none$/.test(a.trim()), 'animation 은 none 뿐: ' + a));
  const OK = new Set(['0', '12px', '20px', '32px', '999px', '50%']);
  const radii = UB_CODE.match(/border-radius:\s*[^;}]+/g) || [];
  assert.ok(radii.length >= 20, 'border-radius 선언 ' + radii.length);
  radii.forEach((d) => d.replace(/border-radius:\s*/, '').trim().split(/\s+/).forEach((v) => assert.ok(OK.has(v), '스케일 밖: ' + d)));
  const contents = Array.from(new Set((UB_CODE.match(/(?<![a-z-])content:\s*[^;}]+/g) || []).map((c) => c.replace(/content:\s*/, '').trim())));
  assert.deepStrictEqual(contents.sort(), ['""', '"도전!"'].sort(), 'content 문자열은 빈 것과 "도전!" 뿐: ' + contents.join(' | '));
  // 글자 크기 하한(px): 12px 이상. 번호(.sc-num)만 카드 높이 비례라 큰 값(≥ 18px, 카드 높이 하한 46px 기준)을 요구한다
  const floor = (v, at) => {
    v = v.trim(); let m;
    if ((m = /^(\d*\.?\d+)(px|rem)$/.exec(v))) return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
    if ((m = /^(?:max|clamp)\(\s*(\d*\.?\d+)(px|rem)/.exec(v))) return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
    if ((m = /^calc\(var\(--st-ch\) \* (\d*\.?\d+)\)$/.exec(v))) return parseFloat(m[1]) * (PHONE_AT.test(at) ? 46 : 96);
    return NaN;
  };
  let n = 0;
  UB_PLAIN.forEach((r) => (r.body.match(/(?:^|[;\s])font-size:\s*[^;]+/g) || []).forEach((d) => {
    const v = d.replace(/^[;\s]*font-size:\s*/, ''); n++;
    const f = floor(v, r.at);
    assert.ok(f >= (/\.sc-num/.test(r.sel) ? 18 : 12), '글자 크기: ' + r.sel + ' { ' + d.trim() + ' } → ' + f);
  }));
  assert.ok(n >= 35, '글자 크기 선언 ' + n);
});

test('카드 상태 4종은 색 외에 모양으로도 구분된다: 완료 = ✓ 원(CSS 도형) + 별, 현재 = "도전!" 꼬리표 + 빛 고리, 잠김 = 자물쇠 도형 + "잠김" 글자, 특별 = 굵은 금 테두리 + 보라 안쪽 선 + 모서리 장식', () => {
  const S = '.menu-screen.stages .stage-card';
  const cb = ubBody(S + '.cleared::before', /^$/), ca = ubBody(S + '.cleared::after', /^$/);
  assert.ok(/content: ""/.test(cb) && /border-radius: 50%/.test(cb) && /width: 36px; height: 36px/.test(cb), '완료: 원');
  assert.ok(/border-width: 0 4px 4px 0/.test(ca) && /rotate\(45deg\)/.test(ca) && /border-radius: 0/.test(ca), '완료: 체크 모양');
  const cur = ubBody(S + '.current::before', /^$/), tag = ubBody(S + '.current::after', /^$/);
  assert.ok(/border: 3px solid/.test(cur) && /border-radius: 32px/.test(cur) && /pointer-events: none/.test(cur), '현재: 정적 빛 고리');
  assert.ok(/content: "도전!"/.test(tag) && /background: #c2321f; color: #fff/.test(tag), '현재: "도전!" 꼬리표');
  const lock = ubBody(S + ' .sc-lock::before', /^$/);
  assert.ok(/border-radius: 999px 999px 0 0/.test(lock) && /border-bottom: 0/.test(lock) && /linear-gradient\(currentColor, currentColor\)/.test(lock), '잠김: 자물쇠(고리 + 몸통)');
  assert.ok(!/display:\s*none/.test(ubBody(S + ' .sc-lock', /^$/)), '"잠김" 글자는 그대로 보인다');
  const sp = ubBody(S + '[data-kind="special"]', /^$/);
  assert.ok(/--c-edge: #ffb703/.test(sp) && /--c-inner: inset 0 0 0 3px #5b3df5/.test(sp) && /border-width: 5px/.test(sp), '특별: 금 테두리 5px + 보라 안쪽 선');
  assert.ok((sp.match(/radial-gradient/g) || []).length === 4, '특별: 모서리 장식 4곳');
  // 면 색도 상태마다 다르다(색 + 모양을 함께 쓴다)
  const face = (sel, at) => (/--c-face:\s*([^;]+);/.exec(ubBody(sel, at)) || [])[1];
  const faces = [face(S, /^$/), face(S + '.cleared', /^$/), face(S + '.current', /^$/), face(S + '.locked, ' + S + ':disabled', /^$/) || face(S + '.locked', /^$/)];
  assert.ok(faces.every(Boolean) && new Set(faces).size === 4, '네 면 색이 서로 다르다: ' + faces.join(' / '));
  assert.ok(/\.menu-screen\.stages \.stage-card\.locked, \.menu-screen\.stages \.stage-card:disabled/.test(UB_CODE), '잠김 면 규칙');
});

test('감소 모션: 현재 카드 맥박(기존 stagePulse)은 꺼지고, U-B 는 새 애니메이션·전환·무한 반복이 0이라 레벨 선택 화면의 무한 애니메이션은 구름 + 현재 카드 = 2개(≤ 3)', () => {
  const rm = UB_RULES.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.at));
  assert.ok(rm.length >= 1 && rm.every((r) => /^@media screen and \(prefers-reduced-motion: reduce\)$/.test(r.at)), '"screen and" 형식');
  assert.ok(rm.some((r) => ubNorm(r.sel) === '.menu-screen.stages .stage-card.current' && /animation:\s*none/.test(r.body)), '현재 카드 맥박 끔');
  const before = CSS.slice(0, ubIdx);
  const pulses = (before.match(/[^{}]+\{[^{}]*animation:\s*stagePulse[^{}]*\}/g) || []).map((x) => x.split('{')[0].trim());
  assert.ok(pulses.length >= 1 && pulses.every((s) => /\.stage-card\.current$/.test(s)), 'stagePulse 는 현재 카드에만: ' + pulses.join(' | '));
  assert.strictEqual((before.match(/cloudDrift [^;]*infinite/g) || []).length, 1, '구름 1개');
  // U-B 가 만든 새 규칙은 위 맥박을 건드리지 않고(animation: none 만) 현재 카드 외 요소에 animation 을 달지 않는다
  UB_PLAIN.forEach((r) => { if (/animation\s*:/.test(r.body) && !/prefers-reduced-motion/.test(r.at)) assert.ok(/:active/.test(r.sel) && /animation:\s*none/.test(r.body), '눌림 때 멈춤만: ' + r.sel); });
});

test('쉬어가기(3·6·9)는 화면에 나타나지 않는다: data-kind="rest" 에는 규칙이 없고, "특별" 꼬리표는 미션형 특별 레벨에만, 초보 카드에는 미션 요약·꼬리표가 없다', () => {
  const GAME = read(path.join(root, 'game.js'));
  assert.ok(!/data-kind="rest"|data-kind=rest|\[data-kind\*?=["']?rest/.test(noComments(CSS)), 'CSS 어디에도 rest 규칙이 없다');
  assert.ok(UB.indexOf('쉬어가') === -1 && CSS.indexOf('쉬어가') === -1 && HTML.indexOf('쉬어가') === -1, '"쉬어가기" 글자 없음');
  assert.strictEqual((GAME.match(/sc-tag/g) || []).length, 1, '.sc-tag 는 한 곳에서만 만든다');
  assert.ok(/\(isSpecialMission\(lv, i\) \? '<span class="sc-tag" aria-hidden="true">특별<\/span>' : ''\)/.test(GAME), '"특별" 태그는 미션형 특별 레벨에만, 낭독에서 제외');
  assert.ok(/if \(kind\) b\.dataset\.kind = kind;/.test(GAME) && /function stageKind\(diff, stage\)[\s\S]*?return 'special'[\s\S]*?return 'rest'/.test(GAME), 'data-kind 는 속성일 뿐');
  assert.ok(/const goalHtml = mdef \? '<span class="sc-mis">' \+ missionCardHtml\(mdef\) \+ '<\/span>' : '<span class="sc-target">'/.test(GAME), '초보(점수형) 카드에는 .sc-mis 가 없다');
});

test('카드·설명판 마크업 계약(§32.5.4)이 그대로다: game.js 가 만드는 클래스·속성, index.html 의 레벨 선택 구역(리본 제목·설명판 묶음), U-B 가 쓰는 .sc-*/.sd-* 클래스는 모두 계약 안에 있다', () => {
  const GAME = read(path.join(root, 'game.js'));
  ["'stage-card' + (open ? '' : ' locked') + (i === prog + 1 ? ' current' : '') + (rec.stars > 0 ? ' cleared' : '')", 'b.dataset.stage = String(i);', 'b.setAttribute(\'aria-label\', stageCardLabel(lv, i, open, rec.stars));',
    '<span class="sc-num">', '<span class="sc-stars" aria-hidden="true">', '<span class="sc-lock">잠김</span>'].forEach((s) => assert.ok(GAME.includes(s), 'game.js: ' + s));
  const ST = HTML.slice(HTML.indexOf('<section id="screen-stages"'), HTML.indexOf('<section id="screen-profile"'));
  assert.ok(/<section id="screen-stages" class="screen stages menu-screen" data-cam="low" hidden>/.test(ST));
  const ids = ['btn-stages-back', 'stages-chip', 'stages-time', 'stages-summary', 'sp-roster', 'sp-roster-art', 'sp-roster-text', 'sp-roster-sr', 'stage-grid', 'stage-detail', 'sd-title', 'sd-tag', 'sd-goal', 'sd-hint', 'sd-time', 'btn-stage-go'];
  let last = -1;
  ids.forEach((id) => { const i = ST.indexOf('id="' + id + '"'); assert.ok(i > last, '순서가 바뀜: ' + id); last = i; });
  assert.ok(/<div class="stages-title mn-ribbon"><i id="stages-chip" class="level-chip lv-normal">중수<\/i> 레벨 선택<\/div>/.test(ST), '리본 제목(클래스만 추가)');
  assert.ok(/<div id="stage-grid" class="stage-grid" role="group" aria-label="레벨 선택"><\/div>/.test(ST), '격자 role=group');
  assert.ok(/<div class="stage-detail" id="stage-detail">\s*<div class="sd-info">\s*<p class="sd-head"><b class="sd-title" id="sd-title"><\/b><i class="sd-tag" id="sd-tag" hidden><\/i><\/p>/.test(ST), '설명판 머리');
  assert.ok(/<button class="btn primary sd-go" id="btn-stage-go" type="button">도전!<\/button>/.test(ST), '[도전!] 단추');
  assert.ok(/aria-hidden="true">/.test(/<span class="sp-roster-art"[^>]*>/.exec(ST)[0]) && /id="sp-roster-text" aria-hidden="true"/.test(ST), '정령 줄의 그림·글은 aria-hidden, 낭독 글은 따로');
  assert.strictEqual((HTML.match(/<div\b/g) || []).length, (HTML.match(/<\/div>/g) || []).length, 'div 여닫음');
  const used = Array.from(new Set((UB_CODE.match(/\.(sc|sd)-[a-z]+/g) || [])));
  const CONTRACT = ['.sc-num', '.sc-target', '.sc-mis', '.sc-stars', '.sc-lock', '.sc-tag', '.sc-top', '.sc-cta', '.sc-brand', '.sc-menu', '.sc-info', '.sd-info', '.sd-head', '.sd-title', '.sd-tag', '.sd-goal', '.sd-hint', '.sd-time', '.sd-go', '.sd-learn'];
  used.forEach((c) => assert.ok(CONTRACT.includes(c), '계약에 없는 클래스: ' + c));
  assert.ok(['.sc-num', '.sc-target', '.sc-mis', '.sc-stars', '.sc-lock', '.sc-tag', '.sd-title', '.sd-goal', '.sd-go'].every((c) => used.includes(c)), '카드·설명판 클래스를 모두 입혔다');
});

test('크기: 카드 약 211×205(1180×820), 번호 약 50px, 카드 면적 합 40% 이상(태블릿·노트북 해상도 포함), 터치 대상 ≥ 44px(카드 높이 하한 46px, [도전!] ≥ 56px)', () => {
  const st = ubBody('.menu-screen.stages', /^$/);
  const gw = /--st-gw:\s*min\((\d+)px,\s*(\d+)vw\)/.exec(st), gap = /--st-gap:\s*(\d+)px/.exec(st), cols = /--st-cols:\s*(\d+)/.exec(st);
  const ch = /--st-ch:\s*clamp\((\d+)px,\s*min\(calc\(var\(--st-cw\) \* ([\d.]+)\),\s*calc\(\(var\(--vh100\) - (\d+)px\) \/ 2\)\),\s*(\d+)px\)/.exec(st);
  assert.ok(gw && gap && cols && ch, '크기 변수');
  const num = /\.stage-card \.sc-num \{[^}]*font-size:\s*calc\(var\(--st-ch\) \* ([\d.]+)\)/.exec(UB_CODE);
  assert.ok(num, '번호 글자 식');
  const size = (W, H) => {
    const g = Math.min(+gw[1], (+gw[2] / 100) * W), cw = (g - 16 - (+cols[1] - 1) * +gap[1]) / +cols[1];      // 16 = 격자 좌우 안쪽 여백(.stage-grid padding 8px × 2)
    const h = Math.min(Math.max(+ch[1], Math.min(cw * +ch[2], (H - +ch[3]) / 2)), +ch[4]);
    return { cw, h, share: (10 * cw * h) / (W * H), num: h * +num[1] };
  };
  const a = size(1180, 820);
  assert.ok(Math.abs(a.cw - 211) < 4 && Math.abs(a.h - 205) < 4, '1180×820 카드 ' + a.cw.toFixed(1) + '×' + a.h.toFixed(1));
  assert.ok(a.num >= 48 && a.num <= 52, '번호 ' + a.num.toFixed(1) + 'px');
  [[1180, 820], [1024, 768], [1280, 800], [1366, 768]].forEach(([W, H]) => assert.ok(size(W, H).share >= 0.4, W + '×' + H + ' 카드 면적 ' + size(W, H).share.toFixed(3)));
  // 낮은 와이드(≤ 700px): 머리를 줄인 식이 따로 있다
  const lowSt = ubBody('.menu-screen.stages', /min-height: 501px\) and \(max-height: 700px\)/);
  const lowCh = /--st-ch:\s*clamp\((\d+)px,\s*min\(calc\(var\(--st-cw\) \* ([\d.]+)\),\s*calc\(\(var\(--vh100\) - (\d+)px\) \/ 2\)\),\s*(\d+)px\)/.exec(lowSt);
  assert.ok(lowCh, '낮은 와이드 식');
  const low = (W, H) => { const g = Math.min(+gw[1], (+gw[2] / 100) * W), cw = (g - 16 - 4 * +gap[1]) / 5, h = Math.min(Math.max(+lowCh[1], Math.min(cw * +lowCh[2], (H - +lowCh[3]) / 2)), +lowCh[4]); return (10 * cw * h) / (W * H); };
  assert.ok(low(1024, 600) >= 0.4, '1024×600 카드 면적 ' + low(1024, 600).toFixed(3));
  assert.ok(low(800, 501) >= 0.33, '800×501(가장 낮은 와이드) 카드 면적 ' + low(800, 501).toFixed(3));
  // 카드 높이 하한은 모든 식에서 46px 이상(터치 대상 44px)
  const mins = (UB_CODE.match(/--st-ch:\s*clamp\((\d+)px/g) || []).map((x) => +/(\d+)px/.exec(x)[1]);
  assert.ok(mins.length >= 5 && mins.every((m) => m >= 46), '카드 높이 하한 ' + mins.join(','));
  const go = (UB_CODE.match(/\.sd-go \{[^}]*min-height:\s*(\d+)px/g) || []).map((x) => +/min-height:\s*(\d+)px/.exec(x)[1]);
  assert.ok(go.length >= 3 && go.every((v) => v >= 56), '[도전!] 높이 ' + go.join(','));
  const back = (UB_CODE.match(/\.stages-head \.btn\.small \{[^}]*min-height:\s*(\d+)px/g) || []).map((x) => +/min-height:\s*(\d+)px/.exec(x)[1]);
  assert.ok(back.length >= 2 && back.every((v) => v >= 44), '뒤로 단추 높이 ' + back.join(','));
});

test('글자 대비 4.5:1 이상(값 계산): 카드 번호·목표·미션 글자 대 면 색, 별 알약, 꼬리표, 설명판 글자', () => {
  const tok = /--mn-ink:\s*(#[0-9a-f]{6});\s*--mn-ink-2:\s*(#[0-9a-f]{6})/.exec(BLOCK);
  assert.ok(tok, 'U-A 잉크 토큰');
  const S = '.menu-screen.stages .stage-card';
  const get = (sel) => ubBody(sel, /^$/);
  const states = [
    { name: '기본', body: get(S), ink: tok[1], ink2: tok[2] },
    { name: '완료', body: get(S + '.cleared'), ink: /--c-ink:\s*(#[0-9a-f]{6})/.exec(get(S + '.cleared'))[1], ink2: /--c-ink2:\s*(#[0-9a-f]{6})/.exec(get(S + '.cleared'))[1] },
    { name: '현재', body: get(S + '.current'), ink: /--c-ink:\s*(#[0-9a-f]{6})/.exec(get(S + '.current'))[1], ink2: /--c-ink2:\s*(#[0-9a-f]{6})/.exec(get(S + '.current'))[1] }
  ];
  const lockInk = /--st-lock:\s*(#[0-9a-f]{6})/.exec(get('.menu-screen.stages'))[1];
  const lockBody = UB_PLAIN.find((r) => /\.stage-card\.locked, \.menu-screen\.stages \.stage-card:disabled$/.test(ubNorm(r.sel)) && /--c-face/.test(r.body)).body;
  states.push({ name: '잠김', body: lockBody, ink: lockInk, ink2: lockInk });
  const spLock = ubBody(S + '[data-kind="special"].locked', /^$/);
  states.push({ name: '특별 잠김', body: spLock, ink: lockInk, ink2: lockInk });
  states.forEach((s) => {
    const m = /--c-face:\s*([^;]+);/.exec(s.body); assert.ok(m, s.name + ' 면 색');
    const stops = ubHex(m[1]); assert.ok(stops.length >= 2, s.name + ' 면 색 수');
    stops.forEach((bg) => {
      assert.ok(ubCr(s.ink, bg) >= 4.5, s.name + ' 번호 ' + s.ink + ' on ' + bg + ' = ' + ubCr(s.ink, bg).toFixed(2));
      assert.ok(ubCr(s.ink2, bg) >= 4.5, s.name + ' 목표 ' + s.ink2 + ' on ' + bg + ' = ' + ubCr(s.ink2, bg).toFixed(2));
      assert.ok(ubCr('#a85a00', ubOver(bg, 0.88)) >= 4.5, s.name + ' 별 알약 on ' + bg + ' = ' + ubCr('#a85a00', ubOver(bg, 0.88)).toFixed(2));
    });
  });
  assert.ok(ubBody(S + ' .sc-stars', /^$/).includes('background: rgba(255, 255, 255, .88); color: #a85a00'), '별 알약 색 값이 계산한 값과 같다');
  assert.ok(ubCr('#ffffff', '#5b3df5') >= 4.5, '"특별" 꼬리표');
  assert.ok(ubBody(S + ' .sc-tag', /^$/).includes('background: #5b3df5; color: #fff'));
  assert.ok(ubCr('#ffffff', '#c2321f') >= 4.5, '"도전!" 꼬리표');
  const det = ubBody('.menu-screen.stages .stage-detail', /^$/); assert.ok(det.includes('linear-gradient(180deg, #fff 0%, #ece6ff 100%)'), '설명판 바탕');
  [tok[1], tok[2], '#7a4a00'].forEach((c) => ['#ffffff', '#ece6ff'].forEach((bg) => assert.ok(ubCr(c, bg) >= 4.5, '설명판 ' + c + ' on ' + bg)));
  assert.ok(ubBody('.menu-screen.stages .sd-learn', /^$/).includes('color: #7a4a00'), '학습 줄 색 값');
  assert.ok(ubCr(tok[2], '#ffffff') >= 4.5 && ubBody('.menu-screen.stages .stages-hint', /^$/).includes('color: var(--mn-ink-2)'), '힌트 칩 글자');
});

test('폰·낮은 화면 규칙: 구조(배치)를 바꾸는 규칙은 미디어 조건 안에만 있어 와이드 가로·데스크톱 배치는 그대로다', () => {
  // 세로 화면(폰·태블릿): 카드 2열 × 5행, 가로 폰: 카드 5열 + 가로형 카드, 낮은 와이드: 머리 줄임
  assert.ok(UB_PLAIN.some((r) => /^@media \(orientation: portrait\)$/.test(r.at) && ubNorm(r.sel) === '.menu-screen.stages' && /--st-cols: 2/.test(r.body)), '세로 화면 2열');
  assert.ok(UB_PLAIN.some((r) => /max-height: 500px\)/.test(r.at) && ubNorm(r.sel) === '.menu-screen.stages' && /--st-cols: 5/.test(r.body) && /--st-ch: clamp\(52px/.test(r.body)), '가로 폰 5열');
  assert.ok(UB_PLAIN.some((r) => /min-width: 600px/.test(r.at) && /orientation: portrait/.test(r.at) && ubNorm(r.sel) === '.menu-screen.stages' && /--st-gw: min\(calc\(100vw - 40px\), 680px\)/.test(r.body)), '세로 태블릿: 같은 가로형 카드를 키운다');
  // 가로형 카드·머리 한 줄·설명판 재배치는 폰 조건 안에서만
  const structural = UB_PLAIN.filter((r) => /grid-template-areas|grid-area:/.test(r.body) && /\.stage-card|\.stages-head|\.sd-/.test(r.sel));
  assert.ok(structural.length >= 4);
  structural.forEach((r) => assert.ok(PHONE_AT.test(r.at), '폰 조건 밖의 구조 규칙: ' + r.at + ' ' + r.sel));
  const card = UB_PLAIN.find((r) => PHONE_AT.test(r.at) && ubNorm(r.sel) === '.menu-screen.stages .stage-card' && /grid-template-areas/.test(r.body));
  assert.ok(card && /grid-template-areas: "num goal" "num stars"/.test(card.body), '가로형 카드(번호 | 목표·별)');
  // 가로 폰 시작 화면 2열
  const start = UB_PLAIN.find((r) => PHONE_AT.test(r.at) && ubNorm(r.sel) === '.menu-screen.start .start-card' && /grid-template-areas/.test(r.body));
  assert.ok(start && /"logo cta" "top cta" "unit hall" "tog howto"/.test(start.body), '가로 폰 시작 화면 2열');
  assert.ok(ubBody('.menu-screen #btn-start', /max-height: 500px/).includes('min-height: 60px'), '가로 폰 [시작] 60px');
  // 폰 세로 프로필 높이 되찾기
  assert.ok(UB_PLAIN.some((r) => /orientation: portrait\) and \(max-width: 599px\)$/.test(r.at) && ubNorm(r.sel) === '.menu-screen .av-grid' && /width: min\(100%, 304px\)/.test(r.body)), '폰 세로 프로필 그림 칸 폭 상한');
  // 시작 화면 규칙 4항목 접기는 U-A 그대로(첫 방문 펼침, 칩·패널은 [시작] 뒤): 스크립트·마크업은 건드리지 않았다
  assert.ok(/id="btn-howto" class="howto-btn" type="button" aria-expanded="true" aria-controls="howto-panel"/.test(HTML));
});

test('레벨 선택 화면은 위쪽 정렬 + 설명판과 무관한 위 여백 식이라, 설명판 글이 길어져도(카드에 마우스·포커스를 옮겨도) 카드 격자가 움직이지 않는다', () => {
  const base = ubBody('.menu-screen.stages', /^$/);
  assert.ok(/align-items: flex-start/.test(base) && /padding: var\(--st-pad\)/.test(base), '위쪽 정렬 + 고정 위 여백');
  const pads = UB_CODE.match(/--st-pad:\s*[^;]+;/g) || [];
  assert.ok(pads.length >= 3, '위 여백 식 ' + pads.length);
  pads.forEach((p) => assert.ok(!/--sd-|detail|\bsd-/.test(p), '설명판 높이를 쓰지 않는다: ' + p));
  assert.ok(!UB_PLAIN.some((r) => /^\.menu-screen\.stages$/.test(ubNorm(r.sel)) && /align-items:\s*center/.test(r.body)), '가운데 정렬 없음');
  assert.ok(/\.stage-detail \{ min-height: 132px; align-content: center; \}/.test(UB_CODE), '설명판 최소 높이(와이드)');
});
