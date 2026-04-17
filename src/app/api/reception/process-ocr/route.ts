/**
 * POST /api/reception/process-ocr
 *
 * 非同期OCRワーカー。
 * /api/reception/scan が即時返却した後、クライアントが fetch(keepalive)
 * でこのエンドポイントを fire-and-forget で叩く。
 *
 * Input (JSON):
 *  - attendee_id: string  対象attendeeのID
 *  - image_path:  string  Storage上のパス（paper-forms バケット内）
 *  - mime_type?:  string  画像のMIMEタイプ（省略時は image/jpeg）
 *
 * 処理:
 *  1. Supabase Storage から画像を取得
 *  2. processOcr で Vision + Gemini multimodal を実行
 *  3. attendees を OCR結果で UPDATE
 *  4. 200 を返す（クライアントは結果を待っていないが、デバッグ用に簡易レス）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processOcr } from '@/lib/ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OCR (Vision + Gemini multimodal) には数秒かかるため余裕を持って60秒
export const maxDuration = 60;

/**
 * 郵便番号→住所のzipcloud検証。
 * 一致(match)/不一致(mismatch)/判定不能(unknown) を返す。
 *
 * 完全一致は求めず、ZIP由来の都道府県＋市区町村が
 * OCR住所の先頭部分に含まれていれば match と判定。
 */
async function crossValidatePostalCode(
  postalCode?: string | null,
  address?: string | null
): Promise<'match' | 'mismatch' | 'unknown'> {
  if (!postalCode || !address) return 'unknown';
  const cleanZip = postalCode.replace(/[^0-9]/g, '');
  if (cleanZip.length !== 7) return 'unknown';
  try {
    const url = `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanZip}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return 'unknown';
    const data: any = await res.json();
    const first = data?.results?.[0];
    if (!first) return 'unknown';
    const expectedPrefix = `${first.address1 || ''}${first.address2 || ''}`;
    if (!expectedPrefix) return 'unknown';
    // 全角/半角・空白の差を吸収するための正規化
    const normalize = (s: string) => s.replace(/[\s\u3000]/g, '');
    return normalize(address).startsWith(normalize(expectedPrefix))
      ? 'match'
      : 'mismatch';
  } catch (e) {
    console.warn('[ocr] zipcloud検証エラー（無視して続行）:', e);
    return 'unknown';
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase credentials missing');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  let attendeeId: string | null = null;
  try {
    const body = await req.json();
    attendeeId = typeof body?.attendee_id === 'string' ? body.attendee_id : null;
    const imagePath = typeof body?.image_path === 'string' ? body.image_path : null;
    const mimeType = typeof body?.mime_type === 'string' ? body.mime_type : 'image/jpeg';

    if (!attendeeId || !imagePath) {
      return NextResponse.json(
        { error: 'attendee_id and image_path are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 状態を processing に更新（レビュー画面でも見える）
    await supabase
      .from('attendees')
      .update({ ocr_status: 'processing' })
      .eq('id', attendeeId);

    // ① Storage から画像を取得
    const { data: blob, error: dlError } = await supabase.storage
      .from('paper-forms')
      .download(imagePath);

    if (dlError || !blob) {
      console.error('Storage download error:', dlError);
      await supabase
        .from('attendees')
        .update({ ocr_status: 'failed', full_name: '(要確認)' })
        .eq('id', attendeeId);
      return NextResponse.json(
        { error: dlError?.message || 'image download failed' },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(await blob.arrayBuffer());

    // ② OCR 実行
    let ocrResult: Awaited<ReturnType<typeof processOcr>> | null = null;
    try {
      ocrResult = await processOcr(imageBuffer, mimeType);
    } catch (e) {
      console.error('OCR実行エラー:', e);
      await supabase
        .from('attendees')
        .update({ ocr_status: 'failed', full_name: '(要確認)' })
        .eq('id', attendeeId);
      return NextResponse.json(
        { error: 'OCR processing failed', detail: String(e) },
        { status: 500 }
      );
    }

    // ③ DB 反映前に郵便番号と住所のクロス検証
    //    OCR読み取った郵便番号が住所と一致しなければ confidence を下げて要確認に
    const ex = ocrResult.extracted;
    let needsReview = ocrResult.needs_review;
    const zipValidation = await crossValidatePostalCode(
      ex.postal_code?.value,
      ex.address?.value
    );
    if (zipValidation === 'mismatch') {
      // 信頼度を強制的に下げて要確認に振る
      if (ex.postal_code) ex.postal_code.confidence = Math.min(ex.postal_code.confidence, 0.3);
      if (ex.address) ex.address.confidence = Math.min(ex.address.confidence, 0.3);
      needsReview = true;
      console.log('[ocr] 郵便番号と住所が一致せず要確認に振り分け');
    } else if (zipValidation === 'match') {
      console.log('[ocr] 郵便番号と住所のクロス検証OK');
    }

    const updatePayload: Record<string, any> = {
      ocr_status: needsReview ? 'review_needed' : 'success',
      ocr_confidence: ocrResult.overall_confidence,
      ocr_extracted_fields: ex,
      ocr_raw_text: ocrResult.raw_text,
      full_name: ex.full_name?.value || '(要確認)',
      postal_code: ex.postal_code?.value || null,
      address: ex.address?.value || null,
      relation: ex.relation?.value || null,
    };
    if (ex.furigana?.value) {
      updatePayload.furigana = ex.furigana.value;
    }

    const { error: updateError } = await supabase
      .from('attendees')
      .update(updatePayload)
      .eq('id', attendeeId);

    if (updateError) {
      console.error('attendees更新エラー:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      attendee_id: attendeeId,
      ocr_status: updatePayload.ocr_status,
      overall_confidence: ocrResult.overall_confidence,
    });
  } catch (err: any) {
    console.error('process-ocr route error:', err);
    if (attendeeId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase
          .from('attendees')
          .update({ ocr_status: 'failed', full_name: '(要確認)' })
          .eq('id', attendeeId);
      } catch {
        // best effort
      }
    }
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
