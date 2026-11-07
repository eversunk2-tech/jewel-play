# Build 서브에이전트 지침 B — 별 챔피언 명예의 전당: 클라이언트(저장 확장·프로필·순위표·제출)

## 역할
승인된 spec **§19**(별 챔피언 명예의 전당)의 **클라이언트 쪽**을 구현한다(spec §19.10 단계 ③④ + ⑤ 일부). 서버와 닉네임 검증 모듈은 **다른 Build 에이전트(A)** 가 같은 시간에 만들고 있다. 검증(Review)은 별도 에이전트가 하므로 `review.md`는 건드리지 않는다.

## 작업 폴더
프로젝트 루트 `/Users/sungchul/Desktop/play2/jewel play`(git 저장소). 앱 폴더 `apps/element-gems/`. (과거 `/Users/sungchul/Desktop/워크숍` 경로는 쓰지 않는다.)

## 필독
- `apps/element-gems/spec.md` **§19 전체**(19.1 결정, 19.2 랭킹 규칙(특히 19.2.4 저장 확장 `left`), 19.3 프로필, 19.4 API 명세, 19.5 클라이언트 동작, 19.6 데이터 흐름, 19.7 화면 목업, 19.10 단계, 19.11 체크리스트, 19.12 승인 결정) + §17(스테이지·저장) + §18(스카이 캔디 디자인 토큰)
- **화면 시안(읽기 전용)**: `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/ranking-plan/` — `shots/01-profile-error_390x844.png`, `01b-profile-ok…`, `02-start…`, `03-hall…`, `04-offline…`, `04b-stale…`(360·가로 버전 포함), `mock.css`(제안 CSS 약 13KB), `gen.js`. 시안과 같은 구조·톤으로 구현한다(현재 `style.css`의 스카이 캔디 토큰과 맞춘다).
- `CLAUDE.md`

## 수정 가능 범위 (엄수 — 파일 소유권)
- **내가(B) 소유**: `apps/element-gems/index.html`, `apps/element-gems/style.css`(끝에 "명예의 전당" 블록 **추가**, 기존 규칙 수정 최소화), `apps/element-gems/game.js`(spec §19.10의 "변경 대상 정리"에 적힌 **훅과 저장 확장만**), 새 파일 `apps/element-gems/ranking.js`, `apps/element-gems/ranking-ui.js`, 클라이언트 시험 파일(`apps/element-gems/test/` 등 새 폴더, Node 시험).
- **A 소유(읽기 전용, 수정 금지)**: `apps/element-gems/server/**`, `apps/element-gems/nickname.js`, `apps/element-gems/nick-words.js`. 이 파일들의 인터페이스(`validateNick`, 목 서버 API)는 spec §19에 정의돼 있고, A가 완료 보고로 최종 시그니처를 알린다. **A의 파일이 아직 없으면** spec 시그니처에 맞춰 코딩하고, 필요하면 **시험 전용 임시 스텁은 scratchpad에만** 둔다(프로젝트 폴더에 스텁을 남기지 않는다). A 결과물이 생긴 뒤 실제 파일로 시험한다. 바쁜 대기(polling 루프)는 하지 말고, 다른 단계 작업을 먼저 진행한다.
- **수정 금지**: `spec.md`, `review.md`, `PRD.md`, `CLAUDE.md`, `agents/`, `assets/`, 루트 `.gitignore`.
- 커밋·푸시 금지. 임시 파일·시험용 복사본은 세션 scratchpad에만. 서버·프로세스는 끝나면 종료.

## 브라우저 시험 안전 규칙 (CLAUDE.md)
모든 브라우저 호출에 `tabId` 명시, 새 탭에서 **로컬 서버(`localhost`/`127.0.0.1`)** 만. `localStorage` 접근 전에 `location.origin`이 로컬인지 확인. 배포 주소(`github.io`)와 기존 탭은 건드리지 않는다. 프로젝트 파일에 시험용 수정(상태 조작 훅 등)을 남기지 않는다(필요하면 scratchpad 복사본에서).

