'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const game = require('../../game.js');

test('서버 상수가 game.js 의 CONFIG 와 일치한다 (시작 시간·별 비율·스테이지 수·상한)', () => {
  for (const d of core.DIFFS) {
    assert.equal(core.START_TIME[d], game.CONFIG.difficulty[d].time.start, d + ' 시작 시간');
    assert.ok(core.LEFT_CAP[d] >= core.START_TIME[d], d + ' 상한은 시작 시간 이상');
    assert.ok(core.LEFT_CAP[d] <= game.CONFIG.difficulty[d].time.max, d + ' 상한은 게임 내부 상한 이하');
    assert.equal(game.CONFIG.stages.targets[d].length, core.STAGES, d + ' 스테이지 수');
  }
  assert.deepEqual(core.STAR_RATIO, game.CONFIG.stages.star);
  assert.deepEqual(core.STAR_RATIO_BY, game.CONFIG.stages.starBy);      // spec §44: 난이도별 덮어쓰기도 같아야 한다
  for (const d of core.DIFFS) assert.deepEqual(core.starRatioOf(d), game.starRatioOf(d), d + ' 별 비율');
  assert.equal(game.CONFIG.stages.count, core.STAGES);
});

test('starsForLeft 는 game.js 의 starsFor 와 모든 정수 left 에서 같다', () => {
  for (const d of core.DIFFS) {
    const start = game.CONFIG.difficulty[d].time.start;
    for (let left = 0; left <= core.LEFT_CAP[d]; left++) {
      assert.equal(core.starsForLeft(d, left), game.starsFor(left, start, d), d + ' left=' + left);
    }
  }
});

test('별 임계값 경계 ±1 (초보 39/65, 중수 36/60, 고수 15/30 — 고수는 spec §44로 낮춤)', () => {
  const table = { easy: [39, 65], normal: [36, 60], hard: [15, 30] };
  for (const d of core.DIFFS) {
    const [two, three] = table[d];
    assert.deepEqual(core.starThresholds(d), { two: two, three: three });
    assert.equal(core.starsForLeft(d, two - 1), 1);
    assert.equal(core.starsForLeft(d, two), 2);
    assert.equal(core.starsForLeft(d, three - 1), 2);
    assert.equal(core.starsForLeft(d, three), 3);
    assert.equal(core.starsForLeft(d, 0), 1);
    assert.equal(core.starsForLeft(d, -1), 0);
  }
});

test('starRatioOf (spec §44): 고수만 15%·30%, 초보·중수·모르는 난이도는 기본 30%·50%, 정수 임계값 고수 15/30', () => {
  assert.deepEqual(core.STAR_RATIO, [0.3, 0.5]);
  assert.deepEqual(core.STAR_RATIO_BY, { hard: [0.15, 0.3] });
  assert.deepEqual(core.starRatioOf('hard'), [0.15, 0.3]);
  for (const d of ['easy', 'normal', 'zzz', undefined, null, '__proto__', 'constructor']) assert.deepEqual(core.starRatioOf(d), [0.3, 0.5], String(d));
  assert.deepEqual(core.starThresholds('hard'), { two: 15, three: 30 });
  assert.deepEqual(core.starThresholds('normal'), { two: 36, three: 60 });
  assert.deepEqual(core.starThresholds('easy'), { two: 39, three: 65 });
  // 경계: 고수 14->★, 15->★★, 29->★★, 30->★★★ (옛 기준에서 ★★이던 left 35 는 ★★★, 옛 ★★★ 50 은 그대로 ★★★)
  assert.deepEqual([14, 15, 29, 30, 35, 50].map((l) => core.starsForLeft('hard', l)), [1, 2, 2, 3, 3, 3]);
  // 중수 left 40 은 ★★ 그대로(★★★은 60초 필요)
  assert.equal(core.starsForLeft('normal', 40), 2);
});

