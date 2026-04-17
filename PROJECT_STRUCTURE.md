# 結（ゆい）レセプション - プロジェクト構造

## ディレクトリレイアウト

```
yui-reception/
├── src/                              # ソースコード
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # ホームページ (/)
│   │   ├── layout.tsx                # ルートレイアウト
│   │   ├── globals.css               # グローバルスタイル
│   │   │
│   │   ├── api/                      # API Route
│   │   │   └── attendees/
│   │   │       ├── checkin/route.ts  # チェックイン処理
│   │   │       └── export/route.ts   # CSV エクスポート
│   │   │
│   │   ├── auth/                     # 認証関連
│   │   │   └── login/page.tsx        # ログイン・サインアップ
│   │   │
│   │   ├── ceremony/                 # 参列者向け
│   │   │   └── [id]/
│   │   │       ├── register/         # 参列登録フォーム
│   │   │       │   └── page.tsx
│   │   │       └── complete/         # 完了画面
│   │   │           └── page.tsx
│   │   │
│   │   ├── staff/                    # スタッフ向け
│   │   │   └── [ceremonyId]/
│   │   │       └── page.tsx          # 受付インターフェース
│   │   │
│   │   └── dashboard/                # 喪主向け
│   │       └── [ceremonyId]/
│   │           └── page.tsx          # 管理画面
│   │
│   ├── components/                   # React コンポーネント
│   │   ├── Header.tsx                # ヘッダーナビゲーション
│   │   ├── Footer.tsx                # フッター
│   │   ├── KodenInput.tsx            # 香典入力コンポーネント
│   │   ├── AttendeeTable.tsx         # 参列者テーブル
│   │   └── QrScanner.tsx             # QRコードスキャナー
│   │
│   ├── hooks/                        # カスタムフック
│   │   └── useRealtimeAttendees.ts   # リアルタイム購読
│   │
│   ├── lib/                          # ユーティリティ
│   │   ├── supabase.ts               # Supabase クライアント
│   │   └── utils.ts                  # 汎用ユーティリティ
│   │
│   └── types/                        # TypeScript 型定義
│       └── database.ts               # DB スキーマ型
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql           # DB スキーマ定義
│   └── .gitkeep
│
├── public/                           # 静的ファイル
│   └── robots.txt
│
├── Configuration Files
│   ├── package.json                  # 依存関係・スクリプト
│   ├── tsconfig.json                 # TypeScript 設定
│   ├── tailwind.config.ts            # Tailwind CSS 設定
│   ├── next.config.js                # Next.js 設定
│   ├── postcss.config.js             # PostCSS 設定
│   └── middleware.ts                 # 認証ミドルウェア
│
├── Documentation
│   ├── README.md                     # プロジェクト概要
│   ├── SETUP.md                      # セットアップガイド
│   ├── PROJECT_STRUCTURE.md          # このファイル
│   └── .env.local.example            # 環境変数テンプレート
│
└── .gitignore                        # Git 除外ファイル
```

## ファイル説明

### App Router Pages

#### `/src/app/page.tsx`
**喪主向けホームページ**
- 式典の作成フォーム
- 既存式典の一覧表示
- 各式典へのナビゲーションリンク
- 認証チェック

#### `/src/app/auth/login/page.tsx`
**認証ページ**
- ログイン/サインアップ機能
- メールアドレス・パスワード管理
- セッション管理

#### `/src/app/ceremony/[id]/register/page.tsx`
**参列者向け参列登録**
- 氏名、郵便番号、住所入力
- Zipcloud API による自動住所検索
- ご関係の選択（親族/友人/会社関係/近所/その他）
- Supabase への参列者情報保存

#### `/src/app/ceremony/[id]/complete/page.tsx`
**参列登録完了画面**
- チェックマークアニメーション
- 参列者ID表示
- QRコード生成・表示
- Wake Lock API でスクリーン常時点灯
- スタッフスキャン指示の表示

#### `/src/app/staff/[ceremonyId]/page.tsx`
**受付スタッフ UI**
3つのタブで構成:

