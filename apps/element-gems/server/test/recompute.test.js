/* 운영 도구 tools/recompute-stars.js 시험 (spec §44.1-3, §44.3-5): 바뀐 행만 UPDATE 가 나오는지, 다른 열을 안 건드리는지, 숫자만 SQL 에 들어가는지 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../src/core');
const tool = require('../tools/recompute-stars');

const TOOL = path.join(__dirname, '..', 'tools', 'recompute-stars.js');
const E = (arr) => arr.concat(Array(10 - arr.length).fill(-1)).join(',');   // 앞 칸들만 채우고 나머지는 미클리어(-1)

/** 진행 문자열로 행을 만든다. 별 열은 옛 기준(고수 30/50)으로 채워 "서버 재배포 전 값"을 흉내 낸다. extra 로 열을 덮어쓴다 */
function oldRow(id, prog, extra) {
  const OLD = { easy: [39, 65], normal: [36, 60], hard: [30, 50] };
  const stars = {};
  for (const d of core.DIFFS) {
    const arr = core.parseProg(prog[d]);
    let s = 0;
    for (const v of arr) if (v >= 0) s += v >= OLD[d][1] ? 3 : v >= OLD[d][0] ? 2 : 1;
    stars[d] = s;
  }
  const row = {
    id: id, nick: '가짜', up_all: 111, up_easy: 1, up_normal: 2, up_hard: 3, last_write_at: 999, hidden: 0,
    prog_easy: prog.easy, prog_normal: prog.normal, prog_hard: prog.hard,
    stars_easy: stars.easy, stars_normal: stars.normal, stars_hard: stars.hard,
    left_easy: 7, left_normal: 8, left_hard: 9,
    total_stars: stars.easy + stars.normal * 2 + stars.hard * 3, total_left: 24
  };
  return Object.assign(row, extra || {});
}

const NONE = E([]);
/** 기대 UPDATE 한 줄(입력 행의 진행 문자열 세 개를 WHERE 에 그대로 붙인다 — 내보내기~적용 사이에 기록이 올랐다면 조건이 안 맞아 건너뛰게 하는 안전장치) */
const where = (id, prog) => " WHERE id=" + id + " AND prog_easy='" + prog.easy + "' AND prog_normal='" + prog.normal + "' AND prog_hard='" + prog.hard + "';";

test('고수 left 35: 옛 기준 ★★ -> 새 기준 ★★★, 그 행만 UPDATE 가 나온다 (숫자 확인)', () => {
  const rows = [
    oldRow(1, { easy: E([70, 50]), normal: NONE, hard: E([35, 20, 10]) }),     // 고수 35->★★★(옛 ★★), 20->★★(옛 ★), 10->★ : 바뀜
    oldRow(2, { easy: E([70, 50, 30]), normal: E([61, 40]), hard: NONE })      // 고수 없음 : 안 바뀜
  ];
  const r = tool.recompute(rows);
  assert.equal(r.total, 2);
  assert.equal(r.changed, 1);
  assert.deepEqual(r.skipped, []);
  // 행 1: 초보 70(3)+50(2) = 5, 중수 0, 고수 35(3)+20(2)+10(1) = 6, 전체 5 + 0 + 6*3 = 23
  assert.deepEqual(r.sql, ['UPDATE players SET stars_easy=5, stars_normal=0, stars_hard=6, total_stars=23' +
    " WHERE id=1 AND prog_easy='70,50,-1,-1,-1,-1,-1,-1,-1,-1' AND prog_normal='-1,-1,-1,-1,-1,-1,-1,-1,-1,-1' AND prog_hard='35,20,10,-1,-1,-1,-1,-1,-1,-1';"]);
});

