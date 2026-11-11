# 명예의 전당 서버 (Cloudflare Workers + D1)

별 챔피언 순위표용 서버 코드입니다. 설계의 정답지는 `../spec.md` **§19**이고, 배포 안내서도 spec **§19.8**이 정답입니다. 이 문서는 파일 구성·로컬 시험·API 요약·비밀 관리·금칙어 검수 절차를 정리한 참조용입니다.

- **비밀 정보는 이 폴더에 없습니다.** 공개 저장소에 그대로 올라가도 안전하게 만들었습니다(비밀키·토큰·실제 DB ID 없음).
- 서버가 없거나 실패해도 게임은 그대로 동작해야 합니다(클라이언트 쪽 규칙).
- 에이전트/자동화는 `wrangler login`·`deploy`·`secret`, 대시보드 조작을 하지 않습니다. 배포·비밀키 입력은 사용자가 직접 합니다.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `schema.sql` | D1 테이블·인덱스(spec §19.4.2). 여러 번 실행해도 안전 |
| `src/core.js` | 순수 함수: 상수, 별 계산(`left`에서), 진행 검증·병합·연쇄 검사, 정렬 키, CORS 오리진 검사 |
| `src/worker.js` | 라우팅·D1 사용·CORS·서버 검증. `handle(request, env, opts)` 하나를 Worker와 목 서버가 함께 씀 |
| `dist/worker.js` | 위 파일들 + `../nickname.js`, `../nick-words.js`를 묶은 **단일 파일**(대시보드 붙여넣기용, 커밋 대상). 직접 고치지 않음 |
| `build.js` | `dist/worker.js` 생성 / `--check`로 최신 여부 검사 |
| `mock/server.js` | 계정 없이 쓰는 로컬 서버(Node 내장 `node:sqlite`, 같은 `handle()`) |
| `mock/d1-adapter.js` | `node:sqlite`를 D1 모양(`prepare().bind().first()/all()/run()`, `batch()`)으로 감싼 어댑터 |
| `wrangler.toml` | CLI 배포용 설정. `database_id`는 자리표시자 |
| `.dev.vars.example` | 로컬 시험용 변수 예시(가짜 값). 복사해서 `.dev.vars`로 쓰고 `.dev.vars`는 커밋하지 않음 |
| `tools/print-wordlist.js` | 금칙어 목록을 풀어서 보기(검수용) |
| `tools/encode-word.js` | 목록에 넣을 base64 만들기 |
| `tools/recompute-stars.js` | 별 기준이 바뀐 뒤 기존 행의 별 열을 다시 계산해 UPDATE SQL만 출력(읽기 전용 입력, 아래 "별 기준과 기존 행 다시 계산") |
| `test/*.test.js` | `node:test` 자동 시험. `nick-vectors.js`는 닉네임 시험 벡터 |
| `../nickname.js`, `../nick-words.js` | 닉네임 검증 모듈과 금칙어 목록. **클라이언트와 서버가 같은 파일**을 씀 |

## 로컬 시험 (Cloudflare 계정 불필요, Node 24)

```
cd apps/element-gems
node --test server/test                 # 전체 자동 시험 (개별: node --test server/test/api.test.js)
node server/build.js --check            # dist/worker.js 가 원본과 같은지
node server/build.js                    # 원본을 고친 뒤 dist/worker.js 다시 만들기
node server/mock/server.js              # 목 서버: http://localhost:8787 (메모리 DB)
node server/mock/server.js --port 8790 --db /tmp/eg-mock.sqlite --cache-sec 0
```

목 서버 옵션: `--port`(기본 8787, 환경 변수 `PORT`), `--host`(기본 127.0.0.1), `--db`(파일 경로, 없으면 메모리), `--cache-sec`(순위표 캐시 초, 기본 3 — 실제 Worker는 30), `--origins`(추가 허용 오리진, 쉼표), `--quiet`. 환경 변수 `EXTRA_BLOCK`, `IP_SALT`, `ADMIN_KEY`(시험용 값을 직접 넣었을 때만 `/api/admin/*` 동작).
기본 허용 오리진은 `http://localhost:*`, `http://127.0.0.1:*`(포트만 와일드카드, 로컬 두 주소에 한정). 실제 Worker 설정에는 이 와일드카드를 쓰지 않습니다.

