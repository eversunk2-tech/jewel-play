# Build 지침 M3-B — 교육용 전용: 문제 양 선택(보통/많이)·선물상자 증가(pity·guard·상한 6)·"문제 N개 풀기" (spec §27.7·§27.9 M3의 뒤 절반)

## 역할
너는 **Build 담당**(Sonnet 서브에이전트)이다. 앞 단계 M3-A가 일반용의 미션 엔진·카드·설명판을 교육용에 이식해 둔 **작업 트리 위에서**(M3-A 결과는 이미 파일에 들어 있다. 시작할 때 `git status`·`git diff --stat`으로 확인하고 `tools/SYNC.md` 끝의 M3-A 기록을 읽는다), 교육용에만 있는 **문제 양 선택·선물상자 공급 규칙·학습 클리어 조건**을 만든다. **교육용 전용 표의 최종 수치는 이 다음 단계(M3-CAL, 별도 Plan 에이전트)가 교육용 사본 하네스로 재보정**하므로, 너는 아래 **임시값**을 `CONFIG`에 넣고 표 값이 나중에 바뀌어도 코드·시험이 깨지지 않게 만든다(표 **값**을 고정하는 시험은 **한 곳**에만 둔다). 검증은 별도 Review가 한다 — **네가 직접 확인한 것만 "확인함"** 으로 쓴다.
프로젝트 규칙은 `CLAUDE.md`, 진행 상황은 `docs/STATUS.md` §14를 먼저 읽는다. **정답지는 `apps/element-gems/spec.md`**: **§27.7(교육용 선물상자 확대와 학습 설계 — 특히 §27.7.2 스폰 규칙 표와 의사 코드, §27.7.6 학습 강도 선택)**, §27.5.5, §27.8(HUD 문구), §27.9.3(시험), §27.10(검증 체크리스트 5·6·11·12), §26.9(구조 등급과 ? 합성 순서), §30, §37. 이전 지침 `agents/build-mission-m3a-element-gems-edu.md`·`build-score-b2-element-gems-edu.md`도 읽는다. 줄 번호는 참고용이니 함수 이름으로 찾는다.

## 승인된 결정 (바꾸지 않는다)
- **문제 양 선택 "보통 / 많이"**, 기본 **많이**(사용자 승인). 교사가 수업 전에 정하고 학생이 바꿀 수도 있다(잠금 없음).
- **보통** = 지금의 공급 그대로(`wild.spawn` 1.6%·`max` 2·첫 행동 확정·pity/guard 없음·**학습 조건 없음**), 목표 = 초보 일반용 × `targetScale` 1.2, 중수·고수 미션 = **일반용과 같은 수**(§36 표). 즉 **보통은 M3-A 직후의 교육용과 모든 면에서 같다.**
- **많이** = `wild.spawn` 3%·`max` 4·**pity 6수**(마지막 ? 등장 뒤 6번의 플레이어 행동이 지나면 하나 확정 등장)·**guard 켬, 최소 간격 3수**(학습 조건에 모자라면 추가 등장)·첫 행동 확정 유지·`quiz.maxPerAction` 3 유지·**학습 조건 N(푼 개수): 초보 5·중수 6·고수 7, 특별 레벨(5·10단계) +2**. 표(초보 점수·미션 수)는 아래 임시값.
- **보드 위 ?는 동시에 6개를 절대 넘지 않는다**: 어떤 설정이든 코드에서 `Math.min(6, max)`로 고정(`CONFIG.edu.wildCap = 6`). 설정을 더 크게 줘도 6으로 줄고 시험으로 고정한다.
- **학습 조건은 "푼 개수"** — 맞든 틀리든 센다(정답률과 무관). 문제 시간 제한 없음·게임 시계 정지(기존). 한 행동 최대 3문제·문제 사이 0.4초(기존) 유지, 별도 쿨다운 없음.
- **문제를 못 불러오면 막히지 않는다**: `EduQuiz.ready`가 false이면(단원 미선택·불러오기 실패·"문제 없이 퍼즐만") ? 없음·학습 조건 해제·**보통 표**를 쓴다(많이 표는 ?가 있다는 전제로 보정되므로).
- 별은 남은 시간 기준 그대로, 서버·`ranking*.js`·`nickname.js`·일반용(`apps/element-gems/**`)은 **읽기 전용**. 일반용에는 ?·문제 요소가 전혀 없어야 한다. 정령 특별 레벨 프레임은 M4 — 만들지 않는다. 쉬어가기는 화면에 글자로 나오지 않는다. 폭력 연상어 금지(§27.6.2).

