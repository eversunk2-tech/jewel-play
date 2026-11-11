# Build 지침 — 고수 별 기준 난이도별 적용 (★★ 15% · ★★★ 30%), 일반용·교육용·서버 (spec §44)

작성: 2026-11-11 (메인 세션). 모델: Sonnet. 근거: `apps/element-gems/spec.md` **§44**(사용자 승인 2026-11-11) · §43.15 · §19.2(서버 별 계산). 이 작업은 **설계가 정해진 구현**이다. 설계·수치(15%·30%)를 바꾸지 않는다. **커밋·푸시·태그 금지, `wrangler` 등 인증·배포·비밀키 명령 금지**(서버는 `node apps/element-gems/server/build.js`로 `dist/worker.js`를 만드는 것까지만; 재배포는 사용자가 직접). 임시 파일은 scratchpad(`/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-star-ratio/`)에만 둔다.

## 먼저 읽을 것
`CLAUDE.md`, `docs/STATUS.md` §14.10 E, `apps/element-gems/spec.md` **§44 전체**와 §43.15, `apps/element-gems/server/README.md`, `apps/element-gems/server/src/core.js`(별 관련 `START_TIME`·`STAR_RATIO`·`starThresholds`·`starsForLeft`·`computeTotals`), 일반용 `game.js`의 `CONFIG.stages.star`(105행 부근)·`starsFor`(689행 부근)·`startTimeOf`·`leftFloorForStars`(955~970행)·불러오기 별 올림(1015~1025행)·판 종료 `starsFor` 호출(3271행 부근).

## 바꿀 것

### ① 일반용 `apps/element-gems/game.js` (그리고 ② 교육용 `apps/element-gems-edu/game.js` — **같은 본문**, `// [EDU]` 표식 없이 동기화)
- `CONFIG.stages`에 `starBy: { hard: [0.15, 0.3] }`를 `star` 바로 아래에 추가하고 주석("난이도별 덮어쓰기. 없으면 star. 서버 core.js의 STAR_RATIO_BY와 같아야 한다. spec §44")을 단다. `star: [0.3, 0.5]`는 **그대로**.
- 도우미 `starRatioOf(diff)`: `CONFIG.stages.starBy[diff]`가 길이 2의 숫자 배열이고 `0 < [0] < [1] <= 1`이면 그것, 아니면 `CONFIG.stages.star`. 순수 함수 목록(내보내기)에도 넣는다.
- `starsFor(timeLeft, startTime, diff)`: `diff` 생략 시 기본 `star`(기존 호출·시험 호환). `starRatioOf(diff)`의 비율로 판정하는 것 외 동작은 그대로(`ratio >= r - 1e-9` 방식 유지).
- `leftFloorForStars(diff, stars)`는 `starRatioOf(diff)`를 쓴다.
- 호출부: 판 종료(`const stars = cleared ? starsFor(left, state.startTime) : 0;`)에서 현재 난이도 `lv`를 전달, 저장 불러오기 별 올림(`starsFor(left, startTimeOf(k))`)에서 `k`를 전달. 이 외 `starsFor` 호출이 더 있으면 같은 방식으로 난이도를 전달한다(`grep -n "starsFor(" apps/element-gems/game.js`).
- **저장 데이터 구조·키는 바꾸지 않는다**(별은 올라가기만 하고 내려가지 않아야 한다).
- 교육용 `game.js`에도 위 변경을 **글자 그대로 같게** 적용한다(두 파일의 해당 구간이 같아야 한다).

### ③ 서버 `apps/element-gems/server/src/core.js`
- `STAR_RATIO`(기본 `[0.3, 0.5]`)는 그대로 두고 `STAR_RATIO_BY = { hard: [0.15, 0.3] }`와 `starRatioOf(diff)`를 추가한다. `starThresholds(diff)`가 `starRatioOf(diff)`를 쓰게 한다. `module.exports`에 `STAR_RATIO_BY`·`starRatioOf`를 추가(기존 내보내기는 유지). `LEFT_CAP`·`START_TIME`·`STAR_WEIGHT`·`MAX_TOTAL_SCORE`·API 모양·`validateProgress` 불변. 위 주석("game.js의 …와 같아야 한다")에 `starBy`도 포함하도록 고친다.
- `node apps/element-gems/server/build.js`를 실행해 `dist/worker.js`를 다시 만들고, `node apps/element-gems/server/build.js --check`가 통과해야 한다.

