'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');
const worker = require('../src/worker');
const { makeEnv, uuid, prog } = require('./helpers');

const SRC_DIR = path.join(__dirname, '..', 'src');
const sync = (t, body, headers) => t.call('POST', '/api/sync', Object.assign({ v: 1 }, body), headers);

async function register(t, nick, d, avatar, headers) {
  const pid = uuid();
  const r = await sync(t, { pid, profile: { nick: nick || '별빛냥', avatar: avatar || 3 }, d: d || undefined }, headers);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { pid, me: r.json.me, res: r };
}
function rows(t, sql, ...params) { return t.DB.db.prepare(sql).all(...params); }
function spyWrites(t) {
  const log = [];
  const orig = t.env.DB.prepare.bind(t.env.DB);
  t.env.DB.prepare = (sql) => { log.push(sql.trim().split(/\s+/)[0].toUpperCase()); return orig(sql); };
  return log;
}
const hasWrite = (log) => log.some((x) => x !== 'SELECT');

test('health: 시간만 돌려주고 DB를 쓰지 않는다', async () => {
  const t = makeEnv({ DB: undefined });                 // DB 바인딩이 없어도 health 는 동작
  const r = await t.call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.v, 1);
  assert.equal(r.json.time, t.clock.ms);
});

test('sync: 첫 등록 응답 모양, 번호표 0~9999, pub 8자, pid 미노출', async () => {
  const t = makeEnv();
  const pid = uuid();
  const r = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70, 40]) });
  assert.equal(r.status, 200);
  const j = r.json;
  assert.equal(j.ok, true);
  assert.equal(j.v, 1);
  assert.equal(j.changed, true);
  assert.equal(j.nickChangesLeft, 2);
  assert.equal(j.serverTime, t.clock.ms);
  assert.deepEqual(Object.keys(j.me).sort(), ['avatar', 'hidden', 'nick', 'pub', 'score', 'stars', 'tag']);      // spec §46.3.4: score(저장된 최고점) 추가
  assert.equal(j.me.score, 0, '도전 기록이 없으면 0');
  assert.equal(j.scoreRejected, undefined);
  assert.ok(Number.isInteger(j.me.tag) && j.me.tag >= 0 && j.me.tag <= 9999);
  assert.match(j.me.pub, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.deepEqual(j.me.stars, { easy: 5, normal: 0, hard: 0, all: 5 });
  assert.equal(j.me.hidden, 0);
  assert.ok(!r.text.includes(pid), '응답에 pid 가 있으면 안 됨');
});

test('개인정보 미저장: DB 에는 pid 원본·IP·User-Agent 가 없고 해시만 있다', async () => {
  const t = makeEnv();
  const pid = uuid();
  const ip = '203.0.113.77';
  const r = await sync(t, { pid, profile: { nick: 'Star7', avatar: 5 } }, { 'cf-connecting-ip': ip, 'user-agent': 'SecretAgent/9.9', 'x-forwarded-for': '198.51.100.9' });
  assert.equal(r.status, 200);
  const dump = JSON.stringify(rows(t, 'SELECT * FROM players')) + JSON.stringify(rows(t, 'SELECT * FROM rate_limits'));
  assert.ok(!dump.includes(pid) && !dump.includes(pid.replace(/-/g, '')));
  assert.ok(!dump.includes(ip) && !dump.includes('198.51.100.9') && !dump.includes('SecretAgent'));
  const p = rows(t, 'SELECT pid_hash, pub, nick, nick_key FROM players')[0];
  assert.match(p.pid_hash, /^[0-9a-f]{64}$/);
  assert.equal(p.nick, 'Star7');
  assert.equal(p.nick_key, 'star7');
  const rl = rows(t, 'SELECT k FROM rate_limits')[0];
  assert.match(rl.k, /^reg:[0-9a-f]{16}$/);
  // 컬럼 목록에 이름·학교·IP 같은 열이 없다
  const cols = rows(t, "SELECT name FROM pragma_table_info('players')").map((x) => x.name);
  for (const c of cols) assert.doesNotMatch(c, /ip|agent|real|school|phone|email|name$/i, c);
});

test('profile 없는 첫 제출 -> profile_required, 잘못된 pid/버전/본문', async () => {
  const t = makeEnv();
  const r1 = await sync(t, { pid: uuid(), d: prog([70]) });
  assert.equal(r1.status, 400);
  assert.equal(r1.json.error.code, 'profile_required');
  assert.equal((await sync(t, { pid: 'not-a-uuid', profile: { nick: '별빛냥', avatar: 1 } })).json.error.code, 'bad_request');
  assert.equal((await sync(t, { profile: { nick: '별빛냥', avatar: 1 } })).json.error.code, 'bad_request');
  assert.equal((await sync(t, { pid: uuid() })).json.error.code, 'bad_request');                  // profile·d 둘 다 없음
  const v2 = await t.call('POST', '/api/sync', { v: 2, pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } });
  assert.equal(v2.json.error.code, 'unsupported_version');
  assert.equal(v2.status, 400);
  const nov = await t.call('POST', '/api/sync', { pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } });
  assert.equal(nov.json.error.code, 'bad_request');
  assert.equal((await t.call('POST', '/api/sync', 'not json')).json.error.code, 'bad_request');
  assert.equal((await t.call('POST', '/api/sync', '[1,2]')).json.error.code, 'bad_request');
  assert.equal((await t.call('POST', '/api/sync', '')).json.error.code, 'bad_request');
  assert.equal((await t.call('POST', '/api/sync', { v: 1, pid: uuid(), profile: 'x' })).json.error.code, 'bad_request');
  // 오류 응답 모양
  const e = r1.json;
  assert.equal(e.ok, false);
  assert.equal(e.v, 1);
  assert.equal(typeof e.error.message, 'string');
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 0, '오류 요청은 아무것도 저장하지 않는다');
});

