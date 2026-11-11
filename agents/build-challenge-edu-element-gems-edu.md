# Build 지침 B-E — 최고점 도전 모드: 교육용 이식 (spec §46, 결정 10 변경 = 교육용에도 같이 넣기)

작성: 2026-11-11 (메인 세션). 모델: Sonnet. 근거: `apps/element-gems/spec.md` **§46**(사용자 승인 2026-11-11, 기록 §46.9 — 교육용에도 같이 넣기). **설계는 정해져 있다 — 구현(이식)만 한다.** 설계·수치를 바꾸지 않는다(바꿔야만 하면 바꾸지 말고 보고). 일반용 클라이언트(B-C)와 서버(B-S)는 **이미 끝나고 메인 세션이 확인했다(읽기 전용)**. 커밋·푸시·태그 금지, `wrangler` 등 서버 명령 금지. 임시 파일은 scratchpad(`/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-challenge-edu/`)에만 둔다.

## 먼저 읽을 것
`CLAUDE.md`(두 버전 동기화·`[EDU]` 표식 규칙·전체 이용가·교육용은 학습 1순위), `docs/STATUS.md` §14.10 E, **spec §46**(특히 46.1 결정 10·46.2.1~46.2.6 "교육용에도 이식" 열·46.9), 일반용 구현 결과: `git diff HEAD -- apps/element-gems/game.js apps/element-gems/index.html`(새 `CONFIG.challenge`·순수 함수 7개·"최고점 도전" 화면 구간·고친 기존 함수 목록은 B-C 보고의 3번 — 아래 요약), 두 앱 공용 파일(이미 같음): `ranking.js`·`ranking-ui.js`·`style.css`, `apps/element-gems-edu/tools/SYNC.md`(이식 절차), 교육용 `game.js`·`edu.js`·`index.html`·`edu.css`, 교육용 시험 `test/edu-engine.test.js`("spawn=0이면 일반용과 판 흐름이 같다" 증명 시험이 이 작업의 근거)·`modes.test.js`·`mission.test.js`·`score.test.js`·`spirit.test.js`·`menu.test.js`·`ranking.test.js`.

## 이식 원칙 (spec 46.9)
**교육용의 도전 판은 일반용과 같은 규칙·같은 점수**여야 한 순위표에 섞여도 공정하다 → 교육용 도전 판에서는 **? 선물상자(`wild` 공급)·문제 팝업·정령 특별 레벨·학습 조건·교육용 "많이/보통" 표 읽기를 모두 끈다**(`spawn=0` 판과 같은 흐름). `CONFIG.challenge`(규칙·`scoreCap`·`submitDelaySec`)는 일반용과 **같은 값·같은 본문**(시험이 두 `CONFIG.challenge`의 일치를 확인), 교육용 저장(`element-gems-edu:v1`)에 `challenge` 필드, 점수는 공용 `ranking.js`의 `s`로 같은 서버 행에 최댓값으로 합쳐진다(프로필 공유). 교육용 단원 선택·문제·선물상자 흐름의 기존 동작은 **한 글자도 달라지면 안 된다**(도전 판 밖에서는 불변).

