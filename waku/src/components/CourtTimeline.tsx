'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { CourtWithSession, Shift, CourtBlock } from '../lib/api-client';
import { formatTimeJST } from '../lib/time-utils';
import {
  HOUR_HEIGHT,
  TimeRangeModal,
  VerticalSessionBar,
  VerticalShiftBar,
  VerticalBlockBar,
} from './court-timeline';

export type TimeSlotClickData = {
  court: CourtWithSession;
  hour: number;
  minute: number;
  timestamp: number;
};

export type CreateSlotClickData = {
  court: CourtWithSession;
  timestamp: number;
};

export type SlotClickData = {
  court: CourtWithSession;
  sessionId: string;
};

export type SessionClickData = {
  court: CourtWithSession;
  session: NonNullable<CourtWithSession['currentSession']>;
};

export type SessionTimeUpdateData = {
  sessionId: string;
  startTime: number;
  estimatedEndTime: number;
};

export type CreateBlockData = {
  courtId?: string;
  startTime: number;
  endTime: number;
};

export type CreateBreakData = {
  shiftId: string;
  startTime: number;
  endTime: number;
};

type CourtTimelineProps = {
  courts: CourtWithSession[];
  shifts: (Shift & { activityStatus: 'idle' | 'busy' | 'break'; currentSessionId?: string })[];
  blocks?: CourtBlock[];
  onCourtClick?: (court: CourtWithSession) => void;
  onTimeSlotClick?: (data: TimeSlotClickData) => void;
  onCreateSlotClick?: (data: CreateSlotClickData) => void;
  onSlotClick?: (data: SlotClickData) => void;
  onSessionClick?: (data: SessionClickData) => void;
  onShiftSessionClick?: (sessionId: number, courtId: string) => void;
  onCancelSession?: (sessionId: string) => Promise<void>;
  onSessionTimeUpdate?: (data: SessionTimeUpdateData) => Promise<void>;
  onTogglePaymentStatus?: (sessionId: string, currentStatus: 'paid' | 'unpaid') => Promise<void>;
  onToggleBookingPaymentStatus?: (bookingId: number, currentStatus: 'paid' | 'unpaid') => Promise<void>;
  onSwapCourts?: (sessionId1: string, sessionId2: string) => Promise<void>;
  onCreateBlock?: (data: CreateBlockData) => Promise<void>;
  onDeleteBlock?: (blockId: string) => Promise<void>;
  onToggleBreak?: (staffId: string, currentStatus: 'idle' | 'busy' | 'break') => Promise<void>;
  onCreateScheduledBreak?: (data: CreateBreakData) => Promise<void>;
  onDeleteScheduledBreak?: (breakId: number) => Promise<void>;
  businessStartHour?: number;
  businessEndHour?: number;
  selectedDate?: string;
};

// デフォルト営業時間の設定（9:00-22:00）
const DEFAULT_BUSINESS_START_HOUR = 9;
const DEFAULT_BUSINESS_END_HOUR = 22;

// 現在時刻のポジション（px）を計算
function getCurrentTimePosition(startHour: number, endHour: number): number {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour < startHour || currentHour >= endHour) {
    return -1; // 営業時間外
  }

  const totalMinutes = (currentHour - startHour) * 60 + currentMinute;
  const position = (totalMinutes / 60) * HOUR_HEIGHT;
  return position;
}

// タイムスタンプから位置（px）を計算
function getPositionFromTimestamp(timestamp: number, totalHeight: number, startHour: number, endHour: number): number {
  const date = new Date(timestamp * 1000);
  const hour = date.getHours();
  const minute = date.getMinutes();

  if (hour < startHour) return 0;
  if (hour >= endHour) return totalHeight;

  const totalMinutes = (hour - startHour) * 60 + minute;
  const position = (totalMinutes / 60) * HOUR_HEIGHT;
  return position;
}

