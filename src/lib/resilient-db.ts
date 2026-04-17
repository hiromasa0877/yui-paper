/**
 * Supabase 書き込みの耐障害ラッパー
 *
 * フロー:
 *  1. オンライン & リトライ成功 → そのまま完了
 *  2. 3回リトライしても失敗 or オフライン → IndexedDBに退避
 *  3. オンライン復帰時に自動フラッシュ（offline-queue.ts 側の safeFlushAll）
 *
 * 重要: このモジュールを経由すれば「データは絶対に失われない」。
 * Supabase/ネット障害時はキュー送りになり、復帰後に再送される。
 */

import { supabase, getNextKodenNumber } from './supabase';
import {
  enqueue,
  safeFlushAll,
  type PendingOp,
} from './offline-queue';

const MAX_INLINE_RETRIES = 3;

function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || err.toString() || '').toLowerCase();
  // Supabaseクライアントはネットワーク失敗を 'Failed to fetch' 等で返す
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('load failed') ||
    err.code === 'ECONNRESET' ||
    err.code === 'ETIMEDOUT'
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 参列者INSERT - オンライン優先、失敗時はキュー
 *
 * koden_number は採番リトライ（UNIQUE衝突対応）込みで最大5回試行。
 * ネットワーク障害時は koden_number=null のままキュー送りにする。
 * （同期時に再採番される）
 */
export async function insertAttendeeResilient(
  ceremonyId: string,
  basePayload: Record<string, any>,
  clientRef: string
): Promise<
  | { ok: true; data: any; queued: false }
  | { ok: true; queued: true }
  | { ok: false; error: string }
> {
  const isOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  if (!isOnline) {
    // オフライン → 即キュー
    await enqueue({
      kind: 'insert_attendee',
      ceremony_id: ceremonyId,
      payload: basePayload,
      client_ref: clientRef,
    });
    return { ok: true, queued: true };
  }

  // オンライン: リトライ込みで送信
  for (let attempt = 0; attempt < MAX_INLINE_RETRIES; attempt++) {
    try {
      // 採番込み（最大5回のUNIQUE衝突リトライ）
      let inserted: any = null;
      let lastError: any = null;
      for (let pick = 0; pick < 5; pick++) {
        const nextNumber = await getNextKodenNumber(ceremonyId);
        const { data, error } = await supabase
          .from('attendees')
          .insert([
            {
              ...basePayload,
              ceremony_id: ceremonyId,
              koden_number: nextNumber,
            },
          ])
          .select()
          .single();

        if (!error) {
          inserted = data;
          break;
        }
        lastError = error;
        if (error.code !== '23505') {
          // UNIQUE衝突以外はリトライ意味なし。外側のリトライに委ねる
          throw error;
        }
      }

      if (!inserted) throw lastError || new Error('採番に失敗しました');
      return { ok: true, data: inserted, queued: false };
    } catch (err: any) {
      // ネットワーク系エラー → 指数バックオフで再試行
      if (isNetworkError(err) && attempt < MAX_INLINE_RETRIES - 1) {
        await sleep(500 * 2 ** attempt); // 500ms, 1s, 2s
        continue;
      }
      // ネットワーク系で最終失敗 → キューへ退避（データを守る）
      if (isNetworkError(err)) {
        await enqueue({
          kind: 'insert_attendee',
          ceremony_id: ceremonyId,
          payload: basePayload,
          client_ref: clientRef,
        });
        return { ok: true, queued: true };
      }
      // その他のエラー（バリデーション等）→ 呼び出し側に返す
      return { ok: false, error: err?.message || '登録に失敗しました' };
    }
  }

  // ここには来ないはず
  return { ok: false, error: '登録に失敗しました' };
}

/**
 * 参列者UPDATE - 金額・奉納チェックの編集など
 */
export async function updateAttendeeResilient(
  attendeeId: string,
  patch: Record<string, any>
): Promise<{ ok: true; data?: any; queued: boolean } | { ok: false; error: string }> {
  const isOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  if (!isOnline) {
    await enqueue({ kind: 'update_attendee', attendee_id: attendeeId, patch });
    return { ok: true, queued: true };
  }

  for (let attempt = 0; attempt < MAX_INLINE_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase
        .from('attendees')
        .update(patch)
        .eq('id', attendeeId)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data, queued: false };
    } catch (err: any) {
      if (isNetworkError(err) && attempt < MAX_INLINE_RETRIES - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (isNetworkError(err)) {
        await enqueue({ kind: 'update_attendee', attendee_id: attendeeId, patch });
        return { ok: true, queued: true };
      }
      return { ok: false, error: err?.message || '更新に失敗しました' };
    }
  }
  return { ok: false, error: '更新に失敗しました' };
}

/**
 * 参列者の論理削除 - deleted_at にタイムスタンプを立てる
 */
export async function softDeleteAttendeeResilient(
  attendeeId: string
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  const patch = { deleted_at: new Date().toISOString() };
  const isOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;

  if (!isOnline) {
    await enqueue({ kind: 'soft_delete_attendee', attendee_id: attendeeId });
    return { ok: true, queued: true };
  }

  for (let attempt = 0; attempt < MAX_INLINE_RETRIES; attempt++) {
    try {
      const { error } = await supabase
        .from('attendees')
        .update(patch)
        .eq('id', attendeeId);
      if (error) throw error;
      return { ok: true, queued: false };
    } catch (err: any) {
      if (isNetworkError(err) && attempt < MAX_INLINE_RETRIES - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (isNetworkError(err)) {
        await enqueue({ kind: 'soft_delete_attendee', attendee_id: attendeeId });
        return { ok: true, queued: true };
      }
      return { ok: false, error: err?.message || '削除に失敗しました' };
    }
  }
  return { ok: false, error: '削除に失敗しました' };
}

/**
 * キュー送信の実行ハンドラ（offline-queue.safeFlushAll に渡す）
 * 各操作種別を Supabase に発行する
 */
async function queueHandler(op: PendingOp): Promise<void> {
  if (op.kind === 'insert_attendee') {
    // 同期時に採番しなおす（オフライン中の番号衝突を避ける）
    let lastError: any = null;
    for (let pick = 0; pick < 5; pick++) {
      const nextNumber = await getNextKodenNumber(op.ceremony_id);
      const { error } = await supabase
        .from('attendees')
        .insert([
          { ...op.payload, ceremony_id: op.ceremony_id, koden_number: nextNumber },
        ]);
      if (!error) return;
      lastError = error;
      if (error.code !== '23505') throw error;
    }
    throw lastError || new Error('採番失敗(UNIQUE)');
  }
  if (op.kind === 'update_attendee') {
    const { error } = await supabase
      .from('attendees')
      .update(op.patch)
      .eq('id', op.attendee_id);
    if (error) throw error;
    return;
  }
  if (op.kind === 'soft_delete_attendee') {
    const { error } = await supabase
      .from('attendees')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', op.attendee_id);
    if (error) throw error;
    return;
  }
}

/**
 * アプリ起動時に1回呼ぶ: キュー自動再送の初期化
 */
export function initResilientSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const trigger = () => {
    safeFlushAll(queueHandler).catch((e) =>
      console.warn('queue flush error', e)
    );
  };

  // 起動直後に1回
  trigger();

  // オンライン復帰で即発火
  window.addEventListener('online', trigger);
  // タブがフォアグラウンドに戻ったとき
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') trigger();
  });
  // 保険: 30秒ごとにリトライ
  const interval = window.setInterval(trigger, 30_000);

  return () => {
    window.removeEventListener('online', trigger);
    window.clearInterval(interval);
  };
}

export { queueHandler };
