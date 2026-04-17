/**
 * OCR パイプライン: Google Cloud Vision + Gemini 1.5 Flash
 *
 * 役割分担:
 *  - Vision API : 画像 → 全文テキスト（手書き対応）
 *  - Gemini     : 生テキスト → 構造化フィールド（氏名/ふりがな/郵便番号/住所/関係）
 *
 * なぜ2段構えか:
 *  式場ごとに芳名帳のレイアウトがバラバラなので、位置ベースのテンプレート抽出は成立しない。
 *  Vision単独だと「どこが氏名か」を判断できないため、テキスト→構造化は LLM に任せる。
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type OcrExtractedFields = {
  full_name?: { value: string; confidence: number };
  furigana?: { value: string; confidence: number };
  postal_code?: { value: string; confidence: number };
  address?: { value: string; confidence: number };
  relation?: { value: string; confidence: number };
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

let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI {
  if (geminiClient) return geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is not set');
  geminiClient = new GoogleGenerativeAI(apiKey);
  return geminiClient;
}

/**
 * Vision API で画像から全文テキスト抽出
 * 手書き日本語にも対応（DOCUMENT_TEXT_DETECTION を使用）
 */
async function runVisionOcr(imageBuffer: Buffer): Promise<{
  text: string;
  avgConfidence: number;
}> {
  const client = getVisionClient();
  const [result] = await client.documentTextDetection({
    image: { content: imageBuffer },
  });

  const fullText = result.fullTextAnnotation?.text ?? '';

  // ブロックごとの平均信頼度を計算
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
 * Gemini でテキスト → 構造化フィールド
 */
async function runGeminiExtraction(
  rawText: string
): Promise<OcrExtractedFields> {
  const gen = getGeminiClient();
  const model = gen.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const prompt = `以下は葬儀の芳名帳から OCR で読み取った日本語テキストです。
参列者の情報を抽出し、下記JSONスキーマに沿って返してください。

【抽出対象】
- full_name: 参列者の氏名（漢字表記）
- furigana: ふりがな（ひらがな/カタカナ）
- postal_code: 郵便番号（7桁、ハイフンなし）
- address: 住所（都道府県から含む完全な形）
- relation: 参列者と故人の関係。以下のいずれか:
    "親族" / "友人" / "会社関係" / "近所" / "その他" / ""

【信頼度の付け方】
各フィールドに confidence（0.0〜1.0の数値）を付けてください。基準:
- 1.0 : OCRテキストに明確に書かれており、誤読の余地なし
- 0.8 : 書かれているが文字の誤読が一部ありうる
- 0.5 : 推測込み
- 0.0 : 判断不能／該当なし

【出力JSONスキーマ】
{
  "full_name":   { "value": "...", "confidence": 0.0 },
  "furigana":    { "value": "...", "confidence": 0.0 },
  "postal_code": { "value": "...", "confidence": 0.0 },
  "address":     { "value": "...", "confidence": 0.0 },
  "relation":    { "value": "...", "confidence": 0.0 }
}

【OCRテキスト】
---
${rawText}
---

JSONのみを返答してください。`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  try {
    return JSON.parse(responseText) as OcrExtractedFields;
  } catch (e) {
    console.error('Gemini JSON parse error:', e, 'raw:', responseText);
    return {};
  }
}

/**
 * 全体の信頼度を計算（最低値を採用 — 一つでも低ければ全体が低い扱い）
 */
function calcOverallConfidence(ex: OcrExtractedFields): number {
  const vals: number[] = [];
  if (ex.full_name?.confidence != null) vals.push(ex.full_name.confidence);
  if (ex.furigana?.confidence != null) vals.push(ex.furigana.confidence);
  if (ex.postal_code?.confidence != null) vals.push(ex.postal_code.confidence);
  if (ex.address?.confidence != null) vals.push(ex.address.confidence);
  // relationは任意項目なので除外
  if (vals.length === 0) return 0;
  return Math.min(...vals);
}

/**
 * 画像1枚をOCR → 構造化まで実行
 */
export async function processOcr(imageBuffer: Buffer): Promise<OcrResult> {
  const { text: rawText, avgConfidence: visionConf } = await runVisionOcr(
    imageBuffer
  );

  if (!rawText.trim()) {
    // Vision が何も読み取れなかった
    return {
      raw_text: '',
      extracted: {},
      overall_confidence: 0,
      needs_review: true,
    };
  }

  const extracted = await runGeminiExtraction(rawText);
  const overall = Math.min(calcOverallConfidence(extracted), visionConf);

  return {
    raw_text: rawText,
    extracted,
    overall_confidence: overall,
    needs_review: overall < REVIEW_THRESHOLD,
  };
}