1. **スマート受付タブ**
   - QRコードスキャナー
   - 参列者の自動検出
   - 香典金額・番号入力
   - リアルタイム check-in 更新

2. **代行入力タブ**
   - 手動フォーム入力
   - 全フィールド対応
   - 高齢者向け操作性

3. **参列者一覧タブ**
   - リアルタイム更新リスト
   - チェックイン状態表示
   - 香典金額表示

#### `/src/app/dashboard/[ceremonyId]/page.tsx`
**喪主向けダッシュボード**
- 統計情報カード（総数/チェックイン済み/香典合計）
- 参列者一覧テーブル
- 検索・フィルタ機能
- CSV エクスポート機能

### API Routes

#### `/src/app/api/attendees/checkin/route.ts`
**POST エンドポイント**
- 参列者のチェックイン処理
- 香典金額・番号の更新
- チェックイン時刻の記録

#### `/src/app/api/attendees/export/route.ts`
**GET エンドポイント**
- CSV ファイル生成
- 参列者データのエクスポート
- 日本語フォーマット対応

### Components

#### `Header.tsx`
- サイトロゴ・タイトル表示
- 戻るボタン
- ログアウト機能
- スタイル: 深紺背景+ゴールドアクセント

#### `Footer.tsx`
- 会社情報
- リンク集
- コピーライト表示
- レスポンシブデザイン

#### `KodenInput.tsx`
- 香典金額入力UI
- プリセットボタン（3000, 5000, 10000, 30000, 50000, 100000 円）
- カスタム金額入力
- 香典番号入力
- 状態管理: React useState

#### `AttendeeTable.tsx`
- 参列者情報テーブル表示
- カラム: 氏名/住所/ご関係/香典金額/チェックイン状態/時刻
- コンパクト表示オプション（モバイル向け）
- 通貨フォーマット自動化
- 時刻フォーマット自動化

#### `QrScanner.tsx`
- html5-qrcode ライブラリの wrap
- カメラ入力処理
- スキャン結果コールバック
- エラーハンドリング
- リスキャンボタン

### Hooks

#### `useRealtimeAttendees.ts`
- Supabase Realtime サブスクリプション
- 参列者データの自動更新
- INSERT/UPDATE/DELETE イベント対応
- エラーハンドリング
- 初期フェッチ機能

### Lib

#### `supabase.ts`
- Supabase クライアント初期化
- 環境変数から設定読み込み
- サーバーサイド用クライアント（オプション）

#### `utils.ts`
ユーティリティ関数群:
- `formatCurrency()` - 通貨フォーマット
- `formatDate()` - 日付時刻フォーマット
- `formatDateOnly()` - 日付のみフォーマット
- `formatTime()` - 時刻フォーマット
- `clsx()` - CSS クラス結合
- `lookupZipcode()` - Zipcloud API 郵便番号検索
- `validateEmail()` - メール形式検証
- `validatePhoneNumber()` - 電話番号形式検証
- `validateZipcode()` - 郵便番号形式検証

### Types

#### `database.ts`
TypeScript 型定義:
- `Ceremony` - 式典型
- `Attendee` - 参列者型
- `CheckInStatus` - チェックイン方式型
- `Relation` - ご関係型
- `ZipCloudResponse` - Zipcloud API レスポンス型

### Configuration Files

#### `package.json`
- 依存関係管理
- npm スクリプト定義
- バージョン管理

#### `tsconfig.json`
- TypeScript コンパイラ設定
- Path alias 設定 (`@/*`)
- strict mode 有効

#### `tailwind.config.ts`
- カラーパレット定義
- フォント設定
- アニメーション定義
- グリッド設定

#### `next.config.js`
- Next.js ビルド設定
- セキュリティヘッダー設定
- 画像最適化設定

#### `middleware.ts`
- 認証チェック
- ページ保護
- セッション検証

### Styling

#### `globals.css`
- Tailwind CSS imports
- グローバルスタイル定義
- カスタムアニメーション
- ユーティリティクラス
- iOS 特別対応

