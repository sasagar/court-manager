/**
 * コート空き状況計算ユーティリティ
 *
 * @module public-view/availability-utils
 */

import type { PublicViewData } from '../../lib/api-client';
import { getTodayJST, getJSTTime, getTimeOfDayJST } from '../../lib/time-utils';

/**
 * 使用不可時間帯
 */
interface OccupiedSlot {
  /** 開始時刻（分単位） */
  start: number;
  /** 終了時刻（分単位） */
  end: number;
}

/**
 * 次の空き時間を計算する
 *
 * 営業時間内で、セッションとブロックを考慮して
 * 指定された最短時間以上の空き枠を探す
 *
 * @param sessions - コートのセッション一覧
 * @param blocks - 全ブロック一覧
 * @param courtId - 対象コートID
 * @param businessStart - 営業開始時間（時）
 * @param businessEnd - 営業終了時間（時）
 * @param dateStr - 対象日付（YYYY-MM-DD）
 * @param minSlotMinutes - 最短空き枠（分）
 * @returns 次の空き時間文字列（"今すぐ" / "10:00〜" / null）
 *
 * @example
 * const available = getNextAvailableTime(sessions, blocks, 'court-1', 10, 21, '2024-01-08', 30);
 * console.log(available); // "10:30〜"
 */
export function getNextAvailableTime(
  sessions: PublicViewData['sessions'],
  blocks: PublicViewData['blocks'],
  courtId: string,
  businessStart: number | null,
  businessEnd: number | null,
  dateStr: string,
  minSlotMinutes: number
): string | null {
  // 営業時間のデフォルト値（分単位に変換）
  const startHour = businessStart ?? 10;
  const endHour = businessEnd ?? 21;
  const businessStartMinutes = startHour * 60;
  const businessEndMinutes = endHour * 60;

  // 現在時刻をJSTの分単位で取得
  const now = new Date();
  const nowJST = getJSTTime(Math.floor(now.getTime() / 1000));
  const nowMinutes = nowJST.hours * 60 + nowJST.minutes;

  // 今日かどうかを判定
  const todayJST = getTodayJST();
  const isToday = dateStr === todayJST;

  // 検索開始時刻（今日なら現在時刻、それ以外は営業開始）
  const searchStartMinutes = isToday
    ? Math.max(nowMinutes, businessStartMinutes)
    : businessStartMinutes;

  // 営業終了後なら空きなし
  if (searchStartMinutes >= businessEndMinutes) {
    return null;
  }

  // セッションを時刻順にソート（cancelledを除外）
  const activeSessions = sessions
    .filter(s => s.status !== 'cancelled' && s.status !== 'completed')
    .map(s => ({
      start: getTimeOfDayJST(s.startTime),
      end: s.endTime ? getTimeOfDayJST(s.endTime) : getTimeOfDayJST(s.startTime) + 60,
    }));

  // このコートのブロック（コート指定 or 全コート対象）
  const courtBlocks = (blocks || [])
    .filter(b => b.courtId === courtId || b.courtId === null)
    .map(b => ({
      start: getTimeOfDayJST(b.startTime),
      end: getTimeOfDayJST(b.endTime),
    }));

  // セッションとブロックを統合して「使用不可時間帯」を作成
  const occupiedSlots: OccupiedSlot[] = [...activeSessions, ...courtBlocks]
    .sort((a, b) => a.start - b.start);

  // 使用不可時間帯がない場合
  if (occupiedSlots.length === 0) {
    const availableTime = businessEndMinutes - searchStartMinutes;
    if (availableTime >= minSlotMinutes) {
      if (isToday && nowMinutes >= businessStartMinutes && nowMinutes < businessEndMinutes) {
        return '今すぐ';
      }
      if (!isToday || nowMinutes < businessStartMinutes) {
        return `${startHour}:00〜`;
      }
    }
    return null;
  }

  // 最初のスロットより前に空きがあるか
  const firstSlot = occupiedSlots[0];
  if (searchStartMinutes < firstSlot.start) {
    const gapBeforeFirst = firstSlot.start - searchStartMinutes;
    if (gapBeforeFirst >= minSlotMinutes) {
      if (isToday && nowMinutes >= businessStartMinutes) {
        return '今すぐ';
      }
      return `${startHour}:00〜`;
    }
  }

  // スロット間の空き時間を探す
  let currentEnd = searchStartMinutes;
  for (const slot of occupiedSlots) {
    // このスロットが検索開始より前に終わっている場合はスキップ
    if (slot.end <= currentEnd) continue;

    // スロット開始前に空きがあるかチェック
    if (slot.start > currentEnd) {
      const gap = slot.start - currentEnd;
      if (gap >= minSlotMinutes) {
        if (currentEnd <= searchStartMinutes && isToday && nowMinutes >= businessStartMinutes) {
          return '今すぐ';
        }
        const hours = Math.floor(currentEnd / 60);
        const minutes = currentEnd % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}〜`;
      }
    }

    // 現在の終了時刻を更新
    currentEnd = Math.max(currentEnd, slot.end);
  }

  // 最後のスロット後から営業終了まで
  if (currentEnd < businessEndMinutes) {
    const gap = businessEndMinutes - currentEnd;
    if (gap >= minSlotMinutes) {
      const hours = Math.floor(currentEnd / 60);
      const minutes = currentEnd % 60;
      return `${hours}:${minutes.toString().padStart(2, '0')}〜`;
    }
  }

  return null;
}
