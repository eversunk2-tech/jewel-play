/* `node --test server/test` 로 폴더 전체를 돌릴 수 있게 하는 진입점 (Node 24 는 폴더 인자를 모듈로 읽는다).
 * 개별 실행: node --test server/test/api.test.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
for (const f of fs.readdirSync(__dirname).sort()) {
  if (/\.test\.js$/.test(f)) require(path.join(__dirname, f));
}
