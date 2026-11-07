/* element-gems server - worker.js
 * Cloudflare Worker 본체: 라우팅, D1 사용, CORS, 서버측 검증. spec §19.4.
 * `handle(request, env, opts)` 하나를 Worker(dist/worker.js의 default export)와 로컬 목 서버(mock/server.js)가 함께 쓴다.
 *
 * env: DB(D1 바인딩, 이름은 반드시 DB), ALLOWED_ORIGINS(쉼표 목록), EXTRA_BLOCK(쉼표 목록, 선택),
 *      IP_SALT(비밀, 선택), ADMIN_KEY(비밀, 선택 - 있을 때만 /api/admin/* 동작), LB_CACHE_SEC(선택, 기본 30)
 * opts(시험용): { now: () => 밀리초, randomInt: (n) => 0..n-1 }
 * 주의: pid·IP·닉네임을 console 에 남기지 않는다.
 */
'use strict';

const core = require('./core');
const NICK = require('../../nickname');

const { LIMITS, DIFFS } = core;

/* ------------------------------------------------------------------ 오류 */
const STATUS = {
  bad_request: 400, too_large: 413, unsupported_version: 400,
  nick_length: 400, nick_charset: 400, nick_digits: 400, nick_repeat: 400, nick_reserved: 400, nick_pii: 400, nick_blocked: 400,
  avatar_invalid: 400, nick_change_limit: 429, progress_invalid: 400, progress_chain: 400, profile_required: 400,
  player_not_found: 404, forbidden_origin: 403, rate_limited: 429, db_unavailable: 503, server_error: 500,
  not_found: 404, method_not_allowed: 405, unauthorized: 401
};
const MESSAGES = {
  bad_request: '요청 형식이 올바르지 않아요.',
  too_large: '요청이 너무 커요.',
  unsupported_version: '앱을 새로 고쳐 주세요.',
  avatar_invalid: '그림은 1~16번 중에서 골라 주세요.',
  nick_change_limit: NICK.MESSAGES.nick_change_limit,
  progress_invalid: '기록 형식이 올바르지 않아요.',
  progress_chain: '기록 순서가 맞지 않아요.',
  profile_required: '먼저 이름과 그림을 정해 주세요.',
  player_not_found: '서버에 있던 프로필이 지워졌어요. 다시 만들 수 있어요.',
  forbidden_origin: '이 주소에서는 쓸 수 없어요.',
  rate_limited: '잠시 뒤에 다시 해 주세요.',
  db_unavailable: '지금은 순위표를 쓸 수 없어요. 조금 뒤에 다시 해 주세요.',
  server_error: '서버에 문제가 생겼어요. 조금 뒤에 다시 해 주세요.',
  not_found: '찾을 수 없어요.',
  method_not_allowed: '이 주소는 그 방식으로 쓸 수 없어요.',
  unauthorized: '권한이 없어요.'
};

class ApiError extends Error {
  constructor(code, field, extra) {
    super(code);
    this.code = code;
    this.status = (extra && extra.status) || STATUS[code] || 500;
    this.userMessage = (extra && extra.message) || MESSAGES[code] || NICK.messageFor(code);
    this.field = field || undefined;
    this.headers = (extra && extra.headers) || null;
  }
}
/** 중복 키(UNIQUE) 위반. 어떤 열인지 text 로 구분 */
class UniqueError extends Error {
  constructor(text) { super('unique'); this.text = text; }
}

function classifyDbError(e) {
  const msg = String((e && e.message) || e);
  if (/UNIQUE constraint failed/i.test(msg)) return new UniqueError(msg);
  if (/no such (table|column)|has no column|no such index/i.test(msg)) {
    console.error('db schema error:', msg.slice(0, 160));            // 스키마를 같은 DB에 적용했는지 확인
    return new ApiError('server_error');
  }
  console.error('db error:', msg.slice(0, 160));
  return new ApiError('db_unavailable');
}

