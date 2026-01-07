'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { staffApi, imagesApi, type Staff, type CreateStaffInput } from '../lib/api-client';

type StaffManagerProps = {
  facilityId: string;
};

// プリセットカラー
const PRESET_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#84CC16', // lime
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#EC4899', // pink
];

export function StaffManager({ facilityId }: StaffManagerProps) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateStaffInput & { isActive?: boolean; imageUrl?: string }>({
    displayName: '',
    employeeId: '',
    colorCode: PRESET_COLORS[0],
    phone: '',
    imageUrl: '',
    role: 'staff',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStaff = async () => {
    try {
      const result = await staffApi.list(facilityId, includeInactive);
      setStaff(result.staff);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [facilityId, includeInactive]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingStaff) {
        await staffApi.update(facilityId, editingStaff.id, formData);
      } else {
        await staffApi.create(facilityId, formData);
      }
      setShowForm(false);
      setEditingStaff(null);
      setFormData({
        displayName: '',
        employeeId: '',
        colorCode: PRESET_COLORS[0],
        phone: '',
        imageUrl: '',
        role: 'staff',
      });
      fetchStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    setFormData({
      displayName: staffMember.displayName,
      employeeId: staffMember.employeeId || '',
      colorCode: staffMember.colorCode || PRESET_COLORS[0],
      phone: staffMember.phone || '',
      imageUrl: staffMember.imageUrl || '',
      role: staffMember.role || 'staff',
      isActive: staffMember.isActive,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (staffMember: Staff) => {
    setError(null);
    try {
      const newStatus = !staffMember.isActive;
      console.log(`Toggling staff ${staffMember.id} isActive from ${staffMember.isActive} to ${newStatus}`);
      const result = await staffApi.update(facilityId, staffMember.id, { isActive: newStatus });
      console.log('Update result:', result);
      await fetchStaff();
    } catch (err) {
      console.error('Failed to toggle active:', err);
      setError(err instanceof Error ? err.message : 'Failed to update staff');
    }
  };

  const handleDelete = async (staffMember: Staff) => {
    if (!confirm(`「${staffMember.displayName}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }
    try {
      await staffApi.delete(facilityId, staffMember.id);
      fetchStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete staff');
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理者';
      case 'staff':
        return 'スタッフ';
      case 'viewer':
        return '閲覧者';
      default:
        return role;
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700';
      case 'staff':
        return 'bg-blue-100 text-blue-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // 並び順変更
  const moveStaff = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const newStaff = [...staff];
    const [movedItem] = newStaff.splice(fromIndex, 1);
    newStaff.splice(toIndex, 0, movedItem);
    setStaff(newStaff);

    try {
      await staffApi.reorder(facilityId, newStaff.map(s => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder staff');
      // リバート
      fetchStaff();
    }
  }, [staff, facilityId]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    moveStaff(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('画像サイズは5MB以下にしてください');
      return;
    }

    // MIMEタイプチェック
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('対応形式: JPEG, PNG, GIF, WebP');
      return;
    }

    setImageUploading(true);
    setError(null);

    try {
      const result = await imagesApi.upload(facilityId, file, 'staff');
      setFormData({ ...formData, imageUrl: result.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像のアップロードに失敗しました');
    } finally {
      setImageUploading(false);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
    setFormData({ ...formData, imageUrl: '' });
  };

  if (loading) {
    return <div className="p-4 text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">スタッフ管理</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            無効なスタッフも表示
          </label>
          <button
            onClick={() => setReorderMode(!reorderMode)}
            className={`px-4 py-2 text-sm rounded-lg ${
              reorderMode
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {reorderMode ? '並び替え完了' : '並び替え'}
          </button>
          <button
            onClick={() => {
              setEditingStaff(null);
              setFormData({
                displayName: '',
                employeeId: '',
                colorCode: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
                phone: '',
                imageUrl: '',
                role: 'staff',
              });
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            新規スタッフ
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Staff Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingStaff ? 'スタッフを編集' : '新規スタッフ'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  表示名 *
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="例: 山田 太郎"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  従業員ID
                </label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  placeholder="例: EMP001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  電話番号
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="例: 090-1234-5678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プロフィール画像
                </label>
                {formData.imageUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={formData.imageUrl}
                      alt="プレビュー"
                      className="w-16 h-16 rounded-full object-cover border-2"
                      style={{ borderColor: formData.colorCode || '#6B7280' }}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                      >
                        {imageUploading ? 'アップロード中...' : '変更'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => !imageUploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${
                      imageUploading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {imageUploading ? (
                      <div className="flex items-center justify-center gap-2 text-gray-500">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>アップロード中...</span>
                      </div>
                    ) : (
                      <>
                        <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="mt-1 text-sm text-gray-500">クリックして画像を選択</p>
                        <p className="text-xs text-gray-400">JPEG, PNG, GIF, WebP (最大5MB)</p>
                      </>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  役割
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as 'admin' | 'staff' | 'viewer' })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                  <option value="viewer">閲覧者</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  表示色
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, colorCode: color })}
                      className={`w-8 h-8 rounded-full border-2 ${
                        formData.colorCode === color ? 'border-gray-800 ring-2 ring-offset-2 ring-gray-400' : 'border-gray-200'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.colorCode || '#3B82F6'}
                    onChange={(e) => setFormData({ ...formData, colorCode: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.colorCode || ''}
                    onChange={(e) => setFormData({ ...formData, colorCode: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingStaff(null);
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
                  {formLoading ? '保存中...' : editingStaff ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff List */}
      {staff.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          スタッフが登録されていません
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((staffMember, index) => (
            <div
              key={staffMember.id}
              draggable={reorderMode}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between p-4 border rounded-lg ${
                staffMember.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'
              } ${reorderMode ? 'cursor-grab active:cursor-grabbing' : ''} ${
                draggedIndex === index ? 'opacity-50 border-blue-400 bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* 並び替えモード時のドラッグハンドル */}
                {reorderMode && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveStaff(index, Math.max(0, index - 1))}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="上へ移動"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveStaff(index, Math.min(staff.length - 1, index + 1))}
                      disabled={index === staff.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="下へ移動"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                {/* プロフィール画像またはカラードット */}
                {staffMember.imageUrl ? (
                  <img
                    src={staffMember.imageUrl}
                    alt={staffMember.displayName}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border-2"
                    style={{ borderColor: staffMember.colorCode || '#6B7280' }}
                    onError={(e) => {
                      // 画像読み込みエラー時はカラードットを表示
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div
                  className={`w-4 h-4 rounded-full shrink-0 ${staffMember.imageUrl ? 'hidden' : ''}`}
                  style={{ backgroundColor: staffMember.colorCode || '#6B7280' }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-800">{staffMember.displayName}</h3>
                    {staffMember.employeeId && (
                      <span className="text-sm text-gray-500">({staffMember.employeeId})</span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getRoleBadgeClass(staffMember.role)}`}>
                      {getRoleLabel(staffMember.role)}
                    </span>
                    {!staffMember.isActive && (
                      <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                        無効
                      </span>
                    )}
                  </div>
                  {staffMember.phone && (
                    <div className="text-sm text-gray-500 mt-1">{staffMember.phone}</div>
                  )}
                </div>
              </div>

              {!reorderMode && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(staffMember)}
                    className={`px-3 py-1 text-sm rounded-lg ${
                      staffMember.isActive
                        ? 'text-yellow-600 border border-yellow-300 hover:bg-yellow-50'
                        : 'text-green-600 border border-green-300 hover:bg-green-50'
                    }`}
                  >
                    {staffMember.isActive ? '無効化' : '有効化'}
                  </button>
                  <button
                    onClick={() => handleEdit(staffMember)}
                    className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(staffMember)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
