/**
 * OCR パイプライン: Google Cloud Vision 単独
 *
 * 設計方針:
 *  葬儀の芳名帳は「氏名:」「ふりがな:」「住所:」「郵便番号:」などのラベルが
 *  印字されているものがほとんど。Vision API (DOCUMENT_TEXT_DETECTION) で
 *  手書きを含むテキストを全文抽出し、キーワードベースで構造化する。
 *
 *  Gemini を呼ぶ従来方式よりも:
 *   - 速い（1〜2秒）
 *   - コスト低（Vision 無料枠内で収まる葬儀多数）
 *   - 失敗モードが少ない（空応答 `{}` が返る問題がなくなる）
 *
 *  任意レイアウト対応はまだ弱いため、信頼度低めのフィールドは review 画面へ振る。
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { preprocessForOcr } from './image-preprocess';
import { detectCheckboxes, relationKeyToJa } from './gemini-checkboxes';

export type OcrExtractedFields = {
  full_name?: { value: string; confidence: number };
  furigana?: { value: string; confidence: number };
  postal_code?: { value: string; confidence: number };
  address?: { value: string; confidence: number };
  phone?: { value: string; confidence: number };
  relation?: { value: string; confidence: number };
  // チェックボックス系（Geminiで検出）
  has_kuge?: { value: boolean; confidence: number };
  has_kumotsu?: { value: boolean; confidence: number };
  has_chouden?: { value: boolean; confidence: number };
  has_other_offering?: { value: boolean; confidence: number };
};

export type OcrResult = {
  raw_text: string;
  extracted: OcrExtractedFields;
  overall_confidence: number;
  needs_review: boolean;
};

// 信頼度しきい値: これを下回るフィールドが1つでもあれば「要確認」
const REVIEW_THRESHOLD = 0.7;

let visionClient: ImageAnnotatorClient | null = null;
function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) return visionClient;
  const credentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  if (!credentialsJson) {
    throw new Error('GOOGLE_CLOUD_CREDENTIALS_JSON env var is not set');
  }
  const credentials = JSON.parse(credentialsJson);
  visionClient = new ImageAnnotatorClient({ credentials });
  return visionClient;
}

/**
 * Vision API で画像から全文テキスト抽出
 * 手書き日本語にも対応（DOCUMENT_TEXT_DETECTION + 日本語ヒント）
 */
async function runVisionOcr(imageBuffer: Buffer): Promise<{
  text: string;
  avgConfidence: number;
}> {
  const client = getVisionClient();
  const [result] = await client.documentTextDetection({
    image: { content: imageBuffer },
    imageContext: {
      languageHints: ['ja'],
    },
  });

  const fullText = result.fullTextAnnotation?.text ?? '';

  let sum = 0;
  let count = 0;
  for (const page of result.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      if (typeof block.confidence === 'number') {
        sum += block.confidence;
        count++;
      }
    }
  }
  const avgConfidence = count > 0 ? sum / count : 0;

  return { text: fullText, avgConfidence };
}

/**
 * 芳名帳テキストからキーワードで各フィールドを抽出する。
 *
 * ラベルと値は改行あり・なし両方に対応。
 * ラベルの同義語も吸収（例: 名前/御芳名/ご芳名 → full_name）。
 */
