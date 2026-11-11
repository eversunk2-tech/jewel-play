/* element-gems-edu — edu.js (교육용: 학습단원 선택 · 문제 팝업 · 출제 풀(bag) · 소단원 파일 지연 로드)
 * spec §21.4.3(데이터·카탈로그·로딩·bag) · §21.5.2(안전) · §21.7.6(문제 풀이 흐름) · §21.9(화면) · §21.10(인터페이스)
 *
 * 구성
 *   1) 순수 로직(EduLogic): 카탈로그 조회, bag, 저장 병합, 로더 — Node(`node --test`)에서 시험한다.
 *   2) 브라우저 연결: 학습단원 선택 화면, 문제 팝업, 시작 화면 단원 칩, window.EduQuiz (game.js 와의 약속).
 *
 * game.js(E1)와의 약속 (window.ElementGemsHost / window.ElementGemsEdu 가 없으면 조용히 건너뛴다)
 *   EduQuiz.ready        선택한 소단원 문제가 불러와졌는가. false 면 game.js 는 ? 선물상자를 만들지 않는다
 *   EduQuiz.ask()        문제 팝업을 띄우고 [계속하기]까지 기다린다 → Promise<{right, bonus}>. 낼 수 없으면 null
 *   EduQuiz.unitLabel()  '5학년 2학기 · 1-(1) 소단원 이름' (unitLabel(true) 이면 이름 없이 짧게)
 *   EduQuiz.summary()    결과 화면용 한 줄('선물상자 문제 3개 중 2개 맞혔어요 · 보너스 +600점'), 문제가 없었으면 ''
 *   EduQuiz.intensity()  선물상자 문제 양 선택('many' 많이 | 'normal' 보통, spec §27.7.6). 저장은 edu.intensity, 효과는 EduQuiz.ready 일 때만 game.js 가 쓴다
 *   ElementGemsEdu.refreshStages()  문제 양을 바꾸거나 단원 불러오기가 끝났을 때 레벨 선택 화면이 보이면 카드·설명판을 다시 그리게 한다(game.js 소관)
 *   이벤트 'stageStart'·'stageEnd'(game.js → ElementGemsHost.on) 로 스테이지별 통계를 센다.
 *
 * 안전: 풀이 기록은 이 기기의 localStorage 에만 남고 서버로 보내지 않는다(§21.5.2). 외부 주소를 부르지 않는다.
 * 저장: element-gems-edu:v1 의 edu:{unit, pool, stats} — 읽고-수정-쓰기(다른 필드 보존).
 */
