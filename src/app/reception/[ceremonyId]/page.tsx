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
import { compressImageForOcr } from '@/lib/image-utils';
import toast from 'react-hot-toast';

type ScanResponse = {
  attendee_id: string;
  koden_number: number;
  ocr_status: 'pending' | 'failed';
  image_path: string | null;
  mime_type: string;
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

    // オフライン時は明示的に警告して中断（要望次第でローカル番号採番に拡張可）
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error(
        '電波がありません。電波が回復してから再撮影してください。\n（端末ローカルへの一時保存は今後実装予定）',
        { duration: 5000 }
      );
      return;
    }

    setViewState('scanning');
    try {
      // ① 送信前にOCR向けに圧縮（4.5MB制限対策＋転送高速化）
      const compressed = await compressImageForOcr(file);

      // ② client_ref を発行（ネットワーク再送による二重INSERT防止）
      const clientRef =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const form = new FormData();
      form.append('ceremony_id', ceremonyId);
      form.append('image', compressed);
      form.append('client_ref', clientRef);

      // ③ scan: 番号採番＋画像保存だけの「高速パス」（〜1〜2秒）
      const res = await fetch('/api/reception/scan', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `スキャンに失敗しました (HTTP ${res.status})`);
      }
      const json = (await res.json()) as ScanResponse;

      // ③ 番号を即時表示。スタッフはここで「次の方」と言える
      setResult(json);
      setViewState('result');
      fetchTodayCount();

      // ④ OCRはバックグラウンドで非同期実行（keepaliveでタブ離脱しても継続）
      if (json.image_path) {
        try {
          fetch('/api/reception/process-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              attendee_id: json.attendee_id,
              image_path: json.image_path,
              mime_type: json.mime_type,
            }),
            keepalive: true,
          }).catch((e) => console.warn('OCRワーカー起動失敗:', e));
        } catch (e) {
          console.warn('OCR起動例外:', e);
        }
      }
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
  const { koden_number, attendee_id, ocr_status: initialStatus } = result;

  // OCRはバックグラウンドで走る。結果が返ってきたら表示するため Realtime + ポーリング
  const [ocrStatus, setOcrStatus] = useState<string>(initialStatus);
  const [extracted, setExtracted] = useState<{
    full_name?: { value: string; confidence: number };
    furigana?: { value: string; confidence: number };
    postal_code?: { value: string; confidence: number };
    address?: { value: string; confidence: number };
    relation?: { value: string; confidence: number };
  } | null>(null);

  useEffect(() => {
    if (initialStatus === 'failed') return;

    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from('attendees')
        .select('ocr_status, ocr_extracted_fields, full_name, furigana, postal_code, address, relation')
        .eq('id', attendee_id)
        .single();
      if (cancelled || !data) return;
      setOcrStatus(data.ocr_status || 'pending');
      if (data.ocr_extracted_fields) {
        setExtracted(data.ocr_extracted_fields as any);
      }
    };

    // 即時1回 + 2秒ポーリング（OCR完了は通常3-6秒）
    tick();
    const id = setInterval(() => {
      if (cancelled) return;
      tick().then(() => {
        if (cancelled) return;
        // 完了/失敗したらポーリング停止
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [attendee_id, initialStatus]);

  const bgColor =
    ocrStatus === 'failed'
      ? 'bg-red-50'
      : ocrStatus === 'review_needed'
      ? 'bg-yellow-50'
      : ocrStatus === 'success'
      ? 'bg-green-50'
      : 'bg-accent-cream';

  const isProcessing = ocrStatus === 'pending' || ocrStatus === 'processing';

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

      {/* OCR状態 */}
      <div className="bg-white rounded-lg p-4 mb-4 border-2 border-gray-200">
        {isProcessing ? (
          <p className="text-sm text-gray-700 flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-accent-dark border-t-transparent rounded-full animate-spin"></span>
            読み取り処理中… 結果を待たずに「次の方」へ進めます
          </p>
        ) : ocrStatus === 'failed' ? (
          <p className="text-sm text-red-700 font-semibold">
            ⚠ 読み取りに失敗しました。後でダッシュボードから内容を確認してください。
          </p>
        ) : ocrStatus === 'review_needed' ? (
          <p className="text-sm text-yellow-800 font-semibold mb-2">
            ⚠ 一部の項目の読み取り精度が低いため「要確認」となりました
          </p>
        ) : (
          <p className="text-sm text-green-700 font-semibold mb-2">
            ✓ 読み取り完了
          </p>
        )}

        {extracted && (
          <dl className="text-sm space-y-1.5 mt-3">
            <FieldRow label="氏名" field={extracted.full_name} />
            <FieldRow label="ふりがな" field={extracted.furigana} />
            <FieldRow label="郵便番号" field={extracted.postal_code} />
            <FieldRow label="住所" field={extracted.address} />
            <FieldRow label="ご関係" field={extracted.relation} />
          </dl>
        )}
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