function parseAttendeeFields(
  rawText: string,
  overallConfidence: number
): OcrExtractedFields {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // ラベル正規化マップ
  const labelMap: Array<{
    keys: RegExp;
    field: TextFieldKey;
  }> = [
    { keys: /^(氏名|お名前|御芳名|ご芳名|名前|姓名)[:：]?$/, field: 'full_name' },
    { keys: /^(ふりがな|フリガナ|ふりがな|振仮名)[:：]?$/, field: 'furigana' },
    { keys: /^(郵便番号|〒|ゆうびん番号)[:：]?$/, field: 'postal_code' },
    { keys: /^(住所|ご住所|お住まい|現住所|自宅住所)[:：]?$/, field: 'address' },
    { keys: /^(関係|ご関係|故人との関係)[:：]?$/, field: 'relation' },
  ];

  const fields: OcrExtractedFields = {};
  // 姓・名 が別々に書かれる芳名カード向けの一時バッファ
  let surname: string | null = null;
  let givenName: string | null = null;

  // パス1: 1行に「ラベル: 値」形式
  const inline: Array<{ field: TextFieldKey | 'surname' | 'given_name'; value: string }> = [];
  for (const line of lines) {
    // 「姓: 荻野」「名: 寛真」形式を先に拾う（短い方から評価）
    const sm = line.match(/^(姓|名字|苗字)\s*[:：]\s*(.+)$/);
    if (sm) {
      inline.push({ field: 'surname', value: sm[2].trim() });
      continue;
    }
    const gm = line.match(/^(名|下の名前|下名|名前$)\s*[:：]\s*(.+)$/);
    if (gm) {
      inline.push({ field: 'given_name', value: gm[2].trim() });
      continue;
    }
    // 一般ラベル「氏名: 荻野寛真」「住所：埼玉県…」形式
    const m = line.match(
      /^(氏名|お名前|御芳名|ご芳名|名前|姓名|ふりがな|フリガナ|振仮名|郵便番号|〒|住所|ご住所|お住まい|現住所|自宅住所|関係|ご関係|故人との関係)\s*[:：]\s*(.+)$/
    );
    if (m) {
      const label = normalizeLabel(m[1]);
      const value = m[2].trim();
      if (label && value) inline.push({ field: label, value });
    }
  }
  for (const { field, value } of inline) {
    if (field === 'surname') {
      surname = value;
    } else if (field === 'given_name') {
      givenName = value;
    } else {
      setField(fields, field, value, overallConfidence);
    }
  }

  // 姓と名が両方あれば結合して full_name に
  if (surname && givenName) {
    setField(fields, 'full_name', `${surname} ${givenName}`, overallConfidence);
  } else if (surname && !fields.full_name) {
    setField(fields, 'full_name', surname, overallConfidence * 0.6);
  }

  // パス2: ラベル単独行 → 次行を値とみなす
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    if (!next) continue;
    for (const { keys, field } of labelMap) {
      if (keys.test(current) && !(field in fields)) {
        setField(fields, field, next, overallConfidence * 0.9);
        break;
      }
    }
  }

  // 氏名が 1-2 文字だけの場合は信頼度を下げて要確認に振る
  if (fields.full_name) {
    const len = fields.full_name.value.replace(/\s/g, '').length;
    if (len <= 2) {
      fields.full_name.confidence = Math.min(fields.full_name.confidence, 0.4);
    }
  }

  // 電話番号を正規表現で抽出（ラベルに依存しない全文検索）
  // 日本の電話番号パターン: 0X-XXXX-XXXX / 0XX-XXXX-XXXX / 0XXX-XX-XXXX /
  //                         携帯 090-XXXX-XXXX / 080-XXXX-XXXX / 070-XXXX-XXXX
  // 全角数字・括弧・全角ハイフンも吸収
  if (!fields.phone) {
    const normalized = normalizeNumbers(rawText)
      .replace(/[（(]/g, '-')
      .replace(/[）)]/g, '-')
      .replace(/[ー−–—]/g, '-');
    const phonePatterns = [
      /(0\d{1,4})-?(\d{1,4})-?(\d{3,4})/g, // 一般・フリーダイヤル
    ];
    for (const pat of phonePatterns) {
      const matches = Array.from(normalized.matchAll(pat));
      for (const m of matches) {
        const digits = (m[1] + m[2] + m[3]).replace(/[^0-9]/g, '');
        // 10桁（固定電話）か11桁（携帯）を採用
        if (digits.length === 10 || digits.length === 11) {
          // 郵便番号7桁と混同しないように、〒プレフィックスや7桁単独は除外
          const context = rawText.slice(
            Math.max(0, rawText.indexOf(m[0]) - 5),
            rawText.indexOf(m[0])
          );
          if (!/〒|郵便/.test(context)) {
            setField(fields, 'phone', `${m[1]}-${m[2]}-${m[3]}`, overallConfidence * 0.85);
            break;
          }
        }
      }
      if (fields.phone) break;
    }
  }

  // 郵便番号は 7桁数字の個別サーチも（「〒123-4567」等）
  if (!fields.postal_code) {
    const zipMatch = rawText.match(/〒?\s*(\d{3})\s*[-ー]?\s*(\d{4})/);
    if (zipMatch) {
      setField(
        fields,
        'postal_code',
        `${zipMatch[1]}${zipMatch[2]}`,
        overallConfidence * 0.85
      );
    }
  }

  // 郵便番号の正規化（ハイフン・空白除去、数字変換）
  if (fields.postal_code) {
    const zip = normalizeNumbers(fields.postal_code.value).replace(/[^0-9]/g, '');
    if (zip.length === 7) {
      fields.postal_code.value = zip;
    } else {
      fields.postal_code.confidence = Math.min(
        fields.postal_code.confidence,
        0.5
      );
    }
  }

  // 氏名未検出なら、テキスト最上位の短い行を候補に（ラベル除く）
  if (!fields.full_name) {
    const cand = lines.find(
      (l) =>
        l.length <= 12 &&
        /[\u4e00-\u9fafぁ-んァ-ヶ々]/.test(l) &&
        !/[:：\d〒]/.test(l)
    );
    if (cand) {
      setField(fields, 'full_name', cand, 0.4); // 推測なので低信頼度
    }
  }

  return fields;
}

function normalizeLabel(label: string): TextFieldKey | null {
  if (/氏名|お名前|御芳名|ご芳名|名前|姓名/.test(label)) return 'full_name';
  if (/ふりがな|フリガナ|振仮名/.test(label)) return 'furigana';
  if (/郵便番号|〒|ゆうびん番号/.test(label)) return 'postal_code';
  if (/住所|ご住所|お住まい|現住所|自宅住所/.test(label)) return 'address';
  if (/関係|ご関係|故人との関係/.test(label)) return 'relation';
  return null;
}

