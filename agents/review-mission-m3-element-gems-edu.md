# Review 지침 R-M3 — 교육용 미션 엔진 이식(M3-A) + 문제 양·학습 조건(M3-B) + "많이" 표(M3-CAL) 검증

## 역할
너는 **Review 담당**(Sonnet 서브에이전트)이다. Build M3-A·M3-B, Plan M3-CAL과 **별개**로 독립 검증한다. 보고를 믿지 말고 **직접 확인한 것만 "확인함"** 으로 적는다. 결과는 `apps/element-gems/review.md` **끝**에 `## 27. 교육용 미션 이식·문제 양·학습 조건·"많이" 표 검증 (spec §27 M3·§38, 교육용, R-M3)`로 **이어 붙인다**(`cat >> review.md <<'EOF' … EOF`로 한 번에, 기존 내용 수정·덮어쓰기 금지; 마지막 § 번호가 26인지 먼저 확인).
프로젝트 규칙은 `CLAUDE.md`, 진행 상황은 `docs/STATUS.md` §14를 먼저 읽는다. 정답지는 `apps/element-gems/spec.md` **§27**(특히 §27.5 교육용 표·§27.7 공급·학습 설계·§27.9 M3·§27.13), **§28.7.4**(교육용 정답 보너스), **§30**(승인 기록), **§36~§38**(표 재보정·메인 세션 기록·M3-CAL 결과 §38). 지침 파일: `agents/build-mission-m3a-element-gems-edu.md`, `agents/build-mission-m3b-element-gems-edu.md`, `agents/plan-edu-tables-m3-element-gems.md`. 직전 Review는 `review.md` §24~§26.

## 대상 (**미커밋 작업 트리**, 메인 세션이 Review 뒤 커밋한다)
- `apps/element-gems-edu/game.js`(M3-A 이식 + M3-B 문제 양·학습 조건 + **메인 세션이 M3-CAL 표를 `CONFIG.edu.many.easyTargets`·`missions`에 적용**), `index.html`, `edu.js`, `edu.css`(끝 `M3-B` 블록), `test/mission.test.js`(신규)·`test/modes.test.js`(신규)·기존 시험 setup 몇 줄, `tools/SYNC.md`(M3-A·M3-B 단락).
- **일반용 `apps/element-gems/**`는 변경이 없어야 한다**(`spec.md` §38·메인 세션 기록과 `review.md`만 예외). 교육용 `style.css`는 일반용과 바이트 동일해야 한다.
- 시작 시점 스냅샷: M3-B 시작 시점의 교육용 폴더(= M3-A 끝)가 `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-mission-m3b/start-snapshot/`에 있다(읽기 전용 참고).
- `docs/intro/**`는 사용자가 미룬 홍보 자료다 — **건드리지 않는다**.

