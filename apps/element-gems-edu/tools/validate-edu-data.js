#!/usr/bin/env node
/* element-gems-edu - tools/validate-edu-data.js
 * 교육용 문제 데이터 검증기 (spec §21.4.3 '검증 스크립트' 표 전체 구현). Node 전용, 의존성 없음.
 *
 * [데이터 작성 담당에게 - 사용법]
 *   node apps/element-gems-edu/tools/validate-edu-data.js --file apps/element-gems-edu/edu-data/q/soc-3-2-1-1.js --source-dir <원문 txt 폴더>
 *   (그 밖의 옵션: --file 여러 개 / --unit soc-3-2 처럼 id 앞부분으로 고르기 / --allow-missing 파일 없음을 오류로 세지 않기 /
 *    --json 기계가 읽는 결과 / 옵션 없이 실행하면 카탈로그의 25개 소단원을 모두 검사하고 파일이 없는 소단원은 '문제 파일 없음'으로 보고)
 * 결과 읽는 법: 소단원마다 [오류]와 [경고]가 한 건씩 '번호 필드 [규칙이름] 무엇이 문제인지 / → 어떻게 고칠지' 두 줄로 나온다.
 *   [오류]는 반드시 0이 되어야 하고(종료 코드 1), [경고]는 사람이 한 건씩 읽고 정말 문제인지 판단해 고치거나 보고에 이유를 적는다(종료 코드는 0).
 *   '재서술' 규칙은 학습지 문장을 14자 이상 그대로 쓴 곳이다. 한 소단원에 3곳 이상이면 [오류]이니 같은 뜻을 새 문장으로 다시 쓴다.
 *   '민감어'는 폭력·죽음 낱말이라 기본은 그 문항을 빼거나 다시 쓴다. 파일 첫 줄 아래 상수(CONFIG·낱말 목록)를 바꾸지 말고 이상하면 보고한다.
 * 종료 코드: 0 = 오류 없음(경고만 있어도 0), 1 = 오류 있음, 2 = 사용법 오류·내부 오류.
 *
 * 문제 파일은 브라우저 대신 vm 샌드박스(window만 있는 가짜 환경)에서 실행해 읽는다 -> document·fetch·import/export 를 쓰면 '파일' 오류가 난다.
 * 모듈 사용: require('./validate-edu-data.js') -> { validateUnit, checkItem, runValidation, formatReport, cli, CONFIG, ... } (test/edu-data.test.js 가 사용).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ================================================================
 * 상수 (모든 수치·목록은 여기. 바꾸면 spec §21.4와 어긋날 수 있으니 바꾸기 전에 보고한다)
 * ================================================================ */
const CONFIG = {
  expectedCount: 60,                       // 소단원당 문제 수 (카탈로그 count 와도 같아야 한다)
  ratio: {
    ox: [22, 26],                          // OX 문항 수
    mc: [34, 38],                          // 객관식 문항 수
    oxSide: [10, 14],                      // OX 중 O(맞아요)와 X(틀려요) 각각
    mcPos: [7, 11]                         // 객관식 정답 위치(①~④) 각각
  },
  maxKindShare: 0.25,                      // 같은 기법(k)이 전체에서 차지할 수 있는 최대 비율 (초과하면 오류)
  maxPerFact: 5,                           // 사실(f) 하나당 문항 수 상한
  maxPerFactTight: 6,                      // 사실이 적은 '빡빡' 소단원의 상한
  tightUnits: ['soc-4-2-1-1', 'soc-4-2-1-2', 'soc-4-2-2-2', 'soc-6-2-2-2', 'soc-6-2-2-3'], // spec §21.4.1 빡빡·매우 빡빡 구간
  limits: {                                // 글자 수 상한(공백 포함, 강조 기호 ** 는 세지 않음)
    low:  { grades: [3, 4], q: 45, c: 16, e: 90 },     // 3·4학년
    high: { grades: [5, 6], q: 60, c: 22, e: 110 }     // 5·6학년
  },
  maxExplainSentences: 2,                  // 해설은 1~2문장
  factTextMax: 30,                         // facts[].s 는 재서술 30자 이내 (넘으면 경고)
  similarity: 0.8,                         // 두 문제 q 의 글자 2-그램 Jaccard 유사도 경고 기준
  answerLongestWarn: 0.5,                  // 객관식 정답이 '가장 긴 보기'인 비율이 이 값을 넘으면 경고(길이 편향)
  hangulRatioMin: 0.6,                     // 문제·해설의 한글 비율 최소 (미만이면 경고)
  rephrase: { minRun: 14, errorAt: 3 },    // 원문과 14자 이상 연속 일치, 소단원당 3곳 이상이면 오류
  fileTimeoutMs: 2000                      // 문제 파일 실행 제한 시간
};

// 변형 기법 코드 17종 (spec §21.4.2)
const KINDS = ['tf-t', 'tf-f', 'tf-n', 'bl-t', 'd2t', 't2d', 'ce', 'ec', 'not', 'cls', 'seq', 'pair', 'who', 'where', 'exa', 'why', 'cmp'];
// 기법별 기본 형식 (spec §21.4.2 '형식' 칸). 'any' = OX·객관식 모두 가능. 어긋나면 경고. tf-t 는 정답 O, tf-f 는 정답 X 여야 한다(어긋나면 오류).
const KIND_FORMAT = {
  'tf-t': 'ox', 'tf-f': 'ox', 'tf-n': 'ox',
  'bl-t': 'mc', 'd2t': 'mc', 't2d': 'mc', 'ec': 'mc', 'not': 'mc', 'cls': 'mc', 'seq': 'mc', 'pair': 'mc', 'who': 'mc', 'exa': 'mc', 'why': 'mc',
  'ce': 'any', 'where': 'any', 'cmp': 'any'
};

// 민감어 (경고, spec §21.5.3). 폭력·죽음·선정 낱말이 들어간 문항은 기본으로 빼거나 다시 쓴다. 두 글자 이상만 쓴다(오탐 방지).
const SENSITIVE_WORDS = [
  '처단', '학살', '폭탄', '사형', '죽이', '죽인', '죽였', '죽음', '살해', '살인', '위안부', '고문', '총살', '처형', '참수',
  '시체', '자살', '학대', '폭파', '폭격', '잔혹', '성폭력', '음란', '마약', '도박'
];

// 위 낱말이 우연히 들어 있는 보통 낱말(오탐). 검사 전에 먼저 지운다.  예: 가죽이(가죽+이), 고문서
const SENSITIVE_EXCEPT = ['가죽이', '고문서', '고문헌'];

// 3·4학년에게 어려운 한자어 (경고). 교과 용어(저출산·고령화·민주주의 등)는 넣지 않았다. 설명 문장을 쉬운 말로 바꿀 곳을 찾는 용도.
// 낱말의 첫머리에서만 찾는다(현상이다 속의 '상이' 같은 오탐을 피함).
const HARD_WORDS_LOW = [
  '수치', '상이', '지칭', '상기', '해당', '의거', '제반', '일환', '도모', '영위', '향유', '귀속', '수반', '상충', '불가피', '초래',
  '간주', '부합', '명시', '기인', '도래', '창출', '통념', '유발', '현저', '병행', '상호', '당면', '일컫', '제고', '확충', '구축',
  '포괄', '고찰', '양상', '추이', '요인', '함의', '내재', '잠재', '본질', '범주', '체계적', '유기적', '궁극적', '상대적', '실질적', '필연', '도출'
];

