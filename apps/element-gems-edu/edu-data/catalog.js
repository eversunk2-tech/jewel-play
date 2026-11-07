/* element-gems-edu - edu-data/catalog.js
 * 교육용 문제 카탈로그 (spec §21.3·§21.4.3). 학습단원 선택 화면(edu.js)이 읽고, 검증기(tools/validate-edu-data.js)가 대조한다.
 * - 브라우저: <script src="edu-data/catalog.js"> 로 불러오면 window.EDU_CATALOG 가 생긴다 (ES module 아님, file:// 에서도 열린다).
 * - Node: require('./edu-data/catalog.js') 가 같은 객체를 돌려준다.
 *
 * 늘리는 법 (코드 수정 불필요):
 *   · 새 소단원  = 해당 단원의 subs 에 { no, id, name, pages, count: 60, file } 한 줄 추가 + 문제 파일 edu-data/q/{id}.js 만들기
 *   · 1학기 열기 = 해당 학년의 { term: 1, ready: false } 를 { term: 1, ready: true, units: [ ... ] } 로 바꾸기
 *   · 새 과목    = subjects 에 { id, name, ready: true, grades: [ ... ] } 추가 (과목 ready:false 면 선택 칩을 보이지 않는다)
 *   · id 규칙: '{과목}-{학년}-{학기}-{단원}-{소단원}' (예: soc-3-2-1-1), file 규칙: 'edu-data/q/{id}.js'
 *   · pages 를 비우면('') 교과서 쪽수 표시가 사라진다 (spec §21.5.1).
 * 단원·소단원 이름과 쪽수는 학습지 제목 줄과 일치해야 한다 (test/edu-data.test.js 가 원문 폴더가 있을 때 대조).
 */
