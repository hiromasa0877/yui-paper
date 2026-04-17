'use client';

/**
 * Service Worker 登録
 *
 * 葬儀場の電波不安定環境でも、既に読み込んだアプリの画面が
 * 再表示できるよう、静的アセットをキャッシュする。
 */

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // 開発環境ではSW登録しない（HMRと競合するため）
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW register failed:', err));
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
