/**
 * Selectコンポーネント
 *
 * シンプルなネイティブselectのラッパー
 *
 * @module ui/select
 */

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * SelectコンポーネントのProps
 */
export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** 選択肢 */
  options: Array<{ value: string | number; label: string }>;
}

/**
 * Select - ネイティブselectのスタイル付きラッパー
 *
 * @example
 * <Select
 *   options={[{ value: 10, label: '10分' }, { value: 30, label: '30分' }]}
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 * />
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
);
Select.displayName = 'Select';

export { Select };
