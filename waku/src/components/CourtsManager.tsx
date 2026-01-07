'use client';

import { useState, useEffect } from 'react';
import { courtsApi, type Court, type CreateCourtInput } from '../lib/api-client';

type CourtsManagerProps = {
  facilityId: string;
};

export function CourtsManager({ facilityId }: CourtsManagerProps) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateCourtInput>({
    name: '',
    sortOrder: 0,
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchCourts = async () => {
    try {
      const result = await courtsApi.list(facilityId, includeInactive);
      setCourts(result.courts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourts();
  }, [facilityId, includeInactive]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingCourt) {
        await courtsApi.update(facilityId, editingCourt.id, formData);
      } else {
        await courtsApi.create(facilityId, formData);
      }
      setShowForm(false);
      setEditingCourt(null);
      setFormData({ name: '', sortOrder: 0 });
      fetchCourts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save court');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (court: Court) => {
    setEditingCourt(court);
    setFormData({
      name: court.name,
      sortOrder: court.sortOrder,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (court: Court) => {
    try {
      await courtsApi.update(facilityId, court.id, { isActive: !court.isActive });
      fetchCourts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update court');
    }
  };

  const handleDelete = async (court: Court) => {
    if (!confirm(`「${court.name}」を削除しますか？\n※使用履歴がある場合は無効化されます`)) {
      return;
    }
    try {
      const result = await courtsApi.delete(facilityId, court.id);
      if (result.deactivated) {
        setError(null);
        alert('使用履歴があるため無効化しました');
      }
      fetchCourts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete court');
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">コート管理</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            無効なコートも表示
          </label>
          <button
            onClick={() => {
              setEditingCourt(null);
              setFormData({ name: '', sortOrder: 0 });
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            新規コート
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Court Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingCourt ? 'コートを編集' : '新規コート'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  コート名 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: コートA"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  並び順
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({ ...formData, sortOrder: Number(e.target.value) })
                  }
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCourt(null);
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
                  {formLoading ? '保存中...' : editingCourt ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Courts List */}
      {courts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          コートが登録されていません
        </div>
      ) : (
        <div className="space-y-3">
          {courts.map((court) => (
            <div
              key={court.id}
              className={`flex items-center justify-between p-4 border rounded-lg ${
                court.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-800">{court.name}</h3>
                  {!court.isActive && (
                    <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                      無効
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  並び順: {court.sortOrder}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(court)}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    court.isActive
                      ? 'text-yellow-600 border border-yellow-300 hover:bg-yellow-50'
                      : 'text-green-600 border border-green-300 hover:bg-green-50'
                  }`}
                >
                  {court.isActive ? '無効化' : '有効化'}
                </button>
                <button
                  onClick={() => handleEdit(court)}
                  className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(court)}
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
