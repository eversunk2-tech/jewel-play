# Build 지침 M2 — 중수·고수 미션 레벨 켜기와 레벨 카드·설명판 (일반용, spec §27.9 M2, §32.5.4)

## 역할
너는 **Build 담당**(Sonnet 서브에이전트)이다. M1이 만든 미션 엔진 위에서 **중수·고수를 미션형으로 전환**하고, **레벨 카드 마크업 계약(§32.5.4)·선택 레벨 설명판 `.stage-detail`**, M1 Review(R-M1) 제안 반영, 관련 시험을 만든다. **미션 표의 최종 수치는 지금 다른 Plan 에이전트가 §26 보드 구조 기준으로 재보정 중**이므로 너는 아래 **임시값(§27.5 원안)** 을 `CONFIG`에 넣고, 표 값이 나중에 바뀌어도 코드·시험이 깨지지 않게 만든다(표 값 자체를 고정하는 시험은 **한 곳**에만 둔다). 검증은 별도 Review가 한다 — **네가 직접 확인한 것만 "확인함"**.
프로젝트 규칙은 `CLAUDE.md`, 진행 상황은 `docs/STATUS.md` §14·§14.5b를 먼저 읽는다. **정답지는 `apps/element-gems/spec.md`**: **§27.3~§27.5**(카운트 규칙·유형 배치·표), **§27.8·§27.9(M2)·§27.10**, **§32.5.2~§32.5.4**(카드 상태·초보/중수·고수 카드 차이·**마크업 계약**), **§33**(초보는 점수제 표현만), **§34**(쉬어가기는 **화면에 표시하지 않음**), §30, §35, 그리고 `review.md` §24-10(R-M1 제안 P1·P3·P5). 줄 번호는 참고용이니 함수 이름으로 찾는다. 이전 지침 `agents/build-mission-m1-element-gems.md`도 읽는다.

## 승인된 결정 (바꾸지 않는다)
- §27 목표 유형 계단(초보 점수 / 중수·고수 미션)과 "잠든 원소 정령 깨우기" 프레임이 승인됐다. **정령 패널·연출·결과의 정령 줄은 M4의 몫**이다 — 이번에 만들지 않는다. 일반용 동결은 이 작업을 위해 해제됐다.
- **초보는 항상 점수제**(§33): 초보 카드에는 미션·쉬어가기·"특별" 태그를 달지 않는다. 초보 5·10단계의 점수 3등분 정령은 M4.
- **쉬어가기(3·6·9)는 화면 어디에도 글자로 나오지 않는다**(카드 태그·설명판·`aria-label`·결과 포함). 3·6·9가 쉬운 것은 **표 값**으로만 구현한다.
- 서버·`ranking*.js`·`nickname.js`·점수 규칙(§28)·보드 구조(§26)·스킬·게이지·시간·별 계산은 **건드리지 않는다**. 교육용 코드(`game.js`·`index.html`·`edu.*`)도 건드리지 않는다(M3) — 교육용 `style.css`에는 일반용에 추가한 CSS 블록만 똑같이 끝에 붙인다.