(function () {
  'use strict';
  var CATALOG = {
    v: 1,
    subjects: [
      {
        id: 'soc', name: '사회', ready: true,
        grades: [
          { grade: 3, terms: [
            { term: 1, ready: false },
            { term: 2, ready: true, units: [
              { no: 1, name: '사회 변화와 다양한 문화', subs: [
                { no: 1, id: 'soc-3-2-1-1', name: '사회 변화로 달라진 생활 모습', pages: '6-33', count: 60, file: 'edu-data/q/soc-3-2-1-1.js' },
                { no: 2, id: 'soc-3-2-1-2', name: '다양한 문화에 대한 이해와 존중', pages: '34-59', count: 60, file: 'edu-data/q/soc-3-2-1-2.js' }
              ] },
              { no: 2, name: '옛날과 오늘날의 생활 모습', subs: [
                { no: 1, id: 'soc-3-2-2-1', name: '옛날과 오늘날의 풍습', pages: '66-93', count: 60, file: 'edu-data/q/soc-3-2-2-1.js' },
                { no: 2, id: 'soc-3-2-2-2', name: '교통의 변화로 달라진 생활 모습', pages: '94-119', count: 60, file: 'edu-data/q/soc-3-2-2-2.js' },
                { no: 3, id: 'soc-3-2-2-3', name: '통신수단의 변화로 달라진 생활 모습', pages: '120-145', count: 60, file: 'edu-data/q/soc-3-2-2-3.js' }
              ] }
            ] }
          ] },
          { grade: 4, terms: [
            { term: 1, ready: false },
            { term: 2, ready: true, units: [
              { no: 1, name: '민주주의와 자치', subs: [
                { no: 1, id: 'soc-4-2-1-1', name: '학교생활 속 민주주의', pages: '6-29', count: 60, file: 'edu-data/q/soc-4-2-1-1.js' },
                { no: 2, id: 'soc-4-2-1-2', name: '주민 자치와 민주주의', pages: '30-53', count: 60, file: 'edu-data/q/soc-4-2-1-2.js' }
              ] },
              { no: 2, name: '지역문제를 해결하고 지역을 알리는 노력', subs: [
                { no: 1, id: 'soc-4-2-2-1', name: '지역문제의 해결', pages: '54-79', count: 60, file: 'edu-data/q/soc-4-2-2-1.js' },
                { no: 2, id: 'soc-4-2-2-2', name: '지역을 알리는 노력', pages: '80-101', count: 60, file: 'edu-data/q/soc-4-2-2-2.js' }
              ] },
              { no: 3, name: '다양한 환경과 삶의 모습', subs: [
                { no: 1, id: 'soc-4-2-3-1', name: '지역의 환경과 변화', pages: '102-127', count: 60, file: 'edu-data/q/soc-4-2-3-1.js' },
                { no: 2, id: 'soc-4-2-3-2', name: '도시의 특징과 생활 모습', pages: '128-149', count: 60, file: 'edu-data/q/soc-4-2-3-2.js' }
              ] }
            ] }
          ] },
          { grade: 5, terms: [
            { term: 1, ready: false },
            { term: 2, ready: true, units: [
              { no: 1, name: '유적과 유물로 살펴본 옛 사람들의 생활', subs: [
                { no: 1, id: 'soc-5-2-1-1', name: '선사 시대와 고조선 사람들의 생활 모습', pages: '6-27', count: 60, file: 'edu-data/q/soc-5-2-1-1.js' },
                { no: 2, id: 'soc-5-2-1-2', name: '고대 사람들의 생각과 생활 모습', pages: '28-45', count: 60, file: 'edu-data/q/soc-5-2-1-2.js' },
                { no: 3, id: 'soc-5-2-1-3', name: '고려 사회와 사람들의 생활 모습', pages: '46-69', count: 60, file: 'edu-data/q/soc-5-2-1-3.js' }
              ] },
              { no: 2, name: '달라지는 시대, 변화하는 생활 모습', subs: [
                { no: 1, id: 'soc-5-2-2-1', name: '유교 문화의 영향으로 달라진 조선 사회', pages: '70-93', count: 60, file: 'edu-data/q/soc-5-2-2-1.js' },
                { no: 2, id: 'soc-5-2-2-2', name: '조선 후기 사회 변화와 달라진 생활 모습', pages: '94-115', count: 60, file: 'edu-data/q/soc-5-2-2-2.js' }
              ] },
              { no: 3, name: '식민 통치와 저항, 전쟁이 바꾼 사회와 생활', subs: [
                { no: 1, id: 'soc-5-2-3-1', name: '식민 통치와 저항으로 달라진 사회와 생활 모습', pages: '116-139', count: 60, file: 'edu-data/q/soc-5-2-3-1.js' },
                { no: 2, id: 'soc-5-2-3-2', name: '8·15 광복과 6·25 전쟁으로 달라진 사회와 생활 모습', pages: '140-159', count: 60, file: 'edu-data/q/soc-5-2-3-2.js' }
              ] }
            ] }
          ] },
          { grade: 6, terms: [
            { term: 1, ready: false },
            { term: 2, ready: true, units: [
              { no: 1, name: '세계의 자연환경', subs: [
                { no: 1, id: 'soc-6-2-1-1', name: '세계 여러 지역의 지형 경관과 다양한 생활 모습', pages: '6-29', count: 60, file: 'edu-data/q/soc-6-2-1-1.js' },
                { no: 2, id: 'soc-6-2-1-2', name: '세계의 기후와 다양한 생활 모습', pages: '30-53', count: 60, file: 'edu-data/q/soc-6-2-1-2.js' }
              ] },
              { no: 2, name: '시장경제와 국가 간 거래', subs: [
                { no: 1, id: 'soc-6-2-2-1', name: '우리나라 시장경제의 특징', pages: '54-77', count: 60, file: 'edu-data/q/soc-6-2-2-1.js' },
                { no: 2, id: 'soc-6-2-2-2', name: '경제성장과 우리 생활', pages: '78-93', count: 60, file: 'edu-data/q/soc-6-2-2-2.js' },
                { no: 3, id: 'soc-6-2-2-3', name: '세계 속의 무역', pages: '94-117', count: 60, file: 'edu-data/q/soc-6-2-2-3.js' }
              ] },
              { no: 3, name: '지구촌 사람들', subs: [
                { no: 1, id: 'soc-6-2-3-1', name: '세계의 인구 분포', pages: '118-139', count: 60, file: 'edu-data/q/soc-6-2-3-1.js' },
                { no: 2, id: 'soc-6-2-3-2', name: '지구촌의 문제와 지속가능한 미래', pages: '140-161', count: 60, file: 'edu-data/q/soc-6-2-3-2.js' }
              ] }
            ] }
          ] }
        ]
      }
    ]
  };

  if (typeof window !== 'undefined') window.EDU_CATALOG = CATALOG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
})();
