# 명예의 전당 서버 (Cloudflare Workers + D1)

별 챔피언 순위표용 서버 코드입니다. 설계의 정답지는 `../spec.md` **§19**(최고점 도전 모드 추가분은 **§46**)이고, 배포 안내서도 spec **§19.8**이 정답입니다. 이 문서는 파일 구성·로컬 시험·API 요약·비밀 관리·금칙어 검수 절차를 정리한 참조용입니다.

- **비밀 정보는 이 폴더에 없습니다.** 공개 저장소에 그대로 올라가도 안전하게 만들었습니다(비밀키·토큰·실제 DB ID 없음).
- 서버가 없거나 실패해도 게임은 그대로 동작해야 합니다(클라이언트 쪽 규칙).
- 에이전트/자동화는 `wrangler login`·`deploy`·`secret`, 대시보드 조작을 하지 않습니다. 배포·비밀키 입력은 사용자가 직접 합니다.

## 파일 구성

| 파일 | 설명 |
|---|---|
| `schema.sql` | **새로 만드는 DB용** D1 테이블·인덱스(spec §19.4.2, 최고점 도전 모드 §46: `best_score` 열과 `idx_rank2_*` 인덱스 4개 포함). 여러 번 실행해도 안전 |
| `migrations/` | **이미 운영 중인 DB**를 최고점 도전 모드용으로 바꾸는 SQL(spec §46.3.2). `migrate-1a-alter.oneline.sql`(열 추가, 한 번만)·`migrate-1b-indexes.oneline.sql`(새 인덱스 4개)·`migrate-3-drop-old-indexes.oneline.sql`(며칠 뒤 옛 인덱스 삭제)는 **주석 없는 한 줄** 파일이라 D1 콘솔에 그대로 붙여 넣는다. `migrate.sql`(읽기용 전체본)·`check.sql`(확인 쿼리)·`ops.sql`(운영 점검, 읽기 전용). 아래 "최고점 도전 모드" 절 참고 |
| `src/core.js` | 순수 함수: 상수(`SCORE_CAP`·`LIMITS` 포함), 별 계산(`left`에서), 진행 검증·병합·연쇄 검사, 최고점 `s` 검증(`validateScore`), 정렬 키, CORS 오리진 검사 |
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
| `test/*.test.js` | `node:test` 자동 시험. `nick-vectors.js`는 닉네임 시험 벡터. `score.test.js`(최고점·정렬·상한·60초 간격)·`migrate.test.js`(마이그레이션)·`compat.test.js`(옛 Worker·옛 클라이언트 호환, 배포 순서) |
| `test/fixtures/` | 호환 시험용 **고정 사본**(고치지 않음, sha256으로 지킴): `worker.old.mjs`(최고점 도전 모드 이전 운영 Worker = 커밋 `ea84476`의 `dist/worker.js`)·`schema.old.sql`(그때의 `schema.sql`) |
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
| `POST /api/sync` | `{ v:1, pid, profile?:{nick,avatar}, d?:{easy:[10],normal:[10],hard:[10]}, s?:최고점 }` (`d` 값: -1 또는 0 이상 정수 `left`, `s`: 0 이상 정수) | `{ ok, v, me:{pub,nick,tag,avatar,hidden,stars:{easy,normal,hard,all},score}, changed, nickChangesLeft, serverTime, scoreRejected? }` |
| `GET /api/leaderboard?board=all\|easy\|normal\|hard&limit=50` | — | `{ ok, v, board, asOf, of, rows:[{rank,nick,tag,avatar,stars,score}] }` (`score` 0 = 도전 기록 없음) |
| `GET /api/rank?board=…&pub=…` | — | `{ ok, v, board, asOf, rank, of, stars, score, nick, tag, avatar }` (별 0개면 `rank:null`, 숨김이면 `{ ok, v, board, hidden:1\|2 }`, 없으면 404 `player_not_found`) |
| `POST /api/delete` | `{ v:1, pid }` | `{ ok, v, deleted:true\|false }` (이미 없어도 200) |
| `GET /api/health` | — | `{ ok, v, time }` (DB를 쓰지 않음) |
| `POST /api/admin/moderate`, `GET /api/admin/search?q=` | `Authorization: Bearer <ADMIN_KEY>` | 선택 기능. `ADMIN_KEY`가 없으면 404. 검색 행은 `{id,pub,nick,tag,stars,score,hidden}` |