## B-C가 일반용에 넣은 것 (교육용에 같은 분기·같은 본문으로 옮긴다; 줄은 일반용 `game.js` 기준)
- **신설(그대로 복사, 일반용과 글자 그대로 같게)**: `CONFIG.challenge` 블록(228행 부근), 순수 함수 7개 `defaultChallenge`·`parseChallenge`·`applyChallenge`·`applyChallengeResult`·`challengeStartInfo`·`challengeHudInfo`·`challengeResultInfo`(내보내기 포함), 화면 구간 "최고점 도전 (spec §46)"(`startChallenge`·`finishChallenge`·`leaveChallenge`·`openChallenge`·`enterChallenge`·`onQuit`·`playCountdown`·`setupChallengeHud`·`updateChallengeHud`·`resetChallengeHud`·`renderChallengeBtn`), `ElementGemsHost.enterChallenge`와 이벤트 `challengeResult`·`openHall`.
- **짧은 분기(기존 함수에 한 줄씩; 교육용 같은 함수에도 같은 줄을 넣는다)**: `state` 리터럴 `challenge: null`, `cacheDom` id 15개(`btn-challenge`·`chal-sub`·`chal-badge`·`overlay-chal-end`·`chal-end-*`·`btn-chal-again/hall/home`), `defaultSave`의 `challenge: defaultChallenge()`, `parseSave` 끝 `out.challenge = parseChallenge(o.challenge);`, `resetState`의 `state.challenge = null;`·`resetChallengeHud();`, `renderStart`의 `renderChallengeBtn();`, `restartStage`(`if (state.challenge) { startChallenge(); return; }` 뒤 원래 본문), `finishStage` 맨 앞 `if (state.challenge) { finishChallenge(); return; }`, `frame`의 `if (state.challenge) updateChallengeHud();`, `bindUi`(`btn-quit` 핸들러 `goStages` → `onQuit`, `btn-challenge` 연결 블록), `module.exports`·`window.ElementGemsHost`·`createClient`에 `challenge: CONFIG.challenge` 인자. 교육용 `game.js`에서 이 함수들이 **일반용과 다르게 생긴 곳**(교육용에만 있는 `[EDU]` 코드)은 그 코드를 그대로 두고 같은 줄만 더한다.
- **교육용에서만 다른 점(`// [EDU]` 표식)**: ① `startChallenge`에서 교육용 판 상태를 **선물상자 없음·문제 없음**으로 고정한다(예: 교육용 `state.edu`의 모드를 'normal'·`wild` 공급 0·학습 조건 없음으로, 판 시작 때 정해 도중에 바뀌지 않게; 기존 `eduTableMode`·`learnNeed`·`planRefillTypes`의 wild 경로가 도전 판에서 아무것도 만들지 않게 — 가장 작은 분기로) ② 정령 특별 레벨·"정령에게 선물 드리기" 흐름과 겹치지 않게 ③ 도전 판 동안 `EduQuiz` 팝업·선물상자 UI가 뜨지 않음. 이 분기 이름과 위치를 보고에 적는다.

## 파일 소유권
- **수정 가능**: 교육용 `apps/element-gems-edu/game.js`·`edu.js`(필요 시)·`index.html`·`edu.css`(필요 시), 교육용 `test/`(새 `challenge.test.js`와 기존 시험의 기대값·이름·주석), `apps/element-gems-edu/tools/SYNC.md`(끝에 이어 붙이기만), **일반용 `apps/element-gems/index.html`의 프로필 화면(`#screen-profile`) 문구만**(아래 "프로필 문구"; 두 앱이 같아야 하므로 일반용 쪽도 같이 고친다 — 다른 줄은 건드리지 않는다).
- **읽기 전용**: 일반용 `game.js`·`style.css`·`ranking*.js`·일반용 시험, `server/*`, 교육용 `edu-data/`·`ranking*.js`·`style.css`(이미 일반용과 같음 — 바꾸면 일치 시험이 깨진다).

