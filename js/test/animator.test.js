import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/entities/eye-shape.js';
import { createFaceAnimator } from '../src/features/animate-face/face-animator.js';
import { defaultSpec } from '../src/index.js';

const { face, motion } = defaultSpec;
const HMS = 1000 / 240;
const preset = (name) => ({
  left: resolveParams(face.defaults, face.expressions[name], 'left'),
  right: resolveParams(face.defaults, face.expressions[name], 'right'),
});

function scripted(values) {
  let used = 0;
  const random = () => {
    if (used >= values.length) throw new Error('exhausted');
    return values[used++];
  };
  random.used = () => used;
  return random;
}

const make = (values, options = {}) => {
  const random = scripted(values);
  const animator = createFaceAnimator({
    motion,
    random,
    initial: preset('neutral'),
    ...options,
  });
  return { animator, random };
};

describe('construction and draw order', () => {
  it('always draws blink then saccade, whatever the flags', () => {
    const { animator, random } = make([0, 0], { blinking: false, idleGaze: false });
    expect(random.used()).toBe(2);
    expect(animator.msUntilNextEvent()).toBe(Infinity);
  });

  it('seeds timers from steps(lerp(interval, r))', () => {
    // blink: 2000ms -> 480 steps; saccade: 1200ms -> 288 steps (the sooner one wins).
    const { animator } = make([0, 0]);
    expect(animator.msUntilNextEvent()).toBeCloseTo(288 * HMS, 9);
    const only = make([0, 1 - 1e-12], { idleGaze: false }).animator;
    expect(only.msUntilNextEvent()).toBeCloseTo(480 * HMS, 9);
  });

  it('manual blink draws rDouble then rNext and schedules the next blink', () => {
    const { animator, random } = make([0.5, 0.5, 0.1, 0], { idleGaze: false });
    animator.blink();
    expect(random.used()).toBe(4);
    // double (rDouble 0.1 < 0.15): steps(510)=122; next interval steps(2000)=480.
    expect(animator.msUntilNextEvent()).toBeCloseTo((122 + 480) * HMS, 9);
  });

  it('a non-double blink uses the single duration', () => {
    const { animator } = make([0.5, 0.5, 0.9, 0], { idleGaze: false });
    animator.blink();
    expect(animator.msUntilNextEvent()).toBeCloseTo((50 + 480) * HMS, 9); // steps(210)=50
  });

  it('blink() during a blink is a no-op without draws', () => {
    const { animator, random } = make([0.5, 0.5, 0.9, 0], { idleGaze: false });
    animator.blink();
    animator.step(30);
    animator.blink();
    expect(random.used()).toBe(4);
  });

  it('draws rx, ry, rNext when a saccade fires', () => {
    const { animator, random } = make([0.5, 0, 0.75, 0.25, 0.5], { blinking: false });
    animator.step(1200); // 288 substeps, saccade fires on the last one
    expect(random.used()).toBe(5);
  });

  it('throws when the random source is exhausted', () => {
    const { animator } = make([0, 0], { blinking: false });
    expect(() => animator.step(2000)).toThrow('exhausted');
  });
});

describe('determinism and stepping', () => {
  const run = () => {
    const { animator } = make([0.3, 0.6, 0.2, 0.9, 0.5, 0.4, 0.7, 0.1, 0.8, 0.5, 0.5, 0.5]);
    animator.setTarget(preset('angry'));
    const frames = [];
    for (const dt of [16.6, 33.4, 7, 250, 16.6, 1000, 3000]) frames.push(animator.step(dt));
    return frames;
  };

  it('same randoms and ops give identical frames', () => {
    expect(run()).toEqual(run());
  });

  it('step(0), negative and NaN dt change nothing', () => {
    const { animator } = make([0, 0]);
    animator.setTarget(preset('happy'));
    const before = animator.step(20);
    expect(animator.step(0)).toEqual(before);
    expect(animator.step(-100)).toEqual(before);
    expect(animator.step(Number.NaN)).toEqual(before);
  });

  it('carries sub-substep remainders between calls', () => {
    const a = make([0, 0], { blinking: false, idleGaze: false }).animator;
    const b = make([0, 0], { blinking: false, idleGaze: false }).animator;
    a.setTarget(preset('angry'));
    b.setTarget(preset('angry'));
    a.step(HMS * 2.5);
    const fa = a.step(HMS * 2.5);
    const fb = b.step(HMS * 5);
    expect(fa.left.upperLid).toBeCloseTo(fb.left.upperLid, 12);
  });

  it('clamps huge dt to maxStepMs', () => {
    const a = make([0, 0], { blinking: false, idleGaze: false }).animator;
    const b = make([0, 0], { blinking: false, idleGaze: false }).animator;
    a.setTarget(preset('sad'));
    b.setTarget(preset('sad'));
    expect(a.step(1e9)).toEqual(b.step(10000));
  });
});

