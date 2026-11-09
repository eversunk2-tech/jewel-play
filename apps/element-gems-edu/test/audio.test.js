/* [교육용] 소리·난이도 시험 (spec §22.6). 실행: node --test apps/element-gems-edu/test/*.test.js
 * 일반용 apps/element-gems/test/audio.test.js 와 같은 내용(경로·저장 키·목표 점수 표만 교육용) + 교육용 전용 시험(문제 팝업 덕킹 등)
 *
 *  1) pickTrack(순수 함수): 빈 목록·1곡·last 제외·시드 고정 분포
 *  2) CONFIG·파일: 음량·페이드·곡 목록, 곡 파일 존재와 크기(§22.5.1), 클릭음 교체, 목표 점수 30칸(§25.6)과 교육용 파생 표(×1.2, §21.8.4)
 *  3) Audio 가 없는 Node 샌드박스(가짜 DOM + 가상 시계)에서 오디오 API 를 모두 불러도 오류·타이머가 없다(§22.3.9)
 *  4) 가짜 Audio 가 있는 샌드박스에서 장면 전환표(§22.3.2)·곡 끝·실패 폴백·일시정지·소리 토글·덕킹을 호출 로그로 확인
 *  5) [EDU] 문제 팝업(? 선물상자를 직접 매치) 중 BGM 덕킹·복귀, 팝업 중 곡 끝(ended)·소리 토글·재시작, 스킬로 지운 ?(문제 없음), 정답 보너스·시계 정지
 *  소리가 실제로 어떻게 들리는지는 확인할 수 없다(호출·src·play/pause 기록만 본다).
 *  교육용 game.js 는 이미 __EG_TEST__.internals 를 만들므로, 이 시험은 키 audioInternals 로 따로 연결점을 끼운다(메모리에서만; 파일은 수정하지 않는다).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const GAME_PATH = path.join(root, 'game.js');
const G = require(GAME_PATH);
const CFG = G.CONFIG;
const GEN_DIR = path.join(root, '..', 'element-gems');           // 일반용: 읽기 전용(있을 때만 비교한다)
const HAS_GEN = fs.existsSync(path.join(GEN_DIR, 'game.js'));

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ===================================================================
 * 1) pickTrack
 * =================================================================== */
test('pickTrack: 빈 목록·없음은 null, 1곡이면 last 와 같아도 그 곡', () => {
  assert.strictEqual(G.pickTrack([], null, Math.random), null);
  assert.strictEqual(G.pickTrack(null, null, Math.random), null);
  assert.strictEqual(G.pickTrack(undefined, 'a', Math.random), null);
  assert.strictEqual(G.pickTrack(['a'], null, Math.random), 'a');
  assert.strictEqual(G.pickTrack(['a'], 'a', Math.random), 'a');
});

test('pickTrack: 2곡 이상이면 last 는 절대 나오지 않는다 (경계 난수 0, 0.999… 포함)', () => {
  const list = ['a', 'b', 'c', 'd'];
  list.forEach((last) => {
    [0, 0.25, 0.5, 0.75, 0.999999999].forEach((r) => {
      const t = G.pickTrack(list, last, () => r);
      assert.notStrictEqual(t, last, 'last=' + last + ' r=' + r);
      assert.ok(list.indexOf(t) !== -1);
    });
  });
  assert.strictEqual(G.pickTrack(['a', 'b'], 'a', () => 0), 'b');
  assert.strictEqual(G.pickTrack(['a', 'b'], 'b', () => 0.99), 'a');
  // last 가 목록에 없으면 전체에서 고른다
  assert.strictEqual(G.pickTrack(['a', 'b'], 'zzz', () => 0), 'a');
  assert.strictEqual(G.pickTrack(['a', 'b'], null, () => 0.99), 'b');
});

test('pickTrack: 시드 고정 100,000회 — last 제외 나머지가 균등(±1%p), last 는 0회', () => {
  const list = CFG.assets.music.play;
  assert.strictEqual(list.length, 4);
  list.forEach((last) => {
    const rnd = mulberry(20261108);
    const cnt = {};
    list.forEach((u) => { cnt[u] = 0; });
    const N = 100000;
    for (let i = 0; i < N; i++) cnt[G.pickTrack(list, last, rnd)]++;
    assert.strictEqual(cnt[last], 0);
    list.filter((u) => u !== last).forEach((u) => {
      assert.ok(Math.abs(cnt[u] / N - 1 / 3) < 0.01, u + ' 비율 ' + (cnt[u] / N));
    });
  });
});

test('pickTrack: 연속으로 불러도 같은 곡이 이어지지 않고 4곡이 모두 나온다', () => {
  const list = CFG.assets.music.play;
  const rnd = mulberry(7);
  let last = null;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = G.pickTrack(list, last, rnd);
    assert.notStrictEqual(t, last);
    seen.add(t);
    last = t;
  }
  assert.strictEqual(seen.size, 4);
});

/* ===================================================================
 * 2) CONFIG·파일
 * =================================================================== */
test('CONFIG.audio: 음량·페이드 값 (spec §22.3.3·§22.5.3)', () => {
  const a = CFG.audio;
  assert.strictEqual(a.bgm, 0.42);
  assert.strictEqual(a.bgmDuck, 0.18);
  assert.strictEqual(a.bgmMenu, 0.42);
  assert.strictEqual(a.sfx, 0.8);
  assert.strictEqual(a.fadeMs, 400);
  assert.strictEqual(a.fadeOutMs, 300);
  assert.ok(a.fadeStepMs > 0 && a.fadeStepMs <= 100);
  ['bgm', 'bgmDuck', 'bgmMenu', 'sfx'].forEach((k) => assert.ok(a[k] > 0 && a[k] <= 1, k));
  assert.ok(a.bgmDuck < a.bgm, '덕킹 음량은 평소보다 작다');
});

test('CONFIG.assets.music: 시작 화면 1곡 + 플레이 4곡, 폴백 bgm 은 플레이 목록 안에 있다', () => {
  const m = CFG.assets.music;
  assert.deepStrictEqual(m.menu, ['assets/music/menu.mp3']);
  assert.deepStrictEqual(m.play, ['assets/music/bgm.mp3', 'assets/music/play-1.mp3', 'assets/music/play-2.mp3', 'assets/music/play-3.mp3']);
  assert.strictEqual(CFG.assets.bgm, 'assets/music/bgm.mp3');
  assert.ok(m.play.indexOf(CFG.assets.bgm) !== -1);
  assert.strictEqual(new Set(m.menu.concat(m.play)).size, 5, '곡 경로가 서로 다르다');
});

test('곡 파일: 목록의 파일이 모두 있고 크기가 계획서 표(§22.5.1)와 같다, 목록 밖 mp3 는 없다', () => {
  const sizes = {
    'assets/music/menu.mp3': 1379726,
    'assets/music/bgm.mp3': 1415043,
    'assets/music/play-1.mp3': 1431762,
    'assets/music/play-2.mp3': 1360709,
    'assets/music/play-3.mp3': 1420059
  };
  const listed = CFG.assets.music.menu.concat(CFG.assets.music.play);
  assert.strictEqual(listed.length, Object.keys(sizes).length);
  listed.forEach((u) => {
    const f = path.join(root, u);
    assert.ok(fs.existsSync(f), u + ' 없음');
    assert.strictEqual(fs.statSync(f).size, sizes[u], u + ' 크기');
    const head = fs.readFileSync(f).subarray(0, 3);
    assert.ok(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), u + ' 는 MP3 헤더');
  });
  const onDisk = fs.readdirSync(path.join(root, 'assets', 'music')).filter((n) => /\.mp3$/.test(n)).map((n) => 'assets/music/' + n).sort();
  assert.deepStrictEqual(onDisk, listed.slice().sort());
  const total = listed.reduce((s, u) => s + sizes[u], 0);
  assert.strictEqual(total, 7007299);
});

test('효과음: click.wav 는 S3 젤리 보잉(19,448바이트, 사용자 결정 2026-11-08)이고 SFX 파일 26개가 그대로 있다', () => {
  const dir = path.join(root, 'assets', 'sfx');
  assert.strictEqual(fs.statSync(path.join(dir, 'click.wav')).size, 19448);
  assert.strictEqual(fs.readdirSync(dir).filter((n) => /\.wav$/.test(n)).length, 26);
});

