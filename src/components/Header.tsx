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
    <header className="bg-accent-dark text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {backButton && (
            <button
              onClick={() => router.back()}
              className="text-accent-gold hover:text-white transition-colors"
            >
              ← 戻る
            </button>
          )}
          {showLogo && (
            <Link href="/" className="text-2xl font-bold text-accent-gold">
              結（ゆい）レセプション
            </Link>
          )}
        </div>
        <nav className="flex items-center gap-6">
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-accent-teal hover:bg-opacity-90 transition-all text-white"
          >
            ログアウト
          </button>
        </nav>
      </div>
    </header>
  );
}
