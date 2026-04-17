'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import AttendeeTable from '@/components/AttendeeTable';
import { supabase, getNextKodenNumber } from '@/lib/supabase';
import {
  softDeleteAttendeeResilient,
  updateAttendeeResilient,
} from '@/lib/resilient-db';
import { Attendee, Ceremony } from '@/types/database';
import { formatCurrency, formatKodenNumber } from '@/lib/utils';
import Papa from 'papaparse';
import toast from 'react-hot-toast';

type AttendeeUpdates = Partial<
  Pick<
    Attendee,
    | 'koden_amount'
    | 'has_kuge'
    | 'has_kumotsu'
    | 'has_chouden'
    | 'has_other_offering'
  >
>;

const isReceived = (a: Attendee) => a.koden_number != null;

export default function DashboardPage() {
  const params = useParams();
  const ceremonyId = params.ceremonyId as string;

  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'received' | 'unreceived'>(
    'all'
  );

  useEffect(() => {
    fetchCeremony();
    fetchAttendees();

    const channelName = `attendees:${ceremonyId}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendees',
          filter: `ceremony_id=eq.${ceremonyId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const n = payload.new as Attendee & { deleted_at?: string | null };
            if (n.deleted_at) return; // 論理削除済みは無視
            setAttendees((prev) => [n, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const n = payload.new as Attendee & { deleted_at?: string | null };
            if (n.deleted_at) {
              // 論理削除 → 一覧から除外
              setAttendees((prev) => prev.filter((a) => a.id !== n.id));
            } else {
              setAttendees((prev) =>
                prev.map((a) => (a.id === n.id ? n : a))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setAttendees((prev) => prev.filter((a) => a.id !== (payload.old as Attendee).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ceremonyId]);

  const fetchCeremony = async () => {
    try {
      const { data, error } = await supabase
        .from('ceremonies')
        .select('*')
        .eq('id', ceremonyId)
        .single();

      if (error) throw error;
      setCeremony(data);
    } catch (error) {
      console.error('Error fetching ceremony:', error);
      toast.error('式典が見つかりません');
    }
  };

  const fetchAttendees = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('attendees')
        .select('*')
        .eq('ceremony_id', ceremonyId)
        .is('deleted_at', null)
        .order('koden_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttendees(data || []);
    } catch (error) {
      console.error('Error fetching attendees:', error);
      toast.error('参列者の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle edits coming from the table (amount change or offering toggles).
   * If the attendee has no koden_number yet, assign one automatically so that
   * editing from the dashboard works as an implicit reception.
   */
  const handleUpdate = async (id: string, updates: AttendeeUpdates) => {
    const target = attendees.find((a) => a.id === id);
    if (!target) return;

    // Optimistic update
    setAttendees((prev) =>
      prev.map((a) => (a.id === id ? ({ ...a, ...updates } as Attendee) : a))
    );

    try {
      const patch: Record<string, unknown> = { ...updates };

      // Auto-assign management number on first edit if missing.
      if (target.koden_number == null) {
        const nextNumber = await getNextKodenNumber(ceremonyId);
        patch.koden_number = nextNumber;
        patch.checked_in = true;
        patch.check_in_method = target.check_in_method ?? 'concierge';
        patch.checked_in_at = new Date().toISOString();
      }

      const result = await updateAttendeeResilient(id, patch);
      if (!result.ok) {
        console.error('update failed:', result.error);
        throw new Error(result.error);
      }

      if (result.queued) {
        toast(
          'オフラインで保存しました。電波復帰後に送信されます。',
          { icon: '💾' }
        );
      } else if (result.data) {
        setAttendees((prev) =>
          prev.map((a) => (a.id === id ? (result.data as Attendee) : a))
        );
      }

      if (patch.koden_number != null && target.koden_number == null) {
        toast.success(
          `管理番号 ${formatKodenNumber(patch.koden_number as number)} を採番しました`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '更新に失敗しました';
      console.error('Error updating attendee:', error);
      toast.error(`更新に失敗しました: ${message}`);
      // Rollback optimistic update
      setAttendees((prev) => prev.map((a) => (a.id === id ? target : a)));
    }
  };

  /**
   * 参列者の論理削除（deleted_at を立てるだけ）。
   * データは物理的には残るので、誤削除した場合はSupabase管理画面から復元可能。
   */
  const handleDelete = async (attendee: Attendee) => {
    const label = attendee.koden_number
      ? `管理番号 ${formatKodenNumber(attendee.koden_number)} / ${attendee.full_name}`
      : attendee.full_name;
    const ok = window.confirm(
      `「${label}」を参列者一覧から削除します。\n` +
        `（データは削除済みとして保管されるため、誤操作の場合は復元可能です）\n` +
        `よろしいですか？`
    );
    if (!ok) return;

    // Optimistic removal
    const snapshot = attendees;
    setAttendees((prev) => prev.filter((a) => a.id !== attendee.id));

    const result = await softDeleteAttendeeResilient(attendee.id);
    if (!result.ok) {
      console.error('soft delete failed:', result.error);
      toast.error(`削除に失敗しました: ${result.error}`);
      setAttendees(snapshot);
      return;
    }

    if (result.queued) {
      toast('オフラインで削除を記録しました。電波復帰後に反映されます。', {
        icon: '💾',
      });
    } else {
      toast.success(`「${attendee.full_name}」を削除しました`);
    }
  };

  const filteredAttendees = attendees.filter((attendee) => {
    const matchesSearch = attendee.full_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'received' && isReceived(attendee)) ||
      (filterStatus === 'unreceived' && !isReceived(attendee));

    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: attendees.length,
    received: attendees.filter(isReceived).length,
    totalKoden: attendees.reduce((sum, a) => sum + (a.koden_amount || 0), 0),
    kuge: attendees.filter((a) => a.has_kuge).length,
    kumotsu: attendees.filter((a) => a.has_kumotsu).length,
    chouden: attendees.filter((a) => a.has_chouden).length,
    other: attendees.filter((a) => a.has_other_offering).length,
    // OCR要確認：撮影済だが信頼度低 or OCR失敗
    ocrPending: attendees.filter(
      (a: any) => a.ocr_status === 'pending' || a.ocr_status === 'processing'
    ).length,
    ocrReviewNeeded: attendees.filter(
      (a: any) => a.ocr_status === 'review_needed' || a.ocr_status === 'failed'
    ).length,
  };

  const handleExportCsv = () => {
    try {
      const csvData = attendees.map((attendee) => ({
        '管理番号': formatKodenNumber(attendee.koden_number),
        '氏名': attendee.full_name,
        '郵便番号': attendee.postal_code || '',
        '住所': attendee.address || '',
        '電話': attendee.phone || '',
        'ご関係': attendee.relation || '',
        '香典金額': attendee.koden_amount ?? '',
        '供花': attendee.has_kuge ? '○' : '',
        '供物': attendee.has_kumotsu ? '○' : '',
        '弔電': attendee.has_chouden ? '○' : '',
        'その他奉納': attendee.has_other_offering ? '○' : '',
        '受付状況': isReceived(attendee) ? '受付済み' : '未受付',
        '受付時刻': attendee.checked_in_at
          ? new Date(attendee.checked_in_at).toLocaleString('ja-JP')
          : '',
      }));

      const csv = Papa.unparse(csvData);
      // Add BOM so Excel opens CSV as UTF-8 correctly.
      const blob = new Blob(['\uFEFF' + csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `${ceremony?.name || 'ceremony'}_attendees_${new Date().toISOString().split('T')[0]}.csv`
      );
      link.click();

      toast.success('CSVエクスポートが完了しました');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('エクスポートに失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-accent-cream">
      <Header backButton={true} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {ceremony && (
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-accent-dark mb-2">
              {ceremony.name}
            </h1>
            <p className="text-gray-600">
              故人: {ceremony.deceased_name} | 会場: {ceremony.venue}
            </p>
            <div className="flex gap-3 mt-3">
              <Link
                href={`/reception/${ceremonyId}`}
                className="px-4 py-2 bg-accent-gold text-white text-sm font-semibold rounded-lg hover:opacity-90"
              >
                📷 受付画面
              </Link>
              <Link
                href={`/amount/${ceremonyId}`}
                className="px-4 py-2 bg-accent-teal text-white text-sm font-semibold rounded-lg hover:opacity-90"
              >
                💰 金額入力
              </Link>
              <Link
                href={`/review/${ceremonyId}`}
                className="px-4 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:opacity-90"
              >
                ⚠ 要確認レビュー
                {stats.ocrReviewNeeded > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.5em] h-5 px-1.5 text-xs bg-white text-yellow-700 rounded-full font-bold">
                    {stats.ocrReviewNeeded}
                  </span>
                )}
              </Link>
            </div>
          </div>
        )}

        {/* OCR処理状況リマインダー（pending or review_neededがある時のみ表示） */}
        {(stats.ocrPending > 0 || stats.ocrReviewNeeded > 0) && (
          <div className="mb-6 card bg-yellow-50 border-2 border-yellow-300">
            <div className="flex items-start gap-3">
              <div className="text-2xl">📋</div>
              <div className="flex-1">
                <p className="font-bold text-yellow-900">未処理のOCRがあります</p>
                <p className="text-sm text-yellow-800 mt-1">
                  {stats.ocrPending > 0 && (
                    <span className="mr-4">
                      🔄 処理待ち <strong>{stats.ocrPending}</strong>件
                    </span>
                  )}
                  {stats.ocrReviewNeeded > 0 && (
                    <span>
                      ⚠ 要確認 <strong>{stats.ocrReviewNeeded}</strong>件
                    </span>
                  )}
                </p>
                <p className="text-xs text-yellow-700 mt-2">
                  ※ OCRが完了してから別室で香典袋を開封・金額入力するのが安全です。
                </p>
              </div>
              {stats.ocrReviewNeeded > 0 && (
                <Link
                  href={`/review/${ceremonyId}`}
                  className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:opacity-90 whitespace-nowrap"
                >
                  確認する →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-4">
          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-2">総参列者数</p>
            <p className="text-4xl font-bold text-accent-dark">{stats.total}</p>
          </div>

          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-2">受付済み</p>
            <p className="text-4xl font-bold text-accent-gold">
              {stats.received}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {stats.total > 0
                ? `${Math.round((stats.received / stats.total) * 100)}%`
                : '0%'}
            </p>
          </div>

          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-2">香典合計金額</p>
            <p className="text-3xl font-bold text-accent-teal">
              {formatCurrency(stats.totalKoden)}
            </p>
          </div>
        </div>

        {/* Offering stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-1">供花</p>
            <p className="text-2xl font-bold text-accent-dark">{stats.kuge} 件</p>
          </div>
          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-1">供物</p>
            <p className="text-2xl font-bold text-accent-dark">
              {stats.kumotsu} 件
            </p>
          </div>
          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-1">弔電</p>
            <p className="text-2xl font-bold text-accent-dark">
              {stats.chouden} 件
            </p>
          </div>
          <div className="card animate-fade-in">
            <p className="text-sm text-gray-600 mb-1">その他奉納</p>
            <p className="text-2xl font-bold text-accent-dark">{stats.other} 件</p>
          </div>
        </div>

        {/* Controls and Filters */}
        <div className="card mb-8 animate-fade-in">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="氏名で検索..."
                className="input-base"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="input-base flex-1 md:flex-none"
              >
                <option value="all">全員</option>
                <option value="received">受付済み</option>
                <option value="unreceived">未受付</option>
              </select>

              <button
                onClick={handleExportCsv}
                className="px-6 py-3 bg-accent-teal text-white font-semibold rounded-lg hover:opacity-90 transition-all whitespace-nowrap"
              >
                CSVエクスポート
              </button>
            </div>
          </div>
        </div>

        {/* Attendee List */}
        <div className="card animate-fade-in">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-accent-dark">参列者一覧</h2>
            <p className="text-sm text-gray-600 mt-2">
              {loading
                ? '読み込み中...'
                : `${filteredAttendees.length} 件表示 ・ 金額をクリックで編集 ・ 右端の「削除」で行を削除`}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">読み込み中...</div>
          ) : filteredAttendees.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery || filterStatus !== 'all'
                ? '該当する参列者がありません'
                : '参列者がまだいません'}
            </div>
          ) : (
            <AttendeeTable
              attendees={filteredAttendees}
              showCheckInStatus={true}
              compact={false}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>
    </div>
  );
}