test('validateProgress: 정상/범위 밖/소수/문자열/길이/키 누락/여분 키', () => {
  const ok = { easy: new Array(10).fill(-1), normal: new Array(10).fill(0), hard: new Array(10).fill(120) };
  assert.equal(core.validateProgress(ok).ok, true);
  const mut = (f) => { const d = JSON.parse(JSON.stringify(ok)); f(d); return core.validateProgress(d); };
  assert.equal(mut((d) => { d.easy[0] = 151; }).ok, false);          // 상한 150
  assert.equal(mut((d) => { d.easy[0] = 150; }).ok, true);
  assert.equal(mut((d) => { d.normal[0] = 141; }).ok, false);
  assert.equal(mut((d) => { d.hard[0] = 121; }).ok, false);
  assert.equal(mut((d) => { d.easy[0] = -2; }).ok, false);
  assert.equal(mut((d) => { d.easy[0] = 1.5; }).ok, false);
  assert.equal(mut((d) => { d.easy[0] = '30'; }).ok, false);
  assert.equal(mut((d) => { d.easy[0] = null; }).ok, false);
  assert.equal(mut((d) => { d.easy[0] = NaN; }).ok, false);
  assert.equal(mut((d) => { d.easy = d.easy.slice(0, 9); }).ok, false);
  assert.equal(mut((d) => { d.easy.push(1); }).ok, false);
  assert.equal(mut((d) => { delete d.hard; }).ok, false);
  assert.equal(mut((d) => { d.extra = []; }).ok, false);
  assert.equal(mut((d) => { d.easy = 'x'; }).ok, false);
  const r = mut((d) => { d.normal[3] = 9999; });
  assert.equal(r.code, 'progress_invalid');
  assert.equal(r.field, 'd.normal[3]');
  assert.equal(core.validateProgress(null).ok, false);
  assert.equal(core.validateProgress([]).ok, false);
});

test('병합은 스테이지별 최대값이고 입력을 바꾸지 않는다', () => {
  const oldP = core.emptyProgress();
  oldP.easy[0] = 70; oldP.easy[1] = 40;
  const nd = core.emptyProgress();
  nd.easy[0] = 30; nd.easy[1] = 50; nd.easy[2] = 10;
  const m = core.mergeProgress(oldP, nd);
  assert.deepEqual(m.easy.slice(0, 4), [70, 50, 10, -1]);
  assert.equal(oldP.easy[1], 40);
  assert.deepEqual(core.mergeProgress(oldP, null).easy, oldP.easy);
});

test('연쇄 해금 검사', () => {
  const p = core.emptyProgress();
  assert.equal(core.chainViolation(p), null);
  p.easy[0] = 10; p.easy[1] = 10;
  assert.equal(core.chainViolation(p), null);
  p.hard[9] = 50;
  assert.equal(core.chainViolation(p), 'd.hard[9]');
  const q = core.emptyProgress();
  q.normal[1] = 5;                                  // 1번(첫 스테이지) 미클리어인데 2번 클리어
  assert.equal(core.chainViolation(q), 'd.normal[1]');
});

test('합계: 별·남은 시간·최고 레벨', () => {
  const p = core.emptyProgress();
  p.easy[0] = 70;      // 3별
  p.easy[1] = 40;      // 2별
  p.easy[2] = 0;       // 1별
  p.normal[0] = 60;    // 3별
  p.hard[0] = 29;      // 2별 (고수는 15초 이상부터 2별 — spec §44. 옛 기준에서는 1별)
  const t = core.computeTotals(p);
  assert.deepEqual(t.stars, { easy: 6, normal: 3, hard: 2 });
  assert.deepEqual(t.left, { easy: 110, normal: 60, hard: 29 });
  assert.deepEqual(t.best, { easy: 3, normal: 1, hard: 1 });
  assert.equal(t.totalStars, 6 + 3 * 2 + 2 * 3, '별 점수 = 초보x1 + 중수x2 + 고수x3');
  assert.equal(t.totalLeft, 199, '남은 시간 합계는 가중 없는 단순 합');
  // 전부 3별 + 상한 = 최대 180점 (별 90개)
  const full = { easy: new Array(10).fill(150), normal: new Array(10).fill(140), hard: new Array(10).fill(120) };
  const ft = core.computeTotals(full);
  assert.equal(ft.totalStars, 180);
  assert.equal(ft.totalStars, core.MAX_TOTAL_SCORE);
  assert.equal(ft.stars.easy + ft.stars.normal + ft.stars.hard, 90);
  assert.equal(ft.totalLeft, 1500 + 1400 + 1200);
});

