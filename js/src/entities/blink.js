/**
 * @typedef {{ height: number, width: number, ms: number }} BlinkKeyframe
 * @typedef {{ height: number, width: number }} BlinkSample
 */

/**
 * Duration of one blink: the sum of its keyframe durations.
 * @param {readonly BlinkKeyframe[]} keyframes
 * @returns {number} milliseconds
 */
export function blinkDuration(keyframes) {
  let d = 0;
  for (const k of keyframes) d += k.ms;
  return d;
}

/**
 * Duration of a blink (single, or double with `gapMs` between the halves), in milliseconds.
 * @param {readonly BlinkKeyframe[]} keyframes
 * @param {number} gapMs
 * @param {boolean} isDouble
 * @returns {number}
 */
export function blinkTotalMs(keyframes, gapMs, isDouble) {
  const d = blinkDuration(keyframes);
  return isDouble ? 2 * d + gapMs : d;
}

function singleSample(tMs, keyframes) {
  if (tMs < 0) return { height: 1, width: 1 };
  let prevT = 0;
  let prevH = 1;
  let prevW = 1;
  for (const k of keyframes) {
    const t = prevT + k.ms;
    if (tMs < t) {
      const u = (tMs - prevT) / k.ms;
      return {
        height: prevH + (k.height - prevH) * u,
        width: prevW + (k.width - prevW) * u,
      };
    }
    prevT = t;
    prevH = k.height;
    prevW = k.width;
  }
  return { height: 1, width: 1 };
}

/**
 * Height and width multipliers of a blink at time `tMs`, interpolating linearly between
 * keyframes (the implicit start is height 1, width 1).
 * @param {number} tMs milliseconds since blink start
 * @param {readonly BlinkKeyframe[]} keyframes
 * @param {number} gapMs gap between the halves of a double blink
 * @param {boolean} isDouble
 * @returns {BlinkSample} (1, 1) outside the blink
 */
export function blinkSample(tMs, keyframes, gapMs, isDouble) {
  if (!isDouble) return singleSample(tMs, keyframes);
  const d = blinkDuration(keyframes);
  if (tMs < d) return singleSample(tMs, keyframes);
  if (tMs < d + gapMs) return { height: 1, width: 1 };
  if (tMs < 2 * d + gapMs) return singleSample(tMs - d - gapMs, keyframes);
  return { height: 1, width: 1 };
}

/**
 * How far lids fade and eyes level: 0 while the eye is taller than `levelFrom`, 1 once it is
 * at or below `levelTo`.
 * @param {number} height blink height multiplier
 * @param {number} levelFrom
 * @param {number} levelTo
 * @returns {number} in [0, 1]
 */
export function blinkLevel(height, levelFrom, levelTo) {
  return Math.min(1, Math.max(0, (levelFrom - height) / (levelFrom - levelTo)));
}
