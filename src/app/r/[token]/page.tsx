'use client';

/**
 * 公開受付ページ /r/<token>
 *
 * 葬儀現場の手伝いスタッフが葬儀社オーナーアカウントを共有しなくても
 * その式典だけ受付スキャンができる受付モード専用ページ。
 *
 * 設計上の制限:
 *   - 過去の参列者リストは一切表示しない（住所・電話・金額のリーク防止）
 *   - 累計件数は出すが、それも要望次第で消せるようにシンプルな数字だけ
 *   - すべての API 呼び出しに X-Reception-Token ヘッダを付ける
 *   - Supabase に直接クエリしない（anon ロールで attendees に届かない＋トークン1点突破の設計を維持）
 *   - OCR 結果の表示・ポーリングは行わない（手伝い人は番号だけ知れれば良い）
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatKodenNumber } from '@/lib/utils';
import { compressImageForOcr } from '@/lib/image-utils';
import toast from 'react-hot-toast';

type ResolvedToken = {
  ceremony_id: string;
  ceremony_name: string;
  deceased_name: string;
  expires_at: string | null;
  display_name: string;
};

type ScanResponse = {
  attendee_id: string;
  koden_number: number;
  ocr_status: 'pending' | 'failed';
  image_path: string | null;
  mime_type: string;
};

type ViewState = 'loading' | 'idle' | 'preview' | 'scanning' | 'result' | 'error';

export default function ReceptionTokenPage() {
  const params = useParams();
  const token = params.token as string;

  const [resolved, setResolved] = useState<ResolvedToken | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  // 累計件数は表示するが、内訳は一切見せない方針なので数字だけ持つ
  const [scanCount, setScanCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  // 起動時にトークンを解決
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/reception/resolve-token?token=${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          if (cancelled) return;
          setResolveError(
            res.status === 404
              ? 'この受付URLは無効か、有効期限が切れています。葬儀社の担当者に新しいURLを発行してもらってください。'
              : `読み込みに失敗しました (HTTP ${res.status})`
          );
          setViewState('error');
          return;
        }
        const json = (await res.json()) as ResolvedToken;
        if (cancelled) return;
        setResolved(json);
        setViewState('idle');
      } catch (e: any) {
        if (cancelled) return;
        setResolveError(
          'ネットワークエラーで受付URLを確認できません。電波状況を確認してから再度開いてください。'
        );
        setViewState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFileSelected = (file: File) => {
    selectedFileRef.current = file;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setViewState('preview');
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    const file = selectedFileRef.current;
    if (!file || !resolved) return;

    // 受付トークンが空なら絶対に投げない（意味のない 401 を踏まないため）。
    // ここに来ているということは resolved が成立しているはずだが、念のためチェック。
    if (!token || typeof token !== 'string' || token.length === 0) {
      toast.error('受付URLが不完全です。URLを開き直してください。', {
        duration: 5000,
      });
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('電波がありません。電波が回復してから再撮影してください。', {
        duration: 5000,
      });
      return;
    }

    setViewState('scanning');
    try {
      const compressed = await compressImageForOcr(file);
      const clientRef =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const form = new FormData();
      form.append('ceremony_id', resolved.ceremony_id);
      form.append('image', compressed);
      form.append('client_ref', clientRef);

      const res = await fetch('/api/reception/scan', {
        method: 'POST',
        // 受付トークンを X-Reception-Token に乗せて送る。
        // サーバ側はこのヘッダがあるとトークン認証経路で ceremony_id 照合を行う。
        headers: { 'X-Reception-Token': token },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `スキャンに失敗しました (HTTP ${res.status})`);
      }
      const json = (await res.json()) as ScanResponse;

      setResult(json);
      setViewState('result');
      setScanCount((n) => n + 1);

      // OCR は fire-and-forget（手伝い人は結果を待たない）
      if (json.image_path) {
        try {
          fetch('/api/reception/process-ocr', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Reception-Token': token,
            },
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
        {viewState === 'loading' && (
          <div className="card text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-accent-gold mb-4" />
            <p className="text-gray-600">受付URLを確認しています...</p>
          </div>
        )}

        {viewState === 'error' && (
          <div className="card text-center py-12">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-accent-dark mb-3">
              受付URLが利用できません
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {resolveError}
            </p>
          </div>
        )}

        {resolved && viewState !== 'loading' && viewState !== 'error' && (
          <>
            {/* ヘッダー: 式典名のみ。参列者数や金額は出さない。 */}
            <div className="mb-5 text-center">
              <div className="inline-block px-3 py-1 bg-accent-gold/20 text-accent-dark rounded-full text-xs font-semibold mb-2">
                受付モード
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-accent-dark">
                {resolved.ceremony_name}
              </h1>
              {resolved.deceased_name && (
                <p className="text-sm text-gray-600 mt-1">
                  故人: {resolved.deceased_name}
                </p>
              )}
              {scanCount > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  この端末での受付 {scanCount} 名
                </p>
              )}
            </div>

            {viewState === 'idle' && (
              <IdleView onCameraClick={handleCameraClick} />
            )}

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
          </>
        )}

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
      <h2 className="text-xl font-bold text-accent-dark mb-2">受付中...</h2>
      <p className="text-sm text-gray-600">番号を採番しています</p>
    </div>
  );
}

/**
 * 公開受付モードでは OCR 結果は表示しない（住所・電話などが手伝い人に
 * 漏れないように）。受付番号と「次の方へ」だけ。
 */
function ResultView({
  result,
  onNext,
}: {
  result: ScanResponse;
  onNext: () => void;
}) {
  return (
    <div className="card bg-accent-cream">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-600 mb-2">受付番号</p>
        <div className="text-7xl sm:text-8xl font-bold text-accent-dark tracking-wider mb-2">
          #{formatKodenNumber(result.koden_number)}
        </div>
        <p className="text-base font-semibold text-accent-dark mt-4">
          👆 この番号を紙と香典袋に記入してください
        </p>
      </div>

      <div className="bg-white rounded-lg p-4 mb-4 border-2 border-gray-200 text-center">
        <p className="text-sm text-gray-700">
          受付完了。読み取りはバックグラウンドで進行します。
        </p>
        <p className="text-xs text-gray-500 mt-1">
          内容の確認・修正は葬儀社のダッシュボードで行います
        </p>
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
