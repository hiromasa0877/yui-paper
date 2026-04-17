/**
 * OCR パイプライン: Google Cloud Vision + Gemini 2.5 Flash (multimodal)
 *
 * 役割分担:
 *  - Vision API : 画像 → 全文テキスト（手書き対応、日本語ヒント付き）
 *  - Gemini     : 画像 + Visionテキスト → 構造化フィールド
 *                 ※ Geminiにも画像を直接渡すことで、Visionが誤読した文字を
 *                   画像から再判定できるようになり大幅に精度が上がる。
 *
 * なぜ2段構えか:
 *  式場ごとに芳名帳のレイアウトがバラバラなので、位置ベースのテンプレート抽出は成立しない。
 *  Vision のテキスト化は誤りを含むため、Gemini に「画像を見ながら検証してね」と頼む。
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

// Gemini モデル名（フォールバック順）
// gemini-2.5-flash は @google/generative-ai SDK 0.21.0 では未認識のため、
// 安定版の 2.0-flash をプライマリに、1.5-flash をフォールバックに。
// 環境変数 GEMINI_MODEL を設定すれば最優先で試行される。
const GEMINI_MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
].filter((m): m is string => !!m && m.length > 0);

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
      // 日本語に最適化（多言語モデルから日本語特化モデルに切り替わる）
      languageHints: ['ja'],
    },
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
 * Gemini に画像 + Visionテキストを渡して構造化抽出
 *
 * - 画像を直接渡すことで、Visionが誤読した文字を Gemini が再判定可能に
 * - 利用可能な最新モデルを順に試す（2.5 → 2.0 → 1.5）
 */
