'use client';

import { useState } from 'react';
import type { CourtWithSession, Shift, ReserveSessionInput } from '../lib/api-client';
import { formatTimeJST } from '../lib/time-utils';
import {
  getSessionStatusLabel,
  getSessionStatusBadgeColor,
  getSessionStatusCardColor,
} from '../constants/status';

type ShiftWithActivity = Shift & {
  activityStatus: 'idle' | 'busy' | 'break';
};

type CourtCardProps = {
  court: CourtWithSession;
  shifts: ShiftWithActivity[];
  onLock: () => Promise<{ sessionId: string; expiresAt: number }>;
  onUnlock?: () => Promise<void>;
  onReserve?: (data: ReserveSessionInput) => Promise<void>;
  onStart?: () => Promise<void>;
  onComplete?: () => Promise<void>;
  onAssignStaff?: (shiftId: string) => Promise<string>;
  onUnassignStaff: (sessionId: string, shiftId: string) => Promise<void>;
  onCreateSlot?: () => void;
};

export function CourtCard({
  court,
  shifts,
  onLock,
  onUnlock,
  onReserve,
  onStart,
  onComplete,
  onAssignStaff,
  onUnassignStaff,
  onCreateSlot,
}: CourtCardProps) {
  const [loading, setLoading] = useState(false);
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerCount, setCustomerCount] = useState(1);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const session = court.currentSession;
  const status = session?.status || 'available';

  const handleAction = async (action: () => Promise<unknown>) => {
    setLoading(true);
    try {
      await action();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = async () => {
    if (!onReserve || !customerName) return;
    await handleAction(() =>
      onReserve({
        customerName,
        customerCount,
      })
    );
    setShowReserveForm(false);
    setCustomerName('');
    setCustomerCount(1);
  };

  const handleAssign = async (shiftId: string) => {
    if (!onAssignStaff) return;
    await handleAction(() => onAssignStaff(shiftId));
    setShowAssignModal(false);
  };

  const availableShifts = shifts.filter(
    (s) =>
      s.activityStatus !== 'break' &&
      !session?.assignments.some((a) => a.shiftId === s.id)
  );

  return (
    <div
      className={`rounded-lg border-2 p-4 ${getSessionStatusCardColor(status)} transition-colors`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">{court.name}</h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${getSessionStatusBadgeColor(status)}`}
        >
          {getSessionStatusLabel(status)}
        </span>
      </div>

      {/* Session Info */}
      {session && status !== 'locking' && (
        <div className="mb-3 text-sm text-gray-700">
          <p className="font-medium">{session.customerName}</p>
          <p>
            {session.customerCount}名 |{' '}
            {session.startTime
              ? formatTimeJST(session.startTime)
              : '開始待ち'}{' '}
            {session.estimatedEndTime && `〜 ${formatTimeJST(session.estimatedEndTime)}`}
          </p>
        </div>
      )}

      {/* Locking Info */}
      {session && status === 'locking' && (
        <div className="mb-3 text-sm text-gray-600">
          <p>{session.lockedByName} がロック中</p>
          {session.lockExpiresAt && (
            <p className="text-xs">
              残り {Math.max(0, Math.floor((session.lockExpiresAt * 1000 - Date.now()) / 1000))}秒
            </p>
          )}
        </div>
      )}

      {/* Assignments */}
      {session && session.assignments.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">担当スタッフ</p>
          <div className="flex flex-wrap gap-1">
            {session.assignments.map((assignment) => (
              <span
                key={assignment.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: assignment.staffColor
                    ? `${assignment.staffColor}20`
                    : '#e5e7eb',
                  borderColor: assignment.staffColor || '#9ca3af',
                  borderWidth: '1px',
                }}
              >
                {assignment.staffName}
                {assignment.status === 'active' && (
                  <button
                    onClick={() => handleAction(() => onUnassignStaff(assignment.sessionId, assignment.shiftId))}
                    className="ml-1 text-gray-500 hover:text-red-500"
                    disabled={loading}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reserve Form */}
      {showReserveForm && (
        <div className="mb-3 p-3 bg-white rounded-lg">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="お客様名"
            className="w-full px-2 py-1 mb-2 border rounded text-sm"
          />
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-gray-600">人数:</label>
            <input
              type="number"
              value={customerCount}
              onChange={(e) => setCustomerCount(Number(e.target.value))}
              min={1}
              className="w-16 px-2 py-1 border rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReserve}
              disabled={loading || !customerName}
              className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300"
            >
              予約確定
            </button>
            <button
              onClick={() => setShowReserveForm(false)}
              className="px-3 py-1 text-sm text-gray-600 border rounded hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="mb-3 p-3 bg-white rounded-lg">
          <p className="text-sm font-medium mb-2">スタッフをアサイン</p>
          {availableShifts.length === 0 ? (
            <p className="text-sm text-gray-500">アサイン可能なスタッフがいません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableShifts.map((shift) => (
                <button
                  key={shift.id}
                  onClick={() => handleAssign(shift.id)}
                  disabled={loading}
                  className="px-3 py-1 text-sm rounded-full border hover:bg-gray-50 disabled:opacity-50"
                  style={{
                    borderColor: shift.staffColor || '#9ca3af',
                    backgroundColor: shift.staffColor ? `${shift.staffColor}10` : undefined,
                  }}
                >
                  {shift.staffName}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowAssignModal(false)}
            className="mt-2 w-full px-3 py-1 text-sm text-gray-600 border rounded hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {status === 'available' && (
          <>
            <button
              onClick={() => handleAction(onLock)}
              disabled={loading}
              className="px-3 py-1 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 disabled:bg-gray-300"
            >
              ロック
            </button>
            {onCreateSlot && (
              <button
                onClick={onCreateSlot}
                disabled={loading}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300"
              >
                枠作成
              </button>
            )}
          </>
        )}

        {status === 'locking' && onUnlock && (
          <>
            <button
              onClick={() => setShowReserveForm(true)}
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300"
            >
              予約
            </button>
            <button
              onClick={() => handleAction(onUnlock)}
              disabled={loading}
              className="px-3 py-1 text-gray-600 text-sm border rounded hover:bg-gray-50 disabled:bg-gray-100"
            >
              解除
            </button>
          </>
        )}

        {status === 'reserved' && onStart && (
          <>
            <button
              onClick={() => handleAction(onStart)}
              disabled={loading}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300"
            >
              開始
            </button>
            {onAssignStaff && (
              <button
                onClick={() => setShowAssignModal(true)}
                disabled={loading}
                className="px-3 py-1 text-blue-600 text-sm border border-blue-300 rounded hover:bg-blue-50 disabled:bg-gray-100"
              >
                +スタッフ
              </button>
            )}
          </>
        )}

        {status === 'in_use' && (
          <>
            {onComplete && (
              <button
                onClick={() => handleAction(onComplete)}
                disabled={loading}
                className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:bg-gray-300"
              >
                終了
              </button>
            )}
            {onAssignStaff && (
              <button
                onClick={() => setShowAssignModal(true)}
                disabled={loading}
                className="px-3 py-1 text-blue-600 text-sm border border-blue-300 rounded hover:bg-blue-50 disabled:bg-gray-100"
              >
                +スタッフ
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
