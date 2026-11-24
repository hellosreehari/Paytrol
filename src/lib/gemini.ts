import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentConfig, type Schema } from '@google/genai';

/**
 * Models to try, in order. A model that is retired, or closed to new API keys
 * (gemini-2.5-flash now answers 404 for keys that never used it), is skipped
 * and the next one is tried. GEMINI_MODEL, if set, goes first and may hold a
 * comma-separated list.
 */
export const DEFAULT_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];

/** Give up on one model call after this long, so the user isn't left waiting. */
const REQUEST_TIMEOUT_MS = 30_000;

export function getGeminiModelNames(): string[] {
  const configured = (process.env.GEMINI_MODEL || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_GEMINI_MODELS])];
}

// The first model that answered, so later scans skip the ones that don't.
let workingModel: string | null = null;

export function getGeminiModelName(): string {
  return workingModel || getGeminiModelNames()[0];
}

/** Test hook: forget which model answered last. */
export function resetGeminiModelCache(): void {
  workingModel = null;
}

export function hasGeminiConfig(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'your-gemini-api-key');
}

const CONFIDENCE: Schema = {
  type: Type.STRING,
  format: 'enum',
  enum: ['high', 'medium', 'low'],
};

// The model only reads what is printed. Unit conversion happens in code,
// because language models are unreliable at arithmetic.
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    trip_distance_found: { type: Type.BOOLEAN },
    trip_distance_value: { type: Type.NUMBER },
    trip_distance_unit: { type: Type.STRING, format: 'enum', enum: ['km', 'mi'] },
    average_economy_found: { type: Type.BOOLEAN },
    average_economy_value: { type: Type.NUMBER },
    average_economy_unit: {
      type: Type.STRING,
      format: 'enum',
      enum: ['km/l', 'l/100km', 'mpg_us', 'mpg_uk'],
    },
    confidence_distance: CONFIDENCE,
    confidence_mileage: CONFIDENCE,
    raw_text: { type: Type.STRING },
  },
  required: [
    'trip_distance_found',
    'trip_distance_value',
    'trip_distance_unit',
    'average_economy_found',
    'average_economy_value',
    'average_economy_unit',
    'confidence_distance',
    'confidence_mileage',
    'raw_text',
  ],
};

const PROMPT = `You are reading a photo of a car's instrument cluster (dashboard) or a screenshot of a car app.
Read EXACTLY two figures, as they are printed. Do not calculate or convert anything.

1. Trip distance: the distance of the current trip, labelled e.g. "Trip", "Trip A", "Trip B", "Since start", "Since refuel", "Distance".
   - It is NOT the total odometer (usually 5+ digits, often labelled ODO).
   - It is NOT the range / distance to empty (often next to a fuel pump, labelled "Range", "DTE" or "km to empty").
   - Report the number and its unit (km or mi).

2. Average fuel economy: labelled e.g. "Avg", "Average", "AFE", "Avg. consumption", often with a fuel pump icon.
   - It is NOT instant / current economy.
   - Report the number exactly as shown and its unit: "km/l", "l/100km", "mpg_us" or "mpg_uk" (use mpg_uk only if the display is clearly UK).

Ignore everything else in the photo (speed, rpm, time, temperature, warnings, background).
If a figure is not visible or not readable, set its *_found field to false and its value to 0. Never guess.

Confidence for each figure:
- "high": digits and unit are sharp and unambiguous.
- "medium": readable but with glare, reflection, angle or an unclear label.
- "low": blurred, partly hidden, or you are unsure which figure is which.

raw_text: a short list of the labelled figures you can see, e.g. "Trip A 123.4 km; Avg 15.2 km/l; ODO 45210 km".`;

export interface DashboardExtraction {
  distance_km: number;
  avg_mileage_kmpl: number;
  confidence_distance: 'high' | 'medium' | 'low';
  confidence_mileage: 'high' | 'medium' | 'low';
  raw_text: string;
}

/** An extraction failure with a message that is safe and useful to show the user. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toKilometres(value: number, unit: unknown): number {
  if (value <= 0) return 0;
  return round(unit === 'mi' ? value * 1.609344 : value, 1);
}

export function toKmPerLitre(value: number, unit: unknown): number {
  if (value <= 0) return 0;
  switch (unit) {
    case 'l/100km':
      return round(100 / value, 2);
    case 'mpg_us':
      return round(value * 0.425144, 2);
    case 'mpg_uk':
      return round(value * 0.354006, 2);
    default:
      return round(value, 2);
  }
}

interface RawExtraction {
  trip_distance_found?: boolean;
  trip_distance_value?: number;
  trip_distance_unit?: string;
  average_economy_found?: boolean;
  average_economy_value?: number;
  average_economy_unit?: string;
  confidence_distance?: string;
  confidence_mileage?: string;
  raw_text?: string;
}

/** Turn the model's raw reading into km and km/l. Missing figures come back as 0 with low confidence. */
export function normalizeExtraction(parsed: RawExtraction): DashboardExtraction {
  const distanceFound = parsed.trip_distance_found !== false;
  const mileageFound = parsed.average_economy_found !== false;
  const distance = distanceFound
    ? toKilometres(positiveNumber(parsed.trip_distance_value), parsed.trip_distance_unit)
    : 0;
  const mileage = mileageFound
    ? toKmPerLitre(positiveNumber(parsed.average_economy_value), parsed.average_economy_unit)
    : 0;
  return {
    distance_km: distance,
    avg_mileage_kmpl: mileage,
    confidence_distance: distance > 0 ? normalizeConfidence(parsed.confidence_distance) : 'low',
    confidence_mileage: mileage > 0 ? normalizeConfidence(parsed.confidence_mileage) : 'low',
    raw_text: typeof parsed.raw_text === 'string' ? parsed.raw_text : '',
  };
}

