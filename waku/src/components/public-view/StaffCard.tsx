/**
 * スタッフカードコンポーネント
 *
 * シフト中のスタッフ情報を表示
 *
 * @module public-view/StaffCard
 */

import { formatTimeFromValue } from '../../lib/time-utils';
import type { Shift, Break } from './types';

/**
 * StaffCardコンポーネントのProps
 */
interface StaffCardProps {
  /** シフト情報 */
  shift: Shift;
  /** 休憩一覧 */
  breaks: Break[];
}

/**
 * スタッフカード
 *
 * スタッフのアバター、名前、シフト時間、休憩状態を表示する
 *
 * @param props - コンポーネントProps
 * @returns スタッフカードのJSX
 *
 * @example
 * <StaffCard shift={shift} breaks={breaks} />
 */
export function StaffCard({ shift, breaks }: StaffCardProps) {
  const staffBreaks = breaks.filter((b) => b.staffId === shift.staffId);
  const now = new Date();
  const isOnBreak = staffBreaks.some((b) => {
    const start = new Date(b.startTime * 1000);
    const end = new Date(b.endTime * 1000);
    return now >= start && now <= end;
  });

  return (
    <div className="bg-white rounded-lg shadow-sm p-3 flex items-center gap-3">
      <StaffAvatar
        imageUrl={shift.staffImageUrl}
        name={shift.staffName}
        color={shift.staffColor}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{shift.staffName}</p>
        <p className="text-xs text-gray-500">
          {formatTimeFromValue(shift.startTime)} -{' '}
          {formatTimeFromValue(shift.endTime)}
        </p>
        {isOnBreak && (
          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-sm">
            休憩中
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * スタッフアバターのProps
 */
interface StaffAvatarProps {
  /** 画像URL（オプション） */
  imageUrl: string | null;
  /** スタッフ名 */
  name: string;
  /** テーマカラー */
  color: string | null;
}

/**
 * スタッフアバター
 *
 * 画像があれば画像を表示、なければイニシャルを表示
 *
 * @param props - コンポーネントProps
 */
function StaffAvatar({ imageUrl, name, color }: StaffAvatarProps) {
  const bgColor = color || '#6B7280';

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover border-2"
        style={{ borderColor: bgColor }}
      />
    );
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
      style={{ backgroundColor: bgColor }}
    >
      {name.charAt(0)}
    </div>
  );
}