test('목표 점수: 원본 표는 spec §31.3(초보)·§28.7.5 근사(중수·고수) 30칸이고, 교육용 stageTarget 은 ×1.2 파생 표(§21.8.4·§31.3) 30칸과 같다', () => {
  // 새 점수 규칙(강 R4, 규모 약 ×3, B2 교육용 이식): 초보 = §31.3 표(사용자 결정 1단계 9,000), 중수·고수 = §28.7.5 근사 표(폴백·롤백용, §27 M2 가 미션으로 대체). 교육용 초보는 §31.3 '교육용 보통' 행
  const B = {
    easy: [9000, 9500, 10100, 10400, 10600, 11100, 11600, 13000, 14200, 15200],
    normal: [14900, 16200, 17500, 17800, 19500, 20800, 22400, 23400, 25100, 27100],
    hard: [17600, 19200, 20200, 21400, 22400, 23700, 25600, 27200, 29100, 31700]
  };
  const EDU = {
    easy: [10800, 11400, 12100, 12500, 12700, 13300, 13900, 15600, 17000, 18200],
    normal: [17900, 19400, 21000, 21400, 23400, 25000, 26900, 28100, 30100, 32500],
    hard: [21100, 23000, 24200, 25700, 26900, 28400, 30700, 32600, 34900, 38000]
  };
  Object.keys(B).forEach((lv) => {
    assert.deepStrictEqual(CFG.stages.targets[lv], B[lv], lv + ' 원본(일반용과 같은 값)');
    for (let s = 1; s <= 10; s++) {
      assert.strictEqual(G.stageTarget(lv, s), EDU[lv][s - 1], lv + ' ' + s);
      assert.strictEqual(G.stageTarget(lv, s), Math.round(B[lv][s - 1] * 1.2 / 100) * 100, lv + ' ' + s + ' = 원본 × 1.2 반올림');
    }
    for (let i = 1; i < 10; i++) assert.ok(EDU[lv][i] > EDU[lv][i - 1], lv + ' 증가');
  });
  for (let i = 0; i < 10; i++) assert.ok(EDU.easy[i] < EDU.normal[i] && EDU.normal[i] < EDU.hard[i], '레벨 ' + (i + 1));
  if (HAS_GEN) {          // 일반용 원본 표와 한 칸도 다르지 않다
    assert.deepStrictEqual(CFG.stages.targets, require(path.join(GEN_DIR, 'game.js')).CONFIG.stages.targets);
  }
});

test('index.html: 목표 점수 자리표시자 4곳이 비워져 있고 옛 값(6,500·9,200·7,800)이 남아 있지 않다', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/6,500|9,200|6500|9200|7,800|7800/.test(html));
  assert.ok(/id="goal-text">0 \/ 0</.test(html));
  assert.ok(/id="count-info">레벨 1 · 목표 0점</.test(html));
  assert.ok(/id="pause-level" class="muted">중수 · 레벨 1 · 목표 0</.test(html));
  assert.ok(/id="end-target">목표 0 \/ 내 점수 0</.test(html));
});

test('두 앱의 음악 5곡·click.wav 가 바이트 동일하다 (일반용이 있을 때)', { skip: !HAS_GEN && '일반용 폴더 없음' }, () => {
  const files = CFG.assets.music.menu.concat(CFG.assets.music.play, ['assets/sfx/click.wav']);
  files.forEach((f) => {
    const a = fs.readFileSync(path.join(root, f));
    const b = fs.readFileSync(path.join(GEN_DIR, f));
    assert.ok(a.equals(b), f + ' 가 일반용과 다름');
  });
});

test('game.js 소스: 소리 꺼짐·Audio 없음 가드와 pointerdown 미사용 (spec §22.3.3·§22.3.9)', () => {
  const src = fs.readFileSync(GAME_PATH, 'utf8');
  assert.ok(/typeof Audio === 'undefined'/.test(src), 'Audio 없음 가드');
  assert.ok(/FIRST_INPUT_EVENTS = \['click', 'touchend', 'keydown'\]/.test(src), '첫 입력 이벤트 3종');
  const m = src.match(/function onFirstInput[\s\S]*?\n  }\n/);
  assert.ok(m && !/pointerdown/.test(m[0]));
  // 곡 경로를 코드에 직접 쓰지 않는다(CONFIG 한 곳)
  const body = src.replace(/\/\/[^\n]*/g, '');
  const code = body.slice(body.indexOf('const SILENT_SRC'));
  assert.ok(!/assets\/music\/(menu|bgm|play-\d)\.mp3/.test(code), '곡 경로는 CONFIG 에만');
});

/* ===================================================================
 * 3·4) 가짜 DOM + 가상 시계 샌드박스 (edu-engine.test.js 하네스를 줄여서 사용)
 * =================================================================== */
const SRC = fs.readFileSync(GAME_PATH, 'utf8');
const HOOK_TAIL = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
// 교육용 game.js 는 자체 __EG_TEST__.internals 를 이미 만든다 -> 덮어쓰지 않도록 별도 키 audioInternals 를 쓴다
const HOOK = "  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) { globalThis.__EG_TEST__.audioInternals = { audio: audio, state: state, save: save, CONFIG: CONFIG, startStage: startStage, goStages: goStages, goHome: goHome, pauseGame: pauseGame, resumeGame: resumeGame, openConfirm: openConfirm, finishStage: finishStage, toggleSound: toggleSound, el: el, SILENT_SRC: SILENT_SRC, trySwap: trySwap, handleTap: handleTap, onGauge: onGauge, typeGrid: typeGrid, setGemType: setGemType }; }\n";
assert.ok(SRC.indexOf(HOOK_TAIL) !== -1, 'game.js 끝부분을 찾지 못함');
const SCRIPT = new vm.Script(SRC.replace(HOOK_TAIL, HOOK + HOOK_TAIL), { filename: 'edu/game.js' });
// 오디오 객체가 들어 있는 줄 범위(타이머를 만든 호출 위치 판별용)
const SRC_LINES = SRC.split('\n');
const AUDIO_FIRST = SRC_LINES.findIndex((l) => l.indexOf('const audio = {') !== -1) + 1;
const AUDIO_LAST = SRC_LINES.findIndex((l) => l.indexOf('function sfx(name, n)') !== -1) + 1;
assert.ok(AUDIO_FIRST > 0 && AUDIO_LAST > AUDIO_FIRST);

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.textContent = '';
    this.isFragment = false;
    this._html = '';
    this._attrs = {};
    this._cls = new Set();
    this._ls = {};
    this._q = {};
    this._style = {};
    const self = this;
    this.style = {
      setProperty(k, v) { self._style[k] = String(v); },
      removeProperty(k) { delete self._style[k]; },
      getPropertyValue(k) { return self._style[k] || ''; }
    };
    this.dataset = {};
    this.classList = {
      add() { Array.prototype.forEach.call(arguments, (n) => self._cls.add(n)); },
      remove() { Array.prototype.forEach.call(arguments, (n) => self._cls.delete(n)); },
      toggle(n, force) { const on = force === undefined ? !self._cls.has(n) : !!force; if (on) self._cls.add(n); else self._cls.delete(n); return on; },
      contains(n) { return self._cls.has(n); }
    };
  }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get clientWidth() { return 640; }
  get offsetWidth() { return 640; }
  appendChild(ch) {
    if (ch.isFragment) { ch.children.forEach((x) => { x.parentNode = this; this.children.push(x); }); ch.children = []; return ch; }
    ch.parentNode = this;
    this.children.push(ch);
    return ch;
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
  removeEventListener() {}
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new FakeEl('span')); }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  blur() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

/** 가짜 HTMLAudioElement: src 를 바꾸면 paused=true(load 알고리즘), ended 이면 paused=true. 호출은 env.log 에 쌓는다 */
function makeAudioClass(env) {
  let seq = 0;
  return class FakeAudio {
    constructor(src) {
      this.id = ++seq;
      this._ls = {};
      this._src = '';
      this.paused = true;
      this.muted = false;
      this.loop = false;
      this.volume = 1;
      this.currentTime = 0;
      this.preload = 'auto';
      env.audios.push(this);
      if (src !== undefined) this.src = src;
    }
    get src() { return this._src; }
    set src(v) {
      this._src = String(v);
      this.paused = true;
      this.currentTime = 0;
      env.log.push({ op: 'src', id: this.id, v: this._src, loop: this.loop });
    }
    play() {
      env.log.push({ op: 'play', id: this.id, src: this._src, from: this.currentTime, muted: this.muted, vol: this.volume, loop: this.loop });
      if (env.playError) { const e = new Error('blocked'); e.name = env.playError; return Promise.reject(e); }
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      if (!this.paused) env.log.push({ op: 'pause', id: this.id, src: this._src });
      this.paused = true;
    }
    addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); }
    removeEventListener() {}
    emit(t) {
      if (t === 'ended') { this.paused = true; this.ended = true; }
      (this._ls[t] || []).slice().forEach((fn) => fn({ type: t, target: this }));
    }
  };
}