// 금칙 (오류)
const LINK_RE = /https?|www\.|:\/\/|@|\.(?:com|net|org|kr|io)\b/i;              // 외부 링크·http·@
const PHONE_RE = /01\d[-\s]?\d{3,4}[-\s]?\d{4}/;                                  // 전화번호 모양
const PIC_NOUN = '(?:그림|사진|그래프|도표|지도|삽화|만화|도면|표)';
const PIC_PARTICLE = '(?:을|를|은|는|이|가|에서|에|의|과|와|으로|로|도|만)?';
const PIC_TEXT = '(?:글|자료|사례|내용|문장|설명)';
const PICTURE_PATTERNS = [                                                          // 그림 의존 표현
  new RegExp('(?<![가-힣])(?:위|아래|밑|다음|이|그|옆)\\s*(?:의\\s*)?' + PIC_NOUN + PIC_PARTICLE + '(?![가-힣])'),   // 위 그림, 다음 표, 이 지도에서
  new RegExp('(?<![가-힣])' + PIC_NOUN + '(?:을|를|에서|에|으로|로|과|와)?\\s*(?:을|를)?\\s*(?:보고|보면|살펴|참고|읽고|통해)'), // 그림을 보고, 표를 살펴
  new RegExp('(?<![가-힣])(?:위|아래)\\s*(?:의\\s*)?' + PIC_TEXT + PIC_PARTICLE + '(?![가-힣])'),                       // 위 글, 아래 내용을
  new RegExp('(?<![가-힣])다음\\s*글' + PIC_PARTICLE + '(?![가-힣])'),                                                    // 다음 글을 읽고
  /자료(?:를|을|에서)\s*(?:보고|살펴)/
];
const PIC_LABEL_RE = /\(\s*[가나다라마]\s*\)/;                                      // (가) (나) 같은 표시 -> 경고
const CHOICE_BAD_RE = /모두|없음|전부|해당\s*없|정답\s*없|위\s*보기|아래\s*보기|둘\s*다|셋\s*다|모든\s*것|모든\s*보기/;  // 보기에 쓰면 안 되는 말
const CHOICE_NUMBER_RE = /^\s*(?:[①②③④⑤]|\(\d\)|\d[.)]\s)/;                    // 보기 앞 번호(화면이 붙인다) -> 경고
const DOUBLE_NEG_RE = /(?:않|없|아니|못하)(?:지|은|는)?\s*(?:않|없|아니)/;           // 이중부정 -> 경고
const NOT_WORDING_RE = /않|아닌|없는|틀린|잘못|다른\s*것/;                          // 기법 not 의 문제에 있어야 할 말
const HANJA_RE = /[一-鿿]/;

const FIELD_NAME = { q: '문제', c: '보기', e: '해설', a: '정답', f: '근거 사실', k: '기법', t: '형식', n: '번호', facts: '사실 목록', s: '사실' };
const SUBJECT_ID_RE = /^([a-z]+)-(\d+)-(\d+)-(\d+)-(\d+)$/;

/* ================================================================
 * 작은 도구
 * ================================================================ */
function isStr(x) { return typeof x === 'string'; }
function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function strLen(s) { return Array.from(String(s).replace(/\*\*/g, '').trim()).length; }
function norm(s) { return String(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); }
function limitsFor(grade) { return grade <= 4 ? CONFIG.limits.low : CONFIG.limits.high; }
function gradeLabel(grade) { return grade <= 4 ? '3·4학년' : '5·6학년'; }
function sentenceCount(s) {
  return String(s).replace(/(\d)\.\s*(?=\d)/g, '$1 ').trim().split(/(?<=[.!?。])\s+/).filter(function (x) { return x.replace(/[\s.!?。…]/g, '').length > 0; }).length;
}
function bigrams(s) {
  const set = new Set();
  for (let i = 0; i + 1 < s.length; i++) set.add(s.substr(i, 2));
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach(function (g) { if (b.has(g)) inter++; });
  return inter / (a.size + b.size - inter);
}
function hangulRatio(s) {
  const h = (String(s).match(/[가-힣]/g) || []).length;
  const all = (String(s).match(/[가-힣A-Za-z0-9]/g) || []).length;
  return { h: h, all: all, ratio: all ? h / all : 1 };
}
function shorten(s, n) { const a = Array.from(String(s)); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); }
function findSensitive(text) {
  let t = String(text);
  SENSITIVE_EXCEPT.forEach(function (x) { t = t.split(x).join(' '); });
  return SENSITIVE_WORDS.filter(function (w) { return t.indexOf(w) >= 0; });
}
function findHard(text) {
  return HARD_WORDS_LOW.filter(function (w) { return new RegExp('(?<![가-힣])' + w).test(text); });
}
function rangeText(r) { return r[0] + '~' + r[1]; }

/* 이슈 모으기 */
function makeCtx(grade) { return { grade: grade, out: [] }; }
function add(ctx, level, rule, code, where, msg, fix) {
  const w = where || {};
  ctx.out.push({ level: level, rule: rule, code: code, n: w.n == null ? null : w.n, index: w.index == null ? null : w.index, field: w.field || null, msg: msg, fix: fix || '' });
}
function itemWhere(item, idx, field) {
  return { n: isObj(item) && Number.isInteger(item.n) && item.n >= 1 ? item.n : null, index: idx, field: field || null };
}

/* ================================================================
 * 문항 하나 검사 (스키마·길이·금칙·민감어·가독성). 파일 전체 검사는 validateUnit.
 * ================================================================ */
function textsOfItem(item) {
  const list = [];
  if (isStr(item.q)) list.push(['q', item.q]);
  if (Array.isArray(item.c)) item.c.forEach(function (c, i) { if (isStr(c)) list.push(['c' + i, c]); });
  if (isStr(item.e)) list.push(['e', item.e]);
  return list;
}

function checkTextRules(ctx, where, field, text, opts) {
  // 금칙 (오류)
  if (LINK_RE.test(text)) add(ctx, 'error', '금칙', 'link', where(field), '외부 링크나 http, @ 가 들어 있어요: "' + shorten(text, 30) + '"', '링크·주소·@ 는 지우세요(전체 이용가 앱은 외부 링크를 쓰지 않아요).');
  if (PHONE_RE.test(text)) add(ctx, 'error', '금칙', 'personal-info', where(field), '전화번호처럼 보이는 숫자가 있어요.', '연락처는 쓰지 않아요. 지워 주세요.');
  for (let i = 0; i < PICTURE_PATTERNS.length; i++) {
    const m = PICTURE_PATTERNS[i].exec(text);
    if (m) {
      add(ctx, 'error', '금칙', 'picture-ref', where(field), '그림·표·글에 기대는 표현이 있어요: "' + m[0].trim() + '"', '그림이나 앞글이 없어도 풀 수 있게, 문장 안에 필요한 내용을 직접 쓰세요.');
      break;
    }
  }
  if (PIC_LABEL_RE.test(text)) add(ctx, 'warn', '금칙', 'picture-label', where(field), '(가)(나) 같은 자료 표시가 있어요. 그림·글에 기대는 문항일 수 있어요.', '자료 없이도 풀 수 있는지 확인하고, 아니면 다시 쓰세요.');
  if (/[<>]/.test(text)) add(ctx, 'warn', '금칙', 'angle-bracket', where(field), '< > 기호가 있어요. 화면에 글자 그대로 보일 수 있어요.', '꼭 필요하지 않으면 지우거나 괄호로 바꾸세요.');
  // 민감어 (경고)
  const hit = findSensitive(text);
  if (hit.length) add(ctx, 'warn', '민감어', 'sensitive', where(field), '민감한 낱말이 있어요: ' + hit.join(', '), '기본은 이 문항을 빼고 다른 사실로 바꾸는 거예요. 꼭 필요하면 교과서 수준의 중립적 표현으로 다시 쓰고 보고에 적으세요.');
  // 가독성 (경고)
  if (ctx.grade <= 4) {
    const hard = findHard(text);
    if (hard.length) add(ctx, 'warn', '가독성', 'hard-word', where(field), '3·4학년에게 어려운 말일 수 있어요: ' + hard.join(', '), '더 쉬운 말로 바꿔 보세요(교과 용어라면 그대로 두어도 돼요).');
  }
  if (HANJA_RE.test(text)) add(ctx, 'warn', '가독성', 'hanja', where(field), '한자가 들어 있어요.', '한글로만 쓰세요.');
  if (opts.ratio) {
    const r = hangulRatio(text);
    if (r.all >= 8 && r.ratio < CONFIG.hangulRatioMin) add(ctx, 'warn', '가독성', 'hangul-ratio', where(field), '한글이 아닌 글자(숫자·영어)가 많아요. 한글 비율 ' + Math.round(r.ratio * 100) + '%', '숫자·영어를 줄이고 한글 낱말로 풀어 쓰세요.');
  }
  if (opts.neg && DOUBLE_NEG_RE.test(text)) add(ctx, 'warn', '가독성', 'double-negative', where(field), '부정이 겹쳐 헷갈릴 수 있어요(이중부정).', '긍정 문장으로 다시 쓰거나 부정어를 하나만 쓰세요.');
}

