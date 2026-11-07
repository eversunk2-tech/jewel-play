/* element-gems — game.js
 * 섹션: CONFIG -> 순수 보드 로직 -> 상태 -> 렌더링/애니메이션 -> 입력 -> 스킬
 *       -> 오디오 -> 저장 -> 화면/HUD 흐름 -> 초기화
 */
(function () {
  'use strict';

  /* =====================================================================
   * CONFIG — 모든 수치는 여기에서 조정한다
   * ===================================================================== */
  const CONFIG = {
    rows: 8,
    cols: 8,
    // 순서 = 보석 종류 번호(0~5)
    types: [
      { id: 'fire', name: '불', skill: '화염 폭발', color: '#e5484d', targeted: true, max: 18 },
      { id: 'water', name: '물', skill: '시간 정지', color: '#3b82f6', targeted: false, max: 22 },
      { id: 'grass', name: '풀', skill: '덩굴 십자', color: '#30a46c', targeted: true, max: 18 },
      { id: 'lightning', name: '번개', skill: '연쇄 번개', color: '#f5c518', targeted: false, max: 20 },
      { id: 'dark', name: '어둠', skill: '암흑 배율', color: '#8e4ec6', targeted: false, max: 22 },
      { id: 'light', name: '빛', skill: '빛의 인도', color: '#f4f4f5', targeted: false, max: 24 }
    ],
    // 아래 types[].max / time / timeBonus / hint / skills 는 applyDifficulty()가 선택 난이도 값으로 덮어쓰는 "활성 값" 위치다.
    time: { start: 120, max: 145 },
    anim: { swapMs: 150, removeMs: 220, fallMsPerCell: 80, fallMsMax: 400, shuffleMs: 420 },
    countdown: { stepMs: 600, goMs: 300 },
    input: { dragThreshold: 0.35 },
    score: {
      base: { 3: 50, 4: 100, 5: 200 },   // 6개 이상: 200 + 100 * (size - 5)
      sixPlusStep: 100,
      chainMax: 5,
      skillCell: 10
    },
    timeBonus: { 3: 0.05, 4: 0.1, 5: 0.2, chainExtra: 0 },
    gauge: { extraPerOver3: 1 },          // gain = size + (size - 3) -> 3/5/7/9 (spec 표 기준)
    skills: {
      fire: { radius: 1 },
      water: { freeze: 5 },
      lightning: { count: 8, stepMs: 60 },
      dark: { duration: 8, mult: 2 },
      light: { time: 4, hint: 8 }
    },
    hint: { show: 3, cooldown: 8, auto: 0, autoShow: 0 },   // auto: 무입력 N초 후 자동 힌트(0=없음)
    scoreMult: 1,
    level: 'normal',
    defaultLevel: 'normal',
    // spec §15.2 난이도 프리셋을 §17.2(2분 + 스테이지)로 갱신 (게이지 최대치 순서: 불·물·풀·번개·어둠·빛)
    difficulty: {
      easy: {
        label: '초보', desc: '시간이 넉넉하고 스킬이 빨리 차요. 막히면 힌트가 자동으로 나와요.',
        max: [12, 14, 12, 13, 14, 16],
        time: { start: 130, max: 155 },
        timeBonus: { 3: 0.06, 4: 0.12, 5: 0.25, chainExtra: 0 },
        hint: { show: 4, cooldown: 4, auto: 6, autoShow: 4 },
        skills: { waterFreeze: 7, darkDuration: 12, lightTime: 5, lightHint: 10, boltCount: 10 },
        scoreMult: 0.8
      },
      normal: {
        label: '중수', desc: '기본 규칙. 균형 잡힌 2분 승부!',
        max: [13, 16, 13, 14, 16, 18],
        time: { start: 120, max: 145 },
        timeBonus: { 3: 0.05, 4: 0.1, 5: 0.2, chainExtra: 0 },
        hint: { show: 3, cooldown: 8, auto: 0, autoShow: 0 },
        skills: { waterFreeze: 5, darkDuration: 8, lightTime: 4, lightHint: 8, boltCount: 8 },
        scoreMult: 1.0
      },
      hard: {
        label: '고수', desc: '시간이 짧고 보너스가 적어요. 대신 점수 ×1.3!',
        max: [14, 17, 14, 16, 17, 19],
        time: { start: 100, max: 120 },
        timeBonus: { 3: 0.04, 4: 0.08, 5: 0.15, chainExtra: 0 },
        hint: { show: 2, cooldown: 12, auto: 0, autoShow: 0 },
        skills: { waterFreeze: 4, darkDuration: 6, lightTime: 3, lightHint: 5, boltCount: 7 },
        scoreMult: 1.3
      }
    },
    // spec §17.4 스테이지 목표 점수(표시 점수 기준). 실제 플레이 후 이 표만 조정하면 된다.
    stages: {
      count: 10,
      star: [0.3, 0.5],                   // 클리어 시 남은 시간 비율 >= 0.3 -> ★★, >= 0.5 -> ★★★
      // 4차 Review 시뮬레이션(72,000판) 후 하향 조정: 레벨2~10 초보 -10%/중수 -8%/고수 -7%, 초보 L8~10 추가 -5%. 사람 플레이 후 재조정.
      targets: {
        easy: [6100, 6400, 7100, 7700, 8500, 9100, 9700, 10000, 10900, 12400],
        normal: [6500, 6900, 7700, 8500, 9200, 9800, 10600, 11400, 12500, 14200],
        hard: [6900, 7400, 8300, 9100, 9900, 10500, 11300, 12200, 13400, 15200]
      }
    },
    multReturn: 1.0,                      // 행동 종료 후 배율 표시가 x1로 돌아오기까지(초)
    praiseThreshold: 5000,
    particleCap: 60,
    noMovesPauseMs: 500,
    cutin: { ms: 1300, offMs: 500, reducedMs: 600 },   // ms 값은 style.css의 컷인 애니메이션 길이(1.3s)와 맞춘다
    audio: { bgm: 0.35, bgmDuck: 0.15, sfx: 0.8 },
    assets: { gems: 'assets/gems/', cutin: 'assets/cutin/', sfx: 'assets/sfx/', bgm: 'assets/music/bgm.mp3', loadTimeoutMs: 2500 },
    // spec §19: 별 챔피언 명예의 전당. apiBase가 비어 있으면 프로필·명예의 전당 UI와 네트워크 호출이 전부 꺼진다(기본 배포 상태).
    // 배포 후 Worker 주소(예: 'https://element-gems-hall.<계정>.workers.dev')를 넣는다. 로컬 시험 주소는 커밋하지 않는다.
    ranking: {
      apiBase: '',
      timeoutMs: 8000,                                   // 요청 1회 제한 시간
      retryMs: [5000, 15000, 60000, 300000, 900000],     // 제출 실패 백오프(5초→15초→1분→5분→15분 상한)
      minSubmitGapMs: 3000,                              // 서버의 같은 pid 쓰기 간격(3초)을 지킨다
      refreshMinMs: 5000,                                // 순위표 [새로고침] 간격
      resultDelayMs: 1200,                               // 결과 화면이 뜬 뒤 제출까지(컷인·연출과 겹치지 않게)
      hallCacheMaxAgeMs: 259200000,                      // 오프라인용 마지막 순위표 캐시 보관(3일)
      nickChangePerDay: 2,
      pageSize: 50
    }
  };

  // 컷인 캐릭터·대사 (강조색 rgb는 CSS 변수용)
  const CUTIN = {
    fire: { name: '이그니', shout: '타올라라!', skill: '화염 폭발!!', color: '#ff6a2b', rgb: '255,106,43' },
    water: { name: '아쿠아', shout: '얼어붙어라!', skill: '시간 정지!!', color: '#38b6ff', rgb: '56,182,255' },
    grass: { name: '리프', shout: '자라나라!', skill: '덩굴 십자!!', color: '#5fd35f', rgb: '95,211,95' },
    lightning: { name: '볼트', shout: '받아라!', skill: '연쇄 번개!!', color: '#ffd21f', rgb: '255,210,31' },
    dark: { name: '녹스', shout: '어둠이여!', skill: '암흑 배율!!', color: '#b06cff', rgb: '176,108,255' },
    light: { name: '루미', shout: '빛이여!', skill: '빛의 인도!!', color: '#fff2a8', rgb: '255,242,168' }
  };

  const SFX_LIST = ['click', 'select', 'swap', 'invalid', 'match1', 'match2', 'match3', 'match4', 'match5',
    'gauge-full', 'skill-fire', 'skill-water', 'skill-grass', 'skill-lightning', 'skill-dark', 'skill-light',
    'praise-good', 'praise-great', 'praise-awesome', 'praise-excellent', 'countdown', 'go', 'warning',
    'timeup', 'newbest', 'shuffle'];
  // 코드 내부 이름 -> 파일 이름
  const SFX_ALIAS = { tick: 'countdown', full: 'gauge-full', nomoves: 'shuffle', end: 'timeup' };
  const SFX_POOL3 = ['click', 'select', 'swap', 'match1', 'match2', 'match3', 'match4', 'match5'];

  const ROWS = CONFIG.rows;
  const COLS = CONFIG.cols;
  const TYPES = CONFIG.types;
  const TYPE_COUNT = TYPES.length;

  /* =====================================================================
   * 순수 보드 로직 (DOM 없음) — 보드는 2D 배열, 칸 값은 종류 번호 또는 null
   * ===================================================================== */
  function makeMatrix(rows, cols, fill) {
    const m = [];
    for (let r = 0; r < rows; r++) m.push(new Array(cols).fill(fill));
    return m;
  }

  /** 가로/세로 3개 이상 연속 또는 2×2 정사각형을 이룬 칸을, 같은 색끼리 연결해 그룹으로 반환 */
  function findMatches(g) {
    const R = g.length;
    const C = g[0].length;
    const mark = makeMatrix(R, C, false);
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        const t = g[r][c];
        if (t == null) { c++; continue; }
        let e = c + 1;
        while (e < C && g[r][e] === t) e++;
        if (e - c >= 3) for (let k = c; k < e; k++) mark[r][k] = true;
        c = e;
      }
    }
    for (let c = 0; c < C; c++) {
      let r = 0;
      while (r < R) {
        const t = g[r][c];
        if (t == null) { r++; continue; }
        let e = r + 1;
        while (e < R && g[e][c] === t) e++;
        if (e - r >= 3) for (let k = r; k < e; k++) mark[k][c] = true;
        r = e;
      }
    }
    // 2×2 정사각형 (spec §16): 같은 종류 4칸이 정사각형이면 마킹
    for (let r = 0; r + 1 < R; r++) {
      for (let c = 0; c + 1 < C; c++) {
        const t = g[r][c];
        if (t != null && g[r][c + 1] === t && g[r + 1][c] === t && g[r + 1][c + 1] === t) {
          mark[r][c] = mark[r][c + 1] = mark[r + 1][c] = mark[r + 1][c + 1] = true;
        }
      }
    }
    const seen = makeMatrix(R, C, false);
    const groups = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!mark[r][c] || seen[r][c]) continue;
        const t = g[r][c];
        const cells = [];
        const stack = [[r, c]];
        seen[r][c] = true;
        while (stack.length) {
          const cur = stack.pop();
          cells.push({ r: cur[0], c: cur[1] });
          for (let d = 0; d < 4; d++) {
            const nr = cur[0] + dirs[d][0];
            const nc = cur[1] + dirs[d][1];
            if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
            if (!mark[nr][nc] || seen[nr][nc] || g[nr][nc] !== t) continue;
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
        groups.push({ type: t, cells: cells, size: cells.length });
      }
    }
    return groups;
  }

  /** (r,c) 칸이 가로 또는 세로 3연속에 속하는지 */
  function lineAt(g, r, c) {
    const R = g.length;
    const C = g[0].length;
    const t = g[r][c];
    if (t == null) return false;
    let n = 1;
    for (let k = c - 1; k >= 0 && g[r][k] === t; k--) n++;
    for (let k = c + 1; k < C && g[r][k] === t; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let k = r - 1; k >= 0 && g[k][c] === t; k--) n++;
    for (let k = r + 1; k < R && g[k][c] === t; k++) n++;
    return n >= 3;
  }

  /** (r,c) 칸을 포함하는 2×2 정사각형(같은 종류 4칸)이 있는지 */
  function squareAt(g, r, c) {
    const R = g.length;
    const C = g[0].length;
    const t = g[r][c];
    if (t == null) return false;
    for (let dr = -1; dr <= 0; dr++) {
      for (let dc = -1; dc <= 0; dc++) {
        const r0 = r + dr;
        const c0 = c + dc;
        if (r0 < 0 || c0 < 0 || r0 + 1 >= R || c0 + 1 >= C) continue;
        if (g[r0][c0] === t && g[r0][c0 + 1] === t && g[r0 + 1][c0] === t && g[r0 + 1][c0 + 1] === t) return true;
      }
    }
    return false;
  }

  /** 두 칸을 바꾸면 매치(3연속 또는 2×2)가 생기는지 (원본 보드는 변경하지 않고 반환) */
  function wouldMatch(g, r1, c1, r2, c2) {
    const t1 = g[r1][c1];
    const t2 = g[r2][c2];
    if (t1 == null || t2 == null || t1 === t2) return false;
    g[r1][c1] = t2;
    g[r2][c2] = t1;
    const ok = lineAt(g, r1, c1) || lineAt(g, r2, c2) || squareAt(g, r1, c1) || squareAt(g, r2, c2);
    g[r1][c1] = t1;
    g[r2][c2] = t2;
    return ok;
  }

  function listMoves(g) {
    const moves = [];
    const R = g.length;
    const C = g[0].length;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (c + 1 < C && wouldMatch(g, r, c, r, c + 1)) moves.push({ a: { r: r, c: c }, b: { r: r, c: c + 1 } });
        if (r + 1 < R && wouldMatch(g, r, c, r + 1, c)) moves.push({ a: { r: r, c: c }, b: { r: r + 1, c: c } });
      }
    }
    return moves;
  }

  function hasValidMove(g) {
    const R = g.length;
    const C = g[0].length;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (c + 1 < C && wouldMatch(g, r, c, r, c + 1)) return true;
        if (r + 1 < R && wouldMatch(g, r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  function findHint(g, rng) {
    const moves = listMoves(g);
    if (!moves.length) return null;
    const rand = rng || Math.random;
    return moves[Math.floor(rand() * moves.length)];
  }

  /**
   * 중력: 각 열의 항목을 아래로 내린다. 제네릭(종류 번호/젬 객체 모두 가능).
   * g를 직접 변경하고 { moves:[{c,from,to}], empties:[열별 빈 칸 수] } 반환.
   */
  function applyGravity(g) {
    const R = g.length;
    const C = g[0].length;
    const moves = [];
    const empties = new Array(C).fill(0);
    for (let c = 0; c < C; c++) {
      let write = R - 1;
      for (let r = R - 1; r >= 0; r--) {
        if (g[r][c] != null) {
          if (r !== write) {
            g[write][c] = g[r][c];
            g[r][c] = null;
            moves.push({ c: c, from: r, to: write });
          }
          write--;
        }
      }
      empties[c] = write + 1;
    }
    return { moves: moves, empties: empties };
  }

  /** 초기 보드: 매치(3연속·2×2) 0개 + 유효한 수 1개 이상 */
  function generateBoard(rows, cols, n, rng) {
    const rand = rng || Math.random;
    let g = null;
    for (let attempt = 0; attempt < 1000; attempt++) {
      g = makeMatrix(rows, cols, null);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bad = [];
          if (c >= 2 && g[r][c - 1] === g[r][c - 2]) bad.push(g[r][c - 1]);
          if (r >= 2 && g[r - 1][c] === g[r - 2][c]) bad.push(g[r - 1][c]);
          // 2×2 완성 회피
          if (r >= 1 && c >= 1 && g[r - 1][c - 1] === g[r - 1][c] && g[r - 1][c] === g[r][c - 1]) bad.push(g[r][c - 1]);
          let t;
          do { t = Math.floor(rand() * n); } while (bad.indexOf(t) !== -1);
          g[r][c] = t;
        }
      }
      if (findMatches(g).length === 0 && hasValidMove(g)) return g;
    }
    return g;
  }

  /** 기존 종류 구성은 유지한 채 재배치. 매치(3연속·2×2) 0개 + 유효한 수 >= 1 보장 */
  function shuffleTypes(g, rng) {
    const rand = rng || Math.random;
    const R = g.length;
    const C = g[0].length;
    const flat = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) flat.push(g[r][c]);
    for (let attempt = 0; attempt < 500; attempt++) {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = flat[i]; flat[i] = flat[j]; flat[j] = tmp;
      }
      const out = makeMatrix(R, C, null);
      for (let i = 0; i < flat.length; i++) out[Math.floor(i / C)][i % C] = flat[i];
      if (findMatches(out).length === 0 && hasValidMove(out)) return out;
    }
    return generateBoard(R, C, TYPE_COUNT, rand);
  }

  function fireCells(r, c, rows, cols, radius) {
    const cells = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) cells.push({ r: nr, c: nc });
      }
    }
    return cells;
  }

  function grassCells(r, c, rows, cols) {
    const cells = [];
    for (let k = 0; k < cols; k++) cells.push({ r: r, c: k });
    for (let k = 0; k < rows; k++) if (k !== r) cells.push({ r: k, c: c });
    return cells;
  }

  function baseScore(size) {
    if (size >= 6) return CONFIG.score.base[5] + CONFIG.score.sixPlusStep * (size - 5);
    return CONFIG.score.base[size] || 0;
  }
  function chainMult(step) { return Math.min(Math.max(step, 1), CONFIG.score.chainMax); }
  /** 매치 그룹의 시간 보너스(초). §17: 감쇠 제거 — 3번째 인자는 호환용으로 무시한다 */
  function timeBonusFor(size, step) {
    const b = size >= 5 ? CONFIG.timeBonus[5] : CONFIG.timeBonus[size] || 0;
    let v = b + (step >= 2 ? CONFIG.timeBonus.chainExtra : 0);
    return v;
  }
  /** 선택한 난이도의 프리셋을 활성 값 위치(CONFIG.types[].max, time, timeBonus, hint, skills, scoreMult)에 복사 */
  function applyDifficulty(level) {
    const lv = CONFIG.difficulty[level] ? level : CONFIG.defaultLevel;
    const d = CONFIG.difficulty[lv];
    TYPES.forEach(function (t, i) { t.max = d.max[i]; });
    CONFIG.time.start = d.time.start;
    CONFIG.time.max = d.time.max;
    CONFIG.timeBonus[3] = d.timeBonus[3];
    CONFIG.timeBonus[4] = d.timeBonus[4];
    CONFIG.timeBonus[5] = d.timeBonus[5];
    CONFIG.timeBonus.chainExtra = d.timeBonus.chainExtra;
    CONFIG.hint.show = d.hint.show;
    CONFIG.hint.cooldown = d.hint.cooldown;
    CONFIG.hint.auto = d.hint.auto;
    CONFIG.hint.autoShow = d.hint.autoShow;
    CONFIG.skills.water.freeze = d.skills.waterFreeze;
    CONFIG.skills.dark.duration = d.skills.darkDuration;
    CONFIG.skills.light.time = d.skills.lightTime;
    CONFIG.skills.light.hint = d.skills.lightHint;
    CONFIG.skills.lightning.count = d.skills.boltCount;
    CONFIG.scoreMult = d.scoreMult;
    CONFIG.level = lv;
    return lv;
  }

  function gaugeGain(size) { return size + CONFIG.gauge.extraPerOver3 * (size - 3); }

  /** 칭찬 등급: 한 행동에서 가장 높은 하나 */
  /* ---------- 스테이지 (spec §17) 순수 함수 ---------- */
  const LEVELS = ['easy', 'normal', 'hard'];

  /** 타이머 표기: 60초 이상이면 m:ss(120 -> 2:00, 61 -> 1:01, 60 -> 1:00), 미만은 숫자만 */
  function fmtTime(sec) {
    const n = Math.max(0, Math.ceil(sec - 1e-9));
    if (n >= 60) {
      const s = n % 60;
      return Math.floor(n / 60) + ':' + (s < 10 ? '0' : '') + s;
    }
    return String(n);
  }

  /** 시간 길이 문구: 130 -> '2분 10초', 120 -> '2분', 100 -> '1분 40초', 50 -> '50초' */
  function fmtDur(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m <= 0) return s + '초';
    return m + '분' + (s > 0 ? ' ' + s + '초' : '');
  }

  /** 난이도 diff의 레벨 stage(1~10) 목표 점수. 범위 밖이면 0 */
  function stageTarget(diff, stage) {
    const t = CONFIG.stages.targets[diff];
    return t && stage >= 1 && stage <= t.length ? t[stage - 1] : 0;
  }

  function starsFor(timeLeft, startTime) {
    const ratio = timeLeft / startTime;
    if (ratio >= CONFIG.stages.star[1] - 1e-9) return 3;
    if (ratio >= CONFIG.stages.star[0] - 1e-9) return 2;
    return 1;
  }

  function isCleared(score, target) { return target > 0 && score >= target; }

  /** 레벨 N 선택 가능 = 1 <= N <= progress + 1 (N <= count) */
  function stageUnlocked(progress, stage) {
    return stage >= 1 && stage <= CONFIG.stages.count && stage <= progress + 1;
  }

  function validScore(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }

  /** 난이도 diff의 시작 시간(초). 별 하한 추정·서버 제출용으로 활성 값(CONFIG.time)과 무관하게 프리셋에서 읽는다 */
  function startTimeOf(diff) {
    const d = CONFIG.difficulty[diff];
    return d ? d.time.start : 0;
  }

  /** 남은 시간(초, 소수)을 정수 초(내림)로. 부동소수점 오차 방어(spec §19.2.2) */
  function leftFromTime(timeLeft) {
    return Math.max(0, Math.floor(timeLeft + 1e-6));
  }

  /** 별 개수로 추정한 남은 시간 하한(정수 초). ★★★ >= 50%, ★★ >= 30%, ★ -> 0 (spec §19.2.4 마이그레이션) */
  function leftFloorForStars(diff, stars) {
    const s = startTimeOf(diff);
    if (stars >= 3) return Math.ceil(s * CONFIG.stages.star[1] - 1e-9);
    if (stars === 2) return Math.ceil(s * CONFIG.stages.star[0] - 1e-9);
    return 0;
  }

  function defaultSave() {
    const stages = {};
    LEVELS.forEach(function (k) {
      stages[k] = [];
      for (let i = 0; i < CONFIG.stages.count; i++) stages[k].push({ best: 0, stars: 0, left: 0 });
    });
    return {
      level: 'normal', progress: { easy: 0, normal: 0, hard: 0 }, stages: stages,
      bestByLevel: { easy: 0, normal: 0, hard: 0 }, best: 0,
      bestChain: 0, plays: 0, lastScore: 0, muted: false, tutorialSeen: false, cutin: true
    };
  }

  /** 저장된 JSON(문자열 또는 객체)을 검증·마이그레이션해 새 저장 객체로 반환. 잘못된 값은 모두 기본값 */
  function parseSave(raw) {
    const out = defaultSave();
    let o = raw;
    try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e) { return out; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    ['bestChain', 'plays', 'lastScore'].forEach(function (k) { if (validScore(o[k])) out[k] = o[k]; });
    ['muted', 'tutorialSeen', 'cutin'].forEach(function (k) { if (typeof o[k] === 'boolean') out[k] = o[k]; });
    const legacy = validScore(o.best) ? o.best : 0;
    out.best = legacy;
    if (o.bestByLevel && typeof o.bestByLevel === 'object') {
      LEVELS.forEach(function (k) { if (validScore(o.bestByLevel[k])) out.bestByLevel[k] = o.bestByLevel[k]; });
    } else {
      out.bestByLevel.normal = legacy;       // 60초 판 기록: 보존만 하고 UI에서는 쓰지 않는다
    }
    out.level = LEVELS.indexOf(o.level) !== -1 ? o.level : 'normal';
    // 스테이지 진행도 / 레벨별 기록 (옛 저장에는 없으므로 레벨 1부터)
    LEVELS.forEach(function (k) {
      const arr = o.stages && Array.isArray(o.stages[k]) ? o.stages[k] : null;
      let highestStar = 0;
      if (arr && arr.length === CONFIG.stages.count) {
        const parsed = [];
        let ok = true;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e || typeof e !== 'object') { ok = false; break; }
          let stars = (typeof e.stars === 'number' && e.stars % 1 === 0 && e.stars >= 0 && e.stars <= 3) ? e.stars : 0;
          let left = (typeof e.left === 'number' && e.left % 1 === 0 && e.left >= 0 && e.left <= 200) ? e.left : 0;
          if (stars >= 1) {
            // 별 <-> 남은 시간 일치: left가 없거나 낮으면 별에서 하한을 추정(옛 저장 마이그레이션), 별이 낮으면 left에서 올린다
            left = Math.max(left, leftFloorForStars(k, stars));
            stars = Math.max(stars, starsFor(left, startTimeOf(k)));
          } else {
            left = 0;
          }
          parsed.push({ best: validScore(e.best) ? e.best : 0, stars: stars, left: left });
        }
        if (ok) {
          out.stages[k] = parsed;
          parsed.forEach(function (e, i) { if (e.stars >= 1) highestStar = i + 1; });
        }
      }
      const p = o.progress && o.progress[k];
      const pv = (typeof p === 'number' && p % 1 === 0 && p >= 0 && p <= CONFIG.stages.count) ? p : 0;
      out.progress[k] = Math.max(pv, highestStar);
    });
    return out;
  }

  /** 스테이지 결과를 저장 객체에 반영. 반환: { firstClear, unlocked, improved } — improved = 별 또는 남은 시간(left)이 커졌는가(제출 트리거) */
  function applyStageResult(sv, diff, stage, score, cleared, stars, left) {
    const e = sv.stages[diff][stage - 1];
    if (typeof e.left !== 'number') e.left = 0;
    if (score > e.best) e.best = score;
    let firstClear = false;
    let improved = false;
    if (cleared) {
      const lf = (typeof left === 'number' && isFinite(left) && left > 0) ? Math.floor(left) : 0;
      if (stars > e.stars) { e.stars = stars; improved = true; }       // 최고 별만 갱신
      if (lf > e.left) { e.left = lf; improved = true; }              // 남은 시간 최고 기록만 갱신(줄어드는 갱신 없음)
      if (stage > sv.progress[diff]) { sv.progress[diff] = stage; firstClear = true; }
    }
    return { firstClear: firstClear, unlocked: firstClear && stage < CONFIG.stages.count ? stage + 1 : 0, improved: improved };
  }

  function praiseLevel(maxStep, maxGroup, total) {
    if (maxStep >= 5 || total >= CONFIG.praiseThreshold) return 'EXCELLENT!';
    if (maxStep >= 4) return 'AWESOME!';
    if (maxStep >= 3 || maxGroup >= 5) return 'GREAT!';
    if (maxStep >= 2 || maxGroup >= 4) return 'GOOD!';
    return null;
  }

  /* =====================================================================
   * 테스트용 내보내기 (브라우저에서는 module이 없으므로 무시된다)
   * ===================================================================== */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CONFIG: CONFIG, findMatches: findMatches, squareAt: squareAt, lineAt: lineAt, hasValidMove: hasValidMove, findHint: findHint,
      applyGravity: applyGravity, generateBoard: generateBoard, shuffleTypes: shuffleTypes,
      fireCells: fireCells, grassCells: grassCells, baseScore: baseScore, chainMult: chainMult,
      timeBonusFor: timeBonusFor, applyDifficulty: applyDifficulty,
      fmtTime: fmtTime, fmtDur: fmtDur, stageTarget: stageTarget, starsFor: starsFor, isCleared: isCleared,
      stageUnlocked: stageUnlocked, applyStageResult: applyStageResult, parseSave: parseSave, leftFromTime: leftFromTime, leftFloorForStars: leftFloorForStars, defaultSave: defaultSave, gaugeGain: gaugeGain, praiseLevel: praiseLevel, listMoves: listMoves
    };
  }
  if (typeof document === 'undefined') return;

  /* =====================================================================
   * 명예의 전당 훅 (spec §19) — ranking.js / ranking-ui.js 가 window.ElementGemsHost 로 연결한다.
   * 이 파일은 이벤트만 내보낸다: init / renderStart / stageResult. 리스너가 없으면 아무 일도 하지 않는다.
   * ===================================================================== */
  const listeners = {};
  let inited = false;
  function emit(name, data) {
    (listeners[name] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { /* 랭킹 쪽 오류가 게임을 멈추지 않게 삼킨다 */ }
    });
  }

  /* =====================================================================
   * 상태
   * ===================================================================== */
  const ABORT = { aborted: true };

  const state = {
    gameId: 0,
    phase: 'start',        // start | countdown | playing | paused | over
    pausedFrom: null,
    locked: false,
    grid: makeMatrix(ROWS, COLS, null),   // 젬 객체 격자
    score: 0,
    shown: 0,
    timeLeft: CONFIG.time.start,
    timeUp: false,
    gauge: new Array(TYPE_COUNT).fill(0),
    full: new Array(TYPE_COUNT).fill(false),
    freeze: 0,
    dark: 0,
    chain: 1,
    multHold: 0,
    hint: null,
    hintLeft: 0,
    hintCd: 0,
    aim: null,
    sel: null,
    cursor: { r: 0, c: 0 },
    kbd: false,
    stats: { maxChain: 0, skills: 0, matches: 0 },
    confirmFrom: null,
    cutinActive: false,
    warnSec: 99,
    level: 'normal',
    stage: 1,         // 현재(또는 마지막) 스테이지 레벨 1~10
    target: 0,        // 이번 스테이지 목표 점수
    startTime: 120,   // 별 계산 기준 시작 시간
    idle: 0
  };

  let gemSeq = 0;
  let liveParticles = 0;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* DOM 참조 */
  const $ = function (id) { return document.getElementById(id); };
  const el = {};

  function cacheDom() {
    ['screen-start', 'screen-game', 'screen-stages', 'start-clear', 'start-stars', 'rule-stage', 'stage-grid', 'stages-chip', 'stages-time', 'stages-summary', 'btn-stages-back', 'goal', 'goal-fill', 'goal-text', 'count-info', 'btn-next', 'end-unlock', 'end-stars', 'end-target', 'tutorial', 'btn-start', 'btn-sound-start',
      'timer', 'timer-fill', 'timer-text', 'freeze-text', 'scorebar', 'score', 'chain', 'mult',
      'dark-badge', 'dark-left', 'board-wrap', 'board', 'fx', 'popup', 'aim-msg', 'flash', 'gauges',
      'btn-hint', 'btn-menu', 'btn-reset', 'overlay-count', 'count-num', 'overlay-pause', 'btn-resume',
      'btn-restart', 'btn-sound-pause', 'btn-quit', 'overlay-confirm', 'btn-confirm-yes', 'btn-confirm-no',
      'overlay-end', 'end-title', 'level-select', 'level-desc', 'level-chip', 'pause-level', 'end-level', 'btn-cutin-start', 'btn-cutin-pause', 'cutin', 'cutin-img', 'cb-shout', 'cb-skill', 'cn-gem', 'cn-text', 'logo-img', 'title-fallback', 'end-score', 'end-best', 'end-chain', 'end-skills',
      'end-matches', 'btn-again', 'btn-home'
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* =====================================================================
   * 오디오 (WAV 샘플 + MP3 배경음악, HTMLAudioElement 풀 — file://에서도 동작)
   * ===================================================================== */
  function noop() {}
  const audio = {
    ready: false,
    muted: false,
    pools: {},
    bgm: null,
    ducked: false,
    /** 첫 사용자 입력에서 호출: 풀 생성 + 모바일 정책 잠금 해제 */
    init: function () {
      if (this.ready) return;
      this.ready = true;
      try {
        const self = this;
        // 1) 풀마다 첫 요소를 만들어 제스처 안에서 잠금 해제, 2) 나머지 요소는 나눠서 추가(요청 폭주 방지)
        SFX_LIST.forEach(function (name) {
          const a = new Audio(CONFIG.assets.sfx + name + '.wav');
          a.preload = 'auto';
          a.volume = CONFIG.audio.sfx;
          self.pools[name] = { els: [a], i: 0, size: SFX_POOL3.indexOf(name) !== -1 ? 3 : 2 };
          self.unlock(a, false);
        });
        SFX_LIST.forEach(function (name, idx) {
          setTimeout(function () {
            const pool = self.pools[name];
            while (pool.els.length < pool.size) {
              const a = new Audio(CONFIG.assets.sfx + name + '.wav');
              a.preload = 'auto';
              a.volume = CONFIG.audio.sfx;
              pool.els.push(a);
            }
          }, 300 + idx * 40);
        });
        const bgm = new Audio(CONFIG.assets.bgm);
        bgm.loop = true;
        bgm.preload = 'auto';
        this.bgm = bgm;
        this.applyVol();
        this.unlock(bgm, true);
      } catch (e) { /* 오디오 사용 불가: 무음 */ }
    },
    unlock: function (a, isBgm) {
      const self = this;
      function restore() { a.muted = isBgm ? self.muted : false; }
      try {
        a.muted = true;
        const p = a.play();
        if (p && p.then) {
          p.then(function () { a.pause(); a.currentTime = 0; restore(); }).catch(restore);
        } else {
          restore();
        }
      } catch (e) { restore(); }
    },
    applyVol: function () {
      if (this.bgm) this.bgm.volume = this.ducked ? CONFIG.audio.bgmDuck : CONFIG.audio.bgm;
    },
    setMuted: function (v) {
      this.muted = v;
      if (this.bgm) this.bgm.muted = v;
    },
    play: function (name, n) {
      if (!this.ready || this.muted) return;
      let key = SFX_ALIAS[name] || name;
      if (key === 'match') key = 'match' + Math.min(Math.max(n || 1, 1), 5);
      const pool = this.pools[key];
      if (!pool) return;
      const a = pool.els[pool.i];
      pool.i = (pool.i + 1) % pool.els.length;
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(noop);
      } catch (e) { /* 무시 */ }
    },
    bgmPlay: function (fromStart) {
      if (!this.ready || !this.bgm) return;
      try {
        if (fromStart) this.bgm.currentTime = 0;
        this.bgm.muted = this.muted;
        this.applyVol();
        const p = this.bgm.play();
        if (p && p.catch) p.catch(noop);
      } catch (e) { /* 무시 */ }
    },
    bgmPause: function () {
      try { if (this.bgm) this.bgm.pause(); } catch (e) { /* 무시 */ }
    },
    bgmStop: function () {
      try {
        if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; }
      } catch (e) { /* 무시 */ }
    },
    duck: function (on) {
      this.ducked = on;
      this.applyVol();
    }
  };
  function sfx(name, n) { audio.play(name, n); }

  /* =====================================================================
   * 저장 (localStorage, 모든 접근 try/catch)
   * ===================================================================== */
  const STORAGE_KEY = 'element-gems:v1';
  // 저장 객체: 구조/검증은 순수 함수 parseSave()가 담당한다.
  // level = 난이도(easy/normal/hard), progress/stages = 스테이지 진행(§17.7), bestByLevel/best = 60초 판 기록(보존만, UI 미사용)
  const save = defaultSave();

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = parseSave(raw);
      Object.keys(parsed).forEach(function (k) { save[k] = parsed[k]; });
    } catch (e) { /* 저장소 사용 불가: 기본값 유지 */ }
  }
  function writeSave() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch (e) { /* 저장 실패는 무시 */ }
  }

  /* =====================================================================
   * 유틸 / 대기(일시정지·중단 인지)
   * ===================================================================== */
  function randInt(n) { return Math.floor(Math.random() * n); }
  function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

  /** 애니메이션 단계 대기. 일시정지 중이면 풀릴 때까지 기다리고, 게임이 바뀌면 중단 */
  function wait(ms) {
    const id = state.gameId;
    return new Promise(function (resolve, reject) {
      setTimeout(function check() {
        if (id !== state.gameId) { reject(ABORT); return; }
        if (state.phase === 'paused') { setTimeout(check, 100); return; }
        resolve();
      }, ms);
    });
  }

  function typeGrid() {
    return state.grid.map(function (row) {
      return row.map(function (g) { return g ? g.type : null; });
    });
  }

  /* =====================================================================
   * 렌더링 / 애니메이션
   * ===================================================================== */
  function placeGem(gem, ms) {
    gem.el.style.setProperty('--t', (ms == null ? CONFIG.anim.swapMs : ms) + 'ms');
    gem.el.style.setProperty('--r', gem.r);
    gem.el.style.setProperty('--c', gem.c);
  }

  /* ---------- 이미지 미리 로드 / 폴백 ---------- */
  const gemOk = {};
  const cutinOk = {};
  let assetsReady = Promise.resolve();

  function loadImage(src, retry) {
    return new Promise(function (resolve) {
      const img = new Image();
      let settled = false;
      function done(ok) { if (!settled) { settled = true; resolve(ok); } }
      img.onload = function () {
        if (!img.decode) { done(true); return; }
        // decode가 오래 걸리거나(백그라운드 탭 등) 실패해도 로드 성공으로 간주
        const t = setTimeout(function () { done(true); }, 1000);
        img.decode().then(function () { clearTimeout(t); done(true); }, function () { clearTimeout(t); done(true); });
      };
      img.onerror = function () {
        // 일시적 네트워크 오류 대비: 한 번만 재시도, 그래도 실패하면 폴백
        if (retry === false) { done(false); return; }
        setTimeout(function () { loadImage(src, false).then(done); }, 400);
      };
      img.src = src;
    });
  }

  function preloadAssets() {
    const ps = [];
    TYPES.forEach(function (t) {
      ps.push(loadImage(CONFIG.assets.gems + t.id + '.webp').then(function (ok) { gemOk[t.id] = ok; }));
      ps.push(loadImage(CONFIG.assets.cutin + t.id + '.webp').then(function (ok) { cutinOk[t.id] = ok; }));
    });
    assetsReady = Promise.all(ps).then(function () { buildGauges(); });
    return assetsReady;
  }

  /** 3D 보석 이미지. 로드 실패 시 SVG 도형으로 폴백 */
  function gemMarkup(type) {
    const id = TYPES[type].id;
    if (gemOk[id]) return '<img class="gi" src="' + CONFIG.assets.gems + id + '.webp" alt="" draggable="false">';
    return '<svg class="gi" viewBox="0 0 100 100" aria-hidden="true"><use href="#gem-' + id + '"></use></svg>';
  }

  function createGem(type, r, c, ms) {
    const div = document.createElement('div');
    div.className = 'gem';
    div.dataset.type = TYPES[type].id;
    div.innerHTML = gemMarkup(type);
    const gem = { id: ++gemSeq, type: type, r: r, c: c, el: div, special: null };
    placeGem(gem, ms == null ? 0 : ms);
    return gem;
  }

  function setGemType(gem, type) {
    gem.type = type;
    gem.el.dataset.type = TYPES[type].id;
    gem.el.innerHTML = gemMarkup(type);
  }

  function buildBoard() {
    el.board.innerHTML = '';
    el.fx.innerHTML = '';
    liveParticles = 0;
    state.grid = makeMatrix(ROWS, COLS, null);
    const tg = generateBoard(ROWS, COLS, TYPE_COUNT);
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = createGem(tg[r][c], r, c, 0);
        gem.el.classList.add('intro');
        gem.el.style.setProperty('--d', (r + c) * 25 + 'ms');
        state.grid[r][c] = gem;
        frag.appendChild(gem.el);
      }
    }
    el.board.appendChild(frag);
    setTimeout(function () {
      state.grid.forEach(function (row) { row.forEach(function (g) { if (g) g.el.classList.remove('intro'); }); });
    }, 900);
  }

  function gemAt(r, c) { return state.grid[r] ? state.grid[r][c] : null; }

  function swapGems(a, b) {
    const ga = state.grid[a.r][a.c];
    const gb = state.grid[b.r][b.c];
    state.grid[a.r][a.c] = gb;
    state.grid[b.r][b.c] = ga;
    ga.r = b.r; ga.c = b.c;
    gb.r = a.r; gb.c = a.c;
    placeGem(ga, CONFIG.anim.swapMs);
    placeGem(gb, CONFIG.anim.swapMs);
  }

  function boardSize() { return el.board.clientWidth || 1; }

  function pctX(c) { return ((c + 0.5) / COLS * 100) + '%'; }
  function pctY(r) { return ((r + 0.5) / ROWS * 100) + '%'; }

  function spawnParticles(r, c, color, n, cls) {
    if (reduceMotion) return;
    const count = n || 3;
    for (let i = 0; i < count; i++) {
      if (liveParticles >= CONFIG.particleCap) return;
      liveParticles++;
      const p = document.createElement('div');
      p.className = 'particle' + (cls ? ' ' + cls : '');
      p.style.left = pctX(c);
      p.style.top = pctY(r);
      const ang = Math.random() * Math.PI * 2;
      const dist = boardSize() / COLS * (0.5 + Math.random() * 0.7);
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--pc', color);
      el.fx.appendChild(p);
      setTimeout(function () { p.remove(); liveParticles = Math.max(0, liveParticles - 1); }, 520);
    }
  }

  function floatText(text, r, c, color) {
    const f = document.createElement('div');
    f.className = 'float';
    f.textContent = text;
    f.style.left = pctX(c);
    f.style.top = pctY(r);
    if (color) f.style.color = color;
    el.fx.appendChild(f);
    setTimeout(function () { f.remove(); }, 950);
  }

  function centroid(cells) {
    let sr = 0, sc = 0;
    cells.forEach(function (p) { sr += p.r; sc += p.c; });
    return { r: sr / cells.length, c: sc / cells.length };
  }

  function showPopup(text, cls) {
    const p = el.popup;
    p.className = 'popup';
    void p.offsetWidth;
    p.textContent = text;
    p.className = 'popup show ' + (cls || '');
  }

  function shakeBoard(strong) {
    if (reduceMotion) return;
    el.boardWrap.classList.remove('shake', 'strong');
    void el.boardWrap.offsetWidth;
    el.boardWrap.classList.add('shake');
    if (strong) el.boardWrap.classList.add('strong');
    setTimeout(function () { el.boardWrap.classList.remove('shake', 'strong'); }, 480);
  }

  function flashScreen(color, opacity) {
    el.flash.style.setProperty('--flash', color || '#fff');
    el.flash.style.setProperty('--flash-op', String(opacity == null ? 0.85 : opacity));
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;
    el.flash.classList.add('go');
  }

  function addFx(node, ms) {
    el.fx.appendChild(node);
    setTimeout(function () { node.remove(); }, ms);
  }

  /** 칸 제거 연출 + 데이터 제거 */
  async function removeGems(cells) {
    const gone = [];
    cells.forEach(function (p) {
      const gem = state.grid[p.r][p.c];
      if (!gem) return;
      gem.el.classList.remove('selected', 'hint', 'cursor');
      gem.el.classList.add('removing');
      spawnParticles(p.r, p.c, TYPES[gem.type].color, 2);
      gone.push(p);
    });
    state.sel = null;
    await wait(CONFIG.anim.removeMs);
    gone.forEach(function (p) {
      const gem = state.grid[p.r][p.c];
      if (gem) gem.el.remove();
      state.grid[p.r][p.c] = null;
    });
  }

  /** 중력 + 리필 */
  async function dropAndRefill() {
    const grid = state.grid;
    const res = applyGravity(grid);
    let maxMs = 0;
    res.moves.forEach(function (m) {
      const gem = grid[m.to][m.c];
      gem.r = m.to;
      const ms = Math.min((m.to - m.from) * CONFIG.anim.fallMsPerCell, CONFIG.anim.fallMsMax);
      maxMs = Math.max(maxMs, ms);
      placeGem(gem, ms);
    });
    const pending = [];
    for (let c = 0; c < COLS; c++) {
      const n = res.empties[c];
      for (let i = 0; i < n; i++) {
        const gem = createGem(randInt(TYPE_COUNT), i - n, c, 0);
        grid[i][c] = gem;
        el.board.appendChild(gem.el);
        pending.push({ gem: gem, row: i, ms: Math.min(n * CONFIG.anim.fallMsPerCell, CONFIG.anim.fallMsMax) });
        maxMs = Math.max(maxMs, Math.min(n * CONFIG.anim.fallMsPerCell, CONFIG.anim.fallMsMax));
      }
    }
    void el.board.offsetWidth; // 시작 위치 확정 후 낙하 전환 시작
    pending.forEach(function (p) {
      p.gem.r = p.row;
      placeGem(p.gem, p.ms);
    });
    if (maxMs > 0) await wait(maxMs + 30);
  }

  /** 유효한 수가 없을 때 전체 재섞기 */
  async function reshuffleBoard() {
    const tg = shuffleTypes(typeGrid());
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = state.grid[r][c];
        setGemType(gem, tg[r][c]);
        gem.el.classList.remove('reshuffle');
        void gem.el.offsetWidth;
        gem.el.classList.add('reshuffle');
      }
    }
    await wait(CONFIG.anim.shuffleMs);
    state.grid.forEach(function (row) { row.forEach(function (g) { g.el.classList.remove('reshuffle'); }); });
  }

  /* ---------- 선택 / 힌트 / 커서 표시 ---------- */
  function setSelected(p) {
    if (state.sel) {
      const old = gemAt(state.sel.r, state.sel.c);
      if (old) old.el.classList.remove('selected');
    }
    state.sel = p;
    if (p) {
      const g = gemAt(p.r, p.c);
      if (g) g.el.classList.add('selected');
    }
  }

  function renderCursor() {
    state.grid.forEach(function (row) { row.forEach(function (g) { if (g) g.el.classList.remove('cursor'); }); });
    if (!state.kbd || state.phase !== 'playing') return;
    const g = gemAt(state.cursor.r, state.cursor.c);
    if (g) g.el.classList.add('cursor');
  }

  function clearHint() {
    if (state.hint) {
      [state.hint.a, state.hint.b].forEach(function (p) {
        const g = gemAt(p.r, p.c);
        if (g) g.el.classList.remove('hint');
      });
    }
    state.hint = null;
    state.hintLeft = 0;
  }

  function showHint(seconds) {
    clearHint();
    const h = findHint(typeGrid());
    if (!h) return false;
    state.hint = h;
    state.hintLeft = seconds;
    [h.a, h.b].forEach(function (p) {
      const g = gemAt(p.r, p.c);
      if (g) g.el.classList.add('hint');
    });
    return true;
  }

  /* =====================================================================
   * 점수 / 게이지 / 연쇄 처리
   * ===================================================================== */
  function darkMult() { return state.dark > 0 ? CONFIG.skills.dark.mult : 1; }

  function addScore(pts) { state.score += pts; }

  function setChain(step) {
    state.chain = step;
    if (step > state.stats.maxChain) state.stats.maxChain = step;
    renderChain();
  }

  function charge(type, size) {
    const max = TYPES[type].max;
    if (state.gauge[type] >= max) return;
    state.gauge[type] = Math.min(max, state.gauge[type] + gaugeGain(size));
    if (state.gauge[type] >= max && !state.full[type]) {
      state.full[type] = true;
      sfx('full');
    }
  }

  function awardGroup(ctx, g, step) {
    const raw = baseScore(g.size) * chainMult(step) * darkMult();
    const pts = Math.round(raw * CONFIG.scoreMult);     // 난이도 배율 적용 점수
    addScore(pts);
    ctx.total += raw;                                   // 칭찬 판정은 배율 적용 전 값 기준
    ctx.maxGroup = Math.max(ctx.maxGroup, g.size);
    state.stats.matches++;
    if (!state.timeUp) {
      state.timeLeft = Math.min(CONFIG.time.max, state.timeLeft + timeBonusFor(g.size, step));
    }
    charge(g.type, g.size);
    const ctr = centroid(g.cells);
    floatText('+' + fmt(pts), ctr.r, ctr.c);
  }

  /** 매치 → 제거 → 낙하/리필 → 재검사 루프. startStep: 스왑 1, 스킬 이후 2 */
  async function cascade(ctx, startStep) {
    let step = startStep;
    for (;;) {
      const groups = findMatches(typeGrid());
      if (!groups.length) break;
      ctx.maxStep = Math.max(ctx.maxStep, step);
      setChain(step);
      sfx('match', step);
      const cells = [];
      groups.forEach(function (g) {
        awardGroup(ctx, g, step);
        g.cells.forEach(function (p) { cells.push(p); });
      });
      renderGauges();
      await removeGems(cells);
      await dropAndRefill();
      step++;
    }
  }

  /** 스킬로 제거한 칸: 칸당 점수, 게이지 충전 없음, 시간 보너스 없음 */
  async function removeSkillCells(ctx, cells) {
    const live = cells.filter(function (p) { return state.grid[p.r][p.c]; });
    if (!live.length) return;
    const raw = live.length * CONFIG.score.skillCell * chainMult(1) * darkMult();
    const pts = Math.round(raw * CONFIG.scoreMult);
    addScore(pts);
    ctx.total += raw;
    const ctr = centroid(live);
    floatText('+' + fmt(pts), ctr.r, ctr.c, '#ffe9a0');
    await removeGems(live);
  }

  /* ---------- 행동 실행기 ---------- */
  function setLocked(v) {
    state.locked = v;
    renderGauges();
  }

  async function runAction(fn) {
    if (state.locked || state.phase !== 'playing') return;
    setLocked(true);
    state.multHold = 0;
    clearHint();
    setSelected(null);
    const ctx = { total: 0, maxStep: 1, maxGroup: 3, noPost: false };   // noPost: 무효 스왑/보드 변화 없는 스킬은 칭찬·재섞기 판정 생략
    const id = state.gameId;
    try {
      await fn(ctx);
      if (!ctx.noPost) {
        const level = praiseLevel(ctx.maxStep, ctx.maxGroup, ctx.total);
        let waited = false;
        if (level) {
          const cls = { 'GOOD!': 'good', 'GREAT!': 'great', 'AWESOME!': 'awesome', 'EXCELLENT!': 'excellent' }[level];
          showPopup(level, cls);
          sfx('praise-' + cls);
          waited = true;
        }
        // 목표 점수에 도달했다면 NO MOVES 재섞기는 생략하고 곧바로 클리어 처리한다
        if (!isCleared(state.score, state.target) && !hasValidMove(typeGrid())) {
          if (waited) await wait(CONFIG.noMovesPauseMs);
          showPopup('NO MOVES', 'warn');
          sfx('nomoves');
          await wait(450);
          await reshuffleBoard();
        }
      }
      state.multHold = CONFIG.multReturn;
    } catch (e) {
      if (e === ABORT) return;
      throw e;
    }
    if (id !== state.gameId) return;
    setLocked(false);
    // 행동(연쇄 정산)이 모두 끝난 시점의 판정: 목표 달성이면 클리어, 시간이 소진됐으면 달성 여부로 클리어/실패
    if (isCleared(state.score, state.target) || state.timeUp) finishStage();
  }

  /* =====================================================================
   * 입력
   * ===================================================================== */
  let drag = null;

  function cellFromEvent(e) {
    const rect = el.board.getBoundingClientRect();
    if (!rect.width) return null;
    const cs = rect.width / COLS;
    const c = Math.floor((e.clientX - rect.left) / cs);
    const r = Math.floor((e.clientY - rect.top) / cs);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return { r: r, c: c, size: cs };
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function handleTap(r, c) {
    if (state.phase !== 'playing') return;
    if (state.aim !== null) { confirmAim(r, c); return; }
    if (state.locked) return;
    const p = { r: r, c: c };
    if (!state.sel) { setSelected(p); sfx('select'); return; }
    if (state.sel.r === r && state.sel.c === c) { setSelected(null); return; }
    if (adjacent(state.sel, p)) {
      const a = state.sel;
      setSelected(null);
      trySwap(a, p);
      return;
    }
    setSelected(p);
    sfx('select');
  }

  function trySwap(a, b) {
    if (state.locked || state.phase !== 'playing') return;
    runAction(async function (ctx) {
      swapGems(a, b);
      sfx('swap');
      await wait(CONFIG.anim.swapMs);
      if (!findMatches(typeGrid()).length) {
        sfx('invalid');
        const ga = state.grid[a.r][a.c];
        const gb = state.grid[b.r][b.c];
        swapGems(a, b);
        [ga, gb].forEach(function (g) {
          g.el.classList.remove('shake');
          void g.el.offsetWidth;
          g.el.classList.add('shake');
          setTimeout(function () { g.el.classList.remove('shake'); }, 320);
        });
        ctx.noPost = true;
        await wait(CONFIG.anim.swapMs);
        return;
      }
      await cascade(ctx, 1);
    });
  }

  function bindInput() {
    const board = el.board;

    board.addEventListener('pointerdown', function (e) {
      state.idle = 0;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (state.phase !== 'playing' || state.locked) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      drag = { id: e.pointerId, r: cell.r, c: cell.c, x: e.clientX, y: e.clientY, size: cell.size, done: false };
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      e.preventDefault();
    });

    board.addEventListener('pointermove', function (e) {
      if (!drag || drag.done || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const thr = drag.size * CONFIG.input.dragThreshold;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= thr) return;
      if (state.aim !== null) return;           // 조준 중에는 드래그 스왑 없음
      drag.done = true;
      let nr = drag.r;
      let nc = drag.c;
      if (Math.abs(dx) > Math.abs(dy)) nc += dx > 0 ? 1 : -1;
      else nr += dy > 0 ? 1 : -1;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) return;
      setSelected(null);
      trySwap({ r: drag.r, c: drag.c }, { r: nr, c: nc });
    });

    function end(e, cancelled) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      try { board.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (!cancelled && !d.done) handleTap(d.r, d.c);
    }
    board.addEventListener('pointerup', function (e) { end(e, false); });
    board.addEventListener('pointercancel', function (e) { end(e, true); });
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // 조준 중 보드/게이지 바깥을 누르면 취소
    document.addEventListener('pointerdown', function (e) {
      if (state.aim === null) return;
      if (e.target.closest && (e.target.closest('#board') || e.target.closest('.gauge'))) return;
      cancelAim();
    });

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    const k = e.key;
    state.idle = 0;
    if (k === 'Escape') {
      if (state.phase === 'stages') { goHome(); return; }
      if (state.aim !== null) { cancelAim(); return; }
      if (state.phase === 'playing') pauseGame();
      else if (state.phase === 'paused') {
        if (!el['overlay-confirm'].hidden) cancelConfirm();
        else resumeGame();
      }
      return;
    }
    if (state.phase === 'paused' && (k === 'p' || k === 'P')) { resumeGame(); return; }
    if (state.phase !== 'playing') return;
    if (k === 'p' || k === 'P') { pauseGame(); return; }
    if (/^[1-6]$/.test(k)) { onGauge(Number(k) - 1); return; }
    const onBtn = e.target && e.target.tagName === 'BUTTON';
    let handled = true;
    if (k === 'ArrowUp') state.cursor.r = Math.max(0, state.cursor.r - 1);
    else if (k === 'ArrowDown') state.cursor.r = Math.min(ROWS - 1, state.cursor.r + 1);
    else if (k === 'ArrowLeft') state.cursor.c = Math.max(0, state.cursor.c - 1);
    else if (k === 'ArrowRight') state.cursor.c = Math.min(COLS - 1, state.cursor.c + 1);
    else if ((k === 'Enter' || k === ' ') && !onBtn) handleTap(state.cursor.r, state.cursor.c);
    else handled = false;
    if (handled) {
      state.kbd = true;
      renderCursor();
      e.preventDefault();
    }
  }

  /* =====================================================================
   * 스킬
   * ===================================================================== */
  function enterAim(i) {
    state.aim = i;
    setSelected(null);
    el.boardWrap.classList.add('aiming');
    el['aim-msg'].textContent = '대상 칸을 선택하세요 (' + TYPES[i].skill + ')';
    el['aim-msg'].hidden = false;
    renderGauges();
  }

  function cancelAim() {
    if (state.aim === null) return;
    state.aim = null;
    el.boardWrap.classList.remove('aiming');
    el['aim-msg'].hidden = true;
    renderGauges();
  }

  function consumeGauge(i) {
    state.gauge[i] = 0;
    state.full[i] = false;
    state.stats.skills++;
    renderGauges();
  }

  function onGauge(i) {
    state.idle = 0;
    if (state.phase !== 'playing' || state.locked) return;
    if (state.gauge[i] < TYPES[i].max) return;
    if (state.aim === i) { cancelAim(); return; }
    if (state.aim !== null) cancelAim();
    audio.init();
    if (TYPES[i].targeted) { enterAim(i); return; }
    consumeGauge(i);
    runAction(function (ctx) { return castSkill(ctx, i, -1, -1); });
  }

  function confirmAim(r, c) {
    const i = state.aim;
    cancelAim();
    if (i === null || state.locked) return;
    consumeGauge(i);
    runAction(function (ctx) { return castSkill(ctx, i, r, c); });
  }

  /** 컷인 -> 스킬 효과. 컷인이 끝난(또는 건너뛴/취소된) 뒤 정확히 한 번 실행된다 */
  async function castSkill(ctx, i, r, c) {
    await playCutin(i);
    await wait(0);   // 컷인 중 일시정지됐다면 재개될 때까지 대기
    const id = TYPES[i].id;
    if (id === 'fire') await skillFire(ctx, r, c);
    else if (id === 'grass') await skillGrass(ctx, r, c);
    else if (id === 'lightning') await skillLightning(ctx);
    else {
      ctx.noPost = true;   // 보드 변화 없음
      if (id === 'water') skillWater();
      else if (id === 'dark') skillDark();
      else skillLight();
    }
  }

  /* ---------- 컷인 연출 ---------- */
  let cutinCtl = null;
  let cutinSide = 1;     // 1: 왼쪽에서 등장, -1: 오른쪽에서 등장 (스킬마다 번갈아)

  function cleanupCutin() {
    state.cutinActive = false;
    audio.duck(false);
    el.cutin.hidden = true;
    el.cutin.classList.remove('run', 'reduced');
  }

  function cancelCutin() {
    if (cutinCtl) cutinCtl.finish();
  }

  function playCutin(i) {
    const id = state.gameId;
    const t = TYPES[i];
    const cu = CUTIN[t.id];
    return new Promise(function (resolve, reject) {
      let finished = false;
      let timer = null;
      state.cutinActive = true;
      audio.duck(true);
      sfx('skill-' + t.id);
      function finish() {
        if (finished) return;      // 건너뛰기/연타로 두 번 실행되지 않도록
        finished = true;
        clearTimeout(timer);
        cutinCtl = null;
        cleanupCutin();
        if (id !== state.gameId) reject(ABORT);
        else resolve();
      }
      cutinCtl = { finish: finish };
      let dur;
      if (!save.cutin) {
        // 컷인 OFF: 텍스트 배너만
        showPopup(t.skill + '!', 'skill ' + t.id);
        dur = CONFIG.cutin.offMs;
      } else {
        const root = el.cutin;
        cutinSide = -cutinSide;
        root.style.setProperty('--accent', cu.color);
        root.style.setProperty('--accent-rgb', cu.rgb);
        root.style.setProperty('--dir', String(cutinSide));
        root.dataset.side = cutinSide > 0 ? 'l' : 'r';
        const hasImg = !!cutinOk[t.id];
        root.classList.toggle('no-img', !hasImg);
        if (hasImg) el['cutin-img'].src = CONFIG.assets.cutin + t.id + '.webp';
        el['cb-shout'].textContent = cu.shout;
        el['cb-skill'].textContent = cu.skill;
        el['cn-gem'].innerHTML = gemMarkup(i);
        el['cn-text'].textContent = cu.name;
        root.classList.toggle('reduced', reduceMotion);
        dur = reduceMotion ? CONFIG.cutin.reducedMs : CONFIG.cutin.ms;
        root.hidden = false;
        root.classList.remove('run');
        void root.offsetWidth;
        root.classList.add('run');
        if (!reduceMotion) {
          el['screen-game'].classList.remove('ui-shake');
          void el['screen-game'].offsetWidth;
          el['screen-game'].classList.add('ui-shake');
          setTimeout(function () { el['screen-game'].classList.remove('ui-shake'); }, 500);
        }
      }
      timer = setTimeout(finish, dur);
    });
  }

  /* ---------- 스킬 효과 (규칙은 spec §3 그대로, 연출만 강화) ---------- */
  function randCell() { return { r: randInt(ROWS), c: randInt(COLS) }; }

  function addFxAt(cls, r, c, ms, extra) {
    const n = document.createElement('div');
    n.className = cls;
    n.style.left = pctX(c);
    n.style.top = pctY(r);
    if (extra) Object.keys(extra).forEach(function (k) { n.style.setProperty(k, extra[k]); });
    addFx(n, ms);
    return n;
  }

  function skillWater() {
    state.freeze = CONFIG.skills.water.freeze;     // 누적이 아니라 갱신
    // 푸른 파도 스윕 + 물방울/얼음 파티클 + 타이머 서리
    const wave = document.createElement('div');
    wave.className = 'fx-wave';
    addFx(wave, 900);
    for (let k = 0; k < 10; k++) {
      const p = randCell();
      spawnParticles(p.r, p.c, k % 2 ? '#bfeaff' : '#4fb4ff', 1, k % 3 === 0 ? 'ice' : 'drop');
    }
    flashScreen('#7fd7ff', 0.4);
    el.timer.classList.remove('tflash');
    void el.timer.offsetWidth;
    el.timer.classList.add('tflash');
    setTimeout(function () { el.timer.classList.remove('tflash'); }, 1000);
  }

  function skillDark() {
    state.dark = CONFIG.skills.dark.duration;      // 재발동 시 갱신
    const sw = document.createElement('div');
    sw.className = 'fx-swirl';
    addFx(sw, 1000);
    const vg = document.createElement('div');
    vg.className = 'fx-vignette';
    addFx(vg, 1100);
    flashScreen('#7a3bd0', 0.45);
  }

  function skillLight() {
    if (!state.timeUp) state.timeLeft = Math.min(CONFIG.time.max, state.timeLeft + CONFIG.skills.light.time);
    const pillar = document.createElement('div');
    pillar.className = 'fx-pillar';
    addFx(pillar, 1000);
    for (let k = 0; k < 12; k++) {
      const p = randCell();
      spawnParticles(p.r, p.c, k % 2 ? '#fff6c8' : '#ffd95a', 1, 'spark');
    }
    flashScreen('#fff');
    el.timer.classList.remove('tflash');
    void el.timer.offsetWidth;
    el.timer.classList.add('tflash');
    setTimeout(function () { el.timer.classList.remove('tflash'); }, 1000);
    showHint(CONFIG.skills.light.hint);
  }

  async function skillFire(ctx, r, c) {
    const cells = fireCells(r, c, ROWS, COLS, CONFIG.skills.fire.radius);
    addFxAt('fx-fireflash', r, c, 520);
    addFxAt('fx-ring', r, c, 560);
    addFxAt('fx-ring r2', r, c, 760);
    cells.forEach(function (p, k) {
      spawnParticles(p.r, p.c, ['#ff9a3c', '#ffd36b', '#ff5a2b'][k % 3], 3, 'ember');
    });
    shakeBoard(true);
    flashScreen('#ffb066', 0.55);
    await wait(160);
    await removeSkillCells(ctx, cells);
    await dropAndRefill();
    await cascade(ctx, 2);
  }

  async function skillGrass(ctx, r, c) {
    const cs = 100 / COLS;   // 퍼센트 단위 칸 크기
    const cx = (c + 0.5) * cs;
    const cy = (r + 0.5) * cs;
    const defs = [
      { v: false, left: cx, top: cy, len: 100 - cx, origin: 'left center' },
      { v: true, left: cx, top: cy, len: 100 - cy, origin: 'center top' },
      { v: false, left: 0, top: cy, len: cx, origin: 'right center' },
      { v: true, left: cx, top: 0, len: cy, origin: 'center bottom' }
    ];
    defs.forEach(function (d, idx) {
      const vine = document.createElement('div');
      vine.className = d.v ? 'fx-vine v' : 'fx-vine';
      vine.style.left = d.left + '%';
      vine.style.top = d.top + '%';
      if (d.v) vine.style.height = d.len + '%';
      else vine.style.width = d.len + '%';
      vine.style.transformOrigin = d.origin;
      vine.style.setProperty('--d', idx * 70 + 'ms');
      addFx(vine, 900);
    });
    const cells = grassCells(r, c, ROWS, COLS);
    const gid = state.gameId;
    cells.forEach(function (p) {
      const d = Math.abs(p.r - r) + Math.abs(p.c - c);
      setTimeout(function () {
        if (gid !== state.gameId) return;
        const g = gemAt(p.r, p.c);
        if (g) g.el.classList.add('zapped');
        spawnParticles(p.r, p.c, '#5fd35f', 2, 'leaf');
      }, 80 + d * 40);
    });
    shakeBoard(false);
    await wait(500);
    await removeSkillCells(ctx, cells);
    await dropAndRefill();
    await cascade(ctx, 2);
  }

  function boltSvg(tx, ty) {
    const W = boardSize();
    const unit = W / COLS;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'fx-svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + W);
    const x0 = Math.max(4, Math.min(W - 4, tx + (Math.random() - 0.5) * unit * 2));
    const pts = [];
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const y = -6 + (ty + 6) * k / n;
      const x = k === n ? tx : x0 + (tx - x0) * k / n + (k === 0 ? 0 : (Math.random() - 0.5) * unit * 0.9);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    ['glow', 'core'].forEach(function (cls) {
      const pl = document.createElementNS(ns, 'polyline');
      pl.setAttribute('class', 'bolt-' + cls);
      pl.setAttribute('points', pts.join(' '));
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke-linejoin', 'round');
      pl.setAttribute('stroke-linecap', 'round');
      svg.appendChild(pl);
    });
    return svg;
  }

  async function skillLightning(ctx) {
    const tg = typeGrid();
    const present = [];
    tg.forEach(function (row) { row.forEach(function (t) { if (t != null && present.indexOf(t) === -1) present.push(t); }); });
    if (!present.length) return;
    const color = present[randInt(present.length)];
    const all = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tg[r][c] === color) all.push({ r: r, c: c });
    for (let i = all.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
    }
    const targets = all.slice(0, CONFIG.skills.lightning.count);
    const unit = boardSize() / COLS;
    shakeBoard(true);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      addFx(boltSvg((t.c + 0.5) * unit, (t.r + 0.5) * unit), 300);
      flashScreen('#fff5a8', 0.3);
      const gem = state.grid[t.r][t.c];
      if (gem) gem.el.classList.add('zapped');
      spawnParticles(t.r, t.c, '#ffe34d', 2, 'spark');
      await wait(CONFIG.skills.lightning.stepMs);
    }
    await wait(140);
    await removeSkillCells(ctx, targets);
    await dropAndRefill();
    await cascade(ctx, 2);
  }

  /* =====================================================================
   * 화면 / HUD 흐름
   * ===================================================================== */
  function renderGauges() {
    const btns = el.gauges.children;
    for (let i = 0; i < TYPE_COUNT; i++) {
      const b = btns[i];
      if (!b) continue;
      const max = TYPES[i].max;
      const v = state.gauge[i];
      const isFull = v >= max;
      b.style.setProperty('--fill', String(v / max));
      b.querySelector('.count').textContent = v + '/' + max;
      b.classList.toggle('full', isFull);
      b.classList.toggle('locked', state.locked || state.phase !== 'playing');
      b.classList.toggle('aiming', state.aim === i);
      b.setAttribute('aria-label', TYPES[i].name + ' 게이지 ' + v + '/' + max + (isFull ? ', ' + TYPES[i].skill + ' 사용 가능' : ''));
      b.setAttribute('aria-disabled', (!isFull || state.locked || state.phase !== 'playing') ? 'true' : 'false');
    }
  }

  function buildGauges() {
    el.gauges.innerHTML = '';
    TYPES.forEach(function (t, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gauge t-' + t.id;
      b.innerHTML = '<span class="fill"></span>' + gemMarkup(i) + '<span class="count"></span>';
      b.addEventListener('click', function () { onGauge(i); });
      el.gauges.appendChild(b);
    });
    renderGauges();
  }

  function renderChain() {
    const mult = chainMult(state.chain);
    const m = el.mult;
    const txt = 'x' + mult;
    if (m.textContent !== txt) {
      m.textContent = txt;
      m.classList.remove('bump');
      void m.offsetWidth;
      m.classList.add('bump');
    }
    el.chain.textContent = state.chain >= 2 ? 'CHAIN ' + state.chain : 'CHAIN';
    el.chain.classList.toggle('active', state.chain >= 2);
  }

  const hud = { goal: -1, goalText: '', bar: -1, text: '', frozen: null, low: null, dark: null, darkText: '', freezeText: '', hint: '' };

  function updateHUD(dt) {
    // 점수 롤링
    if (state.shown !== state.score) {
      const diff = state.score - state.shown;
      state.shown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 10);
      if (Math.abs(state.score - state.shown) < 1) state.shown = state.score;
      el.score.textContent = fmt(state.shown);
    }
    // 타이머
    const frac = Math.max(0, Math.min(1, state.timeLeft / CONFIG.time.max));
    if (Math.abs(frac - hud.bar) > 0.0005) {
      el['timer-fill'].style.transform = 'scaleX(' + frac.toFixed(4) + ')';
      hud.bar = frac;
    }
    const secs = fmtTime(state.timeLeft);
    if (secs !== hud.text) { el['timer-text'].textContent = secs; hud.text = secs; }
    // 목표 진행 바 (점수 롤링 값 기준, 변경 시에만 DOM 쓰기)
    if (state.target > 0) {
      const gf = Math.max(0, Math.min(1, state.shown / state.target));
      const gtxt = fmt(state.shown) + ' / ' + fmt(state.target);
      if (Math.abs(gf - hud.goal) > 0.0005 || gtxt !== hud.goalText) {
        el['goal-fill'].style.transform = 'scaleX(' + gf.toFixed(4) + ')';
        el['goal-text'].textContent = gtxt;
        el.goal.setAttribute('aria-valuenow', String(Math.round(gf * 100)));
        if (gf >= 1 && hud.goal < 1) {
          el.goal.classList.remove('hit');
          void el.goal.offsetWidth;
          el.goal.classList.add('hit');
        }
        hud.goal = gf;
        hud.goalText = gtxt;
      }
    }
    const frozen = state.freeze > 0;
    if (frozen !== hud.frozen) { el.timer.classList.toggle('frozen', frozen); el['freeze-text'].hidden = !frozen; hud.frozen = frozen; }
    if (frozen) {
      const ft = '정지 ' + state.freeze.toFixed(1) + 's';
      if (ft !== hud.freezeText) { el['freeze-text'].textContent = ft; hud.freezeText = ft; }
    }
    const low = state.timeLeft <= 10 && state.phase === 'playing' && !frozen;
    if (low !== hud.low) { el.timer.classList.toggle('low', low); hud.low = low; }
    // 어둠 배율
    const dark = state.dark > 0;
    if (dark !== hud.dark) { el['dark-badge'].hidden = !dark; el.scorebar.classList.toggle('dark', dark); hud.dark = dark; }
    if (dark) {
      const dt2 = state.dark.toFixed(1) + 's';
      if (dt2 !== hud.darkText) { el['dark-left'].textContent = dt2; hud.darkText = dt2; }
    }
    // 힌트 버튼 쿨다운
    const cd = state.hintCd > 0 ? Math.ceil(state.hintCd) : 0;
    const hs = String(cd);
    if (hs !== hud.hint) {
      el['btn-hint'].innerHTML = cd > 0 ? '힌트<span class="cd">' + cd + '</span>' : '힌트';
      el['btn-hint'].classList.toggle('cooling', cd > 0);
      hud.hint = hs;
    }
  }

  function advance(dt) {
    if (state.cutinActive) return;          // 컷인 중에는 모든 시계 정지
    if (state.freeze > 0) {
      state.freeze = Math.max(0, state.freeze - dt);
    } else if (!state.timeUp) {
      state.timeLeft -= dt;
      const sec = Math.ceil(state.timeLeft - 1e-9);
      if (sec > 10) state.warnSec = 99;
      else if (sec > 0 && sec !== state.warnSec) { state.warnSec = sec; sfx('warning'); }
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.timeUp = true;
        cancelAim();
      }
    }
    if (!state.locked && (state.timeUp || isCleared(state.score, state.target))) { finishStage(); return; }
    if (CONFIG.hint.auto > 0) {
      // 초보 자동 힌트: 입력 잠금·조준 중에는 카운트하지 않고, 힌트가 떠 있는 동안에도 멈춘다
      if (state.locked || state.aim !== null || state.hintLeft > 0) state.idle = 0;
      else {
        state.idle += dt;
        if (state.idle >= CONFIG.hint.auto) { state.idle = 0; showHint(CONFIG.hint.autoShow); }
      }
    }
    if (state.dark > 0) state.dark = Math.max(0, state.dark - dt);
    if (state.hintCd > 0) state.hintCd = Math.max(0, state.hintCd - dt);
    if (state.hintLeft > 0) {
      state.hintLeft -= dt;
      if (state.hintLeft <= 0) clearHint();
    }
    if (state.multHold > 0 && !state.locked) {
      state.multHold -= dt;
      if (state.multHold <= 0) { state.multHold = 0; state.chain = 1; renderChain(); }
    }
  }

  let lastT = 0;
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!lastT) lastT = now;
    const dt = Math.min(0.25, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (state.phase === 'playing') advance(dt);
    if (state.phase !== 'start') updateHUD(dt);
  }

  /* ---------- 화면 전환 ---------- */
  function showScreen(name) {
    el['screen-start'].hidden = name !== 'start';
    el['screen-stages'].hidden = name !== 'stages';
    el['screen-game'].hidden = name !== 'game';
    ['profile', 'hall'].forEach(function (n) {       // 명예의 전당 화면(없으면 건너뜀)
      const s = document.getElementById('screen-' + n);
      if (s) s.hidden = name !== n;
    });
  }
  function showOverlay(id, on) {
    el[id].hidden = !on;
  }
  function hideAllOverlays() {
    ['overlay-count', 'overlay-pause', 'overlay-confirm', 'overlay-end'].forEach(function (id) { el[id].hidden = true; });
  }

  function updateSoundButtons() {
    const txt = audio.muted ? '소리 꺼짐' : '소리 켜짐';
    ['btn-sound-start', 'btn-sound-pause'].forEach(function (id) {
      el[id].textContent = txt;
      el[id].setAttribute('aria-pressed', audio.muted ? 'false' : 'true');
    });
    const ctxt = save.cutin ? '컷인 연출 켜짐' : '컷인 연출 꺼짐';
    ['btn-cutin-start', 'btn-cutin-pause'].forEach(function (id) {
      el[id].textContent = ctxt;
      el[id].setAttribute('aria-pressed', save.cutin ? 'true' : 'false');
    });
  }

  function toggleCutin() {
    save.cutin = !save.cutin;
    writeSave();
    updateSoundButtons();
  }

  function toggleSound() {
    audio.setMuted(!audio.muted);
    save.muted = audio.muted;
    writeSave();
    if (!audio.muted) audio.init();
    updateSoundButtons();
  }

  function levelLabel(lv) { return CONFIG.difficulty[lv].label; }

  function clearedCount(lv) { return save.progress[lv]; }
  function starTotal(lv) {
    return save.stages[lv].reduce(function (sum, e) { return sum + e.stars; }, 0);
  }

  /** 시작 화면의 난이도 선택 상태·설명·진행도·스테이지 안내 문구를 선택값 기준으로 갱신 */
  function renderLevelUi() {
    const lv = save.level;
    const btns = el['level-select'].querySelectorAll('.level-btn');
    Array.prototype.forEach.call(btns, function (b) {
      const on = b.dataset.level === lv;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('on', on);
    });
    el['level-desc'].textContent = CONFIG.difficulty[lv].desc;
    el['start-clear'].textContent = clearedCount(lv) + '/' + CONFIG.stages.count;
    el['start-stars'].textContent = String(starTotal(lv));
    const d = CONFIG.difficulty;
    el['rule-stage'].innerHTML = '<b>스테이지</b> 제한 시간(초보 ' + fmtDur(d.easy.time.start) + ' / 중수 ' + fmtDur(d.normal.time.start) +
      ' / 고수 ' + fmtDur(d.hard.time.start) + ') 안에 목표 점수를 넘기면 클리어! 레벨 1~' + CONFIG.stages.count + '에 도전하세요.';
  }

  function selectLevel(lv, focus) {
    if (state.phase !== 'start' || !CONFIG.difficulty[lv]) return;   // 난이도는 시작 화면에서만 변경
    save.level = lv;
    writeSave();
    renderLevelUi();
    if (focus) {
      const b = el['level-select'].querySelector('[data-level="' + lv + '"]');
      if (b) b.focus();
    }
  }

  function renderStart() {
    renderLevelUi();
    el.tutorial.hidden = save.tutorialSeen;
    emit('renderStart');
  }

  function resetState() {
    state.phase = 'countdown';
    state.pausedFrom = null;
    state.locked = false;
    state.score = 0;
    state.shown = 0;
    state.timeLeft = CONFIG.time.start;
    state.timeUp = false;
    state.gauge = new Array(TYPE_COUNT).fill(0);
    state.full = new Array(TYPE_COUNT).fill(false);
    state.freeze = 0;
    state.dark = 0;
    state.chain = 1;
    state.multHold = 0;
    state.hint = null;
    state.hintLeft = 0;
    state.hintCd = 0;
    state.aim = null;
    state.sel = null;
    state.cursor = { r: 0, c: 0 };
    state.kbd = false;
    state.stats = { maxChain: 0, skills: 0, matches: 0 };
    state.confirmFrom = null;
    state.cutinActive = false;
    state.warnSec = 99;
    state.idle = 0;
    state.level = CONFIG.level;
    drag = null;
    hud.goal = -1; hud.goalText = ''; hud.bar = -1; hud.text = ''; hud.frozen = null; hud.low = null; hud.dark = null; hud.hint = '';
    el.score.textContent = '0';
    el.goal.classList.remove('hit');
    el.popup.className = 'popup';
    el['aim-msg'].hidden = true;
    el.boardWrap.classList.remove('aiming', 'shake');
    el['freeze-text'].hidden = true;
    el['dark-badge'].hidden = true;
    el.scorebar.classList.remove('dark');
    renderChain();
    renderGauges();
  }

  function sleepRaw(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function stageLabel(lv, stage) { return levelLabel(lv) + ' · 레벨 ' + stage; }

  /** 레벨 선택 화면: 난이도 표시·진행도·레벨 카드 10개(잠금/별/목표) */
  function renderStages() {
    const lv = save.level;
    const prog = save.progress[lv];
    el['stages-chip'].textContent = levelLabel(lv);
    el['stages-chip'].className = 'level-chip lv-' + lv;
    el['stages-time'].textContent = '제한 시간 ' + fmtTime(CONFIG.difficulty[lv].time.start);
    el['stages-summary'].textContent = '클리어 ' + prog + '/' + CONFIG.stages.count + ' · 별 ' + starTotal(lv);
    const grid = el['stage-grid'];
    grid.innerHTML = '';
    for (let i = 1; i <= CONFIG.stages.count; i++) {
      const rec = save.stages[lv][i - 1];
      const open = stageUnlocked(prog, i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-card' + (open ? '' : ' locked') + (i === prog + 1 ? ' current' : '') + (rec.stars > 0 ? ' cleared' : '');
      b.dataset.stage = String(i);
      b.disabled = !open;
      b.setAttribute('aria-disabled', open ? 'false' : 'true');
      let stars = '';
      for (let k = 1; k <= 3; k++) stars += k <= rec.stars ? '★' : '☆';
      b.setAttribute('aria-label', '레벨 ' + i + ', 목표 ' + fmt(stageTarget(lv, i)) + '점, ' + (open ? ('별 ' + rec.stars + '개') : '잠김'));
      b.innerHTML = '<span class="sc-num">' + i + '</span>' +
        (open ? '<span class="sc-target">' + fmt(stageTarget(lv, i)) + '</span><span class="sc-stars" aria-hidden="true">' + stars + '</span>'
          : '<span class="sc-target">' + fmt(stageTarget(lv, i)) + '</span><span class="sc-lock">잠김</span>');
      grid.appendChild(b);
    }
  }

  function goStages() {
    state.gameId++;
    cancelCutin();
    audio.bgmStop();
    state.phase = 'stages';
    state.locked = false;
    hideAllOverlays();
    renderStages();
    updateSoundButtons();
    showScreen('stages');
    const cur = el['stage-grid'].querySelector('.stage-card.current') || el['stage-grid'].querySelector('.stage-card:not(:disabled)');
    if (cur && cur.focus) cur.focus({ preventScroll: true });
  }

  function openStages() {
    if (state.phase !== 'start') return;
    goStages();
  }

  function restartStage() { startStage(state.stage); }
  function nextStage() { startStage(Math.min(CONFIG.stages.count, state.stage + 1)); }

  async function startStage(stage) {
    const lv0 = save.level;
    if (!stageUnlocked(save.progress[lv0], stage)) return;     // 잠긴 레벨은 시작 불가
    audio.init();
    state.gameId++;
    const id = state.gameId;
    cancelCutin();
    audio.bgmStop();
    hideAllOverlays();
    applyDifficulty(save.level);     // 선택 난이도 값을 활성 위치에 적용(재시작도 같은 난이도)
    resetState();
    const lv = CONFIG.level;
    state.stage = stage;
    state.target = stageTarget(lv, stage);
    state.startTime = CONFIG.time.start;
    el['level-chip'].textContent = levelLabel(lv) + ' · Lv' + stage;
    el['level-chip'].className = 'level-chip lv-' + lv;
    el['pause-level'].textContent = stageLabel(lv, stage) + ' · 목표 ' + fmt(state.target);
    el['end-level'].textContent = stageLabel(lv, stage);
    el['count-info'].textContent = '레벨 ' + stage + ' · 목표 ' + fmt(state.target) + '점';
    // 이미지 미리 로드(첫 판 깜빡임 방지). 오래 걸리면 폴백으로 그냥 진행
    await Promise.race([assetsReady, sleepRaw(CONFIG.assets.loadTimeoutMs)]);
    if (id !== state.gameId) return;
    buildBoard();
    showScreen('game');
    renderGauges();
    if (!save.tutorialSeen) { save.tutorialSeen = true; writeSave(); }
    // 카운트다운 3-2-1-GO
    showOverlay('overlay-count', true);
    for (let n = 3; n >= 1; n--) {
      el['count-num'].textContent = String(n);
      el['count-num'].style.animation = 'none';
      void el['count-num'].offsetWidth;
      el['count-num'].style.animation = '';
      sfx('tick');
      await sleepRaw(CONFIG.countdown.stepMs);
      if (id !== state.gameId) return;
    }
    el['count-num'].textContent = 'GO!';
    el['count-num'].style.animation = 'none';
    void el['count-num'].offsetWidth;
    el['count-num'].style.animation = '';
    sfx('go');
    await sleepRaw(CONFIG.countdown.goMs);
    if (id !== state.gameId) return;
    showOverlay('overlay-count', false);
    state.phase = 'playing';
    renderGauges();
    audio.bgmPlay(true);
  }

  function pauseGame() {
    if (state.phase !== 'playing') return;
    cancelAim();
    cancelCutin();       // 컷인 중 일시정지: 연출을 정리하고 효과는 재개 후 실행
    audio.bgmPause();
    state.phase = 'paused';
    drag = null;
    renderGauges();
    renderCursor();
    updateSoundButtons();
    showOverlay('overlay-pause', true);
    el['btn-resume'].focus();
  }

  function resumeGame() {
    if (state.phase !== 'paused') return;
    hideAllOverlays();
    state.phase = 'playing';
    renderGauges();
    renderCursor();
    audio.bgmPlay(false);
  }

  function openConfirm() {
    if (state.phase === 'playing') {
      state.confirmFrom = 'playing';
      pauseGameForConfirm();
    } else if (state.phase === 'paused') {
      state.confirmFrom = 'paused';
    } else {
      return;
    }
    showOverlay('overlay-pause', false);
    showOverlay('overlay-confirm', true);
    el['btn-confirm-no'].focus();
  }

  function pauseGameForConfirm() {
    cancelAim();
    cancelCutin();
    audio.bgmPause();
    state.phase = 'paused';
    drag = null;
    renderGauges();
  }

  function cancelConfirm() {
    showOverlay('overlay-confirm', false);
    if (state.confirmFrom === 'paused') {
      showOverlay('overlay-pause', true);
      el['btn-resume'].focus();
    } else {
      resumeGame();
    }
    state.confirmFrom = null;
  }

  function goHome() {
    state.gameId++;
    cancelCutin();
    audio.bgmStop();
    state.phase = 'start';
    state.locked = false;
    hideAllOverlays();
    renderStart();
    updateSoundButtons();
    showScreen('start');
  }

  /** 스테이지 종료(클리어/실패). 한 번만 실행된다(phase 가드) */
  function finishStage() {
    if (state.phase !== 'playing') return;
    state.phase = 'over';
    cancelAim();
    clearHint();
    setSelected(null);
    renderCursor();
    renderGauges();
    state.shown = state.score;
    el.score.textContent = fmt(state.score);
    const lv = state.level;
    const stage = state.stage;
    const cleared = isCleared(state.score, state.target);
    const left = cleared ? leftFromTime(state.timeLeft) : 0;     // 정수 초(내림). 임계값이 정수라 별 결과는 기존과 같다
    const stars = cleared ? starsFor(left, state.startTime) : 0;
    const res = applyStageResult(save, lv, stage, state.score, cleared, stars, left);
    save.plays += 1;
    save.lastScore = state.score;
    if (state.stats.maxChain > save.bestChain) save.bestChain = state.stats.maxChain;
    writeSave();
    emit('stageResult', { diff: lv, stage: stage, cleared: cleared, stars: stars, left: left, improved: !!res.improved });
    const last = stage >= CONFIG.stages.count;
    el['end-title'].textContent = cleared ? 'STAGE CLEAR!' : 'TIME UP';
    el['end-title'].className = cleared ? 'clear' : '';
    el['end-score'].textContent = fmt(state.score);
    el['end-target'].textContent = cleared
      ? '목표 ' + fmt(state.target) + ' 달성 · 남은 시간 ' + fmtTime(state.timeLeft)
      : '목표 ' + fmt(state.target) + ' / 내 점수 ' + fmt(state.score);
    el['end-stars'].hidden = !cleared;
    if (cleared) {
      let st = '';
      for (let k = 1; k <= 3; k++) st += k <= stars ? '★' : '☆';
      el['end-stars'].textContent = st;
      el['end-stars'].setAttribute('aria-label', '별 ' + stars + '개');
    }
    el['end-unlock'].hidden = true;
    if (cleared && last) {
      el['end-unlock'].textContent = levelLabel(lv) + ' 완료! 축하해요';
      el['end-unlock'].hidden = false;
    } else if (res.unlocked) {
      el['end-unlock'].textContent = '레벨 ' + res.unlocked + ' 해제!';
      el['end-unlock'].hidden = false;
    }
    el['end-best'].textContent = fmt(save.stages[lv][stage - 1].best);
    el['end-chain'].textContent = String(state.stats.maxChain);
    el['end-skills'].textContent = String(state.stats.skills);
    el['end-matches'].textContent = String(state.stats.matches);
    el['btn-next'].hidden = !(cleared && !last);
    el['btn-again'].textContent = cleared ? '다시 하기' : '다시 도전';
    audio.bgmStop();
    sfx(cleared ? 'newbest' : 'end');
    if (cleared && last) setTimeout(function () { sfx('praise-excellent'); }, 700);
    showOverlay('overlay-end', true);
    (cleared && !last ? el['btn-next'] : el['btn-again']).focus();
  }

  function onHint() {
    state.idle = 0;
    if (state.phase !== 'playing' || state.locked) return;
    if (state.hintCd > 0) return;
    if (showHint(CONFIG.hint.show)) state.hintCd = CONFIG.hint.cooldown;
  }

  function bindUi() {
    el['btn-start'].addEventListener('click', openStages);
    el['btn-stages-back'].addEventListener('click', goHome);
    el['stage-grid'].addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.stage-card');
      if (!b || b.disabled || state.phase !== 'stages') return;
      startStage(Number(b.dataset.stage));
    });
    el['stage-grid'].addEventListener('keydown', function (e) {
      const cards = Array.prototype.filter.call(el['stage-grid'].querySelectorAll('.stage-card'), function (c) { return !c.disabled; });
      const i = cards.indexOf(document.activeElement);
      if (i < 0) return;
      let n = -1;
      if (e.key === 'ArrowRight') n = Math.min(cards.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') n = Math.max(0, i - 1);
      else if (e.key === 'ArrowDown') n = Math.min(cards.length - 1, i + 5);
      else if (e.key === 'ArrowUp') n = Math.max(0, i - 5);
      if (n >= 0) { e.preventDefault(); cards[n].focus(); }
    });
    Array.prototype.forEach.call(el['level-select'].querySelectorAll('.level-btn'), function (b) {
      b.addEventListener('click', function () { selectLevel(b.dataset.level, false); });
    });
    el['level-select'].addEventListener('keydown', function (e) {
      const i = LEVELS.indexOf(save.level);
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % LEVELS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + LEVELS.length - 1) % LEVELS.length;
      if (n >= 0) { e.preventDefault(); selectLevel(LEVELS[n], true); }
    });
    el['btn-sound-start'].addEventListener('click', toggleSound);
    el['btn-sound-pause'].addEventListener('click', toggleSound);
    el['btn-cutin-start'].addEventListener('click', toggleCutin);
    el['btn-cutin-pause'].addEventListener('click', toggleCutin);
    // 버튼 클릭음 (위임)
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btn')) sfx('click');
    });
    // 컷인 중 아무 곳이나 탭하면 건너뛰기
    el.cutin.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      cancelCutin();
    });
    el['btn-hint'].addEventListener('click', onHint);
    el['btn-menu'].addEventListener('click', pauseGame);
    el['btn-reset'].addEventListener('click', openConfirm);
    el['btn-resume'].addEventListener('click', resumeGame);
    el['btn-restart'].addEventListener('click', restartStage);
    el['btn-quit'].addEventListener('click', goStages);
    el['btn-confirm-yes'].addEventListener('click', restartStage);
    el['btn-confirm-no'].addEventListener('click', cancelConfirm);
    el['btn-again'].addEventListener('click', restartStage);
    el['btn-next'].addEventListener('click', nextStage);
    el['btn-home'].addEventListener('click', goStages);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.phase === 'playing') pauseGame();
    });
  }

  /* =====================================================================
   * 초기화
   * ===================================================================== */
  function bindLogoFallback() {
    const img = el['logo-img'];
    function fallback() { img.hidden = true; el['title-fallback'].hidden = false; }
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  }

  function init() {
    cacheDom();
    el.boardWrap = el['board-wrap'];
    loadSave();
    audio.muted = !!save.muted;
    applyDifficulty(save.level);
    preloadAssets();
    bindLogoFallback();
    document.documentElement.style.setProperty('--swap-ms', CONFIG.anim.swapMs + 'ms');
    buildGauges();
    bindInput();
    bindUi();
    updateSoundButtons();
    renderStart();
    renderChain();
    showScreen('start');
    window.requestAnimationFrame(frame);
    inited = true;
    emit('init');
  }

  // 외부 모듈(ranking-ui.js)용 연결점. 저장 객체는 읽기 위해서만 노출한다.
  window.ElementGemsHost = {
    CONFIG: CONFIG,
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      if (name === 'init' && inited) { try { fn(); } catch (e) { /* 무시 */ } }
    },
    getSave: function () { return save; },
    writeSave: writeSave,
    showScreen: showScreen,
    goHome: goHome,
    getPhase: function () { return state.phase; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