### 장애·시간 흉내 (목 서버에만 있는 `/__mock/*`)
```
curl -X POST localhost:8787/__mock/fail -d '{"mode":"503","count":3}'   # 503 | 500 | html(Error 1027 흉내) | slow(+ms) | hang | off
curl -X POST localhost:8787/__mock/time -d '{"addSec":86400}'            # 서버 시계를 하루 앞으로(닉네임 하루 2회 한도 등)
curl -X POST localhost:8787/__mock/reset                                  # 모든 선수 지우기
curl localhost:8787/__mock/state
```

## API 요약 (자세한 표는 spec §19.4.1)

- 모든 응답은 JSON `{ ok, v:1, ... }`. 오류는 `{ ok:false, v:1, error:{ code, message, field? } }`. **시간 값(`serverTime`, `asOf`, `time`)은 모두 에포크 밀리초**입니다.
- 요청 본문은 `Content-Type: text/plain;charset=UTF-8`의 JSON 문자열(프리플라이트 회피). 서버는 항상 JSON으로 파싱. 본문 최대 2,048바이트(초과 시 413).
- `v`는 필수(현재 1). 모르는 값이면 `unsupported_version`.

| 엔드포인트 | 요청 | 성공 응답 |
|---|---|---|
| `POST /api/sync` | `{ v:1, pid, profile?:{nick,avatar}, d?:{easy:[10],normal:[10],hard:[10]} }` (`d` 값: -1 또는 0 이상 정수 `left`) | `{ ok, v, me:{pub,nick,tag,avatar,hidden,stars:{easy,normal,hard,all}}, changed, nickChangesLeft, serverTime }` |
| `GET /api/leaderboard?board=all\|easy\|normal\|hard&limit=50` | — | `{ ok, v, board, asOf, of, rows:[{rank,nick,tag,avatar,stars}] }` |
| `GET /api/rank?board=…&pub=…` | — | `{ ok, v, board, asOf, rank, of, stars, nick, tag, avatar }` (별 0개면 `rank:null`, 숨김이면 `{ ok, v, board, hidden:1\|2 }`, 없으면 404 `player_not_found`) |
| `POST /api/delete` | `{ v:1, pid }` | `{ ok, v, deleted:true\|false }` (이미 없어도 200) |
| `GET /api/health` | — | `{ ok, v, time }` (DB를 쓰지 않음) |
| `POST /api/admin/moderate`, `GET /api/admin/search?q=` | `Authorization: Bearer <ADMIN_KEY>` | 선택 기능. `ADMIN_KEY`가 없으면 404 |

판단한 점(spec과 다르거나 spec이 정하지 않은 부분):
- `tag`는 정수(0~9999). 화면 표시는 4자리로 채워 `#0427`처럼 만든다.
- `d`에는 `easy/normal/hard` 세 키만 허용(모르는 키·키 누락은 `progress_invalid`). 최상위의 모르는 필드는 무시한다.
- 서버에 없는 `pid`로 `profile` 없이 보내면 `profile_required`(서버가 지워진 경우와 첫 제출을 구분할 수 없음). `player_not_found`는 `/api/rank`와 관리자 API에서 쓴다.
- 닉네임 `hidden=2`(이름 변경 요청)는 같은 이름을 다시 보내도 풀리지 않고, 새 이름이 통과해야 풀린다.
- 서버는 `ALLOWED_ORIGINS`에 없는 `Origin`을 403으로 거부한다(`Origin`이 없는 `curl` 등은 통과). `*` 항목은 무시한다.

## 전체 탭 점수 (난이도 가중, 사용자 승인 2026-11-07)