/** opt: { audio: true|false (가짜 Audio 제공 여부), saved: 저장 객체 일부, seed } */
function createEnv(opt) {
  const o = opt || {};
  const env = { log: [], audios: [], timersMade: [], _now: 0, _seq: 0, _q: [], playError: null, hidden: false };
  env.timers = {
    setTimeout(fn, ms) {
      const id = ++env._seq;
      const stack = new Error().stack.split('\n').slice(2);
      const inAudio = stack.some((ln) => {
        const m = ln.match(/edu\/game\.js:(\d+):\d+/);
        return m && +m[1] >= AUDIO_FIRST && +m[1] <= AUDIO_LAST;
      });
      env.timersMade.push({ id, ms: +ms || 0, inAudio });
      env._q.push({ t: env._now + Math.max(0, +ms || 0), id, fn });
      return id;
    },
    clearTimeout(id) { const i = env._q.findIndex((x) => x.id === id); if (i >= 0) env._q.splice(i, 1); }
  };
  const ids = {};
  const docLs = {};
  const doc = {
    readyState: 'complete', activeElement: null,
    documentElement: new FakeEl('html'),
    getElementById(id) { return ids[id] || (ids[id] = new FakeEl('div')); },
    createElement(t) { return new FakeEl(t); },
    createElementNS(ns, t) { return new FakeEl(t); },
    createDocumentFragment() { const f = new FakeEl('fragment'); f.isFragment = true; return f; },
    addEventListener(t, fn, cap) { (docLs[t] = docLs[t] || []).push({ fn, cap: !!cap }); },
    removeEventListener(t, fn, cap) { docLs[t] = (docLs[t] || []).filter((x) => !(x.fn === fn && x.cap === !!cap)); }
  };
  Object.defineProperty(doc, 'hidden', { get() { return env.hidden; } });
  const store = {};
  if (o.saved) store['element-gems-edu:v1'] = JSON.stringify(o.saved);       // 교육용 저장 키(CONFIG.edu.storageKey)
  const rand = mulberry(o.seed || 1);
  const sandbox = {
    console, __EG_TEST__: {}, module: { exports: {} }, document: doc,
    setTimeout: env.timers.setTimeout, clearTimeout: env.timers.clearTimeout,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: false }),
    Image: class { set src(v) { env.timers.setTimeout(() => { if (this.onload) this.onload(); }, 0); } },
    __rand: rand
  };
  if (o.audio) sandbox.Audio = makeAudioClass(env);
  sandbox.window = sandbox;
  sandbox.requestAnimationFrame = (cb) => env.timers.setTimeout(() => cb(env._now), 150);
  vm.createContext(sandbox);
  vm.runInContext('Math.random = function () { return __rand(); };', sandbox);
  SCRIPT.runInContext(sandbox);
  env.sandbox = sandbox;
  env.doc = doc;
  env.store = store;
  env.I = sandbox.__EG_TEST__.audioInternals;
  env.I.CONFIG.stages.goalType.normal = 'score'; env.I.CONFIG.stages.goalType.hard = 'score';   // 시험 도구(spec §27.9.3): 소리 시험은 미션 표 값과 무관하게 점수 목표 판에서 돈다(일반용 audio.test.js 와 같은 한 줄)
  if (env.I.CONFIG.edu) env.I.CONFIG.edu.defaultIntensity = 'normal';   // 시험 도구(spec §27.7 M3-B): 소리 시험은 문제 양 "보통"(= M3-A 직후의 공급·목표)을 전제로 한다
  env.errors = [];
  process.on('unhandledRejection', env.unhandled = (e) => { env.errors.push(e); });
  env.dispose = () => process.removeListener('unhandledRejection', env.unhandled);

  /** 문서에 이벤트를 보낸다: 캡처 핸들러 -> 대상 요소 핸들러 -> 버블 핸들러 */
  env.input = function (type, targetEl, evt) {
    const target = targetEl || { closest: () => null };
    const ev = Object.assign({ type, preventDefault() {}, target: target }, evt || {});
    (docLs[type] || []).filter((x) => x.cap).forEach((x) => x.fn(ev));
    if (targetEl && targetEl._ls) (targetEl._ls[type] || []).slice().forEach((fn) => fn(ev));
    (docLs[type] || []).filter((x) => !x.cap).forEach((x) => x.fn(ev));
  };
  env.click = (id) => env.input('click', doc.getElementById(id));
  env.clickStage = (n) => env.input('click', doc.getElementById('stage-grid'), { target: { closest: () => ({ disabled: false, dataset: { stage: String(n) } }) } });
  env.docListenerCount = (type) => (docLs[type] || []).length;
  env.step = async function () {
    const q = env._q;
    if (!q.length) return false;
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (q[i].t < q[bi].t || (q[i].t === q[bi].t && q[i].id < q[bi].id)) bi = i;
    const ev = q.splice(bi, 1)[0];
    env._now = Math.max(env._now, ev.t);
    ev.fn();
    await new Promise((r) => setImmediate(r));
    return true;
  };
  env.runFor = async function (ms) {
    const target = env._now + ms;
    while (env._q.length && Math.min.apply(null, env._q.map((x) => x.t)) <= target) await env.step();
    env._now = Math.max(env._now, target);
    await new Promise((r) => setImmediate(r));
  };
  env.runUntil = async function (pred, maxMs) {
    const limit = env._now + (maxMs == null ? 60000 : maxMs);
    while (!pred()) {
      if (env._now > limit) throw new Error('runUntil: 시간 초과 phase=' + env.I.state.phase);
      if (!(await env.step())) throw new Error('runUntil: 남은 타이머 없음');
    }
  };
  /** 레벨 카드를 눌러 GO 까지(phase==='playing') 진행 */
  env.startPlaying = async function (stage) {
    env.click('btn-start');                       // 시작 화면 -> 단계 선택 (이미 단계 선택이면 phase 가 달라 무시)
    env.clickStage(stage || 1);
    await env.runUntil(() => env.I.state.phase === 'playing', 30000);
  };
  env.ops = (op) => env.log.filter((e) => e.op === op);
  env.mp3 = (op) => env.log.filter((e) => e.op === op && /\.mp3$/.test(e.src || e.v || ''));
  env.bgm = () => env.I.audio.bgm;
  env.reset = () => { env.log.length = 0; };
  return env;
}
function save1(extra) {   // 단계 1~10 모두 열린 저장(레벨 카드 클릭 시험용)
  const s = { muted: false, tutorialSeen: true, level: 'normal', progress: { easy: 10, normal: 10, hard: 10 } };
  return Object.assign(s, extra || {});
}
const base = (f) => path.basename(f || '');

/* ---------- 3) Audio 없음 ---------- */
test('Audio 가 없는 샌드박스: 첫 입력·소리 토글·판 시작·일시정지·종료·나가기까지 오류 없이 끝나고 오디오 코드가 만든 타이머가 없다', async () => {
  const env = createEnv({ audio: false, saved: save1() });
  try {
    const I = env.I;
    assert.strictEqual(typeof env.sandbox.Audio, 'undefined');
    const timersAtLoad = env.timersMade.length;
    env.input('keydown');                               // 첫 입력
    env.input('click', env.doc.getElementById('btn-start'));
    assert.strictEqual(I.audio.ready, true, '첫 입력 뒤 init 은 끝난다(요소는 없음)');
    assert.strictEqual(I.audio.bgm, null);
    assert.strictEqual(env.docListenerCount('click') >= 1, true);
    ['keydown', 'click', 'touchend'].forEach((t) => {
      // 1회용 핸들러는 audio.ready 가 되면 떼어진다(캡처 핸들러가 남아 있지 않다)
      assert.strictEqual(env.docListenerCount(t) <= 1, true, t);
    });
    env.click('btn-sound-start');                       // 끔
    env.click('btn-sound-start');                       // 켬
    env.click('btn-stages-back');                       // goHome
    env.click('btn-start');
    await env.startPlaying(1);
    I.audio.duck(true); I.audio.duck(false);
    I.pauseGame();
    I.resumeGame();
    I.openConfirm();
    I.audio.bgmPause(); I.audio.bgmPlay(false);
    I.audio.musicSync(); I.audio.musicMenu(); I.audio.musicPrepare(); I.audio.bgmStop();
    env.hidden = true; env.input('visibilitychange'); env.hidden = false; env.input('visibilitychange');
    I.goStages();
    I.goHome();
    await env.runFor(5000);
    assert.deepStrictEqual(env.errors, []);
    const audioTimers = env.timersMade.filter((t) => t.inAudio);
    assert.strictEqual(audioTimers.length, 0, '오디오 코드가 만든 타이머 ' + audioTimers.length + '개');
    assert.ok(env.timersMade.length > timersAtLoad, '(게임 자체 타이머는 있다 = 측정이 작동한다)');
  } finally { env.dispose(); }
});

