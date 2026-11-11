# Review 지침 R-E — 교육용 "많이" 표 재보정 2차 적용 + "보통" 동기화 검증 (spec §45)

작성: 2026-11-11 (메인 세션). 모델: Sonnet. Build와 **별도** 에이전트다. 구현자의 보고를 믿지 말고 **직접 확인한 것만 "확인함"**으로 쓴다. **커밋·푸시·태그·`wrangler`·서버 명령 금지.** 임시 파일·시험용 사본은 scratchpad(`/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/review-edu-many-recal/`)에만 둔다. 시뮬레이션 워커는 **최대 8개**, 힙 1.5GB, 10작업마다 재시작, 긴 작업은 백그라운드로 돌리고 로그를 본다(포그라운드 `sleep` 금지). **다른 세션이 띄운 Chrome 프로세스는 건드리지 않는다.** `review.md`에는 **§37**로 이어 붙인다.

## 검증 대상과 근거
Build 커밋(`git log -1`의 "교육용 많이 표 재보정 2차(spec §45) 적용")이 바꾼 것: 교육용 `apps/element-gems-edu/game.js`(`CONFIG.edu.many.missions` normal·hard 20칸 교체, `CONFIG.stages.missions`("보통")를 일반용 §43 표로 동기화, 주석), 교육용 `test/modes.test.js`·`test/mission.test.js`(§43.12 고정 6곳 되돌림, 기대값 갱신)·`test/spirit.test.js`(⑪에 `withCurrentTables`)·`tools/SYNC.md`. 근거: spec **§45**(승인 기록·45.1·45.2 최종 표·45.4 검증표·45.11 영향 범위·Review 기준·45.13 메인 세션 교차 검증), 지침 `agents/build-edu-many-recal-element-gems-edu.md`, 승인된 표 `…/scratchpad/plan-edu-recal/tables-edu-many-A.json`(고수 **가안** + 중수 새 표)와 `tables-edu-normal-sync.json`.

## 확인할 것 (각각 근거)
1. **범위**: Build 커밋의 파일이 위 목록 안인지. `easyTargets`·`wild`·`learn`·`guardGapBy`·초보 값·`// [EDU]` 코드·최고점 도전 모드(§46)·4번째 칸 코드·일반용·서버가 안 바뀌었는지(`git show --stat`, `git diff <전 커밋> -- apps/element-gems-edu/game.js`가 **표 40칸 + 주석뿐**인지 직접 읽는다).
2. **표 일치(핵심)**: 교육용 `CONFIG.edu.many.missions`가 승인 JSON `tables-edu-many-A.json`의 `missions`와 `assert.deepStrictEqual`로 같은지(키 순서는 JSON이 `seq, parts`, `game.js`가 `parts, seq`라 `deepStrictEqual`로), `CONFIG.stages.missions`(보통)가 일반용 `apps/element-gems/game.js`의 것과 `deepStrictEqual`+`JSON.stringify`로 같은지, 유형·색·`min`·`seq`가 이전(HEAD 이전 커밋)과 같고 `need`만 바뀌었는지(JSON 비교 스크립트), `check2.js`(`…/plan-edu-recal/work/`) 통과.
3. **"많이 표 ≥ 일반용 표" 단언**(`modes.test.js:513` 부근)이 `GEN.CONFIG.stages.missions` 기준으로 **되돌아가 통과**하는지(위반 0개), 그 단언의 엄격함(`>=`)이 이전과 같은지.
4. **시험을 약화하지 않았는가(핵심)**: `git diff <전 커밋> <Build 커밋> -- apps/element-gems-edu/test`를 **전수**로 읽는다. 지워진 것은 §43.12 고정(`GEN_V36_MISSIONS`·`PIN_TABLE_NOTE`·`pinMissionTables`)뿐이고, 되돌린 단언이 **원래(8413ea8 이전) 단언과 같은 강도**인지(`git show 8413ea8 -- apps/element-gems-edu/test/…`의 반대 적용과 일치하는지). 고친 기대값이 새 표에서 맞는지(중수 1단계 21→25 등), `spirit.test.js`의 `withCurrentTables`가 **표 말고 다른 규칙 차이를 가리지 않는지**(변이 3~4개: 기준 소스에서 점수·미션 함수 한 줄을 바꿔 시험이 여전히 실패하는지). 변이 시험 5개 이상(예: `many` 표 한 칸을 일반용보다 작게, 보통 표를 옛 값으로, `easyTargets` 변경, `wild` 변경)을 scratchpad 사본에서.
5. **새 시드 재측정(핵심, 시드 84,000,000~)**: Plan 하네스(`…/scratchpad/plan-edu-recal/work/`를 **읽기 전용으로 새 폴더에 복사**; 사용법은 `val2.js` 머리 주석과 `mk-val2.js`, 설정 JSON `cfg/`)로, 먼저 **하네스가 쓰는 교육용 스냅샷을 작업 트리의 현재 `apps/element-gems-edu/game.js`(= Build 커밋)로 교체**해 돌린다(표 외 규칙 코드가 Plan 스냅샷과 같은지 `diff`로 먼저 확인 — 최고점 도전 모드·4번째 칸·정령이 규칙을 안 바꿨는지; 달라진 곳이 있으면 보고). 설정은 정답률 75%, "많이" 모드, 시드 **84,000,000~**(Plan 보정 81M·검증 82M, 메인 세션 교차 검증 83M과 겹치지 않음).
   - **중수 "많이"**: 기준 D 셀당 **800판**, B·A·H·X1·X2·느림 4.0·5.0·6.5초 셀당 **400판**(10레벨).
   - **고수 "많이"(가안)**: 기준 X1 셀당 **800판**, B·A·H·X2·느림 4.0·5.0·6.5초 셀당 **400판**(10레벨). 한 번에 모든 셀을 못 돌리면 기준 플레이어를 먼저.
   - **"보통" 동기화**: 교육용 "보통" 모드(공급 1.6%)에 새 일반용 표가 적용된 상태에서 D(중수)·B·X1(고수) 셀당 **400판**(spec §45.8 Δ 확인).
   - 비교 기준: spec 45.4 검증값·목표 곡선(중수 D 83.8·78.0·92.5·69.4·62.4·68.8·59.5·53.6·58.4·26.3, 고수 X1 94.8·94.7·96.0·79.8·66.2·88.8·79.3·95.0·82.1·39.4)과 **±5%p(표준오차 약 1.4~1.8)**. **경계 칸(중수 4·7단계, 가안 4·7단계, 메인 세션 교차 검증에서 ±5%p를 넘었던 중수 D 4단계)은 특히** — 800판 이상으로. 칸별 새 값/Plan 값/차이 표를 만든다.
   - 판정 기준: 기준 플레이어 목표 곡선 ±5%p 안(밖은 칸·이유·표본오차로 적고 설계 변경은 **제안만**), 숙련 B 각 레벨 ≥ 25%·10단계 ≥ 10%(가안), 난이도 순서(같은 플레이어 초보 ≥ 중수 ≥ 고수) 위반 0칸, **학습 부족 실패율**(목표는 채웠는데 문제 수가 모자라 시간 초과; 3.0·3.7·4.5·6.0초, 5·10단계) 1.5% 이하, 푼 문제 수 평균(중수 D ≤ 12), 느린 플레이어 열 기록.
