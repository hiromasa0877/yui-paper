# 結（ゆい）ペーパー — 紙芳名帳OCR葬儀受付Webアプリ

紙の芳名帳を撮影 → OCRで自動デジタル化 → 受付番号を即時採番する、葬儀受付向けのWebアプリです。
姉妹プロジェクト「結レセプション（yui-app）」がデジタル受付（QR / 代理入力）を担うのに対し、
本プロジェクトは式場既存の紙芳名帳をそのまま使う運用に対応します。

## 運用フロー（重要）

### フェーズ1: 受付（葬儀中・参列者の前）

1. 参列者が芳名用紙に手書きで記入
2. スタッフがiPadで紙を撮影 → アプリが受付番号（例 #042）を即時表示
3. スタッフが表示された番号を**紙と香典袋の両方に記入**
4. 「次の方」で次の受付へ

> ⚠ **絶対ルール**: 受付では金額を扱いません。香典袋を参列者の前で開封するのは葬儀作法として厳禁です。

### フェーズ2: 金額記録（葬儀終了後・別室）

1. スタッフ／遺族が香典袋を受付番号順に取り出し
2. `/amount/[ceremonyId]` で番号入力 → 該当者表示
3. 袋を開封 → 5,000 / 10,000 / その他ボタンで金額入力

### フェーズ3: 要確認レビュー

`/review/[ceremonyId]` でOCR信頼度が低いレコードを、スキャン画像と並べて修正・確定します。

## 技術スタック

- Next.js 14（App Router）/ TypeScript / Tailwind CSS 3
- Supabase（PostgreSQL + Realtime + Storage）
- Google Cloud Vision API（手書き日本語OCR）
- Gemini 1.5 Flash（任意レイアウトの芳名帳から構造化フィールド抽出）
- IndexedDB オフラインキュー + Service Worker（電波不安定対策）

## 画面一覧

| 画面 | URL | 役割 |
|---|---|---|
| ホーム | `/` | 式典一覧・新規作成（ログイン必須） |
| ログイン | `/auth/login` | Supabase Auth (email/password) |
| 受付 | `/reception/[ceremonyId]` | カメラ撮影→OCR→受付番号を大きく表示 |
| 金額入力 | `/amount/[ceremonyId]` | 別室で香典袋を開封・金額入力 |
| 要確認レビュー | `/review/[ceremonyId]` | OCR低信頼データを画像と並べて確定 |
| ダッシュボード | `/dashboard/[ceremonyId]` | 統計・CSV出力・各画面へのナビ |

## 環境変数

`.env.local` に以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
GOOGLE_CLOUD_CREDENTIALS_JSON=<サービスアカウントJSON全文>
GEMINI_API_KEY=<Gemini APIキー>
```

> `GOOGLE_CLOUD_CREDENTIALS_JSON` と `GEMINI_API_KEY` が未設定の場合、受付画面の表示は可能ですが、撮影→OCRはエラーになります。

## ローカル開発

```bash
npm install
npm run dev
# http://localhost:3000
```

## Supabase マイグレーション

`supabase/migrations/` に順番に適用：

| ファイル | 内容 |
|---|---|
| 001〜004 | ceremonies, attendees テーブル基本構造、奉納フラグ等 |
| 005_soft_delete_and_rls_hardening.sql | deleted_at による論理削除、物理DELETE禁止 |
| 006_paper_ocr_fields.sql | paper_image_url, ocr_status, ocr_confidence, ocr_extracted_fields, ocr_raw_text 追加 + paper-forms バケット作成 |
| 007_add_furigana_column.sql | furigana 専用カラム追加（旧 notes 退避からの移行クエリ含む） |

加えて、Supabase Storage で `paper-forms` バケット（Private）が必要です（マイグレーション006が自動作成、失敗した場合のみダッシュボードで手動作成）。

## 引き継ぎ

詳細な引き継ぎ事項・未完了タスク・既知課題は [HANDOFF.md](./HANDOFF.md) を参照。

## 関連プロジェクト

- [yui-app](https://github.com/hiromasa0877/yui) — デジタル受付版（QR / 代理入力）。同じ Supabase プロジェクト・同じ `attendees` テーブルを共有。
