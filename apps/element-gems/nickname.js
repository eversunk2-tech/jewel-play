/* element-gems - nickname.js
 * 닉네임 검증 모듈 (spec §19.3.3). 순수 함수만 있고 DOM·네트워크를 쓰지 않는다.
 * 클라이언트(브라우저 전역 ElementGemsNick)와 서버(server/src/core.js, require)가 **같은 파일**을 쓴다.
 * 스크립트 순서: nick-words.js -> nickname.js -> ...
 *
 * 사용:  var r = ElementGemsNick.validateNick('별빛냥', extraBlock);
 *        r.ok === true  -> { ok:true, nick:'별빛냥', key:'별빛냥', message:'멋진 이름이에요! ...' }
 *        r.ok === false -> { ok:false, code:'nick_pii', message:'...쉬운 안내...', field:'nick' }
 *   - 앞뒤 공백을 지우지 않는다(공백은 허용 문자가 아니므로 nick_charset). 필요하면 호출하는 쪽에서 trim() 한 뒤 넣는다.
 *   - extraBlock: 추가 금칙어(배열 또는 쉼표로 구분한 문자열). 서버의 EXTRA_BLOCK 변수. 클라이언트는 보통 생략.
 *
 * 검사 순서: 정규화(NFC) -> 형식(길이·문자·숫자·반복) -> 예약어 -> 개인정보·연락 유도 -> 금칙어. 걸린 첫 단계의 안내 한 가지만 돌려준다.
 *
 * 금칙어 매칭(입력과 목록에 같은 정규화를 적용한 뒤 비교):
 *   V1 한글만(영문·숫자 끼워넣기 제거)      V2 한글 느슨한 자모열(된소리->평음, ㅐ/ㅔ·ㅙ/ㅞ/ㅚ·ㅢ/ㅟ 통합, y-활음 접기, 받침 제거, 초성 ㅇ 제거)
 *   V3 영문(소문자, 숫자->글자 치환 0o 1i 3e 4a 5s 7t 8b 또는 숫자 제거, 영문 외 제거, 같은 글자 2연속 압축)
 *   V4 원문 소문자(예약어·연락 유도 부분 문자열)
 *   추가 뷰: V5 한글을 로마자로 바꿔 영문과 섞은 문자열(시bal), 자판 변환(한글 욕설을 영문 자판으로 친 tlqkf 같은 형태)
 * 항목 앞 기호: '=' 전체 일치만 / '*' 글자 그대로 부분 일치(V2를 쓰지 않음) / 없음 = 기본 규칙
 *   기본 규칙(금칙어): 한글은 V2 키가 4자모 이상이면 V2 부분 일치, 그보다 짧으면 V1 전체 일치. 영문은 압축한 글자가 4자 이상이면 부분 일치, 짧으면 전체 일치.
 *   예약어·개인정보·연락 유도의 한글 항목은 V1 글자 그대로 부분 일치(소프트 키 안 씀).
 * 알려진 한계: 음절을 쪼개 넣는 우회(받침을 별도 음절로 풀어 쓰기)와 새로 만든 은어는 못 잡는다.
 *   server/test/nick-vectors.js 머리 주석과 server/README.md 에 정리했다.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = factory(require('./nick-words'));
  else root.ElementGemsNick = factory(root.ElementGemsNickWords);
})(typeof self !== 'undefined' ? self : this, function (WORDS) {
  'use strict';

  var LIMITS = { minLen: 2, maxLen: 8, maxDigits: 3, maxInput: 64 };

  var MESSAGES = {
    nick_length: '이름은 2~8글자로 만들어 주세요.',
    nick_charset: '한글, 영어, 숫자만 쓸 수 있어요. (띄어쓰기, 그림 글자, 특수문자는 안 돼요)',
    nick_charset_jamo: "'ㅋ', 'ㅏ' 같은 낱글자만으로는 만들 수 없어요. 완성된 글자로 써 주세요.",
    nick_digits: '숫자는 3개까지만 쓸 수 있고, 숫자만으로는 만들 수 없어요.',
    nick_repeat: '같은 글자가 3번 이어지면 안 돼요.',
    nick_reserved: '운영하는 사람이나 게임 캐릭터처럼 보이는 이름은 쓸 수 없어요.',
    nick_pii: '학교, 학년·반, 연락처처럼 보이는 이름은 쓸 수 없어요. 나만의 별명으로 바꿔 보세요.',
    nick_blocked: '이 이름은 쓸 수 없어요. 다른 이름을 골라 볼까요?',
    nick_change_limit: '닉네임은 하루에 2번까지 바꿀 수 있어요. 내일 다시 해 보세요.',
    ok: '멋진 이름이에요! 저장하면 뒤에 번호 4자리가 붙어요.'
  };

  /* ---------------------------------------------------------------
   * 문자 유틸
   * ------------------------------------------------------------- */
  var RE_HANGUL_ONE = /[가-힣]/;
  var RE_ALLOWED = /^[가-힣A-Za-z0-9]+$/;
  var RE_JAMO = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;

  function hangulOnly(s) { return s.replace(/[^가-힣]/g, ''); }
  function compress(s) { return s.replace(/(.)\1+/g, '$1'); }
  function onlyLetters(s) { return s.replace(/[^a-z]/g, ''); }
  var DIGIT_SUBST = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
  function substDigits(s) { return s.replace(/[0-9]/g, function (d) { return DIGIT_SUBST[d] || ''; }); }

  var INIT_J = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var MED_FOLD = 'ㅏㅔㅏㅔㅓㅔㅓㅔㅗㅘㅚㅚㅗㅜㅝㅚㅣㅜㅡㅣㅣ';   // 21개 중성 -> 접은 중성
  var INIT_FOLD = [0, 0, 2, 3, 3, 5, 6, 7, 7, 9, 9, 11, 12, 12, 14, 15, 16, 17, 18];

  /** V2: 한글 음절열 -> 느슨한 자모열 */
  function softKey(h) {
    var out = '';
    for (var i = 0; i < h.length; i++) {
      var c = h.charCodeAt(i) - 0xAC00;
      if (c < 0 || c > 11171) continue;
      var ini = INIT_FOLD[Math.floor(c / 588)];
      var med = Math.floor((c % 588) / 28);
      if (ini !== 11) out += INIT_J.charAt(ini);
      out += MED_FOLD.charAt(med);
    }
    return out.replace(/(.)\1+/g, '$1');      // 같은 자모 연속은 하나로 (머엉청이처럼 모음 음절을 끼워 넣는 우회 방어)
  }

  // 두벌식 자판(소문자로 접음: 된소리 R,E,Q,T,W 도 소문자)
  var KB_INIT = ['r', 'r', 's', 'e', 'e', 'f', 'a', 'q', 'q', 't', 't', 'd', 'w', 'w', 'c', 'z', 'x', 'v', 'g'];
  var KB_MED = ['k', 'o', 'i', 'o', 'j', 'p', 'u', 'p', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
  var KB_FIN = ['', 'r', 'r', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 't', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
  function qwerty(h) {
    var out = '';
    for (var i = 0; i < h.length; i++) {
      var c = h.charCodeAt(i) - 0xAC00;
      if (c < 0 || c > 11171) continue;
      out += KB_INIT[Math.floor(c / 588)] + KB_MED[Math.floor((c % 588) / 28)] + KB_FIN[c % 28];
    }
    return out;
  }

  // 국어의 로마자 표기(받침 소리 변화는 반영하지 않는 단순 변환)
  var RR_INIT = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var RR_MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  var RR_FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  /** V5: 한글은 로마자로, 영문은 소문자로, 숫자는 치환 글자로 (그 밖은 버림) */
  function romMix(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var c = s.charCodeAt(i) - 0xAC00;
      if (c >= 0 && c <= 11171) out += RR_INIT[Math.floor(c / 588)] + RR_MED[Math.floor((c % 588) / 28)] + RR_FIN[c % 28];
      else if (/[A-Za-z]/.test(ch)) out += ch.toLowerCase();
      else if (DIGIT_SUBST[ch]) out += DIGIT_SUBST[ch];
    }
    return out;
  }

  function decodeB64(s) {
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* ---------------------------------------------------------------
   * 목록 컴파일 (처음 한 번만)
   * ------------------------------------------------------------- */
  /** 목록 항목(평문, 기호 포함) -> 비교용 객체. 비교할 글자가 없으면 null */
  function compileEntry(raw) {
    var text = String(raw).trim();
    if (!text) return null;
    var flag = '';
    if (text.charAt(0) === '=' || text.charAt(0) === '*') { flag = text.charAt(0); text = text.slice(1).trim(); }
    text = text.normalize('NFC').toLowerCase();
    if (RE_HANGUL_ONE.test(text)) {
      var lit = hangulOnly(text);
      if (!lit) return null;
      var kb = flag === '=' ? '' : compress(qwerty(lit));
      return { k: 'ko', flag: flag, lit: lit, soft: softKey(lit), kb: kb.length >= 5 ? kb : '' };
    }
    var letters = onlyLetters(text);
    if (!letters) return null;
    var comp = compress(letters);
    // 같은 글자가 겹친 항목(jonna)을 압축하면 짧아져 오탐(jonathan)이 나므로, 압축본은 충분히 길 때만 쓴다
    return { k: 'en', flag: flag, lit: letters, comp: comp, useComp: comp.length >= 4 && (comp === letters || comp.length >= 5) };
  }

  function compileList(arr, isEncoded) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var e = compileEntry(isEncoded ? decodeB64(arr[i]) : arr[i]);
      if (e) out.push(e);
    }
    return out;
  }

  var BASE = null;
  function base() {
    if (BASE) return BASE;
    var w = WORDS || {};
    BASE = {
      reserved: compileList(w.reserved || [], true),
      pii: compileList((w.pii || []).concat(w.contact || []), true),
      block: compileList((w.ko || []).concat(w.en || []), true),
      rom: compileList(w.rom || [], true),
      allow: (w.allow || []).map(function (x) { return hangulOnly(decodeB64(x).normalize('NFC')); }).filter(Boolean)
    };
    return BASE;
  }

  var extraCache = { key: null, list: [] };
  function parseExtra(extra) {
    var arr = [];
    if (Array.isArray(extra)) arr = extra;
    else if (typeof extra === 'string') arr = extra.split(',');
    var key = arr.join('\u0001');
    if (extraCache.key === key) return extraCache.list;
    var list = compileList(arr, false);
    extraCache = { key: key, list: list };
    return list;
  }

  /* ---------------------------------------------------------------
   * 뷰(정규화된 입력) 만들기와 비교
   * ------------------------------------------------------------- */
  function buildViews(nick, allow) {
    var lower = nick.toLowerCase();
    var v1 = hangulOnly(nick);
    if (allow) for (var i = 0; i < allow.length; i++) v1 = v1.split(allow[i]).join('');
    var a = onlyLetters(substDigits(lower));            // 숫자를 글자로 치환
    var b = onlyLetters(lower);                          // 숫자를 지움
    var r = romMix(nick);
    return { v1: v1, v2: softKey(v1), a: a, b: b, aC: compress(a), bC: compress(b), r: r, rC: compress(r) };
  }

  /** policy: 'literal'(예약어·개인정보·연락 유도) | 'block'(금칙어) */
  function matchKo(e, V, policy) {
    if (e.flag === '=') return V.v1 === e.lit;
    if (e.flag === '*' || policy === 'literal') {
      if (V.v1.indexOf(e.lit) >= 0) return true;
    } else if (e.soft.length >= 4) { if (V.v2.indexOf(e.soft) >= 0) return true; }
    else if (V.v1 === e.lit) return true;
    return policy === 'block' && !!e.kb && (V.aC.indexOf(e.kb) >= 0 || V.bC.indexOf(e.kb) >= 0);
  }
  function matchEn(e, V, withMix) {
    if (e.flag === '=') return V.a === e.lit || V.b === e.lit || (withMix && V.r === e.lit);
    if (e.flag === '*') return V.a.indexOf(e.lit) >= 0 || V.b.indexOf(e.lit) >= 0 || (withMix && V.r.indexOf(e.lit) >= 0);
    if (e.useComp) {
      return V.aC.indexOf(e.comp) >= 0 || V.bC.indexOf(e.comp) >= 0 || (withMix && V.rC.indexOf(e.comp) >= 0);
    }
    if (e.lit.length >= 4) return V.a.indexOf(e.lit) >= 0 || V.b.indexOf(e.lit) >= 0 || (withMix && V.r.indexOf(e.lit) >= 0);
    return V.a === e.lit || V.b === e.lit;
  }
  function findMatch(list, V, policy, withMix) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.k === 'ko' ? matchKo(e, V, policy) : matchEn(e, V, withMix)) return e;
    }
    return null;
  }
  function matchAny(list, V, policy, withMix) { return !!findMatch(list, V, policy, withMix); }

  /* ---------------------------------------------------------------
   * 개인정보 패턴
   * ------------------------------------------------------------- */
  var RE_PHONE_DIGITS = /01[016789]/;                      // 010, 011, 016~019
  var RE_PHONE_WORDS = /[공영]일[공영일이삼사오육칠팔구]/;     // 공일공, 영일영 ...
  var RE_CLASS_NUM = /[0-9]반/;                            // 3반
  var RE_SCHOOL_END = /^[가-힣]{2,}[초중고]$/;       // ○○초 (끝의 숫자는 떼고 검사)
  function piiPattern(nick, V) {
    if (RE_PHONE_DIGITS.test(nick)) return true;
    if (RE_PHONE_WORDS.test(V.v1)) return true;
    if (RE_CLASS_NUM.test(nick)) return true;
    if (RE_SCHOOL_END.test(nick.replace(/[0-9]+$/, ''))) return true;
    return false;
  }

  /* ---------------------------------------------------------------
   * 공개 함수
   * ------------------------------------------------------------- */
  function normalizeNick(nick) { return typeof nick === 'string' ? nick.normalize('NFC') : ''; }
  /** 중복 판정용 키: NFC + 소문자 */
  function nickKey(nick) { return normalizeNick(nick).toLowerCase(); }

  function fail(code, variant) {
    return { ok: false, code: code, message: MESSAGES[variant || code], field: 'nick' };
  }

  function validateNick(nick, extraBlock) {
    if (typeof nick !== 'string') return fail('nick_charset');
    if (nick.length > LIMITS.maxInput) return fail('nick_length');
    var s = nick.normalize('NFC');

    // 형식
    var len = Array.from(s).length;
    if (len < LIMITS.minLen || len > LIMITS.maxLen) return fail('nick_length');
    if (!RE_ALLOWED.test(s)) return fail('nick_charset', RE_JAMO.test(s) ? 'nick_charset_jamo' : 'nick_charset');
    var digits = (s.match(/[0-9]/g) || []).length;
    if (digits > LIMITS.maxDigits || digits === len) return fail('nick_digits');
    if (/(.)\1\1/.test(s.toLowerCase())) return fail('nick_repeat');

    var B = base();
    // 예약어 (사칭)
    var Vr = buildViews(s, null);
    if (matchAny(B.reserved, Vr, 'literal', false)) return fail('nick_reserved');
    // 개인정보·연락 유도, 금칙어 (고등어·신발처럼 오탐이 잦은 단어는 먼저 지운 뷰로 검사)
    var Vp = B.allow.length ? buildViews(s, B.allow) : Vr;
    if (piiPattern(s, Vp) || matchAny(B.pii, Vp, 'literal', false)) return fail('nick_pii');
    var extra = parseExtra(extraBlock);
    if (matchAny(B.block, Vp, 'block', false) || matchAny(B.rom, Vp, 'block', true) || (extra.length && matchAny(extra, Vp, 'block', true))) {
      return fail('nick_blocked');
    }
    return { ok: true, nick: s, key: s.toLowerCase(), message: MESSAGES.ok };
  }

  /** 오류 코드 -> 안내 문구 (서버 오류 코드를 화면에 보일 때 사용) */
  function messageFor(code) { return MESSAGES[code] || MESSAGES.nick_blocked; }

  return {
    validateNick: validateNick,
    normalizeNick: normalizeNick,
    nickKey: nickKey,
    messageFor: messageFor,
    MESSAGES: MESSAGES,
    LIMITS: LIMITS,
    // 도구·시험용
    _softKey: softKey,
    _qwerty: qwerty,
    _romMix: romMix,
    _compileEntry: compileEntry,
    /** 어떤 항목에 걸렸는지 확인하는 검수용 도구: { list:'block', entry:{...} } 또는 null */
    _explain: function (nick, extraBlock) {
      var s = normalizeNick(nick), B = base(), V = buildViews(s, null), Vp = B.allow.length ? buildViews(s, B.allow) : V, e;
      if ((e = findMatch(B.reserved, V, 'literal', false))) return { list: 'reserved', entry: e };
      if ((e = findMatch(B.pii, Vp, 'literal', false))) return { list: 'pii', entry: e };
      if ((e = findMatch(B.block, Vp, 'block', false))) return { list: 'block', entry: e };
      if ((e = findMatch(B.rom, Vp, 'block', true))) return { list: 'rom', entry: e };
      if ((e = findMatch(parseExtra(extraBlock), Vp, 'block', true))) return { list: 'extra', entry: e };
      return null;
    },
    _base: base
  };
});
