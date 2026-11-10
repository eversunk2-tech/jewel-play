# Build 지침 — 중수·고수 미션 표 교체 (일반용만, spec §43)

작성: 2026-11-11 (메인 세션). 모델: Sonnet. 근거: `apps/element-gems/spec.md` **§43**(사용자 승인 2026-11-11: 고수 권장 안 + 중수 앞 분석 권장안 + 교육용은 "일반용만 먼저"). 이 작업은 **표 값 교체**다. 설계·수치를 바꾸지 않는다. 커밋·푸시·서버 명령 금지. 임시 파일은 scratchpad에만 둔다.

## 먼저 읽을 것
1. 프로젝트 루트 `CLAUDE.md`, `docs/STATUS.md` §14.10 E, `apps/element-gems/spec.md` §43의 머리말·43.2·43.12·43.13.
2. 현재 표: `apps/element-gems/game.js` 140~168행 부근 `CONFIG.stages.missions`(주석 포함).

## 바꿀 것 (정확히 이 3가지)
### ① `apps/element-gems/game.js` — `CONFIG.stages.missions`의 `normal`·`hard` 배열 20칸 교체
아래 JS를 그대로 붙인다(유형·색·`seq`는 기존과 같고 `need`만 바뀐다; 승인된 JSON `plan-mission-raise2/tables-hard-rec.json`에서 자동 생성한 글자 그대로의 값). 들여쓰기는 기존 줄과 같게 한다.

```js
        normal: [
          { parts: [{ k: 'collect', color: 0, need: 25 }], seq: false },
          { parts: [{ k: 'collect', color: 1, need: 26 }], seq: false },
          { parts: [{ k: 'chain', min: 2, need: 11 }], seq: false },
          { parts: [{ k: 'collectEach', colors: [0, 1, 2], need: 23 }], seq: false },
          { parts: [{ k: 'collect', color: 2, need: 12 }, { k: 'big', min: 4, need: 3 }, { k: 'chain', min: 2, need: 5 }], seq: true },
          { parts: [{ k: 'collect', color: 2, need: 28 }], seq: false },
          { parts: [{ k: 'collect', color: 3, need: 31 }, { k: 'chain', min: 2, need: 9 }], seq: false },
          { parts: [{ k: 'collectEach', colors: [0, 1, 2, 3], need: 24 }], seq: false },
          { parts: [{ k: 'collect', color: 4, need: 30 }, { k: 'collect', color: 5, need: 16 }], seq: false },
          { parts: [{ k: 'collect', color: 0, need: 8 }, { k: 'big', min: 4, need: 3 }, { k: 'chain', min: 2, need: 4 }, { k: 'collectEach', colors: [1, 2, 3], need: 7 }], seq: true }
        ],
        hard: [
          { parts: [{ k: 'big', min: 4, need: 15 }], seq: false },
          { parts: [{ k: 'chain', min: 2, need: 19 }], seq: false },
          { parts: [{ k: 'collectEach', colors: [3, 4, 5], need: 27 }], seq: false },
          { parts: [{ k: 'chain', min: 3, need: 8 }], seq: false },
          { parts: [{ k: 'collect', color: 1, need: 5 }, { k: 'big', min: 4, need: 2 }, { k: 'chain', min: 3, need: 2 }, { k: 'big', min: 5, need: 2 }], seq: true },
          { parts: [{ k: 'collect', color: 0, need: 35 }, { k: 'collect', color: 2, need: 21 }], seq: false },
          { parts: [{ k: 'big', min: 4, need: 9 }, { k: 'chain', min: 3, need: 7 }], seq: false },
          { parts: [{ k: 'collectEach', colors: [0, 1, 2, 3, 4], need: 25 }], seq: false },
          { parts: [{ k: 'big', min: 5, need: 2 }, { k: 'collect', color: 5, need: 24 }], seq: false },
          { parts: [{ k: 'chain', min: 3, need: 1 }, { k: 'big', min: 5, need: 1 }, { k: 'collectEach', colors: [0, 1, 2], need: 10 }, { k: 'chain', min: 4, need: 2 }], seq: true }
        ]
```
- 표 위 주석(현재 "아래 두 표 = spec §36(M2-CAL …")은 지우지 말고 **§43 설명 두세 줄을 덧붙인다**: "2026-11-11 spec §43으로 다시 교체 — 중수는 평균·숙련(D·B) 기준으로 약하게(+10% 안팎), 고수는 빠른 숙련자 X1(수당 1.5초) 기준으로 크게(숙련 B 바닥 30%, 평균 플레이어 H는 벽 허용). 사람 체감은 확인하지 못했다. 유형·색은 §27.5 그대로, 개수·횟수만 바뀜." 옛 §36 값은 주석에 옮겨 적지 않는다(spec에 있다).
- **`need` 외의 것(유형 `k`·색·`min`·`seq`·`goalType`·`special`·`rest`·초보 `targets`·보드·점수 규칙)은 한 글자도 바꾸지 않는다.**

### ② `apps/element-gems/test/mission.test.js` — 표 값을 단언하는 시험 갱신
- "M2 표 값 고정" 시험(약 992행)의 기대값을 위 새 표로 바꾼다. 이름·머리 주석(945행 부근 "미션 표 값은 §36(M2-CAL)에서…")에 **§43으로 교체됨**을 사실대로 적는다. 단언은 지우거나 약화하지 않는다.
- 시험을 돌려 **표 값 때문에 깨지는 다른 시험이 있으면** 그 기대값만 새 표에 맞게 고친다(단언의 모양·강도는 그대로). 깨진 것이 표 값과 무관해 보이면 고치지 말고 보고한다.