/** Map a Gemini SDK failure to a message the user (and the logs) can act on. */
export function describeGeminiError(err: unknown): ExtractionError {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);

  if ((err as { name?: string })?.name === 'AbortError' || /aborted|timed? ?out|deadline/i.test(message)) {
    return new ExtractionError('Reading the photo took too long. Please try again, or enter the trip manually.', 504, { cause: err });
  }
  if (status === 429 || /quota|rate limit|resource.?exhausted/i.test(message)) {
    return new ExtractionError('The scanning service is busy or out of quota. Please try again in a minute, or enter the trip manually.', 503, { cause: err });
  }
  if (status === 400 && /api key/i.test(message)) {
    return new ExtractionError('Scanning is not set up correctly (the Gemini API key was rejected). Please enter the trip manually.', 503, { cause: err });
  }
  if (status === 401 || status === 403) {
    return new ExtractionError('Scanning is not set up correctly (the Gemini API key is not allowed to use this model). Please enter the trip manually.', 503, { cause: err });
  }
  if (status === 404 || /not found|is not supported/i.test(message)) {
    return new ExtractionError(`Scanning is not set up correctly (Gemini model "${getGeminiModelName()}" is unavailable). Please enter the trip manually.`, 503, { cause: err });
  }
  if (status !== undefined && status >= 500) {
    return new ExtractionError('The scanning service is temporarily unavailable. Please try again, or enter the trip manually.', 503, { cause: err });
  }
  if (/safety|blocked|candidate/i.test(message)) {
    return new ExtractionError('This photo could not be read. Please try a clearer photo of the dashboard.', 422, { cause: err });
  }
  return new ExtractionError('Could not read the dashboard. Please try a clearer photo, or enter the trip manually.', 502, { cause: err });
}

/** True when the model itself is missing, retired or closed to this key, so another model is worth trying. */
export function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 404) return true;
  if (status === 400 && /api key/i.test(message)) return false;
  return /model.*(not found|is not supported|no longer available|not available|deprecated)|(not found|unsupported).*model/i.test(message);
}

function configFor(model: string, withThinking: boolean): GenerateContentConfig {
  const config: GenerateContentConfig = {
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema,
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  // Reading two printed numbers needs little reasoning: low thinking keeps
  // Gemini 3 models fast. Older models don't accept thinkingLevel.
  if (withThinking && /^gemini-[3-9]/.test(model)) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return config;
}

type GenerateFn = (model: string, config: GenerateContentConfig, parts: unknown[]) => Promise<string>;

let generateOverride: GenerateFn | null = null;

/** Test hook: replace the Gemini call. */
export function setGeminiGenerateForTests(fn: GenerateFn | null): void {
  generateOverride = fn;
}

function defaultGenerate(): GenerateFn {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return async (model, config, parts) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: parts as never }],
      config,
    });
    return response.text ?? '';
  };
}

/**
 * Extract trip distance and average fuel economy from a car dashboard photo
 * using Gemini vision with a JSON response schema. Tries each configured
 * model in turn when one is unavailable.
 */
export async function extractDashboardReadings(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<DashboardExtraction> {
  if (!hasGeminiConfig()) {
    throw new ExtractionError('Scanning is not set up (GEMINI_API_KEY is missing). Please enter the trip manually.', 503);
  }

  const generate = generateOverride ?? defaultGenerate();
  const parts = [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }];
  const models = workingModel
    ? [workingModel, ...getGeminiModelNames().filter((m) => m !== workingModel)]
    : getGeminiModelNames();

  let text: string | null = null;
  let lastError: unknown = null;
  for (const model of models) {
    try {
      try {
        text = await generate(model, configFor(model, true), parts);
      } catch (err: unknown) {
        // A model that rejects the thinking setting still deserves a plain try.
        const message = err instanceof Error ? err.message : String(err);
        if ((err as { status?: number })?.status !== 400 || !/thinking/i.test(message)) throw err;
        text = await generate(model, configFor(model, false), parts);
      }
      workingModel = model;
      break;
    } catch (err: unknown) {
      lastError = err;
      if (!isModelUnavailable(err)) {
        console.error(`Gemini vision extraction failed (model ${model}):`, err);
        throw describeGeminiError(err);
      }
      console.warn(`Gemini model ${model} is unavailable, trying the next one:`, err instanceof Error ? err.message : err);
      if (workingModel === model) workingModel = null;
    }
  }

  if (text === null) {
    console.error(`No Gemini model answered (tried ${models.join(', ')}):`, lastError);
    throw new ExtractionError(
      `Scanning is not set up correctly (none of the Gemini models ${models.join(', ')} are available to this API key). Please enter the trip manually.`,
      503,
      { cause: lastError }
    );
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in model output');
    return normalizeExtraction(JSON.parse(jsonMatch[0]) as RawExtraction);
  } catch (err: unknown) {
    console.error('Gemini returned unreadable output:', text, err);
    throw new ExtractionError('Could not read the dashboard. Please try a clearer photo, or enter the trip manually.', 502, { cause: err });
  }
}
