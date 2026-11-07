/* element-gems server/test - nick-vectors.js
 * 닉네임 검증 시험 벡터 (spec §19.10 단계 ②, §19.11). nickname.test.js 가 쓴다.
 *
 * - BYPASS_EXTRA: 우회 시도 + 정상 이름. 실제 금칙어 목록이 아니라 **무해한 시험용 단어**(거북이, banana)를 extraBlock 으로 넣고
 *   여러 정규화 우회가 막히는지 본다. 그래서 이 파일에는 욕설이 없다.
 * - REAL_B64: 실제 금칙어 목록(nick-words.js)이 막아야 하는 말과 그 변형(base64라 저장소에서 바로 보이지 않는다).
 * - LEGIT: 통과해야 하는 정상 닉네임(오탐 방지).
 * - KNOWN_LIMITS: 못 잡는다고 알려진 우회(통과해도 시험 실패가 아님). 사용자 검수 때 참고.
 *
 * 알려진 한계(자동 판별이 어려운 것):
 *   1) 음절을 쪼개 다른 글자를 끼워 넣는 우회(예: 거-가-북이처럼 의미 없는 음절을 사이에 넣기). 모음만 있는 음절을 끼우는 경우(거엉북이)는 같은 자모 연속을 접어 막지만,
 *      자음이 있는 다른 음절을 끼우는 것은 못 잡는다.
 *   2) 새로 생긴 은어·신조어·외국어 욕설(목록에 없으면 통과). 긴급하면 서버 변수 EXTRA_BLOCK 에 쉼표로 추가하고, 평소에는 nick-words.js 를 갱신한다.
 *   3) 실명·별명 구분: 3음절 이름(성+이름)은 별명과 구분할 수 없어 막지 않는다(spec §19.3.3). 신고·숨김으로 보완한다.
 *   4) 소리나는 대로 바꾼 은어(예: 신발 같은 순한 말로 돌려 쓰는 표현)는 오탐 방지를 위해 일부러 허용한다(nick-words.js 의 allow 목록).
 *   5) 소프트 키가 받침을 지우기 때문에 소리가 같은 정상 단어가 막힐 수 있다(오탐 허용, 보수적). 단 2음절 금칙어(시발·병신류)는 받침까지 한 번 더 보므로
 *      별시계·불씨·심바·빛시험 같은 정상 말은 통과한다(nickname.js 머리 주석).
 *   6) 한글 앞뒤 순서를 뒤집는 우회(발시)는 일반 규칙으로 막지 않는다(뒤집으면 일상 단어가 되는 금칙어가 있어 오탐이 크다). 널리 쓰는 몇 개만 `=` 전체 일치로 목록에 넣었다.
 *   7) 영문 오탐(shiitake·instant·rapping 등)은 allow 목록의 영문 항목으로 예외 처리한다.
 */
'use strict';

const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');

/** extraBlock = '거북이,banana' 로 시험한다. 모두 막혀야 한다(ok:false). */
const EXTRA = '거북이,banana';
const BYPASS_EXTRA = [
  // 한글: 그대로 / 숫자·영문 끼워넣기
  '거북이', '거1북이', '거a북이', '거0북0이', '거북1이', '거북이9', 'a거북이', '거북이a', '거9북9이', '거z북z이',
  // 한글: 된소리·모음(y 활음)·받침 변형
  '꺼북이', '거뿍이', '겨북이', '거뷱이', '거북위', '거부이', '거분이', '거붕이', '꺼붕이', '거북이이', '거엉북이', '거어북이',
  // 영문: 대소문자·숫자 치환·숫자 제거·반복·한글 끼워넣기
  'banana', 'BANANA', 'BaNaNa', 'b4n4n4', 'B4N4N4', '8anana', 'ban4na', 'baanana', 'bananna', 'banana1', 'banana99', '1banana',
  'b4nana', 'bana나na', '바banana', 'ba나nana', 'banan4', 'ban나ana', 'bananaa', 'bbanana',
  // 앞뒤에 글자 붙이기
  'bananaz', 'zbanana'
];

