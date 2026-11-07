# STATUS — 원소 보석 (Element Gems) 진행 상황

> **세션을 시작하면 이 문서를 먼저 읽는다.** 마일스톤마다 갱신한다(커밋 포함). 규칙은 `CLAUDE.md`, 제품 요약은 `PRD.md`, 결정·수치의 정답지는 `apps/element-gems/spec.md`(§1~§19)다.
> 최종 갱신: 2026-11-07 저녁 (랭킹 Build 진행 중 시점)

## 1. 한눈에 보기
| 항목 | 내용 |
|---|---|
| 앱 | 원소 보석(Element Gems): 원소 스킬 매치-3 퍼즐, 대상 **전체 이용가·초등학생 이상** |
| 작업 폴더 | `/Users/sungchul/Desktop/play2/jewel play` (git, `main`). 앱: `apps/element-gems/`. 옛 폴더 `/Users/sungchul/Desktop/워크숍`은 과거 복제본이므로 **쓰지 않는다** |
| 원격 | `https://github.com/eversunk2-tech/jewel-play.git` (`origin`) |
| 배포 | GitHub Pages 자동 배포 — `https://eversunk2-tech.github.io/jewel-play/` (루트 `index.html`이 `apps/element-gems/`로 이동). 이미지 캐시 10분 |
| 마지막 푸시 | `67358a1` (컷인 캐릭터 교체 + 아바타 15종(구버전)까지 배포됨) |
| **미푸시 로컬 커밋 6개** | `44c0a33` CLAUDE.md 개정+랭킹 Plan 지침 / `bb8061f`·`45b8ea6` 대상 사용자 변경 / `3dde81d` spec §19 / `70aaf96` 아바타 16종 교체 / `3b69d29` §19 승인 기록 — **푸시는 사용자 확인 후** |
| 작업 트리 | 랭킹 Build 산출물이 **미커밋 상태**로 쌓이는 중(아래 §3) |

## 2. 완료된 작업 (타임라인)
| 단계 | 내용 | 커밋 |
|---|---|---|
| 기획·1차 Build | 원소 스킬 퍼즐 확정(3안 중 선택), 8×8·보석 6종·스킬 6종·60초 타임어택 | `265dfbc` `663ed80` `8cbe320` |
| 1·2차 Review | 조건부 통과(시간 보너스 하향, 컷인 가장자리 페이드, BGM 무음 제거) | `ff81091` `af23892` |
| 배포 | GitHub Pages + 루트 리다이렉트 | `e8dc83c` |
| 3차 | 난이도 3종(초보/중수/고수) + 2×2 정사각형 매치 + 귀여운 캐릭터풍 보석·로고 | `3dcb5c2` `a9369f8` `c39bca5` |
| 4차 | 플레이 시간 2분 + 난이도별 스테이지 레벨 1~10(목표 점수·별·잠금), 목표 점수 Review 후 하향 | `42a798b` |
| 5차 | UI 리디자인 "스카이 캔디"(새 로고, 정글 배경+파스텔 틴트, 젤리 UI·보드 타일) | `3c626f8` |
| 에셋 후속 | 컷인 캐릭터 5종을 안전한 옷차림·서로 다른 원형으로 교체(번개 소년만 원본 유지) | `67358a1` |
| 랭킹 Plan | 별 챔피언 명예의 전당 계획(spec §19) + 사용자 승인 | `3dde81d` `3b69d29` |
| 아바타 | 플레이어 아바타 **16종**(여8·남8, 3D 가족 애니메이션풍 오리지널) `assets/avatars/avatar-01~16.webp` | `70aaf96` (미푸시) |

게임의 현재 규칙·수치 요약은 `PRD.md` §4~§8, 세부는 spec §2~§4·§15~§18.

