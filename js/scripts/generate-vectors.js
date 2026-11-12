import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blinkFactor } from '../src/entities/blink.js';
import { resolveParams } from '../src/entities/eye-shape.js';
import { computeEyeGeometry } from '../src/entities/geometry.js';
import { createSpring, criticalDamping, stepSpring } from '../src/entities/spring.js';
import { bundledSpec } from '../src/drivers/bundled-spec.js';
import { createFaceAnimator } from '../src/features/animate-face/face-animator.js';
import { createStatusTracker } from '../src/features/report-status/status-tracker.js';

const { face, motion, status } = bundledSpec;
const resolveExpr = (expr) => ({
  left: resolveParams(face.defaults, expr, 'left'),
  right: resolveParams(face.defaults, expr, 'right'),
});
const preset = (name) => resolveExpr(face.expressions[name]);
const withParams = (overrides) => ({ ...face.defaults, ...overrides });

function geometryVectors() {
  const cases = Object.entries(face.expressions).map(([name, expr]) => ({
    name: `preset-${name}`,
    ...resolveExpr(expr),
  }));
  const sym = (name, overrides) => {
    const p = withParams(overrides);
    cases.push({ name, left: p, right: { ...p } });
  };
  sym('lids-over-clamped', { upperLid: 1.7, lowerLid: 1.4, upperLidTilt: 80, lowerLidBend: 3 });
  sym('lids-under-clamped', { upperLid: -0.5, lowerLid: -2, upperLidTilt: -80, lowerLidBend: -4 });
  sym('zero-scale', { scaleX: 0, scaleY: 0 });
  sym('negative-scale', { scaleX: -1, scaleY: -0.5, roundness: -1 });
  sym('tilt-plus-45', { upperLid: 0.4, upperLidTilt: 45 });
  sym('tilt-minus-45', { upperLid: 0.4, upperLidTilt: -45 });
  sym('negative-bend', { lowerLid: 0.3, lowerLidBend: -0.6 });
  sym('huge-roundness', { roundness: 25 });
  sym('bow-tie-prone', { upperLid: 0, upperLidTilt: 30 });
  sym('offset-and-scale', { offsetX: 0.2, offsetY: -0.15, scaleX: 1.3, scaleY: 0.6 });
  sym('lids-full-overlap', { upperLid: 1, lowerLid: 1, lowerLidBend: 1 });
  cases.push({
    name: 'asymmetric-tilt',
    left: withParams({ upperLid: 0.3, upperLidTilt: 20 }),
    right: withParams({ upperLid: 0.3, upperLidTilt: -20, lowerLid: 0.2, lowerLidBend: 0.4 }),
  });
  return {
    layout: face.layout,
    cases: cases.map((c) => ({
      name: c.name,
      left: c.left,
      right: c.right,
      expected: {
        left: computeEyeGeometry(c.left, face.layout, 'left'),
        right: computeEyeGeometry(c.right, face.layout, 'right'),
      },
    })),
  };
}

function springVectors() {
  const defs = [
    ['underdamped', 220, 16, 240, { value: 0, velocity: 0 }, 1, 120],
    ['expression-defaults-from-offset', 220, 16, 240, { value: 0.3, velocity: -2 }, 0, 120],
    ['critically-damped', 220, criticalDamping(220), 240, { value: 0, velocity: 0 }, 1, 120],
    ['overdamped', 220, 80, 240, { value: 0, velocity: 0 }, 1, 120],
    ['gaze-defaults', 700, 45, 240, { value: 0, velocity: 0 }, 0.28, 120],
    ['undamped-60hz', 100, 0, 60, { value: 1, velocity: 0 }, 0, 60],
    ['high-stiffness-30hz', 3000, 10, 30, { value: 0, velocity: 5 }, 2, 30],
  ];
  return {
    cases: defs.map(([name, stiffness, damping, substepHz, start, target, count]) => {
      const spring = { ...createSpring(start.value), velocity: start.velocity, target };
      const h = 1 / substepHz;
      const expected = [];
      for (let i = 0; i < count; i += 1) {
        stepSpring(spring, stiffness, damping, h);
        expected.push({ value: spring.value, velocity: spring.velocity });
      }
      return { name, stiffness, damping, substepHz, start, target, steps: count, expected };
    }),
  };
}

