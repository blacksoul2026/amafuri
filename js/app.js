/* ===== App / Router ===== */
var App = (function() {

  var _currentPage = '';
  var _prevPage    = '';
  var _prevParams  = {};

  var PAGES = {
    overview:   { module: PageOverview,   label: '一覧' },
    master:     { module: PageMaster,     label: '商品マスター' },
    inventory:  { module: PageInventory,  label: '在庫入力' },
    'csv-import': { module: PageCsvImport, label: 'CSV読込' },
    detail:     { module: PageDetail,     label: '商品詳細' },
    settings:   { module: PageSettings,   label: '設定' }
  };

  function navigate(page, params) {
    var def = PAGES[page];
    if (!def) { navigate('overview'); return; }

    if (_currentPage && _currentPage !== page) {
      _prevPage   = _currentPage;
      _prevParams = {};
    }
    _currentPage = page;

    // Update desktop nav active state
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Update bottom tab bar active state
    document.querySelectorAll('.tab-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Back button: visible on all pages except overview
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
      if (page !== 'overview') backBtn.classList.remove('hidden');
      else                     backBtn.classList.add('hidden');
    }

    // Close mobile menu
    var menu = document.getElementById('navMenu');
    if (menu) menu.classList.remove('open');

    // Render page
    var content = document.getElementById('pageContent');
    content.innerHTML = '';
    def.module.render(content, params || {});

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function init() {
    // Desktop nav click
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.addEventListener('click', function() {
        navigateWithHash(this.dataset.page);
      });
    });

    // Bottom tab bar click
    document.querySelectorAll('.tab-item').forEach(function(el) {
      el.addEventListener('click', function() {
        navigateWithHash(this.dataset.page);
      });
    });

    // Back button
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        navigateWithHash(_prevPage || 'overview');
      });
    }

    // Mobile toggle
    var toggle = document.getElementById('navToggle');
    var menu   = document.getElementById('navMenu');
    if (toggle && menu) {
      toggle.addEventListener('click', function() {
        menu.classList.toggle('open');
      });
    }

    // Modal close
    var modalClose = document.getElementById('modalClose');
    if (modalClose) modalClose.addEventListener('click', Utils.hideModal);

    var modalOverlay = document.getElementById('modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) Utils.hideModal();
      });
    }

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') Utils.hideModal();
    });

    // Hash routing (simple)
    function routeFromHash() {
      var hash = window.location.hash.replace('#', '');
      if (!hash) { navigate('overview'); return; }
      var parts  = hash.split('?');
      var page   = parts[0];
      var params = {};
      if (parts[1]) {
        parts[1].split('&').forEach(function(kv) {
          var pair = kv.split('=');
          params[pair[0]] = decodeURIComponent(pair[1] || '');
        });
      }
      navigate(page, params);
    }

    window.addEventListener('hashchange', function() {
      if (_suppressHash) { _suppressHash = false; return; }
      routeFromHash();
    });
    routeFromHash();
  }

  // Navigate + update URL hash for bookmarking/reload
  var _suppressHash = false;
  function navigateWithHash(page, params) {
    // Render immediately
    navigate(page, params);
    // Sync URL without triggering duplicate hashchange
    var hash = '#' + page;
    if (params && Object.keys(params).length) {
      hash += '?' + Object.keys(params).map(function(k){ return k + '=' + encodeURIComponent(params[k]); }).join('&');
    }
    if (window.location.hash !== hash) {
      _suppressHash = true;
      window.location.hash = hash;
    }
  }

  // Also patch PageMaster to handle edit by ID
  var _origMasterOpenForm = PageMaster.openFormWithSku;
  PageMaster.openFormWithSku = function(sku, mgmtNo, productId) {
    if (productId) {
      // Trigger edit by product ID
      setTimeout(function() {
        var btn = document.querySelector('.btn-edit-product[data-id="' + productId + '"]');
        if (btn) btn.click();
      }, 50);
      return;
    }
    _origMasterOpenForm(sku, mgmtNo);
  };

  return {
    navigate: navigateWithHash,
    init: init,
    currentPage: function() { return _currentPage; }
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', function() {
  App.init();
  // Auto-pull from cloud if token is set and cloud data is newer
  setTimeout(function() { Sync.autoSync(); }, 500);
});
