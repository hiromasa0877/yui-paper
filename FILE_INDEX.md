# 結（ゆい）レセプション - ファイルインデックス

完全なファイル一覧と説明です。

## ドキュメント (6 ファイル)

| ファイル | 説明 |
|---------|------|
| `README.md` | プロジェクト概要・機能説明 |
| `SETUP.md` | セットアップ手順（初心者向け） |
| `PROJECT_STRUCTURE.md` | プロジェクト構造の詳細説明 |
| `TESTING.md` | テスト・検証ガイド |
| `DEPLOYMENT.md` | デプロイメント・運用ガイド |
| `COMPLETE_SUMMARY.md` | 実装完了サマリー |

## 設定ファイル (7 ファイル)

| ファイル | 説明 |
|---------|------|
| `package.json` | npm 依存関係・スクリプト定義 |
| `tsconfig.json` | TypeScript コンパイラ設定 |
| `tailwind.config.ts` | Tailwind CSS カスタム設定 |
| `next.config.js` | Next.js ビルド設定 |
| `postcss.config.js` | PostCSS プラグイン設定 |
| `.gitignore` | Git 除外ファイル定義 |
| `middleware.ts` | 認証ミドルウェア（Next.js） |

## ページ・ルート (8 ファイル)

### メインページ
| ファイル | パス | 説明 |
|---------|------|------|
| `src/app/page.tsx` | `/` | ホームページ（喪主向け） |
| `src/app/layout.tsx` | - | ルートレイアウト |

### 認証
| ファイル | パス | 説明 |
|---------|------|------|
| `src/app/auth/login/page.tsx` | `/auth/login` | ログイン・サインアップ |

### 参列者向け
| ファイル | パス | 説明 |
|---------|------|------|
| `src/app/ceremony/[id]/register/page.tsx` | `/ceremony/[id]/register` | 参列登録フォーム |
| `src/app/ceremony/[id]/complete/page.tsx` | `/ceremony/[id]/complete` | 完了画面（QR表示） |

### スタッフ向け
| ファイル | パス | 説明 |
|---------|------|------|
| `src/app/staff/[ceremonyId]/page.tsx` | `/staff/[ceremonyId]` | 受付スタッフUI |

### 喪主向け
| ファイル | パス | 説明 |
|---------|------|------|
| `src/app/dashboard/[ceremonyId]/page.tsx` | `/dashboard/[ceremonyId]` | 管理ダッシュボード |

## API ルート (2 ファイル)

| ファイル | エンドポイント | 説明 |
|---------|-------------|------|
| `src/app/api/attendees/checkin/route.ts` | `POST /api/attendees/checkin` | チェックイン処理 |
| `src/app/api/attendees/export/route.ts` | `GET /api/attendees/export` | CSV エクスポート |

## React コンポーネント (5 ファイル)

| ファイル | 用途 | 説明 |
|---------|------|------|
| `src/components/Header.tsx` | ナビゲーション | サイトヘッダー |
| `src/components/Footer.tsx` | フッター | ページフッター |
| `src/components/KodenInput.tsx` | フォーム | 香典入力コンポーネント |
| `src/components/AttendeeTable.tsx` | テーブル | 参列者データテーブル |
| `src/components/QrScanner.tsx` | スキャナ | QRコードスキャナー |

## カスタムフック (1 ファイル)

| ファイル | 説明 |
|---------|------|
| `src/hooks/useRealtimeAttendees.ts` | Supabase Realtime 購読フック |

## ライブラリ関数 (2 ファイル)

| ファイル | 説明 |
|---------|------|
| `src/lib/supabase.ts` | Supabase クライアント初期化 |
| `src/lib/utils.ts` | ユーティリティ関数集 |

### utils.ts に含まれる関数
- `formatCurrency()` - 通貨フォーマット
- `formatDate()` - 日付時刻フォーマット
- `formatDateOnly()` - 日付フォーマット
- `formatTime()` - 時刻フォーマット
- `clsx()` - CSS クラス結合
- `lookupZipcode()` - 郵便番号→住所 API 呼び出し
- `validateEmail()` - メール形式検証
- `validatePhoneNumber()` - 電話番号検証
- `validateZipcode()` - 郵便番号形式検証

## 型定義 (1 ファイル)

| ファイル | 説明 |
|---------|------|
| `src/types/database.ts` | Supabase スキーマ型定義 |

### database.ts に含まれる型
- `Ceremony` - 式典情報型
- `Attendee` - 参列者情報型
- `CheckInStatus` - チェックイン方式型
- `Relation` - ご関係型
- `ZipCloudResponse` - Zipcloud API レスポンス型

## スタイル (2 ファイル)