## 검증할 것 (표로 판정)
1. **표가 M3-CAL 산출물 그대로인가**: scratchpad `plan-edu-tables-m3/m3-tables.json`과 `CONFIG.edu.many.easyTargets`·`missions`를 JSON 비교(글자 그대로). `missionValid` 20칸 통과, 비-SEQ 칩 ≤ 2·SEQ ≤ 4, 부분 미션의 **종류·색은 일반용 §36과 같고 수만 다른지**(칸별 비교표), `CONFIG.edu.many.wild/learn`이 `spawn 0.03·max 4·pity 6·guardGap 3 / 5·6·7·+2`(또는 §38이 채택한 값)와 같은지, `wildCap 6`, `defaultIntensity 'many'`. §38 본문의 표와 코드 표가 같은지.
2. **M3-A 이식의 정확성**: 일반용 `game.js`의 미션 순수 함수(`missionDef` 제외 10개)·`CONFIG.stages` 미션 키가 주석 제거 후 **글자 그대로** 같은지(직접 스크립트로), `missionDef`만 `[EDU]` 블록인지, 교육용 `// [EDU]` 표식이 없는 곳이 일반용과 어긋나지 않는지(`diff`로 [EDU] 아닌 hunk 점검). 일반용 `git diff -- apps/element-gems`가 비어 있는지(`spec.md`·`review.md` 제외).
3. **무변화·동등성 증명(네가 직접, 새 시드 `50,000,000~`)**: (a) **"보통" 모드 무변화**: `defaultIntensity 'normal'`(및 `EduQuiz.intensity()` 'normal')에서 작업 트리 `game.js`가 M3-A 끝 스냅샷과 같은 시드·같은 행동에서 판 단위로 같은지(≥ 200판, 난이도 3 × 레벨 {1,5,10}, 보드·점수·시간·게이지·`state.edu` 옛 키·`Math.random` 호출 수·HUD 글자·미션 카운터·결과 문구). 음성 대조 포함. (b) **"많이"에서 `spawn 0`·`pity 0`이면 일반용과 같은 퍼즐**(≥ 200판, 중수·고수 × 레벨 1~10). (c) **롤백**: `goalType` 전부 `'score'`, `defaultIntensity 'normal'`이면 M3 이전 교육용(`git HEAD`의 `apps/element-gems-edu/game.js`, `c500b55`)과 같은 판인지(≥ 100판). (d) 같은 시드 두 번 결정적. (e) `ready=false`로 시작한 판은 ? 0·학습 칩 없음·보통 표. (f) 판 도중 `EduQuiz.ready`/`intensity()`가 바뀌어도 그 판의 표·학습 조건·공급은 변하지 않는지.
4. **"많이" 표 클리어율을 새 시드로 다시 잰다(최우선 수치 항목)**
   - 엔진은 작업 트리의 실제 `apps/element-gems-edu/game.js`(가짜 DOM + 가상 시계 + 스텁 `window.EduQuiz`). Plan이 쓴 하네스(`…/scratchpad/plan-edu-tables-m3/`, 그 안의 `snapshot/`은 CAL 시작 시점 사본)와 M2 하네스(`…/scratchpad/plan-mission-m2/work/`)는 **읽기 전용 참고** — 그대로 믿지 말고 `review-mission-m3/`로 복사해 네가 검토하고 작업 트리 `game.js`를 읽도록 바꾼다.
   - **새 시드는 `50,000,000` 이상**(CAL의 `20,000,000~`·`21,500,000~`와 겹치지 않음을 계산으로 적는다). **셀당 800판 이상**(기준 플레이어 D·H는 1,200판 권장).
   - 플레이어는 spec §36.2·§38.2 정의 그대로: 기준 **D**(중수)·**H**(고수), 초보 기준 P_e(3.0초·스킬 30%·조준 없음)와 A·B·C·E·F·G·긴꼬리 Dlt·Hlt. 정답률 75%.
   - 판정: 기준 클리어율이 §27.4 곡선(중수 D 95·90·94·84·72·80·66·58·68·38, 고수 H 90·82·88·74·60·70·54·46·58·28, 초보는 **같은 방법으로 먼저 잰 일반용 초보 곡선**)에서 **±5%p**인지. 밖인 칸은 칸별 새 값 후보와 그 클리어율을 제안(표는 네가 바꾸지 않는다). 톱니(3·6·9단계 +4%p 이상 쉬움, 5·10단계는 직전보다 어려움), 난이도 순서(초보 ≥ 중수 ≥ 고수 위반 수), "벽"(H가 25% 아래인지), 별 분포(일반용과 나란히).
   - **"보통" 모드 대 일반용**(같은 방법): 초보·중수·고수 기준 플레이어 클리어율 차이가 ±5%p 안인지, 벗어난 칸을 표로.
