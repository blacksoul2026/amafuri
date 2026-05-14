/* ===== Storage Layer ===== */
var Storage = (function() {
  var KEYS = {
    PRODUCTS:  'amafuri_products',
    SALES:     'amafuri_sales',
    IMPORTS:   'amafuri_csv_imports',
    INV_HIST:  'amafuri_inv_history',
    COL_MAP:   'amafuri_col_mappings',
    SETTINGS:  'amafuri_settings'
  };

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch(e) { return fallback; }
  }
  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('amafuri_last_modified', new Date().toISOString());
      if (typeof Sync !== 'undefined' && Sync.scheduleAutoPush) Sync.scheduleAutoPush();
      return true;
    } catch(e) { console.error('Storage error:', e); return false; }
  }

  // ---- Products ----
  function getProducts() { return load(KEYS.PRODUCTS, []); }
  function saveProducts(list) { save(KEYS.PRODUCTS, list); }

  function addProduct(p) {
    var list = getProducts();
    list.push(p);
    saveProducts(list);
    return p;
  }
  function updateProduct(id, changes) {
    var list = getProducts();
    var i = list.findIndex(function(p){ return p.id === id; });
    if (i < 0) return null;
    list[i] = Object.assign({}, list[i], changes, { updatedAt: new Date().toISOString() });
    list[i].totalInventory = (list[i].amazonInventory || 0) + (list[i].frimaInventory || 0);
    saveProducts(list);
    return list[i];
  }
  function deleteProduct(id) {
    saveProducts(getProducts().filter(function(p){ return p.id !== id; }));
    saveSales(getSales().filter(function(s){ return s.productId !== id; }));
    saveInvHistory(getInvHistory().filter(function(h){ return h.productId !== id; }));
  }
  function getProductById(id) {
    return getProducts().find(function(p){ return p.id === id; }) || null;
  }

  // ---- Sales ----
  function getSales() { return load(KEYS.SALES, []); }
  function saveSales(list) { save(KEYS.SALES, list); }
  function addSalesBatch(rows) {
    var list = getSales();
    rows.forEach(function(r){ list.push(r); });
    saveSales(list);
  }
  function removeSalesByImportId(importId) {
    saveSales(getSales().filter(function(s){ return s.importId !== importId; }));
  }

  // ---- CSV Imports ----
  function getImports() { return load(KEYS.IMPORTS, []); }
  function saveImports(list) { save(KEYS.IMPORTS, list); }
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

  // ---- Inventory History ----
  function getInvHistory() { return load(KEYS.INV_HIST, []); }
  function saveInvHistory(list) { save(KEYS.INV_HIST, list); }
  function addInvHistory(entry) {
    var list = getInvHistory();
    list.push(entry);
    saveInvHistory(list);
  }

  // ---- Column Mappings ----
  function getColMappings() { return load(KEYS.COL_MAP, {}); }
  function saveColMappings(obj) { save(KEYS.COL_MAP, obj); }
  function getColMapping(type) { return getColMappings()[type] || {}; }
  function setColMapping(type, mapping) {
    var all = getColMappings();
    all[type] = mapping;
    saveColMappings(all);
  }

  // ---- Settings ----
  function getSettings() {
    return Object.assign({
      invDangerThreshold:  3,
      invWarningThreshold: 10,
      defaultPeriod: 'all',
      defaultSort:   'totalSales'
    }, load(KEYS.SETTINGS, {}));
  }
  function saveSettings(obj) { save(KEYS.SETTINGS, obj); }

  // ---- Helpers ----
  function recalcTotal(product) {
    product.totalInventory = (product.amazonInventory || 0) + (product.frimaInventory || 0);
    return product;
  }

  // ---- Export / Import all data ----
  function exportAll() {
    return JSON.stringify({
      products:   getProducts(),
      sales:      getSales(),
      imports:    getImports(),
      invHistory: getInvHistory(),
      colMappings: getColMappings(),
      settings:   getSettings(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
  function importAll(jsonStr) {
    var d = JSON.parse(jsonStr);
    if (d.products)    saveProducts(d.products);
    if (d.sales)       saveSales(d.sales);
    if (d.imports)     saveImports(d.imports);
    if (d.invHistory)  saveInvHistory(d.invHistory);
    if (d.colMappings) saveColMappings(d.colMappings);
    if (d.settings)    saveSettings(d.settings);
  }
  function clearAll() {
    Object.values(KEYS).forEach(function(k){ localStorage.removeItem(k); });
  }

  return {
    getProducts, saveProducts, addProduct, updateProduct, deleteProduct, getProductById,
    getSales, saveSales, addSalesBatch, removeSalesByImportId,
    getImports, saveImports, addImport, deleteImport, findImportByHash,
    getInvHistory, addInvHistory,
    getColMapping, setColMapping,
    getSettings, saveSettings,
    recalcTotal, exportAll, importAll, clearAll
  };
})();