function blinkVectors() {
  const base = motion.blink;
  const variants = [
    ['default', base],
    ['no-hold', { ...base, holdMs: 0 }],
    ['slow', { ...base, closeMs: 100, holdMs: 50, openMs: 200, minScale: 0, doubleBlinkGapMs: 40 }],
  ];
  const cases = [];
  for (const [label, cfg] of variants) {
    const d = cfg.closeMs + cfg.holdMs + cfg.openMs;
    const gap = cfg.doubleBlinkGapMs;
    const times = new Set([
      -10,
      -0.001,
      0,
      1,
      cfg.closeMs / 2,
      cfg.closeMs,
      cfg.closeMs + cfg.holdMs / 2,
      cfg.closeMs + cfg.holdMs,
      cfg.closeMs + cfg.holdMs + cfg.openMs / 2,
      d - 0.001,
      d,
      d + gap / 2,
      d + gap - 0.001,
      d + gap,
      d + gap + cfg.closeMs / 2,
      d + gap + cfg.closeMs,
      2 * d + gap - 0.001,
      2 * d + gap,
      2 * d + gap + 50,
    ]);
    const sorted = [...times].sort((a, b) => a - b);
    for (const isDouble of [false, true]) {
      cases.push({
        name: `${label}-${isDouble ? 'double' : 'single'}`,
        blink: cfg,
        isDouble,
        samples: sorted.map((tMs) => ({ tMs, factor: blinkFactor(tMs, cfg, isDouble) })),
      });
    }
  }
  return { cases };
}

const CYCLE_DT = [16.6, 33.4, 7, 250];
const repeat = (count, make) => Array.from({ length: count }, (_, i) => make(i));
const stepOps = (dts) => dts.map((dt) => ({ op: 'step', dt }));
const cycleDts = (n) => repeat(n, (i) => CYCLE_DT[i % CYCLE_DT.length]);

/** Extends a scripted list with deterministic filler values up to `total` entries. */
const pad = (values, total) => [
  ...values,
  ...repeat(Math.max(0, total - values.length), (i) => ((i + 1) * 0.37) % 1),
];

/** Random source that returns `values` in order and throws when exhausted. */
function scriptedRandom(values) {
  let used = 0;
  const random = () => {
    if (used >= values.length) throw new Error(`random source exhausted after ${used} draws`);
    used += 1;
    return values[used - 1];
  };
  random.consumed = () => used;
  return random;
}

function applyOp(animator, op) {
  switch (op.op) {
    case 'step':
      return animator.step(op.dt);
    case 'setTarget':
      animator.setTarget({ left: op.left, right: op.right });
      break;
    case 'blink':
      animator.blink();
      break;
    case 'glance':
      animator.glance({ x: op.x, y: op.y });
      break;
    case 'setBlinking':
      animator.setBlinking(op.value);
      break;
    case 'setIdleGaze':
      animator.setIdleGaze(op.value);
      break;
    case 'setReducedMotion':
      animator.setReducedMotion(op.value);
      break;
    case 'setSprings':
      animator.setSprings(op.springs);
      break;
    default:
      throw new Error(`unknown op ${op.op}`);
  }
  return animator.frame();
}

function animatorCase(
  name,
  { motion: m = motion, randoms, initial = preset('neutral'), flags, ops },
) {
  const fullFlags = { blinking: true, idleGaze: true, reducedMotion: false, ...flags };
  const random = scriptedRandom(randoms);
  const animator = createFaceAnimator({ motion: m, random, initial, ...fullFlags });
  const expected = ops.map((op, afterOp) => {
    const frame = applyOp(animator, op);
    return {
      afterOp,
      left: frame.left,
      right: frame.right,
      settled: animator.isSettled(),
      msUntilNextEvent: animator.msUntilNextEvent(),
      randomsConsumed: random.consumed(),
    };
  });
  return { name, motion: m, randoms, initial, flags: fullFlags, ops, expected };
}

const target = (name) => ({ op: 'setTarget', ...preset(name) });
const quiet = { blinking: false, idleGaze: false };

