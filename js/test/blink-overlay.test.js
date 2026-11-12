import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/entities/eye-shape.js';
import { createFaceAnimator } from '../src/features/animate-face/face-animator.js';
import { createEyesController, defaultSpec } from '../src/index.js';

const { face, status } = defaultSpec;
const { layout } = face;
const blinkCfg = defaultSpec.motion.blink;
const HEIGHTS = blinkCfg.styles.narrow.map((k) => k.height);
const MIN_H = Math.min(...HEIGHTS);
const WIDEST = Math.max(...blinkCfg.styles.wide.map((k) => k.width));
const TOTAL_MS = blinkCfg.styles.narrow.reduce((sum, k) => sum + k.ms, 0);
// Middle of the closed hold (the design closes by 100 ms and holds 30 ms).
const CLOSED = 115;
// 1 kHz substeps make time exact: step(n) advances n ms.
const motion1k = (patch = {}) => ({
  ...defaultSpec.motion,
  substepHz: 1000,
  blink: { ...blinkCfg, ...patch },
});

const makeAnimator = (initialName, patch, flags = {}) =>
  createFaceAnimator({
    motion: motion1k(patch),
    random: () => 0.5,
    initial: {
      left: resolveParams(face.defaults, face.expressions[initialName], 'left'),
      right: resolveParams(face.defaults, face.expressions[initialName], 'right'),
    },
    blinking: false,
    idleGaze: false,
    ...flags,
  });

const makeController = (patch) =>
  createEyesController({
    face,
    motion: motion1k(patch),
    status,
    random: () => 0.5,
    blinking: false,
    idleGaze: false,
  });

const centreY = (eye) => (eye.top + eye.bottom) / 2;

describe('blink styles', () => {
  it('narrow keeps scaleX unchanged throughout', () => {
    const a = makeAnimator('neutral', {});
    a.blink();
    for (let t = 0; t < 340; t += 5) expect(a.step(5).left.scaleX).toBe(1);
  });

  it('wide reaches its widest while closed and 1x again at the end', () => {
    const a = makeAnimator('neutral', { style: 'wide' });
    a.blink();
    expect(a.step(CLOSED).left.scaleX).toBeCloseTo(WIDEST, 9);
    expect(a.step(250).left.scaleX).toBe(1);
  });

  it('wide merges the eyes into one line; narrow leaves two', () => {
    const closed = (style) => {
      const c = makeController({ style });
      c.blink();
      return c.step(CLOSED).geometry;
    };
    const wide = closed('wide');
    expect(wide.left.eye.right).toBeGreaterThan(wide.right.eye.left);
    const narrow = closed('narrow');
    expect(narrow.left.eye.right).toBeLessThan(narrow.right.eye.left);
  });

  it('closes to a thin line of the minimum blink height', () => {
    const c = makeController({});
    c.blink();
    const { eye } = c.step(CLOSED).geometry.left;
    expect(eye.bottom - eye.top).toBeCloseTo(layout.eyeHeight * MIN_H, 9);
  });

  it('setBlinkStyle applies from the next blink, not the one in progress', () => {
    const a = makeAnimator('neutral', {});
    a.blink();
    a.step(20);
    a.setBlinkStyle('wide');
    expect(a.step(CLOSED - 20).left.scaleX).toBe(1);
    a.step(400);
    a.blink();
    expect(a.step(CLOSED).left.scaleX).toBeCloseTo(WIDEST, 9);
  });

  it('rejects an unknown style', () => {
    const a = makeAnimator('neutral', {});
    expect(() => a.setBlinkStyle('nope')).toThrow(/Unknown blink style/);
    expect(() => makeController({}).setBlinkStyle('nope')).toThrow(/Unknown blink style/);
  });

  it('the style holds for both halves of a double blink', () => {
    const a = makeAnimator('neutral', { doubleBlinkChance: 1 });
    a.blink();
    a.setBlinkStyle('wide');
    expect(a.step(TOTAL_MS + blinkCfg.doubleBlinkGapMs + CLOSED).left.scaleX).toBe(1);
  });
});

