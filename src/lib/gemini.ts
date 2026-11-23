import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';

// gemini-1.5-* models have been retired. Override with GEMINI_MODEL if needed.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export function hasGeminiConfig(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && apiKey !== 'your-gemini-api-key');
}

const CONFIDENCE: ResponseSchema = {
  type: SchemaType.STRING,
  format: 'enum',
  enum: ['high', 'medium', 'low'],
};

// The model only reads what is printed. Unit conversion happens in code,
// because language models are unreliable at arithmetic.
const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    trip_distance_found: { type: SchemaType.BOOLEAN },
    trip_distance_value: { type: SchemaType.NUMBER },
    trip_distance_unit: { type: SchemaType.STRING, format: 'enum', enum: ['km', 'mi'] },
    average_economy_found: { type: SchemaType.BOOLEAN },
    average_economy_value: { type: SchemaType.NUMBER },
    average_economy_unit: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['km/l', 'l/100km', 'mpg_us', 'mpg_uk'],
    },
    confidence_distance: CONFIDENCE,
    confidence_mileage: CONFIDENCE,
    raw_text: { type: SchemaType.STRING },
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

/**
 * Extract trip distance and average fuel economy from a car dashboard photo
 * using Gemini vision with a JSON response schema.
 */
export async function extractDashboardReadings(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<DashboardExtraction> {
  if (!hasGeminiConfig()) {
    throw new ExtractionError('Scanning is not set up (GEMINI_API_KEY is missing). Please enter the trip manually.', 503);
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  let text: string;
  try {
    const result = await model.generateContent([PROMPT, { inlineData: { mimeType, data: imageBase64 } }]);
    text = result.response.text();
  } catch (err: unknown) {
    const described = describeGeminiError(err);
    console.error(`Gemini vision extraction failed (model ${getGeminiModelName()}):`, err);
    throw described;
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
