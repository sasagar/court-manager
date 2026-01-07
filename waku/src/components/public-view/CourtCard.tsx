/**
 * コートカードコンポーネント
 *
 * コートの現在の状況、次の空き時間、予約/ブロックを表示
 *
 * @module public-view/CourtCard
 */

import type { PublicViewData } from '../../lib/api-client';
import { getTimeOfDayJST } from '../../lib/time-utils';
import { getNextAvailableTime } from './availability-utils';
import { SessionCard } from './SessionCard';
import { BlockCard } from './BlockCard';
import type { Court, TimelineItem } from './types';

/**
 * CourtCardコンポーネントのProps
 */
interface CourtCardProps {
  /** コート情報 */
  court: Court;
  /** セッション一覧 */
  sessions: PublicViewData['sessions'];
  /** ブロック一覧 */
  blocks: PublicViewData['blocks'];
  /** 施設情報 */
  facility: PublicViewData['facility'];
  /** 表示日付 */
  date: string;
  /** 最短空き枠（分） */
  minSlotMinutes: number;
}

/**
 * コートカード
 *
 * コートの現在のステータス、次の空き時間、
 * 予約・ブロックのタイムラインを表示する
 *
 * @param props - コンポーネントProps
 * @returns コートカードのJSX
 */
export function CourtCard({
  court,
  sessions,
  blocks,
  facility,
  date,
  minSlotMinutes,
}: CourtCardProps) {
  // 完了以外のセッションを表示
  const courtSessions = sessions.filter(
    (s) => s.courtId === court.id && s.status !== 'completed'
  );
  const currentSession = courtSessions.find((s) => s.status === 'in_use');
  const upcomingSessions = courtSessions.filter((s) =>
    ['locking', 'reserved'].includes(s.status)
  );

  // このコートのブロック（コート指定 or 全コート対象）
  // 今日の場合でも終了したブロックを表示する（履歴として）
  const courtBlocks = (blocks || []).filter(
    (b) => b.courtId === court.id || b.courtId === null
  );

  // 予約とブロックを統合して時間順にソート
  const sessionItems: TimelineItem[] = upcomingSessions.map((s) => ({
    type: 'session' as const,
    data: s,
  }));

  const blockItems: TimelineItem[] = courtBlocks.map((b) => ({
    type: 'block' as const,
    data: b,
  }));

  const timelineItems = [...sessionItems, ...blockItems].sort((a, b) => {
    const aTime = a.data.startTime;
    const bTime = b.data.startTime;
    return getTimeOfDayJST(aTime) - getTimeOfDayJST(bTime);
  });

  // 次の空き時間を計算
  const nextAvailable = getNextAvailableTime(
    courtSessions,
    blocks || [],
    court.id,
    facility.businessHoursStart,
    facility.businessHoursEnd,
    date,
    minSlotMinutes
  );

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900">{court.name}</h3>
        <CourtStatusBadge
          isInUse={!!currentSession}
          hasUpcoming={upcomingSessions.length > 0}
        />
      </div>

      {/* 次の空き時間 */}
      {nextAvailable && <NextAvailableSlot time={nextAvailable} />}

      {/* 現在使用中のセッション */}
      {currentSession && <SessionCard session={currentSession} />}

      {/* 予約とブロックのタイムライン */}
      {timelineItems.length > 0 ? (
        <div className="space-y-1.5">
          {timelineItems.map((item) =>
            item.type === 'session' ? (
              <SessionCard key={item.data.id} session={item.data} />
            ) : (
              <BlockCard key={item.data.id} block={item.data} />
            )
          )}
        </div>
      ) : (
        !currentSession && (
          <p className="text-sm text-gray-500">予約はありません</p>
        )
      )}
    </div>
  );
}

/**
 * コートステータスバッジのProps
 */
interface CourtStatusBadgeProps {
  /** 使用中かどうか */
  isInUse: boolean;
  /** 予約があるかどうか */
  hasUpcoming: boolean;
}

/**
 * コートステータスバッジ
 *
 * @param props - コンポーネントProps
 */
function CourtStatusBadge({ isInUse, hasUpcoming }: CourtStatusBadgeProps) {
  if (isInUse) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
        使用中
      </span>
    );
  }

  if (hasUpcoming) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
        予約あり
      </span>
    );
  }

  return (
    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
      空き
    </span>
  );
}

/**
 * 次の空き枠表示のProps
 */
interface NextAvailableSlotProps {
  /** 表示する時間文字列 */
  time: string;
}

/**
 * 次の空き枠表示
 *
 * @param props - コンポーネントProps
 */
function NextAvailableSlot({ time }: NextAvailableSlotProps) {
  return (
    <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
      <div className="flex items-center gap-1 text-blue-700">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-xs font-medium">次の空き</span>
        <span className="text-sm font-bold ml-1">{time}</span>
      </div>
    </div>
  );
}