test('weightedScore / STAR_WEIGHT: 초보 3★, 중수 2★, 고수 1★ = 3+4+3 = 10', () => {
  assert.deepEqual(core.STAR_WEIGHT, { easy: 1, normal: 2, hard: 3 });
  assert.equal(core.weightedScore({ easy: 3, normal: 2, hard: 1 }), 10);
  assert.equal(core.weightedScore({ easy: 30, normal: 30, hard: 30 }), 180);
  assert.equal(core.weightedScore({ easy: 0, normal: 0, hard: 0 }), 0);
  assert.equal(core.weightedScore({}), 0);
});

test('정렬 비교: 별 -> 남은 시간 합 -> 먼저 달성 -> id, 공동 순위 없음', () => {
  const rows = [
    { id: 5, stars: 10, left: 100, up: 50 },
    { id: 3, stars: 10, left: 100, up: 50 },     // 모두 같으면 id 작은 쪽이 앞
    { id: 4, stars: 10, left: 100, up: 40 },     // 같은 값이면 먼저 달성한 쪽
    { id: 2, stars: 10, left: 120, up: 90 },     // 시간 합이 많은 쪽
    { id: 1, stars: 11, left: 1, up: 99 },       // 별이 많은 쪽
    { id: 6, stars: 9, left: 999, up: 1 }
  ];
  assert.deepEqual(rows.slice().sort(core.compareRank).map((r) => r.id), [1, 2, 4, 3, 5, 6]);
});

test('kstDay: 한국 시간 자정 경계', () => {
  const kstMidnight = Date.UTC(2026, 10, 7, 15, 0, 0) / 1000;      // 2026-11-08 00:00 KST
  assert.equal(core.kstDay(kstMidnight), core.kstDay(kstMidnight - 1) + 1);
  assert.equal(core.kstDay(kstMidnight), core.kstDay(kstMidnight + 3600));
});

test('originAllowed: 정확 일치, 로컬 포트 와일드카드만, * 무시, null 거부', () => {
  const list = 'https://eversunk2-tech.github.io, http://localhost:*';
  assert.equal(core.originAllowed('https://eversunk2-tech.github.io', list), true);
  assert.equal(core.originAllowed('https://eversunk2-tech.github.io/', list), false);
  assert.equal(core.originAllowed('https://evil.example', list), false);
  assert.equal(core.originAllowed('http://localhost:8765', list), true);
  assert.equal(core.originAllowed('http://localhost:8765/x', list), false);
  assert.equal(core.originAllowed('http://localhost', list), false);
  assert.equal(core.originAllowed('http://localhost.evil.com:80', list), false);
  assert.equal(core.originAllowed('http://127.0.0.1:9000', list), false);
  assert.equal(core.originAllowed('http://127.0.0.1:9000', 'http://127.0.0.1:*'), true);
  assert.equal(core.originAllowed('https://a.example', '*'), false);
  assert.equal(core.originAllowed('https://a.example:*', 'https://a.example:*'), true);   // 정확 일치(문자열이 같음)일 뿐 와일드카드 아님
  assert.equal(core.originAllowed('https://a.example:1', 'https://a.example:*'), false);
  assert.equal(core.originAllowed('null', list), false);
  assert.equal(core.originAllowed('http://localhost:1', undefined), false);
});

test('checkProfile: 닉네임·아바타 1~16', () => {
  assert.equal(core.checkProfile({ nick: '별빛냥', avatar: 16 }).ok, true);
  assert.equal(core.checkProfile({ nick: '별빛냥', avatar: 1 }).ok, true);
  for (const a of [0, 17, 1.5, '3', null, undefined, -1]) {
    const r = core.checkProfile({ nick: '별빛냥', avatar: a });
    assert.equal(r.code, 'avatar_invalid', String(a));
  }
  assert.equal(core.checkProfile({ nick: 5, avatar: 3 }).code, 'nick_charset');
  assert.equal(core.checkProfile({ nick: '시발', avatar: 3 }).code, 'nick_blocked');
  assert.equal(core.checkProfile('x').code, 'bad_request');
  assert.equal(core.checkProfile({ nick: '거북이', avatar: 3 }, '거북이').code, 'nick_blocked');
});

