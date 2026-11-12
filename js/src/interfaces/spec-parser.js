import { PARAM_KEYS } from '../entities/eye-shape.js';

/** Thrown for any invalid spec or override input. */
export class SpecError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SpecError';
  }
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fail(path, problem) {
  throw new SpecError(`${path}: ${problem}`);
}

function object(v, path) {
  if (!isObject(v)) fail(path, 'expected an object');
  return v;
}

function onlyKeys(obj, allowed, path) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key))
      fail(`${path}.${key}`, `unknown key (allowed: ${allowed.join(', ')})`);
  }
}

function num(v, path, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (!isNum(v)) fail(path, 'expected a finite number');
  if (exclusiveMin ? v <= min : v < min) fail(path, `must be ${exclusiveMin ? '>' : '>='} ${min}`);
  if (v > max) fail(path, `must be <= ${max}`);
  return v;
}

function interval(v, path) {
  if (!Array.isArray(v) || v.length !== 2) fail(path, 'expected [min, max]');
  const lo = num(v[0], `${path}[0]`, { min: 0 });
  const hi = num(v[1], `${path}[1]`, { min: 0 });
  if (lo > hi) fail(path, 'min must be <= max');
  return [lo, hi];
}

function xy(v, path) {
  const o = object(v, path);
  onlyKeys(o, ['x', 'y'], path);
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`) };
}

function springConstants(v, path, partial) {
  const o = object(v, path);
  onlyKeys(o, ['stiffness', 'damping'], path);
  const out = {};
  for (const key of ['stiffness', 'damping']) {
    if (key in o) {
      out[key] = num(
        o[key],
        `${path}.${key}`,
        key === 'stiffness' ? { min: 0, exclusiveMin: true } : { min: 0 },
      );
    } else if (!partial) {
      fail(`${path}.${key}`, 'missing');
    }
  }
  return out;
}

function partialParams(v, path) {
  const o = object(v, path);
  const out = {};
  for (const [key, value] of Object.entries(o)) {
    if (!PARAM_KEYS.includes(key))
      fail(`${path}.${key}`, `unknown parameter (allowed: ${PARAM_KEYS.join(', ')})`);
    out[key] = num(value, `${path}.${key}`);
  }
  return out;
}

/**
 * Validates a partial expression (shared keys plus optional `left`/`right` overrides).
 * @param {unknown} raw
 * @param {string} [path] label used in error messages
 * @returns {Record<string, any>} a validated copy
 */
export function parseExpression(raw, path = 'expression') {
  const o = object(raw, path);
  const shared = Object.fromEntries(
    Object.entries(o).filter(([k]) => k !== 'left' && k !== 'right'),
  );
  const out = partialParams(shared, path);
  for (const side of ['left', 'right']) {
    if (side in o) out[side] = partialParams(o[side], `${path}.${side}`);
  }
  return out;
}

/**
 * Validates and copies `face.json`.
 * @param {unknown} raw
 * @returns {{ layout: any, defaults: Record<string, number>, expressions: Record<string, any> }}
 */
export function parseFaceSpec(raw) {
  const root = object(raw, 'face');
  onlyKeys(root, ['layout', 'defaults', 'expressions'], 'face');

  const l = object(root.layout, 'face.layout');
  onlyKeys(l, ['width', 'height', 'eyeWidth', 'eyeHeight', 'lidOverscan', 'eyes'], 'face.layout');
  const eyes = object(l.eyes, 'face.layout.eyes');
  onlyKeys(eyes, ['left', 'right'], 'face.layout.eyes');
  const layout = {
    width: num(l.width, 'face.layout.width', { min: 0, exclusiveMin: true }),
    height: num(l.height, 'face.layout.height', { min: 0, exclusiveMin: true }),
    eyeWidth: num(l.eyeWidth, 'face.layout.eyeWidth', { min: 0, exclusiveMin: true }),
    eyeHeight: num(l.eyeHeight, 'face.layout.eyeHeight', { min: 0, exclusiveMin: true }),
    lidOverscan: num(l.lidOverscan, 'face.layout.lidOverscan', { min: 0 }),
    eyes: {
      left: xy(eyes.left, 'face.layout.eyes.left'),
      right: xy(eyes.right, 'face.layout.eyes.right'),
    },
  };

  const d = partialParams(root.defaults, 'face.defaults');
  for (const key of PARAM_KEYS) {
    if (!(key in d)) fail(`face.defaults.${key}`, 'missing');
  }
  const defaults = Object.fromEntries(PARAM_KEYS.map((key) => [key, d[key]]));

  const ex = object(root.expressions, 'face.expressions');
  const expressions = {};
  for (const [name, value] of Object.entries(ex)) {
    expressions[name] = parseExpression(value, `face.expressions.${name}`);
  }
  return { layout, defaults, expressions };
}

function blinkStyles(v, path) {
  const o = object(v, path);
  const out = {};
  for (const [name, table] of Object.entries(o)) {
    const tp = `${path}.${name}`;
    if (!Array.isArray(table) || table.length === 0) fail(tp, 'expected a non-empty array');
    out[name] = table.map((kf, i) => {
      const p = `${tp}[${i}]`;
      const k = object(kf, p);
      onlyKeys(k, ['height', 'width', 'ms'], p);
      return {
        height: num(k.height, `${p}.height`, { min: 0 }),
        width: num(k.width, `${p}.width`, { min: 0, exclusiveMin: true }),
        ms: num(k.ms, `${p}.ms`, { min: 0, exclusiveMin: true }),
      };
    });
    const last = out[name].at(-1);
    if (last.height !== 1 || last.width !== 1)
      fail(`${tp}[${table.length - 1}]`, 'last keyframe must have height 1 and width 1');
  }
  if (Object.keys(out).length === 0) fail(path, 'expected at least one style');
  return out;
}

/**
 * Validates and copies `motion.json`.
 * @param {unknown} raw
 * @returns {any}
 */
export function parseMotionSpec(raw) {
  const root = object(raw, 'motion');
  onlyKeys(
    root,
    ['substepHz', 'maxStepMs', 'settleEpsilon', 'springs', 'blink', 'saccade', 'glance'],
    'motion',
  );
  const positive = { min: 0, exclusiveMin: true };

  const sp = object(root.springs, 'motion.springs');
  onlyKeys(sp, ['expression', 'gaze'], 'motion.springs');

  const b = object(root.blink, 'motion.blink');
  onlyKeys(
    b,
    [
      'intervalMs',
      'doubleBlinkChance',
      'doubleBlinkGapMs',
      'anchor',
      'style',
      'levelFrom',
      'levelTo',
      'styles',
    ],
    'motion.blink',
  );
  const styles = blinkStyles(b.styles, 'motion.blink.styles');
  if (typeof b.style !== 'string' || !Object.hasOwn(styles, b.style)) {
    fail('motion.blink.style', `must name one of: ${Object.keys(styles).join(', ')}`);
  }
  const levelFrom = num(b.levelFrom, 'motion.blink.levelFrom', { min: 0, max: 1 });
  const levelTo = num(b.levelTo, 'motion.blink.levelTo', { min: 0, max: 1 });
  if (!(levelTo < levelFrom)) fail('motion.blink.levelTo', 'must be < levelFrom');
  const sc = object(root.saccade, 'motion.saccade');
  onlyKeys(sc, ['intervalMs', 'amplitude'], 'motion.saccade');
  const g = object(root.glance, 'motion.glance');
  onlyKeys(g, ['holdMs', 'offset'], 'motion.glance');

  return {
    substepHz: num(root.substepHz, 'motion.substepHz', positive),
    maxStepMs: num(root.maxStepMs, 'motion.maxStepMs', positive),
    settleEpsilon: num(root.settleEpsilon, 'motion.settleEpsilon', positive),
    springs: {
      expression: springConstants(sp.expression, 'motion.springs.expression', false),
      gaze: springConstants(sp.gaze, 'motion.springs.gaze', false),
    },
    blink: {
      intervalMs: interval(b.intervalMs, 'motion.blink.intervalMs'),
      anchor: num(b.anchor, 'motion.blink.anchor', { min: -1, max: 1 }),
      style: b.style,
      levelFrom,
      levelTo,
      styles,
      doubleBlinkChance: num(b.doubleBlinkChance, 'motion.blink.doubleBlinkChance', {
        min: 0,
        max: 1,
      }),
      doubleBlinkGapMs: num(b.doubleBlinkGapMs, 'motion.blink.doubleBlinkGapMs', { min: 0 }),
    },
    saccade: {
      intervalMs: interval(sc.intervalMs, 'motion.saccade.intervalMs'),
      amplitude: xy(sc.amplitude, 'motion.saccade.amplitude'),
    },
    glance: {
      holdMs: num(g.holdMs, 'motion.glance.holdMs', { min: 0 }),
      offset: xy(g.offset, 'motion.glance.offset'),
    },
  };
}

/**
 * Validates and copies `status.json`.
 * @param {unknown} raw
 * @returns {{ severity: string[], expressionFor: Record<string, string>, emptyExpression: string }}
 */
export function parseStatusSpec(raw) {
  const root = object(raw, 'status');
  onlyKeys(root, ['severity', 'expressionFor', 'emptyExpression'], 'status');
  if (!Array.isArray(root.severity) || root.severity.length === 0) {
    fail('status.severity', 'expected a non-empty array');
  }
  const severity = root.severity.map((s, i) => {
    if (typeof s !== 'string' || s === '')
      fail(`status.severity[${i}]`, 'expected a non-empty string');
    return s;
  });
  if (new Set(severity).size !== severity.length) fail('status.severity', 'duplicate entries');

  const map = object(root.expressionFor, 'status.expressionFor');
  const expressionFor = {};
  for (const name of severity) {
    if (typeof map[name] !== 'string')
      fail(`status.expressionFor.${name}`, 'missing or not a string');
    expressionFor[name] = map[name];
  }
  onlyKeys(map, severity, 'status.expressionFor');
  if (typeof root.emptyExpression !== 'string') fail('status.emptyExpression', 'expected a string');
  return { severity, expressionFor, emptyExpression: root.emptyExpression };
}

/**
 * Validates a partial spring override, as accepted by `setSprings`.
 * @param {unknown} raw `{ expression?: {stiffness?, damping?}, gaze?: {...} }`
 * @returns {{ expression?: Record<string, number>, gaze?: Record<string, number> }}
 */
export function parseSpringOverrides(raw) {
  const o = object(raw, 'springs');
  onlyKeys(o, ['expression', 'gaze'], 'springs');
  const out = {};
  if ('expression' in o) out.expression = springConstants(o.expression, 'springs.expression', true);
  if ('gaze' in o) out.gaze = springConstants(o.gaze, 'springs.gaze', true);
  return out;
}

/**
 * Validates the optional argument of `blink(options)`.
 * @param {unknown} [raw] `{ anchor?: number }` with `anchor` in [-1, 1]; `undefined` means defaults
 * @returns {{ anchor?: number }}
 */
export function parseBlinkOptions(raw) {
  if (raw === undefined) return {};
  const o = object(raw, 'blink');
  onlyKeys(o, ['anchor'], 'blink');
  return 'anchor' in o ? { anchor: num(o.anchor, 'blink.anchor', { min: -1, max: 1 }) } : {};
}