## 3. 별 챔피언 명예의 전당 — Build·Review 완료(조건부 통과), 푸시·보강·Cloudflare 설정 대기
- **커밋**: Build `68227c9`, Review `4d9a0c9`(review.md §11), 이름 통일 `d183a17`. 서버 시험 63/63, 클라이언트 46/46, `dist` 최신. 미푸시 로컬 커밋 10개.
- **Review 남은 조건**: ① **금칙어 목록 보강**(영어 철자 변형 `fuq`·`fxck` 등, `시불`·`발시`, `공1공`·`삼반`·네이버, 예약어 `관리인`·`티처`, 오탐 `Shiitake`) — 서버 공개 전에 처리 ② `left` 상한(서버 150/140/120 vs 게임 155/145/120) 정책 확인 ③ `IP_SALT`를 안내서에서 "권장"으로 ④ 이름 통일은 완료(D1 `element-gems-db`, Worker `element-gems-ranking`).
- **초기 라이벌 10명**: 사용자 결정 — 일반 플레이어처럼 보이게 낮은 기록(1위 별 점수 약 18, 10위 약 3)으로 등록. 서버 공개 후 공개 API(`/api/sync`)로 등록, pid는 git 밖 로컬 파일에 저장(삭제용), 실행 직전 사용자 확인.
- **동점 기준 확정**: 별 점수 → 남은 시간 합계 → 먼저 달성 → id (점수 도전 모드는 2차 후보).

- **서버 공개 완료(2026-11-07)**: Cloudflare D1 `element-gems-db`(스키마 적용) + Worker `element-gems-ranking`(`DB` 바인딩, `ALLOWED_ORIGINS`, Secret `IP_SALT`·`ADMIN_KEY`). 주소 `https://element-gems-ranking.sunkyboy.workers.dev`(게임이 뒤에서만 호출). **공유할 게임 주소는 GitHub Pages `https://eversunk2-tech.github.io/jewel-play/`**(Vercel 안 씀). `CONFIG.ranking.apiBase`에 서버 주소 설정, 푸시·Pages 배포 확인(`1ef9e3c`).
- **배포 사이트 확인**: 프로필 만들기·닉네임 검사·시작 화면 칩·명예의 전당 화면 확인. 기록 제출은 사용자가 직접 한 판 클리어해서 확인 예정(가짜 기록 주입은 하지 않음).
- **초기 라이벌 10명(사용자 결정: 일반 플레이어처럼)**: `server/tools/seed-hall.js`로 공개 API 등록(1위 별 점수 18 ~ 10위 3). 비밀 번호표는 저장소 밖 `~/.element-gems/seed-pids.json`(권한 600). 지우려면 `node apps/element-gems/server/tools/seed-hall.js --api <서버주소> --delete`.
- **관리자 키**: 등록·확인 완료(`/api/admin/search`·`moderate`, `Authorization: Bearer`). 터미널 입력창은 `read`로 키를 받을 수 없어 **`$(pbpaste)`로 클립보드에서 전달**. 키는 비밀번호 관리자에 보관, 틀린 키로 10분 안에 5번 넘게 호출하면 429 잠금.
- **시험 프로필 `달빛토끼`**(내장 브라우저 탭에서 만든 별 0개 프로필)가 서버에 남아 있음 — 순위에는 안 보임, 관리자 키로 삭제 가능.
- **안내서 개선 후보**: `schema.sql`을 대시보드 Console에 붙이면 줄바꿈이 사라져 `--` 주석이 뒤를 삼킴 → 주석 없는 한 줄 버전(`schema-oneline.sql`)을 함께 제공.
- **금칙어 보강 진행**: `agents/build-wordlist-element-gems.md`(Review §11-5 공백 + 오탐 `달빛시험`·`Shiitake`). 끝나면 `dist/worker.js`를 Worker에 다시 붙여넣어 배포(사용자가 직접).

