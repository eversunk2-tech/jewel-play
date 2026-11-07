#!/usr/bin/env node
/* 명예의 전당 초기 기록(10명)을 공개 API(/api/sync)로 등록하거나 지운다. 서버 DB를 직접 건드리지 않는다.
 *   node server/tools/seed-hall.js --api http://127.0.0.1:8790              미리보기(기본, 아무것도 보내지 않음)
 *   node server/tools/seed-hall.js --api <주소> --apply                      등록(이미 등록한 이름은 건너뜀)
 *   node server/tools/seed-hall.js --api <주소> --delete                     등록했던 10명을 /api/delete 로 삭제
 * 비밀 번호표(pid)는 저장소 밖 파일에만 저장한다: 기본 ~/.element-gems/seed-pids.json (권한 600). 저장소에 커밋하지 않는다.
 * 기록은 서버 검증(연쇄 해금·시간 상한·닉네임 검사)을 그대로 통과해야 하며, 점수는 서버와 같은 core.js 로 미리 계산해 보여 준다.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require(path.join(__dirname, '..', 'src', 'core.js'));
const Nick = require(path.join(__dirname, '..', '..', 'nickname.js'));

// 스테이지별 남은 시간(정수 초), 미플레이 -1. 별: 초보 65 이상 3★ / 39 이상 2★ / 그 아래 1★. 중수 60/36, 고수 50/30.
const E = (arr) => arr.concat(Array(10 - arr.length).fill(-1));
const N = E([]);
const RIVALS = [
  { nick: '별빛냥',     avatar: 3,  easy: E([78, 72, 70, 68, 52, 45, 41]) },
  { nick: '번개토끼',   avatar: 5,  easy: E([76, 71, 55, 50, 47, 42]),     normal: E([20]) },
  { nick: '새싹용사',   avatar: 9,  easy: E([74, 60, 53, 48, 44, 38]),     normal: E([30]) },
  { nick: '반달곰',     avatar: 2,  easy: E([70, 58, 50, 46, 40, 20]) },
  { nick: '파랑물방울', avatar: 13, easy: E([68, 55, 47, 41, 30]) },
  { nick: '풀잎다람쥐', avatar: 7,  easy: E([66, 52, 45, 20]) },
  { nick: '꼬마마법사', avatar: 16, easy: E([66, 44, 36, 20]) },
  { nick: '구름양',     avatar: 4,  easy: E([58, 40, 25]) },
  { nick: '모래시계',   avatar: 11, easy: E([48, 30, 10]) },
  { nick: '초코우유',   avatar: 14, easy: E([45, 20]) }
];

function args() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  return {
    api: (get('--api') || '').replace(/\/+$/, ''),
    apply: a.includes('--apply'),
    del: a.includes('--delete'),
    pids: get('--pids') || path.join(os.homedir(), '.element-gems', 'seed-pids.json')
  };
}

function progressOf(r) { return { easy: r.easy || N, normal: r.normal || N, hard: r.hard || N }; }

function table() {
  const rows = RIVALS.map((r) => {
    const p = progressOf(r);
    const t = core.computeTotals(p);
    const v = Nick.validateNick(r.nick);
    return { r, t, v };
  });
  rows.sort((a, b) => b.t.totalStars - a.t.totalStars || b.t.totalLeft - a.t.totalLeft);
  console.log('순위  닉네임          아바타  별 점수  (초보★/중수★/고수★)  남은시간합  닉네임검사');
  rows.forEach((x, i) => {
    console.log(String(i + 1).padStart(3) + '   ' + x.r.nick.padEnd(10, '　') + '   ' + String(x.r.avatar).padStart(4) + '   ' + String(x.t.totalStars).padStart(6) +
      '   (' + x.t.stars.easy + '/' + x.t.stars.normal + '/' + x.t.stars.hard + ')            ' + String(x.t.totalLeft).padStart(6) + '      ' + (x.v.ok ? 'ok' : x.v.code));
  });
  return rows;
}

async function post(api, path_, body) {
  const res = await fetch(api + path_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) { /* 비 JSON */ }
  return { status: res.status, json };
}

function loadPids(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
function savePids(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

async function main() {
  const o = args();
  const rows = table();
  const bad = rows.filter((x) => !x.v.ok);
  if (bad.length) { console.error('\n닉네임 검사에 걸린 항목이 있어 중단합니다.'); process.exit(1); }
  if (!o.apply && !o.del) { console.log('\n(미리보기입니다. 등록하려면 --api <주소> --apply)'); return; }
  if (!/^https?:\/\//.test(o.api)) { console.error('--api <주소> 가 필요합니다.'); process.exit(1); }
  const pids = loadPids(o.pids);
  if (o.del) {
    for (const nick of Object.keys(pids)) {
      const r = await post(o.api, '/api/delete', { v: 1, pid: pids[nick] });
      console.log('삭제', nick, r.status, r.json && r.json.ok ? (r.json.deleted ? '삭제됨' : '이미 없음') : JSON.stringify(r.json));
      if (r.status === 200) delete pids[nick];
      await new Promise((r2) => setTimeout(r2, 400));
    }
    savePids(o.pids, pids);
    return;
  }
  for (const x of rows) {
    const nick = x.r.nick;
    if (pids[nick]) { console.log('건너뜀(이미 등록)', nick); continue; }
    const pid = crypto.randomUUID();
    const body = { v: 1, pid, profile: { nick, avatar: x.r.avatar }, d: progressOf(x.r) };
    const r = await post(o.api, '/api/sync', body);
    if (r.status === 200 && r.json && r.json.ok) {
      pids[nick] = pid;
      savePids(o.pids, pids);               // 성공 즉시 저장(중간에 멈춰도 삭제할 수 있게)
      console.log('등록', nick, '→ 별 점수', r.json.me.stars.all, '번호표 #' + String(r.json.me.tag).padStart(4, '0'));
    } else {
      console.error('실패', nick, r.status, JSON.stringify(r.json));
      process.exit(1);
    }
    await new Promise((r2) => setTimeout(r2, 600));
  }
  console.log('\n완료. 번호표 파일:', o.pids, '(저장소 밖, 삭제용)');
}

main().catch((e) => { console.error(e); process.exit(1); });
