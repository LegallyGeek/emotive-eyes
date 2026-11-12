/**
 * @typedef {{ value: number, velocity: number, target: number }} Spring
 */

/**
 * Creates a spring at rest on `value`.
 * @param {number} value
 * @returns {Spring}
 */
export function createSpring(value) {
  return { value, velocity: 0, target: value };
}

/**
 * Damping that makes a unit-mass spring critically damped.
 * @param {number} stiffness
 * @returns {number}
 */
export function criticalDamping(stiffness) {
  return 2 * Math.sqrt(stiffness);
}

/**
 * Advances a spring one semi-implicit Euler substep in place (operation order is normative).
 * @param {Spring} spring
 * @param {number} stiffness s^-2
 * @param {number} damping s^-1
 * @param {number} h substep length in seconds
 * @returns {void}
 */
export function stepSpring(spring, stiffness, damping, h) {
  const a = stiffness * (spring.target - spring.value) - damping * spring.velocity;
  spring.velocity = spring.velocity + a * h;
  spring.value = spring.value + spring.velocity * h;
}
