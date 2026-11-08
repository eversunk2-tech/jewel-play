/* spec §20 / §20.14 와이드 화면 시험: 스킬 설명 문구(CONFIG.skillInfo), 래퍼 마크업, 와이드 CSS 블록 정적 점검.
 * 실행: node --test apps/element-gems/test/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const G = require(path.join(__dirname, '..', 'game.js'));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

test('CONFIG.skillInfo: 6원소 모두 있고, 숫자 없이 쉬운 말 한두 줄', () => {
  const ids = G.CONFIG.types.map((t) => t.id);
  assert.deepStrictEqual(ids, ['fire', 'water', 'grass', 'lightning', 'dark', 'light']);
  assert.deepStrictEqual(Object.keys(G.CONFIG.skillInfo).sort(), ids.slice().sort());
  ids.forEach((id) => {
    const raw = G.CONFIG.skillInfo[id];
    assert.ok(typeof raw === 'string' && raw.length >= 6, id + ' 설명이 비어 있음');
    assert.ok(raw.length <= 30, id + ' 설명이 두 줄(약 30자)을 넘음: ' + raw);
    // 난이도마다 달라지는 초·개수 숫자는 문장에 직접 쓰지 않는다(자리표시자 {area}·{mult}만 허용)
    assert.ok(!/[0-9]/.test(raw.replace(/\{area\}|\{mult\}/g, '')), id + ' 설명에 숫자가 직접 들어 있음: ' + raw);
    const out = G.skillDesc(id);
    assert.ok(!/[{}]/.test(out), id + ' 자리표시자가 채워지지 않음: ' + out);
  });
});

test('skillDesc: 불 범위·어둠 배율은 현재 CONFIG 값에서 읽는다 (표시와 실제가 어긋나지 않게)', () => {
  const r0 = G.CONFIG.skills.fire.radius;
  const m0 = G.CONFIG.skills.dark.mult;
  try {
    assert.ok(G.skillDesc('fire').includes('3×3'));
    assert.ok(G.skillDesc('dark').includes(m0 + '배'));
    G.CONFIG.skills.fire.radius = 2;
    G.CONFIG.skills.dark.mult = 3;
    assert.ok(G.skillDesc('fire').includes('5×5'));
    assert.ok(G.skillDesc('dark').includes('3배'));
  } finally {
    G.CONFIG.skills.fire.radius = r0;
    G.CONFIG.skills.dark.mult = m0;
  }
  // 사실 확인: 3×3 = fireCells 개수(중앙), 가로·세로 한 줄 = grassCells 개수
  assert.strictEqual(G.fireCells(4, 4, 8, 8, G.CONFIG.skills.fire.radius).length, 9);
  assert.strictEqual(G.grassCells(4, 4, 8, 8).length, 8 + 8 - 1);
});

test('난이도를 바꿔도 설명 문구는 같다 (초·개수 숫자를 쓰지 않으므로)', () => {
  const before = G.CONFIG.types.map((t) => G.skillDesc(t.id));
  ['easy', 'hard', 'normal'].forEach((lv) => {
    G.applyDifficulty(lv);
    assert.deepStrictEqual(G.CONFIG.types.map((t) => G.skillDesc(t.id)), before);
  });
});

test('index.html: 래퍼 5개가 있고 기존 id 순서가 그대로다', () => {
  ['sc-brand', 'sc-menu', 'sc-info', 'pf-col-a', 'pf-col-b'].forEach((c) => {
    assert.strictEqual((html.match(new RegExp('class="' + c + '"', 'g')) || []).length, 1, c);
  });
  const startIds = ['logo-img', 'title-fallback', 'btn-profile-chip', 'me-note', 'start-clear', 'level-select', 'level-desc', 'btn-start', 'btn-hall', 'rule-stage', 'tutorial', 'btn-sound-start', 'btn-cutin-start'];
  const start = html.slice(html.indexOf('id="screen-start"'), html.indexOf('id="screen-stages"'));
  let last = -1;
  startIds.forEach((id) => {
    const i = start.indexOf('id="' + id + '"');
    assert.ok(i > last, '시작 화면 DOM 순서가 바뀜: ' + id);
    last = i;
  });
  const pf = html.slice(html.indexOf('id="screen-profile"'), html.indexOf('id="screen-hall"'));
  // spec §23: 새 id 추가(pf-carry·pf-wipe·pf-actions, 확인 ① 내용, 확인 ②). 기존 id 의 상대 순서는 그대로이고, 확인 ①의 두 버튼만 '안전한 쪽(pf-confirm-no)이 먼저'로 바뀌었다
  // (키보드 이동 순서와 화면 순서를 맞추려는 것 — 시안 pf-plan/shots/01 과 같은 모양)
  const pfIds = ['pf-title', 'pf-sub', 'pf-rename', 'pf-av-label', 'pf-avatars', 'pf-nick', 'pf-count', 'pf-msg-wrap', 'pf-left', 'pf-carry', 'pf-wipe', 'pf-actions', 'pf-save', 'pf-skip', 'pf-cancel', 'pf-delete',
    'pf-confirm', 'pf-del-rec', 'pf-del-hall', 'pf-confirm-no', 'pf-confirm-yes', 'pf-confirm2', 'pf-pend', 'pf-confirm2-no', 'pf-confirm2-yes'];
  last = -1;
  pfIds.forEach((id) => {
    const i = pf.indexOf('id="' + id + '"');
    assert.ok(i > last, '프로필 화면 DOM 순서가 바뀜: ' + id);
    last = i;
  });
  // 래퍼 여는 태그와 닫는 태그 수가 맞는다 (div 균형)
  const opens = (html.match(/<div\b/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  assert.strictEqual(opens, closes, 'div 여닫음 수가 다름');
});

test('style.css: 와이드 블록 핵심 규칙과 휴대폰 보호 규칙', () => {
  // 래퍼는 기본에서 레이아웃에 참여하지 않는다
  assert.match(css, /\.sc-brand, \.sc-menu, \.sc-info, \.pf-col-a, \.pf-col-b \{ display: contents; \}/);
  // 스킬 설명은 기본(휴대폰)에서 숨김
  assert.match(css, /\.gauge \.gtext \{ display: none; \}/);
  // 와이드 조건은 휴대폰 가로(max-height: 500px)와 겹치지 않는다
  assert.ok(css.includes('@media (min-width: 800px) and (min-height: 501px) and (orientation: landscape) {'));
  const wide = css.slice(css.indexOf('/* B. 와이드('));
  // 게이지 .gtext 표시는 와이드 조건 안에서만
  const showIdx = wide.indexOf('.gauge .gtext { display: contents; }');
  assert.ok(showIdx > 0);
  assert.ok(wide.lastIndexOf('@media', showIdx) < showIdx && wide.slice(wide.lastIndexOf('@media', showIdx), showIdx).includes('min-height: 501px'));
  // 기존 휴대폰 가로 규칙은 그대로 남아 있다
  assert.ok(css.includes('grid-template-columns: var(--board) 64px minmax(150px, 220px);'));
  assert.ok(css.includes('--ui-h: 302px;'));
  // 게이지 막대 애니메이션은 transform, reduced-motion 존중
  assert.ok(wide.includes('transform: scaleX(var(--fill, 0))'));
  const rm = wide.slice(wide.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(rm.includes('.gauge.full { animation: none; }') && rm.includes('.gauge .fill { transition: none; }'));
  // 세로 태블릿 보드 상한
  assert.ok(css.includes('--board-cap: 680px;') && css.includes('--board-cap: 840px;'));
  // 컨테이너 쿼리(크기 격리) 미지원 폴백: 행을 44px로 고정해야 패널이 보드 밖으로 넘치지 않는다 (Review 8차)
  const fb = css.slice(css.indexOf('@supports not (container-type: size)'));
  assert.ok(fb.includes('.gauges { grid-auto-rows: 44px; }'));
});