#### `tailwind.config.ts`
カスタム配色:
- `accent-dark`: #1a1a2e (深紺)
- `accent-gold`: #c9a962 (ゴールド)
- `accent-cream`: #f5f2eb (オフホワイト)
- `accent-teal`: #3a7c8c (ティール)

### Database

#### `001_initial.sql`
スキーマ定義:

**ceremonies テーブル**
- 式典情報管理
- 喪主との関連付け
- RLS ポリシー実装

**attendees テーブル**
- 参列者情報管理
- チェックイン状態管理
- 香典情報管理
- Realtime 購読対応
- RLS ポリシー実装

**インデックス**
- mourner_user_id インデックス
- ceremony_id インデックス
- checked_in インデックス
- full_name インデックス

**トリガー**
- updated_at 自動更新

## データフロー

### 参列登録フロー
```
参列者スマートフォン
    ↓
/ceremony/[id]/register (入力フォーム)
    ↓
Supabase attendees テーブル INSERT
    ↓
/ceremony/[id]/complete (QR表示)
    ↓
受付スタッフがQRスキャン
    ↓
/staff/[ceremonyId] (スマート受付タブ)
    ↓
Supabase attendees テーブル UPDATE
    ↓
/dashboard/[ceremonyId] (リアルタイム更新)
```

### 代行入力フロー
```
受付スタッフ
    ↓
/staff/[ceremonyId] (代行入力タブ)
    ↓
Supabase attendees テーブル INSERT
    ↓
/dashboard/[ceremonyId] (リアルタイム更新)
```

### 統計情報フロー
```
Supabase Realtime
    ↓
attendees テーブル変更検知
    ↓
useRealtimeAttendees フック
    ↓
/dashboard/[ceremonyId] 自動更新
```

## セキュリティ実装

### 認証
- Supabase Auth
- JWT トークン
- セッション管理
- ミドルウェア保護

### データベースセキュリティ
- Row-Level Security (RLS)
- ユーザー別アクセス制御
- 公開参列者スキャン対応

### 入力検証
- 郵便番号形式検証
- メール形式検証
- XSS 対策（自動エスケープ）
- CSRF 対策（SameSite Cookie）

### HTTPS & Transport
- 本番環境で必須
- Vercel 自動 HTTPS
- Supabase HTTPS API

## パフォーマンス最適化

### コード分割
- Next.js dynamic import
- レイジーローディング

### イメージ最適化
- WebP 形式
- 自動リサイズ

### データベース
- インデックス最適化
- Realtime 購読効率化
- クエリ最適化

### キャッシング
- Browser caching
- ISR (Incremental Static Regeneration)

## 開発ガイドライン

### 新規ページ追加
1. `/src/app` に新規フォルダ作成
2. `page.tsx` を実装
3. Layout/Header/Footer の適用確認
4. TypeScript 型チェック実行
5. Tailwind CSS スタイリング

### 新規コンポーネント追加
1. `/src/components` に新規ファイル作成
2. TypeScript props 定義
3. JSDoc コメント記載
4. Storybook 対応検討

### 新規 API Route 追加
1. `/src/app/api` に新規フォルダ作成
2. `route.ts` で HTTP メソッド定義
3. エラーハンドリング実装
4. ドキュメント化

### データベース変更
1. Supabase CLI で migration 作成
2. SQL スキーマ更新
3. RLS ポリシー確認
4. ローカルテスト後に本番実行

## トラブルシューティング

### Type Errors
```bash
npm run type-check
```

### Build Errors
```bash
npm run build
```

### Runtime Errors
- Browser console 確認
- Supabase ダッシュボード確認
- ログファイル確認

## 参考リソース

- [Next.js 公式ドキュメント](https://nextjs.org/docs)
- [Supabase 公式ドキュメント](https://supabase.com/docs)
- [Tailwind CSS ドキュメント](https://tailwindcss.com/docs)
- [TypeScript 公式ドキュメント](https://www.typescriptlang.org/docs/)
- [React 公式ドキュメント](https://react.dev)