test('닉네임 오류 코드가 서버에서도 같다 + 아바타 1~16', async () => {
  const t = makeEnv();
  const cases = [['가', 'nick_length'], ['a b', 'nick_charset'], ['ㅋㅋㅋ', 'nick_charset'], ['별1234', 'nick_digits'], ['아아아', 'nick_repeat'],
    ['관리자', 'nick_reserved'], ['3학년2반', 'nick_pii'], ['카톡', 'nick_pii'], ['시발', 'nick_blocked'], ['씨1발', 'nick_blocked']];
  for (const [nick, code] of cases) {
    const r = await sync(t, { pid: uuid(), profile: { nick, avatar: 3 } });
    assert.equal(r.status, 400, nick);
    assert.equal(r.json.error.code, code, nick);
    assert.equal(r.json.error.field, 'nick');
    assert.ok(r.json.error.message.length > 5);
  }
  for (const a of [0, 17, 1.5, '3', null]) {
    const r = await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: a } });
    assert.equal(r.json.error.code, 'avatar_invalid', String(a));
    assert.equal(r.json.error.field, 'avatar');
  }
  for (const a of [1, 16]) assert.equal((await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: a } })).status, 200);
  assert.equal((await sync(t, { pid: uuid(), profile: { nick: '거북이', avatar: 2 } })).status, 200);
});

test('EXTRA_BLOCK(서버 변수)로 추가한 단어는 서버에서만 막히고, 기존 이름은 다음 동기화에서 이름 변경 요청(hidden=2)이 된다', async () => {
  const t = makeEnv();
  const a = await register(t, '거북이', prog([70]));
  t.env.EXTRA_BLOCK = '거북이, 토끼';
  assert.equal((await sync(t, { pid: uuid(), profile: { nick: '토끼풀', avatar: 3 } })).json.error.code, 'nick_blocked');
  // 이름은 건드리지 않고 진행만 올리는 동기화 -> 서버가 재검사
  t.advance(5);
  const r = await sync(t, { pid: a.pid, d: prog([70, 50]) });
  assert.equal(r.status, 200);
  assert.equal(r.json.me.hidden, 2);
  assert.equal(r.json.me.stars.easy, 5);                    // 진행은 그대로 반영
  const lb = await t.call('GET', '/api/leaderboard?board=all');
  assert.equal(lb.json.rows.length, 0, 'hidden=2 는 순위 제외');
  // 새 이름이 통과하면 자동 복구
  t.advance(5);
  const fix = await sync(t, { pid: a.pid, profile: { nick: '별빛냥', avatar: 3 } });
  assert.equal(fix.json.me.hidden, 0);
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.rows.length, 1);
  // 금칙 이름 그대로 다시 보내면 서버가 거부
  t.advance(5);
  const again = await sync(t, { pid: a.pid, profile: { nick: '거북이', avatar: 3 } });
  assert.equal(again.json.error.code, 'nick_blocked');
  // 변수를 비우면 평소처럼 통과 (이 서버 변수는 클라이언트에 영향 없음)
  t.env.EXTRA_BLOCK = '';
  assert.equal((await register(t, '거북이', prog([70]))).me.hidden, 0);
});

test('진행 검증: 범위 밖·소수·문자열·길이·키 누락 -> progress_invalid (field 포함)', async () => {
  const t = makeEnv();
  const pid = uuid();
  const base = () => JSON.parse(JSON.stringify(prog([70])));
  const cases = [
    [(d) => { d.easy[0] = 9999; }, 'd.easy[0]'],
    [(d) => { d.easy[0] = 151; }, 'd.easy[0]'],
    [(d) => { d.hard[2] = 121; }, 'd.hard[2]'],
    [(d) => { d.easy[1] = 1.5; }, 'd.easy[1]'],
    [(d) => { d.easy[1] = '30'; }, 'd.easy[1]'],
    [(d) => { d.easy[1] = -5; }, 'd.easy[1]'],
    [(d) => { d.normal = d.normal.slice(1); }, 'd.normal'],
    [(d) => { delete d.hard; }, 'd.hard']
  ];
  for (const [mutate, field] of cases) {
    const d = base();
    mutate(d);
    const r = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 3 }, d });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'progress_invalid');
    assert.equal(r.json.error.field, field);
  }
  assert.equal((await sync(t, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: 'x' })).json.error.code, 'progress_invalid');
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 0);
});

test('연쇄 해금 위반(레벨 10만 클리어) -> progress_chain, 저장 안 됨', async () => {
  const t = makeEnv();
  const d = prog();
  d.easy[9] = 100;
  const r = await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: 3 }, d });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'progress_chain');
  assert.equal(r.json.error.field, 'd.easy[9]');
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 0);
  // 기존 선수에게도 마찬가지(병합 결과 기준)
  const a = await register(t, '별빛냥', prog([70]));
  t.advance(5);
  const d2 = prog();
  d2.normal[5] = 80;
  const r2 = await sync(t, { pid: a.pid, d: d2 });
  assert.equal(r2.json.error.code, 'progress_chain');
  // 병합 결과가 연쇄를 만족하면 허용: 이미 1~3이 있는 선수가 4만 보내도 된다
  t.advance(5);
  const b = await register(t, '달토끼', prog([70, 70, 70]));
  t.advance(5);
  const d3 = prog();
  d3.easy[3] = 90;
  const r3 = await sync(t, { pid: b.pid, d: d3 });
  assert.equal(r3.status, 200);
  assert.equal(r3.json.me.stars.easy, 12);
});

test('별은 받지 않고 left 에서 계산한다 (별만 위조 불가)', async () => {
  const t = makeEnv();
  const pid = uuid();
  const d = prog([10]);
  const r = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: Object.assign(d, { stars: { easy: [3] } }) });
  assert.equal(r.status, 400);                                    // 모르는 키는 거부
  const ok = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([10]), stars: 90 });
  assert.equal(ok.json.me.stars.all, 1);                          // left 10 -> 1별 (최상위의 stars 필드는 무시)
});

