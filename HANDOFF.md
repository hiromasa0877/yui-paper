# yui-paper 引き継ぎ書

## プロジェクト概要
**結（ゆい）ペーパー** — 紙芳名帳をOCRでスキャンし、葬儀の香典帳簿をデジタル化するWebアプリ。
既存の「結レセプション」（yui-app: デジタル受付版）とは別プロジェクトとして開発中。

## リポジトリ・インフラ

| 項目 | 値 |
|---|---|
| GitHub | https://github.com/hiromasa0877/yui-paper |
| Vercel | **未デプロイ**（Importまで済んでいない or Import途中） |
| Supabase | 既存 `ebwyrdzvfqxtpvkhaogp` を共有利用 |
| 既存デジタル版 | https://github.com/hiromasa0877/yui → https://yui-orcin.vercel.app/ |

## 技術スタック
- Next.js 14 (App Router) / TypeScript / Tailwind CSS 3
- Supabase (PostgreSQL + Realtime + Storage)
- Google Cloud Vision API（手書き日本語OCR、無料枠1000/月）
- Gemini 1.5 Flash（任意レイアウトの芳名帳から構造化フィールド抽出）
- IndexedDB オフラインキュー + Service Worker（電波不安定対策）

## 画面構成

| 画面 | URL | 状態 | 役割 |
|---|---|---|---|
| ホーム | `/` | ✅ 実装済 | 式典一覧＋新規作成。ログイン必須 |
| ログイン | `/auth/login` | ✅ 実装済 | Supabase Auth (email/password) |
| **受付** | `/reception/[ceremonyId]` | ✅ 実装済 | カメラ撮影→OCR→受付番号を大きく表示 |
| **金額入力** | `/amount/[ceremonyId]` | ✅ 実装済 | 別室で香典袋を開封。5000/10000/その他ボタン |
| **要確認レビュー** | `/review/[ceremonyId]` | ✅ 実装済 | OCR低信頼データを画像と並べて編集確定 |
| ダッシュボード | `/dashboard/[ceremonyId]` | ✅ 実装済 | 統計・CSV出力・各画面へのナビ |
| OCR API | `/api/reception/scan` | ✅ 実装済 | POST multipart: 番号採番→画像保存→Vision+Gemini |
| CSVエクスポート | `/api/attendees/export` | ✅ 実装済 | 旧版から継承 |

## 運用フロー（超重要）

### フェーズ1: 受付（葬儀中・参列者の前）
1. 参列者が式場の芳名用紙に手書きで記入
2. 受付でスタッフが紙を受け取り、iPadで撮影
3. アプリが受付番号（例: #042）を大きく表示
4. スタッフが表示された番号を**紙と香典袋に記入**
5. 「次の方」ボタン → 次の受付へ

**⚠ 絶対ルール: 受付で金額を扱わない。香典袋を参列者の前で開けない（葬儀の作法）**

### フェーズ2: 金額記録（葬儀終了後・別室）
1. スタッフ/遺族が香典袋を受付番号順に取り出す
2. `/amount/[ceremonyId]` で番号入力 → 該当者表示
3. 袋を開封 → 金額ボタン（5,000 / 10,000 / その他）で入力
4. 次の袋へ

### フェーズ3: 要確認レビュー
1. `/review/[ceremonyId]` でOCR信頼度が低いレコードを表示
2. スキャン画像（左）と編集フォーム（右）を並べて修正
3. 「確定」で ocr_status を success に更新

## Supabase マイグレーション状況

| ファイル | 状態 | 内容 |
|---|---|---|
| 001_initial.sql | ✅ 適用済 | ceremonies, attendees テーブル作成 |
| 002〜004 | ✅ 適用済 | 奉納フラグ、koden_number等 |
| 005_soft_delete_and_rls_hardening.sql | ✅ 適用済 | deleted_at, 物理DELETE禁止 |
| **006_paper_ocr_fields.sql** | **⚠ 未適用** | paper_image_url, ocr_status, ocr_confidence, ocr_extracted_fields, ocr_raw_text 追加 |

### 006の適用手順
https://supabase.com/dashboard/project/ebwyrdzvfqxtpvkhaogp/sql/new に
`supabase/migrations/006_paper_ocr_fields.sql` の内容を貼り付けて Run。

**加えて、Supabase Storage で `paper-forms` バケットを手動作成する必要あり:**
Supabase Dashboard → Storage → New Bucket → Name: `paper-forms` / Private

## Vercelデプロイ手順（未完了）

### Step 1: Vercel Import
https://vercel.com/new → `hiromasa0877/yui-paper` をImport