/** 실제 목록으로 막혀야 하는 것 (spec §19.11 의 예 포함) */
const SPEC_EXAMPLES = ['멍청이', '멍1청이', '멍a청이', '멍0청0이', '멍쳥이', 'stupid', 'S7uPiD', 'stuuupid', 'stupid99', '멍청이a', 'a멍청이'];

const REAL_B64 = [
  '7Iuc67Cc', '7JSo67Cc', '7JSo67CU', '7Iuc67CU',
  '7JSo67mo', '7IucMeuwnA==', '7IucYeuwnA==', '7Ims67Cc',
  '7Iuc7YyU', '7JSo7YyU', '7JSo7Y6E', '7Iut7YyU',
  '7Iuc67aA656E', '7JSo67aA65+0', '67OR7Iug', '67iF7Iug',
  '67mZ7Iug', '67ORMeyLoA==', '67ORYeyLoA==', '67OR7Imw',
  '6rCc7IOI64G8', '6rCc7IOJ6riw', '6rCc7IS464G8', '6rCc7IOI6riw',
  '6rCc7IOI7YKk', '6rCcMeyDiOuBvA==', '6rCcYeyDiOuBvA==', '7KeA656E',
  '7KeAMeuehA==', '7KeAYeuehA==', '7KWQ656E', '7KKG',
  '7KKG6rCZ', '7KKGMeqwmQ==', '7KG064KY', '7KG0MeuCmA==',
  '7KG46528', '7IS57Iqk', '7IS5MeyKpA==', '67O07KeA',
  '7J6Q7KeA', '7JW864+Z', '7Y+s66W064W4', '6rq87KC4',
  '64ul7LOQ', '66+47Lmc64aI', '66+47Lmc64WE', '66eI7JW9',
  '64+E67CV', '7Lm07KeA64W4', '7J6Q7IK0', '7ZWc64Ko7Lap',
  '66eY7Lap', '7J2867Kg', '64qQ6riI66eI', '64uI7JWg66+4',
  '65iQ65287J20', '64+M7JWE7J20', '64+E65287J20', '7Jeg7LC9',
  '7IyN64aI', 'ZnVjaw==', 'ZnV1Y2s=', 'ZjF1Y2s=',
  'ZnVjazk5', 'RlVDSw==', 'c2gxdA==', 'c2hpdA==',
  'YjF0Y2g=', 'Yml0Y2g=', 'YmFzdGFyZA==', 'Y3VudA==',
  'cHVzc3k=', 'd2hvcmU=', 'bmlnZ2Vy', 'ZmFnZ290',
  'cDBybg==', 'cG9ybg==', 'czN4', 'c2V4',
  'c2V4eQ==', 'ZGljaw==', 'ZDFjaw==', 'Y29jaw==',
  'YzBjaw==', 'ZnZjaw==', 'ZmNr', 'ZnVr',
  'c2liYWw=', 'c2hpYmFs', 'c3NpYmFs', 'c2lwYWw=',
  'am90bmE=', 'Ynl1bmdzaW4=', 'Z2Flc2Fla2tp', 'dGxxa2Y=',
  'cXVkdGxz', 'd2xma2Y=', 'cm90b3Js', '7IucYmFs',
  'c2nrsJw=', '7JSoYmFs', 'Ynllb25n7Iug'
].map(b64);