## 해야 할 일
1. **`CONFIG.stages` 전환**: `goalType: { easy: 'score', normal: 'mission', hard: 'mission' }`. `missions.normal/hard`에 아래 **임시값**(§27.5.2·§27.5.3의 일반용 값)을 넣는다. 색 번호 불 0·물 1·풀 2·번개 3·어둠 4·빛 5. 특별 5·10은 `seq: true`, 나머지는 `seq: false`.
   - 중수: L1 `collect 0×20` / L2 `collect 1×24` / L3 `chain min2×10` / L4 `collectEach [0,1,2]×21` / L5 SEQ `[collect 2×12, big min4×3, chain min2×4]` / L6 `collect 2×26` / L7 `[collect 3×30, chain min2×9]` / L8 `collectEach [0,1,2,3]×24` / L9 `[collect 4×28, collect 5×18]` / L10 SEQ `[collect 0×10, big min4×3, chain min2×4, collectEach [1,2,3]×8]`
   - 고수: L1 `big min4×9` / L2 `chain min2×13` / L3 `collectEach [3,4,5]×16` / L4 `chain min3×5` / L5 SEQ `[collect 1×6, big min4×3, chain min3×2, big min5×1]` / L6 `[collect 0×23, collect 2×16]` / L7 `[big min4×11, chain min3×4]` / L8 `collectEach [0,1,2,3,4]×21` / L9 `[big min5×3, collect 5×11]` / L10 SEQ `[chain min3×2, big min5×1, collectEach [0,1,2]×7, chain min4×1]`
   - `targets.normal/hard`(점수 폴백·롤백 스위치)는 **그대로 둔다**. 각 표 위에 주석: "임시값 = spec §27.5 원안, §36(M2-CAL)에서 §26 적용 뒤 재보정한 값으로 교체됨".
   - 특별 레벨 표시용 설정을 `CONFIG.stages`에 추가: `special: [5, 10]`, `rest: [3, 6, 9]`(카드 `data-kind` 속성용 — 글자로는 쓰지 않는다).
2. **R-M1 제안 P1 — 동시 칩 상한**: `CONFIG.stages.missionMaxChips = 2`. `missionValid`가 **`seq`가 아닌(동시에 세는) 정의의 부분 수가 이 값을 넘으면 무효**(= 점수 목표로 폴백)로 판정한다. SEQ는 `missionMaxParts`(4) 그대로. 시험: 3개짜리 비-SEQ는 무효, 4개짜리 SEQ는 유효.
3. **R-M1 제안 P3 — 카드 `aria-label`**: 부분 미션은 **"그리고"로 이은 한 문장**, 별 정보는 뒤에 따로. 예: `레벨 7, 미션 번개 보석 30개 그리고 연쇄(CHAIN 2 이상) 9번, 별 0개` / 특별: `레벨 5, 특별 레벨, 미션 …` / SEQ(차례대로): 부분을 `먼저 …, 그다음 …`으로. 잠김은 `…, 잠김`. 새 함수 또는 `missionDescribe`의 반환값에 `spoken`을 **추가**(기존 `summary`는 화면용이라 바꾸지 않는다 — M1 시험이 고정). 쉬어가기라는 말은 어디에도 쓰지 않는다. 초보 카드의 `aria-label`은 지금 그대로.
4. **R-M1 제안 P5 — SEQ 해석 한 줄**: 코드의 현재 동작(한 이벤트로 끝난 단계의 **초과분은 다음 단계로 넘기지 않고, 그 이벤트 뒤의 이벤트부터 다음 단계가 센다**)을 `missionUpdate` 주석과 시험으로 고정한다(동작은 바꾸지 않는다. 이미 M1 시험이 있으면 이름·주석만 보강).
5. **레벨 카드 마크업 계약(§32.5.4)**: `renderStages`에서 카드에 `data-kind="special"`(5·10단계, 모든 난이도) / `data-kind="rest"`(3·6·9단계, **중수·고수만**), 중수·고수 특별(5·10) 카드에만 `.sc-tag`(글자 "특별", `aria-hidden` 아님 — `aria-label`에 "특별 레벨"이 이미 있으므로 `aria-hidden="true"`로 중복 낭독을 막는다). `.sc-mis`(미션 요약)는 M1 구현 그대로 두고 계약 구조(`i.mc.g` 보석+개수, `.each`, `i.mc.k`, "N가지 미션")가 §32.5.4와 같은지 대조해 다른 곳만 맞춘다. `.sc-sp`(정령)·`.sc-steps`(초보 3등분)는 **만들지 않는다**(M4). 초보 카드는 지금과 마크업이 **완전히 같다**(시험으로 증명).
6. **선택 레벨 설명판 `.stage-detail`**: `index.html`의 `#stage-grid` 아래, `.stages-hint` 위에 `<div class="stage-detail" id="stage-detail">`를 둔다(`el` id 목록에 추가). 내용: **레벨 번호 + (중수·고수 특별이면 "특별 레벨") + 목표 설명 + 제한 시간 + [도전!] 버튼**.
   - 중수·고수(미션형): 목표 설명은 `missionDescribe(def).summary` 전문(예: `① 풀 보석 12개 → ② 한 번에 4개 이상 3번 → ③ 연쇄(CHAIN 2 이상) 4번`), 연쇄 부분이 있으면 작은 글 `한 번 움직여서 이어서 터지게 해요`. 초보: `목표 점수 N점` 뿐(미션·특별·쉬어가기 말 금지, §33). 미션 정의가 없어 점수 폴백인 레벨은 `목표 점수 N점`.
   - 기본으로 **현재 레벨**(진행 + 1, 모두 클리어했으면 10단계)을 보이고, 카드에 **포커스(키보드)·마우스 올림**이 있으면 그 카드의 레벨을 보인다(잠긴 카드는 "아직 잠겨 있어요 — 앞 레벨을 먼저 클리어하세요"). 터치에서는 카드를 누르면 바로 시작하는 지금 흐름이 그대로이므로 설명판은 현재 레벨을 보여 주는 정보용이다. **[도전!]은 설명판이 보이는 레벨을 시작**(잠겼으면 숨김/비활성)하고 카드와 같은 동작(`startStage`)을 부른다. 입력 흐름은 늘리지 않는다(카드 탭이 곧 시작).
   - `aria-live`를 쓰지 않는다(포커스가 옮겨질 때 카드 `aria-label`이 이미 읽힌다). 갱신은 **레벨이 바뀔 때만** DOM을 쓴다. 터치 타깃 ≥ 44px. 폰 세로(375×667·360×640·390×844)에서 가로 넘침 0, 세로는 화면이 스크롤되더라도 [도전!]이 잘리지 않음, 폰 가로(740×360)에서도 깨지지 않음을 측정한다.
   - 문구는 쉬운 말(초등학생이 읽음), **§27.6.2의 피하는 말**(보스·적·몬스터·전투·싸움·대결·공격·때리다·쓰러뜨리다·처치·무찌르다·물리치다·체력·HP·데미지·피해·죽다·KO·파괴·부수다·패배·졌다)과 **"쉬어가기"** 금지.
