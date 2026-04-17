# 結（ゆい）レセプション - 葬儀受付DXサービス

デジタル技術を活用した葬儀受付システムです。スマートフォンでのQRコードスキャンによる入場登録、香典管理、参列者管理を実現します。

## 機能概要

### 参列者向け機能
- **スマート参列登録**: QR生成→参列者のスマートフォンで氏名・住所入力→完了画面でQR表示
- **郵便番号自動入力**: Zipcloud APIを使用した住所自動検索
- **完了画面QR表示**: スタッフにスキャンしてもらうためのQRコード表示

### 受付スタッフ向け機能
- **タブベースUI**: 3つの異なる入力方式に対応
  - スマート受付: 参列者が作成したQRコードをスキャン
  - 代行入力: 高齢者等向けの手動入力フォーム
  - 参列者一覧: リアルタイムの入場者管理
- **香典管理**: プリセット金額ボタン+カスタム入力対応
- **リアルタイム更新**: Supabase Realtime対応

### 喪主向けダッシュボード
- **統計情報**: 総参列者数、チェックイン済み数、香典合計金額
- **参列者管理**: 検索・フィルタ機能付きの参列者一覧
- **データエクスポート**: CSV形式でのデータ出力

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **UI**: Tailwind CSS 3
- **データベース**: Supabase (PostgreSQL + Realtime)
- **認証**: Supabase Auth
- **QRコード**: qrcode.react, html5-qrcode
- **通知**: react-hot-toast
- **データ処理**: papaparse

## セットアップ手順

### 1. 環境準備

```bash
# リポジトリクローン
git clone <repository-url>
cd yui-reception

# 依存関係インストール
npm install
```

### 2. Supabaseプロジェクト作成

1. [Supabase](https://supabase.com) でアカウント作成
2. 新しいプロジェクトを作成
3. データベース初期化SQL (`supabase/migrations/001_initial.sql`) を実行
4. 認証設定: Auth > Providers で必要な認証方法を有効化

### 3. 環境変数設定

`.env.local` ファイルを作成（`.env.local.example` を参考）:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_ZIPCLOUD_API_URL=https://zipcloud.ibsnet.co.jp/api/search
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 4. 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開く

## 本番デプロイ

### Vercelへのデプロイ

```bash
# ビルド確認
npm run build

# Vercelにプッシュ
git push origin main
```

1. [Vercel](https://vercel.com) にログイン
2. 本リポジトリをインポート
3. 環境変数を設定: Project Settings > Environment Variables
4. デプロイ実行

## データベーススキーマ

### ceremonies テーブル
祭礼情報を管理

```sql
- id: UUID (PK)
- name: 式典名
- deceased_name: 故人の名前
- venue: 会場
- ceremony_date: 式典日時
- mourner_user_id: 喪主のユーザーID (FK auth.users)
- qr_code_url: 式典用QRコード（オプション）
- created_at, updated_at: タイムスタンプ
```

### attendees テーブル
参列者情報を管理

```sql
- id: UUID (PK)
- ceremony_id: 式典ID (FK ceremonies)
- full_name: 氏名
- postal_code: 郵便番号
- address: 住所
- phone: 電話番号（オプション）
- koden_amount: 香典金額
- koden_number: 香典番号
- checked_in: チェックイン状態
- check_in_method: チェックイン方法 (smart|paper_ocr|concierge)
- relation: ご関係 (親族|友人|会社関係|近所|その他)
- notes: 備考
- created_at: 登録日時
- checked_in_at: チェックイン日時
- updated_at: 更新日時
```

## 主要ページ一覧

| URL | 説明 |
|-----|------|
| `/` | ホーム - 式典作成・一覧 |
| `/ceremony/[id]/register` | 参列者向け - 参列登録フォーム |
| `/ceremony/[id]/complete` | 参列者向け - 完了画面（QR表示） |
| `/staff/[ceremonyId]` | スタッフ向け - 受付システム |
| `/dashboard/[ceremonyId]` | 喪主向け - 管理画面 |

## 設計ガイドライン

### 配色
- **プライマリ**: 深紺 (#1a1a2e)
- **アクセント**: ゴールド (#c9a962)
- **セカンダリ**: オフホワイト (#f5f2eb)
- **テーシャリ**: ティール (#3a7c8c)

### フォント
- 日本語フォント: "Noto Sans JP" (Google Fonts)
- レスポンシブ対応: モバイルファースト設計

### UI/UX
- 葬儀という厳粛な場を尊重した落ち着いた設計
- 高齢者対応: 大きなボタン、高いコントラスト
- アクセシビリティ: セマンティックHTML、ARIA属性

## セキュリティ対策

- **認証**: Supabase Auth による認証
- **RLS**: Row-Level Security ポリシーで行レベルのアクセス制御
- **データ検証**: 郵便番号形式の検証、入力値サニタイズ
- **HTTPS**: 本番環境では必須
- **CORS**: 適切なCORS設定

## トラブルシューティング

### Zipcode APIエラー
郵便番号が見つからない場合、APIレスポンスを確認してください。
正しい形式は `XXX-XXXX` または `XXXXXXX` です。

### Supabase接続エラー
環境変数が正しく設定されているか確認:
```bash
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### QRコードスキャンできない
- ブラウザのカメラ許可を確認
- HTTPS接続を確認（localhost以外）
- 照度を確認（十分な光がある場所で使用）

## ライセンス

Proprietary - © 2024 All rights reserved

## サポート

問題が発生した場合は、以下を確認してください:
1. コンソールエラーメッセージを確認
2. Supabaseダッシュボードでデータベース接続を確認
3. 環境変数が正しく設定されていることを確認