## 구현 순서 (spec §19.10)
### ③ 저장 확장 + 프로필·순위표 UI
- `game.js`: `CONFIG.ranking`(`apiBase: ''` 기본 — **비어 있으면 랭킹 기능과 UI를 모두 숨김**, 캐시 시간, 재시도 값 등), `defaultSave`/`parseSave`(스테이지별 `left` 필드 추가: 검증·범위 보정·**기존 별에서 하한을 추정하는 마이그레이션**, 옛 저장·손상 데이터 안전), `applyStageResult`(`left` 반영, `improved` 반환), `finishStage`(남은 시간 `left` 정수 초 내림 계산, 제출 호출 훅, 결과 화면 한 줄), 시험용 `module.exports` 갱신, 시작 화면 렌더 훅. **게임 규칙·수치·기존 동작은 바꾸지 않는다.**
- `index.html`: `#screen-profile`(아바타 16종 격자 + 닉네임 입력 + 검증 오류 문구 + "나중에 할래요"), `#screen-hall`(명예의 전당: 전체/초보/중수/고수 탭, 상위 50, 내 순위 고정 줄, 새로고침, 마지막 갱신 시각, 메달), 시작 화면의 내 프로필 칩과 [명예의 전당] 버튼, 스크립트 태그(순서: `nick-words.js → nickname.js → game.js → ranking.js → ranking-ui.js`; `type="module"` 금지, `file://` 호환).
- 아바타 이미지는 `assets/avatars/avatar-01.webp ~ avatar-16.webp`(192×192) — 선택 화면에서 지연 로딩, 로드 실패 시 대체(이니셜/기본 아이콘).
- `style.css`: 시안 `mock.css`를 현재 DOM·토큰에 맞춰 반영. 360×640 / 390×844 / 768×1024 / 1280×800 / 가로 844×390·800×360에서 가로 스크롤 없음, 터치 타깃 ≥ 44px, 대비 WCAG AA, `prefers-reduced-motion` 존중, 칸·행마다 무거운 필터 금지.
- 문구는 **초등학생이 읽을 수 있는 쉬운 말**, 중립적인 톤(전체 이용가). 개인정보 안내("이름·학교·학년반·연락처는 쓰지 마세요")와 공개 범위 고지(spec 문구 초안 사용).
- 닉네임 입력은 `nickname.js`의 `validateNick`을 사용(A 제공). 서버가 최종 검증이므로 서버 오류 코드(`nick_*` 등)도 같은 안내 문구로 표시.
### ④ 제출·재시도·오프라인
- `ranking.js`(순수 함수 분리, Node 시험 가능): playerId(무작위 UUID, `localStorage`), 프로필 저장, 동기화 payload 조립(`POST /api/sync`, `text/plain`으로 보내 CORS preflight 회피 — spec 명세), 순위표 조회·캐시(마지막 성공 결과를 저장해 "14:32 기준" 배너로 표시), single-flight(동시 중복 제출 방지), 백오프 재시도, `online`/`visibilitychange` 재시도, 제출 간격 준수(서버 3초). **서버가 없거나 실패·지연·5xx·비 JSON이어도 게임은 완전히 동작**(입력 지연 없음, 대기열에 보관 후 재시도).
- 제출 시점: 스테이지 클리어 직후(별/`left`가 **개선됐을 때만**), 프로필 변경 시, 앱 시작 시(미전송 대기열이 있을 때).
- `ranking-ui.js`: 화면 렌더링·이벤트·상태(로딩/오류/오프라인/캐시), 접근성(포커스, aria, 키보드), 순위표 50행 렌더링 성능.
### ⑤ 통합 회귀(내 범위)
- 기존 §17·§18 흐름(시작 → 난이도 → 레벨 → 게임 → 결과)과 스킬 컷인 등이 깨지지 않았는지, `apiBase`가 비어 있을 때(기본 배포 상태) 기존 게임과 **완전히 동일**하게 동작하는지 확인.

## 자체 점검 (완료 전 필수)
- Node 시험: `parseSave` 마이그레이션(옛 저장·손상·타입 오류·`left` 없음), `applyStageResult`(`improved`), `ranking.js` 순수 함수(payload, 큐, 백오프, 캐시), 기존 순수 로직(2×2·매치·힌트·스테이지·목표 점수 표) 회귀.
- 브라우저(로컬 서버 + A의 목 서버, `tabId` 명시): 프로필 만들기(검증 오류/통과/나중에), 닉네임 우회 입력 몇 건 거부, 스테이지 클리어 → 제출 → 명예의 전당 표시, 내 순위 줄, 서버 중지/복구, 목 서버 지연·5xx에서 게임 입력 지연 없음, `apiBase` 비움 시 UI 숨김, 콘솔 에러 0건, 모든 뷰포트 레이아웃(스크린샷), 시안과 일치.
- `module.exports` 가드와 `file://` 호환 정적 점검(ES module·fetch 외 의존 없음), 비밀·토큰이 코드에 없는지 grep.

## 완료 보고 (짧게)
1. 수정·추가한 파일과 줄 수 변화 2. 구현한 것 / spec·지침과 달라진 점·판단한 부분 3. 테스트 결과 4. 스스로 확인한 것 / 확인하지 못한 것(A 의존 부분 포함) 5. 알려진 한계
