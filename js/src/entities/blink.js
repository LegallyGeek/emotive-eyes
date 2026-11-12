/**
 * @typedef {{ closeMs: number, holdMs: number, openMs: number, minScale: number,
 *   doubleBlinkGapMs: number }} BlinkTiming
 */

/**
 * Eyelid-closure factor of a single blink at time `tMs`.
 * @param {number} tMs milliseconds since blink start
 * @param {BlinkTiming} cfg
 * @returns {number} height multiplier in [minScale, 1]
 */
export function blinkCurve(tMs, cfg) {
  const { closeMs, holdMs, openMs, minScale } = cfg;
  if (tMs < 0) return 1;
  if (tMs < closeMs) {
    const u = tMs / closeMs;
    return 1 - (1 - minScale) * u * u;
  }
  if (tMs < closeMs + holdMs) return minScale;
  if (tMs < closeMs + holdMs + openMs) {
    const u = (tMs - closeMs - holdMs) / openMs;
    return minScale + (1 - minScale) * (1 - (1 - u) * (1 - u));
  }
  return 1;
}

/**
 * Duration of one blink (or a double blink), in milliseconds.
 * @param {BlinkTiming} cfg
 * @param {boolean} isDouble
 * @returns {number}
 */
export function blinkTotalMs(cfg, isDouble) {
  const d = cfg.closeMs + cfg.holdMs + cfg.openMs;
  return isDouble ? 2 * d + cfg.doubleBlinkGapMs : d;
}

/**
 * Height multiplier of a blink (single or double) at time `tMs`.
 * @param {number} tMs milliseconds since blink start
 * @param {BlinkTiming} cfg
 * @param {boolean} isDouble
 * @returns {number}
 */
export function blinkFactor(tMs, cfg, isDouble) {
  if (!isDouble) return blinkCurve(tMs, cfg);
  const d = cfg.closeMs + cfg.holdMs + cfg.openMs;
  const gap = cfg.doubleBlinkGapMs;
  if (tMs < d) return blinkCurve(tMs, cfg);
  if (tMs < d + gap) return 1;
  if (tMs < 2 * d + gap) return blinkCurve(tMs - d - gap, cfg);
  return 1;
}