test('단조 증가: 낮은 값·오래된 스냅샷은 무시, 기기 2대는 최대값 병합, 쓰기 없음', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70, 40, 20]));      // 3+2+1 = 6별
  t.advance(10);
  const low = await sync(t, { pid: a.pid, d: prog([10, 10, 10]) });
  assert.equal(low.status, 200);
  assert.equal(low.json.changed, false);
  assert.equal(low.json.me.stars.easy, 6);
  assert.deepEqual(rows(t, 'SELECT prog_easy FROM players')[0].prog_easy, '70,40,20,-1,-1,-1,-1,-1,-1,-1');
  // 기기 B 는 스테이지 2,4 를 더 높게/새로
  t.advance(10);
  const m = await sync(t, { pid: a.pid, d: prog([5, 66, 3, 50]) });
  assert.equal(m.json.changed, true);
  assert.equal(rows(t, 'SELECT prog_easy FROM players')[0].prog_easy, '70,66,20,50,-1,-1,-1,-1,-1,-1');
  assert.equal(m.json.me.stars.easy, 3 + 3 + 1 + 2);
  // 같은 스냅샷 재전송 = 멱등
  t.advance(10);
  const log = spyWrites(t);
  const same = await sync(t, { pid: a.pid, d: prog([70, 66, 20, 50]) });
  assert.equal(same.json.changed, false);
  assert.equal(hasWrite(log), false, '변경 없는 제출은 쓰기 0: ' + log.join(','));
  // 총합 컬럼도 줄어들지 않았다
  const row = rows(t, 'SELECT total_stars, total_left, stars_easy, left_easy FROM players')[0];
  assert.deepEqual({ ...row }, { total_stars: 9, total_left: 206, stars_easy: 9, left_easy: 206 });
});

test('쓰기 간격 3초: 변경이 있는 제출만 제한, rate_limited + Retry-After', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  const r1 = await sync(t, { pid: a.pid, d: prog([70, 50]) });          // 같은 초 -> 제한
  assert.equal(r1.status, 429);
  assert.equal(r1.json.error.code, 'rate_limited');
  assert.ok(Number(r1.headers.get('retry-after')) >= 1);
  const nochange = await sync(t, { pid: a.pid, d: prog([70]) });          // 변경 없음은 제한 없음
  assert.equal(nochange.status, 200);
  t.advance(2);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70, 50]) })).status, 429);
  t.advance(1);
  assert.equal((await sync(t, { pid: a.pid, d: prog([70, 50]) })).status, 200);
  // 아바타 변경도 같은 간격 제한만 받는다(횟수 제한 없음)
  for (let i = 0; i < 6; i++) {
    t.advance(3);
    const r = await sync(t, { pid: a.pid, profile: { nick: '별빛냥', avatar: 1 + i } });
    assert.equal(r.status, 200);
    assert.equal(r.json.me.avatar, 1 + i);
  }
});

test('닉네임 변경 하루 2회(한국 시간 날짜 기준), 번호표 새로 부여, 대소문자만 바꾸면 횟수 안 씀', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  assert.equal(a.res.json.nickChangesLeft, 2, '등록은 변경 횟수에 포함되지 않음');
  const changes = [];
  for (const nick of ['달토끼', '파랑새']) {
    t.advance(4);
    const r = await sync(t, { pid: a.pid, profile: { nick, avatar: 3 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.me.nick, nick);
    changes.push(r.json.nickChangesLeft);
  }
  assert.deepEqual(changes, [1, 0]);
  t.advance(4);
  const third = await sync(t, { pid: a.pid, profile: { nick: '솜사탕', avatar: 3 } });
  assert.equal(third.status, 429);
  assert.equal(third.json.error.code, 'nick_change_limit');
  assert.match(third.json.error.message, /하루에 2번/);
  // 한도에 걸려도 같은 이름 재전송·아바타 변경은 가능
  const same = await sync(t, { pid: a.pid, profile: { nick: '파랑새', avatar: 9 } });
  assert.equal(same.status, 200);
  assert.equal(same.json.nickChangesLeft, 0);
  // 대소문자만 바꾸는 변경은 횟수·번호표 그대로
  const e = await register(t, 'Abc', prog([70]));
  t.advance(4);
  const cs = await sync(t, { pid: e.pid, profile: { nick: 'aBC', avatar: 3 } });
  assert.equal(cs.json.me.nick, 'aBC');
  assert.equal(cs.json.me.tag, e.me.tag);
  assert.equal(cs.json.nickChangesLeft, 2);
  // 한국 시간 자정(UTC 15:00)을 넘으면 다시 2회
  t.clock.ms = Date.UTC(2026, 10, 7, 14, 59, 40);
  const x = await register(t, '아침해', prog([70]));
  for (const nick of ['점심해', '저녁해']) { t.advance(3); assert.equal((await sync(t, { pid: x.pid, profile: { nick, avatar: 3 } })).status, 200); }
  t.advance(3);
  assert.equal(new Date(t.clock.ms).toISOString(), '2026-11-07T14:59:49.000Z');
  assert.equal((await sync(t, { pid: x.pid, profile: { nick: '새벽해', avatar: 3 } })).json.error.code, 'nick_change_limit');
  t.clock.ms = Date.UTC(2026, 10, 7, 15, 0, 5);                    // 한국 시간 다음 날 00:00:05
  const next = await sync(t, { pid: x.pid, profile: { nick: '새날해', avatar: 3 } });
  assert.equal(next.status, 200);
  assert.equal(next.json.nickChangesLeft, 1);
});

test('번호표: 같은 이름을 여러 명이 써도 서로 다른 번호, 충돌 시 재시도·순차 탐색', async () => {
  const t = makeEnv();
  t.opts.randomInt = () => 5;                                       // 항상 5 -> 충돌 강제
  const tags = [];
  for (let i = 0; i < 4; i++) tags.push((await register(t, '별빛냥')).me.tag);
  assert.deepEqual(tags, [5, 6, 7, 8]);
  delete t.opts.randomInt;
  const more = [];
  for (let i = 0; i < 8; i++) more.push((await register(t, '별빛냥')).me.tag);
  assert.equal(new Set(tags.concat(more)).size, 12);
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players WHERE nick_key = ?', '별빛냥')[0].n, 12);
  // 닉네임을 바꾸면 새 번호를 받는다
  const a = await register(t, '달토끼');
  t.opts.randomInt = () => 4321;
  t.advance(4);
  const r = await sync(t, { pid: a.pid, profile: { nick: '파랑새', avatar: 3 } });
  assert.equal(r.json.me.tag, 4321);
});

test('등록 한도: IP 해시당 시간당 100명, 다른 IP·다음 시간은 가능', async () => {
  const t = makeEnv();
  const H = { 'cf-connecting-ip': '192.0.2.1' };
  for (let i = 0; i < 100; i++) {
    const r = await sync(t, { pid: uuid(), profile: { nick: 'K' + i, avatar: 1 } }, H);
    assert.equal(r.status, 200, 'i=' + i);
  }
  const over = await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } }, H);
  assert.equal(over.status, 429);
  assert.equal(over.json.error.code, 'rate_limited');
  assert.ok(Number(over.headers.get('retry-after')) > 0);
  assert.equal((await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } }, { 'cf-connecting-ip': '192.0.2.2' })).status, 200);
  // 기존 선수의 진행 제출은 등록 한도와 무관
  const old = await sync(t, { pid: uuid(), profile: { nick: '다른이', avatar: 1 } }, { 'cf-connecting-ip': '192.0.2.3' });
  assert.equal(old.status, 200);
  // 한 시간 뒤에는 다시 가능
  t.advance(3600);
  assert.equal((await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } }, H)).status, 200);
});

