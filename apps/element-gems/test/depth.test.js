/* spec §49 UI 입체감 "B-1 맑은 유리" 시험: 별도 스타일시트 ui-depth.css 가 약속한 규칙을 소스(주석을 뺀 CSS)에서 점검한다.
 * 이 파일은 일반용·교육용 test 폴더에 같은 내용으로 들어간다(앱에 맞춰 스스로 판단: edu.css 가 있으면 교육용).
 * 각 규칙은 (1) 지금 파일이 지키는지 (2) 검사기가 위반 예시를 잡는지(긍정·부정 예시 + 메모리 안 변이)를 따로 시험한다.
 * 실행: node --test apps/element-gems/test/*.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const APPS = path.join(ROOT, '..');
const IS_EDU = fs.existsSync(path.join(ROOT, 'edu.css'));
const CSS_PATH = path.join(ROOT, 'ui-depth.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- 아주 작은 CSS 해석기 (주석 제거 → 덩어리 → 선언) ---------- */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 괄호·대괄호·따옴표 밖에서만 구분자(문자 하나, 공백이면 ' ')로 자른다 */
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { cur += ch; if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 최상위를 "머리 { 몸 }" 덩어리(또는 ';' 로 끝나는 @문)로 자른다 */
function parseBlocks(text) {
  const blocks = [];
  let i = 0;
  let start = 0;
  let depth = 0;
  let quote = '';
  while (i < text.length) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { blocks.push({ head: text.slice(start, i).trim(), body: null }); start = i + 1; }
    else if (ch === '{' && depth === 0) {
      let d = 1;
      let j = i + 1;
      let q = '';
      for (; j < text.length && d > 0; j++) {
        const c = text[j];
        if (q) { if (c === q && text[j - 1] !== '\\') q = ''; } else if (c === '"' || c === "'") q = c;
        else if (c === '{') d++;
        else if (c === '}') d--;
      }
      if (d > 0) return { blocks, unbalanced: true };
      blocks.push({ head: text.slice(start, i).trim(), body: text.slice(i + 1, j - 1) });
      i = j;
      start = j;
      continue;
    }
    i++;
  }
  const rest = text.slice(start).trim();
  if (rest) blocks.push({ head: rest, body: null, dangling: true });
  return { blocks, unbalanced: false };
}

function parseDecls(body) {
  return splitTop(body, ';').map((d) => {
    const k = d.indexOf(':');
    if (k < 0) return null;
    const prop = d.slice(0, k).trim();
    const raw = d.slice(k + 1).trim();
    return { prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value: norm(raw.replace(/!\s*important\s*$/i, '')), important: /!\s*important\s*$/i.test(raw) };
  }).filter(Boolean);
}

/** css 문자열 → { rules: [{selectors, decls, ctx}], keyframes: [{name, frames}], statements, errors } (ctx = 감싼 @media·@supports 머리 목록) */
function parseCss(raw) {
  const model = { css: stripComments(raw), rules: [], keyframes: [], statements: [], errors: [] };
  const walk = (text, ctx) => {
    const r = parseBlocks(text);
    if (r.unbalanced) model.errors.push('닫히지 않은 중괄호');
    r.blocks.forEach((b) => {
      if (b.body === null) { if (b.dangling) model.errors.push('끝나지 않은 문장: ' + b.head); else model.statements.push(b.head); return; }
      if (b.head.startsWith('@')) {
        const name = b.head.match(/^@([\w-]+)/)[1].toLowerCase();
        if (/keyframes$/.test(name)) {
          const inner = parseBlocks(b.body);
          model.keyframes.push({ name: norm(b.head.replace(/^@[\w-]+\s*/, '')), frames: inner.blocks.map((f) => ({ sel: norm(f.head), decls: parseDecls(f.body || '') })) });
        } else if (name === 'media' || name === 'supports') walk(b.body, ctx.concat(norm(b.head)));
        else model.statements.push(norm(b.head));
        return;
      }
      model.rules.push({ selectors: splitTop(b.head, ',').map(norm), decls: parseDecls(b.body), ctx });
    });
  };
  walk(model.css, []);
  return model;
}

const isRootVars = (r) => r.ctx.length === 0 && r.selectors.length === 1 && r.selectors[0] === ':root';
function rootVars(model) {
  const v = {};
  model.rules.filter(isRootVars).forEach((r) => r.decls.forEach((d) => { if (d.prop.startsWith('--')) v[d.prop] = d.value; }));
  return v;
}
function resolveVars(value, vars) {
  let out = value;
  for (let k = 0; k < 4; k++) out = out.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, n) => (n in vars ? vars[n] : m));
  return out;
}
/** box-shadow 값 → 층 목록 {inset, len[], x, y, blur, spread}. 길이(숫자)가 2개 미만인 층(var(...)·none 등)은 판정 불가라 뺀다 */
function shadowLayers(value) {
  return splitTop(value, ',').map((layer) => {
    let inset = false;
    const len = [];
    splitTop(layer, ' ').forEach((t) => {
      if (/^inset$/i.test(t)) inset = true;
      else if (/^[+-]?(\d+\.?\d*|\.\d+)(px|r?em|%)?$/i.test(t)) len.push(parseFloat(t));
    });
    return { raw: layer.trim(), inset, len, x: len[0], y: len[1], blur: len.length > 2 ? len[2] : 0, spread: len.length > 3 ? len[3] : 0 };
  }).filter((l) => l.len.length >= 2);
}
const where = (r) => r.selectors.join(', ');

/* ---------- 규칙 검사기 (위반 목록을 돌려준다. 빈 배열이면 통과) ---------- */

// ① 링크: 각 앱 index.html 에서 ui-depth.css 가 "마지막 스타일시트"(교육용은 edu.css 뒤 + [EDU] 표식)
function checkLinks(html, edu) {
  const bad = [];
  const links = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/\brel=["']stylesheet["']/i.test(m[0])) continue;
    links.push({ href: (m[0].match(/\bhref=["']([^"']+)["']/) || [])[1], at: m.index, end: m.index + m[0].length });
  }
  const want = edu ? ['style.css', 'edu.css', 'ui-depth.css'] : ['style.css', 'ui-depth.css'];
  if (links.map((l) => l.href).join('|') !== want.join('|')) bad.push('스타일시트 링크 순서가 ' + want.join(' → ') + ' 가 아님: ' + links.map((l) => l.href).join(' → '));
  const last = links[links.length - 1];
  if (!last || last.href !== 'ui-depth.css') bad.push('ui-depth.css 가 마지막 스타일시트가 아님');
  else {
    if (html.indexOf('<style', last.end) !== -1) bad.push('ui-depth.css 뒤에 <style> 블록이 있음');
    if (html.indexOf('</head>') < last.end) bad.push('ui-depth.css 링크가 <head> 밖에 있음');
    if (edu && !/<!--[^>]*\[EDU\][^>]*-->\s*$/.test(html.slice(0, last.at))) bad.push('교육용 링크 바로 앞에 <!-- [EDU] --> 표식이 없음');
  }
  return bad;
}