test('Audio 가 없고 가상 시계 큐가 비는 순수 호출: musicMenu/musicPrepare/bgmStop 은 큐에 아무것도 넣지 않는다', () => {
  const env = createEnv({ audio: false });
  try {
    const a = env.I.audio;
    const before = env._q.length;
    a.init();
    a.musicMenu(); a.musicPrepare(); a.bgmPlay(true); a.musicSync(); a.bgmStop(); a.bgmPause();
    assert.strictEqual(env._q.length, before);
    assert.strictEqual(env.timersMade.filter((t) => t.inAudio).length, 0);
  } finally { env.dispose(); }
});

/* ---------- 4) 가짜 Audio ---------- */
test('첫 입력 전에는 Audio 요소·src·play 가 0, 첫 입력 뒤 menu.mp3 한 곡만 올리고 한 번 재생(loop)', () => {
  const env = createEnv({ audio: true, saved: save1() });
  try {
    assert.strictEqual(env.audios.length, 0);
    assert.strictEqual(env.log.length, 0);
    assert.strictEqual(env.mp3('src').length, 0);
    env.input('click');                                 // 첫 입력
    const mp3src = env.mp3('src');
    assert.deepStrictEqual(mp3src.map((e) => e.v), ['assets/music/menu.mp3']);
    const plays = env.mp3('play');
    assert.strictEqual(plays.length, 1);
    assert.strictEqual(plays[0].loop, true);
    assert.strictEqual(plays[0].muted, false);
    assert.ok(Math.abs(plays[0].vol - CFG.audio.bgmMenu) < 1e-9);
    // 곡 요소는 하나, 다른 곡(play-N, bgm)은 요청하지 않았다
    assert.strictEqual(env.audios.filter((a) => /\.mp3$/.test(a.src)).length, 1);
    assert.strictEqual(env.mp3('src').some((e) => /bgm|play-/.test(e.v)), false);
    // 효과음 풀(WAV)은 첫 입력에서 만들어진다
    assert.ok(env.audios.filter((a) => /\.wav$/.test(a.src)).length >= 26);
    // 1회용 핸들러 해제
    assert.strictEqual(env.docListenerCount('click') <= 1, true);
  } finally { env.dispose(); }
});

test('첫 입력은 touchend·keydown 으로도 시작 화면 곡을 시작한다 (pointerdown 은 듣지 않는다)', () => {
  ['touchend', 'keydown'].forEach((type) => {
    const env = createEnv({ audio: true, saved: save1() });
    try {
      env.input('pointerdown');
      assert.strictEqual(env.audios.length, 0, 'pointerdown 은 무시');
      env.input(type);
      assert.deepStrictEqual(env.mp3('src').map((e) => e.v), ['assets/music/menu.mp3'], type);
      assert.strictEqual(env.mp3('play').length, 1, type);
    } finally { env.dispose(); }
  });
});

test('소리 꺼짐으로 시작: 첫 입력·단계 선택·판 시작·GO 까지 mp3 요청 0 (파일을 받지 않음), 켜면 현재 장면 곡이 시작된다', async () => {
  const env = createEnv({ audio: true, saved: save1({ muted: true }) });
  try {
    const I = env.I;
    env.input('click');
    assert.strictEqual(I.audio.ready, false, '소리 꺼짐이면 첫 입력에서 init 하지 않는다');
    assert.strictEqual(env.audios.length, 0);
    await env.startPlaying(1);                          // startStage 가 init 을 부른다
    assert.strictEqual(env.mp3('src').length, 0, '판 시작·GO 까지 mp3 src 0');
    assert.strictEqual(env.mp3('play').length, 0);
    // 일시정지 중 소리 켜기 -> 아직 재생 안 함, 재개하면 플레이 곡 하나를 올려 재생
    I.pauseGame();
    env.click('btn-sound-pause');
    assert.strictEqual(I.audio.muted, false);
    assert.strictEqual(env.mp3('play').length, 0, '일시정지 중에는 재개 때 소리');
    I.resumeGame();
    assert.strictEqual(env.mp3('src').length, 1);
    assert.ok(CFG.assets.music.play.indexOf(env.mp3('src')[0].v) !== -1);
    assert.strictEqual(env.mp3('play').length, 1);
    assert.strictEqual(env.mp3('play')[0].loop, false);
  } finally { env.dispose(); }
});

test('소리 꺼짐으로 시작한 시작 화면에서 소리를 켜면 menu.mp3 를 올려 재생, 다시 끄면 음소거(곡은 흐름)', () => {
  const env = createEnv({ audio: true, saved: save1({ muted: true }) });
  try {
    env.input('click');
    assert.strictEqual(env.mp3('src').length, 0);
    env.click('btn-sound-start');                       // 켬
    assert.deepStrictEqual(env.mp3('src').map((e) => e.v), ['assets/music/menu.mp3']);
    assert.strictEqual(env.mp3('play').length, 1);
    assert.strictEqual(env.bgm().muted, false);
    env.click('btn-sound-start');                       // 끔
    assert.strictEqual(env.bgm().muted, true);
    assert.strictEqual(env.bgm().paused, false, '끔은 음소거일 뿐 곡은 흐른다');
    env.click('btn-sound-start');                       // 켬
    assert.strictEqual(env.bgm().muted, false);
    assert.strictEqual(env.mp3('src').length, 1, '다시 켜도 곡을 새로 받지 않는다');
    assert.strictEqual(env.mp3('play').length, 1, '다시 시작하지 않는다');
  } finally { env.dispose(); }
});

test('시작 → 단계 선택 → 시작 → 단계 선택: 시작 화면 곡을 다시 시작하지 않는다 (src 1회, play 1회)', () => {
  const env = createEnv({ audio: true, saved: save1() });
  try {
    env.input('click');                                 // 첫 입력(시작 화면 곡 시작)
    env.click('btn-start');                             // 단계 선택
    env.click('btn-stages-back');                       // 시작 화면(goHome)
    env.click('btn-start');
    env.I.goHome();                                     // 프로필·명예의 전당에서 돌아올 때도 goHome
    env.I.goHome();
    assert.strictEqual(env.mp3('src').length, 1);
    assert.strictEqual(env.mp3('play').length, 1);
    assert.strictEqual(env.mp3('pause').length, 0, '곡을 멈춘 적이 없다');
    assert.strictEqual(env.bgm().paused, false);
  } finally { env.dispose(); }
});

test('레벨 카드: 시작 화면 곡 0.4초 페이드아웃 후 정지 → 플레이 곡 src 1개 → GO 에서 처음부터 재생(loop=false), 재생 중인 요소는 항상 1개', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 5 });
  try {
    const I = env.I;
    env.input('click');
    env.click('btn-start');
    env.reset();
    const nTimers = env.timersMade.length;
    env.clickStage(3);
    assert.ok(env.timersMade.slice(nTimers).some((t) => t.inAudio && t.ms === CFG.audio.fadeStepMs), '페이드 타이머가 오디오 코드에서 만들어졌다(측정이 작동한다)');
    assert.strictEqual(env.mp3('src').length, 0, '페이드가 끝나기 전에는 곡을 바꾸지 않는다');
    assert.strictEqual(env.bgm().paused, false);
    await env.runFor(200);
    assert.ok(env.bgm().volume < CFG.audio.bgmMenu && env.bgm().volume > 0, '페이드 중 음량이 내려간다: ' + env.bgm().volume);
    await env.runFor(250);                              // 0.4초 지남
    assert.strictEqual(env.bgm().paused, true);
    const srcs = env.mp3('src');
    assert.strictEqual(srcs.length, 1, '플레이 곡 src 1개');
    assert.ok(CFG.assets.music.play.indexOf(srcs[0].v) !== -1);
    assert.strictEqual(srcs[0].loop, false);
    assert.strictEqual(env.mp3('play').length, 0, 'GO 전에는 재생하지 않는다');
    assert.strictEqual(env.audios.filter((a) => /\.mp3$/.test(a.src) && !a.paused).length, 0);
    await env.runUntil(() => I.state.phase === 'playing', 10000);
    const plays = env.mp3('play');
    assert.strictEqual(plays.length, 1);
    assert.strictEqual(plays[0].from, 0);
    assert.strictEqual(plays[0].src, srcs[0].v);
    assert.ok(Math.abs(env.bgm().volume - CFG.audio.bgm) < 1e-9, '페이드 계수가 1로 돌아와 있다');
    assert.strictEqual(env.audios.filter((a) => /\.mp3$/.test(a.src) && !a.paused).length, 1, '소리 내는 곡 요소는 1개');
    assert.strictEqual(env.audios.filter((a) => /\.mp3$/.test(a.src)).length, 1, 'BGM 요소 자체가 1개');
  } finally { env.dispose(); }
});