| ファイル | 説明 |
|---------|------|
| `src/app/globals.css` | グローバルスタイル・Tailwind imports |
| `tailwind.config.ts` | Tailwind カスタムカラー・アニメーション |

## データベース (1 ファイル)

| ファイル | 説明 |
|---------|------|
| `supabase/migrations/001_initial.sql` | 初期スキーマ・RLS ポリシー |

### 001_initial.sql に含まれる内容
- `ceremonies` テーブル定義
- `attendees` テーブル定義
- インデックス定義
- RLS ポリシー設定
- Realtime 購読設定
- トリガー設定

## 静的ファイル (1 ファイル)

| ファイル | 説明 |
|---------|------|
| `public/robots.txt` | SEO ロボット指示 |

## ファイルサイズ概要

```
コンポーネント・フック:     ~2.5 KB (5 ファイル)
ページ・ルート:           ~15 KB (8 ファイル)
API ルート:              ~1.5 KB (2 ファイル)
スタイル・設定:          ~5 KB (8 ファイル)
型・ユーティリティ:      ~3 KB (3 ファイル)
ドキュメント:            ~50 KB (6 ファイル)
データベース:            ~2 KB (1 ファイル)
─────────────────────────────────────
合計:                   ~79 KB (33 ファイル)
```

## ファイル読込の推奨順序

### 初めて見る場合
1. `COMPLETE_SUMMARY.md` - プロジェクト概要
2. `README.md` - 機能・スタック説明
3. `PROJECT_STRUCTURE.md` - ディレクトリ構造

### セットアップする場合
1. `SETUP.md` - セットアップ手順
2. `package.json` - 依存関係確認
3. `supabase/migrations/001_initial.sql` - DB スキーマ確認

### 開発する場合
1. `PROJECT_STRUCTURE.md` - 全体構造理解
2. `tsconfig.json` - TypeScript 設定確認
3. 各ページ (`src/app/**/*.tsx`) を見る
4. 各コンポーネント (`src/components/*.tsx`) を見る

### テストする場合
1. `TESTING.md` - テスト手順
2. 各ページで機能確認
3. TESTING.md のチェックリスト実施

### デプロイする場合
1. `DEPLOYMENT.md` - デプロイメント手順
2. `next.config.js` - 本番設定確認
3. 環境変数設定 (`.env.local`)

## ナビゲーション

### ページ間のリンク
```
ホーム (/)
  ├─ 参列登録 (/ceremony/[id]/register)
  │   └─ 完了画面 (/ceremony/[id]/complete)
  ├─ 受付 (/staff/[ceremonyId])
  │   ├─ スマート受付 (QRスキャン)
  │   ├─ 代行入力
  │   └─ 参列者一覧
  └─ ダッシュボード (/dashboard/[ceremonyId])
      ├─ 検索・フィルタ
      └─ CSVエクスポート

ログイン (/auth/login)
  ├─ サインアップ
  └─ ログイン
```

## API エンドポイント

```
POST /api/attendees/checkin
  参列者のチェックイン処理
  リクエスト: { attendeeId, kodenAmount, kodenNumber }
  レスポンス: { id, full_name, checked_in, ... }

GET /api/attendees/export?ceremonyId=<id>
  CSV ファイルダウンロード
  レスポンス: CSV データ
```

## 依存関係

主要な npm パッケージ:
- `next@14.1.0` - フレームワーク
- `react@18.2.0` - UI ライブラリ
- `@supabase/supabase-js@2.38.4` - DB クライアント
- `tailwindcss@3.4.1` - スタイリング
- `qrcode.react@1.0.1` - QR生成
- `html5-qrcode@2.3.4` - QRスキャン
- `react-hot-toast@2.4.1` - 通知
- `papaparse@5.4.1` - CSV 処理

## 環境変数

`.env.local` に必要な変数:
```
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_ZIPCLOUD_API_URL=https://zipcloud.ibsnet.co.jp/api/search
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## ビルド・実行コマンド

```bash
npm install              # 依存関係インストール
npm run dev             # 開発サーバー起動
npm run build           # 本番ビルド
npm start               # ビルド後に起動
npm run type-check      # TypeScript チェック
npm run lint            # ESLint 実行
```

## トラブルシューティング

### ファイルが見つからない場合
- `.gitignore` に除外されていないか確認
- `node_modules` は除外（実行時に生成）

### TypeScript エラー
- `tsconfig.json` の `strict: true` モード有効
- 全ファイルで型安全性が必須

### ビルドエラー
- `package.json` の依存バージョン確認
- `npm ci` で正確なバージョンインストール

---

**最後に**: 各ドキュメントには詳細な説明が含まれています。
具体的なコードについては該当ファイルを直接参照してください。

Happy coding! 🚀
