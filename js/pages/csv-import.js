/* ===== CSV Import Page ===== */
var PageCsvImport = (function() {

  var _container = null;
  var _tab = 'amazon'; // 'amazon' | 'sellernote'

  // Per-tab state: { raw: text, filename, detected: {format, filteredRows, allRows} }
  var _state = {
    amazon:     { raw: null, filename: '', detected: null },
    sellernote: { raw: null, filename: '', detected: null }
  };

  // ---- Format detection ----

  // Amazon CSV: must have these columns (after skipping metadata lines)
  var AMAZON_REQUIRED = ['SKU', '数量', 'トランザクションの種類', '日付/時間'];
  // SellerNote CSV: must have these columns
  var SELLERNOTE_REQUIRED = ['SKU/管理番号', '取引状態', '売上日'];

  function detectAmazon(text) {
    var parsed = Utils.parseCSVAutoHeader(text, ['SKU', '数量', 'トランザクションの種類']);
    if (!parsed || !parsed.headers.length) return null;
    var missing = AMAZON_REQUIRED.filter(function(c) { return parsed.headers.indexOf(c) < 0; });
    if (missing.length > 0) return null;
    var filtered = parsed.data.filter(function(r) {
      return (r['トランザクションの種類'] || '').trim() === '注文';
    });
    return { format: 'amazon', parsed: parsed, filteredRows: filtered };
  }

  function detectSellerNote(text) {
    var parsed = Utils.parseCSV(text);
    if (!parsed || !parsed.headers.length) return null;
    var missing = SELLERNOTE_REQUIRED.filter(function(c) { return parsed.headers.indexOf(c) < 0; });
    if (missing.length > 0) return null;
    var filtered = parsed.data.filter(function(r) {
      return (r['取引状態'] || '').trim() === '取引完了';
    });
    return { format: 'sellernote', parsed: parsed, filteredRows: filtered };
  }

  function detectFormat(text, tab) {
    if (tab === 'amazon')     return detectAmazon(text);
    if (tab === 'sellernote') return detectSellerNote(text);
    return null;
  }

  // ---- Render ----

  function render(container) {
    _container = container;
    var imports  = Storage.getImports().slice().reverse();
    var products = Storage.getProducts();

    container.innerHTML =
      '<div class="page-header">' +
        '<div class="page-title">CSV読込</div>' +
      '</div>' +

      '<div class="tabs mb-16" id="csvTabs">' +
        '<button class="tab-btn' + (_tab==='amazon'?' active':'') + '" data-tab="amazon">Amazon CSV</button>' +
        '<button class="tab-btn' + (_tab==='sellernote'?' active':'') + '" data-tab="sellernote">セラーノート CSV</button>' +
      '</div>' +

      '<div class="card mb-16">' +
        '<div class="card-header">' +
          '<div class="card-title">' + (_tab==='amazon' ? 'Amazon CSV' : 'セラーノート CSV') + ' を読み込む</div>' +
        '</div>' +
        '<div class="card-body" id="importPanel">' + renderImportPanel() + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-header"><div class="card-title">読込履歴</div></div>' +
        '<div class="card-body" id="historyPanel">' + renderHistoryPanel(imports, products) + '</div>' +
      '</div>';

    bindEvents(container);
  }

  function renderImportPanel() {
    var st  = _state[_tab];
    var det = st.detected;
    var html = '';

    // Upload zone
    html +=
      '<div class="upload-zone" id="uploadZone">' +
        '<div class="upload-zone-icon">📂</div>' +
        '<div class="upload-zone-text">CSVファイルをドラッグ＆ドロップ</div>' +
        '<div class="upload-zone-hint">または クリックしてファイルを選択（CSV / TSV）</div>' +
        (st.filename ? '<div class="mt-8"><strong>' + Utils.esc(st.filename) + '</strong></div>' : '') +
      '</div>' +
      '<input type="file" id="csvFileInput" accept=".csv,.tsv,.txt" style="display:none;">';

    if (st.raw && !det) {
      // File loaded but format not recognized
      html +=
        '<div class="alert alert-error mt-12">' +
          '⚠ このファイルは' + (_tab==='amazon' ? 'Amazon' : 'セラーノート') + ' CSVの形式として認識できませんでした。<br>' +
          (_tab==='amazon'
            ? '必要な列：SKU、数量、トランザクションの種類、日付/時間'
            : '必要な列：SKU/管理番号、取引状態、売上日') +
        '</div>';
      html += '<div class="mt-12"><button class="btn btn-outline btn-sm" id="btnClearCsv">クリア</button></div>';
      return html;
    }

    if (det) {
      var allCount      = det.parsed.data.length;
      var filteredCount = det.filteredRows.length;
      var filterLabel   = _tab === 'amazon' ? '「注文」行' : '「取引完了」行';

      html +=
        '<div class="alert alert-info mt-12">' +
          '✅ <strong>' + Utils.esc(st.filename) + '</strong> を読み込みました。<br>' +
          '全 <strong>' + allCount + ' 行</strong> ／ ' + filterLabel + ': <strong>' + filteredCount + ' 行</strong>' +
        '</div>' +
        renderDetectedPreview(det) +
        '<div class="mt-16 d-flex gap-8">' +
          '<button class="btn btn-primary btn-lg" id="btnDoImport">このCSVを取り込む</button>' +
          '<button class="btn btn-outline btn-sm" id="btnClearCsv">クリア</button>' +
        '</div>';
    }

    return html;
  }

  function renderDetectedPreview(det) {
    var rows = det.filteredRows.slice(0, 5);
    if (!rows.length) return '<div class="text-muted text-sm mt-8">対象行がありません</div>';

    var cols, labels;
    if (det.format === 'amazon') {
      cols   = ['日付/時間', 'SKU', '数量', 'トランザクションの種類'];
      labels = ['注文日時', 'SKU', '数量', '種類'];
    } else {
      cols   = ['売上日', 'SKU/管理番号', '商品名', '取引状態'];
      labels = ['売上日', '管理番号', '商品名', '状態'];
    }

    return '<div class="mb-8 text-sm fw-bold mt-12">プレビュー（先頭5行）</div>' +
      '<div class="csv-preview">' +
        '<table>' +
          '<thead><tr>' + labels.map(function(l){ return '<th>' + Utils.esc(l) + '</th>'; }).join('') + '</tr></thead>' +
          '<tbody>' +
            rows.map(function(r) {
              return '<tr>' + cols.map(function(c){ return '<td>' + Utils.esc(r[c]||'') + '</td>'; }).join('') + '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function renderHistoryPanel(imports, products) {
    var filtered = imports.filter(function(i){ return i.type === _tab; });
    if (filtered.length === 0) return '<div class="text-muted text-sm">読込履歴がありません</div>';

    return filtered.map(function(imp) {
      var typeClass = imp.type === 'amazon' ? 'import-type-amazon' : 'import-type-sellernote';
      var typeLabel = imp.type === 'amazon' ? 'Amazon' : 'セラーノート';
      return '<div class="import-history-item">' +
        '<div style="flex:1;">' +
          '<div class="d-flex align-center gap-8 mb-8 flex-wrap">' +
            '<span class="import-type-badge ' + typeClass + '">' + typeLabel + '</span>' +
            '<strong>' + Utils.esc(imp.filename) + '</strong>' +
            '<span class="text-sm text-muted">' + Utils.formatDateTime(imp.importedAt) + '</span>' +
          '</div>' +
          '<div class="text-sm">' +
            '対象行：<strong>' + Utils.formatNum(imp.rowCount) + '</strong> ／ ' +
            '照合済み：<span style="color:var(--success);font-weight:700;">' + Utils.formatNum(imp.matchedCount) + '</span> ／ ' +
            '未照合：<span style="color:var(--warning);font-weight:700;">' + Utils.formatNum(imp.unmatchedCount) + '</span>' +
          '</div>' +
          (imp.unmatched && imp.unmatched.length > 0 ? renderUnmatched(imp.unmatched, imp.type) : '') +
        '</div>' +
        '<button class="btn btn-danger btn-sm btn-del-import" data-id="' + imp.id + '" style="flex-shrink:0;align-self:flex-start;">削除</button>' +
      '</div>';
    }).join('');
  }

  function renderUnmatched(unmatched, type) {
    var label = type === 'amazon' ? 'SKU' : '管理番号';
    return '<div class="mt-8">' +
      '<div class="text-sm fw-bold" style="color:var(--warning);margin-bottom:4px;">⚠ 未照合（' + label + ' が商品マスターにありません）</div>' +
      '<div class="unmatched-list">' +
        unmatched.slice(0, 10).map(function(u) {
          return '<div class="unmatched-item">' +
            '<span><strong>' + label + ':</strong> ' + Utils.esc(u.key) + ' （' + Utils.formatNum(u.qty) + '個）</span>' +
            '<button class="btn btn-outline btn-sm btn-add-master" data-key="' + Utils.esc(u.key) + '" data-type="' + type + '">マスターに追加</button>' +
          '</div>';
        }).join('') +
        (unmatched.length > 10 ? '<div class="text-sm text-muted">...他 ' + (unmatched.length - 10) + ' 件</div>' : '') +
      '</div>' +
    '</div>';
  }

  // ---- Import logic ----

  function doImport() {
    var st  = _state[_tab];
    var det = st.detected;
    if (!det) return;

    var hash = Utils.hashString(st.filename + '|' + det.parsed.data.length + '|' + JSON.stringify(det.parsed.data[0]));
    var existing = Storage.findImportByHash(hash);
    if (existing) {
      Utils.confirm(
        'このCSVはすでに読み込まれています（' + Utils.formatDateTime(existing.importedAt) + '）。\n再度読み込むと在庫が二重に減算されます。本当に読み込みますか？',
        function() { processImport(st, det, hash); },
        null
      );
      return;
    }
    processImport(st, det, hash);
  }

  function processImport(st, det, hash) {
    var products = Storage.getProducts();
    var rows     = det.filteredRows;
    var now      = new Date().toISOString();
    var importId = Utils.generateId();

    // Build lookup maps
    var amazonMap = {}, frimaMap = {};
    products.forEach(function(p) {
      if (p.amazonSku)        amazonMap[p.amazonSku.trim().toLowerCase()] = p;
      if (p.sellernoteMgmtNo) frimaMap[p.sellernoteMgmtNo.trim().toLowerCase()] = p;
    });

    var salesBatch   = [];
    var unmatched    = {};
    var matchedCount = 0;

    if (det.format === 'amazon') {
      rows.forEach(function(row) {
        var sku = (row['SKU'] || '').trim();
        if (!sku) return;
        var qty  = parseInt(row['数量']) || 0;
        var date = (row['日付/時間'] || '').trim();
        var product = amazonMap[sku.toLowerCase()];
        if (product) {
          salesBatch.push({
            id: Utils.generateId(), importId: importId,
            productId: product.id, channel: 'amazon',
            quantity: qty, orderDate: date, importedAt: now
          });
          matchedCount++;
        } else {
          unmatched[sku] = (unmatched[sku] || 0) + qty;
        }
      });
    } else {
      // sellernote: each row = 1 unit
      rows.forEach(function(row) {
        var mgmt = (row['SKU/管理番号'] || '').trim();
        if (!mgmt) return;
        var date = (row['売上日'] || '').trim();
        var product = frimaMap[mgmt.toLowerCase()];
        if (product) {
          salesBatch.push({
            id: Utils.generateId(), importId: importId,
            productId: product.id, channel: 'frima',
            quantity: 1, orderDate: date, importedAt: now
          });
          matchedCount++;
        } else {
          unmatched[mgmt] = (unmatched[mgmt] || 0) + 1;
        }
      });
    }

    // Deduct inventory per product
    var invDelta = {};
    salesBatch.forEach(function(s) {
      invDelta[s.productId] = invDelta[s.productId] || { amazon: 0, frima: 0 };
      invDelta[s.productId][s.channel] += s.quantity;
    });

    Object.keys(invDelta).forEach(function(pid) {
      var p = Storage.getProductById(pid);
      if (!p) return;
      var delta = invDelta[pid];
      var changes = {};
      if (delta.amazon > 0) {
        var prevA = p.amazonInventory || 0;
        var nextA = Math.max(0, prevA - delta.amazon);
        changes.amazonInventory = nextA;
        Storage.addInvHistory({ id: Utils.generateId(), productId: pid, type: 'amazon',
          prev: prevA, next: nextA, change: nextA - prevA,
          reason: 'Amazon CSV取込', timestamp: now });
      }
      if (delta.frima > 0) {
        var prevF = p.frimaInventory || 0;
        var nextF = Math.max(0, prevF - delta.frima);
        changes.frimaInventory = nextF;
        Storage.addInvHistory({ id: Utils.generateId(), productId: pid, type: 'frima',
          prev: prevF, next: nextF, change: nextF - prevF,
          reason: 'フリマCSV取込', timestamp: now });
      }
      Storage.updateProduct(pid, changes);
    });

    Storage.addSalesBatch(salesBatch);

    var unmatchedArr = Object.keys(unmatched).map(function(k){ return { key: k, qty: unmatched[k] }; });

    Storage.addImport({
      id: importId, type: _tab,
      filename: st.filename,
      importedAt: now,
      rowCount: rows.length,
      matchedCount: matchedCount,
      unmatchedCount: unmatchedArr.length,
      unmatched: unmatchedArr,
      hash: hash
    });

    _state[_tab].raw      = null;
    _state[_tab].filename = '';
    _state[_tab].detected = null;

    var msg = '取込完了：照合済み ' + matchedCount + '件、未照合 ' + unmatchedArr.length + '件';
    Utils.toast(msg, unmatchedArr.length > 0 ? 'warning' : 'success');
    render(_container);
  }

  // ---- Events ----

  function bindEvents(container) {
    container.querySelectorAll('[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _tab = this.dataset.tab;
        render(container);
      });
    });

    var zone  = container.querySelector('#uploadZone');
    var input = container.querySelector('#csvFileInput');
    if (zone) {
      zone.addEventListener('click',    function() { if (input) input.click(); });
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave',function() { zone.classList.remove('drag-over'); });
      zone.addEventListener('drop',     function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var f = e.dataTransfer.files[0];
        if (f) readFile(f);
      });
    }
    if (input) {
      input.addEventListener('change', function() {
        if (this.files[0]) readFile(this.files[0]);
      });
    }

    var btnImport = container.querySelector('#btnDoImport');
    if (btnImport) btnImport.addEventListener('click', doImport);

    var btnClear = container.querySelector('#btnClearCsv');
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        _state[_tab].raw      = null;
        _state[_tab].filename = '';
        _state[_tab].detected = null;
        var panel = container.querySelector('#importPanel');
        if (panel) { panel.innerHTML = renderImportPanel(); rebindPanel(container); }
      });
    }

    container.querySelectorAll('.btn-del-import').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        Utils.confirm(
          'この読込履歴を削除します。\n注意：この操作では在庫は自動で戻りません。在庫を戻す場合は在庫入力ページで手動調整してください。',
          function() {
            Storage.removeSalesByImportId(id);
            Storage.deleteImport(id);
            Utils.toast('読込履歴を削除しました');
            render(container);
          }
        );
      });
    });

    container.querySelectorAll('.btn-add-master').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key  = this.dataset.key;
        var type = this.dataset.type;
        App.navigate('master');
        setTimeout(function() {
          if (type === 'amazon') PageMaster.openFormWithSku(key, '');
          else                   PageMaster.openFormWithSku('', key);
        }, 100);
      });
    });
  }

  function rebindPanel(container) {
    var btnImport = container.querySelector('#btnDoImport');
    if (btnImport) btnImport.addEventListener('click', doImport);

    var btnClear = container.querySelector('#btnClearCsv');
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        _state[_tab].raw      = null;
        _state[_tab].filename = '';
        _state[_tab].detected = null;
        var panel = container.querySelector('#importPanel');
        if (panel) { panel.innerHTML = renderImportPanel(); rebindPanel(container); }
      });
    }

    var zone  = container.querySelector('#uploadZone');
    var input = container.querySelector('#csvFileInput');
    if (zone) {
      zone.addEventListener('click', function() { if (input) input.click(); });
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var f = e.dataTransfer.files[0];
        if (f) readFile(f);
      });
    }
    if (input) {
      input.addEventListener('change', function() {
        if (this.files[0]) readFile(this.files[0]);
      });
    }

    container.querySelectorAll('.btn-add-master').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key  = this.dataset.key;
        var type = this.dataset.type;
        App.navigate('master');
        setTimeout(function() {
          if (type === 'amazon') PageMaster.openFormWithSku(key, '');
          else                   PageMaster.openFormWithSku('', key);
        }, 100);
      });
    });
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      var det  = detectFormat(text, _tab);
      _state[_tab].raw      = text;
      _state[_tab].filename = file.name;
      _state[_tab].detected = det;
      var panel = _container && _container.querySelector('#importPanel');
      if (panel) { panel.innerHTML = renderImportPanel(); rebindPanel(_container); }
    };
    reader.readAsText(file, 'UTF-8');
  }

  return { render: render };
})();