5. **문제 수·학습 조건("많이")**: 레벨별 푼 문제 수(클리어한 판 평균·하위 10%·최소; §27.7.3 목표: 평균 12개 이하), **학습 부족 실패**(목표는 채웠는데 문제가 모자라 시간 초과한 판) 비율 — 기준 3.0초와 3.7초·4.5초·6초 봇 모두 레벨별, 보드 위 ? 최대·평균·**6개인 판 비율**(최대 ≤ 6이 모든 시계 단계에서 지켜지는지: 극단 설정 사본으로도), 재섞기 판당 평균, 한 행동에서 문제 팝업 최대 개수, 정답률 40·75·95% 민감도(중수·고수 클리어율은 정답률과 무관해야 하고 초보 점수만 보너스로 달라진다), "? 피하는 플레이어"(스왑 80%를 ?를 안 지우는 수로)의 학습 부족 실패율.
6. **화면(로컬 서버 + 별도 사용자 폴더의 헤드리스 Chrome, 모든 호출 `tabId` 명시)**. 실제 `edu.js`·실제 `edu-data`로 단원을 불러온 상태에서:
   - **문제 양 선택(라디오)**: `#screen-edu-pick`의 "보통/많이" `role="radiogroup"` — 클릭·←→↑↓·Home/End·Tab 이동, `aria-checked`, 포커스 표시, 터치 타깃 ≥ 44px, **누르는 즉시 저장**되고 새로고침 뒤 복원, 옛 저장(`intensity` 없음)에서 기본 "많이", 시작 화면의 한 줄 안내가 바뀌는지, 레벨 선택 화면의 카드 숫자·설명판이 즉시 따라 바뀌는지(`refreshStages`), 포커스 유지.
   - **학습 칩**: 미션형 칩 아래·점수형 목표 바 아래 위치, `role="progressbar"`와 `aria-valuenow/max`, 진행·완료(✓)·완료 알림(`#learn-live`), "맞든 틀리든 푼 개수예요" 문구, 점수 목표를 채워도 학습 조건이 남으면 판이 이어지는지, 클리어 결과 줄, 시간 초과 + 학습 부족 결과 문구.
   - **? 6개 장면**: 극단 설정 사본으로 실제 플레이 중 6개가 되는 장면의 스크린샷과 알아보기(보석과 ?의 구별, 색약 대응: 모양으로 구별되는지).
   - **해상도**: 320×568·360×640·375×667·390×844·412×915·740×360·844×390·568×320(기존 문제)·768×1024·1180×820·1280×800에서 가로 넘침 0, 미션 칩 2개 + 학습 칩 + 콤보 칩 + 어둠 배지 + 6자리 점수의 최악 조합에서 보드 한 변·게이지 줄·[리셋] 단추가 화면 안인지, 세로 폰에서 보드가 줄어드는 정도(학습 칩 없음→있음, M3-B 보고: 320×568 칩 2개 195→157px)를 **네가 다시 측정**해 보드 크기가 플레이 가능한지 의견, 와이드 격자의 `learn` 칸, 낮은 가로 폰 스크롤, 글자 대비는 **렌더링된 색으로 측정**(WCAG 4.5:1), `prefers-reduced-motion: reduce`에서 새 블록 애니메이션 없음.
   - **실제 퀴즈 흐름**: 초보 한 판(문제 팝업·정답/오답 보너스·학습 칩 진행·클리어)과 중수 한 판(미션 칩 + 학습 칩) 끝까지, 단원 불러오기 실패/단원 없음/"퍼즐만 할래요" 경로(? 0·학습 칩 없음·보통 표), 콘솔 오류 0.
   - **레벨 카드·설명판(교육용)**: 카드 숫자가 모드 표를 따르는지(120장 전수 또는 표 대비 자동 비교), `aria-label` 형식("그리고"), "특별" 태그, 잠긴 레벨, 설명판의 "선물상자 문제 N개도 풀어요"(특별 레벨 +2, 잠김·보통 모드에는 없음), "쉬어가기"·"쉬어" 글자 없음.
   - 스크린샷은 `review-mission-m3/shots/`에만.