function animatorVectors() {
  const fast = (patch) => ({ ...motion, ...patch });
  const cases = [
    animatorCase('uneven-dt-idle', {
      randoms: [0, 0, 0.75, 0.25, 0.5, 0.5, 0.3],
      ops: [...stepOps(cycleDts(36)), { op: 'step', dt: -5 }],
    }),
    animatorCase('timer-on-substep-boundary', {
      motion: fast({
        blink: { ...motion.blink, intervalMs: [100, 100] },
        saccade: { ...motion.saccade, intervalMs: [50, 50] },
      }),
      randoms: pad([0.5, 0.5, 0.9, 0.1, 0.5, 0.5, 0.5, 0.2, 0.7, 0.3, 0.4], 60),
      ops: [
        ...stepOps([100, 100 / 1000, 0.0001, 4.166666666666667, 4.166666666666667]),
        ...stepOps(repeat(60, () => 1000 / 240)),
      ],
    }),
    animatorCase('rounding-half-up-100hz', {
      motion: fast({
        substepHz: 100,
        blink: { ...motion.blink, intervalMs: [25, 25] },
        saccade: { ...motion.saccade, intervalMs: [25, 25] },
      }),
      randoms: pad([0, 0, 0.5, 0.5], 80),
      ops: stepOps(repeat(12, () => 10)),
    }),
    animatorCase('interrupted-transition', {
      flags: quiet,
      randoms: [0.5, 0.5],
      ops: [
        target('angry'),
        ...stepOps(repeat(8, () => 16.6)),
        target('happy'),
        ...stepOps(repeat(8, () => 16.6)),
        target('suspicious'),
        ...stepOps([33.4, 250, 250, 1000]),
      ],
    }),
    animatorCase('manual-blink-during-blink', {
      flags: { idleGaze: false },
      randoms: [0.5, 0.5, 0.9, 0.0, 0.2, 0.4, 0.6],
      ops: [
        { op: 'blink' },
        ...stepOps([16.6, 33.4]),
        { op: 'blink' },
        ...stepOps([7, 70, 50, 100]),
        { op: 'blink' },
        ...stepOps([250]),
      ],
    }),
    animatorCase('double-blink', {
      flags: { idleGaze: false },
      randoms: [0.5, 0.5, 0.1, 0.25],
      ops: [{ op: 'blink' }, ...stepOps(repeat(40, () => 16.6)), ...stepOps([250, 250])],
    }),
    animatorCase('glance-during-saccades', {
      flags: { blinking: false },
      motion: fast({ saccade: { ...motion.saccade, intervalMs: [100, 100] } }),
      randoms: pad([0.5, 0.5, 0.9, 0.2, 0.5, 0.1, 0.8, 0.5, 0.3, 0.6, 0.5], 60),
      ops: [
        ...stepOps(repeat(8, () => 16.6)),
        { op: 'glance', x: 1, y: -1 },
        ...stepOps(repeat(20, () => 50)),
        ...stepOps(repeat(10, () => 100)),
      ],
    }),
    animatorCase('glance-restart', {
      flags: { blinking: false, idleGaze: false },
      randoms: [0.5, 0.5],
      ops: [
        { op: 'glance', x: -1, y: 0.5 },
        ...stepOps(repeat(18, () => 16.6)),
        { op: 'glance', x: 1, y: -0.5 },
        ...stepOps(repeat(40, () => 16.6)),
        ...stepOps([250, 250, 250, 250]),
      ],
    }),
    animatorCase('toggle-every-flag', {
      randoms: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.35, 0.45, 0.55, 0.65],
      ops: [
        ...stepOps([100]),
        { op: 'setBlinking', value: true },
        { op: 'setBlinking', value: false },
        { op: 'setBlinking', value: false },
        ...stepOps([2500]),
        { op: 'setBlinking', value: true },
        { op: 'setIdleGaze', value: false },
        { op: 'setIdleGaze', value: false },
        ...stepOps([100]),
        { op: 'setIdleGaze', value: true },
        { op: 'setReducedMotion', value: true },
        { op: 'setReducedMotion', value: true },
        { op: 'setReducedMotion', value: false },
        { op: 'setBlinking', value: false },
        ...stepOps([50]),
      ],
    }),
    animatorCase('reduced-motion', {
      randoms: [0.1, 0.1, 0.5, 0.5, 0.2, 0.3, 0.9, 0.9, 0.9],
      ops: [
        { op: 'glance', x: 1, y: 1 },
        ...stepOps([100, 100]),
        { op: 'setReducedMotion', value: true },
        { op: 'glance', x: -1, y: -1 },
        target('surprised'),
        ...stepOps(repeat(20, () => 16.6)),
        { op: 'blink' },
        ...stepOps(repeat(20, () => 16.6)),
        { op: 'setReducedMotion', value: false },
        ...stepOps([16.6, 33.4]),
      ],
    }),
    animatorCase('set-springs', {
      flags: quiet,
      randoms: [0.5, 0.5],
      ops: [
        target('sad'),
        ...stepOps(repeat(6, () => 16.6)),
        { op: 'setSprings', springs: { expression: { stiffness: 400, damping: 30 } } },
        ...stepOps(repeat(6, () => 16.6)),
        { op: 'glance', x: 1, y: 0 },
        { op: 'setSprings', springs: { gaze: { stiffness: 300, damping: 10 } } },
        ...stepOps(repeat(6, () => 16.6)),
        { op: 'setReducedMotion', value: true },
        { op: 'setSprings', springs: { expression: { stiffness: 100 } } },
        target('neutral'),
        ...stepOps(repeat(6, () => 16.6)),
      ],
    }),
    animatorCase('settle-and-resume-large-dt', {
      randoms: pad([0.0, 0.0, 0.4, 0.6, 0.5, 0.5], 60),
      ops: [
        target('happy'),
        ...stepOps([60000]),
        { op: 'step', dt: 0 },
        ...stepOps([1000, 1000]),
        target('sleepy'),
        ...stepOps([16.6]),
        ...stepOps([10000, 5000]),
      ],
    }),
    animatorCase('all-flags-off', {
      flags: { blinking: false, idleGaze: false },
      randoms: [0.5, 0.5],
      ops: [...stepOps([16.6]), target('worried'), ...stepOps([5000]), ...stepOps([5000])],
    }),
    animatorCase('suspicious-initial-asymmetric', {
      initial: preset('suspicious'),
      flags: quiet,
      randoms: [0.5, 0.5],
      ops: [...stepOps([16.6]), target('neutral'), ...stepOps(repeat(12, () => 33.4))],
    }),
  ];
  return { cases };
}