test('safeEqual / isUuid / normalizePub', () => {
  assert.equal(core.safeEqual('abc', 'abc'), true);
  assert.equal(core.safeEqual('abc', 'abd'), false);
  assert.equal(core.safeEqual('abc', 'abcd'), false);
  assert.equal(core.safeEqual('', ''), true);
  assert.equal(core.isUuid('11111111-2222-4333-8444-555555555555'), true);
  assert.equal(core.isUuid('11111111-2222-4333-8444-55555555555'), false);
  assert.equal(core.isUuid(123), false);
  assert.equal(core.normalizePub('abcd2345'), 'ABCD2345');
  assert.equal(core.normalizePub('ABCDILOU'), null);           // I L O U 는 쓰지 않음
  assert.equal(core.normalizePub('SHORT'), null);
});

/* ---------------------------------------------------------------- 최고점 도전 모드 (spec §46.3) */

test('SCORE_CAP = 280000 · scoreWriteIntervalSec = 60 (spec §46.3.4~46.3.5), 기존 쓰기 간격 3초는 그대로', () => {
  assert.equal(core.SCORE_CAP, 280000);
  assert.equal(core.LIMITS.scoreWriteIntervalSec, 60);
  assert.equal(core.LIMITS.writeIntervalSec, 3);
  assert.equal(core.API_VERSION, 1, 'API_VERSION 을 올리면 옛 클라이언트가 랭킹을 꺼 버린다(spec §46.3.4)');
});

test('서버 SCORE_CAP 이 game.js 의 CONFIG.challenge.scoreCap 과 같다 (spec §46.3.5·46.4: 두 값이 어긋나면 정직한 점수가 서버에서 무시된다)', () => {
  // Review R-S(§34): B-C 구현 전에는 CONFIG.challenge 가 없으면 건너뛰게 했던 것을, 구현이 들어온 뒤라 단언으로 바꿨다(조용히 건너뛰지 못하게).
  assert.ok(game.CONFIG.challenge, 'game.js 에 CONFIG.challenge 가 있어야 한다(없으면 서버 상한 대조가 사라진다)');
  assert.equal(game.CONFIG.challenge.scoreCap, core.SCORE_CAP);
});

test('validateScore: 0·상한은 정상, 상한+1은 정상이지만 rejected, 음수·소수·문자열·null·true·배열·객체는 progress_invalid(field s)', () => {
  const okV = (v) => core.validateScore(v);
  assert.deepEqual(okV(0), { ok: true, s: 0, rejected: false });
  assert.deepEqual(okV(1), { ok: true, s: 1, rejected: false });
  assert.deepEqual(okV(173040), { ok: true, s: 173040, rejected: false });
  assert.deepEqual(okV(core.SCORE_CAP), { ok: true, s: 280000, rejected: false });
  assert.deepEqual(okV(core.SCORE_CAP + 1), { ok: true, s: 280001, rejected: true });
  assert.equal(okV(Number.MAX_SAFE_INTEGER).rejected, true);
  assert.equal(okV(1e300).rejected, true, '정수로 보이는 큰 수도 무시 대상일 뿐 오류는 아니다');
  assert.equal(Object.is(okV(-0).s, 0), true, '-0 은 0 으로');
  const bad = { ok: false, code: 'progress_invalid', field: 's' };
  for (const v of [-1, -280000, 0.5, 1.5, 100.0001, '100', '', 'abc', null, undefined, true, false, [], [1], {}, { a: 1 }, NaN, Infinity, -Infinity, () => 1, 10n]) {
    assert.deepEqual(core.validateScore(v), bad, String(typeof v === 'bigint' ? v + 'n' : JSON.stringify(v) || typeof v));
  }
});

test('boardCols: 네 보드 모두 score 열은 best_score, 별·남은 시간·달성 시각 열은 기존대로', () => {
  assert.deepEqual(core.boardCols('all'), { stars: 'total_stars', score: 'best_score', left: 'total_left', up: 'up_all' });
  for (const d of core.DIFFS) assert.deepEqual(core.boardCols(d), { stars: 'stars_' + d, score: 'best_score', left: 'left_' + d, up: 'up_' + d });
  assert.equal(core.boardCols('zzz'), null);
});