판단한 점(spec과 다르거나 spec이 정하지 않은 부분):
- `tag`는 정수(0~9999). 화면 표시는 4자리로 채워 `#0427`처럼 만든다.
- `d`에는 `easy/normal/hard` 세 키만 허용(모르는 키·키 누락은 `progress_invalid`). 최상위의 모르는 필드는 무시한다.
- 서버에 없는 `pid`로 `profile` 없이 보내면 `profile_required`(서버가 지워진 경우와 첫 제출을 구분할 수 없음). `player_not_found`는 `/api/rank`와 관리자 API에서 쓴다.
- 닉네임 `hidden=2`(이름 변경 요청)는 같은 이름을 다시 보내도 풀리지 않고, 새 이름이 통과해야 풀린다.
- 서버는 `ALLOWED_ORIGINS`에 없는 `Origin`을 403으로 거부한다(`Origin`이 없는 `curl` 등은 통과). `*` 항목은 무시한다.
- `s`(최고점)는 선택 필드다. `s`만 있고 `profile`·`d`가 없으면 옛 Worker와 똑같이 400 `bad_request`이므로 클라이언트는 `d`를 항상 함께 보낸다. `s`가 `null`·문자열·소수·음수·`true`·배열이면 400 `progress_invalid`(field `s`). 자세한 규칙은 아래 "최고점 도전 모드" 절.

## 전체 탭 점수 (난이도 가중, 사용자 승인 2026-11-07)

- 전체 탭 **별 점수** = 초보 별 ×1 + 중수 별 ×2 + 고수 별 ×3 (최대 180). 상수는 `src/core.js`의 `STAR_WEIGHT` 한 곳.
- DB 열 `total_stars`는 이름을 유지하되 **가중 점수**를 저장합니다. `me.stars.all`, `board=all` 목록·`/api/rank`의 `stars`가 가중 점수이고, `me.stars.easy/normal/hard`와 난이도 탭은 별 개수(0~30)입니다.
- 정렬: 점수 → **최고점(spec §46, 아래 절)** → 남은 시간 합계(세 난이도 단순 합) → 먼저 달성 → id. 최고점이 모두 0이면 예전과 순서가 똑같다.
- 이상치 점검 SQL 예: `SELECT id, nick, tag, total_stars, total_left FROM players WHERE total_stars = 180 AND total_left >= 1300 ORDER BY total_left DESC;` (기준값은 운영하며 조정)

## 최고점 도전 모드 (spec §46, 사용자 승인 2026-11-11)

2분 점수 도전 모드의 최고점을 순위의 동점 규칙에 쓴다. 서버가 새로 저장하는 값은 **정수 하나(`players.best_score`)** 뿐이고, 개인정보가 아니다. 서버 예외 범위(명예의 전당 순위의 정렬 키) 안이며, 점수만의 별도 순위표·기간별 순위는 범위 밖이라 넣지 않았다.

### 정렬 규칙 (네 탭 모두: 전체·초보·중수·고수)
**별(전체 탭은 별 점수) 내림차순 → 최고점 내림차순 → 남은 시간 합계 내림차순 → 먼저 달성(`up_*` 오름차순) → id 오름차순.** 최고점이 0(도전 기록 없음)인 사람끼리는 옛 규칙(남은 시간 → 먼저 달성 → id)과 순서가 같다. 별이 0개인 사람은 점수가 높아도 순위에 나오지 않는다(점수는 별이 같을 때의 동점 규칙일 뿐). `up_*`(순위 키가 마지막으로 오른 시각)의 의미는 "별·최고점·남은 시간 중 하나라도 오른 시각"으로 넓어졌고, 최고점이 오르는 요청은 네 `up_*`를 모두 현재 시각으로 갱신한다. 내 순위(`/api/rank`)는 나보다 앞선 사람 수 + 1이며 다섯 단계 부분 질의의 합이다(별 → 최고점 → 남은 시간 → 달성 시각 → id).