### (이전 기록) Build 진행 때 표
| 담당 | 지침 파일 | 소유 파일 | 목표 |
|---|---|---|---|
| **A 서버·닉네임** | `agents/build-ranking-server-element-gems.md` | `apps/element-gems/server/**`, `nickname.js`, `nick-words.js`, 루트 `.gitignore` 추가 줄 | Worker 코어·D1 스키마·목 서버·단일 파일 `dist/worker.js`·`node --test`, 닉네임 검증(우회 시험 60개+), 금칙어 base64 목록 + 확인 도구 |
| **B 클라이언트** | `agents/build-ranking-client-element-gems.md` | `index.html`, `style.css`(끝에 추가), `game.js`(훅·저장 확장만), `ranking.js`, `ranking-ui.js`, `test/` | 저장 확장(`left`), 프로필·명예의 전당 화면, 제출·재시도·오프라인, `apiBase` 비우면 UI 숨김 |
- **Build A 완료**(서버 시험 61/61, dist 최신) → 가중 점수 변경(`agents/build-ranking-weight-addendum-element-gems.md`)을 A·B에 전달해 반영 중. B는 실행 중.
- 작성 시점(이전): 두 에이전트 모두 **실행 중**(작업 트리에 `server/src/core.js`, `nickname.js`, `ranking*.js`, `test/` 등이 생성되는 중). **완료 보고를 받으면** 각 보고를 확인하고 결과를 사용자에게 요약한다.
- **다음 순서**: ① A·B 보고 확인(파일·테스트·한계) → ② 통합 점검(목 서버 + 클라이언트 한 바퀴) → ③ **Review 지침 작성 `agents/review-ranking-element-gems.md`**(spec §19.11 체크리스트: 닉네임 우회·서버 검증·조작 값 거부·개인정보 미저장·비밀키 미포함·CORS·오프라인·기존 §17/§18 회귀·`dist` 최신성) 후 **별도 Review 에이전트** 실행(`review.md`에 `## 11.` 추가) → ④ Build 커밋(`Build:`)·Review 커밋(`Review:`) → ⑤ **푸시 확인**(미푸시 포함) → ⑥ Cloudflare 설정 단계별 안내.

## 4. 사용자가 확정한 결정 (승인 기록)
- 컨셉: 원소 스킬 퍼즐. 시간: 중수 120초(초보 130·고수 100). 난이도·2×2·스테이지·별 등급·시간 보너스 하향 등 §15~§17 권장안 승인.
- 디자인: "스카이 캔디" 승인, **정글 배경 이미지는 계속 사용**(파스텔 틴트 오버레이).
- **대상: 전체 이용가, 초등학생 이상.** 글은 초등학생이 읽을 쉬운 말.
- 캐릭터: 사람 캐릭터는 몸의 윤곽이 드러나지 않는 헐렁한 옷, 서로 다른 원형, 성별 균형, **오리지널(유명 작품 연상 요소 금지: 초록 피부 거인·여우·눈 여왕식 땋은 백금발 등)**.
- 랭킹: **별 챔피언 한 가지만**(점수 랭킹·점수 도전 모드는 2차 후보). 서버는 **Cloudflare Workers + D1**. 닉네임은 **제한된 자유 입력**. spec §19.12 열린 질문 5개 모두 권장안(통합 점수=~~단순 합 90★~~ → **2026-11-07 변경: 난이도 가중 "별 점수" 초보×1·중수×2·고수×3, 최대 180(난이도 탭은 별 개수)** / 번호표 부여 중복 허용 / "나중에 할래요" 허용 / 닉네임 변경 하루 2회·아바타 무제한 / 학교·기관 신고·삭제 담당은 사용자가 지정).
- 서버 예외는 CLAUDE.md에 반영됨(명예의 전당 한정). 블로그 메인 `index.html` 카드 추가는 **하지 않음**(사용자 지시).

