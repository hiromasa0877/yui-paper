-- =============================================================================
-- 006_paper_ocr_fields.sql
--
-- 紙芳名帳スキャン運用（yui-paper）向けのフィールド追加。
-- 既存のデジタル受付（yui-app）と同じattendeesテーブルに同居する設計。
-- =============================================================================

-- スキャン画像のSupabase Storageパス
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS paper_image_url TEXT;

-- OCR処理ステータス: pending(処理待ち) / processing / success / failed / review_needed
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS ocr_status TEXT
  CHECK (ocr_status IS NULL OR ocr_status IN ('pending', 'processing', 'success', 'failed', 'review_needed'));

-- Vision + Gemini から返される全体信頼度(0.0〜1.0)
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC;

-- 構造化抽出結果（JSON形式。各フィールドのconfidenceも含む）
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS ocr_extracted_fields JSONB;

-- Visionが抽出した生テキスト（デバッグ・再処理用）
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS ocr_raw_text TEXT;

-- 要確認かどうかをフラグで判定できるインデックス
CREATE INDEX IF NOT EXISTS idx_attendees_review_needed
  ON attendees (ceremony_id)
  WHERE ocr_status = 'review_needed' AND deleted_at IS NULL;

-- Storage bucket: 紙芳名帳画像用
-- （Supabaseダッシュボード → Storage → New bucket → Private で作成後、以下のRLSを適用）
-- ここではSQLで作成を試みる（失敗してもマイグレーションは続行する構造）
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('paper-forms', 'paper-forms', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'storage.buckets へのINSERTはRLSで拒否された可能性があります。Supabaseダッシュボードで手動作成してください。';
END $$;
