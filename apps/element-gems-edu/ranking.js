/* element-gems — ranking.js (spec §19.5 클라이언트: 프로필 저장·제출·재시도·순위표 조회/캐시)
 * 순수 로직 + 주입형 의존성(storage/fetch/timers/now) 구조라 Node 에서 시험할 수 있다.
 * 브라우저에서는 window.ElementGemsRanking 으로 노출되고, ranking-ui.js 가 이것을 쓴다.
 * 핵심 규칙: 서버가 없거나 느리거나 망가져도 게임은 아무 영향이 없다 — 모든 호출은 비동기이고 예외는 삼킨다.
 * 비밀 정보 없음: playerId 는 이 기기에서 만든 무작위 값이며 서버에는 해시만 저장된다.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElementGemsRanking = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const KEYS = { profile: 'element-gems:profile:v1', sync: 'element-gems:sync:v1', hall: 'element-gems:hall:v1' };
  const DIFFS = ['easy', 'normal', 'hard'];
  const BOARDS = ['all', 'easy', 'normal', 'hard'];
  const AVATAR_COUNT = 16;
  const NICK_MIN = 2;
  const NICK_MAX = 8;
  const API_VERSION = 1;
  const KST_MS = 9 * 3600 * 1000;
  /** 전체 탭 "별 점수" 가중치(서버 core.js 의 STAR_WEIGHT 와 같은 값). 서버 응답 값을 우선 쓰고, 로컬 추정에만 쓴다 */
  const STAR_WEIGHT = { easy: 1, normal: 2, hard: 3 };

  /** 아바타 이름(스크린리더용, assets/avatars/avatar-01~16.webp 순서) */
  const AVATAR_NAMES = ['엘프 궁수', '드워프 대장장이', '고글 쓴 장인', '전사', '요리사', '정원사', '여전사', '소년 마법사',
    '할머니 마법사', '정글 탐험가', '연금술사', '사파리 탐험가', '산악 등반가', '빨간 모자 소년', '지도 탐험가', '항해사'];

  /** 안내 문구(spec §19.3.3 초안, 초등학생 눈높이·중립 톤). 금칙어는 알려 주지 않는다 */
  const MESSAGES = {
    nick_length: '이름은 2~8글자로 만들어 주세요.',
    nick_charset: '한글, 영어, 숫자만 쓸 수 있어요. (띄어쓰기, 그림 글자, 특수문자는 안 돼요)',
    nick_jamo: '‘ㅋ’, ‘ㅏ’ 같은 낱글자만으로는 만들 수 없어요. 완성된 글자로 써 주세요.',
    nick_digits: '숫자는 3개까지만 쓸 수 있고, 숫자만으로는 만들 수 없어요.',
    nick_repeat: '같은 글자가 3번 이어지면 안 돼요.',
    nick_reserved: '운영하는 사람이나 게임 캐릭터처럼 보이는 이름은 쓸 수 없어요.',
    nick_pii: '학교, 학년·반, 연락처처럼 보이는 이름은 쓸 수 없어요. 나만의 별명으로 바꿔 보세요.',
    nick_blocked: '이 이름은 쓸 수 없어요. 다른 이름을 골라 볼까요?',
    nick_change_limit: '닉네임은 하루에 2번까지 바꿀 수 있어요. 내일 다시 해 보세요.',
    nick_ok: '멋진 이름이에요! 저장하면 뒤에 번호 4자리가 붙어요.',
    avatar_invalid: '그림을 다시 골라 주세요.',
    offline: '인터넷에 연결되면 다시 해 주세요.',
    busy: '서버가 바빠요. 잠시 뒤에 다시 해 주세요.',
    rate_limited: '조금 빨라요. 잠시 뒤에 다시 해 주세요.',
    unsupported_version: '앱을 새로 고쳐 주세요.',
    disabled: '지금은 명예의 전당을 쓸 수 없어요.',
    generic: '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.'
  };

  function noop() {}

  /** 순위표 숫자 라벨: 전체 탭 = 별 점수(가중 합, 최대 180), 난이도 탭 = 별 개수(0~30) */
  function scoreLabel(board, n) {
    return board === 'all' ? '별 점수 ' + n + '점' : '별 ' + n + '개';
  }

  /** 이 기기 기록으로 계산한 별 점수 추정(서버 값이 없을 때만) */
  function weightedStarsOf(save) {
    let n = 0;
    DIFFS.forEach(function (d) {
      const arr = save && save.stages && Array.isArray(save.stages[d]) ? save.stages[d] : [];
      arr.forEach(function (e) { if (e && isInt(e.stars) && e.stars > 0) n += e.stars * STAR_WEIGHT[d]; });
    });
    return n;
  }

  /* ---------------------------------------------------------------------
   * 작은 순수 함수들
   * ------------------------------------------------------------------- */
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  function codepointCount(s) { return Array.from(String(s)).length; }

  function pad4(tag) {
    const n = Number(tag);
    return isInt(n) && n >= 0 && n <= 9999 ? String(n).padStart(4, '0') : '0000';
  }

  /** 백오프 지연(ms): fails 1 -> list[0], ... 마지막 값이 상한 */
  function backoffMs(fails, list) {
    const l = Array.isArray(list) && list.length ? list : [5000];
    return l[Math.min(Math.max(1, fails | 0) - 1, l.length - 1)];
  }

  /** 서버의 asOf(초 또는 밀리초 epoch, 또는 ISO 문자열)를 밀리초로. 알 수 없으면 0 */
  function toMs(v) {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v < 1e11 ? v * 1000 : v;
    if (typeof v === 'string' && v) { const t = Date.parse(v); return isFinite(t) ? t : 0; }
    return 0;
  }

  /** 'HH:MM' (기기 현지 시각) */
  function formatClock(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** 한국 시간 날짜 번호(서버의 nick_day 와 같은 기준) */
  function kstDay(ms) { return Math.floor((ms + KST_MS) / 86400000); }

  function newPlayerId(cryptoLike) {
    try {
      if (cryptoLike && typeof cryptoLike.randomUUID === 'function') return cryptoLike.randomUUID();
      if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
        const b = new Uint8Array(16);
        cryptoLike.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
      }
    } catch (e) { /* 아래 폴백 */ }
    // 최후 수단(암호학적이지 않음): 오래된 브라우저 전용
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  /**
   * 저장 객체(game.js 의 save)에서 제출용 스냅샷 d 를 만든다. 값: -1(미클리어) 또는 정수 left(0 이상).
   * - 별이 있는 스테이지만 left 를 보낸다(별 0이면 -1).
   * - 앞 스테이지가 비어 있으면 거기서 끊는다(서버의 연쇄 해금 검사 progress_chain 에 걸리지 않도록).
   * - caps: { easy, normal, hard } 서버 상한(시작 시간 + 20초)을 넘는 값은 상한으로 줄인다.
   */
  function buildSnapshot(save, stageCount, caps) {
    const n = stageCount || 10;
    const out = {};
    DIFFS.forEach(function (diff) {
      const arr = save && save.stages && Array.isArray(save.stages[diff]) ? save.stages[diff] : [];
      const cap = caps && isInt(caps[diff]) ? caps[diff] : 200;
      const res = [];
      let broken = false;
      for (let i = 0; i < n; i++) {
        const e = arr[i];
        let v = -1;
        if (!broken && e && typeof e === 'object' && isInt(e.stars) && e.stars >= 1) {
          const l = typeof e.left === 'number' && isFinite(e.left) && e.left > 0 ? Math.floor(e.left) : 0;
          v = Math.min(l, cap);
        } else {
          broken = true;
        }
        res.push(v);
      }
      out[diff] = res;
    });
    return out;
  }

  /** 요청 본문(JSON 문자열). Content-Type 은 text/plain 으로 보내 CORS 사전 요청을 피한다 */
  function buildSyncBody(parts) {
    const o = { v: API_VERSION, pid: parts.pid };
    if (parts.profile) o.profile = { nick: String(parts.profile.nick), avatar: parts.profile.avatar };
    if (parts.d) o.d = parts.d;
    return JSON.stringify(o);
  }

  /** 서버 응답을 클라이언트 동작 종류로 분류한다(spec §19.4.1 오류 코드 표) */
  function classify(status, json, retryAfterHeader) {
    const retryAfterMs = retryAfterHeader && isFinite(Number(retryAfterHeader)) ? Math.max(0, Number(retryAfterHeader)) * 1000 : 0;
    if (json && typeof json === 'object' && json.ok === true) return { kind: 'ok', status: status };
    const err = json && typeof json === 'object' && json.ok === false && json.error && typeof json.error === 'object' ? json.error : null;
    if (!err || typeof err.code !== 'string') {
      // JSON 이 아니거나 ok 가 없는 응답(Cloudflare Error 1027, 프록시 오류 페이지 등)은 일시 장애로 본다
      return { kind: 'retry', code: 'bad_response', status: status };
    }
    const code = err.code;
    const base = { code: code, status: status, field: typeof err.field === 'string' ? err.field : '', serverMessage: typeof err.message === 'string' ? err.message : '', retryAfterMs: retryAfterMs };
    if (code === 'rate_limited') return Object.assign(base, { kind: 'rate' });
    if (code.indexOf('nick_') === 0) return Object.assign(base, { kind: 'field' });
    if (code === 'avatar_invalid') return Object.assign(base, { kind: 'field' });
    if (code === 'progress_invalid' || code === 'progress_chain' || code === 'bad_request' || code === 'too_large') return Object.assign(base, { kind: 'block' });
    if (code === 'profile_required' || code === 'player_not_found') return Object.assign(base, { kind: 'gone' });
    if (code === 'unsupported_version' || code === 'forbidden_origin') return Object.assign(base, { kind: 'disable' });
    return Object.assign(base, { kind: 'retry' });      // db_unavailable, server_error, 모르는 코드
  }

  /** 오류 코드 -> 화면에 보여 줄 쉬운 문구 */
  function messageFor(code, fallback) {
    if (code && MESSAGES[code]) return MESSAGES[code];
    return fallback || MESSAGES.generic;
  }

  /* ---------------------------------------------------------------------
   * 닉네임 검사 어댑터 — nickname.js(클라이언트·서버 공용)가 있으면 그것을 쓰고, 없으면 최소 규칙만
   * ------------------------------------------------------------------- */
  function findNickFn(rootObj) {
    const r = rootObj || {};
    const mods = [r.ElementGemsNickname, r.ElementGemsNick, r.EGNickname, r.NicknameRules, r.Nickname];
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      if (m && typeof m.validateNick === 'function') return m.validateNick.bind(m);
    }
    if (typeof r.validateNick === 'function') return r.validateNick;
    return null;
  }

  /** 모듈이 없을 때의 최소 규칙(길이·문자·숫자·반복). 서버가 최종 검증이다 */
  function fallbackNickCheck(input) {
    const s = String(input == null ? '' : input).normalize('NFC');
    const len = codepointCount(s);
    if (len < NICK_MIN || len > NICK_MAX) return { ok: false, code: 'nick_length', nick: s };
    if (/[ㄱ-ㆎ]/.test(s)) return { ok: false, code: 'nick_jamo', nick: s };
    if (!/^[가-힣A-Za-z0-9]+$/.test(s)) return { ok: false, code: 'nick_charset', nick: s };
    const digits = (s.match(/[0-9]/g) || []).length;
    if (digits > 3 || digits === len) return { ok: false, code: 'nick_digits', nick: s };
    if (/(.)\1\1/i.test(s)) return { ok: false, code: 'nick_repeat', nick: s };
    return { ok: true, code: '', nick: s };
  }

  /** 결과 모양 통일: { ok, code, message, nick } */
  function checkNick(input, rootObj, extraBlock) {
    const fn = findNickFn(rootObj);
    let r;
    try { r = fn ? fn(input, extraBlock) : fallbackNickCheck(input); } catch (e) { r = fallbackNickCheck(input); }
    if (!r || typeof r !== 'object') r = fallbackNickCheck(input);
    const bad = r.ok === false || r.valid === false || (r.ok === undefined && r.valid === undefined && (r.code || r.error));
    const code = bad ? String(r.code || (r.error && (r.error.code || r.error)) || 'nick_blocked') : '';
    const nick = typeof r.nick === 'string' ? r.nick : (typeof r.normalized === 'string' ? r.normalized : String(input == null ? '' : input).normalize('NFC'));
    return { ok: !bad, code: code, message: bad ? (typeof r.message === 'string' && r.message ? r.message : messageFor(code)) : MESSAGES.nick_ok, nick: nick };
  }

  /* ---------------------------------------------------------------------
   * 저장소 (localStorage 접근은 모두 try/catch, 막힌 환경은 메모리 폴백)
   * ------------------------------------------------------------------- */
  function createStore(win) {
    const mem = {};
    const memOnly = {};
    let ls = null;
    try { ls = win && win.localStorage ? win.localStorage : null; } catch (e) { ls = null; }
    return {
      get: function (k) {
        if (memOnly[k] && Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
        try { if (ls) { const v = ls.getItem(k); if (v !== null) return v; } } catch (e) { /* 메모리 폴백 */ }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set: function (k, v) {
        mem[k] = v;
        try { if (ls) { ls.setItem(k, v); memOnly[k] = false; return; } } catch (e) { /* 저장 실패 */ }
        memOnly[k] = true;
      },
      remove: function (k) {
        delete mem[k]; delete memOnly[k];
        try { if (ls) ls.removeItem(k); } catch (e) { /* 무시 */ }
      }
    };
  }

  function readJson(store, key) {
    try { const raw = store.get(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeJson(store, key, obj) {
    try { store.set(key, JSON.stringify(obj)); } catch (e) { /* 무시 */ }
  }

  function normalizeProfile(o) {
    const p = { pid: '', pub: '', nick: '', tag: null, avatar: 0, skipped: false, createdAt: 0, hidden: 0, notice: '', nickLeft: null };
    if (!o || typeof o !== 'object') return p;
    if (typeof o.pid === 'string' && /^[0-9a-fA-F-]{32,36}$/.test(o.pid)) p.pid = o.pid;
    if (typeof o.pub === 'string' && o.pub.length <= 16) p.pub = o.pub;
    if (typeof o.nick === 'string' && codepointCount(o.nick) <= 16) p.nick = o.nick;
    if (isInt(o.tag) && o.tag >= 0 && o.tag <= 9999) p.tag = o.tag;
    if (isInt(o.avatar) && o.avatar >= 1 && o.avatar <= AVATAR_COUNT) p.avatar = o.avatar;
    p.skipped = o.skipped === true;
    if (typeof o.createdAt === 'number' && isFinite(o.createdAt)) p.createdAt = o.createdAt;
    p.hidden = o.hidden === 1 || o.hidden === 2 ? o.hidden : 0;
    p.notice = o.notice === 'gone' || o.notice === 'rename' ? o.notice : '';
    if (o.nickLeft && isInt(o.nickLeft.day) && isInt(o.nickLeft.n) && o.nickLeft.n >= 0 && o.nickLeft.n <= 9) p.nickLeft = { day: o.nickLeft.day, n: o.nickLeft.n };
    return p;
  }

  function normalizeSync(o) {
    const s = { dirty: false, lastOkAt: 0, fails: 0, nextTryAt: 0, blocked: false, blockedCode: '' };
    if (!o || typeof o !== 'object') return s;
    s.dirty = o.dirty === true;
    if (typeof o.lastOkAt === 'number' && isFinite(o.lastOkAt)) s.lastOkAt = o.lastOkAt;
    if (isInt(o.fails) && o.fails >= 0 && o.fails < 1000) s.fails = o.fails;
    if (typeof o.nextTryAt === 'number' && isFinite(o.nextTryAt)) s.nextTryAt = o.nextTryAt;
    s.blocked = o.blocked === true;
    if (typeof o.blockedCode === 'string') s.blockedCode = o.blockedCode.slice(0, 40);
    return s;
  }

  function normalizeRows(rows, limit) {
    const out = [];
    if (!Array.isArray(rows)) return out;
    for (let i = 0; i < rows.length && out.length < limit; i++) {
      const r = rows[i];
      if (!r || typeof r !== 'object' || typeof r.nick !== 'string') continue;
      const stars = Number(r.stars);
      if (!isFinite(stars)) continue;
      const av = Number(r.avatar);
      out.push({
        rank: isInt(Number(r.rank)) && Number(r.rank) > 0 ? Number(r.rank) : i + 1,
        nick: r.nick.slice(0, 16),
        tag: pad4(r.tag),
        avatar: isInt(av) && av >= 1 && av <= AVATAR_COUNT ? av : 0,
        stars: Math.max(0, Math.floor(stars))
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------------
   * [시작] 버튼 판정 (프로필 만들기 순서: 메인 화면 먼저, [시작]에서 안내 팝업)
   * 'prompt' = 프로필 안내 팝업을 띄운다 / 'go' = 바로 난이도·레벨 선택으로 간다
   * 랭킹이 꺼져 있거나(apiBase 없음) 프로필이 있거나 이번 접속에서 "프로필 없이 시작"을 골랐으면 'go'
   * ------------------------------------------------------------------- */
  function startGate(s) {
    const o = s || {};
    if (!o.enabled) return 'go';
    if (o.registered) return 'go';
    if (o.sessionOptOut) return 'go';
    return 'prompt';
  }

  /* ---------------------------------------------------------------------
   * 클라이언트 본체
   * opts: { config(CONFIG.ranking), store, fetch, now, timers:{set,clear}, getSave, stageCount, caps, crypto,
   *         emit(name,data), isOffline(), log }
   * ------------------------------------------------------------------- */
  function createClient(opts) {
    const cfg = opts.config || {};
    const store = opts.store || createStore(null);
    const fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch.bind(typeof window !== 'undefined' ? window : globalThis) : null);
    const now = opts.now || Date.now;
    const timers = opts.timers || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (id) { clearTimeout(id); } };
    const getSave = opts.getSave || function () { return null; };
    const stageCount = opts.stageCount || 10;
    const caps = opts.caps || null;
    const emitEvent = opts.emit || noop;
    const isOffline = opts.isOffline || function () { return false; };
    const log = opts.log || function () {};
    const timeoutMs = cfg.timeoutMs || 8000;
    const gapMs = cfg.minSubmitGapMs == null ? 3000 : cfg.minSubmitGapMs;
    const pageSize = cfg.pageSize || 50;

    let profile = normalizeProfile(readJson(store, KEYS.profile));
    let sync = normalizeSync(readJson(store, KEYS.sync));
    let disabledCode = '';
    let inflight = null;
    let timer = null;
    let timerAt = 0;
    let lastSendAt = 0;
    let chain = Promise.resolve();
    let sessionOptOut = false;                              // 이번 접속에서 "프로필 없이 시작"을 골랐는가(메모리에만 둔다 — 새로 열면 다시 묻는다)
    const boardFlights = {};

    function apiBase() { return String(cfg.apiBase || cfg.api || '').replace(/\/+$/, ''); }
    function enabled() { return !!apiBase() && !disabledCode; }
    function emit(name, data) { try { emitEvent(name, data); } catch (e) { /* UI 오류가 로직을 멈추지 않게 */ } }
    function saveProfile() { writeJson(store, KEYS.profile, profile); }
    function saveSync() { writeJson(store, KEYS.sync, sync); }
    function registered() { return !!(profile.pid && profile.pub && profile.nick); }
    function snapshot() { return buildSnapshot(getSave(), stageCount, caps); }

    function status() {
      return { enabled: enabled(), disabledCode: disabledCode, registered: registered(), dirty: sync.dirty, blocked: sync.blocked, blockedCode: sync.blockedCode,
        fails: sync.fails, lastOkAt: sync.lastOkAt, inflight: !!inflight };
    }

    /* ---- 네트워크 한 번 ---- */
    async function request(method, path, body) {
      if (!fetchFn) return { kind: 'retry', code: 'no_fetch', status: 0 };
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timeoutId = null;
      const timeoutP = new Promise(function (resolve) {
        timeoutId = timers.set(function () { if (ctrl) { try { ctrl.abort(); } catch (e) { /* 무시 */ } } resolve({ kind: 'retry', code: 'timeout', status: 0 }); }, timeoutMs);
      });
      const run = (async function () {
        const init = { method: method, credentials: 'omit', redirect: 'follow' };
        if (ctrl) init.signal = ctrl.signal;
        if (body != null) { init.body = body; init.headers = { 'Content-Type': 'text/plain;charset=UTF-8' }; }
        const res = await fetchFn(apiBase() + path, init);
        let text = '';
        try { text = await res.text(); } catch (e) { text = ''; }
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        const ra = res.headers && typeof res.headers.get === 'function' ? res.headers.get('Retry-After') : null;
        const c = classify(res.status, json, ra);
        c.json = json;
        return c;
      })().catch(function (e) {
        return { kind: 'retry', code: e && e.name === 'AbortError' ? 'timeout' : 'network', status: 0 };
      });
      const out = await Promise.race([run, timeoutP]);
      timers.clear(timeoutId);
      return out;
    }

    function applyMe(me) {
      if (!me || typeof me !== 'object') return false;
      let changed = false;
      if (typeof me.pub === 'string' && me.pub && me.pub !== profile.pub) { profile.pub = me.pub; changed = true; }
      if (typeof me.nick === 'string' && me.nick && me.nick !== profile.nick) { profile.nick = me.nick; changed = true; }
      if (isInt(me.tag) && me.tag !== profile.tag) { profile.tag = me.tag; changed = true; }
      if (isInt(me.avatar) && me.avatar >= 1 && me.avatar <= AVATAR_COUNT && me.avatar !== profile.avatar) { profile.avatar = me.avatar; changed = true; }
      const hid = me.hidden === 1 || me.hidden === 2 ? me.hidden : 0;
      if (hid !== profile.hidden) {
        profile.hidden = hid;
        profile.notice = hid === 2 ? 'rename' : (profile.notice === 'rename' ? '' : profile.notice);
        changed = true;
      }
      return changed;
    }

    function noteNickLeft(n) {
      if (isInt(n) && n >= 0 && n <= 9) profile.nickLeft = { day: kstDay(now()), n: n };
    }

    /* ---- 프로필 만들기/수정 (온라인 필수, 대기열 없음) ---- */
    function enqueue(fn) {
      const p = chain.then(fn, fn);
      chain = p.catch(noop);
      return p;
    }

    function failResult(c) {
      let message;
      if (c.kind === 'retry') message = isOffline() ? MESSAGES.offline : MESSAGES.busy;
      else if (c.kind === 'disable') message = c.code === 'unsupported_version' ? MESSAGES.unsupported_version : MESSAGES.disabled;
      else if (c.kind === 'rate') message = MESSAGES.rate_limited;
      else message = messageFor(c.code, c.serverMessage);
      return { ok: false, kind: c.kind, code: c.code, field: c.field || '', message: message };
    }

    function saveProfileRemote(input) {
      return enqueue(async function () {
        if (!enabled()) return { ok: false, kind: 'disable', code: 'disabled', field: '', message: MESSAGES.disabled };
        if (!profile.pid) { profile.pid = newPlayerId(opts.crypto); saveProfile(); }   // 응답을 못 받아도 같은 ID로 다시 시도(중복 가입 방지)
        const prof = { nick: String(input.nick).normalize('NFC'), avatar: input.avatar };
        let c = await request('POST', '/api/sync', buildSyncBody({ pid: profile.pid, profile: prof, d: snapshot() }));
        let progressBlocked = false;
        if (c.kind === 'block' && /^progress_/.test(c.code)) {
          // 기록 모양이 이상해도 프로필 만들기는 되게: 프로필만 다시 보내고 기록 제출은 멈춘다(콘솔에 남김)
          log('[ranking] progress rejected', c.code);
          progressBlocked = true;
          c = await request('POST', '/api/sync', buildSyncBody({ pid: profile.pid, profile: prof }));
        }
        if (c.kind === 'disable') { disable(c.code); }
        if (c.kind !== 'ok') return failResult(c);
        const j = c.json || {};
        const me = j.me || {};
        profile.skipped = false;
        sessionOptOut = false;                              // 프로필을 만들었으니 "프로필 없이" 선택은 끝
        profile.notice = '';
        profile.createdAt = profile.createdAt || now();
        if (!profile.pub && typeof me.pub !== 'string') { return failResult({ kind: 'retry', code: 'bad_response' }); }
        applyMe(me);
        profile.hidden = me.hidden === 1 || me.hidden === 2 ? me.hidden : 0;
        noteNickLeft(j.nickChangesLeft);
        saveProfile();
        sync.fails = 0; sync.nextTryAt = 0; sync.lastOkAt = now();
        sync.blocked = progressBlocked; sync.blockedCode = progressBlocked ? c.code || 'progress_invalid' : '';
        sync.dirty = progressBlocked ? sync.dirty : false;
        saveSync();
        emit('profile', publicProfile());
        emit('status', status());
        return { ok: true, me: me, nickChangesLeft: isInt(j.nickChangesLeft) ? j.nickChangesLeft : null };
      });
    }

    function deleteProfileRemote() {
      return enqueue(async function () {
        if (!enabled()) return { ok: false, kind: 'disable', code: 'disabled', field: '', message: MESSAGES.disabled };
        if (!profile.pid) { clearLocalProfile(); return { ok: true }; }
        const c = await request('POST', '/api/delete', JSON.stringify({ v: API_VERSION, pid: profile.pid }));
        if (c.kind === 'disable') disable(c.code);
        if (c.kind !== 'ok' && !(c.kind === 'gone' && c.code === 'player_not_found')) return failResult(c);
        clearLocalProfile();
        return { ok: true };
      });
    }

    function clearLocalProfile() {
      profile = normalizeProfile({ skipped: true });       // 지운 뒤에는 다시 묻지 않는다. 게임 기록(save)은 건드리지 않는다
      sync = normalizeSync(null);
      saveProfile(); saveSync();
      store.remove(KEYS.hall);
      emit('profile', publicProfile());
      emit('status', status());
    }

    function skipProfile() {
      if (registered()) return;
      profile.skipped = true;
      saveProfile();
      emit('profile', publicProfile());
    }

    /** 이번 접속에서만 "프로필 없이 시작". 켜져 있는 동안 서버로 진행을 보내지 않는다(저장하지 않음) */
    function setSessionOptOut(on) { sessionOptOut = !!on; }
    function needsProfilePrompt() {
      return startGate({ enabled: enabled(), registered: registered(), sessionOptOut: sessionOptOut }) === 'prompt';
    }

    function dismissNotice() {
      if (!profile.notice) return;
      profile.notice = '';
      saveProfile();
      emit('profile', publicProfile());
    }

    function disable(code) {
      disabledCode = code || 'disabled';
      log('[ranking] disabled', disabledCode);
      if (timer) { timers.clear(timer); timer = null; timerAt = 0; }
      emit('disabled', { code: disabledCode });
    }

    function publicProfile() {
      const left = profile.nickLeft && profile.nickLeft.day === kstDay(now()) ? profile.nickLeft.n : null;
      return { pid: profile.pid, pub: profile.pub, nick: profile.nick, tag: profile.tag, avatar: profile.avatar, skipped: profile.skipped,
        hidden: profile.hidden, notice: profile.notice, registered: registered(), nickLeft: left, createdAt: profile.createdAt };
    }

    /* ---- 진행 제출 (스냅샷 1개 + single-flight + 백오프) ---- */
    function schedule(ms) {
      if (!enabled()) return;
      const delay = Math.max(0, ms);
      const at = now() + delay;
      if (timer && timerAt <= at) return;
      if (timer) timers.clear(timer);
      timerAt = at;
      timer = timers.set(function () { timer = null; timerAt = 0; flush(); }, delay);
    }

    /** 기록이 올랐을 때 부른다. delayMs 뒤에 한 번 제출(연출과 겹치지 않게) */
    function markDirty(delayMs) {
      if (!enabled() || !registered() || sessionOptOut) return false;
      sync.dirty = true;
      saveSync();
      // 실패 백오프 중이면 그 시각을 지킨다(서버가 아플 때 판마다 두드리지 않음)
      schedule(Math.max(delayMs == null ? 0 : delayMs, sync.nextTryAt - now()));
      emit('status', status());
      return true;
    }

    async function flush() {
      if (!enabled() || !registered() || sessionOptOut || !sync.dirty || sync.blocked) return { skipped: true };
      if (inflight) return inflight;                        // single-flight: 끝나면 스냅샷이 달라졌는지 보고 다시 보낸다
      const wait = lastSendAt + gapMs - now();
      if (lastSendAt && wait > 0) { schedule(wait); return { skipped: true }; }
      inflight = runFlush().then(function (r) { inflight = null; return r; }, function (e) { inflight = null; log('[ranking] flush error', e); return { error: true }; });
      emit('status', status());
      return inflight;
    }

    async function runFlush() {
      lastSendAt = now();
      const d = snapshot();
      const sentKey = JSON.stringify(d);
      const c = await request('POST', '/api/sync', buildSyncBody({ pid: profile.pid, d: d }));
      if (c.kind === 'ok') {
        const j = c.json || {};
        const pChanged = applyMe(j.me);
        noteNickLeft(j.nickChangesLeft);
        sync.fails = 0; sync.nextTryAt = 0; sync.lastOkAt = now(); sync.blocked = false; sync.blockedCode = '';
        const same = JSON.stringify(snapshot()) === sentKey;
        sync.dirty = !same;
        saveSync(); saveProfile();
        if (pChanged) emit('profile', publicProfile());
        if (!same) schedule(gapMs);
        emit('synced', { me: j.me || null, changed: !!j.changed });
        emit('status', status());
        return { ok: true };
      }
      if (c.kind === 'block') {
        sync.blocked = true; sync.blockedCode = c.code || 'blocked'; saveSync();
        log('[ranking] 제출 중단(서버가 기록을 거부했어요):', c.code, c.serverMessage);
        emit('blocked', { code: c.code });
        emit('status', status());
        return { ok: false, blocked: true };
      }
      if (c.kind === 'gone') {
        log('[ranking] 서버에 프로필이 없어요:', c.code);
        profile = normalizeProfile({ skipped: true, notice: 'gone' });
        sync = normalizeSync(null);
        saveProfile(); saveSync();
        store.remove(KEYS.hall);
        emit('profile', publicProfile());
        emit('status', status());
        return { ok: false, gone: true };
      }
      if (c.kind === 'disable') {
        disable(c.code);
        return { ok: false, disabled: true };
      }
      // retry / rate: 실패 횟수를 올리고 백오프 뒤 다시
      sync.fails += 1;
      const delay = Math.max(c.kind === 'rate' ? c.retryAfterMs || gapMs : 0, backoffMs(sync.fails, cfg.retryMs));
      sync.nextTryAt = now() + delay;
      saveSync();
      schedule(delay);
      emit('syncFail', { code: c.code, fails: sync.fails, delay: delay });
      emit('status', status());
      return { ok: false, retry: true };
    }

    /** 앱 시작 시: 프로필이 있으면 대기 중인 기록을 올린다(처음 동기화 전이면 전체를 올린다) */
    function start() {
      if (!enabled() || !registered()) return;
      if (!sync.lastOkAt) sync.dirty = true;
      if (sync.dirty) {
        sync.blocked = false;                                // 새 실행마다 한 번은 다시 시도(고쳐진 경우 자동 복구)
        saveSync();
        schedule(1500);
      }
    }

    function onOnline() {
      sync.nextTryAt = 0;
      if (sync.dirty && !sync.blocked) schedule(500);
      emit('online');
    }
    function onVisible() {
      if (sync.dirty && !sync.blocked && now() >= sync.nextTryAt) schedule(500);
    }

    /* ---- 순위표 ---- */
    function loadCache(board) {
      const all = readJson(store, KEYS.hall);
      const e = all && typeof all === 'object' ? all[board] : null;
      if (!e || typeof e !== 'object' || !Array.isArray(e.rows)) return null;
      const max = cfg.hallCacheMaxAgeMs || 259200000;
      if (typeof e.savedAt !== 'number' || now() - e.savedAt > max) return null;
      return { board: board, asOf: e.asOf || 0, of: e.of || 0, rows: normalizeRows(e.rows, pageSize), me: e.me || null, savedAt: e.savedAt, fromCache: true };
    }

    function saveCache(board, data) {
      const all = readJson(store, KEYS.hall);
      const o = all && typeof all === 'object' ? all : {};
      o[board] = { asOf: data.asOf, of: data.of, rows: data.rows, me: data.me, savedAt: now() };
      writeJson(store, KEYS.hall, o);
    }

    function isMine(row) {
      return registered() && row.nick === profile.nick && row.tag === pad4(profile.tag);
    }

    /** 이 기기 기록 기준 해당 보드의 별 수(전체 = 세 난이도 합) */
    function localStars(board) {
      const sv = getSave();
      const ds = board === 'all' ? DIFFS : [board];
      let n = 0;
      ds.forEach(function (d) {
        const arr = sv && sv.stages && Array.isArray(sv.stages[d]) ? sv.stages[d] : [];
        arr.forEach(function (e) { if (e && isInt(e.stars) && e.stars > 0) n += e.stars; });
      });
      return n;
    }

    async function fetchBoardOnce(board) {
      const lc = await request('GET', '/api/leaderboard?board=' + encodeURIComponent(board) + '&limit=' + pageSize);
      if (lc.kind === 'disable') disable(lc.code);
      if (lc.kind !== 'ok') return { ok: false, kind: lc.kind, code: lc.code, cache: loadCache(board) };
      const j = lc.json || {};
      const rows = normalizeRows(j.rows, pageSize);
      const data = { ok: true, board: board, asOf: toMs(j.asOf) || now(), of: isInt(j.of) ? j.of : 0, rows: rows, me: null, fromCache: false };
      if (registered()) {
        const idx = rows.findIndex(isMine);
        if (idx >= 0) {
          data.me = { rank: rows[idx].rank, stars: rows[idx].stars, nick: rows[idx].nick, tag: rows[idx].tag, avatar: rows[idx].avatar, inList: true };
        } else if (localStars(board) > 0) {
          // 별이 0개면 순위에 없으므로 물어보지 않는다(불필요한 404 방지)
          const rc = await request('GET', '/api/rank?board=' + encodeURIComponent(board) + '&pub=' + encodeURIComponent(profile.pub));
          if (rc.kind === 'ok' && rc.json) {
            const r = rc.json;
            if (r.hidden === 1 || r.hidden === 2) data.me = { hidden: r.hidden };
            else if (isInt(r.rank)) data.me = { rank: r.rank, stars: isInt(r.stars) ? r.stars : 0, nick: String(r.nick || profile.nick), tag: pad4(r.tag != null ? r.tag : profile.tag), avatar: isInt(r.avatar) ? r.avatar : profile.avatar, inList: false };
            if (isInt(r.of) && !data.of) data.of = r.of;
          }
          // 내 순위 조회가 실패해도 목록은 보여 준다(me = null)
        }
      }
      saveCache(board, data);
      return data;
    }

    function fetchBoard(board) {
      const b = BOARDS.indexOf(board) >= 0 ? board : 'all';
      if (!enabled()) return Promise.resolve({ ok: false, kind: 'disable', code: 'disabled', cache: null });
      if (boardFlights[b]) return boardFlights[b];
      boardFlights[b] = fetchBoardOnce(b).then(function (r) { delete boardFlights[b]; return r; }, function () {
        delete boardFlights[b];
        return { ok: false, kind: 'retry', code: 'network', cache: loadCache(b) };
      });
      return boardFlights[b];
    }

    return {
      enabled: enabled, status: status, profile: publicProfile, registered: registered,
      saveProfile: saveProfileRemote, deleteProfile: deleteProfileRemote, skipProfile: skipProfile, dismissNotice: dismissNotice,
      setSessionOptOut: setSessionOptOut, sessionOptOut: function () { return sessionOptOut; }, needsProfilePrompt: needsProfilePrompt,
      markDirty: markDirty, flush: flush, start: start, onOnline: onOnline, onVisible: onVisible,
      fetchBoard: fetchBoard, loadCache: loadCache, snapshot: snapshot,
      _internals: { getSync: function () { return sync; }, getProfile: function () { return profile; } }
    };
  }

  return {
    KEYS: KEYS, DIFFS: DIFFS, BOARDS: BOARDS, AVATAR_COUNT: AVATAR_COUNT, AVATAR_NAMES: AVATAR_NAMES, MESSAGES: MESSAGES,
    STAR_WEIGHT: STAR_WEIGHT, scoreLabel: scoreLabel, weightedStarsOf: weightedStarsOf, NICK_MIN: NICK_MIN, NICK_MAX: NICK_MAX,
    codepointCount: codepointCount, pad4: pad4, backoffMs: backoffMs, toMs: toMs, formatClock: formatClock, kstDay: kstDay,
    newPlayerId: newPlayerId, buildSnapshot: buildSnapshot, buildSyncBody: buildSyncBody, classify: classify, messageFor: messageFor,
    findNickFn: findNickFn, fallbackNickCheck: fallbackNickCheck, checkNick: checkNick,
    createStore: createStore, normalizeProfile: normalizeProfile, normalizeSync: normalizeSync, normalizeRows: normalizeRows,
    createClient: createClient, startGate: startGate
  };
});
