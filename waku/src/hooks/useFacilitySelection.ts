/**
 * 施設選択フック
 *
 * localStorageベースの施設選択状態を管理
 *
 * @module hooks/useFacilitySelection
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { facilitiesApi, type Facility } from '../lib/api-client';

const STORAGE_KEY = 'selectedFacilityId';

export interface UseFacilitySelectionReturn {
  /** 施設一覧 */
  facilities: Facility[];
  /** 選択中の施設ID */
  selectedFacilityId: string | null;
  /** 選択中の施設オブジェクト */
  selectedFacility: Facility | undefined;
  /** 施設IDを変更 */
  setSelectedFacilityId: (id: string | null) => void;
  /** 施設読み込み中 */
  loading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** 施設一覧を再取得 */
  refetch: () => Promise<void>;
}

/**
 * 施設選択を管理するカスタムフック
 *
 * - localStorageから選択を復元
 * - 施設変更時にlocalStorageへ保存
 * - 施設一覧の取得
 *
 * @returns 施設選択状態と操作関数
 *
 * @example
 * const {
 *   facilities,
 *   selectedFacilityId,
 *   selectedFacility,
 *   setSelectedFacilityId,
 *   loading
 * } = useFacilitySelection();
 */
export function useFacilitySelection(): UseFacilitySelectionReturn {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 施設一覧を取得
  const fetchFacilities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await facilitiesApi.list();
      setFacilities(result.facilities);

      if (result.facilities.length > 0) {
        // localStorageから保存された施設IDを復元
        const savedFacilityId = localStorage.getItem(STORAGE_KEY);
        const facilityExists = result.facilities.some((f) => f.id === savedFacilityId);
        setSelectedFacilityIdState(facilityExists ? savedFacilityId : result.facilities[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load facilities');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  // 施設ID変更ハンドラ（localStorageにも保存）
  const setSelectedFacilityId = useCallback((id: string | null) => {
    setSelectedFacilityIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // 選択中の施設オブジェクト
  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId);

  return {
    facilities,
    selectedFacilityId,
    selectedFacility,
    setSelectedFacilityId,
    loading,
    error,
    refetch: fetchFacilities,
  };
}
