/**
 * Linear interpolation: `a + (b - a) * r` (operation order is part of the contract).
 * @param {number} a
 * @param {number} b
 * @param {number} r
 * @returns {number}
 */
export function lerp(a, b, r) {
  return a + (b - a) * r;
}

/**
 * Converts milliseconds to an integer substep count, rounding half up.
 * Deliberately `floor(x + 0.5)`, not `Math.round` equivalents that differ on other platforms.
 * @param {number} ms
 * @param {number} substepHz
 * @returns {number}
 */
export function steps(ms, substepHz) {
  return Math.floor((ms * substepHz) / 1000 + 0.5);
}

/**
 * Draws a substep count from a `[min, max]` millisecond interval using one random value.
 * @param {readonly [number, number]} interval
 * @param {number} r random value in [0, 1)
 * @param {number} substepHz
 * @returns {number}
 */
export function intervalSteps(interval, r, substepHz) {
  return steps(lerp(interval[0], interval[1], r), substepHz);
}
