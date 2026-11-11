-- ============================================================================
-- 최고점 도전 모드: D1 Console 확인 쿼리 (한 번에 하나씩 실행하세요. 여러 문장을 한꺼번에 붙이면 마지막 결과만 보일 수 있습니다 — D1 에서 직접 해 보지 못함)
-- ============================================================================

-- [마이그레이션 전] 열이 이미 있는지 (ALTER 를 두 번 하지 않기 위해). best_score 가 안 보이면 아직 안 한 것.
SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'players';

-- [1a 직후] 열이 생겼고 전원 0점인지. 점수있는사람 = 0, 최고점 = 0 이어야 합니다. (열이 없으면 "no such column: best_score" 오류)
SELECT COUNT(*) AS 전체, SUM(best_score > 0) AS 점수있는사람, MAX(best_score) AS 최고점 FROM players;

-- [1b 직후] 인덱스 확인. idx_rank_* 4개(옛) + idx_rank2_* 4개(새) = 8행이어야 합니다.
SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_rank%' ORDER BY name;

-- [1b 직후] 상위 5명이 마이그레이션 전과 같은지(전원 0점이라 새 정렬 = 옛 정렬)
SELECT nick, tag, total_stars, best_score, total_left FROM players WHERE hidden = 0 AND total_stars > 0 ORDER BY total_stars DESC, best_score DESC, total_left DESC, up_all ASC, id ASC LIMIT 5;

-- [② Worker 배포 뒤] 누군가 도전 모드를 하고 서버에 올라갔는지: 점수 있는 사람 수와 상위 10명
SELECT COUNT(*) AS 점수있는사람 FROM players WHERE best_score > 0;
SELECT id, nick, tag, total_stars, best_score, datetime(last_write_at, 'unixepoch', '+9 hours') AS 마지막쓰기 FROM players WHERE best_score > 0 ORDER BY best_score DESC LIMIT 10;

-- [③ 사이트 푸시 뒤] 점수 분포 대강 보기(구간별 사람 수)
SELECT CASE WHEN best_score = 0 THEN '0 (미도전)' WHEN best_score < 20000 THEN '1~19,999' WHEN best_score < 40000 THEN '20,000~39,999' WHEN best_score < 60000 THEN '40,000~59,999' WHEN best_score < 100000 THEN '60,000~99,999' ELSE '100,000 이상(점검)' END AS 구간, COUNT(*) AS 사람수 FROM players GROUP BY 1 ORDER BY MIN(best_score);

-- [④ 정리 전] 옛 인덱스를 지워도 되는지 확인: 새 인덱스 4개가 있어야 합니다.
SELECT COUNT(*) AS 새_인덱스 FROM sqlite_master WHERE type = 'index' AND name IN ('idx_rank2_all', 'idx_rank2_easy', 'idx_rank2_normal', 'idx_rank2_hard');
