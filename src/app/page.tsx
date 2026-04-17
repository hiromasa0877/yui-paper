'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { Ceremony } from '@/types/database';
import toast from 'react-hot-toast';

export default function Home() {
  const router = useRouter();
  const [ceremonies, setCeremonies] = useState<Ceremony[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    deceased_name: '',
    venue: '',
    ceremony_date: '',
  });

  useEffect(() => {
    fetchCeremonies();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login');
    }
  };

  const fetchCeremonies = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCeremonies([]);
        return;
      }

      const { data, error } = await supabase
        .from('ceremonies')
        .select('*')
        .eq('mourner_user_id', user.id)
        .order('ceremony_date', { ascending: false });

      if (error) throw error;
      setCeremonies(data || []);
    } catch (error) {
      console.error('Error fetching ceremonies:', error);
      toast.error('式典の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCeremony = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.deceased_name || !formData.venue || !formData.ceremony_date) {
      toast.error('全ての項目を入力してください');
      return;
    }

    try {
      setIsCreating(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('ユーザーが見つかりません');
        return;
      }

      const { data, error } = await supabase
        .from('ceremonies')
        .insert([
          {
            name: formData.name,
            deceased_name: formData.deceased_name,
            venue: formData.venue,
            ceremony_date: new Date(formData.ceremony_date).toISOString(),
            mourner_user_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success('式典を作成しました');
      setFormData({ name: '', deceased_name: '', venue: '', ceremony_date: '' });
      // 作成後は受付画面へ遷移（紙スキャン運用の起点）
      router.push(`/reception/${data.id}`);
    } catch (error) {
      console.error('Error creating ceremony:', error);
      toast.error('式典の作成に失敗しました');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-accent-cream">
      <Header showLogo={true} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Ceremony Form */}
          <div className="card animate-fade-in">
            <h2 className="text-2xl font-bold text-accent-dark mb-6">
              新しい式典を登録
            </h2>

            <form onSubmit={handleCreateCeremony} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-2">
                  式典名 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: 山田太郎様 葬儀・告別式"
                  className="input-base"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-2">
                  故人のお名前 *
                </label>
                <input
                  type="text"
                  value={formData.deceased_name}
                  onChange={(e) =>
                    setFormData({ ...formData, deceased_name: e.target.value })
                  }
                  placeholder="例: 山田太郎"
                  className="input-base"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-2">
                  会場 *
                </label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  placeholder="例: ホテルニューオータニ"
                  className="input-base"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-2">
                  式典日時 *
                </label>
                <input
                  type="datetime-local"
                  value={formData.ceremony_date}
                  onChange={(e) =>
                    setFormData({ ...formData, ceremony_date: e.target.value })
                  }
                  className="input-base"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full btn-primary disabled:opacity-50"
              >
                {isCreating ? '作成中...' : '式典を作成'}
              </button>
            </form>
          </div>

          {/* Existing Ceremonies */}
          <div className="card animate-fade-in">
            <h2 className="text-2xl font-bold text-accent-dark mb-6">
              式典一覧
            </h2>

            {loading ? (
              <div className="text-center py-8 text-gray-500">
                読み込み中...
              </div>
            ) : ceremonies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                式典がまだありません
              </div>
            ) : (
              <div className="space-y-4">
                {ceremonies.map((ceremony) => (
                  <div
                    key={ceremony.id}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-accent-gold transition-colors"
                  >
                    <h3 className="font-bold text-accent-dark">{ceremony.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      故人: {ceremony.deceased_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      会場: {ceremony.venue}
                    </p>
                    <p className="text-sm text-gray-600">
                      日時: {new Date(ceremony.ceremony_date).toLocaleDateString('ja-JP')}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link
                        href={`/reception/${ceremony.id}`}
                        className="block px-3 py-3 bg-accent-gold text-white text-sm font-semibold rounded-lg text-center hover:opacity-90"
                      >
                        📷 受付
                      </Link>
                      <Link
                        href={`/amount/${ceremony.id}`}
                        className="block px-3 py-3 bg-accent-teal text-white text-sm font-semibold rounded-lg text-center hover:opacity-90"
                      >
                        💰 金額入力
                      </Link>
                    </div>
                    <div className="text-center mt-2">
                      <Link
                        href={`/dashboard/${ceremony.id}`}
                        className="text-xs text-gray-500 hover:text-accent-teal underline underline-offset-2"
                      >
                        ダッシュボード（一覧・要確認）
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
