'use client';

import { useEffect, useState } from 'react';
import { Attendee } from '@/types/database';
import { formatCurrency, formatKodenNumber, formatTime } from '@/lib/utils';

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

type AttendeeTableProps = {
  attendees: Attendee[];
  showCheckInStatus?: boolean;
  compact?: boolean;
  /** When provided, the table renders editable amount + offering cells. */
  onUpdate?: (id: string, updates: AttendeeUpdates) => Promise<void> | void;
  /** When provided, the table renders a delete button on each row. */
  onDelete?: (attendee: Attendee) => Promise<void> | void;
};

const isReceived = (a: Attendee) => a.koden_number != null;

export default function AttendeeTable({
  attendees,
  showCheckInStatus = true,
  compact = false,
  onUpdate,
  onDelete,
}: AttendeeTableProps) {
  if (attendees.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        参列者がまだいません
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {attendees.map((attendee) => (
          <div
            key={attendee.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-1">
              <div className="font-semibold text-accent-dark">
                <span className="text-gray-500 mr-2 font-mono text-xs">
                  #{formatKodenNumber(attendee.koden_number)}
                </span>
                {attendee.full_name}
              </div>
              {attendee.relation && (
                <div className="text-xs text-gray-600">{attendee.relation}</div>
              )}
            </div>
            <div className="text-right">
              {attendee.koden_amount != null && (
                <div className="font-semibold text-accent-gold">
                  {formatCurrency(attendee.koden_amount)}
                </div>
              )}
              {showCheckInStatus && (
                <div
                  className={`text-xs font-semibold ${
                    isReceived(attendee) ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {isReceived(attendee) ? '✓ 受付済み' : '未受付'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-accent-dark text-white">
          <tr>
            <th className="px-3 py-3 text-left font-semibold">管理番号</th>
            <th className="px-3 py-3 text-left font-semibold">氏名</th>
            <th className="px-3 py-3 text-left font-semibold">住所</th>
            <th className="px-3 py-3 text-left font-semibold">ご関係</th>
            <th className="px-3 py-3 text-right font-semibold">香典金額</th>
            <th className="px-3 py-3 text-center font-semibold">供花</th>
            <th className="px-3 py-3 text-center font-semibold">供物</th>
            <th className="px-3 py-3 text-center font-semibold">弔電</th>
            <th className="px-3 py-3 text-center font-semibold">その他</th>
            {showCheckInStatus && (
              <>
                <th className="px-3 py-3 text-center font-semibold">受付</th>
                <th className="px-3 py-3 text-left font-semibold">時刻</th>
              </>
            )}
            {onDelete && (
              <th className="px-3 py-3 text-center font-semibold">操作</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {attendees.map((attendee) => (
            <AttendeeRow
              key={attendee.id}
              attendee={attendee}
              onUpdate={onUpdate}
              onDelete={onDelete}
              showCheckInStatus={showCheckInStatus}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RowProps = {
  attendee: Attendee;
  onUpdate?: (id: string, updates: AttendeeUpdates) => Promise<void> | void;
  onDelete?: (attendee: Attendee) => Promise<void> | void;
  showCheckInStatus: boolean;
};

function AttendeeRow({
  attendee,
  onUpdate,
  onDelete,
  showCheckInStatus,
}: RowProps) {
  const editable = !!onUpdate;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    attendee.koden_amount != null ? String(attendee.koden_amount) : ''
  );

  useEffect(() => {
    setDraft(attendee.koden_amount != null ? String(attendee.koden_amount) : '');
  }, [attendee.koden_amount]);

  const saveAmount = async () => {
    setEditing(false);
    const parsed = draft === '' ? null : parseInt(draft, 10);
    if (parsed !== attendee.koden_amount && onUpdate) {
      await onUpdate(attendee.id, {
        koden_amount: Number.isNaN(parsed as number) ? null : parsed,
      });
    }
  };

  const toggle = async (
    key: 'has_kuge' | 'has_kumotsu' | 'has_chouden' | 'has_other_offering'
  ) => {
    if (!onUpdate) return;
    await onUpdate(attendee.id, { [key]: !attendee[key] } as AttendeeUpdates);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-3 font-mono text-accent-dark">
        {formatKodenNumber(attendee.koden_number)}
      </td>
      <td className="px-3 py-3 font-semibold text-accent-dark">
        {attendee.full_name}
      </td>
      <td className="px-3 py-3 text-gray-600 text-xs">
        {attendee.address || attendee.postal_code || '-'}
      </td>
      <td className="px-3 py-3 text-gray-600">{attendee.relation || '-'}</td>
      <td className="px-3 py-3 text-right font-semibold text-accent-gold">
        {editable ? (
          editing ? (
            <input
              type="number"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveAmount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAmount();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-28 px-2 py-1 border-2 border-accent-teal rounded text-right text-accent-dark focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="hover:bg-yellow-50 rounded px-2 py-1 w-full text-right"
              title="クリックして編集"
            >
              {attendee.koden_amount != null
                ? formatCurrency(attendee.koden_amount)
                : '未入力'}
            </button>
          )
        ) : attendee.koden_amount != null ? (
          formatCurrency(attendee.koden_amount)
        ) : (
          '-'
        )}
      </td>
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={!!attendee.has_kuge}
          onChange={() => toggle('has_kuge')}
          disabled={!editable}
          className="w-6 h-6 accent-accent-gold cursor-pointer disabled:cursor-default"
        />
      </td>
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={!!attendee.has_kumotsu}
          onChange={() => toggle('has_kumotsu')}
          disabled={!editable}
          className="w-6 h-6 accent-accent-gold cursor-pointer disabled:cursor-default"
        />
      </td>
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={!!attendee.has_chouden}
          onChange={() => toggle('has_chouden')}
          disabled={!editable}
          className="w-6 h-6 accent-accent-gold cursor-pointer disabled:cursor-default"
        />
      </td>
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={!!attendee.has_other_offering}
          onChange={() => toggle('has_other_offering')}
          disabled={!editable}
          className="w-6 h-6 accent-accent-gold cursor-pointer disabled:cursor-default"
        />
      </td>
      {showCheckInStatus && (
        <>
          <td className="px-3 py-3 text-center">
            {isReceived(attendee) ? (
              <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                ✓ 済
              </span>
            ) : (
              <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                未
              </span>
            )}
          </td>
          <td className="px-3 py-3 text-gray-600 text-xs">
            {attendee.checked_in_at ? formatTime(attendee.checked_in_at) : '-'}
          </td>
        </>
      )}
      {onDelete && (
        <td className="px-3 py-3 text-center">
          <button
            type="button"
            onClick={() => onDelete(attendee)}
            className="px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
            title="この参列者を削除"
          >
            削除
          </button>
        </td>
      )}
    </tr>
  );
}
