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
