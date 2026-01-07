'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { publicViewApi } from '../lib/api-client';

type Props = {
  facilityId: string;
  facilityName: string;
  isOpen: boolean;
  onClose: () => void;
};

export function QRCodeModal({ facilityId, facilityName, isOpen, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicViewApi.getToken(facilityId);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'トークンの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicViewApi.generateToken(facilityId);
      setToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'トークンの生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async () => {
    if (!confirm('QRコードを無効化しますか？\n既存のリンクからはアクセスできなくなります。')) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await publicViewApi.revokeToken(facilityId);
      setToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'トークンの無効化に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchToken();
    }
  }, [isOpen, facilityId]);

  if (!isOpen) return null;

  const publicUrl = token
    ? `${window.location.origin}/view/${token}`
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">公開ビューQRコード</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">読み込み中...</p>
            </div>
          ) : token && publicUrl ? (
            <div className="text-center">
              {/* QRコード */}
              <div className="bg-white p-4 rounded-lg inline-block border">
                <QRCodeSVG
                  value={publicUrl}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
              </div>

              {/* 施設名 */}
              <p className="mt-4 text-lg font-medium text-gray-900">{facilityName}</p>
              <p className="text-sm text-gray-500 mt-1">本日のスケジュールを確認できます</p>

              {/* URL */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">公開URL</p>
                <p className="text-xs text-blue-600 break-all">{publicUrl}</p>
              </div>

              {/* アクションボタン */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    alert('URLをコピーしました');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  URLをコピー
                </button>
                <button
                  onClick={generateToken}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  QRコードを再生成
                </button>
                <button
                  onClick={revokeToken}
                  className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  QRコードを無効化
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <p className="text-gray-600 mb-6">
                QRコードを生成して、スマートフォンから<br />
                本日のスケジュールを確認できます
              </p>
              <button
                onClick={generateToken}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 mx-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                QRコードを生成
              </button>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            このQRコードをスキャンすると、ログインなしで<br />
            本日のコート状況とスタッフ情報を確認できます
          </p>
        </div>
      </div>
    </div>
  );
}