## 5. Cloudflare 계정 확인 결과 (읽기 전용으로 확인, 2026-11-07)
- **무료 플랜**. Workers & Pages: Pages 4개(`solid-figure`, `joseon-year`, `prompt-school`(=프롬프트 은행), `prompt-intro1`) + Worker 1개(`canva-lesson`). 오늘 요청 0/100,000.
- **D1: `prompt-school-db` 1개 — 프롬프트 은행이 사용 중이므로 절대 건드리지 않는다**(대시보드는 테이블 0·쿼리 0으로 표시했으나 비어 있다고 단정하지 않음). D1 한도 1/10개, 읽기 0/500만·쓰기 0/10만(일). 한도는 **계정 전체 합산**.
- Workers 하위 도메인 설정됨: `sunkyboy.workers.dev`. (생활기록부 도우미는 **Vercel**에 있어 Cloudflare와 무관.)
- **이 게임용 새 이름(제안)**: D1 `element-gems-db`, Worker `element-gems-ranking`, 서버 주소 `https://element-gems-ranking.sunkyboy.workers.dev`.
- 설정 안내 원칙: **사용자가 로그인·비밀키 입력을 직접** 한다. 에이전트는 `wrangler login/deploy/secret`·대시보드 변경을 실행하지 않는다. 안내서는 spec §19.8(대시보드 방식 + CLI 방식), 가입·하위 도메인 단계는 이미 완료.

## 6. 작업 방식·주의 (이 프로젝트에서 배운 것)
- **사이클**: Plan(서브에이전트, spec § 추가, 사용자 승인) → Build → Review(별도 에이전트) → 커밋/푸시(푸시는 사용자 확인). 승인 없이 구현하지 않는다. 지침 파일은 `agents/`에 만든다. 여러 Build를 병렬로 돌릴 때는 **파일 소유권을 분리**하고 소유 밖 파일은 읽기 전용으로 둔다.
- **브라우저 안전**: 모든 호출에 `tabId`, 새 탭, 로컬 서버만, `localStorage` 접근 전 origin 확인, 배포 주소·기존 탭 금지(과거 배포 사이트 localStorage 덮어쓰기 사고).
- **Gemini 이미지 작업**(Claude in Chrome): 일일 이미지 생성 한도가 있다(기본 계정이 한도에 걸려 사용자가 **다른 계정 `/u/2`로 로그인**해 계속함 — 로그인은 사용자가 직접). 한 대화에서 이어 쓰면 직전 이미지를 합성·편집하려는 경향이 있으므로 **프롬프트마다 독립적으로 완결**되게 쓴다. 다운로드 버튼의 순서가 어긋날 수 있어 **내려받은 파일의 해시를 비교**해 중복을 확인한다. 시트(3×2 격자, 얇은 테두리 안에 흰 배경)로 생성 → 프레임 경계로 잘라 192px WebP로 정리. 흰 배경 제거는 가장자리에서 연결된 near-white 영역 제거 + 큰 내부 영역만 제거(작은 흰 장식 보존), 로고는 초록 배경 크로마키 후 despill. 하단 우측 Gemini 표식은 잘라내거나 주변색으로 채운다. 이 스크립트들은 scratchpad(임시)에 있었고 저장소에는 없다 — 필요하면 다시 만든다.
- **효과음**은 Python 표준 라이브러리로 합성(WAV 26종, 스크립트는 저장소에 없음), **BGM**은 Gemini 생성 후 112kbps로 재인코딩.
- 소통: 한국어, 결과는 요약+표, 결정이 필요하면 번호로 묻고 권장안을 먼저 제시. 사용자는 자주 중간에 요구를 바꾼다 → 진행 중 에이전트에 변경 사항을 전달한다.

