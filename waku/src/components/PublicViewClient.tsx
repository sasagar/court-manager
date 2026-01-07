'use client';

/**
 * 公開ビュークライアントコンポーネント
 *
 * トークンベースで認証不要の公開ビューを提供する
 * コートの空き状況、予約、スタッフシフトをリアルタイム表示
 *
 * @module PublicViewClient
 */

import { useState, useEffect, useCallback } from 'react';
import { publicViewApi, type PublicViewData } from '../lib/api-client';
import {
  getTodayJST,
  getNextDay,
  getPreviousDay,
} from '../lib/time-utils';
import {
  Header,
  CourtSection,
  StaffSection,
  LoadingState,
  ErrorState,
} from './public-view';

/**
 * PublicViewClientコンポーネントのProps
 */
interface PublicViewClientProps {
  /** 公開ビュートークン */
  token: string;
}

/**
 * 公開ビュークライアント
 *
 * 施設の公開ビューを表示するメインコンポーネント
 * 30秒ごとに自動更新し、日付ナビゲーションを提供する
 *
 * @param props - コンポーネントProps
 * @returns 公開ビューのJSX
 *
 * @example
 * <PublicViewClient token="abc123" />
 */
export function PublicViewClient({ token }: PublicViewClientProps) {
  const [data, setData] = useState<PublicViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayJST());
  const [minSlotMinutes, setMinSlotMinutes] = useState<number>(15);

  /**
   * データを取得する
   */
  const fetchData = useCallback(async () => {
    try {
      const result = await publicViewApi.getData(token, selectedDate);
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'データの取得に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  }, [token, selectedDate]);

  // 初回読み込み & 30秒ごとに自動更新
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /**
   * 日付を変更する
   */
  const handleDateChange = (newDate: string) => {
    setLoading(true);
    setSelectedDate(newDate);
  };

  /**
   * 前日に移動
   */
  const goToPreviousDay = () => {
    handleDateChange(getPreviousDay(selectedDate));
  };

  /**
   * 翌日に移動
   */
  const goToNextDay = () => {
    handleDateChange(getNextDay(selectedDate));
  };

  /**
   * 今日に移動
   */
  const goToToday = () => {
    handleDateChange(getTodayJST());
  };

  // ローディング状態
  if (loading) {
    return <LoadingState />;
  }

  // エラー状態
  if (error || !data) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        facilityName={data.facility.name}
        lastUpdated={lastUpdated}
        selectedDate={selectedDate}
        onPreviousDay={goToPreviousDay}
        onNextDay={goToNextDay}
        onToday={goToToday}
      />

      <main className="p-4 space-y-6">
        <CourtSection
          data={data}
          minSlotMinutes={minSlotMinutes}
          onMinSlotChange={setMinSlotMinutes}
        />

        <StaffSection
          shifts={data.shifts}
          breaks={data.breaks}
        />
      </main>

      <footer className="py-4 text-center text-xs text-gray-400">
        Court Manager
      </footer>
    </div>
  );
}
