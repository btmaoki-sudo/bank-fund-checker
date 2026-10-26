(function () {
  'use strict';
  var B = window.BFC;
  var items = B.loadItems(window.localStorage);
  var balances = {};          // メモリのみ。永続化しない。
  B.BANKS.forEach(function (b) { balances[b.id] = null; });
  var editingId = null;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function persist() {
    if (!B.persistItems(window.localStorage, items)) alert('端末への保存に失敗しました。');
  }

  // ---- 銀行カード(入力欄は一度だけ作り、再描画で消さない) ----
  var bankEls = {};
  function buildBanks() {
    var wrap = $('banks');
    B.BANKS.forEach(function (b) {
      var card = el('div', 'bank');
      var top = el('div', 'top');
      top.appendChild(el('span', 'name', b.name));
      var need = el('span', 'need');
      top.appendChild(need);
      var sub = el('div', 'sub');
      var bal = el('div', 'bal');
      bal.appendChild(el('span', '', '現在残高'));
      var input = el('input');
      input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
      input.placeholder = '未入力'; input.setAttribute('aria-label', b.name + ' 現在残高');
      input.addEventListener('input', function () {
        var v = B.parseAmount(input.value);
        if (Number.isNaN(v)) { // 不正文字は除去して再解釈
          input.value = input.value.replace(/[^0-9０-９,，]/g, '');
          v = B.parseAmount(input.value);
          if (Number.isNaN(v)) v = null;
        }
        balances[b.id] = v;
        renderResults();
      });
      bal.appendChild(input);
      var result = el('div', 'result');
      card.append(top, sub, bal, result);
      wrap.appendChild(card);
      bankEls[b.id] = { need: need, sub: sub, result: result };
    });
  }

  function renderResults() {
    B.BANKS.forEach(function (b) {
      var n = B.bankNeed(items, b.id), e = bankEls[b.id];
      e.need.textContent = B.formatYen(n.total);
      e.sub.textContent = n.unset ? '金額未入力 ' + n.unset + '件を除く' : '';
      var st = B.bankStatus(n.total, balances[b.id]);
      e.result.className = 'result';
      if (st.status === 'none') { e.result.textContent = '残高を入力してください'; e.result.classList.add('muted'); }
      else if (st.status === 'short') { e.result.textContent = '不足 ' + B.formatYen(st.diff); e.result.classList.add('short'); }
      else { e.result.textContent = '余剰 ' + B.formatYen(st.diff); e.result.classList.add('surplus'); }
    });
    var t = $('totals');
    t.textContent = '';
    var r1 = el('div'); r1.append(el('span', '', '必要金額 合計'), el('b', '', B.formatYen(B.totalNeed(items))));
    var ts = B.totalShortage(items, balances);
    var r2 = el('div'); r2.append(el('span', '', '不足額 合計'));
    if (ts === null) r2.append(el('span', 'muted', '3銀行の残高を入力すると表示'));
    else r2.append(el('b', ts > 0 ? 'short' : 'surplus', ts > 0 ? B.formatYen(ts) : '不足なし'));
    t.append(r1, r2);
  }

  // ---- 請求項目一覧 ----
  function renderList() {
    var list = $('list');
    list.textContent = '';
    if (!items.length) { list.appendChild(el('div', 'empty', '請求項目がありません。「＋ 追加」から登録してください。')); return; }
    B.BANKS.forEach(function (b) {
      var group = items.filter(function (it) { return it.bank === b.id; });
      if (!group.length) return;
      list.appendChild(el('div', 'group', b.name));
      group.forEach(function (it) {
        var row = el('button', 'item'); row.type = 'button';
        var l = el('div', 'l');
        l.appendChild(el('div', 'n', it.name));
        l.appendChild(el('div', 'd', it.updatedAt ? B.formatMMDD(it.updatedAt) : ''));
        var a = el('div', 'a' + (it.amount === null ? ' unset' : ''), it.amount === null ? '金額未入力' : B.formatYen(it.amount));
        row.append(l, a);
        row.addEventListener('click', function () { openSheet(it.id); });
        list.appendChild(row);
      });
    });
  }

  function renderAll() { renderResults(); renderList(); }

  // ---- 編集シート ----
  function openSheet(id, bankId) {
    editingId = id || null;
    var it = id ? items.filter(function (x) { return x.id === id; })[0] : null;
    $('sheetTitle').textContent = it ? '項目を編集' : '項目を追加';
    $('fName').value = it ? it.name : '';
    $('fBank').value = it ? it.bank : B.BANKS[0].id;
    $('fAmount').value = it && it.amount !== null ? String(it.amount) : '';
    $('fErr').textContent = '';
    $('fConfirm').hidden = !it || it.amount === null;
    $('fDelete').hidden = !it;
    $('sheet').hidden = false;
    if (!it) $('fName').focus();
  }
  function closeSheet() { $('sheet').hidden = true; editingId = null; }

  function onSubmit(ev) {
    ev.preventDefault();
    var name = $('fName').value.trim();
    var amount = B.parseAmount($('fAmount').value);
    if (!name) { $('fErr').textContent = '名称を入力してください。'; return; }
    if (Number.isNaN(amount)) { $('fErr').textContent = '金額は0以上の整数で入力してください。'; return; }
    items = B.saveItem(items, { id: editingId, name: name, bank: $('fBank').value, amount: amount });
    persist(); closeSheet(); renderAll();
  }

  function exportBackup() {
    var blob = new Blob([B.serialize(items)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bank-fund-checker-' + B.todayString() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = B.parseBackup(String(reader.result));
      if (!parsed) { alert('読み込めません。バックアップファイルが壊れているか、形式が違います。現在のデータは変更されていません。'); return; }
      if (!confirm('項目 ' + parsed.length + '件を読み込み、現在の請求項目をすべて置き換えます。よろしいですか?')) return;
      items = parsed; persist(); renderAll();
    };
    reader.onerror = function () { alert('ファイルを読み込めませんでした。'); };
    reader.readAsText(file);
  }

  function init() {
    B.BANKS.forEach(function (b) {
      var o = el('option', '', b.name); o.value = b.id; $('fBank').appendChild(o);
    });
    buildBanks();
    $('addBtn').addEventListener('click', function () { openSheet(null); });
    $('form').addEventListener('submit', onSubmit);
    $('fCancel').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    $('fConfirm').addEventListener('click', function () {
      items = B.confirmItem(items, editingId); persist(); closeSheet(); renderAll();
    });
    $('fDelete').addEventListener('click', function () {
      if (!confirm('この項目を削除しますか?')) return;
      items = B.deleteItem(items, editingId); persist(); closeSheet(); renderAll();
    });
    $('fAmount').addEventListener('input', function (e) {
      e.target.value = e.target.value.replace(/[^0-9０-９,，]/g, '');
    });
    $('exportBtn').addEventListener('click', exportBackup);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (f) importBackup(f);
    });
    renderAll();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }
  init();
})();