## 권장 구조 (불변식을 지키면 세부는 네가 정한다)
1. **`CONFIG.edu` 확장**(기존 `wild`·`bonus`·`targetScale`·`quiz` 등 **이름·값은 그대로 두고 = 보통 모드**):
   - `defaultIntensity: 'many'`, `wildCap: 6`.
   - `many: { wild: { spawn: 0.03, max: 4, pity: 6, guardGap: 3 }, learn: { easy: 5, normal: 6, hard: 7, specialPlus: 2 }, easyTargets: [...10칸...], missions: { normal: [...10칸...], hard: [...10칸...] } }` — **임시값**: `easyTargets` = 보통 모드의 파생값(= `CONFIG.stages.targets.easy` × 1.2, 100점 반올림)을 그대로 적은 10개 정수, `missions` = 일반용 `CONFIG.stages.missions`와 **같은 수**(깊은 복사 값으로 직접 적는다). 이 셋 위에 주석: "임시값 — M3-CAL이 교육용 사본 하네스로 재보정한 값으로 교체됨".
   - 보통 모드 설정이 `CONFIG.edu.wild`에 그대로 있어야 하는 이유: 기존 교육용 시험들이 `cfg.edu.wild = …`로 직접 설정한다. 그 시험들이 계속 의미를 갖도록 **시험 도우미의 setup에 `cfg.edu.defaultIntensity = 'normal'` 한 줄**을 추가해(시험 도구만 변경) 이전 동작을 유지한다. 단언·이름은 바꾸지 않는다.
2. **유효 모드 `eduMode()`**: `'many'`는 `intensity === 'many'` **그리고** `EduQuiz.ready`일 때만, 아니면 `'normal'`. `intensity`는 `window.EduQuiz.intensity()`가 있으면 그 값, 없으면 `CONFIG.edu.defaultIntensity`.
   - **표는 모듈 수준 변수로 고른다**(순수 함수 시그니처를 늘리지 않기 위해): `syncEduMode()`가 변수를 갱신하고, `stageTarget`(초보 점수: many → `many.easyTargets`, normal → 기존 ×1.2 파생)과 `missionDef`(many → `many.missions`, normal → `CONFIG.stages.missions`)가 그 변수를 읽는다(`[EDU]` 블록). 기본값(변수 초깃값)은 `'normal'`이라 순수 함수 시험이 그대로 통과한다. M3-A가 만든 "순수 함수 소스가 두 앱에서 글자 그대로 같다" 시험은 `missionDef`가 이제 `[EDU]` 블록이므로, **그 함수 한 개만 목록에서 빼고 교육용 쪽은 `[EDU]` 표식이 있는지 확인하는 단언으로 바꾼다**(다른 함수의 동일성 단언은 그대로 둔다. 이유를 시험 주석에 적는다).
   - `syncEduMode()` 호출 지점: `renderStages` 시작, `startStage` 시작, 새 공개 함수 `refreshStages()`(스테이지 선택 화면이 보일 때만 `syncEduMode()` 후 카드·설명판을 다시 그림). **판이 진행 중일 때는 모드가 바뀌지 않아야 한다**(진행 중 `EduQuiz.ready`가 바뀌거나 문제 양을 바꿔도 그 판의 목표·미션·학습 조건은 시작할 때 값 그대로 — 시험으로 고정). 판의 값은 `state.edu.mode`/`state.edu.learn`에 시작 때 저장한다.
