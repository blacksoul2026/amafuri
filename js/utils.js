/* ===== Utilities ===== */
var Utils = (function() {

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function formatNum(n) {
    if (n === null || n === undefined || n === '') return '0';
    return Number(n).toLocaleString('ja-JP');
  }

  function formatDate(str) {
    if (!str) return '-';
    var d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' });
  }

  function formatDateTime(str) {
    if (!str) return '-';
    var d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  // Simple fast hash (djb2 variant)
  function hashString(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(36);
  }

  // Parse CSV (handles quotes, comma/tab, BOM, \r\n)
  function parseCSV(text) {
    // Remove UTF-8 BOM
    text = text.replace(/^﻿/, '');
    if (!text.trim()) return { headers: [], data: [] };

    // Auto-detect delimiter from first line
    var firstLine = text.split(/\r?\n/)[0];
    var tabCount   = (firstLine.match(/\t/g)   || []).length;
    var commaCount = (firstLine.match(/,/g)     || []).length;
    var delim = tabCount > commaCount ? '\t' : ',';

    var rows = [];
    var row  = [];
    var cell = '';
    var inQ  = false;

    for (var i = 0; i < text.length; i++) {
      var c  = text[i];
      var n  = text[i + 1];

      if (c === '"') {
        if (inQ && n === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (c === delim && !inQ) {
        row.push(cell); cell = '';
      } else if ((c === '\n' || c === '\r') && !inQ) {
        if (c === '\r' && n === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function(v){ return v !== ''; })) rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }
    row.push(cell);
    if (row.some(function(v){ return v !== ''; })) rows.push(row);

    if (rows.length === 0) return { headers: [], data: [] };
    var headers = rows[0].map(function(h){ return h.trim(); });
    var data = rows.slice(1).map(function(r) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = (r[idx] || '').trim(); });
      return obj;
    });
    return { headers: headers, data: data };
  }

  // Date range for period filter
  function getDateRange(period) {
    var now = new Date();
    var start;
    switch (period) {
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case '30days':
        start = new Date(now.getTime() - 30 * 86400000);
        break;
      case '90days':
        start = new Date(now.getTime() - 90 * 86400000);
        break;
      default:
        start = new Date(0);
    }
    return { start: start, end: now };
  }

  function isInRange(dateStr, range) {
    if (!dateStr) return true;
    var d = new Date(dateStr);
    return d >= range.start && d <= range.end;
  }

  // Escape HTML
  function esc(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Thumbnail via canvas (resize to max 200x200)
  function resizeImage(file, maxW, maxH, cb) {
    maxW = maxW || 200; maxH = maxH || 200;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        if (h > maxH) { w = w * maxH / h; h = maxH; }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w); canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Inventory color class
  function invClass(val, settings) {
    val = Number(val) || 0;
    settings = settings || Storage.getSettings();
    if (val <= settings.invDangerThreshold)  return 'inv-danger';
    if (val <= settings.invWarningThreshold) return 'inv-warning';
    if (val > 0) return 'inv-ok';
    return '';
  }

  // Build a placeholder "no image" element
  function noImg(w, h) {
    w = w || 52; h = h || 52;
    return '<div class="no-image" style="width:' + w + 'px;height:' + h + 'px;font-size:11px;">画像なし</div>';
  }

  // Toast
  function toast(msg, type) {
    type = type || 'success';
    var c = document.getElementById('toastContainer');
    if (!c) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function(){ el.classList.add('show'); }, 10);
    setTimeout(function(){
      el.classList.remove('show');
      setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 3200);
  }

  // Modal
  function showModal(title, bodyHTML, footerHTML) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML  = bodyHTML || '';
    document.getElementById('modalFooter').innerHTML = footerHTML || '';
    document.getElementById('modal').classList.remove('hidden');
  }
  function hideModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  // Confirm dialog (modal)
  function confirm(msg, onYes, onNo) {
    showModal('確認',
      '<p style="font-size:0.95rem;line-height:1.7;">' + esc(msg) + '</p>',
      '<button class="btn btn-outline" id="confirmNo">キャンセル</button>' +
      '<button class="btn btn-danger" id="confirmYes">削除する</button>'
    );
    document.getElementById('confirmYes').addEventListener('click', function(){
      hideModal();
      if (onYes) onYes();
    });
    document.getElementById('confirmNo').addEventListener('click', function(){
      hideModal();
      if (onNo) onNo();
    });
  }

  // Format month key: "2024-03" from date
  function monthKey(dateStr) {
    var d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d)) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // Period label
  function periodLabel(period) {
    var map = { thisMonth: '今月', '30days': '直近30日', '90days': '直近3か月', all: '全期間' };
    return map[period] || period;
  }

  return {
    generateId, formatNum, formatDate, formatDateTime,
    hashString, parseCSV, getDateRange, isInRange,
    esc, resizeImage, invClass, noImg,
    toast, showModal, hideModal, confirm,
    monthKey, periodLabel
  };
})();