### `s`(최고점) 규칙 — `src/core.js`의 `SCORE_CAP`·`LIMITS`·`validateScore`
| 항목 | 규칙 |
|---|---|
| 형식 | 0 이상의 정수. 아니면(음수·소수·문자열·`null`·`true`·배열·객체) 400 `progress_invalid`, field `s`. 이때 `d`·프로필도 저장하지 않는다 |
| 상한 | `SCORE_CAP` = **280,000**(클라이언트 `CONFIG.challenge.scoreCap`과 같아야 하며 `test/core.test.js`가 대조한다). 상한을 넘는 정수는 **그 값만 무시**하고 나머지(`d`·프로필)는 정상 처리하며 응답에 `scoreRejected: true`를 싣는다 |
| 병합 | `best_score = max(저장값, s)`(감소 불가, 오프라인 재전송·두 기기에 안전). 오르지 않으면 쓰기 없음(`changed:false`, 읽기 1회). UPDATE 문도 `best_score=MAX(best_score, ?)`로 병합하므로, 같은 pid의 두 요청이 읽기와 쓰기 사이에 겹쳐도(예: 저장값 1000에서 `s:9000`과 `s:8000`이 동시에 도착) 낮은 점수가 높은 점수를 덮지 못한다(시험으로 재현·확인). 단 이때 낮은 쪽 요청의 응답 `me.score`는 그 요청이 읽은 값 기준이라 저장값보다 낮게 보일 수 있다 |
| 쓰기 간격 | 최고점이 **오르는** 요청은 마지막 쓰기로부터 **60초 이상**(`LIMITS.scoreWriteIntervalSec`), 아니면 429 `rate_limited` + `Retry-After`(남은 초). 진행·프로필만 바뀌는 요청은 기존 3초 규칙 그대로. `d`와 `s`가 같이 오르는 요청이 60초 전이면 `d`도 저장되지 않는다(클라이언트가 나중에 같은 내용을 다시 보낸다) |
| 응답 | `me.score`(저장된 최고점, 도전 기록이 없으면 0), 순위표 행 `score`, `/api/rank`의 `score`, 관리자 검색 행 `score` |
| 호환 | `API_VERSION`은 1 그대로, 새 오류 코드 없음. 옛 클라이언트(`s` 없음)는 점수에 영향을 주지 않는다. 새 클라이언트가 옛 Worker를 만나도 `d`가 항상 함께 가므로 400이 없고, 응답에 `me.score`가 없으니 다음에 다시 보낸다 |

겹침 한계: 최고점(`best_score`)과 달리 진행(`prog_*`)·별·남은 시간 열은 Worker가 읽은 값으로 병합한 절댓값을 쓰므로, 같은 pid의 두 요청이 읽기와 쓰기 사이에 겹치면 뒤에 쓴 요청이 앞 요청의 진행 일부를 덮을 수 있다(최고점 도전 모드 이전부터 있던 한계로, 한 기기는 요청을 한 줄로 보내고 쓰기 간격 규칙이 있어 드물다. 클라이언트가 다음 제출에서 자기 기록 전체를 최댓값 병합으로 다시 보내므로 보통 곧 복구되지만 이 작업에서 실제 클라이언트로 확인하지는 못했다).

위조 한계: 서버는 점수를 재현·검증하지 못한다. 허용하는 위험은 "같은 별 수 묶음 안에서의 최고점 위조"이며, 상한·사후 점검 SQL(`migrations/ops.sql`)·숨김으로 대응한다. **점수만 0으로 되돌리는 조치는 소용없다**(위조자 기기에 값이 남아 있어 다음 제출에서 최댓값 병합으로 되돌아온다) — 위조가 의심되면 `UPDATE players SET hidden = 1 WHERE id = ?`(spec §19.4.6)로 숨긴다. 점수 규칙·시간·프리셋을 바꾸면 상한을 새로 재고(새 Plan·승인), 서버 `SCORE_CAP`과 `CONFIG.challenge.scoreCap`을 함께 바꿔 Worker를 재배포하고 `UPDATE players SET best_score = 0`으로 점수를 초기화해야 한다. 환경 변수·비밀키는 **변하지 않는다**(`ALLOWED_ORIGINS` 등 기존 그대로).