### Step 2: 環境変数
以下5つを設定（上3つは既存yui-appと同じ値でOK）:

| Name | 取得元 | 必須度 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ebwyrdzvfqxtpvkhaogp.supabase.co` | 必須 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → API keys → anon | 必須 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → API keys → service_role | 必須 |
| `GOOGLE_CLOUD_CREDENTIALS_JSON` | GCP → サービスアカウント → JSONキー全文 | OCR機能に必須 |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | OCR機能に必須 |

**上3つだけで先にデプロイ可能**（受付画面は表示される。OCR撮影は②③がないとエラーになる）。

### Step 3: Deploy ボタン

## Google Cloud 準備状況（荻野さん途中まで実施）
- [ ] Google Cloud プロジェクト作成 ← 多分済
- [ ] Cloud Vision API 有効化 ← 多分済
- [ ] サービスアカウント作成 → JSONキーダウンロード ← 未確認
- [ ] Gemini APIキー取得（https://aistudio.google.com/apikey）← 未確認

## 既知の課題・TODO

### 🔴 ブロッカー
1. **マイグレーション006未適用** → OCRスキャン結果が保存できない
2. **Supabase Storage `paper-forms` バケット未作成** → 画像アップロード不可
3. **Google Cloud/Gemini 環境変数未設定** → OCRが動かない

### 🟠 改善したい
4. **ふりがな専用カラムがない** → 現在 `notes` に退避中。本来は `furigana TEXT` カラムを追加すべき
5. **attendeesテーブルの型定義に新フィールド未追加** → `src/types/database.ts` に `paper_image_url`, `ocr_status` 等を追加すべき
6. **旧ドキュメント整理** → COMPLETE_SUMMARY.md, HANDOFF_TO_NEW_PC.md 等はデジタル版の引き継ぎ書。yui-paper用に書き直すか削除
7. **受付画面のオフライン対応** → OCR自体はオンライン必須だが、番号だけ先にローカル採番してキュー送りにする拡張は可能

### 🟡 将来
8. **名刺スキャン対応** → 名刺のOCRは印字なので精度95%+。同じフローに組み込み可能
9. **管理番号シール印刷機能** → 式場の用紙に番号欄がない場合の補助
10. **Supabase Auth の権限分離** → 受付スタッフ vs 喪主でアクセス範囲を分ける

## ローカル開発

```bash
cd C:\Users\hirom\Downloads\Claude\03_CPO_FuneralDX\yui-paper-ocr
npm install
# .env.local に環境変数5つを設定
npm run dev
# http://localhost:3000
```

## ファイル構成（重要なものだけ）

```
src/
├── app/
│   ├── page.tsx                        # ホーム（式典一覧）
│   ├── auth/login/page.tsx             # ログイン
│   ├── reception/[ceremonyId]/page.tsx  # ★ 受付（カメラ→OCR→番号表示）
│   ├── amount/[ceremonyId]/page.tsx     # ★ 金額入力（5000/10000/その他）
│   ├── review/[ceremonyId]/page.tsx     # ★ 要確認レビュー（画像+編集）
│   ├── dashboard/[ceremonyId]/page.tsx  # ダッシュボード
│   └── api/
│       ├── reception/scan/route.ts      # ★ OCRメインAPI
│       └── attendees/export/route.ts    # CSVエクスポート
├── lib/
│   ├── ocr.ts                          # ★ Vision + Gemini パイプライン
│   ├── supabase.ts                     # Supabaseクライアント
│   ├── offline-queue.ts                # IndexedDB書き込みキュー
│   ├── resilient-db.ts                 # リトライ付きDB書き込み
│   └── utils.ts                        # ユーティリティ
├── components/
│   ├── AttendeeTable.tsx               # 参列者テーブル
│   ├── OfflineBadge.tsx                # オンライン/オフラインバッジ
│   └── Header.tsx, Footer.tsx, ServiceWorkerRegister.tsx
├── types/database.ts                   # Supabase型定義
supabase/migrations/
├── 001〜005 (適用済)
└── 006_paper_ocr_fields.sql (★未適用)
sample_forms/                           # OCRテスト用の芳名用紙3パターン（HTML）
```

## 既存デジタル版（yui-app）との関係
- `03_CPO_FuneralDX/yui-app/` = デジタル受付版（QR / 代理入力）
- `03_CPO_FuneralDX/yui-paper-ocr/` = 紙OCR版（本ファイル）
- 両者は同じ Supabase プロジェクト・同じ `attendees` テーブルを共有
- どちらを本番運用するかは社長と協議中（両方残す方針）
