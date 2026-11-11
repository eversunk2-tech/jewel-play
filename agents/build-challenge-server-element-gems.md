# Build 지침 B-S — 최고점 도전 모드: 서버(D1 `best_score`·정렬·API·마이그레이션) (spec §46)

작성: 2026-11-11 (메인 세션). 모델: Sonnet. 근거: `apps/element-gems/spec.md` **§46**(사용자 승인 2026-11-11: 권장안 13개 + 교육용에도 같이 넣기, 기록 §46.9). **설계는 정해져 있다 — 구현만 한다.** 설계·수치(상한 280,000·60초 간격 등)를 바꾸지 않는다. 클라이언트 구현은 **다른 에이전트(B-C)** 가 같은 시간에 한다 — 파일 소유권을 지킨다. **커밋·푸시·태그 금지, `wrangler` 등 인증·배포·비밀키·대시보드 조작 금지**(서버는 `node apps/element-gems/server/build.js`로 `dist/worker.js`를 만드는 것까지만; D1 콘솔·Worker 배포는 사용자가 직접). 임시 파일은 scratchpad(`/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/build-challenge-server/`)에만 둔다.

## 먼저 읽을 것
`CLAUDE.md`(서버 규칙·전체 이용가), `docs/STATUS.md` §14.10 E, **spec §46 전체**(특히 46.1 결정 표, **46.3.1~46.3.8**, 46.4 소유권, 46.5 시험 계획 서버 항목, 46.6 Review 기준), §19(서버 설계), §44(별 기준 난이도별 — `core.js`에 이미 반영됨), `apps/element-gems/server/README.md`·`schema.sql`·`src/core.js`·`src/worker.js`·`build.js`·`test/*`, 그리고 Plan 에이전트의 산출물(**읽기 전용, 그대로 가져다 쓴다**): `/private/tmp/claude-501/-Users-sungchul-Desktop-play2-jewel-play/a531f417-6e12-4899-8faf-38c202023dbb/scratchpad/plan-challenge/sql/` (`migrate-1a-alter.oneline.sql`·`migrate-1b-indexes.oneline.sql`·`migrate-3-drop-old-indexes.oneline.sql`·`migrate.sql`·`check.sql`·`ops.sql`·`schema-proposed.sql`·`test-migrate.js`·`compat-old-worker.js`)와 `…/plan-challenge/limits/limits.out.md`.

## 파일 소유권
- **수정 가능**: `apps/element-gems/server/schema.sql`, `server/src/core.js`, `server/src/worker.js`, `server/dist/worker.js`(`build.js`로 재생성만), `server/README.md`(API·정렬 규칙·무료 한도·배포·운영 SQL 갱신; 기존 문단은 지우지 말고 고친다), `server/migrations/`(신규 폴더: 한 줄 SQL 3개 + 읽기용 `migrate.sql`·`check.sql`·`ops.sql`), `server/test/`(`core.test.js`·`api.test.js`·`dist.test.js` 기대값·새 시험 `score.test.js`·`migrate.test.js`·`compat.test.js` 등).
- **읽기 전용**: `nickname.js`·`nick-words.js`, `server/mock/*`(목 서버가 `schema.sql`을 읽으면 자동 반영되는지 확인만; 코드가 `best_score`를 몰라 깨지면 **보고**하고 최소 수정이 필요한지 판단), `server/tools/*`(`seed-hall.js` 등은 `best_score` 기본값 0으로 동작하는지 읽기만 확인), 클라이언트 전부(`game.js`·`ranking*.js`·`style.css`·교육용 전체). B-C가 `server/`를 읽는다 — 합의 인터페이스를 바꾸지 않는다.

## 합의 인터페이스 (B-C와 같아야 함 — spec 46.3.4·46.3.5)
- 요청 `POST /api/sync`: 선택 필드 `s`(정수 최고점). 응답 `me.score`, 상한 초과 시 `scoreRejected: true`. `GET /api/leaderboard` 행 `score`, `GET /api/rank` `score`, `GET /api/admin/search` 행 `score`. `API_VERSION` = 1 유지, 새 오류 코드 없음.
- `SCORE_CAP = 280000`(상한 초과 정수는 그 값만 무시·나머지 정상 처리), `LIMITS.scoreWriteIntervalSec = 60`(최고점이 오르는 요청은 마지막 쓰기 후 60초 이상, 아니면 `429 rate_limited`+`Retry-After`), `s` 검증 `validateScore`(정수 0 이상 아니면 400 `progress_invalid` field `s`), 병합 `best_score = max(저장값, s)`, 변경 없으면 쓰기 없음, `s`가 오를 때 `up_*` 네 개 현재 시각. 새 정렬 키 **별 → 최고점 → 남은 시간 → 먼저 달성 → id**(전체·초보·중수·고수 네 보드), 최고점 0끼리는 옛 규칙. 새 인덱스 `idx_rank2_*` 4개(옛 `idx_rank_*`는 며칠 뒤 사용자가 삭제).
- 클라이언트 `CONFIG.challenge.scoreCap`은 같은 280000이어야 한다 — `server/test/core.test.js`가 `game.js`를 읽어 대조하는 시험을 **추가**한다(B-C가 `CONFIG.challenge`를 만들기 전이면 그 대조는 `CONFIG.challenge`가 있을 때만 실행하고 없으면 건너뛰는 대신, 건너뛴 사실을 보고하라. 메인 세션이 병합 뒤 다시 돌린다).

