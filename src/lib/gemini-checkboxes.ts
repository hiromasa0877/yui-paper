/**
 * Gemini によるチェックボックス検出専用モジュール
 *
 * Vision API の documentTextDetection はテキストしか拾わず、
 * 芳名カードでよくある「■親族 □友人 □会社関係 □近所 □その他」のような
 * チェックボックスの塗り分けを判定できない。
 *
 * ここでは Gemini に画像を渡し、関係欄の選択状況と供物類の選択状況だけを
 * 問い合わせる。プロンプトを狭く絞っているので、全文構造化していた従来の
 * Gemini 利用と比べて応答が短く・速く・失敗しにくい。
 *
 * タイムアウトや応答不正時は空オブジェクトを返し、OCR全体の成功を阻害しない。
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export type CheckboxResult = {
  relation?: 'relative' | 'friend' | 'company' | 'neighbor' | 'other' | null;
  has_kuge?: boolean;
  has_kumotsu?: boolean;
  has_chouden?: boolean;
  has_other_offering?: boolean;
  confidence?: number;
};

const RELATION_JA_TO_KEY: Record<string, CheckboxResult['relation']> = {
  親族: 'relative',
  ご親族: 'relative',
  友人: 'friend',
  ご友人: 'friend',
  会社関係: 'company',
  会社: 'company',
  ご会社関係: 'company',
  近所: 'neighbor',
  ご近所: 'neighbor',
  その他: 'other',
  なし: null,
  未記入: null,
};

const RELATION_JA_LABELS: Record<NonNullable<CheckboxResult['relation']>, string> = {
  relative: '親族',
  friend: '友人',
  company: '会社関係',
  neighbor: '近所',
  other: 'その他',
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

export async function detectCheckboxes(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<CheckboxResult> {
  const gen = getClient();
  if (!gen) {
    console.warn('[checkbox] GEMINI_API_KEY 未設定のためチェックボックス検出スキップ');
    return {};
  }

  const prompt = `これは葬儀の芳名カードの写真です。チェックボックス（■/✓/○ などで塗られた枠）の状態だけを判定してください。

【確認する項目】
1. 故人との関係：親族 / 友人 / 会社関係 / 近所 / その他 のどれがチェックされているか
2. 供花（きょうか）欄にチェックがあるか
3. 供物（くもつ）欄にチェックがあるか
4. 弔電（ちょうでん）欄にチェックがあるか
5. 「その他」供え物欄にチェックがあるか

【出力形式】必ず以下のJSONだけを返してください:
{
  "relation": "親族" または "友人" または "会社関係" または "近所" または "その他" または "なし",
  "has_kuge": true または false,
  "has_kumotsu": true または false,
  "has_chouden": true または false,
  "has_other_offering": true または false,
  "confidence": 0.0〜1.0の数値
}

判別できない場合は relation="なし"、他は false、confidence=0 にしてください。手書きの✓マークやチェック塗り、塗りつぶした■も「チェックあり」とみなします。`;

  const imagePart = {
    inlineData: { mimeType, data: imageBuffer.toString('base64') },
  };

  let lastError: any = null;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = gen.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0, // 決定論的に
        },
      });
      const started = Date.now();
      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text();
      console.log(
        `[checkbox] Gemini ${modelName} 応答 (${Date.now() - started}ms) ${responseText.length}chars`
      );

      const parsed = tryParse(responseText);
      if (!parsed) {
        lastError = new Error('invalid json from ' + modelName);
        continue;
      }

      return {
        relation:
          RELATION_JA_TO_KEY[parsed.relation?.trim?.() ?? 'なし'] ?? null,
        has_kuge: !!parsed.has_kuge,
        has_kumotsu: !!parsed.has_kumotsu,
        has_chouden: !!parsed.has_chouden,
        has_other_offering: !!parsed.has_other_offering,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`[checkbox] Gemini ${modelName} 失敗、次にフォールバック:`, err?.message || err);
    }
  }
  console.error('[checkbox] 全モデル失敗:', lastError);
  return {};
}

export function relationKeyToJa(
  key: NonNullable<CheckboxResult['relation']> | undefined | null
): string | null {
  if (!key) return null;
  return RELATION_JA_LABELS[key] ?? null;
}

function tryParse(text: string): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
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
