import { describe, expect, it } from 'vitest';
import { blinkDuration, blinkLevel, blinkSample, blinkTotalMs } from '../src/entities/blink.js';
import { defaultSpec } from '../src/index.js';

const { styles, doubleBlinkGapMs: gap } = defaultSpec.motion.blink;
const wide = styles.wide;

const total = (table) => table.reduce((sum, k) => sum + k.ms, 0);
const minHeight = Math.min(...wide.map((k) => k.height));
// Time at which the closed hold begins: the first keyframe reaching the minimum height.
const closedStart = (() => {
  let t = 0;
  for (const k of wide) {
    t += k.ms;
    if (k.height === minHeight) return t;
  }
  return t;
})();

describe('blink keyframe timeline', () => {
  it('is (1, 1) before the start and from the end on', () => {
    for (const t of [-5, -0.001]) {
      expect(blinkSample(t, wide, gap, false)).toEqual({ height: 1, width: 1 });
    }
    const d = total(wide);
    expect(blinkSample(d, wide, gap, false)).toEqual({ height: 1, width: 1 });
    expect(blinkSample(9000, wide, gap, false)).toEqual({ height: 1, width: 1 });
  });

  it.each(['narrow', 'wide'])('passes through every keyframe value at its time (%s)', (name) => {
    const table = styles[name];
    expect(blinkSample(0, table, gap, false)).toEqual({ height: 1, width: 1 });
    let t = 0;
    for (const k of table) {
      t += k.ms;
      const sample = blinkSample(t, table, gap, false);
      // Keyframe values are reached at the end of their segment; the last one is the (1, 1) rest.
      if (k === table.at(-1)) expect(sample).toEqual({ height: 1, width: 1 });
      else {
        const next = blinkSample(t + 1e-9, table, gap, false);
        expect(next.height).toBeCloseTo(k.height, 6);
        expect(next.width).toBeCloseTo(k.width, 6);
      }
    }
  });

  it('interpolates linearly between keyframes', () => {
    const [a, b] = wide;
    const mid = blinkSample(a.ms / 2, wide, gap, false);
    expect(mid.height).toBeCloseTo((1 + a.height) / 2, 9);
    expect(mid.width).toBeCloseTo((1 + a.width) / 2, 9);
    const between = blinkSample(a.ms + b.ms / 2, wide, gap, false);
    expect(between.height).toBeCloseTo((a.height + b.height) / 2, 9);
  });

  it('lasts 300-360 ms; a double blink lasts twice that plus the gap', () => {
    const d = blinkDuration(wide);
    expect(d).toBeGreaterThanOrEqual(300);
    expect(d).toBeLessThanOrEqual(360);
    expect(blinkDuration(styles.narrow)).toBe(d);
    expect(blinkTotalMs(wide, gap, false)).toBe(d);
    expect(blinkTotalMs(wide, gap, true)).toBe(2 * d + gap);
  });

  it('closes quickly, holds closed briefly, then opens more slowly', () => {
    expect(minHeight).toBeGreaterThan(0);
    expect(minHeight).toBeLessThanOrEqual(0.06);
    const holdMs = wide.find(
      (k, i) => k.height === minHeight && i > 0 && wide[i - 1].height === minHeight,
    )?.ms;
    expect(holdMs).toBeGreaterThan(0);
    expect(closedStart).toBeLessThan(total(wide) - closedStart - holdMs);
  });

  it('is smooth: heights fall monotonically to the minimum and rise monotonically after it', () => {
    let t = 0;
    let prev = 1;
    for (const k of wide) {
      t += k.ms;
      if (t <= closedStart) expect(k.height).toBeLessThanOrEqual(prev);
      else expect(k.height).toBeGreaterThanOrEqual(prev);
      prev = k.height;
    }
  });

  it('double blink repeats the table after the gap', () => {
    const d = blinkDuration(wide);
    expect(blinkSample(d + gap / 2, wide, gap, true)).toEqual({ height: 1, width: 1 });
    const closed = blinkSample(closedStart + 5, wide, gap, false);
    const second = blinkSample(d + gap + closedStart + 5, wide, gap, true);
    expect(second.height).toBeCloseTo(closed.height, 9);
    expect(second.width).toBeCloseTo(closed.width, 9);
    expect(blinkSample(2 * d + gap, wide, gap, true)).toEqual({ height: 1, width: 1 });
    expect(blinkSample(closedStart + 5, wide, gap, true).height).toBeCloseTo(minHeight, 9);
  });

  it('narrow keeps every width at 1 and shares the wide heights and durations', () => {
    expect(styles.narrow.map((k) => k.width)).toEqual(styles.narrow.map(() => 1));
    expect(styles.narrow.map((k) => [k.height, k.ms])).toEqual(wide.map((k) => [k.height, k.ms]));
    expect(blinkSample(closedStart + 5, styles.narrow, gap, false)).toEqual({
      height: minHeight,
      width: 1,
    });
  });

  it('wide widens only as the eye closes and is widest while closed', () => {
    const widest = Math.max(...wide.map((k) => k.width));
    expect(blinkSample(closedStart + 5, wide, gap, false).width).toBe(widest);
    // Wide enough that two eyes 62 units apart merge and the pair spans the 200-unit face.
    expect(widest * 52).toBeGreaterThan(2 * 69 + 52);
    for (const k of wide.slice(0, -1)) expect(k.width).toBeGreaterThanOrEqual(1);
  });
});

describe('blink levelling', () => {
  const { levelFrom, levelTo } = defaultSpec.motion.blink;

  it('is 0 at or above levelFrom and 1 at or below levelTo', () => {
    expect(blinkLevel(1, levelFrom, levelTo)).toBe(0);
    expect(blinkLevel(levelFrom, levelFrom, levelTo)).toBe(0);
    expect(blinkLevel(levelTo, levelFrom, levelTo)).toBe(1);
    expect(blinkLevel(levelTo / 2, levelFrom, levelTo)).toBe(1);
    expect(blinkLevel((levelFrom + levelTo) / 2, levelFrom, levelTo)).toBeCloseTo(0.5, 12);
  });

  it('starts fading early: well before the eye is half closed', () => {
    expect(levelFrom).toBeGreaterThanOrEqual(0.8);
    expect(levelTo).toBeLessThan(levelFrom);
  });
});