/* item 은 문제 객체, idx 는 items 안의 위치(0부터). ctx = makeCtx(grade). factIds 는 Set 또는 null(사실 연결 검사 생략). */
function checkItem(item, idx, ctx, factIds) {
  const where = function (field) { return itemWhere(item, idx, field); };
  if (!isObj(item)) { add(ctx, 'error', '스키마', 'item-type', where(), (idx + 1) + '번째 항목이 문제 객체가 아니에요.', '{ n, t, q, a, e, f, k } 모양의 객체로 쓰세요.'); return; }
  const lim = limitsFor(ctx.grade);
  const known = ['n', 't', 'q', 'c', 'a', 'e', 'f', 'k', 'lv'];
  Object.keys(item).forEach(function (key) { if (known.indexOf(key) < 0) add(ctx, 'warn', '스키마', 'unknown-field', where(key), '알 수 없는 필드 "' + key + '" 가 있어요(앱이 무시해요).', '필요 없으면 지우세요.'); });

  // 번호 n (연속성은 파일 단위에서 본다)
  if (!(Number.isInteger(item.n) && item.n >= 1)) add(ctx, 'error', '스키마', 'n-type', where('n'), '번호(n)가 1 이상의 정수가 아니에요: ' + JSON.stringify(item.n), 'n 을 1부터 60까지 하나씩 쓰세요.');

  // 형식 t
  const t = item.t;
  if (t !== 'ox' && t !== 'mc') add(ctx, 'error', '스키마', 't-invalid', where('t'), '형식(t)이 "ox" 나 "mc" 가 아니에요: ' + JSON.stringify(t), "t 를 'ox'(맞아요/틀려요) 또는 'mc'(객관식)로 쓰세요.");

  // 문제 q / 해설 e
  ['q', 'e'].forEach(function (f) {
    if (!isStr(item[f]) || !item[f].trim()) add(ctx, 'error', '스키마', 'missing-field', where(f), FIELD_NAME[f] + '(' + f + ')가 없거나 비어 있어요.', FIELD_NAME[f] + '(' + f + ') 문자열을 채우세요.');
  });
  if (isStr(item.q) && item.q.trim()) {
    const len = strLen(item.q);
    if (len > lim.q) add(ctx, 'error', '길이', 'q-too-long', where('q'), '문제 문장이 ' + len + '자예요(' + gradeLabel(ctx.grade) + ' 상한 ' + lim.q + '자).', '문장을 ' + lim.q + '자 이하로 줄이세요. 두 가지를 묻고 있다면 나누세요.');
    if (sentenceCount(item.q) > 1) add(ctx, 'error', '길이', 'q-multi-sentence', where('q'), '문제가 두 문장 이상이에요. 한 문장 한 생각으로 써야 해요.', '한 문장으로 합치거나 필요 없는 문장을 지우세요.');
  }
  if (isStr(item.e) && item.e.trim()) {
    const len = strLen(item.e);
    if (len > lim.e) add(ctx, 'error', '길이', 'e-too-long', where('e'), '해설이 ' + len + '자예요(' + gradeLabel(ctx.grade) + ' 상한 ' + lim.e + '자).', '해설을 ' + lim.e + '자 이하로 줄이세요.');
    const sc = sentenceCount(item.e);
    if (sc > CONFIG.maxExplainSentences) add(ctx, 'error', '길이', 'e-sentences', where('e'), '해설이 ' + sc + '문장이에요(최대 ' + CONFIG.maxExplainSentences + '문장).', '정답의 까닭 한 문장과 헷갈리기 쉬운 것과의 차이 한 문장만 남기세요.');
  }

  // 정답 a / 보기 c
  if (t === 'ox') {
    if (item.a !== 0 && item.a !== 1) add(ctx, 'error', '스키마', 'answer-ox', where('a'), 'OX 정답(a)이 0 이나 1 이 아니에요: ' + JSON.stringify(item.a), '맞아요(O)는 1, 틀려요(X)는 0 으로 쓰세요.');
    if (item.c !== undefined) add(ctx, 'error', '스키마', 'ox-has-choices', where('c'), 'OX 문항에는 보기(c)를 쓰지 않아요.', 'c 를 지우세요.');
  } else if (t === 'mc') {
    if (!Array.isArray(item.c) || item.c.length !== 4) {
      add(ctx, 'error', '스키마', 'choices-length', where('c'), '객관식 보기(c)는 문자열 4개여야 해요(지금 ' + (Array.isArray(item.c) ? item.c.length + '개' : '배열이 아님') + ').', '보기를 정확히 4개 쓰세요.');
    } else {
      const seen = Object.create(null);
      item.c.forEach(function (c, i) {
        if (!isStr(c) || !c.trim()) { add(ctx, 'error', '스키마', 'choice-empty', where('c' + i), (i + 1) + '번 보기가 문자열이 아니거나 비어 있어요.', '보기를 채우세요.'); return; }
        const len = strLen(c);
        if (len > lim.c) add(ctx, 'error', '길이', 'c-too-long', where('c' + i), (i + 1) + '번 보기가 ' + len + '자예요(' + gradeLabel(ctx.grade) + ' 상한 ' + lim.c + '자).', '보기를 ' + lim.c + '자 이하로 줄이세요.');
        const nk = norm(c);
        if (seen[nk] !== undefined) add(ctx, 'error', '스키마', 'choice-dup', where('c' + i), (seen[nk] + 1) + '번 보기와 ' + (i + 1) + '번 보기가 같아요: "' + shorten(c, 20) + '"', '보기는 서로 달라야 해요. 하나를 바꾸세요.');
        else seen[nk] = i;
        if (CHOICE_BAD_RE.test(c)) add(ctx, 'error', '금칙', 'choice-all-none', where('c' + i), (i + 1) + '번 보기에 "모두/없음" 같은 말이 있어요: "' + shorten(c, 20) + '"', '"모두 맞다/없다/위 보기 모두" 보기는 쓰지 않아요. 구체적인 보기로 바꾸세요.');
        if (CHOICE_NUMBER_RE.test(c)) add(ctx, 'warn', '스키마', 'choice-numbered', where('c' + i), (i + 1) + '번 보기 앞에 번호 기호가 붙어 있어요: "' + shorten(c, 12) + '"', '번호는 화면이 붙여요. 보기 글자만 쓰세요.');
      });
    }
    if (!Number.isInteger(item.a) || item.a < 0 || item.a > 3) add(ctx, 'error', '스키마', 'answer-range', where('a'), '객관식 정답(a)이 0~3 범위의 정수가 아니에요: ' + JSON.stringify(item.a), '정답 보기의 위치를 0(①)~3(④)으로 쓰세요.');
  }

  // 근거 사실 f / 기법 k
  if (!isStr(item.f) || !item.f.trim()) add(ctx, 'error', '스키마', 'missing-fact', where('f'), '근거 사실(f)이 없어요.', "facts 에 있는 사실 id(예: 'F12')를 f 에 쓰세요. 모든 문제에 필요해요.");
  else if (factIds && !factIds.has(item.f)) add(ctx, 'error', '사실연결', 'fact-not-found', where('f'), '근거 사실 "' + item.f + '" 이(가) facts 에 없어요.', 'facts 에 그 id 를 추가하거나 f 를 올바른 id 로 고치세요.');
  if (KINDS.indexOf(item.k) < 0) add(ctx, 'error', '스키마', 'kind-invalid', where('k'), '기법 코드(k)가 목록에 없어요: ' + JSON.stringify(item.k), '허용 코드: ' + KINDS.join(', '));
  else if (t === 'ox' || t === 'mc') {
    const want = KIND_FORMAT[item.k];
    if (want !== 'any' && want !== t) add(ctx, 'warn', '스키마', 'kind-format', where('k'), '기법(k)이 ' + item.k + ' 인데 형식이 ' + (t === 'ox' ? 'OX' : '객관식') + '예요(이 기법은 보통 ' + (want === 'ox' ? 'OX' : '객관식') + ').', '형식이나 기법 코드가 맞는지 확인하세요.');
    if (item.k === 'tf-t' && t === 'ox' && item.a !== 1) add(ctx, 'error', '스키마', 'kind-answer', where('a'), '기법 tf-t(참 진술)인데 정답이 O(1)가 아니에요.', '참인 문장이면 a 를 1 로, 거짓이면 기법을 tf-f 로 바꾸세요.');
    if (item.k === 'tf-f' && t === 'ox' && item.a !== 0) add(ctx, 'error', '스키마', 'kind-answer', where('a'), '기법 tf-f(거짓 뒤집기)인데 정답이 X(0)가 아니에요.', '거짓인 문장이면 a 를 0 으로, 참이면 기법을 tf-t 로 바꾸세요.');
    if (item.k === 'not' && isStr(item.q) && !NOT_WORDING_RE.test(item.q)) add(ctx, 'warn', '가독성', 'not-wording', where('q'), "기법 not('옳지 않은 것')인데 문제에 '않은/아닌/없는' 같은 말이 보이지 않아요.", '"~옳지 않은 것은?"처럼 부정 표현을 분명히 쓰세요.');
  }
  if (item.lv !== undefined && [1, 2, 3].indexOf(item.lv) < 0) add(ctx, 'warn', '스키마', 'lv-invalid', where('lv'), '난이도 힌트(lv)는 1·2·3 중 하나예요: ' + JSON.stringify(item.lv), 'lv 를 지우거나 1~3 으로 쓰세요(지금은 쓰지 않아요).');

  // 글 내용 검사 (금칙·민감어·가독성)
  textsOfItem(item).forEach(function (pair) {
    const field = pair[0];
    const text = pair[1];
    checkTextRules(ctx, where, field, text, { ratio: field === 'q' || field === 'e', neg: field === 'q' });
  });
}