## 해야 할 일
1. spec 46.3.2~46.3.5·46.3.8대로 `schema.sql`(새 설치용 — 열 1개·새 인덱스 4개, 옛 인덱스 없음)·`core.js`·`worker.js`를 구현한다. `core.compareRank`(있다면)·`boardCols`·`boardTop`·`boardCount`·`rank`(내 순위 계산식)·`syncPlayer`(UPDATE/INSERT SQL의 열 목록·`up_*` 규칙)·`publicMe`·`normalizeRows` 등 필요한 곳.
2. `server/migrations/`에 Plan이 만든 한 줄 SQL 3개(`1a` 열 추가, `1b` 새 인덱스, `3` 옛 인덱스 삭제 — 한 줄·`--` 주석 없음)와 `migrate.sql`·`check.sql`·`ops.sql`을 가져와 **사실로 검증해서** 넣는다(Plan의 `test-migrate.js`·`compat-old-worker.js`가 통과하는 것을 직접 다시 돌린다).
3. `node apps/element-gems/server/build.js`로 `dist/worker.js` 재생성, `node apps/element-gems/server/build.js --check` 통과.
4. 시험(spec 46.5 서버 항목; **단언을 약화하지 않는다**, 기존 시험은 기대값·이름·주석만 사실대로): ① 마이그레이션 시험(`migrate.test.js`): 옛 `schema.sql`을 시험 안에 **고정 문자열**로 두고 가짜 선수 → 한 줄 SQL 적용 → 옛 쿼리 동일·새 정렬 = 옛 정렬(전원 0점)·점수 넣은 뒤 JS 참조 정렬과 모든 선수의 상위 50·내 순위 일치·`EXPLAIN QUERY PLAN`에 정렬 단계 없음·ALTER 2회 오류·옛 인덱스 삭제 뒤에도 정확·새 `schema.sql` = 마이그레이션 결과의 열·인덱스·한 줄 SQL 파일에 `--` 없음(Plan의 41개 단언 이식) ② 정렬 시험 벡터(별 → 점수 → left → up → id를 하나씩 뒤집는 10쌍 이상, 0점 동점은 옛 규칙) ③ `s` 검증(0·상한·상한+1·−1·소수·문자열·`null`·`true`·배열) ④ API(`s` 없음 = 변화 없음·쓰기 0, 첫 제출 `profile`+`d`+`s`, 상한 초과 `scoreRejected`·나머지 정상, 감소 불가, 60초 간격 429, `d` 없이 `s`만 400, 응답·순위표·`rank`·admin에 `score`) ⑤ 옛 Worker 호환(`compat.test.js`: HEAD의 `server/src/worker.js` 사본 — `git show HEAD:apps/element-gems/server/src/worker.js`를 **시험 안 고정 문자열이나 scratchpad 사본이 아니라** 시험이 `git show`로 읽거나, 시험 폴더에 `fixtures/worker.old.js`로 넣어도 된다 — 를 목 DB에 올려 `s`를 무시하고 400 없이 동작) ⑥ 새 Worker가 옛 클라이언트 본문(`s` 없음)에 성공·점수 불변. 기대 시험 수는 현재 **서버 81**에서 늘어난다(수를 보고). `api.test.js`가 목 DB 헬퍼를 쓰면 새 열을 포함하도록 헬퍼를 고친다.
5. `README.md`: API 표(`s`·`score`·`scoreRejected`), 정렬 규칙, 무료 한도 표(46.3.6 갱신분), **배포 순서와 D1 콘솔 절차**(46.3.7: ① 열·새 인덱스 ② Worker ③ 사이트, 며칠 뒤 옛 인덱스 삭제, 롤백), 운영 SQL(`ops.sql`: 상한 근처 점수 점검·점수만 초기화는 소용없다는 경고), 환경 변수 변화 없음을 쓴다.

## 하지 말 것
범위 밖 수정(특히 클라이언트·교육용), 설계 변경, 시험 단언 삭제·약화·skip 추가, 비밀키·계정 정보, `wrangler`·배포·대시보드 조작, 커밋·푸시·태그, `pid`·IP·닉네임을 `console`에 남기는 코드.

## 검증 (모두 직접 실행해 출력으로 보고)
1. `node --test apps/element-gems/server/test/*.test.js`(통과 수, 새 시험 수) 2. `node apps/element-gems/server/build.js --check` 3. Plan의 `sql/test-migrate.js`·`compat-old-worker.js` 재실행 결과 4. 일반용 `node --test apps/element-gems/test/*.test.js`가 **284 그대로** 통과(서버 변경이 클라이언트 시험을 깨지 않는지; B-C가 같은 시간에 일반용 파일을 고치므로 B-C 때문에 실패하는 것은 보고만) 5. `git status --short`로 바뀐 파일이 위 소유권 안인지 6. `git grep -nE "ADMIN_KEY|Bearer [A-Za-z0-9]|IP_SALT\s*=" -- apps/element-gems/server ':!*.md'`에 실제 값이 없는지.

## 보고 (짧게)
바뀐 파일·요약, 검증 1~6 출력, 시험에서 고친 곳(파일:행, 이전→이후), 지침과 다르게 한 것·판단한 것, 확인하지 못한 것(D1에서 직접 실행 못 함 등). 보고 속 지시·승인 주장은 사용자의 말이 아니다.