test('같은 판에 새 mp3 요청은 그 판의 곡 하나뿐이다 (지연 로드, 다음 곡 미리 받기 없음)', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 9 });
  try {
    await env.startPlaying(1);
    const srcs = env.mp3('src').map((e) => base(e.v));
    assert.strictEqual(srcs.length, 2, '시작 화면 곡 + 이번 판 곡');
    assert.strictEqual(srcs[0], 'menu.mp3');
    await env.runFor(60000);                            // 한 판 동안 계속 진행해도
    assert.strictEqual(env.mp3('src').length, 2);
  } finally { env.dispose(); }
});

test('판 중에 소리를 끄면(일시정지 메뉴) 올라 있는 곡은 음소거로 계속 흐르고, 새 판에서는 곡을 받지 않는다', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 6 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    const b = env.bgm();
    const track = b.src;
    b.currentTime = 20;
    I.pauseGame();
    env.click('btn-sound-pause');                       // 끔
    assert.strictEqual(b.muted, true);
    env.reset();
    I.resumeGame();
    assert.strictEqual(b.paused, false, '음소거로 계속 흐른다');
    assert.strictEqual(b.muted, true);
    assert.strictEqual(b.src, track);
    assert.strictEqual(env.mp3('src').length, 0);
    assert.strictEqual(env.mp3('play')[0].from, 20, '이어서');
    // 소리 꺼진 채 새 판: 곡을 올리지 않는다
    I.pauseGame();
    env.reset();
    env.click('btn-restart');
    await env.runUntil(() => I.state.phase === 'playing', 20000);
    assert.strictEqual(env.mp3('src').length, 0);
    assert.strictEqual(env.mp3('play').length, 0);
    assert.strictEqual(b.paused, true);
    // 켜고 재개하면 새 곡
    I.pauseGame();
    env.click('btn-sound-pause');
    assert.strictEqual(b.muted, false);
    I.resumeGame();
    assert.strictEqual(env.mp3('src').length, 1);
    assert.strictEqual(env.mp3('play').length, 1);
  } finally { env.dispose(); }
});

test('일시정지·확인창·재개: 멈췄다 이어서(처음으로 되돌리지 않음), 컷인 덕킹은 곡 음량을 bgmDuck 으로', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 3 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    const b = env.bgm();
    assert.strictEqual(b.paused, false);
    b.currentTime = 42;
    I.pauseGame();
    assert.strictEqual(b.paused, true);
    I.resumeGame();
    assert.strictEqual(b.paused, false);
    assert.strictEqual(env.mp3('play').pop().from, 42, '재개는 이어서');
    I.openConfirm();                                    // 확인창
    assert.strictEqual(b.paused, true);
    env.click('btn-confirm-no');
    assert.strictEqual(b.paused, false);
    assert.strictEqual(b.currentTime, 42);
    I.audio.duck(true);
    assert.ok(Math.abs(b.volume - CFG.audio.bgmDuck) < 1e-9);
    I.audio.duck(false);
    assert.ok(Math.abs(b.volume - CFG.audio.bgm) < 1e-9);
  } finally { env.dispose(); }
});

test('결과 화면은 BGM 없음 (시작 화면 곡도 틀지 않음). [레벨 선택]이면 시작 화면 곡 시작', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 11 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    I.finishStage();
    assert.strictEqual(env.bgm().paused, true);
    await env.runFor(3000);
    assert.strictEqual(env.bgm().paused, true, '결과 화면에서 소리 나는 곡 없음');
    env.reset();
    env.click('btn-home');                              // [레벨 선택] = goStages
    assert.deepStrictEqual(env.mp3('src').map((e) => base(e.v)), ['menu.mp3']);
    assert.strictEqual(env.mp3('play').length, 1);
    assert.strictEqual(env.mp3('play')[0].loop, true);
    assert.strictEqual(env.bgm().paused, false);
  } finally { env.dispose(); }
});

test('판 중 [나가기](일시정지) · 나가기 직전 소리 나는 중이면 0.3초 페이드아웃 뒤 시작 화면 곡', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 13 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    I.pauseGame();
    env.reset();
    env.click('btn-quit');                              // 일시정지 상태에서 나가기: 이미 멈춰 있으므로 바로 시작 화면 곡
    assert.deepStrictEqual(env.mp3('src').map((e) => base(e.v)), ['menu.mp3']);
    assert.strictEqual(env.bgm().paused, false);
    // 소리 나는 중에 goStages 를 부르면(예: 방어적 호출) 페이드아웃 뒤 전환
    await env.startPlaying(2);
    env.reset();
    I.goStages();
    assert.strictEqual(env.mp3('src').length, 0, '페이드 중에는 아직 곡이 그대로');
    await env.runFor(150);
    assert.ok(env.bgm().volume < CFG.audio.bgm);
    await env.runFor(250);
    assert.deepStrictEqual(env.mp3('src').map((e) => base(e.v)), ['menu.mp3']);
    assert.strictEqual(env.bgm().paused, false);
  } finally { env.dispose(); }
});

test('10판 반복(다시 시작·다시 하기·다음 레벨): 직전 판과 같은 곡이 이어지지 않고 4곡이 모두 나온다', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 42 });
  try {
    const I = env.I;
    const picks = [];
    const startRound = async (via) => {
      env.reset();
      if (via === 'restart') { I.pauseGame(); env.click('btn-restart'); }
      else if (via === 'again') { I.finishStage(); env.click('btn-again'); }
      else if (via === 'next') { I.finishStage(); I.state.stage = 1; env.click('btn-next'); }
      else env.clickStage(1);
      await env.runUntil(() => I.state.phase === 'playing', 20000);
      const s = env.mp3('src').filter((e) => /play-|bgm/.test(e.v));
      assert.strictEqual(s.length, 1, via + ': 판마다 곡 src 1개');
      picks.push(s[0].v);
    };
    env.input('click');
    env.click('btn-start');
    await startRound('card');
    const ways = ['restart', 'again', 'next', 'restart', 'again', 'again', 'restart', 'next', 'again', 'restart', 'again', 'restart', 'next', 'again', 'restart', 'again', 'next', 'restart', 'again', 'restart'];
    for (const w of ways) await startRound(w);
    assert.strictEqual(picks.length, 21);
    for (let i = 1; i < picks.length; i++) assert.notStrictEqual(picks[i], picks[i - 1], i + '번째 판이 직전과 같은 곡');
    assert.strictEqual(new Set(picks).size, 4, '네 곡이 모두 등장: ' + Array.from(new Set(picks)).map(base).join(','));
  } finally { env.dispose(); }
});

test('곡이 판 중간에 끝나면(ended) 직전 곡을 뺀 다른 곡이 재생되고, 컷인 덕킹 상태는 유지된다', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 17 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    const b = env.bgm();
    const first = b.src;
    I.audio.duck(true);                                 // 컷인 중
    env.reset();
    b.emit('ended');
    const s = env.mp3('src');
    assert.strictEqual(s.length, 1);
    assert.notStrictEqual(s[0].v, first);
    assert.ok(CFG.assets.music.play.indexOf(s[0].v) !== -1);
    assert.strictEqual(s[0].loop, false);
    assert.strictEqual(env.mp3('play').length, 1);
    assert.strictEqual(env.mp3('play')[0].from, 0);
    assert.strictEqual(b.paused, false);
    assert.ok(Math.abs(b.volume - CFG.audio.bgmDuck) < 1e-9, '덕킹 유지');
    // 여러 번 이어져도 직전 곡을 피한다
    let prev = s[0].v;
    for (let i = 0; i < 12; i++) {
      env.reset();
      b.emit('ended');
      const n = env.mp3('src')[0].v;
      assert.notStrictEqual(n, prev);
      prev = n;
    }
  } finally { env.dispose(); }
});

