#!/usr/bin/env node
/* 별 기준이 바뀐 뒤 기존 행의 별 열을 다시 계산하는 운영 도구 (spec §44.1-3). 읽기 전용 입력 -> 텍스트(SQL) 출력만 한다.
 *   node apps/element-gems/server/tools/recompute-stars.js <입력.json> [--out <출력.sql>]
 *
 * 입력: 운영자가 `wrangler d1 execute element-gems-db --remote --json --command "SELECT …"` 로 내보낸 결과 파일.
 *   모양은 행 배열 / [{ results: [행…] }] / { results: [행…] } 어느 것이나 된다.
 *   행에 필요한 열: id, prog_easy, prog_normal, prog_hard, stars_easy, stars_normal, stars_hard, total_stars (schema.sql 의 열 이름. left_* 등은 있어도 읽지 않는다).
 * 출력: prog_* 를 core.parseProg 와 같은 규칙으로 읽어 core.computeTotals 로 다시 계산한 뒤, stars_* 또는 total_stars 가 달라진 행에 대해서만
 *   UPDATE players SET stars_easy=…, stars_normal=…, stars_hard=…, total_stars=… WHERE id=… AND prog_easy='…' AND prog_normal='…' AND prog_hard='…';   한 줄씩 낸다.
 *   다른 열(up_*, last_write_at, hidden, left_* 등)은 건드리지 않는다.
 *   WHERE 의 prog_* 조건은 입력 행의 값 그대로다. 내보내기~적용 사이에 사람이 기록을 올렸다면(진행 문자열이 달라졌다면) 조건이 안 맞아 그 행은 갱신되지 않는다
 *   (그 행은 서버가 이미 새 기준으로 계산했으므로 옛 별로 덮어쓰지 않는다).
 *   id 와 별 값은 정수로 검사한 숫자만, prog_* 는 엄격 검사를 통과한 숫자·쉼표·'-' 로만 된 문자열만 SQL 에 넣는다(그 밖의 문자가 있으면 그 행은 건너뛴다).
 *   검사에 실패한 행은 건너뛰고 stderr 에 알린다. 마지막에 "바뀐 행 N개 / 전체 M개"를 stderr 에 낸다.
 * 이 도구는 네트워크·wrangler 를 부르지 않는다. 만든 SQL 을 D1 에 적용하는 일은 운영자가 직접 한다(server/README.md 참고).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require(path.join(__dirname, '..', 'src', 'core.js'));

const STAR_COLS = ['stars_easy', 'stars_normal', 'stars_hard'];
const PROG_COLS = ['prog_easy', 'prog_normal', 'prog_hard'];
const SAFE_PROG = /^[0-9,-]+$/;      // SQL 문자열 리터럴에 넣어도 되는 문자만(숫자·쉼표·'-')

/** 0 이상 안전한 정수인가(문자열 숫자는 허용하지 않는다) */
function isCount(v) { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0; }

/** wrangler --json 결과 등 입력 JSON 에서 행 배열을 꺼낸다. 알 수 없는 모양이면 null */
function extractRows(data) {
  if (Array.isArray(data)) {
    if (data.length > 0 && data.every((x) => x && typeof x === 'object' && !Array.isArray(x) && Array.isArray(x.results))) {
      return data.reduce((acc, x) => acc.concat(x.results), []);          // [{results:[…]}, …]
    }
    return data;                                                          // 행 배열
  }
  if (data && typeof data === 'object' && Array.isArray(data.results)) return data.results;
  return null;
}

/** 'a,b,…' (10개, 각각 -1 이상 정수) 를 엄격하게 읽는다. core.parseProg 와 같은 결과를 내되, 이상한 값이면 null(core.parseProg 는 전부 -1 로 바꿔 버리므로 여기서는 건너뛴다) */
function readProg(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split(',');
  if (parts.length !== core.STAGES) return null;
  for (const p of parts) if (!/^(?:-1|0|[1-9]\d{0,5})$/.test(p)) return null;     // -1 또는 0 이상 정수(앞자리 0·부호·공백·소수 불가)
  return core.parseProg(str);
}