test('정렬 비교(spec §46.3.3): 별 -> 최고점 -> 남은 시간 합 -> 먼저 달성 -> id, 키를 하나씩 뒤집은 12쌍', () => {
  const base = { id: 10, stars: 10, score: 5000, left: 100, up: 50 };
  const better = (over) => Object.assign({}, base, over);
  // [더 앞서야 하는 행, 뒤여야 하는 행, 설명]: 각 쌍은 앞 단계는 같고 한 단계만 다르다. (더 앞선 쪽이 일부러 뒤 단계 값은 더 나쁘게 만들어 단계 우선순위를 확인)
  const pairs = [
    [better({ stars: 11, score: 0, left: 0, up: 999, id: 99 }), base, '별이 많으면 나머지가 모두 나빠도 앞'],
    [better({ score: 5001, left: 0, up: 999, id: 99 }), base, '별이 같으면 최고점이 높은 쪽(남은 시간·달성 시각·id 가 나빠도)'],
    [better({ left: 101, up: 999, id: 99 }), base, '별·최고점이 같으면 남은 시간이 많은 쪽'],
    [better({ up: 49, id: 99 }), base, '별·최고점·남은 시간이 같으면 먼저 달성한 쪽'],
    [better({ id: 9 }), base, '모두 같으면 id 가 작은 쪽'],
    [better({ score: 5000, stars: 10 }), better({ score: 4999 }), '최고점 1점 차이'],
    [better({ score: 280000 }), better({ score: 279999, left: 9999 }), '상한 근처 1점 차이도 남은 시간보다 우선'],
    [better({ score: 1, left: 0 }), better({ score: 0, left: 9999, up: 1, id: 1 }), '점수 1점이 0점(기록 없음)보다 앞'],
    [better({ stars: 1, score: 0 }), better({ stars: 0, score: 280000 }), '별 0개의 최고점은 의미 없음 - 별이 우선'],
    [better({ left: 101, score: 0 }), better({ left: 100, score: 0 }), '둘 다 0점이면 옛 규칙: 남은 시간'],
    [better({ up: 49, score: 0 }), better({ up: 50, score: 0 }), '둘 다 0점이면 옛 규칙: 달성 시각'],
    [better({ id: 1, score: 0 }), better({ id: 2, score: 0 }), '둘 다 0점이면 옛 규칙: id']
  ];
  assert.ok(pairs.length >= 10);
  for (const [a, b, why] of pairs) {
    assert.ok(core.compareRank(a, b) < 0, why + ' (a 가 앞)');
    assert.ok(core.compareRank(b, a) > 0, why + ' (b 가 뒤)');
  }
  assert.equal(core.compareRank(base, Object.assign({}, base)), 0);
  // score 가 없는 행(옛 형식)은 0점으로 본다 -> 모두 0점이면 옛 규칙과 순서가 똑같다
  const oldStyle = [
    { id: 5, stars: 10, left: 100, up: 50 }, { id: 3, stars: 10, left: 100, up: 50 }, { id: 4, stars: 10, left: 100, up: 40 },
    { id: 2, stars: 10, left: 120, up: 90 }, { id: 1, stars: 11, left: 1, up: 99 }, { id: 6, stars: 9, left: 999, up: 1 }
  ];
  assert.deepEqual(oldStyle.slice().sort(core.compareRank).map((r) => r.id), [1, 2, 4, 3, 5, 6]);
  assert.deepEqual(oldStyle.map((r) => Object.assign({ score: 0 }, r)).sort(core.compareRank).map((r) => r.id), [1, 2, 4, 3, 5, 6]);
  // 전순서: 무작위 행을 섞어 정렬해도 결과가 같고(추이성), 같은 행이 둘 있을 수 없다(id 가 다르므로)
  let a32 = 7;
  const rnd = (n) => {                                              // mulberry32(시드 7)
    a32 = (a32 + 0x6D2B79F5) | 0;
    let x = Math.imul(a32 ^ (a32 >>> 15), 1 | a32);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
  const many = [];
  for (let i = 1; i <= 300; i++) many.push({ id: i, stars: rnd(3), score: rnd(3) * 1000, left: rnd(3) * 10, up: rnd(3) });
  const s1 = many.slice().sort(core.compareRank).map((r) => r.id);
  const s2 = many.slice().reverse().sort(core.compareRank).map((r) => r.id);
  assert.deepEqual(s1, s2);
  assert.equal(new Set(s1).size, 300);
});