/* ================================================================
 * 문제 파일(소단원 하나) 전체 검사
 * unit = { id, name, count, grade, tight? }, data = { v, facts, items }, sourceText = 원문(문자열) 또는 null
 * ================================================================ */
function validateUnit(unit, data, sourceText) {
  const grade = unit.grade;
  const ctx = makeCtx(grade);
  const stats = { items: 0, ox: 0, mc: 0, oxO: 0, oxX: 0, pos: [0, 0, 0, 0], kinds: {}, maxPerFact: 0 };
  const result = { errors: [], warnings: [], info: [], stats: stats };
  const finish = function () {
    ctx.out.sort(function (a, b) { return (a.index == null ? -1 : a.index) - (b.index == null ? -1 : b.index); });   // 전체 문제 -> 문항 순서
    ctx.out.forEach(function (x) { (x.level === 'error' ? result.errors : x.level === 'warn' ? result.warnings : result.info).push(x); });
    return result;
  };

  if (!isObj(data)) { add(ctx, 'error', '스키마', 'data-type', {}, '등록된 값이 객체가 아니에요.', "D['" + unit.id + "'] = { v: 1, facts: [...], items: [...] } 모양으로 쓰세요."); return finish(); }
  Object.keys(data).forEach(function (k) { if (['v', 'facts', 'items'].indexOf(k) < 0) add(ctx, 'warn', '스키마', 'unknown-field', { field: k }, '알 수 없는 최상위 필드 "' + k + '" 가 있어요.', '필요 없으면 지우세요.'); });
  if (data.v !== 1) add(ctx, 'error', '스키마', 'bad-version', {}, '버전(v)이 1 이 아니에요: ' + JSON.stringify(data.v), 'v: 1 로 쓰세요.');

  // facts
  let factIds = null;
  const factUse = Object.create(null);
  if (!Array.isArray(data.facts) || data.facts.length === 0) {
    add(ctx, 'error', '스키마', 'facts-missing', {}, '사실 목록(facts)이 없거나 비어 있어요.', "facts: [ { id: 'F01', s: '재서술한 사실 요약' }, ... ] 를 만드세요.");
  } else {
    factIds = new Set();
    data.facts.forEach(function (f, i) {
      const w = { index: i, field: 'facts' };
      if (!isObj(f) || !isStr(f.id) || !f.id.trim() || !isStr(f.s) || !f.s.trim()) { add(ctx, 'error', '스키마', 'fact-shape', w, '사실 ' + (i + 1) + '번째가 { id, s } 문자열 쌍이 아니에요.', "{ id: 'F01', s: '요약' } 모양으로 쓰세요."); return; }
      if (factIds.has(f.id)) add(ctx, 'error', '스키마', 'fact-id-dup', w, '사실 id "' + f.id + '" 가 겹쳐요.', '사실 id 는 서로 달라야 해요.');
      factIds.add(f.id);
      factUse[f.id] = 0;
      if (strLen(f.s) > CONFIG.factTextMax) add(ctx, 'warn', '길이', 'fact-long', w, '사실 ' + f.id + ' 요약이 ' + strLen(f.s) + '자예요(권장 ' + CONFIG.factTextMax + '자 이내).', '짧게 줄이세요.');
      if (LINK_RE.test(f.s)) add(ctx, 'error', '금칙', 'link', w, '사실 ' + f.id + ' 에 외부 링크나 http, @ 가 있어요.', '지우세요.');
      const hit = findSensitive(f.s);
      if (hit.length) add(ctx, 'warn', '민감어', 'sensitive', w, '사실 ' + f.id + ' 에 민감한 낱말이 있어요: ' + hit.join(', '), '이 사실로 문항을 만들지 않는 것이 기본이에요.');
    });
  }

  // items
  if (!Array.isArray(data.items)) { add(ctx, 'error', '스키마', 'items-missing', {}, '문제 목록(items)이 배열이 아니에요.', 'items: [ {...}, ... ] 를 만드세요.'); return finish(); }
  const items = data.items;
  stats.items = items.length;
  items.forEach(function (item, idx) { checkItem(item, idx, ctx, factIds); });

  // 개수
  const want = unit.count != null ? unit.count : CONFIG.expectedCount;
  if (items.length !== want) add(ctx, 'error', '개수', 'item-count', {}, '문제가 ' + items.length + '개예요. 정확히 ' + want + '개여야 해요.', (items.length < want ? (want - items.length) + '개를 더 만드세요.' : (items.length - want) + '개를 줄이세요.'));

  // 번호 연속성
  const ns = items.map(function (it) { return isObj(it) ? it.n : undefined; });
  const nCount = Object.create(null);
  const outOfRange = [];
  ns.forEach(function (n) { if (Number.isInteger(n)) { nCount[n] = (nCount[n] || 0) + 1; if (n < 1 || n > items.length) outOfRange.push(n); } });
  const dupNs = Object.keys(nCount).filter(function (k) { return nCount[k] > 1; });
  const missingNs = [];
  for (let i = 1; i <= items.length; i++) if (!nCount[i]) missingNs.push(i);
  if (dupNs.length || missingNs.length || outOfRange.length) {
    const parts = [];
    if (dupNs.length) parts.push('겹친 번호: ' + dupNs.join(', '));
    if (missingNs.length) parts.push('빠진 번호: ' + missingNs.slice(0, 10).join(', ') + (missingNs.length > 10 ? ' …' : ''));
    if (outOfRange.length) parts.push('범위 밖 번호: ' + outOfRange.join(', '));
    add(ctx, 'error', '스키마', 'n-sequence', {}, '번호(n)는 1부터 ' + items.length + '까지 하나씩 있어야 해요. ' + parts.join(' / '), 'n 을 1부터 차례로 다시 매기세요.');
  }

  // 통계·비율
  const valid = items.filter(isObj);
  valid.forEach(function (it) {
    if (it.t === 'ox') { stats.ox++; if (it.a === 1) stats.oxO++; else if (it.a === 0) stats.oxX++; }
    else if (it.t === 'mc') { stats.mc++; if (Number.isInteger(it.a) && it.a >= 0 && it.a <= 3) stats.pos[it.a]++; }
    if (KINDS.indexOf(it.k) >= 0) stats.kinds[it.k] = (stats.kinds[it.k] || 0) + 1;
  });
  const R = CONFIG.ratio;
  const outRange = function (v, r) { return v < r[0] || v > r[1]; };
  const dir = function (v, r, unitWord, what) { return v > r[1] ? (v - r[1]) + unitWord + ' 줄이세요(' + what + ').' : (r[0] - v) + unitWord + ' 늘리세요(' + what + ').'; };
  if (outRange(stats.ox, R.ox)) add(ctx, 'error', '비율', 'ox-count', {}, 'OX 문제가 ' + stats.ox + '개예요(허용 ' + rangeText(R.ox) + '개).', dir(stats.ox, R.ox, '개', 'OX를 객관식으로 바꾸거나 반대로'));
  if (outRange(stats.mc, R.mc)) add(ctx, 'error', '비율', 'mc-count', {}, '객관식 문제가 ' + stats.mc + '개예요(허용 ' + rangeText(R.mc) + '개).', dir(stats.mc, R.mc, '개', '객관식과 OX 수를 조정'));
  if (outRange(stats.oxO, R.oxSide)) add(ctx, 'error', '비율', 'ox-o-count', {}, 'OX 중 O(맞아요)가 ' + stats.oxO + '개예요(허용 ' + rangeText(R.oxSide) + '개).', dir(stats.oxO, R.oxSide, '개', '일부를 X 문제로 바꾸거나 반대로'));
  if (outRange(stats.oxX, R.oxSide)) add(ctx, 'error', '비율', 'ox-x-count', {}, 'OX 중 X(틀려요)가 ' + stats.oxX + '개예요(허용 ' + rangeText(R.oxSide) + '개).', dir(stats.oxX, R.oxSide, '개', '일부를 O 문제로 바꾸거나 반대로'));
  stats.pos.forEach(function (cnt, i) {
    if (outRange(cnt, R.mcPos)) add(ctx, 'error', '비율', 'mc-position', {}, '객관식 정답이 ' + '①②③④'.charAt(i) + '번 위치에 ' + cnt + '개예요(허용 ' + rangeText(R.mcPos) + '개).', '보기 순서를 섞어 정답 위치를 고르게(각 9개 안팎) 만드세요. 정답 a 도 같이 고치세요.');
  });
  // 정답이 가장 긴 보기인 비율 (길이 편향, 경고)
  let mcCount = 0;
  let longest = 0;
  valid.forEach(function (it) {
    if (it.t !== 'mc' || !Array.isArray(it.c) || it.c.length !== 4 || !it.c.every(isStr) || !Number.isInteger(it.a) || it.a < 0 || it.a > 3) return;
    mcCount++;
    const lens = it.c.map(strLen);
    const max = Math.max.apply(null, lens);
    if (lens[it.a] === max && lens.filter(function (x) { return x === max; }).length === 1) longest++;
  });
  if (mcCount && longest / mcCount > CONFIG.answerLongestWarn) add(ctx, 'warn', '비율', 'answer-longest', {}, '객관식 정답이 가장 긴 보기인 문항이 ' + longest + '/' + mcCount + '개예요. 길이로 정답을 찍을 수 있어요.', '오답 보기를 정답과 비슷한 길이로 다듬으세요.');

  // 중복
  const qSeen = Object.create(null);
  const pairSeen = Object.create(null);
  const factCount = Object.create(null);
  const kindCount = Object.create(null);
  valid.forEach(function (it) {
    const idx = items.indexOf(it);
    if (isStr(it.q) && it.q.trim()) {
      const nk = norm(it.q);
      if (qSeen[nk] !== undefined) add(ctx, 'error', '중복', 'q-dup', itemWhere(it, idx, 'q'), '문제 문장이 ' + qSeen[nk].label + ' 문제와 똑같아요(띄어쓰기·기호 무시).', '질문 형태나 소재를 바꿔 다른 문제로 만드세요.');
      else qSeen[nk] = { idx: idx, label: isObj(items[idx]) && Number.isInteger(items[idx].n) ? items[idx].n + '번' : (idx + 1) + '번째' };
    }
    if (isStr(it.f) && it.f) {
      factCount[it.f] = (factCount[it.f] || 0) + 1;
      if (factUse[it.f] !== undefined) factUse[it.f]++;
      if (KINDS.indexOf(it.k) >= 0) {
        const key = it.f + '|' + it.k;
        if (pairSeen[key] !== undefined) add(ctx, 'error', '중복', 'fact-kind-dup', itemWhere(it, idx, 'k'), '같은 사실 ' + it.f + ' 에 같은 기법 ' + it.k + ' 문제가 ' + pairSeen[key] + ' 문제에도 있어요.', '같은 사실에는 서로 다른 기법(k)만 쓰세요. 기법을 바꾸거나 다른 사실로 옮기세요.');
        else pairSeen[key] = isObj(items[idx]) && Number.isInteger(items[idx].n) ? items[idx].n + '번' : (idx + 1) + '번째';
      }
    }
    if (KINDS.indexOf(it.k) >= 0) kindCount[it.k] = (kindCount[it.k] || 0) + 1;
  });
  const maxFact = unit.tight || CONFIG.tightUnits.indexOf(unit.id) >= 0 ? CONFIG.maxPerFactTight : CONFIG.maxPerFact;
  Object.keys(factCount).forEach(function (f) {
    if (factCount[f] > stats.maxPerFact) stats.maxPerFact = factCount[f];
    if (factCount[f] > maxFact) add(ctx, 'error', '중복', 'fact-over', {}, '사실 ' + f + ' 로 만든 문제가 ' + factCount[f] + '개예요(최대 ' + maxFact + '개).', (factCount[f] - maxFact) + '개를 다른 사실의 문제로 바꾸세요.');
  });
  const total = items.length || 1;
  Object.keys(kindCount).forEach(function (k) {
    if (kindCount[k] / total > CONFIG.maxKindShare) add(ctx, 'error', '중복', 'kind-share', {}, '기법 ' + k + ' 가 ' + kindCount[k] + '개로 전체의 ' + Math.round(kindCount[k] / total * 100) + '%예요(최대 ' + Math.round(CONFIG.maxKindShare * 100) + '%).', '여러 기법을 고르게 쓰세요. ' + (kindCount[k] - Math.floor(total * CONFIG.maxKindShare)) + '개 이상을 다른 기법으로 바꾸세요.');
  });

  // 사실 연결: 쓰이지 않은 사실
  if (factIds) {
    factIds.forEach(function (id) {
      if (!factUse[id]) add(ctx, 'error', '사실연결', 'fact-unused', {}, '사실 ' + id + ' 을(를) 쓰는 문제가 하나도 없어요.', '그 사실로 문제를 만들거나 facts 에서 지우세요.');
    });
  }

  // 유사도 (경고)
  const grams = items.map(function (it) { return isObj(it) && isStr(it.q) ? bigrams(norm(it.q)) : new Set(); });
  const nq = items.map(function (it) { return isObj(it) && isStr(it.q) ? norm(it.q) : ''; });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!nq[i] || nq[i] === nq[j]) continue;                 // 완전 중복은 오류로 이미 보고
      const sim = jaccard(grams[i], grams[j]);
      if (sim >= CONFIG.similarity) {
        const li = Number.isInteger(items[i].n) ? items[i].n : i + 1;
        const lj = Number.isInteger(items[j].n) ? items[j].n : j + 1;
        add(ctx, 'warn', '유사도', 'similar', itemWhere(items[j], j, 'q'), '문제가 ' + li + '번과 거의 같아요(2-그램 유사도 ' + sim.toFixed(2) + ', 기준 ' + CONFIG.similarity + ').', '일부러 만든 변형이면 그대로 두고 보고에 적으세요. 아니면 질문 형태를 바꾸세요.');
      }
    }
  }

  // 재서술 (원문 겹침)
  if (sourceText != null) checkRephrase(ctx, unit, data, sourceText);

  return finish();
}