- 전체 탭 **별 점수** = 초보 별 ×1 + 중수 별 ×2 + 고수 별 ×3 (최대 180). 상수는 `src/core.js`의 `STAR_WEIGHT` 한 곳.
- DB 열 `total_stars`는 이름을 유지하되 **가중 점수**를 저장합니다. `me.stars.all`, `board=all` 목록·`/api/rank`의 `stars`가 가중 점수이고, `me.stars.easy/normal/hard`와 난이도 탭은 별 개수(0~30)입니다.
- 정렬: 점수 → 남은 시간 합계(세 난이도 단순 합) → 먼저 달성 → id.
- 이상치 점검 SQL 예: `SELECT id, nick, tag, total_stars, total_left FROM players WHERE total_stars = 180 AND total_left >= 1300 ORDER BY total_left DESC;` (기준값은 운영하며 조정)

## 별 기준과 기존 행 다시 계산 (spec §44)

- 별은 서버가 진행 기록의 남은 시간(`left`)으로 다시 계산합니다. 기준은 `src/core.js`의 `STAR_RATIO`(기본 ★★ 30% · ★★★ 50%)와 난이도별 덮어쓰기 `STAR_RATIO_BY`(**고수만 ★★ 15% · ★★★ 30%**)이고, 클라이언트 `game.js`의 `CONFIG.stages.star`·`starBy`와 같아야 합니다(`test/core.test.js`가 대조). 시작 시간·`LEFT_CAP`·`STAR_WEIGHT`·API 모양은 그대로입니다.
- 서버는 쓰기 때(기록이 좋아질 때만) 별 열을 계산하므로, 재배포 뒤에도 **기존 행의 `stars_hard`·`total_stars`는 그 사람이 다음에 기록을 개선하기 전까지 옛 값**입니다. 서버 동기화 응답의 "내 별"은 새 기준으로 나오지만 순위 계산은 DB의 `stars_*`·`total_stars` 열을 쓰므로, 기존 고수 행은 기록을 개선하기 전까지 화면의 내 별과 순위표의 별·순위가 어긋날 수 있습니다. 그래서 **서버 재배포 직후 아래 다시 계산을 한 번 돌리기를 권장**합니다. 별은 내려가지 않고 올라가기만 합니다.
- **배포 순서: ① Worker(서버) 먼저 → ② 사이트(GitHub Pages) 나중.** 서버가 먼저 새 기준으로 계산하면 옛 클라이언트가 보낸 `left`도 새 기준으로 매겨져 어긋나는 시간이 없습니다.
- 기존 행 다시 계산(**서버 재배포 직후 한 번 돌리기를 권장**, 운영자가 직접 실행. 도구 자체는 입력 파일을 읽어 SQL 텍스트만 만들고 네트워크·wrangler를 부르지 않습니다):

```
# 1) 서버 재배포 뒤, 행을 JSON으로 내보내기 (숨김 행도 포함하려고 WHERE 없이)
npx wrangler d1 execute element-gems-db --remote --json \
  --command "SELECT id, prog_easy, prog_normal, prog_hard, stars_easy, stars_normal, stars_hard, total_stars FROM players" > rows.json
# 2) 바뀌는 행만 UPDATE 로 만들기 (stderr 에 "바뀐 행 N개 / 전체 M개")
node apps/element-gems/server/tools/recompute-stars.js rows.json --out fix.sql
# 3) fix.sql 을 눈으로 확인한 뒤 적용
npx wrangler d1 execute element-gems-db --remote --file=fix.sql
```

  입력은 행 배열 / `[{ results: [...] }]` / `{ results: [...] }` 모양을 모두 읽습니다. 출력 UPDATE는 `stars_easy·stars_normal·stars_hard·total_stars` 네 열만 바꾸고(`up_*`·`last_write_at`·`hidden`·`left_*` 등은 건드리지 않음), 별 값은 모두 정수로 검사한 숫자만 넣습니다. 검사에 실패한 행(진행 문자열 형식 오류, 숫자·쉼표·`-` 밖의 문자 등)은 건너뛰고 stderr에 알립니다. 각 UPDATE의 `WHERE`에는 `id`와 함께 `AND prog_easy='…' AND prog_normal='…' AND prog_hard='…'`(내보낸 행의 진행 문자열 그대로)가 붙으므로, **내보내기와 적용 사이에 사람이 기록을 올렸다면 조건이 안 맞아 그 행은 자동으로 건너뜁니다**(서버가 이미 새 기준으로 계산했으니 옛 별로 덮어쓰지 않습니다). 그렇게 건너뛴 행이 있을 수 있으므로, 적용 뒤에 같은 순서(내보내기→변환)를 한 번 더 돌려 "바뀐 행 0개"가 나오는지 확인하세요. `rows.json`·`fix.sql`에는 진행 기록이 들어 있으니 커밋하지 않습니다.

