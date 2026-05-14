/* ===== Settings Page ===== */
var PageSettings = (function() {

  var _container = null;

  function render(container) {
    _container = container;
    var s = Storage.getSettings();
    var products = Storage.getProducts();
    var sales    = Storage.getSales();
    var imports  = Storage.getImports();
    var hist     = Storage.getInvHistory();

    container.innerHTML =
      '<div class="page-header">' +
        '<div class="page-title">設定</div>' +
      '</div>' +

      // Cloud sync
      renderSyncCard() +

      // Inventory thresholds
      '<div class="card mb-16">' +
        '<div class="card-header"><div class="card-title">在庫アラート閾値</div></div>' +
        '<div class="card-body">' +
          '<div class="alert alert-info mb-12">' +
            '在庫数がこの値以下になった場合に色分け表示されます。' +
          '</div>' +
          '<div class="settings-section">' +
            '<div class="settings-row">' +
              '<label>🔴 危険（赤表示）：在庫が <strong>X個以下</strong></label>' +
              '<input class="form-input" id="dangerThresh" type="number" min="0" max="100" value="' + s.invDangerThreshold + '">' +
              '<span class="text-sm text-muted">個以下</span>' +
            '</div>' +
            '<div class="settings-row">' +
              '<label>🟡 注意（黄表示）：在庫が <strong>X個以下</strong></label>' +
              '<input class="form-input" id="warningThresh" type="number" min="0" max="999" value="' + s.invWarningThreshold + '">' +
              '<span class="text-sm text-muted">個以下</span>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-primary mt-12" id="btnSaveSettings">設定を保存</button>' +
        '</div>' +
      '</div>' +

      // Data stats
      '<div class="card mb-16">' +
        '<div class="card-header"><div class="card-title">データ統計</div></div>' +
        '<div class="card-body">' +
          '<div class="stats-grid">' +
            '<div class="stat-card"><div class="stat-label">登録商品数</div><div class="stat-value">' + products.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">販売レコード数</div><div class="stat-value">' + sales.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">CSV読込回数</div><div class="stat-value">' + imports.length + '</div></div>' +
            '<div class="stat-card"><div class="stat-label">在庫履歴件数</div><div class="stat-value">' + hist.length + '</div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Backup / Restore
      '<div class="card mb-16">' +
        '<div class="card-header"><div class="card-title">バックアップ / 復元</div></div>' +
        '<div class="card-body">' +
          '<div class="alert alert-info mb-12">' +
            'すべてのデータをJSONファイルに保存・復元できます。定期的にバックアップすることをおすすめします。' +
          '</div>' +
          '<div class="d-flex gap-8 flex-wrap">' +
            '<button class="btn btn-primary" id="btnExport">💾 バックアップ（ダウンロード）</button>' +
            '<button class="btn btn-outline" id="btnImport">📂 バックアップから復元</button>' +
          '</div>' +
          '<input type="file" id="restoreFileInput" accept=".json" style="display:none;">' +
        '</div>' +
      '</div>' +

      // Danger zone
      '<div class="card">' +
        '<div class="card-header"><div class="card-title" style="color:var(--danger);">⚠ データ削除</div></div>' +
        '<div class="card-body">' +
          '<div class="settings-section">' +
            '<div class="settings-row">' +
              '<label>販売データ（CSVから読み込んだ販売数）をすべて削除</label>' +
              '<button class="btn btn-danger btn-sm" id="btnClearSales">販売データを削除</button>' +
            '</div>' +
            '<div class="settings-row">' +
              '<label>CSV読込履歴をすべて削除</label>' +
              '<button class="btn btn-danger btn-sm" id="btnClearImports">履歴を削除</button>' +
            '</div>' +
            '<div class="settings-row">' +
              '<label>在庫変更履歴をすべて削除</label>' +
              '<button class="btn btn-danger btn-sm" id="btnClearInvHist">在庫履歴を削除</button>' +
            '</div>' +
            '<div class="settings-row" style="border-top:2px solid var(--danger);padding-top:16px;">' +
              '<label><strong>すべてのデータを削除（初期化）</strong></label>' +
              '<button class="btn btn-danger" id="btnClearAll">⚠ 全データを削除</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindEvents(container);
  }

  function renderSyncCard() {
    var hasToken = Sync.hasToken();
    var tokenMask = hasToken
      ? '設定済み <span class="badge badge-success">✓</span>'
      : '<span class="badge badge-danger">未設定</span>';

    return '<div class="card mb-16">' +
      '<div class="card-header"><div class="card-title">☁️ クラウド同期（GitHub Gist）</div></div>' +
      '<div class="card-body">' +
        '<div class="alert alert-info mb-12">' +
          'PCとiPhoneで同じデータを使えます。ボタン1つで同期します。' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="form-label">GitHub Personal Access Token</label>' +
          '<div class="d-flex gap-8 align-center flex-wrap">' +
            '<input class="form-input" id="syncToken" type="password" placeholder="ghp_xxxxxxxxxxxx" ' +
              'value="' + (hasToken ? Sync.getToken() : '') + '" style="max-width:320px;font-family:monospace;">' +
            '<span id="tokenStatus">' + tokenMask + '</span>' +
          '</div>' +
          '<div class="form-hint">GitHub → Settings → Developer settings → Personal access tokens → <strong>gist</strong> スコープのみ必要</div>' +
          '<button class="btn btn-outline btn-sm mt-8" id="btnSaveToken">トークンを保存</button>' +
          (hasToken ? ' <button class="btn btn-outline btn-sm mt-8" id="btnClearToken" style="color:var(--danger)">トークンを削除</button>' : '') +
        '</div>' +

        '<div class="divider"></div>' +

        '<div class="d-flex gap-8 flex-wrap align-center">' +
          '<button class="btn btn-primary" id="btnPush" ' + (!hasToken ? 'disabled' : '') + '>☁️ クラウドに保存（PC→クラウド）</button>' +
          '<button class="btn btn-outline" id="btnPull" ' + (!hasToken ? 'disabled' : '') + '>📲 クラウドから読込（クラウド→端末）</button>' +
        '</div>' +
        '<div id="syncStatus" class="text-sm text-muted mt-8"></div>' +
      '</div>' +
    '</div>';
  }

  function bindSyncEvents(container) {
    var tokenInput = container.querySelector('#syncToken');
    var btnSave    = container.querySelector('#btnSaveToken');
    var btnClear   = container.querySelector('#btnClearToken');
    var btnPush    = container.querySelector('#btnPush');
    var btnPull    = container.querySelector('#btnPull');
    var statusEl   = container.querySelector('#syncStatus');

    if (btnSave) {
      btnSave.addEventListener('click', function() {
        var val = tokenInput ? tokenInput.value.trim() : '';
        if (!val) { Utils.toast('トークンを入力してください', 'error'); return; }
        Sync.setToken(val);
        Utils.toast('トークンを保存しました', 'success');
        render(container);
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', function() {
        Utils.confirm('トークンを削除します。同期できなくなります。', function() {
          Sync.clearToken();
          Utils.toast('トークンを削除しました');
          render(container);
        });
      });
    }

    if (btnPush) {
      btnPush.addEventListener('click', function() {
        btnPush.disabled = true;
        btnPush.textContent = '保存中…';
        if (statusEl) statusEl.textContent = '';
        Sync.push()
          .then(function() {
            Utils.toast('クラウドに保存しました ✓', 'success');
            return Sync.getLastSynced();
          })
          .then(function(t) {
            if (statusEl && t) statusEl.textContent = '最終同期: ' + Utils.formatDateTime(t);
          })
          .catch(function(e) {
            Utils.toast(e.message, 'error');
          })
          .finally(function() {
            btnPush.disabled = false;
            btnPush.textContent = '☁️ クラウドに保存（PC→クラウド）';
          });
      });
    }

    if (btnPull) {
      btnPull.addEventListener('click', function() {
        Utils.confirm(
          'クラウドのデータで端末のデータを上書きします。\n現在の端末データは消えます。続けますか？',
          function() {
            btnPull.disabled = true;
            btnPull.textContent = '読込中…';
            if (statusEl) statusEl.textContent = '';
            Sync.pull()
              .then(function() {
                Utils.toast('クラウドから読み込みました ✓', 'success');
                render(container);
              })
              .catch(function(e) {
                Utils.toast(e.message, 'error');
              })
              .finally(function() {
                if (btnPull) {
                  btnPull.disabled = false;
                  btnPull.textContent = '📲 クラウドから読込（クラウド→端末）';
                }
              });
          }
        );
      });
    }
  }

  function bindEvents(container) {
    // Save settings
    container.querySelector('#btnSaveSettings').addEventListener('click', function() {
      var danger  = parseInt(container.querySelector('#dangerThresh').value)  || 0;
      var warning = parseInt(container.querySelector('#warningThresh').value) || 0;
      if (danger >= warning) {
        Utils.toast('危険閾値は注意閾値より小さい値にしてください', 'error');
        return;
      }
      var s = Storage.getSettings();
      s.invDangerThreshold  = danger;
      s.invWarningThreshold = warning;
      Storage.saveSettings(s);
      Utils.toast('設定を保存しました', 'success');
    });

    // Export
    container.querySelector('#btnExport').addEventListener('click', function() {
      var json = Storage.exportAll();
      var blob = new Blob([json], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      var d    = new Date();
      a.download = 'amafuri_backup_' +
        d.getFullYear() +
        String(d.getMonth()+1).padStart(2,'0') +
        String(d.getDate()).padStart(2,'0') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Utils.toast('バックアップをダウンロードしました', 'success');
    });

    // Import
    var restoreInput = container.querySelector('#restoreFileInput');
    container.querySelector('#btnImport').addEventListener('click', function() {
      restoreInput.click();
    });
    restoreInput.addEventListener('change', function() {
      var f = this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        Utils.confirm(
          'バックアップから復元します。\n現在のすべてのデータが上書きされます。\n本当に実行しますか？',
          function() {
            try {
              Storage.importAll(e.target.result);
              Utils.toast('復元しました', 'success');
              render(_container);
            } catch(err) {
              Utils.toast('復元に失敗しました：' + err.message, 'error');
            }
          }
        );
      };
      reader.readAsText(f, 'UTF-8');
      this.value = '';
    });

    // Clear sales
    container.querySelector('#btnClearSales').addEventListener('click', function() {
      Utils.confirm('販売データ（CSVから読み込んだ販売数）をすべて削除します。\n在庫数は変更されません。', function() {
        Storage.saveSales([]);
        Utils.toast('販売データを削除しました', 'success');
        render(_container);
      });
    });

    // Clear imports
    container.querySelector('#btnClearImports').addEventListener('click', function() {
      Utils.confirm('CSV読込履歴をすべて削除します。', function() {
        Storage.saveImports([]);
        Storage.saveSales([]);
        Utils.toast('読込履歴と販売データを削除しました', 'success');
        render(_container);
      });
    });

    // Clear inv history
    container.querySelector('#btnClearInvHist').addEventListener('click', function() {
      Utils.confirm('在庫変更履歴をすべて削除します。', function() {
        Storage.saveInvHistory([]);
        Utils.toast('在庫変更履歴を削除しました', 'success');
        render(_container);
      });
    });

    // Clear all
    container.querySelector('#btnClearAll').addEventListener('click', function() {
      Utils.showModal(
        '⚠ 全データを削除',
        '<div class="alert alert-danger">' +
          '<strong>この操作は取り消せません。</strong><br>' +
          '商品マスター、在庫、販売データ、CSV履歴など、すべてのデータが削除されます。<br>' +
          '実行する場合は「削除する」と入力してください。' +
        '</div>' +
        '<input class="form-input mt-12" id="confirmText" placeholder="「削除する」と入力">',
        '<button class="btn btn-outline" id="clearCancel">キャンセル</button>' +
        '<button class="btn btn-danger" id="clearConfirm">全データを削除</button>'
      );
      document.getElementById('clearCancel').addEventListener('click', Utils.hideModal);
      document.getElementById('clearConfirm').addEventListener('click', function() {
        if (document.getElementById('confirmText').value !== '削除する') {
          Utils.toast('「削除する」と正確に入力してください', 'error');
          return;
        }
        Storage.clearAll();
        Utils.hideModal();
        Utils.toast('すべてのデータを削除しました');
        render(_container);
      });
    });

    // Sync events
    bindSyncEvents(container);
  }

  return { render: render };
})();
