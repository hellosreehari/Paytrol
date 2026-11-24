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

  it('ignores a small shake but sees the phone turning away', () => {
    const W2 = 160;
    const H2 = 120;
    const scene = (offset: number) => {
      const g = new Float32Array(W2 * H2);
      for (let y = 0; y < H2; y += 1) {
        for (let x = 0; x < W2; x += 1) g[y * W2 + x] = x + offset < 80 ? 20 : x % 4 < 2 ? 60 : 220;
      }
      return g;
    };
    const a = scene(0);
    expect(frameDifference(a, a, W2, H2)).toBe(0);
    expect(frameDifference(a, scene(1), W2, H2)).toBeLessThan(0.06);
    expect(frameDifference(a, scene(40), W2, H2)).toBeGreaterThan(0.06);
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

  it('forgives a brief wobble but starts over when the phone keeps moving', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0));
    expect(tracker.update(sample(100, { difference: 0.2 })).problem).toBe(null);
    expect(tracker.update(sample(STEADY_MS)).capture).toBe(true);

    const moving = new SteadyTracker();
    moving.update(sample(0));
    moving.update(sample(100, { difference: 0.2 }));
    moving.update(sample(200, { difference: 0.2 }));
    expect(moving.update(sample(300, { difference: 0.2 })).problem).toBe('moving');
    expect(moving.update(sample(STEADY_MS)).capture).toBe(false);
  });

  it('judges blur against the sharpest frame seen so far', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0, { sharpness: 1000 }));
    expect(tracker.update(sample(100, { sharpness: 300 })).problem).toBe('blurry');
    expect(tracker.update(sample(200, { sharpness: 550 })).problem).toBe(null);
  });

  it('waits for a frame close to the sharpest of the hold', () => {
    const tracker = new SteadyTracker();
    tracker.update(sample(0, { sharpness: 800 }));
    expect(tracker.update(sample(STEADY_MS, { sharpness: 600 })).capture).toBe(false);
    expect(tracker.update(sample(STEADY_MS + 100, { sharpness: 780 })).capture).toBe(true);
    // ...but not forever.
    const t2 = new SteadyTracker();
    t2.update(sample(0, { sharpness: 800 }));
    expect(t2.update(sample(STEADY_MS + 500, { sharpness: 600 })).capture).toBe(true);
  });

  it('flags poor light', () => {
    expect(new SteadyTracker().update(sample(0, { lighting: 'dark' })).problem).toBe('dark');
  });
});
