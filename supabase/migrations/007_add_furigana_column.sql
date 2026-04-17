-- =============================================================================
-- 007_add_furigana_column.sql
--
-- ふりがな専用カラムを attendees テーブルに追加。
-- これまでは紙OCR運用で notes 列に "ふりがな: ○○" 形式で退避していたが、
-- 検索やソートを行いやすくするため独立カラムへ分離する。
-- =============================================================================

-- ① furigana カラムを追加
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS furigana TEXT;

-- ② 既存データを notes から移行（"ふりがな: " で始まる行のみ）
--    既に furigana が入っているレコードは上書きしない（IS NULL チェック）
UPDATE attendees
SET furigana = TRIM(SUBSTRING(notes FROM '^ふりがな:\s*(.+)$'))
WHERE furigana IS NULL
  AND notes ~ '^ふりがな:\s*.+$';

-- ③ 移行に成功した notes はクリア（誤って二重表示にならないように）
UPDATE attendees
SET notes = NULL
WHERE notes ~ '^ふりがな:\s*.+$'
  AND furigana IS NOT NULL;

-- ④ 検索向けインデックス（任意。式典単位での参列者検索を高速化）
CREATE INDEX IF NOT EXISTS idx_attendees_ceremony_furigana
  ON attendees (ceremony_id, furigana)
  WHERE deleted_at IS NULL;
