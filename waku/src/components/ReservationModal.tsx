'use client';

import { useState, useEffect } from 'react';
import type {
  CourtWithSession,
  ReserveSessionInput,
  Plan,
  Booking,
  CreateBookingInput,
  PlanOption,
} from '../lib/api-client';
import { plansApi, bookingsApi, planOptionsApi, sessionOptionsApi } from '../lib/api-client';
import { COLOR_PRESETS } from '../constants/colors';

type ReservationModalProps = {
  court: CourtWithSession;
  facilityId: string;
  initialStartTime?: number;
  onClose: () => void;
  onLockAndReserve: (
    courtId: string,
    data: ReserveSessionInput & { startTime?: number }
  ) => Promise<{ sessionId: string }>;
  courts?: CourtWithSession[]; // Optional: for court selection
};

export function ReservationModal({
  court,
  facilityId,
  initialStartTime,
  onClose,
  onLockAndReserve,
  courts,
}: ReservationModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerCount, setCustomerCount] = useState(1);
  const [customerPhone, setCustomerPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [startHour, setStartHour] = useState(9);
  const [startMinute, setStartMinute] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [displayColor, setDisplayColor] = useState<string | undefined>(undefined);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string>(court.id);

  // 枠プラン用の状態
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [customMaxCapacity, setCustomMaxCapacity] = useState<number | undefined>(undefined);
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');

  // オプション用の状態
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({}); // optionId -> quantity

  // 初期時間を設定
  useEffect(() => {
    if (initialStartTime) {
      const date = new Date(initialStartTime * 1000);
      setStartHour(date.getHours());
      setStartMinute(date.getMinutes());
    } else {
      const now = new Date();
      setStartHour(now.getHours());
      setStartMinute(Math.ceil(now.getMinutes() / 5) * 5);
    }
  }, [initialStartTime]);

  // プラン一覧を取得
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const result = await plansApi.list(facilityId);
        setPlans(result.plans);
      } catch (err) {
        console.error('Failed to fetch plans:', err);
      }
    };
    fetchPlans();
  }, [facilityId]);

  // 既存セッションの予約一覧を取得（枠プランの場合）
  useEffect(() => {
    const fetchBookings = async () => {
      if (!court.currentSession || !court.currentSession.isSlotBased) return;
      setBookingsLoading(true);
      try {
        const result = await bookingsApi.list(facilityId, court.currentSession.id);
        setBookings(result.bookings);
      } catch (err) {
        console.error('Failed to fetch bookings:', err);
      } finally {
        setBookingsLoading(false);
      }
    };
    fetchBookings();
  }, [facilityId, court.currentSession]);

  // プランのオプションを取得（非枠プランの場合のみ）
  useEffect(() => {
    const fetchPlanOptions = async () => {
      if (!selectedPlanId) {
        setPlanOptions([]);
        setSelectedOptions({});
        return;
      }
      const plan = plans.find((p) => p.id === selectedPlanId);
      if (!plan || plan.isSlotBased) {
        setPlanOptions([]);
        setSelectedOptions({});
        return;
      }
      try {
        const result = await planOptionsApi.list(facilityId, selectedPlanId);
        setPlanOptions(result.options);
        setSelectedOptions({});
      } catch (err) {
        console.error('Failed to fetch plan options:', err);
        setPlanOptions([]);
      }
    };
    fetchPlanOptions();
  }, [facilityId, selectedPlanId, plans]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  // 既存セッションの場合はセッションから、新規の場合は選択プランから判定
  const isSlotBased = court.currentSession?.isSlotBased || selectedPlan?.isSlotBased || false;
  // 既存セッションはセッションの定員を使用、新規の場合はカスタム値 or プランのデフォルト
  const defaultMaxCapacity = court.currentSession?.maxCapacity || selectedPlan?.maxCapacity || 0;
  const maxCapacity = court.currentSession ? defaultMaxCapacity : (customMaxCapacity ?? defaultMaxCapacity);

  // 現在の予約人数合計
  const currentBookedCount = bookings
    .filter((b) => b.status === 'confirmed')
    .reduce((sum, b) => sum + b.customerCount, 0);
  const availableSlots = maxCapacity - currentBookedCount;

  // 終了時間を計算
  const getEndTime = (): number | undefined => {
    if (!selectedPlan) return undefined;
    const startTime = getStartTimestamp();
    return startTime + selectedPlan.durationMinutes * 60;
  };

  const getStartTimestamp = (): number => {
    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      startHour,
      startMinute
    );
    return Math.floor(startDate.getTime() / 1000);
  };

  const formatTime = (hour: number, minute: number): string => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  // オプションの選択切り替え
  const handleOptionToggle = (optionId: string) => {
    const option = planOptions.find((o) => o.id === optionId);
    if (!option) return;

    setSelectedOptions((prev) => {
      // ラジオボタンの場合、同じグループの他のオプションを解除
      if (option.selectionType === 'radio' && option.optionGroup) {
        const sameGroupOptions = planOptions.filter(
          (o) => o.selectionType === 'radio' && o.optionGroup === option.optionGroup
        );
        const newState = { ...prev };
        // 同じグループの他のオプションを解除
        for (const groupOption of sameGroupOptions) {
          if (groupOption.id !== optionId) {
            delete newState[groupOption.id];
          }
        }
        // 既に選択されている場合は解除、そうでなければ選択
        if (prev[optionId]) {
          delete newState[optionId];
        } else {
          newState[optionId] = 1;
        }
        return newState;
      }

      // チェックボックス・数量の場合は従来通り
      if (prev[optionId]) {
        const { [optionId]: _, ...rest } = prev;
        return rest;
      } else {
        return { ...prev, [optionId]: 1 };
      }
    });
  };

  // オプションの人数変更
  const handleOptionQuantityChange = (optionId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedOptions((prev) => {
        const { [optionId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setSelectedOptions((prev) => ({ ...prev, [optionId]: quantity }));
    }
  };

  // 選択中のコートを取得
  const targetCourt = courts?.find((c) => c.id === selectedCourtId) || court;

  // 通常予約の送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      // 予約を作成（選択されたコートに対して）
      const { sessionId } = await onLockAndReserve(selectedCourtId, {
        customerName: customerName.trim() || undefined,
        customerCount,
        planId: selectedPlanId || undefined,
        startTime: getStartTimestamp(),
        estimatedEndTime: getEndTime(),
        maxCapacity: isSlotBased ? maxCapacity : undefined,
        displayColor: displayColor,
        memo: memo.trim() || undefined,
        paymentStatus,
      });

      // オプションが選択されている場合、セッションにオプションを設定
      if (Object.keys(selectedOptions).length > 0) {
        const optionsToSave = Object.entries(selectedOptions).map(([optionId, quantity]) => ({
          optionId,
          quantity,
        }));
        await sessionOptionsApi.update(facilityId, sessionId, optionsToSave);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 枠プランへの個別予約追加
  const handleAddBooking = async () => {
    if (!court.currentSession) {
      setError('セッションが見つかりません');
      return;
    }
    if (customerCount > availableSlots) {
      setError(`空き枠が足りません（残り${availableSlots}名）`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data: CreateBookingInput = {
        customerName: customerName.trim(),
        customerCount,
        customerPhone: customerPhone || undefined,
        paymentStatus: bookingPaymentStatus,
      };
      await bookingsApi.create(facilityId, court.currentSession.id, data);

      // 予約一覧を更新
      const result = await bookingsApi.list(facilityId, court.currentSession.id);
      setBookings(result.bookings);

      // フォームをリセット
      setCustomerName('');
      setCustomerCount(1);
      setCustomerPhone('');
      setBookingPaymentStatus('unpaid');
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 個別予約の削除
  const handleDeleteBooking = async (bookingId: number) => {
    if (!confirm('この予約を削除しますか？')) return;

    try {
      await bookingsApi.delete(facilityId, bookingId);

      // 予約一覧を更新
      if (court.currentSession) {
        const result = await bookingsApi.list(facilityId, court.currentSession.id);
        setBookings(result.bookings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約削除に失敗しました');
    }
  };

  // 個別予約の支払いステータス切り替え
  const handleToggleBookingPayment = async (bookingId: number, currentStatus: 'paid' | 'unpaid') => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await bookingsApi.updatePaymentStatus(facilityId, bookingId, newStatus);

      // 予約一覧を更新
      if (court.currentSession) {
        const result = await bookingsApi.list(facilityId, court.currentSession.id);
        setBookings(result.bookings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '支払いステータスの更新に失敗しました');
    }
  };

  // 時間の選択肢を生成
  const hourOptions = Array.from({ length: 14 }, (_, i) => i + 9); // 9:00 - 22:00
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10, ..., 55

  // 既存の枠セッションに予約を追加するモード
  const isAddingToExistingSlot = court.currentSession && isSlotBased;

  // 注意: 同じコートでも異なる時間帯なら予約可能
  // 時間帯の重複チェックはサーバー側で行われる
  const hasNonSlotSession = false; // 警告を無効化

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {targetCourt.name} - {isAddingToExistingSlot ? '枠予約に追加' : '予約入力'}
        </h3>

        {hasNonSlotSession && (
          <div className="mb-4 p-3 bg-amber-100 border border-amber-400 text-amber-700 rounded-lg text-sm">
            <p className="font-medium">このコートには既に予約があります</p>
            <p className="mt-1 text-xs">既存の予約を完了またはキャンセルしてから新しい予約を入れてください</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 枠プランの既存予約一覧 */}
        {isAddingToExistingSlot && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                現在の予約状況
              </span>
              <span className="text-sm text-gray-600">
                {currentBookedCount} / {maxCapacity} 名
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(currentBookedCount / maxCapacity) * 100}%` }}
              />
            </div>
            {bookingsLoading ? (
              <div className="text-sm text-gray-500">読み込み中...</div>
            ) : bookings.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {bookings.filter(b => b.status === 'confirmed').map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-2 bg-white rounded border"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <button
                        type="button"
                        onClick={() => handleToggleBookingPayment(booking.id, booking.paymentStatus)}
                        className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                          booking.paymentStatus === 'paid'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        }`}
                        title={booking.paymentStatus === 'paid' ? 'クリックで未払いに変更' : 'クリックで支払い済みに変更'}
                      >
                        {booking.paymentStatus === 'paid' ? '済' : '未'}
                      </button>
                      <span className="font-medium">{booking.customerName}</span>
                      <span className="text-gray-500">{booking.customerCount}名</span>
                      {booking.customerPhone && (
                        <span className="text-gray-400 text-xs">{booking.customerPhone}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteBooking(booking.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">予約はまだありません</div>
            )}
          </div>
        )}

        <form onSubmit={isAddingToExistingSlot ? (e) => { e.preventDefault(); handleAddBooking(); } : handleSubmit}>
          {/* お客様名 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              お客様名（任意）
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="お客様名を入力"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* 人数 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              人数
              {isSlotBased && availableSlots > 0 && (
                <span className="text-gray-500 font-normal ml-2">
                  （残り{availableSlots}名）
                </span>
              )}
            </label>
            <input
              type="number"
              value={customerCount}
              onChange={(e) => setCustomerCount(Math.max(1, Number(e.target.value)))}
              min={1}
              max={isSlotBased ? availableSlots : undefined}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="ml-2 text-gray-600">名</span>
          </div>

          {/* 電話番号（枠プランの場合のみ） */}
          {isSlotBased && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                電話番号（任意）
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="090-1234-5678"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 支払いステータス選択（枠プランへの予約追加の場合） */}
          {isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                支払いステータス
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBookingPaymentStatus('unpaid')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    bookingPaymentStatus === 'unpaid'
                      ? 'bg-orange-100 border-orange-400 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  未払い
                </button>
                <button
                  type="button"
                  onClick={() => setBookingPaymentStatus('paid')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    bookingPaymentStatus === 'paid'
                      ? 'bg-green-100 border-green-400 text-green-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  支払い済み
                </button>
              </div>
            </div>
          )}

          {/* コート選択（新規予約の場合で複数コートがある場合のみ） */}
          {!isAddingToExistingSlot && courts && courts.length > 1 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                コート
              </label>
              <select
                value={selectedCourtId}
                onChange={(e) => setSelectedCourtId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 開始時間（新規予約の場合のみ） */}
          {!isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始時間
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {hourOptions.map((h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <span>:</span>
                <select
                  value={startMinute}
                  onChange={(e) => setStartMinute(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {minuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {m.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* プラン（新規予約の場合のみ） */}
          {!isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                プラン（任意）
              </label>
              <select
                value={selectedPlanId}
                onChange={(e) => {
                  const newPlanId = e.target.value;
                  setSelectedPlanId(newPlanId);
                  setCustomMaxCapacity(undefined); // プラン変更時にカスタム定員をリセット
                  // プラン変更時に色も自動設定
                  const plan = plans.find(p => p.id === newPlanId);
                  if (plan?.colorCode) {
                    setDisplayColor(plan.colorCode);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">選択しない</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.durationMinutes}分)
                    {plan.isSlotBased && ` [枠: ${plan.maxCapacity}名]`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* オプション選択（非枠プランでオプションがある場合のみ） */}
          {!isAddingToExistingSlot && selectedPlan && !selectedPlan.isSlotBased && planOptions.length > 0 && (
            <div className="mb-4 p-2 bg-purple-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                オプション
              </label>
              <div className="space-y-1">
                {/* ラジオボタングループごとに表示 */}
                {(() => {
                  const radioGroups = new Map<string, typeof planOptions>();
                  const nonRadioOptions: typeof planOptions = [];

                  for (const option of planOptions) {
                    if (option.selectionType === 'radio' && option.optionGroup) {
                      const group = radioGroups.get(option.optionGroup) || [];
                      group.push(option);
                      radioGroups.set(option.optionGroup, group);
                    } else {
                      nonRadioOptions.push(option);
                    }
                  }

                  return (
                    <>
                      {/* ラジオボタングループ */}
                      {Array.from(radioGroups.entries()).map(([groupName, groupOptions]) => (
                        <div key={groupName} className="border border-gray-200 rounded p-1.5 bg-white">
                          <div className="text-xs font-medium text-gray-500 mb-1">{groupName}</div>
                          <div className="flex flex-wrap gap-1">
                            {groupOptions.map((option) => (
                              <label
                                key={option.id}
                                htmlFor={`option-${option.id}`}
                                title={option.description || ''}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm ${
                                  selectedOptions[option.id]
                                    ? 'bg-purple-200 text-purple-800'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                <input
                                  type="radio"
                                  id={`option-${option.id}`}
                                  name={`radio-group-${groupName}`}
                                  checked={!!selectedOptions[option.id]}
                                  onChange={() => handleOptionToggle(option.id)}
                                  className="sr-only"
                                />
                                {option.name}
                                {option.description && (
                                  <span className="text-gray-400 text-xs" title={option.description}>ⓘ</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* チェックボックス・数量オプション */}
                      {nonRadioOptions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {nonRadioOptions.map((option) => (
                            <div
                              key={option.id}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                                selectedOptions[option.id]
                                  ? 'border-purple-400 bg-purple-100'
                                  : 'border-gray-200 bg-white'
                              }`}
                            >
                              <label
                                htmlFor={`option-${option.id}`}
                                title={option.description || ''}
                                className="inline-flex items-center gap-1 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  id={`option-${option.id}`}
                                  checked={!!selectedOptions[option.id]}
                                  onChange={() => handleOptionToggle(option.id)}
                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                />
                                <span className={selectedOptions[option.id] ? 'text-purple-800' : 'text-gray-700'}>
                                  {option.name}
                                </span>
                                {option.description && (
                                  <span className="text-gray-400 text-xs" title={option.description}>ⓘ</span>
                                )}
                              </label>
                              {/* 数量入力はquantityタイプの場合のみ表示 */}
                              {selectedOptions[option.id] && option.selectionType === 'quantity' && (
                                <input
                                  type="number"
                                  value={selectedOptions[option.id]}
                                  onChange={(e) =>
                                    handleOptionQuantityChange(option.id, Number(e.target.value))
                                  }
                                  min={1}
                                  className="w-12 px-1 py-0.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              {Object.keys(selectedOptions).length > 0 && (
                <div className="mt-1 pt-1 border-t border-purple-200 text-xs text-gray-600">
                  選択: {Object.entries(selectedOptions).map(([optionId, qty]) => {
                    const opt = planOptions.find((o) => o.id === optionId);
                    if (!opt) return '';
                    return opt.selectionType === 'quantity' ? `${opt.name}(${qty}人)` : opt.name;
                  }).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* 終了時間表示（新規予約でプラン選択時） */}
          {!isAddingToExistingSlot && selectedPlan && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-medium">終了予定:</span>{' '}
                {(() => {
                  const endTimestamp = getEndTime();
                  if (!endTimestamp) return '-';
                  const endDate = new Date(endTimestamp * 1000);
                  return formatTime(endDate.getHours(), endDate.getMinutes());
                })()}
              </p>
              {selectedPlan.isSlotBased && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    この回の定員
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={customMaxCapacity ?? selectedPlan.maxCapacity ?? ''}
                      onChange={(e) => setCustomMaxCapacity(Number(e.target.value) || undefined)}
                      min={1}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">名</span>
                    {customMaxCapacity !== undefined && customMaxCapacity !== selectedPlan.maxCapacity && (
                      <button
                        type="button"
                        onClick={() => setCustomMaxCapacity(undefined)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        (デフォルト: {selectedPlan.maxCapacity}名に戻す)
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    この回だけ定員を変更できます
                  </p>
                </div>
              )}
            </div>
          )}

          {/* メモ入力（新規予約の場合のみ） */}
          {!isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メモ（任意）
              </label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="予約に関するメモを入力"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          {/* 支払いステータス選択（新規予約の場合のみ） */}
          {!isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                支払いステータス
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('unpaid')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    paymentStatus === 'unpaid'
                      ? 'bg-orange-100 border-orange-400 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  未払い
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    paymentStatus === 'paid'
                      ? 'bg-green-100 border-green-400 text-green-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  支払い済み
                </button>
              </div>
            </div>
          )}

          {/* 表示色選択（新規予約の場合のみ） */}
          {!isAddingToExistingSlot && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                表示色（任意）
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setDisplayColor(preset.value)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      displayColor === preset.value
                        ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                        : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setDisplayColor(undefined)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                    !displayColor
                      ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                      : 'border-gray-300'
                  } bg-gray-100`}
                  title="デフォルト"
                >
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                タイムラインでの枠の色を指定できます
              </p>
            </div>
          )}

          {/* ボタン */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              閉じる
            </button>
            {isAddingToExistingSlot ? (
              <button
                type="submit"
                disabled={loading || customerCount > availableSlots}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300"
              >
                {loading ? '追加中...' : '予約を追加'}
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || hasNonSlotSession}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? '予約中...' : '予約する'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
