-- =============================================================================
-- 009_ceremony_staff_and_rls.sql
--
-- 行レベルセキュリティ（RLS）強化:
--   現状の attendees ポリシーは USING (true) のため、
--   一度ログインすれば任意ユーザーが全式典の全参列者を閲覧可能だった。
--
--   本マイグレーションで:
--   ① ceremony_staff テーブルを追加（喪主＋招待スタッフ＋閲覧専用）
--   ② RLS ポリシーを「式典メンバーのみ」に絞り込む
--   ③ 既存式典の mourner_user_id を ceremony_staff にバックフィル
--   ④ 香典額（koden_amount）への閲覧を staff/owner に限定する VIEW を提供
--
-- 重要:
--   - サーバーサイド API（/api/reception/scan, /api/reception/process-ocr）は
--     SERVICE ROLE で動くため RLS を素通りする。受付撮影 → OCR の本筋は壊れない。
--   - ブラウザから直接 supabase クライアントで attendees を読む処理（home,
--     dashboard, review 画面）は新ポリシーに従う。式典オーナーは旧来通り見える。
--   - 第三者を受付スタッフとして招待する場合は ceremony_staff に INSERT が必要。
-- =============================================================================

-- ============================================================
-- ① ceremony_staff テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS ceremony_staff (
  ceremony_id UUID NOT NULL REFERENCES ceremonies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'viewer')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (ceremony_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ceremony_staff_user
  ON ceremony_staff (user_id);

-- ============================================================
-- ② メンバー判定ヘルパ関数
--    SECURITY DEFINER で実装し、ポリシー内で再帰的にRLSを評価しないようにする
-- ============================================================
CREATE OR REPLACE FUNCTION is_ceremony_member(p_ceremony_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ceremony_staff
    WHERE ceremony_id = p_ceremony_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION ceremony_member_role(p_ceremony_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM ceremony_staff
  WHERE ceremony_id = p_ceremony_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================
-- ③ 既存式典の mourner_user_id を owner として登録（バックフィル）
-- ============================================================
INSERT INTO ceremony_staff (ceremony_id, user_id, role, added_by)
SELECT id, mourner_user_id, 'owner', mourner_user_id
FROM ceremonies
WHERE mourner_user_id IS NOT NULL
ON CONFLICT (ceremony_id, user_id) DO NOTHING;

-- ============================================================
-- ④ ceremony_staff 自身の RLS
-- ============================================================
ALTER TABLE ceremony_staff ENABLE ROW LEVEL SECURITY;

-- 自分が関与している式典のスタッフ一覧を見られる
CREATE POLICY ceremony_staff_select_self ON ceremony_staff FOR SELECT
USING (
  user_id = auth.uid()
  OR is_ceremony_member(ceremony_id)
);

-- owner のみ追加・削除可能
CREATE POLICY ceremony_staff_insert_owner ON ceremony_staff FOR INSERT
WITH CHECK (
  ceremony_member_role(ceremony_id) = 'owner'
);

CREATE POLICY ceremony_staff_delete_owner ON ceremony_staff FOR DELETE
USING (
  ceremony_member_role(ceremony_id) = 'owner'
);

-- ============================================================
-- ⑤ ceremonies テーブルのRLSポリシーをメンバー基準に置き換え
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own ceremonies" ON ceremonies;
DROP POLICY IF EXISTS "Users can update their own ceremonies" ON ceremonies;
-- INSERT は従来通り（自分が mourner_user_id として作成可能）

CREATE POLICY ceremonies_select_member ON ceremonies FOR SELECT
USING (is_ceremony_member(id));

CREATE POLICY ceremonies_update_owner ON ceremonies FOR UPDATE
USING (ceremony_member_role(id) = 'owner');

-- 新規式典作成時、自動で作成者を owner として登録するトリガ
CREATE OR REPLACE FUNCTION add_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mourner_user_id IS NOT NULL THEN
    INSERT INTO ceremony_staff (ceremony_id, user_id, role, added_by)
    VALUES (NEW.id, NEW.mourner_user_id, 'owner', NEW.mourner_user_id)
    ON CONFLICT (ceremony_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ceremonies_add_creator_owner ON ceremonies;
CREATE TRIGGER trg_ceremonies_add_creator_owner
  AFTER INSERT ON ceremonies
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_as_owner();

-- ============================================================
-- ⑥ attendees テーブルのRLS強化
--    旧 USING (true) ポリシーを撤去し、メンバーのみアクセス可
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view attendees in a ceremony" ON attendees;
DROP POLICY IF EXISTS "Anyone can create attendees" ON attendees;
DROP POLICY IF EXISTS "Anyone can update attendees" ON attendees;

CREATE POLICY attendees_select_member ON attendees FOR SELECT
USING (is_ceremony_member(ceremony_id));

CREATE POLICY attendees_insert_member ON attendees FOR INSERT
WITH CHECK (is_ceremony_member(ceremony_id));

CREATE POLICY attendees_update_member ON attendees FOR UPDATE
USING (is_ceremony_member(ceremony_id))
WITH CHECK (is_ceremony_member(ceremony_id));

-- DELETE は 005 で全面禁止のまま

-- ============================================================
-- ⑦ 香典額への閲覧制限（owner / staff のみ）
--    viewer ロールが住所等は見えるが金額は見えない設計
--    フロントから直接参照したい場合は attendees_safe を使う
-- ============================================================
CREATE OR REPLACE VIEW attendees_safe AS
SELECT
  a.id,
  a.ceremony_id,
  a.full_name,
  a.furigana,
  a.postal_code,
  a.address,
  a.phone,
  a.koden_number,
  a.checked_in,
  a.check_in_method,
  a.relation,
  a.notes,
  a.has_kuge,
  a.has_kumotsu,
  a.has_chouden,
  a.has_other_offering,
  a.other_offering_note,
  a.paper_image_url,
  a.ocr_status,
  a.ocr_confidence,
  a.created_at,
  a.checked_in_at,
  a.updated_at,
  a.deleted_at,
  -- 香典額は owner / staff だけ実値、viewer は NULL
  CASE
    WHEN ceremony_member_role(a.ceremony_id) IN ('owner', 'staff')
      THEN a.koden_amount
    ELSE NULL
  END AS koden_amount
FROM attendees a;

-- VIEW は SECURITY INVOKER（呼び出し元の権限）で動くので、attendees の RLS が連鎖適用される
ALTER VIEW attendees_safe SET (security_invoker = true);
