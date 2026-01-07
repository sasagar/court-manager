'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFacilitySelection } from '../hooks/useFacilitySelection';
import type { Facility } from '../lib/api-client';
import { Header } from './Header';
import { PlansManager } from './PlansManager';
import { CourtsManager } from './CourtsManager';
import { FacilityManager } from './FacilityManager';
import { AddFacilityModal } from './AddFacilityModal';
import { StaffManager } from './StaffManager';
import { CourtBlocksManager } from './CourtBlocksManager';
import { UsersManager } from './UsersManager';

type TabType = 'facility' | 'plans' | 'staff' | 'courts' | 'blocks' | 'users';

export function SettingsClient() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();
  const {
    facilities,
    selectedFacilityId,
    selectedFacility,
    setSelectedFacilityId,
    loading: facilitiesLoading,
    error: facilitiesError,
    refetch: _refetchFacilities,
  } = useFacilitySelection();
  // ローカルで施設リストを管理（追加・更新時のため）
  const [localFacilities, setLocalFacilities] = useState<Facility[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('plans');
  const [showAddFacilityModal, setShowAddFacilityModal] = useState(false);

  // フック取得の施設リストをローカルにコピー
  useEffect(() => {
    setLocalFacilities(facilities);
  }, [facilities]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || facilitiesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (facilitiesError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">{facilitiesError}</div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'plans', label: 'プラン' },
    { id: 'courts', label: 'コート' },
    { id: 'blocks', label: 'ブロック' },
    { id: 'staff', label: 'スタッフ' },
    { id: 'users', label: 'ユーザー' },
    { id: 'facility', label: '施設' },
  ];

  // 施設情報が更新されたときにリストを更新
  const handleFacilityUpdated = (updatedFacility: Facility) => {
    setLocalFacilities((prev) =>
      prev.map((f) => (f.id === updatedFacility.id ? { ...f, ...updatedFacility } : f))
    );
  };

  // 施設が追加されたときにリストを更新
  const handleFacilityAdded = (newFacility: { id: string; name: string; slug: string }) => {
    const facility: Facility = {
      id: newFacility.id,
      name: newFacility.name,
      role: 'admin',
    };
    setLocalFacilities((prev) => [...prev, facility]);
    setSelectedFacilityId(newFacility.id);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        user={user}
        facilities={localFacilities}
        selectedFacilityId={selectedFacilityId}
        onFacilityChange={setSelectedFacilityId}
        onSignOut={signOut}
        isConnected={false}
      />

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">設定</h1>
            <p className="text-gray-600 mt-1">施設の各種設定を管理します</p>
          </div>
          <button
            onClick={() => setShowAddFacilityModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            施設を追加
          </button>
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
          <div>
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="-mb-px flex space-x-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'facility' && (
              <FacilityManager
                facilityId={selectedFacilityId!}
                onFacilityUpdated={handleFacilityUpdated}
              />
            )}
            {activeTab === 'plans' && (
              <PlansManager facilityId={selectedFacilityId!} />
            )}
            {activeTab === 'staff' && (
              <StaffManager facilityId={selectedFacilityId!} />
            )}
            {activeTab === 'courts' && (
              <CourtsManager facilityId={selectedFacilityId!} />
            )}
            {activeTab === 'blocks' && (
              <CourtBlocksManager facilityId={selectedFacilityId!} />
            )}
            {activeTab === 'users' && (
              <UsersManager facilityId={selectedFacilityId!} />
            )}
          </div>
        )}
      </main>

      {showAddFacilityModal && (
        <AddFacilityModal
          onClose={() => setShowAddFacilityModal(false)}
          onFacilityAdded={handleFacilityAdded}
        />
      )}
    </div>
  );
}
