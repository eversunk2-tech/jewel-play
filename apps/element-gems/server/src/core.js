/* element-gems server - core.js
 * 순수 함수 모음(DB·네트워크 없음): 상수, 별 계산, 진행 검증·병합, 정렬 키, 오리진 검사 등. spec §19.2, §19.4.
 * 닉네임 규칙은 클라이언트와 같은 ../../nickname.js 를 쓴다.
 */
'use strict';

const NICK = require('../../nickname');

const API_VERSION = 1;
const DIFFS = ['easy', 'normal', 'hard'];
const BOARDS = ['all', 'easy', 'normal', 'hard'];
const STAGES = 10;
// 전체 탭 '별 점수' = 초보 별 x1 + 중수 별 x2 + 고수 별 x3 (최대 30+60+90 = 180). 난이도 탭은 별 개수 그대로. 클라이언트 표시용과 같은 값.
const STAR_WEIGHT = { easy: 1, normal: 2, hard: 3 };
const MAX_TOTAL_SCORE = 180;

// game.js 의 CONFIG.difficulty[*].time.start / CONFIG.stages.star / CONFIG.stages.starBy 와 같아야 한다(server/test/core.test.js 가 대조).
const START_TIME = { easy: 130, normal: 120, hard: 100 };
const STAR_RATIO = [0.3, 0.5];                       // 기본: >=0.3 -> 2별, >=0.5 -> 3별
const STAR_RATIO_BY = { hard: [0.15, 0.3] };         // 난이도별 덮어쓰기(spec §44): 고수는 >=0.15 -> 2별, >=0.3 -> 3별
// spec §19.2.2 서버 허용 left 상한 = 시작 시간 + 20 (Review가 실제 최대를 확인한 뒤 필요하면 완화)
const LEFT_CAP = { easy: 150, normal: 140, hard: 120 };
// 최고점 도전 모드(spec §46.3.5) 최고점 상한. 이 값을 넘는 정수는 정직한 점수가 아니라 보고 그 값만 무시한다(기록 안 함).
// game.js 의 CONFIG.challenge.scoreCap 과 같아야 한다(server/test/core.test.js 가 대조). 점수 규칙·프리셋을 바꾸면 새 Plan 으로 다시 잰다(§46.3.5).
const SCORE_CAP = 280000;

const LIMITS = {
  bodyBytes: 2048,          // 요청 본문 최대
  writeIntervalSec: 3,      // 같은 pid의 쓰기 간격
  nickChangesPerDay: 2,
  regPerHour: 100,          // IP 해시당 시간당 등록 수
  scoreWriteIntervalSec: 60, // 최고점이 오르는 요청은 마지막 쓰기로부터 이 시간 이상(spec §46.3.4). 프로필·진행 변경은 writeIntervalSec(3초)
  topMax: 50,
  adminFailMax: 5,          // 관리자 키 실패 허용 횟수
  adminFailWindowSec: 600,
  leaderCacheSec: 30,
  avatarMax: 16
};

const EMPTY_PROG_STR = '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1';

