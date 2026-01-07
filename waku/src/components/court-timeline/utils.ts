/**
 * コートタイムライン用ユーティリティ関数
 *
 * @module court-timeline/utils
 */

import type React from 'react';
import { HOUR_HEIGHT } from './constants';
import {
  getSessionStatusLabel as getStatusLabelFromConstants,
  getSessionStatusTimelineColor,
} from '../../constants/status';

// time-utils から formatTimeJST を再エクスポート
export { formatTimeJST } from '../../lib/time-utils';

/**
 * 現在時刻のポジション（px）を計算
 *
 * @param startHour - 営業開始時間
 * @param endHour - 営業終了時間
 * @returns 位置（px）、営業時間外の場合は-1
 */
export function getCurrentTimePosition(startHour: number, endHour: number): number {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour < startHour || currentHour >= endHour) {
    return -1;
  }

  const totalMinutes = (currentHour - startHour) * 60 + currentMinute;
  return (totalMinutes / 60) * HOUR_HEIGHT;
}

/**
 * タイムスタンプから位置（px）を計算
 *
 * @param timestamp - Unixタイムスタンプ（秒）
 * @param totalHeight - タイムラインの総高さ
 * @param startHour - 営業開始時間
 * @param endHour - 営業終了時間
 * @returns 位置（px）
 */
export function getPositionFromTimestamp(
  timestamp: number,
  totalHeight: number,
  startHour: number,
  endHour: number
): number {
  const date = new Date(timestamp * 1000);
  const hour = date.getHours();
  const minute = date.getMinutes();

  if (hour < startHour) return 0;
  if (hour >= endHour) return totalHeight;

  const totalMinutes = (hour - startHour) * 60 + minute;
  return (totalMinutes / 60) * HOUR_HEIGHT;
}

/**
 * Y座標からタイムスタンプを計算
 *
 * @param posY - Y座標位置
 * @param totalHeight - タイムラインの総高さ
 * @param startHour - 営業開始時間
 * @param endHour - 営業終了時間
 * @returns Unixタイムスタンプ（秒）
 */
export function getTimestampFromPosition(
  posY: number,
  totalHeight: number,
  startHour: number,
  endHour: number
): number {
  const percentage = Math.max(0, Math.min(1, posY / totalHeight));
  const totalMinutes = percentage * (endHour - startHour) * 60;
  const hour = Math.floor(totalMinutes / 60) + startHour;
  const minute = Math.round((totalMinutes % 60) / 5) * 5;

  const now = new Date();
  const targetTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute >= 60 ? 0 : minute
  );
  if (minute >= 60) {
    targetTime.setHours(hour + 1);
  }
  return Math.floor(targetTime.getTime() / 1000);
}

/**
 * ステータスに応じた色クラスを取得（displayColorがない場合のフォールバック）
 *
 * @param status - セッションステータス
 * @returns Tailwind CSSクラス
 */
export function getStatusColorClass(status: string): string {
  return getSessionStatusTimelineColor(status);
}

/**
 * HEXカラーをRGBに変換
 *
 * @param hex - HEXカラーコード
 * @returns RGBオブジェクト、無効な場合はnull
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * displayColorからスタイルを生成
 *
 * @param displayColor - 表示カラー（HEX）
 * @param status - セッションステータス
 * @returns クラス名とスタイルオブジェクト
 */
export function getSessionStyle(
  displayColor?: string,
  status?: string
): { className: string; style?: React.CSSProperties } {
  if (!displayColor) {
    return { className: getStatusColorClass(status || 'reserved') };
  }
  const rgb = hexToRgb(displayColor);
  if (!rgb) {
    return { className: getStatusColorClass(status || 'reserved') };
  }
  return {
    className: '',
    style: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
      borderColor: displayColor,
      borderWidth: '2px',
    },
  };
}

/**
 * ステータスラベルを取得
 *
 * @param status - セッションステータス
 * @returns 日本語ラベル
 */
export function getStatusLabel(status: string): string {
  return getStatusLabelFromConstants(status);
}

/**
 * 時刻値をフォーマット
 *
 * @param hour - 時
 * @param minute - 分
 * @returns "H:MM" 形式の文字列
 */
export function formatTimeValue(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/**
 * 時刻文字列をパース
 *
 * @param value - "H:MM" 形式の文字列
 * @returns 時と分のオブジェクト
 */
export function parseTimeValue(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number);
  return { hour: h, minute: m };
}
