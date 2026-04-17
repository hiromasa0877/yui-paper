-- ============================================================
-- STEP 1: 現在の attendees テーブルの列を確認する
-- ============================================================
-- これを流すと、attendees テーブルに存在する全ての列名が表示されます。
-- 結果に has_kuge / has_kumotsu / has_chouden / has_other_offering が
-- 含まれているかを確認してください。

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendees'
ORDER BY ordinal_position;

-- ============================================================
-- STEP 2: 足りない列を追加する(安全:あっても何も起きない)
-- ============================================================

ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_kuge BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_kumotsu BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_chouden BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_other_offering BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS other_offering_note TEXT;

-- NULL を false に埋める
UPDATE public.attendees SET has_kuge           = false WHERE has_kuge           IS NULL;
UPDATE public.attendees SET has_kumotsu        = false WHERE has_kumotsu        IS NULL;
UPDATE public.attendees SET has_chouden        = false WHERE has_chouden        IS NULL;
UPDATE public.attendees SET has_other_offering = false WHERE has_other_offering IS NULL;

-- ============================================================
-- STEP 3: PostgREST にスキーマキャッシュ再読み込みを通知
-- ============================================================
-- 2つの方法を両方実行(どちらかが効けばOK)
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================
-- STEP 4: もう一度確認
-- ============================================================
-- このSELECTの結果に has_chouden が含まれていればDB側の修正は完了です。
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendees'
  AND column_name LIKE 'has_%'
ORDER BY column_name;
