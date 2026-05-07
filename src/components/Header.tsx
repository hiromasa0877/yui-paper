'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type HeaderProps = {
  showLogo?: boolean;
  backButton?: boolean;
};

export default function Header({ showLogo = true, backButton = false }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    // sticky にしてダッシュボードを下スクロールしてもログアウトボタンが届く位置に残るようにする。
    // z-30 はモーダル(z-50)より下、メイン本文より上の高さ。
    <header className="bg-accent-dark text-white shadow-lg sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
        {/* 左ブロック: 戻る + ロゴ。狭い画面で右側のログアウトを押し出さないよう min-w-0 で縮められるようにする。 */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          {backButton && (
            <button
              type="button"
              onClick={() => router.back()}
              className="text-accent-gold hover:text-white transition-colors shrink-0 text-sm sm:text-base"
            >
              ← 戻る
            </button>
          )}
          {showLogo && (
            <Link
              href="/"
              className="text-base sm:text-2xl font-bold text-accent-gold truncate"
            >
              結（ゆい）レセプション
            </Link>
          )}
        </div>
        {/* 右ブロック: ログアウト。shrink-0 で絶対に縮まない・切れない。 */}
        <nav className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 sm:px-4 sm:py-2 rounded-lg bg-accent-teal hover:bg-opacity-90 active:bg-opacity-80 transition-all text-white text-sm sm:text-base"
            style={{ touchAction: 'manipulation' }}
          >
            ログアウト
          </button>
        </nav>
      </div>
    </header>
  );
}
