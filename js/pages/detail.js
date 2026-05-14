/* ===== Product Detail Page ===== */
var PageDetail = (function() {

  var _container = null;
  var _productId = null;
  var _period = 'all';

  function render(container, params) {
    _container = container;
    _productId = params && params.id;
    var product = _productId ? Storage.getProductById(_productId) : null;

    if (!product) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">❓</div>' +
          '<div class="empty-state-title">商品が見つかりません</div>' +
          '<button class="btn btn-primary" id="goOverview">一覧に戻る</button>' +
        '</div>';
      container.querySelector('#goOverview').addEventListener('click', function(){ App.navigate('overview'); });
      return;
    }

    var sales    = Storage.getSales().filter(function(s){ return s.productId === _productId; });
    var allSales = calcSalesData(sales);
    var filtered = filterByPeriod(sales, _period);
    var fData    = calcSalesData(filtered);
    var settings = Storage.getSettings();

    var aInv = product.amazonInventory  || 0;
    var fInv = product.frimaInventory   || 0;
    var tInv = product.totalInventory   || 0;
    var imgHtml = product.imageData
      ? '<img class="detail-hero-img" src="' + product.imageData + '" alt="商品画像">'
      : Utils.noImg(120, 120);

    container.innerHTML =
      '<div class="page-header">' +
        '<button class="btn btn-outline btn-sm" id="btnBack">← 一覧に戻る</button>' +
        '<div class="d-flex gap-8">' +
          '<button class="btn btn-outline btn-sm btn-edit-detail" data-id="' + product.id + '">編集</button>' +
        '</div>' +
      '</div>' +

      '<div class="detail-hero">' +
        imgHtml +
        '<div class="detail-hero-info">' +
          '<div class="detail-hero-name">' + Utils.esc(product.name) + '</div>' +
          '<div class="detail-badges">' +
            (product.color ? '<span class="badge badge-gray">' + Utils.esc(product.color) + '</span>' : '') +
            (product.size  ? '<span class="badge badge-gray">' + Utils.esc(product.size)  + '</span>' : '') +
          '</div>' +
          '<div class="text-sm text-muted mb-8">' +
            (product.amazonSku        ? 'Amazon SKU: <strong>' + Utils.esc(product.amazonSku) + '</strong><br>' : '') +
            (product.sellernoteMgmtNo ? 'セラーノート管理番号: <strong>' + Utils.esc(product.sellernoteMgmtNo) + '</strong>' : '') +
          '</div>' +
          '<div class="d-flex gap-8 flex-wrap">' +
            '<div class="stat-card" style="padding:10px 14px;text-align:center;">' +
              '<div class="stat-label">A在庫</div>' +
              '<div class="stat-value stat-amazon" style="font-size:1.2rem;">' + Utils.formatNum(aInv) + '</div>' +
            '</div>' +
            '<div class="stat-card" style="padding:10px 14px;text-align:center;">' +
              '<div class="stat-label">F在庫</div>' +
              '<div class="stat-value stat-frima" style="font-size:1.2rem;">' + Utils.formatNum(fInv) + '</div>' +
            '</div>' +
            '<div class="stat-card" style="padding:10px 14px;text-align:center;">' +
              '<div class="stat-label">総在庫</div>' +
              '<div class="stat-value stat-inv ' + Utils.invClass(tInv, settings) + '" style="font-size:1.2rem;">' + Utils.formatNum(tInv) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Period filter
      '<div class="tabs mb-16" id="detailPeriodTabs">' +
        ['all','thisMonth','30days','90days'].map(function(p){
          return '<button class="tab-btn' + (_period===p?' active':'') + '" data-period="' + p + '">' + Utils.periodLabel(p) + '</button>';
        }).join('') +
      '</div>' +

      // Sales summary for period
      '<div class="stats-grid mb-16">' +
        '<div class="stat-card"><div class="stat-label">Amazon販売数</div><div class="stat-value stat-amazon">' + Utils.formatNum(fData.amazon) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">フリマ販売数</div><div class="stat-value stat-frima">' + Utils.formatNum(fData.frima) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">合計販売数</div><div class="stat-value stat-total">' + Utils.formatNum(fData.total) + '</div></div>' +
      '</div>' +

      // Monthly table
      '<div class="card mb-16">' +
        '<div class="card-header"><div class="card-title">月別販売数（全期間）</div></div>' +
        '<div class="card-body">' + renderMonthlyTable(sales) + '</div>' +
      '</div>' +

      // Memo
      '<div class="card mb-16">' +
        '<div class="card-header">' +
          '<div class="card-title">メモ</div>' +
          '<button class="btn btn-outline btn-sm" id="btnEditMemo">編集</button>' +
        '</div>' +
        '<div class="card-body">' +
          '<div id="memoContent">' +
            (product.memo
              ? '<p style="white-space:pre-wrap;">' + Utils.esc(product.memo) + '</p>'
              : '<p class="text-muted text-sm">メモはありません</p>') +
          '</div>' +
        '</div>' +
      '</div>' +

      // Inventory history
      '<div class="card">' +
        '<div class="card-header"><div class="card-title">在庫変更履歴</div></div>' +
        '<div class="card-body">' + renderInvHistory(product.id) + '</div>' +
      '</div>';

    bindEvents(container, product);
  }

  function calcSalesData(sales) {
    var amazon = 0, frima = 0;
    sales.forEach(function(s) {
      if (s.channel === 'amazon') amazon += s.quantity || 0;
      else                        frima  += s.quantity || 0;
    });
    return { amazon: amazon, frima: frima, total: amazon + frima };
  }

  function filterByPeriod(sales, period) {
    var range = Utils.getDateRange(period);
    return sales.filter(function(s) {
      return Utils.isInRange(s.orderDate || s.importedAt, range);
    });
  }

  function renderMonthlyTable(sales) {
    if (!sales.length) return '<div class="text-muted text-sm">販売データがありません</div>';

    // Group by month
    var months = {};
    sales.forEach(function(s) {
      var mk = Utils.monthKey(s.orderDate || s.importedAt);
      if (!months[mk]) months[mk] = { amazon: 0, frima: 0 };
      if (s.channel === 'amazon') months[mk].amazon += s.quantity || 0;
      else                        months[mk].frima  += s.quantity || 0;
    });

    var keys = Object.keys(months).sort().reverse();
    if (!keys.length) return '<div class="text-muted text-sm">データなし</div>';

    return '<div class="table-wrap">' +
      '<table class="monthly-table">' +
        '<thead><tr>' +
          '<th>月</th>' +
          '<th class="col-amazon">Amazon販売</th>' +
          '<th class="col-frima">フリマ販売</th>' +
          '<th class="col-total">合計</th>' +
        '</tr></thead>' +
        '<tbody>' +
          keys.map(function(mk) {
            var m = months[mk];
            return '<tr>' +
              '<td>' + mk + '</td>' +
              '<td class="num-amazon">' + Utils.formatNum(m.amazon) + '</td>' +
              '<td class="num-frima">'  + Utils.formatNum(m.frima)  + '</td>' +
              '<td class="num-total fw-bold">' + Utils.formatNum(m.amazon + m.frima) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';
  }

  function renderInvHistory(productId) {
    var hist = Storage.getInvHistory()
      .filter(function(h){ return h.productId === productId; })
      .slice().reverse().slice(0, 30);
    if (!hist.length) return '<div class="text-muted text-sm">履歴がありません</div>';

    return '<div class="history-list">' +
      hist.map(function(h) {
        var isPlus = h.change >= 0;
        var typeLabel = h.type === 'amazon' ? 'Amazon' : 'フリマ';
        return '<div class="history-item">' +
          '<div class="history-dot ' + (isPlus?'plus':'minus') + '"></div>' +
          '<div>' +
            '<span class="badge ' + (h.type==='amazon'?'badge-amazon':'badge-frima') + '">' + typeLabel + '</span>' +
            ' <span style="color:' + (isPlus?'var(--success)':'var(--danger)') + ';font-weight:700;">' +
              (isPlus?'+':'') + Utils.formatNum(h.change) + '</span>' +
            ' → ' + Utils.formatNum(h.next) +
            '<div class="history-meta">' + Utils.esc(h.reason||'') + ' ／ ' + Utils.formatDateTime(h.timestamp) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function bindEvents(container, product) {
    container.querySelector('#btnBack').addEventListener('click', function() {
      App.navigate('overview');
    });

    var editBtn = container.querySelector('.btn-edit-detail');
    if (editBtn) {
      editBtn.addEventListener('click', function() {
        App.navigate('master');
        setTimeout(function() {
          PageMaster.openFormWithSku(null, null, product.id);
        }, 100);
      });
    }

    // Period tabs
    container.querySelectorAll('[data-period]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _period = this.dataset.period;
        render(container, { id: _productId });
      });
    });

    // Memo edit
    var memoBtn = container.querySelector('#btnEditMemo');
    if (memoBtn) {
      memoBtn.addEventListener('click', function() {
        Utils.showModal(
          'メモを編集',
          '<textarea class="form-textarea" id="memoEdit" rows="5" style="min-height:120px;">' +
            Utils.esc(product.memo || '') + '</textarea>',
          '<button class="btn btn-outline" id="memoCancel">キャンセル</button>' +
          '<button class="btn btn-primary" id="memoSave">保存する</button>'
        );
        document.getElementById('memoCancel').addEventListener('click', Utils.hideModal);
        document.getElementById('memoSave').addEventListener('click', function() {
          var val = document.getElementById('memoEdit').value;
          Storage.updateProduct(product.id, { memo: val });
          product.memo = val;
          var memoContent = container.querySelector('#memoContent');
          if (memoContent) {
            memoContent.innerHTML = val
              ? '<p style="white-space:pre-wrap;">' + Utils.esc(val) + '</p>'
              : '<p class="text-muted text-sm">メモはありません</p>';
          }
          Utils.hideModal();
          Utils.toast('メモを保存しました');
        });
      });
    }
  }

  return { render: render };
})();
