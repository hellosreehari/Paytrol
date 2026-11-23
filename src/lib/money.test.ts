import { describe, expect, it } from 'vitest';
import { computeTripCost, roundMoney, splitByPercentages, splitEqually } from '@/lib/money';

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('computeTripCost', () => {
  it('matches the README example', () => {
    expect(computeTripCost(6, 5.8, 105)).toEqual({ fuelUsedLiters: 1.034, totalCost: 108.62 });
  });

  it('returns zero when mileage is zero', () => {
    expect(computeTripCost(10, 0, 100)).toEqual({ fuelUsedLiters: 0, totalCost: 0 });
  });
});

describe('splitEqually', () => {
  it('always sums exactly to the total', () => {
    for (const total of [0.01, 1, 100, 307.5, 147.6, 108.62, 999.99]) {
      for (let count = 1; count <= 7; count += 1) {
        expect(sum(splitEqually(total, count))).toBe(total);
      }
    }
  });

  it('gives leftover paise to the first people', () => {
    expect(splitEqually(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it('returns nothing for zero people', () => {
    expect(splitEqually(100, 0)).toEqual([]);
  });
});

describe('splitByPercentages', () => {
  it('splits by percentage and sums exactly to the total', () => {
    const shares = splitByPercentages(100, [33.33, 33.33, 33.34])!;
    expect(sum(shares)).toBe(100);
  });

  it('rejects percentages that do not total 100', () => {
    expect(splitByPercentages(100, [50, 40])).toBeNull();
    expect(splitByPercentages(100, [50, Number.NaN, 50])).toBeNull();
    expect(splitByPercentages(100, [])).toBeNull();
  });

  it('accepts floating point totals like 33.3 + 33.3 + 33.4', () => {
    expect(splitByPercentages(90, [33.3, 33.3, 33.4])).not.toBeNull();
  });
});

describe('roundMoney', () => {
  it('removes floating point noise', () => {
    expect(roundMoney(63.69999999999999)).toBe(63.7);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
