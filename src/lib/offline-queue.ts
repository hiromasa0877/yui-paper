/**
 * オフライン書き込みキュー（IndexedDB）
 *
 * 目的: 葬儀場で電波が途切れても香典・参列者の記録を絶対に失わない。
 *
 * 仕組み:
 *  1. Supabase への書き込みはまず `enqueue()` で IndexedDB に保存
 *  2. オンライン時は即座に `flushOne()` で送信試行
 *  3. 失敗（ネットワーク/5xx）時はキューに残し、指数バックオフで再試行
 *  4. `online` イベント・可視化復帰・定期ポーリングで `flushAll()` 実行
 *
 * データは送信成功するまで IndexedDB に残り続ける。
 * ブラウザを閉じても失われず、次回起動時に再送される。
 */

export type PendingOp =
  | {
      kind: 'insert_attendee';
      ceremony_id: string;
      payload: Record<string, any>;
      client_ref: string; // クライアント側で一意なキー（UI表示用）
    }
  | {
      kind: 'update_attendee';
      attendee_id: string;
      patch: Record<string, any>;
    }
  | {
      kind: 'soft_delete_attendee';
      attendee_id: string;
    };

export type QueueEntry = {
  id?: number; // auto-increment
  op: PendingOp;
  attempts: number;
  last_error: string | null;
  created_at: number;
  next_retry_at: number;
};

const DB_NAME = 'yui-offline-queue';
const DB_VERSION = 1;
const STORE = 'writes';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable (SSR)'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export async function enqueue(op: PendingOp): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const entry: QueueEntry = {
      op,
      attempts: 0,
      last_error: null,
      created_at: Date.now(),
      next_retry_at: Date.now(),
    };
    const req = store.add(entry);
    req.onsuccess = () => {
      notifyChange();
      resolve(req.result as number);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listPending(): Promise<QueueEntry[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as QueueEntry[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function countPending(): Promise<number> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

async function deleteEntry(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      notifyChange();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function updateEntry(entry: QueueEntry): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => {
      notifyChange();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// --- 変更通知（UI向け） -----------------------------------------------
const listeners = new Set<() => void>();

export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('queue listener error', e);
    }
  });
}

// --- フラッシュ（送信試行） -------------------------------------------
/**
 * キューから1件取り出して送信。成功なら削除、失敗ならバックオフ更新。
 * 実行関数は caller から渡す（supabase依存を切り離すため）
 */
export async function flushAll(
  handler: (op: PendingOp) => Promise<void>
): Promise<{ sent: number; failed: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, failed: 0, remaining: await countPending() };
  }

  const entries = await listPending();
  const now = Date.now();
  let sent = 0;
  let failed = 0;

  // 作成順に処理（FIFO）
  entries.sort((a, b) => a.created_at - b.created_at);

  for (const entry of entries) {
    if (entry.next_retry_at > now) continue; // バックオフ中
    try {
      await handler(entry.op);
      if (entry.id != null) await deleteEntry(entry.id);
      sent++;
    } catch (err: any) {
      failed++;
      const attempts = entry.attempts + 1;
      // 指数バックオフ: 2s, 4s, 8s, 16s, ... 最大 5 分
      const delayMs = Math.min(2000 * 2 ** entry.attempts, 5 * 60 * 1000);
      await updateEntry({
        ...entry,
        attempts,
        last_error: err?.message ?? String(err),
        next_retry_at: Date.now() + delayMs,
      });
    }
  }

  return { sent, failed, remaining: await countPending() };
}

/**
 * ネットワーク復帰・可視化復帰・定期ポーリングで呼ぶ。
 * 重複実行を防ぐためロック。
 */
let flushLock = false;
export async function safeFlushAll(
  handler: (op: PendingOp) => Promise<void>
): Promise<void> {
  if (flushLock) return;
  flushLock = true;
  try {
    await flushAll(handler);
  } finally {
    flushLock = false;
  }
}
