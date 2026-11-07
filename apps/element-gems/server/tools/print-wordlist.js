#!/usr/bin/env node
/* 닉네임 금칙어·예약어 목록을 사람이 볼 수 있게 풀어서 출력한다(검수용). 출력물은 커밋하지 않는다.
 *   node apps/element-gems/server/tools/print-wordlist.js                 분류별 전체 목록
 *   node apps/element-gems/server/tools/print-wordlist.js --counts        분류별 개수만
 *   node apps/element-gems/server/tools/print-wordlist.js --category ko   한 분류만 (reserved|pii|contact|allow|ko|en|rom)
 * 항목 앞 기호: '=' 전체 일치만, '*' 글자 그대로 부분 일치, 없음 = 기본 규칙
 * 주의: 욕설이 그대로 나오므로 화면 공유·저장소 붙여넣기에 주의한다.
 */
'use strict';
const path = require('node:path');
const WORDS = require(path.join(__dirname, '..', '..', 'nick-words.js'));

const LABEL = {
  reserved: '예약어 (사칭 방지)', pii: '개인정보 표현', contact: '연락 유도(메신저·SNS)', allow: '오탐 방지 예외',
  ko: '한국어 금칙어', en: '영어 금칙어', rom: '로마자로 쓴 한국어 욕설'
};
const order = ['reserved', 'pii', 'contact', 'allow', 'ko', 'en', 'rom'];
const args = process.argv.slice(2);
const only = args.indexOf('--category') >= 0 ? args[args.indexOf('--category') + 1] : null;
const countsOnly = args.includes('--counts');
const dec = (s) => Buffer.from(s, 'base64').toString('utf8');

let total = 0;
for (const k of order) {
  if (only && only !== k) continue;
  const arr = (WORDS[k] || []).map(dec);
  total += arr.length;
  if (countsOnly) { console.log(k.padEnd(9) + String(arr.length).padStart(4) + '  ' + LABEL[k]); continue; }
  console.log('\n[' + k + '] ' + LABEL[k] + ' - ' + arr.length + '개');
  console.log(arr.join('  '));
}
if (countsOnly) console.log('합계'.padEnd(8) + String(total).padStart(4));
