'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const N = require('../../nickname');
const WORDS = require('../../nick-words');
const V = require('./nick-vectors');

const codeOf = (nick, extra) => { const r = N.validateNick(nick, extra); return r.ok ? 'ok' : r.code; };

test('형식 검사: 길이·문자·숫자·반복·자모 분해형 NFC', () => {
  for (const [input, expected] of V.FORMAT) assert.equal(codeOf(input), expected, JSON.stringify(input));
});

test('낱자 자모는 전용 안내 문구, 다른 문자는 일반 문구(코드는 같음)', () => {
  const jamo = N.validateNick('ㅋㅋㅋ');
  const other = N.validateNick('a b');
  assert.equal(jamo.code, 'nick_charset');
  assert.equal(other.code, 'nick_charset');
  assert.notEqual(jamo.message, other.message);
  assert.match(jamo.message, /낱글자/);
});

test('개인정보·연락 유도·예약어', () => {
  for (const [input, expected] of V.PII) assert.equal(codeOf(input), expected, input);
});

test('검사 순서: 형식 -> 예약어 -> 개인정보 -> 금칙어 (앞 단계의 한 가지 안내만)', () => {
  assert.equal(codeOf('관리자학교'), 'nick_reserved');       // 예약어가 개인정보보다 먼저
  assert.equal(codeOf('학교시발'), 'nick_pii');                // 개인정보가 금칙어보다 먼저
  assert.equal(codeOf('시발a b'), 'nick_charset');             // 형식이 먼저
});

test('우회 시험(무해한 시험 단어 extraBlock): 모두 막힘 / extraBlock 없으면 통과', () => {
  assert.ok(V.BYPASS_EXTRA.length >= 40);
  for (const s of V.BYPASS_EXTRA) {
    assert.equal(N.validateNick(s, V.EXTRA).ok, false, '막혀야 함: ' + s);
    assert.equal(N.validateNick(s).ok, true, 'extraBlock 없이는 통과해야 함: ' + s);
  }
  // 문자열(쉼표)과 배열 모두 허용
  assert.equal(N.validateNick('거1북이', ['거북이']).ok, false);
  assert.equal(N.validateNick('b4n4n4', ' banana , ').ok, false);
});

test('spec §19.3.3 예시(실제 목록): 멍청이 계열·stupid 계열 차단, 멍청히·멍충이·멍멍이·studio·별빛냥 통과', () => {
  for (const s of V.SPEC_EXAMPLES) assert.equal(N.validateNick(s).ok, false, s);
  for (const s of ['멍청히', '멍충이', '멍멍이', 'studio', '별빛냥', 'class', 'pass']) assert.equal(N.validateNick(s).ok, true, s);
});

test('실제 금칙어 목록이 막아야 하는 말과 변형(base64 벡터)', () => {
  assert.ok(V.REAL_B64.length >= 100, '벡터 수 ' + V.REAL_B64.length);
  const misses = V.REAL_B64.filter((s) => N.validateNick(s).ok);
  assert.deepEqual(misses.map((s) => Buffer.from(s).toString('base64')), [], '못 잡은 항목(base64)');
});

test('금칙어 보강 벡터(철자 변형·1/I→l·한글 변형·전화번호·한글 숫자 반·연락 유도·사칭): 기대한 코드로 막힘', () => {
  assert.ok(V.WORDLIST_V2.length >= 100, '벡터 수 ' + V.WORDLIST_V2.length);
  const bad = V.WORDLIST_V2.map(([s, code]) => [s, codeOf(s), code]).filter(([, got, want]) => got !== want)
    .map(([s, got, want]) => Buffer.from(s).toString('base64') + ':' + got + '!=' + want);
  assert.deepEqual(bad, []);
  // 대소문자·앞뒤 숫자를 붙여도 같은 결과(영문 항목)
  for (const [s, code] of V.WORDLIST_V2) {
    if (!/^[a-z]{3,6}$/.test(s) || code !== 'nick_blocked') continue;
    assert.equal(N.validateNick(s.toUpperCase()).ok, false, '대문자 ' + s.toUpperCase());
    assert.equal(N.validateNick(s + '9').ok, false, '숫자 ' + s + '9');
  }
});

