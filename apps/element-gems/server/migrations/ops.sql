-- ============================================================================
-- 최고점 도전 모드: 운영 점검 SQL (D1 Console, 읽기 전용 — 한 번에 하나씩 실행). spec §46.3.5
-- 점검선 120,000 = 점수 측정(3,000판)에서 사람이 닿을 만한 가장 빠른 봇(X3)의 최댓값을 올린 값. 점수 규칙·프리셋이 바뀌면 다시 잰다.
-- ============================================================================

-- 1) 점검선 이상(사람이 닿기 어려운 값): 누가, 별 몇 개, 언제 마지막으로 올렸는지
SELECT id, nick, tag, total_stars, best_score, datetime(last_write_at, 'unixepoch', '+9 hours') AS 마지막쓰기 FROM players WHERE best_score >= 120000 ORDER BY best_score DESC LIMIT 20;

-- 2) 별이 거의 없는데 점수만 높은 사람(위조 후보)
SELECT id, nick, tag, total_stars, best_score FROM players WHERE best_score >= 120000 AND total_stars < 10 ORDER BY best_score DESC;

-- 3) 점수가 똑같은 사람이 3명 이상(복사 후보)
SELECT best_score, COUNT(*) AS 사람수 FROM players WHERE best_score > 0 GROUP BY best_score HAVING COUNT(*) >= 3 ORDER BY 사람수 DESC LIMIT 20;

-- 4) 점수 구간별 사람 수
SELECT CASE WHEN best_score = 0 THEN '0 (미도전)' WHEN best_score < 20000 THEN '1~19,999' WHEN best_score < 40000 THEN '20,000~39,999' WHEN best_score < 60000 THEN '40,000~59,999' WHEN best_score < 100000 THEN '60,000~99,999' ELSE '100,000 이상' END AS 구간, COUNT(*) AS 사람수 FROM players GROUP BY 1 ORDER BY MIN(best_score);

-- 조치(spec §19.4.6): 순위에서 숨기기 / 이름 바꾸게 하기 / 복구 — 점수만 0으로 되돌리는 것은 소용없음(기기에 남은 값이 다음 제출에서 최댓값 병합으로 되돌아옴)
-- UPDATE players SET hidden = 1 WHERE id = ?;
-- UPDATE players SET hidden = 2 WHERE id = ?;
-- UPDATE players SET hidden = 0 WHERE id = ?;

-- 점수 규칙을 바꾼 뒤에만(전원 초기화, Worker 상한도 함께 바꾸고 새 승인을 받은 경우): 
-- UPDATE players SET best_score = 0;
