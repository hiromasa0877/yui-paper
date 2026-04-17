export type Ceremony = {
  id: string;
  name: string;
  deceased_name: string;
  venue: string;
  ceremony_date: string;
  mourner_user_id: string | null;
  created_at: string;
  updated_at: string;
  qr_code_url: string | null;
};

export type OcrStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'review_needed';

/**
 * OCRで抽出した個別フィールドのスニペット。
 * lib/ocr.ts の Gemini 出力スキーマと対応。
 */
export type OcrExtractedField = {
  value: string | null;
  confidence: number | null;
};

export type OcrExtractedFields = {
  full_name?: OcrExtractedField;
  furigana?: OcrExtractedField;
  postal_code?: OcrExtractedField;
  address?: OcrExtractedField;
  phone?: OcrExtractedField;
  relation?: OcrExtractedField;
  // 任意の追加フィールドも許容
  [key: string]: OcrExtractedField | undefined;
};

export type Attendee = {
  id: string;
  ceremony_id: string;
  full_name: string;
  furigana: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  koden_amount: number | null;
  koden_number: number | null;
  checked_in: boolean;
  check_in_method: 'smart' | 'paper_ocr' | 'concierge' | null;
  relation: string | null;
  notes: string | null;
  has_kuge: boolean;
  has_kumotsu: boolean;
  has_chouden: boolean;
  has_other_offering: boolean;
  other_offering_note: string | null;
  // --- 紙OCR関連（マイグレーション006で追加） ---
  paper_image_url: string | null;
  ocr_status: OcrStatus | null;
  ocr_confidence: number | null;
  ocr_extracted_fields: OcrExtractedFields | null;
  ocr_raw_text: string | null;
  // ---
  created_at: string;
  checked_in_at: string | null;
  updated_at: string;
  deleted_at: string | null;
};

export type CheckInStatus = 'smart' | 'paper_ocr' | 'concierge';

export type Relation = '親族' | '友人' | '会社関係' | '近所' | 'その他';

export type ZipCloudResponse = {
  results: Array<{
    zipcode: string;
    address1: string;
    address2: string;
    address3: string;
    kana1: string;
    kana2: string;
    kana3: string;
  }> | null;
};
