/* ===== GitHub Gist Sync ===== */
var Sync = (function() {

  var TOKEN_KEY  = 'amafuri_gh_token';
  var GIST_KEY   = 'amafuri_gist_id';
  var GIST_FILE  = 'amafuri_data.json';
  var GIST_DESC  = 'アマフリ比較表データ（自動生成・削除しないでください）';
  var API_BASE   = 'https://api.github.com';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t.trim()); }
  function getGistId() { return localStorage.getItem(GIST_KEY) || ''; }
  function setGistId(id) { localStorage.setItem(GIST_KEY, id); }

  function headers() {
    return {
      'Authorization': 'token ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  // Find existing gist by description
  function findGist() {
    return fetch(API_BASE + '/gists', { headers: headers() })
      .then(function(r) {
        if (!r.ok) throw new Error('GitHub APIエラー（ステータス ' + r.status + '）\nトークンを確認してください');
        return r.json();
      })
      .then(function(list) {
        return list.find(function(g) { return g.description === GIST_DESC; }) || null;
      });
  }

  // Push local data → Gist
  function push() {
    if (!getToken()) return Promise.reject(new Error('GitHubトークンが設定されていません'));
    var data = Storage.exportAll();

    return findGist().then(function(gist) {
      if (gist) {
        // Update existing gist
        return fetch(API_BASE + '/gists/' + gist.id, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({ files: { [GIST_FILE]: { content: data } } })
        }).then(function(r) {
          if (!r.ok) throw new Error('Gist更新失敗（' + r.status + '）');
          setGistId(gist.id);
          return r.json();
        });
      } else {
        // Create new gist
        return fetch(API_BASE + '/gists', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            description: GIST_DESC,
            public: false,
            files: { [GIST_FILE]: { content: data } }
          })
        }).then(function(r) {
          if (!r.ok) throw new Error('Gist作成失敗（' + r.status + '）');
          return r.json();
        }).then(function(g) {
          setGistId(g.id);
          return g;
        });
      }
    });
  }

  // Pull Gist → local data
  function pull() {
    if (!getToken()) return Promise.reject(new Error('GitHubトークンが設定されていません'));

    return findGist().then(function(gist) {
      if (!gist) throw new Error('クラウドにデータがありません。\n先にPCから「クラウドに保存」してください');
      setGistId(gist.id);
      // Fetch full gist content (list endpoint may truncate)
      return fetch(API_BASE + '/gists/' + gist.id, { headers: headers() });
    }).then(function(r) {
      if (!r.ok) throw new Error('Gist取得失敗（' + r.status + '）');
      return r.json();
    }).then(function(g) {
      var file = g.files[GIST_FILE];
      if (!file || !file.content) throw new Error('データファイルが見つかりません');
      Storage.importAll(file.content);
    });
  }

  // Get last pushed time from gist metadata
  function getLastSynced() {
    var id = getGistId();
    if (!id || !getToken()) return Promise.resolve(null);
    return fetch(API_BASE + '/gists/' + id, { headers: headers() })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(g) { return g ? g.updated_at : null; })
      .catch(function() { return null; });
  }

  function hasToken() { return !!getToken(); }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_KEY);
  }

  // Debounced auto-push after data changes
  var _pushTimer = null;
  function scheduleAutoPush() {
    if (!getToken()) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function() {
      _pushTimer = null;
      push().catch(function(e) { console.warn('Auto-push failed:', e.message); });
    }, 4000);
  }

  // Auto-pull on app open if cloud data is newer than local
  function autoSync() {
    if (!getToken()) return;
    var localMod = localStorage.getItem('amafuri_last_modified') || '';
    findGist().then(function(gist) {
      if (!gist) return;
      setGistId(gist.id);
      var cloudTime = gist.updated_at || '';
      if (!localMod || cloudTime > localMod) {
        return fetch(API_BASE + '/gists/' + gist.id, { headers: headers() })
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(g) {
            if (!g) return;
            var file = g.files[GIST_FILE];
            if (!file || !file.content) return;
            Storage.importAll(file.content);
            localStorage.setItem('amafuri_last_modified', cloudTime);
            Utils.toast('クラウドからデータを同期しました', 'success');
            if (typeof App !== 'undefined') App.navigate(App.currentPage() || 'overview');
          });
      }
    }).catch(function(e) { console.warn('Auto-sync failed:', e.message); });
  }

  return { push, pull, getLastSynced, hasToken, setToken, getToken, clearToken, scheduleAutoPush, autoSync };
})();
