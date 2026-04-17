'use client';

/**
 * 受付画面 — 紙芳名帳をスキャンして受付番号を発行する
 *
 * 重要ルール:
 *  - この画面では金額は扱わない。金額は別フェーズ（/amount）で入力する
 *  - 香典袋を参列者の目の前で開けない（葬儀作法）
 *
 * フロー:
 *  ① カメラで芳名紙を撮影（または画像ファイル選択）
 *  ② 送信 → OCR → 受付番号表示（大きく！）
 *  ③ スタッフが表示された番号を紙と香典袋に記入
 *  ④「次の方」ボタンで続行
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Ceremony } from '@/types/database';
import { formatKodenNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

type ScanResponse = {
  attendee_id: string;
  koden_number: number;
  ocr_status: 'success' | 'review_needed' | 'failed' | 'processing';
  extracted: {
    full_name?: { value: string; confidence: number };
    furigana?: { value: string; confidence: number };
    postal_code?: { value: string; confidence: number };
    address?: { value: string; confidence: number };
    relation?: { value: string; confidence: number };
  };
  needs_review: boolean;
};

type ViewState = 'idle' | 'preview' | 'scanning' | 'result';

export default function ReceptionPage() {
  const params = useParams();
  const ceremonyId = params.ceremonyId as string;

  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  useEffect(() => {
    fetchCeremony();
    fetchTodayCount();
  }, [ceremonyId]);

  const fetchCeremony = async () => {
    const { data } = await supabase
      .from('ceremonies')
      .select('*')
      .eq('id', ceremonyId)
      .single();
    setCeremony(data);
  };

  const fetchTodayCount = async () => {
    const { count } = await supabase
      .from('attendees')
      .select('id', { count: 'exact', head: true })
      .eq('ceremony_id', ceremonyId)
      .is('deleted_at', null);
    setTodayCount(count ?? 0);
  };

  const handleFileSelected = (file: File) => {
    selectedFileRef.current = file;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setViewState('preview');
  };

  const handleCameraClick = () => {
    // Mobile Safari/Chromeでカメラ直接起動
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    const file = selectedFileRef.current;
    if (!file) return;

    setViewState('scanning');
    try {
      const form = new FormData();
      form.append('ceremony_id', ceremonyId);
      form.append('image', file);

      const res = await fetch('/api/reception/scan', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `スキャンに失敗しました (HTTP ${res.status})`);
      }
      const json = (await res.json()) as ScanResponse;
      setResult(json);
      setViewState('result');
      fetchTodayCount();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'スキャンに失敗しました');
      setViewState('preview');
    }
  };

  const handleNext = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    selectedFileRef.current = null;
    setResult(null);
    setViewState('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent-cream to-white">
      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        {/* ヘッダー: 式典名と累計カウンタ */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-accent-dark">
            {ceremony?.name ?? '受付'}
          </h1>
          {ceremony?.deceased_name && (
            <p className="text-sm text-gray-600 mt-1">
              故人: {ceremony.deceased_name}
            </p>
          )}
          {todayCount !== null && (
            <p className="text-xs text-gray-500 mt-2">
              これまでの受付 {todayCount} 名
            </p>
          )}
        </div>

        {/* 状態別ビュー */}
        {viewState === 'idle' && <IdleView onCameraClick={handleCameraClick} />}

        {viewState === 'preview' && previewUrl && (
          <PreviewView
            previewUrl={previewUrl}
            onRetake={handleNext}
            onSubmit={handleSubmit}
          />
        )}

        {viewState === 'scanning' && <ScanningView />}

        {viewState === 'result' && result && (
          <ResultView result={result} onNext={handleNext} />
        )}

        {/* 隠しファイル入力: capture="environment"で背面カメラ直接 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
          }}
          className="hidden"
        />
      </main>
    </div>
  );
}

// =========== サブビュー ===========

function IdleView({ onCameraClick }: { onCameraClick: () => void }) {
  return (
    <div className="card text-center py-10 sm:py-14">
      <div className="text-7xl mb-6">📷</div>
      <h2 className="text-xl sm:text-2xl font-bold text-accent-dark mb-2">
        芳名帳を撮影してください
      </h2>
      <p className="text-sm text-gray-600 mb-8">
        下のボタンでカメラが起動します
      </p>
      <button
        onClick={onCameraClick}
        className="w-full max-w-xs mx-auto block btn-primary text-lg py-5"
      >
        カメラで撮影する
      </button>
      <p className="text-xs text-gray-400 mt-6">
        ※ 紙全体が明るく写るように撮影してください
      </p>
    </div>
  );
}

function PreviewView({
  previewUrl,
  onRetake,
  onSubmit,
}: {
  previewUrl: string;
  onRetake: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="card">
      <h2 className="text-lg font-bold text-accent-dark mb-4 text-center">
        この写真で登録しますか？
      </h2>
      <div className="bg-gray-100 rounded-lg overflow-hidden mb-4 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="芳名帳プレビュー"
          className="w-full h-auto max-h-[50vh] object-contain"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onRetake}
          className="py-4 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
        >
          撮り直し
        </button>
        <button onClick={onSubmit} className="btn-primary py-4">
          登録する
        </button>
      </div>
    </div>
  );
}

function ScanningView() {
  return (
    <div className="card text-center py-14">
      <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-accent-gold mb-6" />
      <h2 className="text-xl font-bold text-accent-dark mb-2">
        読み取り中...
      </h2>
      <p className="text-sm text-gray-600">
        芳名帳の内容を解析しています（数秒お待ちください）
      </p>
    </div>
  );
}

function ResultView({
  result,
  onNext,
}: {
  result: ScanResponse;
  onNext: () => void;
}) {
  const { koden_number, extracted, ocr_status, needs_review } = result;
  const bgColor =
    ocr_status === 'failed'
      ? 'bg-red-50'
      : needs_review
      ? 'bg-yellow-50'
      : 'bg-green-50';

  return (
    <div className={`card ${bgColor}`}>
      <div className="text-center mb-6">
        <p className="text-sm text-gray-600 mb-2">受付番号</p>
        <div className="text-7xl sm:text-8xl font-bold text-accent-dark tracking-wider mb-2">
          #{formatKodenNumber(koden_number)}
        </div>
        <p className="text-base font-semibold text-accent-dark mt-4">
          👆 この番号を紙と香典袋に記入してください
        </p>
      </div>

      {/* OCR結果ステータス */}
      <div className="bg-white rounded-lg p-4 mb-4 border-2 border-gray-200">
        {ocr_status === 'failed' ? (
          <p className="text-sm text-red-700 font-semibold">
            ⚠ 読み取りに失敗しました。後でダッシュボードから内容を確認してください。
          </p>
        ) : needs_review ? (
          <p className="text-sm text-yellow-800 font-semibold mb-2">
            ⚠ 一部の項目の読み取り精度が低いため「要確認」となりました
          </p>
        ) : (
          <p className="text-sm text-green-700 font-semibold mb-2">
            ✓ 読み取り完了
          </p>
        )}

        <dl className="text-sm space-y-1.5 mt-3">
          <FieldRow label="氏名" field={extracted.full_name} />
          <FieldRow label="ふりがな" field={extracted.furigana} />
          <FieldRow label="郵便番号" field={extracted.postal_code} />
          <FieldRow label="住所" field={extracted.address} />
          <FieldRow label="ご関係" field={extracted.relation} />
        </dl>
      </div>

      <button
        onClick={onNext}
        className="w-full btn-primary text-lg py-5 mt-2"
      >
        次の方の受付 →
      </button>
    </div>
  );
}

function FieldRow({
  label,
  field,
}: {
  label: string;
  field?: { value: string; confidence: number };
}) {
  const value = field?.value || '(未取得)';
  const conf = field?.confidence ?? 0;
  const low = conf < 0.7;
  return (
    <div className="flex items-start gap-2">
      <dt className="text-gray-600 min-w-[5.5em] shrink-0">{label}</dt>
      <dd
        className={`flex-1 ${low ? 'text-yellow-800 font-semibold' : 'text-accent-dark'}`}
      >
        {value}
        {field && (
          <span className="text-xs text-gray-400 ml-2">
            (信頼度 {Math.round(conf * 100)}%)
          </span>
        )}
      </dd>
    </div>
  );
}
