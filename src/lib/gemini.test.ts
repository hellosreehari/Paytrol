import { describe, expect, it } from 'vitest';
import { describeGeminiError, normalizeExtraction, toKilometres, toKmPerLitre } from './gemini';

describe('unit conversion', () => {
  it('converts distance units', () => {
    expect(toKilometres(100, 'km')).toBe(100);
    expect(toKilometres(10, 'mi')).toBe(16.1);
    expect(toKilometres(0, 'km')).toBe(0);
  });

  it('converts economy units to km/l', () => {
    expect(toKmPerLitre(15.2, 'km/l')).toBe(15.2);
    expect(toKmPerLitre(6.5, 'l/100km')).toBe(15.38);
    expect(toKmPerLitre(40, 'mpg_us')).toBe(17.01);
    expect(toKmPerLitre(40, 'mpg_uk')).toBe(14.16);
  });
});

describe('normalizeExtraction', () => {
  it('returns km and km/l from the raw reading', () => {
    const result = normalizeExtraction({
      trip_distance_found: true,
      trip_distance_value: 42.6,
      trip_distance_unit: 'km',
      average_economy_found: true,
      average_economy_value: 7,
      average_economy_unit: 'l/100km',
      confidence_distance: 'high',
      confidence_mileage: 'medium',
      raw_text: 'Trip A 42.6 km; Avg 7.0 l/100km',
    });
    expect(result).toMatchObject({
      distance_km: 42.6,
      avg_mileage_kmpl: 14.29,
      confidence_distance: 'high',
      confidence_mileage: 'medium',
    });
  });

  it('marks figures that were not found as 0 with low confidence', () => {
    const result = normalizeExtraction({
      trip_distance_found: false,
      trip_distance_value: 999,
      average_economy_found: true,
      average_economy_value: 15,
      average_economy_unit: 'km/l',
      confidence_distance: 'high',
      confidence_mileage: 'high',
    });
    expect(result.distance_km).toBe(0);
    expect(result.confidence_distance).toBe('low');
    expect(result.avg_mileage_kmpl).toBe(15);
  });
});

describe('describeGeminiError', () => {
  it('explains quota errors', () => {
    const err = describeGeminiError(Object.assign(new Error('Resource exhausted'), { status: 429 }));
    expect(err.message).toMatch(/quota/);
    expect(err.httpStatus).toBe(503);
  });

  it('explains a missing model', () => {
    const err = describeGeminiError(Object.assign(new Error('models/x is not found'), { status: 404 }));
    expect(err.message).toMatch(/unavailable/);
  });

  it('explains a rejected API key', () => {
    const err = describeGeminiError(Object.assign(new Error('API key not valid'), { status: 400 }));
    expect(err.message).toMatch(/API key/);
  });
});
