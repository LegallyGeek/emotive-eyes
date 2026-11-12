import { PARAM_KEYS } from 'emotive-eyes';

/** Slider `[min, max, step]` for every eye parameter. */
export const PARAM_RANGES = Object.freeze({
  offsetX: [-0.5, 0.5, 0.01],
  offsetY: [-0.5, 0.5, 0.01],
  scaleX: [0, 2, 0.01],
  scaleY: [0, 2, 0.01],
  roundness: [0, 1.5, 0.01],
  upperLid: [0, 1, 0.01],
  upperLidTilt: [-45, 45, 1],
  lowerLid: [0, 1, 0.01],
  lowerLidBend: [-1, 1, 0.01],
});

const round = (v) => Number(v.toFixed(3));

/**
 * Edit state for the Tune tab: complete shared values plus sparse per-eye overrides.
 * @typedef {{ shared: Record<string, number>, left: Record<string, number>,
 *   right: Record<string, number> }} TuneState
 */

/**
 * Seeds tune state from a (possibly partial) preset expression.
 * @param {Record<string, number>} defaults
 * @param {Record<string, any>} expression
 * @returns {TuneState}
 */
export function tuneFromExpression(defaults, expression) {
  const shared = { ...defaults };
  for (const key of PARAM_KEYS) if (key in expression) shared[key] = expression[key];
  return { shared, left: { ...expression.left }, right: { ...expression.right } };
}

/**
 * Builds the expression object the eyes component consumes.
 * @param {TuneState} tune
 * @returns {Record<string, any>}
 */
export function expressionFromTune(tune) {
  const out = { ...tune.shared };
  if (Object.keys(tune.left).length > 0) out.left = { ...tune.left };
  if (Object.keys(tune.right).length > 0) out.right = { ...tune.right };
  return out;
}

/**
 * Minimal expression JSON: only keys that differ from the defaults (shared) or from the shared
 * value (per eye), ready to paste into `face.json`.
 * @param {TuneState} tune
 * @param {Record<string, number>} defaults
 * @returns {Record<string, any>}
 */
export function partialExpression(tune, defaults) {
  const out = {};
  for (const key of PARAM_KEYS) {
    if (tune.shared[key] !== defaults[key]) out[key] = round(tune.shared[key]);
  }
  for (const side of ['left', 'right']) {
    const diff = {};
    for (const key of PARAM_KEYS) {
      const value = tune[side][key];
      if (value !== undefined && value !== tune.shared[key]) diff[key] = round(value);
    }
    if (Object.keys(diff).length > 0) out[side] = diff;
  }
  return out;
}

/**
 * Applies a slider edit. Editing "both" clears overrides so the eyes match again.
 * @param {TuneState} tune mutated in place
 * @param {'both' | 'left' | 'right'} target
 * @param {string} key
 * @param {number} value
 */
export function applyEdit(tune, target, key, value) {
  const v = round(value);
  if (target === 'both') {
    tune.shared[key] = v;
    delete tune.left[key];
    delete tune.right[key];
  } else {
    tune[target][key] = v;
  }
}
