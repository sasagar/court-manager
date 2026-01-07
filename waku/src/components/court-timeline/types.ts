/**
 * コートタイムライン用の型定義
 *
 * @module court-timeline/types
 */

import type { CourtWithSession, Shift, CourtBlock } from '../../lib/api-client';

/**
 * タイムスロットクリック時のデータ
 */
export interface TimeSlotClickData {
  court: CourtWithSession;
  hour: number;
  minute: number;
  timestamp: number;
}

/**
 * スロット作成クリック時のデータ
 */
export interface CreateSlotClickData {
  court: CourtWithSession;
  timestamp: number;
}

/**
 * スロットクリック時のデータ
 */
export interface SlotClickData {
  court: CourtWithSession;
  sessionId: string;
}

/**
 * セッションクリック時のデータ
 */
export interface SessionClickData {
  court: CourtWithSession;
  session: NonNullable<CourtWithSession['currentSession']>;
}

/**
 * セッション時間更新時のデータ
 */
export interface SessionTimeUpdateData {
  sessionId: string;
  startTime: number;
  estimatedEndTime: number;
}

/**
 * ブロック作成時のデータ
 */
export interface CreateBlockData {
  courtId?: string;
  startTime: number;
  endTime: number;
}

/**
 * 休憩作成時のデータ
 */
export interface CreateBreakData {
  shiftId: string;
  startTime: number;
  endTime: number;
}

/**
 * シフトとアクティビティステータスを含む拡張シフト型
 */
export interface ShiftWithActivity extends Shift {
  activityStatus: 'idle' | 'busy' | 'break';
  currentSessionId?: string;
}

/**
 * CourtTimelineコンポーネントのProps
 */
export interface CourtTimelineProps {
  courts: CourtWithSession[];
  shifts: ShiftWithActivity[];
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
}

/**
 * コンテキストメニューの状態
 */
export interface ContextMenuState {
  x: number;
  y: number;
  court: CourtWithSession;
  timestamp: number;
  hour: number;
  minute: number;
}

/**
 * ドラッグ中のセッション状態
 */
export interface DraggingSessionState {
  sessionId: string;
  courtId: string;
  originalStartTime: number;
  originalEndTime: number;
  duration: number;
  offsetY: number;
}

/**
 * ドラッグプレビュー状態
 */
export interface DragPreviewState {
  startTime: number;
  endTime: number;
  top: number;
  height: number;
}

/**
 * ブロックモーダル状態
 */
export interface BlockModalState {
  courtId: string;
  courtName: string;
  timestamp: number;
}

/**
 * スワップセッション情報
 */
export interface SwapSessionInfo {
  sessionId: string;
  courtName: string;
  planName?: string;
}