function statusVectors() {
  const dir = (x, y) => ({ x, y });
  const seqs = [
    ['baseline-never-glances', [[{ id: 'cam', status: 'error', direction: dir(-1, 0) }]]],
    [
      'severity-picks-most-severe',
      [
        [
          { id: 'a', status: 'ok' },
          { id: 'b', status: 'warning' },
          { id: 'c', status: 'busy' },
        ],
        [
          { id: 'a', status: 'ok' },
          { id: 'b', status: 'offline' },
          { id: 'c', status: 'busy' },
        ],
      ],
    ],
    [
      'glance-picks-most-severe-change-first-on-tie',
      [
        [
          { id: 'cam', status: 'ok', direction: dir(-1, 0) },
          { id: 'mic', status: 'ok', direction: dir(0, 1) },
          { id: 'net', status: 'ok', direction: dir(1, 0) },
        ],
        [
          { id: 'cam', status: 'warning', direction: dir(-1, 0) },
          { id: 'mic', status: 'warning', direction: dir(0, 1) },
          { id: 'net', status: 'busy', direction: dir(1, 0) },
        ],
        [
          { id: 'cam', status: 'warning', direction: dir(-1, 0) },
          { id: 'mic', status: 'error', direction: dir(0, 1) },
          { id: 'net', status: 'error', direction: dir(1, 0) },
        ],
      ],
    ],
    [
      'unchanged-and-no-direction-and-removed',
      [
        [
          { id: 'a', status: 'ok', direction: dir(1, 1) },
          { id: 'b', status: 'error', direction: dir(-1, -1) },
        ],
        [
          { id: 'a', status: 'ok', direction: dir(1, 1) },
          { id: 'b', status: 'error', direction: dir(-1, -1) },
        ],
        [{ id: 'a', status: 'ok', direction: dir(1, 1) }],
        [{ id: 'a', status: 'busy' }],
        [],
        [{ id: 'a', status: 'busy', direction: dir(0.5, -0.5) }],
      ],
    ],
    [
      'recovery-is-a-change',
      [
        [{ id: 'a', status: 'error', direction: dir(1, 0) }],
        [{ id: 'a', status: 'ok', direction: dir(1, 0) }],
      ],
    ],
    ['empty-baseline', [[], [{ id: 'a', status: 'ok', direction: dir(0, 1) }]]],
  ];
  return {
    status,
    sequences: seqs.map(([name, updates]) => {
      const tracker = createStatusTracker(status);
      return { name, updates, expected: updates.map((inputs) => tracker.update(inputs)) };
    }),
  };
}

/**
 * Builds every vector file in memory.
 * @returns {Record<string, string>} file name to serialised content (Infinity becomes null)
 */
export function generateVectors() {
  const files = {
    'geometry.json': geometryVectors(),
    'spring.json': springVectors(),
    'blink.json': blinkVectors(),
    'animator.json': animatorVectors(),
    'status.json': statusVectors(),
  };
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, `${JSON.stringify(data, null, 2)}\n`]),
  );
}

/** Directory holding the checked-in vectors. */
export const VECTORS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../spec/vectors');

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  mkdirSync(VECTORS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(generateVectors())) {
    writeFileSync(resolve(VECTORS_DIR, name), content);
    console.log(`wrote ${name} (${content.length} bytes)`);
  }
}