/** 형식 시험: [입력, 기대 코드 또는 'ok'] */
const FORMAT = [
  ['', 'nick_length'], ['가', 'nick_length'], ['a', 'nick_length'], ['가나다라마바사아자', 'nick_length'],
  ['가나', 'ok'], ['ab', 'ok'], ['가나다라마바사아', 'ok'],
  ['a b', 'nick_charset'], ['a_b', 'nick_charset'], ['a.b', 'nick_charset'], ['a@b', 'nick_charset'], ['a-b', 'nick_charset'],
  ['🙂🙂', 'nick_charset'], ['별빛🙂', 'nick_charset'], ['漢字', 'nick_charset'], ['ひらがな', 'nick_charset'], ['ｆｕｌｌ', 'nick_charset'],
  [' 별빛', 'nick_charset'], ['별빛 ', 'nick_charset'], ['별\n빛', 'nick_charset'],
  ['ㅋㅋㅋ', 'nick_charset'], ['ㅏㅏㅏ', 'nick_charset'], ['ㅅㅂ', 'nick_charset'], ['별ㅋ', 'nick_charset'], ['ㅂㅅ별', 'nick_charset'],
  ['별123', 'ok'], ['별1234', 'nick_digits'], ['abc1234', 'nick_digits'], ['123', 'nick_digits'], ['12', 'nick_digits'], ['1a2b3c', 'ok'],
  ['아아아', 'nick_repeat'], ['AAA', 'nick_repeat'], ['aAa', 'nick_repeat'], ['하하하', 'nick_repeat'], ['하하', 'ok'], ['aa', 'ok'], ['별빛냥냥냥', 'nick_repeat'],
  ['한글', 'ok']   // 자모 분해형 '한글' -> NFC 로 합쳐져 통과
];

/** 개인정보·예약어: [입력, 기대 코드] */
const PII = [
  ['3학년2반', 'nick_pii'], ['3반', 'nick_pii'], ['서울초', 'nick_pii'], ['서울초3', 'nick_pii'], ['한빛중', 'nick_pii'], ['한빛고', 'nick_pii'],
  ['학교', 'nick_pii'], ['학년', 'nick_pii'], ['초등학생', 'nick_pii'], ['중학생', 'nick_pii'], ['고딩', 'nick_pii'], ['초딩', 'nick_pii'], ['학원', 'nick_pii'],
  ['카톡', 'nick_pii'], ['카1톡', 'nick_pii'], ['kakao', 'nick_pii'], ['KAKAO', 'nick_pii'], ['k4k4o', 'nick_pii'], ['카카오톡', 'nick_pii'],
  ['인스타', 'nick_pii'], ['insta', 'nick_pii'], ['디코', 'nick_pii'], ['discord', 'nick_pii'], ['디스코드', 'nick_pii'], ['텔레그램', 'nick_pii'],
  ['틱톡', 'nick_pii'], ['tiktok', 'nick_pii'], ['라인', 'nick_pii'], ['오픈채팅', 'nick_pii'], ['http', 'nick_pii'], ['www', 'nick_repeat'], ['www1', 'nick_repeat'], ['ww.com', 'nick_charset'], ['골뱅이', 'nick_pii'],
  ['별010', 'nick_pii'], ['010별', 'nick_pii'], ['공일공', 'nick_pii'], ['영일영', 'nick_pii'], ['전화번호', 'nick_pii'], ['연락처', 'nick_pii'],
  ['관리자', 'nick_reserved'], ['Admin', 'nick_reserved'], ['admin1', 'nick_reserved'], ['운영자1', 'nick_reserved'], ['운영진', 'nick_reserved'], ['공식', 'nick_reserved'],
  ['이그니', 'nick_reserved'], ['아쿠아', 'nick_reserved'], ['리프', 'nick_reserved'], ['볼트', 'nick_reserved'], ['녹스', 'nick_reserved'], ['루미', 'nick_reserved'],
  ['선생님', 'nick_reserved'], ['어드민', 'nick_reserved'], ['시스템', 'nick_reserved'], ['원소보석', 'nick_reserved'], ['GM', 'nick_reserved'], ['gm1', 'nick_reserved'],
  ['지엠', 'nick_reserved'], ['teacher', 'nick_reserved'], ['official', 'nick_reserved'], ['support', 'nick_reserved'], ['staff', 'nick_reserved'], ['mod', 'nick_reserved'],
  ['관a리자', 'nick_reserved']
];

