import { describe, expect, it } from 'vitest';
import {
  MIN_SHARPNESS,
  STEADY_MS,
  SteadyTracker,
  frameDifference,
  lighting,
  sharpness,
  toGray,
} from './frame-quality';

const W = 40;
const H = 30;

/** Black and white stripes: lots of hard edges, like crisp digits. */
function stripes(width = W, height = H): Float32Array {
  const g = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) g[y * width + x] = x % 4 < 2 ? 30 : 220;
  }
  return g;
}

/** The same stripes, smeared sideways as a shaky photo would be. */
function blurred(source: Float32Array, width = W, passes = 4): Float32Array {
  let g = source;
  for (let p = 0; p < passes; p += 1) {
    const next = new Float32Array(g.length);
    for (let i = 0; i < g.length; i += 1) {
      const x = i % width;
      const left = x > 0 ? g[i - 1] : g[i];
      const right = x < width - 1 ? g[i + 1] : g[i];
      next[i] = (left + g[i] + right) / 3;
    }
    g = next;
  }
  return g;
}

describe('frame checks', () => {
  it('converts RGBA to grey', () => {
    const gray = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(Math.round(gray[0])).toBe(255);
    expect(gray[1]).toBe(0);
  });

  it('scores crisp edges far above blurred ones', () => {
    const crisp = sharpness(stripes(), W, H);
    const soft = sharpness(blurred(stripes()), W, H);
    expect(crisp).toBeGreaterThan(MIN_SHARPNESS);
    expect(crisp).toBeGreaterThan(soft * 5);
  });

  it('sees no change between identical frames and a big change when the view moves', () => {
    const a = stripes();
    expect(frameDifference(a, a)).toBe(0);
    const shifted = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 1) shifted[i] = a[(i + 2) % a.length];
    expect(frameDifference(a, shifted)).toBeGreaterThan(0.3);
  });

  it('accepts a dark dashboard with bright digits, and rejects darkness and glare', () => {
    const dashboard = new Float32Array(1000).fill(12);
    dashboard.fill(200, 0, 20); // 2% bright digits on black
    expect(lighting(dashboard)).toBe('ok');
    expect(lighting(stripes())).toBe('ok');
    expect(lighting(new Float32Array(100).fill(10))).toBe('dark');
    expect(lighting(new Float32Array(100).fill(255))).toBe('glare');
  });
});

describe('SteadyTracker', () => {
  const sample = (time: number, overrides: Partial<{ difference: number; sharpness: number; lighting: 'ok' | 'dark' | 'glare' }> = {}) => ({
    time,
    difference: 0.005,
    sharpness: 500,
    lighting: 'ok' as const,
    ...overrides,
  });

  it('captures once the picture has been steady long enough', () => {
    const tracker = new SteadyTracker();
    expect(tracker.update(sample(0)).capture).toBe(false);
    expect(tracker.update(sample(STEADY_MS / 2)).progress).toBeCloseTo(0.5);
    expect(tracker.update(sample(STEADY_MS)).capture).toBe(true);
  });

  it('starts over when the phone moves', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0));
    expect(tracker.update(sample(500, { difference: 0.2 })).problem).toBe('moving');
    expect(tracker.update(sample(STEADY_MS)).capture).toBe(false);
    expect(tracker.update(sample(STEADY_MS * 2)).capture).toBe(true);
  });

  it('judges blur against the sharpest frame seen so far', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0, { sharpness: 1000 }));
    expect(tracker.update(sample(100, { sharpness: 300 })).problem).toBe('blurry');
  });

  it('waits for a frame close to the sharpest of the hold', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0, { sharpness: 800 }));
    expect(tracker.update(sample(STEADY_MS, { sharpness: 600 })).capture).toBe(false);
    expect(tracker.update(sample(STEADY_MS + 100, { sharpness: 780 })).capture).toBe(true);
  });

  it('flags poor light', () => {
    expect(new SteadyTracker().update(sample(0, { lighting: 'dark' })).problem).toBe('dark');
  });
});
