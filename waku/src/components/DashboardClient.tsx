'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { facilitiesApi, sessionsApi, bookingsApi, courtBlocksApi, breaksApi, type Facility, type CourtBlock, type CourtWithSession, type Session } from '../lib/api-client';
import { useRealtimeCourts } from '../hooks/useRealtimeCourts';
import { CourtCard } from './CourtCard';
import { ShiftPanel } from './ShiftPanel';
import { Header } from './Header';
import { CourtTimeline, type TimeSlotClickData, type CreateSlotClickData, type SlotClickData, type SessionClickData, type SessionTimeUpdateData, type CreateBlockData, type CreateBreakData } from './CourtTimeline';
import { ReservationModal } from './ReservationModal';
import { CreateSlotModal } from './CreateSlotModal';
import { AddBookingModal } from './AddBookingModal';
import { SessionDetailModal } from './SessionDetailModal';
import { QRCodeModal } from './QRCodeModal';
import { ReservationCard, type ReservationCardData } from './ReservationCard';
import { AddReservationCard } from './AddReservationCard';

type ViewMode = 'cards' | 'timeline';

// 日付をYYYY-MM-DD形式で取得
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 日付表示用（M月D日（曜日））
function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekdays[date.getDay()]}）`;
}

/**
 * コートとセッションのデータから予約カードデータを構築する
 * - lockingとcompletedはスキップ
 * - 枠プランの場合は各bookingを個別カードとして表示
 * - 開始時刻順にソート
 */
function buildReservationCards(courts: CourtWithSession[]): ReservationCardData[] {
  const cards: ReservationCardData[] = [];

  for (const court of courts) {
    // sessions配列またはcurrentSessionを取得
    const sessions: Session[] = court.sessions || (court.currentSession ? [court.currentSession] : []);

    for (const session of sessions) {
      // lockingとcompletedはスキップ
      if (session.status === 'locking' || session.status === 'completed') continue;

      if (session.isSlotBased && session.bookings && session.bookings.length > 0) {
        // 枠プラン：各bookingを個別カードとして表示
        for (const booking of session.bookings) {
          cards.push({
            cardId: `booking-${booking.id}`,
            courtId: court.id,
            courtName: court.name,
            sessionId: session.id,
            session,
            booking,
            displayName: booking.customerName,
            displayCount: booking.customerCount,
            paymentStatus: booking.paymentStatus,
            startTime: session.startTime,
            estimatedEndTime: session.estimatedEndTime,
            displayColor: session.displayColor,
            planName: session.planName,
            planShortName: session.planShortName,
            assignments: session.assignments,
            options: session.options,
          });
        }
      } else {
        // 通常セッション：1セッション=1カード
        cards.push({
          cardId: `session-${session.id}`,
          courtId: court.id,
          courtName: court.name,
          sessionId: session.id,
          session,
          displayName: session.customerName || '未設定',
          displayCount: session.customerCount,
          paymentStatus: session.paymentStatus || 'unpaid',
          startTime: session.startTime,
          estimatedEndTime: session.estimatedEndTime,
          displayColor: session.displayColor,
          planName: session.planName,
          planShortName: session.planShortName,
          assignments: session.assignments,
          options: session.options,
        });
      }
    }
  }

  // 開始時刻の早い順にソート
  return cards.sort((a, b) => a.startTime - b.startTime);
}

// ローディングステップの型
type LoadingStep = 'auth' | 'facilities' | 'realtime' | 'complete';

export function DashboardClient() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('auth');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [blocks, setBlocks] = useState<CourtBlock[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(formatDateString(new Date()));

  const {
    courts,
    shifts,
    isConnected,
    error: sseError,
    lockCourt,
    unlockSession,
    reserveSession,
    lockAndReserve,
    startSession,
    completeSession,
    cancelSession,
    assignStaff,
    unassignStaff,
    updateStaffStatus,
    swapCourts,
  } = useRealtimeCourts(selectedFacilityId, selectedDate);

  // 予約モーダル用の状態
  const [reservationModalData, setReservationModalData] = useState<TimeSlotClickData | null>(null);

  // 枠作成モーダル用の状態
  const [createSlotCourtData, setCreateSlotCourtData] = useState<{ courtId: string; courtName: string } | null>(null);

  // 予約追加モーダル用の状態
  const [addBookingData, setAddBookingData] = useState<{
    sessionId: string;
    planName: string;
    currentCount: number;
    maxCapacity: number;
    currentCustomerName?: string;
  } | null>(null);

  // セッション詳細モーダル用の状態
  const [sessionDetailData, setSessionDetailData] = useState<{
    sessionId: string;
    courtName: string;
  } | null>(null);

  // QRコードモーダル用の状態
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);

  // タイムスロットクリック時の処理
  const handleTimeSlotClick = (data: TimeSlotClickData) => {
    setReservationModalData(data);
  };

  // タイムラインから枠作成クリック時の処理
  const handleCreateSlotFromTimeline = (data: CreateSlotClickData) => {
    setCreateSlotCourtData({
      courtId: data.court.id,
      courtName: data.court.name,
    });
  };

  // 枠クリック時の処理（予約追加）
  const handleSlotClick = (data: SlotClickData) => {
    const session = data.court.currentSession;
    if (session && session.isSlotBased && session.maxCapacity) {
      setAddBookingData({
        sessionId: session.id,
        planName: session.planName || 'プラン',
        currentCount: session.customerCount,
        maxCapacity: session.maxCapacity,
        currentCustomerName: session.customerName,
      });
    }
  };

  // セッションクリック時の処理（詳細表示）
  const handleSessionClick = (data: SessionClickData) => {
    setSessionDetailData({
      sessionId: data.session.id,
      courtName: data.court.name,
    });
  };

  // シフト列からのセッションクリック時の処理
  const handleShiftSessionClick = (sessionId: number, courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    setSessionDetailData({
      sessionId: String(sessionId),
      courtName: court?.name || '',
    });
  };

  // セッション時間更新時の処理（ドラッグ・アンド・ドロップ）
  const handleSessionTimeUpdate = async (data: SessionTimeUpdateData) => {
    if (!selectedFacilityId) return;
    await sessionsApi.updateTime(selectedFacilityId, data.sessionId, data.startTime, data.estimatedEndTime);
  };

  // セッションの支払いステータスを切り替え（通常予約用）
  const handleTogglePaymentStatus = async (sessionId: string, currentStatus: 'paid' | 'unpaid') => {
    if (!selectedFacilityId) return;
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    await sessionsApi.updatePaymentStatus(selectedFacilityId, sessionId, newStatus);
  };

  // 個別予約の支払いステータスを切り替え（枠プラン用）
  const handleToggleBookingPaymentStatus = async (bookingId: number, currentStatus: 'paid' | 'unpaid') => {
    if (!selectedFacilityId) return;
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    await bookingsApi.updatePaymentStatus(selectedFacilityId, bookingId, newStatus);
  };

  // ブロック一覧を取得
  const fetchBlocks = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      const result = await courtBlocksApi.list(selectedFacilityId, { date: selectedDate, includeRecurring: true });
      setBlocks(result.blocks);
    } catch (err) {
      console.error('Failed to fetch blocks:', err);
    }
  }, [selectedFacilityId, selectedDate]);

  // ブロック作成
  const handleCreateBlock = async (data: CreateBlockData) => {
    if (!selectedFacilityId) {
      console.error('No facility selected');
      return;
    }
    try {
      console.log('Creating block:', { ...data, date: selectedDate, facilityId: selectedFacilityId });
      const result = await courtBlocksApi.create(selectedFacilityId, {
        courtId: data.courtId,
        startTime: data.startTime,
        endTime: data.endTime,
        date: selectedDate,
      });
      console.log('Block created successfully:', result);
      await fetchBlocks();
      console.log('Blocks refreshed');
    } catch (err) {
      console.error('Failed to create block:', err);
      alert(`ブロック作成に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
    }
  };

  // ブロック削除
  const handleDeleteBlock = async (blockId: string) => {
    if (!selectedFacilityId) return;
    await courtBlocksApi.delete(selectedFacilityId, blockId);
    await fetchBlocks();
  };

  // 休憩切り替え
  const handleToggleBreak = async (staffId: string, currentStatus: 'idle' | 'busy' | 'break') => {
    const newStatus = currentStatus === 'break' ? 'idle' : 'break';
    await updateStaffStatus(staffId, newStatus);
  };

  // 予定休憩作成
  const handleCreateScheduledBreak = async (data: CreateBreakData) => {
    if (!selectedFacilityId) return;
    await breaksApi.create(selectedFacilityId, {
      shiftId: data.shiftId,
      startTime: data.startTime,
      endTime: data.endTime,
    });
  };

  // 予定休憩削除
  const handleDeleteScheduledBreak = async (breakId: number) => {
    if (!selectedFacilityId) return;
    await breaksApi.delete(selectedFacilityId, breakId);
  };

  // SSE更新時にモーダルのデータを同期
  useEffect(() => {
    if (!addBookingData) return;

    // 現在開いているセッションを探す
    for (const court of courts) {
      if (court.currentSession?.id === addBookingData.sessionId) {
        const session = court.currentSession;
        // 値が変わっていたら更新
        if (
          session.customerCount !== addBookingData.currentCount ||
          session.maxCapacity !== addBookingData.maxCapacity ||
          session.customerName !== addBookingData.currentCustomerName
        ) {
          setAddBookingData({
            ...addBookingData,
            currentCount: session.customerCount,
            maxCapacity: session.maxCapacity ?? addBookingData.maxCapacity,
            currentCustomerName: session.customerName,
          });
        }
        break;
      }
    }
  }, [courts, addBookingData]);

  // カード表示用の予約データを構築（メモ化）
  const reservationCards = useMemo(() => buildReservationCards(courts), [courts]);

  // 予約カードからコートを選択してモーダルを開く（カード表示からの予約追加）
  const handleAddReservationFromCards = () => {
    // 最初のコートを選択してReservationModalを開く
    if (courts.length > 0) {
      setReservationModalData({
        court: courts[0],
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
  };

  // Fetch facilities on mount
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingStep('facilities');
    const fetchFacilities = async () => {
      try {
        const result = await facilitiesApi.list();
        setFacilities(result.facilities);
        if (result.facilities.length > 0) {
          // localStorageから保存された施設IDを復元
          const savedFacilityId = localStorage.getItem('selectedFacilityId');
          const facilityExists = result.facilities.some((f) => f.id === savedFacilityId);
          setSelectedFacilityId(facilityExists ? savedFacilityId : result.facilities[0].id);
          setLoadingStep('realtime');
        } else {
          setLoadingStep('complete');
          setLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load facilities');
        setLoading(false);
      }
    };

    fetchFacilities();
  }, [isAuthenticated]);

  // 選択施設が変更されたらlocalStorageに保存＆ブロック取得
  useEffect(() => {
    if (selectedFacilityId) {
      localStorage.setItem('selectedFacilityId', selectedFacilityId);
      fetchBlocks();
    }
  }, [selectedFacilityId, fetchBlocks]);

  // リアルタイム接続完了時にローディングを終了
  useEffect(() => {
    if (loadingStep === 'realtime' && isConnected && courts.length >= 0) {
      setLoadingStep('complete');
      setLoading(false);
    }
  }, [loadingStep, isConnected, courts.length]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [authLoading, isAuthenticated]);

  // ローディングステップの表示テキストとプログレス
  const getLoadingInfo = () => {
    switch (loadingStep) {
      case 'auth':
        return { text: '認証情報を確認中...', progress: 25 };
      case 'facilities':
        return { text: '施設データを取得中...', progress: 50 };
      case 'realtime':
        return { text: 'リアルタイム接続中...', progress: 75 };
      default:
        return { text: '読み込み中...', progress: 100 };
    }
  };

  if (authLoading || loading) {
    const { text, progress } = getLoadingInfo();
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full mx-4">
          {/* ローディングスピナー */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>

          {/* ステップテキスト */}
          <p className="text-center text-gray-700 font-medium mb-4">{text}</p>

          {/* プログレスバー */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* ステップインジケーター */}
          <div className="flex justify-between mt-4 text-xs text-gray-500">
            <span className={loadingStep === 'auth' ? 'text-blue-600 font-medium' : ''}>認証</span>
            <span className={loadingStep === 'facilities' ? 'text-blue-600 font-medium' : ''}>施設</span>
            <span className={loadingStep === 'realtime' ? 'text-blue-600 font-medium' : ''}>接続</span>
            <span className={loadingStep === 'complete' ? 'text-blue-600 font-medium' : ''}>完了</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId);

  return (
    <div className={`bg-gray-100 ${viewMode === 'timeline' ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen'}`}>
      <Header
        user={user}
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onFacilityChange={setSelectedFacilityId}
        onSignOut={signOut}
        isConnected={isConnected}
      />

      <main className={`container mx-auto px-4 ${viewMode === 'timeline' ? 'py-2 flex-1 flex flex-col overflow-hidden' : 'py-6'}`}>
        {sseError && (
          <div className="mb-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg text-sm shrink-0">
            {sseError}
          </div>
        )}

        {!selectedFacility ? (
          <div className="text-center py-12">
            <p className="text-gray-500">施設が登録されていません</p>
            <a
              href="/setup"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              施設を登録する
            </a>
          </div>
        ) : (
          <>
            {/* View Mode Toggle & Date Selector */}
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-gray-800">コート状況</h2>
                {/* Date Navigation */}
                <div className="flex items-center gap-1 bg-white rounded-lg shadow px-2 py-1">
                  <button
                    onClick={() => {
                      const date = new Date(selectedDate + 'T00:00:00');
                      date.setDate(date.getDate() - 1);
                      setSelectedDate(formatDateString(date));
                    }}
                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                    title="前日"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelectedDate(formatDateString(new Date()))}
                    className={`px-2 py-0.5 text-sm rounded ${
                      selectedDate === formatDateString(new Date())
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {formatDisplayDate(selectedDate)}
                  </button>
                  <button
                    onClick={() => {
                      const date = new Date(selectedDate + 'T00:00:00');
                      date.setDate(date.getDate() + 1);
                      setSelectedDate(formatDateString(date));
                    }}
                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                    title="翌日"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                {/* QR Code Button */}
                <button
                  onClick={() => setShowQRCodeModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg shadow text-gray-600 hover:bg-gray-50 text-sm"
                  title="公開ビューQRコード"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <span className="hidden sm:inline">QRコード</span>
                </button>
              </div>
              <div className="flex bg-white rounded-lg shadow p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  カード
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'timeline'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  タイムライン
                </button>
              </div>
            </div>

            {viewMode === 'timeline' ? (
              <div className="flex-1 overflow-hidden">
                <CourtTimeline
                courts={courts}
                shifts={shifts}
                blocks={blocks}
                onTimeSlotClick={handleTimeSlotClick}
                onCreateSlotClick={handleCreateSlotFromTimeline}
                onSlotClick={handleSlotClick}
                onSessionClick={handleSessionClick}
                onShiftSessionClick={handleShiftSessionClick}
                onCancelSession={cancelSession}
                onSessionTimeUpdate={handleSessionTimeUpdate}
                onTogglePaymentStatus={handleTogglePaymentStatus}
                onToggleBookingPaymentStatus={handleToggleBookingPaymentStatus}
                onSwapCourts={swapCourts}
                onCreateBlock={handleCreateBlock}
                onDeleteBlock={handleDeleteBlock}
                onToggleBreak={handleToggleBreak}
                onCreateScheduledBreak={handleCreateScheduledBreak}
                onDeleteScheduledBreak={handleDeleteScheduledBreak}
                businessStartHour={selectedFacility?.businessStartHour ?? 9}
                businessEndHour={selectedFacility?.businessEndHour ?? 22}
                selectedDate={selectedDate}
              />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Reservations Section */}
                <div className="lg:col-span-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {reservationCards.map((card) => (
                      <ReservationCard
                        key={card.cardId}
                        data={card}
                        shifts={shifts}
                        onStartSession={() => startSession(card.sessionId)}
                        onCompleteSession={() => completeSession(card.sessionId)}
                        onAssignStaff={(shiftId) => assignStaff(card.sessionId, shiftId)}
                        onUnassignStaff={unassignStaff}
                        onTogglePaymentStatus={
                          card.booking
                            ? () => handleToggleBookingPaymentStatus(card.booking!.id, card.paymentStatus)
                            : () => handleTogglePaymentStatus(card.sessionId, card.paymentStatus)
                        }
                        onCardClick={() => {
                          setSessionDetailData({
                            sessionId: card.sessionId,
                            courtName: card.courtName,
                          });
                        }}
                      />
                    ))}
                    {/* Add Reservation Button */}
                    <AddReservationCard onClick={handleAddReservationFromCards} />
                  </div>
                </div>

                {/* Shifts Panel */}
                <div className="lg:col-span-1">
                  <ShiftPanel
                    shifts={shifts}
                    onStatusChange={updateStaffStatus}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* 予約モーダル */}
        {reservationModalData && selectedFacilityId && (
          <ReservationModal
            court={reservationModalData.court}
            facilityId={selectedFacilityId}
            initialStartTime={reservationModalData.timestamp}
            onClose={() => setReservationModalData(null)}
            onLockAndReserve={lockAndReserve}
            courts={courts}
          />
        )}

        {/* 枠作成モーダル */}
        {createSlotCourtData && selectedFacilityId && (
          <CreateSlotModal
            facilityId={selectedFacilityId}
            courtId={createSlotCourtData.courtId}
            courtName={createSlotCourtData.courtName}
            onClose={() => setCreateSlotCourtData(null)}
            onCreated={() => {
              // SSEで自動更新されるので特に何もしなくてOK
            }}
          />
        )}

        {/* 予約追加モーダル */}
        {addBookingData && selectedFacilityId && (
          <AddBookingModal
            facilityId={selectedFacilityId}
            sessionId={addBookingData.sessionId}
            planName={addBookingData.planName}
            currentCount={addBookingData.currentCount}
            maxCapacity={addBookingData.maxCapacity}
            currentCustomerName={addBookingData.currentCustomerName}
            onClose={() => setAddBookingData(null)}
            onAdded={() => {
              // SSEで自動更新されるので特に何もしなくてOK
            }}
          />
        )}

        {/* セッション詳細モーダル */}
        {sessionDetailData && selectedFacilityId && (
          <SessionDetailModal
            facilityId={selectedFacilityId}
            sessionId={sessionDetailData.sessionId}
            courtName={sessionDetailData.courtName}
            onClose={() => setSessionDetailData(null)}
            onStartSession={async () => {
              await startSession(sessionDetailData.sessionId);
            }}
            onCompleteSession={async () => {
              await completeSession(sessionDetailData.sessionId);
            }}
            onCancelSession={async () => {
              await cancelSession(sessionDetailData.sessionId);
            }}
            courts={courts}
            shifts={shifts}
          />
        )}

        {/* QRコードモーダル */}
        {selectedFacilityId && selectedFacility && (
          <QRCodeModal
            facilityId={selectedFacilityId}
            facilityName={selectedFacility.name}
            isOpen={showQRCodeModal}
            onClose={() => setShowQRCodeModal(false)}
          />
        )}
      </main>
    </div>
  );
}
