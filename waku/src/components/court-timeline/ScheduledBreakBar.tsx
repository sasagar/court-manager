/**
 * 予定休憩バーコンポーネント
 *
 * @module court-timeline/ScheduledBreakBar
 */

'use client';

import { useState } from 'react';
import type { ScheduledBreak } from '../../lib/api-client';
import { formatTimeJST, getPositionFromTimestamp } from './utils';

export interface ScheduledBreakBarProps {
  break_: ScheduledBreak;
  totalHeight: number;
  businessStartHour: number;
  businessEndHour: number;
  onDelete?: (breakId: number) => Promise<void>;
}

export function ScheduledBreakBar({
  break_,
  totalHeight,
  businessStartHour,
  businessEndHour,
  onDelete,
}: ScheduledBreakBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const startPos = getPositionFromTimestamp(break_.startTime, totalHeight, businessStartHour, businessEndHour);
  const endPos = getPositionFromTimestamp(break_.endTime, totalHeight, businessStartHour, businessEndHour);
  const height = Math.max(endPos - startPos, 20);

  const startTimeStr = formatTimeJST(break_.startTime);
  const endTimeStr = formatTimeJST(break_.endTime);

  return (
    <div
      className="absolute left-0.5 right-0.5 rounded border-2 border-gray-500 bg-gray-200 flex flex-col px-1 py-0.5 group cursor-default"
      style={{
        top: startPos,
        height: height,
        minHeight: '20px',
        zIndex: 10,
        backgroundColor: 'rgba(107, 114, 128, 0.3)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`休憩: ${startTimeStr}〜${endTimeStr}${break_.memo ? ` (${break_.memo})` : ''}`}
    >
      {/* ホバー時の詳細表示 */}
      {isHovered && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg z-50 pointer-events-none min-w-max">
          <div className="font-medium text-center">{startTimeStr} 〜 {endTimeStr}</div>
          <div className="text-gray-300">予定休憩</div>
          {break_.memo && <div className="text-gray-400">{break_.memo}</div>}
        </div>
      )}

      {/* 削除ボタン */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('この休憩を削除しますか？')) {
              onDelete(break_.id);
            }
          }}
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-800 transition-opacity"
          title="削除"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 内容表示 */}
      <div className="text-[10px] text-gray-600 font-medium truncate leading-tight">
        {height >= 28 ? '休憩' : ''}
      </div>
    </div>
  );
}
