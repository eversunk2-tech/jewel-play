// element-gems 명예의 전당 Worker - 자동 생성 파일입니다. 직접 고치지 말고 `node apps/element-gems/server/build.js` 로 다시 만드세요.
// 원본: apps/element-gems/nick-words.js, apps/element-gems/nickname.js, apps/element-gems/server/src/core.js, apps/element-gems/server/src/worker.js
// 사용: Cloudflare 대시보드 > Worker > Edit code 에 이 파일 전체를 붙여넣고 Deploy 합니다. (비밀 정보는 들어 있지 않습니다)
const __mods = {};
const __cache = {};
function __require(name) {
  const key = String(name).split('/').pop().replace(/\.js$/, '');
  if (!__cache[key]) {
    const m = { exports: {} };
    __cache[key] = m;
    __mods[key](m, m.exports, __require);
  }
  return __cache[key].exports;
}

// ---- apps/element-gems/nick-words.js ----
__mods['nick-words'] = function (module, exports, require) {
  /* element-gems - nick-words.js
   * 닉네임 금칙어·예약어·연락 유도 목록 (spec §19.3.3). 클라이언트(nickname.js)와 서버(server/src/core.js)가 같은 파일을 쓴다.
   *
   * - 각 항목은 UTF-8 문자열을 base64로 바꾼 것이다. 저장소를 훑어볼 때 욕설이 그대로 보이지 않게 하려는 것이며 기밀이 아니다.
   * - 항목 앞에 붙는 기호: '=' 전체 일치만, '*' 글자 그대로 부분 일치, 없음 = 기본 규칙 (nickname.js 머리 주석 참고).
   * - 보는 법:  node apps/element-gems/server/tools/print-wordlist.js            (분류별 전체 출력)
   *             node apps/element-gems/server/tools/print-wordlist.js --counts   (개수만)
   * - 추가하는 법: node apps/element-gems/server/tools/encode-word.js "단어"  -> 나온 base64를 해당 분류 배열에 붙여 넣는다.
   *   바꾼 뒤에는 node apps/element-gems/server/build.js 로 서버 dist/worker.js를 다시 만들고 서버를 재배포한다.
   * - allow 분류: 한글 항목은 개인정보·금칙어 검사 전에 입력에서 지우고, 영문 항목(소문자, 예: shiitake)은 영문 뷰에서 그 부분만 '#'으로 바꿔 가린다(앞뒤 글자와 이어지지 않음).
   * - 이 파일의 목록은 사용자 검수 대상이다. 오탐(괜찮은 이름이 막힘)과 누락(막혀야 하는 이름이 통과)을 발견하면 알려 주세요.
   */
  (function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module && module.exports) module.exports = factory();
    else root.ElementGemsNickWords = factory();
  })(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
      version: 1,
      // 사칭 예약어 (운영자·게임 캐릭터 이름) - 53개
      reserved: [
        '6rSA66as7J6Q', '7Jq07JiB7J6Q', '7Jq07JiB', '6rO17Iud',
        '7ISg7IOd64uY', '7ISg7IOd', '6rWQ7IKs', '7Ja065Oc66+8',
        '7Iuc7Iqk7YWc', '7JuQ7IaM67O07ISd', '7J206re464uI', '7JWE7L+g7JWE',
        '66as7ZSE', '67O87Yq4', '64W57Iqk', '66Oo66+4',
        '6rCc67Cc7J6Q', '7KCc7J6R7J6Q', '6rOg6rCd7IS87YSw', '7IOB64u07JuQ',
        'PeyngOyXoA==', 'PeqzteyngA==', 'YWRtaW4=', 'YWRtaW5pc3RyYXRvcg==',
        'PW1vZA==', 'bW9kZXJhdG9y', 'PWdt', 'c3RhZmY=',
        'c3lzdGVt', 'b2ZmaWNpYWw=', 'dGVhY2hlcg==', 'c3VwcG9ydA==',
        'ZWxlbWVudGdlbXM=', 'ZGV2ZWxvcGVy', 'c3lzb3A=', '6rSA66as7J24',
        '6rSA66as7JuQ', '6rSA66as7YyA', '7Iqk7YOc7ZSE', '7Iqk7YOt',
        '66qo642U66CI7J207YSw', '66qo642w66CI7J207YSw', '7Yuw7LKY', '7Yuw7LOQ',
        '6rCQ64+F6rSA', '66ek64uI7KCA', '6rKM7J6E66eI7Iqk7YSw', 'aWduaXM=',
        'PWtub3g=', 'PWx1bWk=', 'PWFxdWE=', 'bWFuYWdlcg==',
        'Z2FtZW1hc3Rlcg=='
      ],
      // 개인정보 (학교·학년·연락처 표현) - 30개
      pii: [
        '7ZWZ6rWQ', '7ZWZ64WE', '7LSI65Ox', '7KSR7ZWZ',
        '6rOg65Ox', '7ZWZ7JuQ', '7LSI65Sp', '7KSR65Sp',
        '6rOg65Sp', '64yA65Sp', '7Jyg7LmY7JuQ', '7ZWZ67KI',
        '64u07J6E', '7ZWZ67aA66qo', '7KO866+865Ox66Gd', '7KO866+867KI7Zi4',
        '7KCE7ZmU67KI7Zi4', '7ZW465Oc7Y+w', '7Zy064yA7Y+w', '7Y+w67KI7Zi4',
        '7Jew65297LKY', '7J2066mU7J28', '66mU7J287KO87IaM', '7KeR7KO87IaM',
        '7Iuk66qF', '6rOo67GF7J20', '64u37Lu0', 'ZG90Y29t',
        'aHR0cA==', 'd3d3'
      ],
      // 연락 유도 (메신저·SNS 서비스 이름) - 62개
      contact: [
        '7Lm07Yah', '6rmM65iR', '7Lm065iR', '7Lm07Lm07Jik',
        '7Lm07Lm07Jik7Yah', '7Jik7ZSI7LGE7YyF', '7Jik7ZSI7Lm07Yah', '7Jik7ZSI7Yah',
        '7J247Iqk7YOA', '7J247Iqk7YOA6re4656o', '7J2467OE', '65SU7L2U',
        '65SU7Iqk7L2U65Oc', '7YWU66CI6re4656o', 'PeudvOyduA==', '65287J247JWE7J2065SU',
        '7Yux7Yah', '7Y6Y67aB', '7Y6Y7J207Iqk67aB', '7Yq47JyE7YSw',
        '7Iqk64OF7LGX', '7JyE7LGX', '7JmT7Lig7JWx', '7KCE67KI',
        '7Lmc7LaU', '66ee7YyU', '67KI7Zi46rWQ7ZmY', '7JWE7J2065SU6rWQ7ZmY',
        '7Jew65297KO87IS47JqU', 'a2FrYW8=', 'a2FrYW90YWxr', 'a2F0YWxr',
        'aW5zdGE=', 'aW5zdGFncmFt', 'ZGlzY29yZA==', 'dGVsZWdyYW0=',
        'dGlrdG9r', 'ZmFjZWJvb2s=', 'dHdpdHRlcg==', 'c25hcGNoYXQ=',
        'd2hhdHNhcHA=', 'd2VjaGF0', 'b3BlbmNoYXQ=', 'Z21haWw=',
        'aGFubWFpbA==', '64Sk7J2067KE', 'bmF2ZXI=', '64+E7Yq47Lu0',
        '64+E7Yq47LyA7J207JWM', '64u37LyA7J207JWM', 'ZG90a3I=', 'ZG90bmV0',
        '64u364S3', 'ZGF1bQ==', '64uk7J2M66mU7J28', 'aG90bWFpbA==',
        'aWNsb3Vk', 'c2t5cGU=', '7Iqk7Lm07J207ZSE', '65SU7Jeg7KO87IS47JqU',
        '7KCE7ZmU7KO87IS47JqU', '66y47J6Q7KO87IS47JqU'
      ],
      // 오탐 방지 예외 (한글: 먼저 지우는 단어 / 영문: 영문 검사에서 가려 두는 단어) - 16개
      allow: [
        '6rOg65Ox7Ja0', '7Iug67Cc', '7Iug67CU656M', '7Iuc67CU6rKs',
        '7KG4652866eo', '66mU6rCI66Gc', 'c2hpaXRha2U=', 'aW5zdGFudA==',
        'aW5zdGFsbA==', 'aW5zdGFuY2U=', 'dGhvcm55', 'cmFwcGluZw==',
        'd3JhcHBpbmc=', 'dHJhcHBpbmc=', 'c2NyYXBpbmc=', 'c3RyYXBwaW5n'
      ],
      // 한국어 금칙어 (욕설·성적·혐오·폭력·약물/도박) - 183개
      ko: [
        '7Iuc67Cc', '7Iuc7YyU', '7Iuc7Y6E', 'KuyLnOuyjA==',
        'KuyUqOuyjA==', '7Iuc67aA656E', '7JSo67aA65+0', '67OR7Iug',
        '67iF7Iug', '67mZ7Iug', '6rCc7IOI64G8', '6rCc7J6Q7Iud',
        '6rCc7IOI7YKk', 'KuyMlOuBvA==', 'KuyDiOq6hA==', 'KuyDie2eiA==',
        'KuyDiO2CpA==', 'KuyngOuehA==', 'KuylkOuehA==', 'KuyngOuftA==',
        'KuyXvOuzkQ==', 'KuyYmOuzkQ==', 'Kuyihg==', 'KuyhsOq5jA==',
        'KuyhtOuCmA==', 'KuyhuOudvA==', 'KuyhtOuCtA==', 'KuyhsOuCuA==',
        'KuyhtOuLiA==', 'KuyMjeuGiA==', 'KuyMjeuFhA==', 'KuyNhQ==',
        'PeyUuQ==', 'KuyUueyDiA==', 'KuyUueuFhA==', 'KuyUue2VoA==',
        'KuyUueywvQ==', 'KuyUueuNlQ==', 'KuyUueuYpQ==', 'KuyUueyVjA==',
        'KuyUue2MlA==', 'KuuLpeyzkA==', 'Kuq6vOyguA==', 'KuyXv+uouQ==',
        'KuyjveyWtA==', 'KuyjveyXrA==', 'KuyjveyduOuLpA==', 'KuyjveydvA==',
        'KuuSpOyguA==', 'KuuSiOyguA==', 'KuuUlOyguA==', 'KuuSiOynhA==',
        '66mN7LKt7J20', '65iQ65287J20', '64+M7JWE7J20', 'KuuvuOy5nOuGiA==',
        'KuuvuOy5nOuFhA==', 'KuuvuOy5nOyDiA==', 'KuywkOuUsA==', 'KuyZleuUsA==',
        'KuuTseyLoA==', 'KuuouOyggOumrA==', 'KuqwnOuPvOyngA==', 'Ku2VnOuCqOy2qQ==',
        'KuunmOy2qQ==', 'Kuq4ieyLney2qQ==', 'KuyEpOuqhey2qQ==', 'Ku2LgOuUsQ==',
        'Kuq5gOy5mOuFgA==', 'KuuQnOyepeuFgA==', 'Kuynseq5qA==', 'KuynseqwnA==',
        'KuyqveuwlOumrA==', 'KuyqveuwnOydtA==', 'Kuq5nOuRpeydtA==', 'KuyhsOyEvOynlQ==',
        'KuuYpeuCqOyVhA==', 'KuyghOudvOuUlOyWuA==', 'KuqwnOuPhQ==', 'KuydvOuyoA==',
        'KuuplOqwiA==', 'KuygleuwleyVhA==', 'KuuKkOq4iA==', 'KuuLiOyVoOuvuA==',
        'KuuLiOyXhOuniA==', 'KuuLiOuvuA==', 'KuyVoOuvuA==', 'KuyXoOywvQ==',
        'KuyVsOywvQ==', 'Ku2MqOuTnOumvQ==', 'KuyEueyKpA==', 'KuyEueyLnA==',
        'KuyVvOuPmQ==', 'KuyVvO2VnA==', 'KuyVvOyEpA==', 'KuyVvOqynA==',
        'Ku2PrOultOuFuA==', 'KuuztOyngA==', 'KuyekOyngA==', 'Kuyglu2GtQ==',
        'Kuyglu2DsQ==', 'KuycoOuRkA==', 'KuydjOqyvQ==', 'KuydjOu2gA==',
        'KuydjOuegA==', 'KuydjO2DlQ==', 'KuuwnOyglQ==', 'KuuUuOuUuA==',
        'KuuUuOy5mA==', 'KuuUuOyzkA==', 'KuyekOychA==', 'KuyEseq4sA==',
        'KuyEseq0gOqzhA==', 'KuyEse2WieychA==', 'KuyEse2PrQ==', 'KuqwleqwhA==',
        'KuycpOqwhA==', 'KuyEsey2lO2WiQ==', 'KuuqsOy5tA==', 'KuuquOy6oA==',
        'KuyhsOqxtOunjOuCqA==', 'KuyEseunpOunpA==', 'KuywveuFgA==', 'KuywveuGiA==',
        'KuyDieuFgA==', 'KuyDieuniA==', 'KuyEue2MjA==', 'KuuzgO2DnA==',
        'Kuq8tOumrA==', 'Kuq8tOugpA==', 'KuuwnOq4sA==', 'KuygleyVoQ==',
        'KuyYpOultOqwgA==', 'Ku2bhOyepQ==', 'KuyVoOustA==', 'KuyTsOumrOyNuA==',
        'KuuFuOy9mA==', 'Kuy9mOuPlA==', 'Kuygluq8rQ==', 'Kuu5qO2GtQ==',
        'KuyekOyCtA==', 'KuyekO2VtA==', 'KuyCtOyduA==', 'Ku2VmeyCtA==',
        'KuyCtO2VtA==', 'Ku2FjOufrA==', 'KuqzoOusuA==', 'KuuqqeunpA==',
        'KuyLnOyytA==', 'KuqzoOyWtA==', 'Kuy5vOu2gOumvA==', 'Kuy0neyCtA==',
        'KuywuOyImA==', 'KuuniOyVvQ==', 'KuuMgOuniOy0iA==', 'Ku2VhOuhnO2PsA==',
        'Ku2eiOuhnOu9lQ==', 'Kuy9lOy5tOyduA==', 'Ku2XpOuhnOyduA==', 'KuyXkeyKpO2EsOyLnA==',
        'Ku2ZmOqwgQ==', 'KuuPhOuwlQ==', 'Kuy5tOyngOuFuA==', 'KuuwlOy5tOudvA==',
        'KuyKrOuhr+uouOyLoA==', 'KuqyveuniA==', 'KuuyoO2MhQ==', 'Ku2ZgOuNpA==',
        'Kuu2iOuyleuPhOuwlQ==', 'Ku2GoO2GoOyCrOydtO2KuA==', 'KuuLtOuwsA==', 'Ku2doeyXsA==',
        'KuuLiOy9lO2LtA==', 'PeyLnOu2iA==', 'PeyUqOu2iA==', 'PeyLnOu4lA==',
        'PeyUqOu4lA==', 'PeuwnOyLnA==', 'PeuwnOyUqA==', 'Pe2MlOyLnA==',
        'Pe2MlOyUqA==', 'PeuyjOyLnA==', 'PeuyjOyUqA=='
      ],
      // 영어 금칙어 - 171개
      en: [
        'ZnVjaw==', 'ZnVr', 'ZmNr', 'ZnZjaw==',
        'cGh1Y2s=', 'ZnVja2Vy', 'bW90aGVyZnVja2Vy', 'c2hpdA==',
        'c2h0', 'YnVsbHNoaXQ=', 'Yml0Y2g=', 'YmlhdGNo',
        'YmFzdGFyZA==', 'YXNzaG9sZQ==', 'YXJzZWhvbGU=', 'PWFzcw==',
        'PWFyc2U=', 'amFja2Fzcw==', 'ZHVtYmFzcw==', 'c21hcnRhc3M=',
        'PWRpY2s=', 'ZGlja2hlYWQ=', 'PWNvY2s=', 'Y29ja3N1Y2tlcg==',
        'Y3VudA==', 'cHVzc3k=', 'd2hvcmU=', 'c2x1dA==',
        'c2thbms=', 'bmlnZ2Vy', 'bmlnZ2E=', 'PW5lZ3Jv',
        'ZmFnZ290', 'PWZhZw==', 'PWR5a2U=', 'PWhvbW8=',
        'PXRyYW5ueQ==', 'cmV0YXJk', 'cmV0YXJkZWQ=', 'Y2hpbms=',
        'Z29vaw==', 'PWtpa2U=', 'd2V0YmFjaw==', 'PXNwaWM=',
        'PXBha2k=', 'PWNvb24=', 'aGl0bGVy', 'bmF6aQ==',
        'Z2Vub2NpZGU=', 'dGVycm9yaXN0', 'cmFwaXN0', 'PXJhcGU=',
        'cmFwaW5n', 'cG9ybg==', 'cG9ybm8=', 'cG9ybmh1Yg==',
        'eHZpZGVvcw==', 'b25seWZhbnM=', 'PXh4eA==', 'PXNleA==',
        'c2V4eQ==', 'c2V4dWFs', 'c2V4dGluZw==', 'c2V4Y2Ft',
        'bnVkZQ==', 'bnVkZXM=', 'bmFrZWQ=', 'Ym9vYg==',
        'Ym9vYnM=', 'PXRpdHM=', 'dGl0dGllcw==', 'cGVuaXM=',
        'dmFnaW5h', 'PWFudXM=', 'PWFuYWw=', 'b3JnYXNt',
        'bWFzdHVyYmF0', 'aGVudGFp', 'PW1pbGY=', 'ZGlsZG8=',
        'Ymxvd2pvYg==', 'aGFuZGpvYg==', 'PWN1bQ==', 'Y3Vtc2hvdA==',
        'aml6eg==', 'aG9ybnk=', 'ZXJvdGlj', 'ZmV0aXNo',
        'aW5jZXN0', 'cGVkb3BoaWxl', 'cGFlZG8=', 'PXBlZG8=',
        'bW9sZXN0', 'c3VpY2lkZQ==', 'c2VsZmhhcm0=', 'bXVyZGVy',
        'a2lsbHlvdQ==', 'PXd0Zg==', 'PXN0ZnU=', 'PW9tZmc=',
        'c3R1cGlk', 'aWRpb3Q=', 'bW9yb24=', 'aW1iZWNpbGU=',
        'PWNyYXA=', 'PWRhbW4=', 'Z29kZGFtbg==', 'cGlzcw==',
        'Y29jYWluZQ==', 'PWhlcm9pbg==', 'PW1ldGg=', 'bWV0aGFtcGhldGFtaW5l',
        'bWFyaWp1YW5h', 'Y2FubmFiaXM=', 'PXdlZWQ=', 'PWxzZA==',
        'ZWNzdGFzeQ==', 'b3BpdW0=', 'Z2FtYmxl', 'Z2FtYmxpbmc=',
        'Y2FzaW5v', 'YmV0dGluZw==', 'dmFwZQ==', 'Y2lnYXJldHRl',
        'PWZ1cQ==', 'PWZ4Y2s=', 'PWZjdWs=', 'PWZ1a2s=',
        'PWZ1Y2M=', 'PWZ1dWs=', 'PWZ1Yw==', 'PWZ1eGs=',
        'PXBodWs=', 'PXBodXE=', 'PWZ1a2luZw==', 'PWZja2luZw==',
        'PWZraW5n', 'PXNoeXQ=', 'PXNoZXQ=', 'PXNoZWl0',
        'PXNoaWV0', 'PXNoeXRl', 'PWJ5dGNo', 'PWJpdGM=',
        'PWJpb3RjaA==', 'PWJlYXRjaA==', 'PWJ0Y2g=', 'PWRpaw==',
        'PWRpa2s=', 'PWNvaw==', 'PXB1c3k=', 'PXB1c3Np',
        'PXByb24=', 'PXJldHJk', 'PXRhcmQ=', 'PXNlZXg=',
        'PXNleHg=', 'PXNla3M=', 'PXNlY2tz', 'PXNleGk=',
        'PWt5cw==', 'PWttcw==', 'PWhvZQ==', 'PWhvZXM=',
        'PWJhc3RlcmQ=', 'PWJhc3RyZA==', 'PW5pYmJh', 'PW5pcXFh',
        'PWZhZ2c=', 'PWFzc2hhdA==', 'PWFzc3dpcGU='
      ],
      // 한국어 욕설을 알파벳으로 쓴 표현 - 34개
      rom: [
        'c2liYWw=', 'c2hpYmFs', 'c2lwYWw=', 'am90bmE=',
        'am9ubmE=', 'Ynl1bmdzaW4=', 'Ynllb25nc2lu', 'Ynl1bmdzaGlu',
        'Ynllb25nc2hpbg==', 'Z2Flc2Fla2tp', 'Z2Flc2Fla2k=', 'Z2Flc2FlZ2k=',
        'Z2Flc2Vra2k=', 'amlyYWw=', 'anlyYWw=', 'bWljaGlubm9t',
        'bWljaGlubnllb24=', 'PW55ZW9u', 'c3Nhbmdub20=', 'c3NhbmdueWVvbg==',
        'PWlsYmU=', 'PWFlbWk=', 'PWphc2lr', 'Z2Flbm9t',
        'Z2FlamFzaWs=', 'amphbmdnYWU=', 'ampva2Jhcmk=', 'am9rYmFyaQ==',
        'aGFubmFtY2h1bmc=', 'bWFtY2h1bmc=', 'a2ltY2hpbnllbw==', 'bmVvZ2V1bQ==',
        'ZGFrY2h5ZW8=', 'a2tlb2p5ZW8='
      ]
    };
  });
};