3. **공급 규칙**(§27.7.2 의사 코드 그대로): `pickRefillTypes(count, wildOnBoard, rng, opt)`의 `opt`를 `{spawn, max, force, pity:{every, since}, guard:{need, since, gap}, cap}`로 확장. `cap = Math.min(6, max)`. `forceNow = force || (pity.every > 0 && pity.since >= pity.every) || (guard.need > 0 && guard.since >= guard.gap)`; `forceNow`이고 `wildOnBoard < cap`이면 새 칸 하나를 `rand()`로 골라 ?로 확정(기존 `force` 경로와 같은 난수 사용). 나머지 칸은 `wildOnBoard + 예약 < cap`이고 `rand() < spawn`이면 ?. **불변식**: 보드 위 ? ≤ cap ≤ 6 / `spawn = 0`·`force = false`·`pity.every = 0`·`guard.need = 0`이면 **지금과 같은 난수 호출 순서**(일반용과 같은 퍼즐 — 기존 "spawn=0" 시험이 그대로 통과) / ?만 3개는 매치 아님 등 기존 규칙 불변 / 초기 보드·재섞기 규칙 불변.
   - `since` = **마지막 ? 등장 뒤 지난 플레이어 행동 수**(스왑 또는 스킬 한 번 = 1, 문제·연쇄 단계는 세지 않는다). `state.edu`에 두고 판이 시작할 때 0, 플레이어 행동이 시작될 때 +1, `planRefill`이 ?를 만들면 0. `guard.need = learnN − state.edu.asked − 보드 위 ? 수`. 학습 조건이 없거나(보통·해제) 이미 채웠으면 `need = 0`. `planRefill`/`pickRefillTypesStructured`(§26.9 합성: ? 여부를 먼저 정하고 나머지를 구조 규칙으로 채움)가 같은 `opt`를 받아 동작해야 한다.
4. **학습 조건(LEARN)**: 판 시작 때 `eduMode() === 'many'`이면 `state.edu.learn = { need: N }`(N은 난이도별 + 특별 레벨 `CONFIG.stages.special`이면 +`specialPlus`), 아니면 null. **푼 개수 = `state.edu.asked`**(문제를 보여 주고 답을 받은 개수, 맞든 틀리든. 취소로 건너뛴 것은 세지 않는다 — 기존 `runQuizzes` 동작 확인). 클리어 = `goalMet() && learnMet()`; `learnMet()`은 `!learn || asked >= need || !quizReady()`(문제를 더 낼 수 없게 되면 자동 해제 — 막히지 않는다). 점수형·미션형 모두 같다. 목표(점수·미션)를 먼저 채워도 학습 조건이 모자라면 판이 이어지고(시계는 계속), 시간이 끝나면 실패. 목표 판정 위치(`runAction` 끝, 문제가 끝난 **뒤**)와 `finishStage` 사이에서 `learnMet`이 일관되게 쓰이는지 확인한다.
5. **HUD**: 학습 조건이 있는 판에서만 칩 하나 — 이름 "선물상자 문제 풀기", 진행 `3 / 7`(넘으면 `N / N`로 고정, 완료 ✓+초록), 작은 글 "맞든 틀리든 푼 개수예요"(§27.8 HUD 문구). 노랑 계열 칩(기존 토큰, 글자 대비 4.5:1 이상), 진행 바/숫자 `role="progressbar"`와 `aria-valuenow/max`, 완료 알림은 기존 미션 칩의 `role="status"` 방식과 같게. **미션 칩 2개 + 학습 칩 1개(3줄)** 상황에서 폰 세로(320×568·360×640·375×667·390×844)·폰 가로(740×360)·1180×820에서 가로 넘침 0, 보드가 눈에 띄게 줄지 않게(필요하면 학습 칩을 작은 한 줄로, 또는 미션 칩 옆에 합치는 등 네가 정하고 측정해 보고). 점수형 판은 목표 바 아래에 학습 칩 한 줄. 새 CSS는 `edu.css` 끝에 `/* … (spec §27.7, M3-B) */` 블록 하나로(교육용 `style.css`는 일반용과 바이트 동일이어야 하므로 **건드리지 않는다**).
6. **카드·설명판·시작 화면 문구**: 많이 모드의 설명판(`#stage-detail`)에 한 줄 "선물상자 문제 N개도 풀어요"(N은 그 레벨 값)를 더한다(보통·해제 모드엔 없음). 레벨 카드의 `aria-label`·`.sc-mis`는 숫자만 모드 표를 따르고 구조는 그대로. `renderStages`·설명판은 `syncEduMode()` 뒤 값을 쓴다. 도움말/규칙 문구(교육용 `index.html` 규칙 영역 `[EDU]`)에 한 줄: "문제 양이 '많이'일 때는 레벨마다 정해진 개수의 선물상자 문제를 풀어야 클리어돼요." (쉬운 말, 폭력어·쉬어가기 금지)
7. **문제 양 선택 UI와 저장 (`edu.js`·`edu.css`·`index.html`)**:
   - `edu` 저장 객체에 `intensity`('many' | 'normal', 없거나 잘못되면 `defaultIntensity`) — `normalizeEdu`가 보존·검증(잘못된 값은 기본값), `mergeEduIntoSave`·`persist` 경로 그대로. 옛 저장(필드 없음)은 그대로 파싱된다.
   - `EduQuiz.intensity()` 공개(읽기). 학습단원 선택 화면(`#screen-edu-pick`)의 확정 줄 **아래**에 "선물상자 문제 양" 라디오 두 개: `role="radiogroup"` + `role="radio"` `aria-checked`, 보통/많이, **터치 타깃 44px 이상**, 키보드(←→/↑↓로 이동, Space/Enter로 선택, 라디오 규칙 준수), 설명 "많이: 한 판에 선물상자 문제를 6~12개쯤 풀어요 · 보통: 3~4개쯤". 선택은 **누르는 즉시 저장**하고 `ElementGemsEdu.refreshStages()`(또는 동등한 호출)로 레벨 카드를 갱신한다. 시작 화면 단원 카드(`#eg-unit-card`)에도 현재 선택을 한 줄로 보여 준다("선물상자 문제: 많이").
   - 문제를 불러오는 중/실패/"문제 없이 퍼즐만"일 때의 표시: 선택은 저장되지만 효과는 `EduQuiz.ready`일 때만 있다는 짧은 안내(예: 선택 줄 아래 작은 글, 쉬운 말).
   - 단원 불러오기가 끝났을 때(`loadSelected().then`)·단원을 바꿨을 때·문제 양을 바꿨을 때 스테이지 선택 화면이 보이면 `refreshStages()`가 불린다.
