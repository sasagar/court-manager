/**
 * カラー関連の定数定義
 *
 * @module constants/colors
 */

/**
 * カラープリセットの型定義
 */
export interface ColorPreset {
  /** 表示名（日本語） */
  name: string;
  /** カラーコード（HEX形式） */
  value: string;
}

/**
 * プランや予約で使用するカラープリセット
 *
 * Tailwind CSS のカラーパレットに基づく選択
 */
export const COLOR_PRESETS: ColorPreset[] = [
  { name: '青', value: '#3B82F6' },       // blue-500
  { name: '緑', value: '#22C55E' },       // green-500
  { name: '黄', value: '#EAB308' },       // yellow-500
  { name: 'オレンジ', value: '#F97316' }, // orange-500
  { name: '赤', value: '#EF4444' },       // red-500
  { name: '紫', value: '#A855F7' },       // purple-500
  { name: 'ピンク', value: '#EC4899' },   // pink-500
  { name: 'シアン', value: '#06B6D4' },   // cyan-500
];

/**
 * デフォルトのカラーコード
 */
export const DEFAULT_COLOR = '#3B82F6';

/**
 * ステータス別のカラー定義
 */
export const STATUS_COLORS = {
  available: {
    bg: 'bg-green-100',
    border: 'border-green-300',
    badge: 'bg-green-200 text-green-800',
  },
  locking: {
    bg: 'bg-yellow-100',
    border: 'border-yellow-300',
    badge: 'bg-yellow-200 text-yellow-800',
  },
  reserved: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    badge: 'bg-blue-200 text-blue-800',
  },
  in_use: {
    bg: 'bg-red-100',
    border: 'border-red-300',
    badge: 'bg-red-200 text-red-800',
  },
  completed: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    badge: 'bg-gray-200 text-gray-800',
  },
} as const;

/**
 * ロール別のバッジカラー
 */
export const ROLE_BADGE_COLORS = {
  admin: 'bg-red-100 text-red-800',
  staff: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800',
} as const;
