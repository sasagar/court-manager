'use client';

import { useState, useEffect } from 'react';
import { facilitiesApi, type Facility } from '../lib/api-client';

type FacilityManagerProps = {
  facilityId: string;
  onFacilityUpdated?: (facility: Facility) => void;
};

export function FacilityManager({ facilityId, onFacilityUpdated }: FacilityManagerProps) {
  const [facility, setFacility] = useState<Facility | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [businessStartHour, setBusinessStartHour] = useState(9);
  const [businessEndHour, setBusinessEndHour] = useState(22);

  useEffect(() => {
    const fetchFacility = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await facilitiesApi.get(facilityId);
        setFacility(result.facility);
        setUserRole(result.userRole);
        setName(result.facility.name);
        setAddress(result.facility.address || '');
        setBusinessStartHour(result.facility.businessStartHour ?? 9);
        setBusinessEndHour(result.facility.businessEndHour ?? 22);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load facility');
      } finally {
        setLoading(false);
      }
    };
    fetchFacility();
  }, [facilityId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('施設名を入力してください');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await facilitiesApi.update(facilityId, {
        name: name.trim(),
        address: address.trim() || undefined,
        businessStartHour,
        businessEndHour,
      });

      // Update local state
      const updatedFacility = {
        ...facility!,
        name: name.trim(),
        address: address.trim() || undefined,
        businessStartHour,
        businessEndHour,
      };
      setFacility(updatedFacility);
      setSuccess('施設情報を更新しました');

      // Notify parent
      onFacilityUpdated?.(updatedFacility);

      // Clear success message after a few seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = userRole === 'admin';

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="text-red-500">施設情報を取得できませんでした</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">施設情報</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      {!isAdmin && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm">
          施設情報の編集には管理者権限が必要です
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            施設名 *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            placeholder="施設名を入力"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            住所
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!isAdmin}
            placeholder="住所を入力（任意）"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            営業時間
          </label>
          <div className="flex items-center gap-2">
            <select
              value={businessStartHour}
              onChange={(e) => setBusinessStartHour(Number(e.target.value))}
              disabled={!isAdmin}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i}:00
                </option>
              ))}
            </select>
            <span className="text-gray-500">〜</span>
            <select
              value={businessEndHour}
              onChange={(e) => setBusinessEndHour(Number(e.target.value))}
              disabled={!isAdmin}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i}:00
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            タイムライン表示の時間範囲を設定します
          </p>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">施設ID:</span>
              <code className="text-xs bg-gray-200 px-2 py-0.5 rounded">{facility.id}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">あなたの権限:</span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                userRole === 'admin'
                  ? 'bg-purple-100 text-purple-700'
                  : userRole === 'staff'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {userRole === 'admin' ? '管理者' : userRole === 'staff' ? 'スタッフ' : '閲覧者'}
              </span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