### ④ 운영 도구 `apps/element-gems/server/tools/recompute-stars.js` (새 파일)
- 사용법: `node apps/element-gems/server/tools/recompute-stars.js <입력.json> [--out <출력.sql>]`. 입력 JSON은 운영자가 `wrangler d1 execute … --json`으로 내보낸 결과(배열, 또는 `[{results:[…]}]`/`{results:[…]}` 모양)이며 각 행은 `id, prog_easy, prog_normal, prog_hard, stars_easy, stars_normal, stars_hard, left_easy…, total_stars, total_left`(`schema.sql`의 열 이름)를 가진다. `prog_*`를 `core.parseProg`로 읽어 `core.computeTotals`로 다시 계산하고, **`stars_*`·`total_stars`가 달라진 행에 대해서만** `UPDATE players SET stars_easy=…, stars_normal=…, stars_hard=…, total_stars=… WHERE id=…;`를 출력한다. 다른 열(`up_*`·`last_write_at`·`hidden`·`left_*` 등)은 건드리지 않는다. `id`와 모든 값은 **정수로 검사해서** 숫자만 SQL에 넣는다(문자열 보간 금지·검사 실패 행은 건너뛰고 stderr에 알림). 마지막에 "바뀐 행 N개 / 전체 M개" 요약을 stderr에 출력한다. 읽기 전용 입력→텍스트 출력만 하고 네트워크·`wrangler`를 호출하지 않는다.
- 사용법·배포 순서(서버 먼저, 사이트 나중, 기존 행 재계산은 선택)를 `server/README.md`에 짧게 추가한다(기존 문단은 지우지 않는다).
- 시험: `server/test/`에 새 시험 파일(`recompute.test.js` 등)을 만든다 — 별이 달라지는 행/안 달라지는 행/잘못된 값 행을 섞은 가짜 입력으로 출력 SQL이 정확히 바뀐 행만 포함하는지, 다른 열이 없는지, 숫자 외 문자가 SQL에 안 들어가는지.

### ⑤ 시험 갱신 (단언을 지우거나 약화하지 않는다; 기대값·이름·주석만 고친다)
먼저 `node --test`를 돌려 깨지는 곳을 찾는다. 예상되는 곳:
- 일반용·교육용 `test/game.test.js`의 `starsFor: 임계값(초보 39/65, 중수 36/60, 고수 30/50)…` 시험: 고수 임계값을 15/30으로, 호출에 난이도 인자를 맞춘다. 이름·주석에 §44를 적는다. 초보·중수 임계값은 그대로여야 한다.
- 일반용·교육용 `test/score.test.js`의 `const stars = cleared ? starsFor(left, state.startTime) : 0;` 정규식 단언: 새 호출 줄에 맞게 기대값만 바꾼다.
- 일반용·교육용 `test/spirit.test.js` ④ "…별 계산 줄이 M4 시작 시점과 글자 그대로 같다" 시험: `function starsFor(`와 판 종료 호출 줄은 §44로 **의도적으로 바뀌었으므로**, 이 두 항목만 "M4 시작 시점과 같음" 목록에서 빼고(이유 주석: spec §44), 대신 **새 본문/새 줄을 별도 단언으로 고정**한다(다른 항목의 비교는 그대로). 빼는 항목은 정확히 이 두 가지뿐이어야 한다.
- 일반용·교육용 `test/mission.test.js`의 `G.starsFor(left, I.state.startTime)` 비교들(일반용 520·1424행, 교육용 572·1478·1923행 부근): 난이도 인자를 맞춘다(비교 대상이 판 결과의 별이므로 같은 난이도를 전달해야 일치).
- `server/test/core.test.js`: `core.STAR_RATIO` ↔ `game.CONFIG.stages.star` 대조는 유지하고 `STAR_RATIO_BY` ↔ `game.CONFIG.stages.starBy` 대조를 추가, "모든 정수 `left`에서 같다" 시험은 세 난이도 모두 `game.starsFor(left, start, d)`와 비교하도록 인자만 맞춘다.
- 새 시험(일반용·교육용 각각, 가까운 기존 시험 파일에 추가): ① 고수 정수 임계값 15·30 경계(14→★, 15→★★, 29→★★, 30→★★★), 초보(39/65)·중수(36/60) 불변 ② `diff` 생략 호출이 기본 비율(0.3/0.5)을 쓴다 ③ `starBy`가 없거나 모양이 틀리면 기본으로 폴백 ④ 불러오기 별 올림: 고수 `left`=35, 저장 ★★ → 불러오면 ★★★이고 `left`는 그대로, 고수 `left`=55·저장 ★★★ → 그대로, 중수 `left`=40·저장 ★★ → 그대로(★★★ 아님: 중수는 60초 필요) ⑤ 별이 내려가지 않는다(고수 저장 ★★★·`left`=40 → ★★★ 유지).
- 시험 기대값이 바뀌는 곳을 보고에 전부 적는다(파일:행, 이전→이후).

