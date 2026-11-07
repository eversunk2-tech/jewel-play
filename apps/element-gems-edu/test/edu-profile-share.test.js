/* 프로필 공유 시험 (spec §21.2.6): 일반용과 교육용은 프로필(element-gems:profile:v1)·순위표 캐시 키와 normalizeProfile 이 같아야
 * 한 번 만든 닉네임·그림이 두 버전에서 똑같이 보인다. 제출 대기 상태(sync)만 교육용 전용 키다.
 * 일반용 ranking.js 가 바뀌면 이 시험이 실패한다 → 교육용 복사본에 같은 변경을 옮긴 뒤(tools/SYNC.md) 다시 통과시킨다.
 * 실행: node --test apps/element-gems-edu/test/edu-profile-share.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eduDir = path.join(__dirname, '..');
const genDir = path.join(__dirname, '..', '..', 'element-gems');
const gen = require(path.join(genDir, 'ranking.js'));
const edu = require(path.join(eduDir, 'ranking.js'));

test('저장 키: 프로필·순위표 캐시는 일반용과 같고, 제출 대기(sync)만 교육용 전용이다', () => {
  assert.strictEqual(edu.KEYS.profile, 'element-gems:profile:v1');
  assert.strictEqual(edu.KEYS.profile, gen.KEYS.profile);
  assert.strictEqual(edu.KEYS.hall, 'element-gems:hall:v1');
  assert.strictEqual(edu.KEYS.hall, gen.KEYS.hall);
  assert.strictEqual(gen.KEYS.sync, 'element-gems:sync:v1');
  assert.strictEqual(edu.KEYS.sync, 'element-gems-edu:sync:v1');
  assert.notStrictEqual(edu.KEYS.sync, gen.KEYS.sync);
  // 교육용 진행 저장 키(game.js)는 일반용 'element-gems:v1' 과 다르다
  const eduGame = fs.readFileSync(path.join(eduDir, 'game.js'), 'utf8');
  assert.match(eduGame, /storageKey: 'element-gems-edu:v1'/);
  assert.ok(!/localStorage[^;\n]*'element-gems:v1'/.test(eduGame), '교육용이 일반용 진행 키를 직접 쓴다');
});

test('normalizeProfile: 같은 입력에 같은 결과 (여러 모양의 입력)', () => {
  const good = { pid: 'p'.repeat(32), pub: 'a'.repeat(16), nick: '별빛냥', tag: 1234, avatar: 7, skipped: false, createdAt: 1700000000000, hidden: 0, notice: '', nickLeft: 2 };
  const inputs = [
    null, undefined, 'x', 12, [], {}, good,
    Object.assign({}, good, { avatar: 99 }), Object.assign({}, good, { avatar: -1 }), Object.assign({}, good, { avatar: 3.5 }),
    Object.assign({}, good, { nick: 'a'.repeat(40) }), Object.assign({}, good, { tag: 'abc' }), Object.assign({}, good, { hidden: 2, notice: 'rename' }),
    Object.assign({}, good, { skipped: true }), Object.assign({}, good, { createdAt: 'x' }), Object.assign({}, good, { extra: 'keep?' }),
    { nick: '이름만' }, { skipped: true }
  ];
  inputs.forEach((x, i) => assert.deepStrictEqual(edu.normalizeProfile(x), gen.normalizeProfile(x), '입력 #' + i));
  assert.strictEqual(String(edu.normalizeProfile), String(gen.normalizeProfile));
});

test('프로필 관련 상수·함수가 같다(아바타 수·닉네임 길이·이름·번호 모양)', () => {
  assert.strictEqual(edu.AVATAR_COUNT, gen.AVATAR_COUNT);
  assert.deepStrictEqual(edu.AVATAR_NAMES, gen.AVATAR_NAMES);
  assert.strictEqual(edu.NICK_MIN, gen.NICK_MIN);
  assert.strictEqual(edu.NICK_MAX, gen.NICK_MAX);
  assert.deepStrictEqual(edu.MESSAGES, gen.MESSAGES);
  assert.strictEqual(edu.pad4(7), gen.pad4(7));
  ['normalizeSync', 'normalizeRows', 'buildSnapshot', 'buildSyncBody', 'newPlayerId', 'checkNick', 'fallbackNickCheck'].forEach((fn) => {
    assert.strictEqual(String(edu[fn]), String(gen[fn]), fn);
  });
});

test('저장소 왕복: 한 쪽이 저장한 프로필을 다른 쪽이 같은 값으로 읽는다(같은 저장소를 공유)', () => {
  const mem = {};
  const store = { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } };
  const p = gen.normalizeProfile({ pid: 'p'.repeat(32), pub: 'a'.repeat(16), nick: '달빛토끼', tag: 42, avatar: 3, createdAt: 1700000000000 });
  store.set(gen.KEYS.profile, JSON.stringify(p));
  const fromEdu = edu.normalizeProfile(JSON.parse(store.get(edu.KEYS.profile)));
  assert.deepStrictEqual(fromEdu, p);
  // 제출 대기 상태는 서로 섞이지 않는다
  store.set(gen.KEYS.sync, JSON.stringify({ g: 1 }));
  assert.strictEqual(store.get(edu.KEYS.sync), null);
});

test('교육용 ranking.js 는 일반용과 [EDU] 표식 줄(sync 키 한 줄)만 다르다 / ranking-ui.js 는 같다', () => {
  const g = fs.readFileSync(path.join(genDir, 'ranking.js'), 'utf8');
  const e = fs.readFileSync(path.join(eduDir, 'ranking.js'), 'utf8');
  const normalized = e.split('\n').filter((l) => l.indexOf('// [EDU]') === -1).join('\n').replace("sync: 'element-gems-edu:sync:v1'", "sync: 'element-gems:sync:v1'");
  assert.strictEqual(normalized, g, '[EDU] 표식 줄 밖의 코드가 일반용과 다르다(동기화 필요)');
  const gu = fs.readFileSync(path.join(genDir, 'ranking-ui.js'), 'utf8');
  const eu = fs.readFileSync(path.join(eduDir, 'ranking-ui.js'), 'utf8');
  assert.strictEqual(eu, gu);
});

test('교육용 CONFIG.ranking.apiBase 는 일반용과 같은 Worker 주소다(서버 공유, 합산)', () => {
  const pick = (dir) => /apiBase:\s*'([^']*)'/.exec(fs.readFileSync(path.join(dir, 'game.js'), 'utf8'));
  const g = pick(genDir);
  const e = pick(eduDir);
  assert.ok(g && e);
  assert.strictEqual(e[1], g[1]);
  assert.match(e[1], /^https:\/\/element-gems-ranking\.[a-z0-9-]+\.workers\.dev$/);
});