test('오탐 수정: 달빛시험·빛시계·별시계·불씨·심바·Shiitake 와 같은 원인의 말은 통과, 같은 말을 앞에 붙인 시발·병신류는 계속 막힘', () => {
  for (const s of ['달빛시험', '빛시험', '빛시', '빛시계', '별시계', '벽시계', '불씨', '별씨앗', '심바', '신박', '시험', '시험왕', 'Shiitake', 'SHIITAKE', 'Instant', 'Rapping', 'Thorny']) {
    assert.equal(N.validateNick(s).ok, true, '통과해야 함: ' + s);
  }
  const dec = (b) => Buffer.from(b, 'base64').toString();
  const must = ['빛시' + dec('67Cc'), '달빛' + dec('7Iuc67Cc'), '달빛' + dec('67OR7Iug'), dec('7Iuc67Cc'), dec('67OR7Iug'), dec('7JSo7Y6E')];   // 빛시+발, 달빛+시발, 달빛+병신, 시발, 병신, 씨팔
  for (const s of must) assert.equal(N.validateNick(s).ok, false, '막혀야 함(base64 ' + Buffer.from(s).toString('base64') + ')');
  // _explain 은 어느 목록에 걸렸는지 알려 준다
  assert.equal(N._explain('달빛시험'), null);
  assert.equal(N._explain(dec('7Iuc67Cc')).list, 'block');
});

test('오탐 방지: 정상 닉네임 목록은 전부 통과', () => {
  assert.ok(V.LEGIT.length >= 450, '정상 이름 수 ' + V.LEGIT.length);
  const bad = V.LEGIT.map((s) => [s, N.validateNick(s)]).filter(([, r]) => !r.ok).map(([s, r]) => s + ':' + r.code);
  assert.deepEqual(bad, []);
});

test('알려진 오탐/한계는 문서화된 대로 동작한다', () => {
  for (const [s] of V.KNOWN_FALSE_POSITIVES) assert.equal(N.validateNick(s).ok, false, s);
  // 한계: 못 잡는 우회는 통과해도 시험 실패가 아니다. 다만 모음 음절 끼워넣기는 접혀서 막혀야 한다(spec POC 의 머엉청이).
  assert.equal(N.validateNick('거엉북이', V.EXTRA).ok, false);
  assert.equal(N.validateNick('머엉청이').ok, false);
  assert.ok(V.KNOWN_LIMITS.length >= 2);
});

test('목록 자체 점검: 모든 분류가 base64 로 디코딩되고 개수가 충분하다', () => {
  const dec = (s) => Buffer.from(s, 'base64').toString('utf8');
  const counts = {};
  for (const k of ['reserved', 'pii', 'contact', 'allow', 'ko', 'en', 'rom']) {
    assert.ok(Array.isArray(WORDS[k]) && WORDS[k].length > 0, k);
    for (const w of WORDS[k]) {
      assert.match(w, /^[A-Za-z0-9+/]+=*$/, '평문이 섞이면 안 됨: ' + k);
      assert.ok(dec(w).trim().length > 0);
    }
    counts[k] = WORDS[k].length;
  }
  assert.ok(counts.ko >= 100 && counts.en >= 80 && counts.reserved >= 25 && counts.pii + counts.contact >= 40, JSON.stringify(counts));
  // 컴파일 결과가 목록 수와 맞는다(빈 항목 없음)
  const B = N._base();
  assert.equal(B.reserved.length, WORDS.reserved.length);
  assert.equal(B.block.length, WORDS.ko.length + WORDS.en.length);
});

