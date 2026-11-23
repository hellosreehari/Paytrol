/**
 * Money helpers. All split math is done in integer paise (1/100 of a rupee)
 * so shares always add up to the trip total and balances never drift
 * from floating point errors.
 */

export function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Round a rupee amount to 2 decimals (e.g. 63.69999999999999 -> 63.7). */
export function roundMoney(amount: number): number {
  return fromPaise(toPaise(amount));
}

/** Fuel used (L) and total cost (₹, rounded to paise) for a trip. */
export function computeTripCost(distanceKm: number, avgMileageKmpl: number, fuelPricePerLiter: number) {
  const fuelUsedLiters = avgMileageKmpl > 0 ? distanceKm / avgMileageKmpl : 0;
  return {
    fuelUsedLiters: Math.round(fuelUsedLiters * 1000) / 1000,
    totalCost: roundMoney(fuelUsedLiters * fuelPricePerLiter),
  };
}

/**
 * Split a total equally across `count` people. Leftover paise go to the
 * first people in order, so the shares always sum exactly to the total.
 */
export function splitEqually(totalCost: number, count: number): number[] {
  if (count <= 0) return [];
  const totalPaise = toPaise(totalCost);
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;
  return Array.from({ length: count }, (_, index) => fromPaise(base + (index < remainder ? 1 : 0)));
}

/**
 * Split a total by percentages. Each share is floored to paise and the
 * leftover paise go to the largest fractional remainders first.
 * Returns null when the percentages are invalid or don't total 100.
 */
export function splitByPercentages(totalCost: number, percentages: number[]): number[] | null {
  if (percentages.length === 0) return null;
  if (percentages.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const percentTotal = percentages.reduce((sum, value) => sum + value, 0);
  if (Math.abs(percentTotal - 100) > 0.001) return null;

  const totalPaise = toPaise(totalCost);
  const exact = percentages.map((value) => (totalPaise * value) / 100);
  const floored = exact.map((value) => Math.floor(value));
  let leftover = totalPaise - floored.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (leftover <= 0) break;
    floored[index] += 1;
    leftover -= 1;
  }
  return floored.map(fromPaise);
}
