# 일반용 변경을 교육용에 반영하는 절차 (spec §21.2.5)
1. **일반용은 동결 권고**: 치명적 결함만 고치고 기능은 추가하지 않는다. 일반용 수정은 `main`에 먼저 커밋한다(교육용 `edu` 브랜치 작업 트리는 깨끗하게 만든 뒤 진행).
2. 일반용에서 바뀐 부분만 파일별로 뽑아 얹는다: `git diff base-general-v1..main -- apps/element-gems/<파일> | git apply -3 -p3 --directory=apps/element-gems-edu` (`-p3`이 있어야 `apps/element-gems/` 접두어가 빠진다. 먼저 `--check`를 붙여 시험).
3. 교육용 변경은 모두 `// [EDU]` 표식 블록이나 신규 파일(`edu.js`·`edu.css`)이라, 표식 블록과 겹치면 충돌이 나므로 그때만 손으로 합친다. 일반용 `style.css` 변경은 교육용 `style.css`(변경 없음)에 그대로 얹힌다.
4. 반영 뒤 `node --test apps/element-gems-edu/test/*.test.js`와 `node apps/element-gems-edu/tools/validate-edu-data.js --allow-missing`을 돌리고, 일반용 시험도 다시 돌린다.
5. **일반용 무변경 검사식**(병합 전·후 출력이 비어야 한다. 위 1번으로 일반용을 고친 경우에는 그 수정 커밋만 나와야 한다): `git diff base-general-v1 -- apps/element-gems ':!apps/element-gems/spec.md' ':!apps/element-gems/review.md'`