test('순위표: 별 > 남은 시간 합 > 먼저 달성 > id, 공동 순위 없음 (동점 시나리오 4종)', async () => {
  const t = makeEnv();
  // 모두 초보 1스테이지만: left 값으로 별·시간을 만든다 (65 이상 = 3별, 39~64 = 2별)
  const mk = async (nick, left) => { const r = await register(t, nick, prog([left])); t.advance(0); return r; };
  const A = await mk('에이', 70);         // 3별, 시간 70  (먼저 등록)
  t.advance(10);
  const B = await mk('비이', 70);         // 3별, 시간 70, A 보다 10초 늦음  -> A 다음
  const C = await mk('씨이', 90);         // 3별, 시간 90 -> 시간이 많아 맨 위 (B 와 같은 초)
  const D = await mk('디이', 66);         // 3별, 시간 66 -> 아래
  const E = await mk('이이', 40);         // 2별
  t.advance(10);
  const F = await mk('에프', 40);         // 2별, 같은 시간, E 보다 늦음
  // 같은 시각 + 같은 값: id 로 갈림
  const G = await mk('지이', 40);
  const lb = await t.call('GET', '/api/leaderboard?board=all');
  assert.equal(lb.status, 200);
  assert.deepEqual(lb.json.rows.map((r) => r.nick), ['씨이', '에이', '비이', '디이', '이이', '에프', '지이']);
  assert.deepEqual(lb.json.rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(lb.json.of, 7);
  // 공개 응답에 숨은 값이 없다
  for (const row of lb.json.rows) assert.deepEqual(Object.keys(row).sort(), ['avatar', 'nick', 'rank', 'score', 'stars', 'tag']);     // spec §46.3.4: score 추가(0 = 도전 기록 없음)
  assert.ok(lb.json.rows.every((r) => r.score === 0));
  assert.ok(!lb.text.includes(A.pid) && !lb.text.includes(A.me.pub));
  assert.deepEqual(lb.json.rows.map((r) => r.stars), [3, 3, 3, 3, 2, 2, 2]);
  // 같은 초에 같은 값 -> 먼저 등록한 F 가 G 보다 앞 (id)
  assert.ok(lb.json.rows.findIndex((r) => r.nick === '에프') < lb.json.rows.findIndex((r) => r.nick === '지이'));
});

test('난이도 탭은 해당 난이도 별 개수만, 전체 = 가중 별 점수(초보x1·중수x2·고수x3). 별 0·숨김 제외, 상위 50 제한, of = 참가자 수', async () => {
  const t = makeEnv();
  const a = await register(t, '이지만', prog([70, 70]));                // easy 6
  const b = await register(t, '노말만', prog([], [70]));                // normal 3
  const c = await register(t, '하드만', prog([], [], [60, 60, 60]));     // hard 9
  const z = await register(t, '별없음');                                // 0별: 목록·순위 제외
  const get = async (board) => (await t.call('GET', '/api/leaderboard?board=' + board)).json;
  const easy = await get('easy');
  assert.deepEqual(easy.rows.map((r) => [r.nick, r.stars]), [['이지만', 6]]);
  assert.equal(easy.of, 1);
  assert.deepEqual((await get('normal')).rows.map((r) => [r.nick, r.stars]), [['노말만', 3]]);
  assert.deepEqual((await get('hard')).rows.map((r) => [r.nick, r.stars]), [['하드만', 9]]);
  const all = await get('all');
  assert.deepEqual(all.rows.map((r) => [r.nick, r.stars]), [['하드만', 27], ['이지만', 6], ['노말만', 6]]);   // 하드 9x3, 이지 6x1, 노말 3x2 (6점 동점 -> 남은 시간 합 140 > 70)
  assert.equal(all.of, 3);
  // 숨김 처리 -> 즉시 제외
  t.DB.db.prepare('UPDATE players SET hidden = 1 WHERE pub = ?').run(c.me.pub);
  assert.deepEqual((await get('all')).rows.map((r) => r.nick), ['이지만', '노말만']);
  assert.equal((await get('hard')).rows.length, 0);
  // limit
  assert.equal((await t.call('GET', '/api/leaderboard?board=all&limit=1')).json.rows.length, 1);
  assert.equal((await t.call('GET', '/api/leaderboard?board=all&limit=0')).json.rows.length, 1);      // 1 로 올림
  assert.equal((await t.call('GET', '/api/leaderboard?board=all&limit=abc')).json.rows.length, 2);     // 기본값
  assert.equal((await t.call('GET', '/api/leaderboard?board=bad')).json.error.code, 'bad_request');
  assert.equal((await t.call('GET', '/api/leaderboard')).json.board, 'all');
  assert.ok(z.me.pub);
});

test('상위 50 제한 + 50위 밖 내 순위 + SQL 순위(COUNT)가 정렬 결과와 일치', async () => {
  const t = makeEnv();
  const players = [];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 64; i++) {
    const n = 1 + rnd(4);
    const left = [];
    for (let s = 0; s < n; s++) left.push(rnd(4) * 22 + 10 + rnd(3));     // 값이 겹치게 -> 동점 많이 발생
    const normal = rnd(3) === 0 ? [rnd(4) * 20 + 10] : [];
    players.push(await register(t, 'P' + i, prog(left, normal)));
    if (rnd(3) === 0) t.advance(1 + rnd(3));                                // 일부는 같은 초, 일부는 다른 초
  }
  for (const board of ['all', 'easy', 'normal']) {
    const lb = (await t.call('GET', '/api/leaderboard?board=' + board)).json;
    const c = core.boardCols(board);
    const all = rows(t, `SELECT id, pub, ${c.stars} AS stars, ${c.score} AS score, ${c.left} AS left, ${c.up} AS up FROM players WHERE hidden = 0 AND ${c.stars} > 0`);
    const sorted = all.slice().sort(core.compareRank);
    assert.equal(lb.of, sorted.length, board + ' of');
    assert.equal(lb.rows.length, Math.min(50, sorted.length));
    assert.equal(new Set(lb.rows.map((r) => r.rank)).size, lb.rows.length);
    // 모든 선수의 /api/rank == 정렬 위치
    for (let i = 0; i < sorted.length; i++) {
      const r = (await t.call('GET', `/api/rank?board=${board}&pub=${sorted[i].pub}`)).json;
      assert.equal(r.rank, i + 1, board + ' #' + i);
      assert.equal(r.of, sorted.length);
    }
    if (board === 'all') assert.ok(sorted.length > 50, '50명을 넘는 시나리오여야 함: ' + sorted.length);
  }
  // 상위 50 밖의 사람도 순위가 나온다
  const all2 = rows(t, 'SELECT pub FROM players WHERE total_stars > 0 ORDER BY total_stars DESC, best_score DESC, total_left DESC, up_all ASC, id ASC');
  const last = (await t.call('GET', '/api/rank?board=all&pub=' + all2[all2.length - 1].pub)).json;
  assert.equal(last.rank, all2.length);
  assert.ok(last.rank > 50);
});