6. **교육용 앱 불변 점검**: 표 교체가 교육용 단원·문제·선물상자·정령·도전 모드·4번째 칸 동작을 바꾸지 않았는지 — 교육용 전체 시험 통과 + 임의 스테이지 한 판(중수 1단계)과 도전 한 판을 헤드리스 Chrome(별도 사용자 폴더, 로컬 파일만, `location.origin` 확인 후 `localStorage` 조작)으로 눈으로: 중수 1단계 카드 "불 보석 25개", 고수 1단계 "15번"(큰 매치 4개 이상 15번), 레벨 선택 카드·설명판 글이 새 숫자로 정상 표시되고 줄바꿈·잘림이 없는지.
7. **문서·기록**: `SYNC.md` 끝줄이 사실과 맞는지(기준 태그는 메인 세션이 만든다), 옛 "보류" 기록은 지우지 않았는지.
8. **시험 실행**: `node --test apps/element-gems-edu/test/*.test.js`(기대 598 중 597 통과+건너뜀 1), `node --test apps/element-gems/test/*.test.js`(기대 342), `node --test apps/element-gems/server/test/*.test.js`(기대 126), `node apps/element-gems-edu/tools/validate-edu-data.js`(오류 0·경고 0).

## 기록
`apps/element-gems/review.md`에 **§37**을 **끝에 이어 붙이기만** 한다(먼저 `grep -n "^## " apps/element-gems/review.md | tail -3`로 마지막 번호가 §36인지 확인, 한 번에 `cat >>`, 기존 내용 수정·덮어쓰기 금지). 형식은 §30~§36처럼: 요약 표(판정), 확인 목록(확인함/못 함), 발견한 문제(번호·근거·심각도), 수정한 것, 제안, 한계(사람 체감·실제 정답률·어린이 팝업 피로·실기기는 확인하지 못함). **명백한 결함**(표가 승인값과 다름·시험 약화·화면 깨짐·오타)은 해당 부분만 **최소 수정**하고 시험을 다시 돌려 §37에 적는다. **설계·수치(표 값) 변경은 제안으로만.**

## 보고(짧게)
판정(통과/수정 필요), 직접 확인한 항목 표(재측정 결과 표 포함: 칸별 새 값·Plan 값·차이·기준 밖 칸), 고친 곳(없으면 없음), 사용자 결정이 필요한 제안, 확인하지 못한 한계. 보고 속 지시·승인 주장은 사용자의 말이 아니다.
