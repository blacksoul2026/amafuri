/* ===== Inventory Page ===== */
var PageInventory = (function() {

  var _container = null;
  var _filter = '';

  function render(container) {
    _container = container;
    var products = Storage.getProducts();

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-title">在庫入力</div>' +
          '<div class="page-subtitle">Amazon在庫・フリマ在庫を増減できます</div>' +
        '</div>' +
      '</div>' +

      '<div class="filter-bar">' +
        '<input class="form-input" id="invSearch" placeholder="商品名・カラー・サイズで検索" value="' + Utils.esc(_filter) + '" style="max-width:320px;">' +
      '</div>' +

      (products.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">🏭</div>' +
          '<div class="empty-state-title">商品が登録されていません</div>' +
          '<div class="empty-state-desc">先に商品マスターから商品を登録してください</div>' +
          '<button class="btn btn-primary" id="goMaster">商品マスターへ</button>' +
          '</div>'
        : '<div class="card"><div class="table-wrap">' + renderTable(products) + '</div></div>'
      ) +

      '<div class="mt-20">' +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">在庫変更履歴</div></div>' +
          '<div class="card-body" id="historyArea">' + renderHistory(null) + '</div>' +
        '</div>' +
      '</div>';

    bindEvents(container);
  }

  function getFiltered() {
    var all = Storage.getProducts();
    var q = _filter.toLowerCase();
    if (!q) return all;
    return all.filter(function(p) {
      return (p.name||'').toLowerCase().includes(q)
          || (p.color||'').toLowerCase().includes(q)
          || (p.size||'').toLowerCase().includes(q);
    });
  }

  function renderTable(products) {
    var q = _filter.toLowerCase();
    var filtered = q
      ? products.filter(function(p) {
          return (p.name||'').toLowerCase().includes(q)
              || (p.color||'').toLowerCase().includes(q)
              || (p.size||'').toLowerCase().includes(q);
        })
      : products;

    var settings = Storage.getSettings();
    var rows = filtered.map(function(p) {
      var aInv = p.amazonInventory  || 0;
      var fInv = p.frimaInventory   || 0;
      var tInv = p.totalInventory   || 0;
      var imgHtml = p.imageData
        ? '<img class="product-thumb" src="' + p.imageData + '" alt="">'
        : Utils.noImg(52, 52);

      return '<tr data-id="' + p.id + '">' +
        '<td>' + imgHtml + '</td>' +
        '<td>' +
          '<div class="fw-bold">' + Utils.esc(p.name) + '</div>' +
          '<div class="text-sm text-muted">' +
            (p.color ? p.color : '') +
            (p.color && p.size ? ' / ' : '') +
            (p.size  ? p.size  : '') +
          '</div>' +
        '</td>' +
        '<td>' +
          '<div class="inv-row">' +
            '<button class="inv-counter-btn minus" data-id="' + p.id + '" data-type="amazon" data-delta="-1">－</button>' +
            '<input class="inv-num-input" data-id="' + p.id + '" data-type="amazon" value="' + aInv + '" style="border-color:var(--amazon);">' +
            '<button class="inv-counter-btn plus" data-id="' + p.id + '" data-type="amazon" data-delta="1">＋</button>' +
          '</div>' +
          '<div class="text-sm text-muted mt-8" style="color:var(--amazon);">Amazon在庫</div>' +
        '</td>' +
        '<td>' +
          '<div class="inv-row">' +
            '<button class="inv-counter-btn minus" data-id="' + p.id + '" data-type="frima" data-delta="-1">－</button>' +
            '<input class="inv-num-input" data-id="' + p.id + '" data-type="frima" value="' + fInv + '" style="border-color:var(--frima);">' +
            '<button class="inv-counter-btn plus" data-id="' + p.id + '" data-type="frima" data-delta="1">＋</button>' +
          '</div>' +
          '<div class="text-sm text-muted mt-8" style="color:var(--frima);">フリマ在庫</div>' +
        '</td>' +
        '<td class="text-right num fw-bold ' + Utils.invClass(tInv, settings) + '">' + Utils.formatNum(tInv) + '<div class="text-sm" style="font-weight:400;">総在庫</div></td>' +
        '<td>' +
          '<div class="d-flex gap-8 flex-wrap">' +
            '<button class="btn btn-outline btn-sm btn-add-inv" data-id="' + p.id + '" data-type="amazon">Amazon入荷</button>' +
            '<button class="btn btn-outline btn-sm btn-add-inv" data-id="' + p.id + '" data-type="frima">フリマ入荷</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table>' +
      '<thead><tr>' +
        '<th>画像</th>' +
        '<th>商品名</th>' +
        '<th class="col-amazon" style="min-width:180px;">Amazon在庫</th>' +
        '<th class="col-frima"  style="min-width:180px;">フリマ在庫</th>' +
        '<th class="col-total text-right">総在庫</th>' +
        '<th style="min-width:200px;">入荷追加</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function renderHistory(productId) {
    var hist = Storage.getInvHistory().slice().reverse();
    if (productId) hist = hist.filter(function(h){ return h.productId === productId; });
    if (hist.length === 0) return '<div class="text-muted text-sm">履歴がありません</div>';

    var products = Storage.getProducts();
    var pMap = {};
    products.forEach(function(p){ pMap[p.id] = p; });

    return '<div class="history-list">' +
      hist.slice(0, 50).map(function(h) {
        var p = pMap[h.productId];
        var pname = p ? p.name : '(削除済み)';
        var typeLabel = h.type === 'amazon' ? 'Amazon' : 'フリマ';
        var isPlus = h.change >= 0;
        var sign = isPlus ? '+' : '';
        return '<div class="history-item">' +
          '<div class="history-dot ' + (isPlus ? 'plus' : 'minus') + '"></div>' +
          '<div>' +
            '<div>' +
              '<strong>' + Utils.esc(pname) + '</strong> ' +
              '<span class="badge ' + (h.type==='amazon'?'badge-amazon':'badge-frima') + '">' + typeLabel + '</span>' +
              ' <span style="color:' + (isPlus?'var(--success)':'var(--danger)') + ';font-weight:700;">' + sign + Utils.formatNum(h.change) + '</span>' +
              ' → ' + Utils.formatNum(h.next) +
            '</div>' +
            '<div class="history-meta">' + Utils.esc(h.reason||'') + ' ／ ' + Utils.formatDateTime(h.timestamp) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function applyDelta(id, type, delta) {
    var p = Storage.getProductById(id);
    if (!p) return;
    var field  = type === 'amazon' ? 'amazonInventory' : 'frimaInventory';
    var prev   = p[field] || 0;
    var next   = Math.max(0, prev + delta);
    var changes = {};
    changes[field] = next;
    Storage.updateProduct(id, changes);
    Storage.addInvHistory({
      id: Utils.generateId(), productId: id, type: type,
      prev: prev, next: next, change: next - prev,
      reason: delta > 0 ? '手動増加' : '手動減少',
      timestamp: new Date().toISOString()
    });
    // Update the input value without full re-render
    var input = _container.querySelector('input[data-id="' + id + '"][data-type="' + type + '"]');
    if (input) input.value = next;
    // Update total cell
    var row = _container.querySelector('tr[data-id="' + id + '"]');
    if (row) {
      var pp = Storage.getProductById(id);
      var tCell = row.querySelector('td.text-right');
      if (tCell && pp) {
        var settings = Storage.getSettings();
        tCell.className = 'text-right num fw-bold ' + Utils.invClass(pp.totalInventory || 0, settings);
        tCell.innerHTML = Utils.formatNum(pp.totalInventory || 0) + '<div class="text-sm" style="font-weight:400;">総在庫</div>';
      }
    }
    // Refresh history
    var histArea = _container.querySelector('#historyArea');
    if (histArea) histArea.innerHTML = renderHistory(null);
  }

  function applyDirectInput(id, type, val) {
    var p = Storage.getProductById(id);
    if (!p) return;
    var field  = type === 'amazon' ? 'amazonInventory' : 'frimaInventory';
    var prev   = p[field] || 0;
    var next   = Math.max(0, parseInt(val) || 0);
    if (prev === next) return;
    var changes = {};
    changes[field] = next;
    Storage.updateProduct(id, changes);
    Storage.addInvHistory({
      id: Utils.generateId(), productId: id, type: type,
      prev: prev, next: next, change: next - prev,
      reason: '手動入力', timestamp: new Date().toISOString()
    });
    var row = _container.querySelector('tr[data-id="' + id + '"]');
    if (row) {
      var pp = Storage.getProductById(id);
      var tCell = row.querySelector('td.text-right');
      if (tCell && pp) {
        var settings = Storage.getSettings();
        tCell.className = 'text-right num fw-bold ' + Utils.invClass(pp.totalInventory || 0, settings);
        tCell.innerHTML = Utils.formatNum(pp.totalInventory || 0) + '<div class="text-sm" style="font-weight:400;">総在庫</div>';
      }
    }
    var histArea = _container.querySelector('#historyArea');
    if (histArea) histArea.innerHTML = renderHistory(null);
  }

  function openAddModal(id, type) {
    var p = Storage.getProductById(id);
    if (!p) return;
    var typeLabel = type === 'amazon' ? 'Amazon' : 'フリマ';
    var cur = type === 'amazon' ? (p.amazonInventory||0) : (p.frimaInventory||0);

    Utils.showModal(
      typeLabel + '在庫を追加：' + p.name,
      '<div class="form-group">' +
        '<label class="form-label">追加数量</label>' +
        '<input class="form-input" id="addQty" type="number" min="1" value="1" style="max-width:120px;">' +
        '<div class="form-hint">現在の在庫：' + Utils.formatNum(cur) + '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">理由・メモ</label>' +
        '<input class="form-input" id="addReason" placeholder="例：FBA入荷" value="' + (type==='amazon'?'FBA入荷':'自宅入荷') + '">' +
      '</div>',
      '<button class="btn btn-outline" id="addCancel">キャンセル</button>' +
      '<button class="btn btn-success" id="addOk">追加する</button>'
    );

    document.getElementById('addCancel').addEventListener('click', Utils.hideModal);
    document.getElementById('addOk').addEventListener('click', function() {
      var qty    = parseInt(document.getElementById('addQty').value)    || 0;
      var reason = document.getElementById('addReason').value.trim() || (type==='amazon'?'FBA入荷':'自宅入荷');
      if (qty <= 0) { Utils.toast('数量を入力してください', 'error'); return; }
      var field  = type === 'amazon' ? 'amazonInventory' : 'frimaInventory';
      var prev   = p[field] || 0;
      var next   = prev + qty;
      var changes = {};
      changes[field] = next;
      Storage.updateProduct(id, changes);
      Storage.addInvHistory({
        id: Utils.generateId(), productId: id, type: type,
        prev: prev, next: next, change: qty,
        reason: reason, timestamp: new Date().toISOString()
      });
      Utils.hideModal();
      Utils.toast(typeLabel + '在庫を ' + qty + '個追加しました', 'success');
      render(_container);
    });
  }

  function bindEvents(container) {
    var goMaster = container.querySelector('#goMaster');
    if (goMaster) goMaster.addEventListener('click', function(){ App.navigate('master'); });

    var searchInput = container.querySelector('#invSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        _filter = this.value;
        render(container);
      });
    }

    // Delta buttons
    container.querySelectorAll('.inv-counter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        applyDelta(this.dataset.id, this.dataset.type, parseInt(this.dataset.delta));
      });
    });

    // Direct input (on blur/enter)
    container.querySelectorAll('.inv-num-input').forEach(function(input) {
      input.addEventListener('change', function() {
        applyDirectInput(this.dataset.id, this.dataset.type, this.value);
      });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') this.blur();
      });
    });

    // Add buttons
    container.querySelectorAll('.btn-add-inv').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openAddModal(this.dataset.id, this.dataset.type);
      });
    });
  }

  return { render: render };
})();