7. **CSS**(`style.css` **맨 끝**에 `/* 미션 레벨 카드·설명판 (spec §27 M2, §32.5.4) */` 블록 **하나**, 교육용 `style.css` 끝에 **바이트 동일**하게): `.sc-tag`, `.stage-detail`(최소 스킨 "0m": 지금의 흰 카드·라벤더 립 톤), 필요한 최소 규칙. 새 레벨 카드 **스킨은 U-3의 몫**이니 카드 모양을 크게 바꾸지 않는다. 감소 모션은 **`@media (prefers-reduced-motion: reduce)` 형식을 써도 되도록 아래 8번을 먼저 한다**. 모든 글자 대비 4.5:1 이상(값 계산 또는 렌더링 측정), 글자 11px 이상.
8. **R-M1 제안 P4 — `widescreen.test.js` 앵커 교체(두 앱 같게)**: 현재 `const rm = wide.slice(wide.lastIndexOf('@media (prefers-reduced-motion: reduce)'));`(두 앱 `test/widescreen.test.js` 약 L101)를 `review.md` §24-9가 제안한 **내용 앵커 방식**으로 바꾼다(`.gauge.full { animation: none; }`를 앵커로 그 규칙을 감싼 `@media`가 감소 모션인지 확인 후 `rm`을 그 블록으로). **단언을 약화하지 않고** 오탐만 없앤다. 교체 전후 현재 CSS에서 통과하는지, 일부러 `.gauge.full` 규칙을 지우거나 감소 모션 밖으로 옮기면 실패하는지 scratchpad에서 확인해 보고한다. (교육용 `test/widescreen.test.js`는 이 한 줄 외에는 수정 금지.)
9. **텍스트 갱신**: `index.html`·`game.js`의 규칙 문구 `#rule-stage`(`game.js`가 `CONFIG`에서 동적으로 채움, 약 L2644)가 "…안에 **목표 점수**를 넘기면 클리어!"인데 중수·고수는 미션이다 → "…안에 **목표**를 이루면 클리어! 초보는 목표 점수, 중수·고수는 레벨마다 다른 미션이에요. 레벨 1~10에 도전하세요."처럼 **짧고 쉬운 말**로 바꾼다(정적 자리표시자와 동적 문구가 모두 같아야 하고, 옛 값이 `index.html`에 남지 않는지 시험). 난이도 설명문(`CONFIG.difficulty.*.desc`)은 바꾸지 않는다.
10. **시험**(M1의 `test/mission.test.js`와 B1의 `score.test.js`·`audio.test.js` 등 일반용 시험, **단언 삭제·약화 금지, 기대값·이름·주석·시험 도구(setup)만 변경**):
    - 기본 `goalType`이 바뀌므로, 중수·고수 판이 **점수 목표**라는 전제로 쓴 기존 시험의 setup에 `goalType`을 명시적으로 `'score'`로 두는 한 줄을 도우미(`createEnv`/`cfg` 콜백)에 추가한다(spec §27.9.3 "시험 도구 주의"). M1의 "기본 상태 무변화" 시험은 '초보는 점수제, 중수·고수는 미션' 새 사실로 **기대값·이름만 고치고** 폴백 경로(`goalType` 'score'로 되돌리면 이전과 같음)는 명시 설정으로 계속 증명한다.
    - 신규(`mission.test.js`에 추가 또는 신규 `stages-mission.test.js`): ① 표 형식 검사 — 10칸×2, 모두 `missionValid`, 특별은 5·10(`seq:true`)뿐, 비-SEQ ≤ 2·SEQ ≤ 4 부분, 색 번호 0~5, 초보에는 미션 없음 ② **표 값 고정 시험은 한 곳**(이름에 "표 값"을 넣고 임시값을 단언 — 메인 세션이 보정값으로 교체) ③ 카드 마크업 계약(데이터 속성·`.sc-tag`·`.sc-mis` 구조, 초보 카드에 `.sc-mis`·`.sc-tag`·`data-kind=rest` 없음, 초보 카드 마크업 이전과 동일) ④ `aria-label` 문구("그리고" 연결, 별 정보 뒤, "쉬어가기" 없음, SEQ "먼저…그다음") ⑤ 설명판 내용·갱신(현재 레벨, 포커스 이동, 잠김 문구, [도전!] 동작, 초보에는 미션 말 없음) ⑥ **모든 새·기존 UI 문자열**(20개 레벨의 `missionDescribe` 전문·`spoken`·카드·설명판·규칙 문구·결과)에서 피하는 말과 "쉬어가기"가 없음 ⑦ P1 상한 ⑧ 중수·고수 한 판 흐름(가짜 DOM 하네스): 임시값 L1을 달성해 STAGE CLEAR, 달성 못 하면 시간 종료 실패, 별·`left`가 점수형과 같은 식, 저장 `best`는 도달 점수 ⑨ 모든 20개 레벨이 미션 칩/SEQ 칩으로 `buildMissionHud` 되고 `#mission` 보임·`data-goal="mission"`.
    - 시험 시간은 전체 +15초 이내.