// ---- apps/element-gems/nickname.js ----
__mods['nickname'] = function (module, exports, require) {
  /* element-gems - nickname.js
   * 닉네임 검증 모듈 (spec §19.3.3). 순수 함수만 있고 DOM·네트워크를 쓰지 않는다.
   * 클라이언트(브라우저 전역 ElementGemsNick)와 서버(server/src/core.js, require)가 **같은 파일**을 쓴다.
   * 스크립트 순서: nick-words.js -> nickname.js -> ...
   *
   * 사용:  var r = ElementGemsNick.validateNick('별빛냥', extraBlock);
   *        r.ok === true  -> { ok:true, nick:'별빛냥', key:'별빛냥', message:'멋진 이름이에요! ...' }
   *        r.ok === false -> { ok:false, code:'nick_pii', message:'...쉬운 안내...', field:'nick' }
   *   - 앞뒤 공백을 지우지 않는다(공백은 허용 문자가 아니므로 nick_charset). 필요하면 호출하는 쪽에서 trim() 한 뒤 넣는다.
   *   - extraBlock: 추가 금칙어(배열 또는 쉼표로 구분한 문자열). 서버의 EXTRA_BLOCK 변수. 클라이언트는 보통 생략.
   *
   * 검사 순서: 정규화(NFC) -> 형식(길이·문자·숫자·반복) -> 예약어 -> 개인정보·연락 유도 -> 금칙어. 걸린 첫 단계의 안내 한 가지만 돌려준다.
   *
   * 금칙어 매칭(입력과 목록에 같은 정규화를 적용한 뒤 비교):
   *   V1 한글만(영문·숫자 끼워넣기 제거)      V2 한글 느슨한 자모열(된소리->평음, ㅐ/ㅔ·ㅙ/ㅞ/ㅚ·ㅢ/ㅟ 통합, y-활음 접기, 받침 제거, 초성 ㅇ 제거)
   *   V3 영문(소문자, 숫자->글자 치환 0o 1i 3e 4a 5s 7t 8b 또는 숫자 제거, 영문 외 제거, 같은 글자 2연속 압축)
   *   V4 원문 소문자(예약어·연락 유도 부분 문자열)
   *   추가 뷰: V5 한글을 로마자로 바꿔 영문과 섞은 문자열(시bal), 자판 변환(한글 욕설을 영문 자판으로 친 tlqkf 같은 형태)
   *           V3-l 영문 뷰에서 숫자 1과 대문자 I를 소문자 l로 읽은 것(s1ut, hitIer). 닉네임에 1 또는 I가 있을 때만 만든다.
   * 항목 앞 기호: '=' 전체 일치만 / '*' 글자 그대로 부분 일치(V2를 쓰지 않음) / 없음 = 기본 규칙
   *   기본 규칙(금칙어): 한글은 V2 키가 4자모 이상이면 V2 부분 일치, 그보다 짧으면 V1 전체 일치. 영문은 압축한 글자가 4자 이상이면 부분 일치, 짧으면 전체 일치.
   *   예약어·개인정보·연락 유도의 한글 항목은 V1 글자 그대로 부분 일치(소프트 키 안 씀).
   *   2음절 한글 금칙어(기호 없음)는 V2 일치 뒤에 받침을 한 번 더 본다: 항목에 받침이 있으면 같은 무리의 받침(마지막 음절은 받침 없음도)만,
   *   받침이 없으면 받침 없음(첫 음절은 ㅂ·ㅅ·ㅆ·ㄷ 받침도: 십발류)만 금칙어로 본다. 받침을 모두 지우는 V2 때문에 별시계·불씨·심바 같은 정상 단어가 걸리던 오탐을 줄인다.
   *   허용 목록(allow)은 한글 항목(V1에서 먼저 지움)과 영문 항목(영문 뷰에서 '#'으로 바꿔 앞뒤 글자가 이어지지 않게 함)을 함께 쓴다.
   * 알려진 한계: 음절을 쪼개 넣는 우회(받침을 별도 음절로 풀어 쓰기)와 새로 만든 은어는 못 잡는다.
   *   server/test/nick-vectors.js 머리 주석과 server/README.md 에 정리했다.
   */
  (function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module && module.exports) module.exports = factory(require('./nick-words'));
    else root.ElementGemsNick = factory(root.ElementGemsNickWords);
  })(typeof self !== 'undefined' ? self : this, function (WORDS) {
    'use strict';

    var LIMITS = { minLen: 2, maxLen: 8, maxDigits: 3, maxInput: 64 };

    var MESSAGES = {
      nick_length: '이름은 2~8글자로 만들어 주세요.',
      nick_charset: '한글, 영어, 숫자만 쓸 수 있어요. (띄어쓰기, 그림 글자, 특수문자는 안 돼요)',
      nick_charset_jamo: "'ㅋ', 'ㅏ' 같은 낱글자만으로는 만들 수 없어요. 완성된 글자로 써 주세요.",
      nick_digits: '숫자는 3개까지만 쓸 수 있고, 숫자만으로는 만들 수 없어요.',
      nick_repeat: '같은 글자가 3번 이어지면 안 돼요.',
      nick_reserved: '운영하는 사람이나 게임 캐릭터처럼 보이는 이름은 쓸 수 없어요.',
      nick_pii: '학교, 학년·반, 연락처처럼 보이는 이름은 쓸 수 없어요. 나만의 별명으로 바꿔 보세요.',
      nick_blocked: '이 이름은 쓸 수 없어요. 다른 이름을 골라 볼까요?',
      nick_change_limit: '닉네임은 하루에 2번까지 바꿀 수 있어요. 내일 다시 해 보세요.',
      ok: '멋진 이름이에요! 저장하면 뒤에 번호 4자리가 붙어요.'
    };

    /* ---------------------------------------------------------------
     * 문자 유틸
     * ------------------------------------------------------------- */
    var RE_HANGUL_ONE = /[가-힣]/;
    var RE_ALLOWED = /^[가-힣A-Za-z0-9]+$/;
    var RE_JAMO = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;

    function hangulOnly(s) { return s.replace(/[^가-힣]/g, ''); }
    function compress(s) { return s.replace(/(.)\1+/g, '$1'); }
    function onlyLetters(s) { return s.replace(/[^a-z]/g, ''); }
    var DIGIT_SUBST = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
    function substDigits(s) { return s.replace(/[0-9]/g, function (d) { return DIGIT_SUBST[d] || ''; }); }

    var INIT_J = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    var MED_FOLD = 'ㅏㅔㅏㅔㅓㅔㅓㅔㅗㅘㅚㅚㅗㅜㅝㅚㅣㅜㅡㅣㅣ';   // 21개 중성 -> 접은 중성
    var INIT_FOLD = [0, 0, 2, 3, 3, 5, 6, 7, 7, 9, 9, 11, 12, 12, 14, 15, 16, 17, 18];

    /** V2: 한글 음절열 -> 느슨한 자모열 */
    function softKey(h) {
      var out = '';
      for (var i = 0; i < h.length; i++) {
        var c = h.charCodeAt(i) - 0xAC00;
        if (c < 0 || c > 11171) continue;
        var ini = INIT_FOLD[Math.floor(c / 588)];
        var med = Math.floor((c % 588) / 28);
        if (ini !== 11) out += INIT_J.charAt(ini);
        out += MED_FOLD.charAt(med);
      }
      return out.replace(/(.)\1+/g, '$1');      // 같은 자모 연속은 하나로 (머엉청이처럼 모음 음절을 끼워 넣는 우회 방어)
    }

    /** 한 음절의 비교용 정보: 접은 자모열(k), 받침 번호(f, 0=없음), 모음만 있는 음절인지(v) */
    function sylInfo(ch) {
      var c = ch.charCodeAt(0) - 0xAC00;
      if (c < 0 || c > 11171) return null;
      return { k: softKey(ch), f: c % 28, v: INIT_FOLD[Math.floor(c / 588)] === 11 };
    }
    /** 입력 한글 음절열 -> 음절 정보 배열. 앞 음절의 모음을 되풀이하는 모음 음절(시이발의 '이')은 접는다(V2의 같은 자모 접기와 같은 뜻) */
    function reduceSyl(v1) {
      var out = [];
      for (var i = 0; i < v1.length; i++) {
        var info = sylInfo(v1.charAt(i));
        if (!info) continue;
        if (info.v && out.length && out[out.length - 1].k.slice(-1) === info.k) continue;
        out.push(info);
      }
      return out;
    }
    // 받침 허용: 항목에 받침이 있으면 같은 무리의 받침(ㄴ·ㅁ·ㅇ은 한 무리, ㄹ 겹받침은 한 무리)이어야 하고, 마지막 음절만 받침이 없어도 된다.
    // 항목에 받침이 없으면 받침 없음, 또는 첫 음절의 ㄷ·ㅂ·ㅅ·ㅆ(십발류)
    function finClass(f) { return (f === 4 || f === 16 || f === 21) ? 4 : (f >= 8 && f <= 15) ? 8 : f; }
    function finOk(f, own, first) {
      if (own) return finClass(f) === finClass(own) || (!first && f === 0);
      return f === 0 || (first && (f === 7 || f === 17 || f === 19 || f === 20));
    }
    function strictHit(e, V) {
      var sy = V.sy || (V.sy = reduceSyl(V.v1));
      var a = e.syl[0], b = e.syl[1];
      for (var i = 0; i + 1 < sy.length; i++) {
        if (sy[i].k === a.k && sy[i + 1].k === b.k && finOk(sy[i].f, a.f, true) && finOk(sy[i + 1].f, b.f, false)) return true;
      }
      return false;
    }

    // 두벌식 자판(소문자로 접음: 된소리 R,E,Q,T,W 도 소문자)
    var KB_INIT = ['r', 'r', 's', 'e', 'e', 'f', 'a', 'q', 'q', 't', 't', 'd', 'w', 'w', 'c', 'z', 'x', 'v', 'g'];
    var KB_MED = ['k', 'o', 'i', 'o', 'j', 'p', 'u', 'p', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
    var KB_FIN = ['', 'r', 'r', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 't', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
    function qwerty(h) {
      var out = '';
      for (var i = 0; i < h.length; i++) {
        var c = h.charCodeAt(i) - 0xAC00;
        if (c < 0 || c > 11171) continue;
        out += KB_INIT[Math.floor(c / 588)] + KB_MED[Math.floor((c % 588) / 28)] + KB_FIN[c % 28];
      }
      return out;
    }

    // 국어의 로마자 표기(받침 소리 변화는 반영하지 않는 단순 변환)
    var RR_INIT = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
    var RR_MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
    var RR_FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
    /** V5: 한글은 로마자로, 영문은 소문자로, 숫자는 치환 글자로 (그 밖은 버림) */
    function romMix(s) {
      var out = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        var c = s.charCodeAt(i) - 0xAC00;
        if (c >= 0 && c <= 11171) out += RR_INIT[Math.floor(c / 588)] + RR_MED[Math.floor((c % 588) / 28)] + RR_FIN[c % 28];
        else if (/[A-Za-z]/.test(ch)) out += ch.toLowerCase();
        else if (DIGIT_SUBST[ch]) out += DIGIT_SUBST[ch];
      }
      return out;
    }

    function decodeB64(s) {
      var bin = atob(s);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }

    /* ---------------------------------------------------------------
     * 목록 컴파일 (처음 한 번만)
     * ------------------------------------------------------------- */
    /** 목록 항목(평문, 기호 포함) -> 비교용 객체. 비교할 글자가 없으면 null */
    function compileEntry(raw, strict) {
      var text = String(raw).trim();
      if (!text) return null;
      var flag = '';
      if (text.charAt(0) === '=' || text.charAt(0) === '*') { flag = text.charAt(0); text = text.slice(1).trim(); }
      text = text.normalize('NFC').toLowerCase();
      if (RE_HANGUL_ONE.test(text)) {
        var lit = hangulOnly(text);
        if (!lit) return null;
        var kb = flag === '=' ? '' : compress(qwerty(lit));
        var soft = softKey(lit);
        // 2음절 기본 규칙 항목은 받침까지 한 번 더 본다(strictHit). 서버 EXTRA_BLOCK 항목에는 쓰지 않는다(strict=false)
        var syl = (strict && !flag && lit.length === 2 && soft.length >= 4) ? [sylInfo(lit.charAt(0)), sylInfo(lit.charAt(1))] : null;
        return { k: 'ko', flag: flag, lit: lit, soft: soft, kb: kb.length >= 5 ? kb : '', syl: syl };
      }
      var letters = onlyLetters(text);
      if (!letters) return null;
      var comp = compress(letters);
      // 같은 글자가 겹친 항목(jonna)을 압축하면 짧아져 오탐(jonathan)이 나므로, 압축본은 충분히 길 때만 쓴다
      return { k: 'en', flag: flag, lit: letters, comp: comp, useComp: comp.length >= 4 && (comp === letters || comp.length >= 5) };
    }

    function compileList(arr, isEncoded) {
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var e = compileEntry(isEncoded ? decodeB64(arr[i]) : arr[i], isEncoded);
        if (e) out.push(e);
      }
      return out;
    }

    var RE_LATIN_ONLY = /^[a-z]+$/;
    var BASE = null;
    function base() {
      if (BASE) return BASE;
      var w = WORDS || {};
      var allowRaw = (w.allow || []).map(function (x) { return decodeB64(x).normalize('NFC').toLowerCase(); });
      BASE = {
        reserved: compileList(w.reserved || [], true),
        pii: compileList((w.pii || []).concat(w.contact || []), true),
        block: compileList((w.ko || []).concat(w.en || []), true),
        rom: compileList(w.rom || [], true),
        allow: allowRaw.map(hangulOnly).filter(Boolean),                                   // 한글 허용어: V1에서 먼저 지움
        allowEn: allowRaw.filter(function (x) { return RE_LATIN_ONLY.test(x); })           // 영문 허용어(shiitake 등): 영문 뷰에서 '#'으로 바꿈
      };
      return BASE;
    }

    var extraCache = { key: null, list: [] };
    function parseExtra(extra) {
      var arr = [];
      if (Array.isArray(extra)) arr = extra;
      else if (typeof extra === 'string') arr = extra.split(',');
      var key = arr.join('\u0001');
      if (extraCache.key === key) return extraCache.list;
      var list = compileList(arr, false);
      extraCache = { key: key, list: list };
      return list;
    }

    /* ---------------------------------------------------------------
     * 뷰(정규화된 입력) 만들기와 비교
     * ------------------------------------------------------------- */
    var DIGIT_SUBST_L = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
    function substDigitsL(s) { return s.replace(/[0-9]/g, function (d) { return DIGIT_SUBST_L[d] || ''; }); }
    function maskAllow(s, list) {
      for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) >= 0) s = s.split(list[i]).join('#');
      return s;
    }

    function buildViews(nick, allow, allowEn) {
      var lower = nick.toLowerCase();
      var v1 = hangulOnly(nick);
      if (allow) for (var i = 0; i < allow.length; i++) v1 = v1.split(allow[i]).join('');
      var a = onlyLetters(substDigits(lower));            // 숫자를 글자로 치환
      var b = onlyLetters(lower);                          // 숫자를 지움
      var r = romMix(nick);
      // 1과 대문자 I를 l로 읽는 뷰(s1ut, hitIer). 1 또는 I가 있을 때만 만든다
      var l = /[1I]/.test(nick) ? onlyLetters(substDigitsL(nick.replace(/I/g, 'l').toLowerCase())) : null;
      if (allowEn && allowEn.length) {
        a = maskAllow(a, allowEn); b = maskAllow(b, allowEn); r = maskAllow(r, allowEn);
        if (l !== null) l = maskAllow(l, allowEn);
      }
      return { v1: v1, v2: softKey(v1), a: a, b: b, aC: compress(a), bC: compress(b), r: r, rC: compress(r), l: l, lC: l === null ? null : compress(l), sy: null };
    }

    /** policy: 'literal'(예약어·개인정보·연락 유도) | 'block'(금칙어) */
    function matchKo(e, V, policy) {
      if (e.flag === '=') return V.v1 === e.lit;
      if (e.flag === '*' || policy === 'literal') {
        if (V.v1.indexOf(e.lit) >= 0) return true;
      } else if (e.soft.length >= 4) { if (V.v2.indexOf(e.soft) >= 0 && (!e.syl || strictHit(e, V))) return true; }
      else if (V.v1 === e.lit) return true;
      return policy === 'block' && !!e.kb && (V.aC.indexOf(e.kb) >= 0 || V.bC.indexOf(e.kb) >= 0);
    }
    function matchEn(e, V, withMix) {
      var l = V.l;                                          // 1·I를 l로 읽은 뷰(없으면 null)
      if (e.flag === '=') return V.a === e.lit || V.b === e.lit || (withMix && V.r === e.lit) || (l !== null && l === e.lit);
      if (e.flag === '*') return V.a.indexOf(e.lit) >= 0 || V.b.indexOf(e.lit) >= 0 || (withMix && V.r.indexOf(e.lit) >= 0) || (l !== null && l.indexOf(e.lit) >= 0);
      if (e.useComp) {
        return V.aC.indexOf(e.comp) >= 0 || V.bC.indexOf(e.comp) >= 0 || (withMix && V.rC.indexOf(e.comp) >= 0) || (l !== null && V.lC.indexOf(e.comp) >= 0);
      }
      if (e.lit.length >= 4) return V.a.indexOf(e.lit) >= 0 || V.b.indexOf(e.lit) >= 0 || (withMix && V.r.indexOf(e.lit) >= 0) || (l !== null && l.indexOf(e.lit) >= 0);
      return V.a === e.lit || V.b === e.lit || (l !== null && l === e.lit);
    }
    function findMatch(list, V, policy, withMix) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.k === 'ko' ? matchKo(e, V, policy) : matchEn(e, V, withMix)) return e;
      }
      return null;
    }
    function matchAny(list, V, policy, withMix) { return !!findMatch(list, V, policy, withMix); }

    /* ---------------------------------------------------------------
     * 개인정보 패턴
     * ------------------------------------------------------------- */
    var RE_PHONE_DIGITS = /01[016789]/;                      // 010, 011, 016~019
    var RE_PHONE_WORDS = /[공영]일[공영일이삼사오육칠팔구]/;     // 공일공, 영일영 ...
    var RE_CLASS_NUM = /[0-9]반/;                            // 3반
    var RE_CLASS_KO = /(^|[^가-힣])[삼사오육칠팔구십]반$/;     // 삼반 (일반·이반은 흔한 말·이름이라 제외, 조사반처럼 앞에 한글이 붙은 말도 제외)
    var RE_SCHOOL_END = /^[가-힣]{2,}[초중고]$/;       // ○○초 (끝의 숫자는 떼고 검사)
    var DIGIT_KO = { '0': '공', '1': '일', '2': '이', '3': '삼', '4': '사', '5': '오', '6': '육', '7': '칠', '8': '팔', '9': '구' };
    /** 한글은 그대로, 숫자는 한글 읽기로(공1공 -> 공일공), 나머지는 버림 */
    function koDigits(s) {
      var out = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (RE_HANGUL_ONE.test(ch)) out += ch;
        else if (DIGIT_KO[ch]) out += DIGIT_KO[ch];
      }
      return out;
    }
    function piiPattern(nick, V) {
      if (RE_PHONE_DIGITS.test(nick)) return true;
      if (RE_PHONE_DIGITS.test(nick.replace(/[^0-9]/g, ''))) return true;   // 0a1b0처럼 글자를 끼운 숫자
      if (RE_PHONE_WORDS.test(V.v1)) return true;
      if (/[0-9]/.test(nick) && RE_PHONE_WORDS.test(koDigits(nick))) return true;
      if (RE_CLASS_NUM.test(nick)) return true;
      var noTail = nick.replace(/[0-9]+$/, '');
      if (RE_CLASS_KO.test(noTail)) return true;
      if (RE_SCHOOL_END.test(noTail)) return true;
      return false;
    }

    /* ---------------------------------------------------------------
     * 공개 함수
     * ------------------------------------------------------------- */
    function normalizeNick(nick) { return typeof nick === 'string' ? nick.normalize('NFC') : ''; }
    /** 중복 판정용 키: NFC + 소문자 */
    function nickKey(nick) { return normalizeNick(nick).toLowerCase(); }

    function fail(code, variant) {
      return { ok: false, code: code, message: MESSAGES[variant || code], field: 'nick' };
    }

    function validateNick(nick, extraBlock) {
      if (typeof nick !== 'string') return fail('nick_charset');
      if (nick.length > LIMITS.maxInput) return fail('nick_length');
      var s = nick.normalize('NFC');

      // 형식
      var len = Array.from(s).length;
      if (len < LIMITS.minLen || len > LIMITS.maxLen) return fail('nick_length');
      if (!RE_ALLOWED.test(s)) return fail('nick_charset', RE_JAMO.test(s) ? 'nick_charset_jamo' : 'nick_charset');
      var digits = (s.match(/[0-9]/g) || []).length;
      if (digits > LIMITS.maxDigits || digits === len) return fail('nick_digits');
      if (/(.)\1\1/.test(s.toLowerCase())) return fail('nick_repeat');

      var B = base();
      // 예약어 (사칭)
      var Vr = buildViews(s, null);
      if (matchAny(B.reserved, Vr, 'literal', false)) return fail('nick_reserved');
      // 개인정보·연락 유도, 금칙어 (고등어·신발처럼 오탐이 잦은 단어는 먼저 지운 뷰로 검사)
      var Vp = (B.allow.length || B.allowEn.length) ? buildViews(s, B.allow, B.allowEn) : Vr;
      if (piiPattern(s, Vp) || matchAny(B.pii, Vp, 'literal', false)) return fail('nick_pii');
      var extra = parseExtra(extraBlock);
      if (matchAny(B.block, Vp, 'block', false) || matchAny(B.rom, Vp, 'block', true) || (extra.length && matchAny(extra, Vp, 'block', true))) {
        return fail('nick_blocked');
      }
      return { ok: true, nick: s, key: s.toLowerCase(), message: MESSAGES.ok };
    }

    /** 오류 코드 -> 안내 문구 (서버 오류 코드를 화면에 보일 때 사용) */
    function messageFor(code) { return MESSAGES[code] || MESSAGES.nick_blocked; }

    return {
      validateNick: validateNick,
      normalizeNick: normalizeNick,
      nickKey: nickKey,
      messageFor: messageFor,
      MESSAGES: MESSAGES,
      LIMITS: LIMITS,
      // 도구·시험용
      _softKey: softKey,
      _qwerty: qwerty,
      _romMix: romMix,
      _compileEntry: compileEntry,
      /** 어떤 항목에 걸렸는지 확인하는 검수용 도구: { list:'block', entry:{...} } 또는 null */
      _explain: function (nick, extraBlock) {
        var s = normalizeNick(nick), B = base(), V = buildViews(s, null), Vp = (B.allow.length || B.allowEn.length) ? buildViews(s, B.allow, B.allowEn) : V, e;
        if ((e = findMatch(B.reserved, V, 'literal', false))) return { list: 'reserved', entry: e };
        if ((e = findMatch(B.pii, Vp, 'literal', false))) return { list: 'pii', entry: e };
        if ((e = findMatch(B.block, Vp, 'block', false))) return { list: 'block', entry: e };
        if ((e = findMatch(B.rom, Vp, 'block', true))) return { list: 'rom', entry: e };
        if ((e = findMatch(parseExtra(extraBlock), Vp, 'block', true))) return { list: 'extra', entry: e };
        return null;
      },
      _base: base
    };
  });
};