/** 통과해야 하는 정상 닉네임 (오탐 방지) - 기본 목록 */
const LEGIT_V1 = [
  '별빛냥', '달토끼', '반달곰', '초코우유', '초코', '하늘이', '구름빵', '파랑새', '솜사탕', '딸기우유', '바나나킥', '곰돌이', '토끼똥', '고양이', '강아지', '햄찌', '햄스터', '펭귄',
  '북극곰', '사자왕', '호랑이', '용사', '마법사', '기사단', '별똥별', '은하수', '무지개', '번개맨', '불꽃', '물방울', '풀잎', '빛나리', '나무늘보', '도토리', '밤송이', '감자칩',
  '떡볶이', '라면왕', '치킨', '피자', '콜라', '사이다', '젤리', '마카롱', '쿠키', '초코칩', '딸기잼', '포도알', '사과', '수박', '참외', '복숭아', '레몬', '오렌지', '키위', '망고',
  '코코넛', '새싹', '꽃잎', '민들레', '해바라기', '장미', '튤립', '벚꽃', '단풍', '눈사람', '눈꽃', '소나기', '태풍', '번개', '천둥', '해님', '달님', '별님', '구름', '노을', '새벽',
  '한밤', '달빛', '별빛', '햇살', '바람', '바다', '파도', '고래', '상어', '돌고래', '문어', '오징어', '꽃게', '새우', '조개', '불가사리', '해마', '거북이', '악어', '공룡', '티라노',
  '드래곤', '유니콘', '페가수스', '피닉스', '늑대', '여우', '너구리', '다람쥐', '사슴', '코끼리', '기린', '얼룩말', '판다', '코알라', '캥거루', '앵무새', '올빼미', '부엉이', '독수리',
  '참새', '까치', '제비', '비둘기', '오리', '거위', '병아리', '송아지', '망아지', '돼지', '염소', '젖소', '마라탕', '탕후루', '붕어빵', '호떡', '군고구마', '삼각김밥', '김치찌개',
  '된장국', '치즈', '버터', '우유', '커피', '녹차', '핫초코', '코코아', '아이스크림', '팥빙수', '슈크림', '카스테라', '와플', '도넛', '머핀', '푸딩', '캔디', '사탕', '초콜릿',
  '민준', '서연', '지우', '하윤', '도윤', '서준', '예준', '시우', '하준', '지호', '수빈', '유진', '채원', '다은', '소율', '시은', '서아', '이안', '지안', '아린', '지유',
  '개나리', '개구리', '개미', '개학', '개울', '도라지', '병아리', '빙수', '비수', '시부모', '씨앗', '시장', '시계', '신발', '신바람', '신발왕', '시바견', '고등어', '졸라맨', '메갈로돈',
  '세스코', '조나단', '지라시', '하고', '소나기', '수학', '도라에몽', '강아지똥', '엉덩이', '똥꼬', '방귀대장', '코딱지', '대마왕', '마왕', '토토로', '토토', '파워레인저',
  '바보', '멍멍이', '멍충이', '멍청히', '반짝이', '말랑이', '꿀벌', '무당벌레', '잠자리', '나비', '개똥벌레', '지렁이', '달팽이', '두더지', '고슴도치', '청설모', '수달', '비버',
  '화이트', '블랙', '레드', '블루', '핑크', '스카이', '마블', '히어로', '닌자', '해적', '우주인', '로봇', '탐정', '요리사', '과학자', '발명가', '음악가', '화가', '축구왕', '농구왕',
  '야구왕', '수영왕', '게임왕', '퍼즐왕', '보석왕', '원소왕', '불의전사', '물의전사', '풀의전사', '빛의전사', '번개전사', '어둠전사',
  'star', 'Starlit', 'moon', 'Sunny', 'cloud', 'Rainbow', 'Pikachu', 'Mario', 'Luigi', 'Zelda', 'Alice', 'Bob', 'Emma', 'Liam', 'Noah', 'Olivia', 'Sophia', 'Jack', 'Lucy',
  'gem', 'Gemini', 'jewel', 'diamond', 'ruby', 'sapphire', 'emerald', 'topaz', 'amber', 'pearl', 'class', 'pass', 'glass', 'bass', 'grass', 'assist', 'Jonathan', 'heroine',
  'peacock', 'grape', 'studio', 'student', 'sussex', 'classic', 'cucumber', 'document', 'Dickens', 'analyst', 'therapy',
  'kitty', 'Sparkle', 'Dragon7', 'Ninja99', 'ace', 'MAX', 'pro', 'noob', 'gamer', 'cool', 'happy', 'lucky', 'tiger', 'panda', 'koala', 'penguin', 'rabbit', 'foxy', 'wolf',
  '별빛냥2', '달토끼9', 'Star7', '곰돌이12', '라인업', '초코송이', '고구마', '꼬마', '아이', '이슬', '여름', '가을', '겨울', '봄이', '하나', '두리', '세찌', '네모', '다섯'
];

