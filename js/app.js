/* ===== アマフリ管理 - Single File App ===== */

/* ========================================
   Sync: Cloudflare KV 自動同期
   ======================================== */
var Sync = (function() {
  var _timer = null;
  var _syncing = false;
  var _lastSyncAt = null;

  var _DEFAULT_URL   = 'https://amafuri-worker.541015km.workers.dev';
  var _DEFAULT_TOKEN = 'K9UQGOKXB4uz0yHSLrNZTg-iy7uiVETn';

  function getConfig() {
    var url   = localStorage.getItem('amafuri_worker_url')   || _DEFAULT_URL;
    var token = localStorage.getItem('amafuri_api_token') || _DEFAULT_TOKEN;
    return { url: url.replace(/\/+$/, ''), token: token };
  }

  function isEnabled() { return true; }

  /* 起動時: クラウドが新しければ取得 */
  async function pullOnOpen() {
    var cfg = getConfig();
    if (!cfg) return;
    try {
      var resp = await fetch(cfg.url + '/api/sync', {
        headers: { 'Authorization': 'Bearer ' + cfg.token }
      });
      if (!resp.ok) return;
      var cloud = await resp.json();
      if (!cloud || !cloud.exportedAt) return;
      var localTs = localStorage.getItem('amafuri_last_modified') || '0';
      if (cloud.exportedAt > localTs) {
        DB.importAll(JSON.stringify(cloud));
        _lastSyncAt = new Date().toLocaleString('ja-JP');
        localStorage.setItem('amafuri_last_sync', _lastSyncAt);
        return true; // データ更新あり
      }
    } catch(e) { /* オフライン時は無視 */ }
    return false;
  }

  /* データ変更後 4秒でプッシュ (デバウンス) */
  function schedulePush() {
    if (!isEnabled()) return;
    clearTimeout(_timer);
    _timer = setTimeout(push, 4000);
  }

  /* クラウドへ保存 */
  async function push() {
    var cfg = getConfig();
    if (!cfg || _syncing) return;
    _syncing = true;
    updateIndicator('syncing');
    try {
      var resp = await fetch(cfg.url + '/api/sync', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
        body: DB.exportAll()
      });
      if (resp.ok) {
        _lastSyncAt = new Date().toLocaleString('ja-JP');
        localStorage.setItem('amafuri_last_sync', _lastSyncAt);
        updateIndicator('ok');
      } else {
        updateIndicator('error');
      }
    } catch(e) {
      updateIndicator('error');
    } finally {
      _syncing = false;
    }
  }

  /* 手動同期 */
  async function manualPush() {
    var cfg = getConfig();
    if (!cfg) { U.toast('Worker URLとAPIトークンを設定してください', 'error'); return; }
    await push();
    U.toast('クラウドに保存しました', 'success');
  }

  async function manualPull() {
    var cfg = getConfig();
    if (!cfg) { U.toast('Worker URLとAPIトークンを設定してください', 'error'); return; }
    var updated = await pullOnOpen();
    U.toast(updated ? 'クラウドから取得しました' : 'すでに最新です', 'success');
    if (updated && typeof App !== 'undefined') App.refreshCurrentTab();
  }

  /* 接続テスト */
  async function testConnection(url, token) {
    try {
      var resp = await fetch(url.replace(/\/+$/, '') + '/api/sync', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch(e) { return false; }
  }

  /* ヘッダーの同期インジケーター更新 */
  function updateIndicator(state) {
    var el = document.getElementById('sync-indicator');
    if (!el) return;
    var icons = { syncing: '🔄', ok: '☁️', error: '⚠️' };
    el.textContent = icons[state] || '';
    el.title = state === 'ok' ? '同期済み ' + (_lastSyncAt||'') : state === 'error' ? '同期エラー' : '同期中...';
  }

  function getLastSyncAt() {
    return _lastSyncAt || localStorage.getItem('amafuri_last_sync') || null;
  }

  return { pullOnOpen, schedulePush, push: manualPush, pull: manualPull, testConnection, isEnabled, getLastSyncAt };
})();


/* ========================================
   DB: Storage Layer
   ======================================== */
var DB = (function() {
  var K = {
    PRODUCTS: 'amafuri_products',
    SALES:    'amafuri_sales',
    IMPORTS:  'amafuri_csv_imports',
    HISTORY:  'amafuri_inv_history',
    SETTINGS: 'amafuri_settings'
  };

  function load(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch(e) { return def; }
  }
  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('amafuri_last_modified', new Date().toISOString());
      if (typeof Sync !== 'undefined') Sync.schedulePush();
    } catch(e) { console.error('DB save error', e); }
  }

  function getProducts() { return load(K.PRODUCTS, []); }
  function saveProducts(list) { save(K.PRODUCTS, list); }

  function addProduct(p) {
    var list = getProducts();
    p.id = uid();
    p.createdAt = p.updatedAt = new Date().toISOString();
    p.totalInventory = (p.amazonInventory||0) + (p.frimaInventory||0);
    list.push(p);
    saveProducts(list);
    return p;
  }
  function updateProduct(id, changes) {
    var list = getProducts();
    var i = list.findIndex(function(p){ return p.id === id; });
    if (i < 0) return null;
    list[i] = Object.assign({}, list[i], changes, { updatedAt: new Date().toISOString() });
    list[i].totalInventory = (list[i].amazonInventory||0) + (list[i].frimaInventory||0);
    saveProducts(list);
    return list[i];
  }
  function deleteProduct(id) {
    saveProducts(getProducts().filter(function(p){ return p.id !== id; }));
    saveSales(getSales().filter(function(s){ return s.productId !== id; }));
    saveHistory(getHistory().filter(function(h){ return h.productId !== id; }));
  }
  function getById(id) {
    return getProducts().find(function(p){ return p.id === id; }) || null;
  }

  function getSales() { return load(K.SALES, []); }
  function saveSales(list) { save(K.SALES, list); }
  function addSales(rows) {
    var list = getSales();
    rows.forEach(function(r){ list.push(r); });
    saveSales(list);
  }
  function removeSalesByImport(importId) {
    saveSales(getSales().filter(function(s){ return s.importId !== importId; }));
  }

  function getImports() { return load(K.IMPORTS, []); }
  function saveImports(list) { save(K.IMPORTS, list); }
  function addImport(imp) {
    var list = getImports();
    list.push(imp);
    saveImports(list);
  }
  function deleteImport(id) {
    saveImports(getImports().filter(function(i){ return i.id !== id; }));
  }
  function findImportByHash(hash) {
    return getImports().find(function(i){ return i.hash === hash; }) || null;
  }

  function getHistory() { return load(K.HISTORY, []); }
  function saveHistory(list) { save(K.HISTORY, list); }
  function addHistory(entry) {
    var list = getHistory();
    entry.id = uid();
    list.push(entry);
    saveHistory(list);
  }

  function getSettings() {
    return Object.assign({ dangerAt: 3, warnAt: 10 }, load(K.SETTINGS, {}));
  }
  function saveSettings(obj) { save(K.SETTINGS, obj); }

  function exportAll() {
    return JSON.stringify({
      products: getProducts(), sales: getSales(), imports: getImports(),
      history: getHistory(), settings: getSettings(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
  function importAll(jsonStr) {
    var d = JSON.parse(jsonStr);
    if (d.products) saveProducts(d.products);
    if (d.sales)    saveSales(d.sales);
    if (d.imports)  saveImports(d.imports);
    if (d.history || d.invHistory) saveHistory(d.history || d.invHistory);
    if (d.settings) saveSettings(d.settings);
  }
  function clearAll() {
    Object.values(K).forEach(function(k){ localStorage.removeItem(k); });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2,6);
  }

  return {
    getProducts, saveProducts, addProduct, updateProduct, deleteProduct, getById,
    getSales, addSales, removeSalesByImport,
    getImports, saveImports, addImport, deleteImport, findImportByHash,
    getHistory, addHistory,
    getSettings, saveSettings,
    exportAll, importAll, clearAll, uid
  };
})();


/* ========================================
   U: Utilities
   ======================================== */
var U = (function() {

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmt(n) { return (Number(n)||0).toLocaleString('ja-JP'); }

  function fmtDate(s) {
    if (!s) return '-';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  function monthKey(s) {
    var d = s ? new Date(s) : new Date();
    if (isNaN(d)) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  function dateRange(period) {
    var now = new Date(), start;
    switch(period) {
      case 'thisMonth': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case '30days':    start = new Date(now.getTime() - 30*864e5); break;
      case '90days':    start = new Date(now.getTime() - 90*864e5); break;
      default:          start = new Date(0);
    }
    return { start: start, end: now };
  }

  function inRange(s, range) {
    if (!s) return true;
    var d = new Date(s);
    return d >= range.start && d <= range.end;
  }

  function periodLabel(p) {
    return { thisMonth:'今月', '30days':'直近30日', '90days':'直近3か月', all:'全期間' }[p] || p;
  }

  function invClass(n, settings) {
    n = Number(n)||0;
    settings = settings || DB.getSettings();
    if (n <= settings.dangerAt) return 'danger';
    if (n <= settings.warnAt)   return 'warn';
    return '';
  }

  function hash(s) {
    var h = 5381;
    for (var i=0; i<s.length; i++) { h = ((h<<5)+h) ^ s.charCodeAt(i); h = h>>>0; }
    return h.toString(36);
  }

  function resizeImg(file, maxW, maxH, cb) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var w=img.width, h=img.height;
        if (w>maxW) { h=h*maxW/w; w=maxW; }
        if (h>maxH) { w=w*maxH/h; h=maxH; }
        var c = document.createElement('canvas');
        c.width=Math.round(w); c.height=Math.round(h);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        cb(c.toDataURL('image/jpeg',0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/,'');
    if (!text.trim()) return { headers:[], data:[] };
    var first = text.split(/\r?\n/)[0];
    var delim = (first.match(/\t/g)||[]).length > (first.match(/,/g)||[]).length ? '\t' : ',';
    var rows=[], row=[], cell='', inQ=false;
    for (var i=0; i<text.length; i++) {
      var c=text[i], n=text[i+1];
      if (c==='"') { if (inQ&&n==='"'){cell+='"';i++;} else inQ=!inQ; }
      else if (c===delim&&!inQ) { row.push(cell); cell=''; }
      else if ((c==='\n'||c==='\r')&&!inQ) {
        if (c==='\r'&&n==='\n') i++;
        row.push(cell); cell='';
        if (row.some(function(v){return v!=='';})) rows.push(row);
        row=[];
      } else { cell+=c; }
    }
    row.push(cell);
    if (row.some(function(v){return v!=='';})) rows.push(row);
    if (!rows.length) return { headers:[], data:[] };
    var headers = rows[0].map(function(h){return h.trim();});
    var data = rows.slice(1).map(function(r){
      var obj={};
      headers.forEach(function(h,idx){ obj[h]=(r[idx]||'').trim(); });
      return obj;
    });
    return { headers:headers, data:data };
  }

  function parseCSVAutoHeader(text, requiredCols) {
    text = text.replace(/^﻿/,'');
    var lines = text.split(/\r?\n/);
    var hi = -1;
    for (var i=0; i<Math.min(25,lines.length); i++) {
      if (requiredCols.every(function(c){return lines[i].indexOf(c)>=0;})) { hi=i; break; }
    }
    if (hi<0) return null;
    return parseCSV(lines.slice(hi).join('\n'));
  }

  function toast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (type ? ' '+type : '');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 2800);
  }

  function showSheet(html) {
    var s = document.getElementById('sheet');
    var o = document.getElementById('sheet-overlay');
    s.innerHTML = html;
    s.classList.remove('hidden');
    o.classList.remove('hidden');
  }
  function hideSheet() {
    document.getElementById('sheet').classList.add('hidden');
    document.getElementById('sheet-overlay').classList.add('hidden');
  }

  function confirm(msg, onOk) {
    var o = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    o.classList.remove('hidden');
    var ok = document.getElementById('confirm-ok');
    var cancel = document.getElementById('confirm-cancel');
    function cleanup() { o.classList.add('hidden'); ok.onclick=null; cancel.onclick=null; }
    ok.onclick     = function(){ cleanup(); onOk(); };
    cancel.onclick = function(){ cleanup(); };
  }

  return {
    esc, fmt, fmtDate, monthKey, dateRange, inRange, periodLabel, invClass, hash,
    resizeImg, parseCSV, parseCSVAutoHeader, toast, showSheet, hideSheet, confirm
  };
})();


/* ========================================
   App: Main Controller
   ======================================== */
var App = (function() {

  var _tab          = 'products';
  var _detailId     = null;
  var _detailPeriod = 'all';
  var _viewMode     = 'grid';
  var _csvTab       = 'amazon';
  var _csvState     = {
    amazon: { raw:null, filename:'', detected:null },
    frima:  { raw:null, filename:'', detected:null }
  };
  var _formImgData  = null;

  /* ---- Navigation ---- */

  function switchTab(tab) {
    _tab = tab;
    _detailId = null;
    document.getElementById('tab-bar').style.display = '';
    document.querySelectorAll('#tab-bar .tab-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.tab===tab);
    });
    var titles = { products:'商品', csv:'CSV読込', settings:'設定' };
    setHeader(titles[tab]||tab, false, '');
    var main = document.getElementById('main');
    switch(tab) {
      case 'products': renderProducts(main); break;
      case 'csv':      renderCsv(main);      break;
      case 'settings': renderSettings(main); break;
    }
  }

  function showDetail(id) {
    _detailId = id;
    _detailPeriod = 'all';
    var p = DB.getById(id);
    if (!p) return;
    setHeader(p.name, true, '<button class="header-btn pill-btn-outline" onclick="App.openProductForm(\''+id+'\')">編集</button>');
    document.getElementById('tab-bar').style.display = 'none';
    renderDetail(document.getElementById('main'), id);
  }

  function goBack() {
    _detailId = null;
    document.getElementById('tab-bar').style.display = '';
    switchTab(_tab);
  }

  function setHeader(title, showBack, actionHtml) {
    document.getElementById('page-title').textContent = title;
    var bb = document.getElementById('back-btn');
    if (showBack) bb.classList.remove('hidden'); else bb.classList.add('hidden');
    var slot = document.getElementById('action-slot');
    if (slot) slot.innerHTML = actionHtml || '';
  }

  function hideSheet() { U.hideSheet(); }

  /* ====================
     PRODUCTS TAB
     ==================== */

  function switchView(mode) {
    _viewMode = mode;
    renderProducts(document.getElementById('main'));
  }

  function renderProducts(main) {
    var products = DB.getProducts();
    var settings = DB.getSettings();
    var html = '';

    var gridActive = _viewMode === 'grid';
    html += '<div class="grid-action-bar">' +
      '<span class="grid-count">' + products.length + '件</span>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div class="view-toggle">' +
          '<button class="view-toggle-btn'+(gridActive?' active':'')+'" onclick="App.switchView(\'grid\')" title="グリッド">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>' +
          '</button>' +
          '<button class="view-toggle-btn'+(!gridActive?' active':'')+'" onclick="App.switchView(\'list\')" title="一覧">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 4h18v2H3zm0 7h18v2H3zm0 7h18v2H3z"/></svg>' +
          '</button>' +
        '</div>' +
        '<button class="add-btn" onclick="App.openProductForm(null)">＋ 追加</button>' +
      '</div>' +
    '</div>';

    if (products.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-icon">📦</div>' +
        '<div class="empty-title">商品が登録されていません</div>' +
        '<div class="empty-desc">右上の「＋ 追加」から登録してください</div>' +
      '</div>';
    } else if (_viewMode === 'list') {
      html += renderProductListHTML(products, settings);
    } else {
      html += '<div class="product-grid">';
      products.forEach(function(p) {
        var tInv = p.totalInventory||0;
        var cls  = U.invClass(tInv, settings);
        var stockCls = cls==='danger' ? ' danger' : cls==='warn' ? ' warn' : '';
        var colorSize = [p.color, p.size].filter(Boolean).join(' / ');
        html += '<div class="product-grid-item" onclick="App.showDetail(\'' + p.id + '\')">' +
          (p.imageData
            ? '<img src="'+p.imageData+'" alt="'+U.esc(p.name)+'" loading="lazy">'
            : '<div class="product-grid-placeholder">📦</div>') +
          '<div class="grid-stock'+stockCls+'">' + tInv + '</div>' +
          (colorSize ? '<div class="grid-colorsize">'+U.esc(colorSize)+'</div>' : '') +
          '<div class="grid-name">'+U.esc(p.name)+'</div>' +
        '</div>';
      });
      html += '</div>';
    }
    main.innerHTML = html;
  }

  function renderProductListHTML(products, settings) {
    var allSales = DB.getSales();
    var now = new Date();
    var since30 = new Date(now.getTime() - 30*864e5);
    var since90 = new Date(now.getTime() - 90*864e5);

    var html = '<div style="overflow-x:auto;"><table class="list-view-table">';
    html += '<thead><tr>' +
      '<th>商品</th>' +
      '<th>Amazon</th>' +
      '<th>フリマ</th>' +
      '<th>合計</th>' +
      '<th>30日売上</th>' +
      '<th>残月数</th>' +
    '</tr></thead><tbody>';

    products.forEach(function(p) {
      var sales30 = allSales.filter(function(s){
        return s.productId===p.id && new Date(s.orderDate||s.importedAt) >= since30;
      });
      var sales90 = allSales.filter(function(s){
        return s.productId===p.id && new Date(s.orderDate||s.importedAt) >= since90;
      });
      var sold30 = sales30.reduce(function(n,s){ return n+(s.quantity||0); }, 0);
      var sold90 = sales90.reduce(function(n,s){ return n+(s.quantity||0); }, 0);
      var avgPerMonth = sold90 / 3;
      var tInv = p.totalInventory||0;
      var aInv = p.amazonInventory||0;
      var fInv = p.frimaInventory||0;
      var monthsLeft = avgPerMonth > 0 ? tInv / avgPerMonth : null;

      var invCls = U.invClass(tInv, settings);
      var colorSize = [p.color, p.size].filter(Boolean).join(' / ');

      var monthsCls, monthsTxt;
      if (monthsLeft === null) { monthsCls = 'none'; monthsTxt = '--'; }
      else if (monthsLeft >= 3) { monthsCls = 'good'; monthsTxt = monthsLeft.toFixed(1)+'ヶ月'; }
      else if (monthsLeft >= 1.5) { monthsCls = 'warn'; monthsTxt = monthsLeft.toFixed(1)+'ヶ月'; }
      else { monthsCls = 'danger'; monthsTxt = monthsLeft.toFixed(1)+'ヶ月'; }

      html += '<tr onclick="App.showDetail(\''+p.id+'\')" style="cursor:pointer;">' +
        '<td><div class="list-name">'+U.esc(p.name)+'</div>'+(colorSize?'<div class="list-sub">'+U.esc(colorSize)+'</div>':'')+'</td>' +
        '<td><span class="list-num '+(U.invClass(aInv,settings))+'">'+aInv+'</span></td>' +
        '<td><span class="list-num '+(U.invClass(fInv,settings))+'">'+fInv+'</span></td>' +
        '<td><span class="list-num '+invCls+'">'+tInv+'</span></td>' +
        '<td>'+sold30+'</td>' +
        '<td><span class="list-months '+monthsCls+'">'+monthsTxt+'</span></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  /* ====================
     PRODUCT DETAIL
     ==================== */

  function renderDetail(main, id) {
    var p = DB.getById(id);
    if (!p) { goBack(); return; }
    var settings = DB.getSettings();
    var allSales = DB.getSales().filter(function(s){ return s.productId===id; });
    var range    = U.dateRange(_detailPeriod);
    var filtered = allSales.filter(function(s){ return U.inRange(s.orderDate||s.importedAt, range); });

    var aSales=0, fSales=0;
    filtered.forEach(function(s){
      if (s.channel==='amazon') aSales += s.quantity||0;
      else fSales += s.quantity||0;
    });

    var aInv = p.amazonInventory||0;
    var fInv = p.frimaInventory||0;
    var tInv = p.totalInventory||0;
    var aClass = U.invClass(aInv, settings);
    var fClass = U.invClass(fInv, settings);

    var html = '';

    // Photo
    html += '<div class="photo-area">' +
      (p.imageData
        ? '<img src="'+p.imageData+'" alt="'+U.esc(p.name)+'">'
        : '<div class="photo-no-img">📦</div>') +
    '</div>';

    // Basic info
    html += '<div class="section-hd">基本情報</div>';
    html += '<div class="detail-group">';
    html += dRow('商品名', p.name);
    if (p.color) html += dRow('カラー', p.color);
    if (p.size)  html += dRow('サイズ', p.size);
    if (p.amazonSku)        html += dRow('Amazon SKU', p.amazonSku);
    if (p.sellernoteMgmtNo) html += dRow('管理番号（フリマ）', p.sellernoteMgmtNo);
    if (p.memo) html += dRow('メモ', p.memo);
    html += '</div>';

    // Inventory
    html += '<div class="section-hd">在庫</div>';
    html += '<div class="inv-section">';
    html += invRow('Amazon', 'amazon', id, aInv, aClass);
    html += invRow('フリマ',  'frima',  id, fInv, fClass);
    html += '<div class="inv-row"><div class="inv-channel-label total">合計</div>' +
      '<div class="inv-stepper" style="justify-content:center;"><div class="inv-total-val" id="inv-total">'+tInv+'</div></div></div>';
    html += '</div>';

    // Period tabs
    html += '<div class="section-hd">販売数</div>';
    html += '<div class="period-tabs">';
    ['all','thisMonth','30days','90days'].forEach(function(per){
      html += '<button class="period-tab'+(_detailPeriod===per?' active':'')+'" onclick="App.setDetailPeriod(\''+per+'\')">'+U.periodLabel(per)+'</button>';
    });
    html += '</div>';

    // Stats
    html += '<div class="stats-row">';
    html += sCard('Amazon', aSales, 'amazon');
    html += sCard('フリマ',  fSales, 'frima');
    html += sCard('合計',   aSales+fSales, 'total');
    html += '</div>';

    // Monthly table
    html += '<div class="section-hd">月別販売数</div>';
    html += renderMonthlyTable(allSales);

    // Forecast
    html += '<div class="section-hd">3ヶ月予測（直近90日ベース）</div>';
    html += renderForecast(p, allSales);

    // History
    html += '<div class="section-hd">在庫変更履歴</div>';
    html += renderInvHistory(id);

    // Delete
    html += '<div style="padding:16px 16px 32px;">' +
      '<button onclick="App.deleteProduct(\''+id+'\')" style="width:100%;height:48px;border-radius:10px;font-size:15px;font-weight:600;background:var(--primary-light);color:var(--danger);">この商品を削除</button>' +
    '</div>';

    main.innerHTML = html;
  }

  function dRow(label, val) {
    return '<div class="detail-row"><span class="detail-label">'+U.esc(label)+'</span><span class="detail-value">'+U.esc(String(val))+'</span></div>';
  }

  function invRow(label, ch, id, val, cls) {
    return '<div class="inv-row">' +
      '<div class="inv-channel-label '+ch+'">'+label+'</div>' +
      '<div class="inv-stepper">' +
        '<button class="step-btn" onclick="App.stepInv(\''+id+'\',\''+ch+'\',-1)">−</button>' +
        '<input type="number" inputmode="numeric" class="step-val '+cls+'" id="inv-'+ch+'" value="'+val+'" min="0"' +
          ' onchange="App.setInv(\''+id+'\',\''+ch+'\',this.value)"' +
          ' onfocus="this.select()">' +
        '<button class="step-btn" onclick="App.stepInv(\''+id+'\',\''+ch+'\',1)">＋</button>' +
      '</div>' +
    '</div>';
  }

  function sCard(label, val, cls) {
    return '<div class="stat-card">' +
      '<div class="stat-label">'+label+'</div>' +
      '<div class="stat-val '+cls+'">'+val+'</div>' +
      '<div class="stat-unit">個</div>' +
    '</div>';
  }

  function renderMonthlyTable(sales) {
    if (!sales.length) return '<div style="background:white;padding:20px 16px;border-top:1px solid #eee;border-bottom:1px solid #eee;color:#9E9E9E;font-size:14px;text-align:center;">販売データがありません</div>';
    var months = {};
    sales.forEach(function(s){
      var mk = U.monthKey(s.orderDate||s.importedAt);
      if (!months[mk]) months[mk]={amazon:0,frima:0};
      if (s.channel==='amazon') months[mk].amazon += s.quantity||0;
      else months[mk].frima += s.quantity||0;
    });
    var keys = Object.keys(months).sort().reverse();
    var html = '<div class="monthly-table-wrap"><table class="monthly-table">' +
      '<thead><tr><th>月</th><th>Amazon</th><th>フリマ</th><th>合計</th></tr></thead><tbody>';
    keys.forEach(function(mk){
      var m = months[mk];
      html += '<tr><td>'+mk+'</td><td class="col-amazon">'+m.amazon+'</td><td class="col-frima">'+m.frima+'</td><td class="col-total">'+(m.amazon+m.frima)+'</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderForecast(p, sales) {
    var now   = new Date();
    var since = new Date(now.getTime() - 90*864e5);
    var recent = sales.filter(function(s){ return new Date(s.orderDate||s.importedAt) >= since; });
    var a90=0, f90=0;
    recent.forEach(function(s){ if(s.channel==='amazon') a90+=s.quantity||0; else f90+=s.quantity||0; });
    var aAvg = a90/3, fAvg = f90/3, totAvg = aAvg+fAvg;
    var tInv = p.totalInventory||0;
    var monthsLeft = totAvg>0 ? tInv/totAvg : 999;
    var need3 = totAvg>0 ? Math.max(0, Math.ceil(totAvg*3 - tInv)) : 0;

    var alertCls, alertMsg;
    if (totAvg===0)        { alertCls='green'; alertMsg='販売データなし（予測不可）'; }
    else if (monthsLeft>=3){ alertCls='green'; alertMsg='✓ 在庫は3ヶ月以上あります'; }
    else if (monthsLeft>=1.5){ alertCls='orange'; alertMsg='⚠ 在庫が2ヶ月未満になります'; }
    else                   { alertCls='red'; alertMsg='🔴 在庫が1.5ヶ月未満！要発注'; }

    return '<div class="forecast-box">' +
      '<div class="forecast-grid">' +
        '<div class="forecast-item"><div class="forecast-item-label">Amazon 月平均（直近90日）</div><div class="forecast-item-val amazon">'+aAvg.toFixed(1)+' 個</div></div>' +
        '<div class="forecast-item"><div class="forecast-item-label">フリマ 月平均（直近90日）</div><div class="forecast-item-val frima">'+fAvg.toFixed(1)+' 個</div></div>' +
        '<div class="forecast-item"><div class="forecast-item-label">現在庫で持つ期間</div><div class="forecast-item-val '+(monthsLeft>=3?'good':monthsLeft>=1.5?'warn':'danger')+'">'+(totAvg>0?monthsLeft.toFixed(1)+' ヶ月':'--')+'</div></div>' +
        '<div class="forecast-item"><div class="forecast-item-label">3ヶ月分まで必要な追加数</div><div class="forecast-item-val '+(need3===0?'good':'danger')+'">'+(totAvg>0?need3+'個':'--')+'</div></div>' +
      '</div>' +
      '<div class="forecast-alert '+alertCls+'">'+alertMsg+'</div>' +
    '</div>';
  }

  function renderInvHistory(productId) {
    var hist = DB.getHistory().filter(function(h){ return h.productId===productId; }).slice().reverse().slice(0,30);
    if (!hist.length) return '<div style="background:white;padding:20px 16px;border-top:1px solid #eee;border-bottom:1px solid #eee;color:#9E9E9E;font-size:14px;text-align:center;">履歴がありません</div>';
    var html = '<div class="history-list">';
    hist.forEach(function(h){
      var isPlus = h.change>=0;
      var ch = h.type==='amazon' ? '<span class="badge-amazon">Amazon</span>' : '<span class="badge-frima">フリマ</span>';
      html += '<div class="history-item">' +
        '<div class="history-dot '+(isPlus?'plus':'minus')+'"></div>' +
        '<div class="history-body">' +
          '<div class="history-main">'+ch+' <span style="color:'+(isPlus?'var(--success)':'var(--danger)')+';font-weight:700;">'+(isPlus?'+':'')+(h.change||0)+'</span> → '+(h.next||0)+'個</div>' +
          '<div class="history-sub">'+U.esc(h.reason||'')+'　'+U.fmtDate(h.timestamp)+'</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function setDetailPeriod(per) {
    _detailPeriod = per;
    if (_detailId) renderDetail(document.getElementById('main'), _detailId);
  }

  function stepInv(id, ch, delta) {
    var p = DB.getById(id);
    if (!p) return;
    var field = ch==='amazon' ? 'amazonInventory' : 'frimaInventory';
    var prev  = p[field]||0;
    var next  = Math.max(0, prev+delta);
    _applyInv(id, ch, prev, next, '手動調整');
  }

  function setInv(id, ch, rawVal) {
    var next = Math.max(0, parseInt(rawVal)||0);
    var p = DB.getById(id);
    if (!p) return;
    var field = ch==='amazon' ? 'amazonInventory' : 'frimaInventory';
    var prev = p[field]||0;
    if (next === prev) return;
    _applyInv(id, ch, prev, next, '手動入力');
  }

  function _applyInv(id, ch, prev, next, reason) {
    var field = ch==='amazon' ? 'amazonInventory' : 'frimaInventory';
    var changes = {}; changes[field] = next;
    DB.addHistory({ productId:id, type:ch, prev:prev, next:next, change:next-prev, reason:reason, timestamp:new Date().toISOString() });
    DB.updateProduct(id, changes);
    var settings = DB.getSettings();
    var valEl = document.getElementById('inv-'+ch);
    if (valEl) { valEl.value = next; valEl.className = 'step-val '+U.invClass(next,settings); }
    var p2 = DB.getById(id);
    var totEl = document.getElementById('inv-total');
    if (totEl) totEl.textContent = p2 ? (p2.totalInventory||0) : 0;
  }

  function deleteProduct(id) {
    var p = DB.getById(id);
    U.confirm('「'+(p?p.name:'商品')+'」を削除します。\n紐付く販売データも削除されます。', function(){
      DB.deleteProduct(id);
      U.toast('削除しました', 'success');
      U.hideSheet();
      goBack();
    });
  }

  /* ====================
     PRODUCT FORM (Sheet)
     ==================== */

  function openProductForm(id) {
    var p = id ? DB.getById(id) : null;
    _formImgData = p ? (p.imageData||null) : null;

    var html = '<div class="sheet-handle"></div>';
    html += '<div class="sheet-title">'+(p?'商品を編集':'商品を追加')+'</div>';

    html += '<div class="section-hd">画像</div>';
    html += '<div class="form-section" style="margin-bottom:0;">';
    html += '<div class="photo-upload-row" id="photoRow">';
    html += '<div class="photo-upload-thumb" id="photoThumb">';
    html += (p&&p.imageData) ? '<img id="photoPreviewImg" src="'+p.imageData+'" alt="preview" style="width:100%;height:100%;object-fit:cover;">' : '<span style="font-size:24px;">📷</span>';
    html += '</div>';
    html += '<div class="photo-upload-hint">タップして画像を選択</div>';
    html += '<input type="file" id="photoFile" accept="image/*" style="display:none;">';
    html += '</div></div>';

    html += '<div class="section-hd">商品情報</div>';
    html += '<div class="form-section">';
    html += fRow('商品名', '<input class="form-input" id="fName" placeholder="例：ニット帽 レッド L" value="'+U.esc(p?p.name:'')+'">',  true);
    html += fRow('カラー', '<input class="form-input" id="fColor" placeholder="例：レッド" value="'+U.esc(p?p.color||'':'')+'">');
    html += fRow('サイズ', '<input class="form-input" id="fSize" placeholder="例：L" value="'+U.esc(p?p.size||'':'')+'">');
    html += '</div>';

    html += '<div class="section-hd">CSV照合用</div>';
    html += '<div class="form-section">';
    html += fRow('Amazon SKU', '<input class="form-input" id="fSku" placeholder="例：HAT-RED-L" value="'+U.esc(p?p.amazonSku||'':'')+'">');
    html += fRow('フリマ管理番号', '<input class="form-input" id="fMgmt" placeholder="例：SN-001" value="'+U.esc(p?p.sellernoteMgmtNo||'':'')+'">');
    html += '</div>';

    html += '<div class="section-hd">在庫数</div>';
    html += '<div class="form-section">';
    html += fRow('Amazon在庫', '<input class="form-input" id="fAInv" type="number" min="0" value="'+(p?p.amazonInventory||0:0)+'">');
    html += fRow('フリマ在庫', '<input class="form-input" id="fFInv" type="number" min="0" value="'+(p?p.frimaInventory||0:0)+'">');
    html += '</div>';

    html += '<div class="section-hd">メモ</div>';
    html += '<div class="form-section">';
    html += '<div class="form-row"><textarea class="form-textarea" id="fMemo" placeholder="仕入れ先・特記事項など" style="text-align:left;">'+U.esc(p?p.memo||'':'')+'</textarea></div>';
    html += '</div>';

    html += '<div class="sheet-btn-row">';
    html += '<button class="btn-gray" onclick="App.hideSheet()">キャンセル</button>';
    html += '<button class="btn-primary" onclick="App.saveProduct(\''+(id||'null')+'\')">保存</button>';
    html += '</div>';

    U.showSheet(html);

    var photoRow  = document.getElementById('photoRow');
    var photoFile = document.getElementById('photoFile');
    if (photoRow && photoFile) {
      photoRow.addEventListener('click', function(){ photoFile.click(); });
      photoFile.addEventListener('change', function(){
        var f = this.files[0];
        if (!f) return;
        U.resizeImg(f, 400, 400, function(dataUrl){
          _formImgData = dataUrl;
          var thumb = document.getElementById('photoThumb');
          if (thumb) thumb.innerHTML = '<img id="photoPreviewImg" src="'+dataUrl+'" alt="preview" style="width:100%;height:100%;object-fit:cover;">';
        });
      });
    }
  }

  function fRow(label, inputHtml, required) {
    return '<div class="form-row"><div class="form-label'+(required?' req':'')+'" style="font-size:14px;color:var(--text);width:96px;flex-shrink:0;font-weight:500;">'+U.esc(label)+'</div>'+inputHtml+'</div>';
  }

  function saveProduct(id) {
    if (id === 'null') id = null;
    var nameEl = document.getElementById('fName');
    if (!nameEl) return;
    var name = nameEl.value.trim();
    if (!name) { U.toast('商品名を入力してください', 'error'); return; }

    var aInv = parseInt((document.getElementById('fAInv')||{value:0}).value)||0;
    var fInv = parseInt((document.getElementById('fFInv')||{value:0}).value)||0;

    var data = {
      name:             name,
      color:            ((document.getElementById('fColor')||{value:''}).value||'').trim(),
      size:             ((document.getElementById('fSize')||{value:''}).value||'').trim(),
      amazonSku:        ((document.getElementById('fSku')||{value:''}).value||'').trim(),
      sellernoteMgmtNo: ((document.getElementById('fMgmt')||{value:''}).value||'').trim(),
      amazonInventory:  aInv,
      frimaInventory:   fInv,
      totalInventory:   aInv+fInv,
      memo:             ((document.getElementById('fMemo')||{value:''}).value||'').trim(),
      imageData:        _formImgData
    };

    var now = new Date().toISOString();
    if (id) {
      var old = DB.getById(id);
      if (old && old.amazonInventory !== aInv)
        DB.addHistory({ productId:id, type:'amazon', prev:old.amazonInventory, next:aInv, change:aInv-(old.amazonInventory||0), reason:'手動編集', timestamp:now });
      if (old && old.frimaInventory !== fInv)
        DB.addHistory({ productId:id, type:'frima', prev:old.frimaInventory, next:fInv, change:fInv-(old.frimaInventory||0), reason:'手動編集', timestamp:now });
      DB.updateProduct(id, data);
      U.toast('更新しました', 'success');
    } else {
      DB.addProduct(data);
      U.toast('追加しました', 'success');
    }

    U.hideSheet();
    if (_detailId) {
      var p2 = DB.getById(_detailId);
      if (p2) document.getElementById('page-title').textContent = p2.name;
      renderDetail(document.getElementById('main'), _detailId);
    } else {
      switchTab('products');
    }
  }

  /* ====================
     CSV TAB
     ==================== */

  function renderCsv(main) {
    var st  = _csvState[_csvTab];
    var det = st.detected;
    var html = '';

    html += '<div class="csv-tab-bar">';
    html += '<button class="csv-tab'+(_csvTab==='amazon'?' active':'')+'" onclick="App.setCsvTab(\'amazon\')">Amazon CSV</button>';
    html += '<button class="csv-tab'+(_csvTab==='frima'?' active':'')+'" onclick="App.setCsvTab(\'frima\')">セラーノート CSV</button>';
    html += '</div>';

    html += '<div class="upload-zone" id="uploadZone">' +
      '<div class="upload-icon">📂</div>' +
      '<div class="upload-text">タップしてCSVを選択</div>' +
      '<div class="upload-hint">ドラッグ＆ドロップも可（CSV / TSV）</div>' +
      (st.filename ? '<div class="upload-filename">'+U.esc(st.filename)+'</div>' : '') +
    '</div>';
    html += '<input type="file" id="csvFileInput" accept=".csv,.tsv,.txt" style="display:none;">';

    if (st.raw && !det) {
      html += '<div class="import-result error">⚠ 認識できません。<br>';
      html += _csvTab==='amazon'
        ? '必要な列: SKU、数量、トランザクションの種類、日付/時間'
        : '必要な列: 「SKU/管理番号・取引状態・売上日」または「管理番号・ステータス・売れた日」';
      html += '</div>';
      html += '<div class="import-btn-wrap"><button class="clear-btn" onclick="App.clearCsv()">クリア</button></div>';
    }

    if (det) {
      var fc = det.filteredRows.length;
      var fl = _csvTab==='amazon' ? '「注文」行' : '「取引完了」行';
      html += '<div class="import-result ok">✅ <strong>'+U.esc(st.filename)+'</strong><br>全 '+det.parsed.data.length+' 行 ／ '+fl+': <strong>'+fc+' 行</strong></div>';
      html += csvPreview(det);
      html += '<div class="import-btn-wrap">' +
        '<button class="import-btn" onclick="App.doImport()">取り込む</button>' +
        '<button class="clear-btn" onclick="App.clearCsv()">クリア</button>' +
      '</div>';
    }

    var imports = DB.getImports().slice().reverse().filter(function(i){ return i.type===_csvTab; });
    if (imports.length) {
      html += '<div class="section-hd">読込履歴</div>';
      html += '<div class="history-section">';
      imports.forEach(function(imp){
        html += '<div class="history-row">' +
          '<div class="history-info">' +
            '<div class="history-filename">'+U.esc(imp.filename)+'</div>' +
            '<div class="history-meta">'+U.fmtDate(imp.importedAt)+'</div>' +
            '<div class="history-stats">対象: <strong>'+imp.rowCount+'</strong>　照合: <span style="color:var(--success);font-weight:700;">'+imp.matchedCount+'</span>　未照合: <span style="color:var(--warning);font-weight:700;">'+imp.unmatchedCount+'</span></div>' +
            (imp.unmatched&&imp.unmatched.length ? renderUnmatched(imp.unmatched, imp.type, imp.id) : '') +
          '</div>' +
          '<button class="history-del-btn" onclick="App.deleteImport(\''+imp.id+'\')">削除</button>' +
        '</div>';
      });
      html += '</div>';
    }

    main.innerHTML = html;

    var zone  = main.querySelector('#uploadZone');
    var input = main.querySelector('#csvFileInput');
    if (zone && input) {
      zone.addEventListener('click',    function(){ input.click(); });
      zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave',function(){ zone.classList.remove('drag-over'); });
      zone.addEventListener('drop',     function(e){ e.preventDefault(); zone.classList.remove('drag-over'); if(e.dataTransfer.files[0]) readCsvFile(e.dataTransfer.files[0]); });
      input.addEventListener('change',  function(){ if(this.files[0]) readCsvFile(this.files[0]); });
    }
  }

  function csvPreview(det) {
    var rows = det.filteredRows.slice(0,5);
    if (!rows.length) return '';
    var cols, labels;
    if (det.format==='amazon') {
      cols=['日付/時間','SKU','数量']; labels=['注文日時','SKU','数量'];
    } else if (det.subformat==='sales') {
      cols=['売れた日','管理番号','商品名']; labels=['売れた日','管理番号','商品名'];
    } else {
      cols=['売上日','SKU/管理番号','商品名']; labels=['売上日','管理番号','商品名'];
    }
    var html = '<div class="csv-preview"><table><thead><tr>';
    labels.forEach(function(l){ html += '<th>'+U.esc(l)+'</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function(r){
      html += '<tr>';
      cols.forEach(function(c){ html += '<td>'+U.esc(r[c]||'')+'</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderUnmatched(unmatched, type, importId) {
    var label = type==='amazon' ? 'SKU' : '管理番号';
    var html = '<div class="unmatched-box">⚠ 未照合 '+label+':<br>';
    unmatched.slice(0,5).forEach(function(u){
      html += '<div class="unmatched-item"><span>'+U.esc(u.key)+' ('+u.qty+'個)</span>' +
        '<button class="add-master-btn" onclick="App.addToMaster(\''+U.esc(u.key)+'\',\''+type+'\')">商品追加</button></div>';
    });
    if (unmatched.length>5) html += '<div style="font-size:11px;color:#888;padding-top:4px;">他'+(unmatched.length-5)+'件</div>';
    if (importId) {
      html += '<button onclick="App.clearUnmatched(\''+importId+'\')" style="margin-top:8px;width:100%;padding:8px;border-radius:8px;background:var(--gray-light);color:var(--text2);font-size:12px;">未照合を非表示にする</button>';
    }
    html += '</div>';
    return html;
  }

  function clearUnmatched(importId) {
    var imports = DB.getImports();
    var i = imports.findIndex(function(x){ return x.id===importId; });
    if (i<0) return;
    imports[i] = Object.assign({}, imports[i], { unmatched:[], unmatchedCount:0 });
    DB.saveImports(imports);
    renderCsv(document.getElementById('main'));
  }

  function setCsvTab(tab) { _csvTab = tab; renderCsv(document.getElementById('main')); }
  function clearCsv() { _csvState[_csvTab]={raw:null,filename:'',detected:null}; renderCsv(document.getElementById('main')); }

  function readCsvFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      var det = _csvTab==='amazon' ? detectAmazon(text) : detectFrima(text);
      _csvState[_csvTab] = { raw:text, filename:file.name, detected:det };
      renderCsv(document.getElementById('main'));
    };
    reader.readAsText(file,'UTF-8');
  }

  function detectAmazon(text) {
    var parsed = U.parseCSVAutoHeader(text, ['SKU','数量','トランザクションの種類']);
    if (!parsed||!parsed.headers.length) return null;
    var req = ['SKU','数量','トランザクションの種類','日付/時間'];
    if (req.some(function(c){ return parsed.headers.indexOf(c)<0; })) return null;
    var filtered = parsed.data.filter(function(r){ return (r['トランザクションの種類']||'').trim()==='注文'; });
    return { format:'amazon', parsed:parsed, filteredRows:filtered };
  }

  function detectFrima(text) {
    var parsed = U.parseCSV(text);
    if (!parsed||!parsed.headers.length) return null;
    var hdr = parsed.headers;

    // 形式A: 月別/年別/期間CSV (_exportListingsCSV)
    // 列: 売上日, SKU/管理番号, 取引状態, ...
    if (['SKU/管理番号','取引状態','売上日'].every(function(c){ return hdr.indexOf(c)>=0; })) {
      var filtered = parsed.data.filter(function(r){ return (r['取引状態']||'').trim()==='取引完了'; });
      return { format:'frima', subformat:'listings', skuCol:'SKU/管理番号', dateCol:'売上日', parsed:parsed, filteredRows:filtered };
    }

    // 形式B: 現在の表示CSV (_exportSalesCSV)
    // 列: 管理番号, ステータス, 売れた日, ...
    if (['管理番号','ステータス','売れた日'].every(function(c){ return hdr.indexOf(c)>=0; })) {
      var filtered = parsed.data.filter(function(r){ return (r['ステータス']||'').trim()==='取引完了'; });
      return { format:'frima', subformat:'sales', skuCol:'管理番号', dateCol:'売れた日', parsed:parsed, filteredRows:filtered };
    }

    return null;
  }

  function doImport() {
    var st  = _csvState[_csvTab];
    var det = st.detected;
    if (!det) return;
    var h = U.hash(st.filename+'|'+det.parsed.data.length+'|'+JSON.stringify(det.parsed.data[0]||{}));
    var existing = DB.findImportByHash(h);
    if (existing) {
      U.toast('このCSVはすでに取り込み済みです（'+U.fmtDate(existing.importedAt)+'）', 'error');
      return;
    }
    processImport(st, det, h);
  }

  function processImport(st, det, hash) {
    var products = DB.getProducts();
    var rows = det.filteredRows;
    var now  = new Date().toISOString();
    var importId = DB.uid();

    var amazonMap={}, frimaMap={};
    products.forEach(function(p){
      if (p.amazonSku)        amazonMap[p.amazonSku.trim().toLowerCase()] = p;
      if (p.sellernoteMgmtNo) frimaMap[p.sellernoteMgmtNo.trim().toLowerCase()] = p;
    });

    var sales=[], unmatched={}, matched=0;
    if (det.format==='amazon') {
      rows.forEach(function(row){
        var sku = (row['SKU']||'').trim(); if (!sku) return;
        var qty = parseInt(row['数量'])||0;
        var p = amazonMap[sku.toLowerCase()];
        if (p) { sales.push({id:DB.uid(),importId:importId,productId:p.id,channel:'amazon',quantity:qty,orderDate:(row['日付/時間']||'').trim(),importedAt:now}); matched++; }
        else unmatched[sku]=(unmatched[sku]||0)+qty;
      });
    } else {
      var skuCol  = det.skuCol  || 'SKU/管理番号';
      var dateCol = det.dateCol || '売上日';
      rows.forEach(function(row){
        var mgmt=(row[skuCol]||'').trim(); if(!mgmt) return;
        var p = frimaMap[mgmt.toLowerCase()];
        if (p) { sales.push({id:DB.uid(),importId:importId,productId:p.id,channel:'frima',quantity:1,orderDate:(row[dateCol]||'').trim(),importedAt:now}); matched++; }
        else unmatched[mgmt]=(unmatched[mgmt]||0)+1;
      });
    }

    // Deduct inventory
    var delta={};
    sales.forEach(function(s){ delta[s.productId]=delta[s.productId]||{amazon:0,frima:0}; delta[s.productId][s.channel]+=s.quantity; });
    Object.keys(delta).forEach(function(pid){
      var p=DB.getById(pid); if(!p) return;
      var d=delta[pid], ch={};
      if (d.amazon>0) { var pA=p.amazonInventory||0, nA=Math.max(0,pA-d.amazon); ch.amazonInventory=nA; DB.addHistory({productId:pid,type:'amazon',prev:pA,next:nA,change:nA-pA,reason:'Amazon CSV取込',timestamp:now}); }
      if (d.frima>0)  { var pF=p.frimaInventory||0,  nF=Math.max(0,pF-d.frima);  ch.frimaInventory=nF;  DB.addHistory({productId:pid,type:'frima', prev:pF,next:nF,change:nF-pF,reason:'フリマCSV取込',timestamp:now}); }
      DB.updateProduct(pid, ch);
    });

    DB.addSales(sales);
    var unmatchedArr = Object.keys(unmatched).map(function(k){ return {key:k,qty:unmatched[k]}; });
    DB.addImport({id:importId,type:_csvTab,filename:st.filename,importedAt:now,rowCount:rows.length,matchedCount:matched,unmatchedCount:unmatchedArr.length,unmatched:unmatchedArr,hash:hash});
    _csvState[_csvTab]={raw:null,filename:'',detected:null};
    U.toast('取込完了：照合'+matched+'件 / 未照合'+unmatchedArr.length+'件', unmatchedArr.length>0?'warning':'success');
    renderCsv(document.getElementById('main'));
  }

  function deleteImport(id) {
    var imp = DB.getImports().find(function(i){ return i.id===id; });
    var name = imp ? imp.filename : '';
    U.showSheet(
      '<div class="sheet-handle"></div>' +
      '<div class="sheet-title">読込履歴を削除</div>' +
      '<div style="padding:0 16px 8px;font-size:14px;color:var(--text2);text-align:center;">'+U.esc(name)+'</div>' +
      '<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:10px;">' +
        '<button onclick="App._doDeleteImport(\''+id+'\',true)" style="width:100%;height:50px;border-radius:12px;background:var(--primary-light);color:var(--primary);font-size:15px;font-weight:700;">↩ 在庫を元に戻して削除</button>' +
        '<button onclick="App._doDeleteImport(\''+id+'\',false)" style="width:100%;height:50px;border-radius:12px;background:var(--gray-light);color:var(--text);font-size:15px;font-weight:600;">在庫はそのまま削除</button>' +
        '<button onclick="App.hideSheet()" style="width:100%;height:44px;border-radius:12px;background:none;color:var(--text2);font-size:15px;">キャンセル</button>' +
      '</div>'
    );
  }

  function _doDeleteImport(id, restoreInventory) {
    U.hideSheet();
    if (restoreInventory) {
      var sales = DB.getSales().filter(function(s){ return s.importId===id; });
      var now = new Date().toISOString();
      var delta = {};
      sales.forEach(function(s){ delta[s.productId]=delta[s.productId]||{amazon:0,frima:0}; delta[s.productId][s.channel]+=s.quantity||1; });
      Object.keys(delta).forEach(function(pid){
        var p = DB.getById(pid); if (!p) return;
        var d = delta[pid], ch = {};
        if (d.amazon>0) { var pA=p.amazonInventory||0, nA=pA+d.amazon; ch.amazonInventory=nA; DB.addHistory({productId:pid,type:'amazon',prev:pA,next:nA,change:d.amazon,reason:'CSV削除による復元',timestamp:now}); }
        if (d.frima>0)  { var pF=p.frimaInventory||0,  nF=pF+d.frima;  ch.frimaInventory=nF;  DB.addHistory({productId:pid,type:'frima', prev:pF,next:nF,change:d.frima, reason:'CSV削除による復元',timestamp:now}); }
        DB.updateProduct(pid, ch);
      });
      U.toast('削除しました（在庫を復元しました）', 'success');
    } else {
      U.toast('削除しました', 'success');
    }
    DB.removeSalesByImport(id);
    DB.deleteImport(id);
    renderCsv(document.getElementById('main'));
  }

  function addToMaster(key, type) {
    U.hideSheet();
    openProductForm(null);
    setTimeout(function(){
      if (type==='amazon' && document.getElementById('fSku'))  document.getElementById('fSku').value  = key;
      if (type==='frima'  && document.getElementById('fMgmt')) document.getElementById('fMgmt').value = key;
    }, 100);
  }

  /* ====================
     SETTINGS TAB
     ==================== */

  function renderSettings(main) {
    var s = DB.getSettings();
    var html = '';

    html += '<div class="section-hd">在庫アラート閾値</div>';
    html += '<div class="settings-section">';
    html += '<div class="settings-row"><span class="settings-row-label">🔴 危険（赤）以下</span><span class="settings-row-val"><input type="number" id="sDanger" value="'+s.dangerAt+'" style="width:52px;text-align:right;border:1px solid #ddd;border-radius:6px;padding:4px 6px;font-size:15px;"> 個</span></div>';
    html += '<div class="settings-row"><span class="settings-row-label">🟡 警告（黄）以下</span><span class="settings-row-val"><input type="number" id="sWarn" value="'+s.warnAt+'" style="width:52px;text-align:right;border:1px solid #ddd;border-radius:6px;padding:4px 6px;font-size:15px;"> 個</span></div>';
    html += '</div>';
    html += '<div style="padding:0 16px 16px;"><button onclick="App.saveSettings()" style="width:100%;height:46px;border-radius:10px;background:var(--primary);color:white;font-size:15px;font-weight:700;">保存</button></div>';

    var products = DB.getProducts(), sales = DB.getSales();
    html += '<div class="section-hd">データ統計</div>';
    html += '<div class="settings-section">';
    html += '<div class="settings-row"><span class="settings-row-label">登録商品数</span><span class="settings-row-val">'+products.length+' 件</span></div>';
    html += '<div class="settings-row"><span class="settings-row-label">販売記録数</span><span class="settings-row-val">'+sales.length+' 件</span></div>';
    html += '</div>';

    html += '<div class="section-hd">バックアップ / 復元</div>';
    html += '<div class="settings-btn-row">';
    html += '<button class="settings-action-btn" onclick="App.backupData()">💾 バックアップ（ダウンロード）</button>';
    html += '<button class="settings-action-btn" onclick="App.restoreData()">📂 バックアップから復元</button>';
    html += '<input type="file" id="restoreFile" accept=".json" style="display:none;">';
    html += '</div>';

    html += '<div class="section-hd" style="color:var(--danger);">危険操作</div>';
    html += '<div class="settings-btn-row"><button class="settings-action-btn danger" onclick="App.clearAllData()">🗑 全データを削除</button></div>';

    html += renderSyncSection();

    main.innerHTML = html;

    var rf = main.querySelector('#restoreFile');
    if (rf) {
      rf.addEventListener('change', function(){
        var file = this.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e){
          U.confirm('バックアップから復元します。現在のデータは上書きされます。', function(){
            try { DB.importAll(e.target.result); U.toast('復元しました','success'); renderSettings(document.getElementById('main')); }
            catch(err){ U.toast('ファイルの形式が正しくありません','error'); }
          });
        };
        reader.readAsText(file);
      });
    }
  }

  function saveSettings() {
    var d = parseInt((document.getElementById('sDanger')||{value:3}).value)||3;
    var w = parseInt((document.getElementById('sWarn')||{value:10}).value)||10;
    DB.saveSettings({ dangerAt:d, warnAt:w });
    U.toast('保存しました','success');
  }

  function backupData() {
    var blob = new Blob([DB.exportAll()], {type:'application/json'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'amafuri_backup_'+new Date().toISOString().slice(0,10)+'.json';
    a.click(); URL.revokeObjectURL(url);
    U.toast('バックアップを保存しました');
  }

  function restoreData() { var el=document.getElementById('restoreFile'); if(el) el.click(); }

  function clearAllData() {
    U.confirm('全データを削除します。この操作は取り消せません。', function(){
      DB.clearAll(); U.toast('削除しました'); switchTab('products');
    });
  }

  /* ====================
     Sync config UI (設定画面内)
     ==================== */

  function renderSyncSection() {
    var url   = localStorage.getItem('amafuri_worker_url') || '';
    var token = localStorage.getItem('amafuri_api_token') || '';
    var lastSync = Sync.getLastSyncAt();
    var enabled = Sync.isEnabled();

    var html = '<div class="section-hd">☁️ クラウド同期（Cloudflare）</div>';
    html += '<div class="settings-section">';
    html += '<div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px;">';
    html += '<div class="settings-row-label" style="font-size:13px;color:var(--text2);">Worker URL</div>';
    html += '<input id="syncUrl" type="url" placeholder="https://amafuri-worker.xxx.workers.dev" value="'+U.esc(url)+'" style="width:100%;border:1px solid var(--gray-border);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;">';
    html += '</div>';
    html += '<div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px;border-top:1px solid var(--gray-border);">';
    html += '<div class="settings-row-label" style="font-size:13px;color:var(--text2);">APIトークン</div>';
    html += '<input id="syncToken" type="password" placeholder="ランダムな文字列" value="'+U.esc(token)+'" style="width:100%;border:1px solid var(--gray-border);border-radius:8px;padding:10px 12px;font-size:14px;outline:none;">';
    html += '</div>';
    html += '</div>';

    html += '<div style="padding:0 16px 12px;display:flex;gap:8px;">';
    html += '<button onclick="App.saveSyncConfig()" style="flex:1;height:44px;border-radius:10px;background:var(--primary);color:white;font-size:14px;font-weight:700;">保存</button>';
    html += '<button onclick="App.testSync()" style="height:44px;padding:0 16px;border-radius:10px;background:var(--gray-light);color:var(--text);font-size:14px;font-weight:600;">テスト</button>';
    html += '</div>';

    if (enabled) {
      html += '<div style="padding:0 16px 16px;display:flex;gap:8px;">';
      html += '<button onclick="App.manualPush()" style="flex:1;height:44px;border-radius:10px;background:var(--gray-light);color:var(--text);font-size:14px;font-weight:600;">↑ 今すぐ保存</button>';
      html += '<button onclick="App.manualPull()" style="flex:1;height:44px;border-radius:10px;background:var(--gray-light);color:var(--text);font-size:14px;font-weight:600;">↓ 今すぐ取得</button>';
      html += '</div>';
      if (lastSync) {
        html += '<div style="padding:0 16px 16px;font-size:12px;color:var(--text2);text-align:center;">最終同期: '+lastSync+'</div>';
      }
    }
    return html;
  }

  function saveSyncConfig() {
    var url   = (document.getElementById('syncUrl')   || {value:''}).value.trim();
    var token = (document.getElementById('syncToken') || {value:''}).value.trim();
    localStorage.setItem('amafuri_worker_url',   url);
    localStorage.setItem('amafuri_api_token', token);
    U.toast('同期設定を保存しました', 'success');
    if (url && token) Sync.push();
  }

  async function testSync() {
    var url   = (document.getElementById('syncUrl')   || {value:''}).value.trim();
    var token = (document.getElementById('syncToken') || {value:''}).value.trim();
    if (!url || !token) { U.toast('URLとトークンを入力してください', 'error'); return; }
    U.toast('接続テスト中...', '');
    var ok = await Sync.testConnection(url, token);
    U.toast(ok ? '✓ 接続成功' : '✗ 接続失敗（URLまたはトークンが間違っています）', ok ? 'success' : 'error');
  }

  function manualPush() { Sync.push(); }
  function manualPull() { Sync.pull(); }

  function refreshCurrentTab() {
    var main = document.getElementById('main');
    if (!main) return;
    if (_detailId) { renderDetail(main, _detailId); return; }
    switch(_tab) {
      case 'products': renderProducts(main); break;
      case 'csv':      renderCsv(main);      break;
      case 'settings': renderSettings(main); break;
    }
  }

  /* ====================
     Init
     ==================== */

  document.addEventListener('DOMContentLoaded', async function() {
    switchTab('products');
    // 起動時にクラウドからデータ取得（新しければ反映）
    var updated = await Sync.pullOnOpen();
    if (updated) {
      refreshCurrentTab();
      U.toast('クラウドから最新データを取得しました', 'success');
    }
  });

  return {
    switchTab, showDetail, goBack, hideSheet, refreshCurrentTab,
    openProductForm, saveProduct, deleteProduct,
    stepInv, setInv, setDetailPeriod, switchView,
    setCsvTab, clearCsv, doImport, deleteImport, _doDeleteImport, clearUnmatched, addToMaster,
    saveSettings, backupData, restoreData, clearAllData,
    saveSyncConfig, testSync, manualPush, manualPull
  };

})();