## 환경 변수

| 이름 | 종류 | 설명 |
|---|---|---|
| `DB` | D1 바인딩 | 이름은 반드시 `DB` |
| `ALLOWED_ORIGINS` | 일반 변수 | 쉼표 목록, 끝에 `/` 없이. 운영: `https://eversunk2-tech.github.io`. 로컬은 `.dev.vars`에서만 추가 |
| `EXTRA_BLOCK` | 일반 변수(선택) | 긴급 추가 금칙어(쉼표 목록, 서버에만 적용) |
| `IP_SALT` | Secret(선택) | IP 해시 소금. 없으면 날짜만 사용 |
| `ADMIN_KEY` | Secret(선택) | 있을 때만 `/api/admin/*` 동작. 코드에 값 없음 |
| `LB_CACHE_SEC` | 일반 변수(선택) | 순위표 캐시 초(기본 30, 0이면 끔) |

## 비밀 관리

- 운영 비밀은 Worker Secret(대시보드 Settings → Variables and Secrets, 또는 사용자가 직접 `npx wrangler secret put …`)으로만 넣습니다. **저장소에는 값을 쓰지 않습니다.**
- 로컬 시험 비밀은 `server/.dev.vars`(루트 `.gitignore`가 `.dev.vars*`, `.env*`, `.wrangler/`, `node_modules/`를 제외. `.dev.vars.example`만 예외로 커밋).
- 커밋 전 확인: `git grep -nE "ADMIN_KEY|Bearer [A-Za-z0-9]|IP_SALT\s*=" -- . ':!*.md'` (변수 **이름**만 나와야 하고 실제 값은 없어야 함).
- 서버 코드는 `pid`·IP·닉네임을 `console`에 남기지 않습니다(시험으로 확인). DB에는 `pid`의 SHA-256 해시만 저장하고, IP는 저장하지 않습니다(등록 한도용 해시 `SHA256(IP|날짜|IP_SALT)` 앞 16자만).

## 배포 (요약 — 정답은 spec §19.8)

1. D1 만들기(`element-gems-db`) → `schema.sql` 적용(대시보드 Console에 붙여넣기 또는 `npx wrangler d1 execute element-gems-db --remote --file=./schema.sql`)
2. Worker: 대시보드에서 `dist/worker.js` 전체 붙여넣기, 또는 `wrangler.toml`의 `database_id`를 채우고 `npx wrangler deploy`
3. D1 바인딩 이름 `DB`, 일반 변수 `ALLOWED_ORIGINS` 설정
4. `https://…workers.dev/api/health` 확인 → `game.js`의 `CONFIG.ranking.api`에 주소 입력
5. 코드나 금칙어를 고쳤다면 `node server/build.js`로 `dist/worker.js`를 다시 만들고 다시 배포

## 금칙어 목록 사용자 검수 절차

목록은 `../nick-words.js`에 base64로 들어 있습니다(저장소에서 욕설이 그대로 보이지 않게 하려는 것이며 **기밀이 아닙니다**).

