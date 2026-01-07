/**
 * コートセクションコンポーネント
 *
 * コート一覧と空き枠設定を表示
 *
 * @module public-view/CourtSection
 */

import type { PublicViewData } from '../../lib/api-client';
import { CourtCard } from './CourtCard';
import { MIN_SLOT_OPTIONS } from './types';

/**
 * CourtSectionコンポーネントのProps
 */
interface CourtSectionProps {
  /** 公開ビューデータ */
  data: PublicViewData;
  /** 最短空き枠（分） */
  minSlotMinutes: number;
  /** 最短空き枠変更時のコールバック */
  onMinSlotChange: (minutes: number) => void;
}

/**
 * コートセクション
 *
 * コート一覧と空き枠の最短時間設定を表示する
 *
 * @param props - コンポーネントProps
 * @returns コートセクションのJSX
 */
export function CourtSection({
  data,
  minSlotMinutes,
  onMinSlotChange,
}: CourtSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <CourtIcon />
          コート状況
        </h2>
        <MinSlotSelector
          value={minSlotMinutes}
          onChange={onMinSlotChange}
        />
      </div>

      <div className="space-y-3">
        {data.courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            sessions={data.sessions}
            blocks={data.blocks}
            facility={data.facility}
            date={data.date}
            minSlotMinutes={minSlotMinutes}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * MinSlotSelectorコンポーネントのProps
 */
interface MinSlotSelectorProps {
  /** 現在の値 */
  value: number;
  /** 値変更時のコールバック */
  onChange: (value: number) => void;
}

/**
 * 最短空き枠セレクタ
 *
 * @param props - コンポーネントProps
 */
function MinSlotSelector({ value, onChange }: MinSlotSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500">空き枠</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-xs border border-gray-300 rounded-sm px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {MIN_SLOT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * コートアイコン
 */
function CourtIcon() {
  return (
    <svg
      className="w-5 h-5 text-blue-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}
