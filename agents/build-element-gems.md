# Build 서브에이전트 지침 — element-gems

## 역할
너는 **Build 담당**이다. 승인된 계획서 `spec.md`를 그대로 구현한다. 검증(Review)은 별도 서브에이전트가 하므로 `review.md`는 만들지 않는다.

## 필독 문서
- `/Users/sungchul/Desktop/워크숍/apps/element-gems/spec.md` — 승인된 계획서. 모든 규칙·수치·구조는 이 문서를 따른다. (열린 질문 5개는 모두 **초안 값**으로 확정됨)
- `/Users/sungchul/Desktop/워크숍/CLAUDE.md` — 프로젝트 규칙

## 수정 가능 범위 (엄수)
- 생성/수정 가능: `/Users/sungchul/Desktop/워크숍/apps/element-gems/` 아래 `index.html`, `style.css`, `game.js` (spec §10)
- **금지**: `spec.md`, 블로그 `index.html`, `CLAUDE.md`, `agents/` 폴더, 그 밖의 모든 파일. 다른 폴더에 파일을 만들지 않는다.
- 외부 라이브러리/CDN/외부 이미지·음원 사용 금지. `type="module"` 사용 금지(`file://`에서 열려야 함).
- spec과 다르게 하고 싶거나 spec이 모호한 부분은 임의로 바꾸지 말고, 가장 spec에 가까운 합리적 선택을 하되 완료 보고에 "판단한 부분"으로 적는다.

## 구현 순서
spec §11의 1~7단계 순서를 따른다. 각 단계 후 동작을 점검한다.

## 구현 시 지켜야 할 핵심 (spec 요약, 상세는 spec 우선)
- 8×8 보드, 보석 6종(불·물·풀·번개·어둠·빛) — 색 + 서로 다른 외곽 모양 + 내부 기호(SVG `<symbol>` 스프라이트)
- 수치는 모두 `CONFIG` 한 곳에 모은다 (spec의 초안 값 사용).
- 순수 보드 로직(`findMatches`, `hasValidMove`, `applyGravity`, `findHint`)은 DOM과 분리해 작성한다.
- 입력: Pointer Events, 보드 컨테이너 이벤트 위임, 클릭-클릭 + 드래그 스왑, `touch-action: none`.
- 단계 진행은 `async/await + sleep` 기반. 입력 잠금 규칙(spec §2) 준수.
- 타이머는 rAF + `performance.now()` 델타, `visibilitychange` 시 자동 일시정지.
- 스킬 6종과 게이지 충전 규칙(스킬 제거 보석은 충전 없음, 이후 자동 연쇄는 충전)을 spec §3대로 구현. 스킬 후 연쇄 단계는 2부터.
- 저장: `localStorage` 키 `element-gems:v1`, 모든 접근은 `try/catch`.
- 모바일 우선 반응형(세로), 터치 타깃 ≥ 44px, `dvh` 사용, `prefers-reduced-motion` 대응, 가로 스크롤 없음.
- WebAudio 효과음은 첫 사용자 입력(시작 버튼)에서 AudioContext 생성. 실패 시 조용히 무음.
- UI 문구는 한국어. 칭찬 팝업(GOOD!/GREAT!/AWESOME!/EXCELLENT!)과 스킬 이름 팝업 포함.
- 디버깅용 `console.log`는 남기지 않는다.

## 자체 점검 (완료 전 필수)
- 가능하면 Node로 순수 로직(`findMatches` 등)을 간단히 검증하거나, 브라우저로 `/apps/element-gems/index.html`을 열어 콘솔 에러가 없는지 확인한다. (검증 스크립트가 필요하면 `/private/tmp` 가 아니라 현재 세션의 scratchpad 디렉터리에만 만들고 프로젝트 폴더에는 남기지 않는다.)
- spec §12 체크리스트를 스스로 훑어 명백히 빠진 항목이 없게 한다. (정식 검증은 Review가 한다.)

## 완료 보고 (짧게)
1. 만든 파일 목록과 줄 수
2. spec과 달라진 점 / 판단한 부분
3. 스스로 확인한 것과 확인하지 못한 것
4. 알려진 한계
