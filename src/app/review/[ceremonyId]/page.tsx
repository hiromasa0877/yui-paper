'use client';

/**
 * 要確認レビュー画面 — OCR信頼度が低いレコードを修正する
 *
 * 画面構成:
 *  左: スキャン画像プレビュー
 *  右: 抽出フィールド編集フォーム
 *  → 修正して「確定」すると ocr_status が success に更新される
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabase';
import { Attendee, Ceremony } from '@/types/database';
import { formatKodenNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

// OCR系フィールドは Attendee に統合済み（types/database.ts 参照）
type ReviewAttendee = Attendee;

export default function ReviewPage() {
  const params = useParams();
  const ceremonyId = params.ceremonyId as string;

  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewAttendee[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 編集フォーム
  const [formName, setFormName] = useState('');
  const [formFurigana, setFormFurigana] = useState('');
  const [formPostalCode, setFormPostalCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formRelation, setFormRelation] = useState('');

  useEffect(() => {
    fetchCeremony();
    fetchReviewItems();
  }, [ceremonyId]);

  const fetchCeremony = async () => {
    const { data } = await supabase
      .from('ceremonies')
      .select('*')
      .eq('id', ceremonyId)
      .single();
    setCeremony(data);
  };

  const fetchReviewItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendees')
      .select('*')
      .eq('ceremony_id', ceremonyId)
      .is('deleted_at', null)
      .in('ocr_status', ['review_needed', 'failed'])
      .order('koden_number', { ascending: true });
    if (error) {
      console.error(error);
      toast.error('データの取得に失敗しました');
    }
    setReviewItems(data || []);
    if (data && data.length > 0) loadItem(data[0]);
    setLoading(false);
  };

  const loadItem = (item: ReviewAttendee) => {
    setFormName(item.full_name === '(要確認)' || item.full_name === '(受付中)' ? '' : item.full_name);
    setFormPostalCode(item.postal_code || '');
    setFormAddress(item.address || '');
    setFormRelation(item.relation || '');
    // 007マイグレーション後は専用カラム、未適用環境向けに notes フォールバックも残す
    if (item.furigana) {
      setFormFurigana(item.furigana);
    } else {
      const furiMatch = item.notes?.match(/ふりがな: (.+)/);
      setFormFurigana(furiMatch?.[1] || '');
    }
  };

  const current = reviewItems[currentIdx] || null;

  // Private バケットのため署名付きURLを取得（有効期間1時間）
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!current?.paper_image_url) {
      setImageUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from('paper-forms')
        .createSignedUrl(current.paper_image_url!, 60 * 60);
      if (cancelled) return;
      if (error) {
        console.warn('署名付きURL取得失敗', error);
        setImageUrl(null);
      } else {
        setImageUrl(data?.signedUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.paper_image_url]);

  const handleConfirm = async () => {
    if (!current) return;
    if (!formName.trim()) {
      toast.error('氏名は必須です');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('attendees')
      .update({
        full_name: formName.trim(),
        postal_code: formPostalCode.trim() || null,
        address: formAddress.trim() || null,
        relation: formRelation || null,
        furigana: formFurigana.trim() || null,
        ocr_status: 'success',
      })
      .eq('id', current.id);
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error('保存に失敗しました');
      return;
    }
    toast.success(`#${formatKodenNumber(current.koden_number)} を確定しました`);

    // 次のアイテムへ
    const newItems = reviewItems.filter((_, i) => i !== currentIdx);
    setReviewItems(newItems);
    if (newItems.length > 0) {
      const nextIdx = Math.min(currentIdx, newItems.length - 1);
      setCurrentIdx(nextIdx);
      loadItem(newItems[nextIdx]);
    }
  };

  const handleSkip = () => {
    if (currentIdx < reviewItems.length - 1) {
      const next = currentIdx + 1;
      setCurrentIdx(next);
      loadItem(reviewItems[next]);
    } else {
      toast('最後のレコードです');
    }
  };

  // キーボードショートカット
  //   Ctrl+Enter: 確定して次へ
  //   Ctrl+→     : スキップして次へ
  //   Esc        : フォーカスをクリア（誤操作防止）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip();
      } else if (e.key === 'Escape') {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, formName, formFurigana, formPostalCode, formAddress, formRelation, reviewItems]);

  return (
    <div className="min-h-screen bg-accent-cream">
      <Header backButton={true} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-accent-dark">
              {ceremony?.name ?? ''} 要確認レビュー
            </h1>
            <p className="text-sm text-gray-600">
              {reviewItems.length > 0
                ? `残り ${reviewItems.length} 件（${currentIdx + 1} / ${reviewItems.length}）`
                : '要確認のデータはありません'}
            </p>
          </div>
          <Link
            href={`/dashboard/${ceremonyId}`}
            className="text-sm text-accent-teal underline"
          >
            ダッシュボードに戻る
          </Link>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        )}

        {!loading && reviewItems.length === 0 && (
          <div className="card text-center py-12">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-xl font-bold text-accent-dark">
              すべて確認済みです
            </p>
            <Link
              href={`/dashboard/${ceremonyId}`}
              className="inline-block mt-6 text-accent-teal underline"
            >
              ダッシュボードに戻る
            </Link>
          </div>
        )}

        {current && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* 左: 画像プレビュー */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold text-accent-dark">
                  #{formatKodenNumber(current.koden_number)}
                </span>
                <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-semibold">
                  要確認
                </span>
              </div>
              {imageUrl ? (
                <div className="bg-gray-100 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="スキャン画像"
                    className="w-full h-auto max-h-[60vh] object-contain"
                  />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg py-20 text-center text-gray-500">
                  画像なし
                </div>
              )}
            </div>

            {/* 右: 編集フォーム */}
            <div className="card">
              <h2 className="text-lg font-bold text-accent-dark mb-4">
                内容を確認・修正
              </h2>
              <div className="space-y-4">
                <Field
                  label="氏名"
                  value={formName}
                  onChange={setFormName}
                  required
                />
                <Field
                  label="ふりがな"
                  value={formFurigana}
                  onChange={setFormFurigana}
                />
                <Field
                  label="郵便番号"
                  value={formPostalCode}
                  onChange={setFormPostalCode}
                />
                <Field
                  label="住所"
                  value={formAddress}
                  onChange={setFormAddress}
                  multiline
                />
                <div>
                  <label className="block text-sm font-semibold text-accent-dark mb-1">
                    ご関係
                  </label>
                  <select
                    value={formRelation}
                    onChange={(e) => setFormRelation(e.target.value)}
                    className="input-base"
                  >
                    <option value="">未設定</option>
                    <option value="親族">ご親族</option>
                    <option value="友人">ご友人</option>
                    <option value="会社関係">会社関係</option>
                    <option value="近所">ご近所</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="py-4 border-2 border-gray-300 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  後回し
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="btn-primary py-4 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '確定する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-accent-dark mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="input-base"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base"
        />
      )}
    </div>
  );
}
