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
    // spec §20.14: 와이드 화면(태블릿·PC) 게이지 옆에 보이는 스킬 설명. 초등학생이 읽는 쉬운 말, 최대 2줄.
    // {area} = 불 스킬 범위(3×3), {mult} = 어둠 스킬 배율. 난이도마다 달라지는 초·개수는 문장에 쓰지 않는다.
    skillInfo: {
      fire: '칸을 고르면 둘레 {area}을 한꺼번에 터뜨려요',
      water: '잠시 동안 시간이 멈춰요',
      grass: '칸을 고르면 가로 한 줄, 세로 한 줄을 지워요',
      lightning: '번개가 같은 색 보석 여러 개를 지워요',
      dark: '잠시 동안 점수가 {mult}배!',
      light: '시간이 조금 늘고 힌트가 나와요'
    },
    hint: { show: 3, cooldown: 8, auto: 0, autoShow: 0 },   // auto: 무입력 N초 후 자동 힌트(0=없음)
    scoreMult: 1,
    level: 'normal',
    defaultLevel: 'normal',
    // spec §15.2 난이도 프리셋을 §17.2(2분 + 스테이지)로 갱신 (게이지 최대치 순서: 불·물·풀·번개·어둠·빛)
    difficulty: {
      easy: {
        label: '초보', desc: '시간이 넉넉하고 스킬이 빨리 차요. 막히면 힌트가 자동으로 나와요. 같은 색이 모여 나와서 맞출 곳이 잘 보여요.',
        max: [12, 14, 12, 13, 14, 16],
        time: { start: 130, max: 155 },
        timeBonus: { 3: 0.06, 4: 0.12, 5: 0.25, chainExtra: 0 },
        hint: { show: 4, cooldown: 4, auto: 6, autoShow: 4 },
        skills: { waterFreeze: 7, darkDuration: 12, lightTime: 5, lightHint: 10, boltCount: 10 },
        scoreMult: 0.8
      },
      normal: {
        label: '중수', desc: '기본 규칙. 균형 잡힌 2분 승부! 보석이 고르게 나오는 기본 보드예요.',
        max: [13, 16, 13, 14, 16, 18],
        time: { start: 120, max: 145 },
        timeBonus: { 3: 0.05, 4: 0.1, 5: 0.2, chainExtra: 0 },
        hint: { show: 3, cooldown: 8, auto: 0, autoShow: 0 },
        skills: { waterFreeze: 5, darkDuration: 8, lightTime: 4, lightHint: 8, boltCount: 8 },
        scoreMult: 1.0
      },
      hard: {
        label: '고수', desc: '시간이 짧고 보너스가 적어요. 대신 점수 ×1.3! 보석이 흩어져 있어서 맞출 곳을 잘 찾아야 해요.',
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
      // spec §25.6(2026-11-08, 사용자 조정값): 1단계 초보 3500 / 중수 4500 / 고수 5500. §25 시뮬레이션의 하향안(2200 / 3200 / 4700)을
      // 사용자가 "너무 낮다"고 해서 올렸고, 1단계 값에 레벨 증가 모양을 적용해 100점 반올림했다(시뮬레이션 기준 플레이어로 맞춘 값이 아니다).
      // 스킬 안 쓰는 플레이어는 초보 앞쪽 레벨까지만 편하다. 사람 체감으로 재조정한다. 교육용은 CONFIG.edu.targetScale(x1.2)이 곱해져 파생된다.
      targets: {
        easy: [3500, 3800, 4000, 4100, 4400, 4600, 4800, 5300, 5700, 6100],
        normal: [4500, 4900, 5300, 5400, 5900, 6300, 6800, 7100, 7600, 8200],
        hard: [5500, 6000, 6300, 6700, 7000, 7400, 8000, 8500, 9100, 9900]
      }
    },
    // spec §26.4(사용자 승인 2026-11-08, 강도 1.0 · 사다리 R): 난이도·레벨별 보드 구조 "구조 등급 s"(−2~+2, 0.5 단위).
    // 클수록 쉬운 보드(같은 색이 모여 나옴), 0 = 지금까지와 같은 균등 무작위, 작을수록 까다로운 보드(흩어져 나옴). 목표 점수(§25.6)는 그대로다(점수 중립 보정).
    //   enabled  false 면 모든 칸이 균등 무작위(기존 코드 경로 그대로). strength  0~1, 등급 s 에 곱한 뒤 0.5 단위로 반올림해 쓴다(0 = 끔). tries  리필 후보 다시 뽑기 최대 횟수.
    //   grades   난이도별 등급 표(키 = 등급 s 문자열). pair 뭉침(같은 색 이웃 한 칸마다 곱하는 가중), auto 새 보석이 저절로 줄·2×2를 만드는 색의 가중(1 = 자연, 0 = 금지;
    //            난이도마다 §26.5로 점수가 변하지 않게 보정한 값), lo/hi 안정된 보드에서 맞출 곳(유효한 수)의 최소/최대(99 = 제한 없음).
    //   ladder   난이도별 레벨 1~10의 등급 s(표에 없는 값 또는 0 = 균등 무작위). 입력은 (난이도, 레벨)뿐이다 — 점수·남은 시간·기록에 반응하지 않는다.
    board: {
      enabled: true,
      strength: 1,
      tries: 12,
      grades: {
        easy: {
          '2': { pair: 2.00, auto: 0.37, lo: 8, hi: 99 },
          '1.5': { pair: 1.75, auto: 0.50, lo: 7, hi: 99 },
          '1': { pair: 1.50, auto: 0.67, lo: 5, hi: 99 }
        },
        normal: {
          '0.5': { pair: 1.25, auto: 0.82, lo: 3, hi: 99 },
          '-0.5': { pair: 0.85, auto: 0.77, lo: 2, hi: 14 }
        },
        hard: {
          '-0.5': { pair: 0.85, auto: 0.89, lo: 2, hi: 14 },
          '-1': { pair: 0.70, auto: 0.55, lo: 2, hi: 10 },
          '-1.5': { pair: 0.62, auto: 0.47, lo: 2, hi: 9 }
        }
      },
      ladder: {
        easy: [2, 2, 2, 1.5, 1.5, 1.5, 1.5, 1, 1, 1],
        normal: [0.5, 0.5, 0.5, 0, 0, 0, 0, -0.5, -0.5, -0.5],
        hard: [-0.5, -0.5, -0.5, -1, -1, -1, -1, -1.5, -1.5, -1.5]
      }
    },
    multReturn: 1.0,                      // 행동 종료 후 배율 표시가 x1로 돌아오기까지(초)
    praiseThreshold: 5000,
    particleCap: 60,
    noMovesPauseMs: 500,
    cutin: { ms: 1300, offMs: 500, reducedMs: 600 },   // ms 값은 style.css의 컷인 애니메이션 길이(1.3s)와 맞춘다
    // spec §22.3.3: 음량은 모두 0~1. bgm = 플레이 곡, bgmMenu = 시작 화면 곡, bgmDuck = 컷인 중 덕킹.
    // 곡 페이드: fadeMs = 시작 화면 곡 -> 플레이(레벨 카드), fadeOutMs = 플레이 -> 시작 화면(나가기·레벨 선택), fadeStepMs = 단계 간격. fadeMs/fadeOutMs 0 = 페이드 없음.
    audio: { bgm: 0.42, bgmDuck: 0.18, bgmMenu: 0.42, sfx: 0.8, fadeMs: 400, fadeOutMs: 300, fadeStepMs: 30 },
    // music = 장면별 곡 목록(§22.3). 곡은 그 장면에 쓸 때만 내려받는다. bgm(문자열) = 목록이 비었거나 모든 곡이 실패할 때의 폴백(P0).
    assets: {
      gems: 'assets/gems/', cutin: 'assets/cutin/', sfx: 'assets/sfx/', bgm: 'assets/music/bgm.mp3',
      music: {
        menu: ['assets/music/menu.mp3'],
        play: ['assets/music/bgm.mp3', 'assets/music/play-1.mp3', 'assets/music/play-2.mp3', 'assets/music/play-3.mp3']
      },
      loadTimeoutMs: 2500
    },
    // spec §19: 별 챔피언 명예의 전당. apiBase가 비어 있으면 프로필·명예의 전당 UI와 네트워크 호출이 전부 꺼진다(기본 배포 상태).
    // 배포 후 Worker 주소(예: 'https://element-gems-ranking.sunkyboy.workers.dev')를 넣는다. 로컬 시험 주소는 커밋하지 않는다.
    ranking: {
      apiBase: 'https://element-gems-ranking.sunkyboy.workers.dev',
      timeoutMs: 8000,                                   // 요청 1회 제한 시간
      eraseFlushTimeoutMs: 4000,                         // 프로필 지우기 직전 마지막 기록 전송의 제한 시간(spec §23.3.5, 최악 약 7초 = 3초 간격 + 4초)
      eraseConfirmArmMs: 700,                            // 지우기 확인창이 열린 직후 이 시간 동안은 위험 버튼 클릭을 받지 않는다(빠른 두 번 탭 방지, R1 §20)
      retryMs: [5000, 15000, 60000, 300000, 900000],     // 제출 실패 백오프(5초→15초→1분→5분→15분 상한)
      minSubmitGapMs: 3000,                              // 서버의 같은 pid 쓰기 간격(3초)을 지킨다
      refreshMinMs: 5000,                                // 순위표 [새로고침] 간격
      resultDelayMs: 1200,                               // 결과 화면이 뜬 뒤 제출까지(컷인·연출과 겹치지 않게)
      hallCacheMaxAgeMs: 259200000,                      // 오프라인용 마지막 순위표 캐시 보관(3일)
      nickChangePerDay: 2,
      pageSize: 50
    },
    // [EDU] spec §21.7·§21.8: ? 선물상자(조커)·정답 보너스·교육용 목표·저장 키. 교육용에서 바뀌는 수치는 모두 여기에 모은다.
    edu: {
      // 리필 때 새로 생기는 칸마다 spawn 확률로 ?가 된다(보드 위 ?가 max개면 더 안 나옴). 첫 행동의 리필에서 1개를 확정 등장(guaranteeFirst).
      // spawn 이 0이면 ?가 전혀 나오지 않고(첫 등장 보장 포함) 일반용과 똑같이 동작한다.
      wild: { spawn: 0.016, max: 2, guaranteeFirst: true },
      // 정답 보너스 = base × 난이도 배율(round 점 단위 반올림): 초보 240 / 중수 300 / 고수 390. 연쇄·어둠 배율은 곱하지 않는다.
      bonus: { base: 300, mult: { easy: 0.8, normal: 1.0, hard: 1.3 }, round: 10, maxPoints: 100000 },
      targetScale: 1.2,                     // 교육용 목표 점수 = 일반용 목표 × targetScale (targetRound 점 단위 반올림)
      targetRound: 100,
      quiz: { maxPerAction: 3, gapMs: 400, praiseHoldMs: 700 },   // 한 행동 최대 문제 수 / 문제 사이 간격 / 칭찬 팝업을 보여 주는 시간
      storageKey: 'element-gems-edu:v1',    // 진행·설정 저장 키(일반용 'element-gems:v1' 과 분리). 프로필·순위 캐시 키는 ranking.js 소관
      saveEduMaxChars: 200000,              // 저장 객체의 edu 필드(edu.js 소관) 크기 상한: 넘으면 버린다
      hintMs: 3500,                         // 첫 ? 등장 안내를 보여 주는 시간
      text: {
        wildLabel: '선물상자(물음표)',
        giftHint: '? 선물상자는 어떤 보석 대신으로도 쓸 수 있어요',
        summary: '선물상자 문제 {asked}개 중 {right}개 맞혔어요 · 보너스 +{bonus}점'
      }
    }
    // [/EDU]
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
  // [EDU] ? 선물상자(조커) = 7번째 보석 번호. 일반 보석은 0~5(TYPE_COUNT 는 그대로 6: 게이지·무작위 생성에 영향 없음).
  const WILD = 6;
  // 화면 표현용 목록: 0~5 = TYPES, 6 = 선물상자(SVG 심볼 #gem-gift 는 index.html 에 정의)
  const VIEW = TYPES.concat([{ id: 'gift', name: '선물상자', color: '#ff9bd8' }]);
  // [/EDU]

  /* =====================================================================
   * 순수 보드 로직 (DOM 없음) — 보드는 2D 배열, 칸 값은 종류 번호 또는 null
   * ===================================================================== */
  function makeMatrix(rows, cols, fill) {
    const m = [];
    for (let r = 0; r < rows; r++) m.push(new Array(cols).fill(fill));
    return m;
  }

  // [EDU] ? 선물상자 규칙(§21.7.2): 보드에 ?가 없으면 일반용과 똑같은 원래 알고리즘(findMatchesPlain)을 그대로 쓰고,
  // ?가 있으면 findMatchesWild 를 쓴다. 두 함수는 ?가 없는 보드에서 결과(순서 포함)가 같다(시험으로 고정).
  function hasWild(g) {
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      for (let c = 0; c < row.length; c++) if (row[c] === WILD) return true;
    }
    return false;
  }

  /** 가로/세로 3개 이상 연속 또는 2×2 정사각형을 이룬 칸을, 같은 색끼리 연결해 그룹으로 반환. 그룹 = { type, cells, size, wilds } */
  function findMatches(g) {
    return hasWild(g) ? findMatchesWild(g) : findMatchesPlain(g);
  }

  /**
   * ? 가 있는 보드: 종류 t마다 "t 또는 ?" 로 이루어진 가로·세로 3칸 이상 연속(한 줄 = 끊기지 않은 가장 긴 구간)과 2×2 를 표시한다.
   * 단 그 줄/정사각형 안에 진짜 t 가 1개 이상 있어야 한다. 표시된 칸은 같은 t 안에서 연결 요소로 묶는다(? 는 여러 t 그룹에 동시에 속할 수 있다).
   * 반환 순서: 그룹의 첫 칸(위→아래, 왼→오) 순, 같으면 종류 번호 순. wilds = 그룹 안의 ? 칸 수.
   */
  function findMatchesWild(g) {
    const R = g.length;
    const C = g[0].length;
    const kinds = [];
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const v = g[r][c];
        if (v != null && v !== WILD && kinds.indexOf(v) === -1) kinds.push(v);
      }
    }
    const out = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    kinds.forEach(function (t) {
      const ok = function (r, c) { const v = g[r][c]; return v === t || v === WILD; };
      const mark = makeMatrix(R, C, false);
      let any = false;
      for (let r = 0; r < R; r++) {
        let c = 0;
        while (c < C) {
          if (!ok(r, c)) { c++; continue; }
          let e = c;
          let real = false;
          while (e < C && ok(r, e)) { if (g[r][e] === t) real = true; e++; }
          if (e - c >= 3 && real) { for (let k = c; k < e; k++) mark[r][k] = true; any = true; }
          c = e;
        }
      }
      for (let c = 0; c < C; c++) {
        let r = 0;
        while (r < R) {
          if (!ok(r, c)) { r++; continue; }
          let e = r;
          let real = false;
          while (e < R && ok(e, c)) { if (g[e][c] === t) real = true; e++; }
          if (e - r >= 3 && real) { for (let k = r; k < e; k++) mark[k][c] = true; any = true; }
          r = e;
        }
      }
      for (let r = 0; r + 1 < R; r++) {
        for (let c = 0; c + 1 < C; c++) {
          if (ok(r, c) && ok(r, c + 1) && ok(r + 1, c) && ok(r + 1, c + 1) &&
            (g[r][c] === t || g[r][c + 1] === t || g[r + 1][c] === t || g[r + 1][c + 1] === t)) {
            mark[r][c] = mark[r][c + 1] = mark[r + 1][c] = mark[r + 1][c + 1] = true;
            any = true;
          }
        }
      }
      if (!any) return;
      const seen = makeMatrix(R, C, false);
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          if (!mark[r][c] || seen[r][c]) continue;
          const cells = [];
          let wilds = 0;
          const stack = [[r, c]];
          seen[r][c] = true;
          while (stack.length) {
            const cur = stack.pop();
            cells.push({ r: cur[0], c: cur[1] });
            if (g[cur[0]][cur[1]] === WILD) wilds++;
            for (let d = 0; d < 4; d++) {
              const nr = cur[0] + dirs[d][0];
              const nc = cur[1] + dirs[d][1];
              if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
              if (!mark[nr][nc] || seen[nr][nc]) continue;
              seen[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
          out.push({ type: t, cells: cells, size: cells.length, wilds: wilds, start: r * C + c });
        }
      }
    });
    out.sort(function (a, b) { return a.start - b.start || a.type - b.type; });
    out.forEach(function (x) { delete x.start; });
    return out;
  }

  /** ? 가 없는 보드의 매치 탐색(일반용 원본 알고리즘 그대로, 그룹에 wilds:0 만 추가) */
  function findMatchesPlain(g) {
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
        groups.push({ type: t, cells: cells, size: cells.length, wilds: 0 });
      }
    }
    return groups;
  }
  // [/EDU]

  // [EDU] ? 인식: 칸이 ? 면 일반 6종 모두 검사하고, 줄/정사각형 안에 진짜 t 가 1개 이상 있어야 한다(§21.7.2). ?가 없으면 원래 결과와 같다.
  function okKind(v, t) { return v === t || v === WILD; }

  /** 종류 t 로 (r,c) 를 지나는 가로 또는 세로 3칸 이상 연속("t 또는 ?")이 있고 그 안에 진짜 t 가 있는지 */
  function lineAtKind(g, r, c, t) {
    const R = g.length;
    const C = g[0].length;
    let n = 1;
    let real = g[r][c] === t;
    for (let k = c - 1; k >= 0 && okKind(g[r][k], t); k--) { n++; if (g[r][k] === t) real = true; }
    for (let k = c + 1; k < C && okKind(g[r][k], t); k++) { n++; if (g[r][k] === t) real = true; }
    if (n >= 3 && real) return true;
    n = 1;
    real = g[r][c] === t;
    for (let k = r - 1; k >= 0 && okKind(g[k][c], t); k--) { n++; if (g[k][c] === t) real = true; }
    for (let k = r + 1; k < R && okKind(g[k][c], t); k++) { n++; if (g[k][c] === t) real = true; }
    return n >= 3 && real;
  }

  /** (r,c) 칸이 가로 또는 세로 3연속에 속하는지 */
  function lineAt(g, r, c) {
    const t = g[r][c];
    if (t == null) return false;
    if (t === WILD) {
      for (let k = 0; k < WILD; k++) if (lineAtKind(g, r, c, k)) return true;
      return false;
    }
    return lineAtKind(g, r, c, t);
  }

  function squareAtKind(g, r, c, t) {
    const R = g.length;
    const C = g[0].length;
    for (let dr = -1; dr <= 0; dr++) {
      for (let dc = -1; dc <= 0; dc++) {
        const r0 = r + dr;
        const c0 = c + dc;
        if (r0 < 0 || c0 < 0 || r0 + 1 >= R || c0 + 1 >= C) continue;
        const a = g[r0][c0];
        const b = g[r0][c0 + 1];
        const d = g[r0 + 1][c0];
        const e = g[r0 + 1][c0 + 1];
        if (okKind(a, t) && okKind(b, t) && okKind(d, t) && okKind(e, t) && (a === t || b === t || d === t || e === t)) return true;
      }
    }
    return false;
  }

  /** (r,c) 칸을 포함하는 2×2 정사각형(같은 종류 4칸, ? 는 대신)이 있는지 */
  function squareAt(g, r, c) {
    const t = g[r][c];
    if (t == null) return false;
    if (t === WILD) {
      for (let k = 0; k < WILD; k++) if (squareAtKind(g, r, c, k)) return true;
      return false;
    }
    return squareAtKind(g, r, c, t);
  }
  // [/EDU]

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

  // [EDU] ? 선물상자 순수 도우미 (§21.7) — DOM 없이 시험할 수 있게 규칙을 함수로 분리했다.
  /** 매치 그룹들이 지우는 칸 목록(중복 제거). ? 하나가 두 그룹에 걸쳐도 한 번만 지운다. 첫 등장 순서 유지 */
  function uniqueCells(groups) {
    const seen = {};
    const out = [];
    groups.forEach(function (gr) {
      gr.cells.forEach(function (p) {
        const key = p.r * 1000 + p.c;
        if (seen[key]) return;
        seen[key] = true;
        out.push(p);
      });
    });
    return out;
  }

  /** 매치 그룹들이 지우는 ? 칸(중복 제거) */
  function wildCellsOfGroups(groups, g) {
    return uniqueCells(groups).filter(function (p) { return g[p.r][p.c] === WILD; });
  }

  /** 보드 위 ? 개수 */
  function countWild(g) {
    let n = 0;
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === WILD) n++;
    return n;
  }

  /**
   * 리필로 새로 생기는 count 칸의 종류를 정한다(§21.7.1). 칸마다 확률 opt.spawn 으로 ? (보드 위 ?가 opt.max 개가 되면 더 안 나옴).
   * opt.force 이면 새 칸 중 하나를 ?로 확정한다(첫 행동 보장). spawn=0·force=false 이면 rng 를 count번 쓰는 일반 무작위와 똑같다.
   * wildOnBoard = 이미 보드 위에 있는 ? 수. n = 일반 종류 수.
   */
  function pickRefillTypes(count, wildOnBoard, rng, opt) {
    const rand = rng || Math.random;
    const o = opt || {};
    const spawn = o.spawn > 0 ? o.spawn : 0;
    const max = o.max > 0 ? o.max : 0;
    const n = o.n > 0 ? o.n : TYPE_COUNT;
    let wilds = wildOnBoard;
    let forceAt = -1;
    if (o.force && count > 0 && wilds < max) forceAt = Math.floor(rand() * count);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (i === forceAt) { out.push(WILD); wilds++; continue; }
      const reserve = forceAt > i ? 1 : 0;      // 확정 칸이 아직 앞에 남아 있으면 그 자리를 비워 둔다(max 초과 방지)
      if (spawn > 0 && wilds + reserve < max && rand() < spawn) { out.push(WILD); wilds++; continue; }
      out.push(Math.floor(rand() * n));
    }
    return out;
  }

  /**
   * spec §26.9 합성 순서: 구조 등급 P(boardParams, null 이 아님)가 있을 때 리필 새 칸의 종류를 정한다. tg = 중력 뒤 종류 격자(빈 칸 = null, ? 는 WILD).
   * ① opt.spawn > 0 일 때만 pickRefillTypes 로 ? 칸을 기존 규칙(칸당 확률·보드 위 최대 개수·첫 행동 확정)대로 먼저 정한다(난수 호출 방식 그대로).
   *   spawn = 0 이면 pickRefillTypes 를 부르지 않는다 -> 난수 소비가 일반용(구조만)과 정확히 같고 ? 는 없다.
   * ② ?로 정해진 칸을 복사한 격자에 WILD 로 먼저 채우고 ③ 나머지 빈 칸을 refillStructured 로 채운다(? 는 이웃 같은 색 세기에서 색으로 세지 않고,
   *   auto = 0 보장은 일반 보석끼리만 — fillStructured·completes 가 WILD 를 어떤 색 대신으로 보는 lineAt·squareAt 위에서 돌아간다).
   * ④ 새 칸 종류를 소비 순서(열 왼→오른, 각 열 위→아래 = dropAndRefill 이 쓰는 순서)로 돌려준다. 입력 tg 는 바꾸지 않는다.
   */
  function pickRefillTypesStructured(tg, wildOnBoard, P, rng, opt) {
    const rand = rng || Math.random;
    const o = opt || {};
    const cells = [];
    for (let c = 0; c < tg[0].length; c++) {
      for (let r = 0; r < tg.length; r++) if (tg[r][c] == null) cells.push({ r: r, c: c });
    }
    if (!cells.length) return [];
    const work = copyGrid(tg);
    if (o.spawn > 0) {
      const first = pickRefillTypes(cells.length, wildOnBoard, rand, o);
      for (let i = 0; i < cells.length; i++) if (first[i] === WILD) work[cells[i].r][cells[i].c] = WILD;
    }
    const filled = refillStructured(work, P, rand);
    return cells.map(function (p) { return filled[p.r][p.c]; });
  }

  /** 번개 스킬: 보드에 있는 진짜 6색 중에서만 색을 고르고(? 제외), 그 색 보석만 최대 count개 고른다. ? 칸은 대상이 아니다. 고를 색이 없으면 null */
  function boltTargets(tg, count, rng) {
    const rand = rng || Math.random;
    const present = [];
    tg.forEach(function (row) { row.forEach(function (t) { if (t != null && t !== WILD && present.indexOf(t) === -1) present.push(t); }); });
    if (!present.length) return null;
    const color = present[Math.floor(rand() * present.length)];
    const all = [];
    for (let r = 0; r < tg.length; r++) for (let c = 0; c < tg[r].length; c++) if (tg[r][c] === color) all.push({ r: r, c: c });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
    }
    return { color: color, targets: all.slice(0, count) };
  }

  /** 정답 보너스(점). base × 난이도 배율, round 점 단위 반올림 -> 초보 240 / 중수 300 / 고수 390. level 을 생략하면 현재 난이도 */
  function bonusFor(level) {
    const b = CONFIG.edu.bonus;
    const m = b.mult[level] != null ? b.mult[level] : b.mult[CONFIG.level];
    return Math.round(b.base * (m == null ? 1 : m) / b.round) * b.round;
  }

  /** 저장 객체의 edu 필드(edu.js 소관: 학습단원·출제 풀·통계)는 모양(일반 객체)과 크기만 확인하고 그대로 보존한다. 잘못되면 {} */
  function cleanEduField(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    let s;
    try { s = JSON.stringify(v); } catch (e) { return {}; }
    if (typeof s !== 'string' || s.length > CONFIG.edu.saveEduMaxChars) return {};
    try { return JSON.parse(s); } catch (e2) { return {}; }
  }

  /**
   * 저장할 때 edu 필드를 정한다. edu.js 가 같은 키에 직접 edu 필드를 쓸 수도(저장소 우선), save.edu 를 고쳐 writeSave 를 부를 수도(메모리 우선) 있다.
   * 마지막으로 맞춘 값(syncedJson)에서 메모리 edu 가 바뀌었으면 메모리 것을, 아니면 저장소에 있는 것을 쓴다. 반환 { edu, json }
   */
  function resolveEduField(memEdu, syncedJson, storedRaw) {
    const mem = cleanEduField(memEdu);
    const memJson = JSON.stringify(mem);
    let edu = mem;
    if (memJson === syncedJson && typeof storedRaw === 'string') {
      try {
        const cur = JSON.parse(storedRaw);
        if (cur && typeof cur === 'object' && !Array.isArray(cur)) edu = cleanEduField(cur.edu);
      } catch (e) { /* 저장소 값이 깨졌으면 메모리 값 */ }
    }
    return { edu: edu, json: JSON.stringify(edu) };
  }
  // [/EDU]

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

  /* ---------- 보드 구조 등급 (spec §26.4) — 난이도·레벨에 따라 새 칸의 종류를 정하는 규칙. DOM 없음, 난수는 rng 로 주입 ---------- */

  /** (r,c) 칸의 값. 격자 밖이면 null */
  function cellAt(g, r, c) {
    return (r >= 0 && c >= 0 && r < g.length && c < g[0].length) ? g[r][c] : null;
  }

  function copyGrid(g) {
    return g.map(function (row) { return row.slice(); });
  }

  /** 가중 w[i] 에 비례해 번호를 하나 고른다(난수 1번). 가중 합이 0 이하면 균등 */
  function pickWeighted(w, rng) {
    const rand = rng || Math.random;
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += w[i];
    if (!(sum > 0)) return Math.floor(rand() * w.length);
    let x = rand() * sum;
    for (let i = 0; i < w.length; i++) {
      x -= w[i];
      if (x < 0) return i;
    }
    return w.length - 1;
  }

  /** 난이도 level('easy'|'normal'|'hard')·레벨 stage(1~10)의 구조 등급 s. 꺼져 있거나 표에 없으면 0(= 균등 무작위, 기존 코드 경로) */
  function boardGrade(level, stage) {
    const B = CONFIG.board;
    if (!B.enabled) return 0;
    const row = B.ladder[level];
    if (!row || stage < 1 || stage > row.length) return 0;
    const s = Math.round(row[stage - 1] * B.strength / 0.5) * 0.5;       // strength 적용 + 0.5 단위
    return (B.grades[level] && B.grades[level][String(s)]) ? s : 0;
  }

  /** 등급의 손잡이 { s, pair, auto, lo, hi, tries }. 균등 무작위(s = 0)면 null */
  function boardParams(level, stage) {
    const s = boardGrade(level, stage);
    if (s === 0) return null;
    const g = CONFIG.board.grades[level][String(s)];
    return { s: s, pair: g.pair, auto: g.auto, lo: g.lo, hi: g.hi, tries: CONFIG.board.tries };
  }

  /** (r,c)에 종류 t 를 놓으면 3줄 또는 2×2 가 완성되는가(이웃 중 정해진 칸만 본다). tg 는 그대로 돌려놓는다 */
  function completes(tg, r, c, t) {
    tg[r][c] = t;
    const ok = lineAt(tg, r, c) || squareAt(tg, r, c);
    tg[r][c] = null;
    return ok;
  }

  /**
   * tg 의 빈 칸(null)을 제자리에서 채운다. 순서: 열 왼→오른, 각 열 아래→위. P = { pair, auto }.
   * 이웃(왼·오른·아래·위) 중 이미 정해진 칸에 같은 색이 k 개면 그 색의 가중은 pair^k, 줄·2×2 를 완성하는 색은 auto(색 번호는 보지 않는다).
   * autoOverride 가 있으면 P.auto 대신 쓴다(시작 보드는 0). 이미 있는 칸은 바꾸지 않는다.
   */
  function fillStructured(tg, P, rng, autoOverride) {
    const auto = autoOverride == null ? P.auto : autoOverride;
    const R = tg.length;
    const C = tg[0].length;
    for (let c = 0; c < C; c++) {
      for (let r = R - 1; r >= 0; r--) {
        if (tg[r][c] != null) continue;
        const w = [];
        for (let t = 0; t < TYPE_COUNT; t++) {
          let k = 0;
          if (cellAt(tg, r, c - 1) === t) k++;
          if (cellAt(tg, r, c + 1) === t) k++;
          if (cellAt(tg, r + 1, c) === t) k++;
          if (cellAt(tg, r - 1, c) === t) k++;
          w[t] = k === 0 ? 1 : (completes(tg, r, c, t) ? auto : Math.pow(P.pair, k));
        }
        tg[r][c] = pickWeighted(w, rng);
      }
    }
    return tg;
  }

  /**
   * 중력 뒤 종류 격자 tg(빈 칸 = null)를 채워 새 격자로 돌려준다(tg 는 바꾸지 않는다). 후보를 최대 P.tries 번 뽑아,
   * 안정된 후보 중 맞출 곳이 [P.lo, P.hi] 인 것을 고르고 없으면 가장 가까운 것을 쓴다. 연쇄가 이어지는 후보는 거르지 않는다.
   */
  function refillStructured(tg, P, rng) {
    const tries = Math.max(1, P.tries | 0);
    let best = null;
    let bestDist = Infinity;
    for (let k = 0; k < tries; k++) {
      const cand = copyGrid(tg);
      fillStructured(cand, P, rng);
      if (findMatches(cand).length > 0) { best = cand; break; }
      const m = listMoves(cand).length;
      const dist = m < P.lo ? P.lo - m : (m > P.hi ? m - P.hi : 0);
      if (dist < bestDist) { best = cand; bestDist = dist; }
      if (dist === 0) break;
    }
    return best;
  }

  /** 구조 등급의 시작 보드: 매치 0 + 맞출 곳 [max(1,lo), hi]. 1000번 안에 못 찾으면 기존 generateBoard 로 폴백 */
  function generateBoardStructured(rows, cols, P, rng) {
    for (let a = 0; a < 1000; a++) {
      const tg = makeMatrix(rows, cols, null);
      fillStructured(tg, P, rng, 0);                                  // auto = 0: 시작 보드에 즉시 매치가 없다
      if (findMatches(tg).length === 0) {
        const m = listMoves(tg).length;
        if (m >= Math.max(1, P.lo) && m <= P.hi) return tg;
      }
    }
    return generateBoard(rows, cols, TYPE_COUNT, rng);
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
    // [EDU] 폴백: 새 보드를 만든 뒤 원래 있던 ? 개수만큼 다시 놓는다(놓을 자리를 못 찾으면 ? 없이). ?가 없으면 일반용과 똑같다
    const fresh = generateBoard(R, C, TYPE_COUNT, rand);
    const nWild = countWild(g);
    if (nWild > 0) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const t = fresh.map(function (row) { return row.slice(); });
        let placed = 0;
        while (placed < nWild && placed < R * C) {
          const r = Math.floor(rand() * R);
          const c = Math.floor(rand() * C);
          if (t[r][c] !== WILD) { t[r][c] = WILD; placed++; }
        }
        if (findMatches(t).length === 0 && hasValidMove(t)) return t;
      }
    }
    return fresh;
    // [/EDU]
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
    if (!(t && stage >= 1 && stage <= t.length)) return 0;
    // [EDU] 교육용 목표 점수 = 일반용 목표 × targetScale(1.2), targetRound(100)점 단위 반올림 (§21.8.4)
    return Math.round(t[stage - 1] * CONFIG.edu.targetScale / CONFIG.edu.targetRound) * CONFIG.edu.targetRound;
    // [/EDU]
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
      bestChain: 0, plays: 0, lastScore: 0, muted: false, tutorialSeen: false, cutin: true,
      edu: {}     // [EDU] 학습단원·출제 풀·통계(edu.js 소관). 여기서는 보존만 한다
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
    out.edu = cleanEduField(o.edu);     // [EDU]
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

  /** 플레이 곡 고르기(spec §22.3.5). 목록이 비면 null, 1곡이면 그 곡, 2곡 이상이면 last 를 뺀 나머지에서 균등 무작위. rnd 는 [0,1) 난수 함수 */
  function pickTrack(list, last, rnd) {
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    const rest = list.filter(function (u) { return u !== last; });
    const pool = rest.length ? rest : list;
    const i = Math.min(pool.length - 1, Math.floor((rnd || Math.random)() * pool.length));
    return pool[i];
  }

  /* =====================================================================
   * 테스트용 내보내기 (브라우저에서는 module이 없으므로 무시된다)
   * ===================================================================== */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CONFIG: CONFIG, findMatches: findMatches, squareAt: squareAt, lineAt: lineAt, hasValidMove: hasValidMove, findHint: findHint,
      applyGravity: applyGravity, generateBoard: generateBoard, shuffleTypes: shuffleTypes,
      fireCells: fireCells, grassCells: grassCells, baseScore: baseScore, chainMult: chainMult,
      timeBonusFor: timeBonusFor, applyDifficulty: applyDifficulty, skillDesc: skillDesc,
      fmtTime: fmtTime, fmtDur: fmtDur, stageTarget: stageTarget, starsFor: starsFor, isCleared: isCleared,
      stageUnlocked: stageUnlocked, applyStageResult: applyStageResult, parseSave: parseSave, leftFromTime: leftFromTime, leftFloorForStars: leftFloorForStars, defaultSave: defaultSave, gaugeGain: gaugeGain, praiseLevel: praiseLevel, listMoves: listMoves,
      pickTrack: pickTrack,
      boardGrade: boardGrade, boardParams: boardParams, completes: completes, fillStructured: fillStructured,
      refillStructured: refillStructured, generateBoardStructured: generateBoardStructured,
      // [EDU] ? 선물상자 시험용 내보내기
      WILD: WILD, wouldMatch: wouldMatch, findMatchesPlain: findMatchesPlain, findMatchesWild: findMatchesWild, hasWild: hasWild,
      uniqueCells: uniqueCells, wildCellsOfGroups: wildCellsOfGroups, countWild: countWild, pickRefillTypes: pickRefillTypes, pickRefillTypesStructured: pickRefillTypesStructured,
      boltTargets: boltTargets, bonusFor: bonusFor, cleanEduField: cleanEduField, resolveEduField: resolveEduField,
      makeMatrix: makeMatrix
      // [/EDU]
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
    board: null,      // 이번 스테이지의 보드 구조 등급 손잡이(boardParams, spec §26). null = 균등 무작위(기존 경로)
    target: 0,        // 이번 스테이지 목표 점수
    startTime: 120,   // 별 계산 기준 시작 시간
    idle: 0,
    // [EDU] 문제 중(칭찬 팝업 대기 포함)에는 게임 시계·쿨다운이 모두 멈춘다(advance 가 즉시 반환). edu = 이번 스테이지 문제 통계
    quizActive: false,
    edu: { asked: 0, right: 0, bonus: 0, firstDone: false, skipped: 0 }
    // [/EDU]
  };

  let startGate = null;     // [시작] 눌렀을 때 먼저 물어볼 함수(없으면 바로 진행)
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
   * 오디오 (WAV 샘플 + MP3 배경음악, HTMLAudioElement — file://에서도 동작)
   *
   * 배경음악(spec §22.3): Audio 요소 하나(audio.bgm)에서 src 만 바꿔 쓴다. 곡 파일은 그 장면에 쓸 때만 내려받는다(지연 로드).
   *   scene    지금 화면이 원하는 음악. 'menu' 시작·단계 선택·프로필·명예의 전당 / 'play' 게임 판 / 'none' 결과 화면(음악 없음)
   *   musicCtx 요소에 올라 있는 곡의 장면('menu'|'play'|null), curTrack 그 곡의 CONFIG 경로(없으면 null)
   *   musicGen 곡을 바꿀 때마다 +1. 낡은 페이드 타이머·재시도가 새 상태를 되돌리지 못하게 한다(state.gameId 와 같은 방식)
   * 불변식: 소리 내는 BGM 요소는 1개 / 모든 play() 의 거절은 처리 / 곡을 바꾸기 전에 musicGen++ /
   *        곡이 하나뿐이면 loop=true, 둘 이상이면 loop=false(끝나면 다음 곡) / Audio 가 없으면 타이머를 만들지 않는다.
   * ===================================================================== */
  function noop() {}
  // 곡 파일을 받지 않고 요소의 재생 권한(모바일 정책)만 얻을 때 쓰는 길이 0의 무음 WAV(데이터 주소: 네트워크 0)
  const SILENT_SRC = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  const audio = {
    ready: false,
    muted: false,
    pools: {},
    bgm: null,
    ducked: false,
    scene: 'menu',
    musicCtx: null,
    curTrack: null,
    lastPlay: null,       // 직전 플레이 곡(직전 곡 회피). 메모리 값만 쓰고 저장하지 않는다
    musicGen: 0,
    failed: {},           // 이번 방문에서 내려받기에 실패한 곡 경로
    tries: 0,             // 이번 장면 곡 선택에서 실패한 횟수(한 번 다시 고르고, 그래도 실패하면 폴백)
    fade: 1,              // 페이드 계수 0~1
    fadeTimer: null,
    wantPlay: false,      // 지금 곡을 재생하라고 요청한 상태인가(오류로 곡을 바꿀 때 이어서 재생할지 판단)
    needNext: false,      // 곡이 끝났는데 바로 다음 곡을 못 틀었다(일시정지·소리 꺼짐)
    onBlocked: null,      // play() 가 자동재생 정책으로 거절됐을 때 부르는 함수(첫 입력 핸들러를 다시 건다)
    /** 첫 사용자 입력에서 호출: 풀 생성 + 모바일 정책 잠금 해제 */
    init: function () {
      if (this.ready) return;
      this.ready = true;
      if (typeof Audio === 'undefined') return;     // 오디오 없음(시험 환경 등): 아무 것도 만들지 않는다(타이머 포함)
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
        // 배경음악 요소: src 없이 만든다(곡은 장면에서 쓸 때 올린다). 실제 곡을 틀기 전에는 무음 주소로 재생 권한만 얻는다.
        const bgm = new Audio();
        bgm.muted = this.muted;
        bgm.addEventListener('ended', function () { self.onPlayEnded(); });
        bgm.addEventListener('error', function () { self.onTrackError(); });
        this.bgm = bgm;
        this.applyVol();
        bgm.src = SILENT_SRC;
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
      if (!this.bgm) return;
      const base = this.musicCtx === 'menu' ? CONFIG.audio.bgmMenu : CONFIG.audio.bgm;
      const v = (this.ducked ? CONFIG.audio.bgmDuck : base) * this.fade;
      this.bgm.volume = Math.max(0, Math.min(1, v));
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

    /* ---------- 배경음악: 곡 고르기·올리기·재생 ---------- */
    /** 장면의 곡 목록에서 실패한 곡을 뺀 것 */
    tracksFor: function (scene) {
      const m = CONFIG.assets.music;
      const self = this;
      return (m && m[scene] ? m[scene] : []).filter(function (u) { return !self.failed[u]; });
    },
    /** 장면에 쓸 곡을 고른다. allowList=false 면 목록은 건너뛰고 폴백(CONFIG.assets.bgm)만 본다. 고를 곡이 없으면 null(무음) */
    chooseTrack: function (scene, last, allowList) {
      if (allowList) {
        const live = this.tracksFor(scene);
        const url = pickTrack(live, last, Math.random);
        if (url) return { url: url, loop: live.length <= 1 };
      }
      const fb = CONFIG.assets.bgm;
      return fb && !this.failed[fb] ? { url: fb, loop: true } : null;
    },
    clearFade: function () {
      if (this.fadeTimer !== null) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }
    },
    /** 요소에 곡을 올린다(src 만 설정, 재생은 하지 않는다). 곡을 바꾸기 전에 musicGen++ */
    setTrack: function (ctx, url, loop) {
      this.musicGen++;
      this.clearFade();
      try {
        this.bgm.pause();
        this.bgm.loop = !!loop;
        this.bgm.preload = 'auto';        // 현재 곡에만 미리 받기. 다음 곡은 받지 않는다
        this.bgm.src = url;
      } catch (e) { /* 무시 */ }
      this.musicCtx = ctx;
      this.curTrack = url;
      this.fade = 1;
      this.wantPlay = false;
      this.needNext = false;
      this.applyVol();
    },
    /** 올려 둔 곡을 재생한다. fromStart 면 처음부터 */
    playNow: function (fromStart) {
      const b = this.bgm;
      if (!b || !this.curTrack) return;
      const self = this;
      try {
        if (fromStart) b.currentTime = 0;
        b.muted = this.muted;
        this.applyVol();
        this.wantPlay = true;
        const p = b.play();
        if (p && p.catch) {
          p.catch(function (e) {
            // 자동재생 정책으로 거절: 다음 사용자 입력에서 다시 시도하게 한다. 그 밖의 거절은 무시(곡 오류는 error 이벤트가 처리)
            if (e && e.name === 'NotAllowedError' && self.onBlocked) self.onBlocked();
          });
        }
      } catch (e) { /* 무시 */ }
    },
    /** 소리를 완전히 멈추고 곡을 내려놓는다(다음에 필요할 때 다시 올린다) */
    silence: function () {
      this.musicGen++;
      this.clearFade();
      this.fade = 1;
      this.wantPlay = false;
      this.needNext = false;
      this.curTrack = null;
      this.musicCtx = null;
      try { if (this.bgm) { this.bgm.pause(); this.bgm.currentTime = 0; } } catch (e) { /* 무시 */ }
    },
    /** ms 동안 음량을 0으로 줄인 뒤 then() 실행. ms<=0 이면 바로 실행. 곡이 바뀌면(musicGen) 낡은 단계는 무시 */
    fadeOut: function (ms, then) {
      const self = this;
      const gen = this.musicGen;
      if (!(ms > 0)) { then(); return; }
      const stepMs = CONFIG.audio.fadeStepMs > 0 ? CONFIG.audio.fadeStepMs : 30;
      const steps = Math.max(1, Math.round(ms / stepMs));
      let k = 0;
      (function step() {
        if (gen !== self.musicGen) return;
        k++;
        self.fade = Math.max(0, 1 - k / steps);
        self.applyVol();
        if (k >= steps) { self.fadeTimer = null; then(); return; }
        self.fadeTimer = setTimeout(step, stepMs);
      })();
    },
    /** 이미 올라 있는 곡이 소리 나는 중인가 */
    isSounding: function () {
      return !!(this.bgm && this.curTrack && !this.bgm.paused);
    },

    /* ---------- 배경음악: 장면 전환 API (호출부는 이 이름만 쓴다) ---------- */
    /** 시작 화면 곡을 보장한다. 이미 재생 중이면 아무것도 하지 않는다(곡을 다시 시작하지 않는다) */
    musicMenu: function () {
      const from = this.scene;
      this.scene = 'menu';
      if (!this.ready || !this.bgm) return;
      if (this.musicCtx === 'menu' && this.isSounding()) return;
      this.musicGen++;                       // 진행 중이던 페이드(플레이 곡 등)를 무효화
      this.clearFade();
      if (this.muted) { this.silence(); return; }
      if (from === 'play' && this.musicCtx === 'play' && this.isSounding()) {
        const self = this;
        this.fadeOut(CONFIG.audio.fadeOutMs, function () { self.startMenu(); });
      } else {
        this.startMenu();
      }
    },
    startMenu: function () {
      if (!this.bgm || this.muted || document.hidden) return;
      if (!(this.curTrack && this.musicCtx === 'menu')) {
        const c = this.chooseTrack('menu', null, true);
        if (!c) { this.silence(); return; }
        this.tries = 0;
        this.setTrack('menu', c.url, c.loop);
      }
      this.fade = 1;
      this.playNow(false);
    },
    /** 게임 판 시작: 시작 화면 곡을 페이드아웃해 멈추고, 이번 판 곡을 골라 src 만 설정한다(재생은 GO 뒤 bgmPlay(true)) */
    musicPrepare: function () {
      this.scene = 'play';
      if (!this.ready || !this.bgm) return;
      this.musicGen++;
      this.clearFade();
      this.wantPlay = false;
      if (this.muted) { this.silence(); return; }       // 소리 꺼짐: 곡을 받지 않는다(켜면 bgmPlay 가 고른다)
      const self = this;
      if (this.isSounding()) this.fadeOut(CONFIG.audio.fadeMs, function () { self.prepareTrack(); });
      else this.prepareTrack();
    },
    prepareTrack: function () {
      if (!this.bgm || this.muted) return;
      const c = this.chooseTrack('play', this.lastPlay, true);
      this.tries = 0;
      if (!c) { this.silence(); return; }
      this.lastPlay = c.url;
      this.setTrack('play', c.url, c.loop);
    },
    /** 플레이 곡 재생: GO 직후는 처음부터(bgmPlay(true)), 일시정지 재개는 이어서(bgmPlay(false)) */
    bgmPlay: function (fromStart) {
      if (!this.ready || !this.bgm) return;
      const loaded = !!(this.curTrack && this.musicCtx === 'play');
      if (this.muted && !loaded) return;          // 소리 꺼짐: 곡을 새로 받지 않는다(이미 올라 있는 곡은 음소거로 계속 흐른다)
      if (!loaded) {
        const c = this.chooseTrack('play', this.lastPlay, true);
        if (!c) return;
        this.tries = 0;
        this.lastPlay = c.url;
        this.setTrack('play', c.url, c.loop);
        fromStart = true;
      } else if (this.needNext && !this.bgm.loop) {
        if (!this.muted) this.startNext();         // 끝난 곡: 다음 곡(소리 꺼짐이면 켤 때 받는다)
        return;
      }
      this.fade = 1;
      this.playNow(!!fromStart);
    },
    /** 플레이 곡이 끝났을 때: 직전 곡을 뺀 다른 곡을 틀어 이어 간다 */
    startNext: function () {
      const c = this.chooseTrack('play', this.curTrack, true);
      if (!c) { this.silence(); return; }
      this.tries = 0;
      this.lastPlay = c.url;
      this.setTrack('play', c.url, c.loop);
      this.playNow(true);
    },
    onPlayEnded: function () {
      if (!this.bgm || this.musicCtx !== 'play' || !this.curTrack || this.bgm.loop || this.scene !== 'play') return;
      if (this.muted || state.phase !== 'playing') { this.needNext = true; return; }    // 지금은 못 튼다: 재개·소리 켤 때 다음 곡
      this.startNext();
    },
    /** 곡을 못 받았을 때(error): 실패 목록에 넣고 다른 곡으로 한 번 재시도 -> 폴백(CONFIG.assets.bgm) -> 무음. 화면에 오류를 띄우지 않는다 */
    onTrackError: function () {
      if (!this.bgm || !this.curTrack) return;      // 무음 주소 등 곡이 아닌 것의 오류는 무시
      const bad = this.curTrack;
      const ctx = this.musicCtx;
      const was = this.wantPlay;
      this.failed[bad] = true;
      this.tries++;
      const c = this.chooseTrack(ctx, bad, this.tries <= 1);
      if (!c) { this.silence(); return; }
      if (ctx === 'play') this.lastPlay = c.url;
      this.setTrack(ctx, c.url, c.loop);
      if (was && !(ctx === 'menu' && document.hidden)) this.playNow(true);
    },
    /** 지금 장면에 맞는 곡을 보장한다: 첫 입력·소리 켤 때·탭이 다시 보일 때 */
    musicSync: function () {
      if (!this.ready || !this.bgm || this.muted) return;
      if (this.scene === 'menu') {
        if (document.hidden) return;
        if (this.musicCtx === 'menu' && this.isSounding()) { this.applyVol(); return; }
        this.startMenu();
      } else if (this.scene === 'play' && state.phase === 'playing') {
        if (this.musicCtx === 'play' && this.isSounding()) { this.applyVol(); return; }
        this.bgmPlay(false);
      }
    },
    bgmPause: function () {
      this.wantPlay = false;
      try { if (this.bgm) this.bgm.pause(); } catch (e) { /* 무시 */ }
    },
    /** 결과 화면 등 음악이 없는 장면: 멈추고 곡을 내려놓는다 */
    bgmStop: function () {
      this.scene = 'none';
      this.silence();
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
  const STORAGE_KEY = CONFIG.edu.storageKey;   // [EDU] 교육용 진행·설정 저장 키 'element-gems-edu:v1' (일반용 'element-gems:v1' 과 분리)
  // 저장 객체: 구조/검증은 순수 함수 parseSave()가 담당한다.
  // level = 난이도(easy/normal/hard), progress/stages = 스테이지 진행(§17.7), bestByLevel/best = 60초 판 기록(보존만, UI 미사용)
  const save = defaultSave();
  let eduSynced = JSON.stringify(save.edu);   // [EDU] 저장소와 마지막으로 맞춘 edu 필드(JSON)

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = parseSave(raw);
      Object.keys(parsed).forEach(function (k) { save[k] = parsed[k]; });
      eduSynced = JSON.stringify(save.edu);   // [EDU]
    } catch (e) { /* 저장소 사용 불가: 기본값 유지 */ }
  }
  function writeSave() {
    try {
      // [EDU] edu 필드는 edu.js 가 같은 키에 직접 쓸 수도 있다 -> 쓰기 전에 저장소의 edu 를 읽어 보존한다(resolveEduField)
      let stored = null;
      try { stored = window.localStorage.getItem(STORAGE_KEY); } catch (e) { /* 읽기 실패: 메모리 값 */ }
      const r = resolveEduField(save.edu, eduSynced, stored);
      if (r.json !== JSON.stringify(save.edu)) save.edu = r.edu;     // 바뀐 때만 교체(edu.js 가 쥐고 있는 같은 객체를 유지)
      eduSynced = r.json;
      // [/EDU]
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
    const id = VIEW[type].id;     // [EDU] 6번(? 선물상자)도 읽는다: gemOk['gift'] 는 없으므로 SVG 심볼 #gem-gift 를 쓴다
    if (gemOk[id]) return '<img class="gi" src="' + CONFIG.assets.gems + id + '.webp" alt="" draggable="false">';
    return '<svg class="gi" viewBox="0 0 100 100" aria-hidden="true"><use href="#gem-' + id + '"></use></svg>';
  }

  // [EDU] ? 선물상자 접근성: 색·모양 말고 이름으로도 구별되게 role="img" + aria-label 을 붙인다(일반 보석은 속성 없음)
  function markGemA11y(div, type) {
    if (type === WILD) {
      div.setAttribute('role', 'img');
      div.setAttribute('aria-label', CONFIG.edu.text.wildLabel);
    } else if (div.getAttribute('role') === 'img') {
      div.removeAttribute('role');
      div.removeAttribute('aria-label');
    }
  }
  // [/EDU]

  function createGem(type, r, c, ms) {
    const div = document.createElement('div');
    div.className = 'gem';
    div.dataset.type = VIEW[type].id;     // [EDU]
    div.innerHTML = gemMarkup(type);
    markGemA11y(div, type);               // [EDU]
    const gem = { id: ++gemSeq, type: type, r: r, c: c, el: div, special: null };
    placeGem(gem, ms == null ? 0 : ms);
    return gem;
  }

  function setGemType(gem, type) {
    gem.type = type;
    gem.el.dataset.type = VIEW[type].id;     // [EDU]
    gem.el.innerHTML = gemMarkup(type);
    markGemA11y(gem.el, type);               // [EDU]
  }

  function buildBoard() {
    el.board.innerHTML = '';
    el.fx.innerHTML = '';
    liveParticles = 0;
    state.grid = makeMatrix(ROWS, COLS, null);
    const tg = state.board ? generateBoardStructured(ROWS, COLS, state.board) : generateBoard(ROWS, COLS, TYPE_COUNT);   // spec §26: 구조 등급이 없으면(s = 0) 기존 경로 그대로. 시작 보드에는 ?가 없다(E4)
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
      spawnParticles(p.r, p.c, VIEW[gem.type].color, 2);     // [EDU]
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

  // [EDU] ? 선물상자 등장(§21.7.1). EduQuiz 가 없거나 준비되지 않았으면 ?는 나오지 않는다(일반 퍼즐과 똑같이 동작).
  let giftHintShown = false;      // 첫 ? 등장 안내는 페이지를 연 뒤 한 번만

  function quizReady() {
    const q = window.EduQuiz;
    return !!(q && q.ready && typeof q.ask === 'function');
  }

  function gridWildCount() {
    let n = 0;
    state.grid.forEach(function (row) { row.forEach(function (g) { if (g && g.type === WILD) n++; }); });
    return n;
  }

  /**
   * 이번 리필의 새 칸 count개 종류. spawn 이 0 이면 일반 무작위와 완전히 같다.
   * spec §26.9: 구조 등급이 켜져 있으면(state.board) ? 여부를 기존 규칙으로 먼저 정하고 나머지 칸을 구조 규칙으로 채운다
   * (pickRefillTypesStructured). 꺼져 있으면(state.board == null) 위의 기존 경로 그대로다.
   */
  function planRefill(count) {
    const w = CONFIG.edu.wild;
    const on = w.spawn > 0 && quizReady();
    const force = on && w.guaranteeFirst && !state.edu.firstDone && count > 0;
    if (force) state.edu.firstDone = true;
    const opt = { spawn: on ? w.spawn : 0, max: on ? w.max : 0, force: force, n: TYPE_COUNT };
    if (state.board) return pickRefillTypesStructured(typeGrid(), on ? gridWildCount() : 0, state.board, Math.random, opt);
    return pickRefillTypes(count, on ? gridWildCount() : 0, Math.random, opt);
  }

  /** 첫 ? 등장 안내(조준 안내 줄을 잠깐 빌려 쓴다. 조준 중이면 건너뜀) */
  function showGiftHint() {
    const m = el['aim-msg'];
    if (!m || state.aim !== null) return;
    const txt = CONFIG.edu.text.giftHint;
    m.textContent = txt;
    m.hidden = false;
    setTimeout(function () { if (state.aim === null && m.textContent === txt) m.hidden = true; }, CONFIG.edu.hintMs);
  }
  // [/EDU]

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
    // [EDU] 새 칸 종류를 한꺼번에 정한다(열 순서대로 소비). ?가 하나라도 있으면 첫 등장 안내.
    // spec §26: 구조 등급이 있으면(state.board) planRefill 이 중력 뒤 격자(state.grid)를 보고 ? 먼저·나머지는 구조 규칙으로 정한다(소비 순서는 그대로)
    const newTypes = planRefill(res.empties.reduce(function (a, b) { return a + b; }, 0));
    let nk = 0;
    if (!giftHintShown && newTypes.indexOf(WILD) !== -1) { giftHintShown = true; showGiftHint(); }
    // [/EDU]
    for (let c = 0; c < COLS; c++) {
      const n = res.empties[c];
      for (let i = 0; i < n; i++) {
        const gem = createGem(newTypes[nk++], i - n, c, 0);     // [EDU] (원래: randInt(TYPE_COUNT))
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

  // [EDU] ? 가 매치로 지워질 때(§21.7.5): 스왑으로 시작한 행동이면 ? 하나당 문제 1개(한 행동 최대 quiz.maxPerAction), 스킬이 시작한 행동이면 문제 없음
  function noteWildClears(ctx, n) {
    if (!n) return;
    if (ctx.fromSkill) { state.edu.skipped += n; return; }
    ctx.quizzes = Math.min(CONFIG.edu.quiz.maxPerAction, (ctx.quizzes || 0) + n);
  }
  // [/EDU]

  /** 매치 → 제거 → 낙하/리필 → 재검사 루프. startStep: 스왑 1, 스킬 이후 2 */
  async function cascade(ctx, startStep) {
    let step = startStep;
    for (;;) {
      const tg = typeGrid();
      const groups = findMatches(tg);
      if (!groups.length) break;
      ctx.maxStep = Math.max(ctx.maxStep, step);
      setChain(step);
      sfx('match', step);
      groups.forEach(function (g) { awardGroup(ctx, g, step); });
      // [EDU] ? 가 두 그룹에 걸쳐도 한 번만 지운다(점수·게이지는 위에서 그룹마다 따로 계산). 플레이어 스왑에서 시작한 행동일 때만 문제 대상
      const cells = uniqueCells(groups);
      noteWildClears(ctx, wildCellsOfGroups(groups, tg).length);
      // [/EDU]
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

  // [EDU] 문제 흐름(§21.7.6): 행동의 연쇄가 모두 끝난 뒤 EduQuiz.ask() 를 ? 하나당 한 번씩 순서대로 부른다.
  /** 정답 보너스 가산: 점수 + 떠오르는 숫자. 게임이 진행 중이 아니거나 값이 이상하면 아무것도 하지 않고 0 을 돌려준다 */
  function addBonus(points) {
    const p = Math.round(Number(points));
    if (!isFinite(p) || p <= 0 || p > CONFIG.edu.bonus.maxPoints || state.phase !== 'playing') return 0;
    addScore(p);
    state.edu.bonus += p;
    floatText('+' + fmt(p), (ROWS - 1) / 2, (COLS - 1) / 2, '#ffe9a0');
    return p;
  }

  async function runQuizzes(ctx, id, holdMs) {
    const n = Math.min(ctx.quizzes || 0, CONFIG.edu.quiz.maxPerAction);
    if (n <= 0 || !quizReady()) return;
    await wait(0);                 // 일시정지 중이면 풀릴 때까지 기다린다(게임이 바뀌면 ABORT)
    state.quizActive = true;       // 칭찬 팝업을 보여 주는 동안과 문제 사이 간격도 시계 정지
    audio.duck(true);
    try {
      if (holdMs > 0) await wait(holdMs);
      for (let i = 0; i < n; i++) {
        if (i > 0) await wait(CONFIG.edu.quiz.gapMs);
        const q = window.EduQuiz;
        if (!q || typeof q.ask !== 'function') break;
        let res = null;
        try { res = await q.ask(); } catch (err) { res = null; }
        if (id !== state.gameId) throw ABORT;
        if (!res || typeof res !== 'object') continue;      // 낼 문제가 없었음(null): 통계·보너스 없음
        state.edu.asked++;
        if (res.right === true) {
          state.edu.right++;
          // 보너스 크기는 EduQuiz 가 난이도 배율까지 계산해 넘긴다. 값이 없거나 이상하면 같은 규칙(bonusFor)으로 계산한다
          addBonus(typeof res.bonus === 'number' && isFinite(res.bonus) && res.bonus > 0 ? res.bonus : bonusFor(state.level));
        }
      }
    } finally {
      if (id === state.gameId) { state.quizActive = false; audio.duck(false); }
    }
  }

  /** 게임이 바뀔 때(홈·레벨 선택·재시작) 진행 중인 문제 상태를 정리한다. 팝업을 닫는 일은 EduQuiz.cancel() 이 있으면 부른다 */
  function eduAbortQuiz() {
    if (!state.quizActive) return;
    state.quizActive = false;
    audio.duck(false);
    try { const q = window.EduQuiz; if (q && typeof q.cancel === 'function') q.cancel(); } catch (e) { /* 무시 */ }
  }

  /** EduQuiz 가 주는 소단원 요약 문구(없으면 빈 문자열) */
  function eduUnitLabel() {
    try {
      const q = window.EduQuiz;
      const t = q && typeof q.unitLabel === 'function' ? q.unitLabel() : '';
      return typeof t === 'string' ? t : '';
    } catch (e) { return ''; }
  }

  /** 결과 화면 한 줄: 이번 스테이지에서 낸 문제가 있을 때만. EduQuiz.summary(stats) 가 있으면 그 문구, 없으면 기본 문구 */
  function eduSummaryText() {
    const st = state.edu;
    if (!st.asked) return '';
    const stats = { asked: st.asked, right: st.right, bonus: st.bonus };
    try {
      const q = window.EduQuiz;
      if (q && typeof q.summary === 'function') {
        const t = q.summary(stats);
        if (typeof t === 'string' && t) return t;
      }
    } catch (e) { /* 기본 문구 */ }
    return CONFIG.edu.text.summary.replace('{asked}', String(stats.asked)).replace('{right}', String(stats.right)).replace('{bonus}', fmt(stats.bonus));
  }
  // [/EDU]

  async function runAction(fn) {
    if (state.locked || state.phase !== 'playing') return;
    setLocked(true);
    state.multHold = 0;
    clearHint();
    setSelected(null);
    const ctx = { total: 0, maxStep: 1, maxGroup: 3, noPost: false, fromSkill: false, quizzes: 0 };   // noPost: 무효 스왑/보드 변화 없는 스킬은 칭찬·재섞기 판정 생략 / [EDU] fromSkill·quizzes
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
        // [EDU] 연쇄 정산이 끝난 뒤 문제(칭찬 팝업은 잠깐 보여 준 다음). 문제가 끝나면 점수 정산 -> NO MOVES 판정 -> 목표 달성 판정
        if (ctx.quizzes > 0) {
          await runQuizzes(ctx, id, waited ? CONFIG.edu.quiz.praiseHoldMs : 0);
          waited = false;
        }
        // [/EDU]
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
    if (state.quizActive) return;     // [EDU] 문제 팝업이 키(O/X·1~4·Enter·Esc)를 쓴다: 게임 단축키·커서 이동은 모두 무시
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
    ctx.fromSkill = true;     // [EDU] 스킬이 시작한 행동: 직접 지움이든 스킬 뒤 자동 연쇄든 ? 가 지워져도 문제 없음(§21.7.5)
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
    // [EDU] 색은 진짜 6색 중에서만 고르고 ? 칸은 대상이 아니다(boltTargets). ?가 없으면 원래와 같은 무작위 호출 순서
    const pick = boltTargets(typeGrid(), CONFIG.skills.lightning.count, Math.random);
    if (!pick) return;
    const targets = pick.targets;
    // [/EDU]
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
  /** 스킬 설명 문구(CONFIG.skillInfo)의 {area}·{mult}를 현재 CONFIG 값으로 채운다 (spec §20.14) */
  function skillDesc(id) {
    const side = CONFIG.skills.fire.radius * 2 + 1;
    return String(CONFIG.skillInfo[id] || '')
      .replace('{area}', side + '×' + side)
      .replace('{mult}', String(CONFIG.skills.dark.mult));
  }

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
      b.setAttribute('aria-label', TYPES[i].name + ' 게이지 ' + v + '/' + max + (isFull ? ', ' + TYPES[i].skill + ' 사용 가능' : '') + '. ' + skillDesc(TYPES[i].id));
      b.setAttribute('aria-disabled', (!isFull || state.locked || state.phase !== 'playing') ? 'true' : 'false');
    }
  }

  function buildGauges() {
    el.gauges.innerHTML = '';
    TYPES.forEach(function (t, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gauge t-' + t.id;
      b.innerHTML = '<span class="fill"></span>' + gemMarkup(i) +
        '<span class="gtext"><b class="gname">' + t.skill + '</b><span class="gdesc">' + skillDesc(t.id) + '</span></span>' +
        '<span class="count"></span>';
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
    if (state.quizActive) return;           // [EDU] 문제 중에도 모든 시계(게임 타이머·물·어둠·힌트 쿨다운·자동 힌트·배율 유지) 정지
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
    if (!audio.muted) { audio.init(); audio.musicSync(); }     // 켬: 지금 장면의 곡을 시작/재개(꺼져 있던 동안 안 받은 곡은 이때 받는다)
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
    state.board = null;
    state.confirmFrom = null;
    state.cutinActive = false;
    state.quizActive = false;                                              // [EDU]
    state.edu = { asked: 0, right: 0, bonus: 0, firstDone: false, skipped: 0 };   // [EDU] 스테이지마다 문제 통계·첫 등장 보장 초기화
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
    eduAbortQuiz();     // [EDU]
    state.gameId++;
    cancelCutin();
    audio.musicMenu();       // 시작 화면 곡(플레이 곡이 소리 나는 중이면 페이드아웃 뒤). 이미 재생 중이면 그대로 둔다
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
    // 외부 모듈(ranking-ui.js)이 [시작]을 가로챌 수 있다(프로필 안내 팝업). false 를 돌려주면 여기서 멈춘다.
    if (startGate) { let go = true; try { go = startGate() !== false; } catch (e) { go = true; } if (!go) return; }
    goStages();
  }
  function enterStages() {      // 게이트를 거치지 않고 레벨 선택으로 (팝업·프로필 저장 뒤에 이어갈 때)
    if (state.phase !== 'start') return;
    goStages();
  }

  function restartStage() { startStage(state.stage); }
  function nextStage() { startStage(Math.min(CONFIG.stages.count, state.stage + 1)); }

  async function startStage(stage) {
    const lv0 = save.level;
    if (!stageUnlocked(save.progress[lv0], stage)) return;     // 잠긴 레벨은 시작 불가
    audio.init();
    eduAbortQuiz();     // [EDU]
    state.gameId++;
    const id = state.gameId;
    cancelCutin();
    audio.musicPrepare();    // 시작 화면 곡 페이드아웃 + 이번 판 곡을 골라 src 만 설정(재생은 GO 뒤)
    hideAllOverlays();
    applyDifficulty(save.level);     // 선택 난이도 값을 활성 위치에 적용(재시작도 같은 난이도)
    resetState();
    const lv = CONFIG.level;
    state.stage = stage;
    state.board = boardParams(lv, stage);     // spec §26: 난이도·레벨의 구조 등급(null = 균등 무작위). 입력은 (난이도, 레벨)뿐
    state.target = stageTarget(lv, stage);
    state.startTime = CONFIG.time.start;
    el['level-chip'].textContent = levelLabel(lv) + ' · Lv' + stage;
    el['level-chip'].className = 'level-chip lv-' + lv;
    el['pause-level'].textContent = stageLabel(lv, stage) + ' · 목표 ' + fmt(state.target);
    el['end-level'].textContent = stageLabel(lv, stage);
    el['count-info'].textContent = '레벨 ' + stage + ' · 목표 ' + fmt(state.target) + '점';
    // [EDU] 소단원 요약 문구(있는 요소에만)와 stageStart 이벤트(edu.js 가 문제 통계 초기화에 쓴다)
    const unitText = eduUnitLabel();
    ['pause-unit', 'count-unit'].forEach(function (uid) {
      const ue = document.getElementById(uid);
      if (ue) { ue.textContent = unitText; ue.hidden = !unitText; }
    });
    emit('stageStart', { diff: lv, stage: stage, target: state.target, unit: unitText });
    // [/EDU]
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
    if (state.quizActive) return;     // [EDU] 문제 중에는 일시정지 없음(시계가 이미 멈춰 있다). 탭 전환·Esc 도 같음
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
    if (state.quizActive) return;     // [EDU]
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
    eduAbortQuiz();     // [EDU]
    state.gameId++;
    cancelCutin();
    audio.musicMenu();
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
    // [EDU] 결과 화면의 문제 요약 한 줄(#end-quiz 가 있으면) + stageEnd 이벤트(edu.js 의 요약·통계용)
    const quizSummary = eduSummaryText();
    const quizSumEl = document.getElementById('end-quiz');
    if (quizSumEl) { quizSumEl.textContent = quizSummary; quizSumEl.hidden = !quizSummary; }
    emit('stageEnd', { diff: lv, stage: stage, cleared: cleared, score: state.score, target: state.target, asked: state.edu.asked, right: state.edu.right, bonus: state.edu.bonus, summary: quizSummary });
    // [/EDU]
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
      if (document.hidden) {
        if (state.phase === 'playing') pauseGame();
        else if (audio.scene === 'menu') audio.bgmPause();      // 시작·단계 선택 화면의 곡도 멈춘다(크롬은 숨은 탭에서도 소리가 난다)
      } else {
        audio.musicSync();                                       // 다시 보이면 시작 화면 곡을 이어서
      }
    });
    bindFirstInput();
  }

  /** 첫 사용자 입력(spec §22.3.3): 캡처 단계에서 효과음·음악 요소를 준비하고 시작 화면 곡을 시작한다.
   *  audio.ready 가 되면 떼는 1회용 핸들러. pointerdown 은 쓰지 않는다(iOS Safari 는 touchend·click 부터 사용자 활성으로 본다).
   *  소리 꺼짐이면 init 하지 않으므로(곡을 받지 않는다) 켜거나 첫 판을 시작할 때까지 남아 있다. play() 가 자동재생 정책으로 거절되면 다시 걸린다. */
  const FIRST_INPUT_EVENTS = ['click', 'touchend', 'keydown'];
  let firstInputArmed = false;
  function onFirstInput() {
    if (!audio.muted) audio.init();
    audio.musicSync();
    if (audio.ready) disarmFirstInput();
  }
  function armFirstInput() {
    if (firstInputArmed) return;
    firstInputArmed = true;
    FIRST_INPUT_EVENTS.forEach(function (t) { document.addEventListener(t, onFirstInput, true); });
  }
  function disarmFirstInput() {
    firstInputArmed = false;
    if (!document.removeEventListener) return;
    FIRST_INPUT_EVENTS.forEach(function (t) { document.removeEventListener(t, onFirstInput, true); });
  }
  function bindFirstInput() {
    audio.onBlocked = armFirstInput;
    armFirstInput();
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
    setStartGate: function (fn) { startGate = typeof fn === 'function' ? fn : null; },
    enterStages: enterStages,
    getPhase: function () { return state.phase; }
  };

  // [EDU] 교육용 연결점(§21.10): edu.js 가 보너스를 더하고 문제 중 상태를 읽는다. bonusFor 는 팝업 표시용(같은 규칙으로 계산)
  window.ElementGemsEdu = {
    addBonus: addBonus,
    bonusFor: bonusFor,
    state: function () {
      return { quizActive: !!state.quizActive, level: state.level, asked: state.edu.asked, right: state.edu.right, bonus: state.edu.bonus };
    }
  };

  // 시험용: Node 시험 하네스가 globalThis.__EG_TEST__ 를 미리 만들어 둔 경우에만 내부를 노출한다(브라우저에서는 아무 일도 없다).
  if (typeof globalThis !== 'undefined' && globalThis.__EG_TEST__) {
    globalThis.__EG_TEST__.internals = {
      state: state, save: save, el: el, CONFIG: CONFIG, startStage: startStage, handleTap: handleTap, trySwap: trySwap, onGauge: onGauge,
      onHint: onHint, pauseGame: pauseGame, resumeGame: resumeGame, goStages: goStages, goHome: goHome, typeGrid: typeGrid, setGemType: setGemType,
      writeSave: writeSave, loadSave: loadSave, frame: frame, onKey: onKey, listMoves: listMoves, reshuffleBoard: reshuffleBoard
    };
  }
  // [/EDU]

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