// ② 선택자 접두어 · 우선순위 강제 선언·외부 주소·url()·@font-face·@import 0
function checkPrefix(css) {
  const bad = [];
  const m = parseCss(css);
  m.errors.forEach((e) => bad.push('해석 오류: ' + e));
  m.rules.forEach((r) => r.selectors.forEach((s) => {
    if (s === ':root' && r.ctx.length === 0) { r.decls.forEach((d) => { if (!d.prop.startsWith('--')) bad.push(':root 블록에는 변수(--)만 둘 수 있음: ' + d.prop); }); return; }
    if (!s.startsWith(':root ')) bad.push(':root 접두어 없음: ' + s);
  }));
  return bad;
}
function checkBasics(css) {
  const bad = [];
  const text = stripComments(css);
  if (/!\s*important/i.test(text)) bad.push('우선순위 강제 선언이 있음');
  if (/http/i.test(text)) bad.push('외부 주소(http)가 있음');
  if (/url\s*\(/i.test(text)) bad.push('url( 이 있음');
  if (/@font-face/i.test(text)) bad.push('@font-face 가 있음');
  if (/@import/i.test(text)) bad.push('@import 가 있음');
  return bad;
}

// ③ 흐림·필터 0 (주석을 뺀 파일 전체)
function checkNoFilter(css) {
  const bad = [];
  const text = stripComments(css);
  if (/filter/i.test(text)) bad.push('filter / backdrop-filter 가 있음');
  if (/blur\s*\(/i.test(text)) bad.push('blur( 가 있음');
  return bad;
}

// ④ 보드·타일·플레이 HUD 에는 transition·무한 애니메이션 0
const HUD = ['.board', '.board-wrap', '.gem', '.timer', '.scorebar', '.goal', '.gauge', '.m-chip', '#btn-hint', '#btn-menu', '#btn-reset'];
const HUD_RE = new RegExp('(^|[^\\w-])(' + HUD.map((h) => h.replace(/[.#]/g, '\\$&')).join('|') + ')(?![\\w-])');
function checkHud(css) {
  const bad = [];
  const m = parseCss(css);
  const vars = rootVars(m);
  m.rules.forEach((r) => {
    if (!r.selectors.some((s) => HUD_RE.test(s))) return;
    r.decls.forEach((d) => {
      if (/^transition(-|$)/.test(d.prop)) bad.push('HUD 에 transition: ' + where(r));
      if (/^animation(-|$)/.test(d.prop) && /\binfinite\b/.test(resolveVars(d.value, vars))) bad.push('HUD 에 무한 애니메이션: ' + where(r));
    });
  });
  return bad;
}

// ⑤ 새 @keyframes 는 허용 이름만 · 무한 반복은 #btn-start 뿐 · 모든 애니메이션·눌림 크기 변화는 움직임 줄이기에서 정지
const ALLOWED_KEYFRAMES = ['dpSweep', 'dpShine', 'stagePulse'];
const REDUCE = '@media screen and (prefers-reduced-motion: reduce)';
function checkMotion(css) {
  const bad = [];
  const m = parseCss(css);
  const vars = rootVars(m);
  m.keyframes.forEach((k) => { if (!ALLOWED_KEYFRAMES.includes(k.name)) bad.push('허용 목록에 없는 @keyframes: ' + k.name); });
  const inReduce = (r) => r.ctx.length === 1 && r.ctx[0] === REDUCE;
  const noAnim = new Set();
  const noScale = new Set();
  m.rules.filter(inReduce).forEach((r) => r.decls.forEach((d) => {
    if (d.prop === 'animation' && d.value === 'none') r.selectors.forEach((s) => noAnim.add(s));
    if (d.prop === 'transform' && d.value === 'none') r.selectors.forEach((s) => noScale.add(s));
  }));
  m.rules.forEach((r) => {
    if (isRootVars(r)) return;
    r.decls.forEach((d) => {
      if (/^animation(-|$)/.test(d.prop) && /\binfinite\b/.test(resolveVars(d.value, vars))) {
        r.selectors.forEach((s) => { if (!/ #btn-start::after$/.test(s)) bad.push('무한 애니메이션은 #btn-start 한 곳뿐이어야 함: ' + s); });
      }
      if (inReduce(r)) return;
      if (d.prop === 'animation' && resolveVars(d.value, vars) !== 'none') r.selectors.forEach((s) => { if (!noAnim.has(s)) bad.push('움직임 줄이기에서 멈추지 않는 애니메이션: ' + s); });
      if (d.prop === 'transform' && /scale\(/.test(d.value)) r.selectors.forEach((s) => { if (!noScale.has(s)) bad.push('움직임 줄이기에서 크기 변화가 남음: ' + s); });
    });
  });
  return bad;
}

// ⑥ 받침 없음: 블러 0 오프셋 그림자(inset 포함) · 한쪽만 두꺼운 테두리 0. 단 윗 하이라이트 변수 --dp-hl(inset 0 1px 0)은 면 위쪽의 빛이라 허용
function checkNoLip(css) {
  const bad = [];
  const m = parseCss(css);
  const scan = (at, prop, value) => shadowLayers(value).forEach((l) => {
    if (l.blur !== 0 || (l.x === 0 && l.y === 0)) return; // 블러가 있거나 방향이 없으면(0 0 0 Npx 링) 받침이 아니다
    const topLight = prop === '--dp-hl' && l.inset && l.x === 0 && l.y === 1 && l.len.length === 3;
    if (!topLight) bad.push(at + ' { ' + prop + ': ' + l.raw + ' } — 블러 0 오프셋 그림자(받침)');
  });
  const SIDE = /^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)(-width)?$/;
  const visit = (at, decls) => decls.forEach((d) => {
    if (d.prop === 'box-shadow' || d.prop === '-webkit-box-shadow') scan(at, d.prop, d.value);
    else if (d.prop.startsWith('--') && /\d\s*px/.test(d.value)) scan(at, d.prop, d.value);
    if (SIDE.test(d.prop)) {
      const w = (d.value.match(/(\d*\.?\d+)px/) || [])[1];
      if (w && parseFloat(w) >= 3) bad.push(at + ' { ' + d.prop + ': ' + d.value + ' } — 3px 이상 한쪽 테두리');
    }
    if (d.prop === 'border-width') {
      const ws = splitTop(d.value, ' ').map(parseFloat);
      if (ws.length > 1 && new Set(ws).size > 1 && Math.max.apply(null, ws) >= 3) bad.push(at + ' { border-width: ' + d.value + ' } — 한쪽만 두꺼운 테두리');
    }
  });
  m.rules.forEach((r) => visit(where(r), r.decls));
  m.keyframes.forEach((k) => k.frames.forEach((f) => visit('@keyframes ' + k.name + ' ' + f.sel, f.decls)));
  return bad;
}

// ⑦ 레이아웃 선언 0. 허용 예외는 명시된 곳 4개(= 선택칩 2종 · [시작] 의 본체와 ::after 빛줄기·광택)뿐
const LAYOUT_PROP = /^(width|height|(min|max)-(width|height|block-size|inline-size)|(block|inline)-size|padding(-[a-z-]+)?|margin(-[a-z-]+)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|gap|row-gap|column-gap|grid(-[a-z-]+)?|flex(-[a-z-]+)?|(align|justify|place)-[a-z-]+|order|inset(-[a-z-]+)?|top|right|bottom|left|display|position|overflow(-[xy])?|float|content|font(-[a-z-]+)?|line-height|letter-spacing)$/;
const AFTER_ALLOW = { content: /^""$/, position: /^absolute$/, top: /^0$/, bottom: /^0$/, left: /^0$/, width: /^\d+%$/ };
const BODY_ALLOW = { position: /^relative$/, overflow: /^hidden$/ };
const LAYOUT_EXCEPTIONS = [
  { name: '선택칩 본체', selectors: [':root .level-btn.on', ':root .hf-tab[aria-selected="true"]'], allow: BODY_ALLOW },
  { name: '선택칩 빛줄기', selectors: [':root .level-btn.on::after', ':root .hf-tab[aria-selected="true"]::after'], allow: AFTER_ALLOW },
  { name: '[시작] 본체', selectors: [':root .menu-screen #btn-start'], allow: BODY_ALLOW },
  { name: '[시작] 광택', selectors: [':root .menu-screen #btn-start::after'], allow: AFTER_ALLOW }
];
function layoutScan(css) {
  const bad = [];
  const used = new Set();
  const m = parseCss(css);
  m.rules.forEach((r) => r.decls.forEach((d) => {
    if (!LAYOUT_PROP.test(d.prop)) return;
    const ex = LAYOUT_EXCEPTIONS.find((e) => r.ctx.length === 0 && r.selectors.every((s) => e.selectors.includes(s)) && e.allow[d.prop] && e.allow[d.prop].test(d.value));
    if (ex) used.add(ex.name); else bad.push(where(r) + ' { ' + d.prop + ': ' + d.value + ' } — 레이아웃 선언');
  }));
  m.keyframes.forEach((k) => k.frames.forEach((f) => f.decls.forEach((d) => { if (LAYOUT_PROP.test(d.prop)) bad.push('@keyframes ' + k.name + ' { ' + d.prop + ' } — 레이아웃 선언'); })));
  return { bad, used };
}

// ⑧ 투명 테두리(border-color: transparent) 규칙에는 background-origin: border-box 가 짝으로 있다
function checkTransparentBorder(css) {
  const bad = [];
  parseCss(css).rules.forEach((r) => {
    const tr = r.decls.some((d) => d.prop === 'border-color' && /\btransparent\b/.test(d.value));
    const org = r.decls.some((d) => d.prop === 'background-origin' && d.value === 'border-box');
    if (tr && !org) bad.push(where(r) + ' — 투명 테두리인데 background-origin: border-box 가 없음');
  });
  return bad;
}

// ⑨ 상태 고리(.gauge.full · .gauge.aiming · .timer.frozen · .scorebar.dark)는 :not() 가드로 비켜 간다 / :hover·:active 가 고른 상태를 덮지 않는다
const STATE_CLASSES = ['full', 'aiming', 'frozen', 'dark'];
const STATE_GUARDS = ['.scorebar:not(.dark)', '.gauge:not(.full):not(.aiming)', '.timer:not(.frozen)'];
function checkStateGuards(css) {
  const bad = [];
  const m = parseCss(css);
  m.rules.forEach((r) => r.selectors.forEach((s) => {
    const bare = s.replace(/:not\([^)]*\)/g, '');
    STATE_CLASSES.forEach((c) => { if (new RegExp('\\.' + c + '(?![\\w-])').test(bare)) bad.push('상태 고리 클래스(.' + c + ')를 직접 선택: ' + s); });
  }));
  STATE_GUARDS.forEach((g) => { if (!m.rules.some((r) => r.selectors.some((s) => s.includes(g)))) bad.push(':not() 가드가 없음: ' + g); });
  return bad;
}
// 눌리는 순간(:active)에만 고른 칸의 고리가 잠깐 바뀌는 알려진 두 곳(호버에서는 선택 상태가 유지된다). :hover 에는 예외가 없다
const ACTIVE_ONLY_KNOWN = [':root .eg-chip:active', ':root .eg-amt:active'];
function checkInteractiveStates(css) {
  const bad = [];
  const m = parseCss(css);
  const SELECTED = /\.on(?![\w-])|\[aria-(selected|checked|pressed)="true"\]/;
  const selectable = new Set();
  m.rules.forEach((r) => r.selectors.forEach((s) => s.split(/[\s>+~]+/).forEach((c) => {
    if (SELECTED.test(c.replace(/:not\([^)]*\)/g, ''))) (c.match(/\.[\w-]+/g) || []).forEach((cl) => { if (cl !== '.on') selectable.add(cl); });
  })));
  m.rules.forEach((r) => r.selectors.forEach((s) => {
    if (!/:(hover|active)\b/.test(s)) return;
    const last = s.split(/[\s>+~]+/).filter((c) => /:(hover|active)\b/.test(c)).pop() || s;
    const guarded = /:not\(\s*(\.on|\[aria-(selected|checked|pressed)="true"\])\s*\)/.test(last);
    const hit = (last.replace(/:not\([^)]*\)/g, '').match(/\.[\w-]+/g) || []).filter((cl) => selectable.has(cl));
    if (hit.length === 0 || guarded) return;
    if (/:active\b/.test(s) && !/:hover\b/.test(s) && ACTIVE_ONLY_KNOWN.includes(s)) return;
    bad.push(':hover·:active 가 고른 상태(' + hit.join(', ') + ')를 덮을 수 있음: ' + s);
  }));
  return bad;
}

// ⑩ 눌림 어둡게 하기 --dp-tint 의 안쪽 그림자 스프레드 ≥ 200px(면 전체를 덮는다)
function checkTint(css) {
  const bad = [];
  const m = parseCss(css);
  const tint = rootVars(m)['--dp-tint'];
  if (!tint) return ['--dp-tint 가 없음'];
  const layers = shadowLayers(tint);
  if (layers.length !== 1 || !layers[0].inset || layers[0].len.length !== 4) bad.push('--dp-tint 는 inset 0 0 0 <스프레드> 색 한 층이어야 함: ' + tint);
  else if (layers[0].spread < 200) bad.push('--dp-tint 스프레드가 200px 미만: ' + layers[0].spread + 'px');
  if (!m.rules.some((r) => r.decls.some((d) => d.prop === 'box-shadow' && /var\(--dp-tint\)/.test(d.value)))) bad.push('--dp-tint 를 쓰는 :active 규칙이 없음');
  return bad;
}

// ⑫ 면은 불투명: background 의 맨 아래 층(= 면 색)에 알파 < .96 인 색이 없다. 위 층(좌상단 반사광 --dp-glint 등 장식)은 투명해도 된다
const MIN_FACE_ALPHA = 0.96;
function layerAlphas(layer) {
  const out = [];
  (layer.match(/rgba?\(([^)]*)\)|hsla?\(([^)]*)\)/gi) || []).forEach((c) => {
    const parts = c.replace(/^[a-z]+\(|\)$/gi, '').split(/[,\/\s]+/).filter(Boolean);
    out.push(parts.length >= 4 ? (/%$/.test(parts[3]) ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1);   // 알파를 % 로 쓴 rgb(255 255 255 / 50%) 도 읽는다(Review R-D 보강)
  });
  (layer.match(/#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/gi) || []).forEach((h) => out.push(h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : parseInt(h[4] + h[4], 16) / 255));
  if (/\btransparent\b/i.test(layer)) out.push(0);
  return out;
}
// 면이 아니라 "빛줄기·광택" 장식 띠인 ::after 두 곳(⑦의 예외와 같은 선택자)은 투명한 띠라서 대상에서 뺀다
const FX_AFTER = LAYOUT_EXCEPTIONS.filter((e) => /빛줄기|광택/.test(e.name)).reduce((acc, e) => acc.concat(e.selectors), []);
function checkOpaqueFaces(css) {
  const bad = [];
  const m = parseCss(css);
  const vars = rootVars(m);
  m.rules.forEach((r) => r.decls.forEach((d) => {
    if (d.prop !== 'background' && d.prop !== 'background-color' && d.prop !== 'background-image') return;
    if (r.ctx.length === 0 && r.selectors.every((s) => FX_AFTER.includes(s))) return;
    const layers = splitTop(resolveVars(d.value, vars), ',');
    const face = layers[layers.length - 1];
    if (layerAlphas(face).some((a) => a < MIN_FACE_ALPHA)) bad.push(where(r) + ' { ' + d.prop + ' } — 면 색에 알파 < ' + MIN_FACE_ALPHA + ': ' + face.slice(0, 70));
  }));
  // 면을 통째로 비치게 하는 opacity(Review R-D 보강): 본문 규칙(@media 밖)의 opacity < .96 은 잡는다. 빛줄기의 keyframes·움직임 줄이기 @media 안의 opacity 는 대상이 아니다
  m.rules.forEach((r) => r.decls.forEach((d) => {
    if (d.prop !== 'opacity' || r.ctx.length !== 0) return;
    const v = resolveVars(d.value, vars);
    const num = /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v);
    if (!isNaN(num) && num < MIN_FACE_ALPHA) bad.push(where(r) + ' { opacity: ' + d.value + ' } — 면이 비침(opacity < ' + MIN_FACE_ALPHA + ')');
  }));
  Object.keys(vars).filter((k) => /^--dp-(face|info|trough|panel)$/.test(k)).forEach((k) => {
    if (layerAlphas(vars[k]).some((a) => a < MIN_FACE_ALPHA)) bad.push(k + ' — 면 색 변수에 알파 < ' + MIN_FACE_ALPHA);
  });
  return bad;
}

// ⑬·⑭ 상태 색 복원 블록: 시안 규칙(:root .m-chip 등)이 원본의 상태 규칙(.m-chip.done 등)과 우선순위가 같고 나중에 읽혀 덮어쓴 색을, 파일 끝 블록이 원본 값 그대로 되살린다
//      ⑬ 배경은 원본 style.css·edu.css 의 해당 상태 규칙 background 와 같은 문자열 · ⑭ 키보드 포커스의 흰 바깥 고리(0 0 0 6px #fff)가 있다
const RESTORE_MARK = '/* ---------- 상태 색 복원';
const RESTORE_COLORS = [
  { sel: ':root .m-chip.done', orig: '.m-chip.done', file: 'style.css' },
  { sel: ':root #end-title.clear', orig: '#end-title.clear', file: 'style.css' },
  { sel: ':root .learn-chip.done', orig: '.learn-chip.done', file: 'edu.css' },
  { sel: ':root .menu-screen .howto-btn[aria-expanded="true"]', orig: '.menu-screen .howto-btn[aria-expanded="true"]', file: 'style.css' },
  // D9 교육용 선물상자 문제 칩 기본 면(사용자 결정 2026-11-21: 크림색으로 복원). 완료 상태(.done)가 계속 이겨야 하므로 선택자 우선순위도 따로 시험한다
  { sel: ':root .learn-chip', orig: '.learn-chip', file: 'edu.css' }
];
const RESTORE_FOCUS = [':root .menu-screen .howto-btn:focus-visible', ':root .gauge:not(.full):not(.aiming):focus-visible', ':root .eg-chip.on:focus-visible', ':root .eg-amt.on:focus-visible'];
// ⑯ 글자색 복구(Review R-D D8): 교육용 문제 수 안내 글자가 고른 칩의 색조 그림자 위에서 4.5 아래로 떨어지던 것
const RESTORE_TEXT = [':root #eg-amount-desc'];
// ⑮ 받침 잔존·비활성 복원(Review R-D D1~D3): 시안이 덮지 못한 정령 HUD(.sp-art·.sp-info)의 받침, 순서 때문에 비활성 값을 덮어쓴 주요 버튼, 원본 0 1px 0 받침이 남던 문제 보기 눌림
const RESTORE_SHADOWS = [':root .sp-art', ':root .sp-info', ':root .btn.primary[disabled]', ':root .btn.primary.cooling', ':root .eg-opt:not(:disabled):active'];
function restoreBlockText(css) {
  const i = css.indexOf(RESTORE_MARK);
  return i >= 0 && css.indexOf(RESTORE_MARK, i + 1) < 0 ? css.slice(i) : null;
}
/** 원본 CSS 에서 selector 의 background 를 마지막으로 정하는 규칙(미디어 밖)의 값 */
function originalBackground(baseCss, selector) {
  let v = null;
  parseCss(baseCss).rules.forEach((r) => { if (r.ctx.length === 0 && r.selectors.includes(selector)) r.decls.forEach((d) => { if (d.prop === 'background') v = d.value; }); });
  return v;
}
function checkRestore(css, originals) {
  const bad = [];
  const text = restoreBlockText(css);
  if (text === null) return ['상태 색 복원 블록(머리 주석)이 없거나 둘 이상'];
  const blk = parseCss(text);
  const known = RESTORE_COLORS.map((r) => r.sel).concat(RESTORE_FOCUS, RESTORE_SHADOWS, RESTORE_TEXT);
  blk.rules.forEach((r) => r.selectors.forEach((sel) => { if (!known.includes(sel)) bad.push('복원 블록에 목록 밖 규칙(이유를 달아 목록에 추가해야 함): ' + sel); }));
  RESTORE_COLORS.forEach((r) => {
    const rule = blk.rules.find((x) => x.selectors.includes(r.sel));
    if (!rule) { bad.push('복원 블록에 규칙이 없음: ' + r.sel); return; }
    const bg = rule.decls.find((d) => d.prop === 'background');
    const orig = originalBackground(originals[r.file], r.orig);
    if (orig === null) { bad.push('원본 ' + r.file + ' 에서 ' + r.orig + ' 의 background 를 찾지 못함(원본이 바뀌었으니 복원 블록을 다시 점검)'); return; }
    if (!bg) bad.push(r.sel + ' 에 background 가 없음');
    else if (bg.value !== orig) bad.push(r.sel + ' 의 background 가 원본과 다름: ' + bg.value + ' != ' + orig);
    if (!rule.decls.some((d) => d.prop === 'background-origin' && d.value === 'border-box')) bad.push(r.sel + ' 에 background-origin: border-box 가 없음');
  });
  return bad;
}
function checkRestoreShadows(css) {
  const bad = [];
  const text = restoreBlockText(css);
  if (text === null) return ['상태 색 복원 블록(머리 주석)이 없거나 둘 이상'];
  const blk = parseCss(text);
  const rule = (sel) => blk.rules.find((x) => x.selectors.includes(sel));
  const shadow = (r) => { const d = r && r.decls.find((x) => x.prop === 'box-shadow'); return d ? d.value : null; };
  // D1: 정령 HUD 두 곳 — 정보 줄 문법(윗 하이라이트 + 연한 링 + 바탕 그림자), 투명 테두리 + background-origin 짝, 받침 없음
  [':root .sp-art', ':root .sp-info'].forEach((sel) => {
    const r = rule(sel);
    if (!r) { bad.push('복원 규칙이 없음: ' + sel); return; }
    if (shadow(r) !== 'var(--dp-hl), var(--dp-ring-i), var(--dp-sh-a)') bad.push(sel + ' 의 box-shadow 가 정보 줄 문법(var(--dp-hl), var(--dp-ring-i), var(--dp-sh-a))이 아님: ' + shadow(r));
    if (!r.decls.some((d) => d.prop === 'border-color' && d.value === 'transparent') || !r.decls.some((d) => d.prop === 'background-origin' && d.value === 'border-box')) bad.push(sel + ' 에 border-color: transparent + background-origin: border-box 짝이 없음');
  });
  // D2: 비활성·쿨다운 주요 버튼 — 시안이 정한 일반 비활성 값(:root .btn[disabled], :root .btn.cooling)과 같은 box-shadow
  const generic = parseCss(css).rules.find((r) => r.ctx.length === 0 && r.selectors.includes(':root .btn[disabled]'));
  const gv = shadow(generic);
  if (!gv) bad.push(':root .btn[disabled] 의 비활성 box-shadow 를 찾지 못함');
  [':root .btn.primary[disabled]', ':root .btn.primary.cooling'].forEach((sel) => {
    const r = rule(sel);
    if (!r) { bad.push('복원 규칙이 없음: ' + sel); return; }
    if (gv && shadow(r) !== gv) bad.push(sel + ' 의 box-shadow 가 일반 비활성 값과 다름: ' + shadow(r) + ' != ' + gv);
  });
  // D3: 문제 보기를 누르는 순간 — 눌림 문법(윗 하이라이트 + 면 어둡게 + 링), 받침 없음
  const op = rule(':root .eg-opt:not(:disabled):active');
  if (!op) bad.push('복원 규칙이 없음: :root .eg-opt:not(:disabled):active');
  else if (shadow(op) !== 'var(--dp-hl), var(--dp-tint), var(--dp-ring-c)') bad.push(':root .eg-opt:not(:disabled):active 의 box-shadow 가 눌림 문법이 아님: ' + shadow(op));
  return bad;
}
function checkRestoreFocus(css) {
  const bad = [];
  const text = restoreBlockText(css);
  if (text === null) return ['상태 색 복원 블록(머리 주석)이 없거나 둘 이상'];
  const blk = parseCss(text);
  RESTORE_FOCUS.forEach((sel) => {
    const rule = blk.rules.find((x) => x.selectors.includes(sel));
    if (!rule) { bad.push('포커스 복원 규칙이 없음: ' + sel); return; }
    const sh = rule.decls.find((d) => d.prop === 'box-shadow');
    const ring = sh ? shadowLayers(sh.value).filter((l) => !l.inset && l.x === 0 && l.y === 0 && l.blur === 0 && l.spread === 6 && /#fff(fff)?\b/i.test(l.raw)) : [];
    if (ring.length !== 1) bad.push(sel + ' 의 box-shadow 에 흰 바깥 고리(0 0 0 6px #fff)가 정확히 하나 있어야 함');
  });
  return bad;
}
/** 선택자 우선순위(아이디, 클래스·속성·의사클래스, 요소) — :not()·:is() 는 안쪽을 센다. 비교용 한 숫자로 */
function specificity(sel) {
  const t = sel.replace(/:(not|is|where|has)\(([^()]*)\)/g, (m, k, inner) => ' ' + inner + ' ').replace(/::[\w-]+/g, ' x ');
  const ids = (t.match(/#[\w-]+/g) || []).length;
  const cls = (t.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const el = (t.replace(/\[[^\]]*\]/g, '').replace(/[.#:][\w-]+/g, ' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + cls * 100 + el;
}
function hexLum(h) {
  const v = h.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function hexContrast(a, b) {
  const x = hexLum(a);
  const y = hexLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// 가장 어두운 바탕: 고른 칩의 색조 확산 그림자 아래 실제로 잰 점(Review R-D D8, 211·200·251), 카드 아래끝 면색(시안 --dp-panel 아래끝)
const DESC_WORST_BG = '#d3c8fb';
const DESC_PANEL_BOTTOM = '#eee8fd';
function checkRestoreText(css) {
  const bad = [];
  const text = restoreBlockText(css);
  if (text === null) return ['상태 색 복원 블록(머리 주석)이 없거나 둘 이상'];
  const blk = parseCss(text);
  RESTORE_TEXT.forEach((sel) => {
    const rule = blk.rules.find((x) => x.selectors.includes(sel));
    if (!rule) { bad.push('글자색 복구 규칙이 없음: ' + sel); return; }
    const col = rule.decls.find((d) => d.prop === 'color');
    if (!col || !/^#[0-9a-f]{6}$/i.test(col.value)) { bad.push(sel + ' 에 #rrggbb 글자색이 없음'); return; }
    const worst = hexContrast(col.value, DESC_WORST_BG);
    const bottom = hexContrast(col.value, DESC_PANEL_BOTTOM);
    if (worst < 4.8) bad.push(sel + ' 글자색 ' + col.value + ' 의 최악 바탕(' + DESC_WORST_BG + ') 대비가 4.8 미만: ' + worst.toFixed(2));
    if (bottom < 4.5) bad.push(sel + ' 글자색 ' + col.value + ' 의 카드 아래끝(' + DESC_PANEL_BOTTOM + ') 대비가 4.5 미만: ' + bottom.toFixed(2));
    // 같은 색상 계열(남보라: 파랑 성분이 가장 크고 빨강보다 40 이상 큼) — 다른 색으로 바뀌지 않게
    const n = parseInt(col.value.slice(1), 16);
    const r = n >> 16;
    const g = (n >> 8) & 255;
    const b = n & 255;
    if (!(b > g && b - r >= 40)) bad.push(sel + ' 글자색 ' + col.value + ' 이 남보라 계열이 아님');
  });
  return bad;
}

// ⑪ 재미 2개를 끄는 변수가 :root 에 있고, animation 값이 그 변수 하나로만 되어 있다(none 으로 바꾸면 꺼진다)
function checkFxVars(css) {
  const bad = [];
  const m = parseCss(css);
  const vars = rootVars(m);
  ['--dp-fx-sweep', '--dp-fx-shine'].forEach((name) => {
    if (!(name in vars)) bad.push(name + ' 이(가) :root 에 없음');
    if (!m.rules.some((r) => !isRootVars(r) && r.decls.some((d) => d.prop === 'animation' && d.value === 'var(' + name + ')'))) bad.push('animation: var(' + name + ') 을 쓰는 규칙이 없음');
  });
  return bad;
}

/* ---------- 도우미 ---------- */
function mutate(css, from, to) {
  assert.ok(css.includes(from), '변이 대상 문자열이 CSS 에 없음(시험이 헛돈다): ' + from);
  return css.replace(from, to);
}
// 같은 문자열이 여러 곳에 있을 때(예: 상태 복원 블록이 가드 선택자를 다시 쓴다) 모두 바꾼다
function mutateAll(css, from, to) {
  assert.ok(css.includes(from), '변이 대상 문자열이 CSS 에 없음(시험이 헛돈다): ' + from);
  return css.split(from).join(to);
}
const append = (css, extra) => css + '\n' + extra + '\n';
const fails = (list, needle) => list.length > 0 && (!needle || list.some((x) => x.includes(needle)));
const GOOD = ':root { --a: 1px; }\n:root .btn { color: red; box-shadow: 0 0 0 1px #000, 0 8px 24px rgba(0, 0, 0, .2); }\n';

/* ===== ① 파일·두 앱 동일·링크 순서 ===== */
test('ui-depth.css: 파일이 있고 두 앱(일반용·교육용)에서 바이트까지 같다', () => {
  assert.ok(fs.existsSync(CSS_PATH), 'ui-depth.css 가 없음');
  const a = fs.readFileSync(path.join(APPS, 'element-gems', 'ui-depth.css'));
  const b = fs.readFileSync(path.join(APPS, 'element-gems-edu', 'ui-depth.css'));
  assert.ok(a.length > 5000, '파일이 비정상적으로 작음');
  assert.ok(a.equals(b), '일반용·교육용 ui-depth.css 가 다름(바이트 동일이어야 함)');
});

test('index.html: ui-depth.css 가 마지막 스타일시트다(교육용은 edu.css 뒤 + [EDU] 표식)', () => {
  assert.deepStrictEqual(checkLinks(HTML, IS_EDU), []);
  // 두 앱을 모두 확인(어느 쪽 시험에서 돌려도 같은 결과)
  assert.deepStrictEqual(checkLinks(fs.readFileSync(path.join(APPS, 'element-gems', 'index.html'), 'utf8'), false), []);
  assert.deepStrictEqual(checkLinks(fs.readFileSync(path.join(APPS, 'element-gems-edu', 'index.html'), 'utf8'), true), []);
});

test('링크 검사기: 순서·표식·<style> 뒤따름을 잡는다 (긍정·부정 예시 + 변이)', () => {
  const g = '<head>\n<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="ui-depth.css">\n</head>';
  const e = '<head>\n<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="edu.css">\n<!-- [EDU] 받침 없는 UI -->\n<link rel="stylesheet" href="ui-depth.css">\n</head>';
  assert.deepStrictEqual(checkLinks(g, false), []);
  assert.deepStrictEqual(checkLinks(e, true), []);
  assert.ok(fails(checkLinks(g.replace('style.css', 'other.css'), false), '순서'));
  assert.ok(fails(checkLinks(g.replace('</head>', '<link rel="stylesheet" href="late.css">\n</head>'), false), '마지막'));
  assert.ok(fails(checkLinks(g.replace('</head>', '<style>.a{}</style>\n</head>'), false), '<style>'));
  assert.ok(fails(checkLinks(e.replace('<!-- [EDU] 받침 없는 UI -->\n', ''), true), '[EDU]'));
  assert.ok(fails(checkLinks(g, true), '순서'), '일반용 모양을 교육용으로 검사하면 edu.css 가 빠져 실패해야 함');
  assert.ok(fails(checkLinks(g.replace('<link rel="stylesheet" href="ui-depth.css">', ''), false)));
  // 실제 index.html 변이: 링크를 빼거나, style.css 앞으로 옮기면 실패
  const link = '<link rel="stylesheet" href="ui-depth.css">\n';
  assert.ok(HTML.includes(link));
  assert.ok(fails(checkLinks(HTML.replace(link, ''), IS_EDU)), '링크를 빼면 실패해야 함');
  const early = HTML.replace(link, '').replace('<link rel="stylesheet" href="style.css">', link + '<link rel="stylesheet" href="style.css">');
  assert.ok(fails(checkLinks(early, IS_EDU), '순서'), '링크를 style.css 앞으로 옮기면 실패해야 함');
});

/* ===== ② :root 접두어 · 강제 선언·외부 주소·url()·@font-face·@import 0 ===== */
test('규칙 ②: 모든 선택자가 ":root " 접두어(:root 변수 블록 예외), 강제 선언·외부 주소·url(·@font-face·@import 0', () => {
  assert.deepStrictEqual(checkPrefix(CSS), []);
  assert.deepStrictEqual(checkBasics(CSS), []);
  const m = parseCss(CSS);
  assert.deepStrictEqual(m.errors, [], '해석 오류');
  assert.ok(m.rules.length > 60, '규칙 수가 이상함: ' + m.rules.length);
});

test('규칙 ② 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkPrefix(GOOD), []);
  assert.deepStrictEqual(checkBasics(GOOD), []);
  assert.ok(fails(checkPrefix(append(GOOD, '.btn { color: red; }')), '접두어'));
  assert.ok(fails(checkPrefix(append(GOOD, ':root { width: 1px; }')), '변수'));
  assert.ok(fails(checkPrefix(append(GOOD, ':root .a, .b { color: red; }')), '.b'));
  assert.ok(fails(checkPrefix(append(GOOD, '@media (min-width: 1px) { .c { color: red; } }')), '.c'));
  assert.ok(fails(checkPrefix(append(GOOD, ':root .a { color: red;')), '해석'));
  // 변이: 실제 파일
  assert.ok(fails(checkPrefix(append(CSS, '.btn { color: red; }')), '접두어'));
  assert.ok(fails(checkPrefix(mutate(CSS, ':root .best-line,', '.best-line,')), '.best-line'));
  assert.ok(fails(checkBasics(append(CSS, ':root .btn { color: red !important; }')), '강제'));
  assert.ok(fails(checkBasics(append(CSS, ':root .btn { color: red ! important; }')), '강제'));
  assert.ok(fails(checkBasics(append(CSS, ':root .btn { background: url(x.png); }')), 'url('));
  assert.ok(fails(checkBasics(append(CSS, '@font-face { font-family: x; }')), '@font-face'));
  assert.ok(fails(checkBasics(append(CSS, '@import "x.css";')), '@import'));
  assert.ok(fails(checkBasics(append(CSS, ':root .btn { background: #fff; /* 주석 */ }\n:root .x { cursor: pointer; --u: "https://example.com"; }')), '외부 주소'));
  // 주석 안의 글자는 세지 않는다
  assert.deepStrictEqual(checkBasics(append(CSS, '/* !important http://x url(a) @import @font-face */')), []);
});

/* ===== ③ 흐림·필터 0 ===== */
test('규칙 ③: backdrop-filter·filter·blur( 가 파일 전체(주석 제외)에 0', () => {
  assert.deepStrictEqual(checkNoFilter(CSS), []);
});

test('규칙 ③ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkNoFilter(GOOD), []);
  assert.ok(fails(checkNoFilter(append(CSS, ':root .board { filter: blur(2px); }')), 'filter'));
  assert.ok(fails(checkNoFilter(append(CSS, ':root .panel { backdrop-filter: blur(6px); }')), 'filter'));
  assert.ok(fails(checkNoFilter(append(CSS, ':root .panel { -webkit-backdrop-filter: saturate(1.4); }')), 'filter'));
  assert.ok(fails(checkNoFilter(append(CSS, ':root .panel { --x: blur(3px); }')), 'blur('));
  assert.deepStrictEqual(checkNoFilter(append(CSS, '/* filter blur( backdrop-filter 는 없다 */')), []);
});

/* ===== ④ 보드·타일·플레이 HUD ===== */
test('규칙 ④: 보드·타일·플레이 HUD 선택자에 transition·무한 애니메이션이 없다', () => {
  assert.deepStrictEqual(checkHud(CSS), []);
  const m = parseCss(CSS);
  const hudRules = m.rules.filter((r) => r.selectors.some((s) => HUD_RE.test(s)));
  assert.ok(hudRules.length >= 8, 'HUD 규칙을 찾지 못함(검사기가 헛돈다): ' + hudRules.length);
});

test('규칙 ④ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkHud(append(GOOD, ':root .gem { box-shadow: 0 0 0 1px #000; }')), []);
  assert.deepStrictEqual(checkHud(append(GOOD, ':root .board-wrapper { transition: opacity 1s; }')), [], '.board-wrapper 는 HUD 목록의 .board 가 아니다');
  assert.ok(fails(checkHud(append(CSS, ':root .gem { transition: transform .2s; }')), 'transition'));
  HUD.forEach((h) => assert.ok(fails(checkHud(append(CSS, ':root ' + h + ':hover { transition: all .1s; }')), 'transition'), h));
  assert.ok(fails(checkHud(append(CSS, ':root .timer { animation: foo 1s linear infinite; }')), '무한'));
  assert.ok(fails(checkHud(append(CSS, ':root .gauge::after { animation: var(--dp-fx-shine); }')), '무한'), 'var 로 가린 infinite 도 잡아야 함');
  assert.deepStrictEqual(checkHud(append(CSS, ':root .gauge::after { animation: foo 1s linear 1; }')), []);
});

/* ===== ⑤ 애니메이션 ===== */
test('규칙 ⑤: 새 @keyframes 는 허용 이름뿐 · 무한 반복은 #btn-start 뿐 · 움직임 줄이기에서 모두 정지', () => {
  assert.deepStrictEqual(checkMotion(CSS), []);
  const m = parseCss(CSS);
  assert.deepStrictEqual(m.keyframes.map((k) => k.name).sort(), ALLOWED_KEYFRAMES.slice().sort());
  const infinite = m.rules.filter((r) => !isRootVars(r) && r.decls.some((d) => /^animation/.test(d.prop) && /infinite/.test(resolveVars(d.value, rootVars(m)))));
  assert.deepStrictEqual(infinite.map(where), [':root .menu-screen #btn-start::after']);
});

test('규칙 ⑤ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkMotion(GOOD + '@keyframes dpSweep { 0% { opacity: 0; } }\n'), []);
  assert.ok(fails(checkMotion(append(CSS, '@keyframes dpNew { 0% { opacity: 0; } 100% { opacity: 1; } }')), 'dpNew'));
  assert.ok(fails(checkMotion(append(CSS, ':root .hr::after { animation: dpSweep 1s linear infinite; }')), '#btn-start'));
  assert.ok(fails(checkMotion(append(CSS, ':root .hr::after { animation-iteration-count: infinite; }')), '#btn-start'));
  assert.ok(fails(checkMotion(append(CSS, ':root .hr::after { animation: dpSweep 1s linear 1; }')), '멈추지 않는'));
  assert.ok(fails(checkMotion(mutate(CSS, 'animation: none; opacity: 0;', 'opacity: 0;')), '멈추지 않는'));
  assert.ok(fails(checkMotion(append(CSS, ':root .hr:active { transform: scale(.9); }')), '크기 변화'));
  assert.ok(fails(checkMotion(mutate(CSS, ':root .eg-chip:active, :root .eg-amt:active { transform: none; }', ':root .eg-chip:active { transform: none; }')), '크기 변화'));
  // 무한 애니메이션을 새로 만들지 않고 변수 값만 바꿔도 잡는다
  assert.ok(fails(checkMotion(mutate(CSS, '--dp-fx-sweep: dpSweep 300ms ease-out 1 both;', '--dp-fx-sweep: dpSweep 300ms ease-out infinite both;')), '#btn-start'));
});

/* ===== ⑥ 받침 없음 ===== */
test('규칙 ⑥: 블러 0 오프셋 그림자·안쪽 아래 띠·한쪽만 두꺼운 테두리가 0 (윗 하이라이트 --dp-hl 만 예외)', () => {
  assert.deepStrictEqual(checkNoLip(CSS), []);
  const m = parseCss(CSS);
  const vars = rootVars(m);
  assert.strictEqual(vars['--dp-hl'], 'inset 0 1px 0 rgba(255, 255, 255, .95)', '--dp-hl 은 윗 1px 하이라이트 그대로여야 함');
  assert.ok(m.rules.reduce((n, r) => n + r.decls.filter((d) => d.prop === 'box-shadow').length, 0) > 60, 'box-shadow 선언을 충분히 읽지 못함');
});

test('규칙 ⑥ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkNoLip(GOOD), []);
  assert.deepStrictEqual(checkNoLip(append(GOOD, ':root .btn { box-shadow: 0 0 0 3px #fff, inset 0 0 0 999px rgba(0, 0, 0, .1), 0 0 14px 4px #ff0; }')), [], '방향 없는 링·글로우는 받침이 아니다');
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: 0 4px 0 #333; }')), '받침'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: 4px 0 0 #333; }')), '받침'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: 0 4px #333; }')), '받침'), '블러를 생략한 꼴');
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: 0 1px 0 1px #333; }')), '받침'), 'spread 가 있어도 오프셋이면 받침');
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: inset 0 -3px 0 #333; }')), '받침'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { box-shadow: inset 0 2px 0 rgba(255, 255, 255, .8); }')), '받침'), 'inset 윗 줄도 --dp-hl 변수 밖에서는 받침으로 본다');
  assert.ok(fails(checkNoLip(append(CSS, ':root { --dp-x: 0 6px 0 #333; }')), '받침'), '변수 안의 받침도 잡는다');
  assert.ok(fails(checkNoLip(mutate(CSS, '--dp-hl: inset 0 1px 0', '--dp-hl: inset 0 3px 0')), '받침'));
  assert.ok(fails(checkNoLip(mutate(CSS, '--dp-hl: inset 0 1px 0', '--dp-hl: inset 0 -1px 0')), '받침'));
  assert.ok(fails(checkNoLip(append(CSS, '@keyframes stagePulse { 0% { box-shadow: 0 3px 0 #5b1a78; } }')), '받침'), '@keyframes 안의 받침도 잡는다');
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { border-bottom: 4px solid #333; }')), '테두리'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { border-left-width: 3px; }')), '테두리'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .btn { border-width: 1px 1px 4px; }')), '테두리'));
  assert.deepStrictEqual(checkNoLip(append(GOOD, ':root .btn { border-bottom: 1px solid #333; border-width: 2px; }')), [], '얇은 테두리·사방 같은 두께는 이 규칙의 대상이 아니다');
  assert.deepStrictEqual(checkNoLip(append(GOOD, ':root .btn { text-shadow: 0 3px 0 #333; }')), [], '글자 그림자는 이번 범위 밖(spec 49.9)');
});

/* ===== ⑦ 레이아웃 선언 0 ===== */
test('규칙 ⑦: 레이아웃 선언이 0이고, 예외는 명시된 4곳(선택칩 본체·빛줄기, [시작] 본체·광택)뿐이다', () => {
  const r = layoutScan(CSS);
  assert.deepStrictEqual(r.bad, []);
  assert.deepStrictEqual(Array.from(r.used).sort(), LAYOUT_EXCEPTIONS.map((e) => e.name).sort(), '실제로 쓰인 예외가 4곳과 다름');
  // 예외를 쓴 규칙의 선택자가 정확히 아래 목록인지(더 있으면 보고 대상)
  const m = parseCss(CSS);
  const sels = new Set();
  m.rules.forEach((rule) => { if (rule.decls.some((d) => LAYOUT_PROP.test(d.prop))) rule.selectors.forEach((s) => sels.add(s)); });
  assert.deepStrictEqual(Array.from(sels).sort(), [
    ':root .hf-tab[aria-selected="true"]', ':root .hf-tab[aria-selected="true"]::after', ':root .level-btn.on', ':root .level-btn.on::after',
    ':root .menu-screen #btn-start', ':root .menu-screen #btn-start::after'
  ].sort());
});

test('규칙 ⑦ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(layoutScan(GOOD).bad, []);
  ['width: 10px', 'height: 10px', 'min-width: 44px', 'max-height: 9px', 'padding: 4px', 'padding-top: 1px', 'margin: 0 auto', 'margin-left: 3px', 'border-width: 2px', 'border: 1px solid #000',
    'border-bottom: 1px solid #000', 'gap: 4px', 'display: none', 'grid-template-columns: 1fr', 'flex: 1', 'flex-direction: row', 'inset: 0', 'top: 1px', 'left: 2px', 'right: 0', 'bottom: 0',
    'font-size: 12px', 'position: absolute', 'overflow: hidden', 'line-height: 1.2', 'content: "x"', 'align-items: center'].forEach((decl) => {
    assert.ok(fails(layoutScan(append(CSS, ':root .btn { ' + decl + '; }')).bad, decl.split(':')[0]), decl);
  });
  // 비레이아웃 선언은 통과
  assert.deepStrictEqual(layoutScan(append(CSS, ':root .btn { border-color: #000; border-radius: 12px; opacity: .5; transform: scale(.98); z-index: 2; pointer-events: none; }')).bad, []);
  // 예외 규칙이라도 허용되지 않은 속성·값은 실패
  assert.ok(fails(layoutScan(append(CSS, ':root .level-btn.on { width: 10px; }')).bad, 'width'));
  assert.ok(fails(layoutScan(append(CSS, ':root .level-btn.on::after { height: 10px; }')).bad, 'height'));
  assert.ok(fails(layoutScan(append(CSS, ':root .menu-screen #btn-start { position: absolute; }')).bad, 'position'));
  assert.ok(fails(layoutScan(mutate(CSS, 'width: 14%', 'width: 400px')).bad, 'width'));
  assert.ok(fails(layoutScan(append(CSS, ':root .btn, :root .level-btn.on { overflow: hidden; }')).bad, 'overflow'), '예외 선택자와 섞인 규칙은 예외가 아니다');
  assert.ok(fails(layoutScan(append(CSS, '@keyframes dpSweep { 0% { width: 1px; } }')).bad, 'dpSweep'));
});

/* ===== ⑧ 투명 테두리 ↔ background-origin ===== */
test('규칙 ⑧: border-color: transparent 가 있는 모든 규칙에 background-origin: border-box 가 있다', () => {
  assert.deepStrictEqual(checkTransparentBorder(CSS), []);
  const n = parseCss(CSS).rules.filter((r) => r.decls.some((d) => d.prop === 'border-color' && /transparent/.test(d.value))).length;
  assert.ok(n >= 15, '투명 테두리 규칙을 충분히 찾지 못함: ' + n);
});

test('규칙 ⑧ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkTransparentBorder(append(GOOD, ':root .a { border-color: transparent; background-origin: border-box; }')), []);
  assert.deepStrictEqual(checkTransparentBorder(append(GOOD, ':root .a { border-color: #fff; }')), []);
  assert.ok(fails(checkTransparentBorder(append(GOOD, ':root .a { border-color: transparent; }')), '.a'));
  assert.ok(fails(checkTransparentBorder(append(GOOD, ':root .a { border-color: transparent; background-origin: padding-box; }')), '.a'));
  assert.ok(fails(checkTransparentBorder(mutate(CSS, 'border-color: transparent; background-origin: border-box;', 'border-color: transparent;')), '투명 테두리'));
});

/* ===== ⑨ 상태 고리 가드 · 호버·눌림이 고른 상태를 덮지 않음 ===== */
test('규칙 ⑨: 상태 고리(.gauge.full·.gauge.aiming·.timer.frozen·.scorebar.dark)는 :not() 가드로 비켜 가고, :hover 는 고른 상태를 덮지 않는다', () => {
  assert.deepStrictEqual(checkStateGuards(CSS), []);
  assert.deepStrictEqual(checkInteractiveStates(CSS), []);
  // :hover 규칙이 실제로 있고 그 대상은 고른 상태가 없는 요소다
  const m = parseCss(CSS);
  const hovers = [];
  m.rules.forEach((r) => r.selectors.forEach((s) => { if (/:hover/.test(s)) hovers.push(s); }));
  assert.ok(hovers.length >= 3, ':hover 규칙을 찾지 못함');
});

test('규칙 ⑨ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  const sel = ':root .chip.on { color: red; }\n:root .chip[aria-selected="true"] { color: red; }\n';
  assert.deepStrictEqual(checkInteractiveStates(GOOD + sel + ':root .btn:hover { color: blue; }\n'), []);
  assert.deepStrictEqual(checkInteractiveStates(GOOD + sel + ':root .chip:hover:not(.on) { color: blue; }\n'), [], ':not(.on) 가드가 있으면 통과');
  assert.deepStrictEqual(checkInteractiveStates(GOOD + sel + ':root .chip:active:not([aria-selected="true"]) { color: blue; }\n'), []);
  assert.ok(fails(checkInteractiveStates(GOOD + sel + ':root .chip:hover { color: blue; }\n'), '.chip'));
  assert.ok(fails(checkInteractiveStates(GOOD + sel + ':root .chip:active { color: blue; }\n'), '.chip'));
  // 변이: 실제 파일에 호버가 선택 상태를 덮는 규칙을 추가
  assert.ok(fails(checkInteractiveStates(append(CSS, ':root .level-btn:hover { box-shadow: 0 0 0 1px #000; }')), '.level-btn'));
  assert.ok(fails(checkInteractiveStates(append(CSS, ':root .hf-tab:hover { background: #fff; }')), '.hf-tab'));
  assert.ok(fails(checkInteractiveStates(append(CSS, ':root .eg-chip:hover { background: #fff; }')), '.eg-chip'), '알려진 예외는 :active 뿐이고 :hover 에는 없다');
  assert.deepStrictEqual(checkInteractiveStates(append(CSS, ':root .level-btn:hover:not(.on) { background: #fff; }')), []);
  // 상태 고리 가드
  assert.deepStrictEqual(checkStateGuards(GOOD + ':root .gauge:not(.full):not(.aiming), :root .timer:not(.frozen), :root .scorebar:not(.dark) { color: red; }\n'), []);
  assert.ok(fails(checkStateGuards(append(CSS, ':root .gauge.full { box-shadow: none; }')), '.full'));
  assert.ok(fails(checkStateGuards(append(CSS, ':root .gauge.aiming::after { color: red; }')), '.aiming'));
  assert.ok(fails(checkStateGuards(append(CSS, ':root .timer.frozen { color: red; }')), '.frozen'));
  assert.ok(fails(checkStateGuards(append(CSS, ':root .scorebar.dark { color: red; }')), '.dark'));
  assert.ok(fails(checkStateGuards(mutateAll(CSS, ':root .gauge:not(.full):not(.aiming)', ':root .gauge')), '가드가 없음'));
  assert.ok(fails(checkStateGuards(mutateAll(CSS, ':root .timer:not(.frozen)', ':root .timer')), '가드가 없음'));
  assert.ok(fails(checkStateGuards(mutateAll(CSS, ':root .scorebar:not(.dark)', ':root .scorebar')), '가드가 없음'));
});

/* ===== ⑩ 눌림 어둡게 하기 스프레드 ===== */
test('규칙 ⑩: --dp-tint 의 안쪽 그림자 스프레드가 200px 이상이다 (버튼 크기와 무관하게 면 전체를 덮는다)', () => {
  assert.deepStrictEqual(checkTint(CSS), []);
  assert.strictEqual(shadowLayers(rootVars(parseCss(CSS))['--dp-tint'])[0].spread, 999);
});

test('규칙 ⑩ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkTint(':root { --dp-tint: inset 0 0 0 999px rgba(0, 0, 0, .1); }\n:root .btn:active { box-shadow: var(--dp-tint); }\n'), []);
  assert.ok(fails(checkTint(':root { --dp-tint: inset 0 0 0 40px rgba(0, 0, 0, .1); }\n:root .btn:active { box-shadow: var(--dp-tint); }\n'), '200px'));
  assert.ok(fails(checkTint(':root { --a: 1px; }'), '--dp-tint'));
  assert.ok(fails(checkTint(mutate(CSS, 'inset 0 0 0 999px', 'inset 0 0 0 40px')), '200px'));
  assert.ok(fails(checkTint(mutate(CSS, 'inset 0 0 0 999px', 'inset 0 0 0 199px')), '200px'));
  assert.deepStrictEqual(checkTint(mutate(CSS, 'inset 0 0 0 999px', 'inset 0 0 0 200px')), [], '200px 는 경계값으로 통과');
  assert.ok(fails(checkTint(mutate(CSS, '--dp-tint: inset 0 0 0 999px', '--dp-tint: 0 0 0 999px')), '--dp-tint'), 'inset 이 빠지면 면 안쪽을 덮지 못한다');
  assert.ok(fails(checkTint(CSS.split('var(--dp-tint)').join('none')), '쓰는'));
});

/* ===== ⑪ 재미 2개 끄기 변수 ===== */
test('규칙 ⑪: --dp-fx-sweep·--dp-fx-shine 이 :root 에 있고 animation 값이 그 변수 하나뿐이다 (기본은 둘 다 켜짐)', () => {
  assert.deepStrictEqual(checkFxVars(CSS), []);
  const v = rootVars(parseCss(CSS));
  assert.ok(/^dpSweep\b/.test(v['--dp-fx-sweep']) && !/\bnone\b/.test(v['--dp-fx-sweep']), '빛줄기는 기본 켜짐');
  assert.ok(/^dpShine\b/.test(v['--dp-fx-shine']) && /\binfinite\b/.test(v['--dp-fx-shine']), '광택은 기본 켜짐(7초에 1회)');
  assert.ok(/\b7s\b/.test(v['--dp-fx-shine']), '광택 주기 7초');
});

test('규칙 ⑪ 검사기: 변수를 지우거나 우회하면 잡고, none 으로 끄면 다른 규칙이 모두 그대로 통과한다', () => {
  assert.ok(fails(checkFxVars(mutate(CSS, '--dp-fx-sweep: dpSweep', '--dp-fx-sweep-x: dpSweep')), '--dp-fx-sweep'));
  assert.ok(fails(checkFxVars(mutate(CSS, '--dp-fx-shine: dpShine', '--dp-fx-shine-x: dpShine')), '--dp-fx-shine'));
  assert.ok(fails(checkFxVars(mutate(CSS, 'animation: var(--dp-fx-shine);', 'animation: dpShine 7s linear infinite;')), 'var(--dp-fx-shine)'));
  // 끄는 법: 값을 none 으로 바꿔도 모든 검사가 통과해야 한다
  let off = mutate(CSS, /--dp-fx-sweep: [^;]+;/.exec(CSS)[0], '--dp-fx-sweep: none;');
  off = mutate(off, /--dp-fx-shine: [^;]+;/.exec(off)[0], '--dp-fx-shine: none;');
  [checkPrefix, checkBasics, checkNoFilter, checkHud, checkMotion, checkNoLip, checkTransparentBorder, checkStateGuards, checkInteractiveStates, checkTint, checkFxVars, checkOpaqueFaces].forEach((fn) => assert.deepStrictEqual(fn(off), [], fn.name));
  assert.deepStrictEqual(layoutScan(off).bad, []);
});

/* ===== ⑫ 면은 불투명(알파 < .96 면 0) ===== */
test('규칙 ⑫: 모든 면(background 맨 아래 층)이 알파 .96 이상이다 — 풍경이 면 안으로 비치지 않는다', () => {
  assert.deepStrictEqual(checkOpaqueFaces(CSS), []);
  const m = parseCss(CSS);
  const n = m.rules.reduce((k, r) => k + r.decls.filter((d) => /^background(-color|-image)?$/.test(d.prop)).length, 0);
  assert.ok(n >= 10, 'background 선언을 충분히 읽지 못함: ' + n);
  // 좌상단 반사광은 위 층이라 투명해도 되고, 아래 층(--dp-panel)이 불투명이다
  assert.ok(layerAlphas(rootVars(m)['--dp-glint']).some((a) => a < MIN_FACE_ALPHA), '--dp-glint 는 투명 장식 층');
});

test('규칙 ⑫ 검사기: 긍정·부정 예시와 변이를 구분한다', () => {
  assert.deepStrictEqual(checkOpaqueFaces(GOOD + ':root .a { background: #fff; }\n:root .b { background: radial-gradient(at 0 0, rgba(255, 255, 255, .55), transparent 55%), #eef; }\n'), [], '위 층의 반투명 반사광은 허용');
  assert.deepStrictEqual(checkOpaqueFaces(GOOD + ':root .a { background: rgba(255, 255, 255, .96); }\n'), [], '경계값 .96 은 통과');
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background: rgba(255, 255, 255, .9); }\n'), '.a'));
  assert.ok(fails(checkOpaqueFaces(append(CSS, ':root .hr::after { background: rgba(255, 255, 255, .5); }')), '.hr::after'), '빛줄기·광택 두 곳 밖의 투명 ::after 는 잡는다');
  assert.ok(fails(checkOpaqueFaces(append(CSS, ':root .level-btn.on::after { background: #fff; }\n:root .menu-screen .x { background: rgba(0, 0, 0, .5); }')), '.x'));
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background-color: rgb(255 255 255 / .8); }\n'), '.a'));
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background: #ffffff99; }\n'), '.a'));
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background: rgb(255 255 255 / 50%); }\n'), '.a'), '알파를 % 로 쓴 반투명도 잡는다');
  assert.deepStrictEqual(checkOpaqueFaces(GOOD + ':root .a { background: rgb(255 255 255 / 100%); }\n'), [], '알파 100% 는 통과');
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { opacity: .9; }\n'), 'opacity'), '면 전체 opacity 로 비치게 하는 것도 잡는다');
  assert.deepStrictEqual(checkOpaqueFaces(GOOD + ':root .a { opacity: .96; }\n@media screen and (prefers-reduced-motion: reduce) { :root .b::after { opacity: 0; } }\n@keyframes k { 0% { opacity: 0; } 100% { opacity: 1; } }\n'), [], '경계값 .96·@media 안·keyframes 의 opacity 는 대상이 아니다');
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background: linear-gradient(180deg, #fff, transparent); }\n'), '.a'));
  assert.ok(fails(checkOpaqueFaces(GOOD + ':root .a { background: #fff, rgba(255, 255, 255, .5); }\n'), '.a'), '맨 아래 층이 반투명이면 실패');
  // 변이: 실제 파일(면 변수·직접 선언·변수로 가린 경우)
  assert.ok(fails(checkOpaqueFaces(mutate(CSS, '--dp-info: linear-gradient(180deg, #ffffff 0%, #eef6ff 100%);', '--dp-info: linear-gradient(180deg, rgba(255, 255, 255, .9) 0%, rgba(238, 246, 255, .9) 100%);')), '--dp-info'));
  assert.ok(fails(checkOpaqueFaces(append(CSS, ':root .panel { background: rgba(255, 255, 255, .9); }')), '.panel'));
  assert.ok(fails(checkOpaqueFaces(mutate(CSS, '.sc-stars, :root .stage-card .sc-stars, :root .gauge .count, :root .menu-screen .gauge .count { background: #ffffff; }', '.sc-stars, :root .stage-card .sc-stars, :root .gauge .count, :root .menu-screen .gauge .count { background: rgba(255, 255, 255, .88); }')), '.count'));
});

/* ===== ⑬·⑭ 상태 색 복원 블록 ===== */
const ORIGINALS = {
  'style.css': fs.readFileSync(path.join(APPS, 'element-gems', 'style.css'), 'utf8'),
  'edu.css': fs.readFileSync(path.join(APPS, 'element-gems-edu', 'edu.css'), 'utf8')
};
test('규칙 ⑬: 상태 색 복원 블록이 있고, 배경이 원본 style.css·edu.css 의 상태 규칙 background 와 같은 문자열이며 받침이 없다', () => {
  assert.deepStrictEqual(checkRestore(CSS, ORIGINALS), []);
  const text = restoreBlockText(CSS);
  assert.ok(text && text.length > 400, '복원 블록이 비정상적으로 작음');
  // 복원 블록은 파일 맨 끝에 있고, 그 뒤에는 규칙만 이어진다(본문 규칙보다 나중에 읽혀 우선순위가 같을 때 이긴다)
  assert.ok(CSS.indexOf(RESTORE_MARK) > CSS.lastIndexOf('@media screen and (prefers-reduced-motion: reduce)'), '복원 블록이 움직임 줄이기 블록보다 앞에 있음');
  assert.deepStrictEqual(checkNoLip(text), [], '복원 블록에 받침이 있음');
  RESTORE_COLORS.forEach((r) => assert.ok(originalBackground(ORIGINALS[r.file], r.orig), '원본에서 못 찾음: ' + r.orig));
  // 복원 대상 4곳의 원본 값(원본이 바뀌면 이 단언이 알려 준다)
  assert.strictEqual(originalBackground(ORIGINALS['style.css'], '.m-chip.done'), 'linear-gradient(180deg, #d4fbe6 0%, #a8f0c8 100%)');
  assert.strictEqual(originalBackground(ORIGINALS['style.css'], '#end-title.clear'), 'linear-gradient(180deg, #ffe97a, #ffb21a)');
  assert.strictEqual(originalBackground(ORIGINALS['edu.css'], '.learn-chip.done'), 'linear-gradient(180deg, #d4fbe6 0%, #a8f0c8 100%)');
  assert.strictEqual(originalBackground(ORIGINALS['style.css'], '.menu-screen .howto-btn[aria-expanded="true"]'), '#fff4cc');
  // D9 교육용 문제 칩 기본 면: 원본 크림 그대로, 정보 줄 그룹에서 빠지지 않고(시안 규칙은 그대로) 끝 블록이 되살리며, 완료(.done, 초록)가 계속 이긴다
  assert.strictEqual(originalBackground(ORIGINALS['edu.css'], '.learn-chip'), '#fff1b8');
  const m = parseCss(text);
  const chip = m.rules.find((r) => r.selectors.includes(':root .learn-chip'));
  assert.ok(chip, ':root .learn-chip 복원 규칙이 없음');
  assert.strictEqual(chip.decls.find((d) => d.prop === 'box-shadow').value, 'var(--dp-hl), 0 0 0 1px rgba(170, 120, 0, .42), var(--dp-sh-a)', '크림 링·바탕 그림자(받침 없음)');
  assert.ok(specificity(':root .learn-chip.done') > specificity(':root .learn-chip'), '완료 상태 선택자가 기본 선택자보다 구체적이어야 크림에 다시 덮이지 않음');
  assert.ok(parseCss(CSS).rules.some((r) => r.ctx.length === 0 && r.selectors.includes(':root .learn-chip') && r.decls.some((d) => d.prop === 'background' && d.value === 'var(--dp-info)')), '시안의 정보 줄 규칙(:root .learn-chip)은 그대로 있어야 함');
});

test('규칙 ⑬ 검사기: 블록 삭제·배경 한 글자·받침·목록 밖 규칙·원본 변경을 잡는다 (긍정·부정 예시 + 변이)', () => {
  const MARK = RESTORE_MARK;
  const i = CSS.indexOf(MARK);
  const text = CSS.slice(i);
  // 변이 1: 복원 블록 삭제
  assert.ok(fails(checkRestore(CSS.slice(0, i), ORIGINALS), '복원 블록'));
  assert.ok(fails(checkRestore(CSS + '\n' + MARK + ' 두 번째 ---------- */\n', ORIGINALS), '복원 블록'), '블록이 둘이면 실패');
  // 변이 2: 규칙 하나만 삭제
  assert.ok(fails(checkRestore(mutate(CSS, ':root #end-title.clear { background: linear-gradient(180deg, #ffe97a, #ffb21a); background-origin: border-box; }', ''), ORIGINALS), '#end-title.clear'));
  // 변이 3: 배경 한 글자 변경(4곳 모두)
  assert.ok(fails(checkRestore(mutate(CSS, ':root .m-chip.done { background: linear-gradient(180deg, #d4fbe6 0%', ':root .m-chip.done { background: linear-gradient(180deg, #d4fbe7 0%'), ORIGINALS), '원본과 다름'));
  assert.ok(fails(checkRestore(mutate(CSS, 'linear-gradient(180deg, #ffe97a, #ffb21a); background-origin', 'linear-gradient(180deg, #ffe97a, #ffb21b); background-origin'), ORIGINALS), '원본과 다름'));
  assert.ok(fails(checkRestore(mutate(CSS, ':root .learn-chip.done { background: linear-gradient(180deg, #d4fbe6 0%, #a8f0c8 100%)', ':root .learn-chip.done { background: linear-gradient(180deg, #d4fbe6 0%, #a8f0c9 100%)'), ORIGINALS), '원본과 다름'));
  assert.ok(fails(checkRestore(mutate(CSS, 'background: #fff4cc;', 'background: #fff4cd;'), ORIGINALS), '원본과 다름'));
  // 변이 4: background-origin 제거
  assert.ok(fails(checkRestore(mutate(CSS, ':root #end-title.clear { background: linear-gradient(180deg, #ffe97a, #ffb21a); background-origin: border-box; }', ':root #end-title.clear { background: linear-gradient(180deg, #ffe97a, #ffb21a); }'), ORIGINALS), 'background-origin'));
  // 변이 5: 목록 밖 규칙 추가
  assert.ok(fails(checkRestore(append(CSS, ':root .foo { color: red; }'), ORIGINALS), '목록 밖'));
  // 변이 6: 원본이 바뀐 경우(원본 문자열이 달라지면 시험이 알려 준다)
  assert.ok(fails(checkRestore(CSS, { 'style.css': ORIGINALS['style.css'].replace('#d4fbe6 0%, #a8f0c8 100%', '#d4fbe7 0%, #a8f0c8 100%'), 'edu.css': ORIGINALS['edu.css'] }), '원본과 다름'));
  assert.ok(fails(checkRestore(CSS, { 'style.css': ORIGINALS['style.css'], 'edu.css': ORIGINALS['edu.css'].replace(/\.learn-chip\.done \{/g, '.learn-chip.done2 {') }), '찾지 못함'));
  // 변이 7: 복원 블록에 받침(원본의 받침 그림자를 그대로 복사)을 넣으면 받침 검사가 잡는다
  assert.ok(fails(checkNoLip(append(text, ':root .learn-chip.done { box-shadow: inset 0 3px 6px rgba(15, 122, 67, .14), 0 3px 0 rgba(15, 122, 67, .45), 0 6px 12px rgba(40, 30, 120, .2); }')), '받침'));
  assert.ok(fails(checkNoLip(append(CSS, ':root .m-chip.done { box-shadow: 0 4px 0 #333; }')), '받침'));
  // D9 변이: 크림 규칙 삭제·배경 한 글자·origin 제거·받침(원본의 0 3px 0)
  const CHIP = ':root .learn-chip { background: #fff1b8; background-origin: border-box; box-shadow: var(--dp-hl), 0 0 0 1px rgba(170, 120, 0, .42), var(--dp-sh-a); }';
  assert.ok(fails(checkRestore(mutate(CSS, CHIP, ''), ORIGINALS), ':root .learn-chip'));
  assert.ok(fails(checkRestore(mutate(CSS, CHIP, CHIP.replace('#fff1b8', '#fff1b9')), ORIGINALS), '원본과 다름'));
  assert.ok(fails(checkRestore(mutate(CSS, CHIP, CHIP.replace(' background-origin: border-box;', '')), ORIGINALS), 'background-origin'));
  assert.ok(fails(checkNoLip(mutate(CSS, CHIP, CHIP.replace('var(--dp-sh-a)', '0 3px 0 rgba(224, 161, 0, .6)'))), '받침'));
  assert.ok(fails(checkOpaqueFaces(mutate(CSS, CHIP, CHIP.replace('#fff1b8', 'rgba(255, 241, 184, .8)'))), ':root .learn-chip'));
  assert.ok(fails(checkRestore(CSS, { 'style.css': ORIGINALS['style.css'], 'edu.css': ORIGINALS['edu.css'].replace('background: #fff1b8;', 'background: #fff1c0;') }), '원본과 다름'), '원본 크림색이 바뀌면 알려 준다');
  // 긍정: 블록 안에 목록의 규칙만 있고 원본과 같으면 통과
  assert.deepStrictEqual(checkRestore(CSS, ORIGINALS), []);
  // 알파 규칙(⑫)도 되살린 원본 그라데이션을 통과시키고, 반투명으로 바꾸면 잡는다
  assert.deepStrictEqual(checkOpaqueFaces(CSS), []);
  assert.ok(fails(checkOpaqueFaces(mutate(CSS, ':root .m-chip.done { background: linear-gradient(180deg, #d4fbe6 0%, #a8f0c8 100%);', ':root .m-chip.done { background: linear-gradient(180deg, rgba(212, 251, 230, .8) 0%, #a8f0c8 100%);')), '.m-chip.done'));
});

test('규칙 ⑭: 키보드 포커스 복원 규칙(.howto-btn·.gauge·.eg-chip.on·.eg-amt.on)이 흰 바깥 고리(0 0 0 6px #fff)를 가진다', () => {
  assert.deepStrictEqual(checkRestoreFocus(CSS), []);
  const m = parseCss(restoreBlockText(CSS));
  const howto = m.rules.find((r) => r.selectors.includes(':root .menu-screen .howto-btn:focus-visible'));
  // 원본: .menu-screen .howto-btn:focus-visible 의 흰 고리와 같은 값
  assert.ok(/\.menu-screen \.howto-btn:focus-visible \{[^}]*box-shadow: 0 0 0 6px #fff;/.test(ORIGINALS['style.css']), '원본의 흰 6px 고리가 바뀜');
  assert.ok(howto.decls.some((d) => d.prop === 'box-shadow' && /0 0 0 6px #fff/.test(d.value)));
});

test('규칙 ⑭ 검사기: 고리 삭제·두께 변경·규칙 삭제를 잡는다 (긍정·부정 예시 + 변이)', () => {
  assert.ok(fails(checkRestoreFocus(mutate(CSS, 'var(--dp-ring-c), 0 0 0 6px #fff, var(--dp-sh-bh)', 'var(--dp-ring-c), var(--dp-sh-bh)')), 'howto-btn'));
  assert.ok(fails(checkRestoreFocus(mutate(CSS, 'var(--dp-ring-i), 0 0 0 6px #fff; }', 'var(--dp-ring-i), 0 0 0 4px #fff; }')), 'gauge'));
  assert.ok(fails(checkRestoreFocus(mutate(CSS, '0 0 0 1px rgba(40, 20, 150, .8), 0 0 0 6px #fff, 0 8px', '0 0 0 1px rgba(40, 20, 150, .8), 0 0 0 6px #eee, 0 8px')), 'eg-chip'));
  assert.ok(fails(checkRestoreFocus(mutate(CSS, '0 0 0 6px #fff, 0 8px 24px rgba(91, 61, 245, .34)', '0 0 0 6px #fff, 0 0 0 6px #fff, 0 8px 24px rgba(91, 61, 245, .34)')), '정확히'), '고리가 둘이면 실패');
  assert.ok(fails(checkRestoreFocus(mutate(CSS, ':root .gauge:not(.full):not(.aiming):focus-visible { box-shadow: var(--dp-hl), var(--dp-ring-i), 0 0 0 6px #fff; }', '')), '없음'));
  assert.ok(fails(checkRestoreFocus(CSS.slice(0, CSS.indexOf(RESTORE_MARK))), '복원 블록'));
  assert.deepStrictEqual(checkRestoreFocus(CSS), []);
});

/* ===== ⑮ 받침 잔존·비활성 복원 ===== */
test('규칙 ⑮: 정령 HUD(.sp-art·.sp-info)·비활성 주요 버튼·문제 보기 눌림이 복원 블록에서 받침 없이 정리되고, 원본의 받침 선택자가 그대로 있다', () => {
  assert.deepStrictEqual(checkRestoreShadows(CSS), []);
  assert.deepStrictEqual(checkNoLip(restoreBlockText(CSS)), [], '복원 블록에 받침이 있음');
  // 이 복원이 필요한 이유(원본에 받침이 있고, 시안 규칙은 이 선택자를 덮지 않는다): 원본이 고쳐지면 이 단언이 알려 주어 복원 규칙을 정리할 수 있다
  assert.ok(/\.sp-art \{[^}]*0 3px 0 rgba\(90, 60, 200, \.35\)/.test(ORIGINALS['style.css']), '원본 .sp-art 의 받침이 바뀜(복원 D1 재점검)');
  assert.ok(/\.sp-info \{[^}]*0 3px 0 rgba\(90, 60, 200, \.35\)/.test(ORIGINALS['style.css']), '원본 .sp-info 의 받침이 바뀜(복원 D1 재점검)');
  if (IS_EDU) assert.ok(/\.eg-opt:not\(:disabled\):active \{[^}]*0 1px 0 var\(--lip\)/.test(ORIGINALS['edu.css']), '원본 .eg-opt:active 의 받침이 바뀜(복원 D3 재점검)');
  // 비활성 값의 출처: 시안의 일반 비활성 규칙이 있고, 그 값이 주요 버튼에도 같게 적용된다
  assert.ok(/:root \.btn\[disabled\], :root \.btn\.cooling \{ box-shadow: 0 0 0 1px rgba\(60, 40, 140, \.14\); \}/.test(CSS));
});

test('규칙 ⑮ 검사기: 규칙 삭제·값 변경·받침 추가·비활성 값 불일치를 잡는다 (긍정·부정 예시 + 변이)', () => {
  assert.deepStrictEqual(checkRestoreShadows(CSS), []);
  assert.ok(fails(checkRestoreShadows(CSS.slice(0, CSS.indexOf(RESTORE_MARK))), '복원 블록'));
  // D1
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .sp-art, :root .sp-info { border-color: transparent; background-origin: border-box; box-shadow: var(--dp-hl), var(--dp-ring-i), var(--dp-sh-a); }', '')), '복원 규칙이 없음'));
  assert.ok(fails(checkRestoreShadows(mutate(CSS, 'box-shadow: var(--dp-hl), var(--dp-ring-i), var(--dp-sh-a); }\n/* D2', 'box-shadow: 0 3px 0 rgba(90, 60, 200, .35); }\n/* D2')), '정보 줄 문법'));
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .sp-art, :root .sp-info { border-color: transparent; background-origin: border-box;', ':root .sp-art, :root .sp-info { border-color: transparent;')), '짝이 없음'));
  assert.ok(fails(checkNoLip(append(restoreBlockText(CSS), ':root .sp-info { box-shadow: 0 3px 0 rgba(90, 60, 200, .35); }')), '받침'));
  // D2
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .btn.primary[disabled], :root .btn.primary.cooling { box-shadow: 0 0 0 1px rgba(60, 40, 140, .14); }', '')), '복원 규칙이 없음'));
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .btn.primary[disabled], :root .btn.primary.cooling { box-shadow: 0 0 0 1px rgba(60, 40, 140, .14); }', ':root .btn.primary[disabled], :root .btn.primary.cooling { box-shadow: 0 0 0 1px rgba(184, 110, 0, .78), 0 10px 26px rgba(255, 150, 0, .4); }')), '일반 비활성 값과 다름'));
  // D3
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .eg-opt:not(:disabled):active { box-shadow: var(--dp-hl), var(--dp-tint), var(--dp-ring-c); }', ':root .eg-opt:not(:disabled):active { box-shadow: 0 1px 0 var(--lip); }')), '눌림 문법'));
  assert.ok(fails(checkRestoreShadows(mutate(CSS, ':root .eg-opt:not(:disabled):active { box-shadow: var(--dp-hl), var(--dp-tint), var(--dp-ring-c); }', '')), '복원 규칙이 없음'));
  // 복원 블록의 목록 밖 규칙 검사(⑬)는 새 선택자를 알고 있고, 모르는 규칙은 계속 잡는다
  assert.deepStrictEqual(checkRestore(CSS, ORIGINALS), []);
  assert.ok(fails(checkRestore(append(CSS, ':root .foo { box-shadow: 0 0 0 1px #000; }'), ORIGINALS), '목록 밖'));
});

/* ===== ⑯ 문제 수 안내 글자 대비(D8) ===== */
test('규칙 ⑯: 교육용 #eg-amount-desc 글자색이 최악 바탕(고른 칩 그림자 아래)에서 4.8 이상, 카드 아래끝에서 4.5 이상이고 남보라 계열이다', () => {
  assert.deepStrictEqual(checkRestoreText(CSS), []);
  const m = parseCss(restoreBlockText(CSS));
  const rule = m.rules.find((r) => r.selectors.includes(':root #eg-amount-desc'));
  assert.deepStrictEqual(rule.selectors, [':root #eg-amount-desc'], '다른 곳에 영향이 없게 #eg-amount-desc 하나만 선택');
  assert.deepStrictEqual(rule.decls.map((d) => d.prop), ['color'], '글자색 한 줄만');
  // 이 복구가 필요한 이유: 원본 글자색(--ink-2 = #5b5394)은 최악 바탕에서 4.5 미만이다(원본이 바뀌면 이 단언이 알려 준다)
  assert.ok(/--ink-2: #5b5394;/.test(ORIGINALS['style.css']), '원본 --ink-2 가 바뀜(D8 재점검)');
  assert.ok(/\.eg-amount-desc \{ color: var\(--ink-2\); \}/.test(ORIGINALS['edu.css']), '원본 .eg-amount-desc 글자색이 바뀜(D8 재점검)');
  assert.ok(hexContrast('#5b5394', DESC_WORST_BG) < 4.5, '원본 글자색이 이미 4.5 이상이면 복구 규칙은 필요 없음');
  assert.ok(Math.abs(hexContrast('#5b5394', DESC_WORST_BG) - 4.32) < 0.01, '대비 계산이 Review 측정 4.32 와 맞음');
});

test('규칙 ⑯ 검사기: 글자색 되돌림·옅게·다른 색·규칙 삭제·선택자 확대를 잡는다 (긍정·부정 예시 + 변이)', () => {
  const RULE = ':root #eg-amount-desc { color: #514988; }';
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, ':root #eg-amount-desc { color: #5b5394; }')), '4.8 미만'), '원본 글자색으로 되돌리면 실패');
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, ':root #eg-amount-desc { color: #554d8e; }')), '4.8 미만'), '4.73 은 권장(4.8) 미만');
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, ':root #eg-amount-desc { color: #888888; }')), '4.8 미만'));
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, ':root #eg-amount-desc { color: #2a2a2a; }')), '남보라'), '대비는 충분해도 다른 계열이면 실패');
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, ':root #eg-amount-desc { color: var(--ink); }')), '#rrggbb'));
  assert.ok(fails(checkRestoreText(mutate(CSS, RULE, '')), '규칙이 없음'));
  assert.ok(fails(checkRestoreText(CSS.slice(0, CSS.indexOf(RESTORE_MARK))), '복원 블록'));
  assert.ok(fails(checkRestore(mutate(CSS, RULE, ':root .eg-amount-desc { color: #514988; }'), ORIGINALS), '목록 밖'), '선택자를 넓히면(다른 곳에 영향) 목록 밖 규칙으로 잡힌다');
  assert.deepStrictEqual(checkRestoreText(CSS), []);
  assert.deepStrictEqual(checkRestore(CSS, ORIGINALS), []);
  // 대비 계산 자체: 흑백 21, 같은 색 1
  assert.ok(Math.abs(hexContrast('#000000', '#ffffff') - 21) < 0.01);
  assert.strictEqual(hexContrast('#123456', '#123456'), 1);
  // 우선순위 계산 자체
  assert.ok(specificity(':root .a.b') > specificity(':root .a'));
  assert.ok(specificity(':root #x') > specificity(':root .a.b.c'));
  assert.strictEqual(specificity(':root .m:not(.dark)'), specificity(':root .m.dark'));
});

