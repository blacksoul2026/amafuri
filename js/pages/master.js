/* ===== Product Master Page ===== */
var PageMaster = (function() {

  var _container = null;

  function render(container) {
    _container = container;
    var products = Storage.getProducts();

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-title">商品マスター</div>' +
          '<div class="page-subtitle">' + products.length + '件登録済み</div>' +
        '</div>' +
        '<button class="btn btn-primary" id="btnAddProduct">＋ 商品を追加</button>' +
      '</div>' +

      '<div class="filter-bar">' +
        '<input class="form-input" id="masterSearch" placeholder="商品名・カラー・サイズ・SKUで検索" style="max-width:320px;">' +
      '</div>' +

      (products.length === 0
        ? '<div class="empty-state">' +
            '<div class="empty-state-icon">📦</div>' +
            '<div class="empty-state-title">商品が登録されていません</div>' +
            '<div class="empty-state-desc">「＋ 商品を追加」から最初の商品を登録してください</div>' +
          '</div>'
        : '<div class="product-grid" id="productGrid">' + renderCards(products) + '</div>'
      );

    bindEvents(container);
  }

  function renderCards(products) {
    return products.map(function(p) {
      var imgHtml = p.imageData
        ? '<img class="product-thumb-lg" src="' + p.imageData + '" alt="商品画像">'
        : Utils.noImg(80, 80);
      var aInv = p.amazonInventory  || 0;
      var fInv = p.frimaInventory   || 0;
      var tInv = p.totalInventory   || 0;
      var settings = Storage.getSettings();

      return '<div class="product-card" data-id="' + p.id + '">' +
        imgHtml +
        '<div class="product-card-info">' +
          '<div class="product-card-name">' + Utils.esc(p.name) + '</div>' +
          '<div class="product-card-meta">' +
            (p.color ? '<span class="badge badge-gray">' + Utils.esc(p.color) + '</span>' : '') +
            (p.size  ? '<span class="badge badge-gray">' + Utils.esc(p.size)  + '</span>' : '') +
          '</div>' +
          '<div class="product-card-sku">' +
            (p.amazonSku        ? 'SKU: ' + Utils.esc(p.amazonSku) + '<br>' : '') +
            (p.sellernoteMgmtNo ? '管理番号: ' + Utils.esc(p.sellernoteMgmtNo) : '') +
          '</div>' +
          '<div class="product-card-inv">' +
            '<span class="inv-chip inv-chip-amazon ' + Utils.invClass(aInv, settings) + '">A在庫 ' + Utils.formatNum(aInv) + '</span>' +
            '<span class="inv-chip inv-chip-frima '  + Utils.invClass(fInv, settings) + '">F在庫 ' + Utils.formatNum(fInv) + '</span>' +
            '<span class="inv-chip inv-chip-total '  + Utils.invClass(tInv, settings) + '">計 '    + Utils.formatNum(tInv) + '</span>' +
          '</div>' +
          (p.memo ? '<div class="text-sm text-muted" style="margin-bottom:8px;">' + Utils.esc(p.memo) + '</div>' : '') +
          '<div class="product-card-actions">' +
            '<button class="btn btn-outline btn-sm btn-edit-product" data-id="' + p.id + '">編集</button>' +
            '<button class="btn btn-danger  btn-sm btn-del-product"  data-id="' + p.id + '">削除</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function bindEvents(container) {
    container.querySelector('#btnAddProduct').addEventListener('click', function() {
      openForm(null);
    });

    var searchInput = container.querySelector('#masterSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var q = this.value.toLowerCase();
        var all = Storage.getProducts();
        var filtered = q
          ? all.filter(function(p) {
              return (p.name||'').toLowerCase().includes(q)
                  || (p.color||'').toLowerCase().includes(q)
                  || (p.size||'').toLowerCase().includes(q)
                  || (p.amazonSku||'').toLowerCase().includes(q)
                  || (p.sellernoteMgmtNo||'').toLowerCase().includes(q);
            })
          : all;
        var grid = container.querySelector('#productGrid');
        if (grid) grid.innerHTML = renderCards(filtered);
        bindCardEvents(container);
      });
    }

    bindCardEvents(container);
  }

  function bindCardEvents(container) {
    container.querySelectorAll('.btn-edit-product').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openForm(this.dataset.id);
      });
    });
    container.querySelectorAll('.btn-del-product').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = this.dataset.id;
        var p  = Storage.getProductById(id);
        Utils.confirm(
          '「' + (p ? p.name : '商品') + '」を削除します。\nこの商品に紐付く販売データも削除されます。',
          function() {
            Storage.deleteProduct(id);
            Utils.toast('商品を削除しました', 'success');
            render(_container);
          }
        );
      });
    });
  }

  // ---- Form ----
  function openForm(id) {
    var p = id ? Storage.getProductById(id) : null;
    var title = p ? '商品を編集' : '商品を追加';
    var imgPreview = p && p.imageData
      ? '<img id="imgPreview" class="image-preview" src="' + p.imageData + '" alt="プレビュー">'
      : '<span id="imgPreview"></span>';

    var body =
      '<div class="form-group">' +
        '<label class="form-label">画像</label>' +
        '<div class="image-upload-area" id="imgUploadArea">' +
          imgPreview +
          '<div id="imgUploadHint">クリックまたはドラッグで画像をアップロード<br><span class="text-sm text-muted">JPEG / PNG（最大5MB）</span></div>' +
        '</div>' +
        '<input type="file" id="imgFileInput" accept="image/*" style="display:none;">' +
        (p && p.imageData ? '<button class="btn btn-outline btn-sm mt-8" id="btnClearImg">画像を削除</button>' : '') +
      '</div>' +

      '<div class="form-group">' +
        '<label class="form-label">商品名<span class="required">*</span></label>' +
        '<input class="form-input" id="fName" value="' + Utils.esc(p ? p.name : '') + '" placeholder="例：ペタルチェーン 40cm ゴールド">' +
      '</div>' +

      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label class="form-label">カラー</label>' +
          '<input class="form-input" id="fColor" value="' + Utils.esc(p ? p.color : '') + '" placeholder="例：ゴールド">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">サイズ</label>' +
          '<input class="form-input" id="fSize" value="' + Utils.esc(p ? p.size : '') + '" placeholder="例：40cm">' +
        '</div>' +
      '</div>' +

      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label class="form-label">Amazon SKU</label>' +
          '<input class="form-input" id="fAmazonSku" value="' + Utils.esc(p ? p.amazonSku : '') + '" placeholder="例：CHAIN-40-GLD">' +
          '<div class="form-hint">CSV照合に使用</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">セラーノート管理番号</label>' +
          '<input class="form-input" id="fMgmtNo" value="' + Utils.esc(p ? p.sellernoteMgmtNo : '') + '" placeholder="例：SN-001">' +
          '<div class="form-hint">CSV照合に使用</div>' +
        '</div>' +
      '</div>' +

      '<div class="form-row-3">' +
        '<div class="form-group">' +
          '<label class="form-label">Amazon在庫</label>' +
          '<input class="form-input" id="fAInv" type="number" min="0" value="' + (p ? p.amazonInventory||0 : 0) + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">フリマ在庫</label>' +
          '<input class="form-input" id="fFInv" type="number" min="0" value="' + (p ? p.frimaInventory||0 : 0) + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">総在庫（自動）</label>' +
          '<input class="form-input" id="fTInv" type="number" readonly style="background:var(--bg);" value="' + (p ? p.totalInventory||0 : 0) + '">' +
        '</div>' +
      '</div>' +

      '<div class="form-group">' +
        '<label class="form-label">メモ</label>' +
        '<textarea class="form-textarea" id="fMemo" placeholder="仕入れ先・特記事項など">' + Utils.esc(p ? p.memo : '') + '</textarea>' +
      '</div>';

    var footer =
      '<button class="btn btn-outline" id="formCancel">キャンセル</button>' +
      '<button class="btn btn-primary" id="formSave">保存する</button>';

    Utils.showModal(title, body, footer);

    // Image state within modal
    var _imgData = p ? (p.imageData || null) : null;

    var area  = document.getElementById('imgUploadArea');
    var input = document.getElementById('imgFileInput');
    var hint  = document.getElementById('imgUploadHint');

    function setPreview(dataUrl) {
      _imgData = dataUrl;
      var preview = document.getElementById('imgPreview');
      if (preview) {
        preview.outerHTML = '<img id="imgPreview" class="image-preview" src="' + dataUrl + '" alt="プレビュー">';
      }
      if (hint) hint.textContent = '画像をクリックで変更';
    }

    area.addEventListener('click', function() { input.click(); });
    area.addEventListener('dragover', function(e) { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', function() { area.classList.remove('drag-over'); });
    area.addEventListener('drop', function(e) {
      e.preventDefault();
      area.classList.remove('drag-over');
      var f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) {
        Utils.resizeImage(f, 300, 300, setPreview);
      }
    });
    input.addEventListener('change', function() {
      var f = this.files[0];
      if (f) Utils.resizeImage(f, 300, 300, setPreview);
    });

    var clearBtn = document.getElementById('btnClearImg');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        _imgData = null;
        var preview = document.getElementById('imgPreview');
        if (preview) { preview.outerHTML = '<span id="imgPreview"></span>'; }
        if (hint) hint.textContent = 'クリックまたはドラッグで画像をアップロード';
      });
    }

    // Auto-calc total
    function updateTotal() {
      var a = parseInt(document.getElementById('fAInv').value) || 0;
      var f = parseInt(document.getElementById('fFInv').value) || 0;
      document.getElementById('fTInv').value = a + f;
    }
    document.getElementById('fAInv').addEventListener('input', updateTotal);
    document.getElementById('fFInv').addEventListener('input', updateTotal);

    document.getElementById('formCancel').addEventListener('click', Utils.hideModal);

    document.getElementById('formSave').addEventListener('click', function() {
      var name = document.getElementById('fName').value.trim();
      if (!name) { Utils.toast('商品名を入力してください', 'error'); return; }

      var aInv = parseInt(document.getElementById('fAInv').value) || 0;
      var fInv = parseInt(document.getElementById('fFInv').value) || 0;

      var data = {
        name:               name,
        color:              document.getElementById('fColor').value.trim(),
        size:               document.getElementById('fSize').value.trim(),
        amazonSku:          document.getElementById('fAmazonSku').value.trim(),
        sellernoteMgmtNo:   document.getElementById('fMgmtNo').value.trim(),
        amazonInventory:    aInv,
        frimaInventory:     fInv,
        totalInventory:     aInv + fInv,
        memo:               document.getElementById('fMemo').value.trim(),
        imageData:          _imgData
      };

      if (p) {
        // Record history if inventory changed
        if (p.amazonInventory !== aInv) {
          Storage.addInvHistory({ id: Utils.generateId(), productId: p.id, type: 'amazon',
            prev: p.amazonInventory, next: aInv, change: aInv - p.amazonInventory,
            reason: '手動編集', timestamp: new Date().toISOString() });
        }
        if (p.frimaInventory !== fInv) {
          Storage.addInvHistory({ id: Utils.generateId(), productId: p.id, type: 'frima',
            prev: p.frimaInventory, next: fInv, change: fInv - p.frimaInventory,
            reason: '手動編集', timestamp: new Date().toISOString() });
        }
        Storage.updateProduct(p.id, data);
        Utils.toast('商品を更新しました', 'success');
      } else {
        data.id = Utils.generateId();
        data.createdAt = new Date().toISOString();
        data.updatedAt = data.createdAt;
        Storage.addProduct(data);
        Utils.toast('商品を追加しました', 'success');
      }

      Utils.hideModal();
      render(_container);
    });
  }

  return { render: render, openFormWithSku: function(sku, mgmtNo) {
    openForm(null);
    setTimeout(function() {
      if (sku   && document.getElementById('fAmazonSku')) document.getElementById('fAmazonSku').value = sku;
      if (mgmtNo && document.getElementById('fMgmtNo'))   document.getElementById('fMgmtNo').value   = mgmtNo;
    }, 50);
  }};
})();
