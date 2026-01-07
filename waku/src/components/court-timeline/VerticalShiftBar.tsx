/**
 * シフト表示バーコンポーネント
 *
 * @module court-timeline/VerticalShiftBar
 */

'use client';

import { useState } from 'react';
import type { Shift } from '../../lib/api-client';
import type { CreateBreakData } from './types';
import { getPositionFromTimestamp } from './utils';
import { TimeRangeModal } from './TimeRangeModal';
import { ScheduledBreakBar } from './ScheduledBreakBar';
import { ShiftAssignedSessionBar } from './ShiftAssignedSessionBar';

export interface VerticalShiftBarProps {
  shift: Shift & { activityStatus: 'idle' | 'busy' | 'break' };
  totalHeight: number;
  businessStartHour: number;
  businessEndHour: number;
  onSessionClick?: (sessionId: number) => void;
  onCreateBreak?: (data: CreateBreakData) => Promise<void>;
  onDeleteBreak?: (breakId: number) => Promise<void>;
}

export function VerticalShiftBar({
  shift,
  totalHeight,
  businessStartHour,
  businessEndHour,
  onSessionClick,
  onCreateBreak,
  onDeleteBreak,
}: VerticalShiftBarProps) {
  const startPos = getPositionFromTimestamp(shift.startTime, totalHeight, businessStartHour, businessEndHour);
  const endPos = getPositionFromTimestamp(shift.endTime, totalHeight, businessStartHour, businessEndHour);
  const height = Math.max(endPos - startPos, 24);

  const bgColor =
    shift.activityStatus === 'break'
      ? 'bg-orange-100 border-orange-300'
      : 'bg-gray-100 border-gray-300';

  const [breakModal, setBreakModal] = useState<{ timestamp: number } | null>(null);

  const handleShiftColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCreateBreak) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentage = clickY / totalHeight;
    const totalMinutes = percentage * (businessEndHour - businessStartHour) * 60;
    const hour = Math.floor(totalMinutes / 60) + businessStartHour;
    const minute = Math.round((totalMinutes % 60) / 5) * 5;

    const shiftDate = new Date(shift.date + 'T00:00:00');
    const clickedTime = new Date(
      shiftDate.getFullYear(),
      shiftDate.getMonth(),
      shiftDate.getDate(),
      hour,
      minute >= 60 ? 0 : minute
    );
    const startTime = Math.floor(clickedTime.getTime() / 1000);

    setBreakModal({ timestamp: startTime });
  };

  return (
    <>
      {/* シフト時間帯のバー */}
      <div
        className={`absolute left-1 right-1 rounded border ${bgColor} ${onCreateBreak ? 'cursor-pointer hover:brightness-95' : ''}`}
        style={{
          top: startPos,
          height: height,
          minHeight: '24px',
          backgroundColor: shift.staffColor ? `${shift.staffColor}20` : undefined,
          borderColor: shift.staffColor || undefined,
        }}
        onClick={handleShiftColumnClick}
        title={onCreateBreak ? 'クリックで休憩を追加' : undefined}
      />

      {/* 予定休憩の表示 */}
      {shift.scheduledBreaks && shift.scheduledBreaks.map((brk) => (
        <ScheduledBreakBar
          key={brk.id}
          break_={brk}
          totalHeight={totalHeight}
          businessStartHour={businessStartHour}
          businessEndHour={businessEndHour}
          onDelete={onDeleteBreak}
        />
      ))}

      {/* アサインされたセッションの表示 */}
      {shift.assignedSessions && shift.assignedSessions.map((session) => (
        <ShiftAssignedSessionBar
          key={session.assignmentId}
          session={session}
          totalHeight={totalHeight}
          businessStartHour={businessStartHour}
          businessEndHour={businessEndHour}
          onClick={onSessionClick ? () => onSessionClick(session.sessionId) : undefined}
        />
      ))}

      {/* 休憩追加モーダル */}
      {breakModal && onCreateBreak && (
        <TimeRangeModal
          title={`休憩追加 - ${shift.staffName}`}
          initialStartTime={breakModal.timestamp}
          businessStartHour={businessStartHour}
          businessEndHour={businessEndHour}
          onConfirm={async (startTime, endTime) => {
            await onCreateBreak({
              shiftId: shift.id,
              startTime,
              endTime,
            });
            setBreakModal(null);
          }}
          onCancel={() => setBreakModal(null)}
        />
      )}
    </>
  );
}