test('순위 쿼리가 부분 인덱스를 쓴다 (EXPLAIN QUERY PLAN)', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  const seen = [];
  const orig = t.env.DB.prepare.bind(t.env.DB);
  t.env.DB.prepare = (sql) => { seen.push(sql); return orig(sql); };
  for (const b of ['all', 'easy', 'normal', 'hard']) {
    await t.call('GET', '/api/leaderboard?board=' + b);
    await t.call('GET', `/api/rank?board=${b}&pub=${a.me.pub}`);
  }
  const top = seen.filter((s) => /ORDER BY/.test(s));
  const cnt = seen.filter((s) => /AS rank/.test(s) || /COUNT\(\*\) AS n/.test(s));
  assert.equal(top.length, 4);
  assert.ok(cnt.length >= 4);
  const plan = (sql) => {
    const n = (sql.match(/\?/g) || []).length;
    return t.DB.db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...new Array(n).fill(1)).map((r) => r.detail).join(' | ');
  };
  const want = ['idx_rank2_all', 'idx_rank2_easy', 'idx_rank2_normal', 'idx_rank2_hard'];            // spec §46.3.2: 최고점이 들어간 새 인덱스
  top.forEach((sql, i) => {
    const p = plan(sql);
    assert.ok(p.includes(want[i]), p);
    assert.ok(!/USE TEMP B-TREE/.test(p), 'ORDER BY 가 인덱스를 그대로 써야 함: ' + p);
  });
  for (const sql of cnt) {
    const p = plan(sql);
    assert.ok(/idx_rank2_/.test(p), p);
    assert.ok(!/SCAN players(?! USING)/.test(p), '표 전체 스캔 금지: ' + p);
  }
});

