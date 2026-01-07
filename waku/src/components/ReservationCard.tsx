'use client';

import { useState } from 'react';
import type { Session, SessionBooking, Shift, Assignment } from '../lib/api-client';
import { formatTimeJST } from '../lib/time-utils';
import {
  getSessionStatusLabel,
  getSessionStatusBadgeColor,
  getPaymentStatusLabel,
  getPaymentStatusColor,
} from '../constants/status';

type ShiftWithActivity = Shift & {
  activityStatus: 'idle' | 'busy' | 'break';
};

/**
 * 予約カードのデータ型
 */
export type ReservationCardData = {
  cardId: string;
  courtId: string;
  courtName: string;
  sessionId: string;
  session: Session;
  booking?: SessionBooking;
  displayName: string;
  displayCount: number;
  paymentStatus: 'paid' | 'unpaid';
  startTime: number;
  estimatedEndTime: number;
  displayColor?: string;
  planName?: string;
  planShortName?: string;
  assignments: Assignment[];
};

type ReservationCardProps = {
  data: ReservationCardData;
  shifts: ShiftWithActivity[];
  onStartSession?: () => Promise<void>;
  onCompleteSession?: () => Promise<void>;
  onAssignStaff?: (shiftId: string) => Promise<string>;
  onUnassignStaff?: (sessionId: string, shiftId: string) => Promise<void>;
  onTogglePaymentStatus?: () => Promise<void>;
  onCardClick?: () => void;
};

export function ReservationCard({
  data,
  shifts,
  onStartSession,
  onCompleteSession,
  onAssignStaff,
  onUnassignStaff,
  onTogglePaymentStatus,
  onCardClick,
}: ReservationCardProps) {
  const [loading, setLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const status = data.session.status;

  const handleAction = async (action: () => Promise<unknown>, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLoading(true);
    try {
      await action();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (shiftId: string) => {
    if (!onAssignStaff) return;
    await handleAction(() => onAssignStaff(shiftId));
    setShowAssignModal(false);
  };

  const availableShifts = shifts.filter(
    (s) =>
      s.activityStatus !== 'break' &&
      !data.assignments.some((a) => a.shiftId === s.id)
  );

  // カードの背景色（プランのdisplayColorがあれば使用）
  const cardBgColor = data.displayColor
    ? `${data.displayColor}15`
    : status === 'in_use'
      ? '#dcfce7'
      : status === 'reserved'
        ? '#dbeafe'
        : '#f3f4f6';

  const cardBorderColor = data.displayColor || (status === 'in_use' ? '#86efac' : status === 'reserved' ? '#93c5fd' : '#d1d5db');

  return (
    <div
      className="rounded-lg border-2 p-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{
        backgroundColor: cardBgColor,
        borderColor: cardBorderColor,
      }}
      onClick={onCardClick}
    >
      {/* Header: コート名 | 時間 | プラン名 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-gray-800">{data.courtName}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">
            {formatTimeJST(data.startTime)} - {formatTimeJST(data.estimatedEndTime)}
          </span>
          {data.planShortName && (
            <>
              <span className="text-gray-400">|</span>
              <span
                className="px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: data.displayColor ? `${data.displayColor}30` : '#e5e7eb',
                  color: data.displayColor || '#374151',
                }}
              >
                {data.planShortName}
              </span>
            </>
          )}
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${getSessionStatusBadgeColor(status)}`}
        >
          {getSessionStatusLabel(status)}
        </span>
      </div>

      {/* Customer Info */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-gray-800">
          <span className="font-medium">{data.displayName}</span>
          <span className="text-gray-500 ml-2">{data.displayCount}名</span>
        </div>
        {/* Payment Status */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onTogglePaymentStatus) {
              handleAction(onTogglePaymentStatus);
            }
          }}
          disabled={loading || !onTogglePaymentStatus}
          className={`px-2 py-0.5 text-xs rounded-full ${getPaymentStatusColor(data.paymentStatus)} ${
            onTogglePaymentStatus ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
          }`}
        >
          {getPaymentStatusLabel(data.paymentStatus)}
        </button>
      </div>

      {/* Assignments */}
      {data.assignments.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-1">
            {data.assignments.map((assignment) => (
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
                {assignment.status === 'active' && onUnassignStaff && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(() => onUnassignStaff(assignment.sessionId, assignment.shiftId));
                    }}
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

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="mb-2 p-3 bg-white rounded-lg" onClick={(e) => e.stopPropagation()}>
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
      <div className="flex flex-wrap gap-2 mt-2">
        {status === 'reserved' && onStartSession && (
          <button
            onClick={(e) => handleAction(onStartSession, e)}
            disabled={loading}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300"
          >
            開始
          </button>
        )}

        {status === 'in_use' && onCompleteSession && (
          <button
            onClick={(e) => handleAction(onCompleteSession, e)}
            disabled={loading}
            className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:bg-gray-300"
          >
            終了
          </button>
        )}

        {(status === 'reserved' || status === 'in_use') && onAssignStaff && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAssignModal(true);
            }}
            disabled={loading}
            className="px-3 py-1 text-blue-600 text-sm border border-blue-300 rounded hover:bg-blue-50 disabled:bg-gray-100"
          >
            +スタッフ
          </button>
        )}
      </div>
    </div>
  );
}
