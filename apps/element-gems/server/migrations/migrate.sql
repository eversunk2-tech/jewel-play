-- ============================================================================
-- 최고점 도전 모드: D1 마이그레이션 (spec §46.3.2, 사용자 승인 2026-11-11). 이미 운영 중인 DB 전용 — 새 DB 는 ../schema.sql 하나면 됩니다.
-- 이 파일은 "읽기용 전체본"입니다. D1 대시보드 Console 에 붙여넣을 때는 주석(--)이 없는
-- 한 줄 파일(migrate-1a-alter.oneline.sql, migrate-1b-indexes.oneline.sql, migrate-3-drop-old-indexes.oneline.sql)을 쓰세요.
-- (Console 은 줄바꿈이 사라져 -- 주석이 뒤의 문장을 삼킨 적이 있습니다.) 순서의 자세한 설명과 롤백은 ../README.md 의 "최고점 도전 모드" 절 "배포 순서와 D1 콘솔 절차" 에 있습니다.
-- 순서: ① 이 파일의 1a -> 확인 -> 1b -> 확인 -> ② Worker 배포 -> ③ 사이트 푸시 -> ④ (며칠 뒤, 문제없을 때) 3
-- ============================================================================

-- ---- 1a. 열 추가 (한 번만! 두 번째 실행은 "duplicate column name: best_score" 오류) ----
-- 기존 행은 모두 0점이 됩니다. 쓴 행은 0(표를 다시 쓰지 않음).
ALTER TABLE players ADD COLUMN best_score INTEGER NOT NULL DEFAULT 0;

-- ---- 1b. 새 순위 인덱스 4개 (IF NOT EXISTS 라 여러 번 실행해도 안전) ----
-- 정렬 키: 별 -> 최고점 -> 남은 시간 합계 -> 먼저 달성 -> id. 옛 인덱스(idx_rank_*)는 건드리지 않습니다(옛 Worker 로 되돌릴 때 필요).
CREATE INDEX IF NOT EXISTS idx_rank2_all ON players (total_stars DESC, best_score DESC, total_left DESC, up_all ASC, id ASC) WHERE hidden = 0 AND total_stars > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_easy ON players (stars_easy DESC, best_score DESC, left_easy DESC, up_easy ASC, id ASC) WHERE hidden = 0 AND stars_easy > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_normal ON players (stars_normal DESC, best_score DESC, left_normal DESC, up_normal ASC, id ASC) WHERE hidden = 0 AND stars_normal > 0;
CREATE INDEX IF NOT EXISTS idx_rank2_hard ON players (stars_hard DESC, best_score DESC, left_hard DESC, up_hard ASC, id ASC) WHERE hidden = 0 AND stars_hard > 0;

-- ---- 3. 정리: 옛 인덱스 4개 삭제 (새 Worker·새 사이트가 며칠 문제없이 돌아간 뒤에만) ----
-- 지우면 옛 Worker 로 되돌려도 동작은 하지만(결과는 맞고 정렬 단계만 생김) 쓰기 비용이 줄어듭니다(인덱스 8개 -> 4개).
DROP INDEX IF EXISTS idx_rank_all;
DROP INDEX IF EXISTS idx_rank_easy;
DROP INDEX IF EXISTS idx_rank_normal;
DROP INDEX IF EXISTS idx_rank_hard;