// Y座標からタイムスタンプを計算
// selectedDate が指定されている場合はその日付を使用、なければ今日の日付を使用
function getTimestampFromPosition(posY: number, totalHeight: number, startHour: number, endHour: number, selectedDate?: string): number {
  const percentage = Math.max(0, Math.min(1, posY / totalHeight));
  const totalMinutes = percentage * (endHour - startHour) * 60;
  const hour = Math.floor(totalMinutes / 60) + startHour;
  const minute = Math.round((totalMinutes % 60) / 5) * 5; // 5分単位に丸める

  let targetTime: Date;
  if (selectedDate) {
    // selectedDate (YYYY-MM-DD) をJSTとして解釈
    const [year, month, day] = selectedDate.split('-').map(Number);
    targetTime = new Date(year, month - 1, day, hour, minute >= 60 ? 0 : minute);
  } else {
    const now = new Date();
    targetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute >= 60 ? 0 : minute
    );
  }
  if (minute >= 60) {
    targetTime.setHours(hour + 1);
  }
  return Math.floor(targetTime.getTime() / 1000);
}

export function CourtTimeline({ courts, shifts, blocks = [], onCourtClick: _onCourtClick, onTimeSlotClick, onCreateSlotClick, onSlotClick, onSessionClick, onShiftSessionClick, onCancelSession, onSessionTimeUpdate, onTogglePaymentStatus, onToggleBookingPaymentStatus, onSwapCourts, onCreateBlock, onDeleteBlock, onToggleBreak, onCreateScheduledBreak, onDeleteScheduledBreak, businessStartHour = DEFAULT_BUSINESS_START_HOUR, businessEndHour = DEFAULT_BUSINESS_END_HOUR, selectedDate }: CourtTimelineProps) {
  // 営業時間に基づいて時間配列を生成
  const businessHours = businessEndHour - businessStartHour;
  const hours = useMemo(() =>
    Array.from({ length: businessHours }, (_, i) => businessStartHour + i),
    [businessHours, businessStartHour]
  );

  const currentTimePosition = useMemo(() => getCurrentTimePosition(businessStartHour, businessEndHour), [businessStartHour, businessEndHour]);
  const totalHeight = hours.length * HOUR_HEIGHT;

  // スクロールコンテナのref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 初期表示時に現在時刻付近にスクロール
  useEffect(() => {
    if (scrollContainerRef.current && currentTimePosition >= 0) {
      // 現在時刻が画面の上部1/3あたりに来るようにスクロール
      const containerHeight = scrollContainerRef.current.clientHeight;
      const scrollTarget = Math.max(0, currentTimePosition - containerHeight / 3);
      scrollContainerRef.current.scrollTop = scrollTarget;
    }
  }, [currentTimePosition]);

  // コンテキストメニュー用の状態
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    court: CourtWithSession;
    timestamp: number;
    hour: number;
    minute: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // コート入れ替えモーダル用の状態
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapSession1, setSwapSession1] = useState<{ sessionId: string; courtName: string; planName?: string } | null>(null);
  const [swapSession2, setSwapSession2] = useState<string | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  // ブロック追加モーダル用の状態
  const [blockModal, setBlockModal] = useState<{
    courtId: string;
    courtName: string;
    timestamp: number;
  } | null>(null);

  // ドラッグ用の状態
  const [draggingSession, setDraggingSession] = useState<{
    sessionId: string;
    courtId: string;
    originalStartTime: number;
    originalEndTime: number;
    duration: number;
    offsetY: number; // ドラッグ開始時のセッションバー内のY位置
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    startTime: number;
    endTime: number;
    top: number;
    height: number;
  } | null>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  // ドラッグ開始ハンドラ
  const handleDragStart = (
    sessionId: string,
    courtId: string,
    startTime: number,
    endTime: number,
    offsetY: number
  ) => {
    if (!onSessionTimeUpdate) return;
    setDraggingSession({
      sessionId,
      courtId,
      originalStartTime: startTime,
      originalEndTime: endTime,
      duration: endTime - startTime,
      offsetY,
    });
  };

  // ドラッグ中ハンドラ（コート列のmousemoveで呼ばれる）
  const handleDragMove = (courtId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingSession || draggingSession.courtId !== courtId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const newTop = mouseY - draggingSession.offsetY;

    // 新しい開始時刻と終了時刻を計算
    const newStartTime = getTimestampFromPosition(newTop, totalHeight, businessStartHour, businessEndHour, selectedDate);
    const newEndTime = newStartTime + draggingSession.duration;

    // プレビュー位置を計算
    const previewTop = getPositionFromTimestamp(newStartTime, totalHeight, businessStartHour, businessEndHour);
    const previewHeight = getPositionFromTimestamp(newEndTime, totalHeight, businessStartHour, businessEndHour) - previewTop;

    setDragPreview({
      startTime: newStartTime,
      endTime: newEndTime,
      top: previewTop,
      height: Math.max(previewHeight, 24),
    });
  };

  // ドラッグ終了ハンドラ
  const handleDragEnd = useCallback(async () => {
    if (!draggingSession || !dragPreview || !onSessionTimeUpdate) {
      setDraggingSession(null);
      setDragPreview(null);
      return;
    }

    // 位置が変わっていない場合はスキップ
    if (dragPreview.startTime === draggingSession.originalStartTime) {
      setDraggingSession(null);
      setDragPreview(null);
      return;
    }

    try {
      await onSessionTimeUpdate({
        sessionId: draggingSession.sessionId,
        startTime: dragPreview.startTime,
        estimatedEndTime: dragPreview.endTime,
      });
    } catch (err) {
      console.error('Failed to update session time:', err);
    }

    setDraggingSession(null);
    setDragPreview(null);
  }, [draggingSession, dragPreview, onSessionTimeUpdate]);

  // グローバルなmouseupイベントでドラッグ終了を検知
  useEffect(() => {
    if (!draggingSession) return;

    const handleMouseUp = () => {
      handleDragEnd();
    };

    const handleMouseLeave = () => {
      // ウィンドウ外にマウスが出た場合はキャンセル
      setDraggingSession(null);
      setDragPreview(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [draggingSession, handleDragEnd]);

  // タイムスロットクリック時の処理
  const handleTimeSlotClick = (
    court: CourtWithSession,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    // クリック位置から時間を計算
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentage = clickY / totalHeight;
    const totalMinutes = percentage * (businessEndHour - businessStartHour) * 60;
    const hour = Math.floor(totalMinutes / 60) + businessStartHour;
    const minute = Math.round((totalMinutes % 60) / 5) * 5; // 5分単位に丸める

    // タイムスタンプを計算（本日の日付）
    const now = new Date();
    const clickedTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute >= 60 ? 0 : minute
    );
    const adjustedHour = minute >= 60 ? hour + 1 : hour;
    const timestamp = Math.floor(clickedTime.getTime() / 1000);

    // 枠作成コールバックがある場合はコンテキストメニューを表示
    if (onCreateSlotClick && onTimeSlotClick) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        court,
        timestamp,
        hour: adjustedHour,
        minute: minute >= 60 ? 0 : minute,
      });
      return;
    }

    // 枠作成コールバックがない場合は従来通り予約モーダルを開く
    if (onTimeSlotClick) {
      onTimeSlotClick({
        court,
        hour: adjustedHour,
        minute: minute >= 60 ? 0 : minute,
        timestamp,
      });
    }
  };

  const handleReserveClick = () => {
    if (contextMenu && onTimeSlotClick) {
      onTimeSlotClick({
        court: contextMenu.court,
        hour: contextMenu.hour,
        minute: contextMenu.minute,
        timestamp: contextMenu.timestamp,
      });
    }
    setContextMenu(null);
  };

  const handleCreateSlotClick = () => {
    if (contextMenu && onCreateSlotClick) {
      onCreateSlotClick({
        court: contextMenu.court,
        timestamp: contextMenu.timestamp,
      });
    }
    setContextMenu(null);
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col h-full">
      {/* ヘッダー行（固定） */}
      <div className="flex border-b bg-gray-50 shrink-0">
        {/* 時間軸ヘッダー */}
        <div className="shrink-0 w-16 border-r h-12" />
        {/* コートヘッダー */}
        {courts.map((court) => (
          <div key={court.id} className="shrink-0 w-32 border-r h-12 px-2 py-2 flex items-center">
            <div className="font-medium text-gray-800 truncate">{court.name}</div>
          </div>
        ))}
        {/* シフトヘッダー */}
        {shifts.length > 0 && (
          <>
            <div className="shrink-0 w-4 bg-gray-100 border-r h-12" />
            {shifts.map((shift) => (
              <div key={shift.id} className="shrink-0 w-28 border-r h-12 px-2 py-1 flex items-center gap-1">
                {shift.staffImageUrl ? (
                  <img
                    src={shift.staffImageUrl}
                    alt={shift.staffName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 border"
                    style={{ borderColor: shift.staffColor || '#e5e7eb' }}
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: shift.staffColor || '#374151' }}
                  >
                    {shift.staffName}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleBreak?.(shift.staffId, shift.activityStatus)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      shift.activityStatus === 'break'
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {shift.activityStatus === 'break' ? '休憩中' : '休憩'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* スクロール可能なタイムライン部分 */}
      <div ref={scrollContainerRef} className="overflow-auto flex-1">
        <div className="flex min-w-fit">
          {/* 時間軸（左側） */}
          <div className="shrink-0 w-16 border-r bg-gray-50">
            {/* 時間ラベル */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-gray-200 text-xs text-gray-600 pr-2 text-right"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour}:00
              </div>
            ))}
          </div>

          {/* コート列 */}
          {courts.map((court) => (
            <div
              key={court.id}
              className="shrink-0 w-32 border-r"
            >
              {/* タイムライン部分 */}
              <div
                className={`relative cursor-pointer hover:bg-blue-50/30 ${draggingSession ? 'select-none' : ''}`}
                style={{ height: totalHeight }}
                onClick={(e) => !draggingSession && handleTimeSlotClick(court, e)}
                onMouseMove={(e) => handleDragMove(court.id, e)}
              >
                {/* 時間グリッド */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-gray-100 hover:bg-blue-50/50"
                    style={{ top: (hour - businessStartHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}

                {/* 現在時刻ライン */}
                {currentTimePosition >= 0 && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ top: currentTimePosition }}
                  >
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
                  </div>
                )}

                {/* ドラッグプレビュー */}
                {draggingSession && draggingSession.courtId === court.id && dragPreview && (
                  <div
                    className="absolute left-1 right-1 rounded border-2 border-dashed border-blue-500 bg-blue-100/50 pointer-events-none z-20 flex items-center justify-center"
                    style={{
                      top: dragPreview.top,
                      height: dragPreview.height,
                    }}
                  >
                    <div className="text-xs text-blue-700 font-medium">
                      {formatTimeJST(dragPreview.startTime)} - {formatTimeJST(dragPreview.endTime)}
                    </div>
                  </div>
                )}

                {/* ブロック表示 */}
                {blocks
                  .filter((block) => block.courtId === court.id || block.courtId === null)
                  .map((block) => (
                    <VerticalBlockBar
                      key={block.id}
                      block={block}
                      totalHeight={totalHeight}
                      businessStartHour={businessStartHour}
                      businessEndHour={businessEndHour}
                      onDelete={onDeleteBlock}
                      isAllCourts={block.courtId === null}
                    />
                  ))}

                {/* セッション表示（複数対応） */}
                {(court.sessions || (court.currentSession ? [court.currentSession] : [])).map((session) => (
                  <VerticalSessionBar
                    key={session.id}
                    session={session}
                    totalHeight={totalHeight}
                    businessStartHour={businessStartHour}
                    businessEndHour={businessEndHour}
                    onCancel={onCancelSession}
                    onSlotClick={onSlotClick ? () => onSlotClick({ court, sessionId: session.id }) : undefined}
                    onSessionClick={onSessionClick ? () => onSessionClick({ court, session }) : undefined}
                    onDragStart={onSessionTimeUpdate ? (offsetY) => handleDragStart(
                      session.id,
                      court.id,
                      session.startTime || Math.floor(Date.now() / 1000),
                      session.estimatedEndTime || Math.floor(Date.now() / 1000) + 3600,
                      offsetY
                    ) : undefined}
                    isDragging={draggingSession?.sessionId === session.id}
                    onTogglePaymentStatus={onTogglePaymentStatus}
                    onToggleBookingPaymentStatus={onToggleBookingPaymentStatus}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* シフト列（オプション） */}
          {shifts.length > 0 && (
            <>
              {/* 区切り */}
              <div className="shrink-0 w-4 bg-gray-100 border-r" style={{ height: totalHeight }} />

              {shifts.map((shift) => (
                <div key={shift.id} className="shrink-0 w-28 border-r hover:bg-gray-50">
                  {/* タイムライン部分 */}
                  <div className="relative" style={{ height: totalHeight }}>
                    {/* 時間グリッド */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 border-b border-gray-100"
                        style={{ top: (hour - businessStartHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      />
                    ))}

                    {/* 現在時刻ライン */}
                    {currentTimePosition >= 0 && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-red-500 z-10"
                        style={{ top: currentTimePosition }}
                      />
                    )}

                    {/* シフト時間バー */}
                    <VerticalShiftBar
                      shift={shift}
                      totalHeight={totalHeight}
                      businessStartHour={businessStartHour}
                      businessEndHour={businessEndHour}
                      onSessionClick={onShiftSessionClick ? (sessionId) => {
                        const session = shift.assignedSessions?.find(s => s.sessionId === sessionId);
                        if (session) {
                          onShiftSessionClick(sessionId, session.courtId);
                        }
                      } : undefined}
                      onCreateBreak={onCreateScheduledBreak}
                      onDeleteBreak={onDeleteScheduledBreak}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 凡例 */}
      <div className="p-3 border-t bg-gray-50 flex flex-wrap gap-4 text-xs items-center">
        {/* ステータス凡例 */}
        <div className="flex items-center gap-3">
          <span className="text-gray-500 font-medium">ステータス:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-200 border border-yellow-400 rounded" />
            <span>ロック中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-200 border border-blue-400 rounded" />
            <span>予約済</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-200 border border-green-400 rounded" />
            <span>使用中</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-300 border border-gray-600 rounded" />
            <span>ブロック</span>
          </div>
        </div>
        {/* 支払い凡例 */}
        <div className="flex items-center gap-3">
          <span className="text-gray-500 font-medium">支払い:</span>
          <div className="flex items-center gap-1">
            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">済</span>
            <span>支払済</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">未</span>
            <span>未払い</span>
          </div>
        </div>
        {/* 現在時刻 */}
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-red-500" />
          <span>現在時刻</span>
        </div>
        {/* コート入れ替えボタン */}
        {onSwapCourts && (
          <button
            onClick={() => setShowSwapModal(true)}
            className="ml-auto px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs font-medium"
          >
            コート入替
          </button>
        )}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <div className="px-3 py-1 text-xs text-gray-500 border-b">
            {contextMenu.court.name} - {contextMenu.hour}:{String(contextMenu.minute).padStart(2, '0')}
          </div>
          <button
            onClick={handleReserveClick}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <span className="w-4 h-4 bg-yellow-200 border border-yellow-400 rounded-sm" />
            予約する
          </button>
          <button
            onClick={handleCreateSlotClick}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <span className="w-4 h-4 bg-blue-200 border border-blue-400 rounded-sm" />
            枠を作成
          </button>
          {onCreateBlock && (
            <button
              onClick={() => {
                if (contextMenu) {
                  setBlockModal({
                    courtId: contextMenu.court.id,
                    courtName: contextMenu.court.name,
                    timestamp: contextMenu.timestamp,
                  });
                  setContextMenu(null);
                }
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 border-t border-gray-100 mt-1 pt-2"
            >
              <span className="w-4 h-4 bg-gray-300 border border-gray-600 rounded-sm" />
              ブロック追加
            </button>
          )}
        </div>
      )}

      {/* ブロック追加モーダル */}
      {blockModal && onCreateBlock && (
        <TimeRangeModal
          title={`ブロック追加 - ${blockModal.courtName}`}
          initialStartTime={blockModal.timestamp}
          businessStartHour={businessStartHour}
          businessEndHour={businessEndHour}
          selectedDate={selectedDate}
          onConfirm={async (startTime, endTime) => {
            await onCreateBlock({
              courtId: blockModal.courtId,
              startTime,
              endTime,
            });
            setBlockModal(null);
          }}
          onCancel={() => setBlockModal(null)}
        />
      )}

      {/* コート入れ替えモーダル */}
      {showSwapModal && onSwapCourts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">コートの入れ替え</h3>
            <p className="text-sm text-gray-600 mb-4">
              2つのセッションを選択すると、それぞれのコートが入れ替わります。
            </p>

            {/* セッション1選択 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                入れ替え元のセッション
              </label>
              <select
                value={swapSession1?.sessionId || ''}
                onChange={(e) => {
                  const sessionId = e.target.value;
                  if (!sessionId) {
                    setSwapSession1(null);
                    return;
                  }
                  for (const court of courts) {
                    const session = court.sessions?.find((s) => String(s.id) === sessionId);
                    if (session) {
                      setSwapSession1({
                        sessionId: String(session.id),
                        courtName: court.name,
                        planName: session.planName,
                      });
                      break;
                    }
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">選択してください</option>
                {courts.flatMap((court) =>
                  (court.sessions || [])
                    .filter((s) => s.status === 'reserved' || s.status === 'in_use')
                    .map((session) => (
                      <option key={session.id} value={String(session.id)}>
                        {court.name}: {session.planShortName || session.planName || session.customerName || '予約'} ({formatTimeJST(session.startTime || 0)})
                      </option>
                    ))
                )}
              </select>
            </div>

            {/* セッション2選択 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                入れ替え先のセッション
              </label>
              <select
                value={swapSession2 || ''}
                onChange={(e) => setSwapSession2(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={!swapSession1}
              >
                <option value="">選択してください</option>
                {courts.flatMap((court) =>
                  (court.sessions || [])
                    .filter((s) =>
                      (s.status === 'reserved' || s.status === 'in_use') &&
                      String(s.id) !== swapSession1?.sessionId
                    )
                    .map((session) => (
                      <option key={session.id} value={String(session.id)}>
                        {court.name}: {session.planShortName || session.planName || session.customerName || '予約'} ({formatTimeJST(session.startTime || 0)})
                      </option>
                    ))
                )}
              </select>
            </div>

            {/* 選択中の内容プレビュー */}
            {swapSession1 && swapSession2 && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg text-sm">
                <div className="font-medium text-purple-800 mb-1">入れ替え内容:</div>
                <div className="text-purple-700">
                  {(() => {
                    const court1 = courts.find((c) => c.sessions?.some((s) => String(s.id) === swapSession1.sessionId));
                    const court2 = courts.find((c) => c.sessions?.some((s) => String(s.id) === swapSession2));
                    const session1 = court1?.sessions?.find((s) => String(s.id) === swapSession1.sessionId);
                    const session2 = court2?.sessions?.find((s) => String(s.id) === swapSession2);
                    return (
                      <>
                        <div>• {court1?.name} の「{session1?.planShortName || session1?.planName || '予約'}」→ {court2?.name}</div>
                        <div>• {court2?.name} の「{session2?.planShortName || session2?.planName || '予約'}」→ {court1?.name}</div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSwapModal(false);
                  setSwapSession1(null);
                  setSwapSession2(null);
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!swapSession1 || !swapSession2 || swapLoading}
                onClick={async () => {
                  if (!swapSession1 || !swapSession2) return;
                  setSwapLoading(true);
                  try {
                    await onSwapCourts(swapSession1.sessionId, swapSession2);
                    setShowSwapModal(false);
                    setSwapSession1(null);
                    setSwapSession2(null);
                  } catch (err) {
                    console.error('Failed to swap courts:', err);
                    alert('コートの入れ替えに失敗しました');
                  } finally {
                    setSwapLoading(false);
                  }
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-300"
              >
                {swapLoading ? '処理中...' : '入れ替える'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