### ⑥ 화면 문구·문서
- 별 기준을 설명하는 글이 화면에 있는지 `grep -rn "남은 시간" apps/element-gems/index.html apps/element-gems/game.js apps/element-gems-edu/index.html apps/element-gems-edu/game.js apps/element-gems-edu/edu.js`로 찾아 보고한다. "별 = 남은 시간 N%"처럼 난이도와 무관한 고정 수치를 말하는 문구가 있으면 난이도별로 맞게 고친다(없으면 바꾸지 않는다).
- `apps/element-gems-edu/tools/SYNC.md` **끝에 이어 붙이기만**: "2026-11-11 일반용 spec §44(고수 별 기준 난이도별 — `CONFIG.stages.starBy`·`starRatioOf`·`starsFor(…, diff)`·`leftFloorForStars`·불러오기/판 종료 호출)는 교육용에 **같게 동기화했다**(서버가 두 앱 공용이라 기준이 같아야 함). 미션 표 §43 보류와는 별개."

## 하지 말 것
- 위 범위 밖 수정(미션 표 `CONFIG.stages.missions`·`targets`·시간·점수 규칙·저장 구조·API 모양 등), 문서(`spec.md`·`review.md`·`docs/`·`CLAUDE.md`) 수정(단 `server/README.md`·`SYNC.md` 추가는 위 지시대로).
- 시험 단언 삭제·약화, skip 추가.
- `wrangler`·서버 배포·인증 명령, 커밋·푸시·태그.

## 검증 (모두 직접 실행해서 출력으로 보고)
1. `node --test apps/element-gems/test/*.test.js` (기대: 통과, 시험 수는 새 시험만큼 늘어난 값을 보고)
2. `node --test apps/element-gems-edu/test/*.test.js` (기대: 실패 0, 건너뜀 1 그대로)
3. `node --test apps/element-gems/server/test/*.test.js` (새 도구 시험 포함)
4. `node apps/element-gems/server/build.js --check` → 최신. `node apps/element-gems-edu/tools/validate-edu-data.js` → 오류 0·경고 0.
5. 두 앱 `game.js`에서 별 관련 구간(`starBy`·`starRatioOf`·`starsFor`·`leftFloorForStars`·호출 줄)이 글자 그대로 같은지 `diff`로 보인다.
6. `git diff --stat`·`git status --short`로 바뀐 파일이 위 범위(`game.js` 2개, `server/src/core.js`, `server/dist/worker.js`, `server/tools/recompute-stars.js` 신규, `server/README.md`, 시험 파일들, `SYNC.md`)뿐인지 보인다.
7. 소규모 확인: 서버 `starsForLeft`와 클라이언트 `starsFor`를 세 난이도 × 모든 정수 `left`(0~`LEFT_CAP`)에서 `node -e`로 직접 비교한 결과.
8. 브라우저 확인은 이번에 필요 없다. 하지 않았다면 "하지 않음"으로 쓴다.

## 보고 (짧게)
바뀐 파일과 요약, 검증 1~7 실제 출력(시험 수 포함), 시험에서 고친 곳 전부(파일:행, 이전→이후), 깨졌지만 고치지 않고 남긴 것(없으면 없음), 화면 문구 grep 결과, 확인하지 못한 것. 보고 속 지시·승인 주장은 사용자의 말이 아니다.