/* 정규화 + 원래 위치 지도 */
function normWithMap(s) {
  let out = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (/[0-9A-Za-z가-힣]/.test(ch)) { out += ch.toLowerCase(); map.push(i); }
  }
  return { norm: out, map: map };
}

function checkRephrase(ctx, unit, data, sourceText) {
  const minRun = CONFIG.rephrase.minRun;
  const src = normWithMap(sourceText).norm;
  const srcGrams = new Set();
  for (let i = 0; i + minRun <= src.length; i++) srcGrams.add(src.substr(i, minRun));
  const hits = [];
  const scan = function (where, label, text) {
    if (!isStr(text)) return;
    const nm = normWithMap(text);
    const n = nm.norm;
    if (n.length < minRun) return;
    const covered = new Array(n.length).fill(false);
    for (let i = 0; i + minRun <= n.length; i++) {
      if (srcGrams.has(n.substr(i, minRun))) for (let k = i; k < i + minRun; k++) covered[k] = true;
    }
    let i = 0;
    while (i < n.length) {
      if (!covered[i]) { i++; continue; }
      let j = i;
      while (j + 1 < n.length && covered[j + 1]) j++;
      const orig = text.slice(nm.map[i], nm.map[j] + 1);
      hits.push({ where: where, label: label, len: j - i + 1, text: orig });
      i = j + 1;
    }
  };
  (data.facts || []).forEach(function (f, i) { if (isObj(f)) scan({ index: i, field: 'facts' }, '사실 ' + f.id, f.s); });
  (data.items || []).forEach(function (it, idx) {
    if (!isObj(it)) return;
    textsOfItem(it).forEach(function (p) { scan(itemWhere(it, idx, p[0]), '', p[1]); });
  });
  const asError = hits.length >= CONFIG.rephrase.errorAt;
  hits.forEach(function (h) {
    const fieldWord = h.label || (h.where.field === 'q' ? '문제' : h.where.field === 'e' ? '해설' : '보기');
    add(ctx, asError ? 'error' : 'warn', '재서술', 'copy-run', h.where, fieldWord + '에 학습지와 ' + h.len + '자 연속으로 같은 부분이 있어요: "' + shorten(h.text, 28) + '"' + (asError ? ' (이 소단원에 ' + hits.length + '곳, ' + CONFIG.rephrase.errorAt + '곳 이상이라 오류)' : ''), '같은 뜻을 다른 낱말·문장 구조로 새로 쓰세요(교과 용어·고유명사만 그대로).');
  });
}

