'use client';

import { useState, useEffect, useCallback } from 'react';
import { sessionsApi, bookingsApi, assignmentsApi, type SessionDetail, type Booking, type UpdateSessionInput, type Court, type Shift } from '../lib/api-client';
import { formatTimeJST } from '../lib/time-utils';
import {
  getSessionStatusLabel,
  getSessionStatusBadgeColor,
  getPaymentStatusLabel,
  getPaymentStatusColor,
} from '../constants/status';

type SessionDetailModalProps = {
  facilityId: string;
  sessionId: string;
  courtName: string;
  onClose: () => void;
  onStartSession?: () => Promise<void>;
  onCompleteSession?: () => Promise<void>;
  onCancelSession?: () => Promise<void>;
  onSessionUpdated?: () => void;
  courts?: Court[]; // Optional: for court move functionality
  shifts?: Shift[]; // Optional: for staff assignment
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function formatTimestampToInput(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTimestampToDateInput(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTimeInputToTimestamp(timeString: string, dateString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

// シフトがセッションの時間帯をカバーしているかチェック
function isShiftAvailableForSession(
  shift: Shift,
  sessionStartTime: number,
  sessionEndTime: number | undefined
): boolean {
  // シフトの開始・終了時間がセッションの時間と重なっているか確認
  // シフト時間がセッション時間の少なくとも一部をカバーしていれば割り当て可能
  const shiftStart = shift.startTime;
  const shiftEnd = shift.endTime;
  const sessEnd = sessionEndTime || sessionStartTime + 3600; // 終了時間がなければ1時間と仮定

  // シフトとセッションが重なっているか
  // シフト開始がセッション終了より前 AND シフト終了がセッション開始より後
  return shiftStart < sessEnd && shiftEnd > sessionStartTime;
}

export function SessionDetailModal({
  facilityId,
  sessionId,
  courtName,
  onClose,
  onStartSession,
  onCompleteSession,
  onCancelSession,
  onSessionUpdated,
  courts,
  shifts,
}: SessionDetailModalProps) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit mode states for non-slot plans
  const [isEditing, setIsEditing] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerCount, setEditCustomerCount] = useState(1);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editMemo, setEditMemo] = useState('');

  // Court move state
  const [isMovingCourt, setIsMovingCourt] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');

  // Staff assignment state
  const [isAssigningStaff, setIsAssigningStaff] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  const fetchBookings = useCallback(async () => {
    try {
      const result = await bookingsApi.list(facilityId, sessionId);
      setBookings(result.bookings);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    }
  }, [facilityId, sessionId]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        setLoading(true);
        const result = await sessionsApi.get(facilityId, sessionId);
        setSession(result.session);
        // 枠プランの場合は予約一覧も取得
        if (result.session.isSlotBased) {
          await fetchBookings();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [facilityId, sessionId, fetchBookings]);

  const handleStart = async () => {
    if (!onStartSession) return;
    try {
      setActionLoading(true);
      await onStartSession();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!onCompleteSession) return;
    try {
      setActionLoading(true);
      await onCompleteSession();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancelSession) return;
    if (!confirm('この予約をキャンセルしますか？')) return;
    try {
      setActionLoading(true);
      await onCancelSession();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePaymentStatus = useCallback(async () => {
    if (!session) return;
    const newStatus = session.paymentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      setActionLoading(true);
      await sessionsApi.updatePaymentStatus(facilityId, sessionId, newStatus);
      setSession({ ...session, paymentStatus: newStatus });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment status');
    } finally {
      setActionLoading(false);
    }
  }, [session, facilityId, sessionId]);

  const handleToggleBookingPayment = useCallback(async (bookingId: number, currentStatus: 'paid' | 'unpaid') => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await bookingsApi.updatePaymentStatus(facilityId, bookingId, newStatus);
      await fetchBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking payment status');
    }
  }, [facilityId, fetchBookings]);

  const handleDeleteBooking = useCallback(async (bookingId: number) => {
    if (!confirm('この予約を削除しますか？')) return;
    try {
      await bookingsApi.delete(facilityId, bookingId);
      await fetchBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete booking');
    }
  }, [facilityId, fetchBookings]);

  // Court move functions
  const handleStartCourtMove = useCallback(() => {
    if (!session) return;
    setSelectedCourtId(session.courtId);
    setIsMovingCourt(true);
  }, [session]);

  const handleCancelCourtMove = useCallback(() => {
    setIsMovingCourt(false);
    setSelectedCourtId('');
  }, []);

  const handleConfirmCourtMove = useCallback(async () => {
    if (!session || !selectedCourtId || selectedCourtId === session.courtId) {
      setIsMovingCourt(false);
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const result = await sessionsApi.move(facilityId, sessionId, selectedCourtId);

      // Update local session state with new court
      setSession({
        ...session,
        courtId: result.newCourtId,
        courtName: result.newCourtName,
      });

      setIsMovingCourt(false);
      onSessionUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move session');
    } finally {
      setActionLoading(false);
    }
  }, [session, selectedCourtId, facilityId, sessionId, onSessionUpdated]);

  // Staff assignment functions
  const handleStartAssignStaff = useCallback(() => {
    setIsAssigningStaff(true);
    // Select first available shift by default
    if (shifts && shifts.length > 0) {
      const assignedShiftIds = new Set(session?.assignments?.map(a => a.shiftId) || []);
      const availableShift = shifts.find(s => !assignedShiftIds.has(s.id));
      if (availableShift) {
        setSelectedShiftId(availableShift.id);
      }
    }
  }, [shifts, session?.assignments]);

  const handleCancelAssignStaff = useCallback(() => {
    setIsAssigningStaff(false);
    setSelectedShiftId('');
  }, []);

  const handleConfirmAssignStaff = useCallback(async () => {
    if (!selectedShiftId) {
      setIsAssigningStaff(false);
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      await assignmentsApi.assign(facilityId, sessionId, { shiftId: selectedShiftId });

      // Refresh session data to get updated assignments
      const result = await sessionsApi.get(facilityId, sessionId);
      setSession(result.session);

      setIsAssigningStaff(false);
      setSelectedShiftId('');
      onSessionUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スタッフの割り当てに失敗しました');
    } finally {
      setActionLoading(false);
    }
  }, [selectedShiftId, facilityId, sessionId, onSessionUpdated]);

  const handleUnassignStaff = useCallback(async (shiftId: string) => {
    if (!confirm('このスタッフの割り当てを解除しますか？')) return;

    try {
      setActionLoading(true);
      setError(null);
      await assignmentsApi.unassign(facilityId, sessionId, shiftId);

      // Refresh session data to get updated assignments
      const result = await sessionsApi.get(facilityId, sessionId);
      setSession(result.session);

      onSessionUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スタッフの割り当て解除に失敗しました');
    } finally {
      setActionLoading(false);
    }
  }, [facilityId, sessionId, onSessionUpdated]);

  // Start editing non-slot session
  const handleStartEdit = useCallback(() => {
    if (!session) return;
    setEditCustomerName(session.customerName || '');
    setEditCustomerCount(session.customerCount || 1);
    setEditDate(formatTimestampToDateInput(session.startTime));
    setEditStartTime(formatTimestampToInput(session.startTime));
    setEditEndTime(session.estimatedEndTime ? formatTimestampToInput(session.estimatedEndTime) : '');
    setEditMemo(session.memo || '');
    setIsEditing(true);
  }, [session]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  // Save edited session
  const handleSaveEdit = useCallback(async () => {
    if (!session) return;

    try {
      setActionLoading(true);
      setError(null);

      const updates: UpdateSessionInput = {};

      if (editCustomerName !== (session.customerName || '')) {
        updates.customerName = editCustomerName;
      }
      if (editCustomerCount !== session.customerCount) {
        updates.customerCount = editCustomerCount;
      }
      if (editMemo !== (session.memo || '')) {
        updates.memo = editMemo;
      }

      // Parse time/date changes (only if session is not in_use)
      if (session.status !== 'in_use') {
        const newStartTime = parseTimeInputToTimestamp(editStartTime, editDate);
        if (newStartTime !== session.startTime) {
          updates.startTime = newStartTime;
        }

        if (editEndTime) {
          const newEndTime = parseTimeInputToTimestamp(editEndTime, editDate);
          if (newEndTime !== session.estimatedEndTime) {
            updates.estimatedEndTime = newEndTime;
          }
        }
      }

      // Only update if there are changes
      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        return;
      }

      const result = await sessionsApi.update(facilityId, sessionId, updates);

      // Update local state
      setSession({
        ...session,
        customerName: result.session.customerName,
        customerCount: result.session.customerCount,
        startTime: result.session.startTime,
        estimatedEndTime: result.session.estimatedEndTime,
        memo: result.session.memo,
      });

      setIsEditing(false);
      onSessionUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session');
    } finally {
      setActionLoading(false);
    }
  }, [session, editCustomerName, editCustomerCount, editDate, editStartTime, editEndTime, editMemo, facilityId, sessionId, onSessionUpdated]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">予約詳細</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">読み込み中...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : session ? (
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">ステータス</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSessionStatusBadgeColor(session.status)}`}>
                  {getSessionStatusLabel(session.status)}
                </span>
              </div>

              {/* Payment Status - 枠プラン以外のみ表示（枠プランは個別予約で管理） */}
              {!session.isSlotBased && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">支払い状況</span>
                  <button
                    onClick={handleTogglePaymentStatus}
                    disabled={actionLoading}
                    className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 disabled:opacity-50 ${getPaymentStatusColor(session.paymentStatus)}`}
                  >
                    {getPaymentStatusLabel(session.paymentStatus)}
                  </button>
                </div>
              )}

              {/* Court */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">コート</span>
                {isMovingCourt ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCourtId}
                      onChange={(e) => setSelectedCourtId(e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      {courts?.filter(c => c.isActive).map((court) => (
                        <option key={court.id} value={court.id}>
                          {court.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleConfirmCourtMove}
                      disabled={actionLoading || selectedCourtId === session.courtId}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoading ? '...' : '移動'}
                    </button>
                    <button
                      onClick={handleCancelCourtMove}
                      disabled={actionLoading}
                      className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{session.courtName || courtName}</span>
                    {courts && courts.length > 1 && (session.status === 'reserved' || session.status === 'in_use') && (
                      <button
                        onClick={handleStartCourtMove}
                        className="px-1.5 py-0.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        title="コートを変更"
                      >
                        変更
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Plan */}
              {session.planName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">プラン</span>
                  <span
                    className="font-medium px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: session.displayColor ? `${session.displayColor}20` : undefined,
                      color: session.displayColor || undefined,
                    }}
                  >
                    {session.planName}
                  </span>
                </div>
              )}

              {/* Staff Assignment Section */}
              {(session.status === 'reserved' || session.status === 'in_use') && (
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">担当スタッフ</span>
                    {shifts && shifts.length > 0 && !isAssigningStaff && (
                      <button
                        onClick={handleStartAssignStaff}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        disabled={actionLoading}
                      >
                        + 追加
                      </button>
                    )}
                  </div>

                  {/* Assigned staff list */}
                  {session.assignments && session.assignments.length > 0 ? (
                    <div className="space-y-2">
                      {session.assignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between p-2 rounded-lg border"
                          style={{
                            backgroundColor: assignment.staffColor ? `${assignment.staffColor}10` : undefined,
                            borderColor: assignment.staffColor || '#e5e7eb',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: assignment.staffColor || '#6b7280' }}
                            />
                            <span className="font-medium text-sm">{assignment.staffName}</span>
                          </div>
                          <button
                            onClick={() => handleUnassignStaff(assignment.shiftId)}
                            className="text-red-500 hover:text-red-700 text-xs"
                            disabled={actionLoading}
                          >
                            解除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">担当スタッフが割り当てられていません</p>
                  )}

                  {/* Staff assignment form */}
                  {isAssigningStaff && shifts && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                      <label className="text-sm text-gray-600 block mb-2">スタッフを選択</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedShiftId}
                          onChange={(e) => setSelectedShiftId(e.target.value)}
                          className="flex-1 px-2 py-1.5 border rounded text-sm"
                          disabled={actionLoading}
                        >
                          <option value="">選択してください</option>
                          {shifts
                            .filter(s =>
                              // 既に割り当て済みでない
                              !session.assignments?.some(a => a.shiftId === s.id) &&
                              // セッションの時間帯にシフトがある
                              isShiftAvailableForSession(s, session.startTime, session.estimatedEndTime)
                            )
                            .map((shift) => (
                              <option key={shift.id} value={shift.id}>
                                {shift.staffName} ({formatTimeJST(shift.startTime)}-{formatTimeJST(shift.endTime)})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={handleConfirmAssignStaff}
                          disabled={actionLoading || !selectedShiftId}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionLoading ? '...' : '割当'}
                        </button>
                        <button
                          onClick={handleCancelAssignStaff}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                      {shifts.filter(s =>
                        !session.assignments?.some(a => a.shiftId === s.id) &&
                        isShiftAvailableForSession(s, session.startTime, session.estimatedEndTime)
                      ).length === 0 && (
                        <p className="text-xs text-orange-600 mt-2">
                          この時間帯に割り当て可能なスタッフがいません
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Edit mode for non-slot plans */}
              {isEditing && !session.isSlotBased ? (
                <div className="space-y-3 border rounded-lg p-3 bg-blue-50">
                  {/* Date (editable only if not in_use) */}
                  <div>
                    <label className="text-sm text-gray-500 block mb-1">日付</label>
                    {session.status === 'in_use' ? (
                      <p className="text-xs text-gray-400 mb-1">使用中は日時変更できません</p>
                    ) : null}
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      disabled={session.status === 'in_use'}
                      className="w-full px-2 py-1 border rounded text-sm disabled:bg-gray-100"
                    />
                  </div>

                  {/* Time (editable only if not in_use) */}
                  <div>
                    <label className="text-sm text-gray-500 block mb-1">時間</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        disabled={session.status === 'in_use'}
                        className="flex-1 px-2 py-1 border rounded text-sm disabled:bg-gray-100"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        disabled={session.status === 'in_use'}
                        className="flex-1 px-2 py-1 border rounded text-sm disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="text-sm text-gray-500 block mb-1">お客様名</label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm"
                      placeholder="お客様名"
                    />
                  </div>

                  {/* Customer Count */}
                  <div>
                    <label className="text-sm text-gray-500 block mb-1">人数</label>
                    <input
                      type="number"
                      min={1}
                      value={editCustomerCount}
                      onChange={(e) => setEditCustomerCount(parseInt(e.target.value) || 1)}
                      className="w-24 px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  {/* Memo */}
                  <div>
                    <label className="text-sm text-gray-500 block mb-1">メモ</label>
                    <textarea
                      value={editMemo}
                      onChange={(e) => setEditMemo(e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm"
                      rows={2}
                      placeholder="メモ"
                    />
                  </div>

                  {/* Edit actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={actionLoading}
                      className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoading ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Time */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">時間</span>
                    <span className="font-medium">
                      {formatDate(session.startTime)} {formatTimeJST(session.startTime)}
                      {session.estimatedEndTime && (
                        <> - {formatTimeJST(session.estimatedEndTime)}</>
                      )}
                    </span>
                  </div>

                  {/* Customer Name */}
                  {session.customerName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">お客様名</span>
                      <span className="font-medium">{session.customerName}</span>
                    </div>
                  )}

                  {/* Customer Count */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">人数</span>
                    <span className="font-medium">{session.customerCount}人</span>
                  </div>

                  {/* Options */}
                  {session.options && session.options.length > 0 && (
                    <div>
                      <span className="text-sm text-gray-500 block mb-2">オプション</span>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        {session.options.map((opt, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{opt.optionName}</span>
                            {opt.selectionType === 'quantity' && opt.quantity > 1 && (
                              <span className="text-gray-600">{opt.quantity}人</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Memo */}
                  {session.memo && (
                    <div>
                      <span className="text-sm text-gray-500 block mb-1">メモ</span>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {session.memo}
                      </div>
                    </div>
                  )}

                  {/* Edit button for non-slot plans */}
                  {!session.isSlotBased && (session.status === 'reserved' || session.status === 'in_use') && (
                    <button
                      onClick={handleStartEdit}
                      className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      編集
                    </button>
                  )}
                </>
              )}

              {/* Individual Bookings for Slot-based Sessions */}
              {session.isSlotBased && bookings.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">個別予約一覧</span>
                    <span className="text-xs text-gray-400">
                      {bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + b.customerCount, 0)} / {session.maxCapacity}人
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {bookings.filter(b => b.status === 'confirmed').map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between bg-white rounded p-2 border">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <button
                            onClick={() => handleToggleBookingPayment(booking.id, booking.paymentStatus)}
                            className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                              booking.paymentStatus === 'paid'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            }`}
                            title={booking.paymentStatus === 'paid' ? 'クリックで未払いに変更' : 'クリックで支払い済みに変更'}
                          >
                            {booking.paymentStatus === 'paid' ? '済' : '未'}
                          </button>
                          <span className="font-medium truncate">{booking.customerName}</span>
                          <span className="text-gray-500 text-sm shrink-0">{booking.customerCount}名</span>
                        </div>
                        <button
                          onClick={() => handleDeleteBooking(booking.id)}
                          className="text-red-500 hover:text-red-700 text-xs shrink-0 ml-2"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        {session && (
          <div className="p-4 border-t bg-gray-50 flex flex-wrap gap-2">
            {session.status === 'reserved' && onStartSession && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                開始
              </button>
            )}
            {session.status === 'reserved' && onCompleteSession && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                直接完了
              </button>
            )}
            {session.status === 'in_use' && onCompleteSession && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                完了
              </button>
            )}
            {(session.status === 'reserved' || session.status === 'locking') && onCancelSession && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 text-sm font-medium"
              >
                キャンセル
              </button>
            )}
            <button
              onClick={onClose}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm font-medium"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