describe('transitions', () => {
  const quiet = { blinking: false, idleGaze: false };

  it('settles on the target and reports it', () => {
    const { animator } = make([0, 0], quiet);
    expect(animator.isSettled()).toBe(true);
    animator.setTarget(preset('surprised'));
    expect(animator.isSettled()).toBe(false);
    const frame = animator.step(10000);
    expect(animator.isSettled()).toBe(true);
    expect(frame.left.scaleY).toBeCloseTo(1.2, 3);
  });

  it('is interruptible: values and velocities survive setTarget', () => {
    const { animator } = make([0, 0], quiet);
    animator.setTarget(preset('angry'));
    animator.step(60);
    const before = animator.frame();
    animator.setTarget(preset('happy'));
    expect(animator.frame()).toEqual(before);
    const after = animator.step(HMS);
    // Velocity toward 'angry' (upperLid rising) persists for at least one substep.
    expect(after.left.upperLid).toBeGreaterThan(before.left.upperLid);
  });

  it('overshoots by default but not under reduced motion', () => {
    const peak = (reducedMotion) => {
      const { animator } = make([0, 0], { ...quiet, reducedMotion });
      animator.setTarget(preset('surprised'));
      let max = 0;
      for (let i = 0; i < 300; i += 1) max = Math.max(max, animator.step(HMS).left.scaleY);
      return max;
    };
    expect(peak(false)).toBeGreaterThan(1.2 + 1e-3);
    expect(peak(true)).toBeLessThanOrEqual(1.2);
  });

  it('setSprings changes subsequent dynamics', () => {
    const slow = make([0, 0], quiet).animator;
    const fast = make([0, 0], quiet).animator;
    fast.setSprings({ expression: { stiffness: 2000 } });
    slow.setTarget(preset('angry'));
    fast.setTarget(preset('angry'));
    expect(fast.step(50).left.upperLid).toBeGreaterThan(slow.step(50).left.upperLid);
  });
});

describe('blink overlay', () => {
  it('scales eye height by the blink factor and ends back at 1', () => {
    const { animator } = make([0.5, 0.5, 0.9, 0.5], { idleGaze: false });
    animator.blink();
    expect(animator.frame().left.scaleY).toBe(1);
    const mid = animator.step(80); // inside the hold window
    expect(mid.left.scaleY).toBeCloseTo(0.1, 6);
    expect(mid.right.scaleY).toBeCloseTo(0.1, 6);
    expect(animator.isSettled()).toBe(false);
    const end = animator.step(200);
    expect(end.left.scaleY).toBe(1);
    expect(animator.isSettled()).toBe(true);
  });
});

describe('gaze', () => {
  const quiet = { blinking: false, idleGaze: false };

  it('glance moves both eyes the same way and returns after the hold', () => {
    const { animator } = make([0, 0], quiet);
    animator.glance({ x: 1, y: -1 });
    const f = animator.step(700);
    expect(f.left.offsetX).toBeGreaterThan(0.2);
    expect(f.right.offsetX).toBeCloseTo(f.left.offsetX, 12);
    expect(f.left.offsetY).toBeLessThan(-0.1);
    expect(animator.isSettled()).toBe(false);
    animator.step(900);
    animator.step(5000);
    expect(animator.frame().left.offsetX).toBeCloseTo(0, 3);
    expect(animator.isSettled()).toBe(true);
  });

  it('glance is ignored under reduced motion', () => {
    const { animator } = make([0, 0], { ...quiet, reducedMotion: true });
    animator.glance({ x: 1, y: 1 });
    expect(animator.step(300).left.offsetX).toBe(0);
    expect(animator.msUntilNextEvent()).toBe(Infinity);
  });

  it('saccades are frozen while a glance holds', () => {
    const { animator } = make([0.5, 0, 0.5, 0.5, 0.5], { blinking: false });
    animator.glance({ x: 0, y: 0 });
    animator.step(120 * HMS);
    expect(animator.msUntilNextEvent()).toBeCloseTo(96 * HMS, 6); // glance: 216 - 120 steps
    animator.step(96 * HMS);
    // Glance expired; the saccade timer is still at its full 288 steps.
    expect(animator.msUntilNextEvent()).toBeCloseTo(288 * HMS, 6);
  });

  it('turning idle gaze on draws a new saccade interval', () => {
    const { animator, random } = make([0, 0, 0], { blinking: false, idleGaze: false });
    animator.setIdleGaze(true);
    expect(random.used()).toBe(3);
    expect(animator.msUntilNextEvent()).toBeCloseTo(288 * HMS, 9);
  });

  it('reduced motion cancels saccades and a glance in progress', () => {
    const { animator } = make([0, 0], { blinking: false });
    animator.glance({ x: 1, y: 0 });
    animator.setReducedMotion(true);
    expect(animator.msUntilNextEvent()).toBe(Infinity);
    animator.step(5000);
    expect(animator.frame().left.offsetX).toBeCloseTo(0, 3);
  });
});

describe('blinking flag', () => {
  it('setBlinking(true) draws once; same value is a no-op', () => {
    const { animator, random } = make([0, 0, 0], { blinking: false, idleGaze: false });
    animator.setBlinking(false);
    expect(random.used()).toBe(2);
    animator.setBlinking(true);
    expect(random.used()).toBe(3);
    expect(animator.msUntilNextEvent()).toBeCloseTo(480 * HMS, 9);
  });

  it('setBlinking(false) lets an in-progress blink finish', () => {
    const { animator } = make([0.5, 0.5, 0.9, 0.5], { idleGaze: false });
    animator.blink();
    animator.setBlinking(false);
    expect(animator.msUntilNextEvent()).toBe(Infinity);
    animator.step(80);
    expect(animator.frame().left.scaleY).toBeCloseTo(0.1, 6);
  });
});
