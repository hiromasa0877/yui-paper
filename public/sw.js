/**
 * 結（ゆい）レセプション Service Worker
 *
 * 目的: 葬儀場の電波不安定環境でアプリを動作継続させる
 *
 * 戦略:
 *  - ナビゲーション要求は network-first、失敗時は cache fallback
 *  - 静的アセット（_next/static, 画像）は cache-first
 *  - Supabase / Zipcloud などのAPI呼び出しはキャッシュせずスルー
 *    （データ整合性のため）
 *
 * 注意: データ書き込みのオフライン耐性は SW ではなく IndexedDB キュー
 * （src/lib/offline-queue.ts）で担保している。SW はあくまで「画面を開ける」
 * ことを保証する役割。
 */

const CACHE_VERSION = 'yui-v1';
const PRECACHE_URLS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 同一オリジン以外（Supabase, Zipcloud等）はキャッシュしない
  if (url.origin !== self.location.origin) return;

  // ナビゲーション: network-first, cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // 静的アセット: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // それ以外（APIルート等）は素通し
});