1. 보기: `node apps/element-gems/server/tools/print-wordlist.js` (분류별 전체), `--counts`(개수), `--category ko`(한 분류). **출력물은 커밋하지 않습니다.**
2. 분류: `reserved`(사칭 예약어), `pii`(학교·학년·연락처 표현), `contact`(메신저·SNS 이름), `ko`(한국어 금칙어), `en`(영어), `rom`(한국어 욕설을 알파벳으로 쓴 것), `allow`(오탐 방지 예외 — 한글 항목은 개인정보·금칙어 검사에서 먼저 지우고, 영문 항목(`shiitake`, `instant` 등)은 영문 검사에서만 가려 둔다).
3. 항목 앞 기호: `=` 전체 일치만, `*` 글자 그대로 부분 일치, 없음 = 기본 규칙(한글은 소리가 비슷한 변형까지, 영문은 숫자 치환·같은 글자 겹침까지). 규칙 전체는 `../nickname.js` 머리 주석.
4. 추가: `node apps/element-gems/server/tools/encode-word.js "단어" "*부분일치어"` → 나온 base64를 해당 분류 배열에 붙여 넣기.
5. 확인: `node --test apps/element-gems/server/test`(오탐 방지 목록 550여 개와 우회 목록이 함께 시험됨). 오탐이 나오면 `allow`에 단어를 추가하거나 항목을 `=`/`*`로 좁힌다. 2음절 한글 금칙어(기호 없음)는 받침까지 한 번 더 보므로 `별시계`·`불씨`처럼 받침이 다른 정상 말은 풀린다(`../nickname.js` 머리 주석).
6. 반영: `node apps/element-gems/server/build.js` → 서버 재배포 + 클라이언트(`nick-words.js`) 푸시. 긴급하면 서버 변수 `EXTRA_BLOCK`(쉼표 목록)만 바꿔도 서버에는 즉시 적용된다.
7. 목록이 바뀐 뒤 기존 닉네임은 **다음 동기화 때 서버가 다시 검사**해, 걸리면 `hidden=2`(이름 변경 요청)로 바꿉니다.

## 알려진 한계 (자세한 내용은 `test/nick-vectors.js` 머리 주석)

- 자음이 있는 다른 음절을 사이에 끼우는 우회, 새로 생긴 은어·신조어는 못 잡습니다(모음만 있는 음절 끼우기는 막음). 신고→D1 SQL로 숨김(spec §19.4.6)과 목록 갱신으로 보완합니다.
- 실명은 자동으로 구분하지 않습니다(3음절 성+이름은 별명과 구분 불가).
- 소리가 같은 정상 단어가 막히는 오탐이 있을 수 있습니다(보수적 차단). 예: `Scunthor`(cunt), `고등학교`·`플라밍고`(`○○고`로 끝나는 세 글자 이상은 학교 이름으로 봄), `시퍼런`(2음절 금칙어 `시펄`류). 오탐은 `allow`로 풀 수 있습니다.
- 한글을 뒤집어 쓰는 우회는 일반 규칙으로 막지 않습니다(뒤집으면 정상 단어가 되는 금칙어가 있음). 널리 쓰는 몇 개(`=` 전체 일치)만 목록에 있습니다.
- 영문 `1`·대문자 `I`를 `l`로 읽은 뷰(`s1ut`, `hitIer`)가 있어서, 끝에 `1`을 붙인 이름(`Ana1`)이 `anal`로 읽혀 막히는 오탐이 있습니다.
- 서버는 형식·논리적으로 가능한 값만 검증합니다. 그럴듯한 위조 기록(예: 별 점수 180)은 막을 수 없고 사후 대응(숨김·삭제)으로 처리합니다(spec §19.4.4).
- Workers의 CPU 10ms 한도는 로컬에서 실측하지 못했습니다(닉네임 검증은 1회 0.01ms 미만). 배포 후 대시보드 Metrics로 확인하세요.
