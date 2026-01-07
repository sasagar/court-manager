/**
 * 公開ビュー用の型定義
 *
 * @module public-view/types
 */

import type { PublicViewData } from '../../lib/api-client';

/**
 * セッション型（APIレスポンスから抽出）
 */
export type Session = PublicViewData['sessions'][0];

/**
 * ブロック型（APIレスポンスから抽出）
 */
export type Block = NonNullable<PublicViewData['blocks']>[0];

/**
 * シフト型（APIレスポンスから抽出）
 */
export type Shift = PublicViewData['shifts'][0];

/**
 * 休憩型（APIレスポンスから抽出）
 */
export type Break = PublicViewData['breaks'][0];

/**
 * コート型（APIレスポンスから抽出）
 */
export type Court = PublicViewData['courts'][0];

/**
 * タイムラインアイテム（セッションまたはブロック）
 */
export type TimelineItem =
  | { type: 'session'; data: Session }
  | { type: 'block'; data: Block };

/**
 * 空き枠の最短時間オプション
 */
export interface MinSlotOption {
  /** 値（分） */
  value: number;
  /** 表示ラベル */
  label: string;
}

/**
 * 空き枠の最短時間オプション一覧
 */
export const MIN_SLOT_OPTIONS: MinSlotOption[] = [
  { value: 10, label: '10分' },
  { value: 15, label: '15分' },
  { value: 30, label: '30分' },
  { value: 60, label: '60分' },
];
