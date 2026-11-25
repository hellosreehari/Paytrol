'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { parseTripDate, toDayString } from '@/lib/trip-date';
import { CalendarIcon, CheckIcon } from '@/components/icons';

interface TripWhenFieldProps {
  /** '' for today, or the day the trip happened as "YYYY-MM-DD". */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const CHIP = 'relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98]';
const ON = 'border-primary-line bg-primary-soft text-primary';
const OFF = 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink';

/** When the trip happened: Today (the default), Yesterday, or any earlier day. */
export default function TripWhenField({ value, onChange, className }: TripWhenFieldProps) {
  const labelId = useId();
  const now = new Date();
  const today = toDayString(now);
  const yesterday = toDayString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const isToday = !value || value === today;
  const isYesterday = value === yesterday;
  const isOther = !isToday && !isYesterday;

  return (
    <div className={cn('space-y-2', className)}>
      <p id={labelId} className="text-xs font-medium text-muted">When</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={labelId}>
        <button type="button" onClick={() => onChange('')} aria-pressed={isToday} className={cn(CHIP, isToday ? ON : OFF)}>
          {isToday && <CheckIcon size={14} />}
          Today
        </button>
        <button type="button" onClick={() => onChange(yesterday)} aria-pressed={isYesterday} className={cn(CHIP, isYesterday ? ON : OFF)}>
          {isYesterday && <CheckIcon size={14} />}
          Yesterday
        </button>
        {/* The native date picker, laid invisibly over the chip so a tap opens it on iPhone. */}
        <label className={cn(CHIP, 'cursor-pointer', isOther ? ON : OFF)}>
          {isOther ? <CheckIcon size={14} /> : <CalendarIcon size={14} />}
          {isOther
            ? parseTripDate(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
            : 'Pick a date'}
          <input
            type="date"
            value={isOther ? value : ''}
            max={today}
            min="2000-01-01"
            onChange={(event) => onChange(event.target.value === today ? '' : event.target.value)}
            aria-label="Pick the day of the trip"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