/** 난이도 diff의 별 기준 [2별 비율, 3별 비율]. STAR_RATIO_BY[diff]가 올바른 모양이면 그것, 아니면 기본 STAR_RATIO. game.js의 starRatioOf와 같은 규칙 */
function starRatioOf(diff) {
  const r = STAR_RATIO_BY[diff];
  if (Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number' && r[0] > 0 && r[0] < r[1] && r[1] <= 1) return r;
  return STAR_RATIO;
}

/** 별 계산용 정수 임계값. game.js의 starsFor(timeLeft/startTime, …, diff)(난이도별 비율 이상이면 3 / 2, else 1)와 같은 결과 */
function starThresholds(diff) {
  const s = START_TIME[diff];
  const r = starRatioOf(diff);
  return { three: Math.ceil(s * r[1] - 1e-9), two: Math.ceil(s * r[0] - 1e-9) };
}

/** left(정수 초, >=0 = 클리어) -> 별 1~3. 미클리어(-1)면 0 */
function starsForLeft(diff, left) {
  if (!(left >= 0)) return 0;
  const t = starThresholds(diff);
  if (left >= t.three) return 3;
  if (left >= t.two) return 2;
  return 1;
}

/** 'a,b,c,...' -> 길이 10 정수 배열. 이상하면 전부 -1 */
function parseProg(str) {
  const out = String(str || '').split(',').map((x) => Number(x));
  if (out.length !== STAGES || out.some((x) => !Number.isInteger(x) || x < -1)) return new Array(STAGES).fill(-1);
  return out;
}
function serializeProg(arr) { return arr.join(','); }

function emptyProgress() {
  return { easy: new Array(STAGES).fill(-1), normal: new Array(STAGES).fill(-1), hard: new Array(STAGES).fill(-1) };
}

/** 요청의 d 검증. 성공: { ok:true, d }, 실패: { ok:false, code:'progress_invalid', field } */
function validateProgress(d) {
  const bad = (field) => ({ ok: false, code: 'progress_invalid', field });
  if (!d || typeof d !== 'object' || Array.isArray(d)) return bad('d');
  const keys = Object.keys(d);
  for (const k of keys) if (DIFFS.indexOf(k) < 0) return bad('d.' + k);
  for (const diff of DIFFS) {
    const arr = d[diff];
    if (!Array.isArray(arr) || arr.length !== STAGES) return bad('d.' + diff);
    for (let i = 0; i < STAGES; i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < -1 || v > LEFT_CAP[diff]) return bad('d.' + diff + '[' + i + ']');
    }
  }
  return { ok: true, d: { easy: d.easy.slice(), normal: d.normal.slice(), hard: d.hard.slice() } };
}

/** 요청의 s(최고점) 검증. 0 이상의 정수만 정상(null·true·문자열·배열·소수·음수·NaN 은 progress_invalid, field 's').
 *  성공: { ok:true, s, rejected } - rejected 는 SCORE_CAP 초과(그 값만 무시하고 나머지는 정상 처리하라는 뜻). 실패: { ok:false, code:'progress_invalid', field:'s' } */
function validateScore(s) {
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0) return { ok: false, code: 'progress_invalid', field: 's' };
  return { ok: true, s: s || 0, rejected: s > SCORE_CAP };                       // s || 0 : -0 을 0 으로
}

/** 스테이지별 최대값 병합(감소 불가) */
function mergeProgress(oldP, newD) {
  const out = {};
  for (const diff of DIFFS) {
    out[diff] = [];
    for (let i = 0; i < STAGES; i++) out[diff].push(Math.max(oldP[diff][i], newD ? newD[diff][i] : -1));
  }
  return out;
}

/** 연쇄 해금 검사: 스테이지 N이 클리어면 앞 스테이지도 전부 클리어여야 한다. 위반이면 field 문자열, 정상이면 null */
function chainViolation(p) {
  for (const diff of DIFFS) {
    let seenGap = false;
    for (let i = 0; i < STAGES; i++) {
      if (p[diff][i] < 0) seenGap = true;
      else if (seenGap) return 'd.' + diff + '[' + i + ']';
    }
  }
  return null;
}

/** 난이도별 별 개수 { easy, normal, hard } -> 가중 별 점수 */
function weightedScore(starsByDiff) {
  let sum = 0;
  for (const d of DIFFS) sum += (starsByDiff[d] || 0) * STAR_WEIGHT[d];
  return sum;
}

/** 진행 -> 난이도별·전체 합계. totalStars 는 가중 별 점수(DB 열 이름은 total_stars 유지), totalLeft 는 단순 합 */
function computeTotals(p) {
  const t = { stars: {}, left: {}, best: {}, totalStars: 0, totalLeft: 0 };
  for (const diff of DIFFS) {
    let stars = 0;
    let left = 0;
    let best = 0;
    for (let i = 0; i < STAGES; i++) {
      const v = p[diff][i];
      if (v >= 0) { stars += starsForLeft(diff, v); left += v; best = i + 1; }
    }
    t.stars[diff] = stars;
    t.left[diff] = left;
    t.best[diff] = best;
    t.totalLeft += left;
  }
  t.totalStars = weightedScore(t.stars);
  return t;
}

