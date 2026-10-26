(function (root) {
  'use strict';

  var BANKS = [
    { id: 'rakuten_personal', name: '楽天銀行(個人)' },
    { id: 'rakuten_corp', name: '楽天銀行(法人)' },
    { id: 'kiyo_personal', name: '紀陽銀行(個人)' }
  ];
  var STORAGE_KEY = 'bankFundChecker.items.v1';
  var MAX_AMOUNT = 9999999999;
  var MAX_NAME = 40;

  function bankIds() { return BANKS.map(function (b) { return b.id; }); }

  // 入力文字列 -> 整数 / null(空) / NaN(不正)。全角数字・カンマは許容、負数・小数・指数は不正。
  function parseAmount(text) {
    if (text === null || text === undefined) return null;
    var s = String(text).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[,，\s]/g, '');
    if (s === '') return null;
    if (!/^\d+$/.test(s)) return NaN;
    var n = Number(s);
    if (!isFinite(n) || n > MAX_AMOUNT) return NaN;
    return n;
  }

  function formatYen(n) {
    return Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayString(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isValidDateString(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  }
  function formatMMDD(s) {
    return s && isValidDateString(s) ? s.slice(5, 7) + '/' + s.slice(8, 10) : '';
  }

  function newId() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // 追加・編集。金額が変わったときだけ更新日を今日にする。
  function saveItem(items, input, now) {
    var today = todayString(now);
    var name = String(input.name || '').trim();
    var list = items.slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === input.id) idx = i;
    var prev = idx >= 0 ? list[idx] : null;
    var item = {
      id: prev ? prev.id : newId(),
      name: name,
      bank: input.bank,
      amount: input.amount,
      updatedAt: prev ? prev.updatedAt : null
    };
    if (!prev || prev.amount !== input.amount) {
      item.updatedAt = input.amount === null ? null : today;
    }
    if (prev) list[idx] = item; else list.push(item);
    return list;
  }

  function confirmItem(items, id, now) {
    var today = todayString(now);
    return items.map(function (it) {
      if (it.id !== id || it.amount === null) return it;
      return { id: it.id, name: it.name, bank: it.bank, amount: it.amount, updatedAt: today };
    });
  }

  function deleteItem(items, id) {
    return items.filter(function (it) { return it.id !== id; });
  }

  // 銀行別の必要額。未入力(null)の項目は合計に含めず件数のみ数える。
  function bankNeed(items, bankId) {
    var total = 0, unset = 0, count = 0;
    items.forEach(function (it) {
      if (it.bank !== bankId) return;
      count++;
      if (it.amount === null) unset++; else total += it.amount;
    });
    return { total: total, unset: unset, count: count };
  }

  // balance: 整数 or null(未入力)。未入力は 0 とみなさず status 'none'。
  function bankStatus(need, balance) {
    if (balance === null || balance === undefined) return { status: 'none', diff: null };
    var diff = balance - need;
    if (diff < 0) return { status: 'short', diff: -diff };
    return { status: 'surplus', diff: diff };
  }

  // 全銀行の不足額合計。全残高が入力済みのときのみ数値、それ以外は null。
  function totalShortage(items, balances) {
    var sum = 0;
    for (var i = 0; i < BANKS.length; i++) {
      var b = balances[BANKS[i].id];
      if (b === null || b === undefined) return null;
      var st = bankStatus(bankNeed(items, BANKS[i].id).total, b);
      if (st.status === 'short') sum += st.diff;
    }
    return sum;
  }

  function totalNeed(items) {
    return items.reduce(function (s, it) { return s + (it.amount === null ? 0 : it.amount); }, 0);
  }

  function serialize(items) {
    return JSON.stringify({ app: 'bank-fund-checker', version: 1, items: items });
  }

  // 検証つきで取り出す。不正なら null。
  function validateItems(arr) {
    if (!Array.isArray(arr) || arr.length > 500) return null;
    var ids = bankIds(), seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || typeof it !== 'object') return null;
      if (typeof it.id !== 'string' || !it.id || seen[it.id]) return null;
      seen[it.id] = true;
      if (typeof it.name !== 'string' || !it.name.trim() || it.name.length > MAX_NAME) return null;
      if (ids.indexOf(it.bank) < 0) return null;
      if (it.amount !== null && !(typeof it.amount === 'number' && isFinite(it.amount) &&
          Math.floor(it.amount) === it.amount && it.amount >= 0 && it.amount <= MAX_AMOUNT)) return null;
      if (it.updatedAt !== null && !(typeof it.updatedAt === 'string' && isValidDateString(it.updatedAt))) return null;
      out.push({ id: it.id, name: it.name.trim(), bank: it.bank, amount: it.amount, updatedAt: it.updatedAt });
    }
    return out;
  }

  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || data.app !== 'bank-fund-checker' || data.version !== 1) return null;
    return validateItems(data.items);
  }

  function loadItems(storage) {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var items = parseBackup(raw);
      return items || [];
    } catch (e) { return []; }
  }

  // 保存するのは請求項目のみ。残高は引数にも取らない。
  function persistItems(storage, items) {
    try { storage.setItem(STORAGE_KEY, serialize(items)); return true; } catch (e) { return false; }
  }

  var api = {
    BANKS: BANKS, STORAGE_KEY: STORAGE_KEY, parseAmount: parseAmount, formatYen: formatYen,
    todayString: todayString, formatMMDD: formatMMDD, isValidDateString: isValidDateString,
    saveItem: saveItem, confirmItem: confirmItem, deleteItem: deleteItem, bankNeed: bankNeed,
    bankStatus: bankStatus, totalShortage: totalShortage, totalNeed: totalNeed,
    serialize: serialize, validateItems: validateItems, parseBackup: parseBackup,
    loadItems: loadItems, persistItems: persistItems
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BFC = api;
})(this);