/** 정상 닉네임 추가분(금칙어 보강 작업): 빛시·시험·별시·불씨·심바처럼 소프트 키에 걸리던 말, 동물·색·음식·학교생활·이름·영어 단어, 1·I가 든 영어 이름 */
const LEGIT_V2 = [
  '달빛시험', '빛시험', '빛시계', '빛시', '빛시간', '빛시장', '빛시작', '시험', '시험왕', '수학시험',
  '시험지', '시험공부', '시험기간', '별시계', '별시', '벽시계', '별씨앗', '불씨', '불시착', '불새',
  '불곰', '심바', '신박', '신박해', '시방새', '씨방', '신방', '신판', '시판', '벚꽃잎',
  '법씨', '벚씨', '부시맨', '비시', '붕어', '하마', '치타', '표범', '알파카', '오리너구리',
  '아르마딜로', '카멜레온', '미어캣', '펠리컨', '갈매기', '바다표범', '해파리', '가오리', '잉어', '금붕어',
  '올챙이', '도마뱀', '사마귀', '메뚜기', '빨강', '주황', '노랑', '초록', '하늘색', '보라색',
  '분홍', '연두', '남색', '은빛', '금빛', '자주색', '김밥', '비빔밥', '떡국', '만두',
  '호빵', '곶감', '약과', '단팥빵', '크림빵', '소시지', '햄버거', '샌드위치', '짜장면', '우동',
  '오므라이스', '팝콘', '요거트', '바나나우유', '시간표', '시계탑', '쉬는시간', '점심시간', '운동장', '체육관',
  '도서관', '숙제왕', '받아쓰기', '구구단', '소풍', '방학', '부반장', '반장', '일등', '청소당번',
  '칠판', '분필', '연필', '지우개', '필통', '색연필', '알림장', '수학왕', '과학왕', '민서',
  '서윤', '지민', '현우', '도현', '지훈', '수아', '하은', '예린', '가온', '나래',
  '다솜', '보람', '새롬', '아름', '한결', '이든', '시현', '시윤', '채은', '유나',
  '하린', '은우', '서진', '시후', '지아', '김민준', '박서연', 'Hello', 'Polo', 'Solo',
  'Island', 'Illness', 'Gill', 'Color', 'Kilo', 'Milo', 'Lily', 'Ellie', 'Willow', 'Pillow',
  'Tulip', 'Violet', 'Hazel', 'Peach', 'Mango', 'Cherry', 'Berry', 'Honey', 'Bubble', 'Cookie',
  'Muffin', 'Pixel', 'Rocket', 'Comet', 'Galaxy', 'Planet', 'Meteor', 'Thunder', 'Shadow', 'Flame',
  'Frost', 'Breeze', 'Instant', 'Install', 'Rapping', 'Wrapping', 'Thorny', 'Scraping', 'Shiitake', 'Shoe',
  'Shop', 'Ship', 'Sheep', 'Shine', 'Shiny', 'Whale', 'Spicy', 'Kiwi', 'Titan', 'Pixel1',
  'Star1', 'Gem1', 'Milo1', 'Hello1', 'Cool1', 'Gill1', 'Jill1', 'Billy1', 'Ice1', 'Alice1',
  'Lily1', 'Ellie2', 'Fire1', 'Wil1', 'Kiwi1', 'Zelda1', 'Bell1'
];
const LEGIT = LEGIT_V1.concat(LEGIT_V2);