/** 보드 -> D1 열 이름. score(최고점) 열은 네 보드가 같다 */
function boardCols(board) {
  if (board === 'all') return { stars: 'total_stars', score: 'best_score', left: 'total_left', up: 'up_all' };
  if (DIFFS.indexOf(board) < 0) return null;
  return { stars: 'stars_' + board, score: 'best_score', left: 'left_' + board, up: 'up_' + board };
}

/** 순위 비교 함수(SQL의 ORDER BY 와 같은 순서, spec §46.3.3): 별 내림 -> 최고점 내림 -> 남은 시간 합 내림 -> 달성 시각 오름 -> id 오름.
 *  score 가 없는 행은 0점(도전 기록 없음)으로 보므로, 모두 0점이면 옛 규칙(남은 시간 -> 달성 시각 -> id)과 같다 */
function compareRank(a, b) {
  return (b.stars - a.stars) || ((b.score || 0) - (a.score || 0)) || (b.left - a.left) || (a.up - b.up) || (a.id - b.id);
}

/** 한국 시간(UTC+9) 날짜 번호 */
function kstDay(nowSec) { return Math.floor((nowSec + 9 * 3600) / 86400); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

const PUB_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32
const PUB_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
function normalizePub(s) {
  if (typeof s !== 'string') return null;
  const u = s.toUpperCase();
  return PUB_RE.test(u) ? u : null;
}

/** 허용 오리진 검사. 목록은 쉼표 문자열. 항목은 정확히 같은 오리진이거나,
 *  localhost / 127.0.0.1 에 한해 포트 자리에 * 를 쓴 형태(http://localhost:*)를 허용한다. '*' 단독 항목은 무시한다. */
function originAllowed(origin, list) {
  if (typeof origin !== 'string' || !origin || typeof list !== 'string') return false;
  const items = list.split(',').map((x) => x.trim()).filter(Boolean);
  for (const it of items) {
    if (it === '*') continue;
    if (it === origin) return true;
    const m = it.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)):\*$/);
    if (m && origin.indexOf(m[1] + ':') === 0 && /^\d{1,5}$/.test(origin.slice(m[1].length + 1))) return true;
  }
  return false;
}

/** 닉네임·아바타 검사. 실패하면 { ok:false, code, message, field } */
function checkProfile(profile, extraBlock) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, code: 'bad_request', message: '프로필 형식이 올바르지 않아요.', field: 'profile' };
  }
  if (typeof profile.nick !== 'string') {
    return { ok: false, code: 'nick_charset', message: NICK.MESSAGES.nick_charset, field: 'nick' };
  }
  const r = NICK.validateNick(profile.nick, extraBlock);
  if (!r.ok) return r;
  const a = profile.avatar;
  if (typeof a !== 'number' || !Number.isInteger(a) || a < 1 || a > LIMITS.avatarMax) {
    return { ok: false, code: 'avatar_invalid', message: '그림은 1~16번 중에서 골라 주세요.', field: 'avatar' };
  }
  return { ok: true, nick: r.nick, key: r.key, avatar: a };
}

/** 상수 시간 문자열 비교(길이가 달라도 같은 횟수만큼 순회) */
function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i % (x.length || 1)) || 0) ^ (y.charCodeAt(i % (y.length || 1)) || 0);
  return diff === 0;
}

module.exports = {
  API_VERSION, STAR_WEIGHT, MAX_TOTAL_SCORE, weightedScore, DIFFS, BOARDS, STAGES, START_TIME, STAR_RATIO, STAR_RATIO_BY, LEFT_CAP, SCORE_CAP, LIMITS, EMPTY_PROG_STR, PUB_ALPHABET,
  starRatioOf, starThresholds, starsForLeft, parseProg, serializeProg, emptyProgress, validateProgress, validateScore, mergeProgress, chainViolation,
  computeTotals, boardCols, compareRank, kstDay, isUuid, normalizePub, originAllowed, checkProfile, safeEqual
};
