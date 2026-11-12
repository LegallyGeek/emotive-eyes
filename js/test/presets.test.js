import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/entities/eye-shape.js';
import { computeFaceGeometry } from '../src/entities/geometry.js';
import { defaultSpec } from '../src/index.js';

const { face } = defaultSpec;
const { layout } = face;

const restGeometry = (name) =>
  computeFaceGeometry(
    {
      left: resolveParams(face.defaults, face.expressions[name], 'left'),
      right: resolveParams(face.defaults, face.expressions[name], 'right'),
    },
    layout,
  );

describe.each(Object.keys(face.expressions))('preset %s at rest', (name) => {
  const g = restGeometry(name);

  it('keeps at least 2 units between the eyes', () => {
    expect(g.right.eye.left - g.left.eye.right).toBeGreaterThanOrEqual(2);
  });

  it('lies inside the face', () => {
    for (const { eye } of [g.left, g.right]) {
      expect(eye.left).toBeGreaterThanOrEqual(0);
      expect(eye.top).toBeGreaterThanOrEqual(0);
      expect(eye.right).toBeLessThanOrEqual(layout.width);
      expect(eye.bottom).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe('preset distinctness', () => {
  const resolved = (name) => ({
    left: resolveParams(face.defaults, face.expressions[name], 'left'),
    right: resolveParams(face.defaults, face.expressions[name], 'right'),
  });
  const names = Object.keys(face.expressions);

  it('has 32 presets, every one different from every other', () => {
    expect(names).toHaveLength(32);
    const keys = names.map((n) => JSON.stringify(resolved(n)));
    expect(new Set(keys).size).toBe(names.length);
  });

  it.each([
    ['joy', 'happy'],
    ['joy', 'glee'],
    ['bliss', 'glee'],
    ['captivated', 'awe'],
    ['startled', 'surprised'],
    ['shocked', 'surprised'],
    ['concerned', 'worried'],
    ['hurt', 'concerned'],
    ['introspective', 'sad'],
    ['bothered', 'annoyed'],
    ['scrutinizing', 'suspicious'],
    ['scrutinizing', 'skeptic'],
    ['asleep', 'sleepy'],
  ])('%s differs visibly from %s', (a, b) => {
    const ga = restGeometry(a);
    const gb = restGeometry(b);
    const size = (g) => (g.left.eye.right - g.left.eye.left) * (g.left.eye.bottom - g.left.eye.top);
    const lid = (g) =>
      g.left.upperLid[3][1] - g.left.eye.top + (g.left.lowerLid.edgeLeft[1] - g.left.eye.bottom);
    const differs =
      Math.abs(size(ga) - size(gb)) > 50 ||
      Math.abs(lid(ga) - lid(gb)) > 4 ||
      JSON.stringify(resolved(a).left) !== JSON.stringify(resolved(b).left) ||
      JSON.stringify(resolved(a).right) !== JSON.stringify(resolved(b).right);
    expect(differs).toBe(true);
  });
});

describe('preset semantics', () => {
  it('neutral has a Cozmo-like near-touching gap', () => {
    const g = restGeometry('neutral');
    const gap = g.right.eye.left - g.left.eye.right;
    expect(gap / layout.eyeWidth).toBeGreaterThan(0.1);
    expect(gap / layout.eyeWidth).toBeLessThan(0.3);
  });

  it('skeptic is lopsided and suspicious is symmetric', () => {
    const skeptic = restGeometry('skeptic');
    expect(skeptic.left.eye.bottom - skeptic.left.eye.top).not.toBeCloseTo(
      skeptic.right.upperLid[3][1] - skeptic.right.eye.top,
      3,
    );
    const params = (n, side) => resolveParams(face.defaults, face.expressions[n], side);
    expect(params('skeptic', 'left')).not.toEqual(params('skeptic', 'right'));
    expect(params('suspicious', 'left')).toEqual(params('suspicious', 'right'));
  });

  it('happy is a flat-bottomed dome and glee a crescent with a bowed lower edge', () => {
    expect(face.expressions.happy.lowerLidBend ?? 0).toBe(0);
    expect(face.expressions.glee.lowerLidBend).toBeGreaterThan(0);
    expect(face.expressions.happy.lowerLid).toBeGreaterThan(0.3);
  });

  it('scaling presets push the eyes apart with opposite offsets', () => {
    for (const name of ['surprised', 'awe', 'furious']) {
      const { left, right } = face.expressions[name];
      expect(left.offsetX).toBeLessThan(0);
      expect(right.offsetX).toBeGreaterThan(0);
    }
  });
});
