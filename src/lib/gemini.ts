import { GoogleGenerativeAI } from '@google/generative-ai';

export interface DashboardExtraction {
  distance_km: number;
  avg_mileage_kmpl: number;
  confidence_distance: 'high' | 'medium' | 'low';
  confidence_mileage: 'high' | 'medium' | 'low';
  raw_text: string;
}

/**
 * Extract trip distance and average fuel economy from a car dashboard photo.
 * Uses Gemini Flash Vision with a strict prompt and JSON schema.
 * Includes graceful fallback if no API key is set yet.
 */
export async function extractDashboardReadings(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<DashboardExtraction> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your-gemini-api-key') {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Support gemini-2.5-flash or gemini-1.5-flash
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are an expert computer vision assistant analyzing a car dashboard / digital instrument cluster photo to extract EXACTLY two trip figures:

1. **Trip Distance** (in km):
   - Look specifically for the trip distance under "Since start", "Since refuel", "Trip A", or "Trip".
   - In digital clusters, this is usually near the top/center of the dial or info card.
   - DO NOT confuse it with the total odometer or estimated distance to empty / range.

2. **Average Fuel Economy / Mileage** (in km/l or l/100km):
   - Look for "Avg." or "Average" alongside a fuel pump symbol or fuel dispenser icon.
   - If in l/100km, convert to km/l (km/l = 100 / value).
   - If in mpg, convert to km/l (km/l = mpg * 0.425144).

3. Assess confidence:
   - "high": numbers and units are razor-sharp with no glare.
   - "medium": readable but has slight glare, reflection or angle.
   - "low": blurred or partially occluded.

Respond ONLY with valid JSON conforming to this schema (no extra explanation, no markdown ticks if possible):
{
  "distance_km": number,
  "avg_mileage_kmpl": number,
  "confidence_distance": "high" | "medium" | "low",
  "confidence_mileage": "high" | "medium" | "low",
  "raw_text": "brief list of readings observed"
}`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI output did not contain valid JSON: ' + text);
    }

    const parsed = JSON.parse(jsonMatch[0]) as DashboardExtraction;

    return {
      distance_km: Number(parsed.distance_km) || 0,
      avg_mileage_kmpl: Number(parsed.avg_mileage_kmpl) || 0,
      confidence_distance: parsed.confidence_distance || 'medium',
      confidence_mileage: parsed.confidence_mileage || 'medium',
      raw_text: parsed.raw_text || '',
    };
  } catch (err: unknown) {
    console.error('Gemini vision extraction failed:', err);
    throw new Error('Could not extract dashboard readings. Please try again or enter trip details manually.', {
      cause: err,
    });
  }
}