/* ------------------------------------------------------------------ DB 도우미 (D1 호환: prepare/bind/first/all/run) */
async function dbExec(env, kind, sql, params) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') {
    console.error('env.DB 바인딩이 없습니다(D1 바인딩 이름은 DB 여야 합니다).');
    throw new ApiError('server_error');
  }
  try {
    let st = env.DB.prepare(sql);
    if (params && params.length) st = st.bind.apply(st, params);
    if (kind === 'first') return (await st.first()) || null;
    if (kind === 'all') { const r = await st.all(); return (r && r.results) || []; }
    return await st.run();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw classifyDbError(e);
  }
}
const dbFirst = (env, sql, params) => dbExec(env, 'first', sql, params);
const dbAll = (env, sql, params) => dbExec(env, 'all', sql, params);
const dbRun = (env, sql, params) => dbExec(env, 'run', sql, params);

/* ------------------------------------------------------------------ 암호·난수 */
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return out;
}
function randInt(ctx, n) {
  if (ctx.opts.randomInt) return ctx.opts.randomInt(n);
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function randomPub() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < 8; i++) s += core.PUB_ALPHABET.charAt(a[i] & 31);
  return s;
}
/** IP 해시 = SHA256(IP + 날짜 + IP_SALT) 앞 16자. 원본 IP는 저장·기록하지 않는다 */
async function ipHashOf(ctx) {
  const ip = ctx.request.headers.get('cf-connecting-ip') || 'unknown';
  const day = new Date(ctx.nowMs).toISOString().slice(0, 10);
  return (await sha256hex(ip + '|' + day + '|' + (ctx.env.IP_SALT || ''))).slice(0, 16);
}

