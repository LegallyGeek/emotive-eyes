import { describe, expect, it } from 'vitest';
import { clampParams, resolveParams } from '../src/entities/eye-shape.js';
import { computeEyeGeometry, computeFaceGeometry } from '../src/entities/geometry.js';
import { defaultSpec } from '../src/index.js';

const { face } = defaultSpec;
const layout = face.layout;
const params = (overrides = {}) => ({ ...face.defaults, ...overrides });
const sides = (expressionName) => ({
  left: resolveParams(face.defaults, face.expressions[expressionName], 'left'),
  right: resolveParams(face.defaults, face.expressions[expressionName], 'right'),
});

describe('lid tilt direction', () => {
  it('angry drops the inner corners on both eyes', () => {
    const g = computeFaceGeometry(sides('angry'), layout);
    // Left eye: inner edge is its right edge; right eye: inner edge is its left edge.
    const [, , leftInner, leftOuter] = g.left.upperLid;
    const [, , rightOuter, rightInner] = g.right.upperLid;
    expect(leftInner[1]).toBeGreaterThan(leftOuter[1]);
    expect(rightInner[1]).toBeGreaterThan(rightOuter[1]);
  });

  it('sad drops the outer corners on both eyes', () => {
    const g = computeFaceGeometry(sides('sad'), layout);
    const [, , leftInner, leftOuter] = g.left.upperLid;
    const [, , rightOuter, rightInner] = g.right.upperLid;
    expect(leftOuter[1]).toBeGreaterThan(leftInner[1]);
    expect(rightOuter[1]).toBeGreaterThan(rightInner[1]);
  });

  it('matches the hand-computed drop for a 45 degree tilt', () => {
    const g = computeEyeGeometry(params({ upperLid: 0.5, upperLidTilt: 45 }), layout, 'left');
    const lidY = g.eye.top + layout.eyeHeight * 0.5;
    const drop = layout.eyeWidth / 2; // tan(45deg) = 1
    expect(g.upperLid[2][1]).toBeCloseTo(lidY + drop, 9);
    expect(g.upperLid[3][1]).toBeCloseTo(lidY - drop, 9);
  });
});

describe('lower lid', () => {
  it('peaks at half the control offset above the lid line', () => {
    const bend = 0.55;
    const lowerLid = 0.42;
    const g = computeEyeGeometry(params({ lowerLid, lowerLidBend: bend }), layout, 'left');
    const eh = layout.eyeHeight;
    const lowY = g.eye.bottom - eh * lowerLid;
    const { edgeLeft, control, edgeRight } = g.lowerLid;
    expect(control[1]).toBeCloseTo(lowY - eh * bend, 9);
    const peakY = 0.25 * edgeLeft[1] + 0.5 * control[1] + 0.25 * edgeRight[1];
    expect(peakY).toBeCloseTo(lowY - 0.5 * eh * bend, 9);
  });

  it('glee peaks at half its control offset above the lid line', () => {
    const { left } = sides('glee');
    const g = computeEyeGeometry(left, layout, 'left');
    const eh = layout.eyeHeight * left.scaleY;
    const lowY = g.eye.bottom - eh * left.lowerLid;
    const { edgeLeft, control, edgeRight } = g.lowerLid;
    const peakY = 0.25 * edgeLeft[1] + 0.5 * control[1] + 0.25 * edgeRight[1];
    expect(peakY).toBeCloseTo(lowY - 0.5 * eh * left.lowerLidBend, 9);
    expect(peakY).toBeLessThan(lowY);
  });

  it('keeps the polygon below the control point so it never self-intersects', () => {
    const g = computeEyeGeometry(params({ lowerLid: 0.3, lowerLidBend: 1 }), layout, 'right');
    expect(g.lowerLid.start[1]).toBeGreaterThanOrEqual(g.lowerLid.control[1]);
    expect(g.lowerLid.end[1]).toBeGreaterThanOrEqual(g.lowerLid.control[1]);
  });
});

describe('upper lid polygon', () => {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);

  it.each(['left', 'right'])('is convex at upperLid 0 and tilt 30 (%s eye)', (side) => {
    const { upperLid } = computeEyeGeometry(
      params({ upperLid: 0, upperLidTilt: 30 }),
      layout,
      side,
    );
    const signs = upperLid.map((_, i) =>
      Math.sign(cross(upperLid[i], upperLid[(i + 1) % 4], upperLid[(i + 2) % 4])),
    );
    expect(new Set(signs).size).toBe(1);
    expect(signs[0]).not.toBe(0);
  });
});

describe('clamps', () => {
  it('clamps lids, tilt, bend and non-negative scale/roundness', () => {
    const c = clampParams(
      params({
        upperLid: 2,
        lowerLid: -1,
        upperLidTilt: 90,
        lowerLidBend: -3,
        scaleX: -1,
        scaleY: -1,
        roundness: -2,
      }),
    );
    expect(c).toMatchObject({
      upperLid: 1,
      lowerLid: 0,
      upperLidTilt: 45,
      lowerLidBend: -1,
      scaleX: 0,
      scaleY: 0,
      roundness: 0,
    });
  });

  it('caps the corner radius at half the smaller side', () => {
    const g = computeEyeGeometry(params({ roundness: 50 }), layout, 'left');
    expect(g.eye.radius).toBe(layout.eyeWidth / 2);
  });

  it('uses roundness times height when below the cap', () => {
    const g = computeEyeGeometry(params({ roundness: 0.3 }), layout, 'left');
    expect(g.eye.radius).toBeCloseTo(0.3 * layout.eyeHeight, 9);
  });

  it('collapses to a point at zero scale without NaN', () => {
    const g = computeEyeGeometry(params({ scaleX: 0, scaleY: 0 }), layout, 'left');
    expect(g.eye.right - g.eye.left).toBe(0);
    expect(JSON.stringify(g)).not.toContain('null');
  });
});

describe('layout and offsets', () => {
  it('centres each eye on its layout position', () => {
    const g = computeFaceGeometry({ left: params(), right: params() }, layout);
    expect((g.left.eye.left + g.left.eye.right) / 2).toBe(layout.eyes.left.x);
    expect((g.right.eye.left + g.right.eye.right) / 2).toBe(layout.eyes.right.x);
    expect((g.left.eye.top + g.left.eye.bottom) / 2).toBe(50);
  });

  it('offsets are not mirrored', () => {
    const g = computeFaceGeometry(
      { left: params({ offsetX: 0.1 }), right: params({ offsetX: 0.1 }) },
      layout,
    );
    const shift = 0.1 * layout.eyeWidth;
    expect(g.left.eye.left).toBeCloseTo(layout.eyes.left.x - layout.eyeWidth / 2 + shift, 9);
    expect(g.right.eye.left).toBeCloseTo(layout.eyes.right.x - layout.eyeWidth / 2 + shift, 9);
  });
});

describe('resolveParams', () => {
  it('layers defaults, shared keys, then the side override', () => {
    const expr = { upperLid: 0.2, left: { upperLid: 0.5 }, right: { scaleY: 2 } };
    expect(resolveParams(face.defaults, expr, 'left').upperLid).toBe(0.5);
    expect(resolveParams(face.defaults, expr, 'right').upperLid).toBe(0.2);
    expect(resolveParams(face.defaults, expr, 'right').scaleY).toBe(2);
    expect(resolveParams(face.defaults, expr, 'left').scaleY).toBe(1);
  });

  it('lets an explicit zero override a non-zero default', () => {
    expect(resolveParams(face.defaults, { roundness: 0 }, 'left').roundness).toBe(0);
  });
});
