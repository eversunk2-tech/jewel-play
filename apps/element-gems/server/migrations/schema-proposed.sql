-- element-gems 명예의 전당 D1 스키마 (spec §19.4.2)
-- 여러 번 실행해도 안전합니다(IF NOT EXISTS). D1 대시보드 Console에 전체를 붙여넣고 Execute 하세요.

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pid_hash      TEXT    NOT NULL UNIQUE,            -- SHA-256(playerId) 16진수. 원본 ID는 저장하지 않음
  pub           TEXT    NOT NULL UNIQUE,            -- 공개용 무작위 8자(순위 조회용). 순위표 응답엔 없음
  nick          TEXT    NOT NULL,                   -- 표시용(대소문자 유지)
  nick_key      TEXT    NOT NULL,                   -- 소문자 정규화(중복·검색용)
  tag           INTEGER NOT NULL CHECK (tag BETWEEN 0 AND 9999),
  avatar        INTEGER NOT NULL CHECK (avatar BETWEEN 1 AND 16),
  -- 난이도별 스테이지 최고 남은 시간(정수 초, 미클리어 -1) 10개를 쉼표로: "65,40,-1,-1,..."
  prog_easy     TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  prog_normal   TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  prog_hard     TEXT    NOT NULL DEFAULT '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  stars_easy    INTEGER NOT NULL DEFAULT 0, stars_normal INTEGER NOT NULL DEFAULT 0, stars_hard INTEGER NOT NULL DEFAULT 0,
  left_easy     INTEGER NOT NULL DEFAULT 0, left_normal  INTEGER NOT NULL DEFAULT 0, left_hard  INTEGER NOT NULL DEFAULT 0,
  best_easy     INTEGER NOT NULL DEFAULT 0, best_normal  INTEGER NOT NULL DEFAULT 0, best_hard  INTEGER NOT NULL DEFAULT 0,  -- 최고 클리어 레벨 0~10
  total_stars   INTEGER NOT NULL DEFAULT 0,         -- 전체 탭 '별 점수' = 초보 별x1 + 중수 별x2 + 고수 별x3 (최대 180, 정렬 키). 열 이름은 total_stars 유지
  total_left    INTEGER NOT NULL DEFAULT 0,         -- 남은 시간 합계: 세 난이도 단순 합(가중 없음)
  best_score    INTEGER NOT NULL DEFAULT 0,         -- 최고점 도전 모드 최고 점수(정수, 기록 선호 순서: 별 -> 최고점 -> 남은 시간 합계 -> 먼저 달성 -> id)
  up_all        INTEGER NOT NULL DEFAULT 0,         -- 순위 점수가 마지막으로 오른 시각(초, epoch) - 동점 선착순
  up_easy       INTEGER NOT NULL DEFAULT 0, up_normal INTEGER NOT NULL DEFAULT 0, up_hard INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1,2)),   -- 0 보임 / 1 관리자 숨김 / 2 이름 변경 요청(순위 제외)
  nick_changes  INTEGER NOT NULL DEFAULT 0,         -- 오늘 닉네임 변경 횟수
  nick_day      INTEGER NOT NULL DEFAULT 0,         -- 위 횟수가 속한 한국 시간 날짜 번호
  created_at    INTEGER NOT NULL,
  last_write_at INTEGER NOT NULL,                   -- 마지막 쓰기(제출 간격 제한용)
  UNIQUE (nick_key, tag)
);

-- 순위 조회용 부분 인덱스(숨김·별 0개 제외). 정렬 키와 같은 순서(별, 최고점, 남은 시간, 달성 시각, id) -> ORDER BY가 인덱스를 그대로 사용
CREATE INDEX IF NOT EXISTS idx_rank2_all ON players (total_stars DESC, best_score DESC, total_left DESC, up_all ASC, id ASC) WHERE hidden = 0 AND total_stars > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_easy ON players (stars_easy DESC, best_score DESC, left_easy DESC, up_easy ASC, id ASC) WHERE hidden = 0 AND stars_easy > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_normal ON players (stars_normal DESC, best_score DESC, left_normal DESC, up_normal ASC, id ASC) WHERE hidden = 0 AND stars_normal > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_hard ON players (stars_hard DESC, best_score DESC, left_hard DESC, up_hard ASC, id ASC) WHERE hidden = 0 AND stars_hard > 0;

-- 등록(프로필 생성) 한도·관리자 실패 횟수용: 이름 + 시간 창. 원본 IP는 저장하지 않음(IP 해시만). 오래된 행은 가끔 DELETE
CREATE TABLE IF NOT EXISTS rate_limits ( k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL );
