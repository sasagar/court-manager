'use client';

import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFacilitySelection } from '../hooks/useFacilitySelection';
import { Header } from './Header';
import { ShiftsManager } from './ShiftsManager';

export function ShiftsPageClient() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const {
    facilities,
    selectedFacilityId,
    selectedFacility,
    setSelectedFacilityId,
    loading,
    error,
  } = useFacilitySelection();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
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

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        user={user}
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onFacilityChange={setSelectedFacilityId}
        onSignOut={signOut}
        isConnected={false}
      />

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">シフト管理</h1>
          <p className="text-gray-600 mt-1">スタッフのシフトを管理します</p>
        </div>

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
          <ShiftsManager facilityId={selectedFacilityId!} />
        )}
      </main>
    </div>
  );
}
