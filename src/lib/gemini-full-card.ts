/**
 * Gemini による芳名カード全文解析
 *
 * Vision + キーワードパーサは、印字ラベルと手書きが入り組んだ芳名カードで
 * 氏名・住所・電話番号・チェックボックスを揃って取り損なうことが多かった。
 *
 * ここでは画像そのものを Gemini に渡し、カード上の各欄を個別に質問して
 * 構造化された JSON を直接もらう。画像回転・緑のインク・手書きの乱雑さに
 * Gemini が強いのを活かす設計。
 *
 * コスト最適化:
 *  - 画像は長辺 1600px 以下に事前リサイズ（元の半分）
 *  - プロンプトは必要最小限
 *  - 出力 JSON は 300 tokens 程度に収まるよう項目を絞る
 *  → 1 スキャンあたり $0.0004-0.0005 程度に抑制
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

export type RelationKey =
  | 'relative' // 親族
  | 'friend' // 友人
  | 'company' // 会社関係・業界
  | 'government' // 官公庁
  | 'neighbor' // ご近所・町内会
  | 'school' // 学校
  | 'other' // その他
  | null;

export type FullCardResult = {
  full_name?: string | null;
  furigana?: string | null;
  postal_code?: string | null;
  address?: string | null;
  phone?: string | null;
  company?: string | null;
  relation?: RelationKey;
  event_type?: 'tsuuya' | 'kokubetsu' | 'both' | null;
  has_kuge?: boolean;
  has_kumotsu?: boolean;
  has_chouden?: boolean;
  has_other_offering?: boolean;
  overall_confidence?: number;
  confidence?: {
    full_name?: number;
    postal_code?: number;
    address?: number;
    phone?: number;
    relation?: number;
  };
};

const RELATION_JA_LABELS: Record<NonNullable<RelationKey>, string> = {
  relative: '親族',
  friend: '友人',
  company: '会社関係',
  government: '官公庁',
  neighbor: '近所',
  school: '学校',
  other: 'その他',
};

const RELATION_JA_TO_KEY: Record<string, RelationKey> = {
  親族: 'relative',
  ご親族: 'relative',
  親戚: 'relative',
  ご親戚: 'relative',
  友人: 'friend',
  ご友人: 'friend',
  会社: 'company',
  会社関係: 'company',
  業界: 'company',
  官公庁: 'government',
  近所: 'neighbor',
  御近所: 'neighbor',
  ご近所: 'neighbor',
  町内会: 'neighbor',
  学校: 'school',
  その他: 'other',
  一般: 'other',
  なし: null,
  未記入: null,
};

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (client) return client;
  client = new GoogleGenerativeAI(apiKey);
  return client;
}

const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
].filter((m): m is string => !!m && m.length > 0);

/**
 * Gemini 入力用に画像を 1600px 以下に縮小して JPEG 化。
 * 既に小さい画像はそのまま返す。
 */
async function resizeForGemini(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.warn('[full-card] Gemini用リサイズ失敗、元画像使用:', err);
    return input;
  }
}

/**
 * 芳名カード画像を Gemini に渡して全フィールドを一度に取得する。
 * 失敗時は空オブジェクトを返す（OCR全体を止めない）。
 */