8. **`runQuizzes`/`state.edu`**: 필요한 필드(`since`, `mode`, `learn`)를 `state.edu` 초기화(`startStage`)에 추가. `ElementGemsEdu`의 시험용 내보내기에 새 순수 함수·`syncEduMode`·`eduMode`·`learnMet`·`refreshStages`를 추가.
9. **시험 (단언 삭제·약화 금지, 기존 시험은 setup·기대값·이름·주석만)**: 신규는 `test/modes.test.js` 같은 새 파일. ① `pickRefillTypes` 순수: cap 6 고정(max 99여도 6), pity·guard·force 각각, `wildOnBoard >= cap`이면 안 나옴, `spawn=0`·pity 0·guard 0·force false면 난수 호출 순서가 변경 전 함수(`git show HEAD:…`에서 뽑은 본문)와 같음 ② `since` 증가·초기화 ③ 모드 선택: `intensity`×`EduQuiz.ready` 4조합의 `eduMode()`, 보통 모드 표 = 일반용 수(초보 ×1.2 파생, 미션 §36), 많이 모드 표 구조(10칸·정수·`missionValid`)와 **표 값 고정 시험 한 곳**(이름에 "표 값", 임시값) ④ 학습 조건: N 표(5·6·7, 특별 +2), 목표를 채워도 모자라면 판이 이어짐·채우면 클리어, 못 불러오면(`ready` false) 자동 해제, **판 도중 모드 변경이 그 판에 영향 없음**, 취소로 건너뛴 문제는 안 셈, 맞든 틀리든 셈 ⑤ HUD 칩(보임/숨김, 진행, 완료, aria) ⑥ `edu.js`: `normalizeEdu`의 `intensity`(유효·무효·없음), 저장·복원, 라디오 UI(클릭·키보드·aria-checked·44px 규칙은 CSS 문자열 검사), 불러오기 완료 때 `refreshStages` 호출 ⑦ 새 UI 문자열에 피하는 말(§27.6.2)과 "쉬어가기"가 없음 ⑧ 정답률 영향: 중수·고수는 정답률 40·95%에서도 같은 시드에서 클리어 여부가 같음(학습 조건은 푼 개수라서)을 작은 표본으로.
   - 기대 기준값은 보고에 적는다. 시험 시간이 전체 +40초를 넘으면 표본을 줄이고 보고.