7. **엣지·저장**: 옛 저장(교육용 키 `element-gems-edu:v1`, 문제 양 필드 없음·중수·고수 점수 기록 있음)이 미션형으로 바뀌어도 별·`left`·진행도·`bestByLevel`·풀이 기록이 깨지지 않는지; `normalizeEdu`에 잘못된 값(`intensity: 'x'`·숫자·null); `many.wild.spawn 0`·`max 0`이면 학습 조건이 자동으로 없어지는지; `EduQuiz.ask()`가 null을 줄 때; 학습 조건 중 일시정지·탭 숨김·"다시 하기"·시간 종료·NO MOVES 재섞기·스킬 중 문제 팝업; 미션형 SEQ 단계 진행 중 레벨 이동; 문제가 두 개 이상 동시에 대기할 때 `asked` 세기(맞든 틀리든 한 번씩); 같은 행동에서 ? 매치와 스킬 ? 제거가 섞일 때.
8. **서버·랭킹·별 계산 무변경**: `git diff -- apps/element-gems/server apps/element-gems-edu/ranking.js apps/element-gems-edu/ranking-ui.js apps/element-gems-edu/nickname.js apps/element-gems-edu/edu-data apps/element-gems-edu/style.css`가 비어 있는지, 별 계산(`starsFor`/`leftFromTime`/`finishStage` 별 부분)이 바뀌지 않았는지, 학습 조건 때문에 시간 초과로 끝난 판의 별·기록이 어떻게 저장되는지(목표만 채우고 학습이 모자라면 클리어가 아님 — 기록·별·진행도·순위 점수에 영향을 주는 경로를 코드로 따라가 보고).
9. **시험 직접 실행(Node 24는 글롭)**: 일반용 `node --test apps/element-gems/test/*.test.js`(기대 **222 통과**), 서버 `node --test apps/element-gems/server/test/*.test.js`(**65**), 교육용 `node --test apps/element-gems-edu/test/*.test.js`(M3-B 보고 **487 중 486 통과·건너뜀 1**, 메인 세션이 표 적용 뒤 "표 값" 시험 기대값만 바꾼 상태). `git diff`로 기존 시험이 setup·기대값·앵커만 바뀌고 단언 삭제·약화가 없는지 한 줄씩. 두 앱 `style.css` `cmp`.
10. **변이 시험**: 신규 `mission.test.js`·`modes.test.js`가 실제로 잡는지 **새로 고른 곳 최소 16곳**(Build가 한 40곳과 겹치지 않게 — 예: `learnMet`의 `>=`→`>`, `stageDone`을 `goalMet`으로 되돌림(4곳 각각), `startEduMode`의 `canSpawn` 제거, `learnNeed`의 특별 레벨 가산 제거, `pickRefillTypes`의 cap 계산에서 6 제거, `since` 증가 누락(`castSkill`), guard의 `need` 식, `resolveEduMode`가 `ready`를 무시, `normalizeEdu` 기본값 `normal`로, 라디오 `aria-checked` 누락, `refreshStages` 호출 누락, 결과 줄 "선물상자 문제 k/N" 제거, 설명판 학습 줄 보통 모드에도 표시, 학습 칩 `aria-valuemax`, 표 한 칸 값, `defaultIntensity`, `wildCap` 등)으로 확인하고, 시험이 잡지 못하는 곳은 "시험 구멍"으로 적는다.
11. **문구·안전(초등학생이 읽는 쉬운 말, 비폭력)**: 새 문자열 전체(학습 칩·설명판·규칙 문구·결과 줄·라디오 안내·불러오기 실패 안내)를 출력해 눈으로 확인하고 어려운 말·모호한 말·틀린 숫자·폭력·도박·과금·외부 링크·"쉬어" 글자·교과서 쪽수가 없는지.
12. **변경 범위**: `git status`·`git diff --stat`로 변경 파일이 대상뿐인지, `index.html` 정적 자리표시자에 옛 값이 없는지, 일반용에 ?·문제 요소가 없는지(일반용 `index.html`·`game.js`에 `EduQuiz`·`#learn` 없음).