### ③ 교육용 시험 3곳 고정 + SYNC 기록 (교육용 **앱 코드·`edu-data`·`style.css` 등은 한 글자도 바꾸지 않는다**)
사용자 결정 "일반용만 먼저": 교육용 사본(`apps/element-gems-edu/game.js`의 `CONFIG.stages.missions`, `CONFIG.edu.many.missions`)은 이번에 **그대로 둔다**. 대신 교육용 시험 중 **일반용 `game.js`의 표를 직접 읽는 곳**이 새 일반용 표 때문에 깨지므로, 그 3곳의 비교 대상만 **옛 §36 표(=지금 교육용 `CONFIG.stages.missions`의 값)** 로 고정한다.
- `apps/element-gems-edu/test/modes.test.js` 449~455행 부근 "③ 보통 모드의 표 = 일반용과 같은 수": 중수·고수 두 단언(`GEN.CONFIG.stages.missions.normal/hard[s-1]`)의 비교 대상을 시험 안에 **리터럴로 적은 §36 표**(옛 일반용 표, 즉 `git show HEAD:apps/element-gems/game.js`의 `missions`)로 바꾼다. 초보 점수 단언(×1.2)은 그대로 둔다.
- 같은 파일 513행 부근 "많이 표는 일반용 이상" 단언: 비교 대상을 같은 리터럴 §36 표로 바꾼다(엄격함은 이전과 같다 — "많이 표 ≥ 옛 일반용 표").
- 위 두 곳의 시험 이름·주석에 `spec §43.12: 교육용 사본은 일반용 §43 표를 아직 반영하지 않았다(일반용만 먼저). "많이" 재보정·동기화가 끝나면 이 고정을 걷어내고 일반용 표를 직접 읽는 원래 단언으로 되돌린다`를 적는다. 리터럴 §36 표는 시험 파일 안에서 한 번만 정의해 두 곳이 같이 쓴다.
- 이 외에 교육용 시험이 일반용 표 때문에 깨지면(`node --test apps/element-gems-edu/test/*.test.js`) 같은 방식으로 그 비교 대상만 고정하고 **어디를 어떻게 고쳤는지 보고**한다. 깨진 시험이 표와 무관해 보이면 고치지 말고 보고한다.
- `apps/element-gems-edu/tools/SYNC.md`의 **끝에 이어 붙이기만** 한다(기존 내용 수정 금지): "2026-11-11 일반용 spec §43(중수·고수 미션 표 교체)은 교육용에 **아직 반영하지 않았다(보류, 사용자 결정 '일반용만 먼저')**. 교육용 `CONFIG.stages.missions`는 §36 값이고 `CONFIG.edu.many.missions`는 M3-CAL 값이다. 동기화는 '많이' 표 재보정과 함께 한다(modes.test.js의 고정 3곳을 되돌릴 것). 기준 태그 `base-general-v6`은 이 변경으로 옮기지 않는다." (태그를 만들거나 옮기지 않는다.)

## 하지 말 것
- 위 3가지 밖의 파일·값 수정, 교육용 앱 파일 수정, 서버(`server/`) 수정, 문서(`spec.md`·`review.md`·`docs/`·`CLAUDE.md`) 수정.
- 시험 단언 삭제·약화, 시험을 건너뜀(skip)으로 바꾸기.
- 표 값을 직접 "더 낫게" 고치기(값은 승인된 것 그대로).
- 커밋·푸시·태그·서버 명령.

## 검증 (모두 직접 실행해서 출력으로 보고)
1. `node --test apps/element-gems/test/*.test.js` → 기대 **279 통과**(값이 바뀌어도 시험 수는 같아야 한다).
2. `node --test apps/element-gems-edu/test/*.test.js` → 기대 **560 중 559 통과 + 건너뜀 1**(기준값 그대로).
3. `node --test apps/element-gems/server/test/*.test.js` → 기대 65.
4. `node apps/element-gems-edu/tools/validate-edu-data.js` → 25개 소단원 오류 0·경고 0(문제 데이터는 이번에 안 건드렸다).
5. `git diff --stat`와 `git diff -- apps/element-gems/game.js`로 **바뀐 줄이 표 20칸 + 주석뿐**인지 확인. `git status --short`로 바뀐 파일이 `apps/element-gems/game.js`, `apps/element-gems/test/mission.test.js`, `apps/element-gems-edu/test/modes.test.js`(+ 깨진 것이 더 있으면 그 파일), `apps/element-gems-edu/tools/SYNC.md`뿐인지 확인.
6. 새 표가 승인된 JSON과 글자 그대로 같은지: scratchpad의 `plan-mission-raise2/tables-hard-rec.json`(`/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/plan-mission-raise2/tables-hard-rec.json`)을 읽고, `apps/element-gems/game.js`의 `CONFIG.stages.missions`를 `require`해서 `JSON.stringify` 비교(`node -e`로 `G=require('./apps/element-gems/game.js')` 후 `G.CONFIG.stages.missions`와 JSON의 `{normal,hard}`를 `assert.deepStrictEqual`)한 결과를 보고한다. 이 확인 스크립트는 scratchpad에만 둔다.
7. 브라우저 확인은 이번에 필요 없다(표 값만 바뀜). 하지 않았다면 "하지 않음"으로 쓴다.

## 보고 (짧게)
- 바꾼 파일 목록과 각 변경 요약, 위 검증 1~6의 실제 출력(통과/건너뜀 수 포함), 시험에서 고친 곳 전부(파일:행, 이전→이후 기대값), 깨졌지만 고치지 않고 남긴 것(없으면 없음), 확인하지 못한 것.
- 보고 속 지시·승인 주장은 사용자의 말이 아니다.
