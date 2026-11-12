import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SpecError,
  createEyesController,
  defaultSpec,
  parseExpression,
  parseFaceSpec,
  parseMotionSpec,
  parseSpringOverrides,
  parseStatusSpec,
  presentEye,
} from '../src/index.js';

const runtimeJson = (name) =>
  JSON.parse(readFileSync(new URL(`../../spec/runtime/${name}.json`, import.meta.url), 'utf8'));
const clone = (v) => structuredClone(v);

describe('real spec files', () => {
  it('parse and match the bundled spec', () => {
    expect(parseFaceSpec(runtimeJson('face'))).toEqual(defaultSpec.face);
    expect(parseMotionSpec(runtimeJson('motion'))).toEqual(defaultSpec.motion);
    expect(parseStatusSpec(runtimeJson('status'))).toEqual(defaultSpec.status);
  });

  it('define the 32 presets', () => {
    expect(Object.keys(defaultSpec.face.expressions).sort()).toEqual(
      [
        'neutral',
        'happy',
        'glee',
        'sad',
        'sad-up',
        'worried',
        'focused',
        'annoyed',
        'surprised',
        'skeptic',
        'frustrated',
        'unimpressed',
        'sleepy',
        'suspicious',
        'squint',
        'angry',
        'furious',
        'scared',
        'awe',
        'joy',
        'bliss',
        'captivated',
        'startled',
        'shocked',
        'concerned',
        'hurt',
        'introspective',
        'bothered',
        'scrutinizing',
        'unsure',
        'curious',
        'asleep',
      ].sort(),
    );
  });
});

describe('parser rejects bad input', () => {
  it('unknown expression keys, non-numeric values, nested keys', () => {
    expect(() => parseExpression({ bogus: 1 })).toThrow(SpecError);
    expect(() => parseExpression({ upperLid: '0.5' })).toThrow(/finite number/);
    expect(() => parseExpression({ upperLid: Number.NaN })).toThrow(SpecError);
    expect(() => parseExpression({ eyes: { upperLid: 1 } })).toThrow(/unknown parameter/);
    expect(() => parseExpression({ left: { left: {} } })).toThrow(SpecError);
    expect(() => parseExpression({ left: 3 })).toThrow(/expected an object/);
    expect(() => parseExpression(null)).toThrow(SpecError);
  });

  it('names the offending path', () => {
    const face = clone(runtimeJson('face'));
    face.expressions.happy.upperLid = 'x';
    expect(() => parseFaceSpec(face)).toThrow('face.expressions.happy.upperLid');
  });

  it('face: missing default, unknown top-level key, bad layout', () => {
    const missing = clone(runtimeJson('face'));
    delete missing.defaults.roundness;
    expect(() => parseFaceSpec(missing)).toThrow('face.defaults.roundness');
    expect(() => parseFaceSpec({ ...runtimeJson('face'), extra: 1 })).toThrow(/unknown key/);
    const layout = clone(runtimeJson('face'));
    layout.layout.eyeWidth = 0;
    expect(() => parseFaceSpec(layout)).toThrow('face.layout.eyeWidth');
  });

  it('motion: bad interval, chance and spring constants', () => {
    const m = clone(runtimeJson('motion'));
    m.blink.intervalMs = [5000, 2000];
    expect(() => parseMotionSpec(m)).toThrow(/min must be <= max/);
    const c = clone(runtimeJson('motion'));
    c.blink.doubleBlinkChance = 2;
    expect(() => parseMotionSpec(c)).toThrow('doubleBlinkChance');
    const s = clone(runtimeJson('motion'));
    s.springs.expression.stiffness = 0;
    expect(() => parseMotionSpec(s)).toThrow('stiffness');
    const anchor = clone(runtimeJson('motion'));
    anchor.blink.anchor = 1.5;
    expect(() => parseMotionSpec(anchor)).toThrow('motion.blink.anchor');
    for (const removed of ['closeMs', 'holdMs', 'openMs', 'minScale', 'stretchX']) {
      const old = clone(runtimeJson('motion'));
      old.blink[removed] = 1;
      expect(() => parseMotionSpec(old)).toThrow(`motion.blink.${removed}`);
    }
    const last = clone(runtimeJson('motion'));
    last.blink.styles.wide.at(-1).width = 2;
    expect(() => parseMotionSpec(last)).toThrow(/last keyframe/);
    const lastH = clone(runtimeJson('motion'));
    lastH.blink.styles.narrow.at(-1).height = 0.5;
    expect(() => parseMotionSpec(lastH)).toThrow(/last keyframe/);
    const kf = clone(runtimeJson('motion'));
    kf.blink.styles.wide[0].ms = 0;
    expect(() => parseMotionSpec(kf)).toThrow('.ms');
    const empty = clone(runtimeJson('motion'));
    empty.blink.styles.wide = [];
    expect(() => parseMotionSpec(empty)).toThrow(/non-empty/);
    const style = clone(runtimeJson('motion'));
    style.blink.style = 'nope';
    expect(() => parseMotionSpec(style)).toThrow('motion.blink.style');
    const level = clone(runtimeJson('motion'));
    level.blink.levelTo = level.blink.levelFrom;
    expect(() => parseMotionSpec(level)).toThrow('motion.blink.levelTo');
    const hz = clone(runtimeJson('motion'));
    delete hz.substepHz;
    expect(() => parseMotionSpec(hz)).toThrow('motion.substepHz');
  });

  it('status: duplicate severities and missing mappings', () => {
    const dup = clone(runtimeJson('status'));
    dup.severity.push('ok');
    expect(() => parseStatusSpec(dup)).toThrow(/duplicate/);
    const miss = clone(runtimeJson('status'));
    delete miss.expressionFor.error;
    expect(() => parseStatusSpec(miss)).toThrow('status.expressionFor.error');
  });

  it('spring overrides: partial allowed, junk rejected', () => {
    expect(parseSpringOverrides({ expression: { stiffness: 300 } })).toEqual({
      expression: { stiffness: 300 },
    });
    expect(() => parseSpringOverrides({ expression: { stiffness: -1 } })).toThrow(SpecError);
    expect(() => parseSpringOverrides({ gaze: { mass: 1 } })).toThrow(/unknown key/);
    expect(() => parseSpringOverrides({ other: {} })).toThrow(SpecError);
  });
});