describe('levelling and lid clearing at closure', () => {
  it('clears every lid parameter on an angry face', () => {
    const a = makeAnimator('angry', {});
    a.blink();
    const closed = a.step(CLOSED);
    for (const side of ['left', 'right']) {
      for (const key of ['upperLid', 'upperLidTilt', 'lowerLid', 'lowerLidBend']) {
        expect(closed[side][key]).toBe(0);
      }
    }
  });

  it('keeps lids at the start of the blink and restores them afterwards', () => {
    const a = makeAnimator('angry', {});
    const rest = a.frame();
    a.blink();
    expect(a.step(10).left.upperLid).toBeCloseTo(rest.left.upperLid, 9);
    expect(a.step(500).left.upperLid).toBe(rest.left.upperLid);
  });

  it.each(['narrow', 'wide'])('skeptic closes to level lines of equal thickness (%s)', (style) => {
    const c = makeController({ style });
    c.setExpression('skeptic');
    c.step(10000);
    c.blink();
    const { left, right } = c.step(CLOSED).geometry;
    expect(centreY(left.eye)).toBeCloseTo(centreY(right.eye), 9);
    expect(left.eye.bottom - left.eye.top).toBeCloseTo(right.eye.bottom - right.eye.top, 9);
  });

  it('levelling begins only below levelFrom', () => {
    const c = makeController({});
    c.setExpression('skeptic');
    c.step(10000);
    const rest = c.step(0).geometry;
    c.blink();
    expect(blinkCfg.styles.narrow[0].height).toBeGreaterThan(blinkCfg.levelFrom);
    const early = c.step(20).geometry; // still above levelFrom after the first keyframe
    expect(early.left.upperLid[3][1]).not.toBe(early.right.upperLid[3][1]);
    expect(centreY(early.left.eye) - centreY(early.right.eye)).toBeCloseTo(
      (centreY(rest.left.eye) - centreY(rest.right.eye)) * 1,
      0,
    );
  });
});

describe('anchor', () => {
  const atClosure = (options, patch) => {
    const c = makeController(patch);
    c.blink(options);
    return c.step(CLOSED).geometry.left.eye;
  };
  const half = (1 - MIN_H) * layout.eyeHeight * 0.5;

  it('-1 forms the line at the top edge, +1 at the bottom, 0 at the centre', () => {
    expect(centreY(atClosure({ anchor: -1 }))).toBeCloseTo(50 - half, 9);
    expect(centreY(atClosure({ anchor: 1 }))).toBeCloseTo(50 + half, 9);
    expect(centreY(atClosure({ anchor: 0 }))).toBeCloseTo(50, 9);
  });

  it('blink() without options uses the motion default anchor', () => {
    expect(centreY(atClosure(undefined, { anchor: 0.5 }))).toBeCloseTo(50 + 0.5 * half, 9);
    expect(centreY(atClosure({}, { anchor: 0.5 }))).toBeCloseTo(50 + 0.5 * half, 9);
    expect(centreY(atClosure({ anchor: -1 }, { anchor: 0.5 }))).toBeCloseTo(50 - half, 9);
  });

  it('automatic blinks use the default anchor', () => {
    const c = createEyesController({
      face,
      motion: motion1k({ anchor: 1, intervalMs: [100, 100], doubleBlinkChance: 0 }),
      status,
      random: () => 0.5,
      blinking: true,
      idleGaze: false,
    });
    expect(centreY(c.step(100 + CLOSED).geometry.left.eye)).toBeGreaterThan(50 + 10);
  });

  it('holds for both halves of a double blink', () => {
    const c = makeController({ doubleBlinkChance: 1 });
    c.blink({ anchor: -1 });
    const second = c.step(TOTAL_MS + blinkCfg.doubleBlinkGapMs + CLOSED).geometry.left.eye;
    expect(centreY(second)).toBeLessThan(50 - 10);
  });

  it('rejects an out-of-range or malformed option', () => {
    const c = makeController({});
    expect(() => c.blink({ anchor: 2 })).toThrow(/anchor/);
    expect(() => c.blink({ anchor: 'x' })).toThrow(/anchor/);
    expect(() => c.blink({ nope: 1 })).toThrow(/unknown key/);
  });
});
