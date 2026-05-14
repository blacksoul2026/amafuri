/* ===== CSV Import Page ===== */
var PageCsvImport = (function() {

  var _container = null;
  var _tab = 'amazon'; // 'amazon' | 'sellernote'

  // Per-tab state
  var _state = {
    amazon:     { parsed: null, filename: '', mapping: {} },
    sellernote: { parsed: null, filename: '', mapping: {} }
  };

  // Required mapping fields per type
  var FIELDS = {
    amazon:     [{ key:'sku',  label:'SKU列 *', required:true }, { key:'qty', label:'数量列 *', required:true }, { key:'date', label:'注文日列', required:false }],
    sellernote: [{ key:'mgmt', label:'管理番号列 *', required:true }, { key:'qty', label:'数量列 *', required:true }, { key:'date', label:'日付列', required:false }]
  };

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
    var st = _state[_tab];
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

    if (st.parsed) {
      var headers  = st.parsed.headers;
      var rowCount = st.parsed.data.length;

      html +=
        '<div class="alert alert-info mt-12">' +
          '✅ ' + Utils.esc(st.filename) + ' を読み込みました。' +
          '<strong>' + rowCount + '行</strong>のデータを検出。' +
        '</div>' +

        '<div class="mt-12"><strong>検出した列：</strong></div>' +
        '<div class="text-sm text-muted mb-12" style="word-break:break-all;">' +
          headers.map(function(h){ return '<span class="badge badge-gray" style="margin:2px;">' + Utils.esc(h) + '</span>'; }).join('') +
        '</div>' +

        '<div class="card mb-12" style="background:var(--bg);">' +
          '<div class="card-header"><div class="card-title" style="font-size:0.9rem;">列マッピング設定</div></div>' +
          '<div class="card-body">' + renderMappingFields(headers) + '</div>' +
        '</div>' +

        '<div class="mb-12"><strong>プレビュー（先頭5行）</strong></div>' +
        renderPreview(headers, st.parsed.data.slice(0, 5)) +

        '<div class="mt-16">' +
          '<button class="btn btn-primary btn-lg" id="btnDoImport">このCSVを取り込む</button>' +
          '<button class="btn btn-outline btn-sm" id="btnClearCsv" style="margin-left:8px;">クリア</button>' +
        '</div>';
    }

    return html;
  }

  function renderMappingFields(headers) {
    var fields  = FIELDS[_tab];
    var saved   = Storage.getColMapping(_tab);
    var options = '<option value="">（使用しない）</option>' +
      headers.map(function(h) { return '<option value="' + Utils.esc(h) + '">' + Utils.esc(h) + '</option>'; }).join('');

    var rows = fields.map(function(f) {
      var savedVal = saved[f.key] || _state[_tab].mapping[f.key] || '';
      // Auto-detect if header matches common patterns
      if (!savedVal) savedVal = autoDetect(f.key, headers);
      return '<div class="form-row mb-8">' +
        '<div class="form-group" style="margin:0;">' +
          '<label class="form-label">' + f.label + '</label>' +
        '</div>' +
        '<div class="form-group" style="margin:0;">' +
          '<select class="form-select map-select" data-field="' + f.key + '">' +
            options.replace('value="' + Utils.esc(savedVal) + '"', 'value="' + Utils.esc(savedVal) + '" selected') +
          '</select>' +
        '</div>' +
      '</div>';
    }).join('');

    return rows;
  }

  function autoDetect(field, headers) {
    var patterns = {
      sku:  [/^sku$/i, /^商品コード$/, /^product.*sku/i],
      qty:  [/^quantity.purchased$/i, /^数量$/, /^qty$/i, /^販売数$/, /^数量.*売/],
      date: [/^purchase.date$/i, /^注文日$/, /^日付$/, /^order.*date/i, /^受注日$/],
      mgmt: [/^管理番号$/, /^管理コード$/, /^商品管理/]
    };
    var pats = patterns[field] || [];
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < pats.length; j++) {
        if (pats[j].test(headers[i])) return headers[i];
      }
    }
    return '';
  }

  function renderPreview(headers, rows) {
    if (!rows.length) return '<div class="text-muted text-sm">データがありません</div>';
    return '<div class="csv-preview">' +
      '<table>' +
        '<thead><tr>' + headers.map(function(h){ return '<th>' + Utils.esc(h) + '</th>'; }).join('') + '</tr></thead>' +
        '<tbody>' +
          rows.map(function(r) {
            return '<tr>' + headers.map(function(h){ return '<td>' + Utils.esc(r[h]||'') + '</td>'; }).join('') + '</tr>';
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
            '総行数：<strong>' + Utils.formatNum(imp.rowCount) + '</strong> ／ ' +
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

  function getCurrentMapping() {
    var mapping = {};
    if (!_container) return mapping;
    _container.querySelectorAll('.map-select').forEach(function(sel) {
      mapping[sel.dataset.field] = sel.value;
    });
    return mapping;
  }

  function doImport() {
    var st = _state[_tab];
    if (!st.parsed) return;

    var mapping = getCurrentMapping();
    _state[_tab].mapping = mapping;
    Storage.setColMapping(_tab, mapping);

    // Validate required fields
    var fields = FIELDS[_tab];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].required && !mapping[fields[i].key]) {
        Utils.toast(fields[i].label.replace(' *','') + ' の列を選択してください', 'error');
        return;
      }
    }

    // Dedup check
    var hash = Utils.hashString(st.filename + '|' + st.parsed.data.length + '|' + JSON.stringify(st.parsed.data[0]));
    var existing = Storage.findImportByHash(hash);
    if (existing) {
      Utils.confirm(
        'このCSVはすでに読み込まれています（' + Utils.formatDateTime(existing.importedAt) + '）。\n再度読み込むと在庫が二重に減算されます。本当に読み込みますか？',
        function() { processImport(st, mapping, hash); },
        null
      );
      return;
    }
    processImport(st, mapping, hash);
  }

  function processImport(st, mapping, hash) {
    var products = Storage.getProducts();
    var data     = st.parsed.data;
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
    var matchedSet   = {};
    var matchedCount = 0;

    data.forEach(function(row) {
      if (_tab === 'amazon') {
        var sku = (row[mapping.sku] || '').trim();
        if (!sku) return;
        var qty = parseInt(row[mapping.qty]) || 0;
        var date = mapping.date ? (row[mapping.date] || '') : '';
        var product = amazonMap[sku.toLowerCase()];
        if (product) {
          salesBatch.push({
            id: Utils.generateId(), importId: importId,
            productId: product.id, channel: 'amazon',
            quantity: qty, orderDate: date, importedAt: now
          });
          matchedSet[sku] = (matchedSet[sku] || 0) + qty;
          matchedCount++;
        } else {
          unmatched[sku] = (unmatched[sku] || 0) + qty;
        }
      } else {
        var mgmt = (row[mapping.mgmt] || '').trim();
        if (!mgmt) return;
        var qty2 = parseInt(row[mapping.qty]) || 0;
        var date2 = mapping.date ? (row[mapping.date] || '') : '';
        var product2 = frimaMap[mgmt.toLowerCase()];
        if (product2) {
          salesBatch.push({
            id: Utils.generateId(), importId: importId,
            productId: product2.id, channel: 'frima',
            quantity: qty2, orderDate: date2, importedAt: now
          });
          matchedSet[mgmt] = (matchedSet[mgmt] || 0) + qty2;
          matchedCount++;
        } else {
          unmatched[mgmt] = (unmatched[mgmt] || 0) + qty2;
        }
      }
    });

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

    // Save sales
    Storage.addSalesBatch(salesBatch);

    // Build unmatched array
    var unmatchedArr = Object.keys(unmatched).map(function(k){ return { key: k, qty: unmatched[k] }; });

    // Save import record
    Storage.addImport({
      id: importId, type: _tab,
      filename: st.filename,
      importedAt: now,
      rowCount: data.length,
      matchedCount: matchedCount,
      unmatchedCount: unmatchedArr.length,
      unmatched: unmatchedArr,
      hash: hash,
      mapping: mapping
    });

    // Clear parsed state
    _state[_tab].parsed   = null;
    _state[_tab].filename = '';

    var msg = '取込完了：照合済み ' + matchedCount + '件、未照合 ' + unmatchedArr.length + '件';
    Utils.toast(msg, unmatchedArr.length > 0 ? 'warning' : 'success');
    render(_container);
  }

  function bindEvents(container) {
    // Tabs
    container.querySelectorAll('[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _tab = this.dataset.tab;
        render(container);
      });
    });

    // Upload zone
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
        _state[_tab].parsed   = null;
        _state[_tab].filename = '';
        var panel = container.querySelector('#importPanel');
        if (panel) panel.innerHTML = renderImportPanel();
        rebindImportPanel(container);
      });
    }

    // Delete import
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

    // Add to master from unmatched
    container.querySelectorAll('.btn-add-master').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key  = this.dataset.key;
        var type = this.dataset.type;
        App.navigate('master');
        setTimeout(function() {
          if (type === 'amazon') {
            PageMaster.openFormWithSku(key, '');
          } else {
            PageMaster.openFormWithSku('', key);
          }
        }, 100);
      });
    });
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      var parsed = Utils.parseCSV(text);
      _state[_tab].parsed   = parsed;
      _state[_tab].filename = file.name;
      // Load saved mapping
      var saved = Storage.getColMapping(_tab);
      _state[_tab].mapping  = saved;
      var panel = _container && _container.querySelector('#importPanel');
      if (panel) panel.innerHTML = renderImportPanel();
      if (_container) rebindImportPanel(_container);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function rebindImportPanel(container) {
    var btnImport = container.querySelector('#btnDoImport');
    if (btnImport) btnImport.addEventListener('click', doImport);
    var btnClear  = container.querySelector('#btnClearCsv');
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        _state[_tab].parsed   = null;
        _state[_tab].filename = '';
        var panel = container.querySelector('#importPanel');
        if (panel) panel.innerHTML = renderImportPanel();
        rebindImportPanel(container);
      });
    }
    var zoneNew = container.querySelector('#uploadZone');
    var inputNew = container.querySelector('#csvFileInput');
    if (zoneNew) {
      zoneNew.addEventListener('click', function() { if (inputNew) inputNew.click(); });
    }
    if (inputNew) {
      inputNew.addEventListener('change', function() {
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

  return { render: render };
})();