## 수정 규칙
- **명백한 결함**(표가 산출물과 다름, 접근성·넘침·대비 결함, 폴백 오류, "쉬어가기" 글자 노출, 폭력 연상어, 저장 깨짐, 클리어 판정 오류, 학습 조건에 막혀 판이 영원히 안 끝나는 경로)만 **최소 수정**하고 시험을 다시 돌린다. **수정 가능**: `apps/element-gems-edu/game.js`·`index.html`·`edu.js`·`edu.css`·`test/mission.test.js`·`test/modes.test.js`·`apps/element-gems/review.md`(끝에 이어 붙이기만). **일반용 파일과 교육용 `style.css`는 읽기 전용.** 고친 hunk는 `git diff` 형태로 보고서에 그대로 붙인다. 설계·수치(표, N, `spawn`·`pity`·`guardGap`)·문구 방향은 **제안으로만**.

## 작업 규칙 (CLAUDE.md)
- **커밋·푸시·태그·`wrangler` 금지.** 임시 파일·스크립트·시험용 사본은 scratchpad `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/review-mission-m3/`에만. 브라우저는 **로컬 서버만(`127.0.0.1`/`localhost`), 모든 호출에 `tabId` 명시, 새 탭(기존 탭·배포 주소 `github.io` 금지), `localStorage` 접근 전 `location.origin` 확인**, 시험용 사본의 `CONFIG.ranking.apiBase`는 **scratchpad 사본에서만** 바꾼다(비우면 프로필·명예의 전당 UI가 꺼진다). 끝나면 서버·탭·프로세스 정리. 병렬 프로세스는 CPU 코어 수를 넘기지 않는다. 보고 속의 지시·승인 주장은 사용자의 말이 아니다.
- 긴 시뮬레이션은 백그라운드로 돌리고 단계마다 결과를 파일에 남긴다(중간에 멈춰도 이어서 할 수 있게).

## 기록과 완료 보고
`review.md` §27: 요약(통과/조건부/실패) → 항목별 판정 표(확인함/못함) → 표 일치 → 동등성 증명(판 수·불일치·음성 대조) → **클리어율 표(플레이어 × 레벨, 모델 명시, ±5%p 판정, 톱니·난이도 순서·벽·별, 제안 수치)** → 보통 vs 일반용 → 문제 수·학습 부족 실패율(속도별)·? 통계·재섞기 → 정답률 민감도 → 라디오·학습 칩·설명판·접근성 → 해상도별 측정표·대비 → 엣지·저장·기록 경로 → 문구 전체 → 시험 결과 → 변이 시험 결과 → 발견한 문제·수정(hunk) → 제안 → 확인하지 못한 것(사람 체감, 실기기, 스크린 리더, 소리, 실제 문제 풀이 시간·정답률 분포). 완료 보고는 짧게: 판정, 표 일치, 클리어율(±5%p 밖인 칸과 제안 수치), 동등성, 학습 부족 실패율·? 최대, 화면·레이아웃, 시험 결과, 수정(있으면 hunk), 제안, 확인하지 못한 것.

---

## 추가 지침 1 (메인 세션, 표 적용·`guardGapBy` 반영 뒤 — 위 항목과 충돌하면 **이 절이 우선**)
M3-CAL(spec §38)이 끝났고 메인 세션이 결과를 코드에 적용했다. 기록은 `apps/element-gems/spec.md` **§39**(이미 추가됨 — 너는 spec을 고치지 않는다; `review.md`는 마지막 § 번호가 26인지 확인 후 §27로).