### 무료 한도 (spec §46.3.6, §19.4.7 표를 갱신)
확인한 무료 한도는 §19.4.7이 2026-11-07 문서에서 확인한 값이다(이번 작업에서 문서를 다시 열어 확인하지 못했다): Workers 100,000 요청/일, D1 읽은 행 5,000,000/일, 쓴 행 100,000/일(인덱스 갱신 포함으로 센다고 보수적으로 가정). 최고점이 오르는 제출 1회 = 표 1행 + 갱신되는 부분 인덱스 4행 = **5행**(보수적), 최악 가정(인덱스 갱신을 삭제+삽입 2행씩) **9행**. 그 밖의 가정은 §19.4.7 그대로(첫 날 최대 500명, 스테이지 제출 6회/인, 조회 6회/인, 생성 500, 변경 100). 한도 초과 시 `db_unavailable` 503, 클라이언트는 점수를 이 기기에 두고 백오프로 재시도하며 게임은 영향 없음. **마이그레이션 ①-2 뒤 ④ 전까지(옛 인덱스 4개와 새 인덱스 4개가 함께 있는 며칠)는 점수가 오르는 쓰기 1회가 인덱스 8개를 모두 갱신하므로 5행이 아니라 최대 9행(표 1행 + 인덱스 8행)에 가깝다** — 표의 "최악 9행" 열이 이 경우를 덮고(묶음 기준 500명 46%·1,000명 91%), ④로 옛 인덱스를 지우면 5행으로 돌아간다. 이 기간에는 사용량(D1 Metrics)을 평소보다 자주 본다.

| 인원 | 사람당 하루 최고점 개선 | 제출 방식(하루 제출 횟수) | 요청/일 | 쓴 행/일, 새 제출 5행(한도 대비) | 쓴 행/일, 최악 9행 가정(한도 대비) | 읽은 행/일 |
|---|---|---|---|---|---|---|
| 500 | 5 | 묶지 않음 (5) | 12,650 (13%) | 25,900 (26%) | 54,500 (55%) | 847,500 (17%) |
| 500 | 5 | 묶음(최대 3회) (3) | 11,550 (12%) | 20,900 (21%) | 45,500 (46%) | 846,500 (17%) |
| 500 | 10 | 묶지 않음 (10) | 15,400 (15%) | 38,400 (38%) | 77,000 (77%) | 850,000 (17%) |
| 500 | 10 | 묶음(최대 3회) (3) | 11,550 (12%) | 20,900 (21%) | 45,500 (46%) | 846,500 (17%) |
| 500 | 20 | 묶지 않음 (20) | 20,900 (21%) | 63,400 (63%) | 122,000 (122%) | 855,000 (17%) |
| 500 | 20 | 묶음(최대 3회) (3) | 11,550 (12%) | 20,900 (21%) | 45,500 (46%) | 846,500 (17%) |
| 1000 | 5 | 묶지 않음 (5) | 25,300 (25%) | 51,800 (52%) | 109,000 (109%) | 2,895,000 (58%) |
| 1000 | 5 | 묶음(최대 3회) (3) | 23,100 (23%) | 41,800 (42%) | 91,000 (91%) | 2,893,000 (58%) |
| 1000 | 10 | 묶지 않음 (10) | 30,800 (31%) | 76,800 (77%) | 154,000 (154%) | 2,900,000 (58%) |
| 1000 | 10 | 묶음(최대 3회) (3) | 23,100 (23%) | 41,800 (42%) | 91,000 (91%) | 2,893,000 (58%) |
| 1000 | 20 | 묶지 않음 (20) | 41,800 (42%) | 126,800 (127%) | 244,000 (244%) | 2,910,000 (58%) |
| 1000 | 20 | 묶음(최대 3회) (3) | 23,100 (23%) | 41,800 (42%) | 91,000 (91%) | 2,893,000 (58%) |

한도에 닿는 인원(안전계수 없음 → 2배): 묶지 않음 k=10: 요청 3246명, 쓴 행(5행) 1302명, 쓴 행(9행) 649명, 읽은 행 1342명 → 안전계수 2배 = 651명(5행)·324명(9행). 묶지 않음 k=20: 요청 2392명, 쓴 행(5행) 788명, 쓴 행(9행) 409명, 읽은 행 1341명 → 394명(5행)·204명(9행). **묶음 k=3: 요청 4329명, 쓴 행(5행) 2392명, 쓴 행(9행) 1098명, 읽은 행 1344명 → 672명(5행)·549명(9행).** (참고) 최고점 제출이 없을 때(§19.4.7 그대로): 요청 5050, 쓴 행 3731, 읽은 행 1344.

