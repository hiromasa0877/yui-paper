/**
 * POST /api/reception/scan
 *
 * 受付スキャンのメイン処理:
 *  1. multipart/form-data で { ceremony_id, image } を受け取る
 *  2. 受付番号(= koden_number)を即時採番して attendees にINSERT
 *     （OCRが失敗しても番号は必ず返す＝受付を止めない）
 *  3. 画像を Supabase Storage にアップロード
 *  4. Vision + Gemini で OCR → 構造化データ取得
 *  5. attendees を OCR結果で更新
 *  6. { attendee_id, koden_number, ocr_status, extracted } を返す
 *
 * 設計意図:
 *  番号採番は必ず成功、OCRは失敗許容。これにより電波や API 障害があっても
 *  受付オペレーションが止まらず、後からレビュー画面で修正可能。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processOcr } from '@/lib/ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OCR (Vision + Gemini multimodal) には数秒かかることがあるため上限を引き上げる
// Vercel Hobbyプランは最大60秒。Pro以上は300秒まで延長可能。
export const maxDuration = 60;

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

async function assignNextNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ceremonyId: string,
  maxRetries = 8
): Promise<{ attendeeId: string; kodenNumber: number }> {
  let lastError: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: rows } = await supabase
      .from('attendees')
      .select('koden_number')
      .eq('ceremony_id', ceremonyId)
      .not('koden_number', 'is', null)
      .order('koden_number', { ascending: false })
      .limit(1);
    const next = (rows?.[0]?.koden_number ?? 0) + 1;

    const { data, error } = await supabase
      .from('attendees')
      .insert({
        ceremony_id: ceremonyId,
        full_name: '(受付中)',
        koden_number: next,
        checked_in: true,
        check_in_method: 'concierge',
        checked_in_at: new Date().toISOString(),
        ocr_status: 'processing',
      })
      .select('id, koden_number')
      .single();

    if (!error && data) {
      return { attendeeId: data.id, kodenNumber: data.koden_number };
    }
    lastError = error;
    if (error?.code !== '23505') {
      throw error ?? new Error('insert failed');
    }
  }
  throw lastError ?? new Error('番号採番リトライ上限');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const ceremonyId = formData.get('ceremony_id');
    const image = formData.get('image');

    if (typeof ceremonyId !== 'string') {
      return NextResponse.json(
        { error: 'ceremony_id is required' },
        { status: 400 }
      );
    }
    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'image is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // ① 番号の即時採番＆プレースホルダINSERT
    const { attendeeId, kodenNumber } = await assignNextNumber(
      supabase,
      ceremonyId
    );

    // ② 画像をStorageにアップロード
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const ext = image.name.split('.').pop() || 'jpg';
    const storagePath = `${ceremonyId}/${attendeeId}.${ext}`;
    let publicPath: string | null = null;

    const { error: uploadError } = await supabase.storage
      .from('paper-forms')
      .upload(storagePath, imageBuffer, {
        contentType: image.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.warn('画像アップロード失敗:', uploadError);
    } else {
      publicPath = storagePath;
    }

    // ③ OCR 実行（mimeTypeを渡してGeminiの画像理解精度を上げる）
    let ocrFailed = false;
    let ocrResult: Awaited<ReturnType<typeof processOcr>> | null = null;
    try {
      ocrResult = await processOcr(imageBuffer, image.type || undefined);
    } catch (e) {
      console.error('OCR実行エラー:', e);
      ocrFailed = true;
    }

    // ④ attendeesを更新
    const updatePayload: Record<string, any> = {
      paper_image_url: publicPath,
    };

    if (ocrFailed || !ocrResult) {
      updatePayload.ocr_status = 'failed';
      updatePayload.full_name = '(要確認)';
    } else {
      const ex = ocrResult.extracted;
      updatePayload.ocr_status = ocrResult.needs_review
        ? 'review_needed'
        : 'success';
      updatePayload.ocr_confidence = ocrResult.overall_confidence;
      updatePayload.ocr_extracted_fields = ex;
      updatePayload.ocr_raw_text = ocrResult.raw_text;
      updatePayload.full_name = ex.full_name?.value || '(要確認)';
      updatePayload.postal_code = ex.postal_code?.value || null;
      updatePayload.address = ex.address?.value || null;
      updatePayload.relation = ex.relation?.value || null;
      // ふりがなは007マイグレーションで追加した専用カラムへ
      if (ex.furigana?.value) {
        updatePayload.furigana = ex.furigana.value;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('attendees')
      .update(updatePayload)
      .eq('id', attendeeId)
      .select()
      .single();

    if (updateError) {
      console.error('attendees更新エラー:', updateError);
    }

    return NextResponse.json({
      attendee_id: attendeeId,
      koden_number: kodenNumber,
      ocr_status: updatePayload.ocr_status,
      extracted: ocrResult?.extracted ?? {},
      needs_review: ocrResult?.needs_review ?? true,
      image_path: publicPath,
      attendee: updated,
    });
  } catch (err: any) {
    console.error('scan route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