export async function analyzeFullCard(
  imageBuffer: Buffer,
  originalMimeType: string = 'image/jpeg'
): Promise<FullCardResult> {
  const gen = getClient();
  if (!gen) {
    console.warn('[full-card] GEMINI_API_KEY 未設定のためフル解析スキップ');
    return {};
  }

  const resized = await resizeForGemini(imageBuffer);

  const prompt = `この画像は葬儀の芳名カード（参列者が自分の情報を記入する紙）です。
カードが回転していても内容を正しく読み取ってください。
手書き文字は緑・青・黒など様々な色で書かれていることがあります。

【読み取る項目】
1. ご芳名欄の手書き氏名（姓名、「様」は含めない、姓と名の間にスペース1つ）
2. ふりがな欄（あれば）
3. 郵便番号（7桁）
4. ご住所欄の手書き住所（都道府県から）
5. 電話番号（ハイフン付き）
6. 会社名・団体名欄（あれば）
7. ご関係のチェック項目（■または✓が付いているもの）
8. 通夜 / 告別式 のチェック
9. 供花・供物・弔電・その他供え物のチェック

【チェックボックスの判別】
- □ は未チェック（false 扱い）
- ■ または ✓ または 塗りつぶしがあればチェック済み（true）

【必ず以下のJSON形式のみで回答してください】
{
  "full_name": "姓 名" または "",
  "furigana": "ふりがな" または "",
  "postal_code": "1234567" または "",
  "address": "住所全文" または "",
  "phone": "09012345678" または "0312345678" または "",
  "company": "会社名" または "",
  "relation": "親族" | "友人" | "会社" | "官公庁" | "近所" | "学校" | "その他" | "なし",
  "event_type": "通夜" | "告別式" | "両方" | "なし",
  "has_kuge": true or false,
  "has_kumotsu": true or false,
  "has_chouden": true or false,
  "has_other_offering": true or false,
  "confidence": {
    "full_name": 0.0-1.0,
    "address": 0.0-1.0,
    "phone": 0.0-1.0,
    "relation": 0.0-1.0
  }
}

判読不能な文字は空文字 "" にし、該当フィールドの confidence を 0.3 以下にしてください。
コードブロックや前置きは不要、JSON 本体のみ返してください。`;

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: resized.toString('base64'),
    },
  };

  let lastError: any = null;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = gen.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0,
          maxOutputTokens: 800,
        },
      });
      const started = Date.now();
      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text();
      console.log(
        `[full-card] Gemini ${modelName} 応答 (${Date.now() - started}ms) ${responseText.length}chars`
      );

      if (!responseText.trim() || responseText.trim() === '{}') {
        lastError = new Error('empty response from ' + modelName);
        continue;
      }

      const parsed = tryParse(responseText);
      if (!parsed || Object.keys(parsed).length === 0) {
        lastError = new Error('invalid or empty json from ' + modelName);
        continue;
      }

      return normalizeResult(parsed);
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[full-card] Gemini ${modelName} 失敗、次モデルへ:`,
        err?.message || err
      );
    }
  }
  console.error('[full-card] 全モデル失敗:', lastError);
  return {};
}

function normalizeResult(parsed: any): FullCardResult {
  const r: FullCardResult = {};

  r.full_name = nonEmpty(parsed.full_name);
  r.furigana = nonEmpty(parsed.furigana);
  r.postal_code = normalizePostal(parsed.postal_code);
  r.address = nonEmpty(parsed.address);
  r.phone = normalizePhone(parsed.phone);
  r.company = nonEmpty(parsed.company);

  // 関係は既知の日本語ラベルにマップ
  if (typeof parsed.relation === 'string') {
    const key = RELATION_JA_TO_KEY[parsed.relation.trim()] ?? null;
    r.relation = key;
  } else {
    r.relation = null;
  }

  // イベント種別
  if (parsed.event_type === '通夜') r.event_type = 'tsuuya';
  else if (parsed.event_type === '告別式') r.event_type = 'kokubetsu';
  else if (parsed.event_type === '両方') r.event_type = 'both';
  else r.event_type = null;

  r.has_kuge = !!parsed.has_kuge;
  r.has_kumotsu = !!parsed.has_kumotsu;
  r.has_chouden = !!parsed.has_chouden;
  r.has_other_offering = !!parsed.has_other_offering;

  // 信頼度集計
  const conf = parsed.confidence ?? {};
  r.confidence = {
    full_name: toConf(conf.full_name),
    address: toConf(conf.address),
    phone: toConf(conf.phone),
    relation: toConf(conf.relation),
  };

  const confVals: number[] = [];
  if (r.full_name) confVals.push(r.confidence.full_name ?? 0.5);
  if (r.address) confVals.push(r.confidence.address ?? 0.5);
  r.overall_confidence =
    confVals.length > 0 ? Math.min(...confVals) : 0;

  return r;
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePostal(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const digits = v.replace(/[^0-9]/g, '');
  return digits.length === 7 ? digits : null;
}

function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const clean = v.replace(/[^\d-]/g, '');
  const digits = clean.replace(/-/g, '');
  if (digits.length === 10 || digits.length === 11) return clean;
  return null;
}

function toConf(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {}
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

export function relationKeyToJa(key: RelationKey): string | null {
  if (!key) return null;
  return RELATION_JA_LABELS[key] ?? null;
}