(function () {
  'use strict';

  /* =====================================================================
   * 설정 (이 파일의 수치는 여기 한 곳에 모은다. 점수 수치는 game.js CONFIG.edu 가 있으면 그쪽을 따른다)
   * ===================================================================== */
  const EDU_UI = {
    storageKey: 'element-gems-edu:v1',      // game.js 와 같은 키(game.js CONFIG.edu.storageKey 가 있으면 그 값)
    chooserKey: 'eg-from-chooser',          // sessionStorage: 모드 선택 화면을 거쳐 왔다는 표시(E3)
    bag: { recentWindow: 6, avoidFirst: 6, stageSameFact: 1 },   // 최근 6문제 같은 f 미룸 · 재섞기 때 직전 6개 앞쪽 제외 · 한 스테이지 같은 f 1번
    quiz: { answerLockMs: 500, continueLockMs: 350, nextGapMs: 0 },  // 열린 직후 0.5초 답 입력 무시 · [계속하기] 오터치 방지
    load: { timeoutMs: 15000, dir: 'edu-data/q/' },                  // 소단원 문제 파일 로드 제한 시간 · 허용 폴더
    bonus: { base: 300, mult: { easy: 0.8, normal: 1.0, hard: 1.3 } },   // 정답 보너스(기본값; game.js CONFIG.edu.bonus 가 있으면 우선)
    intensity: { default: 'many' },         // 선물상자 문제 양 기본값(spec §27.7.6 '많이'; game.js CONFIG.edu.defaultIntensity 가 있으면 그쪽을 따른다)
    statsKeepUnits: 200,                    // 저장하는 소단원 통계·bag 수 상한
    showPages: false                        // 교과서 쪽수 표시(사용자 결정 2026-11-08: 표시하지 않음). 다시 켜려면 true (카탈로그 pages 는 데이터로 남아 있다)
  };

  const OPT_LABEL = ['1', '2', '3', '4'];

  /* =====================================================================
   * 순수 로직
   * ===================================================================== */
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function validId(s) { return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(s); }

  /** Fisher–Yates. rng 는 [0,1) 을 돌려주는 함수(시험에서 고정 시드 주입) */
  function shuffle(arr, rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 섞되, 앞쪽 k칸에 avoid(직전에 낸 번호들)가 오지 않게 뒤로 보낸다. 뒤에 바꿀 칸이 없으면 그대로 둔다 */
  function shuffleAvoid(ns, rng, avoid, k) {
    const a = shuffle(ns, rng);
    const bad = {};
    (avoid || []).forEach(function (n) { bad[n] = true; });
    const front = Math.min(k || 0, a.length);
    for (let i = 0; i < front; i++) {
      if (!bad[a[i]]) continue;
      for (let j = front; j < a.length; j++) {
        if (!bad[a[j]]) { const t = a[i]; a[i] = a[j]; a[j] = t; break; }
      }
    }
    return a;
  }

  /** 문제 한 개가 쓸 수 있는 모양인가(스키마가 어긋난 문제는 건너뛴다) */
  function validItem(it) {
    if (!it || typeof it !== 'object') return false;
    if (!isInt(it.n) || it.n < 1) return false;
    if (typeof it.q !== 'string' || !it.q) return false;
    if (typeof it.f !== 'string' || !it.f) return false;
    if (typeof it.e !== 'string') return false;
    if (it.t === 'ox') return it.a === 0 || it.a === 1;
    if (it.t === 'mc') {
      return Array.isArray(it.c) && it.c.length === 4 && it.c.every(function (x) { return typeof x === 'string' && x; }) && isInt(it.a) && it.a >= 0 && it.a <= 3;
    }
    return false;
  }

  /** 소단원 파일 데이터 → 쓸 수 있는 문제 목록(번호 중복은 앞의 것만). 쓸 문제가 없으면 null */
  function cleanItems(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return null;
    const seen = {};
    const items = [];
    data.items.forEach(function (it) {
      if (!validItem(it) || seen[it.n]) return;
      seen[it.n] = true;
      items.push(it);
    });
    return items.length ? items : null;
  }

  /** bag: { order:[문제 번호…], pos, recent:[f…] }. order 가 현재 문제 번호들의 순열이고 pos 가 범위 안이어야 쓸 수 있다 */
  function bagValid(bag, ns) {
    if (!bag || !Array.isArray(bag.order) || bag.order.length !== ns.length) return false;
    if (!isInt(bag.pos) || bag.pos < 0 || bag.pos > bag.order.length) return false;
    const want = {};
    ns.forEach(function (n) { want[n] = true; });
    const seen = {};
    for (let i = 0; i < bag.order.length; i++) {
      const n = bag.order[i];
      if (!want[n] || seen[n]) return false;
      seen[n] = true;
    }
    return true;
  }

  /**
   * 다음 문제 한 개를 고른다(bag 을 그 자리에서 고친다).
   *  - 60개를 다 쓰기 전에는 반복 없음 / 다 쓰면 다시 섞되 직전 6개는 앞쪽 6칸에 오지 않음
   *  - 최근 6문제 안의 같은 f 는 뒤로 미룸(뒤에서 끌어올림) / 한 스테이지 안에서 같은 f 는 한 번만
   * opts: { stageF: {f: 낸 횟수}(스테이지 안에서 이미 낸 f 를 세는 객체, 호출한 쪽이 스테이지마다 비운다), rng, recentWindow, avoidFirst, stageSameFact }
   */
  function drawFromBag(bag, items, opts) {
    opts = opts || {};
    const cfg = EDU_UI.bag;
    const win = opts.recentWindow || cfg.recentWindow;
    const avoidFirst = opts.avoidFirst == null ? cfg.avoidFirst : opts.avoidFirst;
    const stageMax = opts.stageSameFact == null ? cfg.stageSameFact : opts.stageSameFact;
    if (!items || !items.length) return null;
    const byN = {};
    const ns = items.map(function (it) { byN[it.n] = it; return it.n; });
    if (!Array.isArray(bag.recent)) bag.recent = [];
    if (!bagValid(bag, ns)) {
      bag.order = shuffleAvoid(ns, opts.rng, [], 0);
      bag.pos = 0;
    }
    if (bag.pos >= bag.order.length) {                     // 한 바퀴를 다 썼다 → 다시 섞기(직전에 낸 avoidFirst 개는 앞쪽에서 제외)
      const tail = bag.order.slice(-avoidFirst);
      bag.order = shuffleAvoid(ns, opts.rng, tail, avoidFirst);
      bag.pos = 0;
      bag.held = tail;
    }
    const held = {};
    if (Array.isArray(bag.held) && bag.pos < avoidFirst) bag.held.forEach(function (n) { held[n] = true; });
    else bag.held = [];
    const recent = {};
    bag.recent.slice(-win).forEach(function (f) { recent[f] = true; });
    const stageCount = opts.stageF || {};
    function stageOk(f) { return !(stageCount[f] >= stageMax); }
    // 후보 조건을 엄격한 것부터 한 단계씩 풀면서 현재 자리 뒤에서 처음 맞는 문제를 찾는다
    const tiers = [
      function (it) { return !recent[it.f] && stageOk(it.f) && !held[it.n]; },
      function (it) { return !recent[it.f] && !held[it.n]; },
      function (it) { return !recent[it.f]; },
      function (it) { return !held[it.n]; },
      function () { return true; }
    ];
    let pick = -1;
    for (let t = 0; t < tiers.length && pick < 0; t++) {
      for (let j = bag.pos; j < bag.order.length && pick < 0; j++) {
        if (tiers[t](byN[bag.order[j]])) pick = j;
      }
    }
    if (pick < 0) pick = bag.pos;
    const n = bag.order.splice(pick, 1)[0];
    bag.order.splice(bag.pos, 0, n);                       // 뒤에서 끌어온 문제를 현재 자리로(미뤄진 문제는 한 칸씩 밀림)
    bag.pos += 1;
    const it = byN[n];
    bag.recent.push(it.f);
    while (bag.recent.length > win) bag.recent.shift();
    stageCount[it.f] = (stageCount[it.f] || 0) + 1;
    return it;
  }

  /** 정답 보너스(난이도 배율 적용). cfg 는 { base, mult:{easy,normal,hard} } */
  function bonusFor(level, cfg) {
    const c = cfg && typeof cfg.base === 'number' ? cfg : EDU_UI.bonus;
    const m = c.mult && typeof c.mult[level] === 'number' ? c.mult[level] : 1;
    return Math.round(c.base * m);
  }

  /** 문제 양 값: 'many'(많이) | 'normal'(보통). 없거나 잘못된 값은 기본값(def 가 유효하면 def, 아니면 EDU_UI.intensity.default) */
  function normalizeIntensity(v, def) {
    if (v === 'many' || v === 'normal') return v;
    return def === 'many' || def === 'normal' ? def : EDU_UI.intensity.default;
  }

  /** 저장된 edu 객체를 검증해 새 객체로. 잘못된 값은 모두 기본값. defIntensity = 문제 양 기본값(옛 저장처럼 필드가 없을 때) */
  function normalizeEdu(o, defIntensity) {
    const out = { v: 1, unit: null, intensity: normalizeIntensity(undefined, defIntensity), pool: {}, stats: {} };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    if (validId(o.unit)) out.unit = o.unit;
    out.intensity = normalizeIntensity(o.intensity, defIntensity);
    const keep = EDU_UI.statsKeepUnits;
    if (o.pool && typeof o.pool === 'object' && !Array.isArray(o.pool)) {
      Object.keys(o.pool).slice(0, keep).forEach(function (id) {
        const b = o.pool[id];
        if (!validId(id) || !b || !Array.isArray(b.order) || b.order.length > 500) return;
        if (!b.order.every(function (n) { return isInt(n) && n >= 1; })) return;
        const pos = isInt(b.pos) ? Math.max(0, Math.min(b.order.length, b.pos)) : 0;
        const recent = Array.isArray(b.recent) ? b.recent.filter(function (f) { return typeof f === 'string' && f.length > 0 && f.length <= 24; }).slice(-EDU_UI.bag.recentWindow) : [];
        const held = Array.isArray(b.held) ? b.held.filter(function (n) { return isInt(n) && n >= 1; }).slice(-EDU_UI.bag.avoidFirst) : [];
        out.pool[id] = { order: b.order.slice(), pos: pos, recent: recent, held: held };
      });
    }
    if (o.stats && typeof o.stats === 'object' && !Array.isArray(o.stats)) {
      Object.keys(o.stats).slice(0, keep).forEach(function (id) {
        const s = o.stats[id];
        if (!validId(id) || !s || typeof s !== 'object') return;
        const asked = isInt(s.asked) && s.asked >= 0 ? s.asked : 0;
        const right = isInt(s.right) && s.right >= 0 ? Math.min(s.right, asked) : 0;
        out.stats[id] = { asked: asked, right: right };
      });
    }
    return out;
  }

  /**
   * 저장 문자열(raw)에 edu 만 끼워 넣어 새 문자열을 만든다. 다른 필드(진행·설정 등)는 그대로 보존한다.
   * raw 가 비었거나 깨졌으면 { edu } 만 만든다(게임 쪽 parseSave 가 나머지는 기본값으로 채운다).
   */
  function mergeEduIntoSave(raw, edu) {
    let o = null;
    try { o = typeof raw === 'string' && raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    o.edu = edu;
    return JSON.stringify(o);
  }

  function readEduFromRaw(raw, defIntensity) {
    try {
      const o = typeof raw === 'string' && raw ? JSON.parse(raw) : null;
      return normalizeEdu(o && o.edu, defIntensity);
    } catch (e) { return normalizeEdu(null, defIntensity); }
  }

  /** 문제 양 선택 아래 작은 안내(쉬운 말): 선택은 저장되지만 효과는 문제를 불러온 뒤에만 있다. 효과가 있는 상태면 ''.
   *  st = { skip: 이번 방문만 문제 없이 퍼즐만, unit: 선택한 단원이 있는가, load: 'idle'|'loading'|'ready'|'failed' } */
  function intensityNote(st) {
    if (!st) return '';
    if (st.skip) return '지금은 문제 없이 퍼즐만 하고 있어요. 문제를 쓰면 이 선택이 적용돼요.';
    if (!st.unit) return '단원을 고르면 이 선택이 적용돼요.';
    if (st.load === 'loading') return '문제를 불러오는 중이에요. 다 불러오면 적용돼요.';
    if (st.load === 'failed') return '문제를 불러오지 못해서 지금은 퍼즐만 해요.';
    return '';
  }

  /* ---------- 카탈로그(§21.4.3) ---------- */
  function subjectReady(s) { return !!s && s.ready !== false && Array.isArray(s.grades); }
  function readySubjects(cat) {
    return cat && Array.isArray(cat.subjects) ? cat.subjects.filter(subjectReady) : [];
  }
  function termReady(t) { return !!t && t.ready === true && Array.isArray(t.units) && t.units.length > 0; }
  function gradesOf(subject) { return subject && Array.isArray(subject.grades) ? subject.grades.filter(function (g) { return g && isInt(g.grade); }) : []; }
  function termsOf(subject, grade) {
    const g = gradesOf(subject).filter(function (x) { return x.grade === grade; })[0];
    return g && Array.isArray(g.terms) ? g.terms.filter(function (t) { return t && isInt(t.term); }) : [];
  }
  function unitsOf(subject, grade, term) {
    const t = termsOf(subject, grade).filter(function (x) { return x.term === term; })[0];
    return termReady(t) ? t.units : [];
  }
  /** 카탈로그에서 소단원 id 로 위치를 찾는다 → { subject, grade, term, unit, sub } 또는 null */
  function findSub(cat, id) {
    if (!validId(id)) return null;
    const subjects = readySubjects(cat);
    for (let a = 0; a < subjects.length; a++) {
      const gs = gradesOf(subjects[a]);
      for (let b = 0; b < gs.length; b++) {
        const ts = Array.isArray(gs[b].terms) ? gs[b].terms : [];
        for (let c = 0; c < ts.length; c++) {
          if (!termReady(ts[c])) continue;
          for (let d = 0; d < ts[c].units.length; d++) {
            const u = ts[c].units[d];
            const subs = u && Array.isArray(u.subs) ? u.subs : [];
            for (let e = 0; e < subs.length; e++) {
              if (subs[e] && subs[e].id === id) return { subject: subjects[a], grade: gs[b].grade, term: ts[c].term, unit: u, sub: subs[e] };
            }
          }
        }
      }
    }
    return null;
  }
  /** 고를 수 있는 소단원이 하나라도 있는가 */
  function hasAnySub(cat) {
    return readySubjects(cat).some(function (s) {
      return gradesOf(s).some(function (g) {
        return termsOf(s, g.grade).some(function (t) {
          return termReady(t) && t.units.some(function (u) { return u && Array.isArray(u.subs) && u.subs.length > 0; });
        });
      });
    });
  }
  /** 처음 열 때 기본 칩(저장된 선택이 없을 때): 첫 준비된 과목 → 준비된 학기가 있는 첫 학년 → 그 학기 */
  function defaultChips(cat) {
    const subs = readySubjects(cat);
    for (let a = 0; a < subs.length; a++) {
      const gs = gradesOf(subs[a]);
      for (let b = 0; b < gs.length; b++) {
        const t = termsOf(subs[a], gs[b].grade).filter(termReady)[0];
        if (t) return { subject: subs[a].id, grade: gs[b].grade, term: t.term };
      }
    }
    const s0 = subs[0];
    const g0 = s0 ? gradesOf(s0)[0] : null;
    return { subject: s0 ? s0.id : null, grade: g0 ? g0.grade : null, term: null };
  }

  /** 소단원 요약 글: '5학년 2학기 · 1-(1) 소단원 이름' (short 이면 이름 없이) */
  function unitLabelOf(found, short) {
    if (!found) return '';
    const head = found.grade + '학년 ' + found.term + '학기 · ' + found.unit.no + '-(' + found.sub.no + ')';
    return short ? head : head + ' ' + found.sub.name;
  }
  function pagesText(pages) {
    if (typeof pages !== 'string' || !pages.trim()) return '';
    return '교과서 ' + pages.trim().replace(/\s*[-~–]\s*/, '~') + '쪽';
  }
  function questionId(unitId, n) { return unitId + '-' + String(n).padStart(3, '0'); }
  function statLine(st) {
    if (!st || !(st.asked > 0)) return '';
    return '지금까지 ' + st.asked + '문제 중 ' + st.right + '개 맞혔어요';
  }
  function summaryLine(t) {
    if (!t || !(t.asked > 0)) return '';
    return '선물상자 문제 ' + t.asked + '개 중 ' + t.right + '개 맞혔어요' + (t.bonus > 0 ? ' · 보너스 +' + t.bonus.toLocaleString('ko-KR') + '점' : '');
  }
  function answerText(it) {
    if (it.t === 'ox') return it.a === 1 ? '‘맞아요(O)’' : '‘틀려요(X)’';
    return (it.a + 1) + '번';
  }

  /**
   * 문제 문장의 **강조** 표기를 조각으로 나눈다 → [{ text, strong }]. 별표(**)는 결과에 남지 않는다.
   * 짝이 맞지 않는 ** 는 그냥 지운다(예: '**가장 먼저' → 강조 없음). innerHTML 을 쓰지 않고 호출한 쪽이 텍스트 노드·<strong> 로만 만든다.
   */
  function parseEmphasis(text) {
    const src = typeof text === 'string' ? text : '';
    const parts = src.split('**');
    const out = [];
    const pairs = Math.floor((parts.length - 1) / 2);     // 짝이 맞는 ** 쌍의 수
    parts.forEach(function (seg, i) {
      if (!seg) return;
      const strong = i % 2 === 1 && i <= pairs * 2;       // 닫히지 않은 마지막 조각은 강조하지 않는다
      const last = out[out.length - 1];
      if (last && last.strong === strong) last.text += seg;
      else out.push({ text: seg, strong: strong });
    });
    return out;
  }
  /** 보기·해설에는 ** 를 쓰지 않지만, 혹시 들어 있어도 화면에 별표가 보이지 않게 지운다 */
  function stripStars(text) { return typeof text === 'string' ? text.split('**').join('') : ''; }

  /* ---------- 소단원 파일 지연 로더 ---------- */
  /** 문제 파일 경로가 허용 폴더(edu-data/q/) 안의 .js 한 개인가(외부 주소·상위 폴더 금지) */
  function safeFile(file) {
    if (typeof file !== 'string') return false;
    const dir = EDU_UI.load.dir;
    if (file.indexOf(dir) !== 0) return false;
    return /^[a-z0-9][a-z0-9-]*\.js$/.test(file.slice(dir.length));
  }

  /**
   * env: { inject(src, onload, onerror) → 취소 함수(선택), registry() → EDU_Q 객체, setTimer, clearTimer, timeoutMs }
   * 상태: idle → loading → ready | failed. 이미 불러온 소단원은 캐시(다시 부르지 않음). failed 는 다시 load() 하면 재시도.
   */
  function createLoader(env) {
    const cache = {};
    const setT = env.setTimer || function (f, ms) { return setTimeout(f, ms); };
    const clrT = env.clearTimer || function (h) { clearTimeout(h); };
    const timeoutMs = env.timeoutMs == null ? EDU_UI.load.timeoutMs : env.timeoutMs;

    function fromRegistry(id) {
      let reg = null;
      try { reg = env.registry(); } catch (e) { reg = null; }
      return reg && reg[id] ? cleanItems(reg[id]) : null;
    }
    function status(id) { return cache[id] ? cache[id].status : 'idle'; }
    function items(id) { return cache[id] && cache[id].status === 'ready' ? cache[id].items : null; }

    function load(id, file) {
      const cur = cache[id];
      if (cur && cur.status === 'ready') return Promise.resolve('ready');
      if (cur && cur.status === 'loading') return cur.promise;
      const attempts = cur ? cur.attempts + 1 : 0;
      const ready = fromRegistry(id);
      if (ready) { cache[id] = { status: 'ready', items: ready, attempts: attempts }; return Promise.resolve('ready'); }
      if (!validId(id) || !safeFile(file)) { cache[id] = { status: 'failed', attempts: attempts, why: 'path' }; return Promise.resolve('failed'); }
      const rec = { status: 'loading', attempts: attempts };
      cache[id] = rec;
      rec.promise = new Promise(function (resolve) {
        let done = false;
        let timer = null;
        let cancel = null;
        function finish(ok, why) {
          if (done) return;
          done = true;
          if (timer != null) clrT(timer);
          if (!ok && typeof cancel === 'function') { try { cancel(); } catch (e) { /* 무시 */ } }
          if (ok) { rec.status = 'ready'; rec.items = ok; } else { rec.status = 'failed'; rec.why = why || 'load'; }
          resolve(rec.status);
        }
        timer = setT(function () { finish(null, 'timeout'); }, timeoutMs);
        try {
          cancel = env.inject(attempts > 0 ? file + '?r=' + attempts : file, function () {
            const got = fromRegistry(id);
            finish(got, got ? '' : 'bad-data');
          }, function () { finish(null, 'error'); });
        } catch (e) { finish(null, 'inject'); }
      });
      return rec.promise;
    }
    return { load: load, status: status, items: items, why: function (id) { return cache[id] && cache[id].why || ''; } };
  }

  /* =====================================================================
   * 시험용 내보내기 (브라우저에서는 module 이 없어 무시된다)
   * ===================================================================== */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EDU_UI: EDU_UI, shuffle: shuffle, shuffleAvoid: shuffleAvoid, validItem: validItem, cleanItems: cleanItems, bagValid: bagValid,
      drawFromBag: drawFromBag, bonusFor: bonusFor, normalizeEdu: normalizeEdu, mergeEduIntoSave: mergeEduIntoSave, readEduFromRaw: readEduFromRaw,
      readySubjects: readySubjects, gradesOf: gradesOf, termsOf: termsOf, unitsOf: unitsOf, termReady: termReady, findSub: findSub, hasAnySub: hasAnySub,
      defaultChips: defaultChips, unitLabelOf: unitLabelOf, pagesText: pagesText, questionId: questionId, statLine: statLine, summaryLine: summaryLine,
      answerText: answerText, parseEmphasis: parseEmphasis, stripStars: stripStars, safeFile: safeFile, createLoader: createLoader,
      normalizeIntensity: normalizeIntensity, intensityNote: intensityNote
    };
  }
  if (typeof document === 'undefined') return;

  /* =====================================================================
   * 브라우저 연결
   * ===================================================================== */
  const host = window.ElementGemsHost || null;
  const $ = function (id) { return document.getElementById(id); };
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 점수 수치는 game.js CONFIG.edu 가 있으면 그것을 쓴다 */
  function gameCfg() { return (host && host.CONFIG && host.CONFIG.edu) || null; }
  function storageKey() { const g = gameCfg(); return g && typeof g.storageKey === 'string' && g.storageKey ? g.storageKey : EDU_UI.storageKey; }
  function bonusCfg() { const g = gameCfg(); return g && g.bonus && typeof g.bonus.base === 'number' ? g.bonus : EDU_UI.bonus; }
  function defaultIntensity() { const g = gameCfg(); return g && (g.defaultIntensity === 'many' || g.defaultIntensity === 'normal') ? g.defaultIntensity : EDU_UI.intensity.default; }

  /** 지금 하는 난이도(easy/normal/hard). ElementGemsEdu.state().level → 저장된 선택 → normal */
  function currentLevel() {
    try {
      const st = window.ElementGemsEdu && window.ElementGemsEdu.state && window.ElementGemsEdu.state();
      if (st && typeof st.level === 'string') return st.level;
    } catch (e) { /* 무시 */ }
    try { const sv = host && host.getSave && host.getSave(); if (sv && typeof sv.level === 'string') return sv.level; } catch (e) { /* 무시 */ }
    return 'normal';
  }

  /** 정답 보너스: game.js 의 규칙(ElementGemsEdu.bonusFor)이 있으면 그것을, 없으면 같은 규칙으로 직접 계산 */
  function bonusNow() {
    const lv = currentLevel();
    try {
      const g = window.ElementGemsEdu;
      if (g && typeof g.bonusFor === 'function') {
        const v = g.bonusFor(lv);
        if (typeof v === 'number' && isFinite(v) && v >= 0) return v;
      }
    } catch (e) { /* 직접 계산 */ }
    return bonusFor(lv, bonusCfg());
  }

  const catalog = function () { return window.EDU_CATALOG || null; };
  const store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  /* ---------- 상태 ---------- */
  let edu = readEduFromRaw(store.get(storageKey()), defaultIntensity());      // { unit, intensity, pool, stats }
  let skipQuiz = false;                                    // 이번 방문만 '문제 없이 퍼즐만' (저장하지 않음)
  let stageF = {};                                         // 이번 스테이지에서 이미 낸 f
  let tally = { asked: 0, right: 0, bonus: 0, closed: false };   // 이번 스테이지 문제 풀이
  let inited = false;

  const loader = createLoader({
    registry: function () { return window.EDU_Q; },
    inject: function (src, onload, onerror) {
      const s = document.createElement('script');
      s.async = true;
      s.onload = function () { onload(); };
      s.onerror = function () { onerror(); };
      s.src = src;
      document.head.appendChild(s);
      return function () { if (s.parentNode) s.parentNode.removeChild(s); };
    }
  });

  /** edu 를 게임 저장 객체에 붙이고(game.js 가 나중에 저장해도 edu 가 사라지지 않게) 저장한다. 게임 저장을 못 쓰면 읽고-수정-쓰기 */
  function persist() {
    let ok = false;
    try {
      const sv = host && host.getSave && host.getSave();
      if (sv && typeof sv === 'object' && host.writeSave) { sv.edu = edu; host.writeSave(); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) store.set(storageKey(), mergeEduIntoSave(store.get(storageKey()), edu));
  }
  function attachToSave() {
    try { const sv = host && host.getSave && host.getSave(); if (sv && typeof sv === 'object') sv.edu = edu; } catch (e) { /* 무시 */ }
  }

  function selectedFound() { return edu.unit ? findSub(catalog(), edu.unit) : null; }
  function unitStatus() { return edu.unit ? loader.status(edu.unit) : 'idle'; }
  function loadSelected() {
    const f = selectedFound();
    if (!f) return Promise.resolve('none');
    const p = loader.load(edu.unit, f.sub.file);
    renderIntensity();     // 불러오는 중이면 문제 양 선택 아래 안내를 바로 보인다
    return p.then(function (st) { renderUnitCard(); refreshGameStages(); return st; });     // 불러오기가 끝나면 레벨 선택 화면이 보일 때 카드·설명판을 다시 그린다(문제가 준비되면 '많이' 표가 적용된다)
  }

  /* ---------- 출제 ---------- */
  function drawNext() {
    const id = edu.unit;
    const items = id ? loader.items(id) : null;
    if (!items) return null;
    const bag = edu.pool[id] || (edu.pool[id] = { order: [], pos: 0, recent: [] });
    const it = drawFromBag(bag, items, { stageF: stageF });
    persist();
    return it ? { unit: id, item: it } : null;
  }
  function recordAnswer(unitId, right, bonus) {
    const s = edu.stats[unitId] || (edu.stats[unitId] = { asked: 0, right: 0 });
    s.asked += 1;
    if (right) s.right += 1;
    if (tally.closed) tally = { asked: 0, right: 0, bonus: 0, closed: false };
    tally.asked += 1;
    if (right) { tally.right += 1; tally.bonus += bonus; }
    persist();
  }

  /* =====================================================================
   * 문제 팝업
   * ===================================================================== */
  const quiz = { open: false, queue: Promise.resolve(), cur: null, prevFocus: null };

  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function setBackgroundInert(on) {
    ['app', 'cutin'].forEach(function (id) {
      const n = $(id);
      if (!n) return;
      if ('inert' in n) n.inert = on;
      else if (on) n.setAttribute('aria-hidden', 'true');
      else n.removeAttribute('aria-hidden');
    });
  }
  function dialogButtons() {
    const dlg = $('eg-quiz');
    return [].slice.call(dlg.querySelectorAll('button')).filter(function (b) { return !b.disabled && !b.hidden && b.offsetParent !== null; });
  }

  function showQuiz(draw) {
    return new Promise(function (resolve) {
      const it = draw.item;
      const found = findSub(catalog(), draw.unit);
      const overlay = $('eg-quiz');
      const qText = $('eg-q-text');
      const opts = $('eg-q-opts');
      const result = $('eg-q-result');
      const next = $('eg-q-next');
      const cur = { answered: false, finished: false, right: false, bonus: 0, openedAt: Date.now(), doneAt: 0, resolve: resolve };
      quiz.cur = cur;
      quiz.open = true;
      quiz.prevFocus = document.activeElement;

      $('eg-q-meta').textContent = unitLabelOf(found, false);
      clear(qText);
      parseEmphasis(it.q).forEach(function (seg) {          // **강조** 는 <strong>(굵게 + 밑줄 + 색), 텍스트 노드만 쓴다
        if (seg.strong) qText.appendChild(mk('strong', 'eg-em', seg.text));
        else qText.appendChild(document.createTextNode(seg.text));
      });
      $('eg-q-id').textContent = '문제 번호 ' + questionId(draw.unit, it.n);
      clear(opts);
      clear(result);
      next.hidden = true;
      overlay.dataset.type = it.t;
      opts.className = 'eg-quiz-opts ' + (it.t === 'ox' ? 'is-ox' : 'is-mc');

      const labels = it.t === 'ox' ? ['맞아요', '틀려요'] : it.c.map(stripStars);
      const btns = labels.map(function (txt, i) {
        const b = mk('button', 'eg-opt' + (it.t === 'ox' ? (i === 0 ? ' o' : ' x') : ''));
        b.type = 'button';
        b.dataset.i = String(i);
        const mark = mk('i', '', it.t === 'ox' ? (i === 0 ? 'O' : 'X') : OPT_LABEL[i]);
        mark.setAttribute('aria-hidden', 'true');
        const t = mk('span', 'eg-opt-t', txt);
        const tag = mk('em', 'eg-opt-tag');
        b.appendChild(mark);
        b.appendChild(t);
        b.appendChild(tag);
        b.setAttribute('aria-label', (it.t === 'ox' ? (i === 0 ? 'O ' : 'X ') : (i + 1) + '번 ') + txt);
        opts.appendChild(b);
        return b;
      });

      function choose(i) {
        if (cur.answered || cur.finished) return;
        if (Date.now() - cur.openedAt < EDU_UI.quiz.answerLockMs) return;      // 열린 직후 0.5초는 답 입력 무시(연타 방지)
        const correct = it.t === 'ox' ? (it.a === 1 ? 0 : 1) : it.a;           // ox: a=1 이 O(첫 버튼)
        cur.answered = true;
        cur.right = i === correct;
        cur.bonus = cur.right ? bonusNow() : 0;
        cur.doneAt = Date.now();
        recordAnswer(draw.unit, cur.right, cur.bonus);
        btns.forEach(function (b, k) {
          b.disabled = true;
          b.classList.add(k === correct ? 'right' : (k === i ? 'mine-wrong' : 'dim'));
          const tag = b.querySelector('.eg-opt-tag');
          if (k === correct) { tag.textContent = '정답'; b.setAttribute('aria-label', b.getAttribute('aria-label') + ' 정답'); }
          else if (k === i) { tag.textContent = '내가 고른 답'; b.setAttribute('aria-label', b.getAttribute('aria-label') + ' 내가 고른 답'); }
        });
        const fb = mk('p', 'eg-quiz-fb ' + (cur.right ? 'ok' : 'no'));
        const ic = mk('b', '', cur.right ? '✓' : '!');
        ic.setAttribute('aria-hidden', 'true');
        fb.appendChild(ic);
        fb.appendChild(mk('span', '', cur.right ? '정답이에요! 보너스 +' + cur.bonus.toLocaleString('ko-KR') + '점' : '아쉬워요. 정답은 ' + answerText(it) + '이에요.'));
        const ex = mk('p', 'eg-quiz-exp');
        ex.appendChild(mk('small', '', '해설'));
        ex.appendChild(document.createTextNode(stripStars(it.e)));
        result.appendChild(fb);
        result.appendChild(ex);
        overlay.classList.add('answered');
        next.hidden = false;
        try { next.focus({ preventScroll: false }); } catch (e) { next.focus(); }          // 답을 고르면 [계속하기]로 포커스(해설 읽은 뒤 Enter)
      }
      function finish() {
        if (!cur.answered || cur.finished) return;
        if (Date.now() - cur.doneAt < EDU_UI.quiz.continueLockMs) return;       // 같은 키·터치가 곧바로 [계속하기]까지 누르는 것을 막는다
        closeQuiz(cur, { right: cur.right, bonus: cur.bonus });
      }
      cur.choose = choose;
      cur.finish = finish;
      cur.btns = btns;

      opts.onclick = function (e) {
        const b = e.target.closest && e.target.closest('.eg-opt');
        if (b && opts.contains(b)) choose(parseInt(b.dataset.i, 10));
      };
      next.onclick = finish;

      overlay.classList.remove('answered');
      overlay.hidden = false;
      setBackgroundInert(true);
      overlay.scrollTop = 0;
      const dlg = overlay.querySelector('.eg-quiz');
      dlg.scrollTop = 0;
      window.setTimeout(function () { try { qText.focus({ preventScroll: true }); } catch (e) { qText.focus(); } }, 0);   // 열릴 때 문제 문장에 포커스
    });
  }

  function closeQuiz(cur, res) {
    if (!cur || cur.finished) return;
    cur.finished = true;
    const overlay = $('eg-quiz');
    overlay.hidden = true;
    overlay.classList.remove('answered');
    $('eg-q-opts').onclick = null;
    $('eg-q-next').onclick = null;
    clear($('eg-q-opts'));
    clear($('eg-q-result'));
    setBackgroundInert(false);
    quiz.open = false;
    quiz.cur = null;
    const pf = quiz.prevFocus;
    quiz.prevFocus = null;
    window.setTimeout(function () {
      try { if (pf && pf.focus && document.body.contains(pf) && pf.offsetParent !== null) pf.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
    }, 0);
    cur.resolve(res);
  }

  /** 팝업이 열려 있는 동안의 키보드: O/X · 1~4 로 답, Enter/Space 로 계속, Tab 은 팝업 안에서만, Escape 는 무시. 게임에는 키를 넘기지 않는다 */
  function onQuizKey(e) {
    if (!quiz.open || !quiz.cur) return;
    const cur = quiz.cur;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code || '';
    const key = e.key || '';
    if (key === 'Tab') {
      e.preventDefault();
      const list = dialogButtons();
      const q = $('eg-q-text');
      if (!list.length) { q.focus(); return; }
      const i = list.indexOf(document.activeElement);
      let n;
      if (e.shiftKey) n = i <= 0 ? list.length - 1 : i - 1;
      else n = i < 0 || i === list.length - 1 ? 0 : i + 1;
      list[n].focus();
      return;
    }
    if (key === 'Escape') { e.preventDefault(); return; }
    const enterOrSpace = key === 'Enter' || key === ' ' || code === 'Space' || code === 'Enter';
    if (cur.answered) {
      if (enterOrSpace) { e.preventDefault(); if (!e.repeat) cur.finish(); }          // Enter/Space = 계속하기(꾹 눌러도 한 번만)
      return;
    }
    if (enterOrSpace && e.target && e.target.classList && e.target.classList.contains('eg-opt')) {   // 포커스가 보기에 있을 때 Enter/Space = 그 보기 고르기
      e.preventDefault();
      if (!e.repeat) cur.choose(parseInt(e.target.dataset.i, 10));
      return;
    }
    if (e.repeat) return;
    const count = cur.btns.length;
    let idx = -1;
    const digit = /^Digit([1-4])$|^Numpad([1-4])$/.exec(code);
    if (digit) idx = parseInt(digit[1] || digit[2], 10) - 1;
    else if (/^[1-4]$/.test(key)) idx = parseInt(key, 10) - 1;
    else if (count === 2) {
      if (code === 'KeyO' || key === 'o' || key === 'O' || key === 'ㅐ') idx = 0;       // 한글 자판에서도 같은 키로 눌리게 code 도 본다
      else if (code === 'KeyX' || key === 'x' || key === 'X' || key === 'ㅌ') idx = 1;
    }
    if (idx >= 0 && idx < count) { e.preventDefault(); cur.choose(idx); }
  }

  /** 문제 한 개. 낼 수 없으면 null. 팝업이 이미 열려 있으면 앞 문제가 끝난 뒤에 이어서 연다 */
  function ask() {
    if (!ready()) return null;
    const run = function () {
      const draw = drawNext();
      if (!draw) return { right: false, bonus: 0, skipped: true };
      return showQuiz(draw);
    };
    const p = quiz.queue.then(run, run);
    quiz.queue = p.then(function () { /* 다음 문제 대기 */ }, function () { /* 무시 */ });
    return p;
  }
  function cancelQuiz() {
    if (quiz.cur && !quiz.cur.finished) closeQuiz(quiz.cur, { right: false, bonus: 0, cancelled: true });
  }

  /* =====================================================================
   * 선물상자 문제 양 "보통 / 많이" (spec §27.7.6) — 학습단원 선택 화면의 라디오 두 개 + 시작 화면 단원 칩의 한 줄
   * 누르는 즉시 저장(edu.intensity)하고 레벨 선택 화면이 보이면 카드를 다시 그리게 한다. 효과는 문제가 준비된 뒤에만 있다(안내 줄).
   * ===================================================================== */
  const AMOUNT_LABEL = { many: '많이', normal: '보통' };
  const AMOUNT_ORDER = ['normal', 'many'];

  function intensityNow() { return normalizeIntensity(edu.intensity, defaultIntensity()); }

  /** 레벨 선택 화면이 보이면 카드·설명판을 다시 그리게 한다(game.js 소관, 없으면 조용히 건너뜀) */
  function refreshGameStages() {
    try { const g = window.ElementGemsEdu; if (g && typeof g.refreshStages === 'function') g.refreshStages(); } catch (e) { /* 무시 */ }
  }

  function renderIntensity() {
    const v = intensityNow();
    const line = $('eg-unit-amount');
    if (line) { line.textContent = '선물상자 문제: ' + AMOUNT_LABEL[v]; line.hidden = false; }
    const grp = $('eg-amount');
    if (!grp) return;
    [].slice.call(grp.querySelectorAll('.eg-amt')).forEach(function (b) {
      const on = b.dataset.v === v;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('on', on);
    });
    const note = $('eg-amount-note');
    if (note) {
      const t = intensityNote({ skip: skipQuiz, unit: !!selectedFound(), load: unitStatus() });
      note.textContent = t;
      note.hidden = !t;
    }
  }

  function setIntensity(v, focus) {
    if (v !== 'many' && v !== 'normal') return;
    const changed = intensityNow() !== v || edu.intensity !== v;
    edu.intensity = v;
    if (changed) persist();
    renderIntensity();
    if (focus) { const b = $('eg-amt-' + v); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } } }
    if (changed) refreshGameStages();
  }

  /** 라디오 키보드: ←/↑ 앞으로, →/↓ 뒤로(끝에서 돌아옴), Home/End 처음·끝 — 옮기면서 선택한다. Space/Enter 는 단추 기본 동작(클릭)이 선택한다 */
  function onAmountKey(e) {
    const k = e.key;
    let i = AMOUNT_ORDER.indexOf(intensityNow());
    const f = e.target && e.target.dataset && e.target.dataset.v;
    if (f && AMOUNT_ORDER.indexOf(f) >= 0) i = AMOUNT_ORDER.indexOf(f);
    let n = -1;
    if (k === 'ArrowRight' || k === 'ArrowDown') n = (i + 1) % AMOUNT_ORDER.length;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') n = (i + AMOUNT_ORDER.length - 1) % AMOUNT_ORDER.length;
    else if (k === 'Home') n = 0;
    else if (k === 'End') n = AMOUNT_ORDER.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setIntensity(AMOUNT_ORDER[n], true);
  }

  function bindAmount() {
    const grp = $('eg-amount');
    if (!grp) return;
    grp.addEventListener('click', function (e) {
      const b = e.target && e.target.closest ? e.target.closest('.eg-amt') : null;
      if (b && grp.contains(b)) setIntensity(b.dataset.v, false);
    });
    grp.addEventListener('keydown', onAmountKey);
  }

  /* =====================================================================
   * 시작 화면 단원 칩 · 학습단원 선택 화면
   * ===================================================================== */
  const pick = { subject: null, grade: null, term: null, unit: null, fromGate: false, busy: false, failed: false };

  function renderUnitCard() {
    const card = $('eg-unit-card');
    if (!card) return;
    const cat = catalog();
    const usable = hasAnySub(cat);
    const f = selectedFound();
    const label = $('eg-unit-label');
    const stat = $('eg-unit-stat');
    const warn = $('eg-unit-warn');
    const btn = $('eg-unit-btn');
    btn.hidden = !usable;
    if (!usable) {
      label.textContent = '문제를 아직 준비하지 못했어요. 퍼즐은 그대로 할 수 있어요.';
      stat.hidden = true; warn.hidden = true;
      return;
    }
    label.textContent = f ? unitLabelOf(f) : '아직 단원을 고르지 않았어요';
    card.classList.toggle('empty', !f);
    renderIntensity();
    const line = f ? statLine(edu.stats[edu.unit]) : '';
    stat.textContent = line;
    stat.hidden = !line;
    const st = unitStatus();
    let w = '';
    if (f && st === 'loading') w = '문제를 불러오는 중이에요…';
    else if (f && st === 'failed') w = '이 단원 문제를 불러오지 못했어요. 퍼즐은 그대로 할 수 있어요.';
    warn.textContent = w;
    warn.hidden = !w;
    warn.classList.toggle('err', st === 'failed');
  }

  function curSubject() {
    const subs = readySubjects(catalog());
    return subs.filter(function (s) { return s.id === pick.subject; })[0] || subs[0] || null;
  }
  function pickList() {
    const s = curSubject();
    return s ? unitsOf(s, pick.grade, pick.term) : [];
  }
  function inCurrentList(id) {
    if (!id) return false;
    return pickList().some(function (u) { return (u.subs || []).some(function (sb) { return sb.id === id; }); });
  }

  function normalizePickChips() {
    const subs = readySubjects(catalog());
    if (!subs.length) return;
    let s = subs.filter(function (x) { return x.id === pick.subject; })[0];
    if (!s) { s = subs[0]; pick.subject = s.id; }
    const gs = gradesOf(s);
    if (!gs.some(function (g) { return g.grade === pick.grade; })) pick.grade = gs.length ? gs[0].grade : null;
    const ts = termsOf(s, pick.grade);
    const ok = ts.filter(function (t) { return t.term === pick.term && termReady(t); })[0];
    if (!ok) {
      const first = ts.filter(termReady)[0] || ts[0];
      pick.term = first ? first.term : null;
    }
  }

  function chipBtn(label, on, extra) {
    const b = mk('button', 'eg-chip' + (on ? ' on' : '') + (extra && extra.off ? ' off' : ''));
    b.type = 'button';
    b.appendChild(document.createTextNode(label));
    if (extra && extra.sub) b.appendChild(mk('small', '', extra.sub));
    if (extra && extra.off) b.setAttribute('aria-disabled', 'true');
    else b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (extra && extra.off) b.setAttribute('aria-label', label + ' ' + (extra.sub || '준비 중'));
    Object.keys((extra && extra.data) || {}).forEach(function (k) { b.dataset[k] = extra.data[k]; });
    return b;
  }
  function chipGroup(title, id, buttons) {
    const wrap = mk('div', 'eg-chipgroup');
    const lab = mk('span', 'eg-label', title);
    lab.id = 'eg-lab-' + id;
    const row = mk('div', 'eg-chips');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-labelledby', lab.id);
    buttons.forEach(function (b) { row.appendChild(b); });
    wrap.appendChild(lab);
    wrap.appendChild(row);
    return wrap;
  }

  function renderPicker() {
    const side = $('eg-pick-side');
    const list = $('eg-pick-list');
    const subs = readySubjects(catalog());
    normalizePickChips();
    const subj = curSubject();
    clear(side);
    clear(list);
    if (!subj) {
      list.appendChild(mk('p', 'eg-note', '준비된 단원이 아직 없어요.'));
      $('eg-pick-ok').disabled = true;
      return;
    }
    side.appendChild(chipGroup('과목', 'subject', subs.map(function (s) {
      return chipBtn(s.name || s.id, s.id === subj.id, { data: { k: 'subject', v: s.id } });
    })));
    side.appendChild(chipGroup('학년', 'grade', gradesOf(subj).map(function (g) {
      return chipBtn(g.grade + '학년', g.grade === pick.grade, { data: { k: 'grade', v: String(g.grade) } });
    })));
    side.appendChild(chipGroup('학기', 'term', termsOf(subj, pick.grade).map(function (t) {
      const ok = termReady(t);
      return ok ? chipBtn(t.term + '학기', t.term === pick.term, { data: { k: 'term', v: String(t.term) } })
        : chipBtn(t.term + '학기', false, { off: true, sub: '준비 중', data: { k: 'term', v: String(t.term) } });
    })));
    side.appendChild(mk('p', 'eg-note', '다른 과목과 1학기는 준비 중이에요. 문제가 더 생기면 여기에 나타나요.'));

    const units = pickList();
    $('eg-pick-hint').textContent = '단원을 골라요 (' + (pick.grade || '') + '학년 ' + (pick.term || '') + '학기 ' + (subj.name || '') + ')';
    if (!units.length) list.appendChild(mk('p', 'eg-note', '이 학기는 아직 준비 중이에요.'));
    units.forEach(function (u) {
      const h = mk('h3', 'eg-unit-h', u.no + '단원 · ' + u.name);
      list.appendChild(h);
      (u.subs || []).forEach(function (sb) {
        const on = sb.id === pick.unit;
        const b = mk('button', 'eg-sub' + (on ? ' on' : ''));
        b.type = 'button';
        b.dataset.id = sb.id;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.appendChild(mk('b', '', u.no + '-(' + sb.no + ')'));
        const sp = mk('span', '', sb.name);
        const meta = [EDU_UI.showPages ? pagesText(sb.pages) : '', isInt(sb.count) ? '문제 ' + sb.count + '개' : ''].filter(Boolean).join(' · ');   // 쪽수는 EDU_UI.showPages 가 true 일 때만
        if (meta) sp.appendChild(mk('em', '', meta));
        b.appendChild(sp);
        b.setAttribute('aria-label', u.no + '단원 ' + sb.no + '번 ' + sb.name + (meta ? ', ' + meta : ''));      // 선택 여부는 aria-pressed 가 알린다
        list.appendChild(b);
      });
    });
    updatePickButtons();
  }

  function updatePickButtons() {
    const ok = $('eg-pick-ok');
    const can = inCurrentList(pick.unit);
    ok.disabled = !can || pick.busy;
    ok.textContent = pick.busy ? '문제를 불러오는 중…' : '이 단원으로 정했어요';
    $('eg-pick-skip').hidden = !pick.failed;
  }
  function setPickMsg(text, isErr) {
    const m = $('eg-pick-msg');
    m.textContent = text || '';
    m.hidden = !text;
    m.classList.toggle('err', !!isErr);
  }

  function hideAllScreens() {
    [].slice.call(document.querySelectorAll('.screen')).forEach(function (s) { s.hidden = true; });
  }
  function pickerVisible() { const s = $('screen-edu-pick'); return !!s && !s.hidden; }

  function openPicker(fromGate) {
    if (!hasAnySub(catalog())) return;
    pick.fromGate = !!fromGate;
    pick.busy = false;
    pick.failed = false;
    const f = selectedFound();
    if (f) { pick.subject = f.subject.id; pick.grade = f.grade; pick.term = f.term; pick.unit = edu.unit; }
    else { const d = defaultChips(catalog()); pick.subject = d.subject; pick.grade = d.grade; pick.term = d.term; pick.unit = null; }
    setPickMsg('', false);
    renderPicker();
    renderIntensity();
    hideAllScreens();
    $('screen-edu-pick').hidden = false;
    window.scrollTo(0, 0);
    ['eg-pick-body', 'eg-pick-side', 'eg-pick-list'].forEach(function (id) { const n = $(id); if (n) n.scrollTop = 0; });
    const t = $('eg-pick-title');
    try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
    const sel = $('eg-pick-list').querySelector('.eg-sub.on');      // 이미 고른 단원이 있으면 보이는 자리까지 목록만 스크롤
    if (sel && sel.scrollIntoView) { try { sel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 무시 */ } }
  }
  function closePicker(thenStart) {
    $('screen-edu-pick').hidden = true;
    if (host && host.goHome) host.goHome();
    else $('screen-start').hidden = false;
    window.scrollTo(0, 0);
    renderUnitCard();
    if (thenStart) window.setTimeout(function () { const b = $('btn-start'); if (b) b.click(); }, 0);   // 시작을 눌러서 온 경우: 단원을 고른 뒤 이어서 시작
    else { const b = $('eg-unit-btn'); if (b && !b.hidden) { try { b.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } } }
  }

  function confirmPick() {
    if (pick.busy || !inCurrentList(pick.unit)) return;
    edu.unit = pick.unit;
    skipQuiz = false;
    persist();
    refreshGameStages();     // 단원을 바꾸면 새 단원 문제가 준비될 때까지는 '보통' 표다 — 레벨 선택 화면이 보이면 다시 그린다
    pick.busy = true;
    pick.failed = false;
    setPickMsg('', false);
    updatePickButtons();
    const f = selectedFound();
    renderUnitCard();
    const loading = loader.load(edu.unit, f.sub.file);
    renderIntensity();
    loading.then(function (st) {
      pick.busy = false;
      renderUnitCard();
      refreshGameStages();
      if (!pickerVisible()) return;
      if (st === 'ready') { closePicker(pick.fromGate); return; }
      pick.failed = true;
      setPickMsg('이 단원 문제를 불러오지 못했어요. 다시 해 보거나, 문제 없이 퍼즐만 할 수도 있어요.', true);
      updatePickButtons();
    });
  }
  function playWithoutQuiz() {
    skipQuiz = true;
    pick.failed = false;
    refreshGameStages();     // 이번 방문은 문제 없이 퍼즐만 — '보통' 표로 돌아간다
    closePicker(pick.fromGate);
  }

  function bindPicker() {
    $('eg-pick-back').addEventListener('click', function () { closePicker(false); });
    $('eg-pick-ok').addEventListener('click', confirmPick);
    $('eg-pick-skip').addEventListener('click', playWithoutQuiz);
    bindAmount();
    $('eg-unit-btn').addEventListener('click', function () { if (host && host.getPhase && host.getPhase() !== 'start') return; openPicker(false); });
    $('eg-pick-side').addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.eg-chip');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const k = b.dataset.k;
      const v = b.dataset.v;
      if (k === 'subject') { pick.subject = v; }
      else if (k === 'grade') { pick.grade = parseInt(v, 10); }
      else if (k === 'term') { pick.term = parseInt(v, 10); }
      else return;
      normalizePickChips();
      if (!inCurrentList(pick.unit)) pick.unit = inCurrentList(edu.unit) ? edu.unit : null;
      pick.failed = false;
      setPickMsg('', false);
      renderPicker();
      const again = $('eg-pick-side').querySelector('.eg-chip[data-k="' + k + '"][data-v="' + v + '"]');
      if (again) { try { again.focus({ preventScroll: true }); } catch (err) { /* 무시 */ } }
    });
    $('eg-pick-list').addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.eg-sub');
      if (!b) return;
      pick.unit = b.dataset.id;
      pick.failed = false;
      setPickMsg('', false);
      renderPicker();
      const again = $('eg-pick-list').querySelector('.eg-sub[data-id="' + pick.unit + '"]');
      if (again) { try { again.focus({ preventScroll: true }); } catch (err) { /* 무시 */ } }
    });
  }

  /* ---------- [시작] 게이트: 소단원이 없거나 불러오기에 실패했으면 선택 화면이 먼저 열린다(§21.4.3) ---------- */
  function startGate() {
    if (!hasAnySub(catalog())) return true;                  // 문제 목록이 없으면 일반 퍼즐처럼 진행
    if (skipQuiz) return true;
    const f = selectedFound();
    if (!f) { openPicker(true); return false; }
    const st = unitStatus();
    if (st === 'failed') {
      openPicker(true);
      pick.failed = true;
      setPickMsg('이 단원 문제를 불러오지 못했어요. 다시 골라 보거나, 문제 없이 퍼즐만 할 수도 있어요.', true);
      updatePickButtons();
      return false;
    }
    if (st === 'idle') loadSelected();
    return true;                                             // 불러오는 중이어도 시작(다 불러오면 ?가 나오기 시작한다)
  }

  /* 한 화면 슬롯뿐인 game.js 의 시작 게이트에 ranking-ui.js 의 게이트가 뒤따르도록 이어 붙인다 */
  function installGate() {
    if (!host || !host.setStartGate) return;
    let inner = null;
    const original = host.setStartGate;
    host.setStartGate = function (fn) { inner = typeof fn === 'function' ? fn : null; };
    original(function (kind) {
      // spec §46.9(최고점 도전): 도전 판은 문제·학습 단원을 쓰지 않으므로 단원 선택 게이트(startGate)를 건너뛰고 프로필 안내(inner)만 거친다.
      // kind 는 ranking-ui.js 의 게이트에 그대로 넘긴다(프로필 안내 팝업이 끝난 뒤 이어갈 곳을 기억하려고). [시작]은 kind 가 없어 이전과 같다
      if (kind === 'challenge') return inner ? inner(kind) : true;
      let go = true;
      try { go = startGate() !== false; } catch (e) { go = true; }
      if (!go) return false;
      return inner ? inner(kind) : true;
    });
  }

  /** 결과 화면 한 줄(#end-quiz). game.js 가 stageEnd 로 넘겨 주는 summary 가 있으면 그것을, 없으면 이 파일이 센 값을 쓴다 */
  function renderResultLine(text) {
    const n = $('end-quiz');
    if (!n) return;
    const line = typeof text === 'string' ? text : summaryLine(tally);
    n.textContent = line;
    n.hidden = !line;
  }

  /* =====================================================================
   * 공개 인터페이스 (game.js 와의 약속, §21.10)
   * ===================================================================== */
  function ready() {
    if (skipQuiz || !edu.unit) return false;
    return !!selectedFound() && !!loader.items(edu.unit);
  }
  const EduQuiz = {
    ask: ask,
    cancel: cancelQuiz,
    unitLabel: function (short) { return unitLabelOf(selectedFound(), !!short); },
    intensity: function () { return intensityNow(); },
    summary: function (stats) { return summaryLine(stats && stats.asked > 0 ? stats : tally); },
    stats: function () { return JSON.parse(JSON.stringify(edu.stats)); },
    status: function () { return { unit: edu.unit, load: unitStatus(), open: quiz.open }; }
  };
  Object.defineProperty(EduQuiz, 'ready', { enumerable: true, get: ready });
  window.EduQuiz = EduQuiz;

  /* =====================================================================
   * 시작
   * ===================================================================== */
  function start() {
    if (inited) return;
    inited = true;
    edu = readEduFromRaw(store.get(storageKey()), defaultIntensity());
    attachToSave();
    // 카탈로그에서 사라진 소단원이면 선택을 비운다(선택 화면이 다시 열린다)
    if (edu.unit && hasAnySub(catalog()) && !findSub(catalog(), edu.unit)) { edu.unit = null; persist(); }
    bindPicker();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pickerVisible()) closePicker(false);
    });
    window.addEventListener('keydown', onQuizKey, true);       // 팝업 키보드는 게임보다 먼저 받는다
    try {
      if (window.sessionStorage.getItem(EDU_UI.chooserKey) === '1') {
        const w = $('eg-home-wrap');
        const a = $('eg-home-link');
        if (w && a) { if (location.protocol === 'file:') a.setAttribute('href', '../../index.html'); w.hidden = false; }
      }
    } catch (e) { /* sessionStorage 막힘: 링크 없이 */ }
    renderUnitCard();
    if (host && host.on) {
      host.on('renderStart', function () { cancelQuiz(); renderUnitCard(); });
      host.on('stageStart', function () { stageF = {}; tally = { asked: 0, right: 0, bonus: 0, closed: false }; renderResultLine(''); });
      host.on('stageEnd', function (d) { renderResultLine(d && typeof d.summary === 'string' ? d.summary : undefined); tally.closed = true; });
    }
    if (selectedFound()) loadSelected();
  }

  installGate();
  if (host && host.on) host.on('init', start);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