// テキストフィールドのみ（チェックボックスのbooleanフィールドは別扱い）
type TextFieldKey = 'full_name' | 'furigana' | 'postal_code' | 'address' | 'phone' | 'relation';

function setField(
  fields: OcrExtractedFields,
  field: TextFieldKey,
  value: string,
  confidence: number
) {
  const cleaned = value.replace(/[\s\u3000]+$/, '').trim();
  if (!cleaned) return;
  const existing = fields[field];
  if (existing && (existing.value?.length ?? 0) >= cleaned.length) return;
  fields[field] = {
    value: cleaned,
    confidence: Math.min(Math.max(confidence, 0), 1),
  };
}

/**
 * 全角数字→半角数字
 */
function normalizeNumbers(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/**
 * 全体の信頼度を計算（必須フィールドの最低値）
 */
function calcOverallConfidence(ex: OcrExtractedFields): number {
  const vals: number[] = [];
  if (ex.full_name?.confidence != null) vals.push(ex.full_name.confidence);
  if (ex.address?.confidence != null && ex.address.value) {
    vals.push(ex.address.confidence);
  }
  if (vals.length === 0) return 0;
  return Math.min(...vals);
}

/**
 * 画像1枚をOCR → 構造化まで実行（Vision単独、Gemini不使用）
 *
 * 1. sharp で画像前処理（コントラスト強調・シャープネス・グレースケール）
 * 2. Vision API で全文テキスト抽出
 * 3. キーワードマッチで構造化
 */
export async function processOcr(
  imageBuffer: Buffer,
  // 互換性のため残すが未使用
  _mimeTypeHint?: string
): Promise<OcrResult> {
  const started = Date.now();

  // ① 画像前処理（失敗しても元画像で続行）
  const pre = await preprocessForOcr(imageBuffer);
  const preprocessMs = Date.now() - started;

  // ② Vision OCR と Gemini チェックボックス検出を並列実行
  //    Gemini は関係/供え物チェック欄のみ判定する軽量プロンプトを使うため高速。
  const visionStarted = Date.now();
  const [visionResult, checkboxes] = await Promise.all([
    runVisionOcr(pre.buffer),
    detectCheckboxes(pre.buffer, pre.mimeType).catch((e) => {
      console.warn('[ocr] チェックボックス検出失敗:', e);
      return {} as Awaited<ReturnType<typeof detectCheckboxes>>;
    }),
  ]);
  const { text: rawText, avgConfidence: visionConf } = visionResult;
  const visionMs = Date.now() - visionStarted;
  console.log(
    `[ocr] 前処理 ${preprocessMs}ms + Vision+Gemini並列 ${visionMs}ms, 文字数=${rawText.length}, avgConfidence=${visionConf.toFixed(2)}, 前処理適用=${pre.appliedPreprocess}`
  );

  if (!rawText.trim()) {
    return {
      raw_text: '',
      extracted: {},
      overall_confidence: 0,
      needs_review: true,
    };
  }

  const extracted = parseAttendeeFields(rawText, visionConf);
  console.log(
    `[ocr] キーワード解析完了 抽出件数=${Object.keys(extracted).length}`
  );

  // ③ Gemini チェックボックス結果をマージ
  //    Gemini が検出した関係を parser の relation に優先で上書き
  //    （Visionでラベル位置に無く、チェックボックス塗りで表現される芳名カード向け）
  if (checkboxes.relation) {
    const relJa = relationKeyToJa(checkboxes.relation);
    if (relJa) {
      extracted.relation = {
        value: relJa,
        confidence: checkboxes.confidence ?? 0.75,
      };
    }
  }
  // 供え物フラグはboolean値で格納
  const cbConf = checkboxes.confidence ?? 0.7;
  if (checkboxes.has_kuge !== undefined) {
    extracted.has_kuge = { value: checkboxes.has_kuge, confidence: cbConf };
  }
  if (checkboxes.has_kumotsu !== undefined) {
    extracted.has_kumotsu = { value: checkboxes.has_kumotsu, confidence: cbConf };
  }
  if (checkboxes.has_chouden !== undefined) {
    extracted.has_chouden = { value: checkboxes.has_chouden, confidence: cbConf };
  }
  if (checkboxes.has_other_offering !== undefined) {
    extracted.has_other_offering = {
      value: checkboxes.has_other_offering,
      confidence: cbConf,
    };
  }

  const fieldConf = calcOverallConfidence(extracted);
  // 抽出できなかった必須フィールドがあれば全体信頼度を下げる
  const missingPenalty = !extracted.full_name ? 0.3 : 1.0;
  const overall = Math.min(fieldConf * missingPenalty, visionConf);

  return {
    raw_text: rawText,
    extracted,
    overall_confidence: overall,
    needs_review: overall < REVIEW_THRESHOLD || !extracted.full_name,
  };
}