// ---- apps/element-gems/server/src/core.js ----
__mods['core'] = function (module, exports, require) {
  /* element-gems server - core.js
   * 순수 함수 모음(DB·네트워크 없음): 상수, 별 계산, 진행 검증·병합, 정렬 키, 오리진 검사 등. spec §19.2, §19.4.
   * 닉네임 규칙은 클라이언트와 같은 ../../nickname.js 를 쓴다.
   */
  'use strict';

  const NICK = require('../../nickname');

  const API_VERSION = 1;
  const DIFFS = ['easy', 'normal', 'hard'];
  const BOARDS = ['all', 'easy', 'normal', 'hard'];
  const STAGES = 10;
  // 전체 탭 '별 점수' = 초보 별 x1 + 중수 별 x2 + 고수 별 x3 (최대 30+60+90 = 180). 난이도 탭은 별 개수 그대로. 클라이언트 표시용과 같은 값.
  const STAR_WEIGHT = { easy: 1, normal: 2, hard: 3 };
  const MAX_TOTAL_SCORE = 180;

  // game.js 의 CONFIG.difficulty[*].time.start / CONFIG.stages.star / CONFIG.stages.starBy 와 같아야 한다(server/test/core.test.js 가 대조).
  const START_TIME = { easy: 130, normal: 120, hard: 100 };
  const STAR_RATIO = [0.3, 0.5];                       // 기본: >=0.3 -> 2별, >=0.5 -> 3별
  const STAR_RATIO_BY = { hard: [0.15, 0.3] };         // 난이도별 덮어쓰기(spec §44): 고수는 >=0.15 -> 2별, >=0.3 -> 3별
  // spec §19.2.2 서버 허용 left 상한 = 시작 시간 + 20 (Review가 실제 최대를 확인한 뒤 필요하면 완화)
  const LEFT_CAP = { easy: 150, normal: 140, hard: 120 };

  const LIMITS = {
    bodyBytes: 2048,          // 요청 본문 최대
    writeIntervalSec: 3,      // 같은 pid의 쓰기 간격
    nickChangesPerDay: 2,
    regPerHour: 100,          // IP 해시당 시간당 등록 수
    topMax: 50,
    adminFailMax: 5,          // 관리자 키 실패 허용 횟수
    adminFailWindowSec: 600,
    leaderCacheSec: 30,
    avatarMax: 16
  };

  const EMPTY_PROG_STR = '-1,-1,-1,-1,-1,-1,-1,-1,-1,-1';

  /** 난이도 diff의 별 기준 [2별 비율, 3별 비율]. STAR_RATIO_BY[diff]가 올바른 모양이면 그것, 아니면 기본 STAR_RATIO. game.js의 starRatioOf와 같은 규칙 */
  function starRatioOf(diff) {
    const r = STAR_RATIO_BY[diff];
    if (Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number' && r[0] > 0 && r[0] < r[1] && r[1] <= 1) return r;
    return STAR_RATIO;
  }

  /** 별 계산용 정수 임계값. game.js의 starsFor(timeLeft/startTime, …, diff)(난이도별 비율 이상이면 3 / 2, else 1)와 같은 결과 */
  function starThresholds(diff) {
    const s = START_TIME[diff];
    const r = starRatioOf(diff);
    return { three: Math.ceil(s * r[1] - 1e-9), two: Math.ceil(s * r[0] - 1e-9) };
  }

  /** left(정수 초, >=0 = 클리어) -> 별 1~3. 미클리어(-1)면 0 */
  function starsForLeft(diff, left) {
    if (!(left >= 0)) return 0;
    const t = starThresholds(diff);
    if (left >= t.three) return 3;
    if (left >= t.two) return 2;
    return 1;
  }

  /** 'a,b,c,...' -> 길이 10 정수 배열. 이상하면 전부 -1 */
  function parseProg(str) {
    const out = String(str || '').split(',').map((x) => Number(x));
    if (out.length !== STAGES || out.some((x) => !Number.isInteger(x) || x < -1)) return new Array(STAGES).fill(-1);
    return out;
  }
  function serializeProg(arr) { return arr.join(','); }

  function emptyProgress() {
    return { easy: new Array(STAGES).fill(-1), normal: new Array(STAGES).fill(-1), hard: new Array(STAGES).fill(-1) };
  }

  /** 요청의 d 검증. 성공: { ok:true, d }, 실패: { ok:false, code:'progress_invalid', field } */
  function validateProgress(d) {
    const bad = (field) => ({ ok: false, code: 'progress_invalid', field });
    if (!d || typeof d !== 'object' || Array.isArray(d)) return bad('d');
    const keys = Object.keys(d);
    for (const k of keys) if (DIFFS.indexOf(k) < 0) return bad('d.' + k);
    for (const diff of DIFFS) {
      const arr = d[diff];
      if (!Array.isArray(arr) || arr.length !== STAGES) return bad('d.' + diff);
      for (let i = 0; i < STAGES; i++) {
        const v = arr[i];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < -1 || v > LEFT_CAP[diff]) return bad('d.' + diff + '[' + i + ']');
      }
    }
    return { ok: true, d: { easy: d.easy.slice(), normal: d.normal.slice(), hard: d.hard.slice() } };
  }

  /** 스테이지별 최대값 병합(감소 불가) */
  function mergeProgress(oldP, newD) {
    const out = {};
    for (const diff of DIFFS) {
      out[diff] = [];
      for (let i = 0; i < STAGES; i++) out[diff].push(Math.max(oldP[diff][i], newD ? newD[diff][i] : -1));
    }
    return out;
  }

  /** 연쇄 해금 검사: 스테이지 N이 클리어면 앞 스테이지도 전부 클리어여야 한다. 위반이면 field 문자열, 정상이면 null */
  function chainViolation(p) {
    for (const diff of DIFFS) {
      let seenGap = false;
      for (let i = 0; i < STAGES; i++) {
        if (p[diff][i] < 0) seenGap = true;
        else if (seenGap) return 'd.' + diff + '[' + i + ']';
      }
    }
    return null;
  }

  /** 난이도별 별 개수 { easy, normal, hard } -> 가중 별 점수 */
  function weightedScore(starsByDiff) {
    let sum = 0;
    for (const d of DIFFS) sum += (starsByDiff[d] || 0) * STAR_WEIGHT[d];
    return sum;
  }

  /** 진행 -> 난이도별·전체 합계. totalStars 는 가중 별 점수(DB 열 이름은 total_stars 유지), totalLeft 는 단순 합 */
  function computeTotals(p) {
    const t = { stars: {}, left: {}, best: {}, totalStars: 0, totalLeft: 0 };
    for (const diff of DIFFS) {
      let stars = 0;
      let left = 0;
      let best = 0;
      for (let i = 0; i < STAGES; i++) {
        const v = p[diff][i];
        if (v >= 0) { stars += starsForLeft(diff, v); left += v; best = i + 1; }
      }
      t.stars[diff] = stars;
      t.left[diff] = left;
      t.best[diff] = best;
      t.totalLeft += left;
    }
    t.totalStars = weightedScore(t.stars);
    return t;
  }

  /** 보드 -> D1 열 이름 */
  function boardCols(board) {
    if (board === 'all') return { stars: 'total_stars', left: 'total_left', up: 'up_all' };
    if (DIFFS.indexOf(board) < 0) return null;
    return { stars: 'stars_' + board, left: 'left_' + board, up: 'up_' + board };
  }

  /** 순위 비교 함수(SQL의 ORDER BY 와 같은 순서): 별 내림 -> 남은 시간 합 내림 -> 달성 시각 오름 -> id 오름 */
  function compareRank(a, b) {
    return (b.stars - a.stars) || (b.left - a.left) || (a.up - b.up) || (a.id - b.id);
  }

  /** 한국 시간(UTC+9) 날짜 번호 */
  function kstDay(nowSec) { return Math.floor((nowSec + 9 * 3600) / 86400); }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

  const PUB_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32
  const PUB_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
  function normalizePub(s) {
    if (typeof s !== 'string') return null;
    const u = s.toUpperCase();
    return PUB_RE.test(u) ? u : null;
  }

  /** 허용 오리진 검사. 목록은 쉼표 문자열. 항목은 정확히 같은 오리진이거나,
   *  localhost / 127.0.0.1 에 한해 포트 자리에 * 를 쓴 형태(http://localhost:*)를 허용한다. '*' 단독 항목은 무시한다. */
  function originAllowed(origin, list) {
    if (typeof origin !== 'string' || !origin || typeof list !== 'string') return false;
    const items = list.split(',').map((x) => x.trim()).filter(Boolean);
    for (const it of items) {
      if (it === '*') continue;
      if (it === origin) return true;
      const m = it.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)):\*$/);
      if (m && origin.indexOf(m[1] + ':') === 0 && /^\d{1,5}$/.test(origin.slice(m[1].length + 1))) return true;
    }
    return false;
  }

  /** 닉네임·아바타 검사. 실패하면 { ok:false, code, message, field } */
  function checkProfile(profile, extraBlock) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return { ok: false, code: 'bad_request', message: '프로필 형식이 올바르지 않아요.', field: 'profile' };
    }
    if (typeof profile.nick !== 'string') {
      return { ok: false, code: 'nick_charset', message: NICK.MESSAGES.nick_charset, field: 'nick' };
    }
    const r = NICK.validateNick(profile.nick, extraBlock);
    if (!r.ok) return r;
    const a = profile.avatar;
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 1 || a > LIMITS.avatarMax) {
      return { ok: false, code: 'avatar_invalid', message: '그림은 1~16번 중에서 골라 주세요.', field: 'avatar' };
    }
    return { ok: true, nick: r.nick, key: r.key, avatar: a };
  }

  /** 상수 시간 문자열 비교(길이가 달라도 같은 횟수만큼 순회) */
  function safeEqual(a, b) {
    const x = String(a);
    const y = String(b);
    let diff = x.length ^ y.length;
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i % (x.length || 1)) || 0) ^ (y.charCodeAt(i % (y.length || 1)) || 0);
    return diff === 0;
  }

  module.exports = {
    API_VERSION, STAR_WEIGHT, MAX_TOTAL_SCORE, weightedScore, DIFFS, BOARDS, STAGES, START_TIME, STAR_RATIO, STAR_RATIO_BY, LEFT_CAP, LIMITS, EMPTY_PROG_STR, PUB_ALPHABET,
    starRatioOf, starThresholds, starsForLeft, parseProg, serializeProg, emptyProgress, validateProgress, mergeProgress, chainViolation,
    computeTotals, boardCols, compareRank, kstDay, isUuid, normalizePub, originAllowed, checkProfile, safeEqual
  };
};

