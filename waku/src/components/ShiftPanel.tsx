'use client';

import type { Shift } from '../lib/api-client';
import { formatTimeJST } from '../lib/time-utils';

type ShiftWithActivity = Shift & {
  activityStatus: 'idle' | 'busy' | 'break';
  currentSessionId?: string;
};

type ShiftPanelProps = {
  shifts: ShiftWithActivity[];
  onStatusChange: (staffId: string, status: 'idle' | 'busy' | 'break') => Promise<void>;
};

export function ShiftPanel({ shifts, onStatusChange }: ShiftPanelProps) {
  const handleToggleBreak = async (shift: ShiftWithActivity) => {
    const newStatus = shift.activityStatus === 'break' ? 'idle' : 'break';
    await onStatusChange(shift.staffId, newStatus);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">本日のシフト</h2>

      {shifts.length === 0 ? (
        <p className="text-gray-500 text-sm">本日のシフトはありません</p>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <div
              key={shift.id}
              className="flex items-center gap-3 p-3 rounded-lg border"
              style={{
                borderColor: shift.staffColor || '#e5e7eb',
                borderLeftWidth: '4px',
              }}
            >
              {/* Staff Image or Color */}
              {shift.staffImageUrl ? (
                <img
                  src={shift.staffImageUrl}
                  alt={shift.staffName}
                  className="w-8 h-8 rounded-full object-cover shrink-0 border-2"
                  style={{ borderColor: shift.staffColor || '#e5e7eb' }}
                />
              ) : null}
              {/* Staff Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {shift.staffName}
                </p>
                <p className="text-xs text-gray-500">
                  {formatTimeJST(shift.startTime)} - {formatTimeJST(shift.endTime)}
                </p>
              </div>

              {/* 休憩ボタン */}
              <button
                type="button"
                onClick={() => handleToggleBreak(shift)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  shift.activityStatus === 'break'
                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {shift.activityStatus === 'break' ? '休憩中' : '休憩'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-gray-500 mb-2">ステータス説明</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
            休憩中 = アサイン不可
          </span>
        </div>
      </div>
    </div>
  );
}