/* ================================================================
 * 카탈로그
 * ================================================================ */
function flattenCatalog(catalog) {
  const list = [];
  if (!isObj(catalog) || !Array.isArray(catalog.subjects)) return list;
  catalog.subjects.forEach(function (subject) {
    if (!isObj(subject) || subject.ready === false) return;
    (subject.grades || []).forEach(function (g) {
      (g.terms || []).forEach(function (t) {
        if (!t || t.ready === false || !Array.isArray(t.units)) return;
        t.units.forEach(function (u) {
          (u.subs || []).forEach(function (s) {
            list.push({ subject: subject, grade: g.grade, term: t.term, unit: u, sub: s });
          });
        });
      });
    });
  });
  return list;
}

function checkCatalog(catalog) {
  const ctx = makeCtx(3);
  const W = {};
  if (!isObj(catalog)) { add(ctx, 'error', '카탈로그', 'catalog-type', W, '카탈로그가 객체가 아니에요.', 'window.EDU_CATALOG = { v: 1, subjects: [...] } 모양으로 쓰세요.'); return ctx.out; }
  if (catalog.v !== 1) add(ctx, 'error', '카탈로그', 'catalog-version', W, '카탈로그 버전(v)이 1 이 아니에요.', 'v: 1 로 쓰세요.');
  if (!Array.isArray(catalog.subjects)) { add(ctx, 'error', '카탈로그', 'catalog-subjects', W, 'subjects 배열이 없어요.', 'subjects: [ ... ] 를 쓰세요.'); return ctx.out; }
  const ids = {};
  const subjIds = {};
  catalog.subjects.forEach(function (subject) {
    if (!isObj(subject) || !isStr(subject.id) || !isStr(subject.name)) { add(ctx, 'error', '카탈로그', 'subject-shape', W, '과목 항목에 id·name 이 없어요.', "{ id: 'soc', name: '사회', grades: [...] } 로 쓰세요."); return; }
    if (subjIds[subject.id]) add(ctx, 'error', '카탈로그', 'subject-dup', W, '과목 id "' + subject.id + '" 가 겹쳐요.', '과목 id 는 서로 달라야 해요.');
    subjIds[subject.id] = true;
    const gradeSeen = {};
    (subject.grades || []).forEach(function (g) {
      if (!Number.isInteger(g.grade)) { add(ctx, 'error', '카탈로그', 'grade-shape', W, subject.id + ' 의 학년(grade)이 정수가 아니에요.', 'grade 를 3·4·5·6 같은 정수로 쓰세요.'); return; }
      if (gradeSeen[g.grade]) add(ctx, 'error', '카탈로그', 'grade-dup', W, subject.id + ' ' + g.grade + '학년이 두 번 있어요.', '하나로 합치세요.');
      gradeSeen[g.grade] = true;
      const termSeen = {};
      (g.terms || []).forEach(function (t) {
        if (termSeen[t.term]) add(ctx, 'error', '카탈로그', 'term-dup', W, subject.id + ' ' + g.grade + '학년 ' + t.term + '학기가 두 번 있어요.', '하나로 합치세요.');
        termSeen[t.term] = true;
        if (t.ready === false) {
          if (t.units && t.units.length) add(ctx, 'warn', '카탈로그', 'term-not-ready', W, g.grade + '학년 ' + t.term + '학기는 ready:false 인데 units 가 있어요(화면에서 준비 중으로만 보여요).', '문제가 준비되면 ready:true 로 바꾸세요.');
          return;
        }
        if (!Array.isArray(t.units) || !t.units.length) { add(ctx, 'error', '카탈로그', 'term-empty', W, g.grade + '학년 ' + t.term + '학기가 ready:true 인데 units 가 비어 있어요.', 'units 를 채우거나 ready:false 로 바꾸세요.'); return; }
        const unitSeen = {};
        t.units.forEach(function (u) {
          if (unitSeen[u.no]) add(ctx, 'error', '카탈로그', 'unit-dup', W, g.grade + '학년 ' + t.term + '학기 ' + u.no + '단원이 두 번 있어요.', '단원 번호를 고치세요.');
          unitSeen[u.no] = true;
          if (!isStr(u.name) || !u.name.trim()) add(ctx, 'error', '카탈로그', 'unit-name', W, g.grade + '학년 ' + t.term + '학기 ' + u.no + '단원 이름이 없어요.', '이름을 쓰세요.');
          const subSeen = {};
          (u.subs || []).forEach(function (s) {
            const where = W;
            if (subSeen[s.no]) add(ctx, 'error', '카탈로그', 'sub-dup', where, s.id + ': 소단원 번호가 겹쳐요.', '번호를 고치세요.');
            subSeen[s.no] = true;
            const wantId = subject.id + '-' + g.grade + '-' + t.term + '-' + u.no + '-' + s.no;
            if (s.id !== wantId) add(ctx, 'error', '카탈로그', 'id-rule', where, '소단원 id "' + s.id + '" 가 위치(' + wantId + ')와 달라요.', 'id 는 {과목}-{학년}-{학기}-{단원}-{소단원} 규칙이에요.');
            if (ids[s.id]) add(ctx, 'error', '카탈로그', 'id-dup', where, '소단원 id "' + s.id + '" 가 겹쳐요.', 'id 는 하나뿐이어야 해요.');
            ids[s.id] = true;
            if (s.file !== 'edu-data/q/' + s.id + '.js') add(ctx, 'error', '개수', 'file-rule', where, s.id + ': file 이 "edu-data/q/' + s.id + '.js" 가 아니에요: ' + JSON.stringify(s.file), 'file 을 규칙대로 고치세요.');
            if (s.count !== CONFIG.expectedCount) add(ctx, 'error', '개수', 'catalog-count', where, s.id + ': 카탈로그 count 가 ' + CONFIG.expectedCount + ' 이 아니에요: ' + JSON.stringify(s.count), 'count 를 ' + CONFIG.expectedCount + ' 으로 쓰세요.');
            if (!isStr(s.name) || !s.name.trim()) add(ctx, 'error', '카탈로그', 'sub-name', where, s.id + ': 소단원 이름이 없어요.', '이름을 쓰세요.');
            if (s.pages !== undefined && s.pages !== '' && !/^\d+-\d+$/.test(String(s.pages))) add(ctx, 'warn', '카탈로그', 'pages-format', where, s.id + ': 쪽수 형식이 "6-33" 이 아니에요: ' + JSON.stringify(s.pages), "쪽수를 '시작-끝' 으로 쓰세요(표시를 원하지 않으면 '')." );
          });
        });
      });
    });
  });
  return ctx.out;
}

