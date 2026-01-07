'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { setupApi } from '../lib/api-client';

export function SetupClient() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [setupStatus, setSetupStatus] = useState<{
    hasUsers: boolean;
    hasFacilities: boolean;
    isSetupComplete: boolean;
  } | null>(null);
  const [facilityName, setFacilityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await setupApi.getStatus();
        setSetupStatus(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check setup status');
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !facilityName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await setupApi.initialize({
        userId: user.id,
        facilityName: facilityName.trim(),
      });
      setSuccess(true);
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  // Already set up - redirect to dashboard
  if (setupStatus?.isSetupComplete) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">セットアップ完了済み</h1>
          <p className="text-gray-600 mb-8">システムは既にセットアップされています。</p>
          <a
            href="/dashboard"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ダッシュボードへ
          </a>
        </div>
      </main>
    );
  }

  // Not logged in - show signup prompt
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-gray-900 text-center mb-4">
            初期セットアップ
          </h1>
          <p className="text-gray-600 text-center mb-8">
            まず、管理者アカウントを作成してください。
          </p>
          <div className="bg-white shadow-md rounded-lg p-6">
            <p className="text-gray-700 mb-4">
              最初に登録したユーザーが管理者になります。
            </p>
            <a
              href="/login"
              className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              アカウントを作成する
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Logged in but no facility - show facility setup
  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">セットアップ完了!</h1>
          <p className="text-gray-600 mb-4">
            施設、コート、プランが作成されました。
          </p>
          <p className="text-gray-500 text-sm">
            ダッシュボードに移動しています...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-4">
          施設セットアップ
        </h1>
        <p className="text-gray-600 text-center mb-8">
          ようこそ、{user?.name}さん！施設情報を設定しましょう。
        </p>

        <form onSubmit={handleSetup} className="bg-white shadow-md rounded-lg px-8 py-6">
          <div className="mb-6">
            <label htmlFor="facilityName" className="block text-gray-700 text-sm font-medium mb-2">
              施設名 *
            </label>
            <input
              type="text"
              id="facilityName"
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              placeholder="例: HADO ARENA 渋谷"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              この名前がダッシュボードに表示されます
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !facilityName.trim()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          >
            {submitting ? 'セットアップ中...' : 'セットアップを完了する'}
          </button>

          <p className="mt-4 text-sm text-gray-500 text-center">
            デフォルトで3つのコートと3つのプランが作成されます。
            後から設定画面で変更できます。
          </p>
        </form>
      </div>
    </main>
  );
}
