import * as React from 'react';
import { cn } from '@/lib/utils';

type SliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  value: number[];
  onValueChange?: (value: number[]) => void;
};

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, step = 1, onValueChange, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0] ?? min}
      onChange={(e) => onValueChange?.([e.currentTarget.valueAsNumber])}
      className={cn(
        'h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Slider.displayName = 'Slider';