test('/api/rank: 없음 404, 잘못된 pub 400, 별 0이면 rank null, 숨김은 hidden 값', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  const z = await register(t, '별없음');
  const ok = await t.call('GET', `/api/rank?board=all&pub=${a.me.pub.toLowerCase()}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.json).sort(), ['asOf', 'avatar', 'board', 'nick', 'of', 'ok', 'rank', 'score', 'stars', 'tag', 'v']);      // spec §46.3.4: score 추가
  assert.equal(ok.json.score, 0);
  assert.equal(ok.json.rank, 1);
  assert.equal(ok.json.nick, '별빛냥');
  assert.equal((await t.call('GET', '/api/rank?board=all&pub=ZZZZZZZZ')).status, 404);
  assert.equal((await t.call('GET', '/api/rank?board=all&pub=ZZZZZZZZ')).json.error.code, 'player_not_found');
  assert.equal((await t.call('GET', '/api/rank?board=all&pub=short')).json.error.code, 'bad_request');
  assert.equal((await t.call('GET', '/api/rank?board=all')).json.error.code, 'bad_request');
  assert.equal((await t.call('GET', `/api/rank?board=zzz&pub=${a.me.pub}`)).json.error.code, 'bad_request');
  const none = await t.call('GET', `/api/rank?board=all&pub=${z.me.pub}`);
  assert.equal(none.json.rank, null);
  assert.equal(none.json.stars, 0);
  t.DB.db.prepare('UPDATE players SET hidden = 2 WHERE pub = ?').run(a.me.pub);
  const hid = await t.call('GET', `/api/rank?board=all&pub=${a.me.pub}`);
  assert.equal(hid.status, 200);
  assert.equal(hid.json.hidden, 2);
  assert.equal(hid.json.rank, undefined);
});

test('delete: 지우면 순위에서 사라지고, 다시 지우면 deleted:false, 지운 뒤 진행만 보내면 profile_required', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.rows.length, 1);
  const d = await t.call('POST', '/api/delete', { v: 1, pid: a.pid });
  assert.equal(d.status, 200);
  assert.deepEqual(d.json, { ok: true, v: 1, deleted: true });
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.rows.length, 0);
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 0);
  assert.equal((await t.call('POST', '/api/delete', { v: 1, pid: a.pid })).json.deleted, false);
  assert.equal((await t.call('POST', '/api/delete', { v: 1, pid: 'x' })).json.error.code, 'bad_request');
  assert.equal((await sync(t, { pid: a.pid, d: prog([70]) })).json.error.code, 'profile_required');
  assert.equal((await t.call('GET', `/api/rank?board=all&pub=${a.me.pub}`)).status, 404);
  // 다시 만들 수 있다 (같은 pid)
  t.advance(5);
  assert.equal((await sync(t, { pid: a.pid, profile: { nick: '별빛냥', avatar: 3 }, d: prog([70]) })).status, 200);
});

test('CORS: 허용 오리진 OK, 목록 밖 403(헤더 없음), Vary, OPTIONS 204, Origin 없음은 통과', async () => {
  const t = makeEnv();
  const O = 'https://eversunk2-tech.github.io';
  const ok = await t.call('GET', '/api/health', undefined, { Origin: O });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), O);
  assert.equal(ok.headers.get('vary'), 'Origin');
  const post = await t.call('POST', '/api/sync', { v: 1, pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } }, { Origin: O, 'Content-Type': 'text/plain;charset=UTF-8' });
  assert.equal(post.status, 200);
  assert.equal(post.headers.get('access-control-allow-origin'), O);
  const bad = await t.call('GET', '/api/health', undefined, { Origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.json.error.code, 'forbidden_origin');
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  assert.equal(bad.headers.get('vary'), 'Origin');
  assert.equal((await t.call('POST', '/api/sync', { v: 1, pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 1, '막힌 오리진은 저장하지 않음');
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: 'null' })).status, 403);              // file:// 같은 곳
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: 'http://localhost:8765' })).status, 403);   // 로컬은 기본 설정에서 안 열림
  const noOrigin = await t.call('GET', '/api/health');
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
  const pre = await t.call('OPTIONS', '/api/sync', undefined, { Origin: O, 'Access-Control-Request-Method': 'POST' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), O);
  assert.match(pre.headers.get('access-control-allow-methods'), /GET, POST, OPTIONS/);
  assert.equal(pre.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(pre.headers.get('access-control-max-age'), '86400');
  const preBad = await t.call('OPTIONS', '/api/sync', undefined, { Origin: 'https://evil.example' });
  assert.equal(preBad.status, 403);
  // 로컬 오리진은 변수에 추가해야만 열린다 (.dev.vars 로 하는 일)
  t.env.ALLOWED_ORIGINS += ',http://localhost:8765,http://127.0.0.1:8765';
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: 'http://localhost:8765' })).status, 200);
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: 'http://localhost:9999' })).status, 403);
  // '*' 는 무시
  t.env.ALLOWED_ORIGINS = '*';
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: O })).status, 403);
  // 변수가 비어 있어도 안전(전부 거부)
  t.env.ALLOWED_ORIGINS = undefined;
  assert.equal((await t.call('GET', '/api/health', undefined, { Origin: O })).status, 403);
});

test('요청 크기: 2,048B 초과는 413 too_large, 정확히 한도는 처리', async () => {
  const t = makeEnv();
  const pad = (n) => 'x'.repeat(n);
  const base = { v: 1, pid: uuid(), profile: { nick: '별빛냥', avatar: 1 }, junk: '' };
  const withLen = (len) => {
    const b = { ...base };
    const overhead = Buffer.byteLength(JSON.stringify(b));
    b.junk = pad(len - overhead);
    return JSON.stringify(b);
  };
  const exactly = withLen(2048);
  assert.equal(Buffer.byteLength(exactly), 2048);
  assert.equal((await t.call('POST', '/api/sync', exactly)).status, 200);
  const over = withLen(2049);
  assert.equal(Buffer.byteLength(over), 2049);
  const r = await t.call('POST', '/api/sync', over);
  assert.equal(r.status, 413);
  assert.equal(r.json.error.code, 'too_large');
  const big = await t.call('POST', '/api/sync', pad(50000));
  assert.equal(big.status, 413);
  // 한글 등 멀티바이트는 바이트로 센다 (글자 수 아님)
  const mb = JSON.stringify({ ...base, pid: uuid(), junk: '가'.repeat(700) });
  assert.ok(mb.length < 2048 && Buffer.byteLength(mb) > 2048);
  assert.equal((await t.call('POST', '/api/sync', mb)).status, 413);
  // Content-Length 를 미리 알려 주면 본문을 읽기 전에 거부
  const cl = await t.call('POST', '/api/sync', '{"v":1}', { 'content-length': '999999' });
  assert.equal(cl.status, 413);
  assert.equal((await t.call('POST', '/api/delete', pad(3000))).status, 413);
});

test('라우팅: 모르는 주소 404, 잘못된 메서드 405(Allow), 응답은 항상 JSON', async () => {
  const t = makeEnv();
  const nf = await t.call('GET', '/api/nothing');
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error.code, 'not_found');
  assert.equal((await t.call('GET', '/')).status, 404);
  const m = await t.call('GET', '/api/sync');
  assert.equal(m.status, 405);
  assert.match(m.headers.get('allow'), /POST/);
  assert.equal((await t.call('POST', '/api/health', {})).status, 405);
  assert.equal((await t.call('DELETE', '/api/delete')).status, 405);
  assert.match(nf.headers.get('content-type'), /application\/json/);
});

test('순위표 캐시: LB_CACHE_SEC 동안 같은 결과(asOf 동일), 지나면 갱신, Cache-Control', async () => {
  const t = makeEnv({ LB_CACHE_SEC: '30' });
  await register(t, '일번', prog([70]));
  const a = await t.call('GET', '/api/leaderboard?board=all');
  assert.equal(a.headers.get('cache-control'), 'public, max-age=30');
  assert.equal(a.json.rows.length, 1);
  await register(t, '이번', prog([70, 70]));
  t.advance(20);
  const b = await t.call('GET', '/api/leaderboard?board=all');
  assert.equal(b.json.asOf, a.json.asOf);
  assert.equal(b.json.rows.length, 1, '30초 안에는 옛 결과');
  t.advance(11);
  const c = await t.call('GET', '/api/leaderboard?board=all');
  assert.ok(c.json.asOf > a.json.asOf);
  assert.equal(c.json.rows.length, 2);
  assert.equal(c.json.of, 1, '참가자 수(of)는 60초 캐시');
  t.advance(30);
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.of, 2);
  // 난이도별 캐시는 따로
  const e = await t.call('GET', '/api/leaderboard?board=easy');
  assert.equal(e.json.rows.length, 2);
  // 캐시 0이면 항상 최신 + no-store
  const t0 = makeEnv({ LB_CACHE_SEC: '0' });
  const z = await t0.call('GET', '/api/leaderboard?board=all');
  assert.equal(z.headers.get('cache-control'), 'no-store');
  // 순위 조회 캐시 헤더
  const p = await register(t, '삼번', prog([70]));
  assert.equal((await t.call('GET', `/api/rank?board=all&pub=${p.me.pub}`)).headers.get('cache-control'), 'public, max-age=15');
});

test('관리자 API: ADMIN_KEY 없으면 404, 있으면 Bearer 필요, 틀린 키 5회 후 429, CORS 안 염', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  assert.equal((await t.call('GET', '/api/admin/search?q=별')).status, 404);
  assert.equal((await t.call('POST', '/api/admin/moderate', { v: 1, pub: a.me.pub, action: 'hide' })).status, 404);

  const KEY = 'test-admin-key-not-real';
  t.env.ADMIN_KEY = KEY;
  const auth = { authorization: 'Bearer ' + KEY };
  const IP = { 'cf-connecting-ip': '198.51.100.20' };
  assert.equal((await t.call('GET', '/api/admin/search?q=별', undefined, IP)).status, 401);              // 키 없음 = 실패 1
  const search = await t.call('GET', '/api/admin/search?q=' + encodeURIComponent('별빛'), undefined, Object.assign({}, auth, IP));
  assert.equal(search.status, 200);
  assert.deepEqual(search.json.rows.map((r) => [r.nick, r.stars, r.hidden]), [['별빛냥', 3, 0]]);
  assert.equal(search.headers.get('access-control-allow-origin'), null);
  // 숨김·복구·이름 변경 요청·삭제
  const mod = (body) => t.call('POST', '/api/admin/moderate', Object.assign({ v: 1 }, body), Object.assign({}, auth, IP));
  assert.equal((await mod({ pub: a.me.pub, action: 'hide' })).status, 200);
  assert.equal(rows(t, 'SELECT hidden FROM players')[0].hidden, 1);
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.rows.length, 0);
  assert.equal((await mod({ pub: a.me.pub, action: 'unhide' })).status, 200);
  assert.equal((await mod({ id: rows(t, 'SELECT id FROM players')[0].id, action: 'rename' })).status, 200);
  assert.equal(rows(t, 'SELECT hidden FROM players')[0].hidden, 2);
  assert.equal((await mod({ pub: a.me.pub, action: 'zzz' })).json.error.code, 'bad_request');
  assert.equal((await mod({ action: 'hide' })).json.error.code, 'bad_request');
  assert.equal((await mod({ pub: 'ZZZZZZZZ', action: 'hide' })).status, 404);
  assert.equal((await mod({ pub: a.me.pub, action: 'delete' })).status, 200);
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 0);
  // 검색어의 % _ 는 문자 그대로
  await register(t, '별빛냥');
  assert.equal((await t.call('GET', '/api/admin/search?q=%25', undefined, Object.assign({}, auth, IP))).json.rows.length, 0);
  // 브라우저(Origin) 호출은 허용 오리진이어도 거부
  const br = await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({ Origin: 'https://eversunk2-tech.github.io' }, auth, IP));
  assert.equal(br.status, 403);
  assert.equal(br.headers.get('access-control-allow-origin'), null);
  // 틀린 키 연속 -> 429, 이후엔 맞는 키도 막힘(10분 창)
  const IP2 = { 'cf-connecting-ip': '198.51.100.21' };
  for (let i = 0; i < 5; i++) assert.equal((await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({ authorization: 'Bearer ' + 'wrong' + i }, IP2))).status, 401);
  const blocked = await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({ authorization: 'Bearer ' + 'wrong' }, IP2));
  assert.equal(blocked.status, 429);
  assert.equal((await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({}, auth, IP2))).status, 429);
  t.advance(601);
  assert.equal((await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({}, auth, IP2))).status, 200);
  // 다른 IP 는 영향 없음
  assert.equal((await t.call('GET', '/api/admin/search?q=a', undefined, Object.assign({}, auth, { 'cf-connecting-ip': '198.51.100.99' }))).status, 200);
});

test('DB 오류: D1 오류/한도 -> 503 db_unavailable, 스키마 없음·바인딩 없음 -> 500 server_error, health 는 항상 동작', async () => {
  const t = makeEnv();
  const orig = t.env.DB.prepare.bind(t.env.DB);
  const quiet = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    t.env.DB.prepare = () => { throw new Error('D1_ERROR: Exceeded the daily read limit'); };
    const r = await t.call('GET', '/api/leaderboard?board=all');
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'db_unavailable');
    const s = await sync(t, { pid: uuid(), profile: { nick: '별빛냥', avatar: 1 } });
    assert.equal(s.status, 503);
    assert.equal((await t.call('GET', '/api/health')).status, 200);
    t.env.DB.prepare = orig;
    t.env.DB.db.exec('DROP TABLE players');
    const r2 = await t.call('GET', '/api/leaderboard?board=all');
    assert.equal(r2.status, 500);
    assert.equal(r2.json.error.code, 'server_error');
    const t2 = makeEnv({ DB: undefined });
    t2.env.DB = undefined;
    const r3 = await t2.call('GET', '/api/leaderboard?board=all');
    assert.equal(r3.status, 500);
    assert.equal(r3.json.error.code, 'server_error');
    assert.equal((await t2.call('GET', '/api/health')).status, 200);
  } finally { console.error = quiet; }
  assert.ok(logged.length > 0);
});

test('같은 pid 동시 등록(경쟁): 재시도하여 한 행으로 처리', async () => {
  const t = makeEnv();
  const pid = uuid();
  const first = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 1 } });
  assert.equal(first.status, 200);
  t.advance(5);
  // 첫 조회가 '없음'으로 보이는 경쟁 상황을 흉내
  const orig = t.env.DB.prepare.bind(t.env.DB);
  let hidden = true;
  t.env.DB.prepare = (sql) => {
    const st = orig(sql);
    if (hidden && /^SELECT \* FROM players WHERE pid_hash/.test(sql)) {
      hidden = false;
      return { bind: () => ({ first: async () => null }) };
    }
    return st;
  };
  const r = await sync(t, { pid, profile: { nick: '별빛냥', avatar: 2 }, d: prog([70]) });
  assert.equal(r.status, 200, JSON.stringify(r.json));            // 삽입이 pid_hash 중복으로 실패 -> 기존 행으로 다시 처리
  assert.equal(r.json.me.avatar, 2);
  assert.equal(r.json.me.stars.easy, 3);
  assert.equal(rows(t, 'SELECT COUNT(*) AS n FROM players')[0].n, 1);
  t.env.DB.prepare = orig;
});

test('소스에 console.log 가 없고, 오류 로그에 pid·IP·닉네임이 남지 않는다', async () => {
  for (const f of fs.readdirSync(SRC_DIR)) {
    const text = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
    assert.ok(!/console\.log/.test(text), f + ' 에 console.log');
  }
  const t = makeEnv();
  const logs = [];
  const orig = { e: console.error, w: console.warn, l: console.log };
  console.error = console.warn = console.log = (...a) => logs.push(a.join(' '));
  const pid = uuid();
  try {
    t.env.DB.prepare = () => { throw new Error('boom'); };
    await sync(t, { pid, profile: { nick: '비밀닉', avatar: 1 } }, { 'cf-connecting-ip': '203.0.113.5' });
    await t.call('POST', '/api/sync', 'garbage ' + pid);
  } finally { console.error = orig.e; console.warn = orig.w; console.log = orig.l; }
  const all = logs.join('\n');
  assert.ok(!all.includes(pid) && !all.includes('203.0.113.5') && !all.includes('비밀닉'), all);
});

test('다른 동작: 닉네임/아바타만 바꾸면 순위 점수 시각(up_*)은 그대로', async () => {
  const t = makeEnv();
  const a = await register(t, '별빛냥', prog([70]));
  const before = rows(t, 'SELECT up_all, up_easy FROM players')[0];
  t.advance(100);
  await sync(t, { pid: a.pid, profile: { nick: '달토끼', avatar: 7 } });
  const after = rows(t, 'SELECT up_all, up_easy, avatar, nick FROM players')[0];
  assert.equal(after.up_all, before.up_all);
  assert.equal(after.up_easy, before.up_easy);
  assert.equal(after.nick, '달토끼');
  t.advance(100);
  await sync(t, { pid: a.pid, d: prog([70, 10]) });
  const rose = rows(t, 'SELECT up_all, up_easy, up_normal FROM players')[0];
  assert.ok(rose.up_all > before.up_all && rose.up_easy > before.up_easy);
  assert.equal(rose.up_normal, 0);
  // 시간만 늘어도(별이 같아도) 시각이 갱신된다
  t.advance(100);
  await sync(t, { pid: a.pid, d: prog([80, 10]) });
  const t3 = rows(t, 'SELECT up_all, total_left FROM players')[0];
  assert.ok(t3.up_all > rose.up_all);
  assert.equal(t3.total_left, 90);
});

test('전체 탭은 가중 별 점수: 같은 별 수면 고수 위주가 위, 난이도 탭은 별 개수, 최대 180, rank 와 목록 일치', async () => {
  const t = makeEnv();
  // 둘 다 별 9개: 초보 위주 9점 vs 고수 위주 27점. 초보 쪽이 남은 시간이 훨씬 많아도 점수가 우선
  const easyFan = await register(t, '초보러', prog([140, 140, 140]));          // 초보 9별 -> 9점
  const hardFan = await register(t, '고수러', prog([], [], [60, 60, 60]));    // 고수 9별 -> 27점
  const mix = await register(t, '섞어서', prog([70, 40, 20], [70, 70], [10])); // 6 + 6*2 + 1*3 = 21점
  assert.deepEqual(easyFan.me.stars, { easy: 9, normal: 0, hard: 0, all: 9 });
  assert.deepEqual(hardFan.me.stars, { easy: 0, normal: 0, hard: 9, all: 27 });
  assert.deepEqual(mix.me.stars, { easy: 6, normal: 6, hard: 1, all: 21 });
  const all = (await t.call('GET', '/api/leaderboard?board=all')).json;
  assert.deepEqual(all.rows.map((r) => [r.nick, r.stars]), [['고수러', 27], ['섞어서', 21], ['초보러', 9]]);
  const easy = (await t.call('GET', '/api/leaderboard?board=easy')).json;
  assert.deepEqual(easy.rows.map((r) => [r.nick, r.stars]), [['초보러', 9], ['섞어서', 6]]);   // 난이도 탭은 별 개수
  const hard = (await t.call('GET', '/api/leaderboard?board=hard')).json;
  assert.deepEqual(hard.rows.map((r) => [r.nick, r.stars]), [['고수러', 9], ['섞어서', 1]]);
  for (const [i, p] of [hardFan, mix, easyFan].entries()) {
    const r = (await t.call('GET', `/api/rank?board=all&pub=${p.me.pub}`)).json;
    assert.equal(r.rank, i + 1);
    assert.equal(r.stars, all.rows[i].stars);
  }
  // 남은 시간 합계는 가중 없음: 점수 동점이면 단순 합이 큰 쪽
  const a = await register(t, '동점가', prog([], [], [60]));       // 3점... 고수 3별 = 9점
  const b = await register(t, '동점나', prog([70, 70, 70], [], []));   // 초보 9별 = 9점 (왼쪽 합 210)
  const tie = (await t.call('GET', '/api/leaderboard?board=all')).json.rows.filter((r) => r.stars === 9).map((r) => r.nick);
  assert.deepEqual(tie, ['동점나', '초보러', '동점가'].filter((n) => tie.includes(n)).sort((x, y) => tie.indexOf(x) - tie.indexOf(y)));
  assert.equal(tie[tie.length - 1], '동점가', '남은 시간 합 60 이 가장 작아 맨 뒤');
  assert.ok(a && b);
  // 최대 180
  const full = { easy: new Array(10).fill(150), normal: new Array(10).fill(140), hard: new Array(10).fill(120) };
  const champ = await register(t, '만점왕', full);
  assert.equal(champ.me.stars.all, 180);
  assert.deepEqual([champ.me.stars.easy, champ.me.stars.normal, champ.me.stars.hard], [30, 30, 30]);
  assert.equal((await t.call('GET', '/api/leaderboard?board=all')).json.rows[0].stars, 180);
  assert.equal(rows(t, 'SELECT total_stars FROM players WHERE pub = ?', champ.me.pub)[0].total_stars, 180);
  // 점수가 올랐을 때만 up_all 갱신: 초보 별을 늘리면 점수가 올라 시각 갱신, 같은 점수면 그대로
  t.advance(50);
  const before = rows(t, 'SELECT up_all FROM players WHERE pub = ?', easyFan.me.pub)[0].up_all;
  await sync(t, { pid: easyFan.pid, d: prog([140, 140, 140, 70]) });
  assert.ok(rows(t, 'SELECT up_all FROM players WHERE pub = ?', easyFan.me.pub)[0].up_all > before);
});
