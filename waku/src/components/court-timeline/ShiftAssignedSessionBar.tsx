/**
 * シフト列に表示するアサインされたセッションバー
 *
 * @module court-timeline/ShiftAssignedSessionBar
 */

'use client';

import { useState } from 'react';
import type { Shift } from '../../lib/api-client';
import { HOUR_HEIGHT } from './constants';
import { formatTimeJST, getPositionFromTimestamp, getSessionStyle } from './utils';

export interface ShiftAssignedSessionBarProps {
  session: NonNullable<Shift['assignedSessions']>[0];
  totalHeight: number;
  businessStartHour: number;
  businessEndHour: number;
  onClick?: () => void;
}

export function ShiftAssignedSessionBar({
  session,
  totalHeight,
  businessStartHour,
  businessEndHour,
  onClick,
}: ShiftAssignedSessionBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const startPos = getPositionFromTimestamp(session.sessionStartTime, totalHeight, businessStartHour, businessEndHour);
  const endPos = session.sessionEndTime
    ? getPositionFromTimestamp(session.sessionEndTime, totalHeight, businessStartHour, businessEndHour)
    : startPos + HOUR_HEIGHT;
  const height = Math.max(endPos - startPos, 32);

  const sessionStyle = getSessionStyle(session.displayColor, session.sessionStatus);
  const startTimeStr = formatTimeJST(session.sessionStartTime);
  const endTimeStr = session.sessionEndTime ? formatTimeJST(session.sessionEndTime) : '';

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded border-2 flex flex-col px-1 py-0.5 cursor-pointer hover:brightness-95 ${sessionStyle.className}`}
      style={{
        top: startPos,
        height: height,
        minHeight: '32px',
        zIndex: 5,
        ...sessionStyle.style,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${session.courtName}: ${session.planShortName || session.planName || session.customerName || '予約'}`}
    >
      {/* ホバー時の詳細表示 */}
      {isHovered && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg z-50 pointer-events-none min-w-max max-w-48">
          <div className="font-medium text-center">{startTimeStr} 〜 {endTimeStr}</div>
          <div className="text-blue-300">{session.courtName}</div>
          {session.planName && <div className="text-gray-300 truncate">{session.planName}</div>}
          {session.customerName && <div className="text-gray-200 truncate">{session.customerName}</div>}
        </div>
      )}
      {/* コート名 */}
      <div className="text-[10px] font-medium truncate text-gray-700 leading-tight">
        {session.courtName}
      </div>
      {/* プラン名/顧客名 */}
      <div className="text-[10px] truncate text-gray-600 leading-tight">
        {session.planShortName || session.planName || session.customerName || ''}
      </div>
    </div>
  );
}
