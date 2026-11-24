/**
 * Cheap, on-device checks that decide when a live camera frame is good enough
 * to send for reading. They run on a tiny greyscale copy of each frame, so a
 * check takes a few milliseconds and nothing leaves the phone.
 */

/** Size of the greyscale copy each frame is shrunk to before scoring. */
export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 120;

/** The guide box drawn over the viewfinder, as fractions of the frame. */
export const GUIDE_BOX = { left: 0.08, top: 0.14, right: 0.92, bottom: 0.78 };

/** Mean change per pixel (0 to 1) below which the phone counts as still. */
export const STILL_THRESHOLD = 0.06;
/** Edge strength below which a frame is never sharp enough, however dim the cabin. */
export const MIN_SHARPNESS = 40;
/** A frame must be at least this share of the sharpest frame seen in this scan. */
export const RELATIVE_SHARPNESS = 0.5;
/** How long the picture has to stay still, sharp and lit before a frame is taken. */
export const STEADY_MS = 700;
/** A hand shakes now and then: this many moving frames in a row (100 ms apart) are forgiven. */
export const MOVING_GRACE_FRAMES = 2;

/** Convert RGBA pixels to luma (0 to 255). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return gray;
}

/**
 * How much the view changed between two frames, from 0 (same) to 1. It
 * compares 8×8-pixel block averages, not single pixels, so the small shake of
 * a hand-held phone barely counts while turning the phone away does.
 */
export function frameDifference(
  a: Float32Array,
  b: Float32Array,
  width = SAMPLE_WIDTH,
  height = SAMPLE_HEIGHT,
  block = 8
): number {
  if (a.length !== b.length || a.length === 0 || a.length !== width * height) return 1;
  const cols = Math.floor(width / block);
  const rows = Math.floor(height / block);
  if (cols === 0 || rows === 0) return 1;
  let total = 0;
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      let sumA = 0;
      let sumB = 0;
      for (let y = by * block; y < (by + 1) * block; y += 1) {
        const row = y * width;
        for (let x = bx * block; x < (bx + 1) * block; x += 1) {
          sumA += a[row + x];
          sumB += b[row + x];
        }
      }
      total += Math.abs(sumA - sumB) / (block * block);
    }
  }
  return total / (cols * rows) / 255;
}

/**
 * Edge strength inside the guide box: the variance of the Laplacian. Shake
 * and bad focus soften edges, so blurry frames score low.
 */
export function sharpness(gray: Float32Array, width: number, height: number, box = GUIDE_BOX): number {
  const x0 = Math.max(1, Math.floor(box.left * width));
  const x1 = Math.min(width - 1, Math.ceil(box.right * width));
  const y0 = Math.max(1, Math.floor(box.top * height));
  const y1 = Math.min(height - 1, Math.ceil(box.bottom * height));
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      const i = row + x;
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export type Lighting = 'ok' | 'dark' | 'glare';

/**
 * Whether the frame has readable light. Dashboards are mostly black with
 * bright digits that cover only a few percent of the frame, so this looks
 * at the brightest 1% of pixels, not the average. Blown-out glare must stay small.
 */
export function lighting(gray: Float32Array): Lighting {
  if (gray.length === 0) return 'dark';
  const histogram = new Uint32Array(256);
  let clipped = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const v = Math.min(255, Math.max(0, Math.round(gray[i])));
    histogram[v] += 1;
    if (v >= 250) clipped += 1;
  }
  if (clipped / gray.length > 0.15) return 'glare';
  let seen = 0;
  const target = gray.length * 0.99;
  for (let v = 0; v < 256; v += 1) {
    seen += histogram[v];
    if (seen >= target) return v >= 60 ? 'ok' : 'dark';
  }
  return 'ok';
}

export interface FrameSample {
  /** Milliseconds, from performance.now(). */
  time: number;
  /** Change since the previous frame, 0 to 1. */
  difference: number;
  sharpness: number;
  lighting: Lighting;
}

export interface SteadyState {
  /** 0 to 1: how far through the steady hold the phone is. Drives the ring. */
  progress: number;
  /** True on the frame that should be captured and sent. */
  capture: boolean;
  /** Which check is failing right now, for the hint under the ring. */
  problem: 'moving' | 'blurry' | 'dark' | 'glare' | null;
}

/**
 * Watches frame samples and says when the picture has been still, sharp and
 * well lit for long enough, picking a frame near the sharpest of that stretch.
 */
export class SteadyTracker {
  private steadySince: number | null = null;
  private bestInScan = 0;
  private bestInHold = 0;
  private movingStreak = 0;

  reset(): void {
    this.steadySince = null;
    this.bestInHold = 0;
    this.movingStreak = 0;
  }

  update(sample: FrameSample): SteadyState {
    this.bestInScan = Math.max(this.bestInScan, sample.sharpness);
    const sharpFloor = Math.max(MIN_SHARPNESS, this.bestInScan * RELATIVE_SHARPNESS);

    let problem: SteadyState['problem'] = null;
    if (sample.lighting !== 'ok') problem = sample.lighting;
    else if (sample.difference > STILL_THRESHOLD) problem = 'moving';
    else if (sample.sharpness < sharpFloor) problem = 'blurry';

    // A brief wobble doesn't restart the hold: skip the frame and keep the progress.
    if (problem === 'moving' && this.steadySince !== null && this.movingStreak < MOVING_GRACE_FRAMES) {
      this.movingStreak += 1;
      return { progress: Math.min(1, (sample.time - this.steadySince) / STEADY_MS), capture: false, problem: null };
    }
    if (problem !== 'moving') this.movingStreak = 0;

    if (problem) {
      this.reset();
      return { progress: 0, capture: false, problem };
    }

    if (this.steadySince === null) this.steadySince = sample.time;
    this.bestInHold = Math.max(this.bestInHold, sample.sharpness);
    const held = sample.time - this.steadySince;
    const progress = Math.min(1, held / STEADY_MS);
    // Once held long enough, take a frame that is close to the sharpest of the hold.
    // If no frame matches the best for a while, take the current one anyway.
    const capture =
      held >= STEADY_MS && (sample.sharpness >= this.bestInHold * 0.85 || held >= STEADY_MS + 500);
    if (capture) this.reset();
    return { progress, capture, problem: null };
  }
}
