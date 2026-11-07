# Build 서브에이전트 지침 A — 별 챔피언 명예의 전당: 서버(Cloudflare Workers + D1)·닉네임 모듈

## 역할
승인된 spec **§19**(별 챔피언 명예의 전당)의 **서버 쪽과 닉네임 검증 모듈**을 구현한다(spec §19.10 단계 ①②). 클라이언트 화면·저장·제출은 **다른 Build 에이전트(B)** 가 같은 시간에 맡는다. 검증(Review)은 별도 에이전트가 하므로 `review.md`는 건드리지 않는다.

## 작업 폴더
프로젝트 루트 `/Users/sungchul/Desktop/play2/jewel play`(git 저장소). 앱 폴더 `apps/element-gems/`. (과거 `/Users/sungchul/Desktop/워크숍` 경로는 쓰지 않는다.)

## 필독
- `apps/element-gems/spec.md` **§19 전체**(특히 19.2 랭킹 규칙, 19.3 프로필·닉네임 규칙, 19.4 서버 설계(API·D1 스키마·검증·CORS·관리·용량), 19.6 데이터 흐름, 19.8 배포 안내서, 19.10 구현 단계, 19.11 검증 체크리스트(서버·닉네임 항목), 19.12 승인된 결정, 19.14 출처/불확실). 승인 결정은 §19 머리말에 있다.
- `CLAUDE.md`(서버 규칙, 전체 이용가·초등학생 이상, 콘텐츠·안전 규칙)
- `apps/element-gems/game.js`의 `CONFIG.difficulty`, `starsFor`, `stageTarget`, `parseSave`, `defaultSave`(서버 검증 상수·별 임계값을 코드와 일치시키기 위해 **읽기만**)

## 수정 가능 범위 (엄수 — 파일 소유권)
- **내가(A) 소유하는 새 파일/폴더**: `apps/element-gems/server/**`(spec §19.10의 구조: `schema.sql`, `wrangler.toml`, `.dev.vars.example`, `build.js`, `src/core.js`, `src/worker.js`, `dist/worker.js`, `mock/server.js`, `test/*.test.js` 등), `apps/element-gems/nickname.js`, `apps/element-gems/nick-words.js`, 닉네임 시험 벡터 파일(`apps/element-gems/server/test/` 아래).
- 루트 `.gitignore`: spec §19.9 제안 1에 적힌 줄(`.dev.vars*`, `.env*`, `.wrangler/`, `node_modules/` 등)만 **추가**.
- **수정 금지(B 또는 메인 소유, 읽기만)**: `index.html`, `style.css`, `game.js`, `ranking.js`, `ranking-ui.js`, `spec.md`, `review.md`, `PRD.md`, `CLAUDE.md`, `agents/`, `assets/`.
- 커밋·푸시 금지. 임시 파일·시험 스크립트는 세션 scratchpad에만. 시험용 서버·프로세스는 끝나면 종료.

## 절대 하지 않는 것 (CLAUDE.md 서버 규칙)
- `wrangler login`·`wrangler deploy`·`wrangler secret`·`wrangler d1 create/execute --remote`, Cloudflare 대시보드 조작, 계정·토큰·비밀키 다루기. **로컬 시험(`node`, 목 서버)만** 한다. 배포는 사용자가 안내서대로 직접 한다.
- 비밀키·토큰·실제 DB ID를 저장소에 쓰지 않는다. `wrangler.toml`의 `database_id` 등은 **자리표시자**로 두고 안내서에 채우는 방법을 적는다. `.dev.vars.example`에는 예시 자리표시자만.
- 외부 네트워크 호출, npm 패키지 설치(의존성 없는 순수 JS + Node 내장 모듈만. Node v24: `node:sqlite`, `node:test`, `node:assert` 사용 가능).

