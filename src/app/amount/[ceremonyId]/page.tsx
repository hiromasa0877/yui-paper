'use client';

/**
 * 金額入力画面 — 別室・葬儀終了後に香典袋を開封して金額を記録する
 *
 * 運用前提:
 *  - 受付では金額を扱わない。この画面は受付終了後・別室で使うもの
 *  - スタッフまたは遺族が香典袋を1つずつ取り出し、受付番号を入力
 *  - 金額は 5,000 / 10,000 / その他 の3ボタンで入力
 *
 * 画面フロー:
 *  ① 受付番号を入力（or 未入力の一覧から選択）
 *  ② 該当レコードが表示される
 *  ③ 金額ボタンをタップ（「その他」なら数値キーパッド）
 *  ④ 保存 → 次の番号へ（フォーカスが番号入力欄に戻る）
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Attendee, Ceremony } from '@/types/database';
import { formatCurrency, formatKodenNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

const PRESETS = [5000, 10000];

export default function AmountEntryPage() {
  const params = useParams();
  const ceremonyId = params.ceremonyId as string;

  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [numberInput, setNumberInput] = useState('');
  const [current, setCurrent] = useState<Attendee | null>(null);
  const [pendingAttendees, setPendingAttendees] = useState<Attendee[]>([]);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  const numberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCeremony();
    fetchPending();
  }, [ceremonyId]);

  const fetchCeremony = async () => {
    const { data } = await supabase
      .from('ceremonies')
      .select('*')
      .eq('id', ceremonyId)
      .single();
    setCeremony(data);
  };

  /** 金額未入力の参列者一覧 */
  const fetchPending = async () => {
    const { data } = await supabase
      .from('attendees')
      .select('*')
      .eq('ceremony_id', ceremonyId)
      .is('deleted_at', null)
      .is('koden_amount', null)
      .not('koden_number', 'is', null)
      .order('koden_number', { ascending: true });
    setPendingAttendees(data || []);
  };

  const handleLookup = async (rawNumber: string) => {
    const num = parseInt(rawNumber, 10);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('正しい番号を入力してください');
      return;
    }
    const { data, error } = await supabase
      .from('attendees')
      .select('*')
      .eq('ceremony_id', ceremonyId)
      .eq('koden_number', num)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.error(error);
      toast.error('検索に失敗しました');
      return;
    }
    if (!data) {
      toast.error(`#${formatKodenNumber(num)} が見つかりません`);
      return;
    }
    setCurrent(data);
    setShowCustom(false);
    setCustomAmount('');
  };

  const saveAmount = async (amount: number) => {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase
      .from('attendees')
      .update({ koden_amount: amount })
      .eq('id', current.id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error('保存に失敗しました');
      return;
    }
    toast.success(
      `#${formatKodenNumber(current.koden_number)} ${formatCurrency(amount)} を記録しました`
    );
    // 次の番号へ
    setCurrent(null);
    setNumberInput('');
    setShowCustom(false);
    setCustomAmount('');
    fetchPending();
    setTimeout(() => numberInputRef.current?.focus(), 100);
  };

  const handleCustomSubmit = () => {
    const n = parseInt(customAmount.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('正しい金額を入力してください');
      return;
    }
    saveAmount(n);
  };

  return (
    <div className="min-h-screen bg-accent-cream">
      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-accent-dark">
            {ceremony?.name ?? '金額入力'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            香典袋を開封し、受付番号順に金額を記録します
          </p>
        </div>

        {/* 番号検索 */}
        <div className="card mb-6">
          <label className="block text-sm font-semibold text-accent-dark mb-2">
            受付番号
          </label>
          <div className="flex gap-2">
            <input
              ref={numberInputRef}
              type="number"
              inputMode="numeric"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup(numberInput);
              }}
              placeholder="例: 42"
              className="input-base text-3xl text-center font-mono py-4 flex-1"
              autoFocus
            />
            <button
              onClick={() => handleLookup(numberInput)}
              className="btn-primary px-6"
            >
              検索
            </button>
          </div>

          {/* 未入力リストから素早く選択 */}
          {pendingAttendees.length > 0 && !current && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">
                金額未入力の番号 {pendingAttendees.length} 件
              </p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {pendingAttendees.slice(0, 50).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setNumberInput(String(a.koden_number));
                      handleLookup(String(a.koden_number));
                    }}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-md font-mono text-sm hover:bg-gray-50"
                  >
                    #{formatKodenNumber(a.koden_number)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 該当レコード表示＆金額ボタン */}
        {current && (
          <div className="card bg-white mb-6">
            <div className="text-center mb-5">
              <p className="text-sm text-gray-500 mb-1">受付番号</p>
              <div className="text-5xl font-bold text-accent-dark font-mono mb-2">
                #{formatKodenNumber(current.koden_number)}
              </div>
              <p className="text-xl font-semibold text-accent-dark">
                {current.full_name}
              </p>
              {current.address && (
                <p className="text-xs text-gray-500 mt-1">{current.address}</p>
              )}
              {current.koden_amount != null && (
                <p className="text-sm text-yellow-700 mt-2 font-semibold">
                  ※既に {formatCurrency(current.koden_amount)} で記録済み（上書きされます）
                </p>
              )}
            </div>

            {!showCustom ? (
              <div className="space-y-3">
                {PRESETS.map((amount) => (
                  <button
                    key={amount}
                    disabled={saving}
                    onClick={() => saveAmount(amount)}
                    className="w-full py-6 text-2xl font-bold bg-accent-gold text-white rounded-xl hover:opacity-90 disabled:opacity-50"
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
                <button
                  disabled={saving}
                  onClick={() => setShowCustom(true)}
                  className="w-full py-5 text-lg font-semibold bg-white border-2 border-accent-teal text-accent-teal rounded-xl hover:bg-accent-teal hover:text-white"
                >
                  その他の金額
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-2">
                  金額（円）
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="例: 30000"
                  className="input-base text-2xl text-right py-4 mb-3"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setShowCustom(false);
                      setCustomAmount('');
                    }}
                    className="py-4 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    戻る
                  </button>
                  <button
                    disabled={saving}
                    onClick={handleCustomSubmit}
                    className="btn-primary py-4"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
