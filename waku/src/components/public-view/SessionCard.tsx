/**
 * セッションカードコンポーネント
 *
 * コートの予約/使用中セッションをコンパクトに表示
 *
 * @module public-view/SessionCard
 */

import { formatTimeFromValue } from '../../lib/time-utils';
import type { Session } from './types';

/**
 * SessionCardコンポーネントのProps
 */
interface SessionCardProps {
  /** 表示するセッション */
  session: Session;
}

/**
 * セッションカード
 *
 * 予約/使用中のセッションを時間、プラン、顧客名とともに表示する
 *
 * @param props - コンポーネントProps
 * @returns セッションカードのJSX
 *
 * @example
 * <SessionCard session={session} />
 */
export function SessionCard({ session }: SessionCardProps) {
  return (
    <div
      className="p-2 rounded-sm border-l-4 text-xs"
      style={{
        borderColor: session.planColor || '#3B82F6',
        backgroundColor: `${session.planColor || '#3B82F6'}10`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">
          {formatTimeFromValue(session.startTime)} -{' '}
          {session.endTime ? formatTimeFromValue(session.endTime) : '未定'}
        </span>
        {(session.planShortName || session.planName) && (
          <span
            className="px-1.5 py-0.5 rounded-sm text-white"
            style={{ backgroundColor: session.planColor || '#3B82F6' }}
          >
            {session.planShortName || session.planName}
          </span>
        )}
      </div>
      {session.customerName && (
        <p className="text-gray-600 mt-0.5">{session.customerName}</p>
      )}
    </div>
  );
}