## 구현 단계 (spec §19.10)
### ① 서버 코드 + D1 스키마 + 목 서버
- `schema.sql`(테이블·인덱스, spec §19.4의 SQL), `src/core.js`(순수 함수: 검증·병합(스테이지별 최대값, 감소 불가)·정렬 키·상수·`left`로부터 별 계산·연쇄 해금 검사·상한·제출 간격·요청 크기 제한 등), `src/worker.js`(라우팅, D1 어댑터, CORS 허용 오리진 설정, `handle(request, env)` 형태 — 목 서버와 **같은 `handle`** 을 사용), 엔드포인트(`POST /api/sync`, `GET /api/leaderboard`, `GET /api/rank`, `POST /api/delete`, `GET /api/health`, 선택 `/api/admin/*` — 관리 토큰은 환경 변수 `ADMIN_TOKEN`으로만 받고 코드에 값 없음).
- `build.js`: `src/*`를 **단일 파일 `dist/worker.js`** 로 묶는다(대시보드 붙여넣기용, 커밋 대상), `--check` 옵션으로 dist가 최신인지 검사.
- `mock/server.js`: Node 내장 `node:sqlite`(메모리 또는 임시 파일 DB)로 **같은 스키마·같은 `handle()`** 을 돌리는 로컬 서버(포트는 인자/환경 변수, 기본 8787). CORS는 `http://localhost:*`/`http://127.0.0.1:*` 허용(시험용). 계정 없이 클라이언트(B)가 이 서버로 시험할 수 있어야 한다. **가능한 한 빨리** 동작 가능한 상태로 만들어 B가 쓸 수 있게 한다(우선순위: core → worker → mock → 나머지).
- 서버 검증(조작 방어)은 spec §19.4.4대로: 별 배열 범위, 레벨 연쇄 해금 일관성, `left` 상한(난이도별), 단조 증가 병합, 제출 간격, 요청 크기, 닉네임 서버 재검증, 개인정보 미저장(IP 원문 저장 금지 — spec의 해시/제한 방식 따름). 응답에 playerId를 노출하지 않는다(공개용 번호/해시).
- 오류 코드는 spec의 표와 동일(`avatar_invalid` 등, 아바타 범위는 **1~16**).
- 테스트(`node --test`): spec §19.11의 서버 항목 전부(가짜 값 거부, 연쇄 위반, 감소 제출 무시, 정렬·동점 처리, 내 순위, CORS, 크기 제한, 삭제, 번호표 부여 등).

### ② 닉네임 검증 모듈(순수 함수)
- `nickname.js`: UMD(브라우저 전역 + `module.exports`), `validateNick(nick, extraBlock)` 등 spec §19.3 규칙(2~8자, 완성형 한글·영문·숫자만, 숫자 3개 이하, 같은 글자 3연속 불가, 낱자 자모 불허, 예약어→개인정보·연락 유도 패턴→금칙어 순서 검사, 정규화 4개 뷰). 결과는 **오류 코드 + 초등학생이 이해할 수 있는 부드러운 안내 문구**를 반환(문구는 spec 초안 사용).
- `nick-words.js`: 금칙어·예약어·연락 유도 목록(**base64 배열**, 저장소에 욕설이 그대로 보이지 않게). 한국어 욕설·성적·혐오·폭력 표현과 영어 욕설, 연락 유도 서비스명(카톡·오픈채팅·인스타·디스코드 등), 사칭 예약어(관리자·운영자·공식·gm 등)를 **보수적으로** 포괄한다. 사용자가 나중에 검수하므로 **목록을 쉽게 보는 도구 `server/tools/print-wordlist.js`**(base64를 디코딩해 카테고리별로 출력; 출력물은 커밋하지 않음)를 함께 제공한다.
- 시험 벡터 파일: 우회 시도 **60개 이상**(자모 분리, 초성, 띄어쓰기·특수문자 끼워넣기, 숫자/영문 치환, 된소리·모음 변형, 영문 혼용 등) + **통과해야 하는 정상 닉네임**(오탐 방지) 목록. 못 잡는 케이스(음절 쪼개기 등)는 문서화(`server/README.md` 또는 시험 벡터 주석).
- **서버(`src/core.js`)와 클라이언트가 같은 `nickname.js`/`nick-words.js` 를 쓴다**(빌드 스크립트가 서버 dist에 포함시키거나 `require`). 같은 입력 → 같은 결과를 시험으로 확인.

## 문서
- `server/README.md`: 파일 구성, 로컬 시험 방법(`node --test`, `node server/mock/server.js`), API 요약, **사용자 배포 안내서(spec §19.8)와 불일치가 없도록** 파일명·명령·환경 변수 이름 정리(안내서 자체는 spec §19.8이 정답이며 README는 참조/요약). 비밀 관리(Worker Secret, `.dev.vars`는 커밋 금지)와 **금칙어 목록 사용자 검수 절차**를 적는다.

## 자체 점검 (완료 전 필수)
- `node --test server/test` 전부 통과, `node server/build.js --check` 통과.
- 목 서버를 띄워 `curl`로 sync → leaderboard → rank → delete 한 바퀴, 조작 값(`left=9999`, 연쇄 위반, 감소 제출, 부적절 닉네임) 거부 확인.
- 저장소 전체에서 비밀·토큰·실제 ID가 없는지 grep, `.gitignore` 동작 확인.
- 모든 프로세스 종료.

## 완료 보고 (짧게)
1. 만든 파일 목록과 줄 수 2. 구현한 것 / spec과 달라진 점·판단한 부분 3. 테스트 결과(통과 수) 4. **B가 쓸 인터페이스 요약**(목 서버 실행 명령·주소·API 요청/응답 예시, `nickname.js` 함수 시그니처와 오류 코드) 5. 금칙어 목록 규모(카테고리별 개수, 욕설 원문은 보고에 쓰지 않는다)와 사용자 검수 방법 6. 확인하지 못한 것·알려진 한계