async function runGeminiExtraction(
  rawText: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<OcrExtractedFields> {
  const gen = getGeminiClient();

  const prompt = `あなたは葬儀の芳名帳から参列者情報を抽出する専門アシスタントです。
画像に写っている日本人の手書き文字を慎重に読み取ってください。

【入力】
1) 添付画像: 紙の芳名帳をカメラで撮影したもの（手書き）
2) 参考テキスト: Google Vision OCR が同じ画像を読み取った結果（誤読を含む可能性あり）

【最重要ルール】
- **画像を一次情報として優先**してください。Vision OCR テキストは補助参考程度です。
- Vision OCR が誤読していると判断したら、画像から読み取った文字を採用してください。
- 「氏名」欄の文字は特に丁寧に読み取ってください。崩し字・略字も葬儀で使われがちな苗字を念頭に推測してください。

【日本人氏名の読み取り注意】
葬儀芳名帳でよく登場する旧字体・異体字（旧字優先で記載されることが多い）:
  齋藤/斎藤/斉藤、髙橋/高橋、邊/邉/辺、渡邊/渡邉/渡辺、櫻井/桜井、
  廣瀬/広瀬、栁澤/柳沢、嶋田/島田、尾﨑/尾崎、宮﨑/宮崎、福澤/福沢、
  内藤、髙田/高田、德/徳、藏/蔵、龍/竜、瀧/滝、澤/沢
画像で旧字体が書かれていたら、新字に変換せずそのまま採用してください。

【数字の読み取り注意】
郵便番号、住所の番地、電話番号は「1」と「7」、「3」と「8」、「0」と「6」、「9」と「4」を
取り違えやすいです。確信が持てない数字は confidence を下げてください（誤った高信頼度より要確認の方が遥かに親切）。

【抽出対象】
- full_name: 参列者の氏名（漢字表記、姓名の間に半角スペース）
- furigana: ふりがな（ひらがな、カタカナの場合はひらがなに変換）
- postal_code: 郵便番号（7桁、ハイフンなし、半角数字）
- address: 住所（都道府県から含む完全な形）
- relation: 故人との関係。次のいずれか:
    "親族" / "友人" / "会社関係" / "近所" / "その他" / ""

【信頼度の付け方（重要）】
各フィールドに confidence（0.0〜1.0の数値）を付けてください。基準:
- 1.0 : 画像から明確に読み取れた／OCRと完全一致
- 0.8 : 画像から読み取れたが一部不明瞭
- 0.5 : 推測込み（崩し字、欠損、暗い等）
- 0.3 : かなり怪しい（要確認候補）
- 0.0 : 該当欄が空白／読み取り不能

判断に迷う場合は信頼度を低くして「要確認」に振り分けてください。誤った高信頼度より遥かに親切です。

【出力JSONスキーマ】（必ずこの形式で返答）
{
  "full_name":   { "value": "山田 太郎", "confidence": 0.0 },
  "furigana":    { "value": "やまだ たろう", "confidence": 0.0 },
  "postal_code": { "value": "1234567", "confidence": 0.0 },
  "address":     { "value": "東京都新宿区西新宿1-2-3", "confidence": 0.0 },
  "relation":    { "value": "", "confidence": 0.0 }
}

【参考: Vision OCR テキスト】
---
${rawText || '(空)'}
---

JSONのみを返答してください。コードブロックや前後の説明文は不要です。`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: imageBuffer.toString('base64'),
    },
  };

  let lastError: any = null;
  for (const modelName of GEMINI_MODEL_CANDIDATES) {
    try {
      console.log(`[ocr] Geminiモデル試行: ${modelName}`);
      const model = gen.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text();
      console.log(
        `[ocr] Gemini ${modelName} 応答長: ${responseText.length} chars, 先頭200: ${responseText.substring(0, 200)}`
      );

      // 空応答は明確に失敗扱いにして次のモデルへ
      if (!responseText.trim() || responseText.trim() === '{}') {
        console.warn(`[ocr] Gemini ${modelName} が空応答を返却。次のモデルへフォールバック`);
        lastError = new Error(`empty response from ${modelName}`);
        continue;
      }

      const parsed = tryParseJson(responseText);
      if (parsed && Object.keys(parsed).length > 0) {
        console.log(
          `[ocr] Gemini ${modelName} 解析成功。フィールド数: ${Object.keys(parsed).length}`
        );
        return parsed as OcrExtractedFields;
      }
      console.warn(
        `[ocr] Gemini ${modelName} の応答をパースしたが空オブジェクト。次のモデルへフォールバック`
      );
      lastError = new Error(`parsed but empty from ${modelName}: ${responseText.substring(0, 100)}`);
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[ocr] Gemini ${modelName} 呼び出し失敗。次の候補にフォールバック:`,
        err?.message || err
      );
    }
  }

  console.error('[ocr] 全Geminiモデル候補で失敗:', lastError);
  return {};
}

/**
 * Gemini からの応答をできるだけ寛容にJSONとしてパースする。
 * - 純粋なJSON
 * - ```json ... ``` のコードブロック包み
 * - 余計な前置きテキスト + JSON 本体
 * のいずれでも拾えるようにする。
 */
function tryParseJson(text: string): Record<string, any> | null {
  if (!text) return null;

  // 1) そのままパース
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 2) コードブロックを剥がしてパース
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // continue
  }

  // 3) 最初の { から対応する } までを抽出してパース
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * 全体の信頼度を計算（最低値を採用 — 一つでも低ければ全体が低い扱い）
 */
function calcOverallConfidence(ex: OcrExtractedFields): number {
  const vals: number[] = [];
  // 必須フィールドのみ評価対象（relation/furiganaは欠落しても受付は可能なので除外）
  if (ex.full_name?.confidence != null) vals.push(ex.full_name.confidence);
  if (ex.address?.confidence != null && ex.address.value) {
    vals.push(ex.address.confidence);
  }
  if (vals.length === 0) return 0;
  return Math.min(...vals);
}

/**
 * MIMEタイプを画像バッファから推定（先頭バイトでざっくり判定）
 */
function detectMimeType(buf: Buffer): string {
  if (buf.length >= 4) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return 'image/png';
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      return 'image/webp';
    }
    // HEIC: ftyp box
    if (buf.length >= 12 && buf.slice(4, 8).toString() === 'ftyp') {
      const brand = buf.slice(8, 12).toString();
      if (['heic', 'heix', 'mif1'].includes(brand)) return 'image/heic';
    }
  }
  return 'image/jpeg'; // デフォルト
}

/**
 * 画像1枚をOCR → 構造化まで実行
 */
export async function processOcr(
  imageBuffer: Buffer,
  mimeTypeHint?: string
): Promise<OcrResult> {
  const mimeType =
    mimeTypeHint && mimeTypeHint.startsWith('image/')
      ? mimeTypeHint
      : detectMimeType(imageBuffer);

  // ① Vision OCR（テキスト化）
  let rawText = '';
  let visionConf = 0;
  try {
    const visionResult = await runVisionOcr(imageBuffer);
    rawText = visionResult.text;
    visionConf = visionResult.avgConfidence;
  } catch (err) {
    // Vision がエラーでも Gemini に画像を渡せば抽出できる可能性があるので続行
    console.warn('Vision OCR失敗、Geminiの画像読み取り単独で続行:', err);
  }

  // ② Gemini で画像 + テキストから構造化
  const extracted = await runGeminiExtraction(rawText, imageBuffer, mimeType);

  // ③ 全体信頼度を判定
  const geminiConf = calcOverallConfidence(extracted);
  // Visionが完全失敗した場合は Vision の信頼度0で全体を引き下げないよう、Geminiの値のみ使う
  const overall = visionConf > 0 ? Math.min(geminiConf, visionConf) : geminiConf;

  return {
    raw_text: rawText,
    extracted,
    overall_confidence: overall,
    needs_review: overall < REVIEW_THRESHOLD,
  };
}