악용 한 사람이 하루에 쓸 수 있는 최대(점수를 계속 +1씩 올려 보냄): 쓰기 간격 3초(기존 규칙만) 28,800회 → 쓴 행 144,000(144%)·259,200(259%) / **점수 개선 쓰기 간격 60초(이 구현) 1,440회 → 7,200(7%)·12,960(13%)**.

해석: 읽은 행은 거의 늘지 않아 병목은 §19.4.7과 같이 읽기(500명 17%, 1,000명 58%)이고 약 1,340명에서 한도에 닿는다(안전계수 2배 ≈ 670명). 쓰기는 제출을 묶지 않으면 위험하다(500명이 하루 20번씩 개선하면 최악 9행 가정에서 한도 초과) — 그래서 클라이언트의 묶어서 제출(마지막 개선 5분 뒤 또는 도전을 나갈 때·탭이 숨겨질 때)과 서버의 60초 간격이 이 설계의 일부다. 지금 규모(수십~수백 명)에서는 한도 걱정이 거의 없다. 사용량은 대시보드 D1 Metrics로 본다. 인덱스 갱신이 D1 "쓴 행"으로 정확히 몇 행으로 세어지는지는 확인하지 못했다(5행·9행 두 가정).

### 배포 순서와 D1 콘솔 절차 (spec §46.3.7 — **사용자가 직접**, 에이전트는 `wrangler`·대시보드 조작을 하지 않는다)
사전 준비: 현재 배포된 Worker 코드를 백업해 둔다(롤백용). 최고점 도전 모드 이전의 번들은 저장소의 `git show ea84476:apps/element-gems/server/dist/worker.js`(= `test/fixtures/worker.old.mjs`, sha256 `d33629ed…`)이다 — 실제 배포 때 붙여 넣은 코드와 같은지는 이 작업에서 확인하지 못했으니 대시보드 Edit code에 있는 현재 코드를 복사해 두는 편이 가장 확실하다. 새 번들은 `node apps/element-gems/server/build.js --check`로 최신인지 확인한다.

| 순서 | 어디서 | 할 일 | 확인 |
|---|---|---|---|
| **① D1** | 대시보드 → D1 SQL database → `element-gems-db` → Console | 아래 "①의 세부 단계"(①-0 → ①-1 → ①-2)를 순서대로. **쿼리는 한 번에 하나만** 붙여 넣고 Execute | 세부 단계 표의 "정상 결과" 칸과 같음 |
| **② Worker** | 대시보드 → Workers & Pages → `element-gems-ranking` → Edit code | 기존 코드를 지우고 새 `dist/worker.js` 전체를 붙여 넣고 Deploy | 브라우저에서 `…/api/health`가 `ok`, `…/api/leaderboard?board=all`의 행에 `score` 키가 보임 |
| **③ 사이트** | 메인 세션이 푸시(GitHub Pages) — 푸시 전에 사용자에게 확인 | 푸시 → Pages 빌드 확인 → 핵심 파일 200·새 문구 확인(10분 캐시 → 강력 새로고침) | 도전 한 판 → 기록 → 나가기 → 명예의 전당에 최고점 표시 |
| **④ 정리(며칠 뒤)** | D1 Console | 문제가 없을 때만: 먼저 아래 ④ 확인 쿼리로 새 인덱스 4개가 있는지 본 뒤, `migrate-3-drop-old-indexes.oneline.sql` 한 줄 전체를 붙여 넣고 Execute(옛 인덱스 4개 삭제) | 아래 "④의 세부 단계"의 "정상 결과" 칸과 같음 |

**①의 세부 단계** (D1 Console에서 위에서 아래로 한 줄씩. 붙여 넣는 글은 아래 칸의 SQL 또는 `migrations/`의 한 줄 파일 전체이며, 확인 쿼리는 `migrations/check.sql`과 글자가 같다)