## 7. 남은 일 / 후보
**당장 필요**
- [ ] 랭킹 Build A·B 완료 확인 → 통합 점검 → Review → 커밋 → 푸시(+미푸시 6커밋)
- [ ] **금칙어 목록 사용자 검수**(Build A가 만든 `server/tools/print-wordlist.js`로 확인)
- [ ] Cloudflare 설정 단계별 안내(새 D1 `element-gems-db`, Worker `element-gems-ranking`, 관리자 비밀키, 허용 오리진, 게임 `CONFIG.ranking.apiBase` 입력) — 사용자가 직접 로그인·비밀키 입력
- [ ] 학교·기관 배포 시 부적절 닉네임 **신고·삭제 담당/창구를 사용자가 정함**, 기관 개인정보 방침 확인
**나중에(후보)**
- 점수 랭킹(점수 도전 모드, 2분 고정·시간 보너스 제거), 특수 보석(4매치 폭발·5매치 하이퍼), 정사각형 전용 연출
- 사람 플레이 기반 밸런스 조정(`CONFIG.stages.targets`, 게이지 최대치 ×0.85 안), 상단 레벨 난이도
- 컷인 캐릭터를 보석처럼 귀여운 스타일로 통일할지, Vercel 호스팅(설정 파일 없이 가능)

## 8. 알려진 한계·미확인
- **미확인**: 소리·BGM 청각, 실기기 터치/iOS Safari, `file://` 직접 열기 일부, 저사양 기기 프레임, 사람 플레이 밸런스(시뮬레이션은 수당 생각시간에 매우 민감: 1.3/1.6/1.9초에서 클리어율 98/79/49%)
- 닉네임 필터는 음절 쪼개기 우회를 못 잡는다(spec §19.3.3에 기록). 점수·별은 클라이언트 값이라 완전한 조작 방지는 불가(서버가 상한·연쇄·단조 증가로 극단값만 거름).
- 서버 용량: 약 900명(안전계수 2배)을 넘으면 읽기 한도 병목 → 유료 전환·근사 순위 필요. D1 무료 한도 초과 시 쿼리 실패(2026-09-01 이후).
- 불확실(§19.14): D1 대시보드 정확한 메뉴 경로, Rate Limiting 바인딩의 무료 제공 여부, `workers.dev`의 Cache API 동작.

## 9. 주요 파일 지도
```
CLAUDE.md                 규칙(세션 시작 시 읽기)      PRD.md   제품 요구사항 요약
docs/STATUS.md            이 문서                       index.html  루트 리다이렉트
agents/*.md               Plan/Build/Review 지침(단계별 누적, 랭킹 3개: plan·build 서버·build 클라이언트)
apps/element-gems/
  index.html style.css game.js            게임 본체(game.js ≈ 2,200줄+, CONFIG에 수치 집중)
  spec.md                                  계획서 §1~§19(정답지)    review.md  검증 §1~§10
  assets/  bg-jungle title-logo gems/ cutin/ avatars/(16) sfx/(26 wav) music/bgm.mp3
  [진행 중·미커밋] nickname.js nick-words.js ranking.js ranking-ui.js server/ test/
```

## 10. 와이드 레이아웃(태블릿·PC) — 진행 기록 (2026-11-07)
- Plan 완료(spec §20): 폭 800px 이상·높이 501px 이상 가로 화면에서 왼쪽 큰 보드 + 오른쪽 패널, 시작·프로필·명예의 전당 2열, 세로 태블릿 보드 상한 680/840px. 1366×768에서 보드 466 → 712px. 휴대폰 4개 해상도는 전후 동일.
- 사용자 승인: 열린 질문 5개 권장안 + **추가 요청(§20.14)** — 와이드 게임 화면에서 원소 게이지를 세로 한 줄로 나열하고 보석 옆에 스킬 이름·간단한 설명 표시(휴대폰은 그대로).
- Build 진행 중: `agents/build-widescreen-element-gems.md`. 끝나면 별도 Review → 커밋 → 푸시(확인 후) → 최종 배포본에서 **선생님용 소개 페이지(Artifact, 비공개)** 와 캡처 제작(PC·태블릿·휴대폰 화면 포함).
- 서버 상태: 금칙어 보강본 `dist/worker.js` 재배포 완료(`관리인` 거절로 확인). 시험 프로필 `달빛토끼`는 서버에 남아 있음(순위 비노출).