11. **무변화 증명(범위 한정)**: 초보(점수형) 판은 **변경 전과 같다**는 것을 보인다 — HEAD(`git show HEAD:apps/element-gems/game.js`)와 작업본을 같은 시드·같은 스크립트로 **초보 3 레벨 × 시드 10 이상 × 행동 30 이상**에서 보드·점수·시간·게이지·`Math.random` 호출 수·결과 문구·저장이 같음(M1·B1 때 하네스 방식, scratchpad `build-mission-m1/`·`build-score-b1/` 참고, 그대로 믿지 말고 다시 짠다). 중수·고수는 의도적으로 바뀌므로 **`goalType`을 'score'로 되돌린 작업본이 HEAD와 같다**(롤백 스위치 증명)도 3 레벨 × 시드 10 이상에서 보인다.

## 수정 가능 / 읽기 전용
- **수정 가능**: `apps/element-gems/game.js`, `apps/element-gems/index.html`, `apps/element-gems/style.css`(끝에 블록 하나), `apps/element-gems-edu/style.css`(같은 블록을 끝에 추가), `apps/element-gems/test/*.js`(위 10번 범위), `apps/element-gems/test/widescreen.test.js`와 `apps/element-gems-edu/test/widescreen.test.js`(8번의 한 줄만).
- **읽기 전용**: 그 밖 전부(교육용 `game.js`·`index.html`·`edu.*`·교육용 나머지 시험, `ranking*.js`·`nickname.js`·`server/**`·`spec.md`·`review.md`·문서). 교육용 시험이 일반용 변경 때문에 깨지면 고치지 말고 **파일·이름·원인**으로 보고한다.