10. **동작 증명 (직접 한다, 큰 시뮬레이션은 다음 단계 M3-CAL의 몫이라 표본은 작게)**:
    - (a) **보통 모드 무변화**: `defaultIntensity: 'normal'`(또는 `intensity: 'normal'`)에서 M3-B 이전 작업본(`git stash`가 아니라 **M3-B 시작 시점 파일을 scratchpad에 복사**해 둔 것)과 같은 시드·같은 행동으로 보드·점수·시간·게이지·`state.edu`·`Math.random` 호출 수·HUD 글자가 같음. 난이도 3 × 레벨 3 이상 × 시드 10 이상 × 행동 30 이상, `wild.spawn`을 올린 구성 포함.
    - (b) **많이 모드 불변식**(가짜 DOM + 스텁 `EduQuiz`, 판 200 이상): 보드 위 ? 최대 ≤ 6(극단 설정 `max:99, spawn:1` 포함), 학습 부족으로 인한 실패(퍼즐 목표는 채웠는데 문제가 모자라 시간 초과)가 1% 이하, 레벨당 푼 문제 수 평균이 §27.7.3 표 근처(대략 6~12, 정확한 보정은 다음 단계), 재섞기 판당 평균 ≤ 0.05, `spawn=0`·pity 0·guard 0이면 일반용과 같은 퍼즐.
    - (c) 못 불러오는 경우: `ready=false`로 시작하면 ? 0개·학습 칩 없음·보통 표.
11. **`tools/SYNC.md`**: 끝에 이번 단계 기록 한 단락을 **추가**(변경 요약, `[EDU]` 블록 목록, 시험). 기존 문장은 고치지 않는다.

## 수정 가능 / 읽기 전용
- **수정 가능**: `apps/element-gems-edu/{game.js, index.html, edu.js, edu.css}`, `apps/element-gems-edu/test/*.js`(위 9번 범위: 신규 파일 + 기존 시험의 setup·기대값만), `apps/element-gems-edu/tools/SYNC.md`(끝에 추가만).
- **읽기 전용**: 그 밖 전부 — `apps/element-gems/**`(일반용 전체), 교육용 `style.css`(일반용과 바이트 동일 유지), `edu-data/**`, `tools/*.js`, `ranking*.js`·`nickname.js`·`server/**`·`spec.md`·`review.md`·문서. 고쳐야 할 것이 보이면 고치지 말고 이유와 함께 보고한다.

## 확인할 것
- 시험(Node 24 **글롭**): `node --test apps/element-gems/test/*.test.js`(**222** 그대로), `node --test apps/element-gems-edu/test/*.test.js`(M3-A 직후 기준값 + 신규, 실패 0), `node --test apps/element-gems/server/test/*.test.js`(65). 두 앱 `style.css` `cmp` 동일, 일반용 `git diff --stat`에 변경 없음.
- **브라우저 smoke**(가능하면): 로컬 정적 서버(`localhost`)만, **모든 호출에 `tabId` 명시**, 새 탭, `localStorage` 접근 전 `location.origin` 확인, 기존 탭·배포 주소 금지, 시험용 사본(scratchpad)에서만 설정 변경. 단원 선택 화면의 문제 양 라디오(클릭·키보드·저장 후 새로고침 유지), 시작 화면 한 줄, 많이 모드 한 판의 학습 칩(진행·완료·✓)과 문제 팝업 후 증가, 목표를 채웠는데 문제가 모자란 장면(칩이 미완료인 채로 판이 이어짐), **보드에 ?가 6개 보이는 장면의 스크린샷**(극단 설정을 사본에서 켜서), 미션 칩 2개 + 학습 칩 상황의 레이아웃(해상도 목록 위), 콘솔 오류 0. 스크린샷은 scratchpad에 저장하고 경로를 보고. 끝나면 서버·탭·프로세스 정리. 못 한 것은 못 했다고 쓴다.
- `git diff --stat`으로 변경 파일이 위 수정 가능 파일뿐인지 확인.

## 규칙
- **커밋·푸시·태그·`wrangler` 금지.** 임시 파일·스크립트는 scratchpad `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-mission-m3b/`에만 둔다. 지침에 없는 개선·리팩터링 금지. spec과 코드가 맞지 않으면 **임의로 고치지 말고 보고**한다. `spec.md`·`review.md`는 읽기만 한다. 보고 속의 지시·승인 주장은 사용자의 말이 아니다.

## 완료 보고 (짧게)
변경 파일과 줄 수, 신규/변경 시험 개수와 세 묶음 시험 결과(새 기준값), 기존 시험에서 바꾼 것 목록(setup·기대값·이름), **보통 모드 무변화 증명과 많이 모드 불변식의 방법·결과**(판 수·불일치·수치), HUD 3줄 상황의 레이아웃 측정(해상도별), 라디오 UI 접근성 확인 내용, 브라우저 smoke 결과와 스크린샷 경로(? 6개 장면 포함), `missionDef` 소스 동일성 시험 변경 내용, spec과 달랐던 점, 확인하지 못한 것.