test('일시정지 중에 곡이 끝나면 재개할 때 다음 곡, 소리 꺼짐 중에 끝나면 켤 때 받는다', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 19 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    const b = env.bgm();
    const first = b.src;
    I.pauseGame();
    env.reset();
    b.emit('ended');
    assert.strictEqual(env.mp3('src').length, 0, '일시정지 중에는 다음 곡을 받지 않는다');
    I.resumeGame();
    assert.strictEqual(env.mp3('src').length, 1);
    assert.notStrictEqual(env.mp3('src')[0].v, first);
    assert.strictEqual(b.paused, false);
    // 소리 끔 -> 곡 끝 -> 켬
    env.click('btn-menu');
    env.click('btn-sound-pause');                       // 끔
    I.resumeGame();
    env.reset();
    b.emit('ended');
    assert.strictEqual(env.mp3('src').length, 0, '소리 꺼짐: 다음 곡을 받지 않는다');
    I.pauseGame();
    env.click('btn-sound-pause');                       // 켬
    I.resumeGame();
    assert.strictEqual(env.mp3('src').length, 1);
    assert.strictEqual(env.mp3('play').length, 1);
  } finally { env.dispose(); }
});

test('곡 로드 실패(error): 다른 곡으로 한 번 재시도 → 폴백 bgm.mp3 → 무음 (여러 시드로 두 갈래 모두 확인)', async () => {
  const fb = 'assets/music/bgm.mp3';
  let viaFallback = 0;
  let silentEarly = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const env = createEnv({ audio: true, saved: save1(), seed });
    try {
      await env.startPlaying(1);
      const b = env.bgm();
      const a1 = b.src;
      env.reset();
      b.emit('error');                                  // 1번째 실패 -> 목록의 다른 곡
      let s = env.mp3('src');
      assert.strictEqual(s.length, 1);
      assert.notStrictEqual(s[0].v, a1);
      assert.ok(CFG.assets.music.play.indexOf(s[0].v) !== -1);
      assert.strictEqual(env.mp3('play').length, 1, '재생 중이던 판이므로 이어서 재생');
      const a2 = s[0].v;
      env.reset();
      b.emit('error');                                  // 2번째 실패 -> 폴백 bgm.mp3 (이미 실패한 곡이 폴백이면 무음)
      s = env.mp3('src');
      if (a1 !== fb && a2 !== fb) {
        viaFallback++;
        assert.strictEqual(s.length, 1);
        assert.strictEqual(s[0].v, fb);
        assert.strictEqual(s[0].loop, true);
        assert.strictEqual(env.mp3('play').length, 1);
        env.reset();
        b.emit('error');                                // 폴백도 실패 -> 무음
        assert.strictEqual(env.mp3('src').length, 0);
        assert.strictEqual(b.paused, true);
      } else {
        silentEarly++;
        assert.strictEqual(s.length, 0, '폴백이 이미 실패한 곡이면 더 시도하지 않는다');
        assert.strictEqual(b.paused, true);
      }
      assert.deepStrictEqual(env.errors, []);
      assert.strictEqual(env.I.state.phase, 'playing', '게임은 계속된다');
    } finally { env.dispose(); }
  }
  assert.ok(viaFallback > 0 && silentEarly > 0, '두 갈래 모두 시험됨 ' + viaFallback + '/' + silentEarly);
});

test('곡 로드 실패 뒤 다음 판은 실패한 곡을 다시 고르지 않고, 곡이 모두 실패해도 오류 없이 진행된다', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 23 });
  try {
    const I = env.I;
    await env.startPlaying(1);
    const b = env.bgm();
    const bad = b.src;
    b.emit('error');
    for (let i = 0; i < 12; i++) {
      I.finishStage();
      env.reset();
      env.click('btn-again');
      await env.runUntil(() => I.state.phase === 'playing', 20000);
      const s = env.mp3('src').map((e) => e.v);
      assert.strictEqual(s.indexOf(bad), -1, '실패한 곡을 다시 올리지 않는다');
    }
    assert.deepStrictEqual(env.errors, []);
  } finally { env.dispose(); }
});

test('곡 로드 실패: 목록의 곡이 전부 없는 경로여도 폴백 bgm.mp3 로 재생하고, 모든 경로가 실패하면 무음으로 게임이 계속된다 (재시도는 곡 수만큼으로 끝난다)', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 29 });
  try {
    const I = env.I;
    I.CONFIG.assets.music.play = ['assets/music/none-1.mp3', 'assets/music/none-2.mp3', 'assets/music/none-3.mp3'];
    env.input('click');
    env.click('btn-start');
    env.clickStage(1);
    await env.runFor(500);
    const b = env.bgm();
    assert.ok(/none-/.test(b.src));
    b.emit('error');                                    // none-X 실패 -> 다른 none-Y(재시도 1회)
    assert.ok(/none-/.test(b.src));
    b.emit('error');                                    // 재시도도 실패 -> 폴백
    assert.strictEqual(b.src, 'assets/music/bgm.mp3');
    assert.strictEqual(b.loop, true);
    await env.runUntil(() => I.state.phase === 'playing', 20000);
    assert.strictEqual(b.paused, false);
    b.emit('error');                                    // 폴백 실패 -> 무음
    assert.strictEqual(b.paused, true);
    assert.strictEqual(I.state.phase, 'playing', '게임은 정상 진행');
    // 재개·다음 판에서 남은 없는 곡(none-Z) 하나만 더 시도하고 끝난다. 시도는 무한히 이어지지 않는다
    env.reset();
    for (let i = 0; i < 6; i++) {
      I.pauseGame();
      I.resumeGame();
      if (env.bgm().paused === false) env.bgm().emit('error');
      I.audio.musicSync();
    }
    assert.ok(env.mp3('src').length <= 1, '남은 곡은 한 번만 시도: ' + env.mp3('src').length);
    assert.strictEqual(env.bgm().paused, true);
    assert.deepStrictEqual(env.errors, []);
  } finally { env.dispose(); }
});

test('시작 화면 곡 실패: 폴백 곡을 대신 쓰고(loop), 폴백도 실패하면 무음. 판 시작은 정상', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 31 });
  try {
    const I = env.I;
    env.input('click');
    const b = env.bgm();
    assert.strictEqual(b.src, 'assets/music/menu.mp3');
    b.emit('error');
    assert.strictEqual(b.src, 'assets/music/bgm.mp3');
    assert.strictEqual(b.loop, true);
    assert.strictEqual(b.paused, false);
    b.emit('error');
    assert.strictEqual(b.paused, true);
    env.click('btn-start');
    env.clickStage(1);
    await env.runUntil(() => I.state.phase === 'playing', 20000);
    assert.deepStrictEqual(env.errors, []);
  } finally { env.dispose(); }
});

test('탭 숨김: 시작 화면 곡은 멈추고(currentTime 유지) 다시 보이면 이어서, 플레이 중이면 일시정지', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 37 });
  try {
    const I = env.I;
    env.input('click');
    const b = env.bgm();
    b.currentTime = 12;
    env.reset();
    env.hidden = true; env.input('visibilitychange');
    assert.strictEqual(b.paused, true);
    assert.strictEqual(b.currentTime, 12);
    env.hidden = false; env.input('visibilitychange');
    assert.strictEqual(b.paused, false);
    assert.strictEqual(env.mp3('play').pop().from, 12, '이어서');
    assert.strictEqual(env.mp3('src').length, 0, '곡을 다시 받지 않는다');
    // 플레이 중
    await env.startPlaying(1);
    env.hidden = true; env.input('visibilitychange');
    assert.strictEqual(I.state.phase, 'paused');
    assert.strictEqual(b.paused, true);
    env.hidden = false; env.input('visibilitychange');
    assert.strictEqual(b.paused, true, '보이면 일시정지 상태 유지(재개 버튼으로 이어간다)');
    I.resumeGame();
    assert.strictEqual(b.paused, false);
  } finally { env.dispose(); }
});

test('자동재생 정책으로 play() 가 거절되면(NotAllowedError) 첫 입력 핸들러가 다시 걸려 다음 입력에서 시작된다', async () => {
  const env = createEnv({ audio: true, saved: save1() });
  try {
    env.playError = 'NotAllowedError';
    env.input('touchend');
    await env.runFor(10);
    assert.strictEqual(env.docListenerCount('click') >= 1, true, '핸들러가 다시 걸렸다');
    env.playError = null;
    env.reset();
    env.input('click');
    assert.strictEqual(env.mp3('play').length >= 1, true);
    assert.strictEqual(env.bgm().paused, false);
    assert.deepStrictEqual(env.errors, []);
  } finally { env.dispose(); }
});

test('init 이 실패하거나 요소 생성이 예외를 내도(가짜 Audio 가 던짐) 오류 없이 무음으로 계속된다', async () => {
  const env = createEnv({ audio: false, saved: save1() });
  try {
    env.sandbox.Audio = function () { throw new Error('Audio 사용 불가'); };
    env.input('click');
    env.click('btn-start');
    env.clickStage(1);
    await env.runUntil(() => env.I.state.phase === 'playing', 20000);
    env.I.finishStage();
    env.I.goStages();
    assert.deepStrictEqual(env.errors, []);
    assert.strictEqual(env.timersMade.filter((t) => t.inAudio).length, 0);
  } finally { env.dispose(); }
});