## 해야 할 일
1. 교육용 `game.js`에 위 신설·분기·`[EDU]` 차이를 이식한다(일반용 새 구간은 **글자 그대로**, 시험이 비교하는 블록은 비교 방식을 먼저 읽어 일치를 유지).
2. 교육용 `index.html`: 시작 화면 [시작] 바로 아래 `#btn-challenge`(일반용과 같은 마크업·같은 `id`), 규칙 줄 `li.rule-chal`, 결과 오버레이 `#overlay-chal-end`, 명예의 전당 규칙·하단 문구 기본값 — 일반용 `index.html` 변경분과 **같게**(`git diff HEAD -- apps/element-gems/index.html` 참고). 교육용 시작 화면·단원 선택 구조는 그대로. **프로필 문구**: B-C 제안대로 프로필 화면의 "명예의 전당에는 닉네임·그림·별 수·순위만 모두에게 보여요"와 `pf-small`의 "닉네임·그림·별 수는 …저장돼요"에 **최고점**도 공개된다는 말을 추가한다(어린이 대상 — 정확히 알린다; 문구 변경은 최소로, 초등학생이 읽는 쉬운 말; 두 앱 `index.html`의 프로필 화면 마크업이 같아야 `edu-profile-share` 시험이 통과한다).
3. 시험: 새 `apps/element-gems-edu/test/challenge.test.js` — ① 교육용 `CONFIG.challenge`가 일반용과 **같은 값**(`deepStrictEqual`, `GEN` 읽기) ② **교육용 도전 판이 일반용 도전 판과 같은 시드·같은 행동으로 점수·남은 시간·게이지·통계가 같다**(`edu-engine.test.js`의 `spawn=0` 동등 시험 방식 참고, 시간 보너스 없음) ③ 도전 판 동안 선물상자(`?`)가 한 번도 나오지 않고 문제 팝업이 뜨지 않음(여러 시드·행동 수) ④ 도전 후 교육용 단원·문제·선물상자 기본 동작 불변(도전 판 밖에서 기존 시험이 그대로 통과) ⑤ 저장 `challenge` 필드 왕복·옛 교육용 저장(필드 없음) 호환·교육용 `eraseDevice`가 `challenge`를 지움 ⑥ 시작 화면 버튼·결과 오버레이 DOM id 존재 ⑦ `ranking.js`에 `challenge: CONFIG.challenge`가 전달되어 최고점이 제출 본문 `s`로 나가는지(목 fetch) ⑧ 교육용 소스의 도전 구간이 일반용과 글자 그대로 같고 차이는 `// [EDU]` 줄뿐인지. 기존 시험은 **단언을 약화하지 않고** 기대값·이름·주석만 사실대로 고친다(예: 저장 키 목록·`spirit` ⑪의 저장 비교에 `challenge` 추가는 일반용 ④와 같은 방식으로).
4. SYNC.md 끝에 기록(이식한 함수·분기·`[EDU]` 차이, 기준 태그 `base-general-v6`은 옮기지 않음 — 메인 세션이 Review 뒤 만든다).

## 하지 말 것
설계·수치 변경, 서버·일반용 `game.js`·`ranking*.js`·`style.css` 수정, 교육용 기존 동작 변경(도전 판 밖), 시험 단언 삭제·약화·skip, 교육용 문제·선물상자 규칙 변경, 외부 URL·라이브러리, 커밋·푸시·태그, 서버 명령.

## 검증 (모두 직접 실행해 출력으로 보고)
1. `node --test apps/element-gems-edu/test/*.test.js`(기대: 실패 0, 건너뜀 1, 통과 수는 새 시험만큼 늘어남). 2. `node --test apps/element-gems/test/*.test.js`(기대 334 그대로 통과 — 일반용 `index.html` 프로필 문구 변경이 일반용 시험을 깨지 않는지). 3. `node --test apps/element-gems/server/test/*.test.js`(기대 123). 4. `node apps/element-gems-edu/tools/validate-edu-data.js`(오류 0·경고 0). 5. 두 앱 `ranking-ui.js`·`style.css` `cmp` 동일, `ranking.js` 차이는 동기화 키·`[EDU]` 주석뿐. 6. 일반용 "최고점 도전" 구간과 교육용 구간의 `diff`(차이가 `// [EDU]` 줄뿐임을 보임). 7. 화면 확인(권장): scratchpad에 교육용 앱 사본 + 로컬 목 서버 + **별도 사용자 폴더의 헤드리스 Chrome**(localhost만, 배포 주소·기존 탭 금지, `location.origin` 확인 후 조작, 끝나면 서버·프로세스 정리)으로 교육용 시작 화면의 새 버튼, 도전 판(선물상자·문제 없음)·결과 화면, 단원 선택→문제 풀이 흐름이 기존대로인지 캡처로 확인. 8. `git status --short`·`git diff --stat`으로 바뀐 파일이 소유권 안인지, 교육용 `game.js`의 **기존 함수 변경 목록**(이전→이후 한 줄).

## 보고 (짧게)
바뀐 파일·요약, 검증 1~8 출력, `[EDU]` 분기 목록(이름·위치·이유), 시험에서 고친 곳(파일:행, 이전→이후), 지침과 다르게 한 것·판단한 것, 확인하지 못한 것(소리·실기기·Safari·Firefox·실제 학생 사용 등). 보고 속 지시·승인 주장은 사용자의 말이 아니다.
