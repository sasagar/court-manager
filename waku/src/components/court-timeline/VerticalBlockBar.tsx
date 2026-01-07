/**
 * ブロック表示バーコンポーネント
 *
 * @module court-timeline/VerticalBlockBar
 */

'use client';

import { useState } from 'react';
import type { CourtBlock } from '../../lib/api-client';
import { formatTimeJST, getPositionFromTimestamp } from './utils';

export interface VerticalBlockBarProps {
  block: CourtBlock;
  totalHeight: number;
  businessStartHour: number;
  businessEndHour: number;
  onDelete?: (blockId: string) => Promise<void>;
  isAllCourts?: boolean;
}

export function VerticalBlockBar({
  block,
  totalHeight,
  businessStartHour,
  businessEndHour,
  onDelete,
  isAllCourts,
}: VerticalBlockBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const startPos = getPositionFromTimestamp(block.startTime, totalHeight, businessStartHour, businessEndHour);
  const endPos = getPositionFromTimestamp(block.endTime, totalHeight, businessStartHour, businessEndHour);
  const height = Math.max(endPos - startPos, 24);

  const startTimeStr = formatTimeJST(block.startTime);
  const endTimeStr = formatTimeJST(block.endTime);

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded border-2 border-gray-600 bg-gray-200 flex flex-col px-1 py-0.5 group cursor-default ${isAllCourts ? 'border-dashed' : ''}`}
      style={{
        top: startPos,
        height: height,
        minHeight: '24px',
        backgroundColor: 'rgba(75, 85, 99, 0.3)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`ブロック: ${startTimeStr}〜${endTimeStr}${block.reason ? ` (${block.reason})` : ''}${isAllCourts ? ' [全コート]' : ''}`}
    >
      {/* ホバー時の詳細表示 */}
      {isHovered && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg z-50 pointer-events-none min-w-max">
          <div className="font-medium text-center">{startTimeStr} 〜 {endTimeStr}</div>
          <div className="text-gray-300">ブロック{isAllCourts ? '（全コート）' : ''}</div>
          {block.reason && <div className="text-gray-400">{block.reason}</div>}
        </div>
      )}

      {/* 削除ボタン */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('このブロックを削除しますか？')) {
              onDelete(block.id);
            }
          }}
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-gray-700 hover:text-gray-900 transition-opacity"
          title="削除"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 内容表示 */}
      <div className="text-xs text-gray-700 font-medium truncate">
        {height >= 40 ? (block.reason || 'ブロック') : ''}
      </div>
    </div>
  );
}
