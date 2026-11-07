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
 *   5) 소프트 키가 받침을 지우기 때문에 소리가 같은 정상 단어가 막힐 수 있다(오탐 허용, 보수적).
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

/** 통과해야 하는 정상 닉네임 (오탐 방지) */
const LEGIT = [
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

/** 못 잡는 것으로 알려진 우회: [입력, 설명]. 통과해도 시험 실패가 아니다(extraBlock 에 거북이 지정 기준). */
const KNOWN_LIMITS = [
  ['거가북이', '자음이 있는 다른 음절을 사이에 끼움'],
  ['거북가이', '단어 뒤쪽에 다른 음절을 끼움'],
  ['북거이', '음절 순서를 바꿈']
];
/** 영문 부분 일치 때문에 정상 단어가 막히는 알려진 오탐(보수적으로 허용): [입력, 이유] */
const KNOWN_FALSE_POSITIVES = [
  ['Scunthor', "'cunt' 가 들어 있어 막힘(유명한 Scunthorpe 문제)"],
  ['shiitake', "'shit' 로 접혀 막힘"],
  ['고등학교', '학교·고등 표현이라 개인정보 안내로 막힘']
];

module.exports = { EXTRA, BYPASS_EXTRA, SPEC_EXAMPLES, REAL_B64, FORMAT, PII, LEGIT, KNOWN_LIMITS, KNOWN_FALSE_POSITIVES };
