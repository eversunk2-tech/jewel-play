#!/usr/bin/env node
/* 금칙어 목록(nick-words.js)에 넣을 base64 값을 만든다.
 *   node apps/element-gems/server/tools/encode-word.js "단어" ["*부분일치어" "=전체일치어" ...]
 * 출력된 문자열을 nick-words.js 의 해당 분류 배열(ko / en / rom / reserved / pii / contact / allow)에 붙여 넣는다.
 * 항목 앞 기호: '=' 전체 일치만, '*' 글자 그대로 부분 일치, 없음 = 기본 규칙 (nickname.js 머리 주석)
 */
'use strict';
const words = process.argv.slice(2);
if (!words.length) { console.error('사용법: node encode-word.js "단어" ["*단어" ...]'); process.exit(1); }
for (const w of words) console.log("'" + Buffer.from(w.normalize('NFC'), 'utf8').toString('base64') + "',  // " + w);
