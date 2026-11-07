# Build 서브에이전트 지침 — 닉네임 금칙어·예약어 보강 (6차 Review 후속)

## 역할
6차 Review(`apps/element-gems/review.md` §11-5)가 찾은 **닉네임 검증의 목록·규칙 공백**을 보강한다. 대상은 전체 이용가·초등학생 이상이므로 **보수적으로** 막되, 정상 닉네임 오탐은 늘리지 않는다. 사용자가 직접 승인한 작업이다(2026-11-07, "순위표 반영 후 금칙어 보강 시작").

## 작업 폴더
`/Users/sungchul/Desktop/play2/jewel play` (git). 앱: `apps/element-gems/`. 커밋·푸시·`wrangler`·Cloudflare 조작 금지. 임시 파일은 세션 scratchpad에만.

## 수정 가능 범위 (엄수)
- 수정: `apps/element-gems/nick-words.js`, `apps/element-gems/nickname.js`(규칙 추가가 꼭 필요할 때만, 기존 동작·오류 코드·시그니처 유지), `apps/element-gems/server/test/nick-vectors.js`·`nickname.test.js`(시험 추가·갱신), `apps/element-gems/server/dist/worker.js`(**`node server/build.js`로만 재생성**), `apps/element-gems/server/README.md`(검수 절차 문구 갱신이 필요할 때만).
- 읽기 전용: `server/src/*`, 클라이언트 파일, `spec.md`, `review.md`, `PRD.md`, `CLAUDE.md`, `agents/`, `assets/`. 금칙어 원문은 보고서에 쓰지 않는다(분류·개수만).

## 필독
- `review.md` §11-5 표(공백 유형), `nickname.js`·`nick-words.js` 구조(`=` 전체 일치 / `*` 글자 그대로 / 기본 규칙, base64 배열), `server/tools/encode-word.js`, `server/tools/print-wordlist.js`, 기존 시험 벡터 `server/test/nick-vectors.js`.
- spec §19.3(닉네임 규칙)과 §19.11 닉네임 체크리스트.

## 할 일
1. **영어 욕설 철자 변형**: Review 표의 유형(`f`계열 `q/x/cc/kk/cuk` 변형, `shit`계열 `y/e` 변형, `bitch`계열, `dick`·`cock`·`pussy`·`porn`·`retard`·`sex`·`kill yourself` 약어 등)을 **전체 일치(`=`)** 위주로 추가(부분 일치는 오탐 위험). `hoe`·`cok` 같은 짧고 정상 단어와 겹치는 것은 오탐을 따져 판단하고 근거를 보고한다.
2. **치환 뷰**: `1→l`, 대문자 `I`→`l` 치환 뷰 추가 여부 검토·적용(기존 `1→i` 뷰 옆에). 오탐 시험(`class`·`pass`·`ele3`·`abc골` 등)을 먼저 돌려 본다.
3. **한글 변형**: `시불`, 뒤집기 `발시` 등 작은 규모는 목록으로. 앞뒤 순서를 뒤집는 우회가 다른 단어에 일반화되는지 검토하되 **오탐이 큰 일반 규칙은 넣지 않는다**.
4. **개인정보**: ① `공1공`처럼 숫자를 끼운 전화번호 표기를 숫자 제거 뷰로 검사 ② 학급 표기에 한글 숫자(`삼반`, `이학년`) ③ 연락 유도 목록에 `네이버`·`naver`·`dotkr`·`도트컴`·`ㅇㅅㅇ` 류 등 보강. `반달곰`·`초코우유`(초코는 `초` 끝 아님)·`반장`·`일등` 같은 정상 닉네임은 통과해야 한다.
5. **사칭 예약어**: `관리인`·`관리원`·`티처`·`Ignis`와 비슷한 계열(운영·공식·스태프·모더레이터 한글·영문 변형) 보강.
6. **오탐 수정**: ① `Shiitake`(shit 부분 일치) ② **`달빛시험`·`빛시험`**이 부적절 이름으로 거부되는 것(배포 사이트에서 확인됨, `시험`·`달빛`은 통과). 원인 규칙을 찾아 `allow` 목록·규칙 조정으로 정상 이름이 통과하게 하고, 같은 원인의 다른 정상 단어(예: `빛시`로 시작하는 조합, `시험`이 들어간 이름)도 시험에 추가한다. 이 두 건은 설계상 의도된 막힘이 아니라 오탐으로 취급한다.
7. 오탐 검증: 정상 닉네임 목록(기존 350개 + 새로 100개 이상: 동물·색·음식·학교생활 단어·흔한 한글 두세 글자 이름 조합·영어 단어)을 전부 통과시키고, 막혀야 하는 새 우회 벡터를 **60개 이상** 추가한다. 시험 벡터는 base64 또는 변형 생성 방식으로 저장소에 욕설이 그대로 읽히지 않게 한다(기존 방식 따름).

## 완료 전 필수
- `node --test server/test` 전부 통과(개수 기록), `node --test test/*.test.js`(클라이언트) 통과, `node server/build.js` 후 `node server/build.js --check` OK.
- `node server/tools/print-wordlist.js --counts`로 분류별 개수 변화를 기록(보고에는 개수만).
- 클라이언트·서버가 같은 `nickname.js`/`nick-words.js`를 쓰므로 **같은 입력 → 같은 결과**인지 기존 시험이 통과하는지 확인.
- 변경 파일 목록과 `git diff --stat`.

## 완료 보고 (짧게)
1. 변경 파일·줄 수 2. 추가한 항목 수(분류별), 규칙 변경 여부 3. 오탐 수정 결과(`달빛시험`·`Shiitake` 포함, 원인) 4. 시험 개수·통과 5. 새 우회 벡터 중 못 막은 것(개수, 알려진 한계로 기록) 6. 사용자 검수 방법 7. 확인하지 못한 것. 배포(dist를 Worker에 붙여넣기)는 사용자가 직접 한다.
