/**
 * ステータス関連の定数と関数
 *
 * セッション、シフトなどのステータス表示に使用
 *
 * @module constants/status
 */

import type { SessionStatus } from '../types';

/**
 * セッションステータスのラベル（日本語）
 */
export const SESSION_STATUS_LABELS: Record<SessionStatus | 'available', string> = {
  available: '空き',
  locking: 'ロック中',
  reserved: '予約済',
  in_use: '使用中',
  completed: '完了',
};

/**
 * セッションステータスのバッジカラー（Tailwind CSS クラス）
 */
export const SESSION_STATUS_BADGE_COLORS: Record<SessionStatus | 'available', string> = {
  available: 'bg-green-200 text-green-800',
  locking: 'bg-yellow-200 text-yellow-800',
  reserved: 'bg-blue-200 text-blue-800',
  in_use: 'bg-green-200 text-green-800',
  completed: 'bg-gray-200 text-gray-800',
};

/**
 * セッションステータスのカード背景カラー（Tailwind CSS クラス）
 */
export const SESSION_STATUS_CARD_COLORS: Record<SessionStatus | 'available', string> = {
  available: 'bg-green-100 border-green-300',
  locking: 'bg-yellow-100 border-yellow-300',
  reserved: 'bg-blue-100 border-blue-300',
  in_use: 'bg-red-100 border-red-300',
  completed: 'bg-gray-100 border-gray-300',
};

/**
 * タイムライン用ステータスカラー（Tailwind CSS クラス）
 */
export const SESSION_STATUS_TIMELINE_COLORS: Record<SessionStatus | 'available', string> = {
  available: 'bg-green-200 border-green-400',
  locking: 'bg-yellow-200 border-yellow-400',
  reserved: 'bg-blue-200 border-blue-400',
  in_use: 'bg-green-200 border-green-400',
  completed: 'bg-gray-200 border-gray-400',
};

/**
 * シフトステータスのラベル（日本語）
 */
export const SHIFT_STATUS_LABELS: Record<string, string> = {
  scheduled: '予定',
  active: '勤務中',
  completed: '完了',
};

/**
 * シフトステータスのバッジカラー（Tailwind CSS クラス）
 */
export const SHIFT_STATUS_BADGE_COLORS: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
};

/**
 * 支払いステータスのラベル（日本語）
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: '支払い済',
  unpaid: '未払い',
};

/**
 * 支払いステータスのバッジカラー（Tailwind CSS クラス）
 */
export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  unpaid: 'bg-red-100 text-red-800',
};

/**
 * セッションステータスのラベルを取得
 *
 * @param status - ステータス文字列
 * @returns ラベル（日本語）
 */
export function getSessionStatusLabel(status: string): string {
  return SESSION_STATUS_LABELS[status as SessionStatus] || status;
}

/**
 * セッションステータスのバッジカラーを取得
 *
 * @param status - ステータス文字列
 * @returns Tailwind CSS クラス
 */
export function getSessionStatusBadgeColor(status: string): string {
  return SESSION_STATUS_BADGE_COLORS[status as SessionStatus] || 'bg-gray-100 text-gray-800';
}

/**
 * セッションステータスのカード背景カラーを取得
 *
 * @param status - ステータス文字列
 * @returns Tailwind CSS クラス
 */
export function getSessionStatusCardColor(status: string): string {
  return SESSION_STATUS_CARD_COLORS[status as SessionStatus] || 'bg-gray-100 border-gray-300';
}

/**
 * タイムライン用ステータスカラーを取得
 *
 * @param status - ステータス文字列
 * @returns Tailwind CSS クラス
 */
export function getSessionStatusTimelineColor(status: string): string {
  return SESSION_STATUS_TIMELINE_COLORS[status as SessionStatus] || 'bg-gray-200 border-gray-400';
}

/**
 * シフトステータスのラベルを取得
 *
 * @param status - ステータス文字列
 * @returns ラベル（日本語）
 */
export function getShiftStatusLabel(status: string): string {
  return SHIFT_STATUS_LABELS[status] || status;
}

/**
 * シフトステータスのバッジカラーを取得
 *
 * @param status - ステータス文字列
 * @returns Tailwind CSS クラス
 */
export function getShiftStatusBadgeColor(status: string): string {
  return SHIFT_STATUS_BADGE_COLORS[status] || 'bg-gray-100 text-gray-700';
}

/**
 * 支払いステータスのラベルを取得
 *
 * @param status - ステータス文字列
 * @returns ラベル（日本語）
 */
export function getPaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] || status;
}

/**
 * 支払いステータスのバッジカラーを取得
 *
 * @param status - ステータス文字列
 * @returns Tailwind CSS クラス
 */
export function getPaymentStatusColor(status: string): string {
  return PAYMENT_STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
}
