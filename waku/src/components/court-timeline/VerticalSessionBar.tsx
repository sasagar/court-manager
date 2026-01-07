/**
 * セッション表示バーコンポーネント
 *
 * @module court-timeline/VerticalSessionBar
 */

'use client';

import { useState } from 'react';
import type { CourtWithSession } from '../../lib/api-client';
import { HOUR_HEIGHT } from './constants';
import {
  formatTimeJST,
  getPositionFromTimestamp,
  getSessionStyle,
  getStatusLabel,
} from './utils';

export interface VerticalSessionBarProps {
  session: NonNullable<CourtWithSession['currentSession']>;
  totalHeight: number;
  businessStartHour: number;
  businessEndHour: number;
  onCancel?: (sessionId: string) => Promise<void>;
  onSlotClick?: () => void;
  onSessionClick?: () => void;
  onDragStart?: (offsetY: number) => void;
  isDragging?: boolean;
  onTogglePaymentStatus?: (sessionId: string, currentStatus: 'paid' | 'unpaid') => Promise<void>;
  onToggleBookingPaymentStatus?: (bookingId: number, currentStatus: 'paid' | 'unpaid') => Promise<void>;
}

export function VerticalSessionBar({
  session,
  totalHeight,
  businessStartHour,
  businessEndHour,
  onCancel,
  onSlotClick,
  onSessionClick,
  onDragStart,
  isDragging,
  onTogglePaymentStatus,
  onToggleBookingPaymentStatus,
}: VerticalSessionBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const startPos = getPositionFromTimestamp(session.startTime || Date.now() / 1000, totalHeight, businessStartHour, businessEndHour);
  const endPos = session.estimatedEndTime
    ? getPositionFromTimestamp(session.estimatedEndTime, totalHeight, businessStartHour, businessEndHour)
    : Math.min(startPos + HOUR_HEIGHT, totalHeight);

  const height = Math.max(endPos - startPos, 24);
  const canCancel = session.status === 'locking' || session.status === 'reserved';
  const canAddBooking = session.isSlotBased && session.maxCapacity && session.customerCount < session.maxCapacity;
  const isClickable = canAddBooking || onSessionClick;
  const canDrag = onDragStart && (session.status === 'locking' || session.status === 'reserved');

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCancel && confirm('この枠を削除しますか？')) {
      onCancel(session.id);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canAddBooking && onSlotClick) {
      onSlotClick();
    } else if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canDrag) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    onDragStart(offsetY);
  };

  const isCompact = height < 45;
  const showDetails = height >= 80;

  const customerNames = session.customerName
    ? session.customerName.split(/[,、]/).map(name => name.trim()).filter(name => name)
    : [];

  const sessionStyle = getSessionStyle(session.displayColor, session.status);

  const startTimeStr = session.startTime ? formatTimeJST(session.startTime) : '';
  const endTimeStr = session.estimatedEndTime ? formatTimeJST(session.estimatedEndTime) : '';

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded border ${sessionStyle.className} flex flex-col px-1.5 py-1 group ${isClickable ? 'cursor-pointer hover:brightness-95' : ''} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-50' : ''} ${isHovered ? 'overflow-visible z-20' : 'overflow-hidden'}`}
      style={{
        top: startPos,
        height: height,
        minHeight: '40px',
        ...sessionStyle.style,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${startTimeStr}〜${endTimeStr} ${session.planName || ''} ${session.planShortName ? `(${session.planShortName})` : ''} ${session.isSlotBased ? `${session.customerCount}/${session.maxCapacity}人` : (session.customerName || `${session.customerCount}人`)}`.trim()}
    >
      {/* ホバー時の詳細表示 */}
      {isHovered && !isDragging && startTimeStr && endTimeStr && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-800 text-white text-xs px-3 py-2 rounded shadow-lg z-50 pointer-events-none min-w-max max-w-64">
          <div className="font-medium text-center">{startTimeStr} 〜 {endTimeStr}</div>
          {session.planName && (
            <div className="text-gray-300 truncate mt-1">{session.planName}</div>
          )}
          {session.isSlotBased ? (
            <div className="text-gray-300">合計: {session.customerCount}/{session.maxCapacity}人</div>
          ) : (
            <>
              {session.customerName && (
                <div className="text-gray-200 truncate">{session.customerName}</div>
              )}
              {!session.customerName && session.customerCount > 0 && (
                <div className="text-gray-300">{session.customerCount}人</div>
              )}
            </>
          )}
          {session.options && session.options.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-600 text-purple-300">
              {session.options.map((opt, idx) => (
                <div key={idx} className="truncate">
                  {opt.optionName}{opt.quantity > 1 ? `: ${opt.quantity}人` : ''}
                </div>
              ))}
            </div>
          )}
          {session.isSlotBased && session.bookings && session.bookings.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-600">
              {session.bookings.slice(0, 5).map((booking) => {
                const match = booking.customerName.match(/^(.+?)\s*\d+名?$/);
                const displayName = match ? match[1] : booking.customerName;
                return (
                  <div key={booking.id} className="flex items-center gap-1 text-gray-200">
                    <span className={booking.paymentStatus === 'paid' ? 'text-green-400' : 'text-orange-400'}>
                      {booking.paymentStatus === 'paid' ? '済' : '未'}
                    </span>
                    <span className="truncate">{displayName}</span>
                    <span className="text-gray-400">{booking.customerCount}名</span>
                  </div>
                );
              })}
              {session.bookings.length > 5 && (
                <div className="text-gray-400">...他{session.bookings.length - 5}件</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ヘッダー行 */}
      <div className="flex items-start justify-between gap-0.5">
        <div className="truncate text-xs font-semibold flex-1 leading-none flex items-center gap-0.5">
          {session.isSlotBased ? (
            <>
              {session.planShortName || session.planName || getStatusLabel(session.status)}
              {isCompact && ` (${session.customerCount}/${session.maxCapacity})`}
            </>
          ) : (
            <>
              <span className="truncate">{session.planShortName || session.planName || getStatusLabel(session.status)}</span>
              {onTogglePaymentStatus ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePaymentStatus(session.id, session.paymentStatus || 'unpaid');
                  }}
                  className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors ${
                    session.paymentStatus === 'paid'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  }`}
                  title={session.paymentStatus === 'paid' ? 'クリックで未払いに変更' : 'クリックで支払い済みに変更'}
                >
                  {session.paymentStatus === 'paid' ? '済' : '未'}
                </button>
              ) : (
                <span
                  className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                    session.paymentStatus === 'paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                  title={session.paymentStatus === 'paid' ? '支払い済み' : '未払い'}
                >
                  {session.paymentStatus === 'paid' ? '済' : '未'}
                </span>
              )}
              {session.customerCount > 0 && (
                <span className="text-gray-500 shrink-0">{session.customerCount}人</span>
              )}
            </>
          )}
        </div>
        {canCancel && onCancel && (
          <button
            onClick={handleCancel}
            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity shrink-0"
            title="削除"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 人数サマリー（枠プラン用） */}
      {!isCompact && session.isSlotBased && session.maxCapacity && (
        <div className="text-xs text-gray-700 font-medium pb-0.5 border-b border-gray-300">
          <span>合計: {session.customerCount}/{session.maxCapacity}人</span>
        </div>
      )}

      {/* 顧客名リスト（枠ベースで予約がある場合） */}
      {!isCompact && session.isSlotBased && session.bookings && session.bookings.length > 0 && (
        <div className="flex-1 overflow-hidden flex flex-wrap gap-x-1 gap-y-0.5 content-start">
          {session.bookings.map((booking) => {
            const match = booking.customerName.match(/^(.+?)\s*\d+名?$/);
            const displayName = match ? match[1] : booking.customerName;
            return (
              <div key={booking.id} className="flex items-center text-xs text-gray-700 whitespace-nowrap">
                {onToggleBookingPaymentStatus ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookingPaymentStatus(booking.id, booking.paymentStatus);
                    }}
                    className={`px-0.5 rounded text-[10px] font-medium transition-colors ${
                      booking.paymentStatus === 'paid'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}
                    title={booking.paymentStatus === 'paid' ? 'クリックで未払いに変更' : 'クリックで支払い済みに変更'}
                  >
                    {booking.paymentStatus === 'paid' ? '済' : '未'}
                  </button>
                ) : (
                  <span
                    className={`px-0.5 rounded text-[10px] font-medium ${
                      booking.paymentStatus === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {booking.paymentStatus === 'paid' ? '済' : '未'}
                  </span>
                )}
                <span>{displayName}</span>
                <span className="text-gray-500">{booking.customerCount}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 顧客名リスト（枠ベースでbookingsがない場合のフォールバック） */}
      {!isCompact && session.isSlotBased && (!session.bookings || session.bookings.length === 0) && customerNames.length > 0 && (
        <div className="flex-1 overflow-hidden flex flex-wrap gap-x-1 gap-y-0.5 content-start">
          {customerNames.map((name, index) => {
            const match = name.match(/^(.+?)\s*(\d+)名?$/);
            const displayName = match ? match[1] : name;
            const count = match ? match[2] : '';
            return (
              <span key={index} className="text-xs text-gray-700 whitespace-nowrap">
                {displayName}{count && <span className="text-gray-500">{count}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* 通常予約の表示 */}
      {!session.isSlotBased && (
        <div className="text-xs text-gray-600 flex-1 overflow-hidden">
          {isCompact ? (
            <div className="flex items-center gap-1 flex-wrap">
              {session.customerName && <span className="truncate">{session.customerName}</span>}
              {session.options && session.options.length > 0 && (
                <div className="flex gap-0.5 flex-wrap">
                  {session.options.map((opt, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] leading-none whitespace-nowrap"
                    >
                      {opt.optionName}{opt.quantity > 1 ? `×${opt.quantity}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 flex-wrap">
                {session.customerName && <span>{session.customerName}</span>}
                {session.options && session.options.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap">
                    {session.options.map((opt, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] leading-none whitespace-nowrap"
                      >
                        {opt.optionName}{opt.quantity > 1 ? `×${opt.quantity}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 詳細表示（高さが十分ある場合のみ） */}
      {showDetails && session.isSlotBased && canAddBooking && (
        <div className="text-xs text-blue-600 mt-auto pt-1 border-t border-blue-200">
          +予約を追加
        </div>
      )}
    </div>
  );
}
