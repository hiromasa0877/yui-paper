/**
 * POST /api/reception/scan
 *
 * 受付スキャンの「高速パス」:
 *  1. multipart/form-data で { ceremony_id, image } を受け取る
 *  2. 受付番号(= koden_number)を即時採番して attendees にINSERT
 *  3. 画像を Supabase Storage にアップロード
 *  4. { attendee_id, koden_number, image_path } を即返却
 *
 *  ★ OCRはここでは行わない（時間がかかるため）。
 *    クライアント側がこのレスポンス受領後、別途 /api/reception/process-ocr
 *    を fire-and-forget で叩いて非同期にOCRを走らせる。
 *
 * 設計意図:
 *  受付の現場で「番号がすぐ出る → スタッフが紙と袋に番号を書ける」が最重要。
 *  OCR は失敗してもレビュー画面で後から修正可能なため、UI を待たせない。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

/**
 * 既存のclient_refを再利用して冪等にレコードを返す。
 * 同じclient_refで2回呼ばれても1件しか作られない。
 * @returns 既存レコードがあれば true / 新規作成すべきなら false
 */
async function findExistingByClientRef(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clientRef: string | null
): Promise<{ attendeeId: string; kodenNumber: number } | null> {
  if (!clientRef) return null;
  const { data } = await supabase
    .from('attendees')
    .select('id, koden_number')
    .eq('client_ref', clientRef)
    .maybeSingle();
  if (data && data.koden_number != null) {
    return { attendeeId: data.id, kodenNumber: data.koden_number };
  }
  return null;
}

async function assignNextNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ceremonyId: string,
  clientRef: string | null,
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
        check_in_method: 'paper_ocr',
        checked_in_at: new Date().toISOString(),
        ocr_status: 'pending',
        client_ref: clientRef,
      })
      .select('id, koden_number')
      .single();

    if (!error && data) {
      return { attendeeId: data.id, kodenNumber: data.koden_number };
    }
    lastError = error;
    // 23505 は (ceremony_id, koden_number) または client_ref の重複
    // client_ref 衝突なら既存レコードを返却（冪等性）
    if (error?.code === '23505' && clientRef) {
      const existing = await findExistingByClientRef(supabase, clientRef);
      if (existing) return existing;
    }
    if (error?.code !== '23505') {
      throw error ?? new Error('insert failed');
    }
    // それ以外（番号衝突）はretry
  }
  throw lastError ?? new Error('番号採番リトライ上限');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const ceremonyId = formData.get('ceremony_id');
    const image = formData.get('image');
    const clientRefRaw = formData.get('client_ref');
    const clientRef =
      typeof clientRefRaw === 'string' && /^[0-9a-f-]{36}$/i.test(clientRefRaw)
        ? clientRefRaw
        : null;

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

    // ⓪ client_ref 既存チェック（同じ撮影が再送された場合は同じ番号を返す）
    const existing = await findExistingByClientRef(supabase, clientRef);
    if (existing) {
      // 既に画像とOCRが走っているはず。リクエスト元には同じ番号を返す。
      return NextResponse.json({
        attendee_id: existing.attendeeId,
        koden_number: existing.kodenNumber,
        ocr_status: 'pending',
        image_path: null, // 実際のpathは別経路で同期されている
        mime_type: image.type || 'image/jpeg',
        idempotent: true,
      });
    }

    // ① 受付番号の即時採番（client_ref付与）
    const { attendeeId, kodenNumber } = await assignNextNumber(
      supabase,
      ceremonyId,
      clientRef
    );

    // ② 画像をStorageにアップロード（OCRワーカーが後で読み出す）
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const ext = (image.name.split('.').pop() || 'jpg').toLowerCase();
    const storagePath = `${ceremonyId}/${attendeeId}.${ext}`;
    const mimeType = image.type || 'image/jpeg';
    let publicPath: string | null = null;

    const { error: uploadError } = await supabase.storage
      .from('paper-forms')
      .upload(storagePath, imageBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.warn('画像アップロード失敗:', uploadError);
      // 画像が無くてもOCRは走らせない方がいい
      await supabase
        .from('attendees')
        .update({ ocr_status: 'failed', full_name: '(要確認)' })
        .eq('id', attendeeId);
    } else {
      publicPath = storagePath;
      // 画像保存パスをすぐ反映（OCR完了は別経路で UPDATE される）
      await supabase
        .from('attendees')
        .update({ paper_image_url: publicPath })
        .eq('id', attendeeId);
    }

    // ③ 即時レスポンス（OCRはクライアントが別エンドポイントを叩く）
    return NextResponse.json({
      attendee_id: attendeeId,
      koden_number: kodenNumber,
      ocr_status: publicPath ? 'pending' : 'failed',
      image_path: publicPath,
      mime_type: mimeType,
    });
  } catch (err: any) {
    console.error('scan route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