/** 행 하나를 검사·재계산. 성공: { ok:true, id, stars:[e,n,h], total, progs:[e,n,h], changed } / 실패: { ok:false, reason } */
function recomputeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, reason: '행이 객체가 아님' };
  if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 1) return { ok: false, reason: 'id 가 1 이상 정수가 아님' };
  const p = {};
  const progs = [];
  for (let i = 0; i < core.DIFFS.length; i++) {
    const arr = readProg(row[PROG_COLS[i]]);
    if (!arr) return { ok: false, reason: PROG_COLS[i] + ' 형식이 올바르지 않음' };
    if (!SAFE_PROG.test(row[PROG_COLS[i]])) return { ok: false, reason: PROG_COLS[i] + ' 에 숫자·쉼표·- 밖의 문자가 있음' };
    p[core.DIFFS[i]] = arr;
    progs.push(row[PROG_COLS[i]]);
  }
  for (const c of STAR_COLS.concat(['total_stars'])) {
    if (!isCount(row[c])) return { ok: false, reason: c + ' 가 0 이상 정수가 아님' };
  }
  const t = core.computeTotals(p);
  const stars = core.DIFFS.map((d) => t.stars[d]);
  const total = t.totalStars;
  for (const v of stars.concat([total])) if (!isCount(v)) return { ok: false, reason: '계산 결과가 정수가 아님' };
  const changed = stars.some((v, i) => v !== row[STAR_COLS[i]]) || total !== row.total_stars;
  return { ok: true, id: row.id, stars: stars, total: total, progs: progs, changed: changed };
}

/** 숫자만 SQL 에 넣는다(한 번 더 확인) */
function num(n) {
  const s = String(n);
  if (!/^\d{1,15}$/.test(s)) throw new Error('SQL 에 넣을 수 없는 값: ' + s);
  return s;
}

/** 진행 문자열을 SQL 문자열 리터럴로. 숫자·쉼표·'-' 밖의 문자가 있으면 예외(recomputeRow 가 먼저 걸러서 여기까지 오지 않는다) */
function progLit(str) {
  if (typeof str !== 'string' || !SAFE_PROG.test(str)) throw new Error('SQL 에 넣을 수 없는 진행 문자열');
  return "'" + str + "'";
}

function updateSql(r) {
  return 'UPDATE players SET stars_easy=' + num(r.stars[0]) + ', stars_normal=' + num(r.stars[1]) + ', stars_hard=' + num(r.stars[2]) +
    ', total_stars=' + num(r.total) + ' WHERE id=' + num(r.id) +
    ' AND prog_easy=' + progLit(r.progs[0]) + ' AND prog_normal=' + progLit(r.progs[1]) + ' AND prog_hard=' + progLit(r.progs[2]) + ';';
}

/** 행 배열 -> { sql:[UPDATE 문…], changed, total, skipped:[{index, id, reason}] } */
function recompute(rows) {
  const out = { sql: [], changed: 0, total: rows.length, skipped: [] };
  rows.forEach((row, index) => {
    const r = recomputeRow(row);
    if (!r.ok) {
      const id = row && typeof row === 'object' && Number.isSafeInteger(row.id) ? row.id : null;
      out.skipped.push({ index: index, id: id, reason: r.reason });
      return;
    }
    if (r.changed) { out.sql.push(updateSql(r)); out.changed++; }
  });
  return out;
}

function usage() {
  return '사용법: node apps/element-gems/server/tools/recompute-stars.js <입력.json> [--out <출력.sql>]';
}

function main(argv) {
  let input = null;
  let outFile = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      outFile = argv[++i];
      if (!outFile) { process.stderr.write(usage() + '\n'); return 2; }
    } else if (a.startsWith('--')) {
      process.stderr.write('알 수 없는 옵션: ' + a + '\n' + usage() + '\n');
      return 2;
    } else if (input === null) {
      input = a;
    } else {
      process.stderr.write(usage() + '\n');
      return 2;
    }
  }
  if (!input) { process.stderr.write(usage() + '\n'); return 2; }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (e) {
    process.stderr.write('입력 파일을 읽을 수 없어요: ' + (e && e.message ? e.message : e) + '\n');
    return 2;
  }
  const rows = extractRows(data);
  if (!rows) { process.stderr.write('입력 JSON 에서 행 목록을 찾지 못했어요(배열 또는 results 배열이 필요해요).\n'); return 2; }
  const r = recompute(rows);
  const text = r.sql.length ? r.sql.join('\n') + '\n' : '';
  if (outFile) fs.writeFileSync(outFile, text, 'utf8'); else process.stdout.write(text);
  for (const s of r.skipped) process.stderr.write('건너뜀: ' + (s.index + 1) + '번째 행' + (s.id !== null ? ' (id=' + s.id + ')' : '') + ' - ' + s.reason + '\n');
  process.stderr.write('바뀐 행 ' + r.changed + '개 / 전체 ' + r.total + '개' + (r.skipped.length ? ' (건너뜀 ' + r.skipped.length + '개)' : '') + '\n');
  return 0;
}

module.exports = { extractRows, readProg, recomputeRow, recompute, updateSql };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