test('바뀌는 행·안 바뀌는 행·잘못된 값 행을 섞으면 UPDATE 는 바뀐 행만, 잘못된 행은 건너뜀으로 보고된다', () => {
  const rows = [
    oldRow(10, { easy: E([66]), normal: E([37]), hard: E([16, 31]) }),                                        // 바뀜 (고수 16->★★, 31->★★★)
    oldRow(11, { easy: E([66]), normal: E([37]), hard: E([60, 55]) }),                                        // 안 바뀜 (고수 둘 다 옛 기준에서도 ★★★)
    oldRow(12, { easy: E([66]), normal: NONE, hard: NONE }, { prog_hard: '1,2,3' }),                          // 잘못: 칸 수
    oldRow(13, { easy: E([66]), normal: NONE, hard: NONE }, { prog_easy: '66,x,-1,-1,-1,-1,-1,-1,-1,-1' }),  // 잘못: 숫자 아님
    oldRow(14, { easy: E([66]), normal: NONE, hard: NONE }, { stars_hard: 1.5 }),                             // 잘못: 별이 소수
    oldRow(15, { easy: E([66]), normal: NONE, hard: NONE }, { total_stars: '9' }),                            // 잘못: 문자열 숫자
    oldRow(16, { easy: E([66]), normal: NONE, hard: NONE }, { prog_normal: '-2,-1,-1,-1,-1,-1,-1,-1,-1,-1' }), // 잘못: -2
    oldRow(-5, { easy: E([66]), normal: NONE, hard: NONE }),                                                  // 잘못: id 음수
    oldRow(17, { easy: E([66]), normal: NONE, hard: NONE }, { id: '17; DROP TABLE players' }),                // 잘못: id 문자열
    null,                                                                                                      // 잘못: 행이 아님
    oldRow(18, { easy: E([66]), normal: NONE, hard: NONE }, { stars_easy: 0 })                                 // 초보 별 열이 어긋난 행(옛 값 오류): 바로잡힘
  ];
  const r = tool.recompute(rows);
  assert.equal(r.total, 11);
  assert.equal(r.skipped.length, 8);
  assert.deepEqual(r.skipped.map((s) => s.index), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(r.skipped[7].id, null);
  assert.equal(r.skipped[5].id, -5);
  assert.equal(r.changed, 2);
  assert.deepEqual(r.sql, [
    // 행 10: 초보 66(★★★)=3, 중수 37(★★)=2, 고수 16(★★)+31(★★★)=5, 전체 3 + 2*2 + 5*3 = 22
    'UPDATE players SET stars_easy=3, stars_normal=2, stars_hard=5, total_stars=22' + where(10, { easy: E([66]), normal: E([37]), hard: E([16, 31]) }),
    // 행 18: 별 열 stars_easy 가 0 으로 어긋나 있던 행이 바로잡힌다(초보 66 -> 3, 전체 3)
    'UPDATE players SET stars_easy=3, stars_normal=0, stars_hard=0, total_stars=3' + where(18, { easy: E([66]), normal: NONE, hard: NONE })
  ]);
});

test('출력 SQL 은 정해진 모양의 UPDATE 줄뿐이고, 다른 열(up_*·last_write_at·hidden·left_*·nick 등)은 들어 있지 않다', () => {
  const rows = [
    oldRow(21, { easy: E([66]), normal: NONE, hard: E([15, 30, 29]) }),
    oldRow(22, { easy: NONE, normal: E([36, 60]), hard: E([40]) }),
    oldRow(23, { easy: E([39, 65]), normal: E([36]), hard: E([100, 14]) })
  ];
  const r = tool.recompute(rows);
  assert.ok(r.sql.length >= 2);
  const re = /^UPDATE players SET stars_easy=\d+, stars_normal=\d+, stars_hard=\d+, total_stars=\d+ WHERE id=\d+ AND prog_easy='[0-9,-]+' AND prog_normal='[0-9,-]+' AND prog_hard='[0-9,-]+';$/;
  for (const line of r.sql) {
    assert.match(line, re);
    // SET 절에는 별 네 열만, 다른 열 이름은 어디에도 없다. prog_* 는 WHERE 의 조건으로만 나온다
    const set = line.slice(line.indexOf(' SET ') + 5, line.indexOf(' WHERE '));
    assert.equal(set.replace(/\w+=\d+(, )?/g, ''), '', 'SET 절은 숫자 대입만: ' + set);
    assert.equal(set.indexOf('prog_'), -1, 'prog_ 는 SET 에 없다(WHERE 조건으로만)');
    for (const bad of ['up_', 'last_write_at', 'hidden', 'left_', 'total_left', 'nick', 'DROP', '"', '--', '/*']) {
      assert.equal(line.indexOf(bad), -1, bad + ' 가 SQL 에 있음: ' + line);
    }
    assert.equal(line.split("'").length - 1, 6, "작은따옴표는 prog 값 세 개를 감싸는 6개뿐");
  }
});

test('숫자 외 문자는 SQL 에 들어가지 않는다: 이상한 id·별 값·여분 필드가 있는 행은 건너뛰고, 여분 필드는 무시한다', () => {
  const evil = "1; DELETE FROM players; --";
  const rows = [
    oldRow(30, { easy: E([66]), normal: NONE, hard: E([31]) }, { id: evil }),
    oldRow(31, { easy: E([66]), normal: NONE, hard: E([31]) }, { stars_hard: evil }),
    oldRow(32, { easy: E([66]), normal: NONE, hard: E([31]) }, { total_stars: Infinity }),
    oldRow(33, { easy: E([66]), normal: NONE, hard: E([31]) }, { prog_hard: "31,-1,-1,-1,-1,-1,-1,-1,-1,-1'; --" }),
    oldRow(34, { easy: E([66]), normal: NONE, hard: E([31]) }, { nick: evil, pub: "x'); --" })               // 여분 필드는 읽지도 쓰지도 않는다
  ];
  const r = tool.recompute(rows);
  assert.equal(r.skipped.length, 4);
  assert.equal(r.changed, 1);
  assert.equal(r.sql.length, 1);
  assert.equal(r.sql[0], 'UPDATE players SET stars_easy=3, stars_normal=0, stars_hard=3, total_stars=12' + where(34, { easy: E([66]), normal: NONE, hard: E([31]) }));
  // 허용 문자: 영문·숫자·_ = , 공백 ; 와, prog 값을 감싸는 작은따옴표 안의 숫자·쉼표·'-'. prog 값 세 개를 떼어 내면 옛 허용 문자 집합만 남는다
  const stripped = r.sql[0].replace(/'[0-9,-]+'/g, '');
  assert.equal(/[^A-Za-z0-9_=, ;]/.test(stripped), false, stripped);
  assert.equal(/[^A-Za-z0-9_=, ;'-]/.test(r.sql[0]), false);
});

test('(a) WHERE 에 prog 조건 세 개가 들어가고, 값은 입력 행의 진행 문자열 그대로다', () => {
  const rows = [
    oldRow(51, { easy: E([70, 50, 30]), normal: E([61, 40]), hard: E([35, 20, 10]) }),
    oldRow(52, { easy: NONE, normal: NONE, hard: E([0, 15, 29, 30]) }),
    oldRow(53, { easy: E([39]), normal: E([36, 0]), hard: E([100, 30]) })
  ];
  const r = tool.recompute(rows);
  assert.equal(r.changed, 3);
  const re = /^UPDATE players SET stars_easy=\d+, stars_normal=\d+, stars_hard=\d+, total_stars=\d+ WHERE id=(\d+) AND prog_easy='([^']*)' AND prog_normal='([^']*)' AND prog_hard='([^']*)';$/;
  for (const line of r.sql) {
    const m = re.exec(line);
    assert.ok(m, line);
    const src = rows.find((x) => x.id === Number(m[1]));
    assert.ok(src, 'id 가 입력 행에 있다');
    assert.deepEqual([m[2], m[3], m[4]], [src.prog_easy, src.prog_normal, src.prog_hard], 'prog 조건 세 개가 입력 행 값 그대로');
    assert.ok(line.indexOf(' AND prog_easy=') < line.indexOf(' AND prog_normal=') && line.indexOf(' AND prog_normal=') < line.indexOf(' AND prog_hard='), '순서 easy -> normal -> hard');
  }
});

test('(b) prog 값에 허용 밖 문자(숫자·쉼표·- 밖)가 있으면 그 행은 건너뛴다 (세 열 모두)', () => {
  const base = ['31', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1'];
  const evilVariants = [
    base.join(',') + "' OR '1'='1",          // 따옴표로 조건 깨기
    base.join(',') + "'; DROP TABLE players; --",
    base.join(',') + ';--',
    base.join(',') + '\n',
    base.join(',') + ' ',
    ' ' + base.join(','),
    base.join(',') + '\u0000',
    '３１,' + base.slice(1).join(','),    // 전각 숫자
    '+31,' + base.slice(1).join(','),
    '0x1F,' + base.slice(1).join(','),
    '1e2,' + base.slice(1).join(','),
    '31.0,' + base.slice(1).join(','),
    base.join(',') + '"',
    base.join(',') + '\\'
  ];
  const cols = ['prog_easy', 'prog_normal', 'prog_hard'];
  const rows = [];
  let id = 100;
  for (const col of cols) for (const evil of evilVariants) rows.push(oldRow(id++, { easy: E([66]), normal: NONE, hard: E([31]) }, { [col]: evil }));
  rows.push(oldRow(id++, { easy: E([66]), normal: NONE, hard: E([31]) }));         // 정상 행 하나는 그대로 나온다
  const r = tool.recompute(rows);
  assert.equal(r.skipped.length, cols.length * evilVariants.length, '허용 밖 문자가 있는 행은 모두 건너뜀');
  assert.equal(r.changed, 1);
  assert.equal(r.sql.length, 1);
  assert.match(r.sql[0], new RegExp(' WHERE id=' + (id - 1) + ' AND '));
  for (const sk of r.skipped) assert.match(sk.reason, /prog_(easy|normal|hard) /);
});

test('(c) 출력 전체에 허용 밖 문자가 없다: 영문·숫자·_ = , 공백 ; 와 prog 값을 감싸는 작은따옴표·숫자·쉼표·- 뿐 (이상한 행을 섞어도)', () => {
  const rows = [];
  for (let i = 1; i <= 40; i++) {
    const arr = (n) => Array.from({ length: 10 }, (_, k) => (k < n ? (i * 7 + k * 13) % 101 : -1));
    rows.push(oldRow(i, { easy: arr(i % 11).join(','), normal: arr((i + 3) % 11).join(','), hard: arr((i + 6) % 11).join(',') }));
  }
  rows.push(oldRow(500, { easy: E([66]), normal: NONE, hard: E([31]) }, { prog_hard: "31,-1,-1,-1,-1,-1,-1,-1,-1,-1' OR 1=1 --" }));
  rows.push(oldRow(501, { easy: E([66]), normal: NONE, hard: E([31]) }, { nick: "x'; DROP TABLE players; --", pub: '"; --' }));
  rows.push(Object.assign(oldRow(502, { easy: E([66]), normal: NONE, hard: E([31]) }), { id: "502'; --" }));
  const r = tool.recompute(rows);
  assert.ok(r.sql.length >= 10, '출력이 충분히 있다: ' + r.sql.length);
  const all = r.sql.join('\n');
  assert.equal(/[^A-Za-z0-9_=, ;'\n-]/.test(all), false, '출력 전체의 문자 집합');
  const stripped = all.replace(/'[0-9,-]+'/g, '');
  assert.equal(/[^A-Za-z0-9_=, ;\n]/.test(stripped), false, 'prog 값을 떼어 내면 숫자 외 문자는 옛 허용 집합뿐: ' + stripped.slice(0, 120));
  assert.equal(all.indexOf('--'), -1);
  for (const line of r.sql) assert.equal(line.split("'").length - 1, 6, line);
  assert.ok(r.skipped.length >= 2, '이상한 행은 건너뜀');
});

test('WHERE 의 prog 조건이 실제로 막는다 (node:sqlite): 내보낸 뒤 기록이 올라간 행은 옛 별로 덮어쓰지 않고, 그대로인 행만 갱신된다. 다른 열은 변하지 않는다', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE players (id INTEGER PRIMARY KEY, prog_easy TEXT, prog_normal TEXT, prog_hard TEXT,
    stars_easy INTEGER, stars_normal INTEGER, stars_hard INTEGER, total_stars INTEGER, up_all INTEGER, up_hard INTEGER, hidden INTEGER, last_write_at INTEGER, left_hard INTEGER)`);
  const ins = db.prepare('INSERT INTO players VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const exported = [
    oldRow(1, { easy: E([66]), normal: NONE, hard: E([35]) }),          // 내보낸 뒤 그대로 -> 갱신된다
    oldRow(2, { easy: E([66]), normal: NONE, hard: E([35]) }),          // 내보낸 뒤 사람이 기록을 올렸다 -> 건너뛴다
    oldRow(3, { easy: E([66]), normal: NONE, hard: NONE })              // 안 바뀌는 행 -> UPDATE 자체가 없다
  ];
  const dbRows = exported.map((x) => Object.assign({}, x));
  // 행 2: 서버가 이미 새 기준으로 계산해 둔 값(고수 35 -> ★★★, 그리고 두 번째 칸 40 -> ★★★ 추가)
  dbRows[1].prog_hard = E([35, 40]);
  dbRows[1].stars_hard = 6; dbRows[1].total_stars = 3 + 6 * 3;
  dbRows.forEach((x, i) => ins.run(x.id, x.prog_easy, x.prog_normal, x.prog_hard, x.stars_easy, x.stars_normal, x.stars_hard, x.total_stars, 111 + i, 222 + i, 0, 999 + i, 9 + i));
  const before = db.prepare('SELECT * FROM players ORDER BY id').all().map((x) => Object.assign({}, x));
  const r = tool.recompute(exported);
  assert.equal(r.sql.length, 2);                                        // 행 1, 행 2 (행 3은 안 바뀜)
  db.exec(r.sql.join('\n'));
  const after = db.prepare('SELECT * FROM players ORDER BY id').all().map((x) => Object.assign({}, x));
  assert.deepEqual([after[0].stars_hard, after[0].total_stars], [3, 3 + 3 * 3], '행 1: 고수 35 가 ★★★(새 기준)로 갱신');
  assert.deepEqual(after[1], before[1], '행 2: prog_hard 가 달라져 있으므로 조건이 안 맞아 한 열도 바뀌지 않는다');
  assert.deepEqual(after[2], before[2], '행 3: 그대로');
  for (const col of Object.keys(before[0])) if (!['stars_hard', 'total_stars'].includes(col)) assert.equal(after[0][col], before[0][col], '행 1 의 다른 열 ' + col + ' 은 그대로');
  db.close();
});

test('이미 새 기준으로 계산된 행만 있으면 UPDATE 가 하나도 없다(두 번 돌려도 안전)', () => {
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const prog = { easy: E([70 + i, 20]), normal: E([61, 36 + i]), hard: E([15 + i, 31, 29, 14]) };
    const t = core.computeTotals({ easy: core.parseProg(prog.easy), normal: core.parseProg(prog.normal), hard: core.parseProg(prog.hard) });
    rows.push(oldRow(i, prog, { stars_easy: t.stars.easy, stars_normal: t.stars.normal, stars_hard: t.stars.hard, total_stars: t.totalStars }));
  }
  const r = tool.recompute(rows);
  assert.equal(r.changed, 0);
  assert.deepEqual(r.sql, []);
  assert.deepEqual(r.skipped, []);
});

test('고수 새 기준이 도구 결과에 반영된다: 14->★, 15->★★, 29->★★, 30->★★★ (초보·중수 임계값은 그대로)', () => {
  const only = (prog) => tool.recomputeRow(oldRow(1, prog, { stars_easy: 0, stars_normal: 0, stars_hard: 0, total_stars: 0 }));
  assert.equal(only({ easy: NONE, normal: NONE, hard: E([14]) }).stars[2], 1);
  assert.equal(only({ easy: NONE, normal: NONE, hard: E([15]) }).stars[2], 2);
  assert.equal(only({ easy: NONE, normal: NONE, hard: E([29]) }).stars[2], 2);
  assert.equal(only({ easy: NONE, normal: NONE, hard: E([30]) }).stars[2], 3);
  assert.equal(only({ easy: E([38]), normal: E([35]), hard: NONE }).stars[0], 1);
  assert.equal(only({ easy: E([39]), normal: E([36]), hard: NONE }).stars[0], 2);
  assert.equal(only({ easy: E([64]), normal: E([59]), hard: NONE }).stars[1], 2);
  assert.equal(only({ easy: E([65]), normal: E([60]), hard: NONE }).stars[1], 3);
});

test('extractRows: 행 배열 / [{results}] / {results} 모양을 모두 읽고, 모르는 모양은 null', () => {
  const a = { id: 1 };
  const b = { id: 2 };
  assert.deepEqual(tool.extractRows([a, b]), [a, b]);
  assert.deepEqual(tool.extractRows([{ results: [a], success: true, meta: {} }, { results: [b] }]), [a, b]);
  assert.deepEqual(tool.extractRows({ results: [a, b] }), [a, b]);
  assert.deepEqual(tool.extractRows([]), []);
  assert.equal(tool.extractRows({ rows: [a] }), null);
  assert.equal(tool.extractRows('x'), null);
  assert.equal(tool.extractRows(null), null);
});

test('readProg: 이상한 진행 문자열은 null (core.parseProg 처럼 전부 -1 로 바꿔 별을 0 으로 지우지 않는다)', () => {
  assert.deepEqual(tool.readProg(NONE), new Array(10).fill(-1));
  assert.deepEqual(tool.readProg('35,0,-1,-1,-1,-1,-1,-1,-1,-1'), [35, 0, -1, -1, -1, -1, -1, -1, -1, -1]);
  for (const bad of ['', '1,2,3', '-2,-1,-1,-1,-1,-1,-1,-1,-1,-1', '01,-1,-1,-1,-1,-1,-1,-1,-1,-1', '+5,-1,-1,-1,-1,-1,-1,-1,-1,-1',
    '1.5,-1,-1,-1,-1,-1,-1,-1,-1,-1', ' 5,-1,-1,-1,-1,-1,-1,-1,-1,-1', '-0,-1,-1,-1,-1,-1,-1,-1,-1,-1', null, undefined, 5, [], '5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1']) {
    assert.equal(tool.readProg(bad), null, String(bad));
  }
});

test('명령줄: wrangler 모양 입력([{results}]) -> stdout 에 UPDATE, stderr 에 요약, --out 으로 파일에도 쓴다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-recompute-'));
  try {
    const rows = [
      oldRow(41, { easy: E([66]), normal: NONE, hard: E([35]) }),
      oldRow(42, { easy: E([66]), normal: NONE, hard: NONE }),
      oldRow(43, { easy: E([66]), normal: NONE, hard: NONE }, { prog_hard: 'bad' })
    ];
    const input = path.join(dir, 'in.json');
    fs.writeFileSync(input, JSON.stringify([{ results: rows, success: true, meta: { duration: 1 } }]));
    const a = spawnSync(process.execPath, [TOOL, input], { encoding: 'utf8' });
    assert.equal(a.status, 0);
    assert.equal(a.stdout, 'UPDATE players SET stars_easy=3, stars_normal=0, stars_hard=3, total_stars=12' + where(41, { easy: E([66]), normal: NONE, hard: E([35]) }) + '\n');
    assert.match(a.stderr, /바뀐 행 1개 \/ 전체 3개/);
    assert.match(a.stderr, /건너뜀: 3번째 행 \(id=43\)/);
    const out = path.join(dir, 'out.sql');
    const b = spawnSync(process.execPath, [TOOL, input, '--out', out], { encoding: 'utf8' });
    assert.equal(b.status, 0);
    assert.equal(b.stdout, '');
    assert.equal(fs.readFileSync(out, 'utf8'), a.stdout);
    assert.match(b.stderr, /바뀐 행 1개 \/ 전체 3개/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('명령줄: 입력 파일이 없거나 JSON 이 아니거나 인자가 틀리면 종료 코드 2 이고 아무것도 쓰지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-recompute-'));
  try {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, 'not json');
    const out = path.join(dir, 'never.sql');
    const run = (args) => spawnSync(process.execPath, [TOOL].concat(args), { encoding: 'utf8' });
    for (const args of [[], [path.join(dir, 'missing.json')], [bad], [bad, '--out'], ['--nope'], [bad, 'extra.json']]) {
      const r = run(args);
      assert.equal(r.status, 2, JSON.stringify(args));
      assert.equal(r.stdout, '');
    }
    const empty = path.join(dir, 'empty.json');
    fs.writeFileSync(empty, '{"rows":[]}');
    const r = run([empty, '--out', out]);
    assert.equal(r.status, 2);
    assert.equal(fs.existsSync(out), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('도구 소스는 네트워크·wrangler·자식 프로세스를 부르지 않고, 입력 파일을 읽기만 한다', () => {
  const src = fs.readFileSync(TOOL, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const word of ['fetch(', 'XMLHttpRequest', 'node:http', 'node:https', 'node:net', 'child_process', 'spawn', 'exec(', 'wrangler']) {
    assert.equal(src.indexOf(word), -1, word);
  }
  assert.equal((src.match(/writeFileSync\(/g) || []).length, 1);                 // 쓰기는 --out 파일 하나뿐
  assert.ok(/writeFileSync\(outFile,/.test(src));
});
