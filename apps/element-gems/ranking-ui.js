/* element-gems — ranking-ui.js (spec §19.3·19.5: 프로필 화면 / 명예의 전당 화면 / 시작 화면 칩·버튼 / 결과 화면 한 줄)
 * game.js 가 내보내는 window.ElementGemsHost 이벤트(init, renderStart, stageResult)에만 연결된다.
 * CONFIG.ranking.apiBase 가 비어 있으면 이 파일은 아무것도 하지 않는다(UI 숨김 유지, 네트워크 0회).
 * 닉네임·순위 이름은 항상 textContent 로만 출력한다(HTML 삽입 금지).
 */
(function () {
  'use strict';

  const host = window.ElementGemsHost;
  const R = window.ElementGemsRanking;
  if (!host || !R || !host.CONFIG || !host.CONFIG.ranking) return;
  const cfg = host.CONFIG.ranking;
  if (!(cfg.apiBase || cfg.api)) return;                  // 배포 전 기본 상태: 랭킹 기능 전체 꺼짐

  const $ = function (id) { return document.getElementById(id); };
  const DIFFS = R.DIFFS;
  const BOARD_LABEL = { all: '전체', easy: '초보', normal: '중수', hard: '고수' };
  const FRESH_MS = 30000;                                  // 같은 탭을 다시 열 때 이 시간 안이면 메모리 결과 재사용(서버 캐시와 같은 간격)

  const caps = {};
  DIFFS.forEach(function (d) { caps[d] = host.CONFIG.difficulty[d].time.start + 20; });   // 서버 허용 left 상한(시작 시간 + 20초)

  const client = R.createClient({
    config: cfg,
    store: R.createStore(window),
    fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
    getSave: host.getSave,
    stageCount: host.CONFIG.stages.count,
    caps: caps,
    crypto: window.crypto,
    emit: onClientEvent,
    isOffline: function () { return window.navigator && window.navigator.onLine === false; },
    log: function () { try { console.warn.apply(console, arguments); } catch (e) { /* 무시 */ } }
  });

  const ui = {
    board: 'all',
    seq: 0,                     // 순위표 요청 순서(늦게 온 응답 무시)
    data: {},                   // board -> { res, at } 메모리 결과
    lastRefreshAt: 0,
    mode: 'create',             // 프로필 화면: create | edit
    avatar: 0,
    nickOk: false,
    composing: false,
    busy: false,
    gridBuilt: false,
    debounce: 0,
    resultPending: false,
    renamePrompted: false,
    lastHidden: 0
  };
  const el = {};

  /* ---------------------------------------------------------------------
   * 공통 DOM 도우미
   * ------------------------------------------------------------------- */
  function cacheDom() {
    ['btn-profile-chip', 'me-note', 'btn-hall', 'end-rank', 'screen-profile', 'screen-hall', 'pf-title', 'pf-sub', 'pf-rename', 'pf-avatars', 'pf-nick', 'pf-count',
      'pf-msg-wrap', 'pf-left', 'pf-save', 'pf-skip', 'pf-cancel', 'pf-delete', 'pf-confirm', 'pf-confirm-yes', 'pf-confirm-no',
      'hall-title', 'hall-back', 'hall-refresh', 'hall-banner', 'hall-tabs', 'hall-asof', 'hall-rule', 'hall-weight', 'hall-panel', 'hall-list', 'hall-empty', 'hall-me', 'hall-foot'
    ].forEach(function (id) { el[id] = $(id); });
  }

  function avatarSrc(n) { return 'assets/avatars/avatar-' + (n < 10 ? '0' : '') + n + '.webp'; }
  function initialOf(nick) { const a = Array.from(String(nick || '')); return a.length ? a[0] : '?'; }

  function fallbackEl(label) {
    const s = document.createElement('span');
    s.className = 'av-fb';
    s.textContent = initialOf(label);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /** 아바타 이미지(지연 로딩). 번호가 잘못됐거나 로드에 실패하면 이니셜 칸으로 대체 */
  function avatarEl(n, label, size) {
    if (!(n >= 1 && n <= R.AVATAR_COUNT)) return fallbackEl(label);
    const img = document.createElement('img');
    img.src = avatarSrc(n);
    img.width = size; img.height = size;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.dataset.av = '1';
    img.dataset.label = label || '';
    return img;
  }

  // 이미지 로드 실패 -> 대체 칸 (error 는 버블링되지 않으므로 capture 로 한 번만 위임)
  document.addEventListener('error', function (e) {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset && t.dataset.av === '1' && t.parentNode) t.replaceWith(fallbackEl(t.dataset.label));
  }, true);

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function visible(node) { return node && !node.hidden; }
  function home() { host.goHome(); window.scrollTo(0, 0); }
  function onHallScreen() { return visible(el['screen-hall']); }
  function onProfileScreen() { return visible(el['screen-profile']); }
  function tagText(tag) { return '#' + R.pad4(tag); }

  /* ---------------------------------------------------------------------
   * 시작 화면: 프로필 칩 · [명예의 전당] 버튼 · 안내 한 줄
   * ------------------------------------------------------------------- */
  function renderStartExtras() {
    const on = client.enabled();
    el['btn-hall'].hidden = !on;
    el['btn-profile-chip'].hidden = !on;
    if (!on) { el['me-note'].hidden = true; return; }
    const p = client.profile();
    const chip = el['btn-profile-chip'];
    clear(chip);
    if (p.registered) {
      chip.className = 'me-chip';
      chip.appendChild(avatarEl(p.avatar, p.nick, 40));
      const nm = mk('span', 'me-name', p.nick);
      nm.appendChild(mk('small', '', tagText(p.tag)));
      chip.appendChild(nm);
      chip.appendChild(mk('span', 'me-edit', '수정'));
      chip.setAttribute('aria-label', '내 프로필 고치기: ' + p.nick + ', 번호 ' + R.pad4(p.tag));
    } else {
      chip.className = 'me-chip empty';
      chip.appendChild(mk('span', 'plus', '+'));
      chip.appendChild(mk('span', 'me-name', '내 프로필 만들기'));
      chip.setAttribute('aria-label', '내 프로필 만들기');
    }
    let note = '';
    if (p.notice === 'gone') note = '서버에 있던 프로필이 지워졌어요. 다시 만들 수 있어요.';
    else if (p.registered && (p.hidden === 2 || p.notice === 'rename')) note = '이 이름은 순위표에서 잠시 숨겨졌어요. 프로필에서 새 이름을 정해 주세요.';
    else if (p.registered && p.hidden === 1) note = '지금은 순위표에 보이지 않아요.';
    el['me-note'].textContent = note;
    el['me-note'].hidden = !note;
  }

  function disableUi(code) {
    el['btn-hall'].hidden = true;
    el['btn-profile-chip'].hidden = true;
    if (code === 'unsupported_version') {
      el['me-note'].textContent = '명예의 전당은 앱을 새로 고치면 다시 쓸 수 있어요.';
      el['me-note'].hidden = false;
    } else {
      el['me-note'].hidden = true;
    }
    if (onHallScreen() || onProfileScreen()) home();
  }

  /* ---------------------------------------------------------------------
   * 프로필 화면
   * ------------------------------------------------------------------- */
  function buildAvatarGrid() {
    if (ui.gridBuilt) return;
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= R.AVATAR_COUNT; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'av-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', R.AVATAR_NAMES[n - 1]);
      b.dataset.avatar = String(n);
      b.tabIndex = -1;
      b.appendChild(avatarEl(n, R.AVATAR_NAMES[n - 1], 192));
      frag.appendChild(b);
    }
    el['pf-avatars'].appendChild(frag);
    ui.gridBuilt = true;
  }

  function selectAvatar(n, focus) {
    ui.avatar = n;
    const btns = el['pf-avatars'].querySelectorAll('.av-btn');
    Array.prototype.forEach.call(btns, function (b, i) {
      const on = i + 1 === n;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on || (!n && i === 0) ? 0 : -1;
      if (on && focus) b.focus();
    });
    updateSaveState();
  }

  function setMsg(kind, text) {
    const wrap = el['pf-msg-wrap'];
    clear(wrap);
    el['pf-nick'].classList.toggle('bad', kind === 'err');
    el['pf-nick'].setAttribute('aria-invalid', kind === 'err' ? 'true' : 'false');
    if (!kind) return;
    const p = mk('p', 'pf-msg ' + kind);
    p.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    p.appendChild(mk('i', '', kind === 'err' ? '!' : '✓')).setAttribute('aria-hidden', 'true');
    p.appendChild(mk('span', '', text));
    wrap.appendChild(p);
  }

  /** 입력값: NFC + 앞뒤 공백 제거(nickname.js 는 공백을 지우지 않으므로 여기서 한다) */
  function curNick() { return el['pf-nick'].value.normalize('NFC').trim(); }

  function updateCount() {
    const n = R.codepointCount(curNick());
    el['pf-count'].textContent = n + '/' + R.NICK_MAX;
  }

  /** 입력값 검사(조합이 끝난 뒤에만). 결과: ui.nickOk 와 안내 문구 */
  function validateNick(showOk) {
    const raw = curNick();
    if (!raw) { ui.nickOk = false; setMsg('', ''); updateSaveState(); return null; }
    const r = R.checkNick(raw, window);
    ui.nickOk = r.ok;
    if (r.ok) setMsg(showOk === false ? '' : 'ok', R.MESSAGES.nick_ok);
    else setMsg('err', r.message);
    updateSaveState();
    return r;
  }

  function changedFromProfile() {
    if (ui.mode !== 'edit') return true;
    const p = client.profile();
    return curNick() !== p.nick || ui.avatar !== p.avatar;
  }

  function updateSaveState() {
    const ok = ui.nickOk && ui.avatar >= 1 && !ui.busy && !ui.composing && changedFromProfile();
    el['pf-save'].disabled = !ok;
  }

  function nickLeftText(n) {
    if (n == null) return '';
    if (n <= 0) return '오늘은 닉네임을 더 바꿀 수 없어요. 그림은 바꿀 수 있어요.';
    return '오늘 닉네임 바꾸기 ' + n + '번 남았어요.';
  }

  function openProfile(mode) {
    const p = client.profile();
    ui.mode = mode === 'edit' && p.registered ? 'edit' : 'create';
    ui.busy = false;
    ui.composing = false;
    buildAvatarGrid();
    const edit = ui.mode === 'edit';
    el['pf-title'].textContent = edit ? '내 프로필 고치기' : '내 프로필 만들기';
    el['pf-sub'].textContent = edit ? '그림이나 이름을 바꿀 수 있어요.' : '명예의 전당에서 나를 보여 줄 그림과 이름을 골라요.';
    el['pf-save'].textContent = edit ? '저장' : '저장하고 시작';
    el['pf-skip'].hidden = edit;
    el['pf-cancel'].hidden = !edit;
    el['pf-delete'].hidden = !edit;
    el['pf-confirm'].hidden = true;
    el['pf-nick'].value = edit ? p.nick : '';
    el['pf-nick'].disabled = false;
    el['pf-rename'].hidden = !(edit && (p.hidden === 2 || p.notice === 'rename'));
    const left = edit ? nickLeftText(p.nickLeft) : '';
    el['pf-left'].textContent = left;
    el['pf-left'].hidden = !left;
    setMsg('', '');
    updateCount();
    ui.nickOk = false;
    let av = edit ? p.avatar : ui.avatar;
    if (!(av >= 1)) av = 1 + Math.floor(Math.random() * R.AVATAR_COUNT);          // 만들기: 무작위 1개 미리 선택(바꿀 수 있음)
    host.showScreen('profile');
    selectAvatar(av, false);
    if (edit) validateNick(false);
    window.scrollTo(0, 0);
    el['pf-title'].focus({ preventScroll: true });             // 새 화면의 제목으로 포커스(스크린리더·키보드 사용자용, 링은 보이지 않음)
  }

  async function saveProfileNow() {
    if (ui.busy) return;
    const r = validateNick();
    if (!r || !r.ok || !(ui.avatar >= 1)) return;
    ui.busy = true;
    el['pf-save'].disabled = true;
    const label = el['pf-save'].textContent;
    el['pf-save'].textContent = '저장하는 중…';
    let res;
    try { res = await client.saveProfile({ nick: r.nick, avatar: ui.avatar }); } catch (e) { res = { ok: false, message: R.MESSAGES.generic }; }
    ui.busy = false;
    el['pf-save'].textContent = label;
    if (!onProfileScreen()) return;
    if (res.ok) {
      home();
      return;
    }
    if (res.kind === 'disable') { disableUi(res.code); return; }
    ui.nickOk = res.field === 'nick' || /^nick_/.test(res.code || '') ? false : ui.nickOk;
    setMsg('err', res.message || R.MESSAGES.generic);
    if (res.code === 'nick_change_limit') {
      el['pf-left'].textContent = nickLeftText(0);
      el['pf-left'].hidden = false;
    }
    updateSaveState();
    if (res.code === 'nick_change_limit' || /^nick_/.test(res.code || '')) el['pf-nick'].focus({ preventScroll: true });
  }

  function skipProfile() {
    client.skipProfile();
    home();
  }

  function askDelete() {
    el['pf-confirm'].hidden = false;
    el['pf-confirm-no'].focus({ preventScroll: true });
    el['pf-confirm'].scrollIntoView({ block: 'nearest' });
  }
  function cancelDelete() {
    el['pf-confirm'].hidden = true;
    el['pf-delete'].focus({ preventScroll: true });
  }
  async function doDelete() {
    if (ui.busy) return;
    ui.busy = true;
    el['pf-confirm-yes'].disabled = true;
    let res;
    try { res = await client.deleteProfile(); } catch (e) { res = { ok: false, message: R.MESSAGES.generic }; }
    ui.busy = false;
    el['pf-confirm-yes'].disabled = false;
    if (!onProfileScreen()) return;
    if (res.ok) { home(); return; }
    el['pf-confirm'].hidden = true;
    setMsg('err', res.message || R.MESSAGES.generic);
  }

  function bindProfile() {
    const input = el['pf-nick'];
    input.addEventListener('compositionstart', function () { ui.composing = true; window.clearTimeout(ui.debounce); ui.nickOk = false; updateSaveState(); });
    input.addEventListener('compositionend', function () { ui.composing = false; updateCount(); validateNick(); });
    input.addEventListener('input', function (e) {
      updateCount();
      window.clearTimeout(ui.debounce);
      ui.nickOk = false;
      updateSaveState();
      if (ui.composing || (e && e.isComposing)) return;       // 한글 조합 중에는 검사하지 않는다(조합이 끊기지 않게)
      if (!curNick()) { setMsg('', ''); return; }
      ui.debounce = window.setTimeout(function () { if (!ui.composing) validateNick(); }, 250);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && !ui.composing) {
        e.preventDefault();
        window.clearTimeout(ui.debounce);
        if (curNick()) validateNick();
        if (!el['pf-save'].disabled) saveProfileNow();
      }
    });
    el['pf-avatars'].addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.av-btn');
      if (b) selectAvatar(Number(b.dataset.avatar), false);
    });
    el['pf-avatars'].addEventListener('keydown', function (e) {
      const cur = ui.avatar || 1;
      let n = 0;
      if (e.key === 'ArrowRight') n = Math.min(R.AVATAR_COUNT, cur + 1);
      else if (e.key === 'ArrowLeft') n = Math.max(1, cur - 1);
      else if (e.key === 'ArrowDown') n = Math.min(R.AVATAR_COUNT, cur + 4);
      else if (e.key === 'ArrowUp') n = Math.max(1, cur - 4);
      else if (e.key === 'Home') n = 1;
      else if (e.key === 'End') n = R.AVATAR_COUNT;
      if (n) { e.preventDefault(); selectAvatar(n, true); }
    });
    el['pf-save'].addEventListener('click', saveProfileNow);
    el['pf-skip'].addEventListener('click', skipProfile);
    el['pf-cancel'].addEventListener('click', function () { home(); });
    el['pf-delete'].addEventListener('click', askDelete);
    el['pf-confirm-no'].addEventListener('click', cancelDelete);
    el['pf-confirm-yes'].addEventListener('click', doDelete);
  }

  /* ---------------------------------------------------------------------
   * 명예의 전당 화면
   * ------------------------------------------------------------------- */
  const CLOUD = '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M26 70h42a16 16 0 0 0 2-31.9A22 22 0 0 0 27.5 34 18 18 0 0 0 26 70z" fill="#ece6ff" stroke="#9a85e6" stroke-width="4" stroke-linejoin="round"/><path d="M28 24 70 78" stroke="#ff5a64" stroke-width="7" stroke-linecap="round"/><path d="M28 24 70 78" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/></svg>';

  function isMine(row) {
    const p = client.profile();
    return p.registered && row.nick === p.nick && row.tag === R.pad4(p.tag);
  }

  function rowEl(r, board) {
    const li = mk('li', 'hr' + (r.rank === 1 ? ' top1' : '') + (isMine(r) ? ' me' : ''));
    li.setAttribute('aria-label', r.rank + '위, ' + r.nick + ' 번호 ' + r.tag + ', ' + R.scoreLabel(board, r.stars));
    li.appendChild(mk('span', 'rk' + (r.rank <= 3 ? ' m' + r.rank : ''), String(r.rank)));
    li.appendChild(avatarEl(r.avatar, r.nick, 44));
    const nm = mk('span', 'nm');
    nm.appendChild(mk('span', 'nn', r.nick));                  // 이름이 길면 이름만 줄임표로 줄이고 #번호는 남긴다
    nm.appendChild(mk('small', '', '#' + r.tag));
    li.appendChild(nm);
    li.appendChild(scEl(board, r.stars));
    return li;
  }

  /** 점수 칸: ★ + 숫자(전체 탭은 뒤에 작은 "점") */
  function scEl(board, n) {
    const sc = mk('span', 'sc', String(n));
    if (board === 'all') sc.appendChild(mk('small', 'pt', '점'));
    return sc;
  }

  function renderRows(rows, board) {
    const frag = document.createDocumentFragment();
    rows.forEach(function (r) { frag.appendChild(rowEl(r, board)); });
    el['hall-list'].replaceChildren(frag);
    el['hall-list'].hidden = !rows.length;
    el['hall-list'].scrollTop = 0;
  }

  function showEmpty(kind, opts) {
    const box = el['hall-empty'];
    clear(box);
    box.className = 'hf-empty' + (kind === 'loading' ? ' is-loading' : '');
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    if (kind === 'none') {
      box.appendChild(mk('p', '', '아직 아무도 없어요. 첫 번째 챔피언이 되어 보세요!'));
    } else if (kind === 'loading') {
      box.appendChild(mk('p', '', '순위표를 불러오고 있어요…'));
    } else if (kind === 'error') {
      const holder = mk('div');
      holder.innerHTML = CLOUD;                               // 고정된 아이콘 문자열(사용자 입력 아님)
      box.appendChild(holder.firstChild);
      box.appendChild(mk('h3', '', '순위표를 불러오지 못했어요'));
      const p = mk('p');
      if (opts && opts.version) {
        p.textContent = '앱을 새로 고친 뒤에 다시 해 보세요.';
      } else {
        p.appendChild(document.createTextNode('인터넷 연결을 확인하고 다시 해 보세요.'));
        p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode('게임은 그대로 즐길 수 있어요. 내 기록은 안전하게 저장되고, 연결되면 자동으로 올려요.'));
      }
      box.appendChild(p);
      const retry = mk('button', 'btn primary', '다시 시도');
      retry.type = 'button';
      retry.id = 'hall-retry';
      retry.addEventListener('click', function () { loadBoard(ui.board, true); });
      const back = mk('button', 'btn ghost', '게임으로 돌아가기');
      back.type = 'button';
      back.addEventListener('click', function () { home(); });
      box.appendChild(retry);
      box.appendChild(back);
    }
    box.hidden = false;
    el['hall-list'].hidden = true;
  }

  function hideEmpty() { el['hall-empty'].hidden = true; }

  function plainBar(text, btnText, btnFn) {
    const bar = el['hall-me'];
    clear(bar);
    bar.className = 'myrank plain';
    bar.removeAttribute('aria-label');
    bar.appendChild(mk('p', '', text));
    if (btnText) {
      const b = mk('button', 'btn primary', btnText);
      b.type = 'button';
      b.addEventListener('click', btnFn);
      bar.appendChild(b);
    }
    bar.hidden = false;
  }

  /** 고정 내 순위 바. stale 이면 라벨에 * 를 붙인다(캐시 기준) */
  function renderMe(res, stale) {
    const bar = el['hall-me'];
    const p = client.profile();
    if (!p.registered) {
      plainBar('내 이름을 만들면 순위가 보여요', '프로필 만들기', function () { openProfile('create'); });
      return;
    }
    const me = res && res.me;
    if (me && me.hidden === 1) { plainBar('지금은 순위표에 보이지 않아요.'); return; }
    if (me && me.hidden === 2) { plainBar('이 이름은 순위표에서 잠시 숨겨졌어요. 새 이름을 정해 주세요.', '이름 바꾸기', function () { openProfile('edit'); }); return; }
    if (!me || !(me.rank > 0)) {
      if (res && res.ok) plainBar('아직 순위가 없어요. 스테이지를 클리어해서 별을 모아 보세요!');
      else bar.hidden = true;
      return;
    }
    clear(bar);
    bar.className = 'myrank';
    const board = res.board || ui.board;
    bar.setAttribute('aria-label', '내 순위 ' + me.rank + '위, ' + R.scoreLabel(board, me.stars));
    const lab = mk('span', 'lab');
    lab.appendChild(mk('small', '', stale ? '내 순위*' : '내 순위'));
    lab.appendChild(mk('strong', '', me.rank + '위'));
    bar.appendChild(lab);
    bar.appendChild(avatarEl(me.avatar || p.avatar, me.nick || p.nick, 44));
    const nm = mk('span', 'nm');
    nm.appendChild(mk('span', 'nn', me.nick || p.nick));
    nm.appendChild(mk('small', '', tagText(me.tag != null ? me.tag : p.tag)));
    bar.appendChild(nm);
    bar.appendChild(scEl(board, me.stars));
    bar.hidden = false;
  }

  function renderFoot(stale, asOfMs) {
    const f = el['hall-foot'];
    clear(f);
    if (stale && asOfMs) f.appendChild(document.createTextNode('* ' + R.formatClock(asOfMs) + ' 기준이에요. '));
    f.appendChild(document.createTextNode('상위 ' + (cfg.pageSize || 50) + '명을 보여 줘요. 보이는 정보는 닉네임·그림·별 수·순위뿐이에요.'));
    const st = client.status();
    if (st.registered && st.dirty && !st.blocked) f.appendChild(mk('span', 'pending-chip', '올릴 기록 1개 대기 중'));
  }

  function setBanner(texts) {
    const b = el['hall-banner'];
    clear(b);
    if (!texts || !texts.length) { b.hidden = true; return; }
    b.appendChild(mk('i', '', '!')).setAttribute('aria-hidden', 'true');
    const span = mk('span');
    texts.forEach(function (t, i) {
      if (i) span.appendChild(document.createTextNode(' '));
      if (typeof t === 'string') span.appendChild(document.createTextNode(t));
      else { span.appendChild(document.createTextNode(t.before)); span.appendChild(mk('b', '', t.bold)); span.appendChild(document.createTextNode(t.after)); }
    });
    b.appendChild(span);
    b.hidden = false;
  }

  function bannerFor(stale, asOfMs) {
    const out = [];
    if (stale) out.push({ before: '인터넷이 불안정해요. ', bold: R.formatClock(asOfMs) || '이전', after: '에 본 순위를 보여 주고 있어요.' });
    const st = client.status();
    if (st.blocked) out.push('기록을 올릴 수 없어요.');
    return out;
  }

  /** 응답(또는 캐시)을 화면에 그린다 */
  function renderBoard(res, stale) {
    hideEmpty();
    const asOf = res.asOf || 0;
    const asof = el['hall-asof'];
    clear(asof);
    asof.appendChild(document.createTextNode('마지막 갱신 '));
    asof.appendChild(mk('b', '', R.formatClock(asOf) || '-'));
    if (!res.rows.length) { el['hall-list'].hidden = true; showEmpty('none'); }
    else renderRows(res.rows, res.board || ui.board);
    renderMe(res, stale);
    renderFoot(stale, asOf);
    setBanner(bannerFor(stale, asOf));
  }

  function renderTabs() {
    Array.prototype.forEach.call(el['hall-tabs'].querySelectorAll('.hf-tab'), function (t) {
      const on = t.dataset.board === ui.board;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    el['hall-rule'].textContent = ui.board === 'all' ? '점수가 같으면 남은 시간이 많은 순' : '별이 같으면 남은 시간이 많은 순';
    el['hall-weight'].hidden = ui.board !== 'all';
    el['hall-panel'].setAttribute('aria-labelledby', 'hall-tab-' + ui.board);
    el['hall-list'].setAttribute('aria-label', '별 챔피언 순위 ' + BOARD_LABEL[ui.board] + ' 상위 ' + (cfg.pageSize || 50) + '명');
  }

  async function loadBoard(board, force) {
    const mySeq = ++ui.seq;
    const mem = ui.data[board];
    if (!force && mem && Date.now() - mem.at < FRESH_MS && mem.res.ok) {
      renderBoard(mem.res, false);
      return;
    }
    const cache = client.loadCache(board);
    if (cache) {
      renderBoard(cache, false);
      el['hall-asof'].textContent = '불러오는 중…';
    } else {
      el['hall-asof'].textContent = '불러오는 중…';
      el['hall-me'].hidden = true;
      setBanner(null);
      showEmpty('loading');
      renderFoot(false, 0);
    }
    let res;
    try { res = await client.fetchBoard(board); } catch (e) { res = { ok: false, kind: 'retry', code: 'network', cache: cache }; }
    if (mySeq !== ui.seq || !onHallScreen()) return;
    if (res.ok) {
      ui.data[board] = { res: res, at: Date.now() };
      renderBoard(res, false);
      return;
    }
    if (res.kind === 'disable') { disableUi(res.code); return; }
    delete ui.data[board];
    const c = res.cache || cache;
    if (c) {
      renderBoard(c, true);
    } else {
      el['hall-asof'].textContent = '';
      el['hall-me'].hidden = true;
      showEmpty('error', { version: res.code === 'unsupported_version' });
      renderFoot(false, 0);
      setBanner(bannerFor(false, 0));
    }
  }

  function openHall() {
    client.dismissNotice();
    host.showScreen('hall');
    renderTabs();
    window.scrollTo(0, 0);
    el['hall-title'].focus({ preventScroll: true });
    loadBoard(ui.board, false);
  }

  function selectBoard(board, focus) {
    if (board === ui.board) return;
    ui.board = board;
    renderTabs();
    if (focus) { const t = $('hall-tab-' + board); if (t) t.focus(); }
    loadBoard(board, false);
  }

  function refreshHall() {
    const btn = el['hall-refresh'];
    const wait = (cfg.refreshMinMs || 5000) - (Date.now() - ui.lastRefreshAt);
    if (wait > 0) return;                                      // 5초에 1번
    ui.lastRefreshAt = Date.now();
    btn.setAttribute('aria-disabled', 'true');
    window.setTimeout(function () { btn.removeAttribute('aria-disabled'); }, cfg.refreshMinMs || 5000);
    loadBoard(ui.board, true);
  }

  function bindHall() {
    el['hall-back'].addEventListener('click', function () { home(); });
    el['hall-refresh'].addEventListener('click', refreshHall);
    el['hall-tabs'].addEventListener('click', function (e) {
      const t = e.target.closest && e.target.closest('.hf-tab');
      if (t) selectBoard(t.dataset.board, false);
    });
    el['hall-tabs'].addEventListener('keydown', function (e) {
      const order = R.BOARDS;
      const i = order.indexOf(ui.board);
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % order.length;
      else if (e.key === 'ArrowLeft') n = (i + order.length - 1) % order.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = order.length - 1;
      if (n >= 0) { e.preventDefault(); selectBoard(order[n], true); }
    });
  }

  /* ---------------------------------------------------------------------
   * 결과 화면 한 줄 · 클라이언트 이벤트
   * ------------------------------------------------------------------- */
  function setResultLine(text) {
    el['end-rank'].textContent = text || '';
    el['end-rank'].hidden = !text;
  }

  function onStageResult(r) {
    ui.resultPending = false;
    setResultLine('');
    if (!r || !r.improved || !client.enabled() || !client.registered()) return;
    // 별 또는 남은 시간이 개선됐을 때만, 결과 화면이 뜬 뒤 1.2초 뒤에 한 번 제출(연출과 겹치지 않게)
    if (client.markDirty(cfg.resultDelayMs == null ? 1200 : cfg.resultDelayMs)) {
      ui.resultPending = true;
      setResultLine('명예의 전당에 기록을 올리는 중이에요…');
    }
  }

  function onClientEvent(name, data) {
    if (name === 'synced') {
      if (ui.resultPending) { ui.resultPending = false; setResultLine('명예의 전당에 기록을 올렸어요'); }
      delete ui.data.all; delete ui.data.easy; delete ui.data.normal; delete ui.data.hard;   // 내 기록이 바뀌었으니 다음에 열 때 새로 받는다
      if (onHallScreen()) renderFoot(false, 0);
    } else if (name === 'syncFail') {
      if (ui.resultPending) { ui.resultPending = false; setResultLine('기록은 저장됐어요. 연결되면 올릴게요'); }
      if (onHallScreen()) renderFoot(false, 0);
    } else if (name === 'blocked') {
      if (ui.resultPending) { ui.resultPending = false; setResultLine('기록은 이 기기에 저장됐어요.'); }
    } else if (name === 'profile') {
      if (ui.resultPending && !client.registered()) { ui.resultPending = false; setResultLine(''); }   // 서버에서 프로필이 사라진 경우
      const hid = client.profile().hidden;
      if (hid === 2 && ui.lastHidden !== 2) ui.renamePrompted = false;      // 새로 "이름 변경 요청" 상태가 되면 다음 시작 화면에서 한 번 안내
      ui.lastHidden = hid;
      renderStartExtras();
    } else if (name === 'disabled') {
      disableUi(data && data.code);
    } else if (name === 'status') {
      if (onHallScreen()) renderFoot(false, 0);
    }
  }

  /* ---------------------------------------------------------------------
   * 연결
   * ------------------------------------------------------------------- */
  function bindStart() {
    el['btn-profile-chip'].addEventListener('click', function () {
      if (host.getPhase() !== 'start') return;
      client.dismissNotice();
      openProfile(client.registered() ? 'edit' : 'create');
    });
    el['btn-hall'].addEventListener('click', function () {
      if (host.getPhase() !== 'start') return;
      openHall();
    });
  }

  function bindGlobal() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (onHallScreen()) { home(); return; }
      if (onProfileScreen()) {
        if (!el['pf-confirm'].hidden) { cancelDelete(); return; }
        if (ui.mode === 'edit') home();                 // 만들기 화면은 Esc 로 닫지 않는다(실수로 건너뛰는 것 방지)
      }
    });
    window.addEventListener('online', client.onOnline);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) client.onVisible(); });
  }

  function start() {
    cacheDom();
    bindProfile();
    bindHall();
    bindStart();
    bindGlobal();
    renderStartExtras();
    client.start();
    const p = client.profile();
    ui.lastHidden = p.hidden;
    // 최초 실행(프로필도 "나중에"도 없음)이면 시작 화면 대신 프로필 만들기, 이름 변경 요청이면 수정 화면
    if (!p.registered && !p.skipped && host.getPhase() === 'start') openProfile('create');
    else if (p.registered && p.hidden === 2 && !ui.renamePrompted) { ui.renamePrompted = true; openProfile('edit'); }
  }

  host.on('renderStart', function () {
    if (!el['btn-hall']) return;
    renderStartExtras();
    const p = client.profile();
    if (client.enabled() && p.registered && p.hidden === 2 && !ui.renamePrompted) {
      ui.renamePrompted = true;
      window.setTimeout(function () { if (host.getPhase() === 'start' && !onProfileScreen()) openProfile('edit'); }, 0);
    }
  });
  host.on('stageResult', onStageResult);
  host.on('init', start);
})();