| 단계 | 하는 일 | 붙여 넣을 것 | 정상 결과 |
|---|---|---|---|
| ①-0 | 실행 전 확인: `best_score` 열이 **아직 없는지** | `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'players';` | 나온 글(표 정의) 안에 `best_score`가 **없다**. 이미 있으면 ①-1은 건너뛰고(①-1은 한 번만) ①-1 확인으로 간다 |
| ①-1 | 열 추가 (**한 번만**) | `migrate-1a-alter.oneline.sql` 파일의 한 줄 전체 | 오류 없이 끝남. **`duplicate column name: best_score` 오류가 나면 이미 열이 있다는 뜻이라 데이터에 해가 없다.** 다시 하지 말고 그대로 ①-1 확인으로 넘어가면 된다 |
| ①-1 확인 | 열이 생겼고 모두 0점인지 | `SELECT COUNT(*) AS 전체, SUM(best_score > 0) AS 점수있는사람, MAX(best_score) AS 최고점 FROM players;` | `점수있는사람` 0, `최고점` 0 (선수가 한 명도 없으면 0 대신 빈 칸으로 보일 수 있다). 열이 없으면 `no such column: best_score` 오류 |
| ①-2 | 새 인덱스 4개 (여러 번 해도 안전) | `migrate-1b-indexes.oneline.sql` 파일의 한 줄 전체(문장 4개가 한 줄에 들어 있다) | 오류 없이 끝남 |
| ①-2 확인 | 인덱스가 늘었는지 | `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_rank%' ORDER BY name;` | **8행**: 옛 `idx_rank_all`·`idx_rank_easy`·`idx_rank_normal`·`idx_rank_hard` 4개 + 새 `idx_rank2_all`·`idx_rank2_easy`·`idx_rank2_normal`·`idx_rank2_hard` 4개 |
| ①-2 확인 (선택) | 순위가 안 바뀌었는지 | `SELECT nick, tag, total_stars, best_score, total_left FROM players WHERE hidden = 0 AND total_stars > 0 ORDER BY total_stars DESC, best_score DESC, total_left DESC, up_all ASC, id ASC LIMIT 5;` | 모두 0점이라 마이그레이션 전 순위표 위쪽 5명과 같은 순서 |

**②의 확인 (선택, 사이트에서 누군가 도전 모드를 한 뒤)**: 점수가 서버에 올라갔는지 `SELECT COUNT(*) AS 점수있는사람 FROM players WHERE best_score > 0;` (점수 있는 사람 수), `SELECT id, nick, tag, total_stars, best_score, datetime(last_write_at, 'unixepoch', '+9 hours') AS 마지막쓰기 FROM players WHERE best_score > 0 ORDER BY best_score DESC LIMIT 10;` (점수 상위 10명).

**④의 세부 단계** (며칠 문제가 없을 때만)

| 단계 | 하는 일 | 붙여 넣을 것 | 정상 결과 |
|---|---|---|---|
| ④-0 | 지워도 되는지 확인: 새 인덱스 4개가 있는지 | `SELECT COUNT(*) AS 새_인덱스 FROM sqlite_master WHERE type = 'index' AND name IN ('idx_rank2_all', 'idx_rank2_easy', 'idx_rank2_normal', 'idx_rank2_hard');` | `새_인덱스` **4** (4가 아니면 ①-2를 다시 하고 ④는 미룬다) |
| ④-1 | 옛 인덱스 4개 삭제 | `migrate-3-drop-old-indexes.oneline.sql` 파일의 한 줄 전체 | 오류 없이 끝남 (여러 번 해도 안전) |
| ④-1 확인 | 새 인덱스만 남았는지 | `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_rank%' ORDER BY name;` | **4행**: `idx_rank2_all`·`idx_rank2_easy`·`idx_rank2_normal`·`idx_rank2_hard` |

**무엇을 복사하나**: 마이그레이션은 `*.oneline.sql` 파일의 내용 **한 줄 전체**(주석이 없다)를 복사한다. 확인 쿼리는 `check.sql`(또는 위 표)에서 **`SELECT`로 시작하는 줄 하나만** 복사한다 — `--`로 시작하는 줄은 설명이므로 복사하지 않고, `migrate.sql`·`ops.sql` 같은 읽기용 파일은 통째로 붙여 넣지 않는다. 한 번에 쿼리 하나씩 붙여 넣고 Execute한 뒤 결과를 보고 다음으로 간다. 이유: 콘솔이 줄바꿈을 지워 `-- 설명 SELECT …`가 통째로 주석이 되어 뒤의 문장을 삼킨 전례가 있다(한 줄 파일에 `--`가 없는지는 시험이 확인한다. 콘솔이 지금도 그런지는 D1에서 이번에 다시 확인하지 못했다).