// ---- apps/element-gems/server/src/worker.js ----
__mods['worker'] = function (module, exports, require) {
  /* element-gems server - worker.js
   * Cloudflare Worker 본체: 라우팅, D1 사용, CORS, 서버측 검증. spec §19.4.
   * `handle(request, env, opts)` 하나를 Worker(dist/worker.js의 default export)와 로컬 목 서버(mock/server.js)가 함께 쓴다.
   *
   * env: DB(D1 바인딩, 이름은 반드시 DB), ALLOWED_ORIGINS(쉼표 목록), EXTRA_BLOCK(쉼표 목록, 선택),
   *      IP_SALT(비밀, 선택), ADMIN_KEY(비밀, 선택 - 있을 때만 /api/admin/* 동작), LB_CACHE_SEC(선택, 기본 30)
   * opts(시험용): { now: () => 밀리초, randomInt: (n) => 0..n-1 }
   * 주의: pid·IP·닉네임을 console 에 남기지 않는다.
   */
  'use strict';

  const core = require('./core');
  const NICK = require('../../nickname');

  const { LIMITS, DIFFS } = core;

  /* ------------------------------------------------------------------ 오류 */
  const STATUS = {
    bad_request: 400, too_large: 413, unsupported_version: 400,
    nick_length: 400, nick_charset: 400, nick_digits: 400, nick_repeat: 400, nick_reserved: 400, nick_pii: 400, nick_blocked: 400,
    avatar_invalid: 400, nick_change_limit: 429, progress_invalid: 400, progress_chain: 400, profile_required: 400,
    player_not_found: 404, forbidden_origin: 403, rate_limited: 429, db_unavailable: 503, server_error: 500,
    not_found: 404, method_not_allowed: 405, unauthorized: 401
  };
  const MESSAGES = {
    bad_request: '요청 형식이 올바르지 않아요.',
    too_large: '요청이 너무 커요.',
    unsupported_version: '앱을 새로 고쳐 주세요.',
    avatar_invalid: '그림은 1~16번 중에서 골라 주세요.',
    nick_change_limit: NICK.MESSAGES.nick_change_limit,
    progress_invalid: '기록 형식이 올바르지 않아요.',
    progress_chain: '기록 순서가 맞지 않아요.',
    profile_required: '먼저 이름과 그림을 정해 주세요.',
    player_not_found: '서버에 있던 프로필이 지워졌어요. 다시 만들 수 있어요.',
    forbidden_origin: '이 주소에서는 쓸 수 없어요.',
    rate_limited: '잠시 뒤에 다시 해 주세요.',
    db_unavailable: '지금은 순위표를 쓸 수 없어요. 조금 뒤에 다시 해 주세요.',
    server_error: '서버에 문제가 생겼어요. 조금 뒤에 다시 해 주세요.',
    not_found: '찾을 수 없어요.',
    method_not_allowed: '이 주소는 그 방식으로 쓸 수 없어요.',
    unauthorized: '권한이 없어요.'
  };

  class ApiError extends Error {
    constructor(code, field, extra) {
      super(code);
      this.code = code;
      this.status = (extra && extra.status) || STATUS[code] || 500;
      this.userMessage = (extra && extra.message) || MESSAGES[code] || NICK.messageFor(code);
      this.field = field || undefined;
      this.headers = (extra && extra.headers) || null;
    }
  }
  /** 중복 키(UNIQUE) 위반. 어떤 열인지 text 로 구분 */
  class UniqueError extends Error {
    constructor(text) { super('unique'); this.text = text; }
  }

  function classifyDbError(e) {
    const msg = String((e && e.message) || e);
    if (/UNIQUE constraint failed/i.test(msg)) return new UniqueError(msg);
    if (/no such (table|column)|has no column|no such index/i.test(msg)) {
      console.error('db schema error:', msg.slice(0, 160));            // 스키마를 같은 DB에 적용했는지 확인
      return new ApiError('server_error');
    }
    console.error('db error:', msg.slice(0, 160));
    return new ApiError('db_unavailable');
  }

  /* ------------------------------------------------------------------ DB 도우미 (D1 호환: prepare/bind/first/all/run) */
  async function dbExec(env, kind, sql, params) {
    if (!env || !env.DB || typeof env.DB.prepare !== 'function') {
      console.error('env.DB 바인딩이 없습니다(D1 바인딩 이름은 DB 여야 합니다).');
      throw new ApiError('server_error');
    }
    try {
      let st = env.DB.prepare(sql);
      if (params && params.length) st = st.bind.apply(st, params);
      if (kind === 'first') return (await st.first()) || null;
      if (kind === 'all') { const r = await st.all(); return (r && r.results) || []; }
      return await st.run();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw classifyDbError(e);
    }
  }
  const dbFirst = (env, sql, params) => dbExec(env, 'first', sql, params);
  const dbAll = (env, sql, params) => dbExec(env, 'all', sql, params);
  const dbRun = (env, sql, params) => dbExec(env, 'run', sql, params);

  /* ------------------------------------------------------------------ 암호·난수 */
  async function sha256hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const b = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return out;
  }
  function randInt(ctx, n) {
    if (ctx.opts.randomInt) return ctx.opts.randomInt(n);
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  function randomPub() {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    let s = '';
    for (let i = 0; i < 8; i++) s += core.PUB_ALPHABET.charAt(a[i] & 31);
    return s;
  }
  /** IP 해시 = SHA256(IP + 날짜 + IP_SALT) 앞 16자. 원본 IP는 저장·기록하지 않는다 */
  async function ipHashOf(ctx) {
    const ip = ctx.request.headers.get('cf-connecting-ip') || 'unknown';
    const day = new Date(ctx.nowMs).toISOString().slice(0, 10);
    return (await sha256hex(ip + '|' + day + '|' + (ctx.env.IP_SALT || ''))).slice(0, 16);
  }

  /* ------------------------------------------------------------------ 응답 */
  function respond(ctx, status, body, extraHeaders, cacheControl) {
    const h = new Headers();
    h.set('Content-Type', 'application/json; charset=utf-8');
    h.set('Vary', 'Origin');
    h.set('Cache-Control', cacheControl || 'no-store');
    h.set('X-Content-Type-Options', 'nosniff');
    if (ctx && ctx.cors) {
      h.set('Access-Control-Allow-Origin', ctx.origin);
      h.set('Access-Control-Expose-Headers', 'Retry-After');
    }
    if (extraHeaders) for (const k of Object.keys(extraHeaders)) h.set(k, extraHeaders[k]);
    return new Response(JSON.stringify(body), { status: status, headers: h });
  }
  function ok(ctx, body, cacheControl) {
    return respond(ctx, 200, Object.assign({ ok: true, v: core.API_VERSION }, body), null, cacheControl);
  }
  function errorResponse(ctx, e) {
    const err = {
      code: e.code,
      message: e.userMessage
    };
    if (e.field) err.field = e.field;
    return respond(ctx, e.status, { ok: false, v: core.API_VERSION, error: err }, e.headers);
  }

  /* ------------------------------------------------------------------ 요청 읽기 */
  async function readJson(ctx) {
    const cl = ctx.request.headers.get('content-length');
    if (cl && Number(cl) > LIMITS.bodyBytes) throw new ApiError('too_large');
    let text;
    try { text = await ctx.request.text(); } catch (e) { throw new ApiError('bad_request'); }
    if (new TextEncoder().encode(text).length > LIMITS.bodyBytes) throw new ApiError('too_large');
    let body;
    try { body = JSON.parse(text); } catch (e) { throw new ApiError('bad_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('bad_request');
    if (body.v === undefined) throw new ApiError('bad_request');
    if (body.v !== core.API_VERSION) throw new ApiError('unsupported_version');
    return body;
  }
  function requirePid(body) {
    if (!core.isUuid(body.pid)) throw new ApiError('bad_request', 'pid');
    return body.pid.toLowerCase();
  }

  /* ------------------------------------------------------------------ 순위표 캐시 (isolate 메모리, DB 객체별) */
  const CACHES = new WeakMap();
  function cacheFor(env) {
    let c = CACHES.get(env.DB);
    if (!c) { c = { top: {}, of: {} }; CACHES.set(env.DB, c); }
    return c;
  }
  function cacheSec(env) {
    const n = Number(env.LB_CACHE_SEC);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : LIMITS.leaderCacheSec;
  }

  async function boardTop(ctx, board) {
    const sec = cacheSec(ctx.env);
    const cache = cacheFor(ctx.env);
    const hit = cache.top[board];
    if (sec > 0 && hit && ctx.nowMs - hit.asOf < sec * 1000) return hit;
    const c = core.boardCols(board);
    const rows = await dbAll(ctx.env,
      'SELECT nick, tag, avatar, ' + c.stars + ' AS stars FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0' +
      ' ORDER BY ' + c.stars + ' DESC, ' + c.left + ' DESC, ' + c.up + ' ASC, id ASC LIMIT ' + LIMITS.topMax, []);
    const ent = {
      asOf: ctx.nowMs,
      rows: rows.map((r, i) => ({ rank: i + 1, nick: r.nick, tag: r.tag, avatar: r.avatar, stars: r.stars }))
    };
    cache.top[board] = ent;
    return ent;
  }
  async function boardCount(ctx, board) {
    const sec = cacheSec(ctx.env) * 2;
    const cache = cacheFor(ctx.env);
    const hit = cache.of[board];
    if (sec > 0 && hit && ctx.nowMs - hit.at < sec * 1000) return hit.n;
    const c = core.boardCols(board);
    const r = await dbFirst(ctx.env, 'SELECT COUNT(*) AS n FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0', []);
    const n = r ? r.n : 0;
    cache.of[board] = { at: ctx.nowMs, n: n };
    return n;
  }

  /* ------------------------------------------------------------------ 엔드포인트 */
  function readBoard(url) {
    const board = url.searchParams.get('board') || 'all';
    if (core.BOARDS.indexOf(board) < 0) throw new ApiError('bad_request', 'board');
    return board;
  }

  async function leaderboard(ctx) {
    const board = readBoard(ctx.url);
    let limit = parseInt(ctx.url.searchParams.get('limit'), 10);
    if (!Number.isFinite(limit)) limit = LIMITS.topMax;
    limit = Math.max(1, Math.min(LIMITS.topMax, limit));
    const top = await boardTop(ctx, board);
    const of = await boardCount(ctx, board);
    const sec = cacheSec(ctx.env);
    return ok(ctx, { board: board, asOf: top.asOf, of: of, rows: top.rows.slice(0, limit) }, sec > 0 ? 'public, max-age=' + sec : 'no-store');
  }

  async function rank(ctx) {
    const board = readBoard(ctx.url);
    const pub = core.normalizePub(ctx.url.searchParams.get('pub'));
    if (!pub) throw new ApiError('bad_request', 'pub');
    const c = core.boardCols(board);
    const row = await dbFirst(ctx.env,
      'SELECT id, nick, tag, avatar, hidden, ' + c.stars + ' AS stars, ' + c.left + ' AS lft, ' + c.up + ' AS up FROM players WHERE pub = ?', [pub]);
    if (!row) throw new ApiError('player_not_found');
    const sec = cacheSec(ctx.env);
    const cc = sec > 0 ? 'public, max-age=' + Math.max(1, Math.floor(sec / 2)) : 'no-store';
    if (row.hidden !== 0) return ok(ctx, { board: board, hidden: row.hidden }, cc);
    const of = await boardCount(ctx, board);
    let rankNo = null;
    if (row.stars > 0) {
      const base = 'SELECT COUNT(*) FROM players WHERE hidden = 0 AND ' + c.stars + ' > 0 AND ';
      const r = await dbFirst(ctx.env,
        'SELECT (' + base + c.stars + ' > ?) + (' + base + c.stars + ' = ? AND ' + c.left + ' > ?) + (' +
        base + c.stars + ' = ? AND ' + c.left + ' = ? AND ' + c.up + ' < ?) + (' +
        base + c.stars + ' = ? AND ' + c.left + ' = ? AND ' + c.up + ' = ? AND id < ?) + 1 AS rank',
        [row.stars, row.stars, row.lft, row.stars, row.lft, row.up, row.stars, row.lft, row.up, row.id]);
      rankNo = r ? r.rank : null;
    }
    return ok(ctx, {
      board: board, asOf: ctx.nowMs, rank: rankNo, of: of, stars: row.stars, nick: row.nick, tag: row.tag, avatar: row.avatar
    }, cc);
  }

  async function deletePlayer(ctx) {
    const body = await readJson(ctx);
    const pid = requirePid(body);
    const h = await sha256hex(pid);
    const r = await dbRun(ctx.env, 'DELETE FROM players WHERE pid_hash = ?', [h]);
    const n = (r && r.meta && r.meta.changes) || 0;
    return ok(ctx, { deleted: n > 0 });
  }

  function publicMe(p, totals) {
    return {
      pub: p.pub, nick: p.nick, tag: p.tag, avatar: p.avatar, hidden: p.hidden,
      stars: { easy: totals.stars.easy, normal: totals.stars.normal, hard: totals.stars.hard, all: totals.totalStars }
    };
  }

  const INSERT_SQL =
    'INSERT INTO players (pid_hash, pub, nick, nick_key, tag, avatar, prog_easy, prog_normal, prog_hard,' +
    ' stars_easy, stars_normal, stars_hard, left_easy, left_normal, left_hard, best_easy, best_normal, best_hard,' +
    ' total_stars, total_left, up_all, up_easy, up_normal, up_hard, hidden, nick_changes, nick_day, created_at, last_write_at)' +
    ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
  const UPDATE_SQL =
    'UPDATE players SET nick=?, nick_key=?, tag=?, avatar=?, prog_easy=?, prog_normal=?, prog_hard=?,' +
    ' stars_easy=?, stars_normal=?, stars_hard=?, left_easy=?, left_normal=?, left_hard=?, best_easy=?, best_normal=?, best_hard=?,' +
    ' total_stars=?, total_left=?, up_all=?, up_easy=?, up_normal=?, up_hard=?, hidden=?, nick_changes=?, nick_day=?, last_write_at=?' +
    ' WHERE id = ?';

  function progStrings(p) { return DIFFS.map((d) => core.serializeProg(p[d])); }
  function totalsCols(t) {
    return [t.stars.easy, t.stars.normal, t.stars.hard, t.left.easy, t.left.normal, t.left.hard, t.best.easy, t.best.normal, t.best.hard, t.totalStars, t.totalLeft];
  }

  async function pickTag(ctx, key) {
    const rows = await dbAll(ctx.env, 'SELECT tag FROM players WHERE nick_key = ?', [key]);
    const used = new Set(rows.map((r) => r.tag));
    if (used.size >= 10000) throw new ApiError('server_error');
    for (let i = 0; i < 5; i++) {
      const t = randInt(ctx, 10000);
      if (!used.has(t)) return t;
    }
    const start = randInt(ctx, 10000);
    for (let i = 0; i < 10000; i++) {
      const t = (start + i) % 10000;
      if (!used.has(t)) return t;
    }
    throw new ApiError('server_error');
  }

  /** 시간 창 카운터 +1 하고 새 값을 돌려준다. k 는 'reg:'/'adm:' + IP 해시 */
  async function bump(ctx, k, windowSec) {
    const win = Math.floor(ctx.nowSec / windowSec) * windowSec;
    await dbRun(ctx.env,
      'INSERT INTO rate_limits (k, n, win) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN win = excluded.win THEN n + 1 ELSE 1 END, win = excluded.win',
      [k, win]);
    const r = await dbFirst(ctx.env, 'SELECT n FROM rate_limits WHERE k = ?', [k]);
    return { n: r ? r.n : 1, retryAfter: Math.max(1, win + windowSec - ctx.nowSec) };
  }
  async function peek(ctx, k, windowSec) {
    const win = Math.floor(ctx.nowSec / windowSec) * windowSec;
    const r = await dbFirst(ctx.env, 'SELECT n, win FROM rate_limits WHERE k = ?', [k]);
    return { n: r && r.win === win ? r.n : 0, retryAfter: Math.max(1, win + windowSec - ctx.nowSec) };
  }
  function rateLimited(retryAfter) {
    return new ApiError('rate_limited', null, { headers: { 'Retry-After': String(retryAfter) } });
  }

  async function sync(ctx, retried) {
    const env = ctx.env;
    const body = ctx.body;
    const pid = requirePid(body);
    const hasProfile = body.profile !== undefined && body.profile !== null;
    const hasD = body.d !== undefined && body.d !== null;
    if (!hasProfile && !hasD) throw new ApiError('bad_request');

    let prof = null;
    if (hasProfile) {
      const r = core.checkProfile(body.profile, env.EXTRA_BLOCK);
      if (!r.ok) throw new ApiError(r.code, r.field, { message: r.message });
      prof = r;
    }
    let dReq = null;
    if (hasD) {
      const r = core.validateProgress(body.d);
      if (!r.ok) throw new ApiError(r.code, r.field);
      dReq = r.d;
    }

    const now = ctx.nowSec;
    const today = core.kstDay(now);
    const h = await sha256hex(pid);
    const row = await dbFirst(env, 'SELECT * FROM players WHERE pid_hash = ?', [h]);

    /* ---------- 새 플레이어 ---------- */
    if (!row) {
      if (!prof) throw new ApiError('profile_required');
      const merged = core.mergeProgress(core.emptyProgress(), dReq);
      const viol = core.chainViolation(merged);
      if (viol) throw new ApiError('progress_chain', viol);
      const t = core.computeTotals(merged);

      const ip = await ipHashOf(ctx);
      const lim = await bump(ctx, 'reg:' + ip, 3600);
      if (lim.n > LIMITS.regPerHour) throw rateLimited(lim.retryAfter);
      if (randInt(ctx, 50) === 0) {                                  // 가끔 오래된 행 정리
        await dbRun(env, 'DELETE FROM rate_limits WHERE win < ?', [now - 86400]);
      }

      const up = (v) => (v ? now : 0);
      for (let attempt = 0; attempt < 4; attempt++) {
        const pub = randomPub();
        const tag = await pickTag(ctx, prof.key);
        const ps = progStrings(merged);
        const params = [h, pub, prof.nick, prof.key, tag, prof.avatar, ps[0], ps[1], ps[2]]
          .concat(totalsCols(t))
          .concat([up(t.totalStars > 0 || t.totalLeft > 0), up(t.stars.easy > 0), up(t.stars.normal > 0), up(t.stars.hard > 0), 0, 0, 0, now, now]);
        try {
          await dbRun(env, INSERT_SQL, params);
        } catch (e) {
          if (e instanceof UniqueError) {
            if (/pid_hash/.test(e.text) && !retried) return sync(ctx, true);      // 같은 pid 동시 등록 -> 기존 행으로 처리
            if (/pid_hash/.test(e.text)) throw new ApiError('rate_limited', null, { headers: { 'Retry-After': '3' } });
            continue;                                                              // pub 또는 (닉네임, 번호) 충돌 -> 다시 시도
          }
          throw e;
        }
        return ok(ctx, {
          me: publicMe({ pub: pub, nick: prof.nick, tag: tag, avatar: prof.avatar, hidden: 0 }, t),
          changed: true, nickChangesLeft: LIMITS.nickChangesPerDay, serverTime: ctx.nowMs
        });
      }
      throw new ApiError('server_error');
    }

    /* ---------- 기존 플레이어 ---------- */
    let nick = row.nick;
    let nickKey = row.nick_key;
    let tag = row.tag;
    let avatar = row.avatar;
    let hidden = row.hidden;
    let nickChanges = row.nick_changes;
    let nickDay = row.nick_day;
    let profileChanged = false;

    if (prof) {
      if (prof.key !== row.nick_key) {
        const used = row.nick_day === today ? row.nick_changes : 0;
        if (used >= LIMITS.nickChangesPerDay) throw new ApiError('nick_change_limit');
        nickChanges = used + 1;
        nickDay = today;
        tag = await pickTag(ctx, prof.key);
        nick = prof.nick;
        nickKey = prof.key;
        if (hidden === 2) hidden = 0;                                // 새 이름이 통과했으니 이름 변경 요청 해제
        profileChanged = true;
      } else if (prof.nick !== row.nick) {                           // 대소문자만 바뀐 경우: 번호표·횟수 그대로
        nick = prof.nick;
        profileChanged = true;
      }
      if (prof.avatar !== row.avatar) { avatar = prof.avatar; profileChanged = true; }
    } else if (hidden === 0 && !NICK.validateNick(row.nick, env.EXTRA_BLOCK).ok) {
      hidden = 2;                                                    // 목록이 바뀐 뒤 걸리는 기존 이름 -> 이름 변경 요청
    }

    const oldProg = { easy: core.parseProg(row.prog_easy), normal: core.parseProg(row.prog_normal), hard: core.parseProg(row.prog_hard) };
    let merged = oldProg;
    if (dReq) {
      merged = core.mergeProgress(oldProg, dReq);
      const viol = core.chainViolation(merged);
      if (viol) throw new ApiError('progress_chain', viol);
    }
    const ps = progStrings(merged);
    const progChanged = ps[0] !== row.prog_easy || ps[1] !== row.prog_normal || ps[2] !== row.prog_hard;
    const hiddenChanged = hidden !== row.hidden;
    const t = core.computeTotals(merged);
    const nickChangesLeft = Math.max(0, LIMITS.nickChangesPerDay - (nickDay === today ? nickChanges : 0));
    const me = publicMe({ pub: row.pub, nick: nick, tag: tag, avatar: avatar, hidden: hidden }, t);

    if (!profileChanged && !progChanged && !hiddenChanged) {          // 변경 없음 -> 쓰기 0 (읽기 1회로 끝)
      return ok(ctx, { me: me, changed: false, nickChangesLeft: nickChangesLeft, serverTime: ctx.nowMs });
    }
    if ((profileChanged || progChanged) && now - row.last_write_at < LIMITS.writeIntervalSec) {
      throw rateLimited(Math.max(1, LIMITS.writeIntervalSec - (now - row.last_write_at)));
    }

    const rose = (diff) => t.stars[diff] > row['stars_' + diff] || t.left[diff] > row['left_' + diff];
    const upAll = (t.totalStars > row.total_stars || t.totalLeft > row.total_left) ? now : row.up_all;
    const params = [nick, nickKey, tag, avatar, ps[0], ps[1], ps[2]]
      .concat(totalsCols(t))
      .concat([upAll, rose('easy') ? now : row.up_easy, rose('normal') ? now : row.up_normal, rose('hard') ? now : row.up_hard,
        hidden, nickChanges, nickDay, now, row.id]);
    try {
      await dbRun(env, UPDATE_SQL, params);
    } catch (e) {
      if (e instanceof UniqueError) throw rateLimited(1);            // 같은 이름·번호가 동시에 생긴 드문 경우: 잠시 뒤 재시도
      throw e;
    }
    return ok(ctx, { me: me, changed: true, nickChangesLeft: nickChangesLeft, serverTime: ctx.nowMs });
  }

  /* ------------------------------------------------------------------ 관리자 (ADMIN_KEY 가 설정된 경우에만) */
  async function adminAuth(ctx) {
    if (!ctx.env.ADMIN_KEY) throw new ApiError('not_found');
    const ip = await ipHashOf(ctx);
    const k = 'adm:' + ip;
    const st = await peek(ctx, k, LIMITS.adminFailWindowSec);
    if (st.n >= LIMITS.adminFailMax) throw rateLimited(st.retryAfter);
    const auth = ctx.request.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m || !core.safeEqual(m[1], ctx.env.ADMIN_KEY)) {
      const b = await bump(ctx, k, LIMITS.adminFailWindowSec);
      throw b.n > LIMITS.adminFailMax ? rateLimited(b.retryAfter) : new ApiError('unauthorized');
    }
  }

  async function adminModerate(ctx) {
    await adminAuth(ctx);
    const body = await readJson(ctx);
    const action = body.action;
    let where;
    let arg;
    if (Number.isInteger(body.id)) { where = 'id = ?'; arg = body.id; }
    else if (core.normalizePub(body.pub)) { where = 'pub = ?'; arg = core.normalizePub(body.pub); }
    else throw new ApiError('bad_request', 'id');
    let r;
    if (action === 'hide') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 1 WHERE ' + where, [arg]);
    else if (action === 'unhide') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 0 WHERE ' + where, [arg]);
    else if (action === 'rename') r = await dbRun(ctx.env, 'UPDATE players SET hidden = 2 WHERE ' + where, [arg]);
    else if (action === 'delete') r = await dbRun(ctx.env, 'DELETE FROM players WHERE ' + where, [arg]);
    else throw new ApiError('bad_request', 'action');
    const n = (r && r.meta && r.meta.changes) || 0;
    if (!n) throw new ApiError('player_not_found');
    return ok(ctx, { affected: n });
  }

  async function adminSearch(ctx) {
    await adminAuth(ctx);
    const q = ctx.url.searchParams.get('q') || '';
    if (!q || q.length > 20) throw new ApiError('bad_request', 'q');
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    const rows = await dbAll(ctx.env,
      "SELECT id, pub, nick, tag, total_stars, hidden FROM players WHERE nick LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20", [like]);
    return ok(ctx, { rows: rows.map((r) => ({ id: r.id, pub: r.pub, nick: r.nick, tag: r.tag, stars: r.total_stars, hidden: r.hidden })) });
  }

  /* ------------------------------------------------------------------ 라우팅 */
  const ROUTES = {
    '/api/health': { GET: async (ctx) => ok(ctx, { time: ctx.nowMs }) },
    '/api/leaderboard': { GET: leaderboard },
    '/api/rank': { GET: rank },
    '/api/sync': { POST: async (ctx) => { ctx.body = await readJson(ctx); return sync(ctx, false); } },
    '/api/delete': { POST: deletePlayer },
    '/api/admin/moderate': { POST: adminModerate, admin: true },
    '/api/admin/search': { GET: adminSearch, admin: true }
  };

  async function handle(request, env, opts) {
    const ctx = {
      request: request, env: env || {}, opts: opts || {}, url: new URL(request.url),
      origin: request.headers.get('origin'), cors: false, body: null
    };
    ctx.nowMs = ctx.opts.now ? ctx.opts.now() : Date.now();
    ctx.nowSec = Math.floor(ctx.nowMs / 1000);
    try {
      const route = ROUTES[ctx.url.pathname];
      if (!route) throw new ApiError('not_found');

      // Origin 검사: 헤더가 있고 허용 목록에 없으면 403. 헤더가 없으면(curl 등) 통과.
      // 관리자 API는 브라우저에서 호출하지 않으므로 Origin 이 붙어 있으면 항상 거부하고 CORS 도 열지 않는다.
      if (ctx.origin !== null) {
        if (route.admin || !core.originAllowed(ctx.origin, ctx.env.ALLOWED_ORIGINS)) throw new ApiError('forbidden_origin');
        ctx.cors = true;
      }
      if (request.method === 'OPTIONS') {
        const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
        const res = new Response(null, { status: 204, headers: h });
        res.headers.set('Vary', 'Origin');
        if (ctx.cors) res.headers.set('Access-Control-Allow-Origin', ctx.origin);
        return res;
      }
      const fn = route[request.method];
      if (typeof fn !== 'function') {
        throw new ApiError('method_not_allowed', null, { headers: { Allow: Object.keys(route).filter((k) => k !== 'admin').join(', ') + ', OPTIONS' } });
      }
      return await fn(ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(ctx, e);
      if (e instanceof UniqueError) return errorResponse(ctx, new ApiError('server_error'));
      console.error('server error:', e && e.name, String((e && e.message) || e).slice(0, 160));
      return errorResponse(ctx, new ApiError('server_error'));
    }
  }

  module.exports = {
    handle: handle,
    default: {
      fetch: function (request, env) { return handle(request, env); }
    }
  };
};

export default __require('worker').default;