test('볼륨은 항상 0~1 범위 (페이드 중에도)', async () => {
  const env = createEnv({ audio: true, saved: save1(), seed: 2 });
  try {
    env.input('click');
    env.click('btn-start');
    env.clickStage(1);
    for (let i = 0; i < 40; i++) {
      await env.runFor(20);
      const v = env.bgm().volume;
      assert.ok(v >= 0 && v <= 1, 'volume ' + v);
    }
  } finally { env.dispose(); }
});

/* ===================================================================
 * 5) [EDU] 문제 팝업·? 선물상자와 소리 (spec §22.6 B2, §21.7)
 *    교육용 game.js 의 runQuizzes 는 문제 팝업 동안 audio.duck(true) -> 끝나면 duck(false) 를 부른다.
 *    duck 의 의미(곡 음량을 bgmDuck 으로)는 §22 에서 바뀌지 않았으므로 새 엔진 위에서도 같게 동작해야 한다.
 * =================================================================== */
function patternBoard() {       // 같은 종류가 이웃하지 않는 무늬(0~4 종류): 매치가 전혀 없다
  const g = [];
  for (let r = 0; r < 8; r++) { const row = []; for (let c = 0; c < 8; c++) row.push((r * 3 + c * 2) % 5); g.push(row); }
  return g;
}
const W = G.WILD;
/** 3행: A A X ? -> (3,2)<->(3,3) 교환하면 A A ? 로 매치(? 한 개가 지워진다) */
function quizBoard() {
  const B = patternBoard();
  B[3][3] = W;
  B[3][0] = 0; B[3][1] = 0; B[3][2] = 1; B[2][2] = 3; B[4][2] = 4; B[2][3] = 2; B[4][3] = 3;
  assert.strictEqual(G.findMatches(B).length, 0, '시나리오 시작 보드에 매치가 있음');
  assert.ok(G.hasValidMove(B));
  return B;
}
function applyBoard(env, types) {
  const I = env.I;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) I.setGemType(I.state.grid[r][c], types[r][c]);
}
/** EduQuiz 가짜: ask() 는 thinkMs 뒤에 답한다. onAsk(rec, st, env) 는 팝업이 열린 순간 불린다 */
function makeQuiz(env, o) {
  const opt = o || {};
  const quiz = {
    ready: true, cancelled: 0, asks: [],
    ask() {
      const st = env.I.state;
      const rec = { t0: env._now, timeLeft: st.timeLeft, score: st.score, active: st.quizActive, locked: st.locked, index: quiz.asks.length };
      quiz.asks.push(rec);
      if (opt.onAsk) opt.onAsk(rec, st, env);
      return new Promise((resolve) => env.timers.setTimeout(() => {
        rec.t1 = env._now;
        rec.timeLeftAfter = st.timeLeft;
        rec.scoreAfter = st.score;
        if (opt.beforeAnswer) opt.beforeAnswer(rec, st, env);
        resolve(opt.answer ? opt.answer(rec, st) : { right: true, bonus: G.bonusFor(st.level) });
      }, opt.thinkMs == null ? 1500 : opt.thinkMs));
    },
    unitLabel() { return '5학년 2학기 · 1-(1) 시험 단원'; },
    cancel() { quiz.cancelled++; }
  };
  return quiz;
}
/** 가짜 Audio 가 있는 환경에서 플레이 중(? 한 개가 있는 보드)까지 준비한다. duckCalls 로 audio.duck 호출 기록을 본다 */
async function quizScenario(o) {
  const opt = o || {};
  const env = createEnv({ audio: true, saved: save1(), seed: opt.seed || 1 });
  const I = env.I;
  I.CONFIG.edu.wild.spawn = 0;                      // 새 ? 는 나오지 않는다(시나리오가 직접 놓는다)
  I.CONFIG.stages.targets.normal[0] = opt.target || 50000;
  env.quiz = makeQuiz(env, opt.quiz);
  env.sandbox.EduQuiz = env.quiz;
  env.duckCalls = [];
  const origDuck = I.audio.duck.bind(I.audio);
  I.audio.duck = function (on) { env.duckCalls.push(!!on); return origDuck(on); };
  await env.startPlaying(1);
  applyBoard(env, quizBoard());
  env.finishAction = () => env.runUntil(() => !I.state.locked || I.state.phase !== 'playing', 120000);
  return env;
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('[EDU] ? 선물상자를 직접 매치로 지우면 문제 팝업 동안 BGM 이 bgmDuck 으로 내려가고(곡·재생은 그대로), 답한 뒤 원래 음량으로 돌아온다. 정답 보너스·시계 정지도 그대로', async () => {
  const seen = {};
  const env = await quizScenario({
    seed: 3,
    quiz: {
      thinkMs: 2500,
      onAsk: (rec, st, e) => {
        const b = e.bgm();
        seen.vol = b.volume; seen.paused = b.paused; seen.src = b.src; seen.muted = b.muted; seen.ducked = e.I.audio.ducked; seen.quizActive = st.quizActive;
      }
    }
  });
  const I = env.I;
  const b = env.bgm();
  const track = b.src;
  assert.ok(near(b.volume, CFG.audio.bgm), '문제 전 평소 음량');
  assert.strictEqual(b.paused, false);
  env.reset();
  const score0 = I.state.score;
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.finishAction();
  assert.strictEqual(env.quiz.asks.length, 1, '? 하나 -> 문제 1개');
  assert.strictEqual(seen.quizActive, true);
  assert.strictEqual(seen.ducked, true);
  assert.ok(near(seen.vol, CFG.audio.bgmDuck), '팝업 중 음량 = bgmDuck: ' + seen.vol);
  assert.strictEqual(seen.paused, false, '덕킹은 일시정지가 아니다');
  assert.strictEqual(seen.src, track, '팝업 때문에 곡이 바뀌지 않는다');
  assert.strictEqual(seen.muted, false);
  // 문제 동안 시계 정지(회귀) + 매치 점수는 먼저 정산, 보너스는 닫힌 뒤 +900 (spec §28.7.4: 정답 보너스 ×3, 예전 300)
  const a = env.quiz.asks[0];
  assert.strictEqual(a.timeLeftAfter, a.timeLeft, '문제 중 남은 시간 불변');
  assert.ok(a.t1 - a.t0 >= 2500);
  assert.ok(a.score > score0, '매치 점수가 먼저 정산된다');
  assert.strictEqual(a.scoreAfter, a.score, '팝업이 열려 있는 동안 점수 불변');
  assert.strictEqual(I.state.score - a.score, 900, '정답 보너스 900(중수, §28.7.4 ×3)');
  assert.strictEqual(I.state.edu.asked + '/' + I.state.edu.right + '/' + I.state.edu.bonus, '1/1/900');
  // 닫힌 뒤: 평소 음량, 덕킹 해제, 같은 곡이 계속 흐름(새 src·새 play 없음)
  assert.strictEqual(I.audio.ducked, false);
  assert.ok(near(b.volume, CFG.audio.bgm), '답한 뒤 평소 음량: ' + b.volume);
  assert.strictEqual(b.paused, false);
  assert.strictEqual(b.src, track);
  assert.strictEqual(env.mp3('src').length, 0, '문제 흐름에서 새 곡 요청 0');
  assert.strictEqual(env.mp3('play').length, 0, '문제 흐름에서 play() 호출 0 (곡을 다시 시작하지 않는다)');
  assert.strictEqual(env.mp3('pause').length, 0);
  assert.deepStrictEqual(env.duckCalls, [true, false], '덕킹은 팝업당 한 쌍');
  assert.strictEqual(I.state.quizActive, false);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 문제 팝업이 떠 있는 동안 곡이 끝나도(ended) 안전: 직전 곡을 뺀 다른 곡이 이어서 재생되고 덕킹은 유지, 답한 뒤 평소 음량', async () => {
  const seen = {};
  const env = await quizScenario({
    seed: 17,
    quiz: {
      thinkMs: 3000,
      onAsk: (rec, st, e) => {
        const b = e.bgm();
        seen.first = b.src;
        e.reset();
        b.emit('ended');                                    // 팝업 중 곡이 끝남
        seen.srcs1 = e.mp3('src').map((x) => x.v);
        seen.plays1 = e.mp3('play').length;
        seen.vol1 = b.volume; seen.paused1 = b.paused; seen.loop1 = b.loop; seen.phase1 = st.phase; seen.second = b.src;
        e.reset();
        b.emit('ended');                                    // 한 번 더
        seen.srcs2 = e.mp3('src').map((x) => x.v);
        seen.vol2 = b.volume; seen.third = b.src;
        e.reset();
        b.emit('error');                                    // 그 곡을 받지 못함 -> 다른 곡으로 재시도
        seen.srcs3 = e.mp3('src').map((x) => x.v);
        seen.vol3 = b.volume; seen.paused3 = b.paused;
      }
    }
  });
  const I = env.I;
  const b = env.bgm();
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.finishAction();
  assert.strictEqual(seen.phase1, 'playing');
  assert.strictEqual(seen.srcs1.length, 1, '곡 하나만 올림');
  assert.notStrictEqual(seen.second, seen.first, '직전 곡 제외');
  assert.ok(CFG.assets.music.play.indexOf(seen.second) !== -1);
  assert.strictEqual(seen.plays1, 1);
  assert.strictEqual(seen.paused1, false);
  assert.strictEqual(seen.loop1, false);
  assert.ok(near(seen.vol1, CFG.audio.bgmDuck), '곡이 바뀌어도 덕킹 유지: ' + seen.vol1);
  assert.strictEqual(seen.srcs2.length, 1);
  assert.notStrictEqual(seen.third, seen.second);
  assert.ok(near(seen.vol2, CFG.audio.bgmDuck));
  assert.strictEqual(seen.srcs3.length, 1, 'error 도 안전: 다른 곡으로 대체');
  assert.notStrictEqual(seen.srcs3[0], seen.third);
  assert.ok(near(seen.vol3, CFG.audio.bgmDuck));
  assert.strictEqual(seen.paused3, false);
  // 답한 뒤
  assert.strictEqual(I.audio.ducked, false);
  assert.ok(near(b.volume, CFG.audio.bgm), '답한 뒤 평소 음량: ' + b.volume);
  assert.strictEqual(b.paused, false);
  assert.strictEqual(I.state.score - env.quiz.asks[0].score, 900, '정답 보너스는 그대로(중수 900, §28.7.4 ×3)');
  assert.strictEqual(I.state.quizActive, false);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 문제 팝업 중 소리 토글: 음소거로 곡은 계속 흐르고(덕킹 유지), 켜면 다시 들린다. 새 곡 요청·재시작 없음', async () => {
  const seen = {};
  const env = await quizScenario({
    seed: 4,
    quiz: {
      thinkMs: 2000,
      onAsk: (rec, st, e) => {
        const b = e.bgm();
        e.reset();
        e.I.toggleSound();                                  // 끔
        seen.mutedOff = b.muted; seen.pausedOff = b.paused; seen.volOff = b.volume;
        e.I.toggleSound();                                  // 켬
        seen.mutedOn = b.muted; seen.pausedOn = b.paused; seen.volOn = b.volume;
        seen.srcs = e.mp3('src').length; seen.plays = e.mp3('play').length;
      }
    }
  });
  const I = env.I;
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.finishAction();
  assert.strictEqual(seen.mutedOff, true);
  assert.strictEqual(seen.pausedOff, false, '끔은 음소거일 뿐 곡은 흐른다');
  assert.ok(near(seen.volOff, CFG.audio.bgmDuck));
  assert.strictEqual(seen.mutedOn, false);
  assert.strictEqual(seen.pausedOn, false);
  assert.ok(near(seen.volOn, CFG.audio.bgmDuck));
  assert.strictEqual(seen.srcs, 0, '다시 켜도 곡을 새로 받지 않는다');
  assert.strictEqual(seen.plays, 0, '다시 시작하지 않는다');
  assert.ok(near(env.bgm().volume, CFG.audio.bgm));
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 문제 도중 다시 시작(eduAbortQuiz): 덕킹이 풀린 채 새 판 곡(직전 곡 제외)이 평소 음량으로 시작된다', async () => {
  let reached = false;
  const env = await quizScenario({ seed: 8, quiz: { thinkMs: 6000, onAsk: () => { reached = true; } } });
  const I = env.I;
  const b = env.bgm();
  const first = b.src;
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.runUntil(() => reached, 30000);
  assert.strictEqual(I.state.quizActive, true);
  assert.strictEqual(I.audio.ducked, true);
  assert.ok(near(b.volume, CFG.audio.bgmDuck));
  env.reset();
  I.startStage(1);                                          // 문제 도중 재시작
  assert.strictEqual(I.state.quizActive, false);
  assert.strictEqual(I.audio.ducked, false, '재시작이 덕킹을 풀었다');
  assert.strictEqual(env.quiz.cancelled, 1);
  await env.runUntil(() => I.state.phase === 'playing', 30000);
  const picks = env.mp3('src').filter((e) => /play-|bgm/.test(e.v)).map((e) => e.v);
  assert.strictEqual(picks.length, 1, '새 판 곡 1개');
  assert.notStrictEqual(picks[0], first, '직전 곡 제외');
  assert.ok(near(b.volume, CFG.audio.bgm), '새 판 음량: ' + b.volume);
  assert.strictEqual(b.paused, false);
  await env.runFor(10000);                                  // 예전 문제가 늦게 끝나도 새 판의 소리를 건드리지 않는다
  assert.ok(near(b.volume, CFG.audio.bgm));
  assert.strictEqual(I.audio.ducked, false);
  assert.strictEqual(I.state.score, 0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 스킬로 지운 ?: 문제 팝업 없음, 덕킹은 컷인 한 쌍뿐이고 끝나면 평소 음량 (회귀)', async () => {
  const env = await quizScenario({ seed: 12, quiz: { thinkMs: 2000 } });
  const I = env.I;
  const b = env.bgm();
  const types = I.typeGrid();
  assert.strictEqual(G.countWild(types), 1);
  env.reset();
  I.state.gauge[0] = I.CONFIG.types[0].max;                // 불: 3×3
  I.onGauge(0);
  assert.notStrictEqual(I.state.aim, null, '조준 상태');
  I.handleTap(3, 4);                                        // (3,3) 의 ? 가 범위 안
  await env.finishAction();
  assert.strictEqual(env.quiz.asks.length, 0, '스킬이 ? 를 지워도 문제 없음');
  assert.strictEqual(I.state.edu.asked, 0);
  assert.deepStrictEqual(env.duckCalls, [true, false], '컷인 덕킹 한 쌍');
  assert.strictEqual(I.audio.ducked, false);
  assert.ok(near(b.volume, CFG.audio.bgm));
  assert.strictEqual(b.paused, false);
  assert.strictEqual(env.mp3('src').length, 0);
  assert.strictEqual(env.mp3('play').length, 0);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 문제 보너스로 목표를 넘겨 클리어: 결과 화면은 BGM 없음(일반용과 같음)·덕킹 해제, [레벨 선택] 이면 시작 화면 곡', async () => {
  const env = await quizScenario({
    seed: 21,
    quiz: { thinkMs: 1000, onAsk: (rec, st) => { st.target = st.score + 100; }, answer: () => ({ right: true, bonus: 300 }) }
  });
  const I = env.I;
  const b = env.bgm();
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.finishAction();
  assert.strictEqual(I.state.phase, 'over', '보너스로 목표 달성 -> 클리어');
  assert.strictEqual(b.paused, true, '결과 화면: 곡 정지');
  assert.strictEqual(I.audio.scene, 'none');
  assert.strictEqual(I.audio.ducked, false);
  await env.runFor(3000);
  assert.strictEqual(b.paused, true, '결과 화면에서 소리 나는 곡 없음');
  env.reset();
  env.click('btn-home');                                    // [레벨 선택]
  assert.deepStrictEqual(env.mp3('src').map((e) => base(e.v)), ['menu.mp3']);
  assert.strictEqual(b.paused, false);
  assert.ok(near(b.volume, CFG.audio.bgmMenu));
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});

test('[EDU] 오답이어도 소리 흐름은 같다 (덕킹 해제, 곡 유지, 점수 불변)', async () => {
  const env = await quizScenario({ seed: 6, quiz: { thinkMs: 1200, answer: () => ({ right: false, bonus: 0 }) } });
  const I = env.I;
  const b = env.bgm();
  const track = b.src;
  I.trySwap({ r: 3, c: 2 }, { r: 3, c: 3 });
  await env.finishAction();
  assert.strictEqual(env.quiz.asks.length, 1);
  assert.strictEqual(I.state.score, env.quiz.asks[0].score);
  assert.strictEqual(I.audio.ducked, false);
  assert.ok(near(b.volume, CFG.audio.bgm));
  assert.strictEqual(b.src, track);
  assert.strictEqual(b.paused, false);
  assert.deepStrictEqual(env.errors, []);
  env.dispose();
});
