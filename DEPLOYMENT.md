# 結（ゆい）レセプション - デプロイメントガイド

本番環境へのデプロイメント手順と運用ガイドです。

## デプロイメント前チェックリスト

### コード品質
- [ ] `npm run type-check` でエラーなし
- [ ] `npm run build` でエラーなし
- [ ] `npm run lint` でエラーなし
- [ ] 全ページで動作確認（ローカル）
- [ ] セキュリティチェック完了

### 環境設定
- [ ] `.env.local` に本番キーを設定
- [ ] `NEXT_PUBLIC_SUPABASE_URL` が本番 URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` が本番キー
- [ ] `SUPABASE_SERVICE_ROLE_KEY` が設定済み

### Supabase 本番準備
- [ ] プロジェクト作成済み（本番専用）
- [ ] データベーススキーマ実行済み
- [ ] 認証設定完了
- [ ] Realtime 有効化
- [ ] バックアップ設定確認

### ドメイン設定
- [ ] ドメイン取得完了（オプション）
- [ ] DNS 設定完了
- [ ] SSL 証明書設定確認

## デプロイ方法

### オプション 1: Vercel への自動デプロイ（推奨）

#### 事前準備
1. GitHub にリポジトリをプッシュ
2. Vercel アカウント作成（https://vercel.com）
3. GitHub と Vercel を連携

#### デプロイ手順
1. Vercel ダッシュボードで「New Project」
2. GitHub リポジトリを選択
3. 環境変数を設定:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://[project-id].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   SUPABASE_SERVICE_ROLE_KEY = eyJ...
   ```
4. 「Deploy」をクリック

#### 自動デプロイ設定
- main ブランチへの push で自動デプロイ
- GitHub > Settings > Deployments で確認

### オプション 2: Vercel CLI でのデプロイ

```bash
# Vercel CLI インストール
npm install -g vercel

# Vercel ログイン
vercel login

# 環境変数設定
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY

# デプロイ実行
vercel --prod
```

### オプション 3: Docker でのデプロイ

#### Dockerfile 作成
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY .next ./.next
COPY public ./public

EXPOSE 3000
CMD ["npm", "start"]
```

#### ビルド & 実行
```bash
# イメージビルド
docker build -t yui-reception .

# コンテナ実行
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  yui-reception
```

## 本番環境設定

### Vercel 設定

#### パフォーマンス最適化
```json
{
  "build": {
    "env": ["NEXT_PUBLIC_SUPABASE_URL"],
    "cache": ["node_modules/", ".next/cache"]
  },
  "serverlessFunctionMaxDuration": 30
}
```

#### セキュリティヘッダー設定
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' fonts.gstatic.com;"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Supabase 本番設定

#### データベースバックアップ
1. Supabase Dashboard > Database > Backups
2. 「Enable automatic backups」を有効化
3. バックアップスケジュール: 日次

#### ログとモニタリング
1. Supabase Dashboard > Logs
2. API Usage を監視
3. エラーログを定期確認

#### セキュリティ設定
1. Project Settings > Security
2. JWT Expiration: 3600 (1 時間)
3. JWT Secret: 強力な値を確認
4. Database Password: 定期変更推奨

### CORS 設定

Supabase Dashboard で本番ドメインを許可:

```sql
-- SQL Editor で実行
INSERT INTO cors_allowed_origins (origin)
VALUES ('https://yourdomain.com');
```

## デプロイ後の確認

### デプロイ完了チェック
- [ ] デプロイが成功（Vercel ダッシュボード確認）
- [ ] Vercel URL にアクセス可能
- [ ] カスタムドメインでアクセス可能（設定済みの場合）

### 機能確認
- [ ] ホームページが表示
- [ ] ログイン機能が動作
- [ ] 式典作成が可能
- [ ] 参列登録が可能
- [ ] QR スキャンが動作
- [ ] ダッシュボードが動作
- [ ] CSV エクスポートが動作

### パフォーマンス確認
```bash
# Lighthouse スコア確認
# Chrome DevTools > Lighthouse で各ページをテスト
# 目標: Performance 90+, Accessibility 90+, Best Practices 90+, SEO 90+
```

### セキュリティ確認
```bash
# SSL チェック
curl -I https://yourdomain.com
# HTTP/2 確認、HTTPS リダイレクト確認

# セキュリティヘッダー確認
curl -I https://yourdomain.com | grep -E "X-|Content-Security"
```

## 継続運用

### 日次タスク
- [ ] エラーログ確認（Supabase Logs）
- [ ] API 使用量確認
- [ ] ユーザーアクティビティ確認

### 週次タスク
- [ ] バックアップ成功確認
- [ ] パフォーマンス指標確認
- [ ] セキュリティアラート確認

### 月次タスク
- [ ] 依存関係アップデート確認: `npm outdated`
- [ ] セキュリティアップデート: `npm audit`
- [ ] データベースメンテナンス
- [ ] アクセスログレビュー

### 四半期ごと
- [ ] セキュリティ監査
- [ ] パフォーマンス最適化レビュー
- [ ] アーキテクチャレビュー

## トラブルシューティング

### デプロイ失敗

#### ビルドエラー
```bash
# ローカルでビルド確認
npm run build

