/* ===== Overview Page ===== */
var PageOverview = (function() {

  var state = {
    period: 'all',
    sort:   'totalSales',
    search: ''
  };

  function calcSales(products, sales, period) {
    var range = Utils.getDateRange(period);
    var map = {};
    products.forEach(function(p) {
      map[p.id] = { amazonSales: 0, frimaSales: 0 };
    });
    sales.forEach(function(s) {
      if (!map[s.productId]) return;
      var dateStr = s.orderDate || s.importedAt;
      if (!Utils.isInRange(dateStr, range)) return;
      if (s.channel === 'amazon') map[s.productId].amazonSales += (s.quantity || 0);
      else                        map[s.productId].frimaSales  += (s.quantity || 0);
    });
    return map;
  }

  function sortProducts(products, salesMap, sort) {
    return products.slice().sort(function(a, b) {
      var sa = salesMap[a.id] || {amazonSales:0, frimaSales:0};
      var sb = salesMap[b.id] || {amazonSales:0, frimaSales:0};
      switch (sort) {
        case 'totalSales':    return (sb.amazonSales+sb.frimaSales)  - (sa.amazonSales+sa.frimaSales);
        case 'amazonSales':   return sb.amazonSales  - sa.amazonSales;
        case 'frimaSales':    return sb.frimaSales   - sa.frimaSales;
        case 'totalInvAsc':   return ((a.totalInventory||0))   - ((b.totalInventory||0));
        case 'amazonInvAsc':  return ((a.amazonInventory||0))  - ((b.amazonInventory||0));
        case 'frimaInvAsc':   return ((a.frimaInventory||0))   - ((b.frimaInventory||0));
        default: return 0;
      }
    });
  }

  function channelBadge(aS, fS) {
    if (aS > 0 && fS > 0) return '<span class="ch-badge ch-both">両方</span>';
    if (aS > 0)           return '<span class="ch-badge ch-amazon">Amazonのみ</span>';
    if (fS > 0)           return '<span class="ch-badge ch-frima">フリマのみ</span>';
    return '<span class="ch-badge ch-none">販売なし</span>';
  }

  function render(container) {
    var settings = Storage.getSettings();
    var products = Storage.getProducts();
    var sales    = Storage.getSales();
    var salesMap = calcSales(products, sales, state.period);

    // Filter by search
    var search = state.search.toLowerCase();
    var filtered = search
      ? products.filter(function(p) {
          return (p.name||'').toLowerCase().includes(search)
              || (p.color||'').toLowerCase().includes(search)
              || (p.size||'').toLowerCase().includes(search)
              || (p.amazonSku||'').toLowerCase().includes(search)
              || (p.sellernoteMgmtNo||'').toLowerCase().includes(search);
        })
      : products;

    var sorted = sortProducts(filtered, salesMap, state.sort);

    // Summary stats
    var totalAmazon = 0, totalFrima = 0, totalInv = 0;
    sorted.forEach(function(p) {
      var sm = salesMap[p.id] || {};
      totalAmazon += sm.amazonSales || 0;
      totalFrima  += sm.frimaSales  || 0;
      totalInv    += p.totalInventory || 0;
    });

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-title">総販売数・在庫一覧</div>' +
          '<div class="page-subtitle">' + Utils.periodLabel(state.period) + ' ／ ' + sorted.length + '件</div>' +
        '</div>' +
      '</div>' +

      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-label">Amazon販売数</div><div class="stat-value stat-amazon num">' + Utils.formatNum(totalAmazon) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">フリマ販売数</div><div class="stat-value stat-frima num">' + Utils.formatNum(totalFrima) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">合計販売数</div><div class="stat-value stat-total num">' + Utils.formatNum(totalAmazon+totalFrima) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">総在庫数</div><div class="stat-value stat-inv num">' + Utils.formatNum(totalInv) + '</div></div>' +
      '</div>' +

      '<div class="filter-bar">' +
        '<label>期間：</label>' +
        '<div class="tabs" id="periodTabs">' +
          ['all','thisMonth','30days','90days'].map(function(p){
            return '<button class="tab-btn' + (state.period===p?' active':'') + '" data-period="' + p + '">' + Utils.periodLabel(p) + '</button>';
          }).join('') +
        '</div>' +
        '<label style="margin-left:8px;">並び替え：</label>' +
        '<select class="form-select" id="sortSel" style="max-width:200px;">' +
          renderSortOptions() +
        '</select>' +
        '<input class="form-input" id="searchInput" placeholder="商品名・カラー・SKUで検索" value="' + Utils.esc(state.search) + '" style="max-width:240px;">' +
      '</div>' +

      (sorted.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">📊</div>' +
          '<div class="empty-state-title">' + (products.length === 0 ? '商品が登録されていません' : '条件に一致する商品がありません') + '</div>' +
          (products.length === 0 ? '<div class="empty-state-desc">まず「商品マスター」から商品を登録してください</div><button class="btn btn-primary" data-page="master">商品マスターへ</button>' : '') +
          '</div>'
        : '<div class="table-wrap">' + renderTable(sorted, salesMap, settings) + '</div>'
      );

    bindEvents(container);
  }

  function renderSortOptions() {
    var opts = [
      ['totalSales',   '合計販売数が多い順'],
      ['amazonSales',  'Amazon販売数が多い順'],
      ['frimaSales',   'フリマ販売数が多い順'],
      ['totalInvAsc',  '総在庫が少ない順'],
      ['amazonInvAsc', 'Amazon在庫が少ない順'],
      ['frimaInvAsc',  'フリマ在庫が少ない順']
    ];
    return opts.map(function(o){
      return '<option value="' + o[0] + '"' + (state.sort===o[0]?' selected':'') + '>' + o[1] + '</option>';
    }).join('');
  }

  function renderTable(products, salesMap, settings) {
    var rows = products.map(function(p) {
      var sm = salesMap[p.id] || { amazonSales: 0, frimaSales: 0 };
      var totalSales = sm.amazonSales + sm.frimaSales;
      var aInv = p.amazonInventory  || 0;
      var fInv = p.frimaInventory   || 0;
      var tInv = p.totalInventory   || 0;
      var aClass = Utils.invClass(aInv, settings);
      var fClass = Utils.invClass(fInv, settings);
      var tClass = Utils.invClass(tInv, settings);
      var imgHtml = p.imageData
        ? '<img class="product-thumb" src="' + p.imageData + '" alt="商品画像">'
        : Utils.noImg(52, 52);

      return '<tr>' +
        '<td>' + imgHtml + '</td>' +
        '<td><a href="#" class="detail-link fw-bold" data-id="' + p.id + '" style="color:var(--text)">' + Utils.esc(p.name) + '</a></td>' +
        '<td>' + Utils.esc(p.color||'-') + '</td>' +
        '<td>' + Utils.esc(p.size||'-') + '</td>' +
        '<td class="text-sm text-muted">' + Utils.esc(p.amazonSku||'-') + '</td>' +
        '<td class="text-sm text-muted">' + Utils.esc(p.sellernoteMgmtNo||'-') + '</td>' +
        '<td class="text-right num num-amazon">' + Utils.formatNum(sm.amazonSales) + '</td>' +
        '<td class="text-right num num-frima">' + Utils.formatNum(sm.frimaSales) + '</td>' +
        '<td class="text-right num num-total fw-bold">' + Utils.formatNum(totalSales) + '</td>' +
        '<td class="text-right num ' + aClass + '">' + Utils.formatNum(aInv) + '</td>' +
        '<td class="text-right num ' + fClass + '">' + Utils.formatNum(fInv) + '</td>' +
        '<td class="text-right num ' + tClass + '">' + Utils.formatNum(tInv) + '</td>' +
        '<td>' + channelBadge(sm.amazonSales, sm.frimaSales) + '</td>' +
        '<td class="text-sm text-muted">' + Utils.esc(p.memo||'') + '</td>' +
      '</tr>';
    }).join('');

    return '<table>' +
      '<thead><tr>' +
        '<th style="min-width:60px;">画像</th>' +
        '<th style="min-width:140px;">商品名</th>' +
        '<th>カラー</th>' +
        '<th>サイズ</th>' +
        '<th style="min-width:120px;">Amazon SKU</th>' +
        '<th style="min-width:120px;">管理番号</th>' +
        '<th class="col-amazon text-right" style="min-width:80px;">A販売</th>' +
        '<th class="col-frima  text-right" style="min-width:80px;">F販売</th>' +
        '<th class="col-total  text-right" style="min-width:80px;">合計</th>' +
        '<th class="col-amazon text-right" style="min-width:80px;">A在庫</th>' +
        '<th class="col-frima  text-right" style="min-width:80px;">F在庫</th>' +
        '<th class="col-total  text-right" style="min-width:80px;">総在庫</th>' +
        '<th style="min-width:90px;">販売先</th>' +
        '<th style="min-width:120px;">メモ</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function bindEvents(container) {
    // Period tabs
    var tabs = container.querySelectorAll('[data-period]');
    tabs.forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.period = this.dataset.period;
        render(container);
      });
    });

    // Sort
    var sortSel = container.querySelector('#sortSel');
    if (sortSel) {
      sortSel.addEventListener('change', function() {
        state.sort = this.value;
        render(container);
      });
    }

    // Search
    var searchInput = container.querySelector('#searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.search = this.value;
        render(container);
      });
    }

    // Detail links
    container.querySelectorAll('.detail-link').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        App.navigate('detail', { id: this.dataset.id });
      });
    });

    // Navigate to master
    var goMaster = container.querySelector('[data-page="master"]');
    if (goMaster) {
      goMaster.addEventListener('click', function() {
        App.navigate('master');
      });
    }
  }

  return { render: render };
})();
