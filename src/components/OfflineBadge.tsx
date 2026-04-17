'use client';

/**
 * オフライン・未送信インジケーター
 *
 * 画面右下に常時表示し、以下を可視化する:
 *  - 電波状態（オンライン/オフライン）
 *  - 未送信キュー件数（IndexedDBに退避中のデータ）
 *
 * 喪主・スタッフが「データが消えていない」と一目で確認できるようにする。
 */

import { useEffect, useState } from 'react';
import { countPending, onQueueChange } from '@/lib/offline-queue';
import { initResilientSync } from '@/lib/resilient-db';

export default function OfflineBadge() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    // 再送機構の初期化（全画面共通で1回）
    const cleanupSync = initResilientSync();

    const refresh = async () => {
      setPending(await countPending());
    };
    refresh();

    const unsubQueue = onQueueChange(refresh);
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // 保険: 10秒ごとにも件数を更新
    const interval = window.setInterval(refresh, 10_000);

    return () => {
      cleanupSync();
      unsubQueue();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(interval);
    };
  }, []);

  // 平常時（オンライン & 未送信0件）は表示を控えめに
  const allClear = online && pending === 0;

  const bg = !online
    ? '#dc2626' // 赤: オフライン
    : pending > 0
    ? '#d97706' // 橙: 送信待ち
    : '#10b981'; // 緑: 正常

  const label = !online
    ? `オフライン（${pending}件保存中）`
    : pending > 0
    ? `送信待ち ${pending} 件`
    : 'オンライン';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 9999,
        backgroundColor: bg,
        color: 'white',
        padding: allClear ? '6px 10px' : '10px 14px',
        borderRadius: 999,
        fontSize: allClear ? 12 : 14,
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        opacity: allClear ? 0.7 : 1,
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: !online || pending > 0 ? 'pulse 1.5s infinite' : 'none',
          display: 'inline-block',
        }}
      />
      {label}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
