/** Eye parameter names, in canonical order. */
export const PARAM_KEYS = Object.freeze([
  'offsetX',
  'offsetY',
  'scaleX',
  'scaleY',
  'roundness',
  'upperLid',
  'upperLidTilt',
  'lowerLid',
  'lowerLidBend',
]);

/** Sides an expression may override individually. */
export const SIDES = Object.freeze(['left', 'right']);

const clampRange = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Applies the geometry-time clamps; springs may overshoot, geometry may not.
 * @param {Record<string, number>} p resolved eye parameters
 * @returns {Record<string, number>} a new, clamped parameter object
 */
export function clampParams(p) {
  return {
    offsetX: p.offsetX,
    offsetY: p.offsetY,
    scaleX: Math.max(0, p.scaleX),
    scaleY: Math.max(0, p.scaleY),
    roundness: Math.max(0, p.roundness),
    upperLid: clampRange(p.upperLid, 0, 1),
    upperLidTilt: clampRange(p.upperLidTilt, -45, 45),
    lowerLid: clampRange(p.lowerLid, 0, 1),
    lowerLidBend: clampRange(p.lowerLidBend, -1, 1),
  };
}

/**
 * Resolves one side of an expression: `defaults <- shared keys <- expression[side]`.
 * @param {Record<string, number>} defaults complete default parameters
 * @param {Record<string, any>} expression partial expression, optionally with `left`/`right`
 * @param {'left' | 'right'} side
 * @returns {Record<string, number>} complete parameters in canonical key order
 */
export function resolveParams(defaults, expression, side) {
  const out = {};
  for (const key of PARAM_KEYS) {
    out[key] = expression[side]?.[key] ?? expression[key] ?? defaults[key];
  }
  return out;
}