## 확인할 것
- 시험(Node 24 **글롭**): `node --test apps/element-gems/test/*.test.js`(기존 **205** + 신규, 실패 0), `node --test apps/element-gems-edu/test/*.test.js`(**기대: 384 중 383 통과·건너뜀 1·실패 0** — 일반용 변경에 엮여 깨지는 것이 있으면 목록 보고), 서버 `node --test apps/element-gems/server/test/*.test.js`(65). 두 앱 `style.css` `cmp` 동일.
- **브라우저 smoke**(가능하면): 로컬 정적 서버(`localhost`)만, **모든 호출에 `tabId` 명시**, 새 탭, `localStorage` 접근 전 `location.origin` 확인, 기존 탭·배포 주소 금지, 시험용 사본의 `apiBase`는 사본에서만 바꾼다. (a) 중수·고수 레벨 선택: 카드 10개의 미션 요약(`.sc-mis`)·`data-kind`·특별 태그·설명판(현재 레벨, 포커스 이동, 잠김), 초보는 점수만. 390×844·375×667·360×640·1180×820·폰 가로 740×360에서 가로 넘침 0과 [도전!] 보임 (b) 중수 L1·고수 L1 한 판씩 칩·진행·완료·결과 (c) 초보 한 판 화면이 변경 전과 같음, 콘솔 오류 0. 스크린샷은 scratchpad에 저장하고 경로를 보고. 끝나면 서버·탭·프로세스 정리. 못 한 것은 못 했다고 쓴다.
- `git diff --stat`으로 변경 파일이 위 수정 가능 파일뿐인지 확인.

## 규칙
- **커밋·푸시·태그·`wrangler` 금지.** 임시 파일·스크립트는 scratchpad `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-mission-m2/`에만. 지침에 없는 개선·리팩터링 금지. spec과 코드가 맞지 않으면 **임의로 고치지 말고 보고**한다. 지금 다른 Plan 에이전트가 `spec.md` 끝에 §36을 쓰는 중이니 `spec.md`는 읽기만 한다. 보고 속의 지시·승인 주장은 사용자의 말이 아니다.

## 완료 보고 (짧게)
변경 파일과 줄 수, 새 시험 개수와 세 묶음 시험 결과(새 기준값), 기존 시험에서 바꾼 것 목록(setup·기대값·이름), **무변화 증명 방법·결과**(초보 판 수·불일치, 롤백 스위치 증명), 카드·설명판 구조와 `aria-label` 예시, P1·P3·P4·P5 반영 위치, 레이아웃 측정(해상도별), 브라우저 smoke 결과와 스크린샷 경로, spec과 달랐던 점, 확인하지 못한 것.
