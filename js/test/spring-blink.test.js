import { describe, expect, it } from 'vitest';
import { blinkCurve, blinkFactor, blinkTotalMs } from '../src/entities/blink.js';
import { createSpring, criticalDamping, stepSpring } from '../src/entities/spring.js';
import { intervalSteps, lerp, steps } from '../src/entities/timing.js';

describe('timing helpers', () => {
  it('lerp follows a + (b - a) * r', () => {
    expect(lerp(2, 10, 0.25)).toBe(4);
  });

  it('steps rounds half up', () => {
    expect(steps(25, 100)).toBe(3); // 2.5 -> 3 (half-to-even would give 2)
    expect(steps(35, 100)).toBe(4); // 3.5 -> 4
    expect(steps(24, 100)).toBe(2);
    expect(steps(2000, 240)).toBe(480);
  });

  it('intervalSteps draws within the interval', () => {
    expect(intervalSteps([2000, 6000], 0, 240)).toBe(480);
    expect(intervalSteps([2000, 6000], 0.5, 240)).toBe(960);
  });
});

describe('spring', () => {
  const run = (stiffness, damping, n = 2400, hz = 240) => {
    const s = { ...createSpring(0), target: 1 };
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      stepSpring(s, stiffness, damping, 1 / hz);
      max = Math.max(max, s.value);
    }
    return { s, max };
  };

  it('uses semi-implicit Euler in the contract order', () => {
    const s = { value: 0, velocity: 0, target: 1 };
    stepSpring(s, 100, 10, 0.1);
    expect(s.velocity).toBeCloseTo(10, 12); // a = 100 * 1, v = a * h
    expect(s.value).toBeCloseTo(1, 12); // x += v_new * h
  });

  it('converges and overshoots when underdamped', () => {
    const { s, max } = run(220, 16);
    expect(max).toBeGreaterThan(1.05);
    expect(s.value).toBeCloseTo(1, 4);
  });

  it('does not overshoot when critically damped', () => {
    const { s, max } = run(220, criticalDamping(220));
    expect(max).toBeLessThanOrEqual(1);
    expect(s.value).toBeCloseTo(1, 3);
  });

  it('critical damping is 2 * sqrt(stiffness)', () => {
    expect(criticalDamping(100)).toBe(20);
  });
});

describe('blink timeline', () => {
  const cfg = { closeMs: 70, holdMs: 20, openMs: 120, minScale: 0.1, doubleBlinkGapMs: 90 };

  it('is 1 before the start and after the end', () => {
    expect(blinkCurve(-1, cfg)).toBe(1);
    expect(blinkCurve(0, cfg)).toBe(1);
    expect(blinkCurve(210, cfg)).toBe(1);
    expect(blinkCurve(5000, cfg)).toBe(1);
  });

  it('reaches minScale and holds it', () => {
    expect(blinkCurve(70, cfg)).toBe(0.1);
    expect(blinkCurve(89.999, cfg)).toBe(0.1);
    expect(blinkCurve(35, cfg)).toBeCloseTo(1 - 0.9 * 0.25, 12);
  });

  it('opens with an ease-out curve', () => {
    expect(blinkCurve(90, cfg)).toBeCloseTo(0.1, 12);
    expect(blinkCurve(150, cfg)).toBeCloseTo(0.1 + 0.9 * (1 - 0.25), 12);
  });

  it('single blink lasts D; double lasts 2D + gap', () => {
    expect(blinkTotalMs(cfg, false)).toBe(210);
    expect(blinkTotalMs(cfg, true)).toBe(510);
  });

  it('double blink repeats the curve after the gap', () => {
    expect(blinkFactor(70, cfg, true)).toBe(0.1);
    expect(blinkFactor(250, cfg, true)).toBe(1); // inside the gap
    expect(blinkFactor(210 + 90 + 70, cfg, true)).toBe(0.1);
    expect(blinkFactor(510, cfg, true)).toBe(1);
    expect(blinkFactor(70, cfg, false)).toBe(0.1);
  });
});
