'use client';

import { useState, useEffect } from 'react';
import {
  courtBlocksApi,
  courtsApi,
  type CourtBlock,
  type CreateCourtBlockInput,
  type Court,
} from '../lib/api-client';
import { formatTimeJST, timeToTimestamp, getTodayJST, getNextDay, getPreviousDay } from '../lib/time-utils';

type CourtBlocksManagerProps = {
  facilityId: string;
};

const DAY_OF_WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 繰り返しブロック用の今日の日付でタイムスタンプを生成
const recurringTimeToTimestamp = (timeStr: string): number => {
  return timeToTimestamp(timeStr, getTodayJST());
};

export function CourtBlocksManager({ facilityId }: CourtBlocksManagerProps) {
  const [blocks, setBlocks] = useState<CourtBlock[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<CourtBlock | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getTodayJST());
  const [viewMode, setViewMode] = useState<'date' | 'recurring'>('date');

  // Form state
  const [formData, setFormData] = useState({
    courtId: '',
    isRecurring: false,
    date: selectedDate,
    dayOfWeek: 0,
    startTime: '09:00',
    endTime: '10:00',
    reason: '',
    blockType: 'manual' as 'manual' | 'maintenance' | 'closed',
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [blocksResult, courtsResult] = await Promise.all([
        viewMode === 'date'
          ? courtBlocksApi.list(facilityId, { date: selectedDate })
          : courtBlocksApi.list(facilityId, { includeRecurring: true }),
        courtsApi.list(facilityId),
      ]);

      // 繰り返しブロックのみをフィルタリング（viewMode === 'recurring' の場合）
      const filteredBlocks =
        viewMode === 'recurring'
          ? blocksResult.blocks.filter((b) => !b.date)
          : blocksResult.blocks;

      setBlocks(filteredBlocks);
      setCourts(courtsResult.courts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [facilityId, selectedDate, viewMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const data: CreateCourtBlockInput = {
        courtId: formData.courtId || undefined,
        startTime: formData.isRecurring
          ? recurringTimeToTimestamp(formData.startTime)
          : timeToTimestamp(formData.startTime, formData.date),
        endTime: formData.isRecurring
          ? recurringTimeToTimestamp(formData.endTime)
          : timeToTimestamp(formData.endTime, formData.date),
        reason: formData.reason || undefined,
        blockType: formData.blockType,
      };

      if (formData.isRecurring) {
        data.dayOfWeek = formData.dayOfWeek;
      } else {
        data.date = formData.date;
      }

      if (editingBlock) {
        await courtBlocksApi.update(facilityId, editingBlock.id, data);
      } else {
        await courtBlocksApi.create(facilityId, data);
      }
      setShowForm(false);
      setEditingBlock(null);
      resetForm();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save block');
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      courtId: '',
      isRecurring: viewMode === 'recurring',
      date: selectedDate,
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '10:00',
      reason: '',
      blockType: 'manual',
    });
  };

  const handleEdit = (block: CourtBlock) => {
    setEditingBlock(block);
    setFormData({
      courtId: block.courtId || '',
      isRecurring: !block.date,
      date: block.date || selectedDate,
      dayOfWeek: block.dayOfWeek ?? 0,
      startTime: formatTimeJST(block.startTime),
      endTime: formatTimeJST(block.endTime),
      reason: block.reason || '',
      blockType: block.blockType,
    });
    setShowForm(true);
  };

  const handleDelete = async (block: CourtBlock) => {
    if (!confirm('このブロックを削除しますか？')) {
      return;
    }
    try {
      await courtBlocksApi.delete(facilityId, block.id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete block');
    }
  };

  const getBlockTypeLabel = (blockType: string) => {
    switch (blockType) {
      case 'manual':
        return '手動';
      case 'maintenance':
        return 'メンテナンス';
      case 'closed':
        return '営業時間外';
      default:
        return blockType;
    }
  };

  const getBlockTypeBadgeClass = (blockType: string) => {
    switch (blockType) {
      case 'manual':
        return 'bg-gray-100 text-gray-700';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-700';
      case 'closed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // 日付を前後に移動
  const changeDate = (days: number) => {
    if (days > 0) {
      setSelectedDate(getNextDay(selectedDate));
    } else if (days < 0) {
      setSelectedDate(getPreviousDay(selectedDate));
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">コートブロック管理</h2>
        <button
          onClick={() => {
            setEditingBlock(null);
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          新規ブロック
        </button>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('date')}
          className={`px-4 py-2 text-sm rounded-lg ${
            viewMode === 'date'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          日付指定
        </button>
        <button
          onClick={() => setViewMode('recurring')}
          className={`px-4 py-2 text-sm rounded-lg ${
            viewMode === 'recurring'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          繰り返し（曜日）
        </button>
      </div>

      {/* 日付選択（日付指定モード） */}
      {viewMode === 'date' && (
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => changeDate(-1)}
            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => changeDate(1)}
            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setSelectedDate(getTodayJST())}
            className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            今日
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Block Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingBlock ? 'ブロックを編集' : '新規ブロック'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  対象コート
                </label>
                <select
                  value={formData.courtId}
                  onChange={(e) => setFormData({ ...formData, courtId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全コート</option>
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isRecurring}
                    onChange={(e) =>
                      setFormData({ ...formData, isRecurring: e.target.checked })
                    }
                    className="rounded border-gray-300"
                    disabled={!!editingBlock}
                  />
                  繰り返し（毎週）
                </label>
              </div>

              {formData.isRecurring ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    曜日 *
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) =>
                      setFormData({ ...formData, dayOfWeek: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DAY_OF_WEEK_LABELS.map((label, i) => (
                      <option key={i} value={i}>
                        {label}曜日
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    日付 *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    開始時間 *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    終了時間 *
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ブロック種別
                </label>
                <select
                  value={formData.blockType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      blockType: e.target.value as 'manual' | 'maintenance' | 'closed',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="manual">手動</option>
                  <option value="maintenance">メンテナンス</option>
                  <option value="closed">営業時間外</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  理由
                </label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="例: 設備点検"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingBlock(null);
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {formLoading ? '保存中...' : editingBlock ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Blocks List */}
      {blocks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {viewMode === 'date'
            ? `${selectedDate} のブロックはありません`
            : '繰り返しブロックはありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between p-4 border rounded-lg border-gray-200"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">
                    {block.courtName || '全コート'}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${getBlockTypeBadgeClass(
                      block.blockType
                    )}`}
                  >
                    {getBlockTypeLabel(block.blockType)}
                  </span>
                  {!block.date && block.dayOfWeek !== undefined && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                      毎週{DAY_OF_WEEK_LABELS[block.dayOfWeek]}曜
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {block.date && <span className="mr-2">{block.date}</span>}
                  {formatTimeJST(block.startTime)} - {formatTimeJST(block.endTime)}
                  {block.reason && <span className="ml-2">({block.reason})</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(block)}
                  className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(block)}
                  className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