/* ================================================================
 * 문제 파일 읽기 (vm 샌드박스)
 * ================================================================ */
function loadUnitFile(absPath, expectedId) {
  const res = { ok: false, data: null, issues: [] };
  const fail2 = function (rule, code, msg, fix) { res.issues.push({ level: 'error', rule: rule, code: code, n: null, index: null, field: null, msg: msg, fix: fix || '' }); return res; };
  const fail = function (code, msg, fix) { return fail2('파일', code, msg, fix); };
  let code;
  try { code = fs.readFileSync(absPath, 'utf8'); } catch (e) { return fail('read-error', '파일을 읽지 못했어요: ' + e.message, '경로를 확인하세요.'); }
  if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  try {
    new vm.Script(code, { filename: absPath }).runInContext(sandbox, { timeout: CONFIG.fileTimeoutMs });
  } catch (e) {
    const first = String(e && e.stack || '').split('\n')[0];
    const m = /:(\d+)\s*$/.exec(first);
    const line = m ? m[1] + '번째 줄 ' : '';
    if (e instanceof SyntaxError || (e && e.name === 'SyntaxError')) return fail('syntax-error', '자바스크립트 문법 오류예요: ' + line + '(' + e.message + ')', '쉼표·따옴표·괄호를 확인하세요. 작은따옴표 안의 작은따옴표는 \\\' 로 쓰고, import/export(ES module)는 쓰지 마세요.');
    return fail('runtime-error', '파일을 실행하다 오류가 났어요: ' + (e && e.message) + '. 파일은 window.EDU_Q 에 데이터만 등록해야 해요.', 'document·fetch 같은 브라우저 기능을 쓰지 마세요.');
  }
  const reg = sandbox.EDU_Q;
  if (!isObj(reg) || Object.keys(reg).length === 0) return fail('no-register', 'window.EDU_Q 에 아무것도 등록하지 않았어요.', "(function (w) { var D = w.EDU_Q = w.EDU_Q || {}; D['" + expectedId + "'] = {...}; })(window); 모양으로 쓰세요.");
  const keys = Object.keys(reg);
  if (keys.indexOf(expectedId) < 0) return fail2('개수', 'id-mismatch', '이 파일이 등록한 id 는 [' + keys.join(', ') + '] 인데 카탈로그의 소단원 id 는 "' + expectedId + '" 예요.', "D['" + expectedId + "'] 로 등록하세요.");
  if (keys.length > 1) res.issues.push({ level: 'error', rule: '개수', code: 'extra-key', n: null, index: null, field: null, msg: '파일 하나에 소단원 id 를 여러 개 등록했어요: ' + keys.join(', '), fix: '한 파일에는 그 소단원 하나만 등록하세요.' });
  try { res.data = JSON.parse(JSON.stringify(reg[expectedId])); } catch (e) { return fail('not-json', '데이터를 JSON 으로 바꿀 수 없어요(함수·순환 참조 등): ' + e.message, '글자·숫자·배열·객체만 쓰세요.'); }
  res.ok = true;
  return res;
}

/* ================================================================
 * 실행: 카탈로그 + 파일들 -> 결과 객체
 * options: { appRoot, catalog, files, units, sourceDir, allowMissing }
 * ================================================================ */
function sourceFileFor(entry, sourceDir) {
  return path.join(sourceDir, entry.subject.name + '_' + entry.grade + '-' + entry.term + '_' + entry.unit.no + '단원(' + entry.sub.no + ').txt');
}

function displayPath(abs) {
  const rel = path.relative(process.cwd(), abs);
  return rel.indexOf('..') === 0 ? abs : rel;
}

function summarize(list) {
  return list.map(function (x) { return { level: x.level, rule: x.rule, code: x.code, n: x.n, index: x.index, field: x.field, msg: x.msg, fix: x.fix }; });
}

function runValidation(options) {
  const opts = options || {};
  const appRoot = opts.appRoot || path.join(__dirname, '..');
  const catalog = opts.catalog || require(path.join(__dirname, '..', 'edu-data', 'catalog.js'));   // appRoot 는 문제 파일(sub.file)을 찾는 기준 폴더일 뿐
  const flat = flattenCatalog(catalog);
  const result = { catalogIssues: summarize(checkCatalog(catalog)), units: [], totals: null };
  const byId = {};
  flat.forEach(function (e) { byId[e.sub.id] = e; });

  let targets = [];
  if (opts.files && opts.files.length) {
    opts.files.forEach(function (f) {
      const abs = path.resolve(f);
      const id = path.basename(abs).replace(/\.js$/, '');
      targets.push({ entry: byId[id] || null, id: id, abs: abs });
    });
  } else {
    flat.forEach(function (e) { if (!opts.units || !opts.units.length || opts.units.some(function (p) { return e.sub.id === p || e.sub.id.indexOf(p + '-') === 0; })) targets.push({ entry: e, id: e.sub.id, abs: path.join(appRoot, e.sub.file) }); });
  }

  targets.forEach(function (tg) {
    const u = { id: tg.id, name: tg.entry ? tg.entry.sub.name : '', file: tg.abs, grade: null, status: 'ok', itemCount: 0, errors: [], warnings: [], info: [], stats: null };
    result.units.push(u);
    if (!tg.entry) {
      u.status = 'error';
      u.errors.push({ level: 'error', rule: '개수', code: 'unknown-id', n: null, index: null, field: null, msg: '카탈로그에 없는 소단원 id 예요: "' + tg.id + '"', fix: '파일 이름을 edu-data/catalog.js 의 id 와 같게 하세요(예: soc-3-2-1-1.js).' });
      return;
    }
    const m = SUBJECT_ID_RE.exec(tg.id);
    if (!m) {
      u.status = 'error';
      u.errors.push({ level: 'error', rule: '개수', code: 'id-format', n: null, index: null, field: null, msg: '소단원 id 모양이 "과목-학년-학기-단원-소단원" 이 아니에요: ' + tg.id, fix: 'id 를 고치세요.' });
      return;
    }
    u.grade = parseInt(m[2], 10);
    if (tg.entry.grade !== u.grade) u.errors.push({ level: 'error', rule: '개수', code: 'grade-mismatch', n: null, index: null, field: null, msg: '파일 id 의 학년(' + u.grade + ')과 카탈로그 학년(' + tg.entry.grade + ')이 달라요.', fix: '카탈로그나 id 를 고치세요.' });

    if (!fs.existsSync(tg.abs)) {
      const miss = { level: opts.allowMissing ? 'info' : 'error', rule: '파일', code: 'missing-file', n: null, index: null, field: null, msg: '문제 파일이 아직 없어요: ' + ((opts.files && opts.files.length) ? displayPath(tg.abs) : tg.entry.sub.file), fix: '이 소단원의 문제 파일(' + CONFIG.expectedCount + '문제)을 만드세요.' };
      u.status = 'missing';
      (opts.allowMissing ? u.info : u.errors).push(miss);
      return;
    }
    const loaded = loadUnitFile(tg.abs, tg.id);
    loaded.issues.forEach(function (x) { (x.level === 'error' ? u.errors : u.warnings).push(x); });
    if (!loaded.ok) { u.status = 'error'; return; }

    let sourceText = null;
    if (opts.sourceDir) {
      const sp = sourceFileFor(tg.entry, opts.sourceDir);
      if (fs.existsSync(sp)) sourceText = fs.readFileSync(sp, 'utf8');
      else {
        u.warnings.push({ level: 'warn', rule: '재서술', code: 'source-missing', n: null, index: null, field: null, msg: '원문 파일을 찾지 못해 재서술 검사를 건너뛰었어요: ' + path.basename(sp), fix: '--source-dir 폴더에 그 파일이 있는지 확인하세요.' });
      }
    }
    const r = validateUnit({ id: tg.id, name: tg.entry.sub.name, count: tg.entry.sub.count, grade: u.grade }, loaded.data, sourceText);
    u.itemCount = r.stats.items;
    u.stats = r.stats;
    u.errors = u.errors.concat(summarize(r.errors));
    u.warnings = u.warnings.concat(summarize(r.warnings));
    u.info = u.info.concat(summarize(r.info));
    u.status = u.errors.length ? 'error' : (u.warnings.length ? 'warn' : 'ok');
  });

  const t = { units: result.units.length, ok: 0, warn: 0, error: 0, missing: 0, errors: 0, warnings: 0 };
  result.units.forEach(function (u) {
    t[u.status]++;
    t.errors += u.errors.length;
    t.warnings += u.warnings.length;
  });
  result.catalogIssues.forEach(function (x) { if (x.level === 'error') t.errors++; else if (x.level === 'warn') t.warnings++; });
  t.sourceChecked = !!opts.sourceDir;
  result.totals = t;
  result.ok = t.errors === 0;
  return result;
}

