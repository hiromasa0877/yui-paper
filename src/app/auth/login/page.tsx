'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('メールアドレスとパスワードを入力してください');
      return;
    }

    try {
      setLoading(true);

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        toast.success(
          'サインアップが完了しました。メール確認を行ってください。'
        );
        setEmail('');
        setPassword('');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast.success('ログインしました');
        router.push('/');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      if (error.message.includes('Invalid login credentials')) {
        toast.error('メールアドレスまたはパスワードが正しくありません');
      } else if (error.message.includes('User already registered')) {
        toast.error('このメールアドレスは既に登録されています');
      } else {
        toast.error(error.message || 'エラーが発生しました');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-dark via-accent-cream to-accent-gold flex items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-gold opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-teal opacity-10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="card animate-scale-up">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-accent-gold mb-2">
              結（ゆい）
            </h1>
            <p className="text-gray-600">レセプション</p>
            <p className="text-sm text-gray-500 mt-2">
              葬儀受付DXサービス
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-accent-dark mb-2">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@example.com"
                className="input-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-accent-dark mb-2">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-base"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50"
            >
              {loading
                ? '処理中...'
                : isSignUp
                  ? 'サインアップ'
                  : 'ログイン'}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {isSignUp
                ? 'アカウントをお持ちですか？'
                : 'アカウントをお持ちでないですか？'}
            </p>
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="mt-2 text-accent-gold font-semibold hover:underline"
            >
              {isSignUp ? 'ログイン' : 'サインアップ'}
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-accent-teal bg-opacity-10 border-l-4 border-accent-teal rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>デモ用:</strong>
              <br />
              任意のメールアドレスとパスワードで
              サインアップできます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
