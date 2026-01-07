'use client';

import { useState, useEffect } from 'react';
import {
  plansApi,
  planOptionsApi,
  optionGroupsApi,
  type Plan,
  type CreatePlanInput,
  type PlanOption,
  type CreatePlanOptionInput,
  type OptionGroup,
  type CreateOptionGroupInput,
} from '../lib/api-client';
import { COLOR_PRESETS } from '../constants/colors';

type PlansManagerProps = {
  facilityId: string;
};

export function PlansManager({ facilityId }: PlansManagerProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  // オプション管理用state
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [optionsPlan, setOptionsPlan] = useState<Plan | null>(null);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [ungroupedOptions, setUngroupedOptions] = useState<PlanOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // グループフォーム用state
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState<CreateOptionGroupInput>({
    name: '',
    selectionType: 'single',
    maxSelections: null,
    isRequired: false,
  });

  // オプションフォーム用state
  const [showOptionForm, setShowOptionForm] = useState(false);
  const [editingOption, setEditingOption] = useState<PlanOption | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [optionFormData, setOptionFormData] = useState<CreatePlanOptionInput>({
    name: '',
    description: '',
    isRequired: false,
    allowMultiple: true,
    groupId: null,
  });

  // Form state
  const [formData, setFormData] = useState<CreatePlanInput>({
    name: '',
    shortName: '',
    durationMinutes: 60,
    description: '',
    isSlotBased: false,
    maxCapacity: undefined,
    colorCode: undefined,
  });

  const [formLoading, setFormLoading] = useState(false);

  const fetchPlans = async () => {
    try {
      const result = await plansApi.list(facilityId, includeInactive);
      setPlans(result.plans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [facilityId, includeInactive]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingPlan) {
        await plansApi.update(facilityId, editingPlan.id, formData);
      } else {
        await plansApi.create(facilityId, formData);
      }
      setShowForm(false);
      setEditingPlan(null);
      setFormData({ name: '', shortName: '', durationMinutes: 60, description: '', isSlotBased: false, maxCapacity: undefined, colorCode: undefined });
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      shortName: plan.shortName || '',
      durationMinutes: plan.durationMinutes,
      description: plan.description || '',
      isSlotBased: plan.isSlotBased,
      maxCapacity: plan.maxCapacity,
      colorCode: plan.colorCode,
    });
    setShowForm(true);
  };

  const handleDeactivate = async (planId: string) => {
    if (!confirm('このプランを無効化しますか？\n無効化したプランは予約時に表示されなくなりますが、データは保持されます。')) return;

    try {
      await plansApi.deactivate(facilityId, planId);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate plan');
    }
  };

  const handleActivate = async (planId: string) => {
    try {
      await plansApi.activate(facilityId, planId);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate plan');
    }
  };

  const handlePermanentDelete = async (planId: string) => {
    if (!confirm('このプランを完全に削除しますか？\n\nこの操作は取り消せません。過去の予約履歴がある場合は削除できません。')) return;

    try {
      const result = await plansApi.delete(facilityId, planId);
      if (result.deleted) {
        fetchPlans();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete plan';
      setError(message);
      alert(`削除できませんでした: ${message}`);
    }
  };

  const handleDuplicate = async (plan: Plan) => {
    try {
      await plansApi.duplicate(facilityId, plan.id);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate plan');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newPlans = [...plans];
    [newPlans[index - 1], newPlans[index]] = [newPlans[index], newPlans[index - 1]];
    setPlans(newPlans);
    try {
      await plansApi.reorder(facilityId, newPlans.map((p) => p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder plans');
      fetchPlans(); // 失敗時は元に戻す
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === plans.length - 1) return;
    const newPlans = [...plans];
    [newPlans[index], newPlans[index + 1]] = [newPlans[index + 1], newPlans[index]];
    setPlans(newPlans);
    try {
      await plansApi.reorder(facilityId, newPlans.map((p) => p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder plans');
      fetchPlans(); // 失敗時は元に戻す
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}分`;
    if (mins === 0) return `${hours}時間`;
    return `${hours}時間${mins}分`;
  };

  // オプション管理関数
  const fetchOptionsAndGroups = async (planId: string) => {
    setOptionsLoading(true);
    try {
      const result = await optionGroupsApi.list(facilityId, planId, true);
      setOptionGroups(result.groups);
      setUngroupedOptions(result.ungroupedOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load options');
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleOpenOptions = async (plan: Plan) => {
    setOptionsPlan(plan);
    setShowOptionsModal(true);
    await fetchOptionsAndGroups(plan.id);
  };

  const handleCloseOptions = () => {
    setShowOptionsModal(false);
    setOptionsPlan(null);
    setOptionGroups([]);
    setUngroupedOptions([]);
    setShowOptionForm(false);
    setEditingOption(null);
    setShowGroupForm(false);
    setEditingGroup(null);
  };

  // グループ管理関数
  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionsPlan) return;

    try {
      if (editingGroup) {
        await optionGroupsApi.update(facilityId, optionsPlan.id, editingGroup.id, groupFormData);
      } else {
        await optionGroupsApi.create(facilityId, optionsPlan.id, groupFormData);
      }
      setShowGroupForm(false);
      setEditingGroup(null);
      setGroupFormData({ name: '', selectionType: 'single', maxSelections: null, isRequired: false });
      await fetchOptionsAndGroups(optionsPlan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    }
  };

  const handleEditGroup = (group: OptionGroup) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      selectionType: group.selectionType,
      maxSelections: group.maxSelections,
      isRequired: group.isRequired,
    });
    setShowGroupForm(true);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!optionsPlan || !confirm('このグループを削除しますか？\nグループ内のオプションは「その他」に移動されます。')) return;

    try {
      await optionGroupsApi.delete(facilityId, optionsPlan.id, groupId);
      await fetchOptionsAndGroups(optionsPlan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleOptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionsPlan) return;

    try {
      const dataToSubmit = { ...optionFormData, groupId: targetGroupId };
      if (editingOption) {
        await planOptionsApi.update(facilityId, optionsPlan.id, editingOption.id, dataToSubmit);
      } else {
        await planOptionsApi.create(facilityId, optionsPlan.id, dataToSubmit);
      }
      setShowOptionForm(false);
      setEditingOption(null);
      setTargetGroupId(null);
      setOptionFormData({ name: '', description: '', isRequired: false, allowMultiple: true, groupId: null });
      await fetchOptionsAndGroups(optionsPlan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save option');
    }
  };

  const handleAddOptionToGroup = (groupId: string | null) => {
    setTargetGroupId(groupId);
    setEditingOption(null);
    setOptionFormData({ name: '', description: '', isRequired: false, allowMultiple: true, groupId: groupId });
    setShowOptionForm(true);
  };

  const handleEditOption = (option: PlanOption) => {
    setEditingOption(option);
    setTargetGroupId(option.groupId || null);
    setOptionFormData({
      name: option.name,
      description: option.description || '',
      isRequired: option.isRequired,
      allowMultiple: option.allowMultiple,
      groupId: option.groupId || null,
    });
    setShowOptionForm(true);
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!optionsPlan || !confirm('このオプションを削除しますか？')) return;

    try {
      await planOptionsApi.delete(facilityId, optionsPlan.id, optionId);
      await fetchOptionsAndGroups(optionsPlan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete option');
    }
  };

  const handleToggleOptionActive = async (option: PlanOption) => {
    if (!optionsPlan) return;

    try {
      await planOptionsApi.update(facilityId, optionsPlan.id, option.id, { isActive: !option.isActive });
      await fetchOptionsAndGroups(optionsPlan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update option');
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-gray-500">読み込み中...</div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">プラン管理</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            無効なプランも表示
          </label>
          <button
            onClick={() => {
              setEditingPlan(null);
              setFormData({ name: '', shortName: '', durationMinutes: 60, description: '', isSlotBased: false, maxCapacity: undefined, colorCode: undefined });
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            新規プラン
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Plan Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingPlan ? 'プランを編集' : '新規プラン'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プラン名 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  短縮名
                </label>
                <input
                  type="text"
                  value={formData.shortName || ''}
                  onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                  placeholder="例: HADO, 1h"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  タイムライン表示用の短い名称（省略可）
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  時間（分） *
                </label>
                <input
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, durationMinutes: Number(e.target.value) })
                  }
                  min={1}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 枠プラン設定 */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={formData.isSlotBased || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      isSlotBased: e.target.checked,
                      maxCapacity: e.target.checked ? (formData.maxCapacity || 8) : undefined
                    })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">枠プラン</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  枠プランは1つの時間枠に複数の予約を受け付けることができます
                </p>

                {formData.isSlotBased && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      定員 *
                    </label>
                    <input
                      type="number"
                      value={formData.maxCapacity || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, maxCapacity: Number(e.target.value) || undefined })
                      }
                      min={1}
                      placeholder="例: 8"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={formData.isSlotBased}
                    />
                    <span className="ml-2 text-sm text-gray-600">名</span>
                  </div>
                )}
              </div>

              {/* 表示色設定 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  表示色
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, colorCode: preset.value })}
                      className={`w-8 h-8 rounded-full border-2 ${
                        formData.colorCode === preset.value
                          ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                          : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, colorCode: undefined })}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                      !formData.colorCode
                        ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                        : 'border-gray-300'
                    } bg-gray-100`}
                    title="デフォルト"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  タイムラインでの枠の表示色を指定できます
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPlan(null);
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
                  {formLoading ? '保存中...' : editingPlan ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plans List */}
      {plans.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          プランが登録されていません
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`flex items-center justify-between p-4 border rounded-lg ${
                plan.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {plan.colorCode && (
                    <div
                      className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                      style={{ backgroundColor: plan.colorCode }}
                      title={`表示色: ${plan.colorCode}`}
                    />
                  )}
                  <h3 className="font-medium text-gray-800">{plan.name}</h3>
                  {plan.shortName && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                      短縮: {plan.shortName}
                    </span>
                  )}
                  {plan.isSlotBased && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                      枠プラン（定員{plan.maxCapacity}名）
                    </span>
                  )}
                  {!plan.isActive && (
                    <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                      無効
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  <span>{formatDuration(plan.durationMinutes)}</span>
                </div>
                {plan.description && (
                  <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* 並び替えボタン */}
                <div className="flex flex-col gap-0.5 mr-2">
                  <button
                    onClick={() => handleMoveUp(plans.indexOf(plan))}
                    disabled={plans.indexOf(plan) === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="上へ移動"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(plans.indexOf(plan))}
                    disabled={plans.indexOf(plan) === plans.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="下へ移動"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {/* オプション管理ボタン（枠プランでない場合のみ） */}
                {!plan.isSlotBased && (
                  <button
                    onClick={() => handleOpenOptions(plan)}
                    className="px-3 py-1 text-sm text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50"
                  >
                    オプション
                  </button>
                )}
                <button
                  onClick={() => handleDuplicate(plan)}
                  className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  title="プランを複製"
                >
                  複製
                </button>
                {plan.isActive ? (
                  <button
                    onClick={() => handleDeactivate(plan.id)}
                    className="px-3 py-1 text-sm text-yellow-600 border border-yellow-300 rounded-lg hover:bg-yellow-50"
                    title="予約時に表示されなくなります"
                  >
                    無効化
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivate(plan.id)}
                    className="px-3 py-1 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50"
                  >
                    有効化
                  </button>
                )}
                <button
                  onClick={() => handleEdit(plan)}
                  className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                >
                  編集
                </button>
                <button
                  onClick={() => handlePermanentDelete(plan.id)}
                  className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                  title="完全に削除（履歴がある場合は削除不可）"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Options Modal */}
      {showOptionsModal && optionsPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {optionsPlan.name} のオプション管理
              </h3>
              <button
                onClick={handleCloseOptions}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              グループを作成し、その中にオプションを追加できます。グループごとに単一選択/複数選択を設定できます。
            </p>

            {/* Group Form */}
            {showGroupForm && (
              <form onSubmit={handleGroupSubmit} className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium mb-3 text-blue-800">
                  {editingGroup ? 'グループを編集' : '新規グループ'}
                </h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    グループ名 *
                  </label>
                  <input
                    type="text"
                    value={groupFormData.name}
                    onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                    placeholder="例: ゲーム種類, 装備"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    選択タイプ
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="selectionType"
                        value="single"
                        checked={groupFormData.selectionType === 'single'}
                        onChange={() => setGroupFormData({ ...groupFormData, selectionType: 'single', maxSelections: null })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">単一選択（1つだけ選択）</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="selectionType"
                        value="multiple"
                        checked={groupFormData.selectionType === 'multiple'}
                        onChange={() => setGroupFormData({ ...groupFormData, selectionType: 'multiple' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">複数選択</span>
                    </label>
                  </div>
                </div>

                {groupFormData.selectionType === 'multiple' && (
                  <div className="mb-3 ml-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      選択上限数
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={groupFormData.maxSelections || ''}
                        onChange={(e) => setGroupFormData({
                          ...groupFormData,
                          maxSelections: e.target.value ? Number(e.target.value) : null
                        })}
                        min={1}
                        placeholder="無制限"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500">（空欄で無制限）</span>
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={groupFormData.isRequired || false}
                      onChange={(e) => setGroupFormData({ ...groupFormData, isRequired: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">必須（1つ以上の選択が必要）</span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingGroup ? '更新' : '追加'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupForm(false);
                      setEditingGroup(null);
                      setGroupFormData({ name: '', selectionType: 'single', maxSelections: null, isRequired: false });
                    }}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            )}

            {/* Option Form */}
            {showOptionForm && (
              <form onSubmit={handleOptionSubmit} className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-medium mb-3 text-purple-800">
                  {editingOption ? 'オプションを編集' : '新規オプション'}
                  {targetGroupId && (
                    <span className="ml-2 text-sm font-normal text-purple-600">
                      （{optionGroups.find(g => g.id === targetGroupId)?.name || 'その他'}）
                    </span>
                  )}
                  {!targetGroupId && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      （その他）
                    </span>
                  )}
                </h4>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    オプション名 *
                  </label>
                  <input
                    type="text"
                    value={optionFormData.name}
                    onChange={(e) => setOptionFormData({ ...optionFormData, name: e.target.value })}
                    placeholder="例: HADO, サバゲー, ヘッドマウント"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    説明
                  </label>
                  <input
                    type="text"
                    value={optionFormData.description || ''}
                    onChange={(e) => setOptionFormData({ ...optionFormData, description: e.target.value })}
                    placeholder="任意の説明文"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="mb-3 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={optionFormData.allowMultiple !== false}
                      onChange={(e) => setOptionFormData({ ...optionFormData, allowMultiple: e.target.checked })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">数量入力を許可（複数選択可能）</span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    {editingOption ? '更新' : '追加'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOptionForm(false);
                      setEditingOption(null);
                      setTargetGroupId(null);
                      setOptionFormData({ name: '', description: '', isRequired: false, allowMultiple: true, groupId: null });
                    }}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            )}

            {/* Add Group Button */}
            {!showGroupForm && !showOptionForm && (
              <button
                onClick={() => setShowGroupForm(true)}
                className="mb-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                + グループを追加
              </button>
            )}

            {/* Groups and Options List */}
            {optionsLoading ? (
              <div className="text-gray-500">読み込み中...</div>
            ) : (
              <div className="space-y-4">
                {/* Option Groups */}
                {optionGroups.map((group) => (
                  <div key={group.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{group.name}</span>
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                          {group.selectionType === 'single' ? '単一選択' : '複数選択'}
                          {group.selectionType === 'multiple' && group.maxSelections && ` (最大${group.maxSelections})`}
                        </span>
                        {group.isRequired && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                            必須
                          </span>
                        )}
                        {!group.isActive && (
                          <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                            無効
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div className="p-3">
                      {group.options.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">オプションなし</p>
                      ) : (
                        <div className="space-y-2">
                          {group.options.map((option) => (
                            <div
                              key={option.id}
                              className={`flex items-center justify-between p-2 rounded ${
                                option.isActive ? 'bg-white border' : 'bg-gray-50 border opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm">{option.name}</span>
                                {option.allowMultiple && (
                                  <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                    数量可
                                  </span>
                                )}
                                {!option.isActive && (
                                  <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-500 rounded">
                                    無効
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleToggleOptionActive(option)}
                                  className={`px-2 py-0.5 text-xs rounded ${
                                    option.isActive
                                      ? 'text-yellow-600 hover:bg-yellow-50'
                                      : 'text-green-600 hover:bg-green-50'
                                  }`}
                                >
                                  {option.isActive ? '無効化' : '有効化'}
                                </button>
                                <button
                                  onClick={() => handleEditOption(option)}
                                  className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => handleDeleteOption(option.id)}
                                  className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded"
                                >
                                  削除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => handleAddOptionToGroup(group.id)}
                        className="mt-2 px-3 py-1 text-xs text-purple-600 border border-purple-300 rounded hover:bg-purple-50"
                      >
                        + オプションを追加
                      </button>
                    </div>
                  </div>
                ))}

                {/* Ungrouped Options (その他) */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
                    <span className="font-medium text-gray-700">その他</span>
                  </div>
                  <div className="p-3">
                    {ungroupedOptions.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-2">オプションなし</p>
                    ) : (
                      <div className="space-y-2">
                        {ungroupedOptions.map((option) => (
                          <div
                            key={option.id}
                            className={`flex items-center justify-between p-2 rounded ${
                              option.isActive ? 'bg-white border' : 'bg-gray-50 border opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm">{option.name}</span>
                              {option.allowMultiple && (
                                <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                  数量可
                                </span>
                              )}
                              {!option.isActive && (
                                <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-500 rounded">
                                  無効
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleOptionActive(option)}
                                className={`px-2 py-0.5 text-xs rounded ${
                                  option.isActive
                                    ? 'text-yellow-600 hover:bg-yellow-50'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {option.isActive ? '無効化' : '有効化'}
                              </button>
                              <button
                                onClick={() => handleEditOption(option)}
                                className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDeleteOption(option.id)}
                                className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleAddOptionToGroup(null)}
                      className="mt-2 px-3 py-1 text-xs text-purple-600 border border-purple-300 rounded hover:bg-purple-50"
                    >
                      + オプションを追加
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={handleCloseOptions}
                className="w-full px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