/** 금칙어 보강으로 새로 막아야 하는 우회 벡터: [입력, 기대 코드]. 입력은 base64로 저장한다(저장소에서 욕설이 그대로 읽히지 않게).
 *  철자 변형(f·shit·bitch·dick·cock·pussy·porn·retard·sex·kys 계열)·1/I→l 치환·한글 변형·숫자 낀 전화번호·한글 숫자 반·연락 유도·사칭 예약어 */
const WORDLIST_V2 = [
  ['ZnVx','b'], ['Znhjaw==','b'], ['ZmN1aw==','b'], ['ZnVraw==','b'],
  ['ZnVjYw==','b'], ['ZnV1aw==','b'], ['ZnVj','b'], ['ZnV4aw==','b'],
  ['cGh1aw==','b'], ['cGh1cQ==','b'], ['ZnVraW5n','b'], ['ZmNraW5n','b'],
  ['Zmtpbmc=','b'], ['c2h5dA==','b'], ['c2hldA==','b'], ['c2hlaXQ=','b'],
  ['c2hpZXQ=','b'], ['c2h5dGU=','b'], ['Ynl0Y2g=','b'], ['Yml0Yw==','b'],
  ['YmlvdGNo','b'], ['YmVhdGNo','b'], ['YnRjaA==','b'], ['ZGlr','b'],
  ['ZGlraw==','b'], ['Y29r','b'], ['cHVzeQ==','b'], ['cHVzc2k=','b'],
  ['cHJvbg==','b'], ['cmV0cmQ=','b'], ['dGFyZA==','b'], ['c2VleA==','b'],
  ['c2V4eA==','b'], ['c2Vrcw==','b'], ['c2Vja3M=','b'], ['c2V4aQ==','b'],
  ['a3lz','b'], ['a21z','b'], ['aG9l','b'], ['aG9lcw==','b'],
  ['YmFzdGVyZA==','b'], ['YmFzdHJk','b'], ['bmliYmE=','b'], ['bmlxcWE=','b'],
  ['ZmFnZw==','b'], ['YXNzaGF0','b'], ['YXNzd2lwZQ==','b'], ['RlVR','b'],
  ['Rnhjaw==','b'], ['RmNVaw==','b'], ['U2gzdA==','b'], ['Ynl0NGNo','b'],
  ['RDFr','b'], ['UHU1eQ==','b'], ['cHIwbg==','b'], ['UjN0cmQ=','b'],
  ['S1lT','b'], ['SDBl','b'], ['UzMzeA==','b'], ['ZjBjaw==','b'],
  ['czF1dA==','b'], ['c0l1dA==','b'], ['UzFVVA==','b'], ['aGl0SWVy','b'],
  ['SDF0bGVy','b'], ['c2V4dWEx','b'], ['YW5hMQ==','b'], ['ZGkxZG8=','b'],
  ['Z2FtYjFpbmc=','b'], ['bW8xZXN0','b'], ['7Iuc67aI','b'], ['7JSo67aI','b'],
  ['7Iuc67iU','b'], ['7JSo67iU','b'], ['67Cc7Iuc','b'], ['67Cc7JSo','b'],
  ['7YyU7Iuc','b'], ['7YyU7JSo','b'], ['67KM7Iuc','b'], ['67KM7JSo','b'],
  ['7IucMeu2iA==','b'], ['67CcYeyLnA==','b'], ['7IucYeu2iA==','b'], ['7Iut67Cc','b'],
  ['7Iuv7YyU','b'], ['7JSo7J207YyU','b'], ['7Iuc7J2067Cc','b'], ['67ORMeyLoA==','b'],
  ['67iF7Iug','b'], ['67mb7Iuc67Cc','b'], ['64us67mb7Iuc67Cc','b'], ['64us67mb67OR7Iug','b'],
  ['6rO1MeqztQ==','p'], ['6rO17J28MA==','p'], ['7JiBMeyYgQ==','p'], ['6rO1MeydvA==','p'],
  ['MGExYjA=','p'], ['7IK867CY','p'], ['7IKs67CY','p'], ['7Jik67CY','p'],
  ['7YyU67CY','p'], ['7Iut67CY','p'], ['7IK867CYMw==','p'], ['ZWxl7IK867CY','p'],
  ['7J207ZWZ64WE','p'], ['64Sk7J2067KE','p'], ['bmF2ZXI=','p'], ['TkFWRVI=','p'],
  ['ZG90a3I=','p'], ['64+E7Yq47Lu0','p'], ['64+E7Yq47LyA7J207JWM','p'], ['64u37LyA7J207JWM','p'],
  ['ZG90bmV0','p'], ['64u364S3','p'], ['ZGF1bQ==','p'], ['64uk7J2M66mU7J28','p'],
  ['aG90bWFpbA==','p'], ['aWNsb3Vk','p'], ['c2t5cGU=','p'], ['7Iqk7Lm07J207ZSE','p'],
  ['65SU7Jeg7KO87IS47JqU','p'], ['7KCE7ZmU7KO87IS47JqU','p'], ['66y47J6Q7KO87IS47JqU','p'], ['6rSA66as7J24','r'],
  ['6rSA66as7JuQ','r'], ['6rSA66as7YyA','r'], ['7Iqk7YOc7ZSE','r'], ['7Iqk7YOt','r'],
  ['66qo642U66CI7J207YSw','r'], ['66qo642w66CI7J207YSw','r'], ['7Yuw7LKY','r'], ['7Yuw7LOQ','r'],
  ['6rCQ64+F6rSA','r'], ['66ek64uI7KCA','r'], ['6rKM7J6E66eI7Iqk7YSw','r'], ['SWduaXM=','r'],
  ['SUdOSVM=','r'], ['aWduaXMx','r'], ['S25veA==','r'], ['THVtaQ==','r'],
  ['QXF1YQ==','r'], ['bWFuYWdlcg==','r'], ['7J206re464uI7Iqk','r'], ['6rSAYeumrOyduA==','r'],
  ['6rSA66asMeybkA==','r']
].map(([s, c]) => [b64(s), { b: 'nick_blocked', p: 'nick_pii', r: 'nick_reserved' }[c]]);

/** 못 잡는 것으로 알려진 우회: [입력, 설명]. 통과해도 시험 실패가 아니다(extraBlock 에 거북이 지정 기준). */
const KNOWN_LIMITS = [
  ['거가북이', '자음이 있는 다른 음절을 사이에 끼움'],
  ['거북가이', '단어 뒤쪽에 다른 음절을 끼움'],
  ['북거이', '음절 순서를 바꿈']
];
/** 영문 부분 일치 때문에 정상 단어가 막히는 알려진 오탐(보수적으로 허용): [입력, 이유] */
const KNOWN_FALSE_POSITIVES = [
  ['Scunthor', "'cunt' 가 들어 있어 막힘(유명한 Scunthorpe 문제)"],
  ['플라밍고', "'○○고' 로 끝나는 세 글자 이상은 학교 이름으로 보아 개인정보 안내로 막힘(spec §19.3.3 학교 규칙, 알려진 오탐)"],
  ['고등학교', '학교·고등 표현이라 개인정보 안내로 막힘']
];

module.exports = { EXTRA, BYPASS_EXTRA, SPEC_EXAMPLES, REAL_B64, WORDLIST_V2, FORMAT, PII, LEGIT, KNOWN_LIMITS, KNOWN_FALSE_POSITIVES };
