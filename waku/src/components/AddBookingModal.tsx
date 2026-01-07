'use client';

import { useState, useEffect } from 'react';
import { sessionsApi, bookingsApi, type Booking } from '../lib/api-client';

type AddBookingModalProps = {
  facilityId: string;
  sessionId: string;
  planName: string;
  currentCount: number;
  maxCapacity: number;
  currentCustomerName?: string;
  onClose: () => void;
  onAdded: () => void;
  onDeleted?: () => void;
};

export function AddBookingModal({
  facilityId,
  sessionId,
  planName,
  currentCount,
  maxCapacity,
  currentCustomerName: _currentCustomerName,
  onClose,
  onAdded,
  onDeleted,
}: AddBookingModalProps) {
  const [mode, setMode] = useState<'add' | 'list' | 'adjust' | 'delete'>('add');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [addCount, setAddCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<number | null>(null);

  // 編集中の予約
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editName, setEditName] = useState('');
  const [editCount, setEditCount] = useState(1);

  // 定員変更用
  const [adjustCapacity, setAdjustCapacity] = useState(maxCapacity);

  const remainingCapacity = maxCapacity - currentCount;

  // 顧客名から人数部分を除去するヘルパー関数
  const extractNameWithoutCount = (name: string): string => {
    const match = name.match(/^(.+?)\s*\d+名?$/);
    return match ? match[1] : name;
  };

  // 予約一覧を取得
  const fetchBookings = async () => {
    setLoadingBookings(true);
    try {
      const result = await bookingsApi.list(facilityId, sessionId);
      setBookings(result.bookings.filter(b => b.status === 'confirmed'));
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  // タブが「一覧」に切り替わった時に予約を取得
  useEffect(() => {
    if (mode === 'list') {
      fetchBookings();
    }
  }, [mode]);

  // 個別予約を削除
  const handleDeleteBooking = async (bookingId: number) => {
    if (!confirm('この予約を削除しますか？')) {
      return;
    }

    setDeletingBookingId(bookingId);
    setError(null);
    try {
      await bookingsApi.delete(facilityId, bookingId);
      // 一覧から削除
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      onAdded(); // SSEで更新されるが念のため
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約の削除に失敗しました');
    } finally {
      setDeletingBookingId(null);
    }
  };

  // 支払いステータスを切り替え
  const handleTogglePaymentStatus = async (bookingId: number, currentStatus: 'paid' | 'unpaid') => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await bookingsApi.updatePaymentStatus(facilityId, bookingId, newStatus);
      // 一覧を更新
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, paymentStatus: newStatus } : b
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '支払いステータスの更新に失敗しました');
    }
  };

  // 予約の編集を開始
  const handleStartEdit = (booking: Booking) => {
    setEditingBooking(booking);
    // 名前から人数部分を除去
    const match = booking.customerName.match(/^(.+?)\s*\d+名?$/);
    setEditName(match ? match[1] : booking.customerName);
    setEditCount(booking.customerCount);
    setError(null);
  };

  // 予約の編集をキャンセル
  const handleCancelEdit = () => {
    setEditingBooking(null);
    setEditName('');
    setEditCount(1);
    setError(null);
  };

  // 予約を更新
  const handleUpdateBooking = async () => {
    if (!editingBooking) return;

    setError(null);
    setSubmitting(true);
    try {
      // 他の予約の合計を計算
      const otherTotal = bookings
        .filter(b => b.id !== editingBooking.id)
        .reduce((sum, b) => sum + b.customerCount, 0);

      if (otherTotal + editCount > maxCapacity) {
        setError(`残り定員は${maxCapacity - otherTotal}名です`);
        setSubmitting(false);
        return;
      }

      const nameWithCount = editName
        ? `${editName} ${editCount}名`
        : `${editCount}名`;

      await bookingsApi.update(facilityId, editingBooking.id, {
        customerName: nameWithCount,
        customerCount: editCount,
      });

      // 一覧を更新
      setBookings(prev => prev.map(b =>
        b.id === editingBooking.id
          ? { ...b, customerName: nameWithCount, customerCount: editCount }
          : b
      ));
      handleCancelEdit();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (addCount < 1) {
      setError('人数は1以上を入力してください');
      return;
    }

    if (addCount > remainingCapacity) {
      setError(`残り定員は${remainingCapacity}名です`);
      return;
    }

    setSubmitting(true);
    try {
      // 顧客名に人数を付加して保存（例: "田中様 2名"）
      const nameWithCount = customerName
        ? `${customerName} ${addCount}名`
        : `${addCount}名`;
      // bookingsApi.create を使用して session_bookings テーブルに保存
      await bookingsApi.create(facilityId, sessionId, {
        customerName: nameWithCount,
        customerCount: addCount,
      });
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約の追加に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 定員変更
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (adjustCapacity < 1) {
      setError('定員は1以上を入力してください');
      return;
    }

    if (adjustCapacity < currentCount) {
      setError(`現在の予約人数(${currentCount}名)より少ない定員は設定できません`);
      return;
    }

    setSubmitting(true);
    try {
      await sessionsApi.updateCapacity(facilityId, sessionId, adjustCapacity);
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '定員の変更に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!confirm('この枠を削除しますか？予約情報も全て削除されます。')) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await sessionsApi.cancel(facilityId, sessionId);
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '枠の削除に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          予約管理 - {planName}
        </h3>

        {/* タブ切り替え */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'add'
                ? 'bg-white shadow text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => setMode('list')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'list'
                ? 'bg-white shadow text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            一覧
          </button>
          <button
            type="button"
            onClick={() => setMode('adjust')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'adjust'
                ? 'bg-white shadow text-green-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            調整
          </button>
          <button
            type="button"
            onClick={() => setMode('delete')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'delete'
                ? 'bg-white shadow text-red-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            削除
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            現在の予約: <span className="font-medium">{currentCount}/{maxCapacity}名</span>
            <br />
            残り定員: <span className="font-medium">{remainingCapacity}名</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {mode === 'add' && (
          <form onSubmit={handleAddSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                お客様名（任意）
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="田中様"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                追加人数 *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={addCount}
                  onChange={(e) => setAddCount(Number(e.target.value) || 1)}
                  min={1}
                  max={remainingCapacity}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <span className="text-sm text-gray-600">名</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting || remainingCapacity <= 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
              >
                {submitting ? '追加中...' : '予約を追加'}
              </button>
            </div>
          </form>
        )}

        {mode === 'list' && (
          <div>
            {loadingBookings ? (
              <div className="text-center py-8 text-gray-500">読み込み中...</div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                予約がありません
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-center py-2 px-1 font-medium text-gray-700 w-12">支払</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">お客様名</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700">人数</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking.id} className="border-t border-gray-100 hover:bg-gray-50">
                        {editingBooking?.id === booking.id ? (
                          // 編集モード
                          <>
                            <td className="py-2 px-2" colSpan={4}>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="お客様名"
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={editCount}
                                    onChange={(e) => setEditCount(Number(e.target.value) || 1)}
                                    min={1}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <span className="text-xs text-gray-600">名</span>
                                  <div className="flex-1 flex justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                    >
                                      キャンセル
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleUpdateBooking}
                                      disabled={submitting}
                                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
                                    >
                                      {submitting ? '...' : '保存'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </>
                        ) : (
                          // 表示モード
                          <>
                            <td className="py-2 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleTogglePaymentStatus(booking.id, booking.paymentStatus)}
                                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                                  booking.paymentStatus === 'paid'
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                }`}
                                title={booking.paymentStatus === 'paid' ? 'クリックで未払いに変更' : 'クリックで支払い済みに変更'}
                              >
                                {booking.paymentStatus === 'paid' ? '済' : '未'}
                              </button>
                            </td>
                            <td className="py-2 px-2 truncate max-w-37.5">
                              {booking.customerName ? extractNameWithoutCount(booking.customerName) : '名前なし'}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {booking.customerCount}名
                            </td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(booking)}
                                  className="text-blue-500 hover:text-blue-700"
                                  title="編集"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBooking(booking.id)}
                                  disabled={deletingBookingId === booking.id}
                                  className="text-red-500 hover:text-red-700 disabled:text-red-300"
                                  title="削除"
                                >
                                  {deletingBookingId === booking.id ? (
                                    <span className="text-xs">...</span>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {mode === 'adjust' && (
          <form onSubmit={handleAdjustSubmit}>
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                この枠の最大定員を変更できます。<br />
                <span className="text-xs text-green-600">
                  ※現在の予約人数より少ない定員には変更できません
                </span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最大定員 *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={adjustCapacity}
                  onChange={(e) => setAdjustCapacity(Number(e.target.value) || 1)}
                  min={currentCount > 0 ? currentCount : 1}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <span className="text-sm text-gray-600">名</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                現在の予約: {currentCount}名
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300"
              >
                {submitting ? '更新中...' : '定員を変更'}
              </button>
            </div>
          </form>
        )}

        {mode === 'delete' && (
          <div>
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium mb-2">
                この枠を削除しますか？
              </p>
              <p className="text-sm text-red-600">
                削除すると、この枠に登録されている全ての予約情報が失われます。
              </p>
              {currentCount > 0 && (
                <p className="text-sm text-red-700 font-medium mt-2">
                  現在 {currentCount}名 の予約があります。
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300"
              >
                {submitting ? '削除中...' : '枠を削除'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
