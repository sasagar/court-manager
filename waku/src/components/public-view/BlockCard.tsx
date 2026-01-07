/**
 * ブロックカードコンポーネント
 *
 * コートの利用不可時間帯を表示
 *
 * @module public-view/BlockCard
 */

import { formatTimeFromValue } from '../../lib/time-utils';
import type { Block } from './types';

/**
 * BlockCardコンポーネントのProps
 */
interface BlockCardProps {
  /** 表示するブロック */
  block: Block;
}

/**
 * ブロックカード
 *
 * コートの利用不可時間帯（メンテナンス、営業時間外など）を表示する
 *
 * @param props - コンポーネントProps
 * @returns ブロックカードのJSX
 *
 * @example
 * <BlockCard block={block} />
 */
export function BlockCard({ block }: BlockCardProps) {
  return (
    <div className="p-2 bg-red-50 rounded-sm border border-red-200 text-xs">
      <div className="flex items-center justify-between text-red-700">
        <span className="font-medium">
          {formatTimeFromValue(block.startTime)} - {formatTimeFromValue(block.endTime)}
        </span>
        <span className="text-red-500">利用不可</span>
      </div>
      {block.reason && (
        <p className="text-red-600 mt-0.5">{block.reason}</p>
      )}
    </div>
  );
}
