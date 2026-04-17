# バックアップと復元手順

葬儀受付DX「結（ゆい）レセプション」のデータ保全手順書。
喪主の大切な記録（誰からいくら香典をもらったか）を絶対に失わないための運用ガイド。

---

## 1. データはどこに保存されているか

| 層 | 場所 | 役割 |
|---|---|---|
| クラウド | Supabase PostgreSQL | 正式なマスターデータ |
| 端末ローカル | IndexedDB（ブラウザ） | オフライン時の一時退避キュー |
| エクスポート | CSV（ダウンロード） | 人間が読める最終形・保険 |

---

## 2. 自動バックアップ（Supabase）

### 設定方法
1. Supabase ダッシュボード → 該当プロジェクト → Database → Backups
2. **Daily Backups を有効化**（Proプラン以上 / $25/月〜）
   - Freeプランの場合は 7日間の PITR（Point-in-Time Recovery）は使えないため、後述の手動バックアップを必ず設定すること
3. 保存期間は7日（標準）。葬儀の日程から逆算して最低14日のプランを推奨。

### 動作確認
月1回、以下を実施：
1. ダッシュボード Backups タブで日次バックアップが取得されていることを確認
2. テスト式典を作成 → 削除 → 前日バックアップから復元できるかテストレストア

---

## 3. 手動バックアップ（Freeプラン向け／保険）

`pg_dump` を使って業務時間外に定期取得する。

```bash
# Supabase Connection String（ダッシュボード → Database → Connection string）
export DATABASE_URL="postgresql://postgres:<PASSWORD>@<PROJECT>.supabase.co:5432/postgres"

# フルダンプ
pg_dump "$DATABASE_URL" \
  --schema=public \
  --table=ceremonies \
  --table=attendees \
  -F c \
  -f "yui_backup_$(date +%Y%m%d_%H%M).dump"
```

**推奨運用:**
- 葬儀当日の朝・終了後に必ず実行
- ダンプファイルは社内サーバー＋クラウドストレージの2箇所に保管
- 90日保存

---

## 4. 喪主側の保険：CSV エクスポート

ダッシュボード画面の「CSVエクスポート」ボタンを**葬儀終了時点で必ず1回**押す。
- UTF-8 BOM付きで Excel 互換
- 管理番号・氏名・住所・香典金額・奉納・受付時刻が1ファイルで保全される
- 喪主本人のPC（＋可能ならUSB）に保存

**運用ルール案:**
- 受付終了直後にCSV出力 → 喪主に手渡し
- 翌日にも再度CSV出力 → 金額確定後のファイナル版として喪主に渡す

---

## 5. データ復元手順

### ケースA: 喪主が誤って削除ボタンを押した
1. 論理削除のため、DBには残っている（`deleted_at` が立っているだけ）
2. Supabase SQL Editor で以下を実行：
   ```sql
   UPDATE attendees
   SET deleted_at = NULL
   WHERE ceremony_id = '<式典のUUID>'
     AND full_name = '山田花子'
     AND deleted_at IS NOT NULL;
   ```
3. ダッシュボードをリロードすれば復活

### ケースB: 式典全体のデータが消えた（重大障害）
1. Supabase ダッシュボード → Backups → Restore from backup
2. 復元後、CSV エクスポートと照合して差分確認

### ケースC: Supabaseプロジェクト自体が消えた（最悪ケース）
1. 手動バックアップ（pg_dump）から新Supabaseプロジェクトへリストア：
   ```bash
   pg_restore -d "$NEW_DATABASE_URL" yui_backup_YYYYMMDD_HHMM.dump
   ```
2. 環境変数 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を新プロジェクトのものに差し替えて再デプロイ

---

## 6. オフライン時のデータ保護

葬儀場で電波が届かない場合、端末のブラウザ IndexedDB に書き込みが自動退避される。
- 画面右下のバッジが**橙色（送信待ち N件）**または**赤色（オフライン）**になる
- **この状態で端末を閉じても・再起動してもデータは残る**（IndexedDBは永続）
- 電波が復帰するか、画面を開き直せば自動で送信される

**現場スタッフへの指示:**
- バッジが緑（オンライン）以外の状態で端末の履歴・キャッシュ削除をしないこと
- シークレットモードでは使わないこと（終了時にIndexedDBも消える）

---

## 7. 定期チェックリスト

### 毎葬儀前日
- [ ] Supabase バックアップが前日に取得されている
- [ ] CSVエクスポートが動作する（ダミー式典で確認）

### 葬儀当日終了後
- [ ] 全端末の右下バッジが緑（送信完了）になっている
- [ ] ダッシュボードから CSV エクスポート実行
- [ ] CSV を喪主に共有（メール／USB／印刷）

### 毎月1回
- [ ] Supabase バックアップの復元テスト（テスト式典で）
- [ ] 手動 pg_dump が90日分揃っているか確認
