/**
 * GET /api/admin/cleanup-old-images
 *
 * 1年以上前の芳名カードスキャン画像を Supabase Storage から削除し、
 * attendees.paper_image_url を NULL に更新する。
 *
 * 設計方針:
 *  - DB レコード自体は永続保持（氏名・香典金額などの構造化データは残す）。
 *  - 重い画像ファイルだけを 1 年で削除し、ストレージコスト累積を抑える。
 *  - 既存のレビュー画面は paper_image_url が NULL/取得失敗時に「画像なし」表示する
 *    フォールバックを既に持っているため、画面崩れは起きない。
 *
 * 起動経路:
 *  - Vercel Cron（vercel.json の crons に登録）から日次で叩かれる。
 *  - Vercel Cron は Authorization: Bearer ${CRON_SECRET} を自動付与する。
 *  - CRON_SECRET 未設定時は誰でも叩けてしまうため、必ず Vercel 環境変数に設定すること。
 *
 * 安全装置:
 *  - 1 回の実行で最大 1000 件まで（Vercel Function 60 秒タイムアウト内に収めるため）。
 *  - Storage 削除失敗時はログだけ出して DB 更新は行わない（次回再試行できる状態を保つ）。
 *  - DB 更新が成功した時のみカウントに含める。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 並列削除を含めても十分間に合うが、念のため最大値に近い 60s を確保。
export const maxDuration = 60;

const RETENTION_DAYS = 365;
// 1 回の cron 実行で処理する最大件数。Vercel の 60s 制限と
// Storage delete の所要時間（1リクエスト ~150ms）を踏まえた安全値。
const BATCH_LIMIT = 1000;
// Storage 削除を並列化する数。多すぎると Supabase 側で rate limit に当たるため抑え目に。
const PARALLEL = 25;

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

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // CRON_SECRET 未設定なら起動できないようにする（事故防止）。
    console.error('[cleanup] CRON_SECRET is not set; refusing to run');
    return false;
  }
  const auth = req.headers.get('Authorization');
  return auth === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const supabase = getSupabaseAdmin();

  // 1 年以上前で、まだ画像 URL が残っている attendees を抽出。
  // soft-delete されていても画像は不要なので deleted_at は条件に入れない。
  const { data: rows, error: selectError } = await supabase
    .from('attendees')
    .select('id, paper_image_url, created_at')
    .not('paper_image_url', 'is', null)
    .lt('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (selectError) {
    console.error('[cleanup] attendees select error:', selectError);
    return NextResponse.json(
      { error: selectError.message },
      { status: 500 }
    );
  }

  const targets = rows ?? [];
  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      processed: 0,
      deleted: 0,
      errors: 0,
      elapsedMs: Date.now() - startedAt,
      note: 'no images older than retention window',
    });
  }

  let deleted = 0;
  let errors = 0;

  // 並列バッチで Storage を削除し、成功したものだけ DB を NULL 化。
  for (let i = 0; i < targets.length; i += PARALLEL) {
    const batch = targets.slice(i, i + PARALLEL);
    await Promise.all(
      batch.map(async (row) => {
        try {
          const { error: storageError } = await supabase.storage
            .from('paper-forms')
            .remove([row.paper_image_url as string]);

          // すでに存在しないファイルでも remove は 200 を返すので
          // ここで失敗するのは権限エラー or Storage 障害くらい。
          // その場合は DB を更新せず次回再試行に回す。
          if (storageError) {
            console.warn(
              `[cleanup] storage remove failed id=${row.id} path=${row.paper_image_url}: ${storageError.message}`
            );
            errors += 1;
            return;
          }

          const { error: updateError } = await supabase
            .from('attendees')
            .update({ paper_image_url: null })
            .eq('id', row.id);

          if (updateError) {
            console.warn(
              `[cleanup] db update failed id=${row.id}: ${updateError.message}`
            );
            errors += 1;
            return;
          }

          deleted += 1;
        } catch (e: any) {
          console.warn(
            `[cleanup] unexpected error id=${row.id}: ${e?.message ?? e}`
          );
          errors += 1;
        }
      })
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[cleanup] processed=${targets.length} deleted=${deleted} errors=${errors} elapsed=${elapsedMs}ms cutoff=${cutoff.toISOString()}`
  );

  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    processed: targets.length,
    deleted,
    errors,
    elapsedMs,
    note:
      targets.length === BATCH_LIMIT
        ? `hit batch limit ${BATCH_LIMIT}; remaining items will be processed on next cron run`
        : 'all eligible items processed',
  });
}
