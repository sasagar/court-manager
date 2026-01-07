/**
 * 時間範囲選択モーダル
 *
 * 5分刻みで開始・終了時刻を選択できるモーダル
 *
 * @module court-timeline/TimeRangeModal
 */

import { useState, useMemo } from 'react';
import { formatTimeValue, parseTimeValue } from './utils';

/**
 * TimeRangeModalコンポーネントのProps
 */
interface TimeRangeModalProps {
  /** モーダルタイトル */
  title: string;
  /** 初期開始時刻（Unixタイムスタンプ秒） */
  initialStartTime: number;
  /** 営業開始時間 */
  businessStartHour: number;
  /** 営業終了時間 */
  businessEndHour: number;
  /** 選択された日付（YYYY-MM-DD形式）。指定されるとこの日付でタイムスタンプを計算 */
  selectedDate?: string;
  /** 確定時のコールバック */
  onConfirm: (startTime: number, endTime: number) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
}

/**
 * 時間範囲選択モーダル
 *
 * @param props - コンポーネントProps
 * @returns モーダルのJSX
 */
export function TimeRangeModal({
  title,
  initialStartTime,
  businessStartHour,
  businessEndHour,
  selectedDate,
  onConfirm,
  onCancel,
}: TimeRangeModalProps) {
  // 初期値の開始時刻を5分単位に丸める
  const initialDate = new Date(initialStartTime * 1000);
  const initialHour = initialDate.getHours();
  const initialMinute = Math.round(initialDate.getMinutes() / 5) * 5;
  const adjustedInitialMinute = initialMinute >= 60 ? 0 : initialMinute;
  const adjustedInitialHour = initialMinute >= 60 ? initialHour + 1 : initialHour;

  const [startTime, setStartTime] = useState(
    formatTimeValue(adjustedInitialHour, adjustedInitialMinute)
  );
  const [endTime, setEndTime] = useState(
    formatTimeValue(
      adjustedInitialHour + 1 >= businessEndHour ? businessEndHour : adjustedInitialHour + 1,
      adjustedInitialMinute
    )
  );

  // 5分刻みの時刻オプションを生成
  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let h = businessStartHour; h <= businessEndHour; h++) {
      const maxMinute = h === businessEndHour ? 0 : 55;
      for (let m = 0; m <= maxMinute; m += 5) {
        const value = formatTimeValue(h, m);
        options.push({ value, label: value });
      }
    }
    return options;
  }, [businessStartHour, businessEndHour]);

  /**
   * 確定ハンドラ
   */
  const handleConfirm = () => {
    const start = parseTimeValue(startTime);
    const end = parseTimeValue(endTime);

    let targetYear: number;
    let targetMonth: number;
    let targetDay: number;

    if (selectedDate) {
      // selectedDate (YYYY-MM-DD) をJSTとして解釈
      const [year, month, day] = selectedDate.split('-').map(Number);
      targetYear = year;
      targetMonth = month - 1; // JavaScriptのDateは0-indexed
      targetDay = day;
    } else {
      // フォールバック: initialStartTimeから日付を取得
      const date = new Date(initialStartTime * 1000);
      targetYear = date.getFullYear();
      targetMonth = date.getMonth();
      targetDay = date.getDate();
    }

    const startDate = new Date(
      targetYear,
      targetMonth,
      targetDay,
      start.hour,
      start.minute
    );
    const endDate = new Date(
      targetYear,
      targetMonth,
      targetDay,
      end.hour,
      end.minute
    );

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    if (startTimestamp >= endTimestamp) {
      alert('終了時刻は開始時刻より後に設定してください');
      return;
    }

    onConfirm(startTimestamp, endTimestamp);
  };

  /**
   * 時間差を計算して表示
   */
  const getDuration = () => {
    const start = parseTimeValue(startTime);
    const end = parseTimeValue(endTime);
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    const diff = endMinutes - startMinutes;
    if (diff <= 0) return null;
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    if (hours > 0 && minutes > 0) return `${hours}時間${minutes}分`;
    if (hours > 0) return `${hours}時間`;
    return `${minutes}分`;
  };

  const duration = getDuration();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-xs shadow-xl">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>

        {/* 時間範囲選択 */}
        <div className="flex items-center gap-2 mb-4">
          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          >
            {timeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-gray-500 font-medium">〜</span>
          <select
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          >
            {timeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 時間差表示 */}
        {duration && (
          <div className="text-center text-sm text-gray-600 mb-4">
            <span className="bg-gray-100 px-3 py-1 rounded-full">{duration}</span>
          </div>
        )}

        {/* ボタン */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}