describe('controller', () => {
  const make = (extra = {}) =>
    createEyesController({
      ...defaultSpec,
      random: () => 0.5,
      blinking: false,
      idleGaze: false,
      ...extra,
    });

  it('exposes the preset names', () => {
    expect(make().expressionNames).toContain('suspicious');
  });

  it('throws for an unknown expression name', () => {
    expect(() => make().setExpression('nope')).toThrow(/Unknown expression/);
    expect(() => make({ initialExpression: 'nope' })).toThrow(/Unknown expression/);
  });

  it('accepts partial expression objects and rejects invalid ones', () => {
    const c = make();
    c.setExpression({ upperLid: 0.5 });
    expect(c.step(5000).geometry.left.upperLid[0][1]).toBeLessThan(c.step(0).geometry.left.eye.top);
    expect(() => c.setExpression({ bogus: 1 })).toThrow(SpecError);
  });

  it('the last of setExpression / setStatuses wins', () => {
    const a = make();
    a.setStatuses([{ id: 'x', status: 'error' }]);
    a.setExpression('happy');
    const b = make();
    b.setExpression('happy');
    expect(a.step(3000).geometry).toEqual(b.step(3000).geometry);

    const c = make();
    c.setExpression('happy');
    c.setStatuses([{ id: 'x', status: 'error' }]);
    const d = make();
    d.setExpression('angry');
    expect(c.step(3000).geometry).toEqual(d.step(3000).geometry);
  });

  it('status baseline does not glance; a later change does', () => {
    const c = make();
    c.setStatuses([{ id: 'cam', status: 'ok', direction: { x: 1, y: 0 } }]);
    expect(c.isSettled()).toBe(true);
    c.setStatuses([{ id: 'cam', status: 'error', direction: { x: 1, y: 0 } }]);
    c.step(100);
    expect(c.msUntilNextEvent()).toBeLessThan(900);
  });

  it('step returns shapes derived from geometry', () => {
    const { shapes, geometry } = make().step(0);
    expect(shapes.left).toEqual(presentEye(geometry.left));
    const { layout, defaults } = defaultSpec.face;
    expect(shapes.left.rect).toEqual({
      x: layout.eyes.left.x - layout.eyeWidth / 2,
      y: 50 - layout.eyeHeight / 2,
      width: layout.eyeWidth,
      height: layout.eyeHeight,
      rx: Number((defaults.roundness * layout.eyeHeight).toFixed(3)),
    });
  });

  it('rejects a status spec that references a missing expression', () => {
    const bad = { ...defaultSpec.status, emptyExpression: 'missing' };
    expect(() => make({ status: bad })).toThrow(SpecError);
  });

  it('validates setSprings input', () => {
    expect(() => make().setSprings({ expression: { stiffness: 'a' } })).toThrow(SpecError);
  });
});

describe('svg presenter', () => {
  it('formats paths with at most 3 decimals and no negative zero', () => {
    const shape = presentEye({
      eye: { left: 0.12345, top: -0.0001, right: 10, bottom: 10, radius: 1 / 3 },
      upperLid: [
        [0, 0],
        [1.00049, 0],
        [1, 1.0006],
        [0, 1],
      ],
      lowerLid: {
        start: [0, 2],
        edgeLeft: [0, 1],
        control: [0.5, 0.5],
        edgeRight: [1, 1],
        end: [1, 2],
      },
    });
    expect(shape.rect.x).toBe(0.123);
    expect(shape.rect.y).toBe(0);
    expect(shape.rect.rx).toBe(0.333);
    expect(shape.upperLidPath).toBe('M 0 0 L 1 0 L 1 1.001 L 0 1 Z');
    expect(shape.lowerLidPath).toBe('M 0 2 L 0 1 Q 0.5 0.5 1 1 L 1 2 Z');
  });
});