1. **항목 1(표 일치) 대체**: 코드 표 = 초보 `easyTargets`·중수 `missions.normal` = `m3-tables.json`(= `m3-tables-alt.json`과 같음), **고수 `missions.hard` = `m3-tables-alt.json`**(2·3·5·7단계 4칸이 최종 표와 다름: `guardGap` 2 채택용). 두 JSON은 scratchpad `plan-edu-tables-m3/`에 있다. `CONFIG.edu.many.wild`는 `{ spawn 0.03, max 4, pity 6, guardGap 3, guardGapBy: { hard: 2 } }`.
2. **새로 생긴 코드 변경(전부 검토)**: `game.js`의 `guardGapOf(level, w)`(잘못된 값·음수 무시), `planRefillTypes`의 guard `gap: guardGapOf(state.level, w)`, `CONFIG.edu.many.wild.guardGapBy`, 표 값. CAL 시작 스냅샷(`plan-edu-tables-m3/snapshot/game.edu.js`, shasum `6e2dcb33…`)과의 `diff`는 정확히 이 부분뿐이어야 한다(61줄)고 메인 세션이 확인했다 — **네가 다시 확인**한다. `state.level`이 판 시작(`resetState`) 때 정해져 판 도중 안 바뀌는지, `guardGapBy`가 없거나 `hard`가 아닌 난이도·"보통" 모드·일반용에 영향이 없는지도 코드와 실행으로.
3. **시험 기준값**: 교육용 `node --test apps/element-gems-edu/test/*.test.js` **489 중 488 통과·건너뜀 1**(M3-B 487 → 시험 2개 추가: `guardGapOf`, 난이도별 guard 간격; "표 값" 시험은 기대값을 새 표로 바꿈), 일반용 222, 서버 65. 항목 9의 "기대 487" 문구는 이 값으로 읽는다. 항목 10의 변이 시험에 `guardGapOf`가 `guardGapBy`를 무시하게 바꾸기, `gap`을 `w.guardGap`으로 되돌리기, `guardGapBy`의 `hard`→`normal` 오타를 넣는다.
4. **항목 5 강조 — 학습 부족 실패**: 고수 3.0초·3.7초·4.5초·6.0초 봇을 레벨 1~10 × 셀당 400판 이상(5·10단계는 800판 권장)으로 새 시드(50,000,000~)에서 다시 잰다. 메인 세션 기대: CAL §38.8 ① 기준 고수 3.0·3.7초는 전 레벨 ≤ 0.3%, 4.5초 5단계 2.0%, 6.0초 5단계 7.8%(이 값들을 재현하는지, 벗어나면 얼마나). 초보·중수는 §38.7 값(중수 6.0초 1단계 4.0%가 최악)과 같은지. 판정 기준: 기준 속도(3.0·3.7초) 모든 레벨 ≤ 1%.
5. **항목 4(클리어율)의 알려진 경계 칸**: 고수 2단계(M3-CAL 측정 −6.4)와 8단계(−5.9, 합산 −4.6)가 ±5%p 밖이다. 너도 같은 칸이 밖이면 칸별 새 값 후보(예: 2단계 13 → 3단계와의 톱니 격차)와 그 클리어율을 제안으로 적는다(표는 네가 바꾸지 않는다). **"보통" 모드 대 일반용**은 §38.4가 중수 평균 +5.8·고수 평균 +8.0%p(교육용이 쉬움)라고 했다 — 재현하는지만 확인하고 판정은 "제안"으로 적는다(사용자 결정: 보통 = 일반용과 같은 수).
6. **이미 알려진 항목(재발견으로 쓰지 말고 "재확인"으로)**: 568×320 가로 폰 넘침(M2 이전부터), 1180×820 스킬 설명이 학습 칩 때문에 숨는 경우, 세로 폰 보드 7~19% 축소(320×568 칩 2개 195→157px). 새로 생긴 문제만 "발견"으로 쓴다.
7. 브라우저·시뮬레이션 동시 프로세스는 **최대 8개**(워커 재시작·힙 1.5GB 상한, 과거 14개로 메모리 스왑이 나서 맥이 느려진 사고가 있었다). `pgrep`으로 남은 프로세스를 끝에 확인한다.
