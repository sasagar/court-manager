'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFacilitySelection } from '../hooks/useFacilitySelection';
import { usersApi, type CurrentUser, type LinkedStaff } from '../lib/api-client';
import { Header } from './Header';

export function ProfileClient() {
  const { user: authUser, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const {
    facilities,
    selectedFacilityId,
    setSelectedFacilityId,
  } = useFacilitySelection();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchProfile = async () => {
      try {
        const result = await usersApi.getMe();
        setUser(result.user);
        setLinkedStaff(result.staff);
        setFormData({ name: result.user.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [authLoading, isAuthenticated]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      await usersApi.updateMe({ name: formData.name });
      setUser({ ...user, name: formData.name });
      setEditing(false);
      setSuccessMessage('プロファイルを更新しました');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({ name: user.name });
    }
    setEditing(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        user={authUser}
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onFacilityChange={setSelectedFacilityId}
        onSignOut={signOut}
        isConnected={false}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">プロファイル</h1>
          <p className="text-gray-600 mt-1">アカウント情報の確認と編集</p>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          {/* プロファイルヘッダー */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                  {user?.name?.charAt(0) || '?'}
                </div>
                <div>
                  {editing ? (
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="text-xl font-bold text-gray-800 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <h2 className="text-xl font-bold text-gray-800">{user?.name}</h2>
                  )}
                  <p className="text-gray-500">{user?.email}</p>
                </div>
              </div>
              <div>
                {editing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      disabled={saving}
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    編集
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* アカウント情報 */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">アカウント情報</h3>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-gray-500">ユーザーID</dt>
                <dd className="text-gray-900 font-mono text-sm">{user?.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">メールアドレス</dt>
                <dd className="text-gray-900">{user?.email}</dd>
              </div>
            </dl>
          </div>

          {/* スタッフ情報 */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">紐付きスタッフ情報</h3>
            {linkedStaff ? (
              <dl className="space-y-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500">表示名</dt>
                  <dd className="text-gray-900">{linkedStaff.displayName}</dd>
                </div>
                {linkedStaff.employeeId && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">従業員ID</dt>
                    <dd className="text-gray-900">{linkedStaff.employeeId}</dd>
                  </div>
                )}
                {linkedStaff.phone && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">電話番号</dt>
                    <dd className="text-gray-900">{linkedStaff.phone}</dd>
                  </div>
                )}
                {linkedStaff.colorCode && (
                  <div className="flex justify-between items-center">
                    <dt className="text-gray-500">カラー</dt>
                    <dd className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-full border border-gray-300"
                        style={{ backgroundColor: linkedStaff.colorCode }}
                      />
                      <span className="text-gray-900 font-mono text-sm">{linkedStaff.colorCode}</span>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-gray-500">
                スタッフ情報と紐付けられていません。
                <br />
                管理者に連絡してスタッフ情報との紐付けを依頼してください。
              </p>
            )}
          </div>
        </div>

        {/* ナビゲーションリンク */}
        <div className="mt-6 flex gap-4">
          <a
            href="/dashboard"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            ダッシュボードへ
          </a>
          <a
            href="/settings"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            設定へ
          </a>
        </div>
      </main>
    </div>
  );
}
