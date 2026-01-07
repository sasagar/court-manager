'use client';

import { useState, useEffect } from 'react';
import { plansApi, sessionsApi, type Plan } from '../lib/api-client';

type CreateSlotModalProps = {
  facilityId: string;
  courtId: string;
  courtName: string;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateSlotModal({
  facilityId,
  courtId,
  courtName,
  onClose,
  onCreated,
}: CreateSlotModalProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [maxCapacity, setMaxCapacity] = useState<number | undefined>(undefined);

  // 枠プランのみを取得
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const result = await plansApi.list(facilityId);
        const slotPlans = result.plans.filter((p) => p.isSlotBased);
        setPlans(slotPlans);
        if (slotPlans.length > 0) {
          setSelectedPlanId(slotPlans[0].id);
          setMaxCapacity(slotPlans[0].maxCapacity);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plans');
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, [facilityId]);

  // プラン変更時にmaxCapacityを更新
  useEffect(() => {
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (plan) {
      setMaxCapacity(plan.maxCapacity);
    }
  }, [selectedPlanId, plans]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlanId) {
      setError('プランを選択してください');
      return;
    }
    if (!startTime) {
      setError('開始時間を入力してください');
      return;
    }

    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) {
      setError('プランが見つかりません');
      return;
    }

    // 開始時間をUnixタイムスタンプに変換
    const today = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    const startTimestamp = Math.floor(today.getTime() / 1000);

    // 終了時間を計算
    const estimatedEndTime = startTimestamp + plan.durationMinutes * 60;

    setSubmitting(true);
    try {
      await sessionsApi.createSlot(facilityId, courtId, {
        planId: selectedPlanId,
        startTime: startTimestamp,
        estimatedEndTime,
        maxCapacity,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create slot');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}分`;
    if (mins === 0) return `${hours}時間`;
    return `${hours}時間${mins}分`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold mb-4">枠プランがありません</h3>
          <p className="text-gray-600 mb-4">
            枠を作成するには、まず「枠プラン」を作成してください。
            設定画面のプラン管理から新規プランを作成し、「枠プラン」にチェックを入れてください。
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          枠を作成 - {courtName}
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              プラン *
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({formatDuration(plan.durationMinutes)} / 定員{plan.maxCapacity}名)
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開始時間 *
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              定員
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={maxCapacity || ''}
                onChange={(e) => setMaxCapacity(Number(e.target.value) || undefined)}
                min={1}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">名</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              プランのデフォルト定員: {selectedPlan?.maxCapacity || '-'}名
            </p>
          </div>

          {selectedPlan && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">{selectedPlan.name}</span>
                <br />
                時間: {formatDuration(selectedPlan.durationMinutes)}
                {selectedPlan.description && (
                  <>
                    <br />
                    {selectedPlan.description}
                  </>
                )}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {submitting ? '作成中...' : '枠を作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
