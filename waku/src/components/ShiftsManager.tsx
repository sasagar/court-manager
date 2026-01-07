'use client';

import { useState, useEffect } from 'react';
import { shiftsApi, staffApi, type Shift, type Staff } from '../lib/api-client';
import { formatTimeJST, timeToTimestamp, getTodayJST, getNextDay, getPreviousDay } from '../lib/time-utils';
import { getShiftStatusLabel, getShiftStatusBadgeColor } from '../constants/status';

type ShiftsManagerProps = {
  facilityId: string;
};

export function ShiftsManager({ facilityId }: ShiftsManagerProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getTodayJST());

  // Form state
  const [formData, setFormData] = useState({
    staffId: '',
    date: selectedDate,
    startTime: '09:00',
    endTime: '18:00',
    notes: '',
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [shiftsResult, staffResult] = await Promise.all([
        shiftsApi.list(facilityId, { date: selectedDate }),
        staffApi.list(facilityId),
      ]);
      setShifts(shiftsResult.shifts);
      setStaffList(staffResult.staff);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [facilityId, selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const startTimestamp = timeToTimestamp(formData.startTime, formData.date);
      const endTimestamp = timeToTimestamp(formData.endTime, formData.date);

      if (editingShift) {
        await shiftsApi.update(facilityId, editingShift.id, {
          startTime: startTimestamp,
          endTime: endTimestamp,
          notes: formData.notes || undefined,
        });
      } else {
        await shiftsApi.create(facilityId, {
          staffId: formData.staffId,
          date: formData.date,
          startTime: startTimestamp,
          endTime: endTimestamp,
          notes: formData.notes || undefined,
        });
      }
      setShowForm(false);
      setEditingShift(null);
      setFormData({
        staffId: '',
        date: selectedDate,
        startTime: '09:00',
        endTime: '18:00',
        notes: '',
      });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shift');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormData({
      staffId: shift.staffId,
      date: shift.date,
      startTime: formatTimeJST(shift.startTime),
      endTime: formatTimeJST(shift.endTime),
      notes: shift.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (shift: Shift) => {
    if (!confirm(`${shift.staffName}のシフトを削除しますか？`)) {
      return;
    }
    try {
      await shiftsApi.delete(facilityId, shift.id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete shift');
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
        <h2 className="text-xl font-semibold text-gray-800">シフト管理</h2>
        <button
          onClick={() => {
            setEditingShift(null);
            setFormData({
              staffId: staffList.length > 0 ? staffList[0].id : '',
              date: selectedDate,
              startTime: '09:00',
              endTime: '18:00',
              notes: '',
            });
            setShowForm(true);
          }}
          disabled={staffList.length === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          新規シフト
        </button>
      </div>

      {/* 日付選択 */}
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

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {staffList.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg">
          シフトを作成するには、まずスタッフを登録してください。
        </div>
      )}

      {/* Shift Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingShift ? 'シフトを編集' : '新規シフト'}
            </h3>
            <form onSubmit={handleSubmit}>
              {!editingShift && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    スタッフ *
                  </label>
                  <select
                    value={formData.staffId}
                    onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">選択してください</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  disabled={!!editingShift}
                />
              </div>

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

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="任意のメモ"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingShift(null);
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
                  {formLoading ? '保存中...' : editingShift ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shifts List */}
      {shifts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {selectedDate} のシフトはありません
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <div
              key={shift.id}
              className="flex items-center justify-between p-4 border rounded-lg border-gray-200"
            >
              <div className="flex items-center gap-3">
                {/* スタッフ画像またはカラードット */}
                {shift.staffImageUrl ? (
                  <img
                    src={shift.staffImageUrl}
                    alt={shift.staffName}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border-2"
                    style={{ borderColor: shift.staffColor || '#6B7280' }}
                  />
                ) : (
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: shift.staffColor || '#6B7280' }}
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-800">{shift.staffName}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getShiftStatusBadgeColor(shift.status)}`}>
                      {getShiftStatusLabel(shift.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {formatTimeJST(shift.startTime)} - {formatTimeJST(shift.endTime)}
                    {shift.notes && <span className="ml-2">({shift.notes})</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(shift)}
                  className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(shift)}
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