/* ===== 해석기 자체 ===== */
test('CSS 해석기: 선택자 쉼표·따옴표·@media·@keyframes·변수를 올바르게 읽는다', () => {
  const m = parseCss('/* c */ :root { --a: 1px; }\n:root .a[x="1,2"], :root .b:not(.c) { color: red; box-shadow: 0 0 0 1px rgba(1, 2, 3, .5), 0 1px 2px #000; content: "a;b{"; }\n@media screen and (min-width:1px) { :root .d { top: 0; } }\n@keyframes k { 0% { opacity: 0; } 100% { opacity: 1; } }\n@import "x.css";');
  assert.deepStrictEqual(m.errors, []);
  assert.deepStrictEqual(m.rules.map((r) => r.selectors), [[':root'], [':root .a[x="1,2"]', ':root .b:not(.c)'], [':root .d']]);
  assert.deepStrictEqual(m.rules[1].decls.map((d) => d.prop), ['color', 'box-shadow', 'content']);
  assert.strictEqual(m.rules[1].decls[2].value, '"a;b{"');
  assert.deepStrictEqual(m.rules[2].ctx, ['@media screen and (min-width:1px)']);
  assert.deepStrictEqual(m.keyframes.map((k) => k.name), ['k']);
  assert.deepStrictEqual(m.statements, ['@import "x.css"']);
  assert.deepStrictEqual(shadowLayers('inset 0 -3px 0 rgba(1, 2, 3, .5), 0 0 0 1px #fff, var(--x), none').map((l) => [l.inset, l.x, l.y, l.blur, l.spread]), [[true, 0, -3, 0, 0], [false, 0, 0, 0, 1]]);
  assert.strictEqual(resolveVars('rgba(var(--s), .1) var(--t)', { '--s': '1, 2, 3' }), 'rgba(1, 2, 3, .1) var(--t)');
});
