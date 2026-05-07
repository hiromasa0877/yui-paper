'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Attendee } from '@/types/database';
import { formatCurrency, formatKodenNumber, formatTime } from '@/lib/utils';

// 「編集」モーダル経由で OCR 結果を直す用途を含むため、
// 文字列フィールドも更新可能な型として許容する。
type AttendeeUpdates = Partial<
  Pick<
    Attendee,
    | 'koden_amount'
    | 'has_kuge'
    | 'has_kumotsu'
    | 'has_chouden'
    | 'has_other_offering'
    | 'full_name'
    | 'furigana'
    | 'postal_code'
    | 'address'
    | 'phone'
    | 'relation'
    | 'ocr_status'
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
            <th className="px-3 py-3 text-left font-semibold">電話</th>
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
            {(onUpdate || onDelete) && (
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
  const [editModalOpen, setEditModalOpen] = useState(false);
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
      <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
        {attendee.phone ? (
          // 電話番号は tel: リンクにしておくと、現場で iPad/iPhone から
          // タップですぐ発信できる。葬儀現場の連絡業務で地味に効く。
          <a
            href={`tel:${attendee.phone.replace(/[^\d+]/g, '')}`}
            className="hover:underline text-accent-teal"
          >
            {attendee.phone}
          </a>
        ) : (
          '-'
        )}
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
      {(onUpdate || onDelete) && (
        <td className="px-3 py-3 text-center whitespace-nowrap">
          {onUpdate && (
            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="px-3 py-2 mr-2 text-xs font-semibold text-accent-teal bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors"
              title="氏名・住所・電話などOCR結果を修正"
            >
              編集
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(attendee)}
              className="px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
              title="この参列者を削除"
            >
              削除
            </button>
          )}
        </td>
      )}
      {editModalOpen && onUpdate && (
        <EditAttendeeModal
          attendee={attendee}
          onClose={() => setEditModalOpen(false)}
          onSave={async (patch) => {
            await onUpdate(attendee.id, patch);
            setEditModalOpen(false);
          }}
        />
      )}
    </tr>
  );
}

/**
 * OCR結果（氏名・ふりがな・郵便番号・住所・電話・ご関係）をダッシュボードから
 * 直接修正するためのモーダル。
 *
 * 受付撮影直後に「氏名が誤読されている」「電話の数字が一桁ズレてる」など
 * の典型ミスを、レビュー画面に行かずその場で直せるようにするための導線。
 *
 * 確定すると ocr_status を 'success' に上げる（要確認だったレコードがここで
 * 修正された場合に、自動で要確認バッジが消えるようにするため）。
 */
function EditAttendeeModal({
  attendee,
  onClose,
  onSave,
}: {
  attendee: Attendee;
  onClose: () => void;
  onSave: (patch: AttendeeUpdates) => Promise<void> | void;
}) {
  const [fullName, setFullName] = useState(attendee.full_name || '');
  const [furigana, setFurigana] = useState(attendee.furigana || '');
  const [postalCode, setPostalCode] = useState(attendee.postal_code || '');
  const [address, setAddress] = useState(attendee.address || '');
  const [phone, setPhone] = useState(attendee.phone || '');
  const [relation, setRelation] = useState(attendee.relation || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fullName.trim()) {
      alert('氏名は必須です');
      return;
    }
    setSaving(true);
    try {
      const patch: AttendeeUpdates = {
        full_name: fullName.trim(),
        furigana: furigana.trim() || null,
        postal_code: postalCode.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        relation: (relation || null) as Attendee['relation'],
      };
      // 要確認だったレコードがここで修正されたら自動で確定扱いにする
      if (attendee.ocr_status === 'review_needed' || attendee.ocr_status === 'failed') {
        patch.ocr_status = 'success';
      }
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  };

  // Esc でキャンセル、Ctrl+Enter で保存（PCでも素早く回せるように）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, furigana, postalCode, address, phone, relation]);

  // モーダルは <tr> の中に直接ぶら下げると HTML が不正になる（td 以外を tr に置けない）。
  // createPortal で document.body に逃がして、テーブル構造に影響しないようにする。
  if (typeof document === 'undefined') return null;
  return createPortal(
    (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-accent-dark">
                #{formatKodenNumber(attendee.koden_number)} の内容を修正
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <ModalField
                label="氏名"
                required
                value={fullName}
                onChange={setFullName}
              />
              <ModalField label="ふりがな" value={furigana} onChange={setFurigana} />
              <ModalField
                label="郵便番号"
                value={postalCode}
                onChange={setPostalCode}
              />
              <ModalField
                label="住所"
                multiline
                value={address}
                onChange={setAddress}
              />
              <ModalField
                label="電話番号"
                value={phone}
                onChange={setPhone}
                hint="数字一桁の誤読が出やすい項目です。OCR画像と必ず突き合わせてください"
              />
              <div>
                <label className="block text-sm font-semibold text-accent-dark mb-1">
                  ご関係
                </label>
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
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
                type="button"
                onClick={onClose}
                disabled={saving}
                className="py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary py-3 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Ctrl+Enter で保存 / Esc でキャンセル
            </p>
          </div>
        </div>
      </div>
    ),
    document.body
  );
}

function ModalField({
  label,
  value,
  onChange,
  required,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
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
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
