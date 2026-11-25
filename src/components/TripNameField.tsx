'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { sameTripName, suggestTripNames, TRIP_NAME_MAX_LENGTH, TRIP_NAME_SUGGESTIONS } from '@/lib/trip-labels';
import { CheckIcon, CloseIcon } from '@/components/icons';

interface TripNameFieldProps {
  value: string;
  onChange: (name: string) => void;
  /** Names used on earlier trips, most used first. */
  names: string[];
  className?: string;
}

/**
 * The optional trip name, with the names used most often right underneath as
 * one-tap choices. While typing, the choices narrow to names that match.
 * Once a known name is chosen the choices stay put, with that one marked, so
 * the form below doesn't jump and another name is still one tap away.
 */
export default function TripNameField({ value, onChange, names, className }: TripNameFieldProps) {
  const inputId = useId();
  const chosen = value.trim() ? names.find((name) => sameTripName(name, value)) : undefined;
  let suggestions = chosen ? suggestTripNames(names, '') : suggestTripNames(names, value);
  if (chosen && !suggestions.includes(chosen)) {
    suggestions = [...suggestions.slice(0, TRIP_NAME_SUGGESTIONS - 1), chosen];
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={inputId} className="block text-xs font-medium text-muted">
        Trip name <span className="font-normal">(optional)</span>
      </label>
      <div className="relative">
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={TRIP_NAME_MAX_LENGTH}
          placeholder={names.length > 0 ? 'Type or pick one below' : 'e.g. Office run'}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="h-11 w-full rounded-xl border border-line bg-canvas pl-3.5 pr-11 text-sm text-ink outline-none focus:border-line-strong"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear the trip name"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div
          className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Names you have used before"
        >
          {suggestions.map((name) => {
            const selected = name === chosen;
            return (
              <button
                type="button"
                key={name}
                onClick={() => onChange(selected ? '' : name)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex h-8 max-w-[14rem] shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors active:scale-[0.98]',
                  selected
                    ? 'border-primary-line bg-primary-soft text-primary'
                    : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
                )}
              >
                {selected && <CheckIcon size={14} className="shrink-0" />}
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