test('목록 기반 자동 변형: 한글 항목 사이에 숫자·영문을 끼워도, 영문 항목을 숫자 치환·대문자로 바꿔도 막힌다', () => {
  const B = N._base();
  const leet = { o: '0', i: '1', e: '3', a: '4', s: '5', t: '7', b: '8' };
  let koTested = 0;
  let enTested = 0;
  for (const e of B.block) {
    if (e.k === 'ko') {
      if (e.flag === '=' || e.lit.length < 2 || e.lit.length > 6) continue;
      for (const ins of ['1', 'a']) {
        const w = e.lit.charAt(0) + ins + e.lit.slice(1);
        assert.equal(N.validateNick(w).ok, false, 'ko 삽입 ' + w + ' (' + e.lit + ')');
      }
      koTested++;
    } else {
      if (e.flag === '=' || e.lit.length > 8 || e.lit.length < 4) continue;
      const up = e.lit.toUpperCase();
      assert.equal(N.validateNick(up).ok, false, '대문자 ' + up);
      const l33t = e.lit.replace(/[oieastb]/g, (c) => leet[c]);
      if (l33t.replace(/[0-9]/g, '').length < 1 || (l33t.match(/[0-9]/g) || []).length > 3) continue;
      const r = N.validateNick(l33t);
      assert.equal(r.ok, false, '치환 ' + l33t + ' (' + e.lit + ')');
      enTested++;
    }
  }
  assert.ok(koTested > 80 && enTested > 30, koTested + '/' + enTested);
});

test('안내 문구는 금칙어를 알려 주지 않고 쉬운 말이다', () => {
  const r = N.validateNick('시발');
  assert.equal(r.code, 'nick_blocked');
  assert.doesNotMatch(r.message, /시발|욕/);
  for (const k of Object.keys(N.MESSAGES)) {
    assert.ok(N.MESSAGES[k].length > 5 && N.MESSAGES[k].length < 80, k);
  }
  assert.equal(N.validateNick('별빛냥').message, N.MESSAGES.ok);
});

test('반환 모양: 성공은 {ok,nick,key,message}, 실패는 {ok,code,message,field}', () => {
  const ok = N.validateNick('Star7');
  assert.deepEqual(Object.keys(ok).sort(), ['key', 'message', 'nick', 'ok']);
  assert.equal(ok.key, 'star7');
  const bad = N.validateNick('a b');
  assert.deepEqual(Object.keys(bad).sort(), ['code', 'field', 'message', 'ok']);
  assert.equal(bad.field, 'nick');
  assert.equal(N.validateNick(123).ok, false);
  assert.equal(N.validateNick(null).ok, false);
  assert.equal(N.validateNick('x'.repeat(10000)).code, 'nick_length');
});

test('브라우저 전역 방식으로 로드해도 같은 결과(서버·클라이언트 같은 파일)', () => {
  const sandbox = { TextDecoder, atob, self: undefined };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'nick-words.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'nickname.js'), 'utf8'), sandbox);
  const G = sandbox.ElementGemsNick;
  assert.equal(typeof G.validateNick, 'function');
  const samples = [].concat(V.LEGIT.slice(0, 80), V.LEGIT.slice(-120), V.REAL_B64.slice(0, 60), V.WORDLIST_V2.map((x) => x[0]), V.PII.map((x) => x[0]), V.FORMAT.map((x) => x[0]), V.BYPASS_EXTRA);
  for (const s of samples) {
    const a = JSON.stringify(N.validateNick(s, V.EXTRA));
    const b = JSON.stringify(G.validateNick(s, V.EXTRA));
    assert.equal(a, b, s);
  }
});

test('성능: 검증 1회 평균 1ms 안팎 이하(Workers CPU 10ms 한도 여유 확인용 대리 지표)', () => {
  const names = V.LEGIT.concat(V.REAL_B64);
  N.validateNick('워밍업');
  const t0 = process.hrtime.bigint();
  const rounds = 5;
  for (let r = 0; r < rounds; r++) for (const s of names) N.validateNick(s, V.EXTRA);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / (rounds * names.length);
  console.log('  nickname 평균 ' + ms.toFixed(3) + 'ms/회 (' + names.length * rounds + '회)');
  assert.ok(ms < 2, '평균 ' + ms + 'ms');
});
