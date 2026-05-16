# デプロイ手順

## 概要

- **フロントエンド**: Cloudflare Pages（静的ホスティング）
- **バックエンド**: Cloudflare Worker（データ同期API）
- **ストレージ**: Cloudflare KV（JSONデータ1つ）

---

## 手順1: Cloudflare アカウント準備

1. https://dash.cloudflare.com にログイン
2. 右上のアカウントID（後で使う）をメモしておく

---

## 手順2: KV ネームスペース作成

ターミナルで `worker/` フォルダに移動して実行:

```bash
cd worker
npx wrangler login          # ブラウザでCloudflareにログイン
npx wrangler kv namespace create amafuri-data
```

出力例:
```
✅ Successfully created namespace amafuri-data
id = "abc123def456..."
```

`wrangler.toml` の `id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"` を出力された id に書き換える:

```toml
[[kv_namespaces]]
binding = "DATA"
id = "abc123def456..."   ← ここを書き換え
```

---

## 手順3: API トークン設定

ランダムなパスワードを作る（英数字30文字程度）:

```bash
# Mac/Linux
openssl rand -base64 24

# Windows PowerShell
[System.Web.Security.Membership]::GeneratePassword(30, 0)
# または手入力でもOK: 例 "mySuperSecret123Token456"
```

Workerにシークレットとして設定:

```bash
cd worker
npx wrangler secret put API_TOKEN
# プロンプトが出るので上で作ったトークンを貼り付けてEnter
```

このトークンは後でアプリの設定画面に入力する。

---

## 手順4: Worker をデプロイ

```bash
cd worker
npx wrangler deploy
```

出力例:
```
✅ Deployed amafuri-worker to https://amafuri-worker.xxx.workers.dev
```

この URL をメモしておく（設定画面で使う）。

---

## 手順5: Cloudflare Pages にデプロイ

### 方法A: GitHub経由（推奨）

1. このリポジトリを GitHub にプッシュ
2. Cloudflare Dashboard → Pages → "Create a project"
3. GitHubと連携 → リポジトリを選択
4. Build settings:
   - **Framework preset**: None
   - **Build command**: （空欄）
   - **Build output directory**: `/`（ルート）
5. "Save and Deploy" をクリック

デプロイ後、`xxxxx.pages.dev` のURLが割り当てられる。

### 方法B: ドラッグ＆ドロップ

1. Cloudflare Dashboard → Pages → "Create a project" → "Direct upload"
2. プロジェクト名を入力（例: `amafuri`）
3. フォルダを丸ごとアップロード（`worker/` フォルダは不要）

---

## 手順6: アプリ設定

ブラウザ（またはiPhone）でデプロイしたURLを開く:

1. 下タブ「設定」→ 一番下「☁️ クラウド同期（Cloudflare）」
2. **Worker URL**: 手順4でメモしたURL（例: `https://amafuri-worker.xxx.workers.dev`）
3. **APIトークン**: 手順3で作ったトークン
4. 「保存」→ 「テスト」で「✓ 接続成功」と出ればOK

---

## 手順7: iPhoneにインストール

1. SafariでPages URLを開く
2. 共有ボタン → 「ホーム画面に追加」
3. 「追加」でアイコンが作られる

---

## 動作確認

- データを編集 → 4秒後にヘッダーの ☁️ マークが出れば自動保存OK
- 別のデバイスでアプリを開く → 「設定」で同じURL・トークンを入力して保存
- 「↓ 今すぐ取得」でデータが同期される
- 以降はアプリ起動時に自動でクラウドの最新データを取得する

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| テスト失敗「接続失敗」 | URL/トークン間違い | 手順3〜4を確認 |
| ⚠️ マークが出る | Worker未デプロイ or オフライン | `wrangler deploy` を再実行 |
| iPhoneでキャッシュが古い | PWAキャッシュ | Safariで長押し→「再読み込み」、またはホーム画面から削除して再追加 |