- **순서를 어기면**: ② 먼저(①을 하기 전에 새 Worker를 올림, 열이 없음): `/api/sync`의 쓰기와 순위표·내 순위가 500 `server_error`(변경 없는 제출과 `/api/health`는 통과), **게임·로컬 기록은 정상이고 데이터 손실 없음** — ①을 하면 바로 복구(`test/compat.test.js`가 확인). ③ 먼저(사이트가 Worker보다 먼저): 새 클라이언트가 `s`를 보내도 옛 Worker는 무시하고 `d`는 정상 처리(나중에 다시 보냄), 순위표 문구만 새 것이고 서버 정렬은 옛 것인 짧은 불일치. ①만 하고 ②를 안 한 상태는 옛 Worker가 새 열을 무시하며 정상 동작한다.
- **되돌리기(롤백)**: 사이트는 해당 커밋을 `git revert` 후 푸시, Worker는 백업한 이전 `dist/worker.js`를 Edit code로 되돌려 붙여 넣는다. **마이그레이션된 DB에서도 옛 Worker는 정상 동작**한다(새 열 무시, 옛 인덱스가 남아 있는 동안은 빠르고, 지운 뒤에도 정렬 단계만 생길 뿐 결과는 맞다; 단 옛 Worker는 최고점을 모르므로 순위 순서에서 점수를 무시한다). 열·인덱스는 그대로 둬도 무해하다(`DROP COLUMN`은 인덱스를 먼저 지워야 하고 D1에서의 지원은 확인하지 못했다).
- ①-0 전에 D1 백업이 필요한지는 판단 불가(이 작업은 열 추가·인덱스 생성뿐이라 데이터를 지우지 않는다). 새 `schema.sql`을 옛 DB에 다시 붙여도 `CREATE INDEX … best_score`가 "no such column"으로 **안전하게 실패**한다(테이블은 건드리지 않음, 시험으로 확인).
- **D1 콘솔에서 이 SQL을 직접 실행해 보지는 못했다**: 로컬 SQLite 3.53.4(Node 24 `node:sqlite`)에서만 검증했다. D1이 `ALTER TABLE ADD COLUMN`·`CREATE INDEX IF NOT EXISTS`·`DROP INDEX IF EXISTS`를 지원한다는 문서 내용과 콘솔의 한 줄 다중 문장 동작은 이 작업에서 다시 확인하지 못했다.

### 운영 점검 SQL (`migrations/ops.sql`, 읽기 전용 — D1 콘솔에서 한 번에 하나씩)
- 점검선 120,000점 이상(사람이 닿기 어려운 값, 점수 측정에서 사람이 닿을 만한 가장 빠른 봇의 최댓값 119,385을 올림): `SELECT id, nick, tag, total_stars, best_score, datetime(last_write_at, 'unixepoch', '+9 hours') AS 마지막쓰기 FROM players WHERE best_score >= 120000 ORDER BY best_score DESC LIMIT 20;`
- 별이 거의 없는데 점수만 높은 사람(위조 후보), 점수가 똑같은 사람 3명 이상(복사 후보), 점수 구간별 사람 수: `ops.sql` 2)~4).
- 조치(spec §19.4.6): 순위에서 숨기기 `UPDATE players SET hidden = 1 WHERE id = ?` / 이름 바꾸게 하기 `hidden = 2` / 복구 `hidden = 0`. **점수만 0으로 되돌리는 것은 소용없다.**
- `tools/recompute-stars.js`·`tools/seed-hall.js`는 영향이 없다(별 열만 갱신 / 라이벌은 점수 0).

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

1. D1 만들기(`element-gems-db`) → `schema.sql` 적용(대시보드 Console에 붙여넣기 또는 `npx wrangler d1 execute element-gems-db --remote --file=./schema.sql`). **이미 운영 중인 DB**는 `schema.sql` 대신 위 "최고점 도전 모드" 절의 `migrations/` 한 줄 SQL을 쓴다(순서: DB → Worker → 사이트)
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
- 서버는 형식·논리적으로 가능한 값만 검증합니다. 그럴듯한 위조 기록(예: 별 점수 180, 상한 이하의 최고점)은 막을 수 없고 사후 대응(숨김·삭제)으로 처리합니다(spec §19.4.4, 최고점은 §46.3.5).
- Workers의 CPU 10ms 한도는 로컬에서 실측하지 못했습니다(닉네임 검증은 1회 0.01ms 미만). 배포 후 대시보드 Metrics로 확인하세요.