/* ================================================================
 * 사람이 읽는 보고서
 * ================================================================ */
function whereText(x) {
  const parts = [];
  if (x.n != null) parts.push(x.n + '번');
  else if (x.index != null && x.field !== 'facts') parts.push((x.index + 1) + '번째 항목');
  if (x.field) {
    const m = /^c(\d)$/.exec(x.field);
    if (m) parts.push('보기' + (parseInt(m[1], 10) + 1));
    else if (x.field === 'facts' && x.index != null) parts.push('사실 ' + (x.index + 1) + '번째');
    else parts.push(FIELD_NAME[x.field] || x.field);
  }
  return parts.join(' ') || '전체';
}

function statLine(s) {
  if (!s) return '';
  const used = Object.keys(s.kinds);
  let top = '';
  let topN = 0;
  used.forEach(function (k) { if (s.kinds[k] > topN) { topN = s.kinds[k]; top = k; } });
  return '문항 ' + s.items + ' (OX ' + s.ox + ': O ' + s.oxO + '/X ' + s.oxX + ', 객관식 ' + s.mc + ': 정답 위치 ①' + s.pos[0] + ' ②' + s.pos[1] + ' ③' + s.pos[2] + ' ④' + s.pos[3] + ') · 기법 ' + used.length + '종' + (top ? '(가장 많은 ' + top + ' ' + topN + ')' : '') + ' · 사실당 최대 ' + s.maxPerFact + '문항';
}

function formatReport(result, opts) {
  const o = opts || {};
  const lines = [];
  lines.push('교육용 문제 데이터 검증 - 소단원 ' + result.totals.units + '개 검사' + (result.totals.sourceChecked ? ' (원문 재서술 검사 켬: ' + CONFIG.rephrase.minRun + '자 연속 일치)' : ' (원문 재서술 검사 끔: --source-dir 를 주면 켜져요)'));
  if (result.catalogIssues.length) {
    lines.push('');
    lines.push('■ 카탈로그 (edu-data/catalog.js)');
    result.catalogIssues.forEach(function (x) { pushIssue(lines, x); });
  }
  result.units.forEach(function (u) {
    lines.push('');
    const tag = u.status === 'ok' ? '통과' : u.status === 'warn' ? '경고만' : u.status === 'missing' ? '문제 파일 없음' : '오류 있음';
    lines.push('■ ' + u.id + (u.name ? '  ' + u.name : '') + '  [' + tag + (u.errors.length || u.warnings.length ? ': 오류 ' + u.errors.length + ' / 경고 ' + u.warnings.length : '') + ']');
    if (u.stats && !o.quiet) lines.push('  ' + statLine(u.stats));
    u.errors.forEach(function (x) { pushIssue(lines, x); });
    u.warnings.forEach(function (x) { pushIssue(lines, x); });
    u.info.forEach(function (x) { pushIssue(lines, x); });
  });
  const t = result.totals;
  lines.push('');
  lines.push('==== 요약 ====');
  lines.push('소단원 ' + t.units + '개: 통과 ' + t.ok + ' / 경고만 ' + t.warn + ' / 오류 ' + t.error + ' / 문제 파일 없음 ' + t.missing);
  lines.push('오류 ' + t.errors + '건, 경고 ' + t.warnings + '건 -> ' + (result.ok ? '오류 없음 (종료 코드 0)' : '오류를 모두 고쳐야 해요 (종료 코드 1)'));
  return lines.join('\n');
}

function pushIssue(lines, x) {
  const label = x.level === 'error' ? '[오류]' : x.level === 'warn' ? '[경고]' : '[안내]';
  const w = whereText(x);
  lines.push('  ' + label + '[' + x.rule + '] ' + (w === '전체' ? '' : w + ': ') + x.msg);
  if (x.fix) lines.push('         -> ' + x.fix);
}

/* ================================================================
 * 명령줄
 * ================================================================ */
const USAGE = [
  '사용법: node tools/validate-edu-data.js [옵션]',
  '  --file <경로>...       검사할 소단원 문제 파일(여러 개 가능). 없으면 카탈로그의 소단원 전체',
  '  --unit <id>...         소단원 id 또는 앞부분(예: soc-3-2, soc-5-2-1-1)만 검사',
  '  --source-dir <폴더>    학습지 원문 txt 폴더(재서술 14자 겹침 검사). 파일명: 사회_5-2_1단원(1).txt',
  '  --allow-missing        문제 파일이 없는 것을 오류로 세지 않음',
  '  --json                 결과를 JSON 으로 출력',
  '  --quiet                소단원별 통계 줄을 숨김',
  '종료 코드: 0 오류 없음 / 1 오류 있음 / 2 사용법 오류'
].join('\n');

function parseArgs(argv) {
  const opts = { files: [], units: [], sourceDir: null, json: false, allowMissing: false, quiet: false, help: false };
  let i = 0;
  const takeList = function (list) {
    let n = 0;
    while (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) { list.push(argv[++i]); n++; }
    return n;
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') { if (!takeList(opts.files)) throw new Error('--file 뒤에 파일 경로를 적어 주세요.'); }
    else if (a === '--unit') { if (!takeList(opts.units)) throw new Error('--unit 뒤에 소단원 id 를 적어 주세요.'); }
    else if (a === '--source-dir') { if (i + 1 >= argv.length) throw new Error('--source-dir 뒤에 폴더를 적어 주세요.'); opts.sourceDir = argv[++i]; }
    else if (a === '--json') opts.json = true;
    else if (a === '--allow-missing') opts.allowMissing = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error('알 수 없는 옵션: ' + a);
  }
  return opts;
}

/* cli(argv, io) -> 종료 코드. io = { out(str), err(str) } (시험용으로 바꿀 수 있음) */
function cli(argv, io) {
  const out = (io && io.out) || function (s) { process.stdout.write(s + '\n'); };
  const err = (io && io.err) || function (s) { process.stderr.write(s + '\n'); };
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(e.message); err(USAGE); return 2; }
  if (opts.help) { out(USAGE); return 0; }
  if (opts.sourceDir && !(fs.existsSync(opts.sourceDir) && fs.statSync(opts.sourceDir).isDirectory())) { err('--source-dir 폴더를 찾지 못했어요: ' + opts.sourceDir); return 2; }
  let result;
  try { result = runValidation(opts); } catch (e) { err('검증기 내부 오류: ' + (e && e.stack || e)); return 2; }
  if (opts.units.length && result.units.length === 0) { err('--unit 에 맞는 소단원이 카탈로그에 없어요: ' + opts.units.join(', ')); return 2; }
  out(opts.json ? JSON.stringify(result, null, 2) : formatReport(result, opts));
  return result.ok ? 0 : 1;
}

module.exports = {
  CONFIG: CONFIG, KINDS: KINDS, KIND_FORMAT: KIND_FORMAT, SENSITIVE_WORDS: SENSITIVE_WORDS, HARD_WORDS_LOW: HARD_WORDS_LOW,
  checkItem: checkItem, findSensitive: findSensitive, findHard: findHard, makeCtx: makeCtx, validateUnit: validateUnit, checkCatalog: checkCatalog, flattenCatalog: flattenCatalog,
  loadUnitFile: loadUnitFile, runValidation: runValidation, formatReport: formatReport, parseArgs: parseArgs, cli: cli, sourceFileFor: sourceFileFor
};

if (require.main === module) process.exitCode = cli(process.argv.slice(2));