/* ------------------------------------------------------------------ 응답 */
function respond(ctx, status, body, extraHeaders, cacheControl) {
  const h = new Headers();
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Vary', 'Origin');
  h.set('Cache-Control', cacheControl || 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  if (ctx && ctx.cors) {
    h.set('Access-Control-Allow-Origin', ctx.origin);
    h.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  if (extraHeaders) for (const k of Object.keys(extraHeaders)) h.set(k, extraHeaders[k]);
  return new Response(JSON.stringify(body), { status: status, headers: h });
}
function ok(ctx, body, cacheControl) {
  return respond(ctx, 200, Object.assign({ ok: true, v: core.API_VERSION }, body), null, cacheControl);
}
function errorResponse(ctx, e) {
  const err = {
    code: e.code,
    message: e.userMessage
  };
  if (e.field) err.field = e.field;
  return respond(ctx, e.status, { ok: false, v: core.API_VERSION, error: err }, e.headers);
}

/* ------------------------------------------------------------------ 요청 읽기 */
async function readJson(ctx) {
  const cl = ctx.request.headers.get('content-length');
  if (cl && Number(cl) > LIMITS.bodyBytes) throw new ApiError('too_large');
  let text;
  try { text = await ctx.request.text(); } catch (e) { throw new ApiError('bad_request'); }
  if (new TextEncoder().encode(text).length > LIMITS.bodyBytes) throw new ApiError('too_large');
  let body;
  try { body = JSON.parse(text); } catch (e) { throw new ApiError('bad_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('bad_request');
  if (body.v === undefined) throw new ApiError('bad_request');
  if (body.v !== core.API_VERSION) throw new ApiError('unsupported_version');
  return body;
}
function requirePid(body) {
  if (!core.isUuid(body.pid)) throw new ApiError('bad_request', 'pid');
  return body.pid.toLowerCase();
}

/* ------------------------------------------------------------------ 순위표 캐시 (isolate 메모리, DB 객체별) */
const CACHES = new WeakMap();
function cacheFor(env) {
  let c = CACHES.get(env.DB);
  if (!c) { c = { top: {}, of: {} }; CACHES.set(env.DB, c); }
  return c;
}
function cacheSec(env) {
  const n = Number(env.LB_CACHE_SEC);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : LIMITS.leaderCacheSec;
}

async function boardTop(ctx, board) {
  const sec = cacheSec(ctx.env);
  const cache = cacheFor(ctx.env);
  const hit = cache.top[board];
  if (sec > 0 && hit && ctx.nowMs - hit.asOf < sec * 1000) return hit;
  const c = core.boardCols(board);
  const rows = await dbAll(ctx.env,
    'SELECT nick, tag, avatar, ' + c.stars + ' AS stars FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0' +
    ' ORDER BY ' + c.stars + ' DESC, ' + c.left + ' DESC, ' + c.up + ' ASC, id ASC LIMIT ' + LIMITS.topMax, []);
  const ent = {
    asOf: ctx.nowMs,
    rows: rows.map((r, i) => ({ rank: i + 1, nick: r.nick, tag: r.tag, avatar: r.avatar, stars: r.stars }))
  };
  cache.top[board] = ent;
  return ent;
}
async function boardCount(ctx, board) {
  const sec = cacheSec(ctx.env) * 2;
  const cache = cacheFor(ctx.env);
  const hit = cache.of[board];
  if (sec > 0 && hit && ctx.nowMs - hit.at < sec * 1000) return hit.n;
  const c = core.boardCols(board);
  const r = await dbFirst(ctx.env, 'SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0', []);
  const n = r ? r.n : 0;
  cache.of[board] = { at: ctx.nowMs, n: n };
  return n;
}

/* ------------------------------------------------------------------ 엔드포인트 */
function readBoard(url) {
  const board = url.searchParams.get('board') || 'all';
  if (core.BOARDS.indexOf(board) < 0) throw new ApiError('bad_request', 'board');
  return board;
}

async function leaderboard(ctx) {
  const board = readBoard(ctx.url);
  let limit = parseInt(ctx.url.searchParams.get('limit'), 10);
  if (!Number.isFinite(limit)) limit = LIMITS.topMax;
  limit = Math.max(1, Math.min(LIMITS.topMax, limit));
  const top = await boardTop(ctx, board);
  const of = await boardCount(ctx, board);
  const sec = cacheSec(ctx.env);
  return ok(ctx, { board: board, asOf: top.asOf, of: of, rows: top.rows.slice(0, limit) }, sec > 0 ? 'public, max-age=' + sec : 'no-store');
}

async function rank(ctx) {
  const board = readBoard(ctx.url);
  const pub = core.normalizePub(ctx.url.searchParams.get('pub'));
  if (!pub) throw new ApiError('bad_request', 'pub');
  const c = core.boardCols(board);
  const row = await dbFirst(ctx.env,
    'SELECT id, nick, tag, avatar, hidden, ' + c.stars + ' AS stars, ' + c.left + ' AS lft, ' + c.up + ' AS up FROM players WHERE pub = ?', [pub]);
  if (!row) throw new ApiError('player_not_found');
  const sec = cacheSec(ctx.env);
  const cc = sec > 0 ? 'public, max-age=' + Math.max(1, Math.floor(sec / 2)) : 'no-store';
  if (row.hidden !== 0) return ok(ctx, { board: board, hidden: row.hidden }, cc);
  const of = await boardCount(ctx, board);
  let rankNo = null;
  if (row.stars > 0) {
    const base = 'SELECT COUNT(*) FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0 AND ';
    const r = await dbFirst(ctx.env,
      'SELECT (' + base + c.stars + ' > ?) + (' + base + c.stars + ' = ? AND ' + c.left + ' > ?) + (' +
      base + c.stars + ' = ? AND ' + c.left + ' = ? AND ' + c.up + ' < ?) + (' +
      base + c.stars + ' = ? AND ' + c.left + ' = ? AND ' + c.up + ' = ? AND id < ?) + 1 AS rank',
      [row.stars, row.stars, row.lft, row.stars, row.lft, row.up, row.stars, row.lft, row.up, row.id]);
    rankNo = r ? r.rank : null;
  }
  return ok(ctx, {
    board: board, asOf: ctx.nowMs, rank: rankNo, of: of, stars: row.stars, nick: row.nick, tag: row.tag, avatar: row.avatar
  }, cc);
}

async function deletePlayer(ctx) {
  const body = await readJson(ctx);
  const pid = requirePid(body);
  const h = await sha256hex(pid);
  const r = await dbRun(ctx.env, 'DELETE FROM players WHERE pid_hash = ?', [h]);
  const n = (r && r.meta && r.meta.changes) || 0;
  return ok(ctx, { deleted: n > 0 });
}

function publicMe(p, totals) {
  return {
    pub: p.pub, nick: p.nick, tag: p.tag, avatar: p.avatar, hidden: p.hidden,
    stars: { easy: totals.stars.easy, normal: totals.stars.normal, hard: totals.stars.hard, all: totals.totalStars }
  };
}

const INSERT_SQL =
  'INSERT INTO players (pid_hash, pub, nick, nick_key, tag, avatar, prog_easy, prog_normal, prog_hard,' +
  ' stars_easy, stars_normal, stars_hard, left_easy, left_normal, left_hard, best_easy, best_normal, best_hard,' +
  ' total_stars, total_left, up_all, up_easy, up_normal, up_hard, hidden, nick_changes, nick_day, created_at, last_write_at)' +
  ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const UPDATE_SQL =
  'UPDATE players SET nick=?, nick_key=?, tag=?, avatar=?, prog_easy=?, prog_normal=?, prog_hard=?,' +
  ' stars_easy=?, stars_normal=?, stars_hard=?, left_easy=?, left_normal=?, left_hard=?, best_easy=?, best_normal=?, best_hard=?,' +
  ' total_stars=?, total_left=?, up_all=?, up_easy=?, up_normal=?, up_hard=?, hidden=?, nick_changes=?, nick_day=?, last_write_at=?' +
  ' WHERE id = ?';

function progStrings(p) { return DIFFS.map((d) => core.serializeProg(p[d])); }
function totalsCols(t) {
  return [t.stars.easy, t.stars.normal, t.stars.hard, t.left.easy, t.left.normal, t.left.hard, t.best.easy, t.best.normal, t.best.hard, t.totalStars, t.totalLeft];
}

async function pickTag(ctx, key) {
  const rows = await dbAll(ctx.env, 'SELECT tag FROM players WHERE nick_key = ?', [key]);
  const used = new Set(rows.map((r) => r.tag));
  if (used.size >= 10000) throw new ApiError('server_error');
  for (let i = 0; i < 5; i++) {
    const t = randInt(ctx, 10000);
    if (!used.has(t)) return t;
  }
  const start = randInt(ctx, 10000);
  for (let i = 0; i < 10000; i++) {
    const t = (start + i) % 10000;
    if (!used.has(t)) return t;
  }
  throw new ApiError('server_error');
}

/** 시간 창 카운터 +1 하고 새 값을 돌려준다. k 는 'reg:'/'adm:' + IP 해시 */
async function bump(ctx, k, windowSec) {
  const win = Math.floor(ctx.nowSec / windowSec) * windowSec;
  await dbRun(ctx.env,
    'INSERT INTO rate_limits (k, n, win) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN win = excluded.win THEN n + 1 ELSE 1 END, win = excluded.win',
    [k, win]);
  const r = await dbFirst(ctx.env, 'SELECT n FROM rate_limits WHERE k = ?', [k]);
  return { n: r ? r.n : 1, retryAfter: Math.max(1, win + windowSec - ctx.nowSec) };
}
async function peek(ctx, k, windowSec) {
  const win = Math.floor(ctx.nowSec / windowSec) * windowSec;
  const r = await dbFirst(ctx.env, 'SELECT n, win FROM rate_limits WHERE k = ?', [k]);
  return { n: r && r.win === win ? r.n : 0, retryAfter: Math.max(1, win + windowSec - ctx.nowSec) };
}
function rateLimited(retryAfter) {
  return new ApiError('rate_limited', null, { headers: { 'Retry-After': String(retryAfter) } });
}

async function sync(ctx, retried) {
  const env = ctx.env;
  const body = ctx.body;
  const pid = requirePid(body);
  const hasProfile = body.profile !== undefined && body.profile !== null;
  const hasD = body.d !== undefined && body.d !== null;
  if (!hasProfile && !hasD) throw new ApiError('bad_request');

  let prof = null;
  if (hasProfile) {
    const r = core.checkProfile(body.profile, env.EXTRA_BLOCK);
    if (!r.ok) throw new ApiError(r.code, r.field, { message: r.message });
    prof = r;
  }
  let dReq = null;
  if (hasD) {
    const r = core.validateProgress(body.d);
    if (!r.ok) throw new ApiError(r.code, r.field);
    dReq = r.d;
  }

  const now = ctx.nowSec;
  const today = core.kstDay(now);
  const h = await sha256hex(pid);
  const row = await dbFirst(env, 'SELECT * FROM players WHERE pid_hash = ?', [h]);

  /* ---------- 새 플레이어 ---------- */
  if (!row) {
    if (!prof) throw new ApiError('profile_required');
    const merged = core.mergeProgress(core.emptyProgress(), dReq);
    const viol = core.chainViolation(merged);
    if (viol) throw new ApiError('progress_chain', viol);
    const t = core.computeTotals(merged);

    const ip = await ipHashOf(ctx);
    const lim = await bump(ctx, 'reg:' + ip, 3600);
    if (lim.n > LIMITS.regPerHour) throw rateLimited(lim.retryAfter);
    if (randInt(ctx, 50) === 0) {                                  // 가끔 오래된 행 정리
      await dbRun(env, 'DELETE FROM rate_limits WHERE win < ?', [now - 86400]);
    }

    const up = (v) => (v ? now : 0);
    for (let attempt = 0; attempt < 4; attempt++) {
      const pub = randomPub();
      const tag = await pickTag(ctx, prof.key);
      const ps = progStrings(merged);
      const params = [h, pub, prof.nick, prof.key, tag, prof.avatar, ps[0], ps[1], ps[2]]
        .concat(totalsCols(t))
        .concat([up(t.totalStars > 0 || t.totalLeft > 0), up(t.stars.easy > 0), up(t.stars.normal > 0), up(t.stars.hard > 0), 0, 0, 0, now, now]);
      try {
        await dbRun(env, INSERT_SQL, params);
      } catch (e) {
        if (e instanceof UniqueError) {
          if (/pid_hash/.test(e.text) && !retried) return sync(ctx, true);      // 같은 pid 동시 등록 -> 기존 행으로 처리
          if (/pid_hash/.test(e.text)) throw new ApiError('rate_limited', null, { headers: { 'Retry-After': '3' } });
          continue;                                                              // pub 또는 (닉네임, 번호) 충돌 -> 다시 시도
        }
        throw e;
      }
      return ok(ctx, {
        me: publicMe({ pub: pub, nick: prof.nick, tag: tag, avatar: prof.avatar, hidden: 0 }, t),
        changed: true, nickChangesLeft: LIMITS.nickChangesPerDay, serverTime: ctx.nowMs
      });
    }
    throw new ApiError('server_error');
  }

  /* ---------- 기존 플레이어 ---------- */
  let nick = row.nick;
  let nickKey = row.nick_key;
  let tag = row.tag;
  let avatar = row.avatar;
  let hidden = row.hidden;
  let nickChanges = row.nick_changes;
  let nickDay = row.nick_day;
  let profileChanged = false;

  if (prof) {
    if (prof.key !== row.nick_key) {
      const used = row.nick_day === today ? row.nick_changes : 0;
      if (used >= LIMITS.nickChangesPerDay) throw new ApiError('nick_change_limit');
      nickChanges = used + 1;
      nickDay = today;
      tag = await pickTag(ctx, prof.key);
      nick = prof.nick;
      nickKey = prof.key;
      if (hidden === 2) hidden = 0;                                // 새 이름이 통과했으니 이름 변경 요청 해제
      profileChanged = true;
    } else if (prof.nick !== row.nick) {                           // 대소문자만 바뀐 경우: 번호표·횟수 그대로
      nick = prof.nick;
      profileChanged = true;
    }
    if (prof.avatar !== row.avatar) { avatar = prof.avatar; profileChanged = true; }
  } else if (hidden === 0 && !NICK.validateNick(row.nick, env.EXTRA_BLOCK).ok) {
    hidden = 2;                                                    // 목록이 바뀐 뒤 걸리는 기존 이름 -> 이름 변경 요청
  }

  const oldProg = { easy: core.parseProg(row.prog_easy), normal: core.parseProg(row.prog_normal), hard: core.parseProg(row.prog_hard) };
  let merged = oldProg;
  if (dReq) {
    merged = core.mergeProgress(oldProg, dReq);
    const viol = core.chainViolation(merged);
    if (viol) throw new ApiError('progress_chain', viol);
  }
  const ps = progStrings(merged);
  const progChanged = ps[0] !== row.prog_easy || ps[1] !== row.prog_normal || ps[2] !== row.prog_hard;
  const hiddenChanged = hidden !== row.hidden;
  const t = core.computeTotals(merged);
  const nickChangesLeft = Math.max(0, LIMITS.nickChangesPerDay - (nickDay === today ? nickChanges : 0));
  const me = publicMe({ pub: row.pub, nick: nick, tag: tag, avatar: avatar, hidden: hidden }, t);

  if (!profileChanged && !progChanged && !hiddenChanged) {          // 변경 없음 -> 쓰기 0 (읽기 1회로 끝)
    return ok(ctx, { me: me, changed: false, nickChangesLeft: nickChangesLeft, serverTime: ctx.nowMs });
  }
  if ((profileChanged || progChanged) && now - row.last_write_at < LIMITS.writeIntervalSec) {
    throw rateLimited(Math.max(1, LIMITS.writeIntervalSec - (now - row.last_write_at)));
  }

  const rose = (diff) => t.stars[diff] > row['stars_' + diff] || t.left[diff] > row['left_' + diff];
  const upAll = (t.totalStars > row.total_stars || t.totalLeft > row.total_left) ? now : row.up_all;
  const params = [nick, nickKey, tag, avatar, ps[0], ps[1], ps[2]]
    .concat(totalsCols(t))
    .concat([upAll, rose('easy') ? now : row.up_easy, rose('normal') ? now : row.up_normal, rose('hard') ? now : row.up_hard,
      hidden, nickChanges, nickDay, now, row.id]);
  try {
    await dbRun(env, UPDATE_SQL, params);
  } catch (e) {
    if (e instanceof UniqueError) throw rateLimited(1);            // 같은 이름·번호가 동시에 생긴 드문 경우: 잠시 뒤 재시도
    throw e;
  }
  return ok(ctx, { me: me, changed: true, nickChangesLeft: nickChangesLeft, serverTime: ctx.nowMs });
}

/* ------------------------------------------------------------------ 관리자 (ADMIN_KEY 가 설정된 경우에만) */
async function adminAuth(ctx) {
  if (!ctx.env.ADMIN_KEY) throw new ApiError('not_found');
  const ip = await ipHashOf(ctx);
  const k = 'adm:' + ip;
  const st = await peek(ctx, k, LIMITS.adminFailWindowSec);
  if (st.n >= LIMITS.adminFailMax) throw rateLimited(st.retryAfter);
  const auth = ctx.request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || !core.safeEqual(m[1], ctx.env.ADMIN_KEY)) {
    const b = await bump(ctx, k, LIMITS.adminFailWindowSec);
    throw b.n > LIMITS.adminFailMax ? rateLimited(b.retryAfter) : new ApiError('unauthorized');
  }
}

async function adminModerate(ctx) {
  await adminAuth(ctx);
  const body = await readJson(ctx);
  const action = body.action;
  let where;
  let arg;
  if (Number.isInteger(body.id)) { where = 'id = ?'; arg = body.id; }
  else if (core.normalizePub(body.pub)) { where = 'pub = ?'; arg = core.normalizePub(body.pub); }
  else throw new ApiError('bad_request', 'id');
  let r;
  if (action === 'hide') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 1 WHERE ' + where, [arg]);
  else if (action === 'unhide') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 0 WHERE ' + where, [arg]);
  else if (action === 'rename') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 2 WHERE ' + where, [arg]);
  else if (action === 'delete') r = await dbRun(ctx.env, 'DELETE FROM players WHERE ' + where, [arg]);
  else throw new ApiError('bad_request', 'action');
  const n = (r && r.meta && r.meta.changes) || 0;
  if (!n) throw new ApiError('player_not_found');
  return ok(ctx, { affected: n });
}

async function adminSearch(ctx) {
  await adminAuth(ctx);
  const q = ctx.url.searchParams.get('q') || '';
  if (!q || q.length > 20) throw new ApiError('bad_request', 'q');
  const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  const rows = await dbAll(ctx.env,
    "SELECT id, pub, nick, tag, total_stars, hidden FROM players WHERE nick LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20", [like]);
  return ok(ctx, { rows: rows.map((r) => ({ id: r.id, pub: r.pub, nick: r.nick, tag: r.tag, stars: r.total_stars, hidden: r.hidden })) });
}

/* ------------------------------------------------------------------ 라우팅 */
const ROUTES = {
  '/api/health': { GET: async (ctx) => ok(ctx, { time: ctx.nowMs }) },
  '/api/leaderboard': { GET: leaderboard },
  '/api/rank': { GET: rank },
  '/api/sync': { POST: async (ctx) => { ctx.body = await readJson(ctx); return sync(ctx, false); } },
  '/api/delete': { POST: deletePlayer },
  '/api/admin/moderate': { POST: adminModerate, admin: true },
  '/api/admin/search': { GET: adminSearch, admin: true }
};

async function handle(request, env, opts) {
  const ctx = {
    request: request, env: env || {}, opts: opts || {}, url: new URL(request.url),
    origin: request.headers.get('origin'), cors: false, body: null
  };
  ctx.nowMs = ctx.opts.now ? ctx.opts.now() : Date.now();
  ctx.nowSec = Math.floor(ctx.nowMs / 1000);
  try {
    const route = ROUTES[ctx.url.pathname];
    if (!route) throw new ApiError('not_found');

    // Origin 검사: 헤더가 있고 허용 목록에 없으면 403. 헤더가 없으면(curl 등) 통과.
    // 관리자 API는 브라우저에서 호출하지 않으므로 Origin 이 붙어 있으면 항상 거부하고 CORS 도 열지 않는다.
    if (ctx.origin !== null) {
      if (route.admin || !core.originAllowed(ctx.origin, ctx.env.ALLOWED_ORIGINS)) throw new ApiError('forbidden_origin');
      ctx.cors = true;
    }
    if (request.method === 'OPTIONS') {
      const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
      const res = new Response(null, { status: 204, headers: h });
      res.headers.set('Vary', 'Origin');
      if (ctx.cors) res.headers.set('Access-Control-Allow-Origin', ctx.origin);
      return res;
    }
    const fn = route[request.method];
    if (typeof fn !== 'function') {
      throw new ApiError('method_not_allowed', null, { headers: { Allow: Object.keys(route).filter((k) => k !== 'admin').join(', ') + ', OPTIONS' } });
    }
    return await fn(ctx);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(ctx, e);
    if (e instanceof UniqueError) return errorResponse(ctx, new ApiError('server_error'));
    console.error('server error:', e && e.name, String((e && e.message) || e).slice(0, 160));
    return errorResponse(ctx, new ApiError('server_error'));
  }
}

module.exports = {
  handle: handle,
  default: {
    fetch: function (request, env) { return handle(request, env); }
  }
};
