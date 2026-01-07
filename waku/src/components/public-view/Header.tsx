/**
 * 公開ビューヘッダーコンポーネント
 *
 * 施設名、更新状態、日付ナビゲーションを表示
 *
 * @module public-view/Header
 */

import { formatTime, formatDateJapanese, getTodayJST } from '../../lib/time-utils';

/**
 * HeaderコンポーネントのProps
 */
interface HeaderProps {
  /** 施設名 */
  facilityName: string;
  /** 最終更新日時 */
  lastUpdated: Date | null;
  /** 選択中の日付（YYYY-MM-DD） */
  selectedDate: string;
  /** 前日に移動 */
  onPreviousDay: () => void;
  /** 翌日に移動 */
  onNextDay: () => void;
  /** 今日に移動 */
  onToday: () => void;
}

/**
 * 公開ビューヘッダー
 *
 * 施設名、自動更新状態、日付ナビゲーションを表示する
 *
 * @param props - コンポーネントProps
 * @returns ヘッダーのJSX
 */
export function Header({
  facilityName,
  lastUpdated,
  selectedDate,
  onPreviousDay,
  onNextDay,
  onToday,
}: HeaderProps) {
  const isToday = selectedDate === getTodayJST();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{facilityName}</h1>
          <div className="text-right">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>自動更新中</span>
            </div>
            {lastUpdated && (
              <p className="text-xs text-gray-400 mt-1">
                {formatTime(lastUpdated)}更新
              </p>
            )}
          </div>
        </div>

        <DateNavigation
          selectedDate={selectedDate}
          isToday={isToday}
          onPreviousDay={onPreviousDay}
          onNextDay={onNextDay}
          onToday={onToday}
        />
      </div>
    </header>
  );
}

/**
 * DateNavigationコンポーネントのProps
 */
interface DateNavigationProps {
  /** 選択中の日付 */
  selectedDate: string;
  /** 今日かどうか */
  isToday: boolean;
  /** 前日に移動 */
  onPreviousDay: () => void;
  /** 翌日に移動 */
  onNextDay: () => void;
  /** 今日に移動 */
  onToday: () => void;
}

/**
 * 日付ナビゲーション
 *
 * 前日・翌日ボタンと現在の日付を表示する
 *
 * @param props - コンポーネントProps
 */
function DateNavigation({
  selectedDate,
  isToday,
  onPreviousDay,
  onNextDay,
  onToday,
}: DateNavigationProps) {
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      <button
        onClick={onPreviousDay}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="前日"
      >
        <ChevronLeftIcon />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-base font-medium text-gray-900">
          {formatDateJapanese(selectedDate)}
        </span>
        {!isToday && (
          <button
            onClick={onToday}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-sm hover:bg-blue-200 transition-colors"
          >
            今日
          </button>
        )}
      </div>

      <button
        onClick={onNextDay}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="翌日"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

/**
 * 左矢印アイコン
 */
function ChevronLeftIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

/**
 * 右矢印アイコン
 */
function ChevronRightIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
