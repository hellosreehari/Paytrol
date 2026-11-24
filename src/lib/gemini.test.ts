import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GEMINI_MODELS,
  describeGeminiError,
  extractDashboardReadings,
  quotaCooldownMs,
  getGeminiModelName,
  getGeminiModelNames,
  isModelUnavailable,
  normalizeExtraction,
  resetGeminiModelCache,
  setGeminiGenerateForTests,
  toKilometres,
  toKmPerLitre,
} from './gemini';

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

describe('extractDashboardReadings model fallback', () => {
  const reading = JSON.stringify({
    trip_distance_found: true,
    trip_distance_value: 12,
    trip_distance_unit: 'km',
    average_economy_found: true,
    average_economy_value: 15,
    average_economy_unit: 'km/l',
    confidence_distance: 'high',
    confidence_mileage: 'high',
    raw_text: 'Trip A 12 km; Avg 15 km/l',
  });
  const notFound = (model: string) =>
    Object.assign(new Error(`models/${model} is not found for API version v1beta`), { status: 404 });

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    resetGeminiModelCache();
  });
  afterEach(() => setGeminiGenerateForTests(null));

  it('skips a model that is not available and remembers the one that works', async () => {
    const calls: string[] = [];
    setGeminiGenerateForTests(async (model) => {
      calls.push(model);
      if (model === 'gemini-2.5-flash') throw notFound(model);
      return reading;
    });
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';

    const result = await extractDashboardReadings('aGk=');
    expect(result.distance_km).toBe(12);
    expect(calls).toEqual(['gemini-2.5-flash', DEFAULT_GEMINI_MODELS[0]]);
    expect(getGeminiModelName()).toBe(DEFAULT_GEMINI_MODELS[0]);

    calls.length = 0;
    await extractDashboardReadings('aGk=');
    expect(calls).toEqual([DEFAULT_GEMINI_MODELS[0]]);
  });

  it('asks Gemini 3 models for low thinking, and retries without it if refused', async () => {
    const configs: unknown[] = [];
    setGeminiGenerateForTests(async (_model, config) => {
      configs.push(config.thinkingConfig);
      if (config.thinkingConfig) throw Object.assign(new Error('thinking_level is not supported'), { status: 400 });
      return reading;
    });
    await extractDashboardReadings('aGk=');
    expect(configs).toEqual([{ thinkingLevel: 'LOW' }, undefined]);
  });

  it('moves to the next model on a quota error, and skips the limited one next time', async () => {
    const calls: string[] = [];
    setGeminiGenerateForTests(async (model) => {
      calls.push(model);
      if (model === DEFAULT_GEMINI_MODELS[0]) {
        throw Object.assign(new Error('Resource exhausted. "retryDelay": "30s"'), { status: 429 });
      }
      return reading;
    });
    await extractDashboardReadings('aGk=');
    expect(calls).toEqual([DEFAULT_GEMINI_MODELS[0], DEFAULT_GEMINI_MODELS[1]]);
    calls.length = 0;
    await extractDashboardReadings('aGk=');
    expect(calls).toEqual([DEFAULT_GEMINI_MODELS[1]]);
  });

  it('says quota when every model is rate limited', async () => {
    const calls: string[] = [];
    setGeminiGenerateForTests(async (model) => {
      calls.push(model);
      throw Object.assign(new Error('Resource exhausted'), { status: 429 });
    });
    await expect(extractDashboardReadings('aGk=')).rejects.toThrow(/quota.*error 429/);
    expect(calls).toEqual(DEFAULT_GEMINI_MODELS);
  });

  it('reads how long to wait after a 429', () => {
    expect(quotaCooldownMs(new Error('"retryDelay": "12s"'))).toBe(12_000);
    expect(quotaCooldownMs(new Error('Quota exceeded for GenerateRequestsPerDayPerProject'))).toBe(3_600_000);
    expect(quotaCooldownMs(new Error('Resource exhausted'))).toBe(60_000);
  });

  it('says so when no model is available', async () => {
    setGeminiGenerateForTests(async (model) => {
      throw notFound(model);
    });
    await expect(extractDashboardReadings('aGk=')).rejects.toThrow(/none of the Gemini models/);
  });

  it('puts GEMINI_MODEL first and accepts a list', () => {
    process.env.GEMINI_MODEL = 'a, b';
    expect(getGeminiModelNames()).toEqual(['a', 'b', ...DEFAULT_GEMINI_MODELS]);
  });

  it('treats a 404 as an unavailable model but not a bad key', () => {
    expect(isModelUnavailable(notFound('x'))).toBe(true);
    expect(isModelUnavailable(Object.assign(new Error('API key not valid'), { status: 400 }))).toBe(false);
  });
});

describe('Google-side failures', () => {
  const reading = JSON.stringify({ trip_distance_found: true, trip_distance_value: 5, trip_distance_unit: 'km', average_economy_found: true, average_economy_value: 10, average_economy_unit: 'km/l', confidence_distance: 'high', confidence_mileage: 'high', raw_text: '' });
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    resetGeminiModelCache();
  });
  afterEach(() => setGeminiGenerateForTests(null));

  it('retries without thinking, then moves to the next model on a 5xx', async () => {
    const calls: string[] = [];
    setGeminiGenerateForTests(async (model, config) => {
      calls.push(`${model}:${config.thinkingConfig ? 'think' : 'plain'}`);
      if (model === DEFAULT_GEMINI_MODELS[0]) throw Object.assign(new Error('Internal error'), { status: 500 });
      return reading;
    });
    const result = await extractDashboardReadings('aGk=');
    expect(result.distance_km).toBe(5);
    expect(calls.slice(0, 3)).toEqual([`${DEFAULT_GEMINI_MODELS[0]}:think`, `${DEFAULT_GEMINI_MODELS[0]}:plain`, `${DEFAULT_GEMINI_MODELS[0]}:plain`]);
    expect(calls[3]).toBe(`${DEFAULT_GEMINI_MODELS[1]}:think`);
  });

  it('names the model and status when every model fails on Google\'s side', async () => {
    setGeminiGenerateForTests(async () => {
      throw Object.assign(new Error('The model is overloaded'), { status: 503 });
    });
    await expect(extractDashboardReadings('aGk=')).rejects.toThrow(/temporarily unavailable.*error 503/);
  });
});