# 詳細なエラー確認
npm run build 2>&1 | head -50
```

一般的な原因:
- TypeScript エラー
- 環境変数未設定
- 依存関係バージョン不一致

#### デプロイエラー
Vercel Dashboard > Deployments で詳細ログ確認

### ランタイムエラー

#### ブラウザコンソール確認
1. DevTools > Console を開く
2. エラーメッセージを確認
3. スタックトレースを Supabase ダッシュボードと照合

#### Vercel ログ確認
```bash
vercel logs --prod
```

#### Supabase ログ確認
1. Supabase Dashboard > Logs
2. フィルタを使用してエラーを検索
3. クエリの詳細を確認

### パフォーマンス問題

#### 遅いページを特定
1. Chrome DevTools > Network タブ
2. ローディング時間を確認
3. CSS/JavaScript バンドルサイズを確認

#### 解決方法
```bash
# バンドルサイズ分析
npx next-bundle-analyzer

# 遅い API エンドポイント確認
# Supabase Dashboard > Logs > API
```

## スケーリング

### ユーザー数が増えた場合
1. Supabase プランをアップグレード
2. Vercel 設定を確認（プロ以上推奨）
3. データベースクエリを最適化

### 大量データ対応
```sql
-- インデックス追加
CREATE INDEX idx_attendees_ceremony_checked_in
ON attendees(ceremony_id, checked_in);

-- クエリ最適化
EXPLAIN ANALYZE SELECT ...;
```

### リージョン対応
1. Supabase: 東京リージョン推奨（日本利用の場合）
2. Vercel: 複数リージョン配置（グローバル対応時）

## バージョン管理

### アップデート手順
```bash
# 依存関係アップデート確認
npm outdated

# アップデート実行（パッチバージョン）
npm update

# メジャーアップデート
npm install next@latest

# テスト実行
npm run test
npm run build

# git にコミット
git add package*.json
git commit -m "deps: update dependencies"
git push
```

### Breaking Changes 対応
1. Changelog を確認
2. 互換性問題を特定
3. コード変更実施
4. テスト実行
5. ステージングで検証

## ロールバック

### 本番環境でのロールバック

#### Vercel を使用した場合
1. Vercel Dashboard > Deployments
2. 前回の成功デプロイを選択
3. メニューから「Promote to Production」

#### Git を使用した場合
```bash
# 前回のコミットに戻す
git revert HEAD

# またはリセット（非推奨）
git reset --hard HEAD~1

# デプロイ
git push origin main
```

## 料金・コスト管理

### Vercel コスト
- Pro プラン: $20/月
- Function 実行: $0.50/100 万リクエスト
- Bandwidth: $0.15/GB

### Supabase コスト
- 無料プラン: 500 MB DB, 2 GB 帯域幅
- Pro プラン: $25/月
- 従量課金: DB 容量、Realtime メッセージ

### コスト削減
1. 不要なクエリを削除
2. データベースインデックスを最適化
3. CDN キャッシュを活用
4. 定期的なクリーンアップ（古いセッション削除）

## 監視とアラート

### エラー監視設定
```bash
# Sentry への統合（オプション）
npm install @sentry/nextjs
```

### メトリクス監視
- ページロード時間: 目標 < 3 秒
- API レスポンス: 目標 < 500 ms
- エラーレート: 目標 < 0.1%
- Realtime 遅延: 目標 < 1 秒

### アラート設定
1. Supabase > Email Alerts で高エラーレートを監視
2. Vercel > Alerts で失敗デプロイを監視
3. Google Analytics で異常なトラフィック変動を監視

## セキュリティメンテナンス

### 定期セキュリティチェック
```bash
# 依存関係の脆弱性チェック
npm audit

# Node Security Database 確認
npm audit fix
```

### パスワードローテーション
- Supabase Database Password: 6 ヶ月ごと
- Vercel API Token: 年 1 回
- GitHub Deploy Key: 年 1 回

### アクセス権限レビュー
1. 月次でアカウント権限を確認
2. 不要な権限を削除
3. 新規アカウント権限を制限

## まとめ

### デプロイ時系列
```
ローカルテスト完了
        ↓
本番環境設定確認
        ↓
Vercel デプロイ
        ↓
機能テスト実施
        ↓
パフォーマンステスト
        ↓
セキュリティテスト
        ↓
本番運用開始
```

### 重要なポイント
1. 必ずローカルでテストしてからデプロイ
2. 本番キーは git にコミットしない
3. 定期的なバックアップ設定
4. セキュリティアップデートは優先実施
5. パフォーマンスは継続的に監視

### サポート連絡先
- Vercel サポート: https://vercel.com/support
- Supabase サポート: https://supabase.com/support
- Next.js コミュニティ: https://nextjs.org/docs

## トラブルシューティングリソース

### よくあるエラーと解決策

| エラー | 原因 | 解決 |
|--------|------|------|
| 404 Not Found | ページが存在しない | ルーティング確認 |
| 503 Service Unavailable | Vercel ダウンタイム | Vercel Status 確認 |
| CORS Error | 異なるドメインからのリクエスト | Supabase CORS 設定 |
| Database Connection Error | Supabase 接続失敗 | 環境変数確認 |
| QR Scanner Error | カメラ許可なし | ブラウザ設定確認 |

### 更新ログ
- 2024-01: プロジェクト初版
- 2024-02: Vercel 統合対応
- 2024-03: セキュリティ強化
