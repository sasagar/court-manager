import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind CSSのクラス名を結合するユーティリティ関数
 * clsxで条件付きクラス名を処理し、tailwind-mergeで重複を解決する
 *
 * @param inputs - 結合するクラス名（文字列、オブジェクト、配列など）
 * @returns 結合されたクラス名文字列
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500', { 'text-white': isActive })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
