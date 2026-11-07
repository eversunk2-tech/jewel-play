#!/usr/bin/env node
/* element-gems server - build.js
 * 원본 4개를 한 파일 dist/worker.js(ES 모듈 Worker)로 묶는다. Cloudflare 대시보드 Edit code 에 붙여넣거나 wrangler 로 배포한다.
 *   node apps/element-gems/server/build.js           dist/worker.js 를 (다시) 만든다
 *   node apps/element-gems/server/build.js --check   dist/worker.js 가 원본과 같은지 검사한다(다르면 종료 코드 1)
 * 원본: ../nick-words.js, ../nickname.js (클라이언트와 공용), src/core.js, src/worker.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SOURCES = [
  { name: 'nick-words', file: path.join(ROOT, '..', 'nick-words.js'), label: 'apps/element-gems/nick-words.js' },
  { name: 'nickname', file: path.join(ROOT, '..', 'nickname.js'), label: 'apps/element-gems/nickname.js' },
  { name: 'core', file: path.join(ROOT, 'src', 'core.js'), label: 'apps/element-gems/server/src/core.js' },
  { name: 'worker', file: path.join(ROOT, 'src', 'worker.js'), label: 'apps/element-gems/server/src/worker.js' }
];
const OUT = path.join(ROOT, 'dist', 'worker.js');

function indent(text) {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
}

function bundle() {
  let out = '';
  out += '// element-gems 명예의 전당 Worker - 자동 생성 파일입니다. 직접 고치지 말고 `node apps/element-gems/server/build.js` 로 다시 만드세요.\n';
  out += '// 원본: ' + SOURCES.map((s) => s.label).join(', ') + '\n';
  out += '// 사용: Cloudflare 대시보드 > Worker > Edit code 에 이 파일 전체를 붙여넣고 Deploy 합니다. (비밀 정보는 들어 있지 않습니다)\n';
  out += 'const __mods = {};\n';
  out += 'const __cache = {};\n';
  out += 'function __require(name) {\n';
  out += "  const key = String(name).split('/').pop().replace(/\\.js$/, '');\n";
  out += '  if (!__cache[key]) {\n';
  out += '    const m = { exports: {} };\n';
  out += '    __cache[key] = m;\n';
  out += '    __mods[key](m, m.exports, __require);\n';
  out += '  }\n';
  out += '  return __cache[key].exports;\n';
  out += '}\n\n';
  for (const s of SOURCES) {
    const src = fs.readFileSync(s.file, 'utf8');
    out += '// ---- ' + s.label + ' ----\n';
    out += "__mods['" + s.name + "'] = function (module, exports, require) {\n" + indent(src) + '\n};\n\n';
  }
  out += "export default __require('worker').default;\n";
  return out;
}

function main() {
  const text = bundle();
  if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = fs.readFileSync(OUT, 'utf8'); } catch (e) { /* 없음 */ }
    if (cur === text) { console.log('OK: dist/worker.js 가 원본과 같습니다.'); process.exit(0); }
    console.error('최신이 아닙니다: dist/worker.js 가 원본과 다릅니다. `node apps/element-gems/server/build.js` 를 실행하세요.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log('만들었습니다: ' + path.relative(process.cwd(), OUT) + ' (' + Buffer.byteLength(text) + ' bytes)');
}

main();
